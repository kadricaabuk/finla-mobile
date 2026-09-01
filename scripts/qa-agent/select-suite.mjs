/**
 * Which catalog entries to run on a given cadence.
 *
 * smoke + core always run. flow + feature rotate so a weekday run stays
 * bounded; `full` is the weekly sweep.
 */

export const CADENCES = Object.freeze(["smoke-core", "rotate", "full"]);

function bySuite(catalog, suite) {
  return catalog.filter((entry) => entry.suite === suite);
}

/**
 * Day index used to pick the rotating extra case. UTC date, not local time,
 * so two runs on the same calendar day (Istanbul vs a CI clock) still agree.
 */
export function utcDayIndex(now = new Date()) {
  return Math.floor(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) /
      86400000,
  );
}

export function selectSuite(
  catalog,
  { cadence = "smoke-core", now = new Date() } = {},
) {
  if (!CADENCES.includes(cadence)) {
    throw new Error(
      `Unknown cadence "${cadence}". Expected one of: ${CADENCES.join(", ")}.`,
    );
  }

  const smoke = bySuite(catalog, "smoke");
  const core = bySuite(catalog, "core");
  const flow = bySuite(catalog, "flow");
  const feature = bySuite(catalog, "feature");

  if (cadence === "full") return [...catalog];
  if (cadence === "smoke-core") return [...smoke, ...core];

  const day = utcDayIndex(now);
  const extra = [];
  if (flow.length > 0) extra.push(flow[day % flow.length]);
  if (feature.length > 0) extra.push(feature[day % feature.length]);
  return [...smoke, ...core, ...extra];
}
