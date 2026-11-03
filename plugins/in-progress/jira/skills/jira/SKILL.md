---
name: jira
description: "In progress: Work with Jira Cloud issues using OAuth only - search with JQL, read, create, edit, transition, assign, comment, and link issues. Uses the Atlassian MCP server when connected, otherwise the Atlassian CLI (acli), otherwise the Jira REST API with an OAuth access token. Use when the user mentions Jira, an issue key such as PROJ-123, JQL, or wants stories, bugs, or tasks created or updated in Jira."
metadata:
  version: "0.0.1"
  lifecycle: "in-progress"
---

# Jira

Work with Jira Cloud through one of three access paths. Every path
authenticates with OAuth. Never use API tokens, basic auth, or passwords, even
if the user offers one; explain that this skill is OAuth-only.

## Choose an access path

Check in this order and use the first that works. Say which one you are using.

1. **MCP.** A connected Atlassian MCP server exposes tools such as
   `searchJiraIssuesUsingJql` and `getAccessibleAtlassianResources` (the client
   may add a prefix to the names). See [references/mcp.md](references/mcp.md).
2. **CLI.** `acli jira auth status` reports a logged-in account. See
   [references/cli.md](references/cli.md).
3. **REST API.** `JIRA_ACCESS_TOKEN` is set in the environment. See
   [references/rest-api.md](references/rest-api.md).

If none works, stop and tell the user how to set one up:

- MCP: connect the Atlassian MCP server in their agent and complete the OAuth
  sign-in in the browser.
- CLI: install `acli`, run `acli jira auth login` themselves, and choose the
  web browser (OAuth) option, not the API token option. It prompts in the
  terminal, so do not run it for them.
- REST API: see the setup section of [references/rest-api.md](references/rest-api.md).

## Rules

- **Read freely, confirm before writing.** Searching and viewing need no
  approval. Before creating, editing, transitioning, assigning, commenting,
  linking, or deleting, show the user exactly what will be sent (issue keys,
  fields, and text) and wait for approval. One approval covers one stated
  change, not later ones.
- **Never touch credentials.** Do not print, log, write to files, or commit
  tokens. Refer to `JIRA_ACCESS_TOKEN` by name only.
- **Discover before you create.** Issue types, required fields, and workflow
  statuses differ between projects. Look them up instead of guessing.
- **Transition by what the workflow allows.** Fetch the available transitions
  for the issue and use one of them. If the requested status is not reachable
  directly, tell the user rather than chaining transitions on your own.
- **Resolve people to account IDs.** Jira Cloud identifies users by account ID.
  Look the person up; if several match, ask which one.
- **Stay in scope.** Only the issues the user named or the JQL they approved.
  Bulk changes need the user to see the full list of affected keys first.
- **Report what happened.** After a write, give the issue key and its URL
  (`https://<site>.atlassian.net/browse/<KEY>`). If a call fails, show the
  error and do not retry with different fields without saying so.

## Workflows

### Find issues

Translate the request into JQL ([references/jql.md](references/jql.md)), show
the query, run it, and summarize the results as a table of key, summary,
status, and assignee. Page through results only when the user needs more than
the first page.

### Create an issue

1. Confirm the project key. If unknown, list visible projects and ask.
2. Look up the project's issue types and the required fields for the chosen
   type.
3. Draft summary, description, and any required fields. Write descriptions in
   Markdown when the path supports it; otherwise see
   [references/fields.md](references/fields.md) for Atlassian Document Format.
4. Show the draft, get approval, create it, and report the key and URL.

For a user story, use "As a <user>, I want <capability> so that <outcome>" as
the summary or opening line, and put acceptance criteria in the description as
a Given / When / Then list.

### Create several issues

Show all drafts together as a numbered list, get one approval for the list,
then create them in order. Stop at the first failure and report which were
created.

### Update, assign, or comment

Read the issue first so the change is based on its current state. Show the
before and after for each field you change.

### Move an issue to a status

Get the issue's available transitions, pick the one leading to the requested
status, confirm, and apply it. If the transition requires fields such as
resolution, include them.

### Link issues

Get the available link types, then confirm the direction in words, for
example "PROJ-2 blocks PROJ-1", before creating the link.
