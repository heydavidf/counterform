import type { Settings } from "./model";
import { validatePageGrid, type PageGrid } from "./page-grid";

export type GridFamily = "manuscript" | "column" | "modular" | "hierarchical";
export type LayoutVariant = "wide" | "medium" | "narrow";
export type BlockType =
  | "title"
  | "deck"
  | "body"
  | "quote"
  | "caption"
  | "letter"
  | "rule"
  | "panel"
  | "marker";
export type FormatRatio = "square" | "3:4" | "2:3" | "root-2";
export type LayoutFormat =
  { mode: "flow" } | { mode: "fixed"; ratio: FormatRatio; height: number };
export type LayoutMargins = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  linked: boolean;
};
export type LayoutTrack = {
  weight: number;
  /** Rows only: size this row to its content; weight then applies to the remaining rows. */
  fit?: boolean;
};
export type Placement = {
  column: number;
  span: number;
  row: number;
  rowSpan: number;
  align: "start" | "center" | "end" | "stretch";
};
export type ResponsivePlacement = {
  wide: Placement;
  medium?: Placement;
  narrow?: Placement;
};
export type LayoutBlock = {
  id: string;
  type: BlockType;
  label: string;
  contentKey?: keyof Settings["content"];
  content?: string;
  placement: ResponsivePlacement;
};
export type LayoutSystem = {
  version: 1;
  recipeId: string;
  family: GridFamily;
  format: LayoutFormat;
  margins: LayoutMargins;
  columns: { tracks: LayoutTrack[]; gap: number };
  rows: { tracks: LayoutTrack[]; gap: number; auto: boolean };
  variants: Partial<
    Record<
      "medium" | "narrow",
      {
        columns?: { tracks: LayoutTrack[]; gap: number };
        margins?: LayoutMargins;
        rowGap?: number;
      }
    >
  >;
  rhythm: {
    unit: number;
    linked: boolean;
    paragraphGap: number;
    headingGap: number;
    indent: number;
  };
  typesetting: {
    align: "left" | "justify";
    hyphenate: boolean;
    language: "en" | "sv";
    smallCaps: boolean;
    numerals: "normal" | "oldstyle" | "tabular";
  };
  blocks: LayoutBlock[];
  /** Facing pages only: the page description these columns and margins were compiled from. */
  pageGrid?: PageGrid;
};
export type LayoutSettings = Settings & { layout?: LayoutSystem };

const p = (
  column: number,
  span: number,
  row: number,
  rowSpan = 1,
  align: Placement["align"] = "start",
): Placement => ({ column, span, row, rowSpan, align });
const responsive = (
  wide: Placement,
  medium?: Placement,
  narrow?: Placement,
): ResponsivePlacement => ({ wide, medium, narrow });
const tracks = (count: number, weights: number[] = []) =>
  Array.from({ length: count }, (_, index) => ({
    weight: weights[index] ?? 1,
  }));
const base = (
  recipeId: string,
  family: GridFamily,
  columns: number,
  rows: number,
): LayoutSystem => ({
  version: 1,
  recipeId,
  family,
  format: { mode: "flow" },
  margins: { top: 58, right: 58, bottom: 58, left: 58, linked: true },
  columns: { tracks: tracks(columns), gap: 24 },
  rows: { tracks: tracks(rows), gap: 24, auto: true },
  blocks: [],
  variants: {
    medium: { columns: { tracks: tracks(Math.min(6, columns)), gap: 20 } },
    narrow: {
      columns: { tracks: tracks(1), gap: 0 },
      margins: { top: 28, right: 24, bottom: 32, left: 24, linked: false },
      rowGap: 22,
    },
  },
  rhythm: {
    unit: 8,
    linked: true,
    paragraphGap: 16,
    headingGap: 24,
    indent: 0,
  },
  typesetting: {
    align: "left",
    hyphenate: false,
    language: "en",
    smallCaps: false,
    numerals: "normal",
  },
});
const standardBlocks = (
  placements: Partial<Record<BlockType, ResponsivePlacement>>,
): LayoutBlock[] =>
  (
    [
      "marker",
      "title",
      "deck",
      "body",
      "letter",
      "quote",
      "caption",
      "rule",
      "panel",
    ] as BlockType[]
  )
    .filter((type) => placements[type])
    .map((type) => ({
      id: type,
      type,
      label:
        type === "body"
          ? "Reading text"
          : type[0].toUpperCase() + type.slice(1),
      contentKey: (
        ["title", "deck", "body", "quote", "caption"] as BlockType[]
      ).includes(type)
        ? (type as keyof Settings["content"])
        : undefined,
      content:
        type === "marker"
          ? "Counterform Review · Type & observation"
          : undefined,
      placement: placements[type]!,
    }));

