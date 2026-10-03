# CardioLens: project report

**Multimodal AI Hackathon 2026 · Track A: Cardiovascular Risk Visualization & Prediction**

CardioLens predicts overall coronary artery disease (CAD) and ≥50% stenosis of the
left anterior descending (LAD), left circumflex (LCX) and right coronary artery (RCA)
from routine clinical data. Each probability is mapped onto the matching artery of
an interactive 3D heart, and every estimate is explained with SHAP values and a
physiological breakdown.

The deliverables are:
- a web application: a FastAPI backend and a React/three.js dashboard;
- a reproducible training pipeline with the trained weights committed;
- a reproducible 3D-anatomy build;
- 45 automated tests and a CI workflow;
- a single-container Docker image and one-command start scripts.

> Decision support and education only. The outputs are statistical estimates and
> do not replace coronary angiography, CT angiography or clinical judgement.

![The CardioLens analysis view](figures/screenshot_analysis.jpg)
*Figure 1. The analysis view for hold-out patient #29: clinical inputs (left), the 3D heart with each artery coloured by its predicted stenosis probability (centre), and the calibrated risks with their SHAP explanation (right).*

## 1. Dataset and preprocessing

**Source.** The *Extension of Z-Alizadeh Sani* dataset (UCI #411, CC BY 4.0) has
303 patients and 59 columns in four groups: demographics, symptoms and examination,
ECG, and laboratory and echocardiography. It also has four angiography labels: `Cath` (CAD/Normal) and `LAD`, `LCX`, `RCA`
(Stenotic/Normal). There are no missing values.

| Label | Positives | Prevalence |
|---|---|---|
| CAD | 216 | 71.3% |
| LAD stenosis | 177 | 58.4% |
| LCX stenosis | 119 | 39.3% |
| RCA stenosis | 114 | 37.6% |

**Inputs.** Every input is declared in `backend/config/features.yaml` with its
source column, clinical label, group, type, unit, plausible range and (for display
only) an adult reference interval. That gives 54 model inputs:
- **21 continuous measurements** (age, weight, height, BMI, BP, pulse rate, 14 laboratory values, ejection fraction). These are median-imputed and standardised.
- **29 binary flags.** `Y/N` and `Male/Fmale` are mapped to 0/1; then majority imputation and standardisation.
- **3 ordinal scales.** Functional class 0–3; regions with RWMA 0–4, used strictly as a count and never as a location; valvular heart disease None/Mild/Moderate/Severe → 0–3.
- **1 categorical feature.** Bundle branch block N/LBBB/RBBB, one-hot encoded.

Two groups of columns are excluded:
- **Target leakage:** `Cath`, `LAD`, `LCX` and `RCA` are never inputs for any target. This is enforced three times:
  - config loading refuses a target column declared as a feature;
  - training asserts it;
  - a unit test checks the input columns of every saved model.
- **Constant:** `Exertional CP` is "N" for all 303 patients.

All preprocessing lives inside an sklearn `Pipeline`, so imputation and scaling are
fitted only on training folds. The same pipeline accepts partial records at
inference time: a field left empty in the UI is imputed and flagged as such.

**Label consistency.** No CAD patient lacks a stenotic vessel, and only one "Normal"
patient has one. So CAD ≈ "any of LAD/LCX/RCA". The number of stenotic vessels is
spread evenly: 86 / 87 / 67 / 63 patients with 0 / 1 / 2 / 3.

**Split.** A single stratified 80/20 split (seed 42) on the joint 4-label pattern
(rare patterns merged) gives 242 development and 61 hold-out patients with matching
prevalences. The hold-out set is touched exactly once, after all selection,
calibration and threshold choices are frozen. It also serves as the case library
in the dashboard, so demo patients are genuinely unseen.

## 2. Model architecture and validation

Each target (CAD, LAD, LCX, RCA) is an independent binary classifier:
`preprocessing → estimator → Platt calibrator → decision threshold`.
Four model families from `backend/cardiolens/models.py` are compared.

| Family | Hyper-parameter grid | Explainer |
|---|---|---|
| Logistic regression, elastic-net (saga) | C ∈ {0.03, 0.1, 0.3, 1}, l1-ratio ∈ {0, 0.5, 1}, class weight ∈ {none, balanced} | Linear SHAP |
| Gradient boosting (sklearn) | trees ∈ {100, 250}, learning rate ∈ {0.03, 0.1}, depth ∈ {2, 3}, subsample 0.8 | Tree SHAP |
| Random forest | depth ∈ {4, ∞}, min leaf ∈ {1, 4}, max features ∈ {√p, 0.3}, class weight | Tree SHAP |
| SVM, RBF kernel (benchmark only) | C ∈ {0.3, 1, 3}, γ ∈ {scale, 0.005}, class weight | Kernel SHAP (too slow for live use) |

**Nested cross-validation.**
- *Outer loop:* 5× repeated stratified 5-fold (25 folds), which estimates the whole "tune, then fit" procedure.
- *Inner loop:* a 5-fold grid search on the outer training part only.
- *Selection:* the family with the highest mean outer ROC-AUC. If another family is within 0.01, the simpler, more interpretable one wins.
- *Final fit:* the chosen family is re-tuned on the full development set.

**Calibration and threshold.**
- Out-of-fold scores (5×5 CV with the chosen hyper-parameters) are used to fit a Platt calibrator `p = σ(a·f(x) + b)` on the model margin `f`.
- This map is monotone and affine in log-odds, so the SHAP values of `f`, multiplied by `a`, stay exactly additive in calibrated log-odds.
- The decision threshold maximises Youden's J on the calibrated out-of-fold probabilities. The F1-optimal threshold is reported as well.

**Uncertainty.** 25 bootstrap refits of the tuned estimator share the fitted
preprocessor. Each prediction reports the 10th–90th percentile of their calibrated
probabilities as an 80% interval.

**Baselines.**
1. The prevalence classifier (AUC 0.5).
2. A logistic regression on eight classic pre-test risk factors: age, sex, diabetes, hypertension, current smoking, family history, dyslipidaemia and typical angina.

## 3. Results

**Hold-out set** (61 unseen patients; bootstrap 95% CI, 2000 resamples):

| Target | Model | ROC-AUC | Accuracy | Precision | Recall | Specificity | F1 | Brier |
|---|---|---|---|---|---|---|---|---|
| CAD | Elastic-net LR | **0.88** [0.76–0.97] | 0.84 | 0.90 | 0.86 | 0.76 | 0.88 | 0.121 |
| LAD | Elastic-net LR | **0.74** [0.61–0.86] | 0.70 | 0.74 | 0.78 | 0.60 | 0.76 | 0.231 |
| LCX | Gradient boosting | **0.75** [0.61–0.87] | 0.67 | 0.58 | 0.76 | 0.61 | 0.66 | 0.197 |
| RCA | Elastic-net LR | **0.75** [0.61–0.86] | 0.64 | 0.51 | 0.87 | 0.50 | 0.65 | 0.188 |

**Nested CV on the development set** (ROC-AUC, mean ± sd over 25 folds; selected family in bold):

| Target | Elastic-net LR | Gradient boosting | Random forest | SVM | Risk-factor LR |
|---|---|---|---|---|---|
| CAD | **0.929 ± 0.039** | 0.933 ± 0.031 | 0.932 ± 0.035 | 0.920 ± 0.048 | 0.921 ± 0.037 |
| LAD | **0.860 ± 0.044** | 0.852 ± 0.055 | 0.864 ± 0.055 | 0.841 ± 0.040 | 0.816 ± 0.067 |
| LCX | 0.666 ± 0.072 | **0.735 ± 0.052** | 0.718 ± 0.066 | 0.678 ± 0.067 | 0.719 ± 0.048 |
| RCA | **0.703 ± 0.057** | 0.679 ± 0.070 | 0.704 ± 0.065 | 0.705 ± 0.061 | 0.723 ± 0.068 |

![ROC and calibration per target](figures/roc_calibration.png)
*Figure 2. Top: hold-out ROC curves with AUC and 95% CI. Bottom: calibration of the out-of-fold development predictions (blue) and of the hold-out predictions (grey).*

**Discussion.**
- **CAD.** Overall CAD is predicted well: hold-out AUC 0.88 and F1 0.88, with a Brier score of 0.121 against 0.201 for the prevalence baseline.
- **LAD.** This is the most predictable vessel. Typical angina and regional wall-motion abnormality dominate, which matches the anterior territory's large contribution to echocardiographic findings.
- **LCX and RCA.** These are harder (hold-out AUC ≈ 0.75). The absolute values are modest.
- **Baseline.** The eight-feature risk-factor baseline stays competitive at vessel level:
  - hold-out AUC 0.84 / 0.72 / 0.77 / 0.73 for CAD / LAD / LCX / RCA;
  - on RCA it even edges the full models in nested CV, though well within one standard deviation.
- **Why vessel level is hard.** 303 patients from a single centre carry limited vessel-specific signal. A clinical ECG/echo summary locates ischaemia only coarsely.
- **What the full models add.** Mainly calibrated probabilities and a richer, patient-specific explanation that includes ECG and echo findings.
- **Uncertainty.** Hold-out confidence intervals are wide (61 patients). The nested-CV standard deviations (0.03–0.07) are the more stable estimate of generalisation.
- **Clinical utility.** On the hold-out set, a decision curve shows net benefit above "treat all" for CAD across thresholds of about 0.2–0.9. A subgroup check reports AUC, sensitivity and specificity by sex and age band, and flags groups too small to judge. A threshold explorer lets the user drag the decision threshold over the hold-out patients and watch sensitivity, specificity, PPV and NPV trade off.
- **Calibration.** Out-of-fold calibration follows the diagonal for LAD, LCX and RCA. For CAD it is S-shaped, because of the 71% prevalence and the strong effect of typical angina.

## 4. Clinical interpretability

**SHAP explainers.**
- Linear models use SHAP's linear explainer (interventional, 100 background patients).
- Tree models use path-dependent Tree SHAP. We first tried the interventional variant, but it drifted by up to 0.07 log-odds from the model output on a few patients.
- SHAP values of one-hot columns are summed back to their clinical feature, so every contribution corresponds 1:1 to a measurement.
- Contributions are expressed in calibrated log-odds, so the average patient's logit plus the sum of contributions equals the patient's logit. A unit test checks this to 10⁻⁶.

**LIME cross-check.** A second, independent method shows that an explanation does not depend on one technique. Each of 1,000 perturbed copies of the patient keeps the patient's own value for a random subset of factors and takes the others from random development patients (averaged over 5 donors). A weighted ridge regression of the calibrated log-odds on the "kept" indicators (exponential kernel, width 0.75√d) gives one weight per factor. Across the 61 hold-out patients, LIME and SHAP correlate at a median r = 0.98 (minimum 0.95), share 4.5 of their top 5 factors on average and agree on the direction of every main factor. The surrogate explains a median 70% of the variance of its samples.

**Global importance** (mean |SHAP| on the development set, cross-checked by permutation importance on the hold-out set):
- **CAD:** typical chest pain (1.60), regions with RWMA (0.81), age (0.79), hypertension (0.48), T-wave inversion (0.45).
- **LAD:** typical chest pain (1.24), regions with RWMA (0.80), age (0.54), ESR (0.31), ejection fraction (0.26).
- **LCX:** age, typical chest pain, fasting blood sugar, triglycerides, creatinine.
- **RCA:** diabetes, typical chest pain, age, sex, dyspnoea.

These drivers are clinically plausible and consistent with the literature on this dataset.

**What-if and case-based context.**
- A what-if curve (individual conditional expectation) shows each target's probability while one factor varies and the other inputs stay fixed. It is labelled as model sensitivity, not a treatment effect.
- Similar-patient retrieval finds the closest development patients in the standardised input space, weighted by global SHAP importance, and shows what angiography found in them.

**Per-patient explanation in the dashboard.** For each target the dashboard shows:
1. a deterministic text summary, for example *"LAD stenosis probability is 81% (high band, above the decision threshold of 43%). Factors increasing the estimate: typical chest pain (present), regions with wall-motion abnormality (2)…"*;
2. a SHAP waterfall that walks from the average patient to this patient factor by factor, on a log-odds axis labelled in probability. It also comes as a diverging bar chart and a table, labelled with the approximate change in probability each factor causes, with hover details;
3. an "average patient → this patient" probability anchor;
4. a **physiological breakdown** of all 54 inputs:
   - the value and its adult reference interval;
   - a status flag (high/low/present) shown with an icon and label;
   - the patient's percentile within the cohort;
   - the factor's signed share of the explanation for the selected target.

## 5. 3D visualisation

**Anatomy.** Meshes come from BodyParts3D (DBCLS, CC BY-SA 2.1 JP), which annotates
every part with a Foundational Model of Anatomy (FMA) id. `anatomy/build_heart_glb.py`
resolves the FMA primitives and groups them so each model target is exactly one GLB node:

| Node | FMA primitives |
|---|---|
| `vessel_LAD` | anterior interventricular branch (FMA3862) and its septal branches (FMA71670) |
| `vessel_LCX` | circumflex branch (FMA3895) |
| `vessel_RCA` | trunk (FMA3802), right marginal (FMA3818), right posterolateral (FMA76994), posterior interventricular (FMA3840) and septal branches (FMA71669) |
| `vessel_LM` | left main stem (FMA4685); shown but not a model target |
| `heart_wall` | wall of heart (FMA7274) |

Anatomical context comes from the aorta, venae cavae and cardiac veins, five lung lobes
and the trachea, 24 ribs and the three sternal parts, and the body surface (cropped to the
thorax, arms removed).

**Build pipeline.**
1. Download the STLs and merge the primitives per node.
2. Detect the patient axes from the sternum and lung centroids, then convert Z-up millimetres to the three.js convention (+X patient-left, +Y up, +Z anterior), centred on the heart.
3. Crop the great vessels below the diaphragm.
4. Fix inside-out surfaces.
5. Decimate by quadric error to about 200k triangles in total (4.9 MB GLB).
6. Compute **perfusion-territory weights** per myocardial vertex, `exp(−(d/22 mm)²)` of the distance to each coronary node, and store them in `COLOR_0` (R = LAD, G = LCX, B = RCA).
7. Write `heart.meta.json` with node centres and anchors for labels and cameras.

**Rendering** (React Three Fiber, no dedicated GPU needed):
- **Coronary colours.** Each coronary node is coloured on one risk scale (aqua → amber → red, interpolated in OKLab and colour-vision-deficiency checked). Its brightness also rises with probability, and it pulses when above the model's threshold. Colours ease smoothly on every update.
- **Territory shading.** A shader patch on the myocardium tints each region by its supplying artery's risk and pulses the selected territory. The UI labels this map as schematic, not a lesion map.
- **Interaction.** The user can orbit, zoom and pan, and jump to presets (torso, anterior, left lateral, inferior, posterior).
- **Picking.** Picking uses BVH-accelerated raycasting with enlarged invisible hit proxies around the thin arteries. Hovering shows the vessel or territory with its probability. Clicking an artery, its label, a dashboard card or a myocardial region selects the target: the camera flies to it and it gets an outline. Keys 0–3 select targets.
- **Layers.** Torso, ribs, lungs, great vessels, veins, territories, labels, x-ray myocardium, auto-rotate, and a heartbeat at the patient's recorded pulse rate.
- **Cross-section and callouts.** A clipping plane cuts the heart front-to-back to reveal the chambers. Labels are anatomical callouts with leader lines to a visible point on each artery. The current frame can be saved as a PNG.
- **Feedback effects.** Each new prediction sends a scan band down the myocardium. Emissive pulses travel along every artery once per heartbeat, paced by the patient's pulse rate. A bloom pass on 8-bit buffers makes vessels above their threshold glow; it is compatible with integrated and software GPUs.
- **Performance.** DPR is capped at 1.75 with adaptive DPR. A performance monitor first drops bloom; if the device stays slow, it switches to a low-cost mode without effects.

**Consistent correspondence.**
- `frontend/src/anatomy/registry.ts` is the only mapping from target id to GLB node, label and territory channel.
- The API also returns each target's structure id, so model outputs and anatomy cannot drift apart.

## 6. System integration and usage

**Backend.** FastAPI serves:
- `/api/schema`: the feature catalogue with cohort statistics;
- `/api/cases`: the hold-out patients with ground truth;
- `/api/metrics` and `/api/importance`;
- `/api/predict`: partial inputs are accepted; the response contains probabilities, intervals, thresholds, risk bands, SHAP contributions, summaries and physiology rows;
- `/api/profile`, `/api/similar` and `/api/lime`: what-if curves for any input, the most similar development patients with their angiography results, and the LIME cross-check.

One full prediction (4 targets, SHAP, bootstrap intervals) takes about 33 ms on a
laptop CPU. The dashboard debounces edits by 140 ms and cancels stale requests, so
the 3D colours and explanations follow slider movements in real time.

**Extensibility.**
- New features, targets and model families are configuration entries (`features.yaml`, `targets.yaml`, `models.py`).
- New anatomy is an FMA list in the build script plus a registry entry.
- The form, schema, explanations and viewer adapt without redesign.

**Reproducibility.**
- Pinned requirements, seeds and committed data/weights.
- `python -m cardiolens.train` (≈55 min on 8 cores) and `--explain-only`.
- `python -m cardiolens.report` generates the tables above.
- 22 backend tests cover data integrity, leakage, SHAP additivity, train/serve parity, partial input, what-if, similarity, LIME agreement and the API. 23 frontend tests cover the risk colour scale, formatting, ROC-AUC, net benefit, threshold metrics and search.
- A CI workflow runs both test suites, the frontend build and a Docker smoke test on every push. One-command start scripts set up the environment on first run.
- A multi-stage Dockerfile builds the dashboard and serves it from the API on port 7860, with deployment configs for Hugging Face Spaces and Render.

**Usage.**
1. Run `start.bat` (Windows) or `scripts/start.sh`, which sets up the environment on first run and opens <http://127.0.0.1:8000>; or `docker compose up --build` and open <http://localhost:7860>.
2. Acknowledge the disclaimer; an optional guided tour introduces the layout.
3. Choose a hold-out patient from the searchable case library (risk dots and angiography result per case), or edit any input.
4. Inspect the 3D heart, then the SHAP (with its LIME comparison), physiology, what-if and similar-case panels. *Report* prints a one-page patient summary; Ctrl/⌘ K searches patients, views, layers and actions.
5. Open *Model performance* for ROC, calibration and decision curves, subgroup results, confusion matrices, the family comparison, global importance and every hold-out patient on one axis with a draggable decision threshold.

## 7. Limitations and future work

**Limitations.**
- Single-centre data of 303 patients.
- Vessel labels are binary at the 50% cut-off.
- Discrimination at vessel level is modest and close to a risk-factor baseline.
- The territory map is schematic: real coronary dominance and anatomy vary.
- The model has never been prospectively validated and must not be used clinically.

**Future work.**
- Multi-task or classifier-chain models that exploit the CAD–vessel structure.
- External validation.
- Richer imaging inputs, such as ECG waveforms or echo strain, for localisation.

## References

1. Alizadehsani R., Roshanzamir M., Sani Z. *Extention of Z-Alizadeh Sani dataset.* UCI Machine Learning Repository (2013). doi:10.24432/C5461K.
2. Mitsuhashi N. et al. BodyParts3D: 3D structure database for anatomical concepts. *Nucleic Acids Research* 37, D782–D785 (2009).
3. Lundberg S. M., Lee S.-I. A unified approach to interpreting model predictions. *NeurIPS* (2017).
4. Ribeiro M. T., Singh S., Guestrin C. "Why should I trust you?": explaining the predictions of any classifier. *KDD* (2016).
5. Platt J. Probabilistic outputs for support vector machines and comparisons to regularized likelihood methods. *Advances in Large Margin Classifiers* (1999).
