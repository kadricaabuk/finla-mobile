import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createLinearClient, LinearApiError } from "./linear-client.mjs";

const OK = (body) => ({ ok: true, status: 200, json: async () => body });
const FAIL = (status) => ({ ok: false, status, json: async () => ({}) });

function recordingFetch(responses) {
  const calls = [];
  const queue = [...responses];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return { calls, fetchImpl };
}

const clientWith = (fetchImpl, overrides = {}) =>
  createLinearClient({ apiKey: "lin_api_test", fetchImpl, baseRetryMs: 0, ...overrides });

describe("createLinearClient construction", () => {
  it("fails fast with actionable guidance when the key is missing", () => {
    assert.throws(
      () => createLinearClient({ apiKey: undefined, fetchImpl: async () => OK({}) }),
      (error) => error instanceof LinearApiError && /injected at VM boot/.test(error.message),
    );
  });
});

describe("request transport", () => {
  it("sends the personal API key raw, without a Bearer prefix", async () => {
    const { calls, fetchImpl } = recordingFetch([OK({ data: { viewer: { id: "u1" } } })]);
    await clientWith(fetchImpl)("query { viewer { id } }");

    const { headers } = calls[0].init;
    assert.equal(headers.Authorization, "lin_api_test");
    assert.doesNotMatch(headers.Authorization, /Bearer/i);
    assert.equal(headers["Content-Type"], "application/json");
  });

  it("posts the query and variables as a JSON body and returns data", async () => {
    const { calls, fetchImpl } = recordingFetch([OK({ data: { ok: true } })]);
    const data = await clientWith(fetchImpl)("query Q($a: String!) { x(a: $a) }", { a: "1" });

    assert.deepEqual(JSON.parse(calls[0].init.body), {
      query: "query Q($a: String!) { x(a: $a) }",
      variables: { a: "1" },
    });
    assert.deepEqual(data, { ok: true });
  });
});

describe("error handling", () => {
  it("throws on a GraphQL errors array even when the status is 200", async () => {
    // Linear returns partial success this way, so a 2xx alone is not enough.
    const { fetchImpl } = recordingFetch([
      OK({ data: { issues: null }, errors: [{ message: "Entity not found" }] }),
    ]);
    await assert.rejects(clientWith(fetchImpl)("query {}"), (error) => {
      assert.ok(error instanceof LinearApiError);
      assert.match(error.message, /Entity not found/);
      assert.equal(error.graphQLErrors.length, 1);
      return true;
    });
  });

  it("explains an auth failure without echoing the key", async () => {
    const { fetchImpl } = recordingFetch([FAIL(401)]);
    await assert.rejects(clientWith(fetchImpl)("query {}"), (error) => {
      assert.match(error.message, /LINEAR_API_KEY/);
      assert.doesNotMatch(error.message, /lin_api_test/);
      assert.equal(error.status, 401);
      return true;
    });
  });

  it("does not retry a non-retryable status", async () => {
    const { calls, fetchImpl } = recordingFetch([FAIL(400), OK({ data: {} })]);
    await assert.rejects(clientWith(fetchImpl)("query {}"));
    assert.equal(calls.length, 1);
  });
});

describe("retries", () => {
  it("retries a rate limit and succeeds on a later attempt", async () => {
    const { calls, fetchImpl } = recordingFetch([FAIL(429), FAIL(503), OK({ data: { ok: 1 } })]);
    const data = await clientWith(fetchImpl)("query {}");
    assert.equal(calls.length, 3);
    assert.deepEqual(data, { ok: 1 });
  });

  it("retries a network error and gives up after the attempt budget", async () => {
    const { calls, fetchImpl } = recordingFetch([
      new Error("ECONNRESET"),
      new Error("ECONNRESET"),
      new Error("ECONNRESET"),
    ]);
    await assert.rejects(clientWith(fetchImpl)("query {}"), /Network error calling Linear/);
    assert.equal(calls.length, 3);
  });
});
