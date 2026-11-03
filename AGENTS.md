# Agent instructions

This repository is a plugin marketplace shared by every engineer in the
company. Claude Code and GitHub Copilot CLI both read it. Follow these rules
when adding or changing anything under `plugins/`.

## One plugin per capability

Each plugin does one thing, so people install only what they need:

- **agent:** one role agent, such as `architect`.
- **skill:** one workflow or body of know-how, such as code review.
- **integration:** a skill for one outside system, such as `jira` or `figma`.

Do not bundle unrelated agents or skills into one plugin. When an agent relies
on a skill from another plugin, list that plugin in `dependencies` in the
agent's `plugin.json` and name the skill in the agent's `## Skills` section.
The agent must still work, and say so, when the skill is not installed.

## Keep every plugin self-contained

Users install a plugin by itself, and only its folder is copied. Every link and
file path in a plugin points inside that plugin's folder. Do not link to another
plugin or to repository files such as `README.md` or `VERSIONING.md`. When a
plugin needs shared content, copy it into the plugin.

Before finishing a change, search the plugin for links that leave it:

```
grep -rnE '\]\((\.\./|/)' plugins/<path>
```

## Credentials

Integrations sign in through OAuth only: an MCP server's browser sign-in, a
CLI's web login, or an OAuth access token in an environment variable. Never use
or suggest API tokens, personal access tokens, or passwords. Never print, log,
or commit a token, and never run a login command for the user.

Skills read freely but show every change to an outside system and wait for the
user's approval before writing.

## Compatibility

- Agent files use `agents/<name>.agent.md`. Copilot CLI needs that extension;
  Claude Code accepts it.
- Do not set `tools` in agent frontmatter. The two tools name tools
  differently, so agents inherit the session's tools.
- Do not use features only one tool supports, such as hooks, unless the plugin
  says which tool it is for.

## Versions and folders

Every plugin and skill has a version and stage. New plugins start at `0.0.1` in
`plugins/in-progress/`. Any change inside a plugin bumps its version. See
`VERSIONING.md`, and run `python scripts/check_versions.py --base origin/main`
before opening a pull request.
