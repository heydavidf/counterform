import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { strFromU8, unzipSync } from "fflate";

const posterFixture = resolve("tests/fixtures/poster-swedish-a4.json");

async function downloadArtwork(page: import("@playwright/test").Page, label: string) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: label, exact: true }).click();
  return readFile((await (await pending).path())!);
}

async function standaloneSvg(browser: import("@playwright/test").Browser, svg: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await context.route("**/export-regression.svg", (route) => route.fulfill({
    contentType: "image/svg+xml", body: svg,
  }));
  await page.goto("http://127.0.0.1:4318/export-regression.svg");
  await page.evaluate(() => document.fonts.ready);
  return { context, page };
}

test("Swedish Poster SVG and IDML keep the visible letter ground above the decorative panel", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Fonts ready", { exact: true })).toBeVisible();
  await page.getByLabel("Import experiment file").setInputFiles(posterFixture);
  const expected = await page.locator(".layout-letter").evaluate((element) => {
    const root = element.closest<HTMLElement>(".specimen")!;
    const scale = root.getBoundingClientRect().width / root.clientWidth;
    const box = element.getBoundingClientRect(), origin = root.getBoundingClientRect();
    return { color: getComputedStyle(element).backgroundColor, x: (box.left - origin.left) / scale + 8, y: (box.top - origin.top) / scale + 8 };
  });
  await page.getByRole("button", { name: "Export system", exact: true }).click();
  const svg = (await downloadArtwork(page, "Download editable SVG for Illustrator")).toString();
  const pixel = await page.evaluate(async ({ svg, x, y }) => {
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    const viewBox = doc.documentElement.getAttribute("viewBox")!.split(" ").map(Number);
    const image = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    try {
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewBox[2]); canvas.height = Math.ceil(viewBox[3]);
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const [r, g, b] = context.getImageData(Math.round(x), Math.round(y), 1, 1).data;
      return `rgb(${r}, ${g}, ${b})`;
    } finally { URL.revokeObjectURL(url); }
  }, { svg, x: expected.x, y: expected.y });
  expect(pixel, "Actual SVG pixels must match the visible preview ground").toBe(expected.color);
  const idml = unzipSync(new Uint8Array(await downloadArtwork(page, "Download IDML for InDesign")));
  const fills = await page.evaluate((spread) => [...new DOMParser().parseFromString(spread, "application/xml").querySelectorAll("Rectangle")].map((node) => node.getAttribute("FillColor")), strFromU8(idml["Spreads/Spread_ucf.xml"]));
  expect(fills).toContain("Color/Counterform-panel");
  expect(fills).toContain("Color/Counterform-accent");
  expect(fills.indexOf("Color/Counterform-panel")).toBeLessThan(fills.indexOf("Color/Counterform-accent"));
});

test("standalone downloaded SVG uses its embedded Source families rather than a fallback", async ({ page, browser }) => {
  await page.goto("/");
  await expect(page.getByText("Fonts ready", { exact: true })).toBeVisible();
  await page.getByLabel("Import experiment file").setInputFiles(posterFixture);
  await page.getByRole("button", { name: "Export system", exact: true }).click();
  const svg = (await downloadArtwork(page, "Download editable SVG for Illustrator")).toString();
  const standalone = await standaloneSvg(browser, svg);
  try {
    const result = await standalone.page.evaluate(() => ({
      families: [...document.querySelectorAll("text")].map((node) => getComputedStyle(node).fontFamily),
      loadedFaces: [...document.fonts].filter((face) => face.status === "loaded").map((face) => face.family),
    }));
    for (const family of ["Source Serif 4", "Source Sans 3"])
      expect(result.families).toContain(`"${family}"`);
    for (const family of ["Fraunces", "Source Serif 4", "Source Sans 3"])
      expect(result.loadedFaces.map((name) => name.replace(/^"|"$/g, ""))).toContain(family);
  } finally { await standalone.context.close(); }
});

