import AxeBuilder from "@axe-core/playwright";
import { test as base, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { unzipSync, strFromU8 } from "fflate";

// Every test uses an isolated temporary browser profile, never your own browser.
const test = base.extend<{ criticalErrors: string[] }>({
  criticalErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await use(errors);
      expect(errors, "No uncaught exceptions or console errors").toEqual([]);
    },
    { auto: true },
  ],
});
const headline = "Återhämtning, ögonblick och förändring";
const reading =
  "När världen förändras behöver vi utrymme för eftertanke. Å, ä och ö hör hemma i varje omsorgsfull typografisk undersökning. ".repeat(
    18,
  );
async function open(page: Page) {
  await page.goto("/");
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Fonts ready", { exact: true })).toBeVisible();
}
async function settled(page: Page) {
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
}
async function zipDownload(page: Page) {
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download system package", exact: true })
    .click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  const path = await download.path();
  expect(path).toBeTruthy();
  return { bytes: await readFile(path!), name: download.suggestedFilename() };
}

test("edited copy persists through reload and all three compositions", async ({
  page,
}) => {
  await open(page);
  await page.getByLabel("Experiment name").fill("Svensk studie");
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await page.getByLabel("Headline", { exact: true }).fill(headline);
  await page.getByLabel("Reading text", { exact: true }).fill(reading);
  for (const name of ["Interface", "Poster", "Editorial"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.locator(".specimen h1")).toHaveText(headline);
    await expect(page.locator(".specimen")).toContainText(reading.trim());
  }
  await settled(page);
  await page.reload();
  await expect(page.getByLabel("Experiment name")).toHaveValue("Svensk studie");
  await expect(page.locator(".specimen h1")).toHaveText(headline);
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await expect(page.getByLabel("Reading text", { exact: true })).toHaveValue(
    reading,
  );
});

