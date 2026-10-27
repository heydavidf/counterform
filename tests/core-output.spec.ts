import { expect, test, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";

type RasterMetrics = {
  width: number;
  height: number;
  nonBackgroundSamples: number;
  accentSamples: number;
  byteLength: number;
};

async function exportSocialPng(
  page: Page,
  format: "square" | "story" | "landscape",
  privateDisplay: boolean,
  template = "social-statement",
  savePath?: string,
) {
  const pending = page.waitForEvent("download");
  const metricsPromise = page.evaluate(
    async ({ format, privateDisplay, template }) => {
      const sourceRoot = "/src";
      const { defaultSettings } = await import(`${sourceRoot}/model.ts`);
      const { setSurface, applySurfaceTemplate } = await import(
        `${sourceRoot}/surface.ts`
      );
      const { exportPng } = await import(`${sourceRoot}/output.ts`);
      let settings = setSurface(defaultSettings(), { mode: "social", format });
      settings = applySurfaceTemplate(settings, template);
      settings.content.quote = "ÅÄÖ — ‘Form & counterform’ gör rytmen synlig.";
      const uploads = [];
      if (privateDisplay) {
        const bytes = await (
          await fetch("/fonts/manrope/normal.ttf")
        ).arrayBuffer();
        settings.roles.display.fontId = "private-proof-manrope";
        settings.fontDependencies = {
          "private-proof-manrope": { name: "Private Proof Manrope" },
        };
        uploads.push({
          id: "private-proof-manrope",
          name: "Private Proof Manrope",
          fileName: "Private Proof Manrope.ttf",
          hash: "browser-proof",
          bytes,
          weight: "200 800",
          style: "normal",
        });
      }
      const blob = await exportPng(settings, uploads);
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d", { willReadFrequently: true })!;
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      let nonBackgroundSamples = 0;
      let accentSamples = 0;
      for (let y = 0; y < canvas.height; y += 4) {
        for (let x = 0; x < canvas.width; x += 4) {
          const index = (y * canvas.width + x) * 4;
          const [r, g, b, a] = pixels.subarray(index, index + 4);
          if (
            a &&
            (Math.abs(r - 244) > 4 ||
              Math.abs(g - 240) > 4 ||
              Math.abs(b - 232) > 4)
          )
            nonBackgroundSamples++;
          if (a && r > 140 && r > g * 1.7 && g < 100 && b < 90) accentSamples++;
        }
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `counterform-${format}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
      return {
        width: bitmap.width,
        height: bitmap.height,
        nonBackgroundSamples,
        accentSamples,
        byteLength: blob.size,
      };
    },
    { format, privateDisplay, template },
  );
  const [download, metrics] = await Promise.all([pending, metricsPromise]);
  if (savePath) await download.saveAs(savePath);
  const bytes = await readFile((await download.path())!);
  return { metrics: metrics as RasterMetrics, bytes };
}

test("shared renderer produces nonblank exact Social PNGs with local glyphs", async ({
  page,
}) => {
  await mkdir("test-results/evidence/modes", { recursive: true });
  await page.goto("/");
  const square = await exportSocialPng(
    page,
    "square",
    true,
    "social-statement",
    "test-results/evidence/modes/social-output.png",
  );
  const story = await exportSocialPng(
    page,
    "story",
    false,
    "social-editorial-card",
    "/tmp/counterform-editorial-story.png",
  );
  const landscape = await exportSocialPng(
    page,
    "landscape",
    false,
    "social-announcement",
    "/tmp/counterform-announcement-landscape.png",
  );

  expect(square.metrics).toMatchObject({ width: 1080, height: 1080 });
  expect(story.metrics).toMatchObject({ width: 1080, height: 1920 });
  expect(landscape.metrics).toMatchObject({ width: 1200, height: 630 });
  for (const output of [square, story, landscape]) {
    expect(output.bytes.subarray(1, 4).toString()).toBe("PNG");
    expect(output.metrics.byteLength).toBeGreaterThan(10_000);
    expect(output.metrics.nonBackgroundSamples).toBeGreaterThan(1_000);
    expect(output.metrics.accentSamples).toBeGreaterThan(250);
  }
});

test("all social starters fit every fixed format without clipping or collisions", async ({
  page,
}) => {
  await page.goto("/");
  const failures = await page.evaluate(async () => {
    const sourceRoot = "/src";
    const { defaultSettings } = await import(`${sourceRoot}/model.ts`);
    const { fontFaceCss, renderSpecimen, SPECIMEN_CSS, systemCss } =
      await import(`${sourceRoot}/render.ts`);
    const { setSurface, applySurfaceTemplate, surfaceGeometry } = await import(
      `${sourceRoot}/surface.ts`
    );
    const formats = ["square", "portrait", "story", "landscape"] as const;
    const templates = [
      "social-statement",
      "social-announcement",
      "social-editorial-card",
    ];
    const issues: string[] = [];
    for (const format of formats) {
      for (const template of templates) {
        let settings = setSurface(defaultSettings(), {
          mode: "social",
          format,
        });
        settings = applySurfaceTemplate(settings, template);
        const geometry = surfaceGeometry(settings);
        const frame = document.createElement("iframe");
        frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${geometry.width}px;height:${geometry.height}px`;
        document.body.append(frame);
        const loaded = new Promise((resolve) =>
          frame.addEventListener("load", resolve, { once: true }),
        );
        frame.srcdoc = `<style>${fontFaceCss()}${SPECIMEN_CSS}${systemCss(settings)}html,body{margin:0}</style>${renderSpecimen(settings)}`;
        await loaded;
        await frame.contentDocument!.fonts.ready;
        const frameDocument = frame.contentDocument!;
        const specimen = frameDocument.querySelector<HTMLElement>(".specimen")!;
        const specimenBox = specimen.getBoundingClientRect();
        const blocks = [
          ...frameDocument.querySelectorAll<HTMLElement>(".layout-block"),
        ].filter(
          (block) =>
            block.textContent?.trim() ||
            block.matches(".layout-rule,.layout-letter"),
        );
        for (const block of blocks) {
          const box = block.getBoundingClientRect();
          if (
            box.left < specimenBox.left - 1 ||
            box.top < specimenBox.top - 1 ||
            box.right > specimenBox.right + 1 ||
            box.bottom > specimenBox.bottom + 1
          )
            issues.push(
              `${format}/${template}: ${block.dataset.blockId} leaves the sheet`,
            );
          if (
            block.scrollWidth > block.clientWidth + 12 ||
            block.scrollHeight > block.clientHeight + 12
          )
            issues.push(
              `${format}/${template}: ${block.dataset.blockId} clips its content ${block.clientWidth}x${block.clientHeight}/${block.scrollWidth}x${block.scrollHeight}`,
            );
        }
        for (let first = 0; first < blocks.length; first++) {
          for (let second = first + 1; second < blocks.length; second++) {
            const a = blocks[first].getBoundingClientRect();
            const b = blocks[second].getBoundingClientRect();
            const overlapWidth =
              Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const overlapHeight =
              Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (overlapWidth > 2 && overlapHeight > 2)
              issues.push(
                `${format}/${template}: ${blocks[first].dataset.blockId} overlaps ${blocks[second].dataset.blockId}`,
              );
          }
        }
        frame.remove();
      }
    }
    return issues;
  });
  expect(failures).toEqual([]);
});

