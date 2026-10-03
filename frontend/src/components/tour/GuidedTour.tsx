import { ArrowLeft, ArrowRight, Compass, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useState } from "react";
import { useStore } from "../../state/store";
import { EASE_OUT } from "../ui/primitives";

const STEPS = [
  {
    target: "patient",
    title: "Choose a patient",
    text: "Pick one of 61 hold-out patients the models never saw, or edit any measurement. Every change re-scores all four models in about 30 ms.",
  },
  {
    target: "viewer",
    title: "Explore the heart",
    text: "Each coronary artery is coloured by its predicted stenosis probability. Drag to rotate, scroll to zoom, click an artery or a region of the heart muscle to inspect it.",
  },
  {
    target: "risk",
    title: "Read the risk",
    text: "Overall CAD probability with its decision threshold and 80% interval, then the LAD, LCX and RCA. Hold-out patients also show what angiography found.",
  },
  {
    target: "insights",
    title: "Understand why",
    text: "The SHAP waterfall, the physiological breakdown, what-if curves and similar patients explain every estimate.",
  },
  {
    target: "tabs",
    title: "Check the evidence",
    text: "Model performance shows how each model was validated: nested cross-validation, hold-out metrics with confidence intervals and decision curves.",
  },
  {
    target: "report",
    title: "Share a report",
    text: "Print or save a one-page report with the predictions, their drivers, flagged measurements and a 3D snapshot.",
  },
] as const;

const PAD = 8;
const CARD_W = 320;

function useTargetRect(step: number | null): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (step == null) return;
    const update = () => {
      const el = document.querySelector(`[data-tour="${STEPS[step].target}"]`);
      const r = el?.getBoundingClientRect();
      setRect(r && r.width > 0 && r.height > 0 ? r : null);
    };
    update();
    const id = window.setInterval(update, 300); // follow layout animations
    window.addEventListener("resize", update);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", update);
    };
  }, [step]);
  return rect;
}

/** Spotlight walkthrough of the main areas of the app. */
export function GuidedTour() {
  const step = useStore((s) => s.tourStep);
  const setStep = useStore((s) => s.setTourStep);
  const setTab = useStore((s) => s.setTab);
  const rect = useTargetRect(step);

  useEffect(() => {
    if (step == null) return;
    setTab("analysis");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStep(null);
      if (e.key === "ArrowRight") setStep(step < STEPS.length - 1 ? step + 1 : null);
      if (e.key === "ArrowLeft" && step > 0) setStep(step - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, setStep, setTab]);

  const vw = typeof window === "undefined" ? 1200 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  let cardLeft = vw / 2 - CARD_W / 2;
  let cardTop = vh / 2 - 90;
  if (rect) {
    const roomRight = vw - rect.right;
    const roomLeft = rect.left;
    if (roomRight > CARD_W + 32) cardLeft = rect.right + 20;
    else if (roomLeft > CARD_W + 32) cardLeft = rect.left - CARD_W - 20;
    else cardLeft = Math.min(Math.max(16, rect.left), vw - CARD_W - 16);
    cardTop =
      roomRight > CARD_W + 32 || roomLeft > CARD_W + 32
        ? Math.min(Math.max(16, rect.top + 24), vh - 220)
        : Math.min(rect.bottom + 16, vh - 220);
  }

  return (
    <AnimatePresence>
      {step != null && (
        <motion.div
          key="tour"
          className="fixed inset-0 z-[55]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label="Guided tour"
        >
          {rect ? (
            <motion.div
              className="pointer-events-none absolute rounded-2xl border-2 border-accent"
              initial={false}
              animate={{
                top: rect.top - PAD,
                left: rect.left - PAD,
                width: rect.width + PAD * 2,
                height: rect.height + PAD * 2,
              }}
              transition={{ type: "spring", stiffness: 170, damping: 26 }}
              style={{ boxShadow: "0 0 0 9999px rgb(3 6 10 / 0.74), 0 0 30px rgb(92 200 245 / 0.45)" }}
            />
          ) : (
            <div className="absolute inset-0 bg-[#03060abd]" />
          )}

          <motion.div
            className="panel absolute p-4 shadow-2xl"
            style={{ width: CARD_W }}
            initial={false}
            animate={{ left: cardLeft, top: cardTop }}
            transition={{ type: "spring", stiffness: 170, damping: 26 }}
          >
            <motion.div key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                <div className="flex items-center justify-between">
                  <span className="label-caps text-accent">
                    Step {step + 1} of {STEPS.length}
                  </span>
                  <button type="button" className="btn-ghost p-1" onClick={() => setStep(null)} aria-label="Close tour">
                    <X size={13} />
                  </button>
                </div>
                <h3 className="mt-1.5 text-base font-semibold text-ink">{STEPS[step].title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-ink-2">{STEPS[step].text}</p>
            </motion.div>
            <div className="mt-4 flex items-center justify-between">
              <div className="flex gap-1" aria-hidden>
                {STEPS.map((_, i) => (
                  <motion.span
                    key={i}
                    className="h-1.5 rounded-full"
                    animate={{ width: i === step ? 18 : 6, backgroundColor: i === step ? "#5cc8f5" : "rgba(255,255,255,0.18)" }}
                  />
                ))}
              </div>
              <div className="flex gap-1.5">
                {step > 0 && (
                  <button type="button" className="btn" onClick={() => setStep(step - 1)}>
                    <ArrowLeft size={13} /> Back
                  </button>
                )}
                <button
                  type="button"
                  className="btn border-accent/50 bg-accent-soft text-ink"
                  onClick={() => setStep(step < STEPS.length - 1 ? step + 1 : null)}
                  autoFocus
                >
                  {step < STEPS.length - 1 ? (
                    <>
                      Next <ArrowRight size={13} />
                    </>
                  ) : (
                    "Finish"
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const OFFERED_KEY = "cardiolens.tour.offered";

/** One-time invitation to take the tour, shown shortly after the welcome screen. */
export function TourPrompt() {
  const accepted = useStore((s) => s.disclaimerAccepted);
  const setStep = useStore((s) => s.setTourStep);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!accepted) return;
    let offered = false;
    try {
      offered = sessionStorage.getItem(OFFERED_KEY) === "1";
    } catch {
      offered = false;
    }
    if (offered) return;
    const t = window.setTimeout(() => setShow(true), 2600);
    return () => window.clearTimeout(t);
  }, [accepted]);

  const close = (start: boolean) => {
    setShow(false);
    try {
      sessionStorage.setItem(OFFERED_KEY, "1");
    } catch {
      /* storage unavailable: the prompt may appear again next visit */
    }
    if (start) setStep(0);
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="panel fixed bottom-5 left-5 z-40 w-72 p-4 shadow-2xl"
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.45, ease: EASE_OUT }}
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Compass size={16} className="text-accent" /> New to CardioLens?
          </p>
          <p className="mt-1 text-xs text-ink-2">A 60-second tour shows where everything is.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn border-accent/50 bg-accent-soft text-ink" onClick={() => close(true)}>
              Take the tour
            </button>
            <button type="button" className="btn" onClick={() => close(false)}>
              Not now
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
