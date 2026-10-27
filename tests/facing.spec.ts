import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Settings } from "../src/model";

const historical = resolve(
  "tests/fixtures/facing",
);
const evidence = resolve(
  "test-results/evidence/facing",
);
const frame = (page: Page) =>
  page.locator('.frame-region[data-frame="current"]');
const warning = (page: Page) => frame(page).locator(".font-warning");
const foldWarning = (page: Page) => warning(page).filter({ hasText: /fold/i });

async function fixture(name: string): Promise<Settings> {
  return JSON.parse(await readFile(resolve(historical, name), "utf8"));
}

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

async function importStudy(page: Page, settings: Settings) {
  await page.getByLabel("Import experiment file").setInputFiles({
    name: "facing-regression.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(settings)),
  });
  await expect(
    page.getByText("Experiment imported.", { exact: true }),
  ).toBeVisible();
  await expect.poll(() => stored(page)).toEqual(settings);
  await settle(page);
}

async function artifact(
  page: Page,
  testInfo: TestInfo,
  name: string,
  data: unknown,
) {
  const folder = resolve(evidence, testInfo.project.name);
  await mkdir(folder, { recursive: true });
  const prefix = (process.env.FACING_EVIDENCE_PHASE ?? "candidate").replace(
    /[^a-zA-Z0-9_-]/g,
    "",
  );
  const json = resolve(folder, `${prefix}-${name}.json`);
  await writeFile(json, JSON.stringify(data, null, 2) + "\n");
  await testInfo.attach(name, { path: json, contentType: "application/json" });
  await frame(page).screenshot({
    path: resolve(folder, `${prefix}-${name}.png`),
  });
}

async function measures(page: Page) {
  await settle(page);
  return frame(page).evaluate((region) => {
    const specimen = region.querySelector<HTMLElement>(".specimen")!;
    const box = specimen.getBoundingClientRect();
    const scale = box.width / specimen.offsetWidth;
    const fold = box.width / scale / 2;
    const blocks = [
      ...region.querySelectorAll<HTMLElement>("[data-block-id]"),
    ].map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        id: element.dataset.blockId!,
        label: element.dataset.zone,
        text: element.classList.contains("layout-body")
          ? [...element.querySelectorAll("p")]
              .map((paragraph) => paragraph.textContent)
              .join("\n\n")
          : element.textContent,
        left: (rect.left - box.left) / scale,
        right: (rect.right - box.left) / scale,
        top: (rect.top - box.top) / scale,
        bottom: (rect.bottom - box.top) / scale,
        clipped:
          element.scrollHeight > element.clientHeight + 5 ||
          element.scrollWidth > element.clientWidth + 3,
      };
    });
    return {
      width: specimen.offsetWidth,
      height: specimen.offsetHeight,
      fold,
      scale,
      blocks,
      warnings: [...region.querySelectorAll(".font-warning")].map((element) =>
        element.textContent?.trim(),
      ),
    };
  });
}

function expectShared(after: Settings, before: Settings) {
  expect(after.content).toEqual(before.content);
  expect(after.roles).toEqual(before.roles);
  expect(after.palette).toEqual(before.palette);
  expect(after.comparison).toEqual(before.comparison);
  expect(after.name).toBe(before.name);
  expect(after.measure).toBe(before.measure);
  expect(after.width).toBe(before.width);
  expect(after.fontDependencies).toEqual(before.fontDependencies);
  if (after.surface?.mode === "print" && before.surface?.mode === "print") {
    expect(after.surface.pageSize).toBe(before.surface.pageSize);
    expect(after.surface.orientation).toBe(before.surface.orientation);
  }
}

