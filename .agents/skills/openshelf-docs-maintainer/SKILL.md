# openshelf-docs-maintainer

## Purpose
Keep OpenShelf documentation continuously accurate after every code change.

## Use this skill when
- Features, scripts, setup, or behavior changed.
- Bugfixes introduced new troubleshooting notes.
- You want a docs-only maintenance pass before commit/release.

## Scope of updates
- `README.md` (setup, usage, scope, limitations).
- `AGENTS.md` (workflow, skill list, agent invocation examples).
- Any docs folder/file if added later.

## Constraints
- Document only what exists in the codebase now.
- Keep docs concise and practical.
- Do not invent roadmap items.

## Execution checklist
1. Compare changed files against current docs.
2. Update setup/run/build steps if scripts changed.
3. Update feature/behavior descriptions to match UI.
4. Add/refresh troubleshooting for known failure modes.
5. Validate commands in docs by running them when possible.
6. Summarize doc diffs clearly in handoff.

## Prompt templates
- "Use openshelf-docs-maintainer: sync README and AGENTS with the latest EPUB loading changes."
- "Use openshelf-docs-maintainer: do a docs-only pass and prepare commit-ready doc updates."
- "Use openshelf-docs-maintainer: add troubleshooting for blank render and invalid epub handling."

## Handoff template
- Docs files updated.
- What changed in each file.
- Which commands were validated.
- Remaining documentation gaps (if any).
