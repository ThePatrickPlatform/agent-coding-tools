# JQL

Show the query to the user before running it, so they can correct it.

## Common queries

| Request | JQL |
| --- | --- |
| My open issues | `assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC` |
| Open bugs in a project | `project = TEAM AND issuetype = Bug AND statusCategory != Done ORDER BY priority DESC` |
| Current sprint | `project = TEAM AND sprint in openSprints()` |
| Unassigned in progress | `project = TEAM AND assignee is EMPTY AND statusCategory = "In Progress"` |
| Updated this week | `project = TEAM AND updated >= startOfWeek()` |
| Created in the last 7 days | `project = TEAM AND created >= -7d` |
| Text search | `project = TEAM AND text ~ "checkout timeout"` |
| Children of an epic | `parent = TEAM-42` |
| Issues with a label | `project = TEAM AND labels = api` |
| Blocking a specific issue | `issue in linkedIssues(TEAM-10, "is blocked by")` |

## Tips

- Prefer `statusCategory` (`"To Do"`, `"In Progress"`, `Done`) over status
  names, which differ between projects.
- Quote values that contain spaces: `status = "In Review"`.
- Use `currentUser()` instead of a name for the signed-in user.
- Relative dates: `-1d`, `-2w`, `startOfDay()`, `startOfWeek()`,
  `endOfMonth()`.
- Always add `ORDER BY` so results come back in a useful order.
- Restrict searches to a project unless the user asks for all projects. Search
  without a restriction can be slow and returns a lot.
- Custom fields: `cf[10001] = value`, or the field's name in quotes.
