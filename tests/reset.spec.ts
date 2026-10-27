import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const evidence = resolve("test-results/evidence/reset");
const fixture = resolve(
  "tests/fixtures/poster-swedish-a4-leading-b.json",
);
const reset = (page: Page) =>
  page.getByRole("button", { name: "Reset current study", exact: true });
const undo = (page: Page) =>
  page.getByRole("button", { name: "Undo reset", exact: true });
async function open(page: Page) {
  await page.goto("/");
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
}
async function importStudy(page: Page) {
  await page.getByLabel("Import experiment file").setInputFiles(fixture);
  await expect(
    page.getByText("Experiment imported.", { exact: true }),
  ).toBeVisible();
}
async function settingsDownload(page: Page, file?: string) {
  await page
    .getByRole("button", { name: "Export system", exact: true })
    .click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download settings only", exact: true })
    .click();
  const download = await pending;
  if (file) await download.saveAs(resolve(evidence, file));
  return JSON.parse((await readFile((await download.path())!)).toString());
}
async function stored(page: Page) {
  return page.evaluate(async () => {
    const sourceRoot = "/src/";
    const { loadWorkspace } = (await import(
      sourceRoot + "storage.ts"
    )) as typeof import("../src/storage");
    const data = await loadWorkspace();
    return {
      current: data.current,
      resetRecovery: data.resetRecovery,
      saved: data.saved,
      uploads: await Promise.all(
        data.uploads.map(async (font) => ({
          ...font,
          bytes: Array.from(
            new Uint8Array(await crypto.subtle.digest("SHA-256", font.bytes)),
          ),
        })),
      ),
    };
  });
}
async function holdNextSaveAcknowledgement(page: Page) {
  await page.evaluate(() => {
    const control = window as typeof window & {
      saveAcknowledgementHeld?: boolean;
      releaseSaveAcknowledgement?: () => void;
    };
    const add = IDBTransaction.prototype.addEventListener;
    let holdNext = true;
    IDBTransaction.prototype.addEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) {
      if (
        holdNext &&
        type === "complete" &&
        this.mode === "readwrite" &&
        this.objectStoreNames.contains("current") &&
        listener
      ) {
        holdNext = false;
        return add.call(
          this,
          type,
          (event) => {
            control.saveAcknowledgementHeld = true;
            control.releaseSaveAcknowledgement = () => {
              if (typeof listener === "function") listener.call(this, event);
              else listener.handleEvent(event);
            };
          },
          options,
        );
      }
      return add.call(this, type, listener, options);
    };
  });
}
async function expectHeldAcknowledgement(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean(
          (window as typeof window & { saveAcknowledgementHeld?: boolean })
            .saveAcknowledgementHeld,
        ),
      ),
    )
    .toBe(true);
}
async function holdNextNativeSave(page: Page, abortOnPagehide = false) {
  await page.evaluate(
    ({ abortOnPagehide }) => {
      const control = window as typeof window & {
        earlierTransactionPending?: boolean;
        releaseEarlierTransaction?: () => void;
      };
      const transaction = IDBDatabase.prototype.transaction;
      let holdNext = true;
      IDBDatabase.prototype.transaction = function (stores, mode, options) {
        const tx = transaction.call(this, stores, mode, options);
        if (
          holdNext &&
          mode === "readwrite" &&
          tx.objectStoreNames.contains("current")
        ) {
          holdNext = false;
          let keepAlive = true;
          control.earlierTransactionPending = true;
          control.releaseEarlierTransaction = () => {
            keepAlive = false;
          };
          tx.addEventListener("complete", () => {
            control.earlierTransactionPending = false;
          });
          tx.addEventListener("abort", () => {
            keepAlive = false;
            control.earlierTransactionPending = false;
          });
          if (abortOnPagehide)
            window.addEventListener("pagehide", () => tx.abort(), {
              once: true,
            });
          const pulse = () => {
            const request = tx.objectStore("current").get("active");
            request.addEventListener(
              "success",
              () => {
                if (keepAlive) pulse();
              },
              { once: true },
            );
          };
          pulse();
        }
        return tx;
      };
    },
    { abortOnPagehide },
  );
}
async function expectNativeSavePending(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean(
          (window as typeof window & { earlierTransactionPending?: boolean })
            .earlierTransactionPending,
        ),
      ),
    )
    .toBe(true);
}
async function completedReset(page: Page) {
  await expect(undo(page)).toBeEnabled();
  await expect(page.locator(".reset-recovery")).toContainText(
    "Current study reset. Saved snapshots are unchanged.",
  );
  await expect(page.getByLabel("Experiment name")).toHaveValue(
    "An exercise in attention",
  );
}
async function completedUndo(page: Page) {
  await expect(
    page.getByText("Previous study restored.", { exact: true }),
  ).toBeVisible();
  await expect(undo(page)).toHaveCount(0);
}

