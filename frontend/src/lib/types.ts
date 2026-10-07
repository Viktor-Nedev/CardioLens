// Shapes returned by the CardioLens API (backend/cardiolens/api).

export type TargetId = "cad" | "lad" | "lcx" | "rca";
export type FeatureKind = "numeric" | "binary" | "ordinal" | "categorical";
export type FeatureValue = number | string | null;
export type Patient = Record<string, FeatureValue>;

export interface FeatureOption {
  value: number | string;
  label: string;
}

export interface FeatureStats {
  default: number | string;
  mean?: number | null;
  std?: number | null;
  min?: number | null;
  max?: number | null;
  quantiles?: (number | null)[];
  distribution?: Record<string, number>;
}

export interface FeatureSchema {
  id: string;
  label: string;
  group: string;
  kind: FeatureKind;
  unit: string | null;
  range: [number, number] | null;
  step: number | null;
  ref: [number, number] | null;
  options: FeatureOption[] | null;
  description: string | null;
  source_column: string;
  stats: FeatureStats;
}

export interface TargetSchema {
  id: TargetId;
  label: string;
  short: string;
  kind: "overall" | "vessel";
  structure: string;
  description: string | null;
  territory: string | null;
}

export interface Schema {
  groups: { id: string; label: string }[];
  features: FeatureSchema[];
  targets: TargetSchema[];
  risk_bands: { id: string; label: string; max: number }[];
  excluded_columns: { leakage: string[]; constant: string[] };
  default_patient: Patient;
  disclaimer: string;
}

export interface Contribution {
  feature: string;
  label: string;
  display: string;
  contribution: number;
  delta_pp: number;
  imputed: boolean;
}

export interface TargetPrediction {
  id: TargetId;
  label: string;
  short: string;
  structure: string;
  probability: number;
  interval: [number, number] | null;
  threshold: number;
  positive: boolean;
  risk_band: { id: "low" | "moderate" | "high"; label: string };
  model: string;
  base_logit: number;
  base_probability: number;
  logit: number;
  additivity_error: number;
  contributions: Contribution[];
  summary: string;
}

export interface PhysiologyRow {
  feature: string;
  label: string;
  group: string;
  kind: FeatureKind;
  value: number | string | null;
  display: string;
  unit: string | null;
  ref: [number, number] | null;
  flag: "low" | "high" | "normal" | "abnormal" | null;
  percentile: number | null;
  imputed: boolean;
  contributions: Record<TargetId, number>;
}

export interface Prediction {
  targets: Record<TargetId, TargetPrediction>;
  physiology: PhysiologyRow[];
  imputed: string[];
  warnings: string[];
  latency_ms: number;
  disclaimer: string;
}

export interface Case {
  id: string;
  patient_id: number;
  title: string;
  subtitle: string;
  features: Patient;
  truth: Record<TargetId, 0 | 1>;
  predicted: Record<TargetId, number>;
  interval: Partial<Record<TargetId, [number, number]>>;
}

export interface MetricCI {
  value: number;
  ci_low: number;
  ci_high: number;
}

export interface PointMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  specificity: number;
  npv: number;
  f1: number;
  roc_auc: number;
  pr_auc: number;
  brier: number;
}

export interface CvSummary {
  scheme: string;
  n_folds: number;
  roc_auc_mean: number;
  roc_auc_std: number;
  pr_auc_mean: number;
  pr_auc_std: number;
  fold_roc_auc: number[];
}

export interface FamilyComparison {
  label: string;
  selectable: boolean;
  cv: CvSummary;
  best_params: Record<string, unknown>;
  holdout_reference: PointMetrics;
}

export interface Curves {
  roc: [number, number][];
  pr: [number, number][];
  calibration: [number, number][];
}

export interface TargetReport {
  label: string;
  short: string;
  selected_family: string;
  selected_label: string;
  best_params: Record<string, unknown>;
  threshold: number;
  threshold_f1: number;
  calibration: { a: number; b: number };
  comparison: Record<string, FamilyComparison>;
  baselines: {
    prevalence: { label: string; cv_roc_auc: number; holdout: { roc_auc: number; brier: number } };
    risk_factors_lr: {
      label: string;
      features: string[];
      cv_roc_auc: number;
      cv_roc_auc_std: number;
      holdout: PointMetrics;
    };
  };
  dev_oof: { metrics: PointMetrics; curves: Curves };
  holdout: {
    n: number;
    positives: number;
    metrics: Record<keyof PointMetrics, MetricCI>;
    confusion: { tn: number; fp: number; fn: number; tp: number };
    curves: Curves;
  };
}

export interface MetricsReport {
  generated_at: string;
  version: string;
  environment: Record<string, string>;
  dataset: {
    name: string;
    n_patients: number;
    n_features: number;
    excluded: { leakage: string[]; constant: string[] };
    prevalence: Record<TargetId, number>;
    cad_vs_vessels: {
      cad_with_no_stenotic_vessel: number;
      normal_with_stenotic_vessel: number;
      vessel_count_distribution: Record<string, number>;
    };
  };
  split: {
    method: string;
    seed: number;
    n_dev: number;
    n_holdout: number;
    holdout_prevalence: Record<TargetId, number>;
  };
  protocol: Record<string, string | number>;
  targets: Record<TargetId, TargetReport>;
}

export interface ImportanceRow {
  feature: string;
  label: string;
  mean_abs_shap: number;
  mean_shap: number;
  permutation_auc_drop: number;
  permutation_auc_drop_std: number;
}

export type Importance = Record<TargetId, ImportanceRow[]>;

export const TARGET_ORDER: TargetId[] = ["cad", "lad", "lcx", "rca"];
export const VESSELS: TargetId[] = ["lad", "lcx", "rca"];

export interface Profile {
  feature: string;
  label: string;
  kind: FeatureKind;
  unit: string | null;
  ref: [number, number] | null;
  grid: (number | string)[];
  labels: string[] | null;
  current: number | string;
  targets: Record<TargetId, number[]>;
  thresholds: Record<TargetId, number>;
}

export interface Neighbour {
  patient_id: number;
  similarity: number;
  distance: number;
  summary: string;
  truth: Record<TargetId, 0 | 1>;
  features: Patient;
}

export interface SimilarResult {
  neighbours: Neighbour[];
  summary: Record<TargetId, number>;
  k: number;
  pool: number;
  /** The patient's place on the cohort map (0..1), interpolated from its nearest neighbours */
  position: [number, number] | null;
}

export interface MapPoint {
  patient_id: number;
  x: number;
  y: number;
  cad: 0 | 1;
  /** Number of stenotic arteries at angiography (0-3) */
  vessels: number;
}

export interface CohortMap {
  method: string | null;
  pool: number;
  points: MapPoint[];
}

export interface LimeWeight {
  feature: string;
  label: string;
  display: string;
  /** LIME surrogate weight, calibrated log-odds */
  lime: number;
  /** SHAP contribution for the same feature, calibrated log-odds */
  shap: number;
  imputed: boolean;
}

export interface LimeTarget {
  intercept: number;
  /** Weighted R² of the local linear surrogate (fidelity) */
  r2: number;
  /** Pearson correlation between LIME weights and SHAP values across all features */
  correlation: number;
  top_overlap: number;
  top_n: number;
  /** Share of the relevant SHAP factors whose LIME weight has the same sign */
  sign_agreement: number;
  weights: LimeWeight[];
}

export interface LimeResult {
  samples: number;
  donors: number;
  kernel_width: number;
  seed: number;
  targets: Record<TargetId, LimeTarget>;
  latency_ms: number;
}
