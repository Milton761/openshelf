# OpenShelf

OpenShelf is a simple local EPUB reader built with React and Vite.

## Current scope
- Open `.epub` files from your computer.
- Render and read the book in-browser.
- Navigate with Previous/Next controls.
- Jump using the table of contents.

## Tech stack
- React + TypeScript
- Vite
- `epubjs`

## Local setup
1. Install dependencies:

   ```bash
   npm install
   ```

2. Run development server:

   ```bash
   npm run dev
   ```

3. Build production bundle:

   ```bash
   npm run build
   ```

## Maintenance with AI agents
- Shared guidance: `AGENTS.md`
- Feature skill: `.agents/skills/openshelf-feature/SKILL.md`
- Bugfix skill: `.agents/skills/openshelf-bugfix/SKILL.md`
- Docs/release skill: `.agents/skills/openshelf-docs-release/SKILL.md`
- Git workflow skill: `.agents/skills/openshelf-git-ops/SKILL.md`

## Notes
- This app is local-only: no upload or remote sync.
- Large EPUB rendering quality can vary by book formatting.
