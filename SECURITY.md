# Security

This repository is shared between home and work machines and by every
engineer in the company. It must never contain credentials or connection
details: no tokens, keys, passwords, real Jira or Figma sites, cloud IDs,
account IDs, or internal hostnames. Personal settings, such as the Jira site
policy, live in your home folder, and `.gitignore` blocks common copies of
them.

## Checks on every pull request

| Check | What it does | Blocks merging |
| --- | --- | --- |
| Secret scan | Runs [gitleaks](https://github.com/gitleaks/gitleaks) over every commit in the repository and fails if it finds a secret. Findings are redacted in the log. | When required in branch protection |
| Security review | A Claude agent reviews the change against [`.github/security-review.md`](.github/security-review.md) and posts one comment with findings by severity. | No; read its comment before merging |
| GitHub secret scanning | GitHub scans pushes for known token formats, and push protection rejects a push that contains one. | Yes, at push time |

The security review reads its instructions from `main`, not from the pull
request, so a change to `.github/security-review.md` only takes effect after
it is merged. The workflow file itself still runs from the pull request
branch, so a pull request could change how the review runs or remove it.
Only people who can push branches here can do that, but read every change
under `.github/` yourself rather than relying on the review.

The review only runs on pull requests from branches in this repository; pull
requests from forks get no secrets and are not reviewed automatically. To
limit what a prompt injection could reach, the reviewer can only read the
repository and post on its own pull request, checkout does not keep the Git
token, and every action is pinned to a commit SHA.

### Set up the security review

The review needs one repository secret. Use either:

- **A Claude subscription:** run `claude setup-token`, then
  `gh secret set CLAUDE_CODE_OAUTH_TOKEN` and paste the token.
- **An Anthropic API key:** `gh secret set ANTHROPIC_API_KEY`.

Without a secret, the workflow passes with a warning and does not review.

To change what the review looks for, edit `.github/security-review.md` in its
own pull request. The change takes effect once it is merged to `main`.

## If a secret is committed

1. Revoke or rotate it with the service that issued it. Do this first;
   removing it from Git does not make it safe again.
2. Remove it from the files and commit the fix.
3. If the repository is public, or the secret was pushed, assume it has been
   copied.

## Reporting a vulnerability

Report security problems privately to the repository maintainers through
GitHub's **Report a vulnerability** button on the Security tab, not in a
public issue.
