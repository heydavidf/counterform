import { ArrowRight, Columns2, X } from "lucide-react";
import { clearComparison, settingsDifferences } from "./comparison";
import type { Settings } from "./model";

type ComparisonPanelProps = {
  settings: Settings;
  onChange: (settings: Settings) => void;
};

const categoryFor = (path: string) => {
  if (path.startsWith("roles")) return "Type";
  if (path.startsWith("palette")) return "Colour";
  if (path.startsWith("content")) return "Content";
  if (path.startsWith("layout") || path === "width") return "Grid";
  if (path.startsWith("surface") || path === "composition") return "Format";
  return "Study";
};

export function ComparisonPanel({ settings, onChange }: ComparisonPanelProps) {
  const comparison = settings.comparison;
  if (!comparison) return null;
  const differences = settingsDifferences(
    comparison.reference as Settings,
    settings,
  );
  const grouped = differences.reduce<Record<string, typeof differences>>(
    (result, difference) => {
      (result[categoryFor(difference.path)] ??= []).push(difference);
      return result;
    },
    {},
  );

  return (
    <section className="comparison-panel" aria-labelledby="comparison-title">
      <div className="comparison-panel__heading">
        <Columns2 size={16} />
        <div>
          <h2 id="comparison-title">Compare an adjustment</h2>
          <p>A is pinned. The controls edit B.</p>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="End comparison"
          onClick={() => onChange(clearComparison(settings))}
        >
          <X size={15} />
        </button>
      </div>
      <label className="comparison-intent">
        <span>
          Intent <small>optional</small>
        </span>
        <input
          aria-label="Comparison intent"
          maxLength={1000}
          placeholder="What are you testing?"
          value={comparison.intent}
          onChange={(event) => {
            const next = structuredClone(settings);
            next.comparison!.intent = event.target.value;
            onChange(next);
          }}
        />
      </label>
      {differences.length === 0 ? (
        <p className="comparison-empty">
          No differences yet. Change B to see the adjustment here.
        </p>
      ) : (
        <div className="difference-groups" aria-live="polite">
          {Object.entries(grouped).map(([category, items]) => (
            <div className="difference-group" key={category}>
              <h3>{category}</h3>
              {items.slice(0, 8).map((difference) => (
                <div className="difference-row" key={difference.path}>
                  <span>{difference.label}</span>
                  <code>{difference.before}</code>
                  <ArrowRight size={12} aria-hidden="true" />
                  <code>{difference.after}</code>
                </div>
              ))}
              {items.length > 8 && (
                <small>+ {items.length - 8} more changes</small>
              )}
            </div>
          ))}
        </div>
      )}
      {differences.length > 0 && (
        <button
          className="quiet-button comparison-reset"
          type="button"
          onClick={() => {
            const reference = structuredClone(comparison.reference) as Settings;
            reference.comparison = structuredClone(comparison);
            onChange(reference);
          }}
        >
          Use reference settings
        </button>
      )}
    </section>
  );
}
