import clsx from "clsx";
import {
  Activity,
  BarChart3,
  Box,
  Camera,
  Clapperboard,
  Compass,
  CornerDownLeft,
  FileText,
  HeartPulse,
  Info,
  Keyboard,
  Layers,
  Link2,
  RotateCcw,
  Scissors,
  Redo2,
  Search,
  Undo2,
  User,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { cardiacAudio } from "../../lib/audio";
import { pct } from "../../lib/format";
import { fuzzyIndices, fuzzyScore } from "../../lib/fuzzy";
import { TARGET_ORDER } from "../../lib/types";
import { copyShareLink } from "../../state/share";
import { useIsModified, useStore } from "../../state/store";
import { RiskDots, truthText } from "../patient/CasePicker";
import { Kbd } from "../ui/primitives";
import { MOD } from "./Chrome";
import { LAYERS, VIEW_PRESETS } from "../viewer/config";

interface Command {
  id: string;
  group: string;
  title: string;
  subtitle?: string;
  keywords?: string;
  icon: LucideIcon;
  right?: ReactNode;
  /** Layer toggles keep the palette open so several can be flipped in a row. */
  keepOpen?: boolean;
  run: () => void;
}

const GROUP_ORDER = ["Go to", "Explain", "Actions", "3D view", "Layers", "Hold-out patients"];
const BROWSE_LIMIT: Record<string, number> = { Layers: 4, "Hold-out patients": 5 };
const SEARCH_LIMIT = 8;

function OnOff({ on }: { on: boolean }) {
  return (
    <motion.span
      key={String(on)}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 26 }}
      className={clsx(
        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        on ? "bg-accent-soft text-accent" : "bg-white/[0.05] text-ink-3",
      )}
    >
      {on ? "On" : "Off"}
    </motion.span>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  const hits = new Set(fuzzyIndices(query, text));
  if (!hits.size) return <>{text}</>;
  return (
    <>
      {[...text].map((ch, i) =>
        hits.has(i) ? (
          <span key={i} className="font-semibold text-accent">
            {ch}
          </span>
        ) : (
          ch
        ),
      )}
    </>
  );
}

