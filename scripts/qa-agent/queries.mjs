/**
 * Linear operations the local QA runner is allowed to perform.
 *
 * Reads: viewer, team/project/labels/states, issues in QA Automation.
 * Writes: create a missing test-case issue, update labels, comment on a run.
 * Does not create labels or change project settings.
 */

export const QA_CONTEXT_QUERY = /* GraphQL */ `
  query QaContext($projectName: String!, $teamName: String!) {
    viewer {
      id
      name
    }
    teams(filter: { name: { eqIgnoreCase: $teamName } }) {
      nodes {
        id
        name
        states {
          nodes {
            id
            name
            type
          }
        }
      }
    }
    projects(filter: { name: { eqIgnoreCase: $projectName } }) {
      nodes {
        id
        name
      }
    }
    issueLabels(first: 100) {
      nodes {
        id
        name
        parent {
          name
        }
      }
    }
  }
`;

export const QA_ISSUES_QUERY = /* GraphQL */ `
  query QaIssues($projectName: String!, $after: String) {
    issues(
      first: 50
      after: $after
      filter: {
        project: { name: { eqIgnoreCase: $projectName } }
        state: { type: { nin: ["canceled"] } }
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
        state {
          id
          name
          type
        }
        labels {
          nodes {
            id
            name
            parent {
              name
            }
          }
        }
      }
    }
  }
`;

export const QA_CREATE_ISSUE_MUTATION = /* GraphQL */ `
  mutation QaCreateIssue($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue {
        id
        identifier
        title
        url
      }
    }
  }
`;

export const QA_UPDATE_ISSUE_MUTATION = /* GraphQL */ `
  mutation QaUpdateIssue($id: String!, $input: IssueUpdateInput!) {
    issueUpdate(id: $id, input: $input) {
      success
      issue {
        id
        identifier
        url
      }
    }
  }
`;

export const QA_CREATE_COMMENT_MUTATION = /* GraphQL */ `
  mutation QaCreateComment($issueId: String!, $body: String!) {
    commentCreate(input: { issueId: $issueId, body: $body }) {
      success
      comment {
        id
        url
      }
    }
  }
`;
