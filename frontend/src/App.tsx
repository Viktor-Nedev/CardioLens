import clsx from "clsx";
import { CheckCircle2, Stethoscope, X } from "lucide-react";
import { AnimatePresence, motion, MotionConfig, type Variants } from "motion/react";
import { lazy, Suspense, useEffect, useState } from "react";
import { ComparePanel } from "./components/explain/ComparePanel";
import { ExplanationPanel } from "./components/explain/ExplanationPanel";
import { SensitivityPanel } from "./components/explain/SensitivityPanel";
import { SimilarPatients } from "./components/explain/SimilarPatients";
import { DisclaimerBanner, Header, IntroSplash, ShortcutsDialog } from "./components/layout/Chrome";
import { CommandPalette } from "./components/layout/CommandPalette";
import { PatientPanel } from "./components/patient/PatientPanel";
import { PhysiologyTable } from "./components/physiology/PhysiologyTable";
import { RiskOverview } from "./components/risk/RiskOverview";
import { EASE_OUT, Segmented } from "./components/ui/primitives";
import { ReportDialog } from "./components/report/ReportDialog";
import { GuidedTour, TourPrompt } from "./components/tour/GuidedTour";
import { useBoot, usePredictionSync } from "./hooks/useBoot";
import { useStore } from "./state/store";

const Viewer = lazy(() => import("./components/viewer/Viewer").then((m) => ({ default: m.Viewer })));
const ModelPerformance = lazy(() =>
  import("./components/model/ModelPerformance").then((m) => ({ default: m.ModelPerformance })),
);
const About = lazy(() => import("./components/about/About").then((m) => ({ default: m.About })));

function Fallback() {
  return <div className="skeleton h-full min-h-64 w-full rounded-2xl border border-line" />;
}

type MobilePane = "patient" | "viewer" | "insights";

const columns: Variants = {
  hidden: { opacity: 0, y: 22 },
  // The 3D view already plays behind the welcome screen.
  preview: { opacity: 1, y: 0, transition: { duration: 1.2 } },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: 0.15 + i * 0.12, duration: 0.7, ease: EASE_OUT } }),
};

function Analysis({ active }: { active: boolean }) {
  const [pane, setPane] = useState<MobilePane>("viewer");
  const [insight, setInsight] = useState<"explain" | "physiology" | "whatif" | "similar" | "compare">("explain");
  const ready = useStore((s) => s.disclaimerAccepted);
  const reveal = ready ? "show" : "hidden";

  return (
    <div className={clsx("relative z-10 flex min-h-0 flex-1 flex-col", !active && "hidden")}>
      <div className="flex justify-center border-b border-line px-4 py-2 xl:hidden">
        <Segmented
          ariaLabel="Panel"
          value={pane}
          onChange={setPane}
          options={[
            { value: "patient", label: "Patient" },
            { value: "viewer", label: "3D heart" },
            { value: "insights", label: "Risk & explanation" },
          ]}
        />
      </div>
      {/* Behind the welcome screen the 3D view spans the full width; on start the side
          columns grow in and the view docks into the centre (grid-template-columns transition). */}
      <main
        className={clsx(
          "scroll-slim grid min-h-0 flex-1 gap-3 overflow-y-auto p-3 transition-[grid-template-columns,column-gap] duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)] xl:grid-rows-[minmax(0,1fr)] xl:overflow-hidden",
          ready ? "xl:grid-cols-[320px_minmax(0,1fr)_430px]" : "xl:grid-cols-[0px_minmax(0,1fr)_0px] xl:gap-x-0",
        )}
      >
        <motion.div
          variants={columns}
          custom={0}
          initial="hidden"
          animate={reveal}
          className={clsx("min-h-0 min-w-0 overflow-hidden xl:block", pane === "patient" ? "block" : "hidden")}
        >
          <PatientPanel />
        </motion.div>
        <motion.div
          variants={columns}
          custom={1}
          initial="hidden"
          animate={ready ? "show" : "preview"}
          className={clsx("h-[62vh] min-h-[380px] xl:block xl:h-auto xl:min-h-0", pane === "viewer" ? "block" : "hidden")}
        >
          <Suspense fallback={<Fallback />}>
            <Viewer active={active} />
          </Suspense>
        </motion.div>
        <motion.div
          variants={columns}
          custom={2}
          initial="hidden"
          animate={reveal}
          className={clsx(
            "scroll-slim min-h-0 min-w-0 space-y-3 overflow-y-auto overflow-x-hidden pr-0.5 xl:block",
            pane === "insights" ? "block" : "hidden",
          )}
        >
          <RiskOverview />
          <div className="flex justify-center" data-tour="insights">
            <Segmented
              ariaLabel="Insight"
              value={insight}
              onChange={setInsight}
              options={[
                { value: "explain", label: "SHAP" },
                { value: "physiology", label: "Physiology" },
                { value: "whatif", label: "What-if" },
                { value: "similar", label: "Similar cases" },
                { value: "compare", label: "Compare" },
              ]}
            />
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={insight}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: EASE_OUT }}
            >
              {insight === "explain" ? (
                <ExplanationPanel />
              ) : insight === "physiology" ? (
                <PhysiologyTable />
              ) : insight === "whatif" ? (
                <SensitivityPanel />
              ) : insight === "similar" ? (
                <SimilarPatients />
              ) : (
                <ComparePanel />
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </main>
    </div>
  );
}

