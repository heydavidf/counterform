import type { Settings } from "./model";
import { surfaceGeometry } from "./surface";

// Composition guidance, not a binding or press-production guarantee.
export const PRINT_FOLD_CLEARANCE = 24;
const measurementTolerance = 0.5;

export type PrintBlockBounds = {
  id: string;
  left: number;
  right: number;
  text: string;
};

export function printReadingWarnings(
  settings: Settings,
  bounds: PrintBlockBounds[],
): string[] {
  if (settings.surface?.mode !== "print" || !settings.layout) return [];
  const warnings: string[] = [];
  if (
    settings.content.body.trim() &&
    !settings.layout.blocks.some((block) => block.contentKey === "body")
  ) {
    warnings.push(
      "Body is retained but not shown in this layout. Apply Editorial facing to include it, or add a Body block in Grid.",
    );
  }
  if (settings.surface.pages !== "facing") return warnings;
  const fold = surfaceGeometry(settings).pageWidth;
  for (const block of settings.layout.blocks) {
    if (!["body", "deck", "caption"].includes(block.type)) continue;
    const box = bounds.find((item) => item.id === block.id);
    if (
      box?.text.trim() &&
      box.left < fold + PRINT_FOLD_CLEARANCE - measurementTolerance &&
      box.right > fold - PRINT_FOLD_CLEARANCE + measurementTolerance
    ) {
      warnings.push(
        `${block.label}: reading text is too close to or crosses the fold. Move this block onto one page with at least 24 CSS px (18 pt) of clearance, or apply Editorial facing. This is composition guidance; confirm binding needs separately.`,
      );
    }
  }
  return warnings;
}
