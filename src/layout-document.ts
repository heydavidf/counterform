import type { Settings } from "./model";
import {
  effectiveLayout,
  effectivePlacement,
  type LayoutVariant,
} from "./layout";
import { supportsFeature } from "./font-features";
import { surfaceGeometry, surfaceOf } from "./surface";
import { pageGridSummary } from "./page-grid";

const safe = (text: string) => text.replace(/[\r\n|<>`]/g, " ");
export function describeLayout(s: Settings): string {
  const l = s.layout!;
  const surface = surfaceOf(s);
  const geometry = surfaceGeometry(s);
  const variants: LayoutVariant[] = ["wide", "medium", "narrow"];
  const rows = variants
    .map((variant) => {
      const e = effectiveLayout(l, variant);
      const m = e.margins;
      return `| ${variant} | ${e.columns.tracks.map((t) => t.weight).join(" : ")} | ${e.columns.gap}px / ${e.rowGap}px | ${m.top} / ${m.right} / ${m.bottom} / ${m.left}px |`;
    })
    .join("\n");
  const placements = l.blocks
    .flatMap((block, index) =>
      variants.map((variant) => {
        const p = effectivePlacement(block, variant, l);
        return `| ${index + 1} | ${safe(block.label)} (${block.type}) | ${variant} | ${p.column} + ${p.span} | ${p.row} + ${p.rowSpan} | ${p.align} |`;
      }),
    )
    .join("\n");
  const caps =
    l.typesetting.smallCaps && supportsFeature(s.roles.support, "smcp");
  const tag = l.typesetting.numerals === "oldstyle" ? "onum" : "tnum";
  const numerals =
    l.typesetting.numerals !== "normal" && supportsFeature(s.roles.body, tag)
      ? l.typesetting.numerals
      : "font default";
  return `## Layout

An editable ${l.family} grid, based on ${safe(l.recipeId)}. Layout schema version ${l.version} is stored in settings.json. Blocks are in semantic reading order; visual placement does not change that order. ${surface.mode === "web" ? "Wide applies above 900px, medium above 600px through 900px, and narrow at 600px or less. Medium and narrow rows grow with content, including bounded studies. Container width, not scaled preview size, chooses the variant." : `This is a fixed ${surface.mode} surface (${safe(geometry.label)}) and always uses the wide arrangement; narrowing or scaling a preview does not reflow it.`}

| Variant | Column weights | Column / row gap | Margins: top / right / bottom / left |
| --- | --- | --- | --- |
${rows}

Format: ${surface.mode === "web" ? (l.format.mode === "fixed" ? `bounded study, ${l.format.height}px target height, ${l.format.ratio} proportion reference` : "flowing page with content-driven height") : `${safe(geometry.label)}; exact canvas ${geometry.width} × ${geometry.height}px`}. Rows: ${l.rows.auto ? "grow with content" : "modular tracks"}; weights ${l.rows.tracks.map((t) => (t.fit && !l.rows.auto ? "fit" : t.weight)).join(" : ")}${!l.rows.auto && l.rows.tracks.some((t) => t.fit) ? " (fit rows take their content height; weighted rows share the rest)" : ""}. Content that exceeds a bounded area must remain visible and be reviewed; this is not an automatic pagination system. Reading measure is at most ${s.measure}ch, not a guaranteed character count. Saved Web preview width remains ${s.width}px.${surface.mode === "print" && geometry.pageCount === 2 ? (l.pageGrid ? ` ${pageGridSummary(l.pageGrid)} The column weights above are compiled from it; edit the page grid rather than the tracks. Display blocks may still span the spine track.` : " The facing pair is one continuous spread grid; the centre fold guide consumes no track and blocks may span it.") : ""}

| Reading order | Zone / block | Variant | Start column + span | Start row + span | Alignment |
| --- | --- | --- | --- | --- | --- |
${placements}

The title, body, notes and markers share actual grid lines. Gutters, margins and overlay geometry follow the same layout. The baseline overlay remains a guide; modular spacing is not proof that every font's glyph baselines align. The exact rules and any responsive clamping are in tokens.css.

Rhythm: ${l.rhythm.unit}px unit; ${l.rhythm.linked ? "linked rhythm enabled" : "independent spacing"}; paragraph gap ${l.rhythm.linked ? l.rhythm.unit * 2 : l.rhythm.paragraphGap}px; heading gap ${l.rhythm.linked ? l.rhythm.unit * 3 : l.rhythm.headingGap}px; paragraph indent ${l.rhythm.indent}px. Text alignment: ${l.typesetting.align}. Language: ${l.typesetting.language}; hyphenation ${l.typesetting.hyphenate ? "automatic (browser/language dictionary dependent)" : "off"}. Supporting small caps: ${caps ? "verified smcp enabled" : "off or unsupported by current face"}. Body numeral rendering: ${numerals}. Private font feature support is not inferred.

`;
}