async function customBoundary(
  clearance: number,
  options: {
    body?: string;
    side?: "left" | "right";
    straddle?: boolean;
    type?: "body" | "deck" | "caption";
  } = {},
): Promise<Settings> {
  const settings = await fixture("a4-editorial-single-default.json");
  settings.name = `Fold control ${clearance}px`;
  settings.measure = 100;
  settings.content.body = options.body ?? "Reading copy beside the fold.";
  settings.content.deck = "Reading deck beside the fold.";
  settings.content.caption = "Supporting caption beside the fold.";
  const layout = settings.layout!;
  layout.recipeId = "custom-fold-control";
  layout.columns = {
    tracks: [{ weight: 1 }, { weight: 1 }],
    gap: clearance * 2,
  };
  layout.rows = {
    tracks: [{ weight: 1 }, { weight: 1 }, { weight: 1 }],
    gap: 24,
    auto: false,
  };
  layout.margins = { top: 36, right: 36, bottom: 36, left: 36, linked: true };
  layout.variants = {};
  const title = structuredClone(
    layout.blocks.find((block) => block.type === "title")!,
  );
  title.placement = {
    wide: { column: 1, span: 2, row: 1, rowSpan: 1, align: "start" },
  };
  const body = structuredClone(
    layout.blocks.find((block) => block.type === (options.type ?? "body"))!,
  );
  body.placement = {
    wide: {
      column: options.side === "right" ? 2 : 1,
      span: options.straddle ? 2 : 1,
      row: 2,
      rowSpan: 1,
      align: "start",
    },
  };
  layout.blocks = [title, body];
  // Other copy is deliberately retained and unused in these geometric controls.
  return settings;
}

test("Editorial starter actions select page count and preserve shared fields and pinned A", async ({
  page,
}, testInfo) => {
  await open(page);
  const settings = await fixture("original-swedish-facing-final.json");
  settings.surface = {
    mode: "print",
    pageSize: "letter",
    orientation: "landscape",
    pages: "single",
  };
  await importStudy(page, settings);
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await page
    .getByLabel("Comparison intent")
    .fill("Keep A while applying a reading spread to B.");
  await expect
    .poll(async () => (await stored(page)).comparison?.intent)
    .toBe("Keep A while applying a reading spread to B.");
  const before = await stored(page);
  await page
    .getByRole("button", { name: "Apply Editorial facing", exact: true })
    .click();
  await expect(page.getByLabel("Print pages")).toHaveValue("facing");
  await expect(page.locator(".message.notice").first()).toContainText(
    /facing/i,
  );
  await expect
    .poll(async () => (await stored(page)).surface)
    .toEqual({ ...settings.surface, pages: "facing" });
  const facing = await stored(page);
  expectShared(facing, before);
  await expect(frame(page).locator(".layout-body")).toBeVisible();
  await page
    .getByRole("button", { name: "Apply Editorial single", exact: true })
    .click();
  await expect(page.getByLabel("Print pages")).toHaveValue("single");
  await expect(page.locator(".message.notice").first()).toContainText(
    /single/i,
  );
  await expect
    .poll(async () => (await stored(page)).surface)
    .toEqual(settings.surface);
  const single = await stored(page);
  expectShared(single, before);
  await page.reload();
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  expect(await stored(page)).toEqual(single);
  await artifact(page, testInfo, "starter-mode-preservation", {
    before,
    facing,
    single,
  });
});

test("Poster retains Single and Facing and visibly names the result", async ({
  page,
}, testInfo) => {
  await open(page);
  await page.getByRole("button", { name: "Print", exact: true }).click();
  const results: unknown[] = [];
  for (const pages of ["single", "facing"] as const) {
    await page.getByLabel("Print pages").selectOption(pages);
    await expect
      .poll(async () => (await stored(page)).surface)
      .toMatchObject({ pages });
    const before = await stored(page);
    await page
      .getByRole("button", { name: "Apply Poster", exact: true })
      .click();
    await expect(page.getByLabel("Print pages")).toHaveValue(pages);
    await expect(page.locator(".message.notice").first()).toContainText(
      new RegExp(pages, "i"),
    );
    await settle(page);
    const after = await stored(page);
    expectShared(after, before);
    results.push({
      pages,
      metrics: await measures(page),
      sharedPreserved: true,
    });
  }
  await artifact(page, testInfo, "poster-page-mode", results);
});

