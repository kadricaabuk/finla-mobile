import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  extractPrUrl,
  findPrLinkComment,
  hasDoneReaction,
  normalizeIssue,
  reactionMatchesStage,
  selectIssues,
  severityRank,
} from "./select-issues.mjs";

const PROJECT = "Founder Tasks";
const LABEL = "development";
const BOT = "bot-user-id";

function makeIssue(overrides = {}) {
  return {
    id: overrides.id ?? `id-${overrides.identifier ?? "FIN-1"}`,
    identifier: "FIN-1",
    title: "Some task",
    url: "https://linear.app/finla/issue/FIN-1",
    description: "",
    priority: 2,
    priorityLabel: "High",
    stateName: "Todo",
    stateType: "unstarted",
    projectName: PROJECT,
    labels: [LABEL],
    comments: [],
    reactions: [],
    ...overrides,
  };
}

const select = (issues, botUserId = BOT) =>
  selectIssues({ issues, botUserId, projectName: PROJECT, labelName: LABEL });

const identifiers = (result) => result.selected.map((issue) => issue.identifier);
const reasonFor = (result, identifier) =>
  result.skipped.find((entry) => entry.issue.identifier === identifier)?.reason;

describe("severityRank", () => {
  it("orders Urgent before High before Medium before Low", () => {
    assert.ok(severityRank(1) < severityRank(2));
    assert.ok(severityRank(2) < severityRank(3));
    assert.ok(severityRank(3) < severityRank(4));
  });

  it("ranks unprioritized issues last rather than first", () => {
    // Linear stores "no priority" as 0, which would sort ahead of Urgent.
    assert.ok(severityRank(0) > severityRank(4));
    assert.ok(severityRank(null) > severityRank(4));
    assert.ok(severityRank(undefined) > severityRank(4));
  });
});

describe("reactionMatchesStage", () => {
  it("accepts the shortcode, the wrapped shortcode and the literal emoji", () => {
    assert.equal(reactionMatchesStage("eyes", "seen"), true);
    assert.equal(reactionMatchesStage(":eyes:", "seen"), true);
    assert.equal(reactionMatchesStage("\u{1F440}", "seen"), true);
    assert.equal(reactionMatchesStage("white_check_mark", "done"), true);
    assert.equal(reactionMatchesStage("\u2705", "done"), true);
    assert.equal(reactionMatchesStage("arrows_counterclockwise", "working"), true);
  });

  it("rejects a different emoji and non-string input", () => {
    assert.equal(reactionMatchesStage("eyes", "done"), false);
    assert.equal(reactionMatchesStage("+1", "done"), false);
    assert.equal(reactionMatchesStage(null, "done"), false);
  });
});

describe("PR link detection", () => {
  it("extracts a GitHub PR URL from surrounding prose", () => {
    assert.equal(
      extractPrUrl("Opened https://github.com/kadricaabuk/finla-mobile/pull/42 for this"),
      "https://github.com/kadricaabuk/finla-mobile/pull/42",
    );
  });

  it("ignores non-PR GitHub links", () => {
    assert.equal(extractPrUrl("https://github.com/kadricaabuk/finla-mobile/issues/42"), null);
    assert.equal(extractPrUrl("https://github.com/kadricaabuk/finla-mobile"), null);
    assert.equal(extractPrUrl("no link here"), null);
  });

  it("finds the comment carrying the link regardless of author", () => {
    const issue = makeIssue({
      comments: [
        { id: "c1", body: "looks good", userId: "human" },
        { id: "c2", body: "https://github.com/o/r/pull/7", userId: "human" },
      ],
    });
    assert.equal(findPrLinkComment(issue)?.id, "c2");
  });
});

describe("hasDoneReaction", () => {
  it("is true only for the completion reaction from the bot", () => {
    const fromBot = makeIssue({ reactions: [{ emoji: "white_check_mark", userId: BOT }] });
    const fromHuman = makeIssue({ reactions: [{ emoji: "white_check_mark", userId: "human" }] });
    const otherEmoji = makeIssue({ reactions: [{ emoji: "eyes", userId: BOT }] });

    assert.equal(hasDoneReaction(fromBot, BOT), true);
    assert.equal(hasDoneReaction(fromHuman, BOT), false);
    assert.equal(hasDoneReaction(otherEmoji, BOT), false);
  });

  it("accepts any author when the bot identity is unknown", () => {
    const issue = makeIssue({ reactions: [{ emoji: "\u2705", userId: "human" }] });
    assert.equal(hasDoneReaction(issue, null), true);
  });
});

describe("selectIssues scope filtering", () => {
  it("skips issues outside the project", () => {
    const result = select([makeIssue({ identifier: "FIN-2", projectName: "Other Project" })]);
    assert.deepEqual(identifiers(result), []);
    assert.match(reasonFor(result, "FIN-2"), /not in project/);
  });

  it("skips issues without the development label", () => {
    const result = select([makeIssue({ identifier: "FIN-3", labels: ["design"] })]);
    assert.deepEqual(identifiers(result), []);
    assert.match(reasonFor(result, "FIN-3"), /missing "development" label/);
  });

  it("matches project and label case-insensitively", () => {
    const result = select([
      makeIssue({ identifier: "FIN-4", projectName: "founder tasks", labels: ["Development"] }),
    ]);
    assert.deepEqual(identifiers(result), ["FIN-4"]);
  });

  it("skips completed and canceled issues but keeps other states", () => {
    const result = select([
      makeIssue({ identifier: "FIN-5", stateType: "completed", stateName: "Done" }),
      makeIssue({ identifier: "FIN-6", stateType: "canceled", stateName: "Canceled" }),
      makeIssue({ identifier: "FIN-7", stateType: "started", stateName: "In Progress" }),
      makeIssue({ identifier: "FIN-8", stateType: "backlog", stateName: "Backlog" }),
    ]);
    assert.deepEqual(identifiers(result).sort(), ["FIN-7", "FIN-8"]);
    assert.match(reasonFor(result, "FIN-5"), /closed/);
  });
});