test("completed Reset and keyboard Undo survive immediate reload with exact full comparison settings", async ({
  page,
}, info) => {
  await mkdir(evidence, { recursive: true });
  await open(page);
  await importStudy(page);
  const before = await settingsDownload(
    page,
    `${info.project.name}-before-settings.json`,
  );
  await reset(page).focus();
  await page.keyboard.press("Enter");
  // The action's completed UI is the contract; do not wait for the save-status label.
  await completedReset(page);
  await page.reload();
  await expect(undo(page)).toBeVisible();
  await expect(page.getByLabel("Experiment name")).toHaveValue(
    "An exercise in attention",
  );
  await expect(page.getByLabel("Comparison intent")).toHaveCount(0);
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: resolve(evidence, `${info.project.name}-reset-desktop.png`),
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 800 });
  await undo(page).scrollIntoViewIfNeeded();
  await expect(undo(page)).toBeInViewport();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(321);
  await page.screenshot({
    path: resolve(evidence, `${info.project.name}-reset-mobile.png`),
    fullPage: true,
  });
  await page.screenshot({
    path: resolve(evidence, `${info.project.name}-reset-mobile-viewport.png`),
  });
  const axe = await new AxeBuilder({ page })
    .exclude(".specimen")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
  await undo(page).focus();
  await page.keyboard.press("Enter");
  await completedUndo(page);
  await page.reload();
  await expect(page.getByLabel("Experiment name")).toHaveValue(before.name);
  await expect(page.getByLabel("Comparison intent")).toHaveValue(
    before.comparison.intent,
  );
  await expect(page.locator(".frame-region")).toHaveCount(2);
  await expect(undo(page)).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1050 });
  const after = await settingsDownload(
    page,
    `${info.project.name}-restored-settings.json`,
  );
  expect(after).toEqual(before);
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: resolve(evidence, `${info.project.name}-restored-desktop.png`),
    fullPage: true,
  });
  await writeFile(
    resolve(evidence, `${info.project.name}-roundtrip.json`),
    JSON.stringify(
      {
        exactSettingsRestored: true,
        browser: info.project.name,
        comparison: after.comparison,
      },
      null,
      2,
    ),
  );
});

for (const action of [
  "edit",
  "medium",
  "recipe",
  "import",
  "snapshot",
  "comparison",
] as const) {
  test(`new ${action} expires Undo before an immediate reload`, async ({
    page,
  }) => {
    await open(page);
    await page.getByLabel("Experiment name").fill("Checkpoint before reset");
    await page
      .getByRole("button", { name: "Save snapshot", exact: true })
      .click();
    await expect(
      page.getByText("Snapshot saved. Find it in Experiments."),
    ).toBeVisible();
    await reset(page).click();
    await expect(undo(page)).toBeEnabled();
    if (action === "edit")
      await page.getByLabel("Experiment name").fill("Keep this newer edit");
    if (action === "medium")
      await page.getByRole("button", { name: "Social", exact: true }).click();
    if (action === "recipe") {
      await page.getByRole("button", { name: "Print", exact: true }).click();
      await page
        .getByRole("button", { name: "Apply Poster", exact: true })
        .click();
    }
    if (action === "import") await importStudy(page);
    if (action === "snapshot") {
      await page
        .getByRole("button", { name: "Experiments", exact: true })
        .click();
      await page
        .locator(".saved-item")
        .getByRole("button", { name: "Open", exact: true })
        .click();
    }
    if (action === "comparison")
      await page.getByRole("button", { name: "Compare", exact: true }).click();
    await expect(undo(page)).toHaveCount(0);
    const expected = await settingsDownload(page);
    await page.reload();
    await expect(page.getByLabel("Experiment name")).toHaveValue(expected.name);
    await expect(undo(page)).toHaveCount(0);
    expect(await settingsDownload(page)).toEqual(expected);
    expect((await stored(page)).resetRecovery).toBeNull();
  });
}

