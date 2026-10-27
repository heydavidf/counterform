import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  ChevronRight,
  Columns2,
  Grid2X2,
  Layers,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
  PanelRightClose,
  PanelRightOpen,
  Printer,
} from "lucide-react";
import { fonts, pairings } from "./catalog";
import {
  applyPairing,
  contrast,
  defaultSettings,
  validateSettings,
  familyAlias,
  fontName,
  palettes,
  roleNames,
  type Role,
  type Settings,
  type UploadedFont,
  type SavedExperiment,
} from "./model";
import { fontFaceCss, renderSpecimen, systemCss } from "./render";
import { GridEditor } from "./GridEditor";
import { effectiveLayout, effectiveVariant } from "./layout";
import { ComparisonPanel } from "./ComparisonPanel";
import { MediumEditor } from "./MediumEditor";
import { startComparison, withoutComparison } from "./comparison";
import { surfaceGeometry, surfaceOf } from "./surface";
import { printReadingWarnings } from "./print-diagnostics";
import { exportPng, standaloneOutputHtml } from "./output";
import {
  exportSvg,
  selectedPrivateFonts,
  assertFontPermission,
} from "./export-artwork";
import { exportIdml } from "./idml";
import {
  loadWorkspace,
  saveCurrent,
  saveExperiment,
  deleteExperiment,
  saveUpload,
  deleteUpload,
} from "./storage";
import {
  exportPackage,
  importPackage,
  makeUpload,
  withFontDependencies,
} from "./package";

