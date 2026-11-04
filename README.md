# agent-coding-tools

The company's plugin marketplace for Claude Code and GitHub Copilot CLI. Both
tools read the same files in this repo. Each plugin does one thing, so install
only what you need.

## Install

Follow [SETUP.md](SETUP.md). It walks through prerequisites, sign-in, and the
Jira site policy, and its script installs a profile of agents the same way on
every machine:

```
node setup/setup.mjs --profile engineer
```

To install a single plugin by hand instead, in Claude Code:

```
/plugin marketplace add ThePatrickPlatform/agent-coding-tools
/plugin install <plugin>@agent-coding-tools
```

GitHub Copilot CLI:

```
copilot plugin marketplace add ThePatrickPlatform/agent-coding-tools
copilot plugin install <plugin>@agent-coding-tools
```

In Claude Code, installing an agent also installs the plugins it depends on.
In Copilot CLI, install them yourself.

## Plugins

Each plugin has its own version and stage (`in-progress`, `alpha`, `beta`, or
`release`). See [Versioning and releases](VERSIONING.md). Normal installs follow
the default branch, including work in progress.

### Agents

| Plugin | Stage | Version | Uses | Use it to |
| --- | --- | --- | --- | --- |
| [`product-owner`](plugins/in-progress/product-owner) | in-progress | 0.0.3 | jira, figma | Turn an idea into a problem statement, user stories with acceptance criteria, and a prioritized scope. |
| [`ux-designer`](plugins/in-progress/ux-designer) | in-progress | 0.0.2 | figma | Design flows, screens, interaction states, and copy, or review an interface for usability and accessibility. |
| [`architect`](plugins/in-progress/architect) | in-progress | 0.0.2 | | Decide structure, boundaries, data model, and technology, with trade-offs and implementation steps. |
| [`software-engineer`](plugins/in-progress/software-engineer) | in-progress | 0.0.2 | jira | Implement features, fix bugs, and refactor, following existing conventions. |
| [`qa-engineer`](plugins/in-progress/qa-engineer) | in-progress | 0.0.2 | | Write test plans, find edge cases, verify changes, and write bug reports. |

### Skills

None yet. See [Contributing](CONTRIBUTING.md) to add one.

### Integrations

| Plugin | Stage | Version | Description |
| --- | --- | --- | --- |
| [`jira`](plugins/in-progress/jira) | in-progress | 0.0.3 | Jira Cloud issues, OAuth only. Uses the Atlassian MCP server, the Atlassian CLI (`acli`), or the REST API, whichever is available. |
| [`figma`](plugins/in-progress/figma) | in-progress | 0.0.1 | Figma designs, OAuth only. Uses the Figma MCP server or the REST API, whichever is available. |

## How agents use skills

Each agent's instructions name the skills it uses and what for:

| Agent | jira | figma |
| --- | --- | --- |
| `product-owner` | Read the backlog; create epics and stories | Review designs against stories; comment |
| `ux-designer` | | Read designs and tokens; comment; edit frames |
| `software-engineer` | Read issues; update status; comment with PR links | |

This is guidance, not a lock. Neither tool can limit a skill to specific
agents, so any agent can use any installed skill if asked.

## Integration setup

Integrations sign in through OAuth only. They never use API tokens, personal
access tokens, or passwords. They read without asking, but show every change
and wait for your approval before writing.

### jira

Set up at least one of these:

- **MCP:** connect the Atlassian MCP server in your agent and sign in through
  the browser.
- **CLI:** install `acli`, run `acli jira auth login`, and choose the web
  browser (OAuth) option.
- **REST API:** register an OAuth 2.0 (3LO) app with Atlassian and export its
  access token as `JIRA_ACCESS_TOKEN`. See
  `plugins/in-progress/jira/skills/jira/references/rest-api.md`.

#### Limit what it can change on each site

To set different rules for different Jira sites, create
`~/.agent-coding-tools/jira-policy.json`. For example, give your personal site
full access and lock story content at work:

```json
{
  "default": "read-only",
  "sites": {
    "example-home.atlassian.net": { "profile": "full" },
    "example-company.atlassian.net": {
      "profile": "story-content-locked",
      "lockedTypes": ["Story", "Epic"],
      "editableFields": ["assignee"]
    }
  }
}
```

On a `story-content-locked` site, agents can read, comment, link, assign,
change status, and create and edit Tasks. They cannot create stories or epics
or change their content; they draft those changes for the product owner
instead. Unlisted sites get `default`. Without the file, nothing is limited.

A hook in the plugin enforces the policy in both Claude Code and Copilot CLI,
so a blocked change is stopped even if the agent tries it. It needs Node.js
on your `PATH`. Profiles and options are in
`plugins/in-progress/jira/skills/jira/references/site-policy.md`.

### figma

Set up at least one of these:

- **MCP:** add the remote Figma MCP server, `https://mcp.figma.com/mcp`, and
  sign in through the browser. In Claude Code:
  `claude mcp add --transport http figma https://mcp.figma.com/mcp`, then
  `/mcp` to authenticate.
- **REST API:** register an OAuth app with Figma and export its access token
  as `FIGMA_ACCESS_TOKEN`. This path can read and comment but cannot edit the
  canvas. See `plugins/in-progress/figma/skills/figma/references/rest-api.md`.

Editing the canvas needs a Full seat, and the MCP server limits calls by seat
and plan.

## Layout

```
.claude-plugin/marketplace.json     catalog for Claude Code and Copilot CLI
plugins/
  in-progress/<name>/               plugins still taking shape
  <name>/                           graduated: alpha, beta, release
    .claude-plugin/plugin.json      manifest
    agents/<name>.agent.md          agent plugins
    skills/<name>/SKILL.md          skill and integration plugins
scripts/check_versions.py           checks versions, stages, and the catalog
setup/setup.mjs                     installs and checks a profile on a machine
setup/profiles.json                 profiles, MCP servers, retired plugins
setup/jira-policy.example.json      starting point for a Jira site policy
AGENTS.md                           rules for plugins in this repo
CONTRIBUTING.md                     how to add a plugin
SETUP.md                            how to set up a machine
VERSIONING.md                       versioning and release process
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
