import type { Patient, TargetId } from "./types";

export interface ClinicalIntervention {
  id: string;
  category: "pharmacotherapy" | "lifestyle" | "procedural";
  title: string;
  subtitle: string;
  description: string;
  badge: string;
  iconName: string;
  color: string;
  apply: (p: Patient) => Partial<Patient>;
  isApplicable: (p: Patient) => boolean;
}

export const CLINICAL_INTERVENTIONS: ClinicalIntervention[] = [
  {
    id: "statin_high",
    category: "pharmacotherapy",
    title: "High-Intensity Statin Therapy",
    subtitle: "Atorvastatin 40–80 mg / Rosuvastatin 20–40 mg",
    description: "Lowers atherogenic LDL-C by ≥45% towards the ESC guideline target (<70 mg/dL or <55 mg/dL in high risk), reverses lipid dysregulation.",
    badge: "LDL -45%",
    iconName: "Pill",
    color: "#5cc8f5",
    isApplicable: (p) => {
      const ldl = Number(p.ldl);
      return !isNaN(ldl) && ldl > 70;
    },
    apply: (p) => {
      const currentLdl = Number(p.ldl) || 130;
      const targetLdl = Math.max(55, Math.round(currentLdl * 0.55));
      const currentTg = Number(p.triglycerides) || 150;
      const targetTg = Math.max(90, Math.round(currentTg * 0.85));
      return {
        ldl: targetLdl,
        triglycerides: targetTg,
        dyslipidemia: 0,
      };
    },
  },
  {
    id: "bp_optimization",
    category: "pharmacotherapy",
    title: "Antihypertensive Optimization",
    subtitle: "ACEi / ARB + CCB / Thiazide (AHA/ACC Target)",
    description: "Controls systemic vascular resistance, targeting systolic BP < 125–130 mmHg and reducing arterial shear stress.",
    badge: "SBP < 125 mmHg",
    iconName: "Gauge",
    color: "#3987e5",
    isApplicable: (p) => {
      const bp = Number(p.bp);
      return !isNaN(bp) && bp > 130;
    },
    apply: (p) => {
      const currentBp = Number(p.bp) || 140;
      return {
        bp: Math.min(125, Math.round(currentBp * 0.88)),
      };
    },
  },
  {
    id: "smoking_cessation",
    category: "lifestyle",
    title: "Structured Smoking Cessation",
    subtitle: "Behavioral counselling + Varenicline / NRT",
    description: "Halts endothelial oxidative injury, restores nitric oxide bioavailability and reduces platelet hyper-reactivity.",
    badge: "Tobacco Cessation",
    iconName: "CigaretteOff",
    color: "#199e70",
    isApplicable: (p) => Number(p.current_smoker) === 1,
    apply: () => ({
      current_smoker: 0,
      ex_smoker: 1,
    }),
  },
  {
    id: "metabolic_control",
    category: "pharmacotherapy",
    title: "Glycemic & Metabolic Control",
    subtitle: "SGLT2 inhibitor / GLP-1 RA / Metformin",
    description: "Normalizes fasting glycemia (FBS < 100 mg/dL), conferring direct cardio-renal protection and microvascular stabilization.",
    badge: "FBS < 100 mg/dL",
    iconName: "Activity",
    color: "#c98500",
    isApplicable: (p) => {
      const fbs = Number(p.fbs);
      return !isNaN(fbs) && fbs > 105;
    },
    apply: (p) => {
      const currentFbs = Number(p.fbs) || 120;
      return {
        fbs: Math.min(95, Math.round(currentFbs * 0.8)),
      };
    },
  },
  {
    id: "lifestyle_weight",
    category: "lifestyle",
    title: "Cardioprotective Diet & Weight Loss",
    subtitle: "Mediterranean nutrition & 7–10% weight loss",
    description: "Reduces visceral adiposity, systemic low-grade inflammation, and normalizes resting pulse rate.",
    badge: "BMI -8%",
    iconName: "Apple",
    color: "#199e70",
    isApplicable: (p) => {
      const bmi = Number(p.bmi);
      return !isNaN(bmi) && bmi > 25;
    },
    apply: (p) => {
      const currentWeight = Number(p.weight) || 80;
      const currentBmi = Number(p.bmi) || 27;
      const currentPr = Number(p.pulse_rate) || 75;
      const targetWeight = Math.round(currentWeight * 0.92);
      const targetBmi = Number((currentBmi * 0.92).toFixed(1));
      const targetPr = Math.max(60, currentPr - 6);
      return {
        weight: targetWeight,
        bmi: targetBmi,
        obesity: targetBmi > 25 ? 1 : 0,
        pulse_rate: targetPr,
      };
    },
  },
];

