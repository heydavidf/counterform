import type { Settings } from "./model";
import { applyRecipe, defaultLayout, type LayoutSystem } from "./layout";
import { applyPageGrid, PageGridError, type PageGrid } from "./page-grid";
import {
  isSpreadStarter,
  spreadStarterLayout,
  spreadStarterTemplates,
} from "./spread-starters";

export type SurfaceSettings =
  | { mode: "web" }
  | {
      mode: "print";
      pageSize: "a5" | "a4" | "a3" | "letter";
      orientation: "portrait" | "landscape";
      pages: "single" | "facing";
    }
  | {
      mode: "social";
      format: "square" | "portrait" | "story" | "landscape";
    };

export type SurfaceGeometry = {
  mode: "web" | "print" | "social";
  width: number;
  height: number | null;
  pageWidth: number;
  pageCount: 1 | 2;
  widthMm?: number;
  heightMm?: number;
  label: string;
};

export const PRINT_FORMATS = [
  { id: "a5", label: "A5", widthMm: 148, heightMm: 210 },
  { id: "a4", label: "A4", widthMm: 210, heightMm: 297 },
  { id: "a3", label: "A3", widthMm: 297, heightMm: 420 },
  { id: "letter", label: "Letter", widthMm: 215.9, heightMm: 279.4 },
] as const;

export const SOCIAL_FORMATS = [
  { id: "square", label: "Square", width: 1080, height: 1080 },
  { id: "portrait", label: "Portrait", width: 1080, height: 1350 },
  { id: "story", label: "Story", width: 1080, height: 1920 },
  { id: "landscape", label: "Landscape", width: 1200, height: 630 },
] as const;

const pxPerMm = 96 / 25.4;

export function surfaceOf(settings: Settings): SurfaceSettings {
  return settings.surface ? structuredClone(settings.surface) : { mode: "web" };
}

export function surfaceGeometry(settings: Settings): SurfaceGeometry {
  const surface = surfaceOf(settings);
  if (surface.mode === "web")
    return {
      mode: "web",
      width: settings.width,
      height:
        settings.layout?.format.mode === "fixed"
          ? settings.layout.format.height
          : null,
      pageWidth: settings.width,
      pageCount: 1,
      label: `${settings.width}px Web canvas`,
    };
  if (surface.mode === "social") {
    const format = SOCIAL_FORMATS.find((item) => item.id === surface.format)!;
    return {
      mode: "social",
      width: format.width,
      height: format.height,
      pageWidth: format.width,
      pageCount: 1,
      label: `${format.label} · ${format.width} × ${format.height}px · ${(format.width / format.height).toFixed(3)}:1`,
    };
  }
  const format = PRINT_FORMATS.find((item) => item.id === surface.pageSize)!;
  const pageWidthMm =
    surface.orientation === "portrait" ? format.widthMm : format.heightMm;
  const heightMm =
    surface.orientation === "portrait" ? format.heightMm : format.widthMm;
  const pageCount = surface.pages === "facing" ? 2 : 1;
  const widthMm = pageWidthMm * pageCount;
  return {
    mode: "print",
    width: widthMm * pxPerMm,
    height: heightMm * pxPerMm,
    pageWidth: pageWidthMm * pxPerMm,
    pageCount,
    widthMm,
    heightMm,
    label: `${format.label} ${surface.orientation} · ${surface.pages === "facing" ? "Facing pages" : "Single page"} · ${widthMm} × ${heightMm}mm`,
  };
}

export function validateSurface(value: unknown): SurfaceSettings {
  const surface = value as SurfaceSettings;
  const fail = (): never => {
    throw new Error(
      "This output surface is not supported. Your current work is unchanged.",
    );
  };
  if (!surface || typeof surface !== "object" || Array.isArray(surface)) fail();
  const keys = Object.keys(surface);
  if (surface.mode === "web") {
    if (keys.length !== 1) fail();
    return { mode: "web" };
  }
  if (surface.mode === "print") {
    if (
      keys.length !== 4 ||
      !PRINT_FORMATS.some((item) => item.id === surface.pageSize) ||
      !["portrait", "landscape"].includes(surface.orientation) ||
      !["single", "facing"].includes(surface.pages)
    )
      fail();
    return structuredClone(surface);
  }
  if (surface.mode === "social") {
    if (
      keys.length !== 2 ||
      !SOCIAL_FORMATS.some((item) => item.id === surface.format)
    )
      fail();
    return structuredClone(surface);
  }
  return fail();
}

