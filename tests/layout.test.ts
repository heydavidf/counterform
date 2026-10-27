import { describe, expect, it } from "vitest";
import { defaultSettings } from "../src/model";
import {
  applyRecipe,
  effectiveLayout,
  effectivePlacement,
  layoutCss,
  layoutRecipes,
  validateLayout,
} from "../src/layout";
import { renderSpecimen } from "../src/render";

describe("advanced layout model", () => {
  it("ships six valid, independent recipes", () => {
    expect(layoutRecipes).toHaveLength(6);
    expect(new Set(layoutRecipes.map((recipe) => recipe.family))).toEqual(
      new Set(["manuscript", "column", "modular", "hierarchical"]),
    );
    layoutRecipes.forEach((recipe) =>
      expect(validateLayout(recipe)).toEqual(recipe),
    );
  });

  it("applies responsive tracks and placements without changing the source settings", () => {
    const source = defaultSettings();
    const next = applyRecipe(source, "asymmetric-editorial");
    expect(
      (source as typeof source & { layout?: unknown }).layout,
    ).toBeUndefined();
    expect(effectiveLayout(next.layout, "medium").columns.tracks).toHaveLength(
      6,
    );
    const title = next.layout.blocks.find((block) => block.id === "title")!;
    expect(effectivePlacement(title, "narrow")).toMatchObject({
      column: 1,
      span: 1,
    });
  });

  it("renders named zones and the same responsive rules used by export", () => {
    const settings = applyRecipe(defaultSettings(), "modular-specimen");
    const markup = renderSpecimen(settings);
    expect(markup).toContain('data-zone="Reading text"');
    expect(markup).toContain('data-format="fixed"');
    expect(markup).toContain("data-overflow-warning=");
    expect(layoutCss(settings)).toContain("@container (max-width:600px)");
  });

  it("rejects a placement outside its responsive track set", () => {
    const layout = structuredClone(layoutRecipes[0]);
    layout.blocks[0].placement.narrow = {
      column: 2,
      span: 1,
      row: 1,
      rowSpan: 1,
      align: "start",
    };
    expect(() => validateLayout(layout)).toThrow(/not supported/);
  });
});

it("rejects numeric IDs and resolves inherited narrow placement consistently", () => {
  const l = structuredClone(layoutRecipes[0]);
  (l.blocks[0] as unknown as { id: number }).id = 123;
  expect(() => validateLayout(l)).toThrow();
  const good = structuredClone(layoutRecipes[0]);
  delete good.blocks[0].placement.narrow;
  expect(effectivePlacement(good.blocks[0], "narrow", good)).toMatchObject({
    column: 1,
    span: 1,
    row: 1,
  });
  const s = applyRecipe(defaultSettings(), good.recipeId);
  s.layout = good;
  expect(layoutCss(s)).toContain(
    ".layout-block-marker{grid-column:1/span 1;grid-row:1/span 1",
  );
});
