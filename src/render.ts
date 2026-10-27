import { fonts } from "./catalog";
import {
  familyAlias,
  type Settings,
  type Role,
  type UploadedFont,
} from "./model";
import { supportsFeature } from "./font-features";
import {
  effectiveLayout,
  effectiveRowCount,
  layoutCss,
  validateLayout,
  type LayoutBlock,
  type LayoutSettings,
} from "./layout";
import css from "./specimen.css?raw";
import { surfaceCss, surfaceGeometry, surfaceOf } from "./surface";
export const SPECIMEN_CSS = css;
export const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function fontFaceCss(
  _uploads: UploadedFont[] = [],
  _exportMode = false,
) {
  return fonts
    .flatMap((font) =>
      font.files.map(
        (file) =>
          `@font-face{font-family:"${familyAlias(font.id)}";src:url("${import.meta.env.BASE_URL}${file.path}");font-weight:${file.weight};font-style:${file.style};font-display:swap;}`,
      ),
    )
    .join("\n");
}
export function systemCss(s: LayoutSettings) {
  const variables: string[] = [];
  for (const role of ["display", "body", "support"] as Role[]) {
    const r = s.roles[role];
    variables.push(
      `--${role}-font:"${familyAlias(r.fontId)}",${role === "support" ? "sans-serif" : "serif"}`,
      `--${role}-size:${r.size}px`,
      `--${role}-weight:${r.weight}`,
      `--${role}-style:${r.style}`,
      `--${role}-leading:${r.leading}`,
      `--${role}-tracking:${r.tracking}em`,
      `--${role}-axes:${
        Object.entries(r.axes)
          .map(([tag, value]) => `"${tag}" ${value}`)
          .join(",") || "normal"
      }`,
    );
  }
  const g = s.grid;
  for (const key of ["background", "ink", "muted", "accent", "panel"] as const)
    variables.push(`--${key}:${s.palette[key]}`);
  variables.push(
    `--columns:${g.columns}`,
    `--gutter:${g.gutter}px`,
    `--margin:${g.margin}px`,
    `--baseline:${g.baseline}px`,
    `--modules:${g.modules}`,
    `--measure:${s.measure}ch`,
  );
  const main =
    g.layout === "balanced"
      ? Math.ceil(g.columns * 0.58)
      : g.layout === "compact"
        ? Math.ceil(g.columns * 0.7)
        : Math.ceil(g.columns * 0.55);
  variables.push(
    `--main-span:${Math.max(1, main)}`,
    `--side-span:${Math.max(1, g.columns - main - (g.layout === "asymmetric" && g.columns > 4 ? 1 : 0))}`,
  );
  return `.specimen{${variables.join(";")};}` + layoutCss(s) + surfaceCss(s);
}
function blockContent(s: Settings, block: LayoutBlock) {
  const value = block.contentKey
    ? s.content[block.contentKey]
    : (block.content ?? "");
  if (block.type === "body")
    return value
      .split(/\n\s*\n/)
      .filter(Boolean)
      .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
      .join("");
  return escapeHtml(value);
}
function renderBlock(s: Settings, block: LayoutBlock) {
  const className = `layout-block layout-block-${block.id.replace(/[^a-zA-Z0-9_-]/g, "")} layout-${block.type}`;
  const attrs = `class="${className}" data-block-id="${escapeHtml(block.id)}" data-zone="${escapeHtml(block.label)}"`;
  const content = blockContent(s, block);
  switch (block.type) {
    case "title":
      return `<h1 ${attrs}>${content}</h1>`;
    case "deck":
      return `<p ${attrs}>${content}</p>`;
    case "body":
      return `<div ${attrs}>${content}</div>`;
    case "quote":
      return `<blockquote ${attrs}>${content}</blockquote>`;
    case "caption":
      return `<p ${attrs}>${content}</p>`;
    case "letter":
      return `<div ${attrs} aria-label="Letterform specimen"><span>${escapeHtml(block.content || "&")}</span></div>`;
    case "rule":
      return `<hr ${attrs}/>`;
    case "panel":
      return `<div ${attrs} aria-hidden="true"></div>`;
    case "marker":
      return `<header ${attrs}>${content}</header>`;
  }
}
export function renderLayout(s: LayoutSettings) {
  const l = validateLayout(s.layout);
  const surface = surfaceOf(s);
  const geometry = surfaceGeometry(s);
  const fixed = surface.mode !== "web" || l.format.mode === "fixed";
  const overflow = fixed
    ? "Fixed format: content that exceeds the study remains visible for review."
    : "";
  const formatAttributes = fixed
    ? ` data-format-ratio="${l.format.mode === "fixed" ? l.format.ratio : surface.mode}" data-overflow-warning="${escapeHtml(overflow)}"`
    : "";
  const smallCaps =
    l.typesetting.smallCaps && supportsFeature(s.roles.support, "smcp");
  const numeralTag =
    l.typesetting.numerals === "oldstyle"
      ? "onum"
      : l.typesetting.numerals === "tabular"
        ? "tnum"
        : "";
  const numerals =
    numeralTag && supportsFeature(s.roles.body, numeralTag)
      ? l.typesetting.numerals
      : "normal";
  const classes = [
    `template-${l.recipeId.replace(/[^a-zA-Z0-9_-]/g, "")}`,
    `align-${l.typesetting.align}`,
    l.typesetting.hyphenate ? "hyphenate" : "",
    smallCaps ? "small-caps" : "",
    `numerals-${numerals}`,
  ]
    .filter(Boolean)
    .join(" ");
  const variants = ["wide", "medium", "narrow"] as const;
  const maxColumns = Math.max(
    ...variants.map((v) => effectiveLayout(l, v).columns.tracks.length),
  );
  const maxRows = Math.max(...variants.map((v) => effectiveRowCount(l, v)));
  const guides = `<div class="layout-guides" aria-hidden="true">${Array.from({ length: maxColumns }, (_, index) => `<i class="layout-guide layout-guide-column layout-guide-column-${index + 1}"></i>`).join("")}${Array.from({ length: maxRows }, (_, index) => `<i class="layout-guide layout-guide-row layout-guide-row-${index + 1}"></i>`).join("")}</div>`;
  const facingGuides =
    surface.mode === "print" && surface.pages === "facing"
      ? `<div class="surface-guide surface-fold" aria-hidden="true"></div><span class="surface-guide surface-page-number surface-page-number-left" aria-hidden="true">1</span><span class="surface-guide surface-page-number surface-page-number-right" aria-hidden="true">2</span>`
      : "";
  return `<article class="specimen ${s.composition} layout-enabled layout-${l.family} ${classes}" lang="${l.typesetting.language}" data-format="${fixed ? "fixed" : l.format.mode}" data-surface="${surface.mode}" data-output-width="${geometry.width}"${geometry.height === null ? "" : ` data-output-height="${geometry.height}"`}${formatAttributes} aria-label="${escapeHtml(s.composition)} specimen"><div class="spec-page layout-grid">${guides}${l.blocks.map((block) => renderBlock(s, block)).join("")}</div>${facingGuides}<div class="baseline-overlay" aria-hidden="true"></div></article>`;
}
export function renderSpecimen(s: LayoutSettings) {
  if (s.layout) return renderLayout(s);
  const c = Object.fromEntries(
    Object.entries(s.content).map(([k, v]) => [k, escapeHtml(v)]),
  );
  const paragraphs = s.content.body
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("");
  const masthead = `<header class="spec-masthead"><span>Counterform Review</span><span>Type &amp; observation</span></header>`;
  const footer = `<footer class="spec-footer"><span>${c.caption}</span><span>Counterform</span></footer>`;
  let content = "";
  if (s.composition === "editorial")
    content = `${masthead}<header class="spec-intro"><h1>${c.title}</h1><p class="spec-deck">${c.deck}</p></header><div class="spec-grid editorial-grid"><div class="spec-reading">${paragraphs}</div><aside class="spec-aside"><div class="letter-study" aria-label="Letterform specimen: lowercase a"><span>a</span><div class="letter-coordinate" aria-hidden="true">form / counterform</div></div><blockquote>${c.quote}</blockquote><div class="spec-note">A conversation between<br/>structure and expression.</div></aside></div>${footer}`;
  if (s.composition === "product")
    content = `<header class="spec-masthead"><span>Counterform Studio</span><span>Workspace · System specimen</span></header><div class="product-nav"><strong>Overview</strong><span>Library</span><span>Settings</span></div><header class="spec-intro"><h1>${c.title}</h1><p class="spec-deck">${c.deck}</p></header><div class="spec-grid"><section class="spec-reading"><h2>Your reading system</h2>${paragraphs}<div class="sample-controls"><button type="button" disabled>Primary button specimen</button><span>Supporting text &amp; labels</span></div></section><aside class="spec-aside product-table"><h2>System details</h2><dl><div><dt>Reading size</dt><dd>${s.roles.body.size} px</dd></div><div><dt>Line height</dt><dd>${s.roles.body.leading}</dd></div><div><dt>Columns</dt><dd>${s.grid.columns}</dd></div><div><dt>Gutter</dt><dd>${s.grid.gutter} px</dd></div></dl><blockquote>${c.quote}</blockquote><p class="spec-note">Illustrative interface elements.<br/>Adjust the system in the inspector.</p></aside></div>${footer}`;
  if (s.composition === "poster")
    content = `<header class="spec-masthead"><span>Counterform</span><span>Studies in composition</span></header><div class="poster-grid spec-grid"><h1>${c.title}</h1><div class="poster-letter" aria-label="Ampersand letterform specimen">&amp;</div><p class="poster-deck">${c.deck}</p><blockquote>${c.quote}</blockquote><div class="poster-body">${paragraphs}</div></div>${footer}`;
  return `<article class="specimen ${s.composition}" aria-label="${s.composition} specimen"><div class="spec-page">${content}</div><div class="grid-overlay" aria-hidden="true">${Array.from({ length: s.grid.columns }, () => "<i></i>").join("")}</div><div class="module-overlay" aria-hidden="true">${Array.from({ length: s.grid.modules }, () => "<i></i>").join("")}</div><div class="baseline-overlay" aria-hidden="true"></div></article>`;
}
