import clsx from "clsx";
import { ArrowRight, Box, BrainCircuit, Gauge, Heart, ShieldAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useStore, type Tab } from "../../state/store";
import { AnimatedNumber, EASE_OUT } from "../ui/primitives";

const TABS: { id: Tab; label: string }[] = [
  { id: "analysis", label: "Patient analysis" },
  { id: "model", label: "Model performance" },
  { id: "about", label: "About & data" },
];

const HEART_PATH = "M16 26s-9-5.6-9-12.2A5 5 0 0 1 16 11a5 5 0 0 1 9 2.8C25 20.4 16 26 16 26Z";
const ECG_PATH = "M8.5 16h4l2-3.5 2.5 7 2-3.5h4.5";

export function Logo({ size = 28, animated = false }: { size?: number; animated?: boolean }) {
  const draw = animated
    ? { initial: { pathLength: 0 }, animate: { pathLength: 1 } }
    : { initial: false as const };
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#111a28" />
      <motion.path
        d={HEART_PATH}
        fill="none"
        stroke="#e66767"
        strokeWidth="2.2"
        strokeLinejoin="round"
        {...draw}
        transition={{ duration: 1.1, ease: EASE_OUT }}
      />
      <motion.path
        d={ECG_PATH}
        fill="none"
        stroke="#5cc8f5"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...draw}
        transition={{ duration: 0.9, delay: animated ? 0.7 : 0, ease: "easeInOut" }}
      />
    </svg>
  );
}

/** One PQRST complex drawn into a cell of width w starting at x0 (baseline y = 13). */
function beatPath(x0: number, w: number): string {
  const p = (fx: number, y: number) => `${(x0 + fx * w).toFixed(1)},${y}`;
  return [
    `M${p(0, 13)}`,
    `L${p(0.16, 13)}`,
    `Q${p(0.21, 9.5)} ${p(0.26, 13)}`,
    `L${p(0.36, 13)}`,
    `L${p(0.4, 15)}`,
    `L${p(0.45, 2)}`,
    `L${p(0.5, 20)}`,
    `L${p(0.54, 13)}`,
    `L${p(0.63, 13)}`,
    `Q${p(0.71, 7.5)} ${p(0.79, 13)}`,
    `L${p(1, 13)}`,
  ].join(" ");
}

/** Scrolling ECG strip that beats at the current patient's recorded pulse rate. */
function EcgMonitor() {
  const pulse = useStore((s) => s.patient.pulse_rate);
  const bpm = typeof pulse === "number" && pulse >= 30 && pulse <= 220 ? pulse : 72;
  const beats = 4;
  const beatW = 30;
  const w = beats * beatW;
  const d = Array.from({ length: beats * 2 }, (_, i) => beatPath(i * beatW, beatW)).join(" ");
  const period = 60 / bpm;

  return (
    <div className="hidden items-center gap-2 rounded-lg border border-line bg-black/25 px-2.5 py-1 md:flex" title="Pulse rate of the current patient">
      <Heart
        size={13}
        className="fill-raises/40 text-raises"
        style={{ animation: `heartbeat ${period}s ease-in-out infinite` }}
        data-motion="decorative"
        aria-hidden
      />
      <div
        className="relative h-[22px] overflow-hidden"
        style={{ width: w, maskImage: "linear-gradient(90deg, transparent, black 30%, black 82%, transparent)" }}
        aria-hidden
      >
        <svg
          width={w * 2}
          height={22}
          style={{ animation: `ecg-scroll ${beats * period}s linear infinite` }}
          data-motion="decorative"
        >
          <path d={d} fill="none" stroke="#5cc8f5" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      </div>
      <span className="tabular text-[11px] text-ink-2">
        <AnimatedNumber value={bpm} format={(v) => String(Math.round(v))} className="font-semibold text-ink" /> bpm
      </span>
    </div>
  );
}

function ApiStatus() {
  const predicting = useStore((s) => s.predicting);
  const latency = useStore((s) => s.prediction?.latency_ms);
  const error = useStore((s) => s.predictError);
  if (error) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-2" title={error}>
        <span className="h-2 w-2 rounded-full bg-risk-high" /> API error
      </span>
    );
  }
  return (
    <span className="tabular inline-flex items-center gap-1.5 text-[11px] text-ink-3" title="Server time for the last prediction">
      <span className="relative flex h-2 w-2">
        <span className={clsx("absolute inset-0 rounded-full bg-risk-low", predicting ? "animate-ping-soft" : "opacity-0")} />
        <span className="relative h-2 w-2 rounded-full bg-risk-low" />
      </span>
      {latency != null ? `Live · ${latency.toFixed(0)} ms` : "Connecting…"}
    </span>
  );
}

