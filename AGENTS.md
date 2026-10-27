# Counterform contributor guide

Counterform is a local, browser-based workbench for type, space and colour, built with React, TypeScript, Vite and CSS Grid. There is no backend: studies and uploaded fonts are stored in the browser, and every preview and export comes from one shared renderer. The [README](README.md) owns installation and the public capability claims; this file is the map for people and agents changing the code.

## Where things live

| Area | Files |
| --- | --- |
| Application and controls | `src/App.tsx`, `src/GridEditor.tsx`, `src/MediumEditor.tsx`, `src/ComparisonPanel.tsx`; `src/main.tsx` mounts the app |
| Settings, defaults and validation | `src/model.ts` |
| Grid recipes, geometry, responsive placement and fit rows | `src/layout.ts` |
| Web, Print and Social formats and starters | `src/surface.ts` |
| Facing page grids (Mirror, Repeat, own right page) compiled into spread tracks | `src/page-grid.ts` |
| The five facing-spread starters and their sample copy | `src/spread-starters.ts` |
| Shared specimen markup and type styling | `src/render.ts`, `src/specimen.css` |
| Application styling | `src/app.css`, `src/grid-editor.css` |
| Saved workspace, uploaded fonts and the Reset checkpoint | `src/storage.ts` |
| A/B comparison and its difference labels | `src/comparison.ts` |
| Standalone HTML, print proof and Social PNG | `src/output.ts` |
| Measured artwork and editable SVG | `src/export-artwork.ts` |
| InDesign export | `src/idml.ts`, with the template `public/idml-template.idml` |
| ZIP and settings import and export, font dependencies | `src/package.ts` |
| The exported `DESIGN.md` layout explanation | `src/layout-document.ts` |
| Print fold and unused-content notices | `src/print-diagnostics.ts` |
| Font catalogue and supported OpenType features | `src/catalog.ts`, `src/font-features.ts`, `src/font-features.json` |
| Bundled fonts, licences and sources | `public/fonts/` (`manifest.json` lists sources and hashes) |
| Interface design system | `design/DESIGN.md` |
| Unit tests (Vitest) | `tests/*.test.ts` |
| Browser tests (Playwright, Chromium and WebKit) | `tests/*.spec.ts`; WebKit runs `webkit`, `reset`, `facing` and `page-grid-facing` |
| Test fixtures (saved studies) | `tests/fixtures/` |

## Checks

Run from the repository root with Node 22.12 or a later 22 release, or Node 24 or newer. Install the browsers once before the first browser run.

```sh
npm ci
npm run build
npm test
npx playwright install chromium webkit
npx playwright test
npm audit --omit=dev --audit-level=high
bash .github/check-shell-blocks.sh
bash .github/tripwire.sh origin/main
```

`npm run build` type-checks (strict) and builds. `npm test` must report every unit test passing. `npx playwright test` starts the app on port 4318, or reuses whatever is already running there (stop any unrelated program on that port first), and must report no failures; screenshots and downloads go to `test-results/`, which Git ignores. Pass the branch you will merge into to the tripwire (`origin/main` in a clone of the GitHub repository); with no argument it checks the whole tree but cannot spot newly silenced checks.

CI (`.github/workflows/checks.yml`) runs the build, unit tests, the Chromium browser tests, the audit, the shell-block check, the tripwire and gitleaks on every push to `main`, on pull requests and weekly. It does not run WebKit, `actionlint` or `zizmor`; run those yourself when you change the browser tests or the workflow.

### Adding a facing-spread starter

Add its id to `SPREAD_STARTER_IDS` and its name and description to `spreadStarterTemplates` in `src/spread-starters.ts`, then its page grid, rows and blocks to `specs` in the same file. The unit tests pick it up from `SPREAD_STARTER_IDS`; the browser tests do not, so also add it to the `starters` list at the top of `tests/page-grid-facing.spec.ts`. Update the starter count and names in `README.md`, this file and `CHANGELOG.md`.

## Working rules

1. A bug fix ships with a committed test that fails on the old code and passes on the new. A one-off check in a temporary folder does not count.
2. Run every check above before saying a change is done, and quote the output.
3. Do not silence a check to get green: no skipped tests, no `@ts-ignore`, no disabled rules. The tripwire fails the build unless the line says `tripwire-allow` with a reason.
4. Stop any server you started. Leave no stray files (screenshots, downloads, caches) in the repository folder.
5. For non-trivial changes, a different agent writes an independent scenario test before the change is accepted.

## Change constraints

- Every preview and every export uses the shared settings model and the specimen renderer. Do not add a second renderer for an export.
- No runtime network requests: no external fonts, analytics or CDN files. Bundled fonts keep their licence files and their entry in `public/fonts/manifest.json`.
- Uploaded fonts stay in browser storage and never enter the repository, a fixture or an export without the user's per-download confirmation.
- Saved studies must keep loading. A new layout field is optional, validated in `validateLayout`, and absent from older studies; applying a starter is the only thing that rearranges a study's blocks.
- A facing page grid is compiled into ordinary spread tracks; do not make the renderer or the exports depend on it.
- Starters keep the study's shared copy, type roles and palette.
- Follow `design/DESIGN.md` for the interface. Keep the formatting style of the file you edit; Prettier is installed (`npx prettier --write <file>`), but not every file uses it, so do not reformat code you are not changing.
- No em-dashes or en-dashes in code comments, interface text or documentation.
- Record every user-visible change in `CHANGELOG.md`.
