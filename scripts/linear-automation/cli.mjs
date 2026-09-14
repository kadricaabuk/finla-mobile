#!/usr/bin/env node
/**
 * CLI wrapper around the Linear operations the "Founder Tasks -> PR"
 * automation needs. Every command prints JSON on stdout so an agent can
 * consume the result without parsing prose.
 *
 * Usage:
 *   node scripts/linear-automation/cli.mjs whoami
 *   node scripts/linear-automation/cli.mjs list [--project <name>] [--label <name>] [--max <n>]
 *   node scripts/linear-automation/cli.mjs doctor [--project <name>] [--label <name>]
 *   node scripts/linear-automation/cli.mjs react <issueId> <seen|working|done>
 *   node scripts/linear-automation/cli.mjs comment <issueId> <prUrl>
 */

import { createLinearClient, LinearApiError } from "./linear-client.mjs";
import {
  CANDIDATE_ISSUES_QUERY,
  CREATE_COMMENT_MUTATION,
  CREATE_REACTION_MUTATION,
  DIAGNOSTICS_QUERY,
  VIEWER_QUERY,
} from "./queries.mjs";
import {
  extractPrUrl,
  normalizeIssue,
  REACTION_STAGES,
  selectIssues,
} from "./select-issues.mjs";

const DEFAULT_PROJECT = "Founder Tasks";
const DEFAULT_LABEL = "development";
const DEFAULT_MAX_ISSUES = 3;
const MAX_PAGES = 20;

function parseFlags(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      flags[token.slice(2)] = argv[i + 1];
      i += 1;
    } else {
      positional.push(token);
    }
  }
  return { flags, positional };
}

async function fetchCandidateIssues(request, { projectName, labelName }) {
  const nodes = [];
  let after = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data = await request(CANDIDATE_ISSUES_QUERY, { projectName, labelName, after });
    const connection = data?.issues;
    if (!connection) break;
    nodes.push(...(connection.nodes ?? []));
    if (!connection.pageInfo?.hasNextPage) break;
    after = connection.pageInfo.endCursor;
  }

  return nodes.map(normalizeIssue);
}

async function commandWhoami(request) {
  const data = await request(VIEWER_QUERY);
  return data.viewer;
}

async function commandList(request, flags) {
  const projectName = flags.project ?? DEFAULT_PROJECT;
  const labelName = flags.label ?? DEFAULT_LABEL;
  const maxIssues = flags.max ? Number(flags.max) : DEFAULT_MAX_ISSUES;

  const viewer = await commandWhoami(request);
  const issues = await fetchCandidateIssues(request, { projectName, labelName });
  const { selected, skipped } = selectIssues({
    issues,
    botUserId: viewer.id,
    projectName,
    labelName,
    maxIssues,
  });

  return {
    projectName,
    labelName,
    botUserId: viewer.id,
    candidateCount: issues.length,
    selected: selected.map((issue) => ({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      url: issue.url,
      description: issue.description,
      priority: issue.priority,
      priorityLabel: issue.priorityLabel,
      state: issue.stateName,
    })),
    skipped: skipped.map(({ issue, reason }) => ({
      identifier: issue.identifier,
      reason,
    })),
  };
}

/**
 * Explains an empty `list`.
 *
 * A valid query returning nothing means the scope is wrong, not the code. This
 * reports what actually exists so the mismatch is visible rather than guessed:
 * the project name, the label name, or every issue being closed.
 */
