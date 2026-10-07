import { ChevronRight, Clapperboard, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { riskColor, withAlpha } from "../../lib/colors";
import { pct } from "../../lib/format";
import type { TargetId } from "../../lib/types";
import { useStore } from "../../state/store";
import { AnimatedNumber, BandChip, EASE_OUT } from "../ui/primitives";

interface Step {
  target: TargetId;
  /** Camera preset; without one the camera flies to the target's artery. */
  view?: string;
  ms: number;
  outro?: boolean;
}

const STEPS: Step[] = [
  { target: "cad", view: "overview_torso", ms: 3800 },
  { target: "lad", ms: 4300 },
  { target: "lcx", ms: 4300 },
  { target: "rca", ms: 4300 },
  { target: "cad", view: "overview_heart", ms: 4200, outro: true },
];

/** Button that starts the fly-through (lives in the view bar). */
export function FlythroughButton() {
  const start = useStore((s) => s.setFlythrough);
  return (
    <button
      type="button"
      onClick={() => start(true)}
      className="relative ml-0.5 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-accent-soft px-2 py-1 text-xs font-medium text-ink ring-1 ring-accent/30 transition-colors hover:bg-accent/20"
      title="Cinematic fly-through of the coronary arteries (Esc to stop)"
    >
      <Clapperboard size={13} className="text-accent" aria-hidden /> Fly-through
    </button>
  );
}

/**
 * Cinematic tour of the arteries: letterbox bars, a camera flight to each artery and a caption
 * with its probability and main driver. Any interaction with the 3D view hands control back.
 */
export function Flythrough() {
  const running = useStore((s) => s.flythrough);
  const setRunning = useStore((s) => s.setFlythrough);
  const prediction = useStore((s) => s.prediction);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (running) setStep(0);
  }, [running]);

  // Drive the camera and the selection; advance on a timer.
  useEffect(() => {
    if (!running) return;
    const s = STEPS[step];
    if (!s) {
      setRunning(false);
      return;
    }
    const st = useStore.getState();
    st.select(s.target, !s.view);
    if (s.view) st.flyTo(s.view);
    const t = window.setTimeout(() => setStep((i) => i + 1), s.ms);
    return () => window.clearTimeout(t);
  }, [running, step, setRunning]);

  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRunning(false);
      if (e.key === "ArrowRight") setStep((i) => i + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, setRunning]);

  const s = STEPS[Math.min(step, STEPS.length - 1)];
  const pred = prediction?.targets[s.target];
  const vessels = prediction ? (["lad", "lcx", "rca"] as const).filter((t) => prediction.targets[t].positive) : [];
  const driver = pred?.contributions[0];

  return (
    <AnimatePresence>
      {running && pred && (
        <>
          {/* Letterbox */}
          <motion.div
            key="bar-top"
            className="pointer-events-none absolute inset-x-0 top-0 z-30 bg-black"
            initial={{ height: 0 }}
            animate={{ height: "8%" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.7, ease: EASE_OUT }}
          />
          <motion.div
            key="bar-bottom"
            className="pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-black"
            initial={{ height: 0 }}
            animate={{ height: "8%" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.7, ease: EASE_OUT }}
          />

          <motion.div
            key="caption"
            data-flythrough
            className="absolute inset-x-0 bottom-[10%] z-40 flex justify-center px-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.5, ease: EASE_OUT }}
          >
            <div className="panel relative w-full max-w-md overflow-hidden px-4 pb-3 pt-3 shadow-2xl">
              <div className="flex items-center justify-between">
                <p className="label-caps flex items-center gap-1.5">
                  <Clapperboard size={12} className="text-accent" aria-hidden /> Fly-through · {Math.min(step + 1, STEPS.length)}{" "}
                  of {STEPS.length}
                </p>
                <div className="flex items-center gap-1">
                  <button type="button" className="btn-ghost p-1" onClick={() => setStep((i) => i + 1)} aria-label="Next">
                    <ChevronRight size={14} />
                  </button>
                  <button type="button" className="btn-ghost p-1" onClick={() => setRunning(false)} aria-label="Stop the fly-through">
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* Keyed entrance only: an exit-then-enter ("wait") presence could stall on slow devices. */}
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, ease: EASE_OUT }}
                className="mt-1.5"
              >
                {s.outro ? (
                  <>
                    <p className="text-base font-semibold text-ink">
                      {vessels.length
                        ? `${vessels.length} of 3 arteries above their threshold: ${vessels.map((v) => prediction!.targets[v].short).join(", ")}`
                        : "No artery above its threshold"}
                    </p>
                    <p className="mt-1 text-xs text-ink-2">
                      Overall CAD {pct(prediction!.targets.cad.probability)}. Colours show predicted risk per artery; they do
                      not locate lesions. Decision support only.
                    </p>
                  </>
                ) : (
                  <div className="flex items-center gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold text-ink">
                        {s.target === "cad" ? "Coronary artery disease" : `${pred.short} · ${pred.label}`}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <BandChip band={pred.risk_band.id as "low" | "moderate" | "high"} label={pred.risk_band.label} />
                        <span className="text-[11px] text-ink-3">
                          {pred.positive ? "Above" : "Below"} the {pct(pred.threshold)} threshold
                        </span>
                      </div>
                      {driver && (
                        <p className="mt-1.5 truncate text-[11px] text-ink-2">
                          Main factor {driver.contribution >= 0 ? "raising" : "lowering"} it:{" "}
                          <span className="text-ink">
                            {driver.label.toLowerCase()} ({driver.display})
                          </span>
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <AnimatedNumber
                        value={pred.probability}
                        from={0}
                        format={pct}
                        className="tabular block text-3xl font-semibold tracking-tight"
                      />
                      <span
                        className="mt-1 inline-block h-1 w-12 rounded-full"
                        style={{ background: riskColor(pred.probability), boxShadow: `0 0 10px ${withAlpha(riskColor(pred.probability), 0.8)}` }}
                      />
                    </div>
                  </div>
                )}
              </motion.div>

              {/* Step progress */}
              <div className="mt-3 flex gap-1" aria-hidden>
                {STEPS.map((_, i) => (
                  <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                    {i < step && <div className="h-full w-full bg-accent/70" />}
                    {i === step && (
                      <motion.div
                        key={`p-${step}`}
                        className="h-full bg-accent"
                        initial={{ width: "0%" }}
                        animate={{ width: "100%" }}
                        transition={{ duration: STEPS[i].ms / 1000, ease: "linear" }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