const book = base("book-page", "manuscript", 6, 6);
book.margins = { top: 72, right: 68, bottom: 82, left: 82, linked: false };
book.blocks = standardBlocks({
  marker: responsive(p(1, 6, 1)),
  title: responsive(p(1, 5, 2), p(1, 6, 2), p(1, 1, 2)),
  deck: responsive(p(1, 4, 3), p(1, 5, 3), p(1, 1, 3)),
  body: responsive(p(2, 4, 4), p(1, 5, 4), p(1, 1, 4)),
  caption: responsive(p(5, 2, 5), p(5, 2, 5), p(1, 1, 5)),
  rule: responsive(p(1, 6, 6), p(1, 6, 6), p(1, 1, 6)),
});
const marginal = base("marginal-essay", "column", 8, 6);
marginal.columns.tracks = tracks(8, [1, 1, 1.2, 1.2, 1.2, 1.2, 0.85, 0.85]);
marginal.blocks = standardBlocks({
  marker: responsive(p(1, 8, 1), p(1, 6, 1), p(1, 1, 1)),
  title: responsive(p(2, 6, 2), p(1, 6, 2), p(1, 1, 2)),
  deck: responsive(p(3, 4, 3), p(2, 4, 3), p(1, 1, 3)),
  body: responsive(p(3, 4, 4, 2), p(2, 4, 4, 2), p(1, 1, 4, 2)),
  quote: responsive(p(7, 2, 4), p(1, 5, 6), p(1, 1, 6)),
  caption: responsive(p(1, 2, 4), p(1, 6, 7), p(1, 1, 7)),
  rule: responsive(p(1, 8, 6), p(1, 6, 8), p(1, 1, 8)),
});
const asymmetric = base("asymmetric-editorial", "column", 12, 7);
asymmetric.blocks = standardBlocks({
  marker: responsive(p(1, 12, 1), p(1, 6, 1), p(1, 1, 1)),
  title: responsive(p(2, 10, 2), p(1, 6, 2), p(1, 1, 2)),
  deck: responsive(p(3, 6, 3), p(1, 4, 3), p(1, 1, 3)),
  body: responsive(p(3, 6, 4, 2), p(1, 4, 4, 2), p(1, 1, 4, 3)),
  letter: responsive(p(10, 3, 4, 2), p(5, 2, 4, 2), p(1, 1, 7)),
  quote: responsive(p(1, 5, 7), p(1, 3, 7), p(1, 1, 8)),
  caption: responsive(p(10, 3, 7), p(5, 2, 7), p(1, 1, 9)),
  rule: responsive(p(1, 12, 6), p(1, 6, 6), p(1, 1, 10)),
});
const modular = base("modular-specimen", "modular", 8, 8);
modular.rows.auto = false;
modular.format = { mode: "fixed", ratio: "3:4", height: 1387 };
modular.rows.tracks = tracks(10);
modular.blocks = standardBlocks({
  marker: responsive(p(1, 8, 1), p(1, 6, 1), p(1, 1, 1)),
  title: responsive(p(1, 5, 2, 2), p(1, 6, 2, 2), p(1, 1, 2)),
  deck: responsive(p(6, 3, 2, 2), p(1, 6, 4), p(1, 1, 3)),
  panel: responsive(p(1, 3, 4, 2), p(1, 2, 5, 2), p(1, 1, 4)),
  letter: responsive(p(1, 3, 4, 2), p(1, 2, 5, 2), p(1, 1, 4)),
  body: responsive(p(4, 5, 4, 5), p(3, 4, 5, 3), p(1, 1, 5, 2)),
  quote: responsive(p(1, 5, 9), p(1, 6, 8), p(1, 1, 7)),
  caption: responsive(p(6, 3, 9), p(1, 6, 9), p(1, 1, 8)),
  rule: responsive(p(1, 8, 10), p(1, 6, 10), p(1, 1, 9)),
});
const hierarchical = base("hierarchical-interface", "hierarchical", 10, 7);
hierarchical.columns.tracks = tracks(
  10,
  [1.15, 1.15, 1.15, 1.15, 1.15, 1.15, 0.75, 0.75, 0.75, 0.75],
);
hierarchical.blocks = standardBlocks({
  marker: responsive(p(1, 10, 1), p(1, 6, 1), p(1, 1, 1)),
  title: responsive(p(1, 6, 2), p(1, 4, 2), p(1, 1, 2)),
  deck: responsive(p(1, 6, 3), p(1, 4, 3), p(1, 1, 3)),
  body: responsive(p(1, 6, 4, 3), p(1, 4, 4, 3), p(1, 1, 4, 2)),
  panel: responsive(p(7, 4, 2, 4), p(5, 2, 2, 4), p(1, 1, 6)),
  quote: responsive(p(7, 4, 3, 2), p(5, 2, 3, 2), p(1, 1, 6)),
  caption: responsive(p(7, 4, 6), p(5, 2, 6), p(1, 1, 7)),
  rule: responsive(p(1, 10, 7), p(1, 6, 7), p(1, 1, 8)),
});
const poster = base("typographic-poster", "hierarchical", 6, 9);
poster.format = { mode: "fixed", ratio: "2:3", height: 1560 };
poster.margins = { top: 44, right: 44, bottom: 44, left: 44, linked: true };
poster.blocks = standardBlocks({
  marker: responsive(p(1, 6, 1)),
  title: responsive(p(1, 6, 2, 2), p(1, 6, 2, 2), p(1, 1, 2)),
  panel: responsive(p(1, 4, 4, 3), p(1, 4, 4, 3), p(1, 1, 3)),
  letter: responsive(p(1, 4, 4, 3), p(1, 4, 4, 3), p(1, 1, 3)),
  deck: responsive(p(5, 2, 4, 2, "end"), p(5, 2, 4, 2, "end"), p(1, 1, 4)),
  quote: responsive(p(1, 3, 7), p(1, 3, 7), p(1, 1, 5)),
  body: responsive(p(4, 3, 7), p(4, 3, 7), p(1, 1, 6)),
  caption: responsive(p(5, 2, 8), p(5, 2, 8), p(1, 1, 7)),
  rule: responsive(p(1, 6, 9), p(1, 6, 9), p(1, 1, 8)),
});

