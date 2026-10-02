import { CameraControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { AnatomyMeta } from "../../anatomy/registry";
import { useStore } from "../../state/store";

type Vec = [number, number, number];

export const VIEW_PRESETS: Record<string, { label: string; position: Vec; target: Vec }> = {
  overview_torso: { label: "Torso", position: [1.1, 0.6, 7.6], target: [0, -0.35, 0] },
  overview_heart: { label: "Anterior", position: [0.4, 0.4, 3.45], target: [0, 0, 0] },
  left_lateral: { label: "Left lateral", position: [3.05, 0.3, -0.25], target: [0, 0, 0] },
  inferior: { label: "Inferior", position: [0.25, -2.95, 0.85], target: [0, 0, 0] },
  posterior: { label: "Posterior", position: [-0.35, 0.35, -3.05], target: [0, 0, 0] },
};

function structureView(meta: AnatomyMeta, node: string): { position: Vec; target: Vec } | null {
  const n = meta.nodes[node];
  if (!n) return null;
  const [cx, cy, cz] = n.center;
  // Look at the vessel from outside the heart, with a slight anterior bias.
  const d: Vec = [cx, cy, cz + 0.18];
  const len = Math.hypot(...d) || 1;
  const dist = 2.35;
  return {
    position: [cx + (d[0] / len) * dist, cy + (d[1] / len) * dist + 0.15, cz + (d[2] / len) * dist],
    target: [cx * 0.55, cy * 0.55, cz * 0.55],
  };
}

export function CameraRig({ meta }: { meta: AnatomyMeta | null }) {
  const controls = useRef<CameraControls>(null);
  const request = useStore((s) => s.camera);
  const autoRotate = useStore((s) => s.viewer.autoRotate);
  const interacting = useRef(false);

  // Intro: hold on the torso while the welcome screen is open, then glide into the heart.
  const accepted = useStore((s) => s.disclaimerAccepted);
  const introDone = useRef(false);
  useEffect(() => {
    const c = controls.current;
    if (!c || introDone.current) return;
    const { position: p, target: t } = VIEW_PRESETS.overview_torso;
    void c.setLookAt(...p, ...t, false);
    if (!accepted) return;
    const id = window.setTimeout(() => {
      introDone.current = true;
      const h = VIEW_PRESETS.overview_heart;
      c.smoothTime = 1.1;
      void c.setLookAt(...h.position, ...h.target, true).then(() => {
        c.smoothTime = 0.45;
      });
    }, 450);
    return () => window.clearTimeout(id);
  }, [accepted]);

  useEffect(() => {
    const c = controls.current;
    if (!c || !request) return;
    const preset = VIEW_PRESETS[request.view] ?? (meta ? structureView(meta, request.view) : null);
    if (preset) void c.setLookAt(...preset.position, ...preset.target, true);
  }, [request, meta]);

  useFrame((_, delta) => {
    const c = controls.current;
    if (c && autoRotate && !interacting.current) c.azimuthAngle += delta * 0.25;
  });

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={0.9}
      maxDistance={11}
      smoothTime={0.45}
      draggingSmoothTime={0.12}
      onStart={() => (interacting.current = true)}
      onEnd={() => (interacting.current = false)}
    />
  );
}
