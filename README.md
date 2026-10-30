# agent-coding-tools

A plugin marketplace for Claude Code, GitHub Copilot CLI, and OpenAI Codex.

## Install

Claude Code:

```
/plugin install dev-team --marketplace ThePatrickPlatform/agent-coding-tools
```

GitHub Copilot CLI:

```
copilot plugin marketplace add ThePatrickPlatform/agent-coding-tools
copilot plugin install dev-team@agent-coding-tools
```

Codex:

```
codex plugin marketplace add ThePatrickPlatform/agent-coding-tools
```

Codex plugins cannot ship agents, so copy the agent files yourself. For one
project, copy `plugins/dev-team/codex/agents/*.toml` into that project's
`.codex/agents/`. For every project, copy them into `~/.codex/agents/`.

## Plugins

| Plugin | Description |
| --- | --- |
| [`dev-team`](plugins/dev-team) | Five role agents for a software team. |
| [`jira`](plugins/jira) | A skill for Jira Cloud issues, OAuth only. Uses the Atlassian MCP server, the Atlassian CLI (`acli`), or the REST API, whichever is available. |

Install `jira` the same way as `dev-team`, replacing the plugin name. Unlike
agents, skills install through the plugin in all three tools, so Codex needs no
manual copy step.

### jira skill

The skill only signs in through OAuth. It never uses API tokens or passwords.
Set up at least one of these:

- **MCP:** connect the Atlassian MCP server in your agent and sign in through
  the browser.
- **CLI:** install `acli`, run `acli jira auth login`, and choose the web
  browser (OAuth) option.
- **REST API:** register an OAuth 2.0 (3LO) app with Atlassian and export its
  access token as `JIRA_ACCESS_TOKEN`. See
  `plugins/jira/skills/jira/references/rest-api.md`.

It searches and reads without asking, but shows every change and waits for
your approval before writing to Jira.

### dev-team agents

| Agent | Use it to |
| --- | --- |
| `product-owner` | Turn an idea into a problem statement, user stories with acceptance criteria, and a prioritized scope. |
| `ux-designer` | Design flows, screens, interaction states, and copy, or review an interface for usability and accessibility. |
| `architect` | Decide structure, boundaries, data model, and technology, with trade-offs and implementation steps. |
| `software-engineer` | Implement features, fix bugs, and refactor, following existing conventions. |
| `qa-engineer` | Write test plans, find edge cases, verify changes, and write bug reports. |

## Layout

```
.claude-plugin/marketplace.json     (catalog for Claude Code and Copilot CLI)
.agents/plugins/marketplace.json    (catalog for Codex)
plugins/
  <plugin-name>/
    .claude-plugin/plugin.json      (manifest for Claude Code and Copilot CLI)
    .codex-plugin/plugin.json       (manifest for Codex)
    agents/<name>.agent.md          (agents for Claude Code and Copilot CLI)
    codex/agents/<name>.toml        (generated agents for Codex)
scripts/build_codex_agents.py
```

Agent files use the `.agent.md` extension, which Copilot CLI requires and Claude
Code accepts. They set no `tools` list, because each tool names its tools
differently; each agent inherits the tools available in the session.

The `.agent.md` files are the source. After editing one, regenerate the Codex
agents and commit both:

```
python scripts/build_codex_agents.py
```

`python scripts/build_codex_agents.py --check` exits non-zero if the Codex
agents are out of date. When adding a plugin, list it in both catalogs.