/**
 * Applies the selected interventions onto the given patient features, returning
 * the counterfactual patient vector.
 */
export function buildCounterfactualPatient(
  patient: Patient,
  activeInterventionIds: Set<string>,
): Patient {
  const counterfactual: Patient = { ...patient };
  for (const intervention of CLINICAL_INTERVENTIONS) {
    if (activeInterventionIds.has(intervention.id)) {
      const delta = intervention.apply(counterfactual);
      Object.assign(counterfactual, delta);
    }
  }
  return counterfactual;
}

export interface RiskReductionMetrics {
  originalRisk: number;
  simulatedRisk: number;
  absoluteReduction: number; // ARR
  relativeReduction: number; // RRR
  nnt5Year: number;
  crossesThreshold: boolean;
}

export function computeRiskMetrics(
  originalRisk: number,
  simulatedRisk: number,
  decisionThreshold: number,
): RiskReductionMetrics {
  const arr = Math.max(0, originalRisk - simulatedRisk);
  const rrr = originalRisk > 0 ? arr / originalRisk : 0;
  const nnt5Year = arr > 0.005 ? Math.max(1, Math.round(1 / arr)) : 999;
  const crossesThreshold = originalRisk >= decisionThreshold && simulatedRisk < decisionThreshold;

  return {
    originalRisk,
    simulatedRisk,
    absoluteReduction: arr,
    relativeReduction: rrr,
    nnt5Year,
    crossesThreshold,
  };
}

export interface GuidelineStratification {
  tier: "very-high" | "high" | "moderate" | "low";
  label: string;
  color: string;
  escCriteria: string;
  diagnosticRecommendation: string;
  therapeuticRecommendation: string;
}

/**
 * Evaluates patient CAD & vessel risks against ESC 2024 / AHA 2023 Clinical Guidelines.
 */
export function getGuidelineStratification(
  cadProbability: number,
  vesselProbs?: Partial<Record<TargetId, number>>,
): GuidelineStratification {
  const lad = vesselProbs?.lad ?? 0;
  const lcx = vesselProbs?.lcx ?? 0;
  const rca = vesselProbs?.rca ?? 0;
  const multiVessel = [lad >= 0.5, lcx >= 0.5, rca >= 0.5].filter(Boolean).length >= 2;

  if (cadProbability >= 0.75 || lad >= 0.7 || multiVessel) {
    return {
      tier: "very-high",
      label: "Very High Cardiovascular Risk",
      color: "#d03b3b",
      escCriteria: "High multi-vessel / proximal LAD stenosis probability (≥75% CAD or critical LAD risk).",
      diagnosticRecommendation: "Invasive coronary angiography (ICA) or urgent CT Coronary Angiography (CCTA) recommended.",
      therapeuticRecommendation: "High-intensity statin + ezetimibe, dual antiplatelet therapy consideration, guideline-directed BP control.",
    };
  }

  if (cadProbability >= 0.45 || lad >= 0.5 || lcx >= 0.5 || rca >= 0.5) {
    return {
      tier: "high",
      label: "High Cardiovascular Risk",
      color: "#c98500",
      escCriteria: "Elevated single-vessel stenosis probability above clinical decision threshold.",
      diagnosticRecommendation: "Anatomical or functional non-invasive ischemia testing (CCTA or stress CMR / SPECT).",
      therapeuticRecommendation: "High-intensity statin therapy, target LDL < 70 mg/dL, target SBP < 130 mmHg, lifestyle optimization.",
    };
  }

  if (cadProbability >= 0.2) {
    return {
      tier: "moderate",
      label: "Moderate Cardiovascular Risk",
      color: "#fab219",
      escCriteria: "Intermediate CAD risk band; borderline microvascular or metabolic risk drivers.",
      diagnosticRecommendation: "Functional exercise stress test or coronary calcium score (CAC) to refine risk.",
      therapeuticRecommendation: "Moderate-intensity statin, target LDL < 100 mg/dL, cardioprotective Mediterranean diet.",
    };
  }

  return {
    tier: "low",
    label: "Low Cardiovascular Risk",
    color: "#199e70",
    escCriteria: "Estimated CAD and vessel stenosis probabilities well below decision thresholds.",
    diagnosticRecommendation: "Routine non-invasive preventive surveillance; no immediate invasive testing indicated.",
    therapeuticRecommendation: "Reinforce primary lifestyle prevention: regular exercise, smoking abstinence, balanced nutrition.",
  };
}
