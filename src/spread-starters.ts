import type {
  GridFamily,
  LayoutBlock,
  LayoutSystem,
  Placement,
} from "./layout";
import { compilePageGrid, type PageGrid, type PageGridMode } from "./page-grid";

// Facing-spread starters built on a page grid, drawing on classic book and
// editorial spread structures (mirrored margins, note columns, shared horizons).
// Margins are authored for A4 portrait and scaled to the selected page.
const A4_PAGE_WIDTH = (210 * 96) / 25.4;
const A4_PAGE_HEIGHT = (297 * 96) / 25.4;

export const SPREAD_STARTER_IDS = [
  "print-spread-book",
  "print-spread-notes",
  "print-spread-channel",
  "print-spread-two-grids",
  "print-spread-bridge",
] as const;
export type SpreadStarterId = (typeof SPREAD_STARTER_IDS)[number];

export const spreadStarterTemplates: readonly {
  id: SpreadStarterId;
  name: string;
  description: string;
}[] = [
  {
    id: "print-spread-book",
    name: "Book page",
    description:
      "Facing pages with mirrored text blocks, a narrow spine and wide outer margins, for long reading.",
  },
  {
    id: "print-spread-notes",
    name: "Margin notes",
    description:
      "Facing pages with a main reading column and a narrow note column on each outer edge.",
  },
  {
    id: "print-spread-channel",
    name: "Spine channel",
    description:
      "Facing pages with two columns pushed to the outer edges and a slim channel beside the fold.",
  },
  {
    id: "print-spread-two-grids",
    name: "Two grids, one horizon",
    description:
      "Two text columns opposite a three-column picture grid, sharing their top lines.",
  },
  {
    id: "print-spread-bridge",
    name: "Bridge band",
    description:
      "Page-contained reading columns with a display band and title that cross the fold on purpose.",
  },
];

// Editable sample copy for the second page. Shared content fields are untouched.
const copy = {
  turn: "Turn the page and the eye lands on the right first. That is why the right-hand page carries the weight of a spread, and why the margins around it matter as much as the words inside.\n\nA narrow margin at the spine lets the two blocks of text lean towards each other. A wider margin at the outer edge gives the thumb somewhere to rest and the eye somewhere to pause. A deeper foot keeps the block from sliding off the bottom of the page.",
  repeat:
    "None of these measures is a rule. Each is a decision about how two pages should feel when they are held open together: close or apart, calm or restless, ordered or loose.\n\nWhen the same structure repeats on every spread, the reader stops noticing it. That is the point. A good page grid disappears into the reading and returns only when something is meant to break it.",
  white:
    "Open any well-made book and look at the white before you look at the words. The shape of that white, page after page, is the first thing the book says about itself.",
  notes: [
    "Margins hold the page. They are part of the design, not what is left over.",
    "Notes sit in the outer column so the reading line stays clean.",
    "The note column mirrors from page to page. It always sits on the outside edge.",
    "Short lines and small type: notes are for scanning, not for reading straight through.",
  ],
  headLeft: "Counterform Review",
  headRight: "The shape of the quiet",
};

const at = (
  column: number,
  span: number,
  row: number,
  rowSpan = 1,
  align: Placement["align"] = "start",
) => ({ wide: { column, span, row, rowSpan, align } });

type Columns = {
  v: (i: number) => number;
  r: (i: number) => number;
  count: number;
};
type Spec = {
  family: GridFamily;
  mode: PageGridMode;
  inside: number;
  outside: number;
  top: number;
  bottom: number;
  gap: number;
  left: number[];
  right?: number[];
  rows: number[];
  blocks: (c: Columns) => LayoutBlock[];
};

const shared = (
  id: "title" | "deck" | "body" | "quote" | "caption",
  label: string,
  placement: LayoutBlock["placement"],
): LayoutBlock => ({ id, type: id, label, contentKey: id, placement });
const own = (
  id: string,
  type: LayoutBlock["type"],
  label: string,
  placement: LayoutBlock["placement"],
  content?: string,
): LayoutBlock => ({
  id,
  type,
  label,
  placement,
  ...(content === undefined ? {} : { content }),
});

