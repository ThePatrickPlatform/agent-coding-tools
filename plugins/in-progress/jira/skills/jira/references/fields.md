# Fields and Atlassian Document Format

## Field values

| Field | Value shape |
| --- | --- |
| `summary` | string |
| `issuetype` | `{"name": "Story"}` or `{"id": "10001"}` |
| `project` | `{"key": "TEAM"}` |
| `priority` | `{"name": "High"}` |
| `labels` | `["api", "backend"]` (no spaces inside a label) |
| `components` | `[{"name": "Backend"}]` |
| `fixVersions` | `[{"name": "1.2"}]` |
| `assignee` | `{"accountId": "..."}` |
| `parent` | `{"key": "TEAM-42"}` (epic or parent of a subtask) |
| `duedate` | `"2026-11-30"` |
| custom fields | `customfield_<id>`; the shape depends on the field type. Read it from the field metadata. |

Look up a project's required and custom fields before creating an issue. They
vary between projects and issue types.

## Atlassian Document Format (ADF)

Descriptions and comments are stored as ADF, a JSON document. The MCP tools
accept Markdown and convert it, and acli accepts plain text, so build ADF only
for the REST API.

```json
{
  "type": "doc",
  "version": 1,
  "content": [
    {
      "type": "heading",
      "attrs": { "level": 3 },
      "content": [{ "type": "text", "text": "Acceptance criteria" }]
    },
    {
      "type": "bulletList",
      "content": [
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                { "type": "text", "text": "Given a saved cart, " },
                { "type": "text", "text": "when", "marks": [{ "type": "strong" }] },
                { "type": "text", "text": " I return, then my items are still there." }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "codeBlock",
      "attrs": { "language": "json" },
      "content": [{ "type": "text", "text": "{\"ok\": true}" }]
    }
  ]
}
```

Rules:

- Text lives in `text` nodes inside a `paragraph`, `heading`, or other block.
  A `listItem` holds blocks, not text directly.
- Formatting uses `marks`: `strong`, `em`, `code`, `strike`, and
  `{"type": "link", "attrs": {"href": "..."}}`.
- Other blocks: `orderedList`, `blockquote`, `rule`, and `table` with
  `tableRow`, `tableHeader`, and `tableCell`.
- Text nodes cannot be empty. Omit them instead.
