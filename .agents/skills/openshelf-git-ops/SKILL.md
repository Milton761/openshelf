# openshelf-git-ops

## Purpose
Run a safe Git handoff workflow from chat: validate repo state, optionally stash, add, commit, and push.

## Use this skill when
- You want chat to finish code changes with Git operations.
- You need consistent commit quality and safer pushes.
- You want fewer manual terminal steps.

## Constraints
- Never force-push unless user explicitly requests it.
- Never commit secrets, tokens, or local environment files.
- Do not include generated build artifacts unless the repo already tracks them intentionally.
- If there are unrelated changes, stash them before staging targeted files.

## Execution checklist
1. Inspect branch and status (`git branch --show-current`, `git status --short`).
2. If unrelated modifications exist, stash with message (`git stash push -u -m "pre-commit safety stash"`).
3. Stage intended files (`git add <paths>` or `git add -A` if user approved).
4. Confirm staged diff (`git diff --staged`).
5. Create a clear commit message and commit.
6. Sync with remote safely (`git pull --rebase` when needed).
7. Push branch (`git push` or `git push -u origin <branch>`).
8. Report final commit hash, branch, and push result.

## Prompt templates
- "Use openshelf-git-ops: commit all current changes with message 'feat: improve epub loading', then push current branch safely."
- "Use openshelf-git-ops: stash unrelated work, commit only README and AGENTS updates, and push."
- "Use openshelf-git-ops: check if branch is behind remote, rebase safely, then push and summarize."

## Handoff template
- Branch used.
- Whether stash was created (name + how to restore).
- Files committed.
- Commit hash + message.
- Push target and result.
