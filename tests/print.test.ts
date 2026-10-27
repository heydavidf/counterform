import { describe, expect, it } from "vitest";
import { startComparison } from "../src/comparison";
import { defaultSettings, validateSettings } from "../src/model";
import { renderSpecimen } from "../src/render";
import { applySurfaceTemplate, setSurface } from "../src/surface";
import { printReadingWarnings } from "../src/print-diagnostics";
import { surfaceGeometry } from "../src/surface";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GridEditor } from "../src/GridEditor";

describe("Print reading starters", () => {
  it.each(["print-editorial-single", "print-editorial-facing", "print-poster"])(
    "offers a supported generic Grid recipe after importing %s",
    (starter) => {
      const settings = applySurfaceTemplate(setSurface(defaultSettings(), {
        mode: "print", pageSize: "a4", orientation: "portrait", pages: "single",
      }), starter);
      const markup = renderToStaticMarkup(createElement(GridEditor, {
        settings, selectedBlock: null, onChange: () => {}, onSelectBlock: () => {},
      }));
      expect(markup.match(/class="ge-recipe ge-is-selected"/g)).toHaveLength(1);
      expect(markup).toContain("Apply selected recipe");
      expect(markup).not.toContain("Current: Custom");
    },
  );
  it("selects the named Editorial page mode without changing the study or A", () => {
    const source = startComparison(
      setSurface(defaultSettings(), {
        mode: "print",
        pageSize: "letter",
        orientation: "landscape",
        pages: "single",
      }),
    );
    const facing = applySurfaceTemplate(source, "print-editorial-facing");
    expect(facing.surface).toEqual({ ...source.surface, pages: "facing" });
    const single = applySurfaceTemplate(facing, "print-editorial-single");
    expect(single.surface).toEqual(source.surface);
    for (const next of [facing, single]) {
      expect(next.content).toEqual(source.content);
      expect(next.roles).toEqual(source.roles);
      expect(next.palette).toEqual(source.palette);
      expect(next.comparison).toEqual(source.comparison);
      expect(validateSettings(next)).toEqual(next);
    }
    expect(source.surface?.mode === "print" && source.surface.pages).toBe(
      "single",
    );
  });

  it("renders all default Body paragraphs in the new facing composition", () => {
    const source = setSurface(defaultSettings(), {
      mode: "print",
      pageSize: "a4",
      orientation: "portrait",
      pages: "facing",
    });
    const next = applySurfaceTemplate(source, "print-editorial-facing");
    const markup = renderSpecimen(next);
    expect(markup).toContain(
      'class="layout-block layout-block-body layout-body"',
    );
    for (const paragraph of source.content.body.split(/\n\s*\n/)) {
      expect(markup).toContain(`<p>${paragraph}</p>`);
    }
    expect(next.content).toEqual(source.content);
  });

  it("preserves Poster page count and leaves manual surface changes reversible", () => {
    for (const pages of ["single", "facing"] as const) {
      const source = setSurface(defaultSettings(), {
        mode: "print",
        pageSize: "a4",
        orientation: "portrait",
        pages,
      });
      const next = applySurfaceTemplate(source, "print-poster");
      expect(next.surface).toEqual(source.surface);
      const changed = setSurface(next, {
        ...source.surface!,
        mode: "print",
        pageSize: "a4",
        orientation: "portrait",
        pages: pages === "single" ? "facing" : "single",
      });
      expect(changed.layout).toEqual(next.layout);
      expect(changed.content).toEqual(next.content);
    }
  });
});

describe("Print reading diagnostics", () => {
  const facing = () =>
    applySurfaceTemplate(
      setSurface(defaultSettings(), {
        mode: "print",
        pageSize: "a4",
        orientation: "portrait",
        pages: "facing",
      }),
      "print-editorial-facing",
    );

  it.each([23, 24, 25])(
    "checks %ipx clearance on both sides in sheet coordinates",
    (clearance) => {
      const settings = facing();
      const fold = surfaceGeometry(settings).pageWidth;
      for (const side of ["left", "right"]) {
        const left =
          side === "left" ? fold - clearance - 300 : fold + clearance;
        const result = printReadingWarnings(settings, [
          { id: "body", left, right: left + 300, text: "Reading text" },
        ]);
        expect(result.length).toBe(clearance < 24 ? 1 : 0);
        if (clearance < 24) expect(result[0]).toContain("Reading text:");
      }
    },
  );

  it("names crossing reading blocks but permits empty and display blocks", () => {
    const settings = facing();
    const fold = surfaceGeometry(settings).pageWidth;
    const boxes = ["body", "deck", "caption", "title", "letter", "rule"].map(
      (id) => ({ id, left: fold - 30, right: fold + 30, text: id }),
    );
    const warnings = printReadingWarnings(settings, boxes);
    expect(warnings).toHaveLength(3);
    expect(warnings.join(" ")).not.toContain("Title:");
    expect(
      printReadingWarnings(
        settings,
        boxes.map((box) => ({ ...box, text: " " })),
      ),
    ).toEqual([]);
  });

  it("discloses the historical omitted Body without migrating its saved layout", () => {
    const historical = validateSettings(
      JSON.parse(
        readFileSync(
          "tests/fixtures/facing/a4-editorial-facing-default.json",
          "utf8",
        ),
      ),
    );
    const before = structuredClone(historical);
    expect(printReadingWarnings(historical, [])[0]).toContain(
      "Body is retained but not shown",
    );
    expect(historical).toEqual(before);
    historical.content.body = "";
    expect(printReadingWarnings(historical, [])).toEqual([]);
  });

  it("keeps the fold diagnostic scoped to Print facing pages", () => {
    const settings = facing();
    const fold = surfaceGeometry(settings).pageWidth;
    const boxes = [
      { id: "body", left: fold - 50, right: fold + 50, text: "Reading" },
    ];
    expect(
      printReadingWarnings(
        setSurface(settings, {
          mode: "print",
          pageSize: "a4",
          orientation: "portrait",
          pages: "single",
        }),
        boxes,
      ),
    ).toEqual([]);
    expect(
      printReadingWarnings(setSurface(settings, { mode: "web" }), boxes),
    ).toEqual([]);
    expect(
      printReadingWarnings(
        setSurface(settings, { mode: "social", format: "square" }),
        boxes,
      ),
    ).toEqual([]);
  });
});