function layoutForFixed(
  settings: Settings,
  surface: SurfaceSettings,
): LayoutSystem {
  if (settings.layout) return structuredClone(settings.layout);
  if (surface.mode === "print" && settings.composition === "product")
    return applyRecipe(
      { ...settings, composition: "editorial" },
      "asymmetric-editorial",
    ).layout;
  return defaultLayout(settings);
}

export function setSurface(
  settings: Settings,
  surface: SurfaceSettings,
): Settings {
  const valid = validateSurface(surface);
  const previous = surfaceOf(settings);
  const next = structuredClone(settings);
  next.surface = valid;
  if (valid.mode !== "web") {
    next.layout = layoutForFixed(next, valid);
    if (valid.mode === "print" && next.composition === "product")
      next.composition = "editorial";
  }
  if (
    next.layout &&
    valid.mode === "social" &&
    previous.mode === "social" &&
    previous.format !== valid.format &&
    isUneditedSocialStarter(next.layout, previous.format)
  )
    next.layout = withSocialGeometry(
      next.layout,
      next.layout.recipeId as SocialStarterId,
      valid.format,
    );
  if (
    next.layout?.pageGrid &&
    valid.mode === "print" &&
    valid.pages === "facing"
  ) {
    try {
      next.layout = applyPageGrid(
        next.layout,
        next.layout.pageGrid,
        surfaceGeometry(next).pageWidth,
      );
    } catch (error) {
      if (!(error instanceof PageGridError)) throw error;
      // The page grid no longer fits this page; keep its columns as ordinary tracks.
      delete next.layout.pageGrid;
    }
  }
  return next;
}

/** Turns the facing page grid on (with a grid) or off (null, keeping the current tracks). */
export function setPageGrid(
  settings: Settings,
  grid: PageGrid | null,
): Settings {
  const next = structuredClone(settings);
  if (!next.layout) return next;
  if (grid === null) {
    delete next.layout.pageGrid;
    return next;
  }
  next.layout = applyPageGrid(
    next.layout,
    grid,
    surfaceGeometry(next).pageWidth,
  );
  return next;
}

// Phone-readable minimum sizes for the Social starters, in canvas pixels.
// Chosen in reading studies of exported PNGs viewed 360px wide.
function socialReadingCss(settings: Settings) {
  const surface = surfaceOf(settings);
  if (surface.mode !== "social") return "";
  const wide = surface.format === "landscape";
  return `.specimen[data-surface="social"]{--social-display:${wide ? 80 : 96}px;--social-support:${wide ? 40 : 36}px;--social-deck:${wide ? 53.3 : 48}px;--social-quote:${wide ? 53.3 : 48}px;--social-letter-height:auto;--social-letter-ratio:${wide ? "6 / 5" : "1"}}`;
}

export function surfaceCss(settings: Settings): string {
  const geometry = surfaceGeometry(settings);
  if (geometry.mode === "web") return "";
  return `${socialReadingCss(settings)}.specimen[data-surface="${geometry.mode}"]{box-sizing:border-box;width:${geometry.width}px;height:${geometry.height}px;min-width:${geometry.width}px;min-height:${geometry.height}px;max-width:none;overflow:visible;container-type:inline-size}.specimen.layout-enabled[data-surface="${geometry.mode}"][data-format="fixed"] .layout-grid{box-sizing:border-box;width:100%;height:100%;min-height:100%}.specimen.layout-enabled[data-surface="${geometry.mode}"][data-format="fixed"]::before{content:attr(data-overflow-warning)}`;
}

export function printCss(settings: Settings): string {
  const geometry = surfaceGeometry(settings);
  if (geometry.mode !== "print") return "";
  return `@page{size:${geometry.widthMm}mm ${geometry.heightMm}mm;margin:0}@media print{html,body{width:${geometry.widthMm}mm;height:${geometry.heightMm}mm;margin:0}.font-notice{display:none!important}.specimen{width:${geometry.widthMm}mm!important;height:${geometry.heightMm}mm!important;overflow:hidden!important}.surface-guide,.layout-guides,.grid-overlay,.module-overlay,.baseline-overlay{display:none!important}}`;
}

export type SurfaceTemplate = {
  id: string;
  name: string;
  description: string;
  modes: ("print" | "social")[];
};