test("UI navigation and temporary guides preserve recovery; a second reset retains only its immediate predecessor", async ({
  page,
}) => {
  await open(page);
  await page.getByLabel("Experiment name").fill("First checkpoint");
  await page.getByRole("button", { name: "Grid", exact: true }).click();
  await page.getByLabel("Columns & modules").check();
  await page.getByLabel("Baseline guide").check();
  await page.getByLabel("Text-spacing stress test").check();
  await reset(page).click();
  await expect(undo(page)).toBeEnabled();
  await expect(page.getByLabel("Columns & modules")).not.toBeChecked();
  await expect(page.getByLabel("Baseline guide")).not.toBeChecked();
  await expect(page.getByLabel("Text-spacing stress test")).not.toBeChecked();
  for (const name of ["Content", "Colour", "Grid", "Type", "Experiments"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(undo(page)).toBeVisible();
  }
  await page.getByRole("button", { name: "Grid", exact: true }).click();
  await page.getByLabel("Baseline guide").check();
  await expect(undo(page)).toBeVisible();
  await page.reload();
  await expect(undo(page)).toBeVisible();
  expect((await stored(page)).resetRecovery?.name).toBe("First checkpoint");
  await Promise.all([
    page.waitForEvent("load"),
    page.getByRole("link", { name: "Counterform home" }).click(),
  ]);
  await expect(undo(page)).toBeEnabled();
  expect((await stored(page)).resetRecovery?.name).toBe("First checkpoint");
  await reset(page).click();
  await undo(page).click();
  await completedUndo(page);
  await page.reload();
  await expect(page.getByLabel("Experiment name")).toHaveValue(
    "An exercise in attention",
  );
  await expect(undo(page)).toHaveCount(0);
});

test("reset and Undo preserve named snapshots and every private font byte", async ({
  page,
}) => {
  await open(page);
  await page.getByLabel("Upload font file", { exact: true }).setInputFiles({
    name: "Reset-private-control.ttf",
    mimeType: "font/ttf",
    buffer: await readFile(
      resolve("public/fonts/dm-serif-display/normal-400.ttf"),
    ),
  });
  await expect(page.getByLabel("Font family", { exact: true })).toHaveValue(
    /^upload-/,
  );
  await page.getByLabel("Experiment name").fill("Private font snapshot");
  await page
    .getByRole("button", { name: "Save snapshot", exact: true })
    .click();
  await expect(
    page.getByText("Snapshot saved. Find it in Experiments."),
  ).toBeVisible();
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  const before = await stored(page);
  await reset(page).click();
  await page.reload();
  await expect(undo(page)).toBeEnabled();
  const resetState = await stored(page);
  expect(resetState.saved).toEqual(before.saved);
  expect(resetState.uploads).toEqual(before.uploads);
  await undo(page).click();
  await completedUndo(page);
  await page.reload();
  await expect(page.getByLabel("Experiment name")).toHaveValue(
    "Private font snapshot",
  );
  await expect(page.getByText("Fonts ready", { exact: true })).toBeVisible();
  const after = await stored(page);
  expect(after.current).toEqual(before.current);
  expect(after.saved).toEqual(before.saved);
  expect(after.uploads).toEqual(before.uploads);
});

test("checkpoint write failure aborts active reset and offers truthful in-session Undo", async ({
  page,
}) => {
  await open(page);
  await page.getByLabel("Experiment name").fill("Retain this saved study");
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  const before = (await stored(page)).current;
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === "current" && key === "resetRecovery")
        throw new DOMException(
          "Injected checkpoint quota failure",
          "QuotaExceededError",
        );
      return put.call(this, value, key);
    };
  });
  await reset(page).click();
  await expect(page.getByRole("alert")).toContainText(
    "Reset recovery could not be saved",
  );
  await expect(page.locator(".reset-recovery")).toContainText(
    "recovery after reload has not been saved",
  );
  expect((await stored(page)).current).toEqual(before);
  expect((await stored(page)).resetRecovery).toBeNull();
  await undo(page).click();
  await expect(
    page.getByText("Previous study restored.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Experiment name")).toHaveValue(
    "Retain this saved study",
  );
});