function BootError({ message }: { message: string }) {
  return (
    <div className="relative z-10 flex flex-1 items-center justify-center p-8">
      <div className="panel max-w-md p-6 text-sm text-ink-2">
        <p className="font-semibold text-ink">Cannot reach the CardioLens API</p>
        <p className="mt-2">
          Start the backend with <code className="rounded bg-raised px-1">uvicorn cardiolens.api.main:app</code> (see
          README) and reload.
        </p>
        <p className="mt-2 text-xs text-ink-3">{message}</p>
      </div>
    </div>
  );
}

function ToastHost() {
  const toast = useStore((s) => s.toast);
  const dismiss = useStore((s) => s.dismissToast);
  const ready = useStore((s) => s.disclaimerAccepted);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(dismiss, 3800);
    return () => window.clearTimeout(id);
  }, [toast, dismiss]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4" aria-live="polite">
      <AnimatePresence>
        {toast && ready && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className="panel pointer-events-auto flex items-center gap-3 py-2.5 pl-3 pr-2 shadow-2xl"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft">
              <Stethoscope size={14} className="text-accent" />
            </span>
            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                <CheckCircle2 size={12} className="text-risk-low" /> {toast.title}
              </p>
              {toast.detail && <p className="text-[11px] text-ink-3">{toast.detail}</p>}
            </div>
            <button type="button" onClick={dismiss} className="btn-ghost ml-1 p-1" aria-label="Dismiss">
              <X size={13} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  useBoot();
  usePredictionSync();
  const tab = useStore((s) => s.tab);
  const bootError = useStore((s) => s.bootError);

  return (
    <MotionConfig reducedMotion="user">
      <div className="aurora" aria-hidden>
        <div className="aurora-grid" />
      </div>
      <div className="relative flex h-full min-h-0 flex-col">
        <Header />
        <DisclaimerBanner />
        {bootError ? (
          <BootError message={bootError} />
        ) : (
          <>
            <Analysis active={tab === "analysis"} />
            <AnimatePresence mode="wait">
              {tab !== "analysis" && (
                <motion.div
                  key={tab}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.35, ease: EASE_OUT }}
                  className="scroll-slim relative z-10 min-h-0 flex-1 overflow-y-auto"
                >
                  <Suspense
                    fallback={
                      <div className="p-6">
                        <Fallback />
                      </div>
                    }
                  >
                    {tab === "model" ? <ModelPerformance /> : <About />}
                  </Suspense>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
      <ToastHost />
      <ShortcutsDialog />
      <CommandPalette />
      <ReportDialog />
      <TourPrompt />
      <GuidedTour />
      <IntroSplash />
    </MotionConfig>
  );
}