async function commandDoctor(request, flags) {
  const projectName = flags.project ?? DEFAULT_PROJECT;
  const labelName = flags.label ?? DEFAULT_LABEL;

  const data = await request(DIAGNOSTICS_QUERY, { projectName });
  const projects = (data?.projects?.nodes ?? []).map((p) => p.name);
  const labels = (data?.issueLabels?.nodes ?? []).map((l) => l.name);
  const issues = (data?.issues?.nodes ?? []).map((issue) => ({
    identifier: issue.identifier,
    title: issue.title,
    state: issue.state?.name ?? null,
    stateType: issue.state?.type ?? null,
    labels: (issue.labels?.nodes ?? []).map((l) => l.name),
  }));

  const projectExists = projects.some((p) => p.toLowerCase() === projectName.toLowerCase());
  const labelExists = labels.some((l) => l.toLowerCase() === labelName.toLowerCase());
  const withLabel = issues.filter((issue) =>
    issue.labels.some((l) => l.toLowerCase() === labelName.toLowerCase()),
  );
  const openWithLabel = withLabel.filter(
    (issue) => !["completed", "canceled"].includes(issue.stateType),
  );

  const findings = [];
  if (!projectExists) {
    findings.push(`No project named "${projectName}". Existing projects: ${projects.join(", ") || "(none)"}.`);
  }
  if (!labelExists) {
    findings.push(`No label named "${labelName}". Existing labels: ${labels.join(", ") || "(none)"}.`);
  }
  if (projectExists && issues.length === 0) {
    findings.push(`Project "${projectName}" has no issues at all.`);
  }
  if (issues.length > 0 && withLabel.length === 0) {
    findings.push(
      `Project "${projectName}" has ${issues.length} issue(s), but none carries the "${labelName}" label.`,
    );
  }
  if (withLabel.length > 0 && openWithLabel.length === 0) {
    findings.push(`Every "${labelName}" issue in "${projectName}" is already closed.`);
  }
  if (findings.length === 0) {
    findings.push(`${openWithLabel.length} open "${labelName}" issue(s) found; list should return them.`);
  }

  return {
    projectName,
    labelName,
    projectExists,
    labelExists,
    projects,
    labels,
    issuesInProject: issues,
    counts: {
      inProject: issues.length,
      withLabel: withLabel.length,
      openWithLabel: openWithLabel.length,
    },
    findings,
  };
}

async function commandReact(request, issueId, stage) {
  const spec = REACTION_STAGES[stage];
  if (!spec) {
    const valid = Object.keys(REACTION_STAGES).join(", ");
    throw new Error(`Unknown reaction stage "${stage}". Expected one of: ${valid}.`);
  }

  try {
    const data = await request(CREATE_REACTION_MUTATION, {
      issueId,
      emoji: spec.shortcode,
    });
    return { issueId, stage, emoji: spec.shortcode, created: Boolean(data?.reactionCreate?.success) };
  } catch (error) {
    // Re-reacting is not an error for our purposes: the desired end state is
    // "this reaction exists", which is already true.
    if (error instanceof LinearApiError && /already/i.test(error.message)) {
      return { issueId, stage, emoji: spec.shortcode, created: false, alreadyPresent: true };
    }
    throw error;
  }
}

async function commandComment(request, issueId, prUrl) {
  if (!extractPrUrl(prUrl)) {
    throw new Error(
      `"${prUrl}" is not a GitHub pull request URL. Rule 6 requires the comment to carry the PR link, and the same pattern is what later runs use to detect completed work.`,
    );
  }

  const data = await request(CREATE_COMMENT_MUTATION, { issueId, body: prUrl });
  return {
    issueId,
    prUrl,
    success: Boolean(data?.commentCreate?.success),
    commentUrl: data?.commentCreate?.comment?.url ?? null,
  };
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { flags, positional } = parseFlags(rest);

  const COMMANDS = ["whoami", "list", "doctor", "react", "comment"];
  if (!COMMANDS.includes(command)) {
    // Validated before the client is built, so a typo reports the typo rather
    // than a missing-credential error.
    throw new Error(
      `Unknown command "${command ?? ""}". Expected one of: ${COMMANDS.join(", ")}.`,
    );
  }

  const request = createLinearClient();

  switch (command) {
    case "whoami":
      return commandWhoami(request);
    case "list":
      return commandList(request, flags);
    case "doctor":
      return commandDoctor(request, flags);
    case "react":
      return commandReact(request, positional[0], positional[1]);
    default:
      return commandComment(request, positional[0], positional[1]);
  }
}

main()
  .then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  })
  .catch((error) => {
    process.stderr.write(`${JSON.stringify({ error: error.message }, null, 2)}\n`);
    process.exitCode = 1;
  });
