import type { Settings } from "./model";

export type ComparisonStudy = {
  reference: Omit<Settings, "comparison">;
  intent: string;
};

export type SettingsDifference = {
  path: string;
  label: string;
  before: string;
  after: string;
};

export function withoutComparison(
  settings: Settings,
): Omit<Settings, "comparison"> {
  const next = structuredClone(settings);
  delete next.comparison;
  return next;
}

export function startComparison(settings: Settings): Settings {
  const current = withoutComparison(settings);
  return {
    ...structuredClone(current),
    comparison: { reference: structuredClone(current), intent: "" },
  };
}

export function clearComparison(settings: Settings): Settings {
  return withoutComparison(settings) as Settings;
}

const ignored = new Set([
  "schemaVersion",
  "name",
  "fontDependencies",
  "comparison",
]);

function comparable(settings: Settings): Record<string, unknown> {
  const source = withoutComparison(settings) as Settings;
  const result = structuredClone(source) as unknown as Record<string, unknown>;
  ignored.forEach((key) => delete result[key]);
  result.surface = source.surface ?? { mode: "web" };
  const layout = result.layout as
    { blocks?: Array<Record<string, unknown>> } | undefined;
  if (layout?.blocks) {
    const blocks: Record<string, unknown> = {};
    for (const block of layout.blocks) {
      const id = String(block.id);
      blocks[id] = block;
    }
    layout.blocks = undefined;
    (layout as Record<string, unknown>).blocksById = blocks;
    (layout as Record<string, unknown>).readingOrder =
      source.layout?.blocks.map((block) => block.id) ?? [];
  }
  return result;
}

function flatten(
  value: unknown,
  prefix = "",
  output = new Map<string, unknown>(),
) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      flatten(item, `${prefix}[${index}]`, output),
    );
  } else if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    // Empty records carry no setting value. Recording the independently cloned
    // object itself would make two unchanged axis maps differ by identity.
    entries.forEach(([key, item]) =>
      flatten(item, prefix ? `${prefix}.${key}` : key, output),
    );
  } else if (prefix) output.set(prefix, value);
  return output;
}

const pageGridWords: Record<string, string> = {
  mode: "mode",
  inside: "inside margin",
  outside: "outside margin",
  top: "top margin",
  bottom: "bottom margin",
  gap: "column gap",
};

const words = (value: string) => {
  const pageGrid = value.match(/^layout\.pageGrid\.(\w+)(?:\[(\d+)\])?/);
  if (pageGrid) {
    const [, key, index] = pageGrid;
    return index === undefined
      ? `Page grid · ${pageGridWords[key] ?? key}`
      : `Page grid · ${key} page column ${Number(index) + 1}`;
  }
  return value
    .replace(/blocksById\.([^.]+)/, "block $1")
    .replace(/\[(\d+)\]/g, " $1")
    .split(".")
    .map((part) => part.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " "))
    .join(" · ");
};

const display = (value: unknown) => {
  if (value === undefined) return "Not set";
  if (value === null) return "None";
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (typeof value === "string") return value || "Empty";
  return JSON.stringify(value);
};

export function settingsDifferences(
  reference: Settings,
  current: Settings,
): SettingsDifference[] {
  const beforeValue = comparable(reference);
  const afterValue = comparable(current);
  const before = flatten(beforeValue);
  const after = flatten(afterValue);
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort();
  const beforeBlocks = ((
    beforeValue.layout as Record<string, unknown> | undefined
  )?.blocksById ?? {}) as Record<string, unknown>;
  const afterBlocks = ((
    afterValue.layout as Record<string, unknown> | undefined
  )?.blocksById ?? {}) as Record<string, unknown>;
  const blockChanges: SettingsDifference[] = [];
  for (const id of [
    ...new Set([...Object.keys(beforeBlocks), ...Object.keys(afterBlocks)]),
  ].sort()) {
    if (!(id in beforeBlocks))
      blockChanges.push({
        path: `layout.blocksById.${id}`,
        label: `Block ${id}`,
        before: "Not present",
        after: "Added",
      });
    else if (!(id in afterBlocks))
      blockChanges.push({
        path: `layout.blocksById.${id}`,
        label: `Block ${id}`,
        before: "Present",
        after: "Removed",
      });
  }
  const beforeOrder = (
    beforeValue.layout as Record<string, unknown> | undefined
  )?.readingOrder;
  const afterOrder = (afterValue.layout as Record<string, unknown> | undefined)
    ?.readingOrder;
  const orderChanged =
    JSON.stringify(beforeOrder) !== JSON.stringify(afterOrder);
  const leafChanges = paths
    .filter((path) => {
      if (path.startsWith("layout.readingOrder")) return false;
      const blockMatch = path.match(/^layout\.blocksById\.([^.]+)/);
      if (
        blockMatch &&
        (!(blockMatch[1] in beforeBlocks) || !(blockMatch[1] in afterBlocks))
      )
        return false;
      return !Object.is(before.get(path), after.get(path));
    })
    .map((path) => ({
      path,
      label: words(path),
      before: display(before.get(path)),
      after: display(after.get(path)),
    }));
  if (orderChanged)
    leafChanges.push({
      path: "layout.readingOrder",
      label: "Layout · reading order",
      before: display(beforeOrder),
      after: display(afterOrder),
    });
  return [...blockChanges, ...leafChanges];
}