/** Everything the palette can do, built from the current app state. */
function useCommands(): Command[] {
  const cases = useStore((s) => s.cases);
  const prediction = useStore((s) => s.prediction);
  const viewer = useStore((s) => s.viewer);
  const section = useStore((s) => s.section);
  const activeCaseId = useStore((s) => s.activeCaseId);
  const modified = useIsModified();
  const trailLength = useStore((s) => s.trail.length);
  const cursor = useStore((s) => s.cursor);

  return useMemo(() => {
    const st = useStore.getState;
    const toAnalysis = () => st().setTab("analysis");
    const list: Command[] = [
      {
        id: "tab-analysis",
        group: "Go to",
        title: "Patient analysis",
        subtitle: "3D heart, risk and explanations",
        icon: Activity,
        run: toAnalysis,
      },
      {
        id: "tab-model",
        group: "Go to",
        title: "Model performance",
        subtitle: "Validation, ROC, calibration and decision curves",
        keywords: "metrics auc threshold cohort",
        icon: BarChart3,
        run: () => st().setTab("model"),
      },
      {
        id: "tab-about",
        group: "Go to",
        title: "About & data",
        subtitle: "Dataset, anatomy, licences and limitations",
        icon: Info,
        run: () => st().setTab("about"),
      },
    ];

    TARGET_ORDER.forEach((t, i) => {
      const pred = prediction?.targets[t];
      list.push({
        id: `explain-${t}`,
        group: "Explain",
        title: t === "cad" ? "Explain overall CAD" : `Focus ${pred?.short ?? t.toUpperCase()} · ${pred?.label ?? ""}`,
        subtitle: pred ? `Current estimate ${pct(pred.probability)} · threshold ${pct(pred.threshold)}` : undefined,
        keywords: `${t} shap why explanation artery vessel`,
        icon: HeartPulse,
        right: <Kbd>{i}</Kbd>,
        run: () => {
          toAnalysis();
          st().select(t);
        },
      });
    });

    list.push(
      {
        id: "report",
        group: "Actions",
        title: "Open the patient report",
        subtitle: "Printable summary with a 3D snapshot",
        keywords: "pdf print",
        icon: FileText,
        run: () => st().setReportOpen(true),
      },
      {
        id: "flythrough",
        group: "Actions",
        title: "Play the 3D fly-through",
        subtitle: "Cinematic tour of the arteries with their risks",
        keywords: "cinematic camera tour animation video",
        icon: Clapperboard,
        run: () => {
          toAnalysis();
          st().setFlythrough(true);
        },
      },
      {
        id: "tour",
        group: "Actions",
        title: "Start the guided tour",
        icon: Compass,
        keywords: "help onboarding",
        run: () => {
          toAnalysis();
          st().setTourStep(0);
        },
      },
      {
        id: "section",
        group: "Actions",
        title: section > 0 ? "Close the cross-section" : "Cut through the heart",
        subtitle: "Cross-section revealing the chambers",
        keywords: "cross section clip slice chambers",
        icon: Scissors,
        right: <OnOff on={section > 0} />,
        run: () => {
          toAnalysis();
          st().setSection(st().section > 0 ? 0 : 0.45);
        },
      },
      {
        id: "snapshot",
        group: "Actions",
        title: "Save a 3D snapshot",
        subtitle: "PNG of the current view",
        keywords: "image screenshot png export",
        icon: Camera,
        run: () => {
          const url = st().snapshot?.();
          if (!url) {
            toAnalysis();
            st().showToast("Snapshot unavailable", "Open the 3D view and try again");
            return;
          }
          const a = document.createElement("a");
          a.href = url;
          a.download = `cardiolens-3d-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`;
          a.click();
          st().showToast("Snapshot saved", "PNG of the current 3D view");
        },
      },
      {
        id: "share",
        group: "Actions",
        title: "Copy a link to this patient",
        subtitle: "Reopens the same inputs and explained target",
        keywords: "share url link clipboard",
        icon: Link2,
        run: () => void copyShareLink(),
      },
      {
        id: "audio-toggle",
        group: "Actions",
        title: "Toggle cardiac auscultation audio",
        subtitle: "Simulated lub-dub valve closure at patient pulse rate",
        keywords: "sound audio heartbeat stethoscope bpm auscultation",
        icon: Volume2,
        right: <OnOff on={cardiacAudio.isEnabled} />,
        run: () => {
          const next = cardiacAudio.toggle();
          st().showToast(next ? "Cardiac audio enabled" : "Cardiac audio muted");
        },
      },
      {
        id: "shortcuts",
        group: "Actions",
        title: "Keyboard shortcuts",
        icon: Keyboard,
        right: <Kbd>?</Kbd>,
        run: () => st().setShortcutsOpen(true),
      },
    );
    const { trail, cursor } = st();
    if (cursor > 0) {
      list.push({
        id: "undo",
        group: "Actions",
        title: "Undo the last edit",
        subtitle: trail[cursor]?.label,
        keywords: "history back revert",
        icon: Undo2,
        right: <Kbd>{MOD} Z</Kbd>,
        run: () => st().undo(),
      });
    }
    if (cursor < trail.length - 1) {
      list.push({
        id: "redo",
        group: "Actions",
        title: "Redo",
        subtitle: trail[cursor + 1]?.label,
        keywords: "history forward",
        icon: Redo2,
        run: () => st().redo(),
      });
    }
    if (modified) {
      list.push({
        id: "reset",
        group: "Actions",
        title: "Reset edits",
        subtitle: "Back to the loaded patient",
        keywords: "undo revert",
        icon: RotateCcw,
        run: () => {
          const { baseline, loadPatient } = st();
          if (baseline) loadPatient(baseline.patient, baseline.label, activeCaseId);
        },
      });
    }

    for (const [id, v] of Object.entries(VIEW_PRESETS)) {
      list.push({
        id: `view-${id}`,
        group: "3D view",
        title: `View: ${v.label}`,
        keywords: "camera projection",
        icon: Box,
        run: () => {
          toAnalysis();
          st().flyTo(id);
        },
      });
    }

    for (const l of LAYERS) {
      list.push({
        id: `layer-${l.key}`,
        group: "Layers",
        title: l.label,
        subtitle: l.hint,
        keywords: "layer toggle show hide effect",
        icon: Layers,
        right: <OnOff on={viewer[l.key]} />,
        keepOpen: true,
        run: () => st().toggleViewer(l.key),
      });
    }

    for (const c of cases) {
      list.push({
        id: `case-${c.id}`,
        group: "Hold-out patients",
        title: `#${c.patient_id} · ${c.subtitle}`,
        subtitle: `${truthText(c)}${c.id === activeCaseId ? " · open now" : ""}`,
        keywords: `patient case ${truthText(c)} cad ${pct(c.predicted.cad)}`,
        icon: User,
        right: <RiskDots c={c} />,
        run: () => {
          st().loadPatient(c.features, c.title, c.id);
          toAnalysis();
        },
      });
    }
    return list;
  }, [cases, prediction, viewer, section, activeCaseId, modified, trailLength, cursor]);
}

// With a query, results scoring below this share of the best match are dropped as noise
// (characters scattered across unrelated words).
const RELATIVE_CUTOFF = 0.4;

function rank(commands: Command[], query: string) {
  const q = query.trim();
  const scored: { cmd: Command; score: number }[] = [];
  for (const cmd of commands) {
    const score = q ? fuzzyScore(q, `${cmd.title} ${cmd.keywords ?? ""}`) : 0;
    if (score != null) scored.push({ cmd, score });
  }
  const best = Math.max(0, ...scored.map((s) => s.score));
  const groups = new Map<string, { cmd: Command; score: number }[]>();
  for (const s of scored) {
    if (q && best > 0 && s.score < best * RELATIVE_CUTOFF) continue;
    if (!groups.has(s.cmd.group)) groups.set(s.cmd.group, []);
    groups.get(s.cmd.group)!.push(s);
  }
  const out = [...groups.entries()].map(([group, items]) => {
    const sorted = q ? [...items].sort((a, b) => b.score - a.score) : items;
    const limit = q ? SEARCH_LIMIT : (BROWSE_LIMIT[group] ?? SEARCH_LIMIT);
    return { group, items: sorted.slice(0, limit), total: items.length, best: sorted[0]?.score ?? 0 };
  });
  return q
    ? out.sort((a, b) => b.best - a.best)
    : out.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
}

