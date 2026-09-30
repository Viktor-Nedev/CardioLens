// Single source of truth linking model targets to nodes of heart.glb
// (built by anatomy/build_heart_glb.py). Adding a structure means adding a node
// to the GLB and an entry here; the viewer and dashboard pick it up from this map.

import type { TargetId } from "../lib/types";

export type StructureKind = "myocardium" | "coronary" | "vessel" | "context";

export interface StructureDef {
  node: string;
  label: string;
  kind: StructureKind;
  target?: TargetId;
  /** Channel of the myocardial territory weights (COLOR_0) supplied by this artery. */
  territoryChannel?: 0 | 1 | 2;
  /** Viewer layer toggle controlling visibility. */
  layer?: "greatVessels" | "veins" | "lungs" | "ribs" | "torso";
  pickable: boolean;
  note?: string;
}

export const STRUCTURES: StructureDef[] = [
  { node: "heart_wall", label: "Myocardium", kind: "myocardium", target: "cad", pickable: true },
  {
    node: "vessel_LAD",
    label: "Left anterior descending artery",
    kind: "coronary",
    target: "lad",
    territoryChannel: 0,
    pickable: true,
  },
  {
    node: "vessel_LCX",
    label: "Left circumflex artery",
    kind: "coronary",
    target: "lcx",
    territoryChannel: 1,
    pickable: true,
  },
  {
    node: "vessel_RCA",
    label: "Right coronary artery",
    kind: "coronary",
    target: "rca",
    territoryChannel: 2,
    pickable: true,
  },
  {
    node: "vessel_LM",
    label: "Left main coronary artery",
    kind: "vessel",
    pickable: true,
    note: "Not a prediction target in this dataset",
  },
  { node: "aorta", label: "Aorta", kind: "vessel", layer: "greatVessels", pickable: true },
  { node: "vena_cava", label: "Superior and inferior vena cava", kind: "vessel", layer: "greatVessels", pickable: true },
  { node: "cardiac_veins", label: "Cardiac veins", kind: "vessel", layer: "veins", pickable: true },
  { node: "lungs", label: "Lungs", kind: "context", layer: "lungs", pickable: false },
  { node: "trachea", label: "Trachea", kind: "context", layer: "lungs", pickable: false },
  { node: "ribs", label: "Rib cage", kind: "context", layer: "ribs", pickable: false },
  { node: "sternum", label: "Sternum", kind: "context", layer: "ribs", pickable: false },
  { node: "skin", label: "Torso", kind: "context", layer: "torso", pickable: false },
];

export const STRUCTURE_BY_NODE = Object.fromEntries(STRUCTURES.map((s) => [s.node, s])) as Record<
  string,
  StructureDef
>;

export const TARGET_NODE: Record<TargetId, string> = {
  cad: "heart_wall",
  lad: "vessel_LAD",
  lcx: "vessel_LCX",
  rca: "vessel_RCA",
};

/** Territory channel order in the GLB vertex colours. */
export const TERRITORY_TARGETS: TargetId[] = ["lad", "lcx", "rca"];

export interface AnatomyMeta {
  units: string;
  source: string;
  nodes: Record<string, { label: string; fma: string[]; faces: number; anchor: number[]; center: number[]; radius: number }>;
}

export const MODEL_URL = "/models/heart.glb";
export const META_URL = "/models/heart.meta.json";
