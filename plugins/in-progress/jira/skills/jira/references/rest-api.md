# Jira Cloud REST API with OAuth 2.0

Use this path only when neither MCP nor acli is available. It calls the Jira
REST API (version 3) with an OAuth 2.0 access token.

## Setup (done by the user, once)

1. Create an OAuth 2.0 (3LO) app in the Atlassian developer console.
2. Add the Jira API scopes it needs: `read:jira-work`, `write:jira-work`, and
   `read:jira-user`. Add `offline_access` to receive a refresh token.
3. Complete the authorization code flow to get an access token.
4. Set the token in the environment as `JIRA_ACCESS_TOKEN`. Optionally set
   `JIRA_CLOUD_ID` to skip the lookup below.

Access tokens expire after a short time. When a call returns 401, tell the
user the token has expired and needs refreshing. Do not try to run the OAuth
flow yourself, and never ask the user to paste a token into the conversation.

## Base URL

OAuth tokens do not work against `https://<site>.atlassian.net`. Every call
goes through the API gateway:

```
https://api.atlassian.com/ex/jira/<cloudId>/rest/api/3/...
```

Find the cloud ID once per session if `JIRA_CLOUD_ID` is not set:

```
curl -s -H "Authorization: Bearer $JIRA_ACCESS_TOKEN" \
  https://api.atlassian.com/oauth/token/accessible-resources
```

Each entry has `id` (the cloud ID), `url`, and `scopes`. If there is more than
one site, ask which one.

## Calling the API

Always pass the token through the environment variable so it never appears in
the command text or output:

```
BASE="https://api.atlassian.com/ex/jira/$JIRA_CLOUD_ID/rest/api/3"
curl -s -H "Authorization: Bearer $JIRA_ACCESS_TOKEN" \
  -H "Accept: application/json" \
  "$BASE/myself"
```

For `POST` and `PUT`, add `-H "Content-Type: application/json"` and pass the
body with `--data @file.json`. Write bodies to a temporary file rather than
inlining JSON in the shell, and delete it afterwards.

## Endpoints

| Task | Method and path |
| --- | --- |
| Current user | `GET /myself` |
| Projects | `GET /project/search?query=<text>` |
| Issue types for a project | `GET /issue/createmeta/<projectKey>/issuetypes` |
| Fields for an issue type | `GET /issue/createmeta/<projectKey>/issuetypes/<issueTypeId>` |
| Search | `POST /search/jql` with `{"jql": "...", "fields": [...], "maxResults": 50}` |
| Read an issue | `GET /issue/<key>?fields=summary,status,description` |
| Create | `POST /issue` |
| Edit | `PUT /issue/<key>` with `{"fields": {...}}` |
| Available transitions | `GET /issue/<key>/transitions` |
| Transition | `POST /issue/<key>/transitions` with `{"transition": {"id": "..."}}` |
| Assign | `PUT /issue/<key>/assignee` with `{"accountId": "..."}` |
| Comment | `POST /issue/<key>/comment` with `{"body": <ADF>}` |
| Find a user | `GET /user/search?query=<name or email>` |
| Link types | `GET /issueLinkType` |
| Link issues | `POST /issueLink` |

Search pages with `nextPageToken`: pass the token from one response in the
next request body until it is absent.

## Create body

```json
{
  "fields": {
    "project": { "key": "TEAM" },
    "issuetype": { "name": "Story" },
    "summary": "As a shopper, I want to save my cart so that I can finish later",
    "description": { "type": "doc", "version": 1, "content": [] },
    "labels": ["checkout"]
  }
}
```

Description and comment bodies must be Atlassian Document Format; see
[fields.md](fields.md).

## Link body

```json
{
  "type": { "name": "Blocks" },
  "inwardIssue": { "key": "TEAM-2" },
  "outwardIssue": { "key": "TEAM-1" }
}
```

This reads "TEAM-2 blocks TEAM-1". Confirm the direction in words first.

## Errors

| Status | Meaning |
| --- | --- |
| 400 | A field is missing or invalid. The body's `errors` object names the field. |
| 401 | The token is missing or expired. |
| 403 | The token lacks a scope, or the user lacks permission in Jira. |
| 404 | The issue or project does not exist, or the user cannot see it. |
| 429 | Rate limited. Wait for the `Retry-After` seconds before trying again. |
