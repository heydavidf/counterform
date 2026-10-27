import { fonts } from "./catalog";
import { familyAlias, fontName, type Settings, type UploadedFont } from "./model";
import { fontFaceCss, renderSpecimen, SPECIMEN_CSS, systemCss } from "./render";
import { surfaceGeometry } from "./surface";

export type ArtworkText = {
  text: string;
  x: number;
  y: number;
  top: number;
  width: number;
  height: number;
  size: number;
  leading: number;
  tracking: number;
  weight: string;
  style: string;
  family: string;
  color: string;
  variantCaps: string;
  features: string;
  variation: string;
  role: "display" | "body" | "support";
};
export type ArtworkShape = {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
};
export type Artwork = {
  width: number;
  height: number;
  texts: ArtworkText[];
  shapes: ArtworkShape[];
};

const selectedIds = (settings: Settings) =>
  new Set(Object.values(settings.roles).map((role) => role.fontId));

export function selectedPrivateFonts(settings: Settings, uploads: UploadedFont[]) {
  return uploads.filter((font) => selectedIds(settings).has(font.id));
}

export function assertFontPermission(
  settings: Settings,
  uploads: UploadedFont[],
  includePrivate: boolean,
  rightsConfirmed: boolean,
) {
  if (includePrivate && selectedPrivateFonts(settings, uploads).length && !rightsConfirmed)
    throw new Error("Confirm that your licence allows these private font files to be included in this download.");
}