// Default document order follows the narrow reading sequence. Decorative panels stay last.
for (const recipe of [
  book,
  marginal,
  asymmetric,
  modular,
  hierarchical,
  poster,
]) {
  recipe.blocks.sort((a, b) => {
    if (a.type === "panel") return 1;
    if (b.type === "panel") return -1;
    return (
      (a.placement.narrow?.row ?? a.placement.wide.row) -
      (b.placement.narrow?.row ?? b.placement.wide.row)
    );
  });
}
export const layoutRecipes: readonly LayoutSystem[] = [
  book,
  marginal,
  asymmetric,
  modular,
  hierarchical,
  poster,
];
export const recipes = layoutRecipes;
export function defaultLayout(settings: Settings): LayoutSystem {
  const id =
    settings.composition === "poster"
      ? "typographic-poster"
      : settings.composition === "product"
        ? "hierarchical-interface"
        : "asymmetric-editorial";
  return structuredClone(
    layoutRecipes.find((recipe) => recipe.recipeId === id)!,
  );
}
export function applyRecipe<T extends Settings>(
  settings: T,
  id: string,
): T & { layout: LayoutSystem } {
  const recipe = layoutRecipes.find((item) => item.recipeId === id);
  if (!recipe) throw new Error(`Unknown layout recipe: ${id}`);
  return { ...structuredClone(settings), layout: structuredClone(recipe) };
}

