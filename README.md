# agent-coding-tools

A plugin marketplace for Claude Code and GitHub Copilot CLI. Both tools read the
same files in this repo.

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

## Plugins

Each plugin has its own version and stage (`in-progress`, `alpha`, `beta`, or
`release`). In-progress plugins live in `plugins/in-progress/` and move up to
`plugins/` when promoted. See [Versioning and releases](VERSIONING.md). Normal installs follow
the default branch, including work in progress.

| Plugin | Stage | Version | Description |
| --- | --- | --- | --- |
| [`dev-team`](plugins/in-progress/dev-team) | in-progress | 0.0.2 | Five role agents for a software team. |
| [`jira`](plugins/in-progress/jira) | in-progress | 0.0.1 | A skill for Jira Cloud issues, OAuth only. Uses the Atlassian MCP server, the Atlassian CLI (`acli`), or the REST API, whichever is available. |
| [`figma`](plugins/in-progress/figma) | in-progress | 0.0.1 | A skill for Figma designs, OAuth only. Uses the Figma MCP server or the REST API, whichever is available. |

Install `jira` and `figma` the same way as `dev-team`, replacing the plugin
name.

## Shared skills

Skills live in their own plugins so any agent, or you directly, can use them.
Each agent's instructions name the skills it uses and what it uses them for:

| Agent | jira | figma |
| --- | --- | --- |
| `product-owner` | Read the backlog; create epics and stories | Review designs against stories; comment |
| `ux-designer` | | Read designs and tokens; comment; edit frames |
| `software-engineer` | Read issues; update status; comment with PR links | |

To give an agent a skill, add it to that agent's Skills section.

In Claude Code, installing `dev-team` also installs `jira` and `figma`. In
Copilot CLI, install them separately.

This is guidance, not a lock. Neither tool can limit a skill to specific
agents, so any agent can still use any installed skill if asked.

### jira skill

The skill only signs in through OAuth. It never uses API tokens or passwords.
Set up at least one of these:

- **MCP:** connect the Atlassian MCP server in your agent and sign in through
  the browser.
- **CLI:** install `acli`, run `acli jira auth login`, and choose the web
  browser (OAuth) option.
- **REST API:** register an OAuth 2.0 (3LO) app with Atlassian and export its
  access token as `JIRA_ACCESS_TOKEN`. See
  `plugins/in-progress/jira/skills/jira/references/rest-api.md`.

It searches and reads without asking, but shows every change and waits for
your approval before writing to Jira.

### figma skill

The skill only signs in through OAuth. It never uses personal access tokens.
Set up at least one of these:

- **MCP:** add the remote Figma MCP server, `https://mcp.figma.com/mcp`, and
  sign in through the browser. In Claude Code:
  `claude mcp add --transport http figma https://mcp.figma.com/mcp`, then
  `/mcp` to authenticate.
- **REST API:** register an OAuth app with Figma and export its access token
  as `FIGMA_ACCESS_TOKEN`. This path can read and comment but cannot edit the
  canvas. See `plugins/in-progress/figma/skills/figma/references/rest-api.md`.

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
plugins/
  in-progress/                      (plugins still taking shape)
    <plugin-name>/
  <plugin-name>/                    (graduated: alpha, beta, release)
    .claude-plugin/plugin.json      (manifest)
    agents/<name>.agent.md          (agents, if the plugin has any)
    skills/<name>/SKILL.md          (skills, if the plugin has any)
scripts/check_versions.py           (checks versions and stages)
VERSIONING.md                       (versioning and release process)
```

Agent files use the `.agent.md` extension, which Copilot CLI requires and Claude
Code accepts. They set no `tools` list, because each tool names its tools
differently; each agent inherits the tools available in the session.