for (const format of [
  {
    pageSize: "a4",
    orientation: "portrait",
    heightMm: 297,
    capacityLimited: false,
  },
  {
    pageSize: "a5",
    orientation: "landscape",
    heightMm: 148,
    capacityLimited: true,
  },
] as const) {
  test(`preview and standalone output keep fixed artwork coordinates and off-sheet notices at ${format.pageSize} ${format.orientation}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ media: "print" });
    await page.goto("/");
    const result = await page.evaluate(async ({ pageSize, orientation }) => {
      const sourceRoot = "/src";
      const { defaultSettings } = await import(`${sourceRoot}/model.ts`);
      const { setSurface, applySurfaceTemplate } = await import(
        `${sourceRoot}/surface.ts`
      );
      const { renderSpecimen, SPECIMEN_CSS, systemCss } = await import(
        `${sourceRoot}/render.ts`
      );
      const { standaloneOutputHtml } = await import(`${sourceRoot}/output.ts`);
      let settings = setSurface(defaultSettings(), {
        mode: "print",
        pageSize,
        orientation,
        pages: "facing",
      });
      settings = applySurfaceTemplate(settings, "print-editorial-facing");

      const preview = document.createElement("iframe");
      const output = document.createElement("iframe");
      preview.style.cssText = output.style.cssText =
        "position:fixed;left:-10000px;top:0;width:1800px;height:900px";
      document.body.append(preview, output);
      preview.srcdoc = `<style>${SPECIMEN_CSS}${systemCss(settings)}</style>${renderSpecimen(settings)}`;
      output.srcdoc = standaloneOutputHtml(
        settings,
        "",
        '<aside class="font-notice">Missing font dependencies: Private Proof Face.</aside>',
      );
      await Promise.all([
        new Promise((resolve) =>
          preview.addEventListener("load", resolve, { once: true }),
        ),
        new Promise((resolve) =>
          output.addEventListener("load", resolve, { once: true }),
        ),
      ]);
      const measure = (frame: HTMLIFrameElement) => {
        const document = frame.contentDocument!;
        const specimen = document.querySelector<HTMLElement>(".specimen")!;
        const title = document.querySelector<HTMLElement>(".layout-title")!;
        const letter = document.querySelector<HTMLElement>(".layout-letter")!;
        const specimenBox = specimen.getBoundingClientRect();
        const relative = (element: HTMLElement) => {
          const box = element.getBoundingClientRect();
          return {
            top: Math.round((box.top - specimenBox.top) * 10) / 10,
            left: Math.round((box.left - specimenBox.left) * 10) / 10,
            width: Math.round(box.width * 10) / 10,
            height: Math.round(box.height * 10) / 10,
            scrollOverflow: element.scrollHeight - element.clientHeight,
          };
        };
        const blocks = [
          ...document.querySelectorAll<HTMLElement>(".layout-block"),
        ].filter(
          (block) =>
            block.textContent?.trim() ||
            block.matches(".layout-rule,.layout-letter"),
        );
        const issues: string[] = [];
        for (let first = 0; first < blocks.length; first++) {
          const a = blocks[first].getBoundingClientRect();
          if (
            a.left < specimenBox.left - 1 ||
            a.top < specimenBox.top - 1 ||
            a.right > specimenBox.right + 1 ||
            a.bottom > specimenBox.bottom + 1
          )
            issues.push(`${blocks[first].dataset.blockId} leaves the sheet`);
          for (let second = first + 1; second < blocks.length; second++) {
            const b = blocks[second].getBoundingClientRect();
            const overlapWidth =
              Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const overlapHeight =
              Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (overlapWidth > 2 && overlapHeight > 2)
              issues.push(
                `${blocks[first].dataset.blockId} overlaps ${blocks[second].dataset.blockId}`,
              );
          }
        }
        const notice = document.querySelector<HTMLElement>(".font-notice");
        return {
          title: relative(title),
          letter: relative(letter),
          blocks: blocks.map((block) => ({
            id: block.dataset.blockId,
            ...relative(block),
          })),
          specimenHeight: specimen.offsetHeight,
          bodyHeight: document.body.scrollHeight,
          notice: notice?.textContent ?? "",
          noticeDisplay: notice ? getComputedStyle(notice).display : "missing",
          issues,
        };
      };
      const values = {
        preview: measure(preview),
        output: measure(output),
        settings,
      };
      preview.remove();
      output.remove();
      return values;
    }, format);

    await testInfo.attach("fixed-output-geometry", {
      body: JSON.stringify(result, null, 2),
      contentType: "application/json",
    });
    expect(result.output.notice).toContain("Private Proof Face");
    expect(result.preview.title).toEqual(result.output.title);
    expect(result.preview.letter).toEqual(result.output.letter);
    expect(result.preview.blocks).toEqual(result.output.blocks);
    if (format.capacityLimited) {
      // The reading starter now includes Body. A5 landscape preserves it, but
      // the approved fixed-page contract reports capacity instead of paginating.
      expect(result.preview.letter.scrollOverflow).toBeGreaterThan(0);
      expect(result.preview.issues).toEqual([
        "body leaves the sheet",
        "quote overlaps caption",
      ]);
      expect(result.output.issues).toEqual(result.preview.issues);
      await page.emulateMedia({ media: "screen" });
      await page.getByLabel("Import experiment file").setInputFiles({
        name: "a5-landscape-capacity-control.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(result.settings)),
      });
      await expect(
        page.getByText("Fonts ready", { exact: true }),
      ).toBeVisible();
      const current = page.locator('.frame-region[data-frame="current"]');
      await expect(current.locator(".font-warning")).toContainText(
        /extends beyond|exceeds its allocated area/,
      );
      expect(
        (await current.locator(".layout-body p").allTextContents()).join(
          "\n\n",
        ),
      ).toBe(result.settings.content.body);
      await testInfo.attach("a5-live-capacity-warning", {
        body: JSON.stringify(
          await current.locator(".font-warning").allTextContents(),
        ),
        contentType: "application/json",
      });
    } else {
      expect(result.preview.letter.scrollOverflow).toBeLessThanOrEqual(0);
      expect(result.preview.issues).toEqual([]);
      expect(result.output.issues).toEqual([]);
    }
    expect(result.output.noticeDisplay).toBe("none");
    expect(result.output.specimenHeight).toBeCloseTo(
      (format.heightMm * 96) / 25.4,
      0,
    );
    expect(result.output.bodyHeight).toBe(result.output.specimenHeight);
  });
}
