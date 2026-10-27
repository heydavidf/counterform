import { fonts, pairings } from "./catalog";
import { validateLayout, type LayoutSystem } from "./layout";
import { validateSurface, type SurfaceSettings } from "./surface";
import type { ComparisonStudy } from "./comparison";

export type Role = "display" | "body" | "support";
export type Composition = "editorial" | "product" | "poster";
export type RoleSettings = {
  fontId: string;
  size: number;
  weight: number;
  style: "normal" | "italic";
  leading: number;
  tracking: number;
  axes: Record<string, number>;
};
export type Palette = {
  name: string;
  background: string;
  ink: string;
  muted: string;
  accent: string;
  panel: string;
};
export type Settings = {
  schemaVersion: 1;
  layout?: LayoutSystem;
  surface?: SurfaceSettings;
  comparison?: ComparisonStudy;
  name: string;
  composition: Composition;
  roles: Record<Role, RoleSettings>;
  fontDependencies?: Record<
    string,
    {
      name: string;
      fileName?: string;
      weight?: string;
      style?: "normal" | "italic";
    }
  >;
  grid: {
    columns: number;
    gutter: number;
    margin: number;
    baseline: number;
    modules: number;
    layout: "balanced" | "asymmetric" | "compact";
  };
  palette: Palette;
  measure: number;
  width: number;
  content: {
    title: string;
    deck: string;
    body: string;
    quote: string;
    caption: string;
  };
};
export type UploadedFont = {
  id: string;
  name: string;
  fileName: string;
  hash: string;
  bytes: ArrayBuffer;
  weight: string;
  style: "normal" | "italic";
};
export type SavedExperiment = {
  id: string;
  updatedAt: string;
  settings: Settings;
};
export const roleNames: Record<Role, string> = {
  display: "Display",
  body: "Reading",
  support: "Supporting",
};
export const palettes: Palette[] = [
  {
    name: "Ink & vermilion",
    background: "#f4f0e8",
    ink: "#242a25",
    muted: "#62655b",
    accent: "#b33f27",
    panel: "#e6e3d8",
  },
  {
    name: "Cobalt paper",
    background: "#e9edf3",
    ink: "#182a50",
    muted: "#4d5c74",
    accent: "#214bbc",
    panel: "#d4ddeb",
  },
  {
    name: "Mulberry night",
    background: "#2f2030",
    ink: "#f3eadf",
    muted: "#c6b7c6",
    accent: "#efbd89",
    panel: "#473147",
  },
  {
    name: "Moss & citron",
    background: "#e5e9d2",
    ink: "#283e2a",
    muted: "#526245",
    accent: "#485717",
    panel: "#d5dcaa",
  },
  {
    name: "Persimmon",
    background: "#c84b2c",
    ink: "#211b17",
    muted: "#302018",
    accent: "#fff0d5",
    panel: "#f0a170",
  },
  {
    name: "Black & butter",
    background: "#202421",
    ink: "#f4e9b8",
    muted: "#c1c5b5",
    accent: "#e8bf51",
    panel: "#343b32",
  },
];
export function defaultSettings(): Settings {
  const pairing = pairings[0];
  return {
    schemaVersion: 1,
    name: "An exercise in attention",
    composition: "editorial",
    roles: {
      display: {
        fontId: pairing.display,
        size: 78,
        weight: 400,
        style: "normal",
        leading: 1.02,
        tracking: -0.035,
        axes: {},
      },
      body: {
        fontId: pairing.body,
        size: 18,
        weight: 400,
        style: "normal",
        leading: 1.65,
        tracking: 0,
        axes: {},
      },
      support: {
        fontId: pairing.support,
        size: 11,
        weight: 500,
        style: "normal",
        leading: 1.5,
        tracking: 0.06,
        axes: {},
      },
    },
    grid: {
      columns: 12,
      gutter: 24,
      margin: 58,
      baseline: 8,
      modules: 4,
      layout: "asymmetric",
    },
    palette: { ...palettes[0] },
    measure: 62,
    width: 1040,
    content: {
      title: "The shape\nof the quiet.",
      deck: "A study in type, space and the things we leave unsaid.",
      body: "A page begins before the first word. There is the edge of the paper, the space above a heading, the small interval between one thought and the next. These are not empty places. They are part of what we read.\n\nGood typography gives attention somewhere to settle. A familiar letter becomes expressive through its neighbours; a line finds its rhythm through the space around it. Change one relationship and the whole composition begins to shift.\n\nThe grid is a useful promise, not a final answer. It gives different elements a common ground, then leaves room for a voice to emerge. A generous margin, an unexpected pause, a heading that reaches across a column: structure makes these choices legible.",
      quote: "Space is not what remains. It is what makes the rest possible.",
      caption:
        "Notes on looking closely. An original specimen for Counterform.",
    },
  };
}
export function fontName(
  id: string,
  uploads: UploadedFont[] = [],
  dependencies: Settings["fontDependencies"] = {},
) {
  return (
    fonts.find((f) => f.id === id)?.name ??
    uploads.find((f) => f.id === id)?.name ??
    dependencies?.[id]?.name ??
    "Missing private font"
  );
}
export function familyAlias(id: string) {
  return "cf-" + id.replace(/[^a-zA-Z0-9_-]/g, "");
}
export function applyPairing(s: Settings, id: string): Settings {
  const p = pairings.find((p) => p.id === id);
  if (!p) return s;
  const next = structuredClone(s);
  (["display", "body", "support"] as Role[]).forEach((role) => {
    next.roles[role] = {
      ...next.roles[role],
      fontId: p[role],
      weight: 400,
      style: "normal",
      axes: {},
    };
  });
  return next;
}
export function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const values = hex
      .replace("#", "")
      .match(/.{2}/g)!
      .map((v) => parseInt(v, 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function validateSettings(value: unknown): Settings {
  return validateSettingsAtDepth(value, 0);
}

function validateSettingsAtDepth(value: unknown, depth: number): Settings {
  const s = value as Settings;
  const fail = () => {
    throw new Error(
      "This is not a supported Counterform settings file. Your current work is unchanged.",
    );
  };
  const number = (n: unknown, min: number, max: number) =>
    typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
  const text = (x: unknown, max = 20000) =>
    typeof x === "string" && x.length <= max;
  if (
    !s ||
    s.schemaVersion !== 1 ||
    !text(s.name, 120) ||
    !["editorial", "product", "poster"].includes(s.composition)
  )
    fail();
  if (!s.roles || !s.grid || !s.palette || !s.content) fail();
  for (const role of ["display", "body", "support"] as Role[]) {
    const r = s.roles[role];
    if (
      !r ||
      !text(r.fontId, 160) ||
      !/^[a-zA-Z0-9_-]+$/.test(r.fontId) ||
      !number(r.size, 8, 200) ||
      !number(r.weight, 100, 1000) ||
      !["normal", "italic"].includes(r.style) ||
      !number(r.leading, 0.8, 3) ||
      !number(r.tracking, -0.1, 0.3) ||
      !r.axes ||
      typeof r.axes !== "object" ||
      Array.isArray(r.axes)
    )
      fail();
    if (
      Object.entries(r.axes).some(
        ([k, v]) => !/^[a-zA-Z0-9]{4}$/.test(k) || !number(v, -10000, 10000),
      )
    )
      fail();
  }
  for (const key of ["background", "ink", "muted", "accent", "panel"] as const)
    if (!/^#[a-fA-F0-9]{6}$/.test(s.palette[key])) fail();
  if (
    !text(s.palette.name, 120) ||
    !number(s.measure, 20, 100) ||
    !number(s.width, 320, 1600)
  )
    fail();
  const g = s.grid;
  if (
    !number(g.columns, 1, 16) ||
    !Number.isInteger(g.columns) ||
    !number(g.gutter, 0, 64) ||
    !number(g.margin, 12, 120) ||
    !number(g.baseline, 4, 32) ||
    !number(g.modules, 2, 12) ||
    !Number.isInteger(g.modules) ||
    !["balanced", "asymmetric", "compact"].includes(g.layout)
  )
    fail();
  for (const key of ["title", "deck", "body", "quote", "caption"] as const)
    if (!text(s.content[key])) fail();
  if (s.fontDependencies !== undefined) {
    if (
      !s.fontDependencies ||
      typeof s.fontDependencies !== "object" ||
      Array.isArray(s.fontDependencies) ||
      Object.keys(s.fontDependencies).length > 64
    )
      fail();
    for (const [id, dependency] of Object.entries(s.fontDependencies)) {
      if (
        !/^[a-zA-Z0-9_-]{1,160}$/.test(id) ||
        ["__proto__", "constructor", "prototype"].includes(id) ||
        !dependency ||
        typeof dependency !== "object" ||
        Array.isArray(dependency) ||
        !text(dependency.name, 240)
      )
        fail();
      if (
        dependency.fileName !== undefined &&
        (!text(dependency.fileName, 255) ||
          !/\.(ttf|otf|woff2?)$/i.test(dependency.fileName))
      )
        fail();
      if (
        dependency.style !== undefined &&
        !["normal", "italic"].includes(dependency.style)
      )
        fail();
      if (dependency.weight !== undefined) {
        if (
          typeof dependency.weight !== "string" ||
          !/^\d{3,4}( \d{3,4})?$/.test(dependency.weight)
        )
          fail();
        const weights = dependency.weight.split(" ").map(Number);
        if (
          weights.some((n) => n < 100 || n > 1000) ||
          (weights.length === 2 && weights[0] > weights[1])
        )
          fail();
      }
    }
  }
  if (s.layout !== undefined) validateLayout(s.layout);
  if (s.surface !== undefined) validateSurface(s.surface);
  if (s.comparison !== undefined) {
    const comparison = s.comparison as ComparisonStudy;
    if (
      depth > 0 ||
      !comparison ||
      typeof comparison !== "object" ||
      Array.isArray(comparison) ||
      typeof comparison.intent !== "string" ||
      comparison.intent.length > 1000 ||
      !comparison.reference ||
      typeof comparison.reference !== "object" ||
      Array.isArray(comparison.reference) ||
      "comparison" in comparison.reference
    )
      fail();
    validateSettingsAtDepth(comparison.reference, depth + 1);
  }
  return structuredClone(s);
}
