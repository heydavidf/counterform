import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GridEditor } from "../src/GridEditor";
import { describeLayout } from "../src/layout-document";
import { layoutCss, validateLayout } from "../src/layout";
import { defaultSettings, validateSettings } from "../src/model";
import {
  applySurfaceTemplate,
  setSurface,
  surfaceCss,
  type SurfaceSettings,
} from "../src/surface";

const formats = ["square", "portrait", "story", "landscape"] as const;
const starters = [
  "social-statement",
  "social-announcement",
  "social-editorial-card",
] as const;
const social = (format: (typeof formats)[number]) =>
  setSurface(defaultSettings(), { mode: "social", format });

describe("Readable Social starters", () => {
  it.each(
    starters.flatMap((id) => formats.map((format) => [id, format] as const)),
  )("%s on %s fits rows to content and keeps shared settings", (id, format) => {
    const source = social(format);
    const settings = applySurfaceTemplate(source, id);
    expect(validateSettings(structuredClone(settings))).toBeTruthy();
    expect(settings.content).toEqual(source.content);
    expect(settings.roles).toEqual(source.roles);
    expect(settings.palette).toEqual(source.palette);
    const layout = settings.layout!;
    expect(layout.recipeId).toBe(id);
    expect(layout.rows.auto).toBe(false);
    expect(layout.rows.tracks.filter((track) => !track.fit)).toHaveLength(
      id === "social-editorial-card" && format !== "landscape" ? 2 : 1,
    );
    const edge = format === "landscape" ? 24 : 48;
    expect(layout.margins).toMatchObject({
      top: edge,
      right: edge,
      bottom: edge,
      left: edge,
    });
    const css = layoutCss(settings);
    expect(css).toContain("--layout-rows:auto");
    expect(surfaceCss(settings)).toContain(
      `--social-support:${format === "landscape" ? 40 : 36}px`,
    );
    const marker = layout.blocks.find((block) => block.id === "marker")!;
    expect(marker.placement.wide).toMatchObject({
      column: 1,
      span: 12,
      row: 1,
    });
    const caption = layout.blocks.find((block) => block.id === "caption")!;
    expect(caption.placement.wide.row).toBe(layout.rows.tracks.length);
  });

  it("keeps the established block order for each starter", () => {
    const ids = starters.map((id) =>
      applySurfaceTemplate(social("square"), id).layout!.blocks.map(
        (block) => block.id,
      ),
    );
    expect(ids).toEqual([
      ["marker", "quote", "caption", "rule"],
      ["marker", "title", "deck", "caption", "rule"],
      ["marker", "title", "caption", "rule", "quote", "letter"],
    ]);
  });

  it("switches an unedited starter to the new format's arrangement", () => {
    const square = applySurfaceTemplate(social("square"), "social-statement");
    const landscape = setSurface(square, {
      mode: "social",
      format: "landscape",
    });
    const quote = landscape.layout!.blocks.find(
      (block) => block.id === "quote",
    )!;
    expect(quote.placement.wide).toMatchObject({ column: 1, span: 12 });
    expect(landscape.layout!.margins.top).toBe(24);
    const back = setSurface(landscape, { mode: "social", format: "square" });
    expect(back.layout).toEqual(square.layout);
  });

  it("leaves an edited starter alone when the format changes", () => {
    const square = applySurfaceTemplate(
      social("square"),
      "social-editorial-card",
    );
    square.layout!.margins.top = 60;
    const story = setSurface(square, { mode: "social", format: "story" });
    expect(story.layout).toEqual(square.layout);
  });

  it("does not change Web or Print studies", () => {
    const web = defaultSettings();
    expect(surfaceCss(web)).toBe("");
    const print = setSurface(defaultSettings(), {
      mode: "print",
      pageSize: "a4",
      orientation: "portrait",
      pages: "single",
    } as SurfaceSettings);
    expect(surfaceCss(print)).not.toContain("--social-");
  });
});

describe("Fit rows", () => {
  it("accepts boolean fit on rows only", () => {
    const layout = applySurfaceTemplate(
      social("square"),
      "social-statement",
    ).layout!;
    expect(validateLayout(layout)).toEqual(layout);
    const badRow = structuredClone(layout) as unknown as {
      rows: { tracks: { fit: unknown }[] };
    };
    badRow.rows.tracks[0].fit = "yes";
    expect(() => validateLayout(badRow)).toThrow();
    const badColumn = structuredClone(layout);
    badColumn.columns.tracks[0].fit = true;
    expect(() => validateLayout(badColumn)).toThrow();
  });

  it("names fit rows in the exported DESIGN.md and ignores them for content-led rows", () => {
    const settings = applySurfaceTemplate(
      social("square"),
      "social-announcement",
    );
    const text = describeLayout(settings);
    expect(text).toContain("weights fit : fit : 6 : fit : fit");
    expect(text).toContain("fit rows take their content height");
    settings.layout!.rows.auto = true;
    expect(layoutCss(settings)).not.toContain("--layout-rows:auto");
  });

  it("shows Fit to content switches for weighted rows only", () => {
    const markup = (settings: ReturnType<typeof social>) =>
      renderToStaticMarkup(
        createElement(GridEditor, {
          settings,
          selectedBlock: null,
          onChange: () => {},
          onSelectBlock: () => {},
        }),
      );
    const settings = applySurfaceTemplate(social("square"), "social-statement");
    const html = markup(settings);
    expect(html).toContain('aria-label="Rows that fit their content"');
    expect(html).toContain(
      'aria-pressed="true" aria-label="Row 1 fits its content"',
    );
    expect(html).toContain(
      'aria-pressed="false" aria-label="Row 2 fits its content"',
    );
    settings.layout!.rows.auto = true;
    expect(markup(settings)).not.toContain("Rows that fit their content");
  });
});
