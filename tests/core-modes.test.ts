import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import {
  clearComparison,
  settingsDifferences,
  startComparison,
} from "../src/comparison";
import { applyRecipe, layoutCss } from "../src/layout";
import { defaultSettings, validateSettings, type Settings } from "../src/model";
import { standaloneOutputHtml } from "../src/output";
import {
  exportPackage,
  importPackage,
  makeUpload,
  withFontDependencies,
} from "../src/package";
import { renderSpecimen } from "../src/render";
import {
  PRINT_FORMATS,
  SOCIAL_FORMATS,
  applySurfaceTemplate,
  printCss,
  setSurface,
  surfaceGeometry,
  surfaceCss,
  validateSurface,
} from "../src/surface";
import { readFile } from "node:fs/promises";

const pxPerMm = 96 / 25.4;
const file = (bytes: Uint8Array, name: string) =>
  new File([bytes.slice().buffer], name);

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (path: string) =>
        new Response(
          new Uint8Array(
            await readFile(
              `public/${path.replace(/^\.\//, "").replace(/^\//, "")}`,
            ),
          ),
        ),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("fixed output surfaces", () => {
  it("preserves exact geometry for every print size, orientation and page count", () => {
    for (const format of PRINT_FORMATS) {
      for (const orientation of ["portrait", "landscape"] as const) {
        for (const pages of ["single", "facing"] as const) {
          const settings = setSurface(defaultSettings(), {
            mode: "print",
            pageSize: format.id,
            orientation,
            pages,
          });
          const geometry = surfaceGeometry(settings);
          const pageWidthMm =
            orientation === "portrait" ? format.widthMm : format.heightMm;
          const heightMm =
            orientation === "portrait" ? format.heightMm : format.widthMm;
          expect(geometry.pageWidth).toBeCloseTo(pageWidthMm * pxPerMm, 8);
          expect(geometry.width).toBeCloseTo(
            pageWidthMm * pxPerMm * (pages === "facing" ? 2 : 1),
            8,
          );
          expect(geometry.height).toBeCloseTo(heightMm * pxPerMm, 8);
          expect(printCss(settings)).toContain(
            `size:${pageWidthMm * (pages === "facing" ? 2 : 1)}mm ${heightMm}mm`,
          );
        }
      }
    }
  });

  it("keeps old saves responsive but fixed A5 and social formats on the wide arrangement", () => {
    const legacy = applyRecipe(defaultSettings(), "asymmetric-editorial");
    expect(validateSettings(legacy)).toEqual(legacy);
    expect(layoutCss(legacy)).toContain("@container (max-width:600px)");
    const a5 = setSurface(legacy, {
      mode: "print",
      pageSize: "a5",
      orientation: "portrait",
      pages: "single",
    });
    expect(surfaceGeometry(a5).width).toBeLessThan(600);
    expect(layoutCss(a5)).not.toContain("@container (max-width:600px)");
    expect(renderSpecimen(a5)).toContain('data-surface="print"');
    const social = setSurface(legacy, { mode: "social", format: "story" });
    expect(layoutCss(social)).not.toContain("@container");
    expect(standaloneOutputHtml(social)).toContain(
      "width:1080px;height:1920px;min-width:1080px;max-width:none",
    );
  });

  it("uses one continuous facing grid with a block crossing the centre seam", () => {
    const settings = applySurfaceTemplate(
      setSurface(defaultSettings(), {
        mode: "print",
        pageSize: "a4",
        orientation: "portrait",
        pages: "facing",
      }),
      "print-editorial-facing",
    );
    const columns = settings.layout!.columns.tracks.length;
    const title = settings.layout!.blocks.find((block) => block.id === "title")!
      .placement.wide;
    expect(columns).toBe(12);
    expect(title.column).toBeLessThanOrEqual(columns / 2);
    expect(title.column + title.span - 1).toBeGreaterThan(columns / 2);
    const markup = renderSpecimen(settings);
    expect(markup).toContain("surface-fold");
    expect(markup.match(/class="specimen/g)).toHaveLength(1);
    expect(settings.layout!.blocks.some((block) => block.id === "body")).toBe(
      true,
    );
    expect(
      settings.layout!.blocks.find((block) => block.id === "letter")!.placement
        .wide.rowSpan,
    ).toBe(2);
  });

  it("keeps fixed-surface review warnings out of artwork flow", () => {
    const settings = setSurface(defaultSettings(), {
      mode: "print",
      pageSize: "a5",
      orientation: "portrait",
      pages: "single",
    });
    const css = surfaceCss(settings);
    expect(css).toContain("data-overflow-warning");
    expect(css).not.toContain("position:relative");
    expect(renderSpecimen(settings)).toContain(
      "Fixed format: content that exceeds",
    );
  });

  it("builds three distinct social compositions without changing shared copy", () => {
    const original = setSurface(defaultSettings(), {
      mode: "social",
      format: "square",
    });
    const ids = [
      "social-statement",
      "social-announcement",
      "social-editorial-card",
    ];
    const templates = ids.map((id) => applySurfaceTemplate(original, id));
    expect(
      templates.map((item) => item.layout!.blocks.map((block) => block.id)),
    ).toEqual([
      ["marker", "quote", "caption", "rule"],
      ["marker", "title", "deck", "caption", "rule"],
      ["marker", "title", "caption", "rule", "quote", "letter"],
    ]);
    for (const template of templates) {
      expect(template.content).toEqual(original.content);
      expect(layoutCss(template)).not.toContain("@container");
      expect(renderSpecimen(template)).toContain(
        `template-${template.layout!.recipeId}`,
      );
    }
    expect(
      templates[2].layout!.blocks.find((block) => block.id === "quote")!.label,
    ).toBe("Quotation excerpt");
  });

  it("changes paper without overwriting Web geometry, layout or authored content", () => {
    const source = applyRecipe(defaultSettings(), "book-page");
    source.width = 1333;
    source.layout!.format = { mode: "fixed", ratio: "3:4", height: 1777 };
    source.content.title = "Authored title";
    const a5 = setSurface(source, {
      mode: "print",
      pageSize: "a5",
      orientation: "portrait",
      pages: "single",
    });
    const a3 = setSurface(a5, {
      mode: "print",
      pageSize: "a3",
      orientation: "landscape",
      pages: "facing",
    });
    expect(a3.width).toBe(1333);
    expect(a3.layout).toEqual(source.layout);
    expect(a3.content).toEqual(source.content);
    expect(setSurface(a3, { mode: "web" }).layout!.format).toEqual(
      source.layout!.format,
    );
  });

  it("validates all surface fields and exact social pixel dimensions", () => {
    for (const format of SOCIAL_FORMATS) {
      const geometry = surfaceGeometry(
        setSurface(defaultSettings(), { mode: "social", format: format.id }),
      );
      expect([geometry.width, geometry.height]).toEqual([
        format.width,
        format.height,
      ]);
    }
    expect(() => validateSurface({ mode: "web", format: "story" })).toThrow();
    expect(() =>
      validateSurface({
        mode: "print",
        pageSize: "a9",
        orientation: "portrait",
        pages: "single",
      }),
    ).toThrow();
  });
});

describe("controlled comparison", () => {
  it("reports no differences for a freshly started comparison or explicit Web surface", () => {
    const started = startComparison(defaultSettings());
    expect(
      settingsDifferences(started.comparison!.reference as Settings, started),
    ).toEqual([]);
    const explicitWeb = {
      ...structuredClone(started),
      surface: { mode: "web" as const },
    };
    expect(
      settingsDifferences(
        started.comparison!.reference as Settings,
        explicitWeb,
      ),
    ).toEqual([]);
  });

  it("clones an immutable reference, reports actual changes and clears cleanly", () => {
    const started = startComparison(defaultSettings());
    started.comparison!.intent = "Check a calmer reading rhythm";
    started.roles.body.leading = 1.8;
    started.palette.accent = "#123456";
    const differences = settingsDifferences(
      started.comparison!.reference as typeof started,
      started,
    );
    expect(differences.map((difference) => difference.path)).toEqual(
      expect.arrayContaining(["palette.accent", "roles.body.leading"]),
    );
    expect(started.comparison!.reference.roles.body.leading).toBe(1.65);
    expect(clearComparison(started).comparison).toBeUndefined();
  });

  it("reports block additions and reading-order changes compactly", () => {
    const reference = applyRecipe(defaultSettings(), "book-page");
    const current = structuredClone(reference);
    current.layout!.blocks.reverse();
    current.layout!.blocks.push({
      id: "extra-note",
      type: "caption",
      label: "Extra note",
      content: "New",
      placement: {
        wide: { column: 1, span: 1, row: 6, rowSpan: 1, align: "start" },
      },
    });
    const differences = settingsDifferences(reference, current);
    expect(
      differences.filter((difference) =>
        difference.path.startsWith("layout.blocksById.extra-note"),
      ),
    ).toHaveLength(1);
    expect(
      differences.filter(
        (difference) => difference.path === "layout.readingOrder",
      ),
    ).toHaveLength(1);
  });

  it("rejects stale or recursive comparison data before recursion", () => {
    const settings = startComparison(defaultSettings());
    expect(validateSettings(settings)).toEqual(settings);
    const malicious = structuredClone(settings) as any;
    malicious.comparison.reference.comparison = {
      reference: malicious.comparison.reference,
      intent: "nested",
    };
    expect(() => validateSettings(malicious)).toThrow(/supported Counterform/);
    const tooLong = structuredClone(settings);
    tooLong.comparison!.intent = "x".repeat(1001);
    expect(() => validateSettings(tooLong)).toThrow();
  });
});

describe("fixed export geometry and dependency records", () => {
  it("exports fixed social HTML and physical print CSS from the shared renderer", async () => {
    const social = setSurface(defaultSettings(), {
      mode: "social",
      format: "square",
    });
    const socialFiles = unzipSync(await exportPackage(social, [], false));
    expect(strFromU8(socialFiles["specimen.html"])).toContain(
      "width:1080px;height:1080px;min-width:1080px;max-width:none",
    );
    expect(strFromU8(socialFiles["specimen.html"])).toContain(
      'data-output-width="1080"',
    );
    const print = setSurface(defaultSettings(), {
      mode: "print",
      pageSize: "letter",
      orientation: "landscape",
      pages: "facing",
    });
    const printFiles = unzipSync(await exportPackage(print, [], false));
    const css = strFromU8(printFiles["tokens.css"]);
    expect(css).toContain("@page{size:558.8mm 215.9mm;margin:0}");
    expect(css).toContain(
      ".surface-guide,.layout-guides,.grid-overlay,.module-overlay,.baseline-overlay{display:none!important}",
    );
    expect(css).toContain(".font-notice{display:none!important}");
  });

  it("names a missing print font on screen but removes its notice from print layout", () => {
    const settings = setSurface(defaultSettings(), {
      mode: "print",
      pageSize: "a5",
      orientation: "landscape",
      pages: "facing",
    });
    const notice =
      '<aside class="font-notice">Missing font dependencies: Private Proof Face.</aside>';
    const output = standaloneOutputHtml(settings, "", notice);
    expect(output).toContain("Private Proof Face");
    expect(output).toContain("@media print");
    expect(output).toContain(".font-notice{display:none!important}");
  });

  it("preserves an A-only private font name while excluding its bytes", async () => {
    const bytes = new Uint8Array(
      await readFile("public/fonts/manrope/normal.ttf"),
    );
    const upload = await makeUpload(file(bytes, "Reference Face.ttf"));
    const settings = startComparison(defaultSettings());
    settings.comparison!.reference.roles.display.fontId = upload.id;
    const enriched = withFontDependencies(settings, [upload]);
    expect(
      enriched.comparison!.reference.fontDependencies?.[upload.id]?.name,
    ).toBe("Reference Face");
    const exported = unzipSync(await exportPackage(settings, [upload], false));
    expect(
      Object.keys(exported).some((name) => name.startsWith("fonts/private/")),
    ).toBe(false);
    const imported = await importPackage(
      file(await exportPackage(settings, [upload], false), "comparison.zip"),
    );
    expect(
      imported.settings.comparison!.reference.fontDependencies?.[upload.id]
        ?.name,
    ).toBe("Reference Face");
  });
});