describe("selectIssues severity ordering and run cap", () => {
  it("sorts Urgent, High, Medium, Low and puts no-priority last", () => {
    const result = selectIssues({
      issues: [
        makeIssue({ identifier: "LOW", priority: 4 }),
        makeIssue({ identifier: "NONE", priority: 0 }),
        makeIssue({ identifier: "URGENT", priority: 1 }),
        makeIssue({ identifier: "MEDIUM", priority: 3 }),
        makeIssue({ identifier: "HIGH", priority: 2 }),
      ],
      botUserId: BOT,
      projectName: PROJECT,
      labelName: LABEL,
      maxIssues: 5,
    });
    assert.deepEqual(identifiers(result), ["URGENT", "HIGH", "MEDIUM", "LOW", "NONE"]);
  });

  it("caps the run at three issues and explains the overflow", () => {
    const result = select([
      makeIssue({ identifier: "FIN-10", priority: 1 }),
      makeIssue({ identifier: "FIN-11", priority: 1 }),
      makeIssue({ identifier: "FIN-12", priority: 2 }),
      makeIssue({ identifier: "FIN-13", priority: 2 }),
    ]);
    assert.deepEqual(identifiers(result), ["FIN-10", "FIN-11", "FIN-12"]);
    assert.match(reasonFor(result, "FIN-13"), /over the per-run cap of 3/);
  });

  it("breaks severity ties deterministically so reruns agree", () => {
    const issues = [
      makeIssue({ identifier: "FIN-30", priority: 2 }),
      makeIssue({ identifier: "FIN-20", priority: 2 }),
      makeIssue({ identifier: "FIN-10", priority: 2 }),
    ];
    const first = identifiers(select(issues));
    const second = identifiers(select([...issues].reverse()));
    assert.deepEqual(first, ["FIN-10", "FIN-20", "FIN-30"]);
    assert.deepEqual(first, second);
  });
});

describe("selectIssues idempotency (rules 3 and 7)", () => {
  it("skips an issue this automation already commented a PR link on", () => {
    const result = select([
      makeIssue({
        identifier: "FIN-40",
        comments: [{ id: "c", body: "https://github.com/o/r/pull/9", userId: BOT }],
      }),
    ]);
    assert.deepEqual(identifiers(result), []);
    assert.match(reasonFor(result, "FIN-40"), /from this automation/);
  });

  it("also skips when someone else linked a PR, since rule 3 forbids duplicates", () => {
    const result = select([
      makeIssue({
        identifier: "FIN-41",
        comments: [{ id: "c", body: "see https://github.com/o/r/pull/9", userId: "human" }],
      }),
    ]);
    assert.deepEqual(identifiers(result), []);
    assert.match(reasonFor(result, "FIN-41"), /from another author/);
  });

  it("skips an issue already carrying the completion reaction", () => {
    const result = select([
      makeIssue({ identifier: "FIN-42", reactions: [{ emoji: "white_check_mark", userId: BOT }] }),
    ]);
    assert.deepEqual(identifiers(result), []);
    assert.match(reasonFor(result, "FIN-42"), /completion reaction/);
  });

  it("still selects an issue that only has the seen and working reactions", () => {
    // A run that crashed mid-flight leaves these behind; it should be retried.
    const result = select([
      makeIssue({
        identifier: "FIN-43",
        reactions: [
          { emoji: "eyes", userId: BOT },
          { emoji: "arrows_counterclockwise", userId: BOT },
        ],
      }),
    ]);
    assert.deepEqual(identifiers(result), ["FIN-43"]);
  });

  it("does not treat an unrelated comment as a PR link", () => {
    const result = select([
      makeIssue({
        identifier: "FIN-44",
        comments: [{ id: "c", body: "I started looking at this", userId: "human" }],
      }),
    ]);
    assert.deepEqual(identifiers(result), ["FIN-44"]);
  });
});

describe("normalizeIssue", () => {
  it("flattens a raw GraphQL node and tolerates missing collections", () => {
    const normalized = normalizeIssue({
      id: "uuid-1",
      identifier: "FIN-50",
      title: "Raw node",
      url: "https://linear.app/finla/issue/FIN-50",
      priority: 1,
      priorityLabel: "Urgent",
      state: { name: "Todo", type: "unstarted" },
      project: { name: PROJECT },
      labels: { nodes: [{ name: LABEL }, { name: "mobile" }] },
      comments: { nodes: [{ id: "c1", body: "hi", createdAt: "2026-01-01", user: { id: "u1" } }] },
      reactions: [{ emoji: "eyes", user: { id: "u1" } }],
    });

    assert.equal(normalized.projectName, PROJECT);
    assert.deepEqual(normalized.labels, [LABEL, "mobile"]);
    assert.deepEqual(normalized.comments, [
      { id: "c1", body: "hi", userId: "u1", createdAt: "2026-01-01" },
    ]);
    assert.deepEqual(normalized.reactions, [{ emoji: "eyes", userId: "u1" }]);
  });

  it("defaults absent fields instead of throwing", () => {
    const normalized = normalizeIssue({ id: "uuid-2", identifier: "FIN-51", title: "Sparse" });
    assert.equal(normalized.priority, 0);
    assert.equal(normalized.projectName, "");
    assert.deepEqual(normalized.labels, []);
    assert.deepEqual(normalized.comments, []);
    assert.deepEqual(normalized.reactions, []);
  });
});
