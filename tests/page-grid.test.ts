import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GridEditor } from "../src/GridEditor";
import { settingsDifferences } from "../src/comparison";
import { describeLayout } from "../src/layout-document";
import { validateLayout, type LayoutSystem } from "../src/layout";
import { defaultSettings, validateSettings, type Settings } from "../src/model";
import {
  PageGridError,
  compilePageGrid,
  defaultPageGrid,
  type PageGrid,
} from "../src/page-grid";
import { renderSpecimen } from "../src/render";
import { SPREAD_STARTER_IDS } from "../src/spread-starters";
import {
  applySurfaceTemplate,
  setPageGrid,
  setSurface,
  surfaceGeometry,
  type SurfaceSettings,
} from "../src/surface";

const A4_PAGE = (210 * 96) / 25.4;
const facingA4: SurfaceSettings = {
  mode: "print",
  pageSize: "a4",
  orientation: "portrait",
  pages: "facing",
};
const facing = (surface: SurfaceSettings = facingA4) =>
  applySurfaceTemplate(
    setSurface(defaultSettings(), surface),
    "print-editorial-facing",
  );
const grid = (overrides: Partial<PageGrid> = {}): PageGrid => ({
  mode: "mirror",
  inside: 60,
  outside: 132,
  top: 60,
  bottom: 84,
  gap: 24,
  left: [{ weight: 1 }],
  ...overrides,
});
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** Track edges in sheet px, computed the way CSS grid distributes fr tracks. */
function trackEdges(layout: LayoutSystem, width: number) {
  const { tracks, gap } = layout.columns;
  const free =
    width -
    layout.margins.left -
    layout.margins.right -
    (tracks.length - 1) * gap;
  const total = sum(tracks.map((track) => track.weight));
  let x = layout.margins.left;
  return tracks.map((track) => {
    const start = x;
    x = start + (track.weight / total) * free;
    const edge = { start, end: x };
    x += gap;
    return edge;
  });
}

describe("Page grid compiler", () => {
  it("mirrors margins and columns around an empty spine track", () => {
    const compiled = compilePageGrid(
      grid({ left: [{ weight: 0.3 }, { weight: 1 }], inside: 56, outside: 56 }),
      A4_PAGE,
    );
    const px = compiled.trackPx;
    expect(compiled.columns.tracks).toHaveLength(5);
    expect(compiled.spine).toBe(3);
    expect(px[2]).toBeCloseTo(2 * 56 - 2 * 24, 6);
    expect(px[0]).toBeCloseTo(px[4], 6);
    expect(px[1]).toBeCloseTo(px[3], 6);
    expect(compiled.margins).toMatchObject({
      left: 56,
      right: 56,
      top: 60,
      bottom: 84,
    });
    expect(sum(px) + 4 * 24).toBeCloseTo(2 * A4_PAGE - 112, 6);
    expect(
      Math.max(...compiled.columns.tracks.map((t) => t.weight)),
    ).toBeLessThanOrEqual(12);
  });

  it("repeats margins and column order on both pages", () => {
    const compiled = compilePageGrid(
      grid({
        mode: "repeat",
        inside: 40,
        outside: 120,
        left: [{ weight: 2 }, { weight: 1 }],
      }),
      A4_PAGE,
    );
    const px = compiled.trackPx;
    expect(compiled.margins.left).toBe(120);
    expect(compiled.margins.right).toBe(40);
    expect(px[2]).toBeCloseTo(40 + 120 - 48, 6);
    expect(px[0]).toBeCloseTo(px[3], 6);
    expect(px[1]).toBeCloseTo(px[4], 6);
    expect(px[0]).toBeGreaterThan(px[1]);
  });

  it("gives the right page its own columns in independent mode", () => {
    const compiled = compilePageGrid(
      grid({
        mode: "independent",
        inside: 48,
        outside: 56,
        left: [{ weight: 1 }, { weight: 1 }],
        right: [{ weight: 1 }, { weight: 1 }, { weight: 1 }],
      }),
      A4_PAGE,
    );
    expect(compiled.leftCount).toBe(2);
    expect(compiled.rightCount).toBe(3);
    expect(compiled.columns.tracks).toHaveLength(6);
    expect(compiled.margins.right).toBe(56);
  });

  it("refuses a fold narrower than the gap and pages too narrow for their columns", () => {
    expect(() =>
      compilePageGrid(grid({ inside: 24, gap: 24 }), A4_PAGE),
    ).toThrow(PageGridError);
    expect(() =>
      compilePageGrid(
        grid({
          outside: 240,
          inside: 240,
          gap: 40,
          left: Array.from({ length: 7 }, () => ({ weight: 1 })),
        }),
        A4_PAGE,
      ),
    ).toThrow(PageGridError);
  });
});

