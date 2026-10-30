# Versioning and releases

Each plugin is versioned on its own, and so is each skill inside a plugin.
There is no repository-wide version. Version numbers and stages live in the
files that ship, so nothing else needs to be kept in sync.

## Stages

Every plugin and skill is in exactly one stage:

| Stage | Meaning | Versions | Description prefix |
| --- | --- | --- | --- |
| `in-progress` | Still being shaped; no compatibility promise. | `0.0.x`, starting at `0.0.1` | `In progress: ` |
| `alpha` | Ready for deliberate early trials; significant changes expected. | `0.y.z`, `y` at least 1 | `Alpha: ` |
| `beta` | Scope and contracts defined; broader validation remains. | `0.y.z`, `y` at least 1 | `Beta: ` |
| `release` | Reviewed for general use against its documented contract. | `1.0.0` and up, SemVer | none |

Versions are `MAJOR.MINOR.PATCH` with no leading zeros.

Only an explicit maintainer decision promotes something to a later stage.
Passing checks, time passing, or a merged PR never does. Changing stage also
requires a higher version, for example `0.0.4` in-progress to `0.1.0` alpha, then
`0.2.0` beta, then `1.0.0` release.

## Folders

The folder shows whether a plugin is still in progress:

```
plugins/in-progress/<name>/   in-progress plugins
plugins/<name>/               graduated: alpha, beta, and release
```

New plugins start in `plugins/in-progress/`. When a maintainer promotes one to
alpha, move its folder up to `plugins/`, update its `source` in
`.claude-plugin/marketplace.json`, and bump the version and stage in the same
PR. Moving the folder does not break installs, because users install by plugin
name and the marketplace maps names to folders. Links to files inside the
plugin do change, so update them too.

The metadata gives the exact stage; the folder only separates in-progress from
graduated. `check_versions.py` fails if the two disagree.

## Where versions and stages are recorded

**Plugins.** Plugin manifests have no stage field, so the stage is the prefix of
the plugin's description.

- `version` and `description` in the plugin's `.claude-plugin/plugin.json`
- The same `description` in the plugin's entry in `.claude-plugin/marketplace.json`

**Skills.** In the `SKILL.md` frontmatter, with the same prefix on the
description:

```yaml
---
name: jira
description: "In progress: Work with Jira Cloud issues..."
metadata:
  version: "0.0.1"
  lifecycle: "in-progress"
---
```

**Agents** carry no version of their own. They are versioned by their plugin.

## Choosing the next version

- **`in-progress`:** bump the patch number for each merged change.
- **`alpha` and `beta`:** bump minor for breaking changes or new capabilities,
  patch for compatible fixes.
- **`release`:** bump major for breaking changes, minor for compatible new
  capabilities, patch for compatible fixes. Reset lower numbers when bumping a
  higher one.

What counts as breaking: a change to what the plugin or skill accepts, what it
produces, the tools or setup it needs, or the names users invoke. Different
model wording in the output is not breaking.

Any change inside a plugin's folder bumps that plugin's version. A change
inside a skill's folder also bumps that skill's version. Changes outside
`plugins/`, such as this file or the README, bump nothing. Several commits in
one PR share one bump; before merging, recheck against `main` so two PRs do not
claim the same version.

## Checks

```
python scripts/check_versions.py
python scripts/check_versions.py --base origin/main
```

`check_versions.py` checks that versions are valid and fit the stage, and that
descriptions carry the right prefix and match the marketplace. With `--base`,
it also fails if a plugin or skill changed since that ref without a version
bump. The `Checks` workflow runs both on every pull request.

## Releasing a version

The default branch is development work. Releasing is a separate, deliberate
step:

1. In a PR, review the plugin's contents, stage, and version. Record changes,
   breaking changes with migration steps, and known limitations in the PR.
2. Run the checks, then install the plugin from your branch in Claude Code,
   Copilot CLI and try it.
3. After merging, create an annotated tag on the tested commit named
   `plugin-<name>-v<version>`, for example `plugin-jira-v0.1.0`.
4. Create a GitHub Release for the tag with the stage, changes, limitations, and
   install command. Mark it as a pre-release unless the stage is `release`.
   Never mark a single plugin's release as the repository's latest.
5. Never move or reuse a published tag. Fix mistakes with a new version.

A tag snapshots the whole repository, but only the named plugin is being
released. Other plugins at that commit are not promoted.

## Installing a fixed version

Normal installs follow the default branch, including work in progress. To pin
a released version, add the marketplace at its tag, for example
`plugin-jira-v0.1.0`, instead of the default branch. Check Claude Code's and
Copilot CLI's marketplace documentation for how to add a marketplace at a Git
ref. The tag in this example is illustrative until it is actually published.