/** Browser measurement is taken from the same HTML and CSS as preview and package export. */
export async function captureArtwork(settings: Settings, uploads: UploadedFont[]): Promise<Artwork> {
  const geometry = surfaceGeometry(settings);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.title = "Counterform export measurement";
  iframe.style.cssText = `position:fixed;left:-100000px;top:0;width:${geometry.width}px;height:${geometry.height ?? 2400}px;border:0;pointer-events:none`;
  document.body.append(iframe);
  try {
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(`<style>${fontFaceCss()}\n${SPECIMEN_CSS}\n${systemCss(settings)}\nhtml,body{margin:0}body>.specimen{width:${geometry.width}px;max-width:none}</style>${renderSpecimen(settings)}`);
    doc.close();
    for (const font of selectedPrivateFonts(settings, uploads)) {
      const face = new FontFace(familyAlias(font.id), font.bytes.slice(0), {
        weight: font.weight,
        style: font.style,
      });
      await face.load();
      doc.fonts.add(face);
    }
    const specimen = doc.querySelector<HTMLElement>(".specimen")!;
    // Force layout so the browser requests every selected face before measurement.
    void specimen.offsetHeight;
    for (const role of Object.values(settings.roles))
      await doc.fonts.load(`${role.style} ${role.weight} ${role.size}px "${familyAlias(role.fontId)}"`);
    await doc.fonts.ready;
    const root = specimen.getBoundingClientRect();
    const height = geometry.height ?? Math.ceil(specimen.scrollHeight);
    const texts: ArtworkText[] = [];
    const shapes: ArtworkShape[] = [];
    const colorCanvas = doc.createElement("canvas");
    colorCanvas.width = colorCanvas.height = 1;
    const colorContext = colorCanvas.getContext("2d")!;
    const opaque = (color: string) => {
      colorContext.clearRect(0, 0, 1, 1);
      colorContext.fillStyle = settings.palette.background;
      colorContext.fillRect(0, 0, 1, 1);
      colorContext.fillStyle = color;
      colorContext.fillRect(0, 0, 1, 1);
      const [r, g, b] = colorContext.getImageData(0, 0, 1, 1).data;
      return `rgb(${r}, ${g}, ${b})`;
    };
    // Supported recipe blocks paint panels at layer 0 and foreground blocks at 1.
    // Stable ordering within each layer keeps ancestor backgrounds before children.
    const elements = [...specimen.querySelectorAll<HTMLElement>("*")];
    const blockLayer = (element: HTMLElement) => {
      const block = element.closest<HTMLElement>(".layout-block");
      return block ? Number(doc.defaultView!.getComputedStyle(block).zIndex) || 0 : 0;
    };
    elements.sort((a, b) => blockLayer(a) - blockLayer(b));
    for (const element of elements) {
      if (element.matches(".spec-page,.layout-grid,.layout-guides,.surface-guide,.grid-overlay,.module-overlay,.baseline-overlay")) continue;
      if (element.closest(".layout-guides,.surface-guide,.grid-overlay,.module-overlay,.baseline-overlay")) continue;
      const box = element.getBoundingClientRect();
      const style = doc.defaultView!.getComputedStyle(element);
      const fill = element.tagName === "HR" || element.matches(".layout-rule") ? style.borderTopColor : style.backgroundColor;
      if (fill && fill !== "rgba(0, 0, 0, 0)" && box.width && box.height)
        shapes.push({ x: box.left - root.left, y: box.top - root.top, width: box.width, height: box.height, fill: opaque(fill) });
      for (const [side, thickness, color, borderStyle] of [
        ["top", style.borderTopWidth, style.borderTopColor, style.borderTopStyle],
        ["right", style.borderRightWidth, style.borderRightColor, style.borderRightStyle],
        ["bottom", style.borderBottomWidth, style.borderBottomColor, style.borderBottomStyle],
        ["left", style.borderLeftWidth, style.borderLeftColor, style.borderLeftStyle],
      ]) {
        const line = parseFloat(thickness);
        if (!line || borderStyle === "none" || color === "rgba(0, 0, 0, 0)") continue;
        const vertical = side === "left" || side === "right";
        shapes.push({
          x: box.left - root.left + (side === "right" ? box.width - line : 0),
          y: box.top - root.top + (side === "bottom" ? box.height - line : 0),
          width: vertical ? line : box.width,
          height: vertical ? box.height : line,
          fill: opaque(color),
        });
      }
    }
    const walker = doc.createTreeWalker(specimen, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (!node.textContent?.trim()) continue;
      const parent = node.parentElement;
      if (!parent || parent.closest(".surface-guide,.layout-guides,.grid-overlay,.module-overlay,.baseline-overlay")) continue;
      const style = doc.defaultView!.getComputedStyle(parent);
      if (style.visibility === "hidden" || style.display === "none") continue;
      const raw = node.textContent;
      // Range geometry supplies the browser's actual wraps, spans, and line positions.
      let start = 0;
      while (start < raw.length) {
        while (start < raw.length && /\s/.test(raw[start]) && raw[start] !== " ") start++;
        if (start >= raw.length) break;
        let end = start + 1;
        const range = doc.createRange();
        range.setStart(node, start);
        range.setEnd(node, end);
        let box = range.getBoundingClientRect();
        if (!box.width && !box.height) { start = end; continue; }
        while (end < raw.length) {
          range.setEnd(node, end + 1);
          const next = range.getClientRects();
          if (next.length !== 1 || Math.abs(next[0].top - box.top) > 1.5) break;
          box = next[0];
          end++;
        }
        let value = raw.slice(start, end).replace(/\s+$/g, "");
        if (style.textTransform === "uppercase") value = value.toLocaleUpperCase(settings.layout?.typesetting.language ?? "en");
        if (style.textTransform === "lowercase") value = value.toLocaleLowerCase(settings.layout?.typesetting.language ?? "en");
        if (value.trim()) {
          const owner = parent.closest<HTMLElement>(".layout-title,.layout-quote,.layout-letter,h1,blockquote") ?? parent;
          const role: ArtworkText["role"] = owner.matches(".layout-title,.layout-quote,.layout-letter,h1,blockquote")
            ? "display"
            : owner.matches(".layout-body,.layout-deck,.specimen-body,.specimen-deck") || !!owner.closest(".layout-body,.layout-deck")
              ? "body" : "support";
          const size = parseFloat(style.fontSize);
          const context = doc.createElement("canvas").getContext("2d")!;
          context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          const metrics = context.measureText(value);
          const ascent = metrics.fontBoundingBoxAscent || size * 0.8;
          const descent = metrics.fontBoundingBoxDescent || size * 0.2;
          texts.push({
            text: value,
            x: box.left - root.left,
            y: box.top - root.top + (box.height - ascent - descent) / 2 + ascent,
            top: box.top - root.top,
            width: box.width,
            height: box.height,
            size,
            leading: parseFloat(style.lineHeight) || size * 1.2,
            tracking: parseFloat(style.letterSpacing) || 0,
            weight: style.fontWeight,
            style: style.fontStyle,
            family: style.fontFamily.split(",")[0].replaceAll('"', ""),
            color: style.color,
            variantCaps: style.fontVariantCaps,
            features: style.fontFeatureSettings,
            variation: style.fontVariationSettings,
            role,
          });
        }
        start = end;
      }
    }
    return { width: geometry.width, height, texts, shapes };
  } finally {
    iframe.remove();
  }
}

