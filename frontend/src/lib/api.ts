import type {
  Case,
  CohortMap,
  Dependence,
  Importance,
  LimeResult,
  MetricsReport,
  Patient,
  Prediction,
  Profile,
  Schema,
  SimilarResult,
} from "./types";

const BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  return (await res.json()) as T;
}

export const api = {
  schema: () => request<Schema>("/api/schema"),
  cases: () => request<Case[]>("/api/cases"),
  metrics: () => request<MetricsReport>("/api/metrics"),
  importance: () => request<Importance>("/api/importance"),
  predict: (features: Patient, signal?: AbortSignal) =>
    request<Prediction>("/api/predict", {
      method: "POST",
      body: JSON.stringify({ features, with_interval: true }),
      signal,
    }),
  profile: (features: Patient, feature: string, signal?: AbortSignal) =>
    request<Profile>("/api/profile", {
      method: "POST",
      body: JSON.stringify({ features, feature, points: 41 }),
      signal,
    }),
  similar: (features: Patient, k = 5, signal?: AbortSignal) =>
    request<SimilarResult>("/api/similar", { method: "POST", body: JSON.stringify({ features, k }), signal }),
  cohortMap: () => request<CohortMap>("/api/cohort/map"),
  dependence: (feature: string, signal?: AbortSignal) =>
    request<Dependence>(`/api/dependence/${encodeURIComponent(feature)}?points=25`, { signal }),
  lime: (features: Patient, signal?: AbortSignal) =>
    request<LimeResult>("/api/lime", { method: "POST", body: JSON.stringify({ features, samples: 1000 }), signal }),
};
