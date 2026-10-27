// Isolated, actual browser-zoom check. Never installs an extension in the user's browser.
import { chromium } from "playwright";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
await mkdir("test-results/evidence", { recursive: true });
const extension = await mkdtemp(join(tmpdir(), "counterform-zoom-extension-"));
const profile = await mkdtemp(join(tmpdir(), "counterform-zoom-profile-"));
await writeFile(
  join(extension, "manifest.json"),
  JSON.stringify({
    manifest_version: 3,
    name: "Counterform isolated zoom test",
    version: "1.0",
    permissions: ["tabs"],
    background: { service_worker: "worker.js" },
  }),
);
await writeFile(
  join(extension, "worker.js"),
  "chrome.runtime.onInstalled.addListener(()=>{});",
);
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: true,
  viewport: { width: 1280, height: 960 },
  args: [
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
  ],
});
try {
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker", { timeout: 15000 }));
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4318/");
  await page.getByText("Fonts ready", { exact: true }).waitFor();
  const readings = [];
  for (const factor of [1, 2, 4]) {
    const actual = await worker.evaluate(async (factor) => {
      const [tab] = await chrome.tabs.query({ url: "http://127.0.0.1:4318/*" });
      await chrome.tabs.setZoom(tab.id, factor);
      return chrome.tabs.getZoom(tab.id);
    }, factor);
    await page.waitForFunction(
      (f) => Math.abs(devicePixelRatio - f) < 0.1,
      factor,
    );
    await page
      .getByRole("button", { name: "Export system", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Download system package", exact: true })
      .waitFor();
    const result = await page.evaluate(() => ({
      width: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      pixelRatio: devicePixelRatio,
      exportVisible: !!document.querySelector(".export-summary"),
    }));
    if (result.documentWidth > result.width + 1)
      throw new Error(
        `Horizontal overflow at ${factor}x: ${JSON.stringify(result)}`,
      );
    readings.push({ requested: factor, actual, ...result });
    await page.screenshot({
      path: `test-results/evidence/zoom-${factor}x.png`,
      fullPage: true,
    });
  }
  await writeFile(
    "test-results/evidence/zoom.json",
    JSON.stringify(
      {
        method:
          "Actual Chromium tabs.setZoom in isolated extension/profile; not CSS zoom or a root-font-size probe",
        browser: context.browser()?.version(),
        readings,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(readings));
} finally {
  await context.close();
  await rm(extension, { recursive: true, force: true });
  await rm(profile, { recursive: true, force: true });
}
