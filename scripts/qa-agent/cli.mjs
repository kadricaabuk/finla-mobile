#!/usr/bin/env node
/**
 * CLI for the local QA runner. JSON on stdout so a shell orchestrator (or an
 * agent) can consume it without parsing prose.
 *
 * Usage:
 *   node scripts/qa-agent/cli.mjs catalog
 *   node scripts/qa-agent/cli.mjs suite [--cadence smoke-core|rotate|full]
 *   node scripts/qa-agent/cli.mjs whoami
 *   node scripts/qa-agent/cli.mjs list
 *   node scripts/qa-agent/cli.mjs seed
 *   node scripts/qa-agent/cli.mjs report --flow <path> --result Pass|Fail|Flaky [flags]
 *   node scripts/qa-agent/cli.mjs telegram-body --file <results.json>
 */

import { readFile } from "node:fs/promises";

import { createLinearClient } from "../linear-automation/linear-client.mjs";
import {
  buildIssueDescription,
  findCase,
  matchIssueToCase,
  QA_PROJECT,
  QA_TEAM,
  TEST_CASES,
} from "./catalog.mjs";
import {
  assertResult,
  formatRunComment,
  formatTelegramBody,
  labelsByNameFromNodes,
  nextLabelIds,
  requireTestTypeLabel,
} from "./linear-sync.mjs";
import {
  QA_CONTEXT_QUERY,
  QA_CREATE_COMMENT_MUTATION,
  QA_CREATE_ISSUE_MUTATION,
  QA_ISSUES_QUERY,
  QA_UPDATE_ISSUE_MUTATION,
} from "./queries.mjs";
import { CADENCES, selectSuite } from "./select-suite.mjs";

const MAX_PAGES = 20;

function parseFlags(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const name = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[name] = true;
    } else {
      flags[name] = next;
      i += 1;
    }
  }
  return { flags, positional };
}

function summarizeCase(entry) {
  return {
    key: entry.key,
    title: entry.title,
    testType: entry.testType,
    suite: entry.suite,
    flow: entry.flow,
  };
}

async function fetchAllQaIssues(request) {
  const nodes = [];
  let after = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data = await request(QA_ISSUES_QUERY, { projectName: QA_PROJECT, after });
    const connection = data?.issues;
    if (!connection) break;
    nodes.push(...(connection.nodes ?? []));
    if (!connection.pageInfo?.hasNextPage) break;
    after = connection.pageInfo.endCursor;
  }
  return nodes;
}

async function loadContext(request) {
  const data = await request(QA_CONTEXT_QUERY, {
    projectName: QA_PROJECT,
    teamName: QA_TEAM,
  });
  const team = data?.teams?.nodes?.[0] ?? null;
  const project = data?.projects?.nodes?.[0] ?? null;
  if (!team?.id) {
    throw new Error(`Linear team "${QA_TEAM}" was not found with this API key.`);
  }
  if (!project?.id) {
    throw new Error(`Linear project "${QA_PROJECT}" was not found with this API key.`);
  }
  const states = team.states?.nodes ?? [];
  const todo = states.find((state) => state.name === "Todo") ?? null;
  if (!todo?.id) {
    throw new Error(`Linear team "${QA_TEAM}" has no "Todo" state.`);
  }
  return {
    viewer: data.viewer,
    team,
    project,
    todo,
    labelsByName: labelsByNameFromNodes(data.issueLabels?.nodes),
    labelNodes: data.issueLabels?.nodes ?? [],
  };
}

function commandCatalog() {
  return { project: QA_PROJECT, team: QA_TEAM, cases: TEST_CASES.map(summarizeCase) };
}

function commandSuite(flags) {
  const cadence = typeof flags.cadence === "string" ? flags.cadence : "smoke-core";
  if (!CADENCES.includes(cadence)) {
    throw new Error(`Unknown --cadence "${cadence}". Expected one of: ${CADENCES.join(", ")}.`);
  }
  const selected = selectSuite(TEST_CASES, { cadence });
  return { cadence, count: selected.length, cases: selected.map(summarizeCase) };
}

async function commandWhoami(request) {
  const ctx = await loadContext(request);
  return {
    viewer: ctx.viewer,
    team: { id: ctx.team.id, name: ctx.team.name },
    project: { id: ctx.project.id, name: ctx.project.name },
    todoState: { id: ctx.todo.id, name: ctx.todo.name },
    labels: ctx.labelNodes.map((label) => ({
      id: label.id,
      name: label.name,
      parent: label.parent?.name ?? null,
    })),
  };
}

