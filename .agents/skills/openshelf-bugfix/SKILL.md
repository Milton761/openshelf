# openshelf-bugfix

## Purpose
Diagnose and fix defects in the OpenShelf app with the smallest safe patch.

## Use this skill when
- EPUB fails to load.
- Rendering/navigation controls break.
- TypeScript or build regressions appear.

## Constraints
- Fix root cause, not symptoms.
- Do not refactor unrelated code.
- Keep public behavior unchanged unless bug demands it.

## Execution checklist
1. Reproduce issue from report.
2. Locate root cause in `src/`.
3. Apply minimal code fix.
4. Run `npm run build`.
5. Document edge case in `README.md` when relevant.

## Handoff template
- Root cause.
- Fix summary.
- Files changed.
- Validation result.