test("Undo write failure restores on screen without claiming reload persistence", async ({
  page,
}) => {
  await open(page);
  await page
    .getByLabel("Experiment name")
    .fill("Recover even when storage fails");
  await reset(page).click();
  await expect(undo(page)).toBeEnabled();
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === "current")
        throw new DOMException(
          "Injected current write failure",
          "QuotaExceededError",
        );
      return put.call(this, value, key);
    };
  });
  await undo(page).click();
  await expect(page.getByLabel("Experiment name")).toHaveValue(
    "Recover even when storage fails",
  );
  await expect(page.getByRole("alert")).toContainText(
    "restored study could not be saved",
  );
  await expect(
    page.getByText(
      "Previous study restored on screen. Export a copy before you leave.",
      { exact: true },
    ),
  ).toBeVisible();
  expect((await stored(page)).current?.name).toBe("An exercise in attention");
  expect((await stored(page)).resetRecovery?.name).toBe(
    "Recover even when storage fails",
  );
});

test("a real transaction abort after Reset requests succeed does not claim durable recovery", async ({
  page,
}, info) => {
  await open(page);
  await page.getByLabel("Experiment name").fill("Saved before a commit abort");
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  const before = (await stored(page)).current;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      const request = put.call(this, value, key);
      if (this.name === "current" && key === "resetRecovery") {
        request.addEventListener("success", () => this.transaction.abort(), {
          once: true,
        });
      }
      return request;
    };
  });
  await reset(page).click();
  await expect(page.getByRole("alert")).toContainText(
    "Reset recovery could not be saved",
  );
  await expect(page.locator(".reset-recovery")).toContainText(
    "recovery after reload has not been saved",
  );
  const failed = await stored(page);
  expect(failed.current).toEqual(before);
  expect(failed.resetRecovery).toBeNull();
  await page.screenshot({
    path: resolve(evidence, `${info.project.name}-reset-commit-failure.png`),
    fullPage: true,
  });
  await writeFile(
    resolve(evidence, `${info.project.name}-reset-commit-failure.json`),
    JSON.stringify(
      { committedOriginalUnchanged: true, recoveryStored: false, errors },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
  await undo(page).click();
  await expect(
    page.getByText("Previous study restored.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Experiment name")).toHaveValue(
    "Saved before a commit abort",
  );
});