test("SVG private family punctuation remains valid CSS and loads the permitted embedded face", async ({ page, browser }) => {
  await page.goto("/");
  await expect(page.getByText("Fonts ready", { exact: true })).toBeVisible();
  const family = 'Private "<&\\ Family 3, Semi;\'';
  const svg = await page.evaluate(async (name) => {
    const sourceRoot = "/src";
    const { defaultSettings } = await import(`${sourceRoot}/model.ts`);
    const { exportSvg } = await import(`${sourceRoot}/export-artwork.ts`);
    const settings = defaultSettings();
    settings.roles.display.fontId = "upload-punctuation";
    const upload = { id: "upload-punctuation", name, fileName: "test.ttf", hash: "test", bytes: await (await fetch("/fonts/manrope/normal.ttf")).arrayBuffer(), weight: "200 800", style: "normal" as const };
    return (await exportSvg(settings, [upload], true, true)).text();
  }, family);
  const standalone = await standaloneSvg(browser, svg);
  try {
    const result = await standalone.page.evaluate((name) => {
      const node = document.querySelector("text[font-size='78']")!;
      const expected = document.createElementNS("http://www.w3.org/2000/svg", "text");
      expected.style.fontFamily = `"${name.replace(/[\\"]/g, "\\$&")}"`;
      return { valid: CSS.supports("font-family", node.getAttribute("font-family")!), expected: expected.style.fontFamily, computed: getComputedStyle(node).fontFamily, loaded: [...document.fonts].filter((face) => face.status === "loaded").map((face) => face.family) };
    }, family);
    expect(result.valid).toBe(true);
    expect(result.computed).toBe(result.expected);
    expect(result.loaded).toContain(family);
  } finally { await standalone.context.close(); }
});

test("Print facing export downloads live-text SVG and editable two-page IDML", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Fonts ready", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await page.getByLabel("Print pages").selectOption("facing");
  await page.getByRole("button", { name: "Apply Editorial facing" }).click();
  await page.getByRole("button", { name: "Export system", exact: true }).click();
  const contents = page.getByLabel("Download contents");
  await expect(contents).toContainText("420 × 297mm");
  await expect(contents).toContainText("one facing spread");
  await expect(contents).toContainText("font files");

  const svgPending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download editable SVG for Illustrator" }).click();
  const svg = (await readFile((await (await svgPending).path())!)).toString();
  expect(svg).toContain('width="420mm" height="297mm"');
  expect(svg).toContain("<text ");
  expect(svg).toContain("The shape");
  expect(svg).not.toContain("<path ");
  expect(svg).toContain("SIL OPEN FONT LICENSE");

  const idmlPending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download IDML for InDesign" }).click();
  const zip = unzipSync(new Uint8Array(await readFile((await (await idmlPending).path())!)));
  expect(strFromU8(zip.mimetype)).toBe("application/vnd.adobe.indesign-idml-package");
  const spread = strFromU8(zip["Spreads/Spread_ucf.xml"]);
  expect(spread).toContain('PageCount="2"');
  expect(spread.match(/<Page Self=/g)).toHaveLength(2);
  expect(spread).toContain("<TextFrame ");
  expect(spread).toContain("<Rectangle ");
  expect(strFromU8(zip["Resources/Styles.xml"])).toContain("Counterform display");
  expect(strFromU8(zip["Resources/Graphic.xml"])).toContain("Counterform accent");
  expect(Object.keys(zip).filter((key) => key.startsWith("Stories/Story_cfstory"))).not.toHaveLength(0);
  expect(Object.entries(zip).filter(([key]) => key.startsWith("Stories/")).some(([, bytes]) => strFromU8(bytes).includes("The shape"))).toBe(true);
});

test("Web contents disclose measured SVG size and Print requirement", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Fonts ready", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Export system", exact: true }).click();
  const contents = page.getByLabel("Download contents");
  await expect(contents).toContainText(/px wide × \d+px current content height/);
  await expect(contents).toContainText("Choose Print for a physical page PDF or IDML document.");
  await expect(page.getByRole("button", { name: "Download IDML for InDesign" })).toHaveCount(0);
});

