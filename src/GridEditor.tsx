import {
  useEffect,
  useId,
  useState,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  Link,
  Link2Off,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { supportsFeature } from "./font-features";
import {
  applyRecipe,
  defaultLayout,
  effectiveLayout,
  effectiveRowCount,
  effectivePlacement,
  layoutRecipes,
  type BlockType,
  type GridFamily,
  type LayoutBlock,
  type LayoutMargins,
  type LayoutSystem,
  type LayoutTrack,
  type LayoutVariant,
  type Placement,
} from "./layout";
import type { Settings } from "./model";
import {
  setPageGrid,
  surfaceGeometry,
  surfaceOf,
  surfaceTemplates,
} from "./surface";
import {
  PAGE_GRID_MAX_COLUMNS,
  PageGridError,
  defaultPageGrid,
  pageGridModes,
  type PageGrid,
} from "./page-grid";
import "./grid-editor.css";

export type GridEditorProps = {
  settings: Settings;
  onChange: (next: Settings) => void;
  selectedBlock: string | null;
  onSelectBlock: (id: string | null) => void;
};

const variants: { id: LayoutVariant; label: string; width: number }[] = [
  { id: "wide", label: "Wide", width: 1040 },
  { id: "medium", label: "Medium", width: 768 },
  { id: "narrow", label: "Narrow", width: 390 },
];
const families: { id: GridFamily; label: string; note: string }[] = [
  {
    id: "manuscript",
    label: "Manuscript",
    note: "One sustained reading field",
  },
  { id: "column", label: "Column", note: "Parallel vertical streams" },
  { id: "modular", label: "Modular", note: "Columns crossed by fixed bands" },
  {
    id: "hierarchical",
    label: "Hierarchical",
    note: "Unequal zones express priority",
  },
];
const blockTypes: BlockType[] = [
  "title",
  "deck",
  "body",
  "quote",
  "caption",
  "letter",
  "rule",
  "panel",
  "marker",
];
const sharedContentTypes = [
  "title",
  "deck",
  "body",
  "quote",
  "caption",
] as const;
type SharedContentKey = (typeof sharedContentTypes)[number];
const recipeNames: Record<string, string> = {
  "book-page": "Book page",
  "marginal-essay": "Marginal essay",
  "asymmetric-editorial": "Asymmetric editorial",
  "modular-specimen": "Modular specimen",
  "hierarchical-interface": "Hierarchical interface",
  "typographic-poster": "Typographic poster",
};

const clone = <T,>(value: T): T => structuredClone(value);
const bound = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const capitalise = (value: string) => value[0].toUpperCase() + value.slice(1);
const tracks = (count: number, weights?: number[]): LayoutTrack[] =>
  Array.from({ length: count }, (_, index) => ({
    weight: weights?.[index] ?? 1,
  }));

function NumericField({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onCommit,
  compact = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onCommit: (value: number) => void;
  compact?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  const cancelled = useRef(false);
  useEffect(() => setDraft(String(Number(value.toFixed(3)))), [value]);
  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      setDraft(String(value));
      return;
    }
    const parsed = Number(draft);
    if (draft.trim() && Number.isFinite(parsed)) {
      const next = bound(parsed, min, max);
      onCommit(next);
      setDraft(String(next));
    } else {
      setDraft(String(value));
    }
  };
  return (
    <label
      className={`ge-number ${compact ? "ge-number--compact" : ""}`}
      htmlFor={id}
    >
      <span>{label}</span>
      <span className="ge-number__input">
        <input
          id={id}
          type="number"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              cancelled.current = true;
              setDraft(String(value));
              event.currentTarget.blur();
            }
          }}
        />
        {unit && <small>{unit}</small>}
      </span>
    </label>
  );
}

function Section({
  title,
  note,
  open = false,
  children,
}: {
  title: string;
  note?: string;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="ge-section" open={open}>
      <summary>
        <span>{title}</span>
        {note && <small>{note}</small>}
      </summary>
      <div className="ge-section__body">{children}</div>
    </details>
  );
}

