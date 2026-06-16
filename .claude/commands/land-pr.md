---
description: Merge a reviewed, mergeable PR into main, then sync and validate main locally.
argument-hint: <PR number> [extra constraints]
allowed-tools: Bash, mcp__github__pull_request_read, mcp__github__merge_pull_request
---

You are landing an already-reviewed pull request. Arguments: `$ARGUMENTS`

## Input guard (do this FIRST)

Parse a PR number from the arguments. If you cannot find a clear PR number, OR
the arguments describe something other than merging/landing a PR (e.g. creating
an issue, opening a PR, starting feature work):

- STOP. Do not invent an issue title, labels, assignees, or any other fields.
- Do not split free-form text on `:` or `/` to manufacture parameters.
- Report what you think was intended and ask the user to confirm before acting.

Honor any "do not touch" constraints passed in the arguments verbatim.

## Steps

1. Confirm mergeability with `mcp__github__pull_request_read` (method `get`):
   check `state: open`, `merged: false`, and `mergeable_state` is `clean`
   (or otherwise mergeable). If not mergeable, stop and report why.
2. Merge with `mcp__github__merge_pull_request` using **squash** — the repo's
   established method (PRs land on `main` as single squashed commits). Use a
   commit title of the form `<PR title> (#<number>)`.
3. Verify the merge with `pull_request_read` (`get`): confirm `merged: true`
   and capture the squash `merge commit hash`.
4. Sync local main:
   - `git checkout main`
   - `git pull origin main`
5. Validate main (run all three, report real output — do not claim success
   without it):
   - `npm run build:all`
   - `npm run typecheck`
   - `npm test`

## Report (only this)

- merge method used
- PR merged yes/no
- merge commit hash
- main latest commit hash
- validation result on main (build / typecheck / test counts)
- next productive step

## Notes

- Do NOT push to `main` directly; merging the PR is the only thing that updates `main`.
- `gh` CLI is unavailable in this environment — use the `mcp__github__*` tools.
- This command supersedes routing merges through `mcp__github__issue_to_fix_workflow`,
  which is for creating an issue and handing it to Copilot — not for merging a PR.
