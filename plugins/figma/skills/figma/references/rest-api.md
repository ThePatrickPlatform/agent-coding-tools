# Figma REST API with OAuth 2.0

Use this path only when the Figma MCP server is not available. The REST API
can read files, render images, and read and post comments. It cannot edit the
canvas.

## Setup (done by the user, once)

1. Create an OAuth app in Figma's developer settings and register a redirect
   URL.
2. Request only the scopes needed, for example `file_content:read`,
   `file_comments:read`, `file_comments:write`, and `current_user:read`.
3. Complete the authorization code flow in a browser to get an access token.
4. Set the token in the environment as `FIGMA_ACCESS_TOKEN`.

When a call returns 401 or 403 for an expired or invalid token, tell the user
it needs refreshing. Do not run the OAuth flow yourself, and never ask the user
to paste a token into the conversation.

## Calling the API

Base URL: `https://api.figma.com/v1`. Pass the token through the environment
variable so it never appears in the command text or output:

```
curl -s -H "Authorization: Bearer $FIGMA_ACCESS_TOKEN" \
  https://api.figma.com/v1/me
```

## Endpoints

| Task | Method and path |
| --- | --- |
| Current user | `GET /me` |
| Specific nodes | `GET /files/<fileKey>/nodes?ids=<nodeId>,<nodeId>` |
| Whole file (large; avoid) | `GET /files/<fileKey>?depth=2` |
| Render nodes as images | `GET /images/<fileKey>?ids=<nodeId>&format=png&scale=2` |
| Comments | `GET /files/<fileKey>/comments` |
| Post a comment | `POST /files/<fileKey>/comments` |

Node IDs in query strings use `:`, for example `ids=12:345`. URL-encode it as
`12%3A345` if the shell or tool requires it.

`/images` returns temporary URLs to the rendered images, not the images
themselves. Download them right away if you need them.

## Post a comment body

```json
{
  "message": "Empty state is missing for the search results list.",
  "client_meta": { "node_id": "12:345", "node_offset": { "x": 0, "y": 0 } }
}
```

Omit `client_meta` to post a comment on the whole file.

## Errors

| Status | Meaning |
| --- | --- |
| 400 | A parameter is invalid, often a malformed node ID. |
| 401 / 403 | The token is missing, expired, lacks a scope, or the user cannot see the file. |
| 404 | The file or node does not exist. |
| 429 | Rate limited. Wait for the `Retry-After` seconds before trying again. |
