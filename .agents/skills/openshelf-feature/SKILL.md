# openshelf-feature

## Purpose
Implement or modify OpenShelf features while preserving a local-first EPUB reader experience.

## Use this skill when
- Adding UI behavior in `src/App.tsx`.
- Extending EPUB navigation or metadata handling.
- Improving reader usability without introducing backend services.

## Constraints
- Keep all reading and file handling on-device.
- Avoid architecture rewrites.
- Reuse existing component/layout patterns.

## Execution checklist
1. Identify exact user-visible behavior to add/change.
2. Update only required files under `src/`.
3. Validate with `npm run build`.
4. Update `README.md` if usage changed.

## Handoff template
- Summary of behavior change.
- Files changed.
- Validation result.
- Follow-up suggestion.
