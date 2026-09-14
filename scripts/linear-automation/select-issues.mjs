/**
 * Pure selection logic for the "Founder Tasks -> PR" automation.
 *
 * Everything here is a plain function over plain data so the automation's rules
 * (scope, severity order, run cap, and the "already handled" check) are unit
 * testable rather than left to model discretion at runtime.
 */

/** Linear workflow state types that mean the issue is no longer open. */
export const CLOSED_STATE_TYPES = new Set(["completed", "canceled"]);

/**
 * Stages of the emoji protocol.
 *
 * Linear's `reactionCreate` takes a shortcode, but reads can come back as
 * either a shortcode or a literal emoji depending on how the reaction was
 * added, so each stage carries both spellings and matching accepts either.
 */
export const REACTION_STAGES = {
  seen: { shortcode: "eyes", unicode: "\u{1F440}" },
  working: { shortcode: "arrows_counterclockwise", unicode: "\u{1F504}" },
  done: { shortcode: "white_check_mark", unicode: "\u2705" },
};

/** Matches a GitHub pull request URL in a comment body. */
export const PR_URL_PATTERN = /https?:\/\/(?:www\.)?github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/i;

/**
 * Linear encodes priority as 0 = None, 1 = Urgent, 2 = High, 3 = Medium,
 * 4 = Low. Sorting on the raw value would rank unprioritized issues above
 * Urgent, so `None` is pushed to the end instead.
 */
export function severityRank(priority) {
  if (priority === null || priority === undefined || priority === 0) {
    return Number.MAX_SAFE_INTEGER;
  }
  return priority;
}

export function reactionMatchesStage(emoji, stage) {
  const spec = REACTION_STAGES[stage];
  if (!spec || typeof emoji !== "string") return false;
  const normalized = emoji.replace(/^:|:$/g, "").toLowerCase();
  return normalized === spec.shortcode || emoji === spec.unicode;
}

/** Flattens one raw GraphQL issue node into the shape the rules operate on. */
export function normalizeIssue(node) {
  return {
    id: node.id,
    identifier: node.identifier,
    title: node.title,
    url: node.url,
    description: node.description ?? "",
    priority: node.priority ?? 0,
    priorityLabel: node.priorityLabel ?? "",
    stateName: node.state?.name ?? "",
    stateType: node.state?.type ?? "",
    projectName: node.project?.name ?? "",
    labels: (node.labels?.nodes ?? []).map((label) => label.name),
    comments: (node.comments?.nodes ?? []).map((comment) => ({
      id: comment.id,
      body: comment.body ?? "",
      userId: comment.user?.id ?? null,
      createdAt: comment.createdAt ?? null,
    })),
    reactions: (node.reactions ?? []).map((reaction) => ({
      emoji: reaction.emoji ?? "",
      userId: reaction.user?.id ?? null,
    })),
  };
}

const matchesName = (candidate, expected) =>
  typeof candidate === "string" && candidate.trim().toLowerCase() === expected.trim().toLowerCase();

export function isOpen(issue) {
  return !CLOSED_STATE_TYPES.has(issue.stateType);
}

export function hasLabel(issue, labelName) {
  return issue.labels.some((label) => matchesName(label, labelName));
}

export function isInProject(issue, projectName) {
  return matchesName(issue.projectName, projectName);
}

/**
 * Finds the first comment carrying a PR link, whoever wrote it.
 *
 * Authorship is deliberately not part of the predicate. Rule 7 only asks about
 * this automation's own comments, but rule 3 independently says to skip issues
 * that already have an open PR, and a human-posted link is evidence of exactly
 * that. The risk is asymmetric: skipping an issue we could have handled costs
 * one run, while proceeding past someone else's PR costs a duplicate PR and a
 * confusing review. Authorship is still reported in the skip reason so the
 * difference stays visible.
 */
export function findPrLinkComment(issue) {
  return issue.comments.find((comment) => PR_URL_PATTERN.test(comment.body)) ?? null;
}

/** Rule 7, second half: the completion reaction is already present. */
export function hasDoneReaction(issue, botUserId = null) {
  return issue.reactions.some((reaction) => {
    if (!reactionMatchesStage(reaction.emoji, "done")) return false;
    if (!botUserId) return true;
    return reaction.userId === botUserId;
  });
}

export function extractPrUrl(text) {
  const match = typeof text === "string" ? text.match(PR_URL_PATTERN) : null;
  return match ? match[0] : null;
}

/**
 * Applies rules 1, 2, 3 and 7 to a set of issues.
 *
 * Returns both the picks and every rejection with its reason, so a run can
 * explain why an issue it was expected to handle was passed over.
 */
export function selectIssues({
  issues,
  botUserId = null,
  projectName,
  labelName,
  maxIssues = 3,
}) {
  const skipped = [];
  const eligible = [];

  for (const issue of issues) {
    const prComment = findPrLinkComment(issue);

    if (!isInProject(issue, projectName)) {
      skipped.push({ issue, reason: `not in project "${projectName}"` });
    } else if (!hasLabel(issue, labelName)) {
      skipped.push({ issue, reason: `missing "${labelName}" label` });
    } else if (!isOpen(issue)) {
      skipped.push({ issue, reason: `closed (state "${issue.stateName}")` });
    } else if (prComment) {
      const author =
        botUserId && prComment.userId === botUserId ? "this automation" : "another author";
      skipped.push({ issue, reason: `already has a PR link comment from ${author}` });
    } else if (hasDoneReaction(issue, botUserId)) {
      skipped.push({ issue, reason: "already marked done with the completion reaction" });
    } else {
      eligible.push(issue);
    }
  }

  // Severity first; ties broken by identifier so a run is reproducible.
  eligible.sort((a, b) => {
    const bySeverity = severityRank(a.priority) - severityRank(b.priority);
    if (bySeverity !== 0) return bySeverity;
    return String(a.identifier).localeCompare(String(b.identifier), "en");
  });

  const selected = eligible.slice(0, maxIssues);
  for (const issue of eligible.slice(maxIssues)) {
    skipped.push({ issue, reason: `over the per-run cap of ${maxIssues}` });
  }

  return { selected, skipped };
}
