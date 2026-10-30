# Atlassian MCP server

The Atlassian MCP server signs the user in with OAuth in the browser and acts
with that user's Jira permissions. Tool names below are as the server
publishes them; the agent may show them with a prefix. The server can change
its tools, so if a call is rejected, re-read the tool's schema.

The server also offers Confluence and other tools. This skill uses only the
Jira ones.

## Site (cloudId)

Every Jira tool needs `cloudId`. If the user gave a site URL, pass its
hostname, for example `example.atlassian.net`. Otherwise call
`getAccessibleAtlassianResources` and use the `id` of the right site. If there
is more than one site, ask which one.

## Tools

| Task | Tool | Required arguments |
| --- | --- | --- |
| List sites | `getAccessibleAtlassianResources` | none |
| List projects | `getVisibleJiraProjects` | `cloudId` |
| Issue types for a project | `getJiraProjectIssueTypesMetadata` | `cloudId`, `projectIdOrKey` |
| Fields for an issue type | `getJiraIssueTypeMetaWithFields` | `cloudId`, `projectIdOrKey`, `issueTypeId` |
| Search | `searchJiraIssuesUsingJql` | `cloudId`, `jql` |
| Read an issue | `getJiraIssue` | `cloudId`, `issueIdOrKey` |
| Create | `createJiraIssue` | `cloudId`, `projectKey`, `issueTypeName`, `summary` |
| Edit | `editJiraIssue` | `cloudId`, `issueIdOrKey`, `fields` |
| Available transitions | `getTransitionsForJiraIssue` | `cloudId`, `issueIdOrKey` |
| Transition | `transitionJiraIssue` | `cloudId`, `issueIdOrKey`, `transition` (`{"id": "..."}`) |
| Comment | `addCommentToJiraIssue` | `cloudId`, `issueIdOrKey`, `commentBody` |
| Find a user | `lookupJiraAccountId` | `cloudId`, `searchString` |
| Link types | `getIssueLinkTypes` | `cloudId` |
| Link issues | `createIssueLink` | `cloudId`, `inwardIssue`, `outwardIssue`, `type` |
| Log work | `addWorklogToJiraIssue` | `cloudId`, `issueIdOrKey`, `timeSpent` |

## Notes

- **Markdown works.** Description and comment tools accept
  `contentFormat: "markdown"`, so there is no need to build Atlassian Document
  Format by hand. Pass `responseContentFormat: "markdown"` to read bodies as
  Markdown.
- **Other fields on create** go in `additional_fields`, for example
  `{"priority": {"name": "High"}, "labels": ["api"]}` or
  `{"customfield_10001": "value"}`. Assignee goes in `assignee_account_id`; a
  parent for subtasks goes in `parent`.
- **Field metadata** returns only required fields by default. Pass
  `requiredFieldsOnly: false` to see optional ones.
- **Search fields.** By default search returns summary, description, status,
  type, priority, labels, components, assignee, reporter, dates, resolution,
  and project. Pass `fields` to narrow it, `"*all"` for custom fields, or
  include `"comment"` for comments.
- **Search counts.** Leave `searchResultMode` at its default. Use `"count"` only
  when the user asks how many.
- **Paging.** Search returns `nextPageToken` when there are more results; pass
  it back to get the next page.
- **Clearing a field.** In `editJiraIssue`, pass `null` for the field, for
  example `{"resolution": null}` when a reopened issue cannot transition.
- **Link direction.** For "A is blocked by B", `inwardIssue` is B and
  `outwardIssue` is A. State the direction in words before creating it.