test("each Print starter can mount Grid and apply its selected supported recipe without errors or changing shared settings and A", async ({
  page,
}, testInfo) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await open(page);
  const settings = await fixture("a4-editorial-single-default.json");
  settings.surface = {
    mode: "print",
    pageSize: "a4",
    orientation: "portrait",
    pages: "single",
  };
  await importStudy(page, settings);
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await page
    .getByLabel("Comparison intent")
    .fill(
      "Keep reference A while moving from Print starters into Grid recipes.",
    );
  await expect
    .poll(async () => (await stored(page)).comparison?.intent)
    .toBe(
      "Keep reference A while moving from Print starters into Grid recipes.",
    );
  const original = await stored(page);
  const outcomes: unknown[] = [];
  for (const starter of ["Editorial single", "Editorial facing", "Poster"]) {
    // Leave Grid so each Print-specific study exercises its initial selection.
    await page.getByRole("button", { name: "Content", exact: true }).click();
    const previousRecipe = (await stored(page)).layout?.recipeId;
    await page
      .getByRole("button", { name: `Apply ${starter}`, exact: true })
      .click();
    await expect
      .poll(async () => (await stored(page)).layout?.recipeId)
      .not.toBe(previousRecipe);
    const starterRecipe = (await stored(page)).layout?.recipeId;
    await page.getByRole("button", { name: "Grid", exact: true }).click();
    await expect(page.locator(".ge-current-recipe")).toHaveText(
      `Current: ${starter}`,
    );
    const selected = page.locator('.ge-recipe[aria-pressed="true"]');
    await expect(selected).toHaveCount(1);
    const selectedName = (await selected.locator("span").textContent())!.trim();
    expect(selectedName).not.toBe("");
    await page
      .getByRole("button", { name: "Apply selected recipe", exact: true })
      .click();
    await expect(page.locator(".ge-current-recipe")).toHaveText(
      `Current: ${selectedName}`,
    );
    await expect
      .poll(async () => (await stored(page)).layout?.recipeId)
      .not.toBe(starterRecipe);
    await expect(
      page.getByText("Saved on this device", { exact: true }),
    ).toBeVisible();
    await settle(page);
    const after = await stored(page);
    expectShared(after, original);
    expect(after.surface?.mode).toBe("print");
    expect(pageErrors).toEqual([]);
    outcomes.push({
      starter,
      selectedName,
      after,
      pageErrors: [...pageErrors],
    });
  }
  await artifact(page, testInfo, "print-starter-grid-recipe", {
    outcomes,
    pageErrors,
  });
});

test("historical omitted Body is disclosed without changing imported settings, and reapplication repairs it", async ({
  page,
}, testInfo) => {
  await open(page);
  const settings = await fixture("a4-editorial-facing-default.json");
  await importStudy(page, settings);
  await expect(frame(page).locator(".layout-body")).toHaveCount(0);
  await expect(warning(page)).toContainText(
    /Body.*(not.*display|not.*shown|unused|omitt)/i,
  );
  await expect(warning(page)).toContainText(/apply Editorial facing/i);
  await page.reload();
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  expect(await stored(page)).toEqual(settings);
  await expect(warning(page)).toContainText(
    /Body.*(not.*display|not.*shown|unused|omitt)/i,
  );
  const before = await measures(page);
  await page
    .getByRole("button", { name: "Apply Editorial facing", exact: true })
    .click();
  await expect(frame(page).locator(".layout-body")).toBeVisible();
  await expect(
    warning(page).filter({
      hasText: /Body.*(not.*display|not.*shown|unused|omitt)/i,
    }),
  ).toHaveCount(0);
  await expect
    .poll(async () =>
      (await stored(page)).layout?.blocks.some(
        (block) => block.contentKey === "body",
      ),
    )
    .toBe(true);
  expectShared(await stored(page), settings);
  await artifact(page, testInfo, "historical-body-omission", {
    before,
    after: await measures(page),
  });
});

