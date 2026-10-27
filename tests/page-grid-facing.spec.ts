import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import type { Settings } from "../src/model";

// Facing page grids and the five spread starters.
// Screenshots and downloads go to test-results/, which Git ignores.
const evidence = resolve("test-results/evidence/page-grid");
const starters = [
  ["Book page", "print-spread-book"],
  ["Margin notes", "print-spread-notes"],
  ["Spine channel", "print-spread-channel"],
  ["Two grids, one horizon", "print-spread-two-grids"],
  ["Bridge band", "print-spread-bridge"],
] as const;
const frame = (page: Page) =>
  page.locator('.frame-region[data-frame="current"]');

async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByText("Fonts ready", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
}

async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((done) =>
      requestAnimationFrame(() => requestAnimationFrame(() => done())),
    );
  });
}

async function stored(page: Page): Promise<Settings> {
  return page.evaluate(async () => {
    const sourceRoot = "/src/";
    const { loadWorkspace } = (await import(
      sourceRoot + "storage.ts"
    )) as typeof import("../src/storage");
    return (await loadWorkspace()).current!;
  });
}

async function measures(page: Page) {
  await settle(page);
  return frame(page).evaluate((region) => {
    const specimen = region.querySelector<HTMLElement>(".specimen")!;
    const box = specimen.getBoundingClientRect();
    const scale = box.width / specimen.offsetWidth;
    return {
      width: specimen.offsetWidth,
      height: specimen.offsetHeight,
      fold: specimen.offsetWidth / 2,
      blocks: [...region.querySelectorAll<HTMLElement>("[data-block-id]")].map(
        (element) => {
          const rect = element.getBoundingClientRect();
          return {
            id: element.dataset.blockId!,
            text: (element.textContent ?? "").trim().slice(0, 40),
            left: (rect.left - box.left) / scale,
            right: (rect.right - box.left) / scale,
            top: (rect.top - box.top) / scale,
            bottom: (rect.bottom - box.top) / scale,
            clipped:
              element.scrollHeight > element.clientHeight + 5 ||
              element.scrollWidth > element.clientWidth + 3,
          };
        },
      ),
      warnings: [...region.querySelectorAll(".font-warning")].map((element) =>
        element.textContent?.trim(),
      ),
    };
  });
}

async function record(
  page: Page,
  testInfo: TestInfo,
  name: string,
  data: unknown,
) {
  const folder = resolve(evidence, testInfo.project.name);
  await mkdir(folder, { recursive: true });
  await writeFile(
    resolve(folder, `${name}.json`),
    JSON.stringify(data, null, 2) + "\n",
  );
  await frame(page).screenshot({ path: resolve(folder, `${name}.png`) });
}

async function applyStarter(page: Page, name: string) {
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await page
    .getByRole("button", { name: `Apply ${name}`, exact: true })
    .click();
  await expect(page.getByLabel("Print pages")).toHaveValue("facing");
}

for (const [name, id] of starters) {
  test(`${name} applies a page-grid spread with complete, page-contained reading text`, async ({
    page,
  }, testInfo) => {
    await open(page);
    const before = await stored(page);
    await applyStarter(page, name);
    await expect
      .poll(async () => (await stored(page)).layout?.recipeId)
      .toBe(id);
    const settings = await stored(page);
    expect(settings.layout?.pageGrid).toBeTruthy();
    expect(settings.content).toEqual(before.content);
    expect(settings.roles).toEqual(before.roles);
    expect(settings.palette).toEqual(before.palette);
    const measured = await measures(page);
    expect(measured.warnings).toEqual([]);
    const reading = new Set(
      settings
        .layout!.blocks.filter((block) =>
          ["body", "deck", "caption"].includes(block.type),
        )
        .map((block) => block.id),
    );
    for (const block of measured.blocks) {
      expect(
        block.bottom,
        `${block.id} stays on the sheet`,
      ).toBeLessThanOrEqual(measured.height + 1);
      // Fit is checked for reading text, as in facing.spec.ts; display glyphs
      // with tight leading report ink overflow in Chromium without clipping.
      if (!reading.has(block.id) || !block.text) continue;
      expect(block.clipped, `${block.id} fits its frame`).toBe(false);
      expect(
        block.right <= measured.fold - 24 || block.left >= measured.fold + 24,
        `${block.id} keeps 24px from the fold`,
      ).toBe(true);
    }
    await record(page, testInfo, id, { settings, measured });
  });
}

