// Plain viewer configuration, shared by the lazy-loaded 3D viewer and the command palette
// (kept free of three.js imports so the main bundle stays small).
import type { ViewerSettings } from "../../state/store";

type Vec = [number, number, number];

/** Camera presets in heart-centred scene units (+X patient-left, +Y up, +Z anterior). */
export const VIEW_PRESETS: Record<string, { label: string; position: Vec; target: Vec }> = {
  overview_torso: { label: "Torso", position: [1.1, 0.6, 7.6], target: [0, -0.35, 0] },
  overview_heart: { label: "Anterior", position: [0.4, 0.4, 3.45], target: [0, 0, 0] },
  right_anterior: { label: "Right anterior (RCA)", position: [-2.2, 0.35, 2.1], target: [0, 0, 0] },
  left_lateral: { label: "Left lateral (LCX)", position: [3.05, 0.3, -0.25], target: [0, 0, 0] },
  inferior: { label: "Inferior (PDA)", position: [0.25, -2.95, 0.85], target: [0, 0, 0] },
  posterior: { label: "Posterior", position: [-0.35, 0.35, -3.05], target: [0, 0, 0] },
  aortic_root: { label: "Aortic root", position: [0.15, 1.85, 2.1], target: [0, 0.45, 0] },
};

/** Layers and effects of the 3D view, in menu order. */
export const LAYERS: { key: keyof ViewerSettings; label: string; hint?: string; section?: string }[] = [
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
