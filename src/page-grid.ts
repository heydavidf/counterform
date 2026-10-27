import type {
  LayoutMargins,
  LayoutSystem,
  LayoutTrack,
  Placement,
} from "./layout";

// A facing-page grid describes one page and is compiled into the spread's
// ordinary tracks, so rendering, comparison and every export stay unchanged.
// The fold becomes an empty spine track rather than an overlay.
export type PageGridMode = "mirror" | "repeat" | "independent";
export type PageGrid = {
  mode: PageGridMode;
  /** Left page margin at the fold, in CSS px. */
  inside: number;
  /** Left page margin at its outer edge, in CSS px. */
  outside: number;
  top: number;
  bottom: number;
  gap: number;
  /** Left page columns, as printed from left to right. */
  left: LayoutTrack[];
  /** Right page columns as printed; only in independent mode. */
  right?: LayoutTrack[];
};

export const PAGE_GRID_MAX_COLUMNS = 7;
const MIN_COLUMN_PX = 16;

export const pageGridModes: readonly {
  id: PageGridMode;
  label: string;
  note: string;
}[] = [
  {
    id: "mirror",
    label: "Mirror",
    note: "The right page is a mirror image of the left.",
  },
  {
    id: "repeat",
    label: "Repeat",
    note: "Both pages use the same margins and columns.",
  },
  {
    id: "independent",
    label: "Own right page",
    note: "The right page has its own columns; both pages share their rows.",
  },
];

export class PageGridError extends Error {}

/** Margins of the right page as printed, from the left page's settings. */
function rightPageMargins(grid: PageGrid) {
  return grid.mode === "repeat"
    ? { left: grid.outside, right: grid.inside }
    : { left: grid.inside, right: grid.outside };
}

function rightPageTracks(grid: PageGrid): LayoutTrack[] {
  if (grid.mode === "independent") return grid.right ?? grid.left;
  if (grid.mode === "mirror") return [...grid.left].reverse();
  return grid.left;
}

export type CompiledPageGrid = {
  margins: LayoutMargins;
  columns: { tracks: LayoutTrack[]; gap: number };
  leftCount: number;
  rightCount: number;
  spine: number;
  /** Track widths in CSS px, for diagnostics and evidence. */
  trackPx: number[];
};

export function compilePageGrid(
  grid: PageGrid,
  pageWidth: number,
): CompiledPageGrid {
  const right = rightPageTracks(grid);
  const rightMargins = rightPageMargins(grid);
  const spine = grid.inside + rightMargins.left - 2 * grid.gap;
  if (spine <= 0)
    throw new PageGridError(
      "Make the inside margin wider than the column gap so the fold stays clear.",
    );
  const columnsFor = (tracks: LayoutTrack[], margins: number) => {
    const free = pageWidth - margins - (tracks.length - 1) * grid.gap;
    const total = tracks.reduce((sum, track) => sum + track.weight, 0);
    const widths = tracks.map((track) => (track.weight / total) * free);
    if (widths.some((width) => width < MIN_COLUMN_PX))
      throw new PageGridError(
        "These margins and columns leave too little room on the page. Reduce the margins, gap or column count.",
      );
    return widths;
  };
  const leftPx = columnsFor(grid.left, grid.outside + grid.inside);
  const rightPx = columnsFor(right, rightMargins.left + rightMargins.right);
  const trackPx = [...leftPx, spine, ...rightPx];
  // Track weights are relative and capped at 12; scale the widths to fit.
  const unit = Math.max(...trackPx) / 12;
  return {
    margins: {
      top: grid.top,
      bottom: grid.bottom,
      left: grid.outside,
      right: rightMargins.right,
      linked: false,
    },
    columns: {
      tracks: trackPx.map((px) => ({
        weight: Math.max(0.0001, Number((px / unit).toFixed(4))),
      })),
      gap: grid.gap,
    },
    leftCount: leftPx.length,
    rightCount: rightPx.length,
    spine: leftPx.length + 1,
    trackPx,
  };
}

export function validatePageGrid(value: unknown, trackCount: number): PageGrid {
  const grid = value as PageGrid;
  const fail = (): never => {
    throw new Error(
      "This page grid is not supported. Your current work is unchanged.",
    );
  };
  const tracksValid = (tracks: unknown) =>
    Array.isArray(tracks) &&
    tracks.length >= 1 &&
    tracks.length <= PAGE_GRID_MAX_COLUMNS &&
    tracks.every(
      (track) =>
        track &&
        Number.isFinite(track.weight) &&
        track.weight > 0 &&
        track.weight <= 12,
    );
  if (
    !grid ||
    typeof grid !== "object" ||
    !["mirror", "repeat", "independent"].includes(grid.mode) ||
    [grid.inside, grid.outside, grid.top, grid.bottom].some(
      (n) => !Number.isFinite(n) || n < 0 || n > 240,
    ) ||
    !Number.isFinite(grid.gap) ||
    grid.gap < 0 ||
    grid.gap > 64 ||
    !tracksValid(grid.left) ||
    (grid.mode === "independent"
      ? !tracksValid(grid.right)
      : grid.right !== undefined)
  )
    fail();
  const rightCount =
    grid.mode === "independent" ? grid.right!.length : grid.left.length;
  if (trackCount !== grid.left.length + 1 + rightCount) fail();
  return structuredClone(grid);
}

