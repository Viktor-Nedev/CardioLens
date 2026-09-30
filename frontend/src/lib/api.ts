import type { Case, Importance, MetricsReport, Patient, Prediction, Schema } from "./types";

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
};
