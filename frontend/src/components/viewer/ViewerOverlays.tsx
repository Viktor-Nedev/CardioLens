import clsx from "clsx";
import { Camera, Check, Layers, Loader2, MousePointerClick, ScanLine, Scissors } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { riskGradient } from "../../lib/colors";
import { pct } from "../../lib/format";
import { useStore, type ViewerSettings } from "../../state/store";
import { EASE_OUT } from "../ui/primitives";
import { VIEW_PRESETS } from "./CameraRig";

const appear = (delay: number) => ({
  initial: { opacity: 0, y: -8 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.5, ease: EASE_OUT },
});

export function ViewBar() {
  const flyTo = useStore((s) => s.flyTo);
  const [current, setCurrent] = useState("overview_heart");
  return (
    <motion.div
      {...appear(0.9)}
      className="glass-chip scroll-slim absolute left-3 top-3 z-10 flex max-w-[calc(100%-7.5rem)] gap-0.5 overflow-x-auto p-1"
    >
      {Object.entries(VIEW_PRESETS).map(([id, v]) => (
        <button
          key={id}
          type="button"
          className={clsx(
            "relative shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium transition-colors",
            current === id ? "text-ink" : "text-ink-3 hover:text-ink",
          )}
          onClick={() => {
            setCurrent(id);
            flyTo(id);
          }}
        >
          {current === id && (
            <motion.span
              layoutId="view-pill"
              className="absolute inset-0 rounded-md bg-white/[0.08] ring-1 ring-white/10"
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            />
          )}
          <span className="relative">{v.label}</span>
        </button>
      ))}
    </motion.div>
  );
}

const LAYERS: { key: keyof ViewerSettings; label: string; hint?: string; section?: string }[] = [
  { key: "territories", label: "Perfusion territories", hint: "Schematic, by nearest artery", section: "Anatomy" },
  { key: "labels", label: "Vessel labels" },
  { key: "xray", label: "X-ray myocardium" },
  { key: "torso", label: "Torso surface" },
  { key: "ribs", label: "Rib cage & sternum" },
  { key: "lungs", label: "Lungs & trachea" },
  { key: "greatVessels", label: "Aorta & venae cavae" },
  { key: "veins", label: "Cardiac veins" },
  { key: "bloom", label: "Glow (bloom)", section: "Effects" },
  { key: "flow", label: "Blood-flow pulses", hint: "Paced by the patient's pulse rate" },
  { key: "hologram", label: "Holographic rings & particles" },
  { key: "heartbeat", label: "Heartbeat" },
  { key: "autoRotate", label: "Auto-rotate" },
  { key: "performance", label: "Performance mode", hint: "Turns every effect off", section: "Device" },
];

