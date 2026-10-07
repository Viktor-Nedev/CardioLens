// Shareable links: the hash carries a hold-out case id, or the inputs that differ from the cohort defaults.
import { TARGET_ORDER, type Patient, type TargetId } from "./types";

export interface SharedState {
  caseId?: string;
  patient?: Patient;
  target?: TargetId;
}

const toBase64Url = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64Url = (s: string) => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
};

/** Hash fragment for a patient: `case=H029` when unedited, otherwise only the values that differ from the defaults. */
export function encodeShare(
  patient: Patient,
  defaults: Patient,
  target: TargetId,
  caseId?: string,
  edited = false,
): string {
  const params = new URLSearchParams();
  if (caseId && !edited) params.set("case", caseId);
  else {
    const diff: Patient = {};
    for (const [k, v] of Object.entries(patient)) if (v !== defaults[k]) diff[k] = v;
    params.set("p", toBase64Url(JSON.stringify(diff)));
  }
  if (target !== "cad") params.set("t", target);
  return params.toString();
}

/** Read a shared state from a hash fragment; unknown or malformed parts are ignored. */
export function decodeShare(hash: string, defaults: Patient): SharedState | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const out: SharedState = {};
  const t = params.get("t");
  if (t && (TARGET_ORDER as string[]).includes(t)) out.target = t as TargetId;
  const caseId = params.get("case");
  if (caseId) out.caseId = caseId;
  const p = params.get("p");
  if (p) {
    try {
      const diff = JSON.parse(fromBase64Url(p)) as Patient;
      if (diff && typeof diff === "object" && !Array.isArray(diff)) {
        const patient: Patient = { ...defaults };
        for (const [k, v] of Object.entries(diff)) {
          if (k in defaults && (v === null || typeof v === "number" || typeof v === "string")) patient[k] = v;
        }
        out.patient = patient;
      }
    } catch {
      /* malformed link: fall back to the default opening case */
    }
  }
  return out.caseId || out.patient ? out : null;
}
