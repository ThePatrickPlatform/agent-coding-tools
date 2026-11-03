# Contributing a plugin

Anyone in the company can add a plugin. Read [AGENTS.md](AGENTS.md) for the
rules first; this page is the step-by-step.

## 1. Create the folder

New plugins start in progress:

```
plugins/in-progress/<name>/
  .claude-plugin/plugin.json
  agents/<name>.agent.md        (agent plugins)
  skills/<name>/SKILL.md        (skill and integration plugins)
  skills/<name>/references/     (optional supporting files)
```

Use a short, lowercase, hyphenated name that says what it does, such as
`code-review` or `confluence`. The name is what people type to install it.

## 2. Write the manifest

`plugins/in-progress/<name>/.claude-plugin/plugin.json`:

```json
{
  "name": "<name>",
  "version": "0.0.1",
  "description": "In progress: <what it does, in one sentence>.",
  "author": { "name": "<your name or team>" },
  "license": "MIT"
}
```

Add `"dependencies": ["jira"]` when an agent relies on another plugin's skill.

## 3. Write the agent or skill

An agent, `agents/<name>.agent.md`:

```markdown
---
name: <name>
description: <role>. Use to <when to pick this agent>.
---

You are the <role>. <one line on what you own>.

## What you do
## How you work
## Skills
## Output
```

A skill, `skills/<name>/SKILL.md`:

```markdown
---
name: <name>
description: "In progress: <what it does and when to use it>."
metadata:
  version: "0.0.1"
  lifecycle: "in-progress"
---

<instructions>
```

The description is how the agent decides to use the skill, so say when it
applies, not only what it does.

## 4. Add it to the marketplace

Add an entry to `.claude-plugin/marketplace.json`. The `description` must
match `plugin.json` exactly. `category` is `agent`, `skill`, or
`integration`.

```json
{
  "name": "<name>",
  "source": "./plugins/in-progress/<name>",
  "category": "skill",
  "description": "In progress: <same as plugin.json>."
}
```

Then add a row to the plugin table in [README.md](README.md).

Add it to `setup/profiles.json` so the setup script installs it:

- **Agent:** add its name to each profile it belongs in. Its dependencies are
  installed automatically, so do not list them.
- **Integration that needs an MCP server:** add an entry under `mcpServers`
  keyed by the plugin name, with the server's `name`, `url`, and a `match`
  string that identifies it in a tool's server list.
- **Removing or renaming a plugin:** add the old name to `retired`, so setup
  uninstalls it from everyone's machine.

## 5. Check and try it

```
python scripts/check_versions.py --base origin/main
claude plugin validate .
claude --plugin-dir plugins/in-progress/<name>
```

The last command runs Claude Code with your plugin loaded, without installing
it. Open a pull request when it works. Each later change to the plugin bumps
its version; see [VERSIONING.md](VERSIONING.md).
