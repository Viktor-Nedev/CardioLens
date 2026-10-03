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
  bloom: boolean;
  flow: boolean;
  hologram: boolean;
  performance: boolean;
}

export interface Toast {
  id: number;
  title: string;
  detail?: string;
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
  toast: Toast | null;
  shortcutsOpen: boolean;
  reportOpen: boolean;
  /** Index of the guided-tour step on screen, or null. */
  tourStep: number | null;
  /** 3D cross-section depth: 0 = off, 1 = cut through to the back of the heart. */
  section: number;
  /** Registered by the 3D viewer: PNG data URL of the current frame. */
  snapshot?: () => string | null;
  /** Bumps on every new prediction; drives the 3D "re-analysis" scan sweep. */
  scanNonce: number;

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
  showToast: (title: string, detail?: string) => void;
  dismissToast: () => void;
  setShortcutsOpen: (open: boolean) => void;
  setReportOpen: (open: boolean) => void;
  setTourStep: (step: number | null) => void;
  setSection: (depth: number) => void;
}

const DISCLAIMER_KEY = "cardiolens.disclaimer.v1";

function readAccepted(): boolean {
  try {
    return sessionStorage.getItem(DISCLAIMER_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Opening case: a hold-out patient with CAD where the vessel findings are mixed and
 * every model agrees with angiography, so the first screen shows contrast between arteries.
 */
function pickShowcase(cases: Case[]): Case | undefined {
  const vessels: TargetId[] = ["lad", "lcx", "rca"];
  const agrees = (c: Case, t: TargetId, thr = 0.5) => (c.predicted[t] >= thr) === Boolean(c.truth[t]);
  const mixed = cases.filter((c) => {
    const n = vessels.filter((v) => c.truth[v]).length;
    return c.truth.cad === 1 && n >= 1 && n <= 2 && agrees(c, "cad") && vessels.every((v) => agrees(c, v));
  });
  const pool = mixed.length ? mixed : cases;
  return [...pool].sort((a, b) => b.predicted.cad - a.predicted.cad)[0];
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
    bloom: true,
    flow: true,
    hologram: true,
    performance: false,
  },
  camera: null,
  disclaimerAccepted: readAccepted(),
  toast: null,
  shortcutsOpen: false,
  reportOpen: false,
  tourStep: null,
  section: 0,
  scanNonce: 0,

  setBoot: ({ schema, cases, metrics, importance }) => {
    const initial = pickShowcase(cases);
    set({ schema, cases, metrics, importance });
    if (initial) get().loadPatient(initial.features, initial.title, initial.id);
    else get().loadPatient(schema.default_patient, "Cohort median");
  },
  setBootError: (msg) => set({ bootError: msg }),

  setFeature: (id, value) => set((s) => ({ patient: { ...s.patient, [id]: value } })),
  loadPatient: (patient, label, caseId) => {
    set({ patient: { ...patient }, activeCaseId: caseId, baseline: { label, patient: { ...patient } } });
    const c = caseId ? get().cases.find((x) => x.id === caseId) : undefined;
    if (c) {
      const vessels = (["lad", "lcx", "rca"] as const).filter((v) => c.truth[v]).map((v) => v.toUpperCase());
      get().showToast(
        `${c.title} loaded`,
        c.truth.cad ? `Angiography: CAD${vessels.length ? ` · stenotic ${vessels.join(", ")}` : ""}` : "Angiography: normal coronaries",
      );
    } else {
      get().showToast(`${label} loaded`);
    }
  },
  resetFeature: (id) =>
    set((s) => {
      const source = s.baseline?.patient ?? s.schema?.default_patient ?? {};
      return { patient: { ...s.patient, [id]: source[id] ?? null } };
    }),

  setPrediction: (p) =>
    set((s) => {
      const baseline = s.baseline && !s.baseline.prediction ? { ...s.baseline, prediction: p } : s.baseline;
      return { prediction: p, baseline, predictError: undefined, scanNonce: s.scanNonce + 1 };
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
  showToast: (title, detail) => set((s) => ({ toast: { id: (s.toast?.id ?? 0) + 1, title, detail } })),
  dismissToast: () => set({ toast: null }),
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
  setReportOpen: (open) => set({ reportOpen: open }),
  setTourStep: (step) => set({ tourStep: step }),
  setSection: (depth) => set({ section: Math.min(1, Math.max(0, depth)) }),
}));

/** True when the current inputs differ from the loaded case (what-if mode). */
export function useIsModified(): boolean {
  return useStore((s) => {
    const base = s.baseline?.patient;
    if (!base) return false;
    return Object.keys(s.patient).some((k) => s.patient[k] !== base[k]);
  });
}
