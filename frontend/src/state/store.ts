import { create } from "zustand";
import type {
  Case,
  Importance,
  MetricsReport,
  Patient,
  Prediction,
  Schema,
  TargetId,
} from "../lib/types";

export type Tab = "analysis" | "model" | "about";

export interface ViewerSettings {
  torso: boolean;
  ribs: boolean;
  lungs: boolean;
  greatVessels: boolean;
  veins: boolean;
  territories: boolean;
  labels: boolean;
  xray: boolean;
  heartbeat: boolean;
  autoRotate: boolean;
  performance: boolean;
}

export interface CameraRequest {
  view: string; // preset id or a structure node name
  nonce: number;
}

export interface HoverInfo {
  title: string;
  detail?: string;
  target?: TargetId;
  x: number;
  y: number;
}

interface Baseline {
  label: string;
  patient: Patient;
  prediction?: Prediction;
}

interface AppState {
  schema?: Schema;
  cases: Case[];
  metrics?: MetricsReport;
  importance?: Importance;
  bootError?: string;

  patient: Patient;
  activeCaseId?: string;
  baseline?: Baseline;

  prediction?: Prediction;
  predicting: boolean;
  predictError?: string;

  selected: TargetId;
  hovered: TargetId | null;
  hoverInfo: HoverInfo | null;
  tab: Tab;
  viewer: ViewerSettings;
  camera: CameraRequest | null;
  disclaimerAccepted: boolean;

  setBoot: (data: { schema: Schema; cases: Case[]; metrics: MetricsReport; importance: Importance }) => void;
  setBootError: (msg: string) => void;
  setFeature: (id: string, value: Patient[string]) => void;
  loadPatient: (patient: Patient, label: string, caseId?: string) => void;
  resetFeature: (id: string) => void;
  setPrediction: (p: Prediction) => void;
  setPredicting: (v: boolean) => void;
  setPredictError: (msg?: string) => void;
  select: (t: TargetId, fly?: boolean) => void;
  setHovered: (t: TargetId | null) => void;
  setHoverInfo: (h: HoverInfo | null) => void;
  setTab: (t: Tab) => void;
  toggleViewer: (key: keyof ViewerSettings, value?: boolean) => void;
  flyTo: (view: string) => void;
  acceptDisclaimer: () => void;
}

const DISCLAIMER_KEY = "cardiolens.disclaimer.v1";

function readAccepted(): boolean {
  try {
    return sessionStorage.getItem(DISCLAIMER_KEY) === "1";
  } catch {
    return false;
  }
}

const TARGET_NODE: Record<TargetId, string> = {
  cad: "overview_heart",
  lad: "vessel_LAD",
  lcx: "vessel_LCX",
  rca: "vessel_RCA",
};

export const useStore = create<AppState>((set, get) => ({
  cases: [],
  patient: {},
  predicting: false,
  selected: "cad",
  hovered: null,
  hoverInfo: null,
  tab: "analysis",
  viewer: {
    torso: true,
    ribs: true,
    lungs: false,
    greatVessels: true,
    veins: false,
    territories: true,
    labels: true,
    xray: false,
    heartbeat: true,
    autoRotate: false,
    performance: false,
  },
  camera: null,
  disclaimerAccepted: readAccepted(),

  setBoot: ({ schema, cases, metrics, importance }) => {
    // Start from the highest-risk hold-out patient so the demo opens on a finding.
    const initial = cases.length ? cases[cases.length - 1] : undefined;
    set({ schema, cases, metrics, importance });
    if (initial) get().loadPatient(initial.features, initial.title, initial.id);
    else get().loadPatient(schema.default_patient, "Cohort median");
  },
  setBootError: (msg) => set({ bootError: msg }),

  setFeature: (id, value) => set((s) => ({ patient: { ...s.patient, [id]: value } })),
  loadPatient: (patient, label, caseId) =>
    set({ patient: { ...patient }, activeCaseId: caseId, baseline: { label, patient: { ...patient } } }),
  resetFeature: (id) =>
    set((s) => {
      const source = s.baseline?.patient ?? s.schema?.default_patient ?? {};
      return { patient: { ...s.patient, [id]: source[id] ?? null } };
    }),

  setPrediction: (p) =>
    set((s) => {
      const baseline = s.baseline && !s.baseline.prediction ? { ...s.baseline, prediction: p } : s.baseline;
      return { prediction: p, baseline, predictError: undefined };
    }),
  setPredicting: (v) => set({ predicting: v }),
  setPredictError: (msg) => set({ predictError: msg }),

  select: (t, fly = true) => {
    set({ selected: t });
    if (fly) get().flyTo(TARGET_NODE[t]);
  },
  setHovered: (t) => set({ hovered: t }),
  setHoverInfo: (h) => set({ hoverInfo: h }),
  setTab: (t) => set({ tab: t }),
  toggleViewer: (key, value) => set((s) => ({ viewer: { ...s.viewer, [key]: value ?? !s.viewer[key] } })),
  flyTo: (view) => set((s) => ({ camera: { view, nonce: (s.camera?.nonce ?? 0) + 1 } })),
  acceptDisclaimer: () => {
    try {
      sessionStorage.setItem(DISCLAIMER_KEY, "1");
    } catch {
      /* storage unavailable: the modal simply shows again next visit */
    }
    set({ disclaimerAccepted: true });
  },
}));

/** True when the current inputs differ from the loaded case (what-if mode). */
export function useIsModified(): boolean {
  return useStore((s) => {
    const base = s.baseline?.patient;
    if (!base) return false;
    return Object.keys(s.patient).some((k) => s.patient[k] !== base[k]);
  });
}