export function LayerMenu() {
  const viewer = useStore((s) => s.viewer);
  const toggle = useStore((s) => s.toggleViewer);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <motion.div {...appear(1)} ref={ref} className="absolute right-3 top-3 z-20">
      <button
        type="button"
        className={clsx("btn glass-chip", open && "border-accent/40 text-ink")}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Layers size={14} /> Layers
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
            style={{ transformOrigin: "top right" }}
            className="panel scroll-slim absolute right-0 mt-1.5 max-h-[70vh] w-64 overflow-y-auto p-1.5 shadow-2xl"
            role="menu"
          >
            {LAYERS.map((l) => (
              <div key={l.key}>
                {l.section && <p className="label-caps px-2 pb-1 pt-2">{l.section}</p>}
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={viewer[l.key]}
                  onClick={() => toggle(l.key)}
                  className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs text-ink-2 transition-colors hover:bg-white/[0.06] hover:text-ink"
                >
                  <span
                    className={clsx(
                      "mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors",
                      viewer[l.key] ? "border-accent bg-accent text-page" : "border-line-strong",
                    )}
                  >
                    {viewer[l.key] && <Check size={10} strokeWidth={3} />}
                  </span>
                  <span>
                    {l.label}
                    {l.hint && <span className="block text-[10px] text-ink-3">{l.hint}</span>}
                  </span>
                </button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function ScanStatus() {
  const predicting = useStore((s) => s.predicting);
  const cad = useStore((s) => s.prediction?.targets.cad);
  return (
    <motion.div
      {...appear(1.1)}
      className="glass-chip pointer-events-none absolute left-3 top-[3.25rem] z-10 hidden items-center gap-2 px-2.5 py-1 text-[11px] text-ink-2 lg:flex"
      aria-live="polite"
    >
      <AnimatePresence mode="wait" initial={false}>
        {predicting ? (
          <motion.span
            key="busy"
            className="flex items-center gap-1.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Loader2 size={12} className="animate-spin text-accent" /> Re-scoring patient…
          </motion.span>
        ) : (
          <motion.span
            key="idle"
            className="flex items-center gap-1.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <ScanLine size={12} className="text-accent" />
            {cad ? `Model synced · overall CAD ${pct(cad.probability)}` : "Waiting for the model…"}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function RiskLegend() {
  return (
    <motion.div
      {...appear(1.2)}
      className="glass-chip pointer-events-none absolute bottom-3 left-3 z-10 w-52 px-3 py-2"
    >
      <p className="text-[11px] font-medium text-ink-2">Predicted stenosis probability</p>
      <div
        className="mt-1.5 h-2 rounded-full"
        style={{ background: riskGradient(), boxShadow: "0 0 14px -2px rgb(208 59 59 / 0.35)" }}
      />
      <div className="tabular mt-1 flex justify-between text-[10px] text-ink-3">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
      <p className="mt-1 text-[10px] leading-snug text-ink-3">Pulsing glow = above the model's decision threshold</p>
    </motion.div>
  );
}

export function HoverCard() {
  const info = useStore((s) => s.hoverInfo);
  return (
    <>
      <AnimatePresence>
        {!info && (
          <motion.div
            key="hint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="glass-chip pointer-events-none absolute bottom-3 right-3 z-10 hidden items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-ink-3 lg:flex"
          >
            <MousePointerClick size={13} /> Drag · scroll · click to inspect · press ? for keys
          </motion.div>
        )}
      </AnimatePresence>
      {info && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.12 }}
          className="pointer-events-none absolute z-20 max-w-72 rounded-lg border border-line-strong bg-[#0b111bf0] px-3 py-2 shadow-xl backdrop-blur-md"
          style={{ left: `min(${info.x + 14}px, calc(100% - 19rem))`, top: `min(${info.y + 14}px, calc(100% - 5rem))` }}
        >
          <p className="text-xs font-semibold text-ink">{info.title}</p>
          {info.detail && <p className="mt-0.5 text-[11px] text-ink-2">{info.detail}</p>}
        </motion.div>
      )}
    </>
  );
}

export function SnapshotButton() {
  const showToast = useStore((s) => s.showToast);
  const save = () => {
    const url = useStore.getState().snapshot?.();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `cardiolens-3d-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`;
    a.click();
    showToast("Snapshot saved", "PNG of the current 3D view");
  };
  return (
    <motion.button
      {...appear(1)}
      type="button"
      onClick={save}
      className="btn glass-chip absolute right-[6.4rem] top-3 z-20"
      title="Save a PNG of the 3D view"
      aria-label="Save a snapshot of the 3D view"
    >
      <Camera size={14} />
    </motion.button>
  );
}

/** Cuts the heart front-to-back with a clipping plane to reveal the chambers. */
export function SectionControl() {
  const section = useStore((s) => s.section);
  const setSection = useStore((s) => s.setSection);
  return (
    <motion.div {...appear(1.15)} className="glass-chip absolute bottom-14 right-3 z-10 hidden w-52 px-3 py-2 lg:block">
      <div className="flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1.5 font-medium text-ink-2">
          <Scissors size={12} className="text-accent" /> Cross-section
        </span>
        <span className="tabular text-ink-3">{section === 0 ? "off" : `${Math.round(section * 100)}%`}</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={section}
        onChange={(e) => setSection(Number(e.target.value))}
        style={{ ["--fill" as string]: `${section * 100}%` }}
        className="mt-1 w-full"
        aria-label="Cross-section depth"
      />
    </motion.div>
  );
}
