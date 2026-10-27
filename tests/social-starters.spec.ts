import { expect, test, type Page } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Settings } from "../src/model";

// Readable built-in Social starters. PNGs and measurements go to test-results/, which Git ignores.
const evidence = resolve("test-results/evidence/social-starters");
const swedishInput = resolve("tests/fixtures/social-swedish-input.json");

async function stored(page: Page): Promise<Settings> {
  return page.evaluate(async () => {
    const sourceRoot = "/src/";
    const { loadWorkspace } = (await import(
      sourceRoot + "storage.ts"
    )) as typeof import("../src/storage");
    return (await loadWorkspace()).current!;
  });
}

test("readable Social starters fit default and Swedish copy in every format and export PNGs", async ({
  page,
}, testInfo) => {
  const chromiumOnly = testInfo.project.name !== "chromium";
  test.skip(chromiumOnly, "Raster export runs in Chromium"); // tripwire-allow: PNG raster export is checked in Chromium only
  test.setTimeout(180_000);
  const swedish = JSON.parse(await readFile(swedishInput, "utf8")).content;
  await page.goto("/");
  const results = await page.evaluate(async (swedish) => {
    const sourceRoot = "/src";
    const { defaultSettings } = await import(`${sourceRoot}/model.ts`);
    const { fontFaceCss, renderSpecimen, SPECIMEN_CSS, systemCss } =
      await import(`${sourceRoot}/render.ts`);
    const { setSurface, applySurfaceTemplate, surfaceGeometry } = await import(
      `${sourceRoot}/surface.ts`
    );
    const { exportPng } = await import(`${sourceRoot}/output.ts`);
    const rows: Record<string, unknown>[] = [];
    for (const format of ["square", "portrait", "story", "landscape"] as const)
      for (const template of [
        "social-statement",
        "social-announcement",
        "social-editorial-card",
      ])
        for (const copy of ["default", "swedish"] as const) {
          let settings = setSurface(defaultSettings(), {
            mode: "social",
            format,
          });
          if (copy === "swedish") {
            settings.content = { ...swedish };
            settings.layout!.typesetting.language = "sv";
          }
          settings = applySurfaceTemplate(settings, template);
          const geometry = surfaceGeometry(settings);
          const frame = document.createElement("iframe");
          frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${geometry.width}px;height:${geometry.height}px`;
          document.body.append(frame);
          const loaded = new Promise((done) =>
            frame.addEventListener("load", done, { once: true }),
          );
          frame.srcdoc = `<style>${fontFaceCss()}${SPECIMEN_CSS}${systemCss(settings)}html,body{margin:0}</style>${renderSpecimen(settings)}`;
          await loaded;
          await frame.contentDocument!.fonts.ready;
          const doc = frame.contentDocument!;
          const sheet = doc
            .querySelector<HTMLElement>(".specimen")!
            .getBoundingClientRect();
          const blocks = [
            ...doc.querySelectorAll<HTMLElement>(".layout-block"),
          ].filter(
            (block) =>
              block.textContent?.trim() ||
              block.matches(".layout-rule,.layout-letter"),
          );
          const issues: string[] = [];
          const sizes: Record<string, number> = {};
          for (const block of blocks) {
            const box = block.getBoundingClientRect();
            sizes[block.dataset.blockId!] = parseFloat(
              getComputedStyle(block).fontSize,
            );
            if (
              box.left < sheet.left - 1 ||
              box.top < sheet.top - 1 ||
              box.right > sheet.right + 1 ||
              box.bottom > sheet.bottom + 1
            )
              issues.push(`${block.dataset.blockId} leaves the sheet`);
            if (
              block.scrollWidth > block.clientWidth + 12 ||
              block.scrollHeight > block.clientHeight + 12
            )
              issues.push(`${block.dataset.blockId} clips its content`);
          }
          for (let a = 0; a < blocks.length; a++)
            for (let b = a + 1; b < blocks.length; b++) {
              const x = blocks[a].getBoundingClientRect();
              const y = blocks[b].getBoundingClientRect();
              const w = Math.min(x.right, y.right) - Math.max(x.left, y.left);
              const h = Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top);
              if (w > 2 && h > 2)
                issues.push(
                  `${blocks[a].dataset.blockId} overlaps ${blocks[b].dataset.blockId}`,
                );
            }
          frame.remove();
          const blob = await exportPng(settings, []);
          const png = await new Promise<string>((done) => {
            const reader = new FileReader();
            reader.onload = () => done(String(reader.result).split(",")[1]);
            reader.readAsDataURL(blob);
          });
          rows.push({
            id: `${template.replace("social-", "")}-${format}-${copy}`,
            width: geometry.width,
            height: geometry.height,
            issues,
            sizes,
            roles: settings.roles,
            png,
          });
        }
    return rows;
  }, swedish);
  await mkdir(resolve(evidence, "png"), { recursive: true });
  for (const row of results) {
    await writeFile(
      resolve(evidence, "png", `${row.id}.png`),
      Buffer.from(String(row.png), "base64"),
    );
    delete row.png;
  }
  await writeFile(
    resolve(evidence, "RESULTS.json"),
    JSON.stringify(results, null, 2) + "\n",
  );
  expect(results).toHaveLength(24);
  for (const row of results) {
    expect(row.issues, String(row.id)).toEqual([]);
    const sizes = row.sizes as Record<string, number>;
    const support = (row.width as number) === 1200 ? 40 : 36;
    expect(sizes.marker, `${row.id} marker`).toBeGreaterThanOrEqual(
      support - 0.5,
    );
    expect(sizes.caption, `${row.id} caption`).toBeGreaterThanOrEqual(
      support - 0.5,
    );
    if (sizes.deck)
      expect(sizes.deck, `${row.id} deck`).toBeGreaterThanOrEqual(47.5);
  }
});

test("applying a Social starter keeps type, shows no warnings and follows a format change", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Fonts ready", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  const before = await stored(page);
  await page.getByRole("button", { name: "Social", exact: true }).click();
  await page
    .getByRole("button", { name: "Apply Statement", exact: true })
    .click();
  await expect
    .poll(async () => (await stored(page)).layout?.recipeId)
    .toBe("social-statement");
  const applied = await stored(page);
  expect(applied.roles).toEqual(before.roles);
  expect(applied.content).toEqual(before.content);
  const frame = page.locator('.frame-region[data-frame="current"]');
  await expect(frame.locator(".font-warning")).toHaveCount(0);
  await page.getByLabel("Social format").selectOption("landscape");
  await expect
    .poll(async () => (await stored(page)).layout?.margins.top)
    .toBe(24);
  const quote = (await stored(page)).layout!.blocks.find(
    (block) => block.id === "quote",
  )!;
  expect(quote.placement.wide).toMatchObject({ column: 1, span: 12 });
  await expect(frame.locator(".font-warning")).toHaveCount(0);
});

test("Fit to content switches a weighted row in Grid", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Fonts ready", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Social", exact: true }).click();
  await page
    .getByRole("button", { name: "Apply Announcement", exact: true })
    .click();
  await page.getByRole("button", { name: "Grid", exact: true }).click();
  await page.locator("summary", { hasText: "Rows & flowlines" }).click();
  const row3 = page.getByRole("button", { name: "Row 3 fits its content" });
  await expect(row3).toHaveAttribute("aria-pressed", "false");
  await row3.click();
  await expect
    .poll(async () => (await stored(page)).layout?.rows.tracks[2].fit)
    .toBe(true);
  await row3.click();
  await expect
    .poll(async () => (await stored(page)).layout?.rows.tracks[2].fit)
    .toBeUndefined();
});
