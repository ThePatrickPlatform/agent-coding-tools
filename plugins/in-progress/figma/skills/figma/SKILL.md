---
name: figma
description: "In progress: Read and work with Figma designs using OAuth sign-in only - inspect frames and components, get screenshots, design tokens, and design context for implementation, read and add comments, and edit the canvas when asked. Uses the Figma MCP server when connected, otherwise the Figma REST API with an OAuth access token. Use when the user shares a figma.com link, mentions Figma, or asks to review, build from, or update a design."
metadata:
  version: "0.0.1"
  lifecycle: "in-progress"
---

# Figma

Work with Figma files through one of two access paths. Both sign in with
OAuth. Never use personal access tokens or passwords, even if the user offers
one; explain that this skill is OAuth-only.

## Choose an access path

Check in this order and use the first that works. Say which one you are using.

1. **MCP.** A connected Figma MCP server exposes tools such as
   `get_design_context` and `whoami` (the client may add a prefix to the
   names). See [references/mcp.md](references/mcp.md).
2. **REST API.** `FIGMA_ACCESS_TOKEN` is set in the environment. See
   [references/rest-api.md](references/rest-api.md).

If neither works, stop and tell the user how to set one up:

- MCP: add the remote Figma MCP server (`https://mcp.figma.com/mcp`) to their
  agent and sign in through the browser when prompted.
- REST API: see the setup section of [references/rest-api.md](references/rest-api.md).

## Reading a Figma link

Links look like
`https://www.figma.com/design/<fileKey>/<name>?node-id=<nodeId>`. The file key
is the path segment after `/design/` (or `/file/`, `/board/` for FigJam). The
node ID is in `node-id` with `-` in place of `:`; convert `12-345` to `12:345`
for API calls. If a link has no `node-id`, ask which frame the user means
rather than reading the whole file.

## Rules

- **Read freely, confirm before writing.** Viewing files, frames, screenshots,
  and comments needs no approval. Before posting a comment or changing the
  canvas, show exactly what will be added or changed and wait for approval.
- **Never touch credentials.** Do not print, log, write to files, or commit
  tokens. Refer to `FIGMA_ACCESS_TOKEN` by name only.
- **Work on the node the user named.** Request the smallest node that answers
  the question. Whole files are large and slow.
- **Mind the limits.** The MCP server limits calls per day and per minute by
  seat and plan. Do not loop over many nodes without telling the user first.
- **Describe what you see accurately.** When a screenshot and the node data
  disagree, say so instead of picking one silently.

## Workflows

### Review a design against requirements

Get a screenshot and the design context of the frame. Compare it with the
user stories or acceptance criteria you were given. Report each criterion as
covered, partly covered, or missing, and list states the design does not show
(empty, loading, error, no permission).

### Build from a design

Get the design context for the frame, then its variables (design tokens) and
any Code Connect mappings. Map Figma components to existing components in the
codebase before writing new ones, and use the project's tokens rather than
hard-coded values. Check the result against a screenshot of the frame.

### Comment on a design

Read existing comments first to avoid repeating them. Draft the comment, pin
it to the relevant node when possible, confirm, then post.

### Change the canvas

Only through the MCP server's write tools, and only when the user asks. State
the file, the frame, and the change, confirm, apply it, then take a screenshot
to show the result.

### Link work to Jira

When the jira skill is available and the user asks, add the frame's link to
the Jira issue rather than copying design details into it.
