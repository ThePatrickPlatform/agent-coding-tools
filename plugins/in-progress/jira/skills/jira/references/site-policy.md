# Jira site policy

A site policy limits what the agent may change on each Jira site, such as full
access on a personal site and locked story content at work. The user owns the
policy file; never create or edit it for them unless they ask.

## The policy file

`~/.agent-coding-tools/jira-policy.json`, or the path in `JIRA_POLICY_FILE`.

```json
{
  "default": "read-only",
  "sites": {
    "example-home.atlassian.net": { "profile": "full" },
    "example-company.atlassian.net": {
      "profile": "story-content-locked",
      "lockedTypes": ["Story", "Epic"],
      "editableFields": ["assignee", "labels"]
    }
  }
}
```

- Sites are keyed by hostname. Add `"cloudId": "<id>"` to an entry if a tool
  identifies the site by its cloud ID instead.
- A site that is not listed gets `default`. If `default` is missing, it is
  `read-only`.
- With no policy file, nothing is restricted.

## Profiles

| Profile | Allowed | Not allowed |
| --- | --- | --- |
| `full` | Everything | Nothing |
| `read-only` | Search and read | Any change |
| `story-content-locked` | Read; comment; link; assign; change status; log work; create and edit issues that are not locked types; change `editableFields` on any issue | Create a locked type; change other fields on a locked type; delete or archive; bulk content edits; writes through the REST API |

For `story-content-locked`, `lockedTypes` defaults to `Story` and `Epic`, and
`editableFields` defaults to `assignee`. Field names are Jira field IDs, such
as `summary`, `description`, `labels`, or `customfield_10001`.

## How to follow it

1. Before any write, read the policy file if it exists and find the profile
   for the site you are using.
2. If the change is not allowed, do not try it, and do not try a different
   access path to get around it. Tell the user it is blocked by their policy
   and offer what is allowed instead:
   - Instead of changing a story's content, draft the change as a comment
     addressed to the product owner, or as text the user can pass on.
   - Instead of creating a story or epic, create a Task linked to the right
     story, or draft the story for the product owner.
3. Before editing an issue on a `story-content-locked` site, read it and check
   its type.
4. For the MCP server, pass the site hostname as `cloudId` so the policy can
   identify the site.

## Enforcement

The plugin's hook checks every Jira MCP call and every `acli` or REST command
against the policy before it runs, in both Claude Code and Copilot CLI. It
blocks changes the policy does not allow. When it cannot tell whether an issue
is a locked type, it asks the user to confirm. It remembers issues the agent
created on each site, from standalone create calls only, so it can allow
editing them. If the hook itself fails, for example because the policy file is
malformed, it blocks the call.

It also asks before a tool touches the policy file or the hook's list of
created issues, and before `acli` switches site, so an agent does not loosen
its own limits by mistake.

### Limits

The hook catches mistakes; it is not a security boundary. Jira's own
permissions are the real authority. In particular:

- **Shell checks are best-effort.** The hook reads the command text. It blocks
  REST writes it can see and asks when a command reaches an Atlassian site in
  a way it cannot read, but it cannot see a site address hidden in a
  variable, built at run time, or kept in a script file that is written first
  and run later.
- **It only sees the agent's own tool calls,** not other programs, scripts,
  or anything you run yourself.
- **It needs Node.js.** Without it, Claude Code skips the hook and the policy
  is not enforced.

Where locked content really must not change, rely on Jira permissions as well,
for example by limiting who can edit stories and epics in the project.
