import { fonts } from "./catalog";
import { familyAlias, type Settings, type UploadedFont } from "./model";
import { renderSpecimen, SPECIMEN_CSS, systemCss } from "./render";
import { printCss, surfaceGeometry, surfaceOf } from "./surface";

const cleanMarkup = (settings: Settings) =>
  renderSpecimen(settings).replace(
    'class="specimen ',
    'class="specimen output-clean ',
  );

export function standaloneOutputHtml(
  settings: Settings,
  fontCss = "",
  notice = "",
): string {
  const geometry = surfaceGeometry(settings);
  const fixed = geometry.mode !== "web";
  const canvas = fixed
    ? `width:${geometry.width}px;height:${geometry.height}px;min-width:${geometry.width}px;max-width:none`
    : `width:100%;max-width:${settings.width}px`;
  return `<!doctype html>\n<html lang="${settings.layout?.typesetting.language ?? "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${settings.name.replace(/[<>&"]/g, "")}</title><style>${fontCss}\n${SPECIMEN_CSS}\n${systemCss(settings)}\n${printCss(settings)}\nhtml,body{margin:0;background:${settings.palette.background}}body>.specimen{${canvas};margin-inline:auto}.font-notice{padding:16px;font:14px/1.5 system-ui;color:#242a25;background:#fff1cb}</style></head><body>${notice}${cleanMarkup(settings)}</body></html>`;
}

const dataUrl = async (bytes: ArrayBuffer, mime: string) => {
  const view = new Uint8Array(bytes);
  let binary = "";
  for (let offset = 0; offset < view.length; offset += 0x8000)
    binary += String.fromCharCode(...view.subarray(offset, offset + 0x8000));
  return `data:${mime};base64,${btoa(binary)}`;
};

async function embeddedFontCss(settings: Settings, uploads: UploadedFont[]) {
  const rolesById = new Map<string, Set<string>>();
  for (const role of Object.values(settings.roles)) {
    const styles = rolesById.get(role.fontId) ?? new Set<string>();
    styles.add(role.style);
    rolesById.set(role.fontId, styles);
  }
  const rules: string[] = [];
  for (const [id, styles] of rolesById) {
    const bundled = fonts.find((font) => font.id === id);
    if (bundled) {
      for (const file of bundled.files.filter((item) =>
        styles.has(item.style),
      )) {
        const response = await fetch(`${import.meta.env.BASE_URL}${file.path}`);
        if (!response.ok)
          throw new Error(`Could not load ${bundled.name} for PNG export.`);
        const url = await dataUrl(await response.arrayBuffer(), "font/ttf");
        rules.push(
          `@font-face{font-family:"${familyAlias(id)}";src:url("${url}");font-weight:${file.weight};font-style:${file.style};font-display:block}`,
        );
      }
      continue;
    }
    const upload = uploads.find((item) => item.id === id);
    if (!upload)
      throw new Error(
        `The font ${settings.fontDependencies?.[id]?.name ?? id} is unavailable for PNG export.`,
      );
    const mime = upload.fileName.toLowerCase().endsWith(".woff2")
      ? "font/woff2"
      : upload.fileName.toLowerCase().endsWith(".woff")
        ? "font/woff"
        : "font/ttf";
    const url = await dataUrl(upload.bytes, mime);
    rules.push(
      `@font-face{font-family:"${familyAlias(id)}";src:url("${url}");font-weight:${upload.weight};font-style:${upload.style};font-display:block}`,
    );
  }
  return rules.join("\n");
}

async function awaitEmbeddedFonts(settings: Settings, fontCss: string) {
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none";
  const style = document.createElement("style");
  style.textContent = fontCss;
  host.append(style);
  const probe = document.createElement("span");
  probe.textContent = "Counterform ÅÄÖ åäö 0123456789";
  host.append(probe);
  document.body.append(host);
  try {
    for (const role of Object.values(settings.roles)) {
      const faces = await document.fonts.load(
        `${role.style} ${role.weight} ${role.size}px "${familyAlias(role.fontId)}"`,
        probe.textContent,
      );
      if (!faces.length)
        throw new Error(
          `The font ${settings.fontDependencies?.[role.fontId]?.name ?? role.fontId} did not load.`,
        );
    }
    await document.fonts.ready;
  } finally {
    host.remove();
  }
}

export async function exportPng(
  settings: Settings,
  uploads: UploadedFont[],
): Promise<Blob> {
  if (surfaceOf(settings).mode !== "social")
    throw new Error("PNG export is available for Social formats.");
  if (typeof document === "undefined")
    throw new Error("PNG export requires a browser.");
  const geometry = surfaceGeometry(settings);
  const fontCss = await embeddedFontCss(settings, uploads);
  await awaitEmbeddedFonts(settings, fontCss);
  const markup = cleanMarkup(settings);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${geometry.width}" height="${geometry.height}" viewBox="0 0 ${geometry.width} ${geometry.height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>${fontCss}\n${SPECIMEN_CSS}\n${systemCss(settings)}</style>${markup}</div></foreignObject></svg>`;
  // A self-contained data URL remains origin-clean when Chromium rasterizes the
  // foreignObject. The equivalent blob-loaded SVG taints the destination canvas
  // even when every font and style resource is embedded.
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  try {
    const image = new Image();
    image.decoding = "sync";
    image.src = source;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = geometry.width;
    canvas.height = geometry.height!;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot create the PNG canvas.");
    context.drawImage(image, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob || blob.size < 100)
      throw new Error("The PNG renderer returned an empty image.");
    return blob;
  } catch (cause) {
    throw new Error(
      "The PNG could not be rendered. No blank image was downloaded.",
      { cause },
    );
  }
}