test("named snapshot restores after reload and A/B remains independently pinned", async ({
  page,
}) => {
  await open(page);
  await page.getByLabel("Experiment name").fill("Reference one");
  await page
    .getByRole("button", { name: "Save snapshot", exact: true })
    .click();
  await expect(
    page.getByText("Snapshot saved. Find it in Experiments."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await page
    .getByLabel("Headline", { exact: true })
    .fill("Current independent version");
  await expect(page.locator(".frame-region").nth(0).locator("h1")).toHaveText(
    "Current independent version",
  );
  await expect(
    page.locator(".frame-region").nth(1).locator("h1"),
  ).toContainText("The shape");
  await page.getByRole("button", { name: "Use reference settings" }).click();
  await expect(
    page.locator(".frame-region").first().locator("h1"),
  ).toContainText("The shape");
  await settled(page);
  await page.reload();
  await page.getByRole("button", { name: /^Experiments/ }).click();
  await expect(page.locator(".saved-item")).toHaveCount(1);
  await page.getByLabel("Experiment name").fill("Unsaved branch");
  await page
    .locator(".saved-item")
    .getByRole("button", { name: "Open", exact: true })
    .click();
  await expect(page.getByLabel("Experiment name")).toHaveValue("Reference one");
  await page
    .locator(".saved-item")
    .getByRole("button", { name: "Compare", exact: true })
    .click();
  await expect(page.locator(".frame-region")).toHaveCount(2);
});

test("reset, import and the wordmark keep the latest study across an immediate reload", async ({
  page,
}) => {
  await open(page);
  await page.getByLabel("Experiment name").fill("Harbour study");
  await settled(page);
  await page.getByRole("button", { name: "Save snapshot", exact: true }).click();
  await expect(page.getByText("Snapshot saved. Find it in Experiments.")).toBeVisible();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export system", exact: true }).click();
  await page.getByRole("button", { name: "Download settings only", exact: true }).click();
  const settingsFile = await (await pending).path();
  await page.getByLabel("Experiment name").fill("Temporary detour");
  await settled(page);
  await page.getByLabel("Import experiment file").setInputFiles(settingsFile!);
  await expect(page.getByText("Experiment imported.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Experiment name")).toHaveValue("Harbour study");
  await page.getByRole("button", { name: "Reset current study", exact: true }).click();
  await expect(page.getByText("Current study reset. Saved snapshots are unchanged.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Experiment name")).toHaveValue("An exercise in attention");
  await page.getByRole("button", { name: /^Experiments/ }).click();
  await expect(page.getByRole("heading", { name: "Harbour study" })).toBeVisible();
  await page.getByLabel("Experiment name").fill("Caught mid-save");
  await page.getByRole("link", { name: "Counterform home" }).click();
  await expect(page.getByText("Fonts ready", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Experiment name")).toHaveValue("Caught mid-save");
});

test("colour, grid, layout and keyboard controls change the rendered specimen", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Colour", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Cobalt paper", exact: true }).click();
  await expect(page.locator(".specimen")).toHaveCSS(
    "background-color",
    "rgb(233, 237, 243)",
  );
  await page.getByRole("button", { name: "Grid", exact: true }).click();
  await page.getByLabel("Composition structure").selectOption("balanced");
  await page
    .getByRole("spinbutton", { name: "Columns value", exact: true })
    .fill("6");
  await page
    .getByRole("spinbutton", { name: "Gutter value", exact: true })
    .fill("32");
  await page.getByLabel("Columns & modules").check();
  await page.getByLabel("Baseline guide").check();
  await expect(page.locator(".grid-overlay i")).toHaveCount(6);
  await expect(page.locator(".sheet-shell")).toHaveClass(/show-grid/);
  await expect(page.locator(".sheet-shell")).toHaveClass(/show-baseline/);
  expect(
    await page
      .locator(".specimen")
      .evaluate((el) => getComputedStyle(el).getPropertyValue("--gutter")),
  ).toBe("32px");
  await settled(page);
  await page.reload();
  await expect(page.locator(".specimen")).toHaveCSS(
    "background-color",
    "rgb(233, 237, 243)",
  );
  await expect(page.locator(".grid-overlay i")).toHaveCount(6);
  await page.getByRole("button", { name: "Grid", exact: true }).click();
  await expect(page.getByLabel("Composition structure")).toHaveValue(
    "balanced",
  );
  await page.getByRole("slider", { name: "Gutter", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("spinbutton", { name: "Gutter value", exact: true }),
  ).toHaveValue("33");
});

test("actual 320px canvas reflows long Swedish content under text-spacing overrides", async ({
  page,
}) => {
  await open(page);
  await page.getByLabel("Canvas width").selectOption("320");
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await page.getByLabel("Headline", { exact: true }).fill(headline);
  await page.getByLabel("Reading text", { exact: true }).fill(reading);
  await page.getByRole("button", { name: "Grid", exact: true }).click();
  await page.getByLabel("Text-spacing stress test").check();
  for (const name of ["Editorial", "Interface", "Poster"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.locator(".sheet")).toHaveCSS("width", "320px");
    await expect(page.locator(".specimen h1")).toHaveText(headline);
    const bounds = await page
      .locator(".specimen")
      .evaluate((el) => ({ client: el.clientWidth, scroll: el.scrollWidth }));
    expect(bounds.client).toBe(320);
    expect(
      bounds.scroll,
      `${name} must not overflow horizontally`,
    ).toBeLessThanOrEqual(321);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "test-results/evidence/narrow-swedish.png",
    fullPage: true,
  });
});

test("private upload deduplicates, persists, and ZIP omission/inclusion round-trips safely", async ({
  page,
  browser,
  criticalErrors,
}) => {
  await open(page);
  const bytes = await readFile(
    resolve("public/fonts/dm-serif-display/normal-400.ttf"),
  );
  const file = {
    name: "Private-test.ttf",
    mimeType: "font/ttf",
    buffer: bytes,
  };
  await page
    .getByLabel("Upload font file", { exact: true })
    .setInputFiles(file);
  await expect(page.getByLabel("Font family", { exact: true })).toHaveValue(
    /^upload-/,
  );
  await page
    .getByLabel("Upload font file", { exact: true })
    .setInputFiles(file);
  await expect(page.locator(".uploaded-row")).toHaveCount(1);
  await settled(page);
  await page.reload();
  await expect(page.getByLabel("Font family", { exact: true })).toHaveValue(
    /^upload-/,
  );
  await expect(page.getByText("Fonts ready", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Export system", exact: true })
    .click();
  await expect(
    page.getByLabel("Include selected private font files in this ZIP, SVG or PDF"),
  ).not.toBeChecked();
  const omitted = await zipDownload(page);
  const unpacked = unzipSync(omitted.bytes);
  expect(
    [
      "settings.json",
      "fonts.json",
      "tokens.css",
      "specimen.html",
      "DESIGN.md",
      "README.txt",
    ].every((name) => name in unpacked),
  ).toBe(true);
  expect(
    Object.keys(unpacked).some((name) => name.startsWith("fonts/private/")),
  ).toBe(false);
  expect(Object.keys(unpacked).some((name) => name.endsWith("OFL.txt"))).toBe(
    true,
  );
  expect(
    JSON.parse(strFromU8(unpacked["fonts.json"])).fonts.find(
      (font: { kind: string }) => font.kind === "upload",
    ).included,
  ).toBe(false);
  await page.getByLabel("Include selected private font files in this ZIP, SVG or PDF").check();
  await page.getByLabel(/I confirm my licence permits/).check();
  const included = await zipDownload(page);
  const complete = unzipSync(included.bytes);
  expect(
    Object.keys(complete).filter((name) => name.startsWith("fonts/private/")),
  ).toHaveLength(1);
  const context = await browser.newContext();
  const restored = await context.newPage();
  restored.on("pageerror", (error) => criticalErrors.push(error.message));
  restored.on("console", (message) => {
    if (message.type() === "error") criticalErrors.push(message.text());
  });
  try {
    await open(restored);
    await restored
      .getByLabel("Import experiment file")
      .setInputFiles({
        name: omitted.name,
        mimeType: "application/zip",
        buffer: omitted.bytes,
      });
    await expect(
      restored.getByText(/Restore the private font for display/),
    ).toBeVisible();
    await expect(
      restored.getByText("Font unavailable · fallback shown", { exact: true }),
    ).toBeVisible();
    await restored
      .getByLabel("Import experiment file")
      .setInputFiles({
        name: included.name,
        mimeType: "application/zip",
        buffer: included.bytes,
      });
    await expect(
      restored.getByText("Fonts ready", { exact: true }),
    ).toBeVisible();
    await expect(
      restored.getByText(/Restore the private font for display/),
    ).toHaveCount(0);
    await expect(restored.locator(".uploaded-row")).toHaveCount(1);
    await settled(restored);
    await restored.reload();
    await expect(
      restored.getByText("Fonts ready", { exact: true }),
    ).toBeVisible();
    await expect(
      restored.getByLabel("Font family", { exact: true }),
    ).toHaveValue(/^upload-/);
  } finally {
    await context.close();
  }
});

test("invalid imports and font files report errors without replacing current work", async ({
  page,
}) => {
  await open(page);
  await page.getByLabel("Experiment name").fill("Keep this working study");
  await page
    .getByLabel("Import experiment file")
    .setInputFiles({
      name: "broken.json",
      mimeType: "application/json",
      buffer: Buffer.from("{invalid"),
    });
  await expect(page.getByRole("alert")).toContainText("JSON is invalid");
  await expect(page.getByLabel("Experiment name")).toHaveValue(
    "Keep this working study",
  );
  await page
    .getByLabel("Import experiment file")
    .setInputFiles({
      name: "wrong.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"schemaVersion":999}'),
    });
  await expect(page.getByRole("alert")).toContainText(
    "not a supported Counterform",
  );
  await page
    .getByLabel("Upload font file", { exact: true })
    .setInputFiles({
      name: "broken.ttf",
      mimeType: "font/ttf",
      buffer: Buffer.from("not actually a font"),
    });
  await expect(page.getByRole("alert")).toContainText(
    "Font could not be added",
  );
  await expect(page.getByLabel("Experiment name")).toHaveValue(
    "Keep this working study",
  );
  await expect(page.locator(".uploaded-row")).toHaveCount(0);
});

test("all eight curated pairings work without external network, including local reload", async ({
  page,
  context,
}) => {
  await open(page);
  const external: string[] = [];
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
      external.push(url.href);
      return route.abort();
    }
    return route.continue();
  });
  const values = await page
    .getByLabel("Font pairing", { exact: true })
    .locator("option")
    .evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value),
    );
  expect(values).toHaveLength(8);
  for (const value of values) {
    await page.getByLabel("Font pairing", { exact: true }).selectOption(value);
    await expect(page.getByText("Fonts ready", { exact: true })).toBeVisible();
  }
  await settled(page);
  await page.reload();
  await expect(page.getByText("Fonts ready", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Export system", exact: true })
    .click();
  expect((await zipDownload(page)).bytes.byteLength).toBeGreaterThan(1000);
  expect(external).toEqual([]);
});