test("another tab's newer study stops stale durable Undo without overwriting it", async ({
  page,
  context,
}) => {
  await open(page);
  await page.getByLabel("Experiment name").fill("Original tab checkpoint");
  await reset(page).click();
  await expect(undo(page)).toBeEnabled();
  const other = await context.newPage();
  await open(other);
  await other.getByLabel("Experiment name").fill("Newer work in another tab");
  await expect(
    other.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await undo(page).click();
  await expect(page.getByRole("alert")).toContainText(
    "another tab changed the saved study",
  );
  await expect(page.getByRole("alert")).toContainText("not being saved");
  await expect(undo(page)).toHaveCount(0);
  expect((await stored(page)).current?.name).toBe("Newer work in another tab");
  await page.reload();
  await expect(page.getByLabel("Experiment name")).toHaveValue(
    "Newer work in another tab",
  );
});

test("a rapid newer edit while reset is saving cannot resurrect Undo after reload", async ({
  page,
}) => {
  await open(page);
  await page.getByLabel("Experiment name").fill("Immediately preceding edit");
  await reset(page).click();
  await page.getByLabel("Experiment name").fill("Newest work wins");
  await page.reload();
  await expect(page.getByLabel("Experiment name")).toHaveValue(
    "Newest work wins",
  );
  await expect(undo(page)).toHaveCount(0);
  expect((await stored(page)).resetRecovery).toBeNull();
});

test("a delayed earlier save acknowledgement does not hold the latest reset and edit behind a JS queue", async ({
  page,
}) => {
  await open(page);
  await holdNextSaveAcknowledgement(page);
  await page
    .getByLabel("Experiment name")
    .fill("Earlier save with a held acknowledgement");
  await expectHeldAcknowledgement(page);
  // The earlier transaction really committed; only its acknowledgement is held.
  expect((await stored(page)).current?.name).toBe(
    "Earlier save with a held acknowledgement",
  );
  await reset(page).click();
  await expect(undo(page)).toBeEnabled();
  await page
    .getByLabel("Experiment name")
    .fill("Latest write is dispatched before reload");
  await page.reload();
  await expect(page.getByLabel("Experiment name")).toHaveValue(
    "Latest write is dispatched before reload",
  );
  await expect(undo(page)).toHaveCount(0);
  expect((await stored(page)).resetRecovery).toBeNull();
});

test("an edit during a held reset acknowledgement expires recovery before the older result returns", async ({
  page,
}) => {
  await open(page);
  await page.getByLabel("Experiment name").fill("Before the held reset");
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await holdNextSaveAcknowledgement(page);
  await reset(page).click();
  await expectHeldAcknowledgement(page);
  await expect(undo(page)).toHaveCount(0);
  await expect(page.getByLabel("Experiment name")).toHaveValue(
    "Before the held reset",
  );
  await page.getByLabel("Experiment name").fill("Edit made during reset");
  await expect(undo(page)).toHaveCount(0);
  await page.evaluate(() =>
    (
      window as typeof window & { releaseSaveAcknowledgement?: () => void }
    ).releaseSaveAcknowledgement?.(),
  );
  await expect(reset(page)).toBeEnabled();
  await expect(undo(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Experiment name")).toHaveValue(
    "Edit made during reset",
  );
  await expect(undo(page)).toHaveCount(0);
});

test("a newer edit during a held Undo acknowledgement survives immediate reload without an old success notice", async ({
  page,
}) => {
  await open(page);
  await page.getByLabel("Experiment name").fill("Before Undo was held");
  await reset(page).click();
  await expect(undo(page)).toBeEnabled();
  await holdNextSaveAcknowledgement(page);
  await undo(page).click();
  await expectHeldAcknowledgement(page);
  await expect(undo(page)).toBeDisabled();
  await expect(page.getByLabel("Experiment name")).toHaveValue(
    "An exercise in attention",
  );
  await page.getByLabel("Experiment name").fill("Edit made during Undo");
  await page.evaluate(() =>
    (
      window as typeof window & { releaseSaveAcknowledgement?: () => void }
    ).releaseSaveAcknowledgement?.(),
  );
  await expect(reset(page)).toBeEnabled();
  await expect(
    page.getByText("Previous study restored.", { exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Experiment name")).toHaveValue(
    "Edit made during Undo",
  );
  await expect(undo(page)).toHaveCount(0);
});

test("an invalid stored recovery checkpoint is rejected without modifying existing saved work", async ({
  page,
}) => {
  await open(page);
  await page
    .getByLabel("Experiment name")
    .fill("Do not overwrite the existing study");
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    const dependencyRoot = "/node_modules/.vite/deps/";
    const { openDB } = (await import(
      dependencyRoot + "idb.js"
    )) as typeof import("idb");
    const db = await openDB("counterform", 1);
    await db.put("current", { invalid: "checkpoint" }, "resetRecovery");
    db.close();
  });
  await page.reload();
  await expect(page.getByRole("alert")).toContainText(
    "Existing storage has not been changed",
  );
  await expect(undo(page)).toHaveCount(0);
  const unchanged = await page.evaluate(async () => {
    const dependencyRoot = "/node_modules/.vite/deps/";
    const { openDB } = (await import(
      dependencyRoot + "idb.js"
    )) as typeof import("idb");
    const db = await openDB("counterform", 1);
    const current = await db.get("current", "active");
    const checkpoint = await db.get("current", "resetRecovery");
    db.close();
    return { current, checkpoint };
  });
  expect(unchanged.current.name).toBe("Do not overwrite the existing study");
  expect(unchanged.checkpoint).toEqual({ invalid: "checkpoint" });
});

test("a native pending earlier transaction keeps Reset and the newer edit in creation order", async ({
  page,
}) => {
  await open(page);
  await holdNextNativeSave(page);
  await page
    .getByLabel("Experiment name")
    .fill("Native earlier transaction still pending");
  await expectNativeSavePending(page);
  await reset(page).click();
  await expect(undo(page)).toHaveCount(0);
  await expect(page.getByLabel("Experiment name")).toHaveValue(
    "Native earlier transaction still pending",
  );
  await page
    .getByLabel("Experiment name")
    .fill("Latest edit queued after Reset");
  await expect(undo(page)).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      Boolean(
        (window as typeof window & { earlierTransactionPending?: boolean })
          .earlierTransactionPending,
      ),
    ),
  ).toBe(true);
  await page.evaluate(() =>
    (
      window as typeof window & { releaseEarlierTransaction?: () => void }
    ).releaseEarlierTransaction?.(),
  );
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Experiment name")).toHaveValue(
    "Latest edit queued after Reset",
  );
  await expect(undo(page)).toHaveCount(0);
  expect((await stored(page)).resetRecovery).toBeNull();
});

