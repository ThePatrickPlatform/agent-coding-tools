# Figma MCP server

The remote Figma MCP server is at `https://mcp.figma.com/mcp`. The user signs
in with their Figma account in the browser the first time they connect, and
the server acts with that account's access.

Tool names below are as Figma publishes them; the agent may show them with a
prefix. Figma adds and changes tools, so if a call is rejected, re-read the
tool's schema. Most tools take the file key and node ID from the link; see
"Reading a Figma link" in SKILL.md.

## Read tools

| Task | Tool |
| --- | --- |
| Check who is signed in | `whoami` |
| Design context for implementing a frame (the main tool) | `get_design_context` |
| Image of a node | `get_screenshot` |
| Layer structure: IDs, names, types, positions, sizes | `get_metadata` |
| Variables and styles (design tokens) used by a node | `get_variable_defs` |
| Code Connect mappings from Figma components to code | `get_code_connect_map` |
| Search the design system's components and styles | `search_design_system` |
| Libraries available to the file | `get_libraries` |
| FigJam board content | `get_figjam` |
| Download images and other assets | `download_assets` |

For a large frame, call `get_metadata` first to find the child nodes you
need, then call `get_design_context` on those, rather than on the whole frame.

## Write tools

Use these only when the user asks for a change, after confirming it.

| Task | Tool |
| --- | --- |
| Create, edit, and inspect content in a file | `use_figma` |
| Create a new file | `create_new_file` |
| Turn a web page or HTML into Figma layers | `html_to_figma` |
| Generate a diagram in FigJam | `generate_diagram` |
| Upload images or other assets | `upload_assets` |
| Add a Code Connect mapping | `add_code_connect_map` |

Writing outside the user's drafts needs a Full seat. Figma has said canvas
writes are free during a beta period and will later be paid by usage, so do not
make speculative edits.

Some tools, such as `generate_image`, use Figma AI credits. Ask before using
them.

## Limits

Calls are limited per day and per minute depending on seat and plan, and View
or Collab seats get only a few calls a month. If a call is rejected for rate
limits, stop and tell the user rather than retrying in a loop.
