import clsx from "clsx";
import { ArrowRight, Box, BrainCircuit, Compass, FileText, Gauge, Heart, Keyboard, Search, ShieldAlert, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { useStore, type Tab } from "../../state/store";
import { AnimatedNumber, EASE_OUT, Kbd } from "../ui/primitives";

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
  const setShortcuts = useStore((s) => s.setShortcutsOpen);
  const setReport = useStore((s) => s.setReportOpen);
  const setTourStep = useStore((s) => s.setTourStep);
  const setPalette = useStore((s) => s.setPaletteOpen);
  const canReport = useStore((s) => Boolean(s.prediction));
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
      <nav className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto" aria-label="Main" data-tour="tabs">
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
        <button
          type="button"
          onClick={() => setPalette(true)}
          className="group hidden items-center gap-2 rounded-lg border border-line bg-black/25 py-1 pl-2.5 pr-1 text-xs text-ink-3 transition-colors hover:border-line-strong hover:text-ink md:inline-flex"
          title="Search patients, views, layers and actions"
          aria-label="Open the command palette"
        >
          <Search size={13} className="transition-colors group-hover:text-accent" aria-hidden /> Search
          <Kbd className="ml-4">{MOD} K</Kbd>
        </button>
        <button
          type="button"
          onClick={() => setTourStep(0)}
          className="btn-ghost hidden lg:inline-flex"
          title="Guided tour"
        >
          <Compass size={14} /> Tour
        </button>
        <button
          type="button"
          onClick={() => setReport(true)}
          disabled={!canReport}
          className="btn border-accent/40 bg-accent-soft text-ink"
          title="Patient report (print or save as PDF)"
          data-tour="report"
        >
          <FileText size={14} /> <span className="hidden sm:inline">Report</span>
        </button>
        <button
          type="button"
          onClick={() => setShortcuts(true)}
          className="btn-ghost hidden p-1.5 sm:inline-flex"
          title="Keyboard shortcuts (?)"
          aria-label="Keyboard shortcuts"
        >
          <Keyboard size={15} />
        </button>
      </div>
      <div className="live-line" aria-hidden />
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

/** Modifier key label for shortcuts: ⌘ on Apple devices, Ctrl elsewhere. */
export const MOD =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl";

const FEATURES = [
  { icon: Gauge, title: "Calibrated predictions", text: "Overall CAD plus LAD, LCX and RCA stenosis, with intervals" },
  { icon: BrainCircuit, title: "Explained", text: "SHAP drivers and a physiological breakdown for every estimate" },
  { icon: Box, title: "Real 3D anatomy", text: "BodyParts3D heart with each artery coloured by its risk" },
];

function HeroStat({ value, format, label, delay }: { value: number; format: (v: number) => string; label: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.6, ease: EASE_OUT }}
      className="min-w-0"
    >
      <AnimatedNumber
        value={value}
        from={0}
        duration={1.6}
        format={format}
        className="block bg-gradient-to-r from-white to-[#9fdcf7] bg-clip-text text-3xl font-semibold tracking-tight text-transparent"
      />
      <p className="mt-0.5 text-[11px] leading-snug text-ink-3">{label}</p>
    </motion.div>
  );
}