const specs: Record<SpreadStarterId, Spec> = {
  "print-spread-book": {
    family: "manuscript",
    mode: "mirror",
    inside: 60,
    outside: 132,
    top: 60,
    bottom: 84,
    gap: 24,
    left: [1],
    rows: [0.5, 2.4, 0.9, 9.6, 0.4],
    blocks: ({ v, r }) => [
      own(
        "running-head-left",
        "caption",
        "Running head, left page",
        at(v(1), 1, 1),
        copy.headLeft,
      ),
      own(
        "running-head-right",
        "caption",
        "Running head, right page",
        at(r(1), 1, 1),
        copy.headRight,
      ),
      shared("title", "Title", at(v(1), 1, 2)),
      shared("deck", "Deck", at(v(1), 1, 3)),
      shared("body", "Reading text", at(v(1), 1, 4)),
      own(
        "body-continued",
        "body",
        "Reading text, right page",
        at(r(1), 1, 2, 3),
        `${copy.turn}\n\n${copy.repeat}\n\n${copy.white}`,
      ),
    ],
  },
  "print-spread-notes": {
    family: "hierarchical",
    mode: "mirror",
    inside: 56,
    outside: 56,
    top: 60,
    bottom: 84,
    gap: 24,
    left: [0.3, 1],
    rows: [0.5, 2.4, 0.9, 9.6, 0.4],
    blocks: ({ v, r }) => [
      own(
        "running-head-left",
        "caption",
        "Running head, left page",
        at(v(2), 1, 1),
        copy.headLeft,
      ),
      own(
        "running-head-right",
        "caption",
        "Running head, right page",
        at(r(1), 1, 1),
        copy.headRight,
      ),
      shared("title", "Title", at(v(2), 1, 2)),
      shared("deck", "Deck", at(v(2), 1, 3)),
      shared("body", "Reading text", at(v(2), 1, 4)),
      own(
        "note-1",
        "caption",
        "Margin note",
        at(v(1), 1, 4, 1, "start"),
        copy.notes[0],
      ),
      own(
        "note-2",
        "caption",
        "Margin note",
        at(v(1), 1, 4, 1, "center"),
        copy.notes[1],
      ),
      shared("quote", "Pull quote", at(r(2), 1, 2, 2)),
      own(
        "body-continued",
        "body",
        "Reading text, right page",
        at(r(1), 1, 2, 3),
        `${copy.turn}\n\n${copy.repeat}`,
      ),
      own(
        "note-3",
        "caption",
        "Margin note",
        at(r(2), 1, 4, 1, "center"),
        copy.notes[2],
      ),
      own(
        "note-4",
        "caption",
        "Margin note",
        at(r(2), 1, 4, 1, "end"),
        copy.notes[3],
      ),
    ],
  },
  "print-spread-channel": {
    family: "column",
    mode: "mirror",
    inside: 36,
    outside: 48,
    top: 44,
    bottom: 52,
    gap: 20,
    left: [1, 1, 0.28],
    rows: [2.3, 0.8, 10.4, 0.3],
    blocks: ({ v, r }) => [
      shared("title", "Title", at(v(1), 2, 1)),
      shared("deck", "Deck", at(v(1), 2, 2)),
      shared("body", "Reading text", at(v(1), 1, 3)),
      own(
        "body-continued",
        "body",
        "Reading text, second column",
        at(v(2), 1, 3),
        copy.turn,
      ),
      own(
        "channel-left",
        "caption",
        "Spine channel, left page",
        at(v(3), 1, 1),
        copy.headRight,
      ),
      own(
        "channel-right",
        "caption",
        "Spine channel, right page",
        at(r(1), 1, 1),
        copy.headLeft,
      ),
      shared("quote", "Pull quote", at(r(2), 2, 1, 2, "start")),
      own(
        "body-right",
        "body",
        "Reading text, right page",
        at(r(2), 1, 3),
        copy.repeat,
      ),
      own("letter", "letter", "Letterform", at(r(3), 1, 3), "&"),
      shared("caption", "Caption", at(r(3), 1, 4)),
    ],
  },
  "print-spread-two-grids": {
    family: "modular",
    mode: "independent",
    inside: 48,
    outside: 56,
    top: 60,
    bottom: 72,
    gap: 24,
    left: [1, 1],
    right: [1, 1, 1],
    rows: [0.5, 2.3, 3.1, 3.1, 3.1, 0.6],
    blocks: ({ v, r }) => [
      own(
        "running-head-left",
        "caption",
        "Running head, left page",
        at(v(1), 2, 1),
        copy.headLeft,
      ),
      own(
        "running-head-right",
        "caption",
        "Running head, right page",
        at(r(1), 3, 1),
        copy.headRight,
      ),
      shared("title", "Title", at(v(1), 2, 2)),
      shared("body", "Reading text", at(v(1), 1, 3, 3)),
      own(
        "body-continued",
        "body",
        "Reading text, second column",
        at(v(2), 1, 3, 3),
        copy.turn,
      ),
      shared("quote", "Pull quote", at(r(1), 3, 2)),
      own("picture-1", "panel", "Picture", at(r(1), 2, 3, 1, "stretch")),
      own("letter", "letter", "Letterform", at(r(3), 1, 3, 1, "stretch"), "&"),
      own("picture-2", "panel", "Picture", at(r(1), 1, 4, 1, "stretch")),
      own("picture-3", "panel", "Picture", at(r(2), 2, 4, 1, "stretch")),
      own("picture-4", "panel", "Picture", at(r(1), 1, 5, 1, "stretch")),
      own("picture-5", "panel", "Picture", at(r(2), 1, 5, 1, "stretch")),
      shared("caption", "Caption", at(r(3), 1, 5)),
    ],
  },
  "print-spread-bridge": {
    family: "hierarchical",
    mode: "mirror",
    inside: 56,
    outside: 64,
    top: 60,
    bottom: 84,
    gap: 24,
    left: [1, 0.5],
    rows: [0.5, 3.2, 8.6, 0.4],
    blocks: ({ v, r, count }) => [
      own(
        "running-head-left",
        "caption",
        "Running head, left page",
        at(v(1), 1, 1),
        copy.headLeft,
      ),
      own(
        "running-head-right",
        "caption",
        "Running head, right page",
        at(r(2), 1, 1),
        copy.headRight,
      ),
      own(
        "band",
        "panel",
        "Band across the fold",
        at(1, count, 2, 1, "stretch"),
      ),
      shared("title", "Title across the fold", at(v(2), 3, 2, 1, "center")),
      shared("body", "Reading text", at(v(1), 1, 3)),
      shared("deck", "Deck", at(v(2), 1, 3)),
      shared("quote", "Pull quote", at(r(1), 1, 3)),
      shared("caption", "Caption", at(r(1), 1, 3, 1, "end")),
      own(
        "body-continued",
        "body",
        "Reading text, right page",
        at(r(2), 1, 3),
        `${copy.turn}\n\n${copy.repeat}`,
      ),
    ],
  },
};

