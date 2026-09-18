import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildIssueDescription,
  findCase,
  matchIssueToCase,
  parseMaestroFlow,
  TEST_CASES,
} from "./catalog.mjs";
import { formatRunComment, formatTelegramBody, nextLabelIds } from "./linear-sync.mjs";
import { QA_CONTEXT_QUERY, QA_ISSUES_QUERY } from "./queries.mjs";
import { selectSuite, utcDayIndex } from "./select-suite.mjs";

describe("catalog", () => {
  it("gives every case a unique key, flow, and Test Type", () => {
    const keys = TEST_CASES.map((entry) => entry.key);
    const flows = TEST_CASES.map((entry) => entry.flow);
    assert.equal(new Set(keys).size, keys.length);
    assert.equal(new Set(flows).size, flows.length);
    assert.ok(TEST_CASES.every((entry) => entry.flow.startsWith(".maestro/flows/")));
    assert.ok(TEST_CASES.some((entry) => entry.suite === "smoke"));
    assert.ok(TEST_CASES.some((entry) => entry.suite === "core"));
  });

  it("round-trips the Maestro flow marker used to match Linear issues", () => {
    const smoke = TEST_CASES.find((entry) => entry.key === "smoke-p0");
    const description = buildIssueDescription(smoke);
    assert.equal(parseMaestroFlow(description), smoke.flow);
    assert.equal(
      parseMaestroFlow("**Maestro flow: **`.maestro/flows/smoke.yaml`"),
      smoke.flow,
    );
    assert.equal(matchIssueToCase({ description, title: "nope" }).key, "smoke-p0");
    assert.equal(matchIssueToCase({ description: "", title: smoke.title }).key, "smoke-p0");
    assert.equal(matchIssueToCase({ description: "", title: "unrelated" }), null);
  });

  it("finds a case by key or flow and rejects unknowns", () => {
    assert.equal(findCase({ key: "core-login" }).flow, ".maestro/flows/login.yaml");
    assert.equal(findCase({ flow: ".maestro/flows/logout.yaml" }).key, "core-logout");
    assert.throws(() => findCase({ key: "nope" }), /Unknown test case key/);
    assert.throws(() => findCase({}), /--key or --flow/);
  });
});

describe("selectSuite", () => {
  it("always includes smoke and core for the default cadence", () => {
    const selected = selectSuite(TEST_CASES, { cadence: "smoke-core" });
    const expected = [
      ...TEST_CASES.filter((entry) => entry.suite === "smoke").map(() => "smoke"),
      ...TEST_CASES.filter((entry) => entry.suite === "core").map(() => "core"),
    ].sort();
    assert.deepEqual(
      selected.map((entry) => entry.suite).sort(),
      expected,
    );
  });

  it("rotates flow/feature extras when they exist, without dropping smoke+core", () => {
    const extra = [
      ...TEST_CASES,
      {
        key: "flow-a",
        title: "[Flow] A",
        testType: "Flow",
        suite: "flow",
        flow: ".maestro/flows/a.yaml",
      },
      {
        key: "flow-b",
        title: "[Flow] B",
        testType: "Flow",
        suite: "flow",
        flow: ".maestro/flows/b.yaml",
      },
      {
        key: "feat-a",
        title: "[Feature] A",
        testType: "Feature Test",
        suite: "feature",
        flow: ".maestro/flows/c.yaml",
      },
    ];
    const day0 = new Date(Date.UTC(2026, 0, 1));
    const day1 = new Date(Date.UTC(2026, 0, 2));
    const a = selectSuite(extra, { cadence: "rotate", now: day0 });
    const b = selectSuite(extra, { cadence: "rotate", now: day1 });
    assert.equal(a.filter((entry) => entry.suite === "flow").length, 1);
    assert.equal(b.filter((entry) => entry.suite === "flow").length, 1);
    assert.notEqual(a.find((entry) => entry.suite === "flow").key, b.find((entry) => entry.suite === "flow").key);
    assert.equal(selectSuite(extra, { cadence: "full" }).length, extra.length);
    assert.equal(utcDayIndex(day0) + 1, utcDayIndex(day1));
  });

  it("rejects an unknown cadence", () => {
    assert.throws(() => selectSuite(TEST_CASES, { cadence: "nightly" }), /Unknown cadence/);
  });
});

describe("linear-sync", () => {
  const labelsByName = new Map([
    ["Pass", { id: "pass-id", name: "Pass" }],
    ["Fail", { id: "fail-id", name: "Fail" }],
    ["Flaky", { id: "flaky-id", name: "Flaky" }],
    ["Smoke", { id: "smoke-id", name: "Smoke" }],
    ["Core", { id: "core-id", name: "Core" }],
  ]);

  it("swaps the Result label without dropping Test Type", () => {
    const current = [
      { id: "smoke-id", name: "Smoke" },
      { id: "fail-id", name: "Fail" },
    ];
    assert.deepEqual(nextLabelIds(current, "Pass", labelsByName).sort(), ["pass-id", "smoke-id"]);
  });

  it("refuses an unknown result or a missing Linear label", () => {
    assert.throws(() => nextLabelIds([], "Skipped", labelsByName), /Unknown result/);
    assert.throws(() => nextLabelIds([], "Pass", new Map()), /no "Pass" label/);
  });

  it("formats a run comment and a single Telegram body", () => {
    const comment = formatRunComment({
      result: "Fail",
      branch: "develop",
      commit: "abc123",
      device: "iPhone 16",
      error: "assertVisible chat-input",
      logDir: "/tmp/maestro",
      cadence: "smoke-core",
      now: new Date("2026-09-01T11:00:00.000Z"),
    });
    assert.match(comment, /Run result: Fail/);
    assert.match(comment, /develop/);
    assert.match(comment, /abc123/);
    assert.match(comment, /iPhone 16/);
    assert.match(comment, /assertVisible chat-input/);

    const body = formatTelegramBody({
      cadence: "smoke-core",
      results: [
        { title: "[Smoke] P0", result: "Pass" },
        { title: "[Core] Login", result: "Fail" },
      ],
      bugs: "none",
    });
    assert.match(body, /2 tests \(smoke-core\): 1 pass, 1 fail, 0 flaky/);
    assert.match(body, /\[Core\] Login: Fail/);
    assert.match(body, /Product bugs: none/);

    const stopped = formatTelegramBody({
      cadence: "smoke-core",
      results: [
        { title: "[Smoke] P0", result: "Fail" },
        { title: "[Core] Login", result: "Fail" },
      ],
      earlyStop: "Stopped after 2 consecutive failures; remaining tests not run.",
    });
    assert.match(stopped, /Stopped after 2 consecutive failures/);
  });
});

describe("query name filters are case insensitive", () => {
  it("matches the QA project and team with eqIgnoreCase", () => {
    assert.match(QA_CONTEXT_QUERY, /name:\s*{\s*eqIgnoreCase:/);
    assert.match(QA_ISSUES_QUERY, /project:\s*{\s*name:\s*{\s*eqIgnoreCase:/);
    assert.doesNotMatch(QA_CONTEXT_QUERY, /name:\s*{\s*eq:/);
    assert.doesNotMatch(QA_ISSUES_QUERY, /name:\s*{\s*eq:/);
  });
});
