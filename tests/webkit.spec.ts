import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByText("Fonts ready", { exact: true })).toBeVisible();
  await expect(page.getByText("Saved on this device", { exact: true })).toBeVisible();
}

test("WebKit tabs to mode buttons, keeps edits, and exports a social PNG", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Web", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Print", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Print", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Web", exact: true }).click();
  await page.getByLabel("Experiment name").fill("WebKit study");
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await page.getByLabel("Headline", { exact: true }).fill("Västerås i WebKit");
  await expect(page.getByText("Saved on this device", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save snapshot", exact: true }).click();
  await expect(page.getByText("Snapshot saved. Find it in Experiments.")).toBeVisible();
  await page.getByRole("link", { name: "Counterform home" }).click();
  await expect(page.getByText("Saved on this device", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Experiment name")).toHaveValue("WebKit study");
  await expect(page.locator(".specimen h1")).toHaveText("Västerås i WebKit");

  await page.getByRole("button", { name: "Social", exact: true }).click();
  await page.getByLabel("Social format").selectOption("square");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export system", exact: true }).click();
  await page.getByRole("button", { name: /Download 1080 × 1080px PNG/ }).click();
  const png = await readFile((await (await pending).path())!);
  expect(png.readUInt32BE(16)).toBe(1080);
  expect(png.readUInt32BE(20)).toBe(1080);
  expect(png.length).toBeGreaterThan(20_000);

  await page.getByRole("button", { name: "Reset current study", exact: true }).click();
  await expect(
    page.getByText("Current study reset. Saved snapshots are unchanged."),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Experiment name")).toHaveValue(
    "An exercise in attention",
  );
  await page.getByRole("button", { name: /^Experiments/ }).click();
  await expect(page.getByRole("heading", { name: "WebKit study" })).toBeVisible();

  await page.getByRole("button", { name: "Undo reset", exact: true }).click();
  await expect(page.getByText("Previous study restored.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Experiment name")).toHaveValue("WebKit study");
  await expect(page.getByRole("button", { name: "Social", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Undo reset", exact: true })).toHaveCount(0);

  await page.setViewportSize({ width: 320, height: 700 });
  await expect(page.locator(".save-status--study")).toBeVisible();
  await expect(page.locator(".save-status__short")).toHaveText("Saved");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    321,
  );
});