/** First screen: what CardioLens is, the safety disclaimer, and the way in. */
export function IntroSplash() {
  const accepted = useStore((s) => s.disclaimerAccepted);
  const accept = useStore((s) => s.acceptDisclaimer);
  const auc = useStore((s) => s.metrics?.targets.cad.holdout.metrics.roc_auc.value);
  const cases = useStore((s) => s.cases.length);
  const stagger = (i: number) => ({
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: 0.3 + i * 0.09, duration: 0.6, ease: EASE_OUT },
  });

  return (
    <AnimatePresence>
      {!accepted && (
        <motion.div
          key="intro"
          className="fixed inset-0 z-50 flex overflow-y-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.8, ease: EASE_OUT } }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="intro-title"
        >
          {/* Dark on the left for the text; on wide screens the live 3D heart stays visible on the right. */}
          <div
            className="pointer-events-none fixed inset-0 bg-[#05080dd9] backdrop-blur-md lg:bg-transparent lg:bg-[linear-gradient(90deg,#05080d_0%,#05080df2_38%,#05080d99_56%,transparent_78%)] lg:backdrop-blur-none"
            aria-hidden
          />
          <div
            className="pointer-events-none fixed -left-40 top-1/4 h-[36rem] w-[36rem] rounded-full bg-[radial-gradient(circle,rgb(92_200_245/0.14),transparent_62%)]"
            aria-hidden
          />

          <motion.div
            className="relative z-10 m-auto w-full max-w-xl px-5 py-10 sm:px-8 lg:m-0 lg:ml-[6vw] lg:self-center xl:ml-[8vw]"
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30, filter: "blur(6px)" }}
            transition={{ duration: 0.8, ease: EASE_OUT }}
          >
            <div className="flex items-center gap-3">
              <motion.div
                animate={{ scale: [1, 1.07, 1, 1.03, 1] }}
                transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 0.45, delay: 1.6 }}
                data-motion="decorative"
              >
                <Logo size={44} animated />
              </motion.div>
              <motion.span {...stagger(0)} className="label-caps text-accent">
                Multimodal AI Hackathon 2026 · Track A
              </motion.span>
            </div>

            <motion.h1
              id="intro-title"
              className="mt-6 bg-gradient-to-r from-white via-[#dcefff] to-[#7fcff5] bg-clip-text text-5xl font-semibold tracking-tight text-transparent sm:text-6xl"
              initial={{ opacity: 0, letterSpacing: "0.18em" }}
              animate={{ opacity: 1, letterSpacing: "-0.02em" }}
              transition={{ duration: 1, ease: EASE_OUT }}
            >
              CardioLens
            </motion.h1>
            <motion.p {...stagger(1)} className="mt-3 max-w-md text-base leading-relaxed text-ink-2">
              Explainable coronary artery disease risk from routine clinical data, mapped onto the arteries of a real
              3D heart.
            </motion.p>

            <div className="mt-7 grid grid-cols-3 gap-4 border-y border-line py-5">
              <HeroStat value={303} format={(v) => String(Math.round(v))} label="patients with angiography" delay={0.55} />
              <HeroStat value={cases || 61} format={(v) => String(Math.round(v))} label="hold-out cases to explore" delay={0.65} />
              <HeroStat
                value={auc ?? 0.88}
                format={(v) => v.toFixed(2)}
                label="CAD ROC-AUC on unseen patients"
                delay={0.75}
              />
            </div>

            <div className="mt-6 space-y-3">
              {FEATURES.map((f, i) => (
                <motion.div key={f.title} {...stagger(i + 4)} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft ring-1 ring-accent/20">
                    <f.icon size={15} className="text-accent" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink">{f.title}</p>
                    <p className="text-xs leading-snug text-ink-3">{f.text}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            <motion.div
              {...stagger(7)}
              className="mt-6 rounded-xl border border-[#fab219]/25 bg-[#fab219]/[0.06] p-4"
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
              {...stagger(8)}
              type="button"
              onClick={accept}
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.985 }}
              className="shimmer relative mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#3987e5] to-accent px-4 py-3.5 text-sm font-semibold text-page shadow-[0_12px_34px_-10px_rgb(92_200_245/0.75)]"
              autoFocus
            >
              I understand — start the analysis <ArrowRight size={16} />
            </motion.button>
          </motion.div>

          <motion.div
            className="pointer-events-none fixed bottom-8 right-8 z-10 hidden text-right lg:block"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.4, duration: 0.8 }}
          >
            <p className="label-caps text-accent">Live 3D preview</p>
            <p className="mt-1 text-xs text-ink-3">BodyParts3D anatomy · coronary arteries coloured by predicted risk</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const SHORTCUTS: { keys: string[]; action: string }[] = [
  { keys: [MOD, "K"], action: "Search patients, views, layers and actions" },
  { keys: ["0"], action: "Explain overall CAD" },
  { keys: ["1", "2", "3"], action: "Focus LAD, LCX or RCA in 3D" },
  { keys: ["Drag"], action: "Rotate the heart" },
  { keys: ["Scroll"], action: "Zoom in and out" },
  { keys: ["Right-drag"], action: "Pan the view" },
  { keys: ["Click"], action: "Inspect an artery, its label or a myocardial region" },
  { keys: ["?"], action: "Show or hide this panel" },
  { keys: ["Esc"], action: "Close" },
];

/** Keyboard and mouse reference, toggled with "?". */
export function ShortcutsDialog() {
  const open = useStore((s) => s.shortcutsOpen);
  const setOpen = useStore((s) => s.setShortcutsOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && ["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)) return;
      if (e.key === "?") setOpen(!useStore.getState().shortcutsOpen);
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="shortcuts-title"
        >
          <motion.div
            className="panel w-full max-w-md p-5 shadow-2xl"
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 id="shortcuts-title" className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Keyboard size={16} className="text-accent" /> Shortcuts
              </h2>
              <button type="button" className="btn-ghost p-1" onClick={() => setOpen(false)} aria-label="Close">
                <X size={14} />
              </button>
            </div>
            <ul className="mt-4 space-y-2">
              {SHORTCUTS.map((s, i) => (
                <motion.li
                  key={s.action}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.04 * i, duration: 0.3, ease: EASE_OUT }}
                  className="flex items-center justify-between gap-4 text-xs text-ink-2"
                >
                  <span>{s.action}</span>
                  <span className="flex shrink-0 gap-1">
                    {s.keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