export const surfaceTemplates: readonly SurfaceTemplate[] = [
  {
    id: "print-editorial-single",
    name: "Editorial single",
    description:
      "A measured editorial page with a reading column and marginal voice.",
    modes: ["print"],
  },
  {
    id: "print-editorial-facing",
    name: "Editorial facing",
    description:
      "Selects Facing pages with a page-contained reading column and a shared display grid.",
    modes: ["print"],
  },
  {
    id: "print-poster",
    name: "Poster",
    description: "A large-scale fixed-page typographic composition.",
    modes: ["print"],
  },
  {
    id: "social-statement",
    name: "Statement",
    description: "A decisive quotation led by display type.",
    modes: ["social"],
  },
  {
    id: "social-announcement",
    name: "Announcement",
    description: "A clear title, deck and supporting marker.",
    modes: ["social"],
  },
  {
    id: "social-editorial-card",
    name: "Editorial card",
    description:
      "A compact title and quotation excerpt with caption and letterform.",
    modes: ["social"],
  },
  ...spreadStarterTemplates.map((template) => ({
    ...template,
    modes: ["print" as const],
  })),
];

const place = (
  column: number,
  span: number,
  row: number,
  rowSpan = 1,
  align: "start" | "center" | "end" | "stretch" = "start",
) => ({ column, span, row, rowSpan, align });

type SocialStarterId =
  "social-statement" | "social-announcement" | "social-editorial-card";
type SocialFormat = (typeof SOCIAL_FORMATS)[number]["id"];

// Readable Social starters, from reading studies at phone size. Fit rows
// take their content height and the flexible row takes the rest, so one
// starter works for different copy. Landscape is short and wide, so it uses
// tighter margins and gaps and a wider quotation.
function socialGeometry(id: SocialStarterId, format: SocialFormat) {
  const wide = format === "landscape";
  const edge = wide ? 24 : 48;
  const fit = { weight: 1, fit: true };
  const flex = { weight: 6 };
  const rows =
    id === "social-statement"
      ? [fit, flex, fit, fit]
      : id === "social-announcement"
        ? [fit, fit, flex, fit, fit]
        : wide
          ? [fit, flex, fit, fit, fit]
          : // Equal flexible rows above and below centre the quotation and letterform.
            [fit, fit, flex, fit, flex, fit, fit];
  const last = rows.length;
  const placements: Record<string, ReturnType<typeof place>> = id ===
  "social-statement"
    ? {
        marker: place(1, 12, 1),
        quote: wide
          ? place(1, 12, 2, 1, "center")
          : place(2, 10, 2, 1, "center"),
        rule: place(1, 12, 3),
        caption: place(1, 12, 4, 1, "end"),
      }
    : id === "social-announcement"
      ? {
          marker: place(1, 12, 1),
          title: place(1, 12, 2),
          deck: place(1, 12, 3),
          rule: place(1, 12, 4),
          caption: place(1, 12, 5, 1, "end"),
        }
      : {
          marker: place(1, 12, 1),
          title: place(1, 12, 2),
          quote: wide ? place(1, 10, 3) : place(1, 8, 4),
          letter: wide ? place(11, 2, 3) : place(9, 4, 4),
          rule: place(1, 12, last - 1),
          caption: place(1, 12, last, 1, "end"),
        };
  return {
    margins: { top: edge, right: edge, bottom: edge, left: edge, linked: true },
    columns: {
      tracks: Array.from({ length: 12 }, () => ({ weight: 1 })),
      gap: wide ? 12 : 18,
    },
    rows: { tracks: rows, gap: wide ? 10 : 20, auto: false },
    placements,
  };
}

function withSocialGeometry(
  layout: LayoutSystem,
  id: SocialStarterId,
  format: SocialFormat,
): LayoutSystem {
  const geometry = socialGeometry(id, format);
  return {
    ...structuredClone(layout),
    margins: geometry.margins,
    columns: geometry.columns,
    rows: geometry.rows,
    variants: {},
    blocks: layout.blocks.map((block) => ({
      ...block,
      placement: {
        wide: geometry.placements[block.id] ?? block.placement.wide,
      },
    })),
  };
}

const isSocialStarter = (id: string): id is SocialStarterId =>
  ["social-statement", "social-announcement", "social-editorial-card"].includes(
    id,
  );

/** True when a Social starter's geometry and placements are still as applied. */
function isUneditedSocialStarter(layout: LayoutSystem, format: SocialFormat) {
  if (!isSocialStarter(layout.recipeId)) return false;
  const expected = withSocialGeometry(layout, layout.recipeId, format);
  return (
    JSON.stringify([layout.margins, layout.columns, layout.rows]) ===
      JSON.stringify([expected.margins, expected.columns, expected.rows]) &&
    layout.blocks.every(
      (block, index) =>
        JSON.stringify(block.placement) ===
        JSON.stringify(expected.blocks[index].placement),
    )
  );
}

