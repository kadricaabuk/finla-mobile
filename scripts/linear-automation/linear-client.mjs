/**
 * Minimal GraphQL transport for Linear's public API.
 *
 * Deliberately dependency-free: this runs on the bare Node runtime available in
 * CI and Cursor Cloud Agent VMs, where `npm install` may not have run.
 */

export const LINEAR_GRAPHQL_ENDPOINT = "https://api.linear.app/graphql";

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_RETRY_MS = 500;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export class LinearApiError extends Error {
  constructor(message, { status = null, graphQLErrors = [] } = {}) {
    super(message);
    this.name = "LinearApiError";
    this.status = status;
    this.graphQLErrors = graphQLErrors;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function describeStatus(status) {
  if (status === 401 || status === 403) {
    return `Linear rejected the credential (HTTP ${status}). Check that LINEAR_API_KEY is a current personal API key and that its permissions and team access cover this workspace.`;
  }
  if (status === 429) {
    return "Linear rate limit reached (HTTP 429).";
  }
  return `Linear returned HTTP ${status}.`;
}

/**
 * Creates a `request(query, variables)` function bound to one API key.
 *
 * The key is only ever read from the caller or the environment and is never
 * placed into an error message, so failures are safe to log verbatim.
 */
export function createLinearClient({
  apiKey = process.env.LINEAR_API_KEY,
  endpoint = LINEAR_GRAPHQL_ENDPOINT,
  fetchImpl = globalThis.fetch,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  baseRetryMs = DEFAULT_BASE_RETRY_MS,
} = {}) {
  if (!apiKey) {
    throw new LinearApiError(
      "LINEAR_API_KEY is not set. Add it as a Runtime Secret in the Cursor Cloud Agents dashboard; secrets are injected at VM boot, so an agent started before the secret was saved will not see it.",
    );
  }
  if (typeof fetchImpl !== "function") {
    throw new LinearApiError("No fetch implementation available; Node 18+ is required.");
  }

  return async function request(query, variables = {}) {
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Personal API keys are sent raw. `Bearer` applies to OAuth2 tokens
            // only, and prefixing a personal key with it fails authentication.
            Authorization: apiKey,
          },
          body: JSON.stringify({ query, variables }),
        });
      } catch (cause) {
        lastError = new LinearApiError(`Network error calling Linear: ${cause.message}`);
        if (attempt < maxAttempts) {
          await sleep(baseRetryMs * 2 ** (attempt - 1));
          continue;
        }
        throw lastError;
      }

      if (!response.ok) {
        lastError = new LinearApiError(describeStatus(response.status), {
          status: response.status,
        });
        if (RETRYABLE_STATUSES.has(response.status) && attempt < maxAttempts) {
          await sleep(baseRetryMs * 2 ** (attempt - 1));
          continue;
        }
        throw lastError;
      }

      const payload = await response.json();

      // Linear can return HTTP 200 with a populated `errors` array and partial
      // data, so a successful status alone is not enough to trust the result.
      if (Array.isArray(payload.errors) && payload.errors.length > 0) {
        const summary = payload.errors.map((e) => e.message).join("; ");
        throw new LinearApiError(`Linear GraphQL error: ${summary}`, {
          status: response.status,
          graphQLErrors: payload.errors,
        });
      }

      return payload.data;
    }

    throw lastError;
  };
}