function Palette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const commands = useCommands();
  const results = useMemo(() => rank(commands, query), [commands, query]);
  const flat = useMemo(() => results.flatMap((g) => g.items.map((i) => i.cmd)), [results]);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    input.current?.focus();
    return () => previous?.focus?.();
  }, []);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    const id = flat[active]?.id;
    if (id) itemRefs.current.get(id)?.scrollIntoView({ block: "nearest" });
  }, [active, flat]);

  const run = (cmd: Command | undefined) => {
    if (!cmd) return;
    if (!cmd.keepOpen) onClose();
    cmd.run();
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (flat.length ? (a + 1) % flat.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (flat.length ? (a - 1 + flat.length) % flat.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(flat[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  let index = -1;
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 px-4 pt-[11vh] backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="panel glow-border relative w-full max-w-xl overflow-hidden shadow-[0_30px_90px_-20px_rgb(0_0_0/0.9)]"
        initial={{ opacity: 0, y: -16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 420, damping: 32 }}
      >
        <div className="live-line" aria-hidden />
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <Search size={16} className="shrink-0 text-accent" aria-hidden />
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search patients, views, layers and actions…"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-3 focus:outline-none"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={flat[active] ? `palette-${flat[active].id}` : undefined}
            aria-autocomplete="list"
          />
          <Kbd>Esc</Kbd>
        </div>

        <div id="palette-list" role="listbox" className="scroll-slim max-h-[58vh] overflow-y-auto p-2">
          {flat.length === 0 && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-3 py-10 text-center text-xs text-ink-3">
              Nothing matches “{query}”. Try a patient number, “normal”, “x-ray” or “report”.
            </motion.p>
          )}
          {results.map((g, gi) => (
            <div key={g.group} className="mb-1">
              <p className="label-caps flex items-center justify-between px-2.5 pb-1 pt-2">
                {g.group}
                {g.total > g.items.length && (
                  <span className="normal-case tracking-normal text-ink-3">
                    {g.items.length} of {g.total}
                    {query.trim() ? " · add a word to narrow" : " · type to search"}
                  </span>
                )}
              </p>
              {g.items.map(({ cmd }, ii) => {
                index += 1;
                const i = index;
                const isActive = i === active;
                const Icon = cmd.icon;
                return (
                  <motion.button
                    key={cmd.id}
                    id={`palette-${cmd.id}`}
                    ref={(el) => {
                      if (el) itemRefs.current.set(cmd.id, el);
                      else itemRefs.current.delete(cmd.id);
                    }}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(0.25, gi * 0.04 + ii * 0.02), duration: 0.22 }}
                    onMouseMove={() => active !== i && setActive(i)}
                    onClick={() => run(cmd)}
                    className="relative flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left"
                  >
                    {isActive && (
                      <motion.span
                        layoutId="palette-active"
                        className="absolute inset-0 rounded-lg bg-white/[0.06] ring-1 ring-white/[0.08]"
                        transition={{ type: "spring", stiffness: 520, damping: 40 }}
                      >
                        <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent shadow-[0_0_8px_rgb(92_200_245/0.8)]" />
                      </motion.span>
                    )}
                    <span
                      className={clsx(
                        "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md ring-1 transition-colors",
                        isActive ? "bg-accent-soft text-accent ring-accent/30" : "bg-white/[0.04] text-ink-3 ring-white/[0.06]",
                      )}
                    >
                      <Icon size={14} aria-hidden />
                    </span>
                    <span className="relative min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ink">
                        <Highlight text={cmd.title} query={query} />
                      </span>
                      {cmd.subtitle && <span className="block truncate text-[11px] text-ink-3">{cmd.subtitle}</span>}
                    </span>
                    {cmd.right && <span className="relative shrink-0">{cmd.right}</span>}
                    <AnimatePresence>
                      {isActive && (
                        <motion.span
                          initial={{ opacity: 0, x: -4 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0 }}
                          className="relative shrink-0 text-ink-3"
                          aria-hidden
                        >
                          <CornerDownLeft size={13} />
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-line px-4 py-2 text-[11px] text-ink-3">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
            <Kbd className="ml-2">↵</Kbd> select
          </span>
          <span className="tabular">
            {flat.length} result{flat.length === 1 ? "" : "s"}
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Ctrl/⌘ K: search patients, 3D views, layers and actions from anywhere. */
export function CommandPalette() {
  const open = useStore((s) => s.paletteOpen);
  const setOpen = useStore((s) => s.setPaletteOpen);
  const ready = useStore((s) => s.disclaimerAccepted);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (useStore.getState().disclaimerAccepted) setOpen(!useStore.getState().paletteOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  return <AnimatePresence>{open && ready && <Palette onClose={() => setOpen(false)} />}</AnimatePresence>;
}
