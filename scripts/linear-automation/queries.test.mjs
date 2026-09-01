import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CANDIDATE_ISSUES_QUERY, DIAGNOSTICS_QUERY } from "./queries.mjs";

/**
 * These assert on query text rather than behaviour, which is unusual, but the
 * bug they guard against was invisible: Linear's `eq` is case sensitive, so a
 * label stored as "Development" matched nothing against "development" and the
 * API returned an empty list with no error. The client-side case-insensitive
 * re-check never ran, because there was nothing left to check.
 */
describe("name filters are case insensitive", () => {
  it("matches the project and label with eqIgnoreCase", () => {
    assert.match(CANDIDATE_ISSUES_QUERY, /project:\s*{\s*name:\s*{\s*eqIgnoreCase:/);
    assert.match(CANDIDATE_ISSUES_QUERY, /labels:\s*{\s*name:\s*{\s*eqIgnoreCase:/);
    assert.match(DIAGNOSTICS_QUERY, /project:\s*{\s*name:\s*{\s*eqIgnoreCase:/);
  });

  it("never falls back to a case-sensitive eq on a name field", () => {
    for (const query of [CANDIDATE_ISSUES_QUERY, DIAGNOSTICS_QUERY]) {
      assert.doesNotMatch(query, /name:\s*{\s*eq:/);
    }
  });

  it("still restricts to open issues", () => {
    assert.match(CANDIDATE_ISSUES_QUERY, /state:\s*{\s*type:\s*{\s*nin:\s*\["completed",\s*"canceled"\]/);
  });
});
