# Atlassian CLI (acli)

Atlassian's official CLI. The user signs in with:

```
acli jira auth login
```

When it asks how to authenticate, choose the web browser (OAuth) option, not
the API token option. The browser opens to pick a site and approve access;
then pick the same site in the terminal. `acli jira auth login --web` goes
straight to the browser step.

The user must run the login, because it prompts in the terminal and the agent
cannot answer. In Claude Code they can type `! acli jira auth login` so it runs
in the session. Never use the `--token` form or the API token option, which
sign in with an API token.

Check the session before starting:

```
acli jira auth status
```

Other auth commands: `acli jira auth switch --site <site>` to change site, and
`acli jira auth logout`.

## Output

Add `--json` to read results in a structured form. Prefer it whenever you need
to parse output.

## Commands

### Projects

```
acli jira project list --json
acli jira project list --recent --json
acli jira project view --key TEAM --json
```

### Search

```
acli jira workitem search --jql "project = TEAM AND status != Done" --limit 50 --json
acli jira workitem search --jql "..." --count
acli jira workitem search --jql "..." --paginate --json
```

`--fields` takes a comma-separated list. The default is
`issuetype,key,assignee,priority,status,summary`.

### Read

```
acli jira workitem view TEAM-123 --json
acli jira workitem view TEAM-123 --fields "summary,status,description,comment" --json
```

`--fields` accepts `*all` and `*navigable`, and a `-` prefix excludes a field.

### Create

```
acli jira workitem create --project TEAM --type Story --summary "..." --description-file desc.md --json
```

Other flags: `--assignee` (email, account ID, `@me`, or `default`), `--label`
(comma-separated), `--parent` (parent key). For fields that have no flag, run
`acli jira workitem create --generate-json` to get a template, fill it in, and
pass it with `--from-json <file>`.

Write long descriptions to a temporary file and pass `--description-file`
rather than quoting them on the command line. Delete the file afterwards.

### Edit and assign

```
acli jira workitem edit --key TEAM-123 --summary "..." --yes --json
acli jira workitem edit --key TEAM-123 --description-file desc.md --yes --json
acli jira workitem edit --key TEAM-123 --labels "api,backend" --yes
acli jira workitem assign --key TEAM-123 --assignee "@me" --yes
acli jira workitem assign --key TEAM-123 --remove-assignee --yes
```

`--yes` skips acli's own prompt. Only pass it after the user has approved the
change in the conversation, because the agent cannot answer the prompt.

`edit`, `assign`, `transition`, and `comment create` also accept `--jql` or
`--filter` to act on many issues. Do not use those forms unless the user has
seen and approved the exact list of keys the query matches.

### Transition

```
acli jira workitem transition --key TEAM-123 --status "In Progress" --yes
```

The CLI takes a status name. If it fails, the status is probably not reachable
from the current one; report that to the user.

### Comment

```
acli jira workitem comment create --key TEAM-123 --body-file comment.md
acli jira workitem comment list --key TEAM-123 --json
```

### Links

```
acli jira workitem link type
acli jira workitem link list --key TEAM-123
```

Run `acli jira workitem link create --help` for the create flags before using
it, and confirm the link direction with the user.

### Boards and sprints

```
acli jira board search --project TEAM --json
acli jira board list-sprints --id <board-id> --state active --json
acli jira sprint list-workitems --board <board-id> --sprint <sprint-id> --json
```

## When a flag is unclear

Run the command with `--help`. The CLI changes between releases; trust its help
output over this file.