const validPlacement = (value: unknown, columns: number, rows: number) => {
  const x = value as Placement;
  return (
    !!x &&
    Number.isInteger(x.column) &&
    Number.isInteger(x.span) &&
    Number.isInteger(x.row) &&
    Number.isInteger(x.rowSpan) &&
    x.column >= 1 &&
    x.span >= 1 &&
    x.column + x.span - 1 <= columns &&
    x.row >= 1 &&
    x.rowSpan >= 1 &&
    x.row + x.rowSpan - 1 <= rows &&
    ["start", "center", "end", "stretch"].includes(x.align)
  );
};
export function validateLayout(value: unknown): LayoutSystem {
  const l = value as LayoutSystem;
  const fail = () => {
    throw new Error(
      "This layout is not supported. Your current work is unchanged.",
    );
  };
  if (
    !l ||
    l.version !== 1 ||
    typeof l.recipeId !== "string" ||
    l.recipeId.length > 80 ||
    !["manuscript", "column", "modular", "hierarchical"].includes(l.family)
  )
    fail();
  if (
    !l.columns ||
    !Array.isArray(l.columns.tracks) ||
    l.columns.tracks.length < 1 ||
    l.columns.tracks.length > 16 ||
    !Number.isFinite(l.columns.gap) ||
    l.columns.gap < 0 ||
    l.columns.gap > 64 ||
    l.columns.tracks.some(
      (t) =>
        !t ||
        !Number.isFinite(t.weight) ||
        t.weight <= 0 ||
        t.weight > 12 ||
        t.fit !== undefined,
    )
  )
    fail();
  if (
    !l.rows ||
    !Array.isArray(l.rows.tracks) ||
    l.rows.tracks.length < 1 ||
    l.rows.tracks.length > 64 ||
    typeof l.rows.auto !== "boolean" ||
    !Number.isFinite(l.rows.gap) ||
    l.rows.gap < 0 ||
    l.rows.gap > 96 ||
    l.rows.tracks.some(
      (t) =>
        !t ||
        !Number.isFinite(t.weight) ||
        t.weight <= 0 ||
        t.weight > 12 ||
        (t.fit !== undefined && typeof t.fit !== "boolean"),
    )
  )
    fail();
  if (
    !l.margins ||
    typeof l.margins.linked !== "boolean" ||
    [l.margins.top, l.margins.right, l.margins.bottom, l.margins.left].some(
      (n) => !Number.isFinite(n) || n < 0 || n > 240,
    )
  )
    fail();
  if (
    !l.format ||
    !["flow", "fixed"].includes(l.format.mode) ||
    (l.format.mode === "fixed" &&
      (!["square", "3:4", "2:3", "root-2"].includes(l.format.ratio) ||
        !Number.isFinite(l.format.height) ||
        l.format.height < 320 ||
        l.format.height > 2400))
  )
    fail();
  if (
    !l.rhythm ||
    !Number.isFinite(l.rhythm.unit) ||
    l.rhythm.unit < 2 ||
    l.rhythm.unit > 48 ||
    typeof l.rhythm.linked !== "boolean" ||
    [l.rhythm.paragraphGap, l.rhythm.headingGap, l.rhythm.indent].some(
      (n) => !Number.isFinite(n) || n < 0 || n > 160,
    )
  )
    fail();
  if (
    !l.typesetting ||
    !["left", "justify"].includes(l.typesetting.align) ||
    typeof l.typesetting.hyphenate !== "boolean" ||
    !["en", "sv"].includes(l.typesetting.language) ||
    typeof l.typesetting.smallCaps !== "boolean" ||
    !["normal", "oldstyle", "tabular"].includes(l.typesetting.numerals)
  )
    fail();
  if (
    !l.variants ||
    typeof l.variants !== "object" ||
    Array.isArray(l.variants)
  )
    fail();
  for (const key of ["medium", "narrow"] as const) {
    const v = l.variants[key];
    if (!v) continue;
    if (
      v.columns &&
      (!Array.isArray(v.columns.tracks) ||
        v.columns.tracks.length < 1 ||
        v.columns.tracks.length > 16 ||
        !Number.isFinite(v.columns.gap) ||
        v.columns.gap < 0 ||
        v.columns.gap > 64 ||
        v.columns.tracks.some(
          (t) =>
            !t || !Number.isFinite(t.weight) || t.weight <= 0 || t.weight > 12,
        ))
    )
      fail();
    if (
      v.margins &&
      (typeof v.margins.linked !== "boolean" ||
        [v.margins.top, v.margins.right, v.margins.bottom, v.margins.left].some(
          (n) => !Number.isFinite(n) || n < 0 || n > 240,
        ))
    )
      fail();
    if (
      v.rowGap !== undefined &&
      (!Number.isFinite(v.rowGap) || v.rowGap < 0 || v.rowGap > 96)
    )
      fail();
  }
  if (!Array.isArray(l.blocks) || l.blocks.length > 32) fail();
  const ids = new Set<string>();
  for (const block of l.blocks) {
    if (
      !block ||
      typeof block.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(block.id) ||
      ids.has(block.id) ||
      ![
        "title",
        "deck",
        "body",
        "quote",
        "caption",
        "letter",
        "rule",
        "panel",
        "marker",
      ].includes(block.type) ||
      typeof block.label !== "string" ||
      block.label.length > 120 ||
      !block.placement
    )
      fail();
    ids.add(block.id);
    if (
      block.contentKey !== undefined &&
      !["title", "deck", "body", "quote", "caption"].includes(block.contentKey)
    )
      fail();
    if (
      block.content !== undefined &&
      (typeof block.content !== "string" || block.content.length > 20000)
    )
      fail();
    for (const key of ["wide", "medium", "narrow"] as const)
      if (
        block.placement[key] &&
        !validPlacement(
          block.placement[key],
          key === "wide"
            ? l.columns.tracks.length
            : (l.variants[key]?.columns?.tracks.length ??
                l.columns.tracks.length),
          key === "wide" ? l.rows.tracks.length : 64,
        )
      )
        fail();
    if (!block.placement.wide) fail();
  }
  if (l.pageGrid !== undefined)
    validatePageGrid(l.pageGrid, l.columns.tracks.length);
  return structuredClone(l);
}
export const effectiveVariant = (width: number): LayoutVariant =>
  width <= 600 ? "narrow" : width <= 900 ? "medium" : "wide";