test("Print single page IDML contains one page and private SVG data needs per-download permission", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Fonts ready", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await page.getByRole("button", { name: "Export system", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download IDML for InDesign" }).click();
  const zip = unzipSync(new Uint8Array(await readFile((await (await pending).path())!)));
  const spread = strFromU8(zip["Spreads/Spread_ucf.xml"]);
  expect(spread).toContain('PageCount="1"');
  expect(spread.match(/<Page Self=/g)).toHaveLength(1);
  const result = await page.evaluate(async () => {
    const sourceRoot = "/src";
    const { defaultSettings } = await import(`${sourceRoot}/model.ts`);
    const { exportSvg } = await import(`${sourceRoot}/export-artwork.ts`);
    const settings = defaultSettings();
    settings.roles.display.fontId = "upload-test";
    const upload = {
      id: "upload-test", name: 'Private <&" Test', fileName: "private.ttf",
      hash: "test", bytes: await (await fetch("/fonts/manrope/normal.ttf")).arrayBuffer(),
      weight: "200 800", style: "normal" as const,
    };
    let blocked = false;
    try { await exportSvg(settings, [upload], true, false); }
    catch (error) { blocked = String(error).includes("Confirm that your licence"); }
    const excluded = await (await exportSvg(settings, [upload], false)).text();
    const included = await (await exportSvg(settings, [upload], true, true)).text();
    const bytesPrefix = btoa(String.fromCharCode(...new Uint8Array(upload.bytes).slice(0, 24)));
    const xml = new DOMParser().parseFromString(included, "image/svg+xml");
    const family = document.createElement("span").style;
    family.fontFamily = xml.querySelector('text[font-family*="Private"]')!.getAttribute("font-family")!;
    const expectedFamily = document.createElement("span").style;
    expectedFamily.fontFamily = `"${upload.name.replace(/[\\"]/g, "\\$&")}"`;
    return {
      blocked,
      excluded: !excluded.includes(bytesPrefix),
      includedName: family.fontFamily === expectedFamily.fontFamily,
      includedFont: included.includes(bytesPrefix),
      xmlValid: !xml.querySelector("parsererror"),
    };
  });
  expect(result).toMatchObject({ blocked: true, excluded: true, includedName: true, includedFont: true, xmlValid: true });
});

test("private font inclusion and PDF permission apply to one download", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Fonts ready", { exact: true })).toBeVisible();
  await page.getByLabel("Upload font file", { exact: true }).setInputFiles({
    name: "Local-license-test.ttf", mimeType: "font/ttf",
    buffer: await readFile(resolve("public/fonts/dm-serif-display/normal-400.ttf")),
  });
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await page.getByRole("button", { name: "Export system", exact: true }).click();
  const inclusion = page.getByLabel("Include selected private font files in this ZIP, SVG or PDF");
  const rights = page.getByLabel(/I confirm my licence permits/);
  await expect(inclusion).not.toBeChecked();
  await page.getByRole("button", { name: "Illustrator PDF / Save as PDF" }).click();
  await expect(page.getByText(/Select private font inclusion for this PDF/)).toBeVisible();
  await inclusion.check();
  await page.getByRole("button", { name: "Illustrator PDF / Save as PDF" }).click();
  await expect(page.getByText(/Confirm that your licence allows/)).toBeVisible();
  await rights.check();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download system package" }).click();
  const zip = unzipSync(new Uint8Array(await readFile((await (await pending).path())!)));
  expect(Object.keys(zip).some((name) => name.startsWith("fonts/private/"))).toBe(true);
  await expect(inclusion).not.toBeChecked();
  await expect(rights).not.toBeChecked();
  await page.getByRole("button", { name: "Illustrator PDF / Save as PDF" }).click();
  await expect(page.getByText(/Select private font inclusion for this PDF/)).toBeVisible();
});
