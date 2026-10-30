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

Each plugin has its own version and stage (`in-progress`, `alpha`, `beta`, or
`release`). See [Versioning and releases](VERSIONING.md). Normal installs follow
the default branch, including work in progress.

| Plugin | Stage | Version | Description |
| --- | --- | --- | --- |
| [`dev-team`](plugins/dev-team) | in-progress | 0.0.2 | Five role agents for a software team. |
| [`jira`](plugins/jira) | in-progress | 0.0.1 | A skill for Jira Cloud issues, OAuth only. Uses the Atlassian MCP server, the Atlassian CLI (`acli`), or the REST API, whichever is available. |
| [`figma`](plugins/figma) | in-progress | 0.0.1 | A skill for Figma designs, OAuth only. Uses the Figma MCP server or the REST API, whichever is available. |

Install `jira` and `figma` the same way as `dev-team`, replacing the plugin
name. Unlike agents, skills install through the plugin in all three tools, so
Codex needs no manual copy step.

## Shared skills

Skills live in their own plugins so any agent, or you directly, can use them.
Each agent's instructions name the skills it uses and what it uses them for:

| Agent | jira | figma |
| --- | --- | --- |
| `product-owner` | Read the backlog; create epics and stories | Review designs against stories; comment |
| `ux-designer` | | Read designs and tokens; comment; edit frames |
| `software-engineer` | Read issues; update status; comment with PR links | |

To give an agent a skill, add it to that agent's Skills section, then
regenerate the Codex agents.

In Claude Code, installing `dev-team` also installs `jira` and `figma`. In
Copilot CLI and Codex, install them separately.

This is guidance, not a lock. None of the three tools can limit a skill to
specific agents, so any agent can still use any installed skill if asked.

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

### figma skill

The skill only signs in through OAuth. It never uses personal access tokens.
Set up at least one of these:

- **MCP:** add the remote Figma MCP server, `https://mcp.figma.com/mcp`, and
  sign in through the browser. In Claude Code:
  `claude mcp add --transport http figma https://mcp.figma.com/mcp`, then
  `/mcp` to authenticate. In Codex:
  `codex mcp add figma --url https://mcp.figma.com/mcp`.
- **REST API:** register an OAuth app with Figma and export its access token
  as `FIGMA_ACCESS_TOKEN`. This path can read and comment but cannot edit the
  canvas. See `plugins/figma/skills/figma/references/rest-api.md`.

Editing the canvas needs a Full seat, and the MCP server limits calls by seat
and plan. The skill reads without asking, but shows every comment or change and
waits for your approval.

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
scripts/build_codex_agents.py       (generates the Codex agents)
scripts/check_versions.py           (checks versions and stages)
VERSIONING.md                       (versioning and release process)
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