export function effectivePlacement(
  block: LayoutBlock,
  variant: LayoutVariant,
  layout?: LayoutSystem,
): Placement {
  const explicit = block.placement[variant];
  if (explicit) return { ...explicit };
  if (variant === "narrow" && layout) {
    const occupied = new Set<number>();
    for (const item of layout.blocks) {
      const placed = item.placement.narrow;
      if (placed)
        for (let row = placed.row; row < placed.row + placed.rowSpan; row++)
          occupied.add(row);
    }
    let cursor = 1;
    for (const item of layout.blocks) {
      const placed = item.placement.narrow;
      if (placed) {
        cursor = Math.max(cursor, placed.row + placed.rowSpan);
        continue;
      }
      while (occupied.has(cursor)) cursor++;
      const row = cursor++;
      occupied.add(row);
      if (item.id === block.id)
        return p(
          1,
          effectiveLayout(layout, variant).columns.tracks.length,
          row,
        );
    }
  }
  const inherited = { ...block.placement.wide };
  if (layout) {
    const count = effectiveLayout(layout, variant).columns.tracks.length;
    inherited.column = Math.min(inherited.column, count);
    inherited.span = Math.min(inherited.span, count - inherited.column + 1);
  }
  return inherited;
}
export function effectiveRowCount(
  layout: LayoutSystem,
  variant: LayoutVariant,
): number {
  return Math.max(
    variant === "wide" ? layout.rows.tracks.length : 1,
    ...layout.blocks.map((b) => {
      const p = effectivePlacement(b, variant, layout);
      return p.row + p.rowSpan - 1;
    }),
  );
}
export function effectiveLayout(layout: LayoutSystem, variant: LayoutVariant) {
  const override = variant === "wide" ? undefined : layout.variants[variant];
  return {
    columns: override?.columns ?? layout.columns,
    margins: override?.margins ?? layout.margins,
    rowGap: override?.rowGap ?? layout.rows.gap,
  };
}
const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "");
const declaration = (place: Placement) =>
  `grid-column:${place.column}/span ${place.span};grid-row:${place.row}/span ${place.rowSpan};align-self:${place.align}`;
