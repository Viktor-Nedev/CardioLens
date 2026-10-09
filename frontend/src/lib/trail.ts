// Edit history: one entry per committed edit, with the predicted probabilities after it.
import type { FeatureSchema, FeatureValue, Patient, TargetId } from "./types";

export interface TrailEntry {
  patient: Patient;
  probs: Record<TargetId, number>;
  /** What changed to reach this entry, e.g. "Age: 80 → 72 years" */
  label: string;
  /** Set when exactly one input changed; consecutive edits of it are merged */
  feature?: string;
  t: number;
}

/** Edits of the same input closer together than this become one step (slider drags). */
export const MERGE_MS = 1500;
export const MAX_ENTRIES = 40;

export function formatValue(f: FeatureSchema | undefined, v: FeatureValue | undefined): string {
  if (v == null || v === "") return "imputed";
  if (!f) return String(v);
  const option = f.options?.find((o) => String(o.value) === String(v));
  if (option) {
    if (f.kind === "binary" && f.id !== "sex_male") return Number(v) === 1 ? "present" : "absent";
    return option.label;
  }
  return f.unit ? `${v} ${f.unit}` : String(v);
}

export function changedKeys(a: Patient, b: Patient): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((k) => (a[k] ?? null) !== (b[k] ?? null));
}

export function describeChange(a: Patient, b: Patient, features: FeatureSchema[]): string {
  const changed = changedKeys(a, b);
  if (changed.length === 0) return "No change";
  if (changed.length > 1) return `${changed.length} inputs changed`;
  const f = features.find((x) => x.id === changed[0]);
  return `${f?.label ?? changed[0]}: ${formatValue(f, a[changed[0]])} → ${formatValue(f, b[changed[0]])}`;
}

/**
 * Fold a new prediction into the trail. `restoring` marks predictions that follow an undo/redo
 * (they only refresh the probabilities of the current entry).
 */
export function advanceTrail(
  trail: TrailEntry[],
  cursor: number,
  patient: Patient,
  probs: Record<TargetId, number>,
  opts: { features: FeatureSchema[]; startLabel: string; now: number; restoring: boolean },
): { trail: TrailEntry[]; cursor: number } {
  const current = trail[cursor];
  if (!current) {
    return { trail: [{ patient: { ...patient }, probs, label: opts.startLabel, t: opts.now }], cursor: 0 };
  }
  const changed = changedKeys(current.patient, patient);
  if (opts.restoring || changed.length === 0) {
    return { trail: trail.map((e, i) => (i === cursor ? { ...e, probs } : e)), cursor };
  }
  const previous = trail[cursor - 1];
  const merge =
    previous && changed.length === 1 && current.feature === changed[0] && opts.now - current.t < MERGE_MS;
  if (merge) {
    // Dragged back to where it started: the step disappears.
    if (changedKeys(previous.patient, patient).length === 0) {
      return { trail: trail.slice(0, cursor).map((e, i) => (i === cursor - 1 ? { ...e, probs } : e)), cursor: cursor - 1 };
    }
    const entry = {
      patient: { ...patient },
      probs,
      label: describeChange(previous.patient, patient, opts.features),
      feature: changed[0],
      t: opts.now,
    };
    return { trail: [...trail.slice(0, cursor), entry], cursor };
  }
  const entry = {
    patient: { ...patient },
    probs,
    label: describeChange(current.patient, patient, opts.features),
    feature: changed.length === 1 ? changed[0] : undefined,
    t: opts.now,
  };
  const next = [...trail.slice(0, cursor + 1), entry].slice(-MAX_ENTRIES);
  return { trail: next, cursor: next.length - 1 };
}
