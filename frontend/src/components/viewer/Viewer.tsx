import { AdaptiveDpr, Bvh, Environment, Lightformer, PerformanceMonitor, useProgress } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { AnimatePresence, motion } from "motion/react";
import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { META_URL, type AnatomyMeta } from "../../anatomy/registry";
import type { TargetId } from "../../lib/types";
import { useStore } from "../../state/store";
import { AnatomyScene } from "./AnatomyScene";
import { CameraRig } from "./CameraRig";
import { Flythrough } from "./Flythrough";
import { Ambience, PostFX } from "./Effects";
import { createBackdropTexture } from "./materials";
import { HoverCard, LayerMenu, RiskLegend, ScanStatus, SectionControl, SnapshotButton, ViewBar } from "./ViewerOverlays";

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

/** Lets the rest of the app grab the current frame (report, PNG download). */
function SnapshotBridge() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    useStore.setState({
      snapshot: () => {
        try {
          return gl.domElement.toDataURL("image/png");
        } catch {
          return null;
        }
      },
    });
    return () => useStore.setState({ snapshot: undefined });
  }, [gl]);
  return null;
}

function LoadingOverlay() {
  const { active, progress } = useProgress();
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.6 } }}
        >
          <svg width="180" height="40" viewBox="0 0 180 40" aria-hidden>
            <motion.path
              d="M0 22 H48 L56 22 L62 30 L70 4 L78 36 L84 22 H104 Q112 12 120 22 H180"
              fill="none"
              stroke="#5cc8f5"
              strokeWidth="2"
              strokeLinejoin="round"
              initial={{ pathLength: 0, opacity: 0.4 }}
              animate={{ pathLength: [0, 1, 1], opacity: [0.4, 1, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            />
          </svg>
          <div className="glass-chip flex items-center gap-3 px-4 py-2 text-xs text-ink-2">
            <div className="h-1 w-32 overflow-hidden rounded-full bg-white/10">
              <motion.div className="h-full rounded-full bg-accent" animate={{ width: `${progress}%` }} />
            </div>
            Loading anatomy {Math.round(progress)}%
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Viewer({ active = true }: { active?: boolean }) {
  const [meta, setMeta] = useState<AnatomyMeta | null>(null);
  const performance = useStore((s) => s.viewer.performance);
  const bloom = useStore((s) => s.viewer.bloom);
  const toggleViewer = useStore((s) => s.toggleViewer);
  const select = useStore((s) => s.select);
  const revealed = useStore((s) => s.disclaimerAccepted);
  const flythrough = useStore((s) => s.flythrough);
  const setFlythrough = useStore((s) => s.setFlythrough);

  // The fly-through stops when the view is hidden.
  useEffect(() => {
    if (!active) setFlythrough(false);
  }, [active, setFlythrough]);
  const backdrop = useMemo(() => createBackdropTexture(), []);
  const composited = bloom && !performance;

  useEffect(() => {
    fetch(META_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then(setMeta)
      .catch(() => setMeta(null));
  }, []);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && ["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)) return;
      const t = KEY_TARGET[e.key];
      if (t) select(t);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [select, active]);

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-[#06090f] shadow-[0_20px_60px_-30px_rgb(0_0_0/0.9)]"
      data-tour="viewer"
      onPointerDownCapture={(e) => {
        // Any interaction with the 3D view hands control back from the fly-through.
        if (flythrough && !(e.target as HTMLElement).closest("[data-flythrough]")) setFlythrough(false);
      }}
    >
      <CanvasBoundary>
        <Canvas
          frameloop={active ? "always" : "never"}
          dpr={performance ? 1 : [1, 1.75]}
          gl={{ antialias: !composited && !performance, powerPreference: "high-performance", preserveDrawingBuffer: true }}
          camera={{ fov: 34, near: 0.05, far: 60, position: [1.1, 0.6, 7.6] }}
          onPointerMissed={() => useStore.getState().setHoverInfo(null)}
          aria-label="Interactive 3D heart with coronary arteries coloured by predicted stenosis probability"
        >
          <primitive attach="background" object={backdrop} />
          <PerformanceMonitor
            flipflops={3}
            onDecline={() => {
              // First step down: drop the bloom pass, keep the rest of the scene.
              if (useStore.getState().viewer.bloom) toggleViewer("bloom", false);
            }}
            onFallback={() => {
              toggleViewer("performance", true);
              useStore.getState().showToast("Performance mode on", "Visual effects were reduced to keep the 3D view smooth");
            }}
          />
          <AdaptiveDpr pixelated />
          <ambientLight intensity={0.35} />
          <hemisphereLight args={["#dfe8ff", "#2a1a20", 0.55]} />
          <directionalLight position={[3, 4, 5]} intensity={1.7} />
          <directionalLight position={[-4, -1.5, -3]} intensity={0.6} color="#7fa8ff" />
          <pointLight position={[0, -1.4, 1.6]} intensity={0.6} color="#5cc8f5" distance={5} />
          <Environment resolution={32} frames={1}>
            <Lightformer intensity={1.2} position={[0, 4, 3]} scale={[6, 2, 1]} color="#ffffff" />
            <Lightformer intensity={0.6} position={[-4, 0, -2]} scale={[3, 3, 1]} color="#8fb6ff" />
          </Environment>
          <Suspense fallback={null}>
            <Bvh firstHitOnly>
              <AnatomyScene />
            </Bvh>
            <Ambience />
          </Suspense>
          <CameraRig meta={meta} />
          <SnapshotBridge />
          <PostFX />
        </Canvas>
      </CanvasBoundary>

      {/* subtle inner vignette and scanline sheen over the canvas */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl shadow-[inset_0_0_80px_rgb(0_0_0/0.55)]" aria-hidden />
      <LoadingOverlay />
      {revealed && (
        <>
          {/* Static wrapper: overlays keep positioning against the viewer and fade out during the fly-through. */}
          <motion.div
            initial={false}
            animate={{ opacity: flythrough ? 0 : 1 }}
            transition={{ duration: 0.45 }}
            style={{ pointerEvents: flythrough ? "none" : undefined }}
          >
            <ViewBar />
            <SnapshotButton />
            <LayerMenu />
            <SectionControl />
            <ScanStatus />
            <RiskLegend />
            <HoverCard />
          </motion.div>
          <Flythrough />
          <p className="pointer-events-none absolute right-3 top-[3.4rem] z-40 hidden text-right text-[10px] font-medium uppercase tracking-[0.16em] text-white/30 md:block">
            Decision support only
            <br />
            Not a diagnostic image
          </p>
        </>
      )}
    </div>
  );
}