async function commandList(request) {
  const issues = await fetchAllQaIssues(request);
  return {
    project: QA_PROJECT,
    count: issues.length,
    issues: issues.map((issue) => {
      const matched = matchIssueToCase(issue);
      return {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        url: issue.url,
        state: issue.state?.name ?? null,
        labels: (issue.labels?.nodes ?? []).map((label) => label.name),
        flow: parseFlow(issue),
        catalogKey: matched?.key ?? null,
      };
    }),
  };
}

function parseFlow(issue) {
  return matchIssueToCase(issue)?.flow ?? null;
}

async function commandSeed(request) {
  const ctx = await loadContext(request);
  const issues = await fetchAllQaIssues(request);
  const created = [];
  const existing = [];

  for (const testCase of TEST_CASES) {
    const match = issues.find((issue) => matchIssueToCase(issue)?.key === testCase.key);
    if (match) {
      existing.push({
        key: testCase.key,
        identifier: match.identifier,
        url: match.url,
      });
      continue;
    }

    const testType = requireTestTypeLabel(testCase.testType, ctx.labelsByName);
    const data = await request(QA_CREATE_ISSUE_MUTATION, {
      input: {
        teamId: ctx.team.id,
        projectId: ctx.project.id,
        stateId: ctx.todo.id,
        title: testCase.title,
        description: buildIssueDescription(testCase),
        labelIds: [testType.id],
      },
    });
    const issue = data?.issueCreate?.issue;
    if (!issue) {
      throw new Error(`Linear issueCreate failed for "${testCase.key}".`);
    }
    created.push({
      key: testCase.key,
      identifier: issue.identifier,
      url: issue.url,
    });
  }

  return {
    project: QA_PROJECT,
    created,
    existing,
    createdCount: created.length,
    existingCount: existing.length,
  };
}

async function commandReport(request, flags) {
  const result = assertResult(flags.result);
  const testCase = findCase({ key: flags.key, flow: flags.flow });
  const ctx = await loadContext(request);
  const issues = await fetchAllQaIssues(request);
  const issue = issues.find((row) => matchIssueToCase(row)?.key === testCase.key);
  if (!issue) {
    throw new Error(
      `No Linear issue for "${testCase.key}" (${testCase.flow}). Run \`node scripts/qa-agent/cli.mjs seed\` first.`,
    );
  }

  const labelIds = nextLabelIds(issue.labels?.nodes ?? [], result, ctx.labelsByName);
  const comment = formatRunComment({
    result,
    branch: flags.branch,
    commit: flags.commit,
    device: flags.device,
    error: typeof flags.error === "string" ? flags.error : null,
    logDir: typeof flags["log-dir"] === "string" ? flags["log-dir"] : null,
    cadence: typeof flags.cadence === "string" ? flags.cadence : null,
  });

  const updated = await request(QA_UPDATE_ISSUE_MUTATION, {
    id: issue.id,
    input: { labelIds },
  });
  const commented = await request(QA_CREATE_COMMENT_MUTATION, {
    issueId: issue.id,
    body: comment,
  });

  return {
    key: testCase.key,
    result,
    identifier: issue.identifier,
    url: issue.url,
    updated: Boolean(updated?.issueUpdate?.success),
    commentUrl: commented?.commentCreate?.comment?.url ?? null,
  };
}

async function commandTelegramBody(flags) {
  if (typeof flags.file !== "string") {
    throw new Error("--file <results.json> is required.");
  }
  const payload = JSON.parse(await readFile(flags.file, "utf8"));
  return {
    text: formatTelegramBody(payload),
  };
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { flags } = parseFlags(rest);

  const local = {
    catalog: () => commandCatalog(),
    suite: () => commandSuite(flags),
    "telegram-body": () => commandTelegramBody(flags),
  };
  if (command in local) return local[command]();

  const networked = {
    whoami: (request) => commandWhoami(request),
    list: (request) => commandList(request),
    seed: (request) => commandSeed(request),
    report: (request) => commandReport(request, flags),
  };
  if (!(command in networked)) {
    throw new Error(
      `Unknown command "${command ?? ""}". Expected one of: catalog, suite, whoami, list, seed, report, telegram-body.`,
    );
  }

  const request = createLinearClient();
  return networked[command](request);
}

main()
  .then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  })
  .catch((error) => {
    process.stderr.write(`${JSON.stringify({ error: error.message }, null, 2)}\n`);
    process.exitCode = 1;
  });
