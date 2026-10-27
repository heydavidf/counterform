# Changelog

## 0.4.0 (27 October 2026)

First public release.

### Added

- Facing pages can use a page grid: design one page and Counterform builds the spread as a mirror, a repeat, or with the right page's own columns. The fold becomes part of the grid, and changing paper size recalculates it.
- Five facing starters built on the page grid: Book page, Margin notes, Spine channel, Two grids, one horizon, and Bridge band.
- Rows can be set to fit their content, so a flexible row takes the remaining space.

### Changed

- The built-in Social starters (Statement, Announcement, Editorial card) are readable at phone size in every format, without changing the study's own type sizes. Changing format rearranges a starter you have not edited.

### Fixed

- Foreground artwork stays above decorative panels in SVG and IDML exports.
- SVG exports quote and escape font names, so the selected embedded fonts render instead of a fallback.
- Applying Editorial facing selects facing pages and keeps the reading text on one page; reading text near the fold gets a named warning.
- Block labels containing `$&` or `$'` no longer garble the exported `DESIGN.md`.

### Security

- Development tools updated for published advisories: Vite 6.4.5 (development server file access and cross-origin middleware fixes), Vitest 4.1.12 and source-map-js 1.2.2.

### Earlier versions

0.1 to 0.3 were private: the specimens and type controls, advanced grid compositions (0.2), and Web, Print and Social output modes (0.3).