test("Page grid controls mirror, repeat and split the spread, and Spread grid keeps the tracks", async ({
  page,
}, testInfo) => {
  await open(page);
  await applyStarter(page, "Editorial facing");
  await page.getByRole("button", { name: "Grid", exact: true }).click();
  const facingGrid = page.getByRole("group", { name: "Facing grid" });
  await facingGrid
    .getByRole("button", { name: "Page grid", exact: true })
    .click();
  await expect
    .poll(async () => (await stored(page)).layout?.pageGrid?.mode)
    .toBe("mirror");
  await expect(
    page.getByText("Columns and margins come from the page grid"),
  ).toBeVisible();
  await expect(
    page.locator("summary", { hasText: "Columns & gutters" }),
  ).toHaveCount(0);

  const modes = page.getByRole("group", { name: "Page grid mode" });
  await modes.getByRole("button", { name: "Repeat", exact: true }).click();
  await expect
    .poll(async () => (await stored(page)).layout?.pageGrid?.mode)
    .toBe("repeat");
  await page.getByLabel("Right margin", { exact: true }).fill("90");
  await page.getByLabel("Right margin", { exact: true }).press("Enter");
  await expect
    .poll(async () => (await stored(page)).layout?.pageGrid?.inside)
    .toBe(90);

  await modes
    .getByRole("button", { name: "Own right page", exact: true })
    .click();
  await page.getByLabel("Right page columns", { exact: true }).fill("3");
  await page.getByLabel("Right page columns", { exact: true }).press("Enter");
  await expect
    .poll(async () => (await stored(page)).layout?.pageGrid?.right?.length)
    .toBe(3);
  const split = await stored(page);
  expect(split.layout!.columns.tracks).toHaveLength(
    split.layout!.pageGrid!.left.length + 1 + 3,
  );
  await record(page, testInfo, "controls-own-right-page", {
    layout: split.layout,
  });

  await page.getByLabel("Inside margin", { exact: true }).fill("10");
  await page.getByLabel("Inside margin", { exact: true }).press("Enter");
  await expect(page.getByRole("alert")).toContainText(
    "inside margin wider than the column gap",
  );
  expect((await stored(page)).layout).toEqual(split.layout);

  await facingGrid
    .getByRole("button", { name: "Spread grid", exact: true })
    .click();
  await expect
    .poll(async () => (await stored(page)).layout?.pageGrid)
    .toBeUndefined();
  const off = await stored(page);
  expect(off.layout!.columns).toEqual(split.layout!.columns);
  expect(off.layout!.margins).toEqual(split.layout!.margins);
  await expect(
    page.locator("summary", { hasText: "Columns & gutters" }),
  ).toHaveCount(1);
});

test("changing paper size recompiles the page grid and keeps the starter", async ({
  page,
}, testInfo) => {
  await open(page);
  await applyStarter(page, "Book page");
  const a4 = await stored(page);
  await page.getByLabel("Print page size").selectOption("a3");
  await expect
    .poll(async () => (await stored(page)).surface)
    .toMatchObject({ pageSize: "a3" });
  const a3 = await stored(page);
  expect(a3.layout!.pageGrid).toEqual(a4.layout!.pageGrid);
  expect(a3.layout!.blocks).toEqual(a4.layout!.blocks);
  expect(a3.layout!.columns).not.toEqual(a4.layout!.columns);
  const measured = await measures(page);
  expect(measured.warnings).toEqual([]);
  await record(page, testInfo, "book-page-a3", {
    pageGrid: a3.layout!.pageGrid,
    columns: a3.layout!.columns,
    measured,
  });
});

test("each spread starter exports a two-page IDML, live-text SVG and a PDF proof without print warnings", async ({
  page,
}, testInfo) => {
  const chromiumOnly = testInfo.project.name !== "chromium";
  test.skip(chromiumOnly, "PDF proofs use Chromium printing"); // tripwire-allow: PDF proofs need Chromium printing
  test.setTimeout(180_000);
  const folder = resolve(evidence, testInfo.project.name, "exports");
  await mkdir(folder, { recursive: true });
  await open(page);
  const results: unknown[] = [];
  for (const [name, id] of starters) {
    await page.getByRole("button", { name: "Content", exact: true }).click();
    await applyStarter(page, name);
    await expect
      .poll(async () => (await stored(page)).layout?.recipeId)
      .toBe(id);
    await settle(page);
    await page
      .getByRole("button", { name: "Export system", exact: true })
      .click();
    await expect(page.getByLabel("Download contents")).toContainText(
      "one facing spread",
    );

    const svgPending = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download editable SVG for Illustrator" })
      .click();
    const svg = (await readFile((await (await svgPending).path())!)).toString();
    await writeFile(resolve(folder, `${id}.svg`), svg);
    expect(svg).toContain('width="420mm" height="297mm"');
    expect(svg).toContain("<text ");
    expect(svg).toContain("The shape");

    const idmlPending = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download IDML for InDesign" })
      .click();
    const bytes = await readFile((await (await idmlPending).path())!);
    await writeFile(resolve(folder, `${id}.idml`), bytes);
    const zip = unzipSync(new Uint8Array(bytes));
    const spread = strFromU8(zip["Spreads/Spread_ucf.xml"]);
    expect(spread).toContain('PageCount="2"');
    expect(spread.match(/<Page Self=/g)).toHaveLength(2);
    const stories = Object.entries(zip)
      .filter(([key]) => key.startsWith("Stories/"))
      .map(([, value]) => strFromU8(value))
      .join("\n");
    expect(stories).toContain("The shape");

    const popupPending = page
      .waitForEvent("popup", { timeout: 4000 })
      .catch(() => null);
    await page
      .getByRole("button", {
        name: "Illustrator PDF / Save as PDF",
        exact: true,
      })
      .click();
    const popup = await popupPending;
    expect(
      popup,
      `${name} opens the print proof without a Print anyway warning`,
    ).not.toBeNull();
    await popup!.locator(".specimen").waitFor();
    await popup!.evaluate(() => document.fonts.ready);
    await popup!.pdf({
      path: resolve(folder, `${id}.pdf`),
      preferCSSPageSize: true,
      printBackground: true,
      scale: 1,
    });
    await popup!.close();
    results.push({ id, svgBytes: svg.length, idmlPages: 2, pdf: `${id}.pdf` });
  }
  await writeFile(
    resolve(folder, "RESULTS.json"),
    JSON.stringify(results, null, 2) + "\n",
  );
});
