import { expect, test, type Page } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";

async function open(page: Page) {
  page.setDefaultTimeout(10_000);
  await page.goto("/");
  await expect(page.getByText("Fonts ready", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
}

test("modes are immediate and fixed print spread keeps one continuous wide grid", async ({
  page,
}) => {
  await open(page);
  await expect(
    page.getByRole("group", { name: "Output medium" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await expect(page.getByTestId("fixed-format-controls")).toBeVisible();
  await page.getByLabel("Print page size").selectOption("a5");
  await page.getByLabel("Print orientation").selectOption("landscape");
  await page.getByLabel("Print pages").selectOption("facing");
  await page.getByRole("button", { name: "Apply Editorial facing" }).click();
  await expect(page.locator(".surface-fold")).toBeVisible();
  await expect(page.locator(".layout-grid")).toHaveCSS(
    "grid-template-columns",
    /px/,
  );

  const spread = await page
    .locator(".frame-region")
    .first()
    .evaluate((region) => {
      const sheet = region.querySelector<HTMLElement>(".sheet")!;
      const title = region.querySelector<HTMLElement>(".layout-title")!;
      const sheetBox = sheet.getBoundingClientRect();
      const titleBox = title.getBoundingClientRect();
      const scale = sheetBox.width / sheet.offsetWidth;
      const seam = sheetBox.left + sheetBox.width / 2;
      return {
        width: sheet.offsetWidth,
        expectedWidth: (210 * 2 * 96) / 25.4,
        crossesFold: titleBox.left < seam && titleBox.right > seam,
        scale,
      };
    });
  expect(Math.abs(spread.width - spread.expectedWidth)).toBeLessThan(1);
  expect(spread.crossesFold).toBe(true);
  expect(spread.scale).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Edit layout", exact: true }).click();
  await expect(page.getByText(/Wide placement · A5 landscape/)).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Responsive layout" }),
  ).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Format flow" })).toHaveCount(0);
});

test("fixed social geometry survives viewport changes and exports exact PNG", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Social", exact: true }).click();
  await page.getByLabel("Social format").selectOption("story");
  await page.getByRole("button", { name: "Apply Statement" }).click();
  const before = await page
    .locator(".sheet")
    .first()
    .evaluate((el) => ({
      width: (el as HTMLElement).offsetWidth,
      specimenWidth: (el.querySelector(".specimen") as HTMLElement).offsetWidth,
      height: (el.querySelector(".specimen") as HTMLElement).offsetHeight,
    }));
  await page.setViewportSize({ width: 390, height: 844 });
  const after = await page
    .locator(".sheet")
    .first()
    .evaluate((el) => ({
      width: (el as HTMLElement).offsetWidth,
      specimenWidth: (el.querySelector(".specimen") as HTMLElement).offsetWidth,
      height: (el.querySelector(".specimen") as HTMLElement).offsetHeight,
    }));
  expect(before).toEqual({ width: 1080, specimenWidth: 1080, height: 1920 });
  expect(after).toEqual(before);

  await page
    .getByRole("button", { name: "Export system", exact: true })
    .click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: /Download 1080 × 1920px PNG/ })
    .click();
  const download = await pending;
  await mkdir("test-results/evidence/modes", { recursive: true });
  await download.saveAs("test-results/evidence/modes/social-story-export.png");
  const png = await readFile((await download.path())!);
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  expect(png.readUInt32BE(16)).toBe(1080);
  expect(png.readUInt32BE(20)).toBe(1920);
});

test("comparison reference, intent and real differences persist and B is exported", async ({
  page,
}) => {
  await open(page);
  const original = await page.locator(".specimen h1").first().textContent();
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await expect(
    page.getByText("No differences yet. Change B to see the adjustment here."),
  ).toBeVisible();
  await page
    .getByLabel("Comparison intent")
    .fill("Test a shorter, more direct headline");
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await page
    .getByLabel("Headline", { exact: true })
    .fill("A clearer interruption.");
  await expect(page.locator(".difference-row")).toContainText([
    "content · title",
  ]);
  await expect(page.locator(".frame-region").first().locator("h1")).toHaveText(
    "A clearer interruption.",
  );
  await expect(page.locator(".frame-region").nth(1).locator("h1")).toHaveText(
    original ?? "",
  );
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Comparison intent")).toHaveValue(
    "Test a shorter, more direct headline",
  );
  await expect(page.locator(".frame-label")).toContainText([
    "B / Current adjustment",
    "A / Pinned reference",
  ]);

  await page
    .getByRole("button", { name: "Export system", exact: true })
    .click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export current adjustment package" })
    .click();
  const download = await pending;
  const zip = unzipSync(
    new Uint8Array(await readFile((await download.path())!)),
  );
  const saved = JSON.parse(strFromU8(zip["settings.json"]));
  expect(saved.content.title).toBe("A clearer interruption.");
  expect(saved.comparison.intent).toBe("Test a shorter, more direct headline");
  expect(strFromU8(zip["specimen.html"])).toContain("A clearer interruption.");
  expect(strFromU8(zip["specimen.html"])).not.toContain(
    original ?? "The shape",
  );
  await page.getByRole("button", { name: "End comparison" }).click();
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Comparison intent")).toHaveCount(0);
  await expect(page.locator(".frame-region")).toHaveCount(1);
});

test("browser print opens the current fixed specimen with physical page CSS", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await page.getByRole("button", { name: "Apply Editorial single" }).click();
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await page
    .getByLabel("Headline", { exact: true })
    .fill("A deliberately long print experiment ".repeat(18));
  await expect(
    page.locator('.frame-region[data-frame="current"] .font-warning'),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Export system", exact: true })
    .click();
  await page.getByRole("button", { name: "Illustrator PDF / Save as PDF" }).click();
  await expect(page.getByText("Print preview needs attention")).toBeVisible();
  const popupEvent = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Print anyway" }).click();
  const popup = await popupEvent;
  await expect(popup.locator(".specimen")).toBeVisible();
  expect(await popup.locator("style").allTextContents()).toContainEqual(
    expect.stringContaining("@page{size:210mm 297mm;margin:0}"),
  );
  await expect(
    page.getByText(/Use 100% scale, no headers or footers/),
  ).toBeVisible();
});

test("desktop, mobile, spread and social evidence", async ({ page }) => {
  await mkdir("test-results/evidence/modes", { recursive: true });
  await open(page);
  await page.screenshot({
    path: "test-results/evidence/modes/desktop-web.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await page.getByLabel("Print pages").selectOption("facing");
  await page.getByRole("button", { name: "Apply Editorial facing" }).click();
  await page
    .locator(".canvas-area")
    .screenshot({ path: "test-results/evidence/modes/desktop-spread.png" });
  await page.getByRole("button", { name: "Social", exact: true }).click();
  await page.getByLabel("Social format").selectOption("square");
  await page.getByRole("button", { name: "Apply Editorial card" }).click();
  await page
    .locator(".canvas-area")
    .screenshot({ path: "test-results/evidence/modes/desktop-social.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/evidence/modes/mobile-social.png",
    fullPage: true,
  });
});
