import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { defaultSettings, type Settings } from "../src/model";
import {
  applyRecipe,
  layoutRecipes,
  effectiveLayout,
  effectiveVariant,
} from "../src/layout";
import { mkdir, readFile } from "node:fs/promises";
import { unzipSync } from "fflate";

async function open(page: Page) {
  page.setDefaultTimeout(8000);
  await page.goto("/");
  await expect(page.getByText("Fonts ready", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
}
async function importSettings(page: Page, s: Settings) {
  await page.getByLabel("Import experiment file").setInputFiles({
    name: "grid.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(s)),
  });
  await expect(page.locator(".specimen.layout-enabled")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
const gridStyle = (page: Page) =>
  page
    .locator(".frame-region")
    .first()
    .locator(".layout-grid")
    .evaluate((el) => {
      const css = getComputedStyle(el);
      return {
        columns: css.gridTemplateColumns.split(" ").length,
        gap: css.columnGap,
        left: css.paddingLeft,
        top: css.paddingTop,
      };
    });

test("all six recipes recompose at three real canvas widths without hidden text or overlapping prose", async ({
  page,
}) => {
  await open(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mkdir("test-results/evidence/grids", { recursive: true });
  for (const recipe of layoutRecipes) {
    for (const width of [1040, 768, 390]) {
      const s = applyRecipe(defaultSettings(), recipe.recipeId);
      s.width = width;
      await importSettings(page, s);
      const expected = effectiveLayout(s.layout, effectiveVariant(width));
      expect(
        (await gridStyle(page)).columns,
        `${recipe.recipeId} at ${width}`,
      ).toBe(expected.columns.tracks.length);
      const beforeGuides = await page
        .locator(".layout-grid")
        .evaluate((el) => ({
          columns: getComputedStyle(el).gridTemplateColumns,
          rows: getComputedStyle(el).gridTemplateRows,
        }));
      await page
        .getByRole("button", { name: "Show grid", exact: true })
        .click();
      const afterGuides = await page.locator(".layout-grid").evaluate((el) => ({
        columns: getComputedStyle(el).gridTemplateColumns,
        rows: getComputedStyle(el).gridTemplateRows,
      }));
      expect(
        afterGuides,
        `${recipe.recipeId} ${width}: guides never change layout`,
      ).toEqual(beforeGuides);
      await page
        .getByRole("button", { name: "Show grid", exact: true })
        .click();
      const geometry = await page.locator(".layout-grid").evaluate((el) => {
        const blocks = [
          ...el.querySelectorAll<HTMLElement>("[data-block-id]"),
        ].filter(
          (b) =>
            !["panel", "rule"].some((t) => b.classList.contains(`layout-${t}`)),
        );
        const clashes: string[] = [];
        for (let i = 0; i < blocks.length; i++)
          for (let j = i + 1; j < blocks.length; j++) {
            const a = blocks[i].getBoundingClientRect(),
              b = blocks[j].getBoundingClientRect();
            if (
              Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
              Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2
            )
              clashes.push(
                `${blocks[i].dataset.blockId}/${blocks[j].dataset.blockId}`,
              );
          }
        return {
          clashes,
          horizontalOverflow: el.scrollWidth - el.clientWidth,
          hidden: blocks.filter((b) => getComputedStyle(b).display === "none")
            .length,
        };
      });
      expect(geometry.clashes, `${recipe.recipeId} ${width}`).toEqual([]);
      expect(
        geometry.horizontalOverflow,
        `${recipe.recipeId} ${width}`,
      ).toBeLessThanOrEqual(3);
      expect(geometry.hidden).toBe(0);
      if (width === 1040 || width === 390)
        await page
          .locator(".frame-region")
          .first()
          .screenshot({
            path: `test-results/evidence/grids/${recipe.recipeId}-${width}.png`,
          });
    }
  }
  expect(errors).toEqual([]);
});

test("advanced margins and placement survive reload, isolate comparison, and reject invalid imports", async ({
  page,
}) => {
  await open(page);
  const s = applyRecipe(defaultSettings(), "book-page");
  s.layout.margins.left = 93;
  s.layout.variants.narrow!.margins!.left = 31;
  await importSettings(page, s);
  expect((await gridStyle(page)).left).toBe("93px");
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".layout-grid")).toBeVisible();
  expect((await gridStyle(page)).left).toBe("93px");
  await page
    .getByRole("button", { name: "Compare", exact: true })
    .first()
    .click();
  const changed = structuredClone(s);
  changed.layout.margins.left = 49;
  changed.layout.blocks.find((b) => b.id === "title")!.placement.wide.column =
    2;
  changed.layout.blocks.find((b) => b.id === "title")!.placement.wide.span = 4;
  await page.getByLabel("Import experiment file").setInputFiles({
    name: "changed.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(changed)),
  });
  await expect(
    page.locator(".frame-region").first().locator(".layout-grid"),
  ).toHaveCSS("padding-left", "49px");
  await expect(
    page.locator(".frame-region").nth(1).locator(".layout-grid"),
  ).toHaveCSS("padding-left", "93px");
  await expect(
    page.locator(".frame-region").first().locator(".layout-title"),
  ).toHaveCSS("grid-column-start", "2");
  await expect(
    page.locator(".frame-region").nth(1).locator(".layout-title"),
  ).toHaveCSS("grid-column-start", "1");
  changed.layout.blocks[0].placement.wide.span = 999;
  await page.getByLabel("Import experiment file").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(changed)),
  });
  await expect(
    page.locator(".frame-region").first().locator(".layout-grid"),
  ).toHaveCSS("padding-left", "49px");
});

