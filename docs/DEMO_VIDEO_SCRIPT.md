# CardioLens demo video script (≈ 6 minutes)

Recording setup: 1920×1080, browser at 100% zoom, the production build served by
`uvicorn` (or `docker compose up`) at <http://localhost:7860>. Close other tabs,
hide bookmarks, and start on the disclaimer screen.

| Time | Screen | Narration (suggested) |
|---|---|---|
| 0:00–0:25 | Welcome screen (3D torso playing, blurred, behind it) | "CardioLens predicts coronary artery disease and the stenosis risk of each major coronary artery from routine clinical data, and shows it on a 3D heart. It is decision support and education only, as this screen states before anything else." Click **I understand — start the analysis**; the camera glides from the torso into the heart. |
| 0:25–1:10 | Analysis view, camera flies from torso to heart | "Three panels: the patient on the left, the 3D anatomy in the centre, risk and explanations on the right. The heart, coronary arteries, great vessels, ribs and torso are real anatomical meshes from BodyParts3D. The LAD, LCX and RCA are separate structures, each coloured by its own model's predicted probability." Point at the legend and the vessel labels. |
| 1:10–2:00 | Rotate, zoom, **Left lateral**, **Inferior**, **Posterior** view buttons | "I can rotate and zoom freely; the view presets jump to standard projections. Hovering the myocardium shows which artery supplies that region, a schematic perfusion territory, tinted by the same risk colour." Hover the anterior wall, then the inferior wall. |
| 2:00–2:40 | Click the RCA in 3D, then LAD in the right panel | "Clicking a vessel selects it: the camera focuses on it, it gets an outline, and its territory pulses. The dashboard follows, so 3D and numbers always refer to the same artery." |
| 2:40–3:30 | Right panel: CAD hero, vessel cards, SHAP chart | "This hold-out patient opens with a very high overall CAD probability, above the model's decision threshold, with an 80% bootstrap interval; the LAD and LCX are flagged while the RCA stays low — exactly what angiography found. Each vessel has its own probability and threshold tick. 'Why this estimate' is a SHAP explanation: red factors raise the risk, blue lower it, and they add up from the average patient to this patient." Read the text summary. |
| 3:30–4:15 | Physiological breakdown tab | "The physiological breakdown lists every measurement with its reference range, status, where the patient sits in the cohort, and how much of the explanation it carries." Filter **Abnormal**. |
| 4:15–5:00 | Left panel: change typical chest pain, age slider, ejection fraction | "Inputs are fully editable. Watch the scan band sweep down the heart as the model re-scores, the artery colours shift, and each card flash with the size of the change; the SHAP bars re-order themselves. A full prediction with explanations takes about 35 milliseconds on the server. The delta against the loaded case stays next to every probability, and the ECG strip in the header beats at the patient's pulse rate." Then **Reset edits**. Load a low-risk hold-out patient from the case library: "These 61 patients were never seen during training; the angiography ground truth is shown for comparison." |
| 5:00–5:45 | Model performance tab | "Every model was chosen with nested cross-validation on the development set; the hold-out set was used exactly once. Here are ROC-AUC, sensitivity, specificity, F1 and Brier score with 95% confidence intervals, ROC and calibration curves, the confusion matrix, the comparison of four model families against a risk-factor baseline, and global SHAP importance." Switch between CAD, LAD, LCX and RCA. |
| 5:45–6:15 | Code / README (optional) | "The repository contains the training pipeline, the saved model weights, the reproducible anatomy build, tests, and a Docker image. Features, targets and 3D structures are declared in configuration, so the system extends without a redesign." |

Tips: move the mouse slowly during camera transitions; keep the SHAP chart on
screen for a few seconds after each edit so viewers can see the bars animate.
Press **?** once on camera to show the shortcuts panel. If the recording machine
is slow, the app may switch to performance mode; turn effects back on under
**Layers** before recording.