describe("Page grid in saved studies", () => {
  it("validates a page grid only when it matches the compiled track count", () => {
    const settings = setPageGrid(facing(), grid());
    expect(validateLayout(settings.layout)).toEqual(settings.layout);
    const mismatched = structuredClone(settings.layout!);
    mismatched.columns.tracks.push({ weight: 1 });
    mismatched.blocks.forEach((block) => (block.placement.wide.column = 1));
    expect(() => validateLayout(mismatched)).toThrow(
      "page grid is not supported",
    );
    const badMode = structuredClone(settings.layout!) as unknown as {
      pageGrid: { mode: string };
    };
    badMode.pageGrid.mode = "diagonal";
    expect(() => validateLayout(badMode)).toThrow();
    const strayRight = structuredClone(settings.layout!);
    strayRight.pageGrid!.right = [{ weight: 1 }];
    expect(() => validateLayout(strayRight)).toThrow();
  });

  it("loads historical facing studies unchanged and without a page grid", () => {
    const folder = resolve(
      "tests/fixtures/facing",
    );
    const files = readdirSync(folder).filter((name) => name.endsWith(".json"));
    expect(files.length).toBeGreaterThan(5);
    for (const name of files) {
      const settings = JSON.parse(
        readFileSync(resolve(folder, name), "utf8"),
      ) as Settings;
      const validated = validateSettings(structuredClone(settings));
      expect(validated.layout?.pageGrid).toBeUndefined();
      expect(
        setSurface(settings, settings.surface ?? { mode: "web" }).layout,
      ).toEqual(settings.layout);
    }
  });

  it("recompiles for a new page size, keeps placements, and survives single pages", () => {
    const a4 = setPageGrid(
      facing(),
      grid({ left: [{ weight: 1 }, { weight: 1 }] }),
    );
    const a3 = setSurface(a4, { ...facingA4, pageSize: "a3" });
    expect(a3.layout!.pageGrid).toEqual(a4.layout!.pageGrid);
    expect(a3.layout!.blocks).toEqual(a4.layout!.blocks);
    const expected = compilePageGrid(
      a4.layout!.pageGrid!,
      surfaceGeometry(a3).pageWidth,
    );
    expect(a3.layout!.columns).toEqual(expected.columns);
    expect(a3.layout!.columns).not.toEqual(a4.layout!.columns);
    const single = setSurface(a3, {
      ...facingA4,
      pageSize: "a3",
      pages: "single",
    });
    expect(single.layout!.pageGrid).toEqual(a4.layout!.pageGrid);
    const back = setSurface(single, { ...facingA4, pageSize: "a4" });
    expect(back.layout!.columns).toEqual(a4.layout!.columns);
  });

  it("turns off without changing tracks, and turning on keeps blocks on their page", () => {
    const before = facing();
    const on = setPageGrid(before, defaultPageGrid(before.layout!));
    validateLayout(on.layout);
    const fold = surfaceGeometry(on).pageWidth;
    const oldEdges = trackEdges(before.layout!, 2 * fold);
    const newEdges = trackEdges(on.layout!, 2 * fold);
    const spine = on.layout!.pageGrid!.left.length + 1;
    for (const block of on.layout!.blocks) {
      const prior = before.layout!.blocks.find((item) => item.id === block.id)!
        .placement.wide;
      const was = [
        oldEdges[prior.column - 1].start,
        oldEdges[prior.column + prior.span - 2].end,
      ];
      const now = [
        newEdges[block.placement.wide.column - 1].start,
        newEdges[block.placement.wide.column + block.placement.wide.span - 2]
          .end,
      ];
      const crossed = was[0] < fold && was[1] > fold;
      if (!crossed) expect(now[0] < fold).toBe(was[0] < fold);
      if (!crossed) expect(now[1] <= fold + 1).toBe(was[1] <= fold + 1);
      expect(
        block.placement.wide.column === spine &&
          block.placement.wide.span === 1,
      ).toBe(false);
    }
    const off = setPageGrid(on, null);
    expect(off.layout!.pageGrid).toBeUndefined();
    expect(off.layout!.columns).toEqual(on.layout!.columns);
    expect(off.layout!.margins).toEqual(on.layout!.margins);
  });

  it("names page grid changes in plain words for A/B", () => {
    const a = setPageGrid(
      facing(),
      grid({ left: [{ weight: 1 }, { weight: 1 }] }),
    );
    const b = setPageGrid(
      a,
      grid({ inside: 72, left: [{ weight: 1 }, { weight: 2 }] }),
    );
    const labels = settingsDifferences(a, b).map((item) => item.label);
    expect(labels).toContain("Page grid · inside margin");
    expect(labels).toContain("Page grid · left page column 2");
  });

  it("describes the page grid in the exported DESIGN.md layout", () => {
    const text = describeLayout(setPageGrid(facing(), grid()));
    expect(text).toContain(
      "Mirror page grid: 1 column on the left page and 1 on the right",
    );
    expect(text).toContain("The fold is an empty spine track.");
    expect(describeLayout(facing())).toContain("one continuous spread grid");
  });
});

