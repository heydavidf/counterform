import inventory from "./font-features.json";
import { fonts } from "./catalog";
import type { RoleSettings } from "./model";

// Extracted from the GSUB/GPOS tables of the bundled files, September 2026.
// Private files have no verified feature inventory; never synthesize small caps.
export function supportsFeature(role: RoleSettings, tag: string): boolean {
  const family = fonts.find((font) => font.id === role.fontId);
  if (!family) return false;
  const face = family.files.find((file) => {
    const weights = file.weight.split(" ").map(Number);
    return (
      file.style === role.style &&
      role.weight >= weights[0] &&
      role.weight <= weights[weights.length - 1]
    );
  });
  if (!face) return false;
  const key = face.path
    .split("/")
    .pop()!
    .replace(/\.ttf$/, "");
  return (
    (inventory as Record<string, Record<string, string[]>>)[role.fontId]?.[
      key
    ]?.includes(tag) ?? false
  );
}