export function applySurfaceTemplate(settings: Settings, id: string): Settings {
  if (!surfaceTemplates.some((template) => template.id === id))
    throw new Error(`Unknown surface template: ${id}`);
  if (isSpreadStarter(id)) {
    const base = applyRecipe(settings, "asymmetric-editorial");
    const surface = surfaceOf(base);
    if (surface.mode !== "print")
      throw new Error("Facing-spread starters are available for Print.");
    base.surface = { ...surface, pages: "facing" };
    const geometry = surfaceGeometry(base);
    base.layout = spreadStarterLayout(
      base.layout,
      id,
      geometry.pageWidth,
      geometry.height!,
    );
    return base;
  }
  let next: Settings;
  if (id === "print-poster") next = applyRecipe(settings, "typographic-poster");
  else if (id === "print-editorial-single")
    next = applyRecipe(settings, "marginal-essay");
  else
    next = applyRecipe(
      settings,
      id === "social-editorial-card"
        ? "book-page"
        : id === "social-statement"
          ? "typographic-poster"
          : "asymmetric-editorial",
    );
  const layout = next.layout!;
  const surface = surfaceOf(next);
  if (surface.mode === "print" && id.startsWith("print-")) {
    next.surface = {
      ...surface,
      pages:
        id === "print-editorial-facing"
          ? "facing"
          : id === "print-editorial-single"
            ? "single"
            : surface.pages,
    };
    layout.recipeId = id;
  }
  if (id === "print-poster") {
    const facing = surface.mode === "print" && surface.pages === "facing";
    layout.columns.gap = facing ? 48 : 24;
    layout.rows.gap = 16;
    const placements: Record<string, ReturnType<typeof place>> = facing
      ? {
          body: place(4, 3, 7, 2),
          quote: place(1, 3, 7),
          caption: place(1, 3, 8),
          rule: place(1, 6, 9, 1, "end"),
        }
      : {
          deck: place(5, 2, 4),
          quote: place(5, 2, 5, 2),
          body: place(1, 5, 7, 2),
          caption: place(6, 1, 7, 2),
          rule: place(1, 6, 9, 1, "end"),
        };
    layout.blocks = layout.blocks.map((block) => ({
      ...block,
      placement: { wide: placements[block.id] ?? block.placement.wide },
    }));
  }
  if (id === "print-editorial-facing") {
    layout.recipeId = id;
    layout.family = "column";
    layout.columns = {
      tracks: Array.from({ length: 12 }, () => ({ weight: 1 })),
      gap: 24,
    };
    layout.margins = {
      top: 36,
      right: 42,
      bottom: 36,
      left: 42,
      linked: false,
    };
    layout.rows = {
      tracks: Array.from({ length: 8 }, () => ({ weight: 1 })),
      gap: 16,
      auto: false,
    };
    const placements: Record<string, ReturnType<typeof place>> = {
      marker: place(1, 12, 1),
      title: place(2, 10, 2, 2),
      rule: place(1, 12, 4, 1, "end"),
      deck: place(2, 4, 4),
      body: place(2, 4, 5, 4),
      quote: place(8, 4, 7),
      letter: place(8, 4, 5, 2),
      caption: place(8, 4, 8),
    };
    layout.blocks = layout.blocks.map((block) => ({
      ...block,
      placement: { wide: placements[block.id] ?? block.placement.wide },
    }));
  }
  if (id.startsWith("social-")) {
    const format = surface.mode === "social" ? surface.format : "square";
    layout.recipeId = id;
    layout.family =
      id === "social-statement"
        ? "hierarchical"
        : id === "social-announcement"
          ? "column"
          : "modular";
    const kept =
      id === "social-statement"
        ? ["marker", "quote", "rule", "caption"]
        : ["marker", "title", "deck", "rule", "caption"];
    layout.blocks =
      id === "social-editorial-card"
        ? [
            ...layout.blocks.filter((block) =>
              ["marker", "title", "caption", "rule"].includes(block.type),
            ),
            {
              id: "quote",
              type: "quote" as const,
              label: "Quotation excerpt",
              contentKey: "quote" as const,
              placement: { wide: place(1, 1, 1) },
            },
            {
              id: "letter",
              type: "letter" as const,
              label: "Letterform",
              content: "&",
              placement: { wide: place(1, 1, 1) },
            },
          ]
        : layout.blocks.filter((block) => kept.includes(block.type));
    next.layout = withSocialGeometry(layout, id as SocialStarterId, format);
  }
  return next;
}