type Tab = "type" | "grid" | "colour" | "content" | "saved" | "export";
const roles: Role[] = ["display", "body", "support"];
function Range({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(Number(value.toFixed(3)))), [value]);
  const commit = () => {
    const n = Number(draft);
    if (draft.trim() && Number.isFinite(n)) {
      const bounded = Math.min(max, Math.max(min, n));
      onChange(bounded);
      setDraft(String(bounded));
    } else setDraft(String(value));
  };
  const id = "range-" + label.toLowerCase().replace(/[^a-z0-9]/g, "-");
  return (
    <div className="range-field">
      <div>
        <label htmlFor={id}>{label}</label>
        <span>
          <input
            aria-label={`${label} value`}
            type="number"
            value={draft}
            min={min}
            max={max}
            step={step}
            onChange={(e) => {
              setDraft(e.target.value);
              const n = e.target.valueAsNumber;
              if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
            }}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
          {unit}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={
          {
            "--range-fill": `${((value - min) / (max - min)) * 100}%`,
          } as React.CSSProperties
        }
      />
    </div>
  );
}
function Frame({
  settings,
  grid,
  baseline,
  stress,
  label,
  frameKind = "current",
  uploads,
  selectedBlock,
  onSelectBlock,
}: {
  selectedBlock?: string | null;
  onSelectBlock?: (id: string) => void;
  settings: Settings;
  grid: boolean;
  baseline: boolean;
  stress: boolean;
  label?: string;
  frameKind?: "current" | "reference";
  uploads: UploadedFont[];
}) {
  const geometry = surfaceGeometry(settings);
  const surface = surfaceOf(settings);
  const outer = useRef<HTMLDivElement>(null),
    inner = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ scale: 1, height: 1000 });
  const [layoutWarnings, setLayoutWarnings] = useState<string[]>([]);
  useEffect(() => {
    const measure = () => {
      if (outer.current && inner.current) {
        setSize({
          scale: Math.min(1, outer.current.clientWidth / geometry.width),
          height: geometry.height ?? inner.current.scrollHeight,
        });
        const warnings: string[] = [];
        const specimen = inner.current.querySelector<HTMLElement>(".specimen");
        if (specimen) {
          const sheetBox = specimen.getBoundingClientRect();
          const scale = sheetBox.width / geometry.width;
          if (scale > 0) {
            warnings.push(...printReadingWarnings(settings, [
              ...specimen.querySelectorAll<HTMLElement>("[data-block-id]"),
            ].map((block) => {
              const box = block.getBoundingClientRect();
              return {
                id: block.dataset.blockId!,
                left: (box.left - sheetBox.left) / scale,
                right: (box.right - sheetBox.left) / scale,
                text: block.textContent ?? "",
              };
            })));
          }
        }
        const gridElement =
          inner.current.querySelector<HTMLElement>(".layout-grid");
        if (gridElement) {
          if (
            gridElement.scrollHeight > gridElement.clientHeight + 3 ||
            gridElement.scrollWidth > gridElement.clientWidth + 3
          )
            warnings.push(
              "Content extends beyond the grid. Increase the format or use growing rows.",
            );
          const blocks = [
            ...gridElement.querySelectorAll<HTMLElement>("[data-block-id]"),
          ].filter(
            (b) =>
              !b.classList.contains("layout-panel") &&
              !b.classList.contains("layout-rule"),
          );
          const overlaps: string[] = [];
          for (let a = 0; a < blocks.length; a++)
            for (let b = a + 1; b < blocks.length; b++) {
              const x = blocks[a].getBoundingClientRect(),
                y = blocks[b].getBoundingClientRect();
              if (
                Math.min(x.right, y.right) - Math.max(x.left, y.left) > 3 &&
                Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 3
              )
                overlaps.push(
                  `${blocks[a].dataset.zone} / ${blocks[b].dataset.zone}`,
                );
            }
          if (overlaps.length)
            warnings.push(
              `Overlapping content: ${overlaps.slice(0, 3).join(", ")}. Adjust placement or add rows.`,
            );
          inner.current
            .querySelectorAll<HTMLElement>("[data-block-id]")
            .forEach((block) => {
              if (
                block.scrollHeight >
                  block.clientHeight +
                    Math.max(
                      5,
                      parseFloat(getComputedStyle(block).fontSize) * 0.3,
                    ) ||
                block.scrollWidth > block.clientWidth + 3
              )
                warnings.push(
                  `${block.dataset.zone || block.dataset.blockId}: content exceeds its allocated area.`,
                );
            });
        }
        setLayoutWarnings((previous) =>
          JSON.stringify(previous) === JSON.stringify(warnings)
            ? previous
            : warnings,
        );
      }
    };
    const observer = new ResizeObserver(measure);
    if (outer.current) observer.observe(outer.current);
    if (inner.current) observer.observe(inner.current);
    measure();
    document.fonts.ready.then(measure);
    return () => observer.disconnect();
  }, [settings, geometry.width, geometry.height]);
  const frameId = useRef("sheet-" + Math.random().toString(36).slice(2));
  const absent = roles.filter(
    (r) =>
      !fonts.some((f) => f.id === settings.roles[r].fontId) &&
      !uploads.some((f) => f.id === settings.roles[r].fontId),
  );
  return (
    <section className="frame-region" data-frame={frameKind}>
      {absent.length > 0 && (
        <div className="font-warning" role="status">
          Missing font:{" "}
          {absent
            .map((r) =>
              fontName(
                settings.roles[r].fontId,
                uploads,
                settings.fontDependencies,
              ),
            )
            .join(", ")}
          . Restore the file in Type; fallback shown.
        </div>
      )}
      {label && <div className="frame-label">{label}</div>}
      {layoutWarnings.length > 0 && (
        <div className="font-warning" role="status">
          {layoutWarnings.join(" ")} Your saved copy is unchanged.
        </div>
      )}
      <div
        ref={outer}
        className={`sheet-shell ${geometry.mode !== "web" ? "fixed-sheet" : ""} ${surface.mode === "print" && surface.pages === "facing" ? "facing-sheet" : ""} ${grid ? "show-grid" : ""} ${baseline ? "show-baseline" : ""} ${stress ? "text-stress" : ""}`}
        style={{ maxWidth: geometry.width, height: size.height * size.scale }}
      >
        <div
          id={frameId.current}
          ref={inner}
          className={`sheet ${onSelectBlock && settings.layout ? "placement-active" : ""}`}
          onClick={(event) => {
            const block = (event.target as HTMLElement).closest<HTMLElement>(
              "[data-block-id]",
            );
            if (block?.dataset.blockId) onSelectBlock?.(block.dataset.blockId);
          }}
          style={{ width: geometry.width, transform: `scale(${size.scale})` }}
        >
          <style>
            {systemCss(settings).replaceAll(
              ".specimen",
              `#${frameId.current} .specimen`,
            )}
            {selectedBlock && settings.layout
              ? `#${frameId.current} .layout-block-${selectedBlock.replace(/[^a-zA-Z0-9_-]/g, "")}{outline:2px solid var(--accent);outline-offset:5px}`
              : ""}
          </style>
          <div dangerouslySetInnerHTML={{ __html: renderSpecimen(settings) }} />
        </div>
      </div>
      <div className="frame-caption">
        <span>{geometry.label}</span>
        <span>
          {Math.round(size.scale * 100)}% view ·{" "}
          {settings.layout
            ? effectiveLayout(
                settings.layout,
                geometry.mode === "web"
                  ? effectiveVariant(settings.width)
                  : "wide",
              ).columns.tracks.length
            : settings.grid.columns}{" "}
          columns · {settings.palette.name}
        </span>
      </div>
    </section>
  );
}
function PanelHeading({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="panel-heading">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  );
}
function download(bytes: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function loadPrivateFont(font: UploadedFont) {
  const face = new FontFace(familyAlias(font.id), font.bytes, {
    weight: font.weight,
    style: font.style,
  });
  await face.load();
  document.fonts.forEach((old) => {
    if (old.family === familyAlias(font.id)) document.fonts.delete(old);
  });
  document.fonts.add(face);
}
export default function App() {
  const [settings, setSettingsState] = useState<Settings>(defaultSettings);
  const [resetRecovery, setResetRecoveryState] = useState<Settings | null>(
    null,
  );
  const [resetRecoveryStored, setResetRecoveryStored] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const resetButton = useRef<HTMLButtonElement>(null);
  const undoResetButton = useRef<HTMLButtonElement>(null);
  const [uploads, setUploads] = useState<UploadedFont[]>([]),
    [saved, setSaved] = useState<SavedExperiment[]>([]);
  const [tab, setTab] = useState<Tab>("type"),
    [role, setRole] = useState<Role>("display");
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(false),
    [showBaseline, setShowBaseline] = useState(false),
    [stress, setStress] = useState(false);
  const [storageWritable, setStorageWritable] = useState(false);
  const [ready, setReady] = useState(false),
    [saveStatus, setSaveStatus] = useState("Opening workspace…");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [fontStatus, setFontStatus] = useState("Loading fonts…");
  const [includeFonts, setIncludeFonts] = useState(false),
    [fontRightsConfirmed, setFontRightsConfirmed] = useState(false),
    [inspector, setInspector] = useState(true);
  const [printWarning, setPrintWarning] = useState("");
  const [uploadWeight, setUploadWeight] = useState("400"),
    [uploadStyle, setUploadStyle] = useState<"normal" | "italic">("normal");
  useEffect(() => {
    setIncludeFonts(false);
    setFontRightsConfirmed(false);
  }, [
    tab,
    settings.roles.display.fontId,
    settings.roles.body.fontId,
    settings.roles.support.fontId,
  ]);
  const importInput = useRef<HTMLInputElement>(null),
    fontInput = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef({
    settings,
    uploads,
    ready,
    storageWritable,
    resetRecovery,
  });
  workspaceRef.current = {
    settings,
    uploads,
    ready,
    storageWritable,
    resetRecovery,
  };
  const saveTicket = useRef(0);
  const pendingStudyAction = useRef<{
    settings: Settings;
    resetRecovery: Settings | null;
  } | null>(null);
  const undoGuardPending = useRef(false);
  const undoGuardFlushRequested = useRef(false);
  const flushWorkspace = (snapshot?: {
    settings: Settings;
    uploads: UploadedFont[];
    resetRecovery?: Settings | null;
  }) => {
    const current = workspaceRef.current;
    if (!current.ready) return Promise.resolve(false);
    if (!current.storageWritable) {
      setSaveStatus("Not saved");
      return Promise.resolve(false);
    }
    if (undoGuardPending.current) {
      undoGuardFlushRequested.current = true;
      return Promise.resolve(false);
    }
    // Do not enqueue the unchanged visible study behind a pending Reset/Undo.
    if (pendingStudyAction.current) return Promise.resolve(false);
    const ticket = ++saveTicket.current;
    setSaveStatus("Saving…");
    const payload = withFontDependencies(
      snapshot?.settings ?? current.settings,
      snapshot?.uploads ?? current.uploads,
    );
    const recovery =
      snapshot?.resetRecovery === undefined
        ? current.resetRecovery
        : snapshot.resetRecovery;
    // IndexedDB serialises these same-store transactions. Start each write now:
    // a pagehide write must not wait for another save's JS completion callback.
    const run = (async () => {
      if (!workspaceRef.current.storageWritable) return false;
      try {
        await saveCurrent(payload, recovery);
        if (ticket === saveTicket.current) {
          setSaveStatus("Saved on this device");
          setResetRecoveryStored(Boolean(recovery));
        }
        return true;
      } catch {
        if (ticket === saveTicket.current) {
          setSaveStatus("Not saved");
          setResetRecoveryStored(false);
          setError("Local saving failed. Export your work to keep a copy.");
        }
        return false;
      }
    })();
    return run;
  };
  const flushRef = useRef(flushWorkspace);
  flushRef.current = flushWorkspace;
  // Every saved-settings change expires Reset recovery. Display-only controls do not.
  const setSettings = (value: SetStateAction<Settings>) => {
    const current = workspaceRef.current;
    const next = typeof value === "function" ? value(current.settings) : value;
    // Number fields commit on blur, including when their value did not change.
    // Keep recovery during that display-only focus/navigation journey.
    if (JSON.stringify(next) === JSON.stringify(current.settings)) return;
    pendingStudyAction.current = null;
    workspaceRef.current = { ...current, settings: next, resetRecovery: null };
    setResetRecoveryState(null);
    setResetRecoveryStored(false);
    setSettingsState(next);
    // Dispatch each study change promptly. Reload may discard a transaction that
    // is only created by pagehide, even if its put requests have been enqueued.
    void flushRef.current({
      settings: next,
      uploads: current.uploads,
      resetRecovery: null,
    });
  };
  async function resetCurrentStudy() {
    const current = workspaceRef.current;
    const recovery = withFontDependencies(current.settings, current.uploads);
    const next = defaultSettings();
    const attempt = {
      settings: current.settings,
      resetRecovery: current.resetRecovery,
    };
    pendingStudyAction.current = attempt;
    const ticket = ++saveTicket.current;
    setResetBusy(true);
    setSaveStatus("Saving…");
    setError("");
    let stored = false;
    try {
      if (current.storageWritable) stored = await saveCurrent(next, recovery);
    } catch {
      /* Keep the prior persisted study; offer explicitly in-session recovery below. */
    }
    setResetBusy(false);
    // A newer edit owns the screen and its following transaction.
    if (pendingStudyAction.current !== attempt) return;
    pendingStudyAction.current = null;
    setResetRecoveryStored(stored);
    workspaceRef.current = {
      ...workspaceRef.current,
      settings: next,
      resetRecovery: recovery,
    };
    setSettingsState(next);
    setResetRecoveryState(recovery);
    setSelectedBlock(null);
    // Guides and stress are temporary viewing tools, not saved study settings.
    setShowGrid(false);
    setShowBaseline(false);
    setStress(false);
    if (ticket === saveTicket.current)
      setSaveStatus(stored ? "Saved on this device" : "Not saved");
    if (!stored) {
      setError(
        "Reset recovery could not be saved. Undo remains available in this tab; export a backup before closing.",
      );
    }
    requestAnimationFrame(() => undoResetButton.current?.focus());
  }
  async function undoReset() {
    const current = workspaceRef.current;
    if (!current.resetRecovery) return;
    const restored = structuredClone(current.resetRecovery);
    const attempt = {
      settings: current.settings,
      resetRecovery: current.resetRecovery,
    };
    pendingStudyAction.current = attempt;
    const guardStoredRecovery = resetRecoveryStored && current.storageWritable;
    undoGuardPending.current = guardStoredRecovery;
    undoGuardFlushRequested.current = false;
    setResetBusy(true);
    setSaveStatus("Saving…");
    setError("");
    let stale = false;
    let stored = false;
    const ticket = ++saveTicket.current;
    try {
      if (current.storageWritable) {
        stored = await saveCurrent(
          restored,
          null,
          guardStoredRecovery ? current.resetRecovery! : undefined,
          (matched) => {
            undoGuardPending.current = false;
            if (!matched) {
              stale = true;
              workspaceRef.current.storageWritable = false;
              setStorageWritable(false);
            } else if (undoGuardFlushRequested.current) {
              // The guard has accepted this tab's checkpoint. Save any later edit
              // in a following transaction, without waiting for the Undo notice.
              void flushRef.current();
            }
            undoGuardFlushRequested.current = false;
          },
        );
      }
    } catch {
      if (ticket === saveTicket.current) {
        setSaveStatus("Not saved");
        setError("Local saving failed. Export your work to keep a copy.");
      }
    }
    undoGuardPending.current = false;
    undoGuardFlushRequested.current = false;
    setResetBusy(false);
    if (stale) {
      if (pendingStudyAction.current === attempt)
        pendingStudyAction.current = null;
      setSaveStatus("Not saved");
      setError(
        "Undo reset was stopped because another tab changed the saved study. Reload to see the latest work. Changes in this tab are not being saved.",
      );
      workspaceRef.current.resetRecovery = null;
      setResetRecoveryState(null);
      setResetRecoveryStored(false);
      return;
    }
    if (pendingStudyAction.current === attempt) {
      pendingStudyAction.current = null;
      workspaceRef.current = {
        ...workspaceRef.current,
        settings: restored,
        resetRecovery: null,
      };
      setSettingsState(restored);
      setResetRecoveryState(null);
      setResetRecoveryStored(false);
      if (ticket === saveTicket.current)
        setSaveStatus(stored ? "Saved on this device" : "Not saved");
      if (!stored)
        setError(
          "The restored study could not be saved. Export a backup before closing.",
        );
      setNotice(
        stored
          ? "Previous study restored."
          : "Previous study restored on screen. Export a copy before you leave.",
      );
      requestAnimationFrame(() => resetButton.current?.focus());
    }
  }
  function openPanel(next: Tab) {
    setTab(next);
    setInspector(true);
    if (window.innerWidth <= 800)
      setTimeout(
        () => document.querySelector(".inspector")?.scrollIntoView(),
        0,
      );
  }
  const update = (fn: (s: Settings) => Settings) =>
    setSettings((prev) => fn(structuredClone(prev)));
  useEffect(() => {
    let active = true;
    loadWorkspace()
      .then(async (data) => {
        if (!active) return;
        const failures: string[] = [];
        for (const font of data.uploads) {
          try {
            await loadPrivateFont(font);
          } catch {
            failures.push(font.name);
          }
        }
        if (!active) return;
        setUploads(data.uploads);
        setSaved(data.saved);
        if (data.current) setSettingsState(data.current);
        setResetRecoveryState(data.resetRecovery);
        setResetRecoveryStored(Boolean(data.resetRecovery));
        setStorageWritable(true);
        setReady(true);
        if (failures.length)
          setError(
            `Could not load ${failures.join(", ")}. Restore the font files in Type.`,
          );
      })
      .catch((e) => {
        if (active) {
          setReady(true);
          setSaveStatus("Not saved");
          setError(
            `Local storage could not open: ${e.message}. You can still work and export.`,
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!ready || !storageWritable) return;
    setSaveStatus("Saving…");
    const timer = setTimeout(() => {
      void flushRef.current();
    }, 450);
    return () => clearTimeout(timer);
  }, [ready, storageWritable, uploads]);
  useEffect(() => {
    const flush = () => {
      void flushRef.current();
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);
  const [compactSaveStatus, setCompactSaveStatus] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 800px)");
    const update = () => setCompactSaveStatus(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  // Safari leaves buttons out of the default Tab cycle unless tabindex is present.
  useEffect(() => {
    const mark = () => {
      document.querySelectorAll("button:not([tabindex])").forEach((button) => {
        if (button instanceof HTMLButtonElement) button.tabIndex = 0;
      });
    };
    mark();
    const observer = new MutationObserver(mark);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let active = true;
    setFontStatus("Loading fonts…");
    Promise.all(
      roles.map(async (r) => {
        const face = settings.roles[r];
        if (
          !fonts.some((f) => f.id === face.fontId) &&
          !uploads.some((f) => f.id === face.fontId)
        )
          throw new Error("Missing private font");
        await document.fonts.load(
          `${face.style} ${face.weight} 18px "${familyAlias(face.fontId)}"`,
        );
        if (
          !document.fonts.check(
            `${face.style} ${face.weight} 18px "${familyAlias(face.fontId)}"`,
          )
        )
          throw new Error("Font did not load");
      }),
    )
      .then(() => {
        if (active) setFontStatus("Fonts ready");
      })
      .catch(() => {
        if (active) setFontStatus("Font unavailable · fallback shown");
      });
    return () => {
      active = false;
    };
  }, [settings.roles, uploads]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  const currentPairing = pairings.find((p) =>
    roles.every((r) => p[r] === settings.roles[r].fontId),
  );
  const selectedFont = fonts.find((f) => f.id === settings.roles[role].fontId),
    selectedUpload = uploads.find((f) => f.id === settings.roles[role].fontId);
  const availableFiles =
    selectedFont?.files ??
    (selectedUpload
      ? [{ weight: selectedUpload.weight, style: selectedUpload.style }]
      : []);
  const weights = Array.from(
    new Set(
      availableFiles
        .filter((f) => f.style === settings.roles[role].style)
        .flatMap((f) => {
          const [min, max] = f.weight.split(" ").map(Number);
          return max
            ? Array.from(
                { length: Math.floor((max - min) / 100) + 1 },
                (_, i) => min + i * 100,
              )
            : [min];
        }),
    ),
  ).sort((a, b) => a - b);
  const styles = Array.from(new Set(availableFiles.map((f) => f.style)));
  const missing = roles.filter(
    (r) =>
      !fonts.some((f) => f.id === settings.roles[r].fontId) &&
      !uploads.some((f) => f.id === settings.roles[r].fontId),
  );
  const setRoleValue = (key: string, value: unknown) =>
    update((s) => {
      s.roles[role] = { ...s.roles[role], [key]: value };
      return s;
    });
  function chooseFont(id: string) {
    const font = fonts.find((f) => f.id === id);
    const upload = uploads.find((f) => f.id === id);
    const file =
      font?.files.find((f) => f.style === "normal") ?? font?.files[0] ?? upload;
    update((s) => {
      s.roles[role] = {
        ...s.roles[role],
        fontId: id,
        axes: {},
        style: file?.style ?? "normal",
        weight: Math.min(
          Number(file?.weight.split(" ").at(-1) ?? 400),
          Math.max(400, Number(file?.weight.split(" ")[0] ?? 400)),
        ),
      };
      return s;
    });
  }
  async function saveNamed() {
    try {
      const entry: SavedExperiment = {
        id: crypto.randomUUID(),
        updatedAt: new Date().toISOString(),
        settings: withFontDependencies(settings, uploads),
      };
      await saveExperiment(entry);
      setSaved((prev) => [entry, ...prev]);
      setNotice("Snapshot saved. Find it in Experiments.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function handleImport(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const result = await importPackage(file);
      for (const f of result.uploads) await loadPrivateFont(f);
      for (const f of result.uploads) await saveUpload(f);
      const nextUploads = [
        ...uploads.filter((f) => !result.uploads.some((u) => u.id === f.id)),
        ...result.uploads,
      ];
      setUploads(nextUploads);
      const imported = structuredClone(result.settings);
      if (settings.comparison && !imported.comparison)
        imported.comparison = structuredClone(settings.comparison);
      setSettings(imported);
      const stored = await flushRef.current({
        settings: imported,
        uploads: nextUploads,
      });
      setNotice(
        stored
          ? settings.comparison && !result.settings.comparison
            ? "Study imported as the current B adjustment; A remains pinned."
            : "Experiment imported."
          : "Study imported on screen. Export a copy before you leave.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (importInput.current) importInput.current.value = "";
    }
  }
  async function handleFont(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      if (!/^\d{3,4}( \d{3,4})?$/.test(uploadWeight))
        throw new Error(
          "Use a weight such as 400, or a variable range such as 100 900.",
        );
      const font = await makeUpload(file, uploadWeight, uploadStyle);
      await loadPrivateFont(font);
      await saveUpload(font);
      setUploads((prev) => [...prev.filter((f) => f.id !== font.id), font]);
      update((s) => {
        s.roles[role] = {
          ...s.roles[role],
          fontId: font.id,
          style: font.style,
          weight: Number(font.weight.split(" ")[0]),
          axes: {},
        };
        return s;
      });
      setNotice(`Added ${font.name} to ${roleNames[role].toLowerCase()} type.`);
    } catch (e) {
      setError(`Font could not be added. ${(e as Error).message}`);
    } finally {
      setBusy(false);
      if (fontInput.current) fontInput.current.value = "";
    }
  }
  async function exportZip() {
    setBusy(true);
    setError("");
    try {
      assertFontPermission(
        settings,
        uploads,
        includeFonts,
        fontRightsConfirmed,
      );
      await document.fonts.ready;
      const bytes = await exportPackage(
        settings,
        uploads,
        includeFonts,
        fontRightsConfirmed,
      );
      download(
        bytes.slice().buffer as ArrayBuffer,
        `${settings.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "counterform"}.zip`,
        "application/zip",
      );
      setNotice("System package exported.");
      setIncludeFonts(false);
      setFontRightsConfirmed(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function exportEditable(format: "svg" | "idml") {
    setBusy(true);
    setError("");
    try {
      if (format === "svg")
        assertFontPermission(
          settings,
          uploads,
          includeFonts,
          fontRightsConfirmed,
        );
      const bytes =
        format === "svg"
          ? await exportSvg(
              settings,
              uploads,
              includeFonts,
              fontRightsConfirmed,
            )
          : await exportIdml(
              settings,
              uploads,
              includeFonts,
              fontRightsConfirmed,
            );
      const name =
        settings.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() ||
        "counterform";
      download(
        bytes,
        `${name}.${format}`,
        format === "svg"
          ? "image/svg+xml"
          : "application/vnd.adobe.indesign-idml-package",
      );
      setNotice(`${format.toUpperCase()} exported with editable text.`);
      setIncludeFonts(false);
      setFontRightsConfirmed(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function exportSocialPng() {
    setBusy(true);
    setError("");
    try {
      const blob = await exportPng(settings, uploads);
      const geometry = surfaceGeometry(settings);
      download(
        blob,
        `${settings.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "counterform"}-${geometry.width}x${geometry.height}.png`,
        "image/png",
      );
      setNotice(
        `Social PNG exported at ${geometry.width} × ${geometry.height}px.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function printCurrent(printAnyway = false) {
    setError("");
    if (selectedPrivateFonts(settings, uploads).length && !includeFonts) {
      setError(
        "Select private font inclusion for this PDF, then confirm that its licence permits embedding.",
      );
      return;
    }
    try {
      assertFontPermission(
        settings,
        uploads,
        includeFonts,
        fontRightsConfirmed,
      );
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    const warning = document
      .querySelector(
        '.canvas .frame-region[data-frame="current"] .font-warning',
      )
      ?.textContent?.trim();
    if (warning?.startsWith("Missing font:")) {
      setError(`Print cannot use the intended type yet. ${warning}`);
      return;
    }
    if (warning && !printAnyway) {
      setPrintWarning(warning);
      return;
    }
    const popup = window.open("", "counterform-print");
    if (!popup) {
      setError(
        "The print window was blocked. Allow pop-ups for this local page and try again.",
      );
      return;
    }
    try {
      popup.document.open();
      popup.document.write(standaloneOutputHtml(settings, fontFaceCss()));
      popup.document.close();
      const selectedIds = new Set(
        Object.values(settings.roles).map((item) => item.fontId),
      );
      for (const font of uploads.filter((item) => selectedIds.has(item.id))) {
        const face = new FontFace(familyAlias(font.id), font.bytes.slice(0), {
          weight: font.weight,
          style: font.style,
        });
        await face.load();
        popup.document.fonts.add(face);
      }
      await popup.document.fonts.ready;
      popup.focus();
      popup.print();
      setPrintWarning("");
      setIncludeFonts(false);
      setFontRightsConfirmed(false);
      setNotice(
        "Print dialog opened. Use 100% scale, no headers or footers, and enable backgrounds.",
      );
    } catch (e) {
      popup.close();
      setError(`Print view could not open. ${(e as Error).message}`);
    }
  }
  async function removeFont(font: UploadedFont) {
    try {
      await deleteUpload(font.id);
      document.fonts.forEach((face) => {
        if (face.family === familyAlias(font.id)) document.fonts.delete(face);
      });
      setUploads((prev) => prev.filter((f) => f.id !== font.id));
      setNotice(
        "Font removed from this device. Saved choices can be restored by uploading it again.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const bodyContrast = contrast(
      settings.palette.ink,
      settings.palette.background,
    ),
    accentContrast = contrast(
      settings.palette.accent,
      settings.palette.background,
    ),
    mutedContrast = contrast(
      settings.palette.muted,
      settings.palette.background,
    );
  const surface = surfaceOf(settings);
  const comparing = Boolean(settings.comparison);
  const shortSaveStatus =
    saveStatus === "Saved on this device"
      ? "Saved"
      : saveStatus === "Saving…"
        ? "Saving"
        : saveStatus === "Not saved"
          ? "Not saved"
          : "Opening";
  const saveStatusLabel = (placement: "header" | "study") => (
    <span
      className={`save-status save-status--${placement}${saveStatus === "Saved on this device" ? " is-saved" : " is-pending"}`}
      title={saveStatus}
    >
      <span
        className={
          saveStatus === "Saved on this device"
            ? "status-dot"
            : "status-dot pending"
        }
      />
      <span className="save-status__full">{saveStatus}</span>
      <span className="save-status__short">{shortSaveStatus}</span>
    </span>
  );
  return (
    <div className="app">
      <header className="app-header">
        <a
          className="wordmark"
          href="./"
          aria-label="Counterform home"
          onClick={(event) => {
            event.preventDefault();
            void flushRef.current().finally(() => {
              window.location.assign("./");
            });
          }}
        >
          counterform<span className="brand-dot">.</span>
        </a>
        <span className="brand-caption">Type, space &amp; colour</span>
        <div className="header-actions">
          {!compactSaveStatus && saveStatusLabel("header")}
          <button
            className="quiet-button icon-label"
            aria-label="Import"
            onClick={() => importInput.current?.click()}
            disabled={busy}
          >
            <ArrowUpFromLine size={16} />
            <span>Import</span>
          </button>
          <button
            className={`quiet-button icon-label ${tab === "saved" ? "active" : ""}`}
            aria-label="Experiments"
            onClick={() => openPanel("saved")}
          >
            <Layers size={16} />
            <span>Experiments</span>
            {saved.length > 0 && <small>{saved.length}</small>}
          </button>
          <button
            className="primary-button"
            onClick={() => openPanel("export")}
          >
            <ArrowDownToLine size={16} />
            Export system
          </button>
        </div>
      </header>
      <input
        type="file"
        ref={importInput}
        hidden
        accept=".json,.zip"
        aria-label="Import experiment file"
        onChange={(e) => handleImport(e.target.files?.[0])}
      />
      <input
        type="file"
        ref={fontInput}
        hidden
        accept=".woff2,.woff,.ttf,.otf"
        aria-label="Upload font file"
        onChange={(e) => handleFont(e.target.files?.[0])}
      />
      <div
        className="workspace-title"
        role="region"
        aria-label="Study information"
      >
        <div>
          <span className="work-label">Working study</span>
          <input
            className="study-name"
            aria-label="Experiment name"
            maxLength={120}
            value={settings.name}
            onChange={(e) =>
              update((s) => {
                s.name = e.target.value;
                return s;
              })
            }
          />
        </div>
        {compactSaveStatus && saveStatusLabel("study")}
        <div className="study-actions">
          <button
            className="quiet-button"
            onClick={saveNamed}
            disabled={!ready}
          >
            <Save size={15} />
            Save snapshot
          </button>
          <button
            className={`quiet-button ${comparing ? "active" : ""}`}
            onClick={() => {
              if (!settings.comparison) {
                setSettings(startComparison(settings));
                setNotice(
                  "A is pinned. Change the current study to compare it as B.",
                );
              } else {
                document
                  .querySelector(".comparison-panel")
                  ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
              }
            }}
            aria-label="Compare"
            aria-pressed={comparing}
          >
            <Columns2 size={16} />
            {comparing ? "Comparing A/B" : "Compare an adjustment"}
          </button>
          <button
            className="icon-button"
            title="Design inspector"
            aria-label="Design inspector"
            onClick={() => {
              if (window.innerWidth <= 800) {
                setInspector(true);
                setTimeout(
                  () =>
                    document
                      .querySelector(".inspector")
                      ?.scrollIntoView({ behavior: "auto" }),
                  0,
                );
              } else setInspector(!inspector);
            }}
          >
            {inspector ? (
              <PanelRightClose size={18} />
            ) : (
              <PanelRightOpen size={18} />
            )}
          </button>
        </div>
      </div>
      <MediumEditor
        settings={settings}
        onChange={setSettings}
        onNotice={setNotice}
      />
      {error && (
        <div className="message error" role="alert">
          <span>{error}</span>
          <button
            className="icon-button"
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {notice && (
        <div className="message notice" role="status">
          <Check size={16} />
          <span>{notice}</span>
        </div>
      )}
      {resetRecovery && (
        <div className="message notice reset-recovery" role="status">
          <div>
            <span>
              {resetRecoveryStored
                ? "Current study reset. Saved snapshots are unchanged."
                : "Current study reset in this tab."}
            </span>
            <small>
              {resetRecoveryStored
                ? "Private fonts are unchanged. Undo stays available until your next study change."
                : "Undo works here, but recovery after reload has not been saved. Export a backup before closing."}
            </small>
          </div>
          <button
            className="outline-button"
            ref={undoResetButton}
            disabled={resetBusy || busy}
            onClick={() => void undoReset()}
          >
            <RotateCcw size={15} /> Undo reset
          </button>
        </div>
      )}
      <main className={`workbench ${inspector ? "" : "inspector-hidden"}`}>
        <section className="canvas-area" aria-label="Composition workbench">
          <div className="canvas-toolbar">
            <div className="composition-tabs" aria-label="Specimen type">
              {(["editorial", "product", "poster"] as const)
                .filter((c) => surface.mode !== "print" || c !== "product")
                .map((c) => (
                  <button
                    key={c}
                    aria-pressed={settings.composition === c}
                    className={settings.composition === c ? "selected" : ""}
                    onClick={() =>
                      update((s) => {
                        s.composition = c;
                        return s;
                      })
                    }
                  >
                    {c === "product"
                      ? "Interface"
                      : c[0].toUpperCase() + c.slice(1)}
                  </button>
                ))}
            </div>
            <button
              className={`quiet-button compose-layout ${settings.layout ? "active" : ""}`}
              onClick={() => openPanel("grid")}
            >
              <Grid2X2 size={16} />{" "}
              {settings.layout ? "Edit layout" : "Compose layout"}
            </button>
            <div className="canvas-tools">
              <button
                className={`icon-button ${showGrid ? "active" : ""}`}
                aria-label="Show grid"
                title="Show grid"
                aria-pressed={showGrid}
                onClick={() => setShowGrid(!showGrid)}
              >
                <Grid2X2 size={17} />
              </button>
              {surface.mode === "web" && (
                <label className="viewport-select">
                  <span className="sr-only">Canvas width</span>
                  <select
                    aria-label="Canvas width"
                    value={settings.width}
                    onChange={(e) =>
                      update((s) => {
                        s.width = Number(e.target.value);
                        return s;
                      })
                    }
                  >
                    <option value={1040}>Desktop · 1040</option>
                    <option value={768}>Tablet · 768</option>
                    <option value={390}>Mobile · 390</option>
                    <option value={320}>Narrow · 320</option>
                    {![1040, 768, 390, 320].includes(settings.width) && (
                      <option value={settings.width}>
                        {settings.width} px
                      </option>
                    )}
                  </select>
                  <ChevronDown size={13} />
                </label>
              )}
            </div>
          </div>
          {missing.length > 0 && (
            <div className="font-warning" role="status">
              Restore the private font for{" "}
              {missing.map((r) => roleNames[r].toLowerCase()).join(", ")} in
              Type. The specimen currently shows a fallback.
            </div>
          )}
          {comparing && (
            <ComparisonPanel settings={settings} onChange={setSettings} />
          )}
          <div className={`canvas ${comparing ? "comparison" : ""}`}>
            <Frame
              uploads={uploads}
              settings={settings}
              grid={showGrid}
              baseline={showBaseline}
              stress={stress}
              label={comparing ? "B / Current adjustment" : undefined}
              selectedBlock={selectedBlock}
              onSelectBlock={(id) => {
                setSelectedBlock(id);
                openPanel("grid");
                requestAnimationFrame(() => {
                  const panel =
                    document.querySelector<HTMLElement>(".inspector");
                  const editor =
                    panel?.querySelector<HTMLElement>(".ge-inspector");
                  if (panel && editor && window.innerWidth > 800)
                    panel.scrollTop +=
                      editor.getBoundingClientRect().top -
                      panel.getBoundingClientRect().top -
                      16;
                });
              }}
            />
            {settings.comparison && (
              <Frame
                uploads={uploads}
                settings={settings.comparison.reference as Settings}
                grid={showGrid}
                baseline={showBaseline}
                stress={stress}
                label="A / Pinned reference"
                frameKind="reference"
              />
            )}
          </div>
          <footer className="canvas-footer">
            <span>{fontStatus}</span>
            <span>
              {fontName(
                settings.roles.display.fontId,
                uploads,
                settings.fontDependencies,
              )}{" "}
              /{" "}
              {fontName(
                settings.roles.body.fontId,
                uploads,
                settings.fontDependencies,
              )}
            </span>
          </footer>
        </section>
        {inspector && (
          <aside className="inspector" aria-label="Design inspector">
            <nav className="inspector-tabs" aria-label="Design controls">
              {(["type", "grid", "colour", "content"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={tab === t ? "selected" : ""}
                  aria-pressed={tab === t}
                >
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </nav>
            <button
              className="quiet-button mobile-return"
              onClick={() =>
                document.querySelector(".canvas-toolbar")?.scrollIntoView()
              }
            >
              Back to specimen
            </button>
            <div className="inspector-body">
              {tab === "type" && (
                <>
                  <PanelHeading title="Good company.">
                    Find a relationship, then make it your own.
                  </PanelHeading>
                  <label className="field-label" htmlFor="pairing">
                    Font pairing
                  </label>
                  <select
                    id="pairing"
                    className="full-select"
                    value={currentPairing?.id ?? "custom"}
                    onChange={(e) =>
                      setSettings(applyPairing(settings, e.target.value))
                    }
                  >
                    {!currentPairing && (
                      <option value="custom">Your combination</option>
                    )}
                    {pairings.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <p className="pairing-reason">
                    {currentPairing?.rationale ??
                      "Assign each face a clear job. Contrast can come from size, weight and space as well as a second family."}
                  </p>
                  <div className="role-list">
                    {roles.map((r) => (
                      <button
                        key={r}
                        className={`role-row ${role === r ? "selected" : ""}`}
                        onClick={() => setRole(r)}
                        aria-pressed={role === r}
                      >
                        <span
                          className="role-sample"
                          style={{
                            fontFamily: `"${familyAlias(settings.roles[r].fontId)}",serif`,
                          }}
                        >
                          {r === "support" ? "Ag" : "Aa"}
                        </span>
                        <span>
                          <small>{roleNames[r]}</small>
                          <strong>
                            {fontName(
                              settings.roles[r].fontId,
                              uploads,
                              settings.fontDependencies,
                            )}
                          </strong>
                        </span>
                        <ChevronRight size={14} />
                      </button>
                    ))}
                  </div>
                  <div className="role-controls">
                    <div className="section-label">
                      {roleNames[role]} settings
                    </div>
                    <label className="sr-only" htmlFor="font-family">
                      Font family
                    </label>
                    <select
                      id="font-family"
                      className="full-select"
                      value={settings.roles[role].fontId}
                      onChange={(e) => chooseFont(e.target.value)}
                    >
                      {!selectedFont && !selectedUpload && (
                        <option value={settings.roles[role].fontId}>
                          Missing font · restore below
                        </option>
                      )}
                      <optgroup label="Open font library">
                        {fonts.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </optgroup>
                      {uploads.length > 0 && (
                        <optgroup label="Your private fonts">
                          {uploads.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    <div className="two-fields">
                      <label>
                        Weight
                        <select
                          aria-label="Font weight"
                          value={settings.roles[role].weight}
                          onChange={(e) =>
                            setRoleValue("weight", Number(e.target.value))
                          }
                        >
                          {!weights.includes(settings.roles[role].weight) && (
                            <option value={settings.roles[role].weight}>
                              {settings.roles[role].weight}
                            </option>
                          )}
                          {weights.map((w) => (
                            <option key={w} value={w}>
                              {w}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Style
                        <select
                          aria-label="Font style"
                          value={settings.roles[role].style}
                          onChange={(e) => {
                            const style = e.target.value;
                            const file = availableFiles.find(
                              (f) => f.style === style,
                            );
                            update((s) => {
                              s.roles[role].style = style as
                                "normal" | "italic";
                              if (file) {
                                const [min, max] = file.weight
                                  .split(" ")
                                  .map(Number);
                                s.roles[role].weight = Math.min(
                                  max ?? min,
                                  Math.max(min, s.roles[role].weight),
                                );
                              }
                              return s;
                            });
                          }}
                        >
                          {styles.length ? (
                            styles.map((st) => (
                              <option key={st} value={st}>
                                {st === "normal" ? "Roman" : "Italic"}
                              </option>
                            ))
                          ) : (
                            <option value="normal">Roman</option>
                          )}
                        </select>
                      </label>
                    </div>
                    <Range
                      label="Size"
                      value={settings.roles[role].size}
                      min={role === "display" ? 24 : 8}
                      max={role === "display" ? 160 : 36}
                      unit="px"
                      onChange={(v) => setRoleValue("size", v)}
                    />
                    <Range
                      label="Line height"
                      value={settings.roles[role].leading}
                      min={0.8}
                      max={2.5}
                      step={0.01}
                      onChange={(v) => setRoleValue("leading", v)}
                    />
                    <Range
                      label="Tracking"
                      value={settings.roles[role].tracking}
                      min={-0.04}
                      max={0.2}
                      step={0.005}
                      unit="em"
                      onChange={(v) => setRoleValue("tracking", v)}
                    />
                    {role === "body" && (
                      <Range
                        label="Reading measure"
                        value={settings.measure}
                        min={20}
                        max={100}
                        unit="ch"
                        onChange={(v) =>
                          update((s) => {
                            s.measure = v;
                            return s;
                          })
                        }
                      />
                    )}
                    {selectedFont?.axes
                      ?.filter((a) => a.tag !== "wght")
                      .map((axis) => (
                        <Range
                          key={axis.tag}
                          label={
                            axis.tag === "opsz"
                              ? "Optical size"
                              : axis.tag === "SOFT"
                                ? "Softness"
                                : axis.tag === "WONK"
                                  ? "Wonky forms"
                                  : axis.tag === "wdth"
                                    ? "Width"
                                    : axis.tag
                          }
                          value={
                            settings.roles[role].axes[axis.tag] ??
                            (axis.tag === "opsz"
                              ? Math.min(
                                  axis.max,
                                  Math.max(axis.min, settings.roles[role].size),
                                )
                              : axis.default)
                          }
                          min={axis.min}
                          max={axis.max}
                          step={axis.max - axis.min <= 1 ? 0.1 : 1}
                          onChange={(v) =>
                            setRoleValue("axes", {
                              ...settings.roles[role].axes,
                              [axis.tag]: v,
                            })
                          }
                        />
                      ))}
                    {selectedFont && (
                      <p className="fine-print">
                        {selectedFont.description}
                        <br />
                        <span>Designed by {selectedFont.designer}.</span>
                      </p>
                    )}
                  </div>
                  <details className="upload-section">
                    <summary>
                      Your font files <Plus size={15} />
                    </summary>
                    <p className="fine-print">
                      Private to this browser. WOFF2, WOFF, TTF or OTF, up to 20
                      MB. Set the file’s actual weight and style before adding
                      it.
                    </p>
                    <div className="two-fields">
                      <label>
                        Weight / range
                        <input
                          aria-label="Upload font weight"
                          value={uploadWeight}
                          onChange={(e) => setUploadWeight(e.target.value)}
                          placeholder="400 or 100 900"
                        />
                      </label>
                      <label>
                        Style
                        <select
                          aria-label="Upload font style"
                          value={uploadStyle}
                          onChange={(e) =>
                            setUploadStyle(
                              e.target.value as "normal" | "italic",
                            )
                          }
                        >
                          <option value="normal">Roman</option>
                          <option value="italic">Italic</option>
                        </select>
                      </label>
                    </div>
                    <button
                      className="outline-button full-width"
                      disabled={busy}
                      onClick={() => fontInput.current?.click()}
                    >
                      <Plus size={16} />
                      Add a font file
                    </button>
                    {uploads.map((f) => (
                      <div className="uploaded-row" key={f.id}>
                        <input
                          aria-label={`Name for ${f.name}`}
                          value={f.name}
                          onChange={(e) => {
                            const name = e.target.value.slice(0, 120);
                            setUploads((prev) =>
                              prev.map((u) =>
                                u.id === f.id ? { ...u, name } : u,
                              ),
                            );
                          }}
                          onBlur={async () => {
                            try {
                              await saveUpload(f);
                            } catch (e) {
                              setError((e as Error).message);
                            }
                          }}
                        />
                        <button
                          className="icon-button"
                          aria-label={`Remove ${f.name}`}
                          onClick={() => removeFont(f)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </details>
                  <div className="inspector-footnote">
                    12 open families. Eight starting points.
                    <br />
                    Good typography lives in the adjustments.
                  </div>
                </>
              )}
              {tab === "grid" && (
                <>
                  <GridEditor
                    settings={settings}
                    onChange={(next) => {
                      try {
                        setSettings(validateSettings(next));
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                    selectedBlock={selectedBlock}
                    onSelectBlock={setSelectedBlock}
                  />
                  {!settings.layout && (
                    <>
                      <PanelHeading title="Room to breathe.">
                        A grid gives your choices something to relate to.
                      </PanelHeading>
                      <label className="field-label" htmlFor="layout">
                        Composition structure
                      </label>
                      <select
                        id="layout"
                        className="full-select"
                        value={settings.grid.layout}
                        onChange={(e) =>
                          update((s) => {
                            s.grid.layout = e.target
                              .value as Settings["grid"]["layout"];
                            return s;
                          })
                        }
                      >
                        <option value="asymmetric">
                          Asymmetric · room in the margin
                        </option>
                        <option value="balanced">
                          Balanced · close conversation
                        </option>
                        <option value="compact">
                          Reading-led · wider text field
                        </option>
                      </select>
                      <Range
                        label="Columns"
                        value={settings.grid.columns}
                        min={1}
                        max={16}
                        onChange={(v) =>
                          update((s) => {
                            s.grid.columns = v;
                            return s;
                          })
                        }
                      />
                      <Range
                        label="Gutter"
                        value={settings.grid.gutter}
                        min={0}
                        max={64}
                        unit="px"
                        onChange={(v) =>
                          update((s) => {
                            s.grid.gutter = v;
                            return s;
                          })
                        }
                      />
                      <Range
                        label="Page margin"
                        value={settings.grid.margin}
                        min={12}
                        max={120}
                        unit="px"
                        onChange={(v) =>
                          update((s) => {
                            s.grid.margin = v;
                            return s;
                          })
                        }
                      />
                      <Range
                        label="Reading measure"
                        value={settings.measure}
                        min={20}
                        max={100}
                        unit="ch"
                        onChange={(v) =>
                          update((s) => {
                            s.measure = v;
                            return s;
                          })
                        }
                      />
                      <Range
                        label="Modular divisions"
                        value={settings.grid.modules}
                        min={2}
                        max={12}
                        onChange={(v) =>
                          update((s) => {
                            s.grid.modules = v;
                            return s;
                          })
                        }
                      />
                      <Range
                        label="Baseline interval"
                        value={settings.grid.baseline}
                        min={4}
                        max={32}
                        unit="px"
                        onChange={(v) =>
                          update((s) => {
                            s.grid.baseline = v;
                            return s;
                          })
                        }
                      />
                    </>
                  )}
                  <div className="switch-list">
                    <label>
                      <input
                        type="checkbox"
                        checked={showGrid}
                        onChange={(e) => setShowGrid(e.target.checked)}
                      />
                      Columns &amp; modules
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={showBaseline}
                        onChange={(e) => setShowBaseline(e.target.checked)}
                      />
                      Baseline guide
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={stress}
                        onChange={(e) => setStress(e.target.checked)}
                      />
                      Text-spacing stress test
                    </label>
                  </div>
                  <p className="fine-print">
                    {settings.layout
                      ? "Grid guides follow your layout. Flowlines and text baselines are distinct; the baseline guide does not automatically align glyphs."
                      : "Guides reveal relationships; they do not snap every text baseline. Modular divisions are an overlay. Below 600 px, content reflows to one column."}
                  </p>
                  <p className="fine-print">
                    The spacing test applies WCAG override values to check
                    resilience. These are test values, not recommended defaults.
                  </p>
                </>
              )}
              {tab === "colour" && (
                <>
                  <PanelHeading title="Set the atmosphere.">
                    Colour changes how a typeface feels, and how clearly it
                    reads.
                  </PanelHeading>
                  <div className="palette-list">
                    {palettes.map((p) => (
                      <button
                        key={p.name}
                        className={
                          settings.palette.name === p.name ? "selected" : ""
                        }
                        onClick={() =>
                          update((s) => {
                            s.palette = { ...p };
                            return s;
                          })
                        }
                      >
                        <span className="palette-swatches">
                          {[p.background, p.ink, p.accent].map((color, i) => (
                            <i key={i} style={{ background: color }} />
                          ))}
                        </span>
                        <span>{p.name}</span>
                        {settings.palette.name === p.name && (
                          <Check size={14} />
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="section-label">Make it yours</div>
                  {(
                    ["background", "ink", "muted", "accent", "panel"] as const
                  ).map((k) => (
                    <label className="colour-field" key={k}>
                      <span>
                        {
                          {
                            background: "Paper",
                            ink: "Primary ink",
                            muted: "Secondary ink",
                            accent: "Accent",
                            panel: "Panel",
                          }[k]
                        }
                      </span>
                      <span>
                        <code>{settings.palette[k].toUpperCase()}</code>
                        <input
                          type="color"
                          aria-label={`${k} colour`}
                          value={settings.palette[k]}
                          onChange={(e) =>
                            update((s) => {
                              s.palette[k] = e.target.value;
                              s.palette.name = "Custom palette";
                              return s;
                            })
                          }
                        />
                      </span>
                    </label>
                  ))}
                  <div className="contrast-section">
                    <h3>Contrast on paper</h3>
                    {[
                      ["Primary ink", bodyContrast],
                      ["Secondary ink", mutedContrast],
                      ["Accent", accentContrast],
                    ].map(([name, ratio]) => (
                      <div className="contrast-row" key={name}>
                        <span>{name}</span>
                        <strong>{Number(ratio).toFixed(2)}:1</strong>
                        <span
                          className={
                            Number(ratio) >= 4.5
                              ? "contrast-pass"
                              : "contrast-fail"
                          }
                        >
                          {Number(ratio) >= 4.5
                            ? "AA text"
                            : Number(ratio) >= 3
                              ? "Large only"
                              : "Low"}
                        </span>
                      </div>
                    ))}
                    <p className="fine-print">
                      AA needs 4.5:1 for normal text, 3:1 for large text. These
                      checks measure contrast, not the quality of a pairing.
                      Panel contrast is included in the export notes.
                    </p>
                  </div>
                </>
              )}
              {tab === "content" && (
                <>
                  <PanelHeading title="Put it into words.">
                    Test with the language your design will actually carry.
                  </PanelHeading>
                  {(["title", "deck", "body", "quote", "caption"] as const).map(
                    (k) => (
                      <label className="content-field" key={k}>
                        <span>
                          {
                            {
                              title: "Headline",
                              deck: "Introduction",
                              body: "Reading text",
                              quote: "Pull quote",
                              caption: "Caption",
                            }[k]
                          }
                        </span>
                        <textarea
                          aria-label={
                            k === "title"
                              ? "Headline"
                              : k === "body"
                                ? "Reading text"
                                : k
                          }
                          rows={k === "body" ? 12 : k === "title" ? 3 : 4}
                          maxLength={20000}
                          value={settings.content[k]}
                          onChange={(e) =>
                            update((s) => {
                              s.content[k] = e.target.value;
                              return s;
                            })
                          }
                        />
                      </label>
                    ),
                  )}
                  <p className="fine-print">
                    Use a blank line between paragraphs. Your content stays with
                    you when you change specimens.
                  </p>
                  <button
                    className="outline-button"
                    onClick={() =>
                      update((s) => {
                        s.content = defaultSettings().content;
                        return s;
                      })
                    }
                  >
                    <RotateCcw size={14} />
                    Restore specimen copy
                  </button>
                </>
              )}
              {tab === "saved" && (
                <>
                  <PanelHeading title="Keep a good thought.">
                    Snapshots stay on this device. Export a package to take one
                    elsewhere.
                  </PanelHeading>
                  <button
                    className="primary-button full-width"
                    onClick={saveNamed}
                    disabled={!ready}
                  >
                    <Save size={16} />
                    Save current snapshot
                  </button>
                  {saved.length === 0 ? (
                    <div className="empty-state">
                      <Layers size={30} />
                      <h3>A place for possibilities.</h3>
                      <p>
                        Save a snapshot when something clicks. You can come back
                        to it or pin it for comparison.
                      </p>
                    </div>
                  ) : (
                    <div className="saved-list">
                      {saved.map((item) => (
                        <div key={item.id} className="saved-item">
                          <div
                            className="saved-preview"
                            style={{
                              background: item.settings.palette.background,
                              color: item.settings.palette.ink,
                              fontFamily: `"${familyAlias(item.settings.roles.display.fontId)}",serif`,
                            }}
                          >
                            Aa
                            <span
                              style={{
                                background: item.settings.palette.accent,
                              }}
                            />
                          </div>
                          <h3>{item.settings.name || "Untitled study"}</h3>
                          <p>
                            {item.settings.composition} ·{" "}
                            {new Date(item.updatedAt).toLocaleDateString()}
                          </p>
                          <div>
                            <button
                              className="quiet-button"
                              onClick={() => {
                                setSettings(structuredClone(item.settings));
                                setNotice("Snapshot restored.");
                              }}
                            >
                              Open
                            </button>
                            <button
                              className="quiet-button"
                              onClick={() => {
                                const next = structuredClone(settings);
                                next.comparison = {
                                  reference: withoutComparison(item.settings),
                                  intent: "",
                                };
                                setSettings(next);
                                setNotice("Snapshot pinned as reference.");
                              }}
                            >
                              Compare
                            </button>
                            <button
                              className="icon-button"
                              aria-label={`Delete snapshot ${item.settings.name}`}
                              onClick={async () => {
                                try {
                                  await deleteExperiment(item.id);
                                  setSaved((prev) =>
                                    prev.filter((s) => s.id !== item.id),
                                  );
                                } catch (e) {
                                  setError((e as Error).message);
                                }
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    className="outline-button full-width"
                    onClick={() => importInput.current?.click()}
                    disabled={busy}
                  >
                    <ArrowUpFromLine size={15} />
                    Import a study
                  </button>
                </>
              )}
              {tab === "export" && (
                <>
                  <PanelHeading title="Give it a life outside.">
                    Your choices, ready for another project or another pair of
                    hands.
                  </PanelHeading>
                  <div className="export-summary">
                    <span
                      className="export-monogram"
                      style={{
                        fontFamily: `"${familyAlias(settings.roles.display.fontId)}",serif`,
                        color: settings.palette.accent,
                      }}
                    >
                      Aa
                    </span>
                    <h3>{settings.name || "Untitled study"}</h3>
                    <p>
                      {settings.palette.name}
                      <br />
                      {surfaceGeometry(settings).label}
                      {settings.comparison && (
                        <>
                          <br />
                          Exporting B · current adjustment
                        </>
                      )}
                    </p>
                  </div>
                  <div
                    className="export-contents"
                    aria-label="Download contents"
                  >
                    <h3>Before you download</h3>
                    <p>
                      {surface.mode === "web"
                        ? `${surfaceGeometry(settings).width}px wide × ${Math.ceil(document.querySelector<HTMLElement>('.frame-region[data-frame="current"] .specimen')?.scrollHeight ?? 0)}px current content height`
                        : surfaceGeometry(settings).label}
                    </p>
                    <ul>
                      <li>
                        <strong>System ZIP</strong> · JSON, HTML, CSS, design
                        note, font manifest, selected open fonts and licences
                      </li>
                      <li>
                        <strong>Illustrator SVG</strong> · editable text,
                        colours and page artwork; selected open fonts embedded
                      </li>
                      {surface.mode === "print" && (
                        <li>
                          <strong>Illustrator PDF</strong> · browser Save as
                          PDF,{" "}
                          {surface.pages === "facing"
                            ? "one facing spread sheet"
                            : "one page"}
                          ; PDF font embedding follows the browser
                        </li>
                      )}
                      {surface.mode === "print" && (
                        <li>
                          <strong>InDesign IDML</strong> ·{" "}
                          {surface.pages === "facing"
                            ? "one facing spread"
                            : "one page"}
                          , text frames, paragraph styles and palette swatches
                        </li>
                      )}
                      {surface.mode === "social" && (
                        <li>
                          <strong>Social PNG</strong> ·{" "}
                          {surfaceGeometry(settings).width} ×{" "}
                          {surfaceGeometry(settings).height}px image; text is
                          pixels
                        </li>
                      )}
                      <li>
                        <strong>Settings JSON</strong> · editable Counterform
                        settings, no font files
                      </li>
                    </ul>
                    {surface.mode === "web" && (
                      <p>
                        Choose Print for a physical page PDF or IDML document.
                      </p>
                    )}
                    <p>
                      Private font files:{" "}
                      {includeFonts &&
                      selectedPrivateFonts(settings, uploads).length
                        ? "included in ZIP or SVG; the browser may embed them in PDF"
                        : "excluded from ZIP and SVG"}
                      . IDML links font names; it does not contain font files.
                      PNG contains pixels, no font files. Adobe may require
                      installed fonts even when SVG has embedded font data; the
                      system ZIP includes selected open fonts and licences. SVG
                      and IDML keep text editable. InDesign text frames and
                      styles are reconstructed from the visible study; its CSS
                      grid and custom variable axes may need adjustment.
                    </p>
                  </div>
                  {selectedPrivateFonts(settings, uploads).length > 0 && (
                    <>
                      <label className="checkbox-block">
                        <input
                          type="checkbox"
                          checked={includeFonts}
                          onChange={(e) => {
                            setIncludeFonts(e.target.checked);
                            setFontRightsConfirmed(false);
                          }}
                        />
                        <span>
                          Include selected private font files in this ZIP, SVG
                          or PDF
                          <small>
                            Private files are excluded unless selected for this
                            download.
                          </small>
                        </span>
                      </label>
                      <label className="checkbox-block">
                        <input
                          type="checkbox"
                          checked={fontRightsConfirmed}
                          onChange={(e) =>
                            setFontRightsConfirmed(e.target.checked)
                          }
                        />
                        <span>
                          I confirm my licence permits including or embedding
                          the selected private font in this download or PDF.
                        </span>
                      </label>
                    </>
                  )}
                  <button
                    className="outline-button full-width export-output-action"
                    disabled={busy || !ready}
                    onClick={() => exportEditable("svg")}
                  >
                    <ArrowDownToLine size={16} />
                    Download editable SVG for Illustrator
                  </button>
                  {surface.mode === "print" && (
                    <button
                      className="outline-button full-width export-output-action"
                      disabled={busy || !ready}
                      onClick={() => exportEditable("idml")}
                    >
                      <ArrowDownToLine size={16} />
                      Download IDML for InDesign
                    </button>
                  )}
                  {surface.mode === "social" && (
                    <button
                      className="primary-button full-width export-output-action"
                      disabled={busy || !ready}
                      onClick={exportSocialPng}
                    >
                      <ArrowDownToLine size={16} />
                      {busy
                        ? "Rendering PNG…"
                        : `Download ${surfaceGeometry(settings).width} × ${surfaceGeometry(settings).height}px PNG`}
                    </button>
                  )}
                  {surface.mode === "print" && (
                    <>
                      <button
                        className="primary-button full-width export-output-action"
                        disabled={busy || !ready}
                        onClick={() => printCurrent()}
                      >
                        <Printer size={16} />
                        Illustrator PDF / Save as PDF
                      </button>
                      {printWarning && (
                        <div className="print-warning" role="status">
                          <strong>Print preview needs attention</strong>
                          <span>{printWarning}</span>
                          <button
                            className="outline-button"
                            type="button"
                            onClick={() => printCurrent(true)}
                          >
                            Print anyway
                          </button>
                        </div>
                      )}
                      <p className="print-instructions">
                        Browser print uses one{" "}
                        {surface.pages === "facing"
                          ? "double-width spread sheet"
                          : "page"}
                        . Choose 100% scale, turn off headers and footers, and
                        enable backgrounds. The browser may override these
                        settings.
                      </p>
                    </>
                  )}
                  <button
                    className={`${surface.mode === "web" ? "primary-button" : "outline-button"} full-width`}
                    disabled={busy || !ready}
                    onClick={exportZip}
                  >
                    <ArrowDownToLine size={16} />
                    {busy
                      ? "Preparing package…"
                      : settings.comparison
                        ? "Export current adjustment package"
                        : "Download system package"}
                  </button>
                  <button
                    className="quiet-button full-width"
                    disabled={!ready}
                    onClick={() =>
                      download(
                        JSON.stringify(
                          withFontDependencies(settings, uploads),
                          null,
                          2,
                        ),
                        "counterform-settings.json",
                        "application/json",
                      )
                    }
                  >
                    Download settings only
                  </button>
                  <p className="fine-print">
                    The package opens without Counterform. Guides and
                    stress-test settings are excluded. Uploaded fonts are never
                    sent to a server.
                  </p>
                </>
              )}
            </div>
          </aside>
        )}
      </main>
      <footer className="app-footer">
        <span>
          Counterform <span className="footer-divider">/</span> An instrument
          for looking closer.
        </span>
        <button
          className="quiet-button"
          ref={resetButton}
          disabled={!ready || resetBusy || busy}
          onClick={() => void resetCurrentStudy()}
        >
          <RotateCcw size={13} />
          Reset current study
        </button>
      </footer>
    </div>
  );
}
