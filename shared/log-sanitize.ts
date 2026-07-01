/** RN (lib/api) ve Deno (Edge Functions) log redaction — tek kaynak. */
export const LOG_REDACT_KEY_PATTERN =
  /password|sms_code|token|cred|secret|refresh/i;

const MAX_DEPTH = 6;
const MAX_STRING = 2_000;
const MAX_ARRAY = 20;

export function sanitizeForDevLog(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[max_depth]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (value.length <= MAX_STRING) return value;
    return `${value.slice(0, MAX_STRING)}…[+${value.length - MAX_STRING} chars]`;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const sliced = value
      .slice(0, MAX_ARRAY)
      .map((item) => sanitizeForDevLog(item, depth + 1));
    if (value.length > MAX_ARRAY) {
      sliced.push(`…[+${value.length - MAX_ARRAY} items]`);
    }
    return sliced;
  }
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (LOG_REDACT_KEY_PATTERN.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    if (key === "code" && typeof raw === "string") {
      out[key] = "[redacted]";
      continue;
    }
    if (
      (key === "preview_html" || key === "html") &&
      typeof raw === "string"
    ) {
      out[key] = `[html ${raw.length} chars]`;
      continue;
    }
    out[key] = sanitizeForDevLog(raw, depth + 1);
  }
  return out;
}
