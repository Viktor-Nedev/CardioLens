import { AdaptiveDpr, Bvh, Environment, Lightformer, PerformanceMonitor, useProgress } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Component, Suspense, useEffect, useState, type ReactNode } from "react";
import { META_URL, type AnatomyMeta } from "../../anatomy/registry";
import { useStore } from "../../state/store";
import type { TargetId } from "../../lib/types";
import { AnatomyScene } from "./AnatomyScene";
import { CameraRig } from "./CameraRig";
import { HoverCard, LayerMenu, RiskLegend, ViewBar } from "./ViewerOverlays";

const KEY_TARGET: Record<string, TargetId> = { "0": "cad", "1": "lad", "2": "lcx", "3": "rca" };

class CanvasBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="flex h-full items-center justify-center p-8 text-center text-sm text-ink-2">
          3D rendering is unavailable in this browser (WebGL could not start). The risk dashboard still works.
        </div>
      );
    }
    return this.props.children;
  }
}

function LoadingOverlay() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="panel flex items-center gap-3 px-4 py-2.5 text-xs text-ink-2">
        <div className="h-1 w-32 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
        </div>
        Loading anatomy {Math.round(progress)}%
      </div>
    </div>
  );
}

export function Viewer() {
  const [meta, setMeta] = useState<AnatomyMeta | null>(null);
  const performance = useStore((s) => s.viewer.performance);
  const toggleViewer = useStore((s) => s.toggleViewer);
  const select = useStore((s) => s.select);

  useEffect(() => {
    fetch(META_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then(setMeta)
      .catch(() => setMeta(null));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && ["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)) return;
      const t = KEY_TARGET[e.key];
      if (t) select(t);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [select]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-line bg-[radial-gradient(ellipse_at_50%_40%,#162338_0%,#0b111b_55%,#080b11_100%)]">
      <CanvasBoundary>
        <Canvas
          dpr={performance ? 1 : [1, 1.75]}
          gl={{ antialias: !performance, powerPreference: "high-performance", alpha: true }}
          camera={{ fov: 34, near: 0.05, far: 60, position: [1.1, 0.6, 7.6] }}
          onPointerMissed={() => useStore.getState().setHoverInfo(null)}
          aria-label="Interactive 3D heart with coronary arteries coloured by predicted stenosis probability"
        >
          <PerformanceMonitor onDecline={() => toggleViewer("performance", true)} />
          <AdaptiveDpr pixelated />
          <ambientLight intensity={0.35} />
          <hemisphereLight args={["#dfe8ff", "#2a1a20", 0.55]} />
          <directionalLight position={[3, 4, 5]} intensity={1.7} />
          <directionalLight position={[-4, -1.5, -3]} intensity={0.55} color="#7fa8ff" />
          <Environment resolution={32} frames={1}>
            <Lightformer intensity={1.2} position={[0, 4, 3]} scale={[6, 2, 1]} color="#ffffff" />
            <Lightformer intensity={0.6} position={[-4, 0, -2]} scale={[3, 3, 1]} color="#8fb6ff" />
          </Environment>
          <Suspense fallback={null}>
            <Bvh firstHitOnly>
              <AnatomyScene meta={meta} />
            </Bvh>
          </Suspense>
          <CameraRig meta={meta} />
        </Canvas>
      </CanvasBoundary>

      <LoadingOverlay />
      <ViewBar />
      <LayerMenu />
      <RiskLegend />
      <HoverCard />
      <p className="pointer-events-none absolute bottom-2.5 left-1/2 hidden -translate-x-1/2 text-[10px] font-medium uppercase tracking-[0.14em] text-white/35 md:block">
        Decision support only · not a diagnostic image
      </p>
    </div>
  );
}