test("exported HTML reproduces edited type, grid and content, and settings JSON reopens", async ({
  page,
  browser,
}) => {
  await open(page);
  await page.getByLabel("Experiment name").fill("Export parity study");
  await page
    .getByRole("spinbutton", { name: "Size value", exact: true })
    .fill("92");
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await page.getByLabel("Headline", { exact: true }).fill(headline);
  await page.getByRole("button", { name: "Grid", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "Columns value", exact: true })
    .fill("8");
  await page
    .getByRole("spinbutton", { name: "Gutter value", exact: true })
    .fill("20");
  await page.getByRole("button", { name: "Colour", exact: true }).click();
  await page
    .getByRole("button", { name: "Moss & citron", exact: true })
    .click();
  const readStyle = () =>
    page.locator(".specimen h1").evaluate((el) => {
      const css = getComputedStyle(el);
      return {
        family: css.fontFamily,
        size: css.fontSize,
        weight: css.fontWeight,
        leading: css.lineHeight,
        spacing: css.letterSpacing,
        colour: css.color,
      };
    });
  const previewStyle = await readStyle();
  const previewMarkup = await page.locator(".specimen").innerHTML();
  await page
    .getByRole("button", { name: "Export system", exact: true })
    .click();
  const archive = unzipSync((await zipDownload(page)).bytes);
  const settings = JSON.parse(strFromU8(archive["settings.json"]));
  expect(settings.roles.display.size).toBe(92);
  expect(settings.grid.columns).toBe(8);
  expect(settings.content.title).toBe(headline);
  expect(strFromU8(archive["DESIGN.md"])).toContain("fontSize: 92px");
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
  });
  const exported = await context.newPage();
  const errors: string[] = [];
  exported.on("pageerror", (error) => errors.push(error.message));
  exported.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    const key = decodeURIComponent(url.pathname.replace("/export-review/", ""));
    if (url.hostname !== "127.0.0.1" || !archive[key]) return route.abort();
    const contentType = key.endsWith(".html")
      ? "text/html"
      : key.endsWith(".css")
        ? "text/css"
        : "application/octet-stream";
    return route.fulfill({
      status: 200,
      contentType,
      body: Buffer.from(archive[key]),
    });
  });
  try {
    await exported.goto("http://127.0.0.1:4318/export-review/specimen.html");
    await exported.evaluate(() => document.fonts.ready);
    expect(
      await exported.evaluate(
        () =>
          Array.from(document.fonts).filter((font) => font.status === "loaded")
            .length,
      ),
    ).toBeGreaterThan(0);
    expect(await exported.locator(".specimen").innerHTML()).toBe(previewMarkup);
    expect(
      await exported.locator(".specimen h1").evaluate((el) => {
        const css = getComputedStyle(el);
        return {
          family: css.fontFamily,
          size: css.fontSize,
          weight: css.fontWeight,
          leading: css.lineHeight,
          spacing: css.letterSpacing,
          colour: css.color,
        };
      }),
    ).toEqual(previewStyle);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download settings only", exact: true })
    .click();
  const json = await pending;
  const jsonBytes = await readFile((await json.path())!);
  expect(JSON.parse(jsonBytes.toString())).toEqual(settings);
  await page.getByRole("button", { name: "Reset current study", exact: true }).click();
  await page
    .getByLabel("Import experiment file")
    .setInputFiles({
      name: json.suggestedFilename(),
      mimeType: "application/json",
      buffer: jsonBytes,
    });
  await expect(page.getByLabel("Experiment name")).toHaveValue(
    "Export parity study",
  );
  await expect(page.locator(".specimen h1")).toHaveText(headline);
  expect(await readStyle()).toEqual(previewStyle);
});

