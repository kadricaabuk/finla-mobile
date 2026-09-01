/**
 * Pure helpers for mapping a Maestro run onto Linear test-case issues.
 *
 * Network lives in cli.mjs so these rules stay unit-tested without an API key.
 */

import { RESULT_LABELS, TEST_TYPE_LABELS } from "./catalog.mjs";

const RESULT_SET = new Set(RESULT_LABELS);

export function assertResult(result) {
  if (!RESULT_SET.has(result)) {
    throw new Error(`Unknown result "${result}". Expected one of: ${RESULT_LABELS.join(", ")}.`);
  }
  return result;
}

/**
 * Replace the Result-group label, keep Test Type and anything else.
 *
 * `labelIds` on issueUpdate replaces the full set, so dropping a Result label
 * without putting the rest back would strip Smoke/Core off the issue.
 */
export function nextLabelIds(currentLabels, result, labelsByName) {
  assertResult(result);
  const wanted = labelsByName.get(result);
  if (!wanted?.id) {
    throw new Error(`Linear has no "${result}" label. Co-founder owns label groups — do not create it here.`);
  }

  const kept = (currentLabels ?? [])
    .filter((label) => !RESULT_SET.has(label.name))
    .map((label) => label.id)
    .filter(Boolean);

  return [...new Set([...kept, wanted.id])];
}

export function labelsByNameFromNodes(nodes) {
  const map = new Map();
  for (const node of nodes ?? []) {
    if (node?.name) map.set(node.name, node);
  }
  return map;
}

export function requireTestTypeLabel(testType, labelsByName) {
  if (!TEST_TYPE_LABELS.includes(testType)) {
    throw new Error(`Unknown Test Type "${testType}". Expected one of: ${TEST_TYPE_LABELS.join(", ")}.`);
  }
  const label = labelsByName.get(testType);
  if (!label?.id) {
    throw new Error(
      `Linear has no "${testType}" label. Co-founder owns label groups — do not create it here.`,
    );
  }
  return label;
}

export function formatRunComment({
  result,
  branch,
  commit,
  device,
  error,
  logDir,
  cadence,
  now = new Date(),
} = {}) {
  assertResult(result);
  const lines = [
    `## Run result: ${result}`,
    "",
    `- Time: ${now.toISOString()}`,
    `- Branch: ${branch ?? "(unknown)"}`,
    `- Commit: ${commit ?? "(unknown)"}`,
    `- Device: ${device ?? "(unknown)"}`,
  ];
  if (cadence) lines.push(`- Cadence: ${cadence}`);
  if (error) lines.push(`- Error: ${error}`);
  if (logDir) lines.push(`- Maestro logs: \`${logDir}\``);
  return `${lines.join("\n")}\n`;
}

export function formatTelegramBody({
  results = [],
  cadence,
  newTests = "none",
  refactors = "none",
  bugs = "none",
  skippedReason = null,
} = {}) {
  if (skippedReason) {
    return `Skipped: ${skippedReason}\nNew tests: ${newTests}. Refactors: ${refactors}. Product bugs: ${bugs}.`;
  }

  const pass = results.filter((row) => row.result === "Pass").length;
  const fail = results.filter((row) => row.result === "Fail").length;
  const flaky = results.filter((row) => row.result === "Flaky").length;

  const lines = [
    `${results.length} tests (${cadence ?? "smoke-core"}): ${pass} pass, ${fail} fail, ${flaky} flaky.`,
  ];
  for (const row of results) {
    lines.push(`${row.title}: ${row.result}`);
  }
  lines.push(`New tests: ${newTests}. Refactors: ${refactors}. Product bugs: ${bugs}.`);
  return lines.join("\n");
}