const xml = (value: string) => value.replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
const round = (value: number) => Number(value.toFixed(3));
const cssString = (value: string) => `"${value.replace(/[\\"\r\n\f]/g, (char) => `\\${char.charCodeAt(0).toString(16)} `)}"`;
function base64(bytes: Uint8Array) {
  let value = "";
  for (let start = 0; start < bytes.length; start += 0x8000)
    value += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  return btoa(value);
}

async function fontDataCss(settings: Settings, uploads: UploadedFont[], includePrivate: boolean) {
  const rules: string[] = [];
  for (const id of selectedIds(settings)) {
    const bundled = fonts.find((font) => font.id === id);
    const upload = includePrivate ? uploads.find((font) => font.id === id) : undefined;
    const files = bundled?.files.map((file) => ({ path: file.path, weight: file.weight, style: file.style })) ?? [];
    for (const file of files) {
      if (!bundled?.licensePath) continue;
      const response = await fetch(`${import.meta.env.BASE_URL}${file.path}`);
      if (!response.ok) throw new Error(`Could not include ${bundled.name}.`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      rules.push(`@font-face{font-family:${cssString(bundled.name)};src:url(data:font/ttf;base64,${base64(bytes)});font-weight:${file.weight};font-style:${file.style}}`);
    }
    if (upload) {
      const bytes = new Uint8Array(upload.bytes);
      const mime = upload.fileName.toLowerCase().endsWith("woff2") ? "font/woff2" : upload.fileName.toLowerCase().endsWith("woff") ? "font/woff" : "font/ttf";
      rules.push(`@font-face{font-family:${cssString(upload.name)};src:url(data:${mime};base64,${base64(bytes)});font-weight:${upload.weight};font-style:${upload.style}}`);
    }
  }
  return rules.join("\n");
}

export async function exportSvg(settings: Settings, uploads: UploadedFont[], includePrivate = false, rightsConfirmed = false) {
  assertFontPermission(settings, uploads, includePrivate, rightsConfirmed);
  const artwork = await captureArtwork(settings, uploads);
  const fontCss = await fontDataCss(settings, uploads, includePrivate);
  const shapes = artwork.shapes.map((shape) => `<rect x="${round(shape.x)}" y="${round(shape.y)}" width="${round(shape.width)}" height="${round(shape.height)}" fill="${xml(shape.fill)}"/>`).join("");
  const families = new Map(Object.values(settings.roles).map((role) => [familyAlias(role.fontId), fontName(role.fontId, uploads, settings.fontDependencies)]));
  const text = artwork.texts.map((line) => `<text x="${round(line.x)}" y="${round(line.y)}" font-family="${xml(cssString(families.get(line.family) ?? line.family))}" font-size="${round(line.size)}" font-weight="${xml(line.weight)}" font-style="${xml(line.style)}" letter-spacing="${round(line.tracking)}" fill="${xml(line.color)}" style="font-variant-caps:${xml(line.variantCaps)};font-feature-settings:${xml(line.features)};font-variation-settings:${xml(line.variation)}" xml:space="preserve">${xml(line.text)}</text>`).join("");
  const licences = await Promise.all([...selectedIds(settings)]
    .map((id) => fonts.find((font) => font.id === id))
    .filter((font): font is NonNullable<typeof font> => !!font?.licensePath)
    .map(async (font) => {
      const response = await fetch(`${import.meta.env.BASE_URL}${font.licensePath}`);
      if (!response.ok) throw new Error(`Could not include the licence for ${font.name}.`);
      return `${font.name}\n${await response.text()}`;
    }));
  const licence = licences.join("\n\n");
  const geometry = surfaceGeometry(settings);
  const width = geometry.mode === "print" ? `${geometry.widthMm}mm` : `${round(artwork.width)}px`;
  const height = geometry.mode === "print" ? `${geometry.heightMm}mm` : `${round(artwork.height)}px`;
  const svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${round(artwork.width)} ${round(artwork.height)}"><title>${xml(settings.name)}</title><desc>Live-text artwork from Counterform. Text remains editable; layout can change when a font is unavailable. ${xml(licence)}</desc><metadata>${xml(licence)}</metadata><style>${xml(fontCss)}</style><rect width="100%" height="100%" fill="${xml(settings.palette.background)}"/>${shapes}${text}</svg>`;
  return new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
}