test("numeric fields accept ordinary typing and commit safely on Enter or blur", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Grid", exact: true }).click();
  const margin = page.getByRole("spinbutton", {
    name: "Page margin value",
    exact: true,
  });
  await margin.fill("");
  await margin.pressSequentially("24");
  await margin.press("Enter");
  await expect(margin).toHaveValue("24");
  expect(
    await page
      .locator(".specimen")
      .evaluate((el) => getComputedStyle(el).getPropertyValue("--margin")),
  ).toBe("24px");
  await margin.fill("999");
  await margin.press("Tab");
  await expect(margin).toHaveValue("120");
  await margin.fill("");
  await margin.press("Tab");
  await expect(margin).toHaveValue("120");
  await page.getByRole("button", { name: "Type", exact: true }).click();
  const leading = page.getByRole("spinbutton", {
    name: "Line height value",
    exact: true,
  });
  await leading.fill("");
  await leading.pressSequentially("1.75");
  await leading.press("Tab");
  await expect(leading).toHaveValue("1.75");
});

test("default workbench passes automated accessibility checks", async ({
  page,
}) => {
  await open(page);
  const desktop = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(desktop.violations).toEqual([]);
  await page.setViewportSize({ width: 320, height: 800 });
  await page
    .getByRole("button", { name: "Export system", exact: true })
    .click();
  await page.getByRole("button", { name: "Download system package", exact: true }).scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: "Download system package", exact: true }),
  ).toBeInViewport();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(321);
  const mobile = await new AxeBuilder({ page })
    .exclude(".specimen")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(mobile.violations).toEqual([]);
});

