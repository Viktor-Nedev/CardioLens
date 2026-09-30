import { lazy, Suspense, useState } from "react";
import clsx from "clsx";
import { ExplanationPanel } from "./components/explain/ExplanationPanel";
import { DisclaimerBanner, DisclaimerModal, Header } from "./components/layout/Chrome";
import { PatientPanel } from "./components/patient/PatientPanel";
import { PhysiologyTable } from "./components/physiology/PhysiologyTable";
import { RiskOverview } from "./components/risk/RiskOverview";
import { Segmented } from "./components/ui/primitives";
import { useBoot, usePredictionSync } from "./hooks/useBoot";
import { useStore } from "./state/store";

const Viewer = lazy(() => import("./components/viewer/Viewer").then((m) => ({ default: m.Viewer })));
const ModelPerformance = lazy(() => import("./components/model/ModelPerformance").then((m) => ({ default: m.ModelPerformance })));
const About = lazy(() => import("./components/about/About").then((m) => ({ default: m.About })));

function Fallback() {
  return <div className="h-full w-full animate-pulse rounded-xl border border-line bg-surface" />;
}

type MobilePane = "patient" | "viewer" | "insights";

function Analysis() {
  const [pane, setPane] = useState<MobilePane>("viewer");
  const [insight, setInsight] = useState<"explain" | "physiology">("explain");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
      <main className="scroll-slim grid min-h-0 flex-1 gap-3 overflow-y-auto p-3 xl:grid-cols-[320px_minmax(0,1fr)_420px] xl:grid-rows-[minmax(0,1fr)] xl:overflow-hidden">
        <div className={clsx("min-h-0 xl:block", pane === "patient" ? "block" : "hidden")}>
          <PatientPanel />
        </div>
        <div className={clsx("h-[62vh] min-h-[380px] xl:block xl:h-auto xl:min-h-0", pane === "viewer" ? "block" : "hidden")}>
          <Suspense fallback={<Fallback />}>
            <Viewer />
          </Suspense>
        </div>
        <div className={clsx("scroll-slim min-h-0 space-y-3 overflow-y-auto xl:block", pane === "insights" ? "block" : "hidden")}>
          <RiskOverview />
          <div className="flex justify-center">
            <Segmented
              ariaLabel="Insight"
              value={insight}
              onChange={setInsight}
              options={[
                { value: "explain", label: "Explanation (SHAP)" },
                { value: "physiology", label: "Physiological breakdown" },
              ]}
            />
          </div>
          {insight === "explain" ? <ExplanationPanel /> : <PhysiologyTable />}
        </div>
      </main>
    </div>
  );
}

function BootError({ message }: { message: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
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

export default function App() {
  useBoot();
  usePredictionSync();
  const tab = useStore((s) => s.tab);
  const bootError = useStore((s) => s.bootError);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Header />
      <DisclaimerBanner />
      {bootError ? (
        <BootError message={bootError} />
      ) : tab === "analysis" ? (
        <Analysis />
      ) : (
        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto">
          <Suspense fallback={<div className="p-6"><Fallback /></div>}>
            {tab === "model" ? <ModelPerformance /> : <About />}
          </Suspense>
        </div>
      )}
      <DisclaimerModal />
    </div>
  );
}