function PageGridSection({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (settings: Settings) => void;
}) {
  const grid = settings.layout!.pageGrid;
  const [error, setError] = useState<string | null>(null);
  const commit = (next: PageGrid | null) => {
    try {
      onChange(setPageGrid(settings, next));
      setError(null);
    } catch (problem) {
      if (!(problem instanceof PageGridError)) throw problem;
      setError(problem.message);
    }
  };
  const update = (change: (next: PageGrid) => void) => {
    const next = clone(grid!);
    change(next);
    commit(next);
  };
  const mode = grid && pageGridModes.find((item) => item.id === grid.mode)!;
  const weights = (side: "left" | "right") => (
    <div
      className="ge-track-editor"
      aria-label={`${capitalise(side)} page column weights`}
    >
      {grid![side]!.map((track, index) => (
        <NumericField
          key={index}
          compact
          label={`${side === "left" ? "L" : "R"}${index + 1}`}
          value={track.weight}
          min={0.1}
          max={12}
          step={0.05}
          onCommit={(value) =>
            update((next) => {
              next[side]![index].weight = value;
            })
          }
        />
      ))}
    </div>
  );
  return (
    <Section title="Page grid" note={mode ? mode.label : "Off"} open>
      <p className="ge-page-grid-note">
        Design one page and Counterform builds the spread. The fold becomes part
        of the grid.
      </p>
      <div className="ge-segmented" role="group" aria-label="Facing grid">
        <button
          type="button"
          className={grid ? "" : "ge-is-selected"}
          aria-pressed={!grid}
          onClick={() => grid && commit(null)}
        >
          Spread grid
        </button>
        <button
          type="button"
          className={grid ? "ge-is-selected" : ""}
          aria-pressed={!!grid}
          onClick={() => !grid && commit(defaultPageGrid(settings.layout!))}
        >
          Page grid
        </button>
      </div>
      {grid && mode && (
        <>
          <div
            className="ge-segmented"
            role="group"
            aria-label="Page grid mode"
          >
            {pageGridModes.map((item) => (
              <button
                key={item.id}
                type="button"
                title={item.note}
                className={grid.mode === item.id ? "ge-is-selected" : ""}
                aria-pressed={grid.mode === item.id}
                onClick={() =>
                  update((next) => {
                    next.mode = item.id;
                    if (item.id === "independent")
                      next.right ??= clone(next.left);
                    else delete next.right;
                  })
                }
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="ge-page-grid-note">{mode.note}</p>
          <div className="ge-field-grid">
            <NumericField
              label={grid.mode === "repeat" ? "Left margin" : "Outside margin"}
              value={grid.outside}
              min={0}
              max={240}
              unit="px"
              onCommit={(value) =>
                update((next) => void (next.outside = value))
              }
            />
            <NumericField
              label={grid.mode === "repeat" ? "Right margin" : "Inside margin"}
              value={grid.inside}
              min={0}
              max={240}
              unit="px"
              onCommit={(value) => update((next) => void (next.inside = value))}
            />
            <NumericField
              label="Top margin"
              value={grid.top}
              min={0}
              max={240}
              unit="px"
              onCommit={(value) => update((next) => void (next.top = value))}
            />
            <NumericField
              label="Bottom margin"
              value={grid.bottom}
              min={0}
              max={240}
              unit="px"
              onCommit={(value) => update((next) => void (next.bottom = value))}
            />
            <NumericField
              label="Page column gap"
              value={grid.gap}
              min={0}
              max={64}
              unit="px"
              onCommit={(value) => update((next) => void (next.gap = value))}
            />
            <NumericField
              label="Left page columns"
              value={grid.left.length}
              min={1}
              max={PAGE_GRID_MAX_COLUMNS}
              onCommit={(value) =>
                update((next) => {
                  next.left = tracks(
                    Math.round(value),
                    next.left.map((track) => track.weight),
                  );
                })
              }
            />
            {grid.mode === "independent" && (
              <NumericField
                label="Right page columns"
                value={grid.right!.length}
                min={1}
                max={PAGE_GRID_MAX_COLUMNS}
                onCommit={(value) =>
                  update((next) => {
                    next.right = tracks(
                      Math.round(value),
                      next.right!.map((track) => track.weight),
                    );
                  })
                }
              />
            )}
          </div>
          {weights("left")}
          {grid.mode === "independent" && weights("right")}
          {error && (
            <p className="ge-page-grid-error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </Section>
  );
}

function RecipeThumbnail({ recipe }: { recipe: LayoutSystem }) {
  const maxRows = Math.max(1, recipe.rows.tracks.length);
  return (
    <svg className="ge-recipe-art" viewBox="0 0 132 92" aria-hidden="true">
      <rect
        className="ge-recipe-paper"
        x="10"
        y="6"
        width="112"
        height="80"
        rx="1"
      />
      <g transform="translate(20 14)">
        {recipe.columns.tracks.map((track, index) => {
          const total = recipe.columns.tracks.reduce(
            (sum, item) => sum + item.weight,
            0,
          );
          const before = recipe.columns.tracks
            .slice(0, index)
            .reduce((sum, item) => sum + item.weight, 0);
          const gap = Math.min(3, 24 / recipe.columns.tracks.length);
          const usable = 92 - gap * (recipe.columns.tracks.length - 1);
          const x = (before / total) * usable + gap * index;
          const width = (track.weight / total) * usable;
          return (
            <rect
              key={index}
              className="ge-recipe-track"
              x={x}
              y="0"
              width={Math.max(1, width)}
              height="64"
            />
          );
        })}
        {recipe.blocks.slice(0, 8).map((block, index) => {
          const p = block.placement.wide;
          const x = ((p.column - 1) / recipe.columns.tracks.length) * 92;
          const width = (p.span / recipe.columns.tracks.length) * 92 - 1;
          const y = ((p.row - 1) / maxRows) * 64;
          const height = Math.max(3, (p.rowSpan / maxRows) * 64 - 1);
          return (
            <rect
              key={block.id + index}
              className={`ge-recipe-zone ge-recipe-zone--${index % 3}`}
              x={x}
              y={y}
              width={Math.max(2, width)}
              height={height}
              rx="0.7"
            />
          );
        })}
      </g>
    </svg>
  );
}

function clampPlacement(
  place: Placement,
  columnCount: number,
  rowCount: number,
): Placement {
  const column = bound(Math.round(place.column), 1, columnCount);
  const row = bound(Math.round(place.row), 1, rowCount);
  return {
    ...place,
    column,
    row,
    span: bound(Math.round(place.span), 1, columnCount - column + 1),
    rowSpan: bound(Math.round(place.rowSpan), 1, rowCount - row + 1),
  };
}

function normaliseVariantPlacements(
  layout: LayoutSystem,
  variant: LayoutVariant,
) {
  const geometry = effectiveLayout(layout, variant);
  for (const block of layout.blocks) {
    if (variant === "wide") {
      block.placement.wide = clampPlacement(
        block.placement.wide,
        geometry.columns.tracks.length,
        layout.rows.tracks.length,
      );
    } else if (block.placement[variant]) {
      block.placement[variant] = clampPlacement(
        block.placement[variant]!,
        geometry.columns.tracks.length,
        64,
      );
    }
  }
}

function setFamily(layout: LayoutSystem, family: GridFamily) {
  delete layout.pageGrid;
  const ids: Record<GridFamily, string> = {
    manuscript: "book-page",
    column: "asymmetric-editorial",
    modular: "modular-specimen",
    hierarchical: "hierarchical-interface",
  };
  const recipe = layoutRecipes.find((r) => r.recipeId === ids[family])!;
  layout.family = family;
  layout.columns = clone(recipe.columns);
  layout.rows = clone(recipe.rows);
  layout.format = clone(recipe.format);
  for (const variant of ["medium", "narrow"] as const) {
    layout.variants[variant] ??= {};
    layout.variants[variant]!.columns = clone(
      recipe.variants[variant]!.columns!,
    );
  }
  const used = new Set<BlockType>();
  let lastRow = layout.rows.tracks.length;
  for (const block of layout.blocks) {
    const template =
      !used.has(block.type) && recipe.blocks.find((b) => b.type === block.type);
    if (template) {
      block.placement = clone(template.placement);
      used.add(block.type);
    } else {
      lastRow++;
      block.placement = {
        wide: {
          column: 1,
          span: layout.columns.tracks.length,
          row: lastRow,
          rowSpan: 1,
          align: "start",
        },
        medium: {
          column: 1,
          span: layout.variants.medium!.columns!.tracks.length,
          row: lastRow,
          rowSpan: 1,
          align: "start",
        },
      };
    }
  }
  while (layout.rows.tracks.length < lastRow)
    layout.rows.tracks.push({ weight: 1 });
  layout.blocks.forEach((block, index) => {
    block.placement.narrow = {
      column: 1,
      span: 1,
      row: index + 1,
      rowSpan: 1,
      align: "start",
    };
  });
}

function LayoutMap({
  layout,
  variant,
  selectedBlock,
  onSelectBlock,
}: {
  layout: LayoutSystem;
  variant: LayoutVariant;
  selectedBlock: string | null;
  onSelectBlock: (id: string | null) => void;
}) {
  const geometry = effectiveLayout(layout, variant);
  const totalColumns = geometry.columns.tracks.reduce(
    (sum, track) => sum + track.weight,
    0,
  );
  const mapRows = Array.from(
    { length: effectiveRowCount(layout, variant) },
    (_, i) => layout.rows.tracks[i] ?? { weight: 1 },
  );
  const totalRows = mapRows.reduce((sum, track) => sum + track.weight, 0);
  const width = variants.find((item) => item.id === variant)!.width;
  const pad = {
    paddingTop: `${bound((geometry.margins.top / width) * 100, 3, 20)}%`,
    paddingRight: `${bound((geometry.margins.right / width) * 100, 3, 20)}%`,
    paddingBottom: `${bound((geometry.margins.bottom / width) * 100, 3, 20)}%`,
    paddingLeft: `${bound((geometry.margins.left / width) * 100, 3, 20)}%`,
  };
  const mapStyle = {
    gridTemplateColumns: geometry.columns.tracks
      .map((track) => `${track.weight}fr`)
      .join(" "),
    gridTemplateRows: mapRows.map((track) => `${track.weight}fr`).join(" "),
    columnGap: `${Math.max(2, Math.min(8, geometry.columns.gap / 5))}px`,
    rowGap: `${Math.max(2, Math.min(8, geometry.rowGap / 5))}px`,
  } as CSSProperties;
  return (
    <div className="ge-map-wrap">
      <div className="ge-map-title">
        <span>Layout anatomy · schematic</span>
        <small>
          {geometry.columns.tracks.length} columns · {mapRows.length} rows
        </small>
      </div>
      <div className="ge-map" style={pad}>
        <span className="ge-map-label ge-map-label--format">format</span>
        <span className="ge-map-label ge-map-label--margin">margins</span>
        <div className="ge-map__text-area" style={mapStyle}>
          <span className="ge-map-label ge-map-label--area">
            text area / zones
          </span>
          <div
            className="ge-map__columns"
            aria-hidden="true"
            style={{
              gridTemplateColumns: geometry.columns.tracks
                .map((track) => `${track.weight}fr`)
                .join(" "),
            }}
          >
            {geometry.columns.tracks.map((track, index) => (
              <span
                key={index}
                title={`Column ${index + 1}, weight ${track.weight}`}
              >
                {index + 1}
              </span>
            ))}
          </div>
          <div
            className="ge-map__rows"
            aria-hidden="true"
            style={{
              gridTemplateRows: mapRows
                .map((track) => `${track.weight}fr`)
                .join(" "),
            }}
          >
            {mapRows.map((_, index) => (
              <span key={index}>{index + 1}</span>
            ))}
          </div>
          {layout.blocks.map((block, index) => {
            const placement = clampPlacement(
              effectivePlacement(block, variant, layout),
              geometry.columns.tracks.length,
              mapRows.length,
            );
            return (
              <button
                key={block.id}
                type="button"
                className={`ge-map__block ge-map__block--${index % 4} ${selectedBlock === block.id ? "ge-is-selected" : ""}`}
                style={{
                  gridColumn: `${placement.column} / span ${placement.span}`,
                  gridRow: `${placement.row} / span ${placement.rowSpan}`,
                  alignSelf:
                    placement.align === "stretch" ? "stretch" : placement.align,
                }}
                aria-pressed={selectedBlock === block.id}
                aria-label={`Select ${block.label}, columns ${placement.column} to ${placement.column + placement.span - 1}, rows ${placement.row} to ${placement.row + placement.rowSpan - 1}`}
                onClick={() =>
                  onSelectBlock(selectedBlock === block.id ? null : block.id)
                }
              >
                <span>{block.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="ge-map-key" aria-hidden="true">
        <span>
          <i /> Column tracks ({Number(totalColumns.toFixed(2))}fr)
        </span>
        <span>
          <i /> Flowlines / rows ({Number(totalRows.toFixed(2))}fr)
        </span>
        <span>
          <i /> Content zones
        </span>
      </div>
    </div>
  );
}

export function GridEditor({
  settings,
  onChange,
  selectedBlock,
  onSelectBlock,
}: GridEditorProps) {
  const initialVariant =
    variants.find((item) => item.width === settings.width)?.id ??
    (settings.width <= 600
      ? "narrow"
      : settings.width <= 900
        ? "medium"
        : "wide");
  const [selectedVariant, setVariant] = useState<LayoutVariant>(initialVariant);
  const suggested = defaultLayout(settings).recipeId;
  const [chosenRecipe, setChosenRecipe] = useState(
    layoutRecipes.some(
      (recipe) => recipe.recipeId === settings.layout?.recipeId,
    )
      ? settings.layout!.recipeId
      : suggested,
  );
  const [addType, setAddType] = useState<BlockType>("body");
  const layout = settings.layout;
  const surface = surfaceOf(settings);
  const fixedSurface = surface.mode !== "web";
  const facing = surface.mode === "print" && surface.pages === "facing";
  const variant: LayoutVariant = fixedSurface ? "wide" : selectedVariant;
  useEffect(() => {
    setVariant(
      settings.width <= 600
        ? "narrow"
        : settings.width <= 900
          ? "medium"
          : "wide",
    );
  }, [settings.width]);

  const updateLayout = (
    change: (next: LayoutSystem, nextSettings: Settings) => void,
  ) => {
    if (!settings.layout) return;
    const nextSettings = clone(settings);
    const nextLayout = clone(settings.layout);
    change(nextLayout, nextSettings);
    nextSettings.layout = nextLayout;
    onChange(nextSettings);
  };
  const activateRecipe = () => {
    const next = applyRecipe(settings, chosenRecipe);
    onChange(next);
    onSelectBlock(next.layout.blocks[0]?.id ?? null);
  };

  const recipePicker = (
    <section className="ge-recipes" aria-labelledby="ge-recipes-title">
      <div className="ge-heading-row">
        <div>
          <h3 id="ge-recipes-title">Choose a composition</h3>
          <p>Recipes use your shared study copy, fonts and colours.</p>
        </div>
        {layout && (
          <span className="ge-current-recipe">
            Current:{" "}
            {recipeNames[layout.recipeId] ??
              surfaceTemplates.find(
                (template) => template.id === layout.recipeId,
              )?.name ??
              "Custom"}
          </span>
        )}
      </div>
      <div className="ge-recipe-grid">
        {layoutRecipes.map((recipe) => (
          <button
            type="button"
            key={recipe.recipeId}
            className={`ge-recipe ${chosenRecipe === recipe.recipeId ? "ge-is-selected" : ""}`}
            aria-pressed={chosenRecipe === recipe.recipeId}
            onClick={() => setChosenRecipe(recipe.recipeId)}
          >
            <RecipeThumbnail recipe={recipe} />
            <span>{recipeNames[recipe.recipeId]}</span>
            <small>
              {capitalise(recipe.family)} · {recipe.columns.tracks.length} ×{" "}
              {recipe.rows.tracks.length}
            </small>
          </button>
        ))}
      </div>
      <button type="button" className="ge-activate" onClick={activateRecipe}>
        {layout ? "Apply selected recipe" : "Activate advanced grid"}
      </button>
      {layout && (
        <button
          type="button"
          className="ge-text-action"
          onClick={() => {
            const next = clone(settings);
            delete next.layout;
            onChange(next);
            onSelectBlock(null);
          }}
        >
          Use original specimen
        </button>
      )}
      {layout && (
        <p className="ge-destructive-note">
          Applying a recipe replaces blocks and geometry, including custom block
          content. Save your experiment first to keep another version.
        </p>
      )}
    </section>
  );

  if (!layout) {
    return (
      <div className="ge-editor">
        <div className="ge-legacy" role="status">
          <h2>Start with a grid</h2>
          <p>Choose a composition, then shape its margins, zones and rhythm.</p>
        </div>
        {recipePicker}
      </div>
    );
  }

  const geometry = effectiveLayout(layout, variant);
  const selected =
    layout.blocks.find((block) => block.id === selectedBlock) ?? null;
  const selectedPlacement = selected
    ? effectivePlacement(selected, variant, layout)
    : null;
  const variantOverride =
    variant === "wide" ? undefined : layout.variants[variant];
  const supportSmallCaps = supportsFeature(settings.roles.support, "smcp");
  const bodyOldstyle = supportsFeature(settings.roles.body, "onum");
  const bodyTabular = supportsFeature(settings.roles.body, "tnum");

  const updateVariantColumns = (
    change: (columns: { tracks: LayoutTrack[]; gap: number }) => void,
  ) => {
    updateLayout((next) => {
      // Editing tracks directly detaches them from a facing page grid.
      delete next.pageGrid;
      if (variant === "wide") change(next.columns);
      else {
        next.variants[variant] ??= {};
        next.variants[variant]!.columns ??= clone(
          effectiveLayout(next, variant).columns,
        );
        change(next.variants[variant]!.columns!);
      }
      normaliseVariantPlacements(next, variant);
      if (variant === "wide")
        for (const inherited of ["medium", "narrow"] as const) {
          if (!next.variants[inherited]?.columns)
            normaliseVariantPlacements(next, inherited);
        }
    });
  };
  const updateVariantMargins = (change: (margins: LayoutMargins) => void) => {
    updateLayout((next) => {
      delete next.pageGrid;
      if (variant === "wide") change(next.margins);
      else {
        next.variants[variant] ??= {};
        next.variants[variant]!.margins ??= clone(
          effectiveLayout(next, variant).margins,
        );
        change(next.variants[variant]!.margins!);
      }
    });
  };
  const updateRowGap = (value: number) => {
    updateLayout((next) => {
      if (variant === "wide") next.rows.gap = value;
      else {
        next.variants[variant] ??= {};
        next.variants[variant]!.rowGap = value;
      }
    });
  };
  const updatePlacement = (change: (place: Placement) => void) => {
    if (!selected) return;
    updateLayout((next) => {
      const block = next.blocks.find((item) => item.id === selected.id)!;
      let place: Placement;
      if (variant === "wide") place = block.placement.wide;
      else {
        block.placement[variant] ??= clone(
          effectivePlacement(block, variant, next),
        );
        place = block.placement[variant]!;
      }
      change(place);
      const nextGeometry = effectiveLayout(next, variant);
      const fixed = clampPlacement(
        place,
        nextGeometry.columns.tracks.length,
        variant === "wide" ? next.rows.tracks.length : 64,
      );
      if (variant === "wide") block.placement.wide = fixed;
      else block.placement[variant] = fixed;
    });
  };
  const changeCount = (kind: "columns" | "rows", count: number) => {
    if (kind === "columns") {
      updateVariantColumns((columns) => {
        const existing = columns.tracks.map((track) => track.weight);
        columns.tracks = tracks(count, existing);
      });
    } else {
      updateLayout((next) => {
        const existing = next.rows.tracks.map((track) => track.weight);
        const fitted = next.rows.tracks.map((track) => track.fit);
        next.rows.tracks = tracks(count, existing).map((track, index) =>
          fitted[index] ? { ...track, fit: true } : track,
        );
        (variants.map((item) => item.id) as LayoutVariant[]).forEach((item) =>
          normaliseVariantPlacements(next, item),
        );
      });
    }
  };
  const setAllMargins = (margins: LayoutMargins, value: number) => {
    margins.top = value;
    margins.right = value;
    margins.bottom = value;
    margins.left = value;
  };
  const setMargin = (
    side: keyof Omit<LayoutMargins, "linked">,
    value: number,
  ) => {
    updateVariantMargins((margins) => {
      if (margins.linked) setAllMargins(margins, value);
      else margins[side] = value;
    });
  };
  const resetVariant = () => {
    updateLayout((next) => {
      const recipe =
        layoutRecipes.find((item) => item.recipeId === next.recipeId) ??
        defaultLayout(settings);
      if (variant === "wide") {
        next.columns = clone(recipe.columns);
        next.margins = clone(recipe.margins);
        next.rows.gap = recipe.rows.gap;
        for (const block of next.blocks) {
          const source = recipe.blocks.find((item) => item.type === block.type);
          if (source) block.placement.wide = clone(source.placement.wide);
        }
      } else {
        next.variants[variant] = clone(recipe.variants[variant] ?? {});
        for (const block of next.blocks) {
          const source = recipe.blocks.find((item) => item.type === block.type);
          if (source?.placement[variant])
            block.placement[variant] = clone(source.placement[variant]);
          else delete block.placement[variant];
        }
      }
      normaliseVariantPlacements(next, variant);
      if (variant === "wide")
        for (const inherited of ["medium", "narrow"] as const) {
          if (!next.variants[inherited]?.columns)
            normaliseVariantPlacements(next, inherited);
        }
    });
  };
  const reorder = (index: number, direction: -1 | 1) => {
    updateLayout((next) => {
      const target = index + direction;
      if (target < 0 || target >= next.blocks.length) return;
      [next.blocks[index], next.blocks[target]] = [
        next.blocks[target],
        next.blocks[index],
      ];
      const narrowColumns = effectiveLayout(next, "narrow").columns.tracks
        .length;
      next.blocks.forEach((block, order) => {
        const inherited = effectivePlacement(block, "narrow", next);
        block.placement.narrow = {
          ...clampPlacement(inherited, narrowColumns, 64),
          column: 1,
          span: Math.max(1, narrowColumns),
          row: order + 1,
          rowSpan: 1,
        };
      });
    });
  };
  const addBlock = () => {
    if (layout.blocks.length >= 32) return;
    updateLayout((next) => {
      const baseId = addType;
      let suffix = 1;
      let id: string = baseId;
      while (next.blocks.some((block) => block.id === id))
        id = `${baseId}-${++suffix}`;
      const columnCount = effectiveLayout(next, variant).columns.tracks.length;
      const row =
        Math.max(
          ...next.blocks.map(
            (b) => b.placement.wide.row + b.placement.wide.rowSpan - 1,
          ),
          0,
        ) + 1;
      if (row > 64) return;
      while (next.rows.tracks.length < row)
        next.rows.tracks.push({ weight: 1 });
      const block: LayoutBlock = {
        id,
        type: addType,
        label: capitalise(addType),
        contentKey: sharedContentTypes.includes(addType as SharedContentKey)
          ? (addType as SharedContentKey)
          : undefined,
        content: sharedContentTypes.includes(addType as SharedContentKey)
          ? undefined
          : addType === "marker"
            ? "Counterform marker"
            : "",
        placement: {
          wide: {
            column: 1,
            span: Math.min(
              next.columns.tracks.length,
              addType === "rule"
                ? columnCount
                : Math.max(1, Math.ceil(columnCount / 2)),
            ),
            row,
            rowSpan: 1,
            align: "start",
          },
        },
      };
      for (const v of ["medium", "narrow"] as const) {
        const last = Math.max(
          0,
          ...next.blocks.map((b) => {
            const p = effectivePlacement(b, v, next);
            return p.row + p.rowSpan - 1;
          }),
        );
        block.placement[v] = {
          column: 1,
          span: effectiveLayout(next, v).columns.tracks.length,
          row: Math.min(64, last + 1),
          rowSpan: 1,
          align: "start",
        };
      }
      next.blocks.push(block);
      onSelectBlock(id);
    });
  };

  return (
    <div className="ge-editor">
      <h2 className="ge-editor-title">Type, on a grid.</h2>
      {recipePicker}

      <section className="ge-workflow" aria-labelledby="ge-geometry-title">
        <div className="ge-heading-row">
          <div>
            <h3 id="ge-geometry-title">Shape the geometry</h3>
            <p>
              Choose the canvas you are editing. Preview width follows this
              choice.
            </p>
          </div>
        </div>
        {fixedSurface ? (
          <div className="ge-fixed-format" role="status">
            <strong>Wide placement · {surfaceGeometry(settings).label}</strong>
            <span>
              Format controls set this canvas. Responsive overrides are hidden
              because fixed outputs never reflow.
            </span>
          </div>
        ) : (
          <div
            className="ge-variant-tabs"
            role="group"
            aria-label="Responsive layout"
          >
            {variants.map((item) => (
              <button
                key={item.id}
                type="button"
                className={variant === item.id ? "ge-is-selected" : ""}
                aria-pressed={variant === item.id}
                onClick={() => {
                  setVariant(item.id);
                  const next = clone(settings);
                  next.width = item.width;
                  onChange(next);
                }}
              >
                <span>{item.label}</span>
                <small>{item.width}px</small>
              </button>
            ))}
          </div>
        )}
        {!fixedSurface && (
          <div className="ge-override-bar">
            <span>
              {variant === "wide"
                ? "Base geometry"
                : variantOverride
                  ? "Custom override"
                  : "Inheriting base geometry"}
            </span>
            <button type="button" onClick={resetVariant}>
              <RotateCcw size={14} /> Reset {variant}
            </button>
            {variant !== "wide" && variantOverride && (
              <button
                type="button"
                onClick={() =>
                  updateLayout((next) => {
                    delete next.variants[variant];
                    next.blocks.forEach(
                      (block) => delete block.placement[variant],
                    );
                  })
                }
              >
                Clear all overrides
              </button>
            )}
          </div>
        )}

        <LayoutMap
          layout={layout}
          variant={variant}
          selectedBlock={selectedBlock}
          onSelectBlock={onSelectBlock}
        />

        <Section title="Grid family" note={capitalise(layout.family)} open>
          <div className="ge-family-grid">
            {families.map((family) => (
              <button
                key={family.id}
                type="button"
                className={layout.family === family.id ? "ge-is-selected" : ""}
                aria-pressed={layout.family === family.id}
                onClick={() =>
                  updateLayout((next) => setFamily(next, family.id))
                }
              >
                <span
                  className={`ge-family-icon ge-family-icon--${family.id}`}
                  aria-hidden="true"
                >
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                <strong>{family.label}</strong>
                <small>{family.note}</small>
              </button>
            ))}
          </div>
        </Section>

        {facing && <PageGridSection settings={settings} onChange={onChange} />}
        {facing && layout.pageGrid ? (
          <div className="ge-fixed-format" role="status">
            <strong>Columns and margins come from the page grid</strong>
            <span>
              Change them in Page grid above. Choose Spread grid to edit the
              spread's tracks directly.
            </span>
          </div>
        ) : (
          <>
            {layout.pageGrid && (
              <div className="ge-fixed-format" role="status">
                <strong>This study also has a facing page grid</strong>
                <span>
                  It returns when you choose Facing pages. Editing columns or
                  margins here turns it off.
                </span>
              </div>
            )}
            <Section
              title="Columns & gutters"
              note={`${geometry.columns.tracks.length} tracks`}
              open
            >
              <div className="ge-field-grid">
                <NumericField
                  label="Columns"
                  value={geometry.columns.tracks.length}
                  min={1}
                  max={16}
                  onCommit={(value) =>
                    changeCount("columns", Math.round(value))
                  }
                />
                <NumericField
                  label="Column gap"
                  value={geometry.columns.gap}
                  min={0}
                  max={64}
                  unit="px"
                  onCommit={(value) =>
                    updateVariantColumns((columns) => {
                      columns.gap = value;
                    })
                  }
                />
              </div>
              <div
                className="ge-segmented"
                role="group"
                aria-label="Column proportions"
              >
                <button
                  type="button"
                  className={
                    geometry.columns.tracks.every(
                      (track) =>
                        track.weight === geometry.columns.tracks[0].weight,
                    )
                      ? "ge-is-selected"
                      : ""
                  }
                  onClick={() =>
                    updateVariantColumns((columns) => {
                      columns.tracks.forEach((track) => {
                        track.weight = 1;
                      });
                    })
                  }
                >
                  Equal
                </button>
                <button
                  type="button"
                  className={
                    !geometry.columns.tracks.every(
                      (track) =>
                        track.weight === geometry.columns.tracks[0].weight,
                    )
                      ? "ge-is-selected"
                      : ""
                  }
                  onClick={() =>
                    updateVariantColumns((columns) => {
                      columns.tracks.forEach((track, index) => {
                        track.weight =
                          index < Math.ceil(columns.tracks.length * 0.65)
                            ? 1.2
                            : 0.8;
                      });
                    })
                  }
                >
                  Proportioned
                </button>
              </div>
              <div className="ge-track-editor" aria-label="Column weights">
                {geometry.columns.tracks.map((track, index) => (
                  <NumericField
                    key={index}
                    compact
                    label={`C${index + 1}`}
                    value={track.weight}
                    min={0.1}
                    max={12}
                    step={0.05}
                    onCommit={(value) =>
                      updateVariantColumns((columns) => {
                        columns.tracks[index].weight = value;
                      })
                    }
                  />
                ))}
              </div>
              {variant !== "wide" && variantOverride?.columns && (
                <button
                  type="button"
                  className="ge-text-action"
                  onClick={() =>
                    updateLayout((next) => {
                      if (next.variants[variant])
                        delete next.variants[variant]!.columns;
                      normaliseVariantPlacements(next, variant);
                    })
                  }
                >
                  Clear column override
                </button>
              )}
            </Section>

            <Section
              title="Margins"
              note={geometry.margins.linked ? "Linked" : "Independent"}
            >
              <button
                type="button"
                className={`ge-link-toggle ${geometry.margins.linked ? "ge-is-selected" : ""}`}
                aria-pressed={geometry.margins.linked}
                onClick={() =>
                  updateVariantMargins((margins) => {
                    margins.linked = !margins.linked;
                    if (margins.linked) setAllMargins(margins, margins.top);
                  })
                }
              >
                {geometry.margins.linked ? (
                  <Link size={15} />
                ) : (
                  <Link2Off size={15} />
                )}
                {geometry.margins.linked
                  ? "Margins linked"
                  : "Margins independent"}
              </button>
              <div className="ge-field-grid ge-field-grid--four">
                {(["top", "right", "bottom", "left"] as const).map((side) => (
                  <NumericField
                    key={side}
                    label={capitalise(side)}
                    value={geometry.margins[side]}
                    min={0}
                    max={240}
                    unit="px"
                    onCommit={(value) => setMargin(side, value)}
                  />
                ))}
              </div>
              {variant !== "wide" && variantOverride?.margins && (
                <button
                  type="button"
                  className="ge-text-action"
                  onClick={() =>
                    updateLayout((next) => {
                      if (next.variants[variant])
                        delete next.variants[variant]!.margins;
                    })
                  }
                >
                  Clear margin override
                </button>
              )}
            </Section>
          </>
        )}

        <Section
          title="Rows & flowlines"
          note={layout.rows.auto ? "Content-led" : "Modular"}
        >
          <div className="ge-field-grid">
            <NumericField
              label="Rows"
              value={layout.rows.tracks.length}
              min={1}
              max={64}
              onCommit={(value) => changeCount("rows", Math.round(value))}
            />
            <NumericField
              label="Row gap"
              value={geometry.rowGap}
              min={0}
              max={96}
              unit="px"
              onCommit={updateRowGap}
            />
          </div>
          <label className="ge-check">
            <input
              type="checkbox"
              checked={layout.rows.auto}
              onChange={(event) =>
                updateLayout((next) => {
                  next.rows.auto = event.target.checked;
                })
              }
            />
            <span>
              <strong>Content-led rows</strong>
              <small>
                Wide rows grow with copy. Turn off to weight modular bands; use
                a fixed study to constrain their height. Medium and narrow rows
                grow with content.
              </small>
            </span>
          </label>
          {!layout.rows.auto && (
            <div
              className="ge-row-fit"
              role="group"
              aria-label="Rows that fit their content"
            >
              <span>Fit to content</span>
              {layout.rows.tracks.map((track, index) => (
                <button
                  key={index}
                  type="button"
                  className={track.fit ? "ge-is-selected" : ""}
                  aria-pressed={!!track.fit}
                  aria-label={`Row ${index + 1} fits its content`}
                  onClick={() =>
                    updateLayout((next) => {
                      if (next.rows.tracks[index].fit)
                        delete next.rows.tracks[index].fit;
                      else next.rows.tracks[index].fit = true;
                    })
                  }
                >
                  R{index + 1}
                </button>
              ))}
            </div>
          )}
          <div className="ge-track-editor" aria-label="Row weights">
            {layout.rows.tracks.map((track, index) => (
              <NumericField
                key={index}
                compact
                label={`R${index + 1}`}
                value={track.weight}
                min={0.1}
                max={12}
                step={0.05}
                onCommit={(value) =>
                  updateLayout((next) => {
                    next.rows.tracks[index].weight = value;
                  })
                }
              />
            ))}
          </div>
          {variant !== "wide" && variantOverride?.rowGap !== undefined && (
            <button
              type="button"
              className="ge-text-action"
              onClick={() =>
                updateLayout((next) => {
                  if (next.variants[variant])
                    delete next.variants[variant]!.rowGap;
                })
              }
            >
              Clear row-gap override
            </button>
          )}
        </Section>

        {!fixedSurface && (
          <Section
            title="Format"
            note={
              layout.format.mode === "flow" ? "Flowing page" : "Fixed study"
            }
          >
            <div className="ge-segmented" role="group" aria-label="Format flow">
              <button
                type="button"
                className={
                  layout.format.mode === "flow" ? "ge-is-selected" : ""
                }
                onClick={() =>
                  updateLayout((next) => {
                    next.format = { mode: "flow" };
                  })
                }
              >
                Flow with content
              </button>
              <button
                type="button"
                className={
                  layout.format.mode === "fixed" ? "ge-is-selected" : ""
                }
                onClick={() =>
                  updateLayout((next) => {
                    next.format = {
                      mode: "fixed",
                      ratio: "3:4",
                      height: Math.round((settings.width * 4) / 3),
                    };
                  })
                }
              >
                Fixed study
              </button>
            </div>
            {layout.format.mode === "fixed" && (
              <div className="ge-field-grid">
                <label className="ge-select">
                  <span>Proportion</span>
                  <select
                    aria-label="Proportion"
                    value={layout.format.ratio}
                    onChange={(event) =>
                      updateLayout((next) => {
                        if (next.format.mode === "fixed") {
                          next.format.ratio = event.target
                            .value as typeof next.format.ratio;
                          const ratios = {
                            square: 1,
                            "3:4": 4 / 3,
                            "2:3": 3 / 2,
                            "root-2": Math.SQRT2,
                          };
                          next.format.height = bound(
                            Math.round(
                              settings.width * ratios[next.format.ratio],
                            ),
                            320,
                            2400,
                          );
                        }
                      })
                    }
                  >
                    <option value="square">Square · 1:1</option>
                    <option value="3:4">Portrait · 3:4</option>
                    <option value="2:3">Poster · 2:3</option>
                    <option value="root-2">Root two · 1:√2</option>
                  </select>
                </label>
                <NumericField
                  label="Height"
                  value={layout.format.height}
                  min={320}
                  max={2400}
                  unit="px"
                  onCommit={(value) =>
                    updateLayout((next) => {
                      if (next.format.mode === "fixed")
                        next.format.height = value;
                    })
                  }
                />
                <p className="ge-inline-warning">
                  Fixed studies report overflow in the specimen; content is
                  never silently removed.
                </p>
              </div>
            )}
          </Section>
        )}
      </section>

      <section
        className="ge-workflow ge-placement"
        aria-labelledby="ge-placement-title"
      >
        <div className="ge-heading-row">
          <div>
            <h3 id="ge-placement-title">Place the content</h3>
            <p>
              List order is reading order. Moving a block restacks the narrow
              layout; manual placement can differ.
            </p>
          </div>
          <span className="ge-count">{layout.blocks.length}/32 blocks</span>
        </div>
        <ol className="ge-block-list">
          {layout.blocks.map((block, index) => (
            <li
              key={block.id}
              className={selectedBlock === block.id ? "ge-is-selected" : ""}
            >
              <button
                type="button"
                className="ge-block-select"
                onClick={() => onSelectBlock(block.id)}
                aria-pressed={selectedBlock === block.id}
              >
                <span className="ge-order">{index + 1}</span>
                <span>
                  <strong>{block.label}</strong>
                  <small>
                    {capitalise(block.type)} · reading order {index + 1}
                  </small>
                </span>
              </button>
              <span className="ge-order-actions">
                <button
                  type="button"
                  aria-label={`Move ${block.label} up`}
                  disabled={index === 0}
                  onClick={() => reorder(index, -1)}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${block.label} down`}
                  disabled={index === layout.blocks.length - 1}
                  onClick={() => reorder(index, 1)}
                >
                  <ArrowDown size={14} />
                </button>
              </span>
            </li>
          ))}
        </ol>
        <div className="ge-add-row">
          <label className="ge-select">
            <span>Add block</span>
            <select
              aria-label="Add block"
              value={addType}
              onChange={(event) => setAddType(event.target.value as BlockType)}
            >
              {blockTypes.map((type) => (
                <option key={type} value={type}>
                  {capitalise(type)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="ge-add"
            disabled={layout.blocks.length >= 32}
            onClick={addBlock}
          >
            <Plus size={15} /> Add
          </button>
        </div>

        {selected ? (
          <div
            className="ge-inspector"
            aria-labelledby="ge-block-inspector-title"
          >
            <div className="ge-inspector__heading">
              <div>
                <h4 id="ge-block-inspector-title">{selected.label}</h4>
                <p>
                  {capitalise(variant)} placement
                  {variant !== "wide" && !selected.placement[variant]
                    ? " · inherited"
                    : " · custom"}
                </p>
              </div>
              <button
                type="button"
                className="ge-remove"
                onClick={() =>
                  updateLayout((next) => {
                    next.blocks = next.blocks.filter(
                      (block) => block.id !== selected.id,
                    );
                    onSelectBlock(null);
                  })
                }
              >
                <Trash2 size={14} /> Remove
              </button>
            </div>
            <label className="ge-text-field">
              <span>Block label</span>
              <input
                value={selected.label}
                maxLength={120}
                onChange={(event) =>
                  updateLayout((next) => {
                    next.blocks.find(
                      (block) => block.id === selected.id,
                    )!.label = event.target.value;
                  })
                }
              />
            </label>
            {variant !== "wide" && selected.placement[variant] && (
              <button
                type="button"
                className="ge-text-action"
                onClick={() =>
                  updateLayout((next) => {
                    delete next.blocks.find(
                      (block) => block.id === selected.id,
                    )!.placement[variant];
                  })
                }
              >
                Clear placement override
              </button>
            )}
            {selectedPlacement && (
              <div className="ge-field-grid ge-field-grid--four">
                <NumericField
                  label="Start column"
                  value={selectedPlacement.column}
                  min={1}
                  max={geometry.columns.tracks.length}
                  onCommit={(value) =>
                    updatePlacement((place) => {
                      place.column = Math.round(value);
                    })
                  }
                />
                <NumericField
                  label="Span"
                  value={selectedPlacement.span}
                  min={1}
                  max={
                    geometry.columns.tracks.length -
                    selectedPlacement.column +
                    1
                  }
                  onCommit={(value) =>
                    updatePlacement((place) => {
                      place.span = Math.round(value);
                    })
                  }
                />
                <NumericField
                  label="Start row"
                  value={selectedPlacement.row}
                  min={1}
                  max={variant === "wide" ? layout.rows.tracks.length : 64}
                  onCommit={(value) =>
                    updatePlacement((place) => {
                      place.row = Math.round(value);
                    })
                  }
                />
                <NumericField
                  label="Row span"
                  value={selectedPlacement.rowSpan}
                  min={1}
                  max={
                    (variant === "wide" ? layout.rows.tracks.length : 64) -
                    selectedPlacement.row +
                    1
                  }
                  onCommit={(value) =>
                    updatePlacement((place) => {
                      place.rowSpan = Math.round(value);
                    })
                  }
                />
              </div>
            )}
            <label className="ge-select">
              <span>Vertical alignment</span>
              <select
                value={selectedPlacement?.align ?? "start"}
                onChange={(event) =>
                  updatePlacement((place) => {
                    place.align = event.target.value as Placement["align"];
                  })
                }
              >
                <option value="start">Start</option>
                <option value="center">Centre</option>
                <option value="end">End</option>
                <option value="stretch">Stretch zone</option>
              </select>
            </label>
            {sharedContentTypes.includes(selected.type as SharedContentKey) && (
              <label className="ge-select">
                <span>Content source</span>
                <select
                  value={selected.contentKey ? selected.contentKey : "own"}
                  onChange={(event) =>
                    updateLayout((next, nextSettings) => {
                      const block = next.blocks.find(
                        (item) => item.id === selected.id,
                      )!;
                      if (event.target.value === "own") {
                        block.content = block.contentKey
                          ? nextSettingsContent(nextSettings, block.contentKey)
                          : (block.content ?? "");
                        delete block.contentKey;
                      } else {
                        block.contentKey = event.target
                          .value as SharedContentKey;
                        delete block.content;
                      }
                    })
                  }
                >
                  <option value="own">Own content</option>
                  {sharedContentTypes.map((key) => (
                    <option key={key} value={key}>
                      Shared {capitalise(key)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {selected.type !== "rule" && selected.type !== "panel" && (
              <label className="ge-text-field">
                <span>
                  {selected.contentKey
                    ? `Shared ${capitalise(selected.contentKey)}`
                    : "Block content"}
                </span>
                <textarea
                  maxLength={20000}
                  rows={5}
                  value={
                    selected.contentKey
                      ? settings.content[selected.contentKey]
                      : (selected.content ?? "")
                  }
                  onChange={(event) => {
                    const value = event.target.value;
                    updateLayout((next, nextSettings) => {
                      const block = next.blocks.find(
                        (item) => item.id === selected.id,
                      )!;
                      if (block.contentKey)
                        nextSettings.content[block.contentKey] = value;
                      else block.content = value;
                    });
                  }}
                />
              </label>
            )}
          </div>
        ) : (
          <div className="ge-empty">
            Select a block in the map or reading-order list to edit its
            placement.
          </div>
        )}
      </section>

      <section className="ge-workflow" aria-labelledby="ge-rhythm-title">
        <div className="ge-heading-row">
          <div>
            <h3 id="ge-rhythm-title">Refine rhythm & texture</h3>
            <p>
              These settings travel with the same layout used for preview and
              export.
            </p>
          </div>
        </div>
        <Section title="Rhythm" note={`${layout.rhythm.unit}px unit`} open>
          <label className="ge-check">
            <input
              type="checkbox"
              checked={layout.rhythm.linked}
              onChange={(event) =>
                updateLayout((next) => {
                  next.rhythm.linked = event.target.checked;
                  if (event.target.checked) {
                    next.rhythm.paragraphGap = next.rhythm.unit * 2;
                    next.rhythm.headingGap = next.rhythm.unit * 3;
                  }
                })
              }
            />
            <span>
              <strong>Link paragraph and heading gaps to the unit</strong>
              <small>
                Body leading is{" "}
                {(
                  settings.roles.body.size * settings.roles.body.leading
                ).toFixed(1)}
                px. Linked spacing uses two units between paragraphs and three
                after headings. Text baselines still need optical review.
              </small>
            </span>
          </label>
          <button
            type="button"
            className="ge-text-action"
            disabled={
              settings.roles.body.size * settings.roles.body.leading > 48
            }
            onClick={() =>
              updateLayout((next) => {
                next.rhythm.unit =
                  settings.roles.body.size * settings.roles.body.leading;
                next.rhythm.linked = true;
                next.rhythm.paragraphGap = next.rhythm.unit * 2;
                next.rhythm.headingGap = next.rhythm.unit * 3;
              })
            }
          >
            Use current body line height as the unit
          </button>
          <div className="ge-field-grid ge-field-grid--four">
            <NumericField
              label="Rhythm unit"
              value={layout.rhythm.unit}
              min={2}
              max={48}
              unit="px"
              onCommit={(value) =>
                updateLayout((next) => {
                  const ratio = value / next.rhythm.unit;
                  next.rhythm.unit = value;
                  if (next.rhythm.linked) {
                    next.rhythm.paragraphGap = bound(
                      next.rhythm.paragraphGap * ratio,
                      0,
                      160,
                    );
                    next.rhythm.headingGap = bound(
                      next.rhythm.headingGap * ratio,
                      0,
                      160,
                    );
                    next.rows.gap = bound(value, 0, 96);
                  }
                })
              }
            />
            <NumericField
              label="Paragraph gap"
              value={
                layout.rhythm.linked
                  ? layout.rhythm.unit * 2
                  : layout.rhythm.paragraphGap
              }
              min={0}
              max={160}
              unit="px"
              onCommit={(value) =>
                updateLayout((next) => {
                  next.rhythm.paragraphGap = value;
                  next.rhythm.headingGap = next.rhythm.linked
                    ? next.rhythm.unit * 3
                    : next.rhythm.headingGap;
                  next.rhythm.linked = false;
                })
              }
            />
            <NumericField
              label="Heading gap"
              value={
                layout.rhythm.linked
                  ? layout.rhythm.unit * 3
                  : layout.rhythm.headingGap
              }
              min={0}
              max={160}
              unit="px"
              onCommit={(value) =>
                updateLayout((next) => {
                  next.rhythm.headingGap = value;
                  next.rhythm.paragraphGap = next.rhythm.linked
                    ? next.rhythm.unit * 2
                    : next.rhythm.paragraphGap;
                  next.rhythm.linked = false;
                })
              }
            />
            <NumericField
              label="Paragraph indent"
              value={layout.rhythm.indent}
              min={0}
              max={160}
              unit="px"
              onCommit={(value) =>
                updateLayout((next) => {
                  next.rhythm.indent = value;
                })
              }
            />
          </div>
        </Section>
        <Section
          title="Typesetting"
          note={`${capitalise(layout.typesetting.align)} · ${layout.typesetting.language.toUpperCase()}`}
        >
          <NumericField
            label="Reading measure"
            value={settings.measure}
            min={20}
            max={100}
            unit="ch"
            onCommit={(value) => onChange({ ...settings, measure: value })}
          />
          <div className="ge-field-grid">
            <label className="ge-select">
              <span>Alignment</span>
              <select
                aria-label="Alignment"
                value={layout.typesetting.align}
                onChange={(event) =>
                  updateLayout((next) => {
                    next.typesetting.align = event.target
                      .value as LayoutSystem["typesetting"]["align"];
                  })
                }
              >
                <option value="left">Ragged right</option>
                <option value="justify">Justified</option>
              </select>
            </label>
            <label className="ge-select">
              <span>Language</span>
              <select
                aria-label="Language"
                value={layout.typesetting.language}
                onChange={(event) =>
                  updateLayout((next) => {
                    next.typesetting.language = event.target
                      .value as LayoutSystem["typesetting"]["language"];
                  })
                }
              >
                <option value="en">English</option>
                <option value="sv">Swedish</option>
              </select>
            </label>
          </div>
          <label className="ge-check">
            <input
              type="checkbox"
              checked={layout.typesetting.hyphenate}
              onChange={(event) =>
                updateLayout((next) => {
                  next.typesetting.hyphenate = event.target.checked;
                })
              }
            />
            <span>
              <strong>Language-aware hyphenation</strong>
              <small>
                Best used with justified text and reviewed in the rendered
                language.
              </small>
            </span>
          </label>
          <label
            className={`ge-check ${!supportSmallCaps ? "ge-is-unsupported" : ""}`}
          >
            <input
              type="checkbox"
              checked={layout.typesetting.smallCaps}
              disabled={!supportSmallCaps && !layout.typesetting.smallCaps}
              onChange={(event) =>
                updateLayout((next) => {
                  next.typesetting.smallCaps = event.target.checked;
                })
              }
            />
            <span>
              <strong>Real small caps · supporting role</strong>
              <small>
                {supportSmallCaps
                  ? "Supported by the selected supporting face."
                  : layout.typesetting.smallCaps
                    ? "Saved as on, but unavailable in the current supporting face. Turn off or choose a supporting face with smcp."
                    : "Unavailable in the current supporting face; synthetic caps are not substituted."}
              </small>
            </span>
          </label>
          <label className="ge-select">
            <span>Body numeral style</span>
            <select
              aria-label="Body numeral style"
              value={layout.typesetting.numerals}
              onChange={(event) =>
                updateLayout((next) => {
                  next.typesetting.numerals = event.target
                    .value as LayoutSystem["typesetting"]["numerals"];
                })
              }
            >
              <option value="normal">Normal figures</option>
              <option
                value="oldstyle"
                disabled={
                  !bodyOldstyle && layout.typesetting.numerals !== "oldstyle"
                }
              >
                Oldstyle figures{!bodyOldstyle ? " · unavailable" : ""}
              </option>
              <option
                value="tabular"
                disabled={
                  !bodyTabular && layout.typesetting.numerals !== "tabular"
                }
              >
                Tabular figures{!bodyTabular ? " · unavailable" : ""}
              </option>
            </select>
            <small className="ge-feature-note">
              {layout.typesetting.numerals === "oldstyle" && !bodyOldstyle
                ? "Saved oldstyle figures are unavailable in the current body face."
                : layout.typesetting.numerals === "tabular" && !bodyTabular
                  ? "Saved tabular figures are unavailable in the current body face."
                  : "Options reflect the selected body face’s verified OpenType tables."}
            </small>
          </label>
        </Section>
      </section>
    </div>
  );
}

function nextSettingsContent(
  settings: Settings,
  key: keyof Settings["content"],
) {
  return settings.content[key];
}

export default GridEditor;