test("selected styles and axes reach subordinate type and export with correct button colours", async ({
  page,
  browser,
}) => {
  await open(page);
  await page.getByLabel("Font style", { exact: true }).selectOption("italic");
  await page.getByLabel("Softness value", { exact: true }).fill("75");
  await page.getByLabel("Softness value", { exact: true }).press("Tab");
  await page.getByRole("button", { name: "Interface", exact: true }).click();
  await expect(page.locator(".specimen h2").first()).toHaveCSS(
    "font-style",
    "italic",
  );
  expect(
    await page
      .locator(".specimen h2")
      .first()
      .evaluate((e) => getComputedStyle(e).fontVariationSettings),
  ).toContain('"SOFT" 75');
  await page.getByRole("button", { name: "Poster", exact: true }).click();
  await expect(page.locator(".poster-letter")).toHaveCSS(
    "font-style",
    "italic",
  );
  await page.locator(".role-row").nth(1).click();
  await page.getByLabel("Tracking value", { exact: true }).fill("0.08");
  await page.getByLabel("Tracking value", { exact: true }).press("Tab");
  await expect(page.locator(".poster-deck")).toHaveCSS(
    "letter-spacing",
    "2.304px",
  );
  await page.getByRole("button", { name: "Interface", exact: true }).click();
  await page.getByRole("button", { name: "Colour", exact: true }).click();
  await page.getByRole("button", { name: "Cobalt paper", exact: true }).click();
  await expect(page.locator(".sample-controls button")).toHaveCSS(
    "background-color",
    "rgb(24, 42, 80)",
  );
  await expect(page.locator(".sample-controls button")).toHaveCSS(
    "color",
    "rgb(233, 237, 243)",
  );
  await expect(page.locator(".sample-controls button")).toHaveCSS(
    "opacity",
    "1",
  );
  await expect(page.locator(".sample-controls button")).toHaveCSS("letter-spacing", "0.66px");
  const measured = await page
    .locator(".specimen h2, .sample-controls button")
    .evaluateAll((els) =>
      els.map((e) => {
        const s = getComputedStyle(e);
        return {
          style: s.fontStyle,
          axes: s.fontVariationSettings,
          background: s.backgroundColor,
          colour: s.color,
          opacity: s.opacity,
        };
      }),
    );
  await page
    .getByRole("button", { name: "Export system", exact: true })
    .click();
  const archive = unzipSync((await zipDownload(page)).bytes);
  const context = await browser.newContext();
  const specimen = await context.newPage();
  await context.route("**/*", (route) => {
    const key = new URL(route.request().url()).pathname.slice(1);
    if (!archive[key]) return route.abort();
    return route.fulfill({
      status: 200,
      contentType: key.endsWith(".html")
        ? "text/html"
        : key.endsWith(".css")
          ? "text/css"
          : "application/octet-stream",
      body: Buffer.from(archive[key]),
    });
  });
  try {
    await specimen.goto("http://127.0.0.1:4318/specimen.html");
    await specimen.evaluate(() => document.fonts.ready);
    expect(
      await specimen
        .locator(".specimen h2, .sample-controls button")
        .evaluateAll((els) =>
          els.map((e) => {
            const s = getComputedStyle(e);
            return {
              style: s.fontStyle,
              axes: s.fontVariationSettings,
              background: s.backgroundColor,
              colour: s.color,
              opacity: s.opacity,
            };
          }),
        ),
    ).toEqual(measured);
  } finally {
    await context.close();
  }
});
