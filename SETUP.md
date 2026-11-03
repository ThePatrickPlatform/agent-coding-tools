# Setting up your agents

Follow this once on each machine, and re-run step 3 whenever you want to pick
up changes. The setup script installs the same plugins, versions, and MCP
servers every time, for both Claude Code and GitHub Copilot CLI, so every
machine ends up configured the same way.

## 1. Install the prerequisites

| Tool | Needed for | Check |
| --- | --- | --- |
| Git | Cloning this repo | `git --version` |
| Node.js 20 or later | The setup script and plugin hooks | `node --version` |
| Claude Code | Claude agents | `claude --version` |
| GitHub Copilot CLI | Copilot agents | `copilot --version` |

You need at least one of Claude Code and Copilot CLI. The script sets up
whichever are installed.

Node.js must stay on your `PATH`. The `jira` plugin's safety check runs on it.
If Node.js is missing, Copilot CLI blocks every shell command, and Claude Code
skips the check, so your Jira site policy is **not enforced** there.

## 2. Clone this repo

```
git clone https://github.com/ThePatrickPlatform/agent-coding-tools.git
cd agent-coding-tools
```

Keep the clone on `main`. The script compares what is installed with this
checkout.

## 3. Run the setup script

Pick a profile:

| Profile | Agents | Also installs |
| --- | --- | --- |
| `product-owner` | product-owner | jira, figma |
| `designer` | ux-designer | figma |
| `engineer` | architect, software-engineer, qa-engineer | jira |
| `all` | all five | jira, figma |

Then run:

```
git pull
node setup/setup.mjs --profile engineer
```

Combine profiles with a comma, for example `--profile engineer,designer`. Add
`--tool claude` or `--tool copilot` to set up only one tool.

For each tool, the script:

1. Adds this marketplace if it is missing, and refreshes it.
2. Removes retired plugins, such as `dev-team`.
3. Installs the profile's agents and the plugins they depend on, at user scope.
   It updates any that are out of date and enables any that are disabled.
4. Adds the MCP servers those plugins need (Atlassian for `jira`, Figma for
   `figma`) unless one is already configured.

It prints every command before running it. Profiles are defined in
`setup/profiles.json`.

## 4. Sign in to the MCP servers

The script adds the servers but cannot sign in for you. Do this once per tool:

- **Claude Code:** start `claude`, run `/mcp`, choose each server marked as
  needing authentication, and finish the sign-in in your browser.
- **Copilot CLI:** start `copilot`, run `/mcp`, and sign in to each server the
  same way.

Sign in with your own account. At work, use your work account so Jira's own
permissions apply.

**Optional: the Atlassian CLI.** The `jira` skill can also use `acli`. Install
it, then run `acli jira auth login` and choose the **web browser** option.
Never choose the API token option; these plugins only use OAuth.

## 5. Set your Jira site policy

Skip this if you only use one Jira site and want full access there.

The policy decides what agents may change on each Jira site. Copy the example
into your home folder:

```
mkdir -p ~/.agent-coding-tools
cp setup/jira-policy.example.json ~/.agent-coding-tools/jira-policy.json
```

On Windows PowerShell:

```
New-Item -ItemType Directory -Force "$HOME\.agent-coding-tools"
Copy-Item setup\jira-policy.example.json "$HOME\.agent-coding-tools\jira-policy.json"
```

Edit the file. Replace each example site with the hostname from your Jira
address bar, such as `example-company.atlassian.net`, and pick a profile for each:

| Profile | Use it for | Agents can |
| --- | --- | --- |
| `full` | Your personal site | Make any change, after you approve it |
| `story-content-locked` | A site where only the product owner changes approved stories | Read, comment, link, assign, change status, log work, and create and edit Tasks. Not create stories or epics, or change their content. |
| `read-only` | Any site you only want to look at | Search and read |

Any site not in the file gets `default`, which is `read-only` in the example.
Keep the default strict, so a new site is protected until you add it.

For `story-content-locked`, `editableFields` lists the fields anyone may still
change on a story or epic. The example allows only `assignee`. Add fields your
team lets everyone change, such as `labels`.

The file stays on your machine. Do not commit it to any repo.

## 6. Check the setup

```
node setup/setup.mjs --profile engineer --check
```

`--check` changes nothing. It lists each item as `✔` (done), `!` (optional
or a warning), or `✖` (missing), and exits with an error if anything is
missing. It also checks your Jira policy for typos and leftover example
sites.

Then, in each tool:

1. Run `/agents` (Claude Code) or `/agent` (Copilot CLI) and confirm the
   profile's agents are listed.
2. Ask an agent to read something, for example: "Use the product-owner agent
   to summarize issue PROJ-123." It should say which Jira access path it is
   using.
3. On a `story-content-locked` site, ask it to change a story's summary. It
   should refuse and offer a comment or a Task instead.

## Keeping it up to date

Re-run the script whenever the marketplace changes:

```
git pull
node setup/setup.mjs --profile engineer
```

It only changes what differs, so it is safe to run as often as you like.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `✖ update jira 0.0.1 → 0.0.2` straight after setup | The clone is ahead of what the marketplace serves, usually because it is not on an up-to-date `main`. Run `git switch main` and `git pull`, then run setup again. |
| Agents don't appear | Restart the tool, or run `/reload-plugins` in Claude Code. |
| Jira or Figma tools are missing | Sign in to the MCP server (step 4). |
| Every shell command is blocked in Copilot CLI | Node.js is not on your `PATH`. Install it, or uninstall the `jira` plugin. |
| The Jira policy is ignored in Claude Code | Node.js is not on your `PATH`, so the check cannot run. Install it and restart Claude Code. |
| A Jira change you expected to work is blocked | Check the site's profile in `~/.agent-coding-tools/jira-policy.json`. The block message names the site and profile. |
| `story-content-locked` asks before editing a Task | The agent cannot tell whether the issue is a story. Approve it if it is not a story or epic. |
| `acli` changes use the wrong rules | The policy follows the site `acli` is signed in to. Run `acli jira auth status`, and `acli jira auth switch --site <site>` if needed. |