test("advanced grid interface is keyboard accessible and editing affects the specimen", async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole("button", { name: "Compose layout", exact: true })
    .click();
  await page.getByRole("button", { name: /Book page.*Manuscript/ }).click();
  await page.getByRole("button", { name: "Activate advanced grid" }).click();
  await expect(page.locator(".layout-enabled")).toBeVisible();
  await page.locator(".layout-title").click();
  await expect(
    page.getByRole("spinbutton", { name: "Start column", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("spinbutton", { name: "Start column", exact: true })
    .fill("2");
  await page
    .getByRole("spinbutton", { name: "Start column", exact: true })
    .press("Enter");
  await expect(page.locator(".layout-title")).toHaveCSS(
    "grid-column-start",
    "2",
  );
  await page.getByRole("button", { name: /^Narrow/ }).click();
  await expect(page.getByLabel("Canvas width")).toHaveValue("390");
  await expect(page.locator(".layout-grid")).toHaveCSS("padding-left", "24px");
  const result = await new AxeBuilder({ page }).exclude(".specimen").analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
});

test("adding and reordering blocks, proportion, rhythm and real type features remain editable at 320px", async ({
  page,
}) => {
  await open(page);
  await importSettings(page, applyRecipe(defaultSettings(), "book-page"));
  await page.getByRole("button", { name: "Edit layout", exact: true }).click();
  await page.getByLabel("Add block", { exact: true }).selectOption("letter");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByLabel("Block content", { exact: true }).fill("Å");
  await expect(page.locator(".layout-letter")).toHaveText("Å");
  await page
    .getByRole("button", { name: "Move Letter up", exact: true })
    .click();
  await page.getByRole("button", { name: /^Narrow/ }).click();
  const rowData = await page.locator("[data-block-id]").evaluateAll((els) =>
    els.map((el) => ({
      id: el.getAttribute("data-block-id"),
      row: Number(getComputedStyle(el).gridRowStart),
    })),
  );
  expect(rowData.map((x) => x.row)).toEqual(rowData.map((_, i) => i + 1));
  await page.getByRole("button", { name: /^Wide/ }).click();
  await page.locator("summary").filter({ hasText: "Format" }).click();
  await page.getByRole("button", { name: "Fixed study", exact: true }).click();
  await page.getByLabel("Proportion", { exact: true }).selectOption("2:3");
  await expect(page.locator(".layout-grid")).toHaveCSS("height", "1560px");
  await page
    .getByRole("button", { name: "Use current body line height as the unit" })
    .click();
  await expect(page.locator(".layout-body p").nth(1)).toHaveCSS(
    "margin-top",
    "59.4px",
  );
  await page
    .getByRole("spinbutton", { name: "Paragraph gap", exact: true })
    .fill("19");
  await page
    .getByRole("spinbutton", { name: "Paragraph gap", exact: true })
    .press("Enter");
  await expect(page.locator(".layout-body p").nth(1)).toHaveCSS(
    "margin-top",
    "19px",
  );
  await page.locator("summary").filter({ hasText: "Typesetting" }).click();
  await page.getByLabel("Real small caps · supporting role").check();
  await expect(page.locator(".layout-marker")).toHaveCSS(
    "font-variant-caps",
    "small-caps",
  );
  await page.getByLabel("Body numeral style").selectOption("oldstyle");
  await expect(page.locator(".layout-body")).toHaveCSS(
    "font-variant-numeric",
    "oldstyle-nums",
  );
  await page.setViewportSize({ width: 320, height: 800 });
  await page.getByLabel("Canvas width").selectOption("320");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(321);
  const a11y = await new AxeBuilder({ page })
    .exclude(".specimen")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    a11y.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
});

test("advanced standalone export reproduces the layout at wide and narrow widths", async ({
  page,
  browser,
}) => {
  await open(page);
  const settings = applyRecipe(defaultSettings(), "marginal-essay");
  settings.layout.typesetting.language = "sv";
  settings.layout.typesetting.numerals = "oldstyle";
  await importSettings(page, settings);
  await page
    .getByRole("button", { name: "Export system", exact: true })
    .click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download system package", exact: true })
    .click();
  const download = await pending;
  const files = unzipSync(
    new Uint8Array(await readFile((await download.path())!)),
  );
  const context = await browser.newContext({
    viewport: { width: 1040, height: 900 },
  });
  await context.route("**/*", (route) => {
    const key = new URL(route.request().url()).pathname.replace(
      "/grid-export/",
      "",
    );
    if (!files[key]) return route.abort();
    return route.fulfill({
      status: 200,
      body: Buffer.from(files[key]),
      contentType: key.endsWith(".html")
        ? "text/html"
        : key.endsWith(".css")
          ? "text/css"
          : "application/octet-stream",
    });
  });
  const exported = await context.newPage();
  const read = async (p: Page) =>
    p.locator(".specimen").evaluate((el) => {
      const g = getComputedStyle(el.querySelector(".layout-grid")!);
      return {
        grid: [g.gridTemplateColumns, g.gridTemplateRows, g.padding, g.gap],
        blocks: [...el.querySelectorAll("[data-block-id]")].map((b) => {
          const c = getComputedStyle(b);
          return {
            id: b.getAttribute("data-block-id"),
            position: [c.gridColumn, c.gridRow],
            type: [
              c.fontFamily,
              c.fontSize,
              c.fontVariantNumeric,
              c.lineHeight,
            ],
          };
        }),
      };
    });
  try {
    await exported.goto("http://127.0.0.1:4318/grid-export/specimen.html");
    await exported.evaluate(() => document.fonts.ready);
    for (const width of [1040, 390]) {
      await page.getByLabel("Canvas width").selectOption(String(width));
      await exported.setViewportSize({ width, height: 900 });
      await expect.poll(() => read(exported)).toEqual(await read(page));
    }
  } finally {
    await context.close();
  }
});

test("base-column inheritance and clearing narrow placement stay valid and collision free", async ({
  page,
}) => {
  await open(page);
  await importSettings(page, applyRecipe(defaultSettings(), "book-page"));
  await page.getByRole("button", { name: "Edit layout", exact: true }).click();
  await page.getByRole("button", { name: /^Medium/ }).click();
  await page
    .getByRole("button", { name: "Clear column override", exact: true })
    .click();
  await page.getByRole("button", { name: /^Wide/ }).click();
  await page
    .getByRole("spinbutton", { name: "Columns", exact: true })
    .fill("5");
  await page
    .getByRole("spinbutton", { name: "Columns", exact: true })
    .press("Enter");
  await page.getByRole("button", { name: /^Medium/ }).click();
  expect((await gridStyle(page)).columns).toBe(5);
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await importSettings(
    page,
    applyRecipe(defaultSettings(), "asymmetric-editorial"),
  );
  await page.getByRole("button", { name: /^Narrow/ }).click();
  await page.locator(".layout-caption").click();
  await page
    .getByRole("button", { name: "Clear placement override", exact: true })
    .click();
  await expect(page.locator(".layout-caption")).toHaveCSS(
    "grid-row-start",
    "9",
  );
  await expect(page.locator(".layout-letter")).toHaveCSS("grid-row-start", "7");
  await page.getByRole("button", { name: /^Wide/ }).click();
  await page
    .getByRole("button", { name: /^Manuscript.*One sustained/ })
    .click();
  const overlaps = await page.locator(".layout-grid").evaluate((el) => {
    const blocks = [...el.querySelectorAll("[data-block-id]")].filter(
      (b) =>
        !b.classList.contains("layout-panel") &&
        !b.classList.contains("layout-rule"),
    );
    let count = 0;
    for (let i = 0; i < blocks.length; i++)
      for (let j = i + 1; j < blocks.length; j++) {
        const a = blocks[i].getBoundingClientRect(),
          b = blocks[j].getBoundingClientRect();
        if (
          Math.min(a.right, b.right) - Math.max(a.left, b.left) > 3 &&
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 3
        )
          count++;
      }
    return count;
  });
  expect(overlaps).toBe(0);
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
});