export function Header() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  return (
    <motion.header
      initial={{ y: -12, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
      className="relative z-20 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-page/70 px-4 py-2.5 backdrop-blur-xl"
    >
      <div className="flex items-center gap-2.5">
        <Logo />
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-tight text-ink">CardioLens</p>
          <p className="text-[10px] text-ink-3">Explainable coronary risk in 3D</p>
        </div>
      </div>
      <nav className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto" aria-label="Main">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={clsx(
              "relative whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              tab === t.id ? "text-ink" : "text-ink-3 hover:text-ink",
            )}
          >
            {tab === t.id && (
              <motion.span
                layoutId="main-tab"
                className="absolute inset-0 rounded-lg bg-raised ring-1 ring-line-strong"
                style={{ boxShadow: "0 0 18px -6px rgb(92 200 245 / 0.45)" }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            )}
            <span className="relative">{t.label}</span>
          </button>
        ))}
      </nav>
      <div className="flex items-center gap-3">
        <EcgMonitor />
        <ApiStatus />
      </div>
    </motion.header>
  );
}

export function DisclaimerBanner() {
  return (
    <div
      role="note"
      className="relative z-10 flex items-start gap-2 border-b border-[#fab219]/20 bg-gradient-to-r from-[#fab219]/[0.09] via-[#fab219]/[0.04] to-transparent px-4 py-1.5 text-[11px] leading-snug text-ink-2 sm:items-center"
    >
      <ShieldAlert size={14} className="mt-px shrink-0 text-[#fab219] sm:mt-0" aria-hidden />
      <p>
        <span className="font-semibold text-ink">Decision support and education only.</span> CardioLens estimates are
        statistical predictions, not a diagnosis, and do not replace coronary angiography, CT angiography or clinical
        judgement.
      </p>
    </div>
  );
}

const FEATURES = [
  { icon: Gauge, title: "4 calibrated models", text: "CAD, LAD, LCX and RCA with confidence intervals" },
  { icon: BrainCircuit, title: "Explainable", text: "SHAP drivers and a physiological breakdown" },
  { icon: Box, title: "Real 3D anatomy", text: "Coronary arteries coloured by predicted risk" },
];

/** First screen: what CardioLens is, the safety disclaimer, and the way in. */
export function IntroSplash() {
  const accepted = useStore((s) => s.disclaimerAccepted);
  const accept = useStore((s) => s.acceptDisclaimer);
  const stagger = (i: number) => ({
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: 0.35 + i * 0.09, duration: 0.55, ease: EASE_OUT },
  });

  return (
    <AnimatePresence>
      {!accepted && (
        <motion.div
          key="intro"
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#05080dcc] p-4 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.6, ease: EASE_OUT } }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="intro-title"
        >
          <motion.div
            className="panel relative w-full max-w-xl overflow-hidden p-7 shadow-2xl sm:p-8"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 1.02, filter: "blur(6px)" }}
            transition={{ duration: 0.7, ease: EASE_OUT }}
          >
            <div
              className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgb(92_200_245/0.22),transparent_65%)]"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -bottom-28 -left-20 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgb(230_103_103/0.16),transparent_65%)]"
              aria-hidden
            />

            <div className="relative flex items-center gap-3">
              <motion.div
                animate={{ scale: [1, 1.06, 1, 1.03, 1] }}
                transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 0.4, delay: 1.6 }}
                data-motion="decorative"
              >
                <Logo size={48} animated />
              </motion.div>
              <div>
                <motion.h1
                  id="intro-title"
                  className="text-2xl font-semibold tracking-tight text-ink"
                  initial={{ opacity: 0, letterSpacing: "0.2em" }}
                  animate={{ opacity: 1, letterSpacing: "-0.01em" }}
                  transition={{ duration: 0.9, ease: EASE_OUT }}
                >
                  CardioLens
                </motion.h1>
                <motion.p className="text-sm text-ink-2" {...stagger(0)}>
                  Explainable coronary artery disease risk, mapped onto a 3D heart
                </motion.p>
              </div>
            </div>

            <div className="relative mt-6 grid gap-2 sm:grid-cols-3">
              {FEATURES.map((f, i) => (
                <motion.div key={f.title} {...stagger(i + 1)} className="rounded-xl border border-line bg-white/[0.03] p-3">
                  <f.icon size={16} className="text-accent" aria-hidden />
                  <p className="mt-2 text-xs font-semibold text-ink">{f.title}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-ink-3">{f.text}</p>
                </motion.div>
              ))}
            </div>

            <motion.div
              {...stagger(4)}
              className="relative mt-5 rounded-xl border border-[#fab219]/25 bg-[#fab219]/[0.06] p-4"
            >
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <ShieldAlert size={16} className="text-[#fab219]" aria-hidden /> Before you continue
              </p>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-ink-2">
                <li>A research and educational prototype for clinical decision support. It is not a medical device.</li>
                <li>
                  Trained on 303 patients from one public dataset (Z-Alizadeh Sani, UCI). Probabilities are statistical
                  estimates and can be wrong for an individual patient.
                </li>
                <li>
                  The 3D colouring shows predicted risk per coronary artery. It is not an image of the patient and does
                  not locate lesions; myocardial territories are schematic.
                </li>
                <li>Predictions never replace coronary angiography, CT angiography or a qualified clinician.</li>
              </ul>
            </motion.div>

            <motion.button
              {...stagger(5)}
              type="button"
              onClick={accept}
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.985 }}
              className="shimmer relative mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#3987e5] to-accent px-4 py-3 text-sm font-semibold text-page shadow-[0_10px_30px_-10px_rgb(92_200_245/0.7)]"
              autoFocus
            >
              I understand — start the analysis <ArrowRight size={16} />
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
