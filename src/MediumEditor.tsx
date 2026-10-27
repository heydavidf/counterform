import { Check, FileText, Monitor, Share2 } from "lucide-react";
import type { Settings } from "./model";
import {
  PRINT_FORMATS,
  SOCIAL_FORMATS,
  applySurfaceTemplate,
  setSurface,
  surfaceGeometry,
  surfaceOf,
  surfaceTemplates,
  type SurfaceSettings,
} from "./surface";

type MediumEditorProps = {
  settings: Settings;
  onChange: (settings: Settings) => void;
  onNotice: (message: string) => void;
};

const modes = [
  { id: "web", label: "Web", icon: Monitor },
  { id: "print", label: "Print", icon: FileText },
  { id: "social", label: "Social", icon: Share2 },
] as const;

export function MediumEditor({
  settings,
  onChange,
  onNotice,
}: MediumEditorProps) {
  const surface = surfaceOf(settings);
  const geometry = surfaceGeometry(settings);
  const templates = surfaceTemplates.filter(
    (template) =>
      surface.mode !== "web" && template.modes.includes(surface.mode),
  );

  const changeSurface = (next: SurfaceSettings) =>
    onChange(setSurface(settings, next));
  const chooseMode = (mode: (typeof modes)[number]["id"]) => {
    if (mode === surface.mode) return;
    const next: SurfaceSettings =
      mode === "web"
        ? { mode: "web" }
        : mode === "print"
          ? {
              mode: "print",
              pageSize: "a4",
              orientation: "portrait",
              pages: "single",
            }
          : { mode: "social", format: "square" };
    changeSurface(next);
    onNotice(
      `${modes.find((item) => item.id === mode)!.label} canvas ready. Your type, colour and copy are unchanged.`,
    );
  };

  return (
    <section className="medium-editor" aria-label="Output medium">
      <div
        className="medium-editor__modes"
        role="group"
        aria-label="Output medium"
      >
        {modes.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={surface.mode === id ? "selected" : ""}
            aria-pressed={surface.mode === id}
            onClick={() => chooseMode(id)}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {surface.mode === "web" ? (
        <div className="medium-editor__summary">
          <strong>Responsive canvas</strong>
          <span>{geometry.label}. Width controls test real reflow.</span>
        </div>
      ) : (
        <div
          className="medium-editor__fixed"
          data-testid="fixed-format-controls"
        >
          <div className="medium-editor__fields">
            {surface.mode === "print" ? (
              <>
                <label>
                  <span>Page size</span>
                  <select
                    aria-label="Print page size"
                    value={surface.pageSize}
                    onChange={(event) =>
                      changeSurface({
                        ...surface,
                        pageSize: event.target.value as typeof surface.pageSize,
                      })
                    }
                  >
                    {PRINT_FORMATS.map((format) => (
                      <option key={format.id} value={format.id}>
                        {format.label} · {format.widthMm} × {format.heightMm} mm
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Orientation</span>
                  <select
                    aria-label="Print orientation"
                    value={surface.orientation}
                    onChange={(event) =>
                      changeSurface({
                        ...surface,
                        orientation: event.target
                          .value as typeof surface.orientation,
                      })
                    }
                  >
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </select>
                </label>
                <label>
                  <span>Pages</span>
                  <select
                    aria-label="Print pages"
                    value={surface.pages}
                    onChange={(event) =>
                      changeSurface({
                        ...surface,
                        pages: event.target.value as typeof surface.pages,
                      })
                    }
                  >
                    <option value="single">Single page</option>
                    <option value="facing">Facing pages</option>
                  </select>
                </label>
              </>
            ) : (
              <label>
                <span>Format</span>
                <select
                  aria-label="Social format"
                  value={surface.format}
                  onChange={(event) =>
                    changeSurface({
                      mode: "social",
                      format: event.target.value as typeof surface.format,
                    })
                  }
                >
                  {SOCIAL_FORMATS.map((format) => (
                    <option key={format.id} value={format.id}>
                      {format.label} · {format.width} × {format.height} px
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="medium-editor__summary">
            <strong>{geometry.label}</strong>
            <span>
              Fixed canvas scales to fit this preview; its geometry and wide
              layout do not reflow.
              {surface.mode === "print" &&
                " Type remains in CSS pixels (1 px = 0.75 pt)."}
            </span>
          </div>
          <div
            className="template-strip"
            aria-label={`${surface.mode} templates`}
          >
            <span className="template-strip__label">Editable starters</span>
            {templates.map((template) => {
              const active = settings.layout?.recipeId === template.id;
              return (
                <button
                  key={template.id}
                  type="button"
                  className={active ? "selected" : ""}
                  aria-pressed={active}
                  title={template.description}
                  onClick={() => {
                    const next = applySurfaceTemplate(settings, template.id);
                    onChange(next);
                    const nextSurface = surfaceOf(next);
                    const format =
                      nextSurface.mode === "print"
                        ? ` to ${nextSurface.pages === "facing" ? "a facing spread" : "a single page"}`
                        : "";
                    onNotice(
                      `${template.name} applied${format}. Your shared copy, type and palette are retained.`,
                    );
                  }}
                >
                  {active && <Check size={13} />}
                  Apply {template.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
