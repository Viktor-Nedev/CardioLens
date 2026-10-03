# Model card: CardioLens coronary risk models

## Model details

| | |
|---|---|
| Version | 1.0.0 |
| Type | Four independent binary classifiers with Platt calibration and a Youden decision threshold |
| Targets | Overall CAD; ≥50% stenosis of the LAD, LCX and RCA |
| Algorithms | Elastic-net logistic regression (CAD, LAD, RCA); gradient boosting (LCX). Chosen by 5×5 nested cross-validation among logistic regression, gradient boosting, random forest and an SVM benchmark |
| Inputs | 54 routine clinical features: demographics, history, symptoms and examination, ECG, laboratory, echocardiography |
| Outputs | Calibrated probability, 80% bootstrap interval, decision at the threshold, risk band, SHAP contributions per input |
| Code licence | MIT |

## Intended use

- **Intended:**
  - decision support and education;
  - exploring how routine findings relate to angiographic CAD and to vessel-level stenosis;
  - teaching model interpretability.
- **Users:** clinicians, students and researchers who understand that the outputs are statistical estimates.
- **Out of scope:**
  - diagnosis or ruling out disease;
  - treatment or referral decisions;
  - emergency triage;
  - use on populations unlike the training data, such as other countries, other referral patterns or paediatric patients;
  - locating lesions. The 3D view colours whole arteries; it does not image the patient.

## Training and evaluation data

- **Dataset.** Extension of the Z-Alizadeh Sani dataset (UCI #411, CC BY 4.0): 303 patients from a single cardiovascular centre in Iran who underwent angiography. The data are public and de-identified.
- **Labels.** Angiography: CAD in 216 patients (71%), LAD stenosis in 177 (58%), LCX in 119 (39%), RCA in 114 (38%).
- **Split.** A stratified 80/20 split into 242 development and 61 hold-out patients. The hold-out set was used once, after all modelling choices were frozen.
- **Excluded inputs.** `Cath`, `LAD`, `LCX` and `RCA` (target leakage) and `Exertional CP` (constant).

## Performance

Hold-out ROC-AUC with bootstrap 95% CI:

| Target | ROC-AUC | Sensitivity | Specificity | Brier |
|---|---|---|---|---|
| CAD | 0.88 [0.76–0.97] | 0.86 | 0.76 | 0.121 |
| LAD | 0.74 [0.61–0.86] | 0.78 | 0.60 | 0.231 |
| LCX | 0.75 [0.61–0.87] | 0.76 | 0.61 | 0.197 |
| RCA | 0.75 [0.61–0.86] | 0.87 | 0.50 | 0.188 |

- **Nested cross-validation ROC-AUC** (mean ± sd): CAD 0.93 ± 0.04, LAD 0.86 ± 0.04, LCX 0.73 ± 0.05, RCA 0.70 ± 0.06.
- **Comparison with a simple baseline.** A logistic regression on eight classic risk factors reaches a hold-out AUC of 0.84 / 0.72 / 0.77 / 0.73 (CAD / LAD / LCX / RCA). At vessel level, the full models add little discrimination beyond it.
- **Clinical usefulness.** A decision curve on the hold-out set shows positive net benefit over "treat all" for CAD at thresholds of about 0.2–0.9.
- **Subgroups.** The app reports subgroup performance by sex and age band. Groups are small (20–34 patients), so their estimates are unstable. The age > 65 group contains very few patients without CAD.

## Explanations

- SHAP values come from the linear explainer for logistic regression and path-dependent Tree SHAP for gradient boosting.
- They are expressed in calibrated log-odds and folded back to clinical features. They sum exactly (to 10⁻⁶) from the average patient to the prediction.
- LIME (a weighted local linear surrogate fitted to 1,000 perturbed copies of the patient) is computed on demand as an independent check. Across the 61 hold-out patients it correlates with SHAP at a median r = 0.98 (minimum 0.95), shares 4.5 of the top 5 factors on average and agrees on the direction of every main factor.
- What-if curves vary one input while holding the others fixed. They describe how the model responds, not causal or treatment effects.

## Ethical considerations and risks

- **Automation bias.** Users may over-trust a precise-looking number or a red artery. Mitigations in the app:
  - permanent disclaimers;
  - intervals next to every probability;
  - visible decision thresholds;
  - the angiography result for hold-out patients;
  - explicit labelling of schematic elements (perfusion territories).
- **Dataset shift.** Prevalence (71% CAD) reflects a referral population undergoing angiography. Probabilities will be too high for a general or screening population.
- **Fairness.** Subgroup estimates rest on few patients. No external or prospective validation has been done.
- **Privacy.** The application stores no patient data on the server. Inputs exist only in the browser session and in the request being scored.

## Caveats and recommendations

- Treat vessel-level outputs as exploratory: their discrimination is modest and close to a risk-factor baseline.
- Recalibrate and re-validate on local data before any use beyond education. The pipeline (`python -m cardiolens.train`) makes this reproducible.
- Keep the disclaimer and interval displays whenever the models are reused.
