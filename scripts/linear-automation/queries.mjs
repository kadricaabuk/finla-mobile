/**
 * The complete set of Linear operations this automation is allowed to perform.
 *
 * Keeping them in one file makes the blast radius of the API key reviewable:
 * two reads, two writes, nothing else.
 */

export const VIEWER_QUERY = /* GraphQL */ `
  query AutomationViewer {
    viewer {
      id
      name
      email
    }
  }
`;

/**
 * Candidate issues, filtered server-side by project, label and open state.
 *
 * The same predicates are re-applied client-side in `select-issues.mjs`; the
 * duplication is intentional so a drifting filter cannot silently widen scope.
 */
export const CANDIDATE_ISSUES_QUERY = /* GraphQL */ `
  query AutomationCandidateIssues($projectName: String!, $labelName: String!, $after: String) {
    issues(
      first: 50
      after: $after
      filter: {
        project: { name: { eq: $projectName } }
        labels: { name: { eq: $labelName } }
        state: { type: { nin: ["completed", "canceled"] } }
      }
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        identifier
        title
        description
        url
        priority
        priorityLabel
        state {
          name
          type
        }
        project {
          name
        }
        labels {
          nodes {
            name
          }
        }
        comments(first: 100) {
          nodes {
            id
            body
            createdAt
            user {
              id
            }
          }
        }
        reactions {
          emoji
          user {
            id
          }
        }
      }
    }
  }
`;

export const CREATE_COMMENT_MUTATION = /* GraphQL */ `
  mutation AutomationCreateComment($issueId: String!, $body: String!) {
    commentCreate(input: { issueId: $issueId, body: $body }) {
      success
      comment {
        id
        url
      }
    }
  }
`;

export const CREATE_REACTION_MUTATION = /* GraphQL */ `
  mutation AutomationCreateReaction($issueId: String!, $emoji: String!) {
    reactionCreate(input: { issueId: $issueId, emoji: $emoji }) {
      success
      reaction {
        id
        emoji
      }
    }
  }
`;