export function layoutCss(settings: LayoutSettings): string {
  if (!settings.layout) return "";
  const l = validateLayout(settings.layout);
  const fixedSurface = settings.surface?.mode === "print" || settings.surface?.mode === "social";
  const variants: LayoutVariant[] = ["wide", "medium", "narrow"];
  const maxColumns = Math.max(
    ...variants.map((v) => effectiveLayout(l, v).columns.tracks.length),
  );
  const maxRows = Math.max(...variants.map((v) => effectiveRowCount(l, v)));
  const variantCss = (variant: LayoutVariant) => {
    const g = effectiveLayout(l, variant),
      count = effectiveRowCount(l, variant);
    const rowTracks = Array.from({ length: count }, (_, i) => {
      const weight = l.rows.tracks[i]?.weight ?? 1;
      return variant !== "wide"
        ? "minmax(0,auto)"
        : l.rows.auto
          ? `minmax(${weight}rem,auto)`
          : l.rows.tracks[i]?.fit
            ? "auto"
            : `minmax(0,${weight}fr)`;
    }).join(" ");
    const margins = g.margins;
    const geometry = `.specimen.layout-enabled .layout-grid{--layout-columns:${g.columns.tracks.map((t) => `minmax(0,${t.weight}fr)`).join(" ")};--layout-rows:${rowTracks};--layout-column-gap:${g.columns.gap}px;--layout-row-gap:${g.rowGap}px;--layout-margin-top:${margins.top}px;--layout-margin-right:${margins.right}px;--layout-margin-bottom:${margins.bottom}px;--layout-margin-left:${margins.left}px;}`;
    const blocks = l.blocks
      .map(
        (b) =>
          `.specimen.layout-enabled .layout-block-${safeId(b.id)}{${declaration(effectivePlacement(b, variant, l))}}`,
      )
      .join("");
    const columnGuides = Array.from(
      { length: maxColumns },
      (_, i) =>
        `.specimen.layout-enabled .layout-guide-column-${i + 1}{--guide-visible:${i < g.columns.tracks.length ? "block" : "none"};grid-column:${i + 1}/span 1;grid-row:1/span ${count};}`,
    ).join("");
    const rowGuides = Array.from(
      { length: maxRows },
      (_, i) =>
        `.specimen.layout-enabled .layout-guide-row-${i + 1}{--guide-visible:${i < count ? "block" : "none"};grid-row:${i + 1}/span 1;grid-column:1/span ${g.columns.tracks.length};}`,
    ).join("");
    return (
      geometry +
      `.specimen.layout-enabled .baseline-overlay{inset:${margins.top}px ${margins.right}px ${margins.bottom}px ${margins.left}px;}` +
      blocks +
      columnGuides +
      rowGuides
    );
  };
  const paragraphGap = l.rhythm.linked
    ? l.rhythm.unit * 2
    : l.rhythm.paragraphGap;
  const headingGap = l.rhythm.linked ? l.rhythm.unit * 3 : l.rhythm.headingGap;
  const responsiveCss = fixedSurface
    ? variantCss("wide")
    : `${variantCss("wide")}@container (max-width:900px){${variantCss("medium")}}@container (max-width:600px){${variantCss("narrow")}}`;
  return `.specimen.layout-enabled{--rhythm-unit:${l.rhythm.unit}px;--paragraph-gap:${paragraphGap}px;--heading-gap:${headingGap}px;--paragraph-indent:${l.rhythm.indent}px;--baseline:${l.rhythm.unit}px;${l.format.mode === "fixed" ? `--layout-height:${l.format.height}px;` : ""}}${responsiveCss}`;
}