test("manual page changes preserve custom placements and fold warning survives scaled mobile preview and Print anyway", async ({
  page,
}, testInfo) => {
  await open(page);
  const settings = await fixture("a4-editorial-single-default.json");
  await importStudy(page, settings);
  await expect(foldWarning(page)).toContainText(/Reading text/i);
  const desktop = await measures(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(foldWarning(page)).toContainText(/Reading text/i);
  const mobile = await measures(page);
  expect(mobile.scale).toBeLessThan(desktop.scale);
  expect(mobile.warnings).toEqual(desktop.warnings);
  expect(await stored(page)).toEqual(settings);
  await page.getByLabel("Print pages").selectOption("single");
  await expect(foldWarning(page)).toHaveCount(0);
  await expect
    .poll(async () => (await stored(page)).surface)
    .toEqual({ ...settings.surface, pages: "single" });
  expect((await stored(page)).layout).toEqual(settings.layout);
  await page.getByLabel("Print pages").selectOption("facing");
  await expect(foldWarning(page)).toContainText(/Reading text/i);
  await expect.poll(() => stored(page)).toEqual(settings);
  await page
    .getByRole("button", { name: "Export system", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Illustrator PDF / Save as PDF", exact: true })
    .click();
  await expect(
    page.getByText("Print preview needs attention", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".print-warning")).toContainText(/fold/i);
  const popupEvent = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Print anyway", exact: true }).click();
  const popup = await popupEvent;
  await expect(popup.locator(".specimen")).toBeVisible();
  await expect(popup.locator(".font-warning, .print-warning")).toHaveCount(0);
  expect(
    (await popup.locator(".layout-body p").allTextContents())
      .join("\n\n")
      ?.replace(/\s+/g, " ")
      .trim(),
  ).toBe(settings.content.body.replace(/\s+/g, " ").trim());
  await popup.close();
  await artifact(page, testInfo, "manual-mode-mobile-print", {
    desktop,
    mobile,
    settingsPreserved: true,
  });
});

test("fold diagnostics settle after delayed bundled fonts and remain available to Print", async ({
  page,
}, testInfo) => {
  let releaseFonts!: () => void;
  const fontsReleased = new Promise<void>((resolve) => {
    releaseFonts = resolve;
  });
  const heldFonts: string[] = [];
  await page.route(/\/fonts\/.*\.(woff2?|ttf|otf)(\?.*)?$/, async (route) => {
    heldFonts.push(route.request().url());
    await fontsReleased;
    await route.continue();
  });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect.poll(() => heldFonts.length).toBeGreaterThan(0);
    await expect(
      page.getByText("Loading fonts…", { exact: true }),
    ).toBeVisible();
    const settings = await fixture("a4-editorial-single-default.json");
    await page.getByLabel("Import experiment file").setInputFiles({
      name: "delayed-font-facing.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(settings)),
    });
    await expect.poll(() => stored(page)).toEqual(settings);
    releaseFonts();
    await expect(page.getByText("Fonts ready", { exact: true })).toBeVisible();
    await settle(page);
    await expect(foldWarning(page)).toContainText(/Reading text/i);
    const desktop = await measures(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(foldWarning(page)).toContainText(/Reading text/i);
    const mobile = await measures(page);
    expect(mobile.warnings).toEqual(desktop.warnings);
    expect(await stored(page)).toEqual(settings);
    await artifact(page, testInfo, "delayed-font-warning", {
      heldFonts,
      desktop,
      mobile,
      settingsPreserved: true,
    });
    await page
      .getByRole("button", { name: "Export system", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Illustrator PDF / Save as PDF",
        exact: true,
      })
      .click();
    await expect(page.locator(".print-warning")).toContainText(/fold/i);
    await expect(
      page.getByRole("button", { name: "Print anyway", exact: true }),
    ).toBeVisible();
  } finally {
    releaseFonts();
    await page.unrouteAll({ behavior: "wait" });
  }
});

for (const clearance of [23, 24, 25]) {
  test(`Body fold corridor boundary ${clearance}px is consistent at desktop and mobile`, async ({
    page,
  }, testInfo) => {
    await open(page);
    const settings = await customBoundary(clearance);
    await importStudy(page, settings);
    if (clearance < 24)
      await expect(foldWarning(page)).toContainText(/Reading text/i);
    else await expect(foldWarning(page)).toHaveCount(0);
    const desktop = await measures(page);
    const body = desktop.blocks.find((block) => block.id === "body")!;
    expect(Math.abs(desktop.fold - body.right - clearance)).toBeLessThan(0.15);
    await page.setViewportSize({ width: 390, height: 844 });
    if (clearance < 24)
      await expect(foldWarning(page)).toContainText(/Reading text/i);
    else await expect(foldWarning(page)).toHaveCount(0);
    const mobile = await measures(page);
    expect(mobile.warnings).toEqual(desktop.warnings);
    expect(
      Math.abs(
        mobile.blocks.find((block) => block.id === "body")!.right - body.right,
      ),
    ).toBeLessThan(0.15);
    expect(await stored(page)).toEqual(settings);
    await artifact(page, testInfo, `boundary-${clearance}px`, {
      desktop,
      mobile,
    });
  });
}

test("empty Body and intentional title crossing do not produce fold warnings, but a straddling Body does", async ({
  page,
}, testInfo) => {
  await open(page);
  const empty = await customBoundary(23, { body: "" });
  await importStudy(page, empty);
  await expect(foldWarning(page)).toHaveCount(0);
  const emptyMetrics = await measures(page);
  const title = emptyMetrics.blocks.find((block) => block.id === "title")!;
  expect(title.left).toBeLessThan(emptyMetrics.fold);
  expect(title.right).toBeGreaterThan(emptyMetrics.fold);
  const straddling = await customBoundary(24, { straddle: true });
  await importStudy(page, straddling);
  await expect(foldWarning(page)).toContainText(/Reading text/i);
  const straddlingMetrics = await measures(page);
  expect(
    straddlingMetrics.blocks.find((block) => block.id === "body")!.right,
  ).toBeGreaterThan(straddlingMetrics.fold);
  await artifact(page, testInfo, "empty-display-and-straddling-controls", {
    empty: emptyMetrics,
    straddling: straddlingMetrics,
  });
});

for (const type of ["deck", "caption"] as const) {
  test(`the ${type} reading block near the right-page fold gets a named warning`, async ({
    page,
  }, testInfo) => {
    await open(page);
    const settings = await customBoundary(23, { side: "right", type });
    await importStudy(page, settings);
    await expect(foldWarning(page)).toContainText(new RegExp(type, "i"));
    const desktop = await measures(page);
    expect(
      Math.abs(
        desktop.blocks.find((block) => block.id === type)!.left -
          desktop.fold -
          23,
      ),
    ).toBeLessThan(0.15);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(foldWarning(page)).toContainText(new RegExp(type, "i"));
    const mobile = await measures(page);
    expect(mobile.warnings).toEqual(desktop.warnings);
    await artifact(page, testInfo, `${type}-right-page-warning`, {
      desktop,
      mobile,
    });
  });
}

test("new Print Poster separates full body and caption in both page modes while imported Poster remains unchanged", async ({
  page,
}, testInfo) => {
  await open(page);
  const historicalPoster = await fixture("a4-poster-default.json");
  await importStudy(page, historicalPoster);
  expect(await stored(page)).toEqual(historicalPoster);
  await expect(warning(page)).toContainText(/Reading text \/ Caption/i);
  const before = await measures(page);
  const results: unknown[] = [];
  for (const pages of ["single", "facing"] as const) {
    await page.getByLabel("Print pages").selectOption(pages);
    await page
      .getByRole("button", { name: "Apply Poster", exact: true })
      .click();
    await settle(page);
    await expect(frame(page).locator(".layout-body")).toBeVisible();
    await expect(frame(page).locator(".layout-caption")).toHaveText(
      historicalPoster.content.caption,
    );
    await expect(
      warning(page).filter({
        hasText: /Reading text \/ Caption|Caption \/ Reading text/i,
      }),
    ).toHaveCount(0);
    const metrics = await measures(page);
    const body = metrics.blocks.find((block) => block.id === "body")!;
    const caption = metrics.blocks.find((block) => block.id === "caption")!;
    expect(body.text?.replace(/\s+/g, " ").trim()).toBe(
      historicalPoster.content.body.replace(/\s+/g, " ").trim(),
    );
    expect(body.clipped).toBe(false);
    expect(caption.clipped).toBe(false);
    const xOverlap =
      Math.min(body.right, caption.right) - Math.max(body.left, caption.left);
    const yOverlap =
      Math.min(body.bottom, caption.bottom) - Math.max(body.top, caption.top);
    expect(xOverlap <= 0 || yOverlap <= 0).toBe(true);
    expect(body.bottom).toBeLessThanOrEqual(metrics.height + 0.5);
    expect(caption.bottom).toBeLessThanOrEqual(metrics.height + 0.5);
    results.push({ pages, metrics });
  }
  await artifact(page, testInfo, "poster-caption-separation", {
    before,
    results,
  });
});

test("fixed long prose remains exact and gets fit feedback after applying facing", async ({
  page,
}, testInfo) => {
  await open(page);
  const settings = await fixture("a4-editorial-facing-long-prose.json");
  await importStudy(page, settings);
  await page
    .getByRole("button", { name: "Apply Editorial facing", exact: true })
    .click();
  await expect(frame(page).locator(".layout-body")).toBeVisible();
  await expect(warning(page)).toContainText(
    /extends beyond|exceeds|fit|overflow/i,
  );
  await expect
    .poll(async () => (await stored(page)).content)
    .toEqual(settings.content);
  expect(
    (await frame(page).locator(".layout-body p").allTextContents())
      .join("\n\n")
      ?.replace(/\s+/g, " ")
      .trim(),
  ).toBe(settings.content.body.replace(/\s+/g, " ").trim());
  await artifact(page, testInfo, "long-copy-capacity", {
    metrics: await measures(page),
    retainedLength: settings.content.body.length,
  });
});

for (const copy of ["default", "swedish"] as const) {
  test(`new facing ${copy} Body is complete and page-contained with reading clearance`, async ({
    page,
  }, testInfo) => {
    await open(page);
    const settings = await fixture(`a4-editorial-facing-${copy}.json`);
    await importStudy(page, settings);
    await page
      .getByRole("button", { name: "Apply Editorial facing", exact: true })
      .click();
    await expect(frame(page).locator(".layout-body")).toBeVisible();
    await expect(warning(page)).toHaveCount(0);
    const metrics = await measures(page);
    const body = metrics.blocks.find((block) => block.id === "body")!;
    expect(body.text?.replace(/\s+/g, " ").trim()).toBe(
      settings.content.body.replace(/\s+/g, " ").trim(),
    );
    for (const id of ["body", "deck", "caption"]) {
      const block = metrics.blocks.find((item) => item.id === id)!;
      expect(block, `${id} is present`).toBeTruthy();
      expect(block.clipped, `${id} fits its frame`).toBe(false);
      expect(block.left).toBeGreaterThanOrEqual(-0.5);
      expect(block.right).toBeLessThanOrEqual(metrics.width + 0.5);
      expect(block.bottom).toBeLessThanOrEqual(metrics.height + 0.5);
      expect(
        block.right <= metrics.fold - 23.5 || block.left >= metrics.fold + 23.5,
        `${id} clears the fold corridor`,
      ).toBe(true);
    }
    const words = await frame(page)
      .locator(".layout-body")
      .evaluate((element) => {
        const sheet = element.closest(".specimen") as HTMLElement;
        const box = sheet.getBoundingClientRect();
        const scale = box.width / sheet.offsetWidth;
        const fold = sheet.offsetWidth / 2;
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        let count = 0;
        let acrossFold = 0;
        let outsidePage = 0;
        while ((node = walker.nextNode())) {
          for (const match of node.textContent!.matchAll(/\S+/g)) {
            const range = document.createRange();
            range.setStart(node, match.index!);
            range.setEnd(node, match.index! + match[0].length);
            for (const rect of range.getClientRects()) {
              count++;
              const left = (rect.left - box.left) / scale;
              const right = (rect.right - box.left) / scale;
              const top = (rect.top - box.top) / scale;
              const bottom = (rect.bottom - box.top) / scale;
              if (left < fold && right > fold) acrossFold++;
              if (
                left < -0.5 ||
                right > sheet.offsetWidth + 0.5 ||
                top < -0.5 ||
                bottom > sheet.offsetHeight + 0.5
              )
                outsidePage++;
            }
          }
        }
        return { count, acrossFold, outsidePage };
      });
    expect(words.count).toBeGreaterThan(0);
    expect(words.acrossFold).toBe(0);
    expect(words.outsidePage).toBe(0);
    await expect
      .poll(async () => (await stored(page)).content)
      .toEqual(settings.content);
    await artifact(page, testInfo, `new-facing-${copy}-reading`, {
      metrics,
      words,
      retainedLength: settings.content.body.length,
    });
  });
}

test("Web and Social retain their settings and do not acquire a Print fold warning", async ({
  page,
}, testInfo) => {
  await open(page);
  const settings = await customBoundary(23, { straddle: true });
  settings.surface = { mode: "web" };
  await importStudy(page, settings);
  await expect(foldWarning(page)).toHaveCount(0);
  await expect(frame(page).locator(".surface-fold")).toHaveCount(0);
  expect(await stored(page)).toEqual(settings);
  await page.getByRole("button", { name: "Social", exact: true }).click();
  await page.getByLabel("Social format").selectOption("square");
  await page
    .getByRole("button", { name: "Apply Statement", exact: true })
    .click();
  await expect(foldWarning(page)).toHaveCount(0);
  await expect(frame(page).locator(".surface-fold")).toHaveCount(0);
  await expect
    .poll(async () => (await stored(page)).surface)
    .toEqual({ mode: "social", format: "square" });
  const social = await stored(page);
  expect(social.content).toEqual(settings.content);
  expect(social.roles).toEqual(settings.roles);
  expect(social.palette).toEqual(settings.palette);
  const metrics = await measures(page);
  expect(metrics.width).toBe(1080);
  expect(metrics.height).toBe(1080);
  await artifact(page, testInfo, "web-social-control", {
    settingsPreserved: true,
    metrics,
  });
});
