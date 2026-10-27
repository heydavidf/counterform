import { describeLayout } from "./layout-document";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { fonts, pairings } from "./catalog";
import {
  contrast,
  familyAlias,
  fontName,
  validateSettings,
  type Settings,
  type UploadedFont,
  type Role,
} from "./model";
import { renderSpecimen, systemCss, SPECIMEN_CSS } from "./render";
import { printCss, surfaceGeometry, surfaceOf } from "./surface";
import { assertFontPermission } from "./export-artwork";

const FONT_LIMIT = 20 * 1024 * 1024;
const PACKAGE_LIMIT = 100 * 1024 * 1024;
const JSON_LIMIT = 1024 * 1024;
const roles: Role[] = ["display", "body", "support"];
const encode = (value: unknown) => strToU8(JSON.stringify(value, null, 2));
const html = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const prose = (value: string) =>
  html(value)
    .replace(/[\\`*_{}\[\]()#+.!|~-]/g, "\\$&")
    .replace(/[\r\n]/g, " ");
const hashBytes = async (bytes: ArrayBuffer) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
const validWeight = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{3,4}( \d{3,4})?$/.test(value))
    return false;
  const values = value.split(" ").map(Number);
  return (
    values.every((n) => n >= 100 && n <= 1000) &&
    (values.length === 1 || values[0] <= values[1])
  );
};
function checkFont(bytes: ArrayBuffer, fileName: string) {
  if (!/\.(ttf|otf|woff2?)$/i.test(fileName))
    throw new Error("Choose a TTF, OTF, WOFF or WOFF2 font file.");
  if (!bytes.byteLength || bytes.byteLength > FONT_LIMIT)
    throw new Error("Each font must be smaller than 20 MB.");
  const signature = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
  const tag = String.fromCharCode(...signature);
  if (
    bytes.byteLength < 12 ||
    (!["OTTO", "wOFF", "wOF2", "true"].includes(tag) &&
      !signature.every((n, i) => n === [0, 1, 0, 0][i]))
  )
    throw new Error("This file does not contain a supported font.");
}
export async function makeUpload(
  file: File,
  weight = "400",
  style: "normal" | "italic" = "normal",
): Promise<UploadedFont> {
  if (file.size > FONT_LIMIT)
    throw new Error("Each font must be smaller than 20 MB.");
  if (!validWeight(weight) || !["normal", "italic"].includes(style))
    throw new Error("The font weight or style is invalid.");
  const bytes = await file.arrayBuffer();
  checkFont(bytes, file.name);
  const hash = await hashBytes(bytes);
  return {
    id: "upload-" + hash,
    hash,
    name: file.name.replace(/\.[^.]+$/, "").slice(0, 200),
    fileName: file.name.slice(0, 255),
    bytes,
    weight,
    style,
  };
}
type FontRecord = {
  id: string;
  name: string;
  kind: "bundled" | "upload" | "missing";
  included: boolean;
  fileName?: string;
  hash?: string;
  weight?: string;
  style?: "normal" | "italic";
  path?: string;
};
function face(id: string, path: string, weight: string, style: string) {
  return `@font-face{font-family:"${familyAlias(id)}";src:url("${path}");font-weight:${weight};font-style:${style};font-display:swap;}\n`;
}
async function bundledFile(path: string) {
  const base =
    (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env
      ?.BASE_URL ?? "./";
  const response = await fetch(base + path);
  if (!response.ok)
    throw new Error(
      `Could not include ${path}. Keep Counterform open and try exporting again.`,
    );
  return new Uint8Array(await response.arrayBuffer());
}
/** Attach selected private font descriptions without embedding any font bytes. */
export function withFontDependencies(
  settings: Settings,
  uploads: UploadedFont[],
): Settings {
  const s = validateSettings(settings);
  const attach = (snapshot: Omit<Settings, "comparison">) => {
    for (const id of new Set(roles.map((role) => snapshot.roles[role].fontId))) {
      const upload = uploads.find((font) => font.id === id);
      const existing = snapshot.fontDependencies?.[id];
      const dependency = upload
        ? { name: upload.name, fileName: upload.fileName, weight: upload.weight, style: upload.style }
        : existing;
      if (dependency) {
        snapshot.fontDependencies ??= {};
        snapshot.fontDependencies[id] = dependency;
        s.fontDependencies ??= {};
        s.fontDependencies[id] = dependency;
      }
    }
  };
  attach(s);
  if (s.comparison) attach(s.comparison.reference);
  return validateSettings(s);
}
function designDocument(
  s: Settings,
  uploads: UploadedFont[],
  dependencies: FontRecord[],
) {
  const nameFor = (id: string) =>
    dependencies.find((font) => font.id === id)?.name ??
    s.fontDependencies?.[id]?.name ??
    fontName(id, uploads);
  const pairing = pairings.find((pairing) =>
    roles.every((role) => pairing[role] === s.roles[role].fontId),
  );
  const rationale = pairing
    ? `${pairing.name}: ${pairing.rationale}`
    : "Manual role assignment. Display type carries the main voice, reading type carries sustained paragraphs, and supporting type separates captions and metadata. No curated pairing rationale is asserted for this combination; judge texture and hierarchy in the rendered composition.";
  const colorChecks = (["background", "panel"] as const)
    .flatMap((surface) =>
      (["ink", "muted", "accent"] as const).map((ink) => {
        const ratio = contrast(s.palette[ink], s.palette[surface]);
        return `| ${ink} on ${surface === "background" ? "paper" : "panel"} | ${ratio.toFixed(2)}:1 | ${ratio >= 4.5 ? "Pass" : "Fail"} | ${ratio >= 3 ? "Pass" : "Fail"} |`;
      }),
    )
    .join("\n");
  const mainSpan = Math.max(
    1,
    Math.ceil(
      s.grid.columns *
        (s.grid.layout === "balanced"
          ? 0.58
          : s.grid.layout === "compact"
            ? 0.7
            : 0.55),
    ),
  );
  const sideSpan = Math.max(
    1,
    s.grid.columns -
      mainSpan -
      (s.grid.layout === "asymmetric" && s.grid.columns > 4 ? 1 : 0),
  );

  const q = JSON.stringify;
  const typography = roles
    .map((role) => {
      const r = s.roles[role];
      const axes =
        Object.entries(r.axes)
          .map(([tag, value]) => `"${tag}" ${value}`)
          .join(", ") || "normal";
      return `  ${role}:\n    fontFamily: ${q(nameFor(r.fontId))}\n    fontSize: ${r.size}px\n    fontWeight: ${r.weight}\n    lineHeight: ${r.leading}\n    letterSpacing: ${r.tracking}em\n    fontVariation: ${q(axes)}`;
    })
    .join("\n");
  const missing = dependencies
    .filter((f) => !f.included)
    .map((f) => `${prose(f.name)} (${f.id})`)
    .join("; ");
  const document = `---\nversion: alpha\nname: ${q(s.name)}\ndescription: ${q(`A ${s.composition} typography specimen exported from Counterform.`)}\nomitted:\n  - section: rounded\n    reason: "This specimen does not define a corner-radius system."\n  - section: components\n    reason: "This export describes a composition, not a product component library."\n  - section: elevation\n    reason: "No elevation system is defined."\n  - section: shapes\n    reason: "No shape system is defined."\ncolors:\n  primary: ${q(s.palette.ink)}\n  secondary: ${q(s.palette.muted)}\n  accent: ${q(s.palette.accent)}\n  background: ${q(s.palette.background)}\n  panel: ${q(s.palette.panel)}\ntypography:\n${typography}\nspacing:\n  baseline: ${s.grid.baseline}px\n  gutter: ${s.grid.gutter}px\n  margin: ${s.grid.margin}px\n  columns: ${s.grid.columns}\n  modules: ${s.grid.modules}\n---\n\n# ${prose(s.name)}\n\n## Overview\n\nA ${s.composition} composition exploring type, space and colour. settings.json is the exact editable source; tokens.css and specimen.html use the same renderer as the workbench. Specimen copy is original illustrative content.\n\n## Colors\n\nPalette: ${prose(s.palette.name)}. Primary is ink for reading; secondary is muted supporting text; accent marks emphasis; background is the page surface; panel supports inset content. This separates sustained reading from supporting information and gives emphasis its own colour; the inset panel groups related material without relying on a new type family. These are experimental values, not a claim of accessibility conformance.\n\nMeasured sRGB contrast for the actual exported colours:\n\n| Text and surface | Contrast | AA normal text (4.5:1) | AA large text (3:1) |\n| --- | --- | --- | --- |\n${colorChecks}\n\nLarge text means at least 24px regular or approximately 18.67px bold. A passing colour pair does not establish whole-page accessibility. Check the actual type size and weight before using the large-text threshold.\n\n## Typography\n\n${prose(rationale)}\n\n${roles
    .map((role) => {
      const r = s.roles[role];
      return `- ${role}: ${prose(nameFor(r.fontId))}; ID ${r.fontId}; ${r.size}px, weight ${r.weight}, ${r.style}, unitless leading ${r.leading}, tracking ${r.tracking}em. Variation axes: ${prose(JSON.stringify(r.axes))}.`;
    })
    .join(
      "\n",
    )}\n\nRole tokens are base values, not an assertion that every element has the same size. Editorial and product decks use reading size × 1.25 (${s.roles.body.size * 1.25}px) with leading 1.4; their quotes use reading size × 1.4 (${s.roles.body.size * 1.4}px), display family, leading 1.3 and tracking −0.02em. Product subheadings use reading size × 1.45 (${s.roles.body.size * 1.45}px), display family and leading 1.3; product detail rows use at least 12px and zero tracking. Poster decks and quotes use reading size × 1.6 (${s.roles.body.size * 1.6}px), with leading 1.35 and 1.3 respectively. Poster headline maximum is display size × 1.5 (${s.roles.display.size * 1.5}px). Supporting letter coordinates use max(9px, supporting size × 0.85).\n\nFont-family names above are descriptive; the CSS uses cf- prefixed aliases to prevent local font collisions. Included open families retain their licences in fonts/. Private fonts require permission for redistribution.${missing ? ` Missing dependencies: ${missing}. Their IDs are preserved; supply these fonts to reproduce the original typography.` : " All selected dependencies are included."}\n\n## Layout\n\nComposition: ${s.composition}; layout: ${s.grid.layout}; ${s.grid.columns} columns; ${s.grid.gutter}px gutter; ${s.grid.margin}px preferred margins; ${s.grid.baseline}px spacing unit; ${s.grid.modules} modules. Reading measure: ${s.measure}ch. Saved preview width: ${s.width}px. Above 600px container width, the main span is ${mainSpan} columns and the side span is ${sideSpan} columns, with the side aligned to the last grid line. At container widths of 600px or less, composition columns become a single column with a 28px gap; text and side content span that column, masthead items can wrap, and footer items stack. The page minimum height becomes zero (desktop minimum: 900px, or 1080px for posters).\n\nMargins use clamp(min(20px, ${s.grid.margin}px), 6cqw, ${s.grid.margin}px). Editorial and product headlines use clamp(min(30px, ${s.roles.display.size}px), 9cqw, ${s.roles.display.size}px); posters use clamp(48px, 12cqw, ${s.roles.display.size * 1.5}px), so the poster floor can exceed very small role values. A cqw is one percent of the specimen container width. Exported HTML is fluid up to the saved ${s.width}px width. Reading measure is a maximum of ${s.measure}ch, not a fixed line length. The editorial letter study uses clamp(100px, 25cqw, 280px), replaced by 180px at the narrow breakpoint; the poster letter uses clamp(130px, 35cqw, 420px).\n\nThe baseline and module controls define optional inspection overlays. They do not snap text or all spacing to a modular system. Composition spacing also includes fixed gaps and proportional type sizes; preserve tokens.css as the normative responsive implementation.\n\n## Do's and Don'ts\n\nPreserve the three role assignments, explicit axes, paragraph breaks and responsive rules when reproducing this specimen. Review contrast and reading comfort in context. Do not infer a wider brand system or redistribute private fonts without permission.\n`;
  if (!s.layout) return document;
  return document
    // A function keeps "$&" and similar in user labels literal.
    .replace(/## Layout\n[\s\S]*?(?=## Do's and Don'ts)/, () => describeLayout(s))
    .replace(
      /Role tokens are base values[\s\S]*?(?=Font-family names above)/,
      "Role settings define the base typography. The editable block system applies display to titles, quotations and letterforms, body to prose and decks, and supporting to captions and markers. Block-specific sizes and responsive behavior are defined by tokens.css.\n\n",
    )
    .replace(
      /spacing:\n[\s\S]*?\n---/,
      `spacing:\n  baseline: ${s.layout.rhythm.unit}px\n  gutter: ${s.layout.columns.gap}px\n  margin: ${s.layout.margins.left}px\n  columns: ${s.layout.columns.tracks.length}\n  modules: ${s.layout.rows.tracks.length}\n---`,
    );
}
export async function exportPackage(
  settings: Settings,
  uploads: UploadedFont[],
  includeUploads: boolean,
  rightsConfirmed = false,
): Promise<Uint8Array> {
  assertFontPermission(settings, uploads, includeUploads, rightsConfirmed);
  const s = withFontDependencies(settings, uploads);
  const files: Record<string, Uint8Array> = { "settings.json": encode(s) };
  const metadata: FontRecord[] = [];
  let faces = "";
  for (const id of new Set(roles.map((role) => s.roles[role].fontId))) {
    const bundled = fonts.find((f) => f.id === id);
    const upload = uploads.find((f) => f.id === id);
    if (bundled) {
      for (const file of bundled.files) {
        files[file.path] = await bundledFile(file.path);
        faces += face(id, file.path, file.weight, file.style);
      }
      files[bundled.licensePath] = await bundledFile(bundled.licensePath);
      metadata.push({
        id,
        name: bundled.name,
        kind: "bundled",
        included: true,
      });
    } else if (upload) {
      const extension = upload.fileName.split(".").pop()!.toLowerCase();
      const path = `fonts/private/${id}.${extension}`;
      metadata.push({
        id,
        name: upload.name,
        kind: "upload",
        included: includeUploads,
        fileName: upload.fileName,
        hash: upload.hash,
        weight: upload.weight,
        style: upload.style,
        ...(includeUploads ? { path } : {}),
      });
      if (includeUploads) {
        await validateUpload(
          metadata[metadata.length - 1],
          new Uint8Array(upload.bytes),
        );
        files[path] = new Uint8Array(upload.bytes);
        faces += face(id, path, upload.weight, upload.style);
      }
    } else
      metadata.push({
        ...s.fontDependencies?.[id],
        id,
        name: s.fontDependencies?.[id]?.name ?? `Missing private font: ${id}`,
        kind: "missing",
        included: false,
      });
  }
  files["fonts.json"] = encode({ schemaVersion: 1, fonts: metadata });
  files["tokens.css"] = strToU8(
    faces + "\n" + SPECIMEN_CSS + "\n" + systemCss(s) + "\n" + printCss(s),
  );
  const missing = metadata.filter((f) => !f.included);
  const notice = missing.length
    ? `<aside class="font-notice">Missing font dependencies: ${missing.map((f) => html(f.name) + " (" + html(f.id) + ")").join("; ")}. Fallback fonts are shown.</aside>`
    : "";
  const geometry = surfaceGeometry(s);
  const canvasStyle = geometry.mode === "web"
    ? `width:100%;max-width:${s.width}px`
    : `width:${geometry.width}px;height:${geometry.height}px;min-width:${geometry.width}px;max-width:none`;
  files["specimen.html"] = strToU8(
    `<!doctype html>\n<html lang="${s.layout?.typesetting.language ?? "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${html(s.name)}</title><link rel="stylesheet" href="tokens.css"><style>body{margin:0;background:${s.palette.background}}body>.specimen{${canvasStyle};margin-inline:auto}.font-notice{padding:16px;font:14px/1.5 system-ui;color:#242a25;background:#fff1cb}</style></head><body>${notice}${renderSpecimen(s).replace('class="specimen ', 'class="specimen output-clean ')}</body></html>`,
  );
  files["DESIGN.md"] = strToU8(designDocument(s, uploads, metadata));
  files["README.txt"] = strToU8(
    "Open specimen.html in a browser. Keep tokens.css and fonts/ beside it. Import this ZIP or settings.json into Counterform.\nBundled fonts retain their licences. Private font files are included only when explicitly selected at export.\n" +
      (surfaceOf(s).mode === "print"
        ? "For browser Print / Save as PDF use 100% scale, disable headers and footers, and enable background graphics. Facing pages export as one double-width spread sheet. This is browser print output, not a prepress PDF.\n"
        : "") +
      (missing.length
        ? "Missing dependencies:\n" +
          missing.map((f) => `${f.name}: ${f.id}`).join("\n")
        : "All selected fonts are included."),
  );
  if (
    Object.values(files).reduce((n, value) => n + value.byteLength, 0) >
    PACKAGE_LIMIT
  )
    throw new Error(
      "This export exceeds the 100 MB package limit. Export without private font files.",
    );
  return zipSync(files, { level: 6 });
}
function parseJson(bytes: Uint8Array) {
  if (bytes.byteLength > JSON_LIMIT)
    throw new Error("Settings or font metadata exceeds the 1 MB limit.");
  try {
    return JSON.parse(strFromU8(bytes));
  } catch {
    throw new Error(
      "The imported JSON is invalid. Your current work is unchanged.",
    );
  }
}
async function validateUpload(
  record: FontRecord,
  bytes?: Uint8Array,
): Promise<UploadedFont | null> {
  if (
    !/^[a-f0-9]{64}$/.test(record.hash ?? "") ||
    record.id !== "upload-" + record.hash ||
    typeof record.fileName !== "string" ||
    record.fileName.length > 255 ||
    !/\.(ttf|otf|woff2?)$/i.test(record.fileName) ||
    !validWeight(record.weight) ||
    !["normal", "italic"].includes(record.style ?? "")
  )
    throw new Error("The package contains invalid private font descriptors.");
  if (!record.included) return null;
  if (!bytes) throw new Error(`The package is missing ${record.name}.`);
  const buffer = bytes.slice().buffer as ArrayBuffer;
  checkFont(buffer, record.fileName);
  if ((await hashBytes(buffer)) !== record.hash)
    throw new Error(`The font checksum does not match: ${record.name}.`);
  return {
    id: record.id,
    name: record.name,
    fileName: record.fileName,
    hash: record.hash!,
    bytes: buffer,
    weight: record.weight!,
    style: record.style!,
  };
}
export async function importPackage(
  file: File,
): Promise<{ settings: Settings; uploads: UploadedFont[] }> {
  if (!file.size || file.size > PACKAGE_LIMIT)
    throw new Error("Choose a settings JSON or ZIP smaller than 100 MB.");
  const input = new Uint8Array(await file.arrayBuffer());
  if (input[0] !== 80 || input[1] !== 75)
    return { settings: validateSettings(parseJson(input)), uploads: [] };
  let expanded = 0;
  const names = new Set<string>();
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(input, {
      filter(entry) {
        expanded += entry.originalSize;
        if (
          expanded > PACKAGE_LIMIT ||
          entry.originalSize > FONT_LIMIT ||
          entry.size > FONT_LIMIT ||
          (entry.compression === 0 && entry.size !== entry.originalSize) ||
          names.size >= 256
        )
          throw new Error("The ZIP expands beyond the import limits.");
        if (
          names.has(entry.name) ||
          /(^\/|\\|(^|\/)\.\.?(\/|$)|\0|:)/.test(entry.name)
        )
          throw new Error("The ZIP contains unsafe or duplicate paths.");
        names.add(entry.name);
        return !entry.name.endsWith("/");
      },
    });
  } catch (error) {
    throw new Error(
      "This ZIP is damaged or exceeds safe import limits. Your current work is unchanged.",
      { cause: error },
    );
  }
  if (!files["settings.json"])
    throw new Error("This ZIP does not contain Counterform settings.json.");
  const settings = validateSettings(parseJson(files["settings.json"]));
  const uploads: UploadedFont[] = [];
  if (files["fonts.json"]) {
    const meta = parseJson(files["fonts.json"]);
    if (
      !meta ||
      meta.schemaVersion !== 1 ||
      !Array.isArray(meta.fonts) ||
      meta.fonts.length > 64
    )
      throw new Error("The package font metadata is invalid.");
    const ids = new Set<string>();
    for (const record of meta.fonts as FontRecord[]) {
      if (
        !record ||
        typeof record.id !== "string" ||
        !/^[a-zA-Z0-9_-]{1,160}$/.test(record.id) ||
        ["__proto__", "constructor", "prototype"].includes(record.id) ||
        ids.has(record.id) ||
        typeof record.name !== "string" ||
        record.name.length > 240 ||
        typeof record.included !== "boolean" ||
        !["bundled", "upload", "missing"].includes(record.kind)
      )
        throw new Error("The package font metadata is invalid.");
      ids.add(record.id);
      if (record.kind === "bundled") {
        if (!fonts.some((f) => f.id === record.id))
          throw new Error("The package names an unknown bundled font.");
        continue;
      }
      if (record.kind === "missing") {
        if (record.included)
          throw new Error("Missing font metadata cannot include a file.");
        settings.fontDependencies ??= {};
        settings.fontDependencies[record.id] = {
          name: record.name,
          ...(record.fileName !== undefined
            ? { fileName: record.fileName }
            : {}),
          ...(record.weight !== undefined ? { weight: record.weight } : {}),
          ...(record.style !== undefined ? { style: record.style } : {}),
        };
        continue;
      }
      if (
        record.included &&
        record.path !==
          `fonts/private/${record.id}.${record.fileName?.split(".").pop()?.toLowerCase()}`
      )
        throw new Error("The private font path is invalid.");
      const upload = await validateUpload(
        record,
        record.path ? files[record.path] : undefined,
      );
      settings.fontDependencies ??= {};
      settings.fontDependencies[record.id] = {
        name: record.name,
        fileName: record.fileName,
        weight: record.weight,
        style: record.style,
      };
      if (upload) uploads.push(upload);
    }
  }
  return { settings: validateSettings(settings), uploads };
}