test("an unchanged number-field blur is navigation and preserves Reset recovery", async ({
  page,
}) => {
  await open(page);
  await page
    .getByLabel("Experiment name")
    .fill("Restore after unchanged-field navigation");
  await reset(page).click();
  await expect(undo(page)).toBeEnabled();
  await page.getByLabel("Size value", { exact: true }).focus();
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await expect(undo(page)).toBeEnabled();
  await page.reload();
  await expect(undo(page)).toBeEnabled();
  await undo(page).click();
  await completedUndo(page);
  await page.reload();
  await expect(page.getByLabel("Experiment name")).toHaveValue(
    "Restore after unchanged-field navigation",
  );
  await expect(undo(page)).toHaveCount(0);
});

test("interrupting a pending Reset leaves the full prior study visible and persisted", async ({
  page,
}, info) => {
  await open(page);
  await importStudy(page);
  const before = await settingsDownload(page);
  await holdNextNativeSave(page, true);
  await reset(page).click();
  await expectNativeSavePending(page);
  await expect(reset(page)).toBeDisabled();
  await expect(undo(page)).toHaveCount(0);
  await expect(page.getByLabel("Experiment name")).toHaveValue(before.name);
  await expect(page.getByLabel("Comparison intent")).toHaveValue(
    before.comparison.intent,
  );
  await expect(page.locator(".frame-region")).toHaveCount(2);
  await page.screenshot({
    path: resolve(
      evidence,
      `${info.project.name}-reset-pending-before-reload.png`,
    ),
    fullPage: true,
  });
  // Force an actual native transaction interruption at navigation, not a timing retry.
  await page.reload();
  await expect(page.getByLabel("Experiment name")).toHaveValue(before.name);
  await expect(undo(page)).toHaveCount(0);
  expect(await settingsDownload(page)).toEqual(before);
  expect((await stored(page)).resetRecovery).toBeNull();
  await page.screenshot({
    path: resolve(
      evidence,
      `${info.project.name}-reset-interrupted-after-reload.png`,
    ),
    fullPage: true,
  });
});

test("interrupting a pending Undo keeps the Reset study and its durable recovery action", async ({
  page,
}, info) => {
  await open(page);
  await importStudy(page);
  const before = await settingsDownload(page);
  await reset(page).click();
  await completedReset(page);
  const resetState = await stored(page);
  await holdNextNativeSave(page, true);
  await undo(page).click();
  await expectNativeSavePending(page);
  await expect(undo(page)).toBeDisabled();
  await expect(page.getByLabel("Experiment name")).toHaveValue(
    "An exercise in attention",
  );
  await expect(page.getByLabel("Comparison intent")).toHaveCount(0);
  await page.screenshot({
    path: resolve(
      evidence,
      `${info.project.name}-undo-pending-before-reload.png`,
    ),
    fullPage: true,
  });
  await page.reload();
  await completedReset(page);
  const after = await stored(page);
  expect(after.current).toEqual(resetState.current);
  expect(after.resetRecovery).toEqual(resetState.resetRecovery);
  await undo(page).click();
  await completedUndo(page);
  await page.reload();
  await expect(page.getByLabel("Experiment name")).toHaveValue(before.name);
  expect(await settingsDownload(page)).toEqual(before);
});