describe("Facing-spread starters", () => {
  const surfaces: SurfaceSettings[] = [
    facingA4,
    { ...facingA4, pageSize: "a5" },
    { ...facingA4, pageSize: "a3" },
    { ...facingA4, pageSize: "letter" },
    { ...facingA4, orientation: "landscape" },
  ];

  it.each(
    SPREAD_STARTER_IDS.flatMap((id) =>
      surfaces.map((surface) => [id, surface] as const),
    ),
  )("%s builds a valid page-grid spread on %j", (id, surface) => {
    const source = setSurface(defaultSettings(), {
      ...surface,
      pages: "single",
    } as SurfaceSettings);
    const settings = applySurfaceTemplate(source, id);
    expect(validateSettings(structuredClone(settings))).toBeTruthy();
    expect(settings.surface).toEqual({ ...surface, pages: "facing" });
    expect(settings.content).toEqual(source.content);
    expect(settings.roles).toEqual(source.roles);
    expect(settings.palette).toEqual(source.palette);
    const layout = settings.layout!;
    expect(layout.recipeId).toBe(id);
    expect(layout.pageGrid).toBeDefined();
    const geometry = surfaceGeometry(settings);
    const fold = geometry.pageWidth;
    const edges = trackEdges(layout, geometry.width);
    for (const block of layout.blocks) {
      if (!["body", "deck", "caption"].includes(block.type)) continue;
      const place = block.placement.wide;
      const left = edges[place.column - 1].start;
      const right = edges[place.column + place.span - 2].end;
      const clear = right <= fold - 24 || left >= fold + 24;
      expect(clear, `${block.id} keeps 24px from the fold`).toBe(true);
    }
    expect(layout.blocks.some((block) => block.contentKey === "body")).toBe(
      true,
    );
    const markup = renderSpecimen(settings);
    for (const paragraph of source.content.body.split(/\n\s*\n/))
      expect(markup).toContain(paragraph.replace(/&/g, "&amp;"));
  });

  it("keeps the bridge title crossing the fold on purpose", () => {
    const settings = applySurfaceTemplate(
      setSurface(defaultSettings(), facingA4),
      "print-spread-bridge",
    );
    const place = settings.layout!.blocks.find((block) => block.id === "title")!
      .placement.wide;
    const spine = settings.layout!.pageGrid!.left.length + 1;
    expect(place.column).toBeLessThan(spine);
    expect(place.column + place.span - 1).toBeGreaterThan(spine);
  });
});

describe("Page grid controls", () => {
  const markup = (settings: Settings) =>
    renderToStaticMarkup(
      createElement(GridEditor, {
        settings,
        selectedBlock: null,
        onChange: () => {},
        onSelectBlock: () => {},
      }),
    );

  it("offers Spread grid and Page grid for facing pages only", () => {
    const spread = markup(facing());
    expect(spread).toContain("Page grid");
    expect(spread).toContain("Columns &amp; gutters");
    const single = markup(
      setSurface(facing(), { ...facingA4, pages: "single" }),
    );
    expect(single).not.toContain('aria-label="Facing grid"');
  });

  it("replaces direct track and margin editing while a page grid is on", () => {
    const html = markup(
      applySurfaceTemplate(
        setSurface(defaultSettings(), facingA4),
        "print-spread-notes",
      ),
    );
    expect(html).toContain("Columns and margins come from the page grid");
    expect(html).not.toContain("Columns &amp; gutters");
    expect(html).toContain('aria-label="Page grid mode"');
    expect(html).toContain("Inside margin");
  });
});