export function defaultPageGrid(layout: LayoutSystem): PageGrid {
  const gap = Math.min(layout.columns.gap, 32);
  return {
    mode: "mirror",
    inside: Math.max(48, gap + 24),
    outside: 72,
    top: layout.margins.top,
    bottom: layout.margins.bottom,
    gap,
    left: Array.from({ length: 6 }, () => ({ weight: 1 })),
  };
}

type Bounds = { start: number; end: number };
function trackBounds(
  tracks: LayoutTrack[],
  gap: number,
  left: number,
  right: number,
  width: number,
): Bounds[] {
  const free = width - left - right - (tracks.length - 1) * gap;
  const total = tracks.reduce((sum, track) => sum + track.weight, 0);
  let x = left;
  return tracks.map((track) => {
    const start = x;
    const end = start + (track.weight / total) * free;
    x = end + gap;
    return { start, end };
  });
}

/**
 * Moves each block to the new columns nearest its old left and right edges.
 * A block that sat on one page stays on that page; a block that crossed the
 * fold may keep crossing it. Rows are unchanged.
 */
function remapPlacements(
  before: LayoutSystem,
  compiled: CompiledPageGrid,
  spreadWidth: number,
): LayoutSystem["blocks"] {
  const old = trackBounds(
    before.columns.tracks,
    before.columns.gap,
    before.margins.left,
    before.margins.right,
    spreadWidth,
  );
  const next = trackBounds(
    compiled.columns.tracks,
    compiled.columns.gap,
    compiled.margins.left,
    compiled.margins.right,
    spreadWidth,
  );
  const fold = spreadWidth / 2;
  const spineIndex = compiled.spine - 1;
  return before.blocks.map((block) => {
    const wide = block.placement.wide;
    const first = old[Math.min(wide.column, old.length) - 1];
    const last = old[Math.min(wide.column + wide.span - 1, old.length) - 1];
    const x0 = first.start,
      x1 = last.end;
    const crosses = x0 < fold && x1 > fold;
    const page = (x0 + x1) / 2 < fold ? "left" : "right";
    const allowed = next
      .map((bounds, index) => ({ ...bounds, index }))
      .filter(
        ({ index }) =>
          index !== spineIndex &&
          (crosses ||
            (page === "left" ? index < spineIndex : index > spineIndex)),
      );
    const nearest = (
      list: typeof allowed,
      key: "start" | "end",
      target: number,
    ) =>
      list.reduce((best, item) =>
        Math.abs(item[key] - target) < Math.abs(best[key] - target)
          ? item
          : best,
      );
    const start = nearest(allowed, "start", x0);
    const end = nearest(
      allowed.filter((item) => item.index >= start.index),
      "end",
      x1,
    );
    const placement: Placement = {
      ...wide,
      column: start.index + 1,
      span: end.index - start.index + 1,
    };
    return { ...block, placement: { wide: placement } };
  });
}

/**
 * Returns a layout whose columns and margins come from the page grid.
 * Placements are kept when the column structure is unchanged, otherwise
 * moved to the nearest matching columns.
 */
export function applyPageGrid(
  layout: LayoutSystem,
  grid: PageGrid,
  pageWidth: number,
): LayoutSystem {
  const compiled = compilePageGrid(grid, pageWidth);
  const next = structuredClone(layout);
  const sameStructure =
    layout.pageGrid !== undefined &&
    layout.columns.tracks.length === compiled.columns.tracks.length &&
    layout.pageGrid.left.length === compiled.leftCount;
  if (!sameStructure)
    next.blocks = remapPlacements(layout, compiled, pageWidth * 2);
  next.pageGrid = structuredClone(grid);
  next.margins = compiled.margins;
  next.columns = compiled.columns;
  next.variants = {};
  return next;
}

export function pageGridSummary(grid: PageGrid): string {
  const mode = pageGridModes.find((item) => item.id === grid.mode)!;
  const right =
    grid.mode === "independent" ? grid.right!.length : grid.left.length;
  const margins =
    grid.mode === "repeat"
      ? `left ${grid.outside}px and right ${grid.inside}px on each page`
      : `inside ${grid.inside}px and outside ${grid.outside}px`;
  return `${mode.label} page grid: ${grid.left.length} column${grid.left.length === 1 ? "" : "s"} on the left page and ${right} on the right, ${margins}, top ${grid.top}px, bottom ${grid.bottom}px, ${grid.gap}px column gap. The fold is an empty spine track.`;
}