export const isSpreadStarter = (id: string): id is SpreadStarterId =>
  (SPREAD_STARTER_IDS as readonly string[]).includes(id);

/** The page grid a starter uses at this page size. */
export function spreadStarterGrid(
  id: SpreadStarterId,
  pageWidth: number,
  pageHeight: number,
): PageGrid {
  const spec = specs[id];
  const sx = pageWidth / A4_PAGE_WIDTH;
  const sy = pageHeight / A4_PAGE_HEIGHT;
  const scale = (value: number, by: number) =>
    Math.min(240, Math.round(value * by));
  const inside = Math.max(30, scale(spec.inside, sx));
  const gap = Math.min(scale(spec.gap, sx), inside - 6);
  return {
    mode: spec.mode,
    inside,
    outside: scale(spec.outside, sx),
    top: scale(spec.top, sy),
    bottom: scale(spec.bottom, sy),
    gap,
    left: spec.left.map((weight) => ({ weight })),
    ...(spec.right ? { right: spec.right.map((weight) => ({ weight })) } : {}),
  };
}

/** Replaces geometry and blocks with the starter's; other layout settings are kept. */
export function spreadStarterLayout(
  layout: LayoutSystem,
  id: SpreadStarterId,
  pageWidth: number,
  pageHeight: number,
): LayoutSystem {
  const spec = specs[id];
  const grid = spreadStarterGrid(id, pageWidth, pageHeight);
  const compiled = compilePageGrid(grid, pageWidth);
  const next = structuredClone(layout);
  next.recipeId = id;
  next.family = spec.family;
  next.format = { mode: "flow" };
  next.pageGrid = grid;
  next.margins = compiled.margins;
  next.columns = compiled.columns;
  next.rows = {
    tracks: spec.rows.map((weight) => ({ weight })),
    gap: 16,
    auto: false,
  };
  next.variants = {};
  next.blocks = spec.blocks({
    v: (i) => i,
    r: (i) => compiled.spine + i,
    count: compiled.columns.tracks.length,
  });
  return next;
}
