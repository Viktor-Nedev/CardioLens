"""Render the evaluation report as Markdown tables (used for README / docs).

    python -m cardiolens.report > ../docs/results.md
"""

from __future__ import annotations

import json

from .config import ARTIFACTS_DIR

ORDER = ["cad", "lad", "lcx", "rca"]


def _ci(m: dict, digits: int = 2) -> str:
    return f"{m['value']:.{digits}f} [{m['ci_low']:.{digits}f}–{m['ci_high']:.{digits}f}]"


def render() -> str:
    report = json.loads((ARTIFACTS_DIR / "metrics.json").read_text(encoding="utf-8"))
    importance = json.loads((ARTIFACTS_DIR / "importance.json").read_text(encoding="utf-8"))
    t = report["targets"]
    lines: list[str] = []

    lines.append("### Hold-out performance (61 unseen patients, bootstrap 95% CI)\n")
    lines.append("| Target | Selected model | ROC-AUC | Accuracy | Precision | Recall | Specificity | F1 | Brier |")
    lines.append("|---|---|---|---|---|---|---|---|---|")
    for k in ORDER:
        m = t[k]["holdout"]["metrics"]
        lines.append(
            f"| {t[k]['short']} | {t[k]['selected_label']} | {_ci(m['roc_auc'])} | {_ci(m['accuracy'])} | "
            f"{_ci(m['precision'])} | {_ci(m['recall'])} | {_ci(m['specificity'])} | {_ci(m['f1'])} | "
            f"{m['brier']['value']:.3f} |"
        )

    lines.append("\n### Nested cross-validation on the development set (ROC-AUC, mean ± sd over 25 outer folds)\n")
    families = list(t["cad"]["comparison"])
    labels = [t["cad"]["comparison"][f]["label"] for f in families]
    lines.append("| Target | " + " | ".join(labels) + " | Risk-factor LR baseline |")
    lines.append("|---|" + "---|" * (len(families) + 1))
    for k in ORDER:
        cells = []
        for f in families:
            c = t[k]["comparison"][f]["cv"]
            mark = "**" if f == t[k]["selected_family"] else ""
            cells.append(f"{mark}{c['roc_auc_mean']:.3f} ± {c['roc_auc_std']:.3f}{mark}")
        b = t[k]["baselines"]["risk_factors_lr"]
        cells.append(f"{b['cv_roc_auc']:.3f} ± {b['cv_roc_auc_std']:.3f}")
        lines.append(f"| {t[k]['short']} | " + " | ".join(cells) + " |")
    lines.append("\nBold = selected family (best mean AUC; ties within 0.01 go to the simpler model).")

    lines.append("\n### Decision thresholds and calibration\n")
    lines.append("| Target | Threshold (Youden) | Threshold (F1) | Platt slope a | Dev OOF Brier | Hold-out confusion (TN/FP/FN/TP) |")
    lines.append("|---|---|---|---|---|---|")
    for k in ORDER:
        r = t[k]
        cm = r["holdout"]["confusion"]
        lines.append(
            f"| {r['short']} | {r['threshold']:.3f} | {r['threshold_f1']:.3f} | {r['calibration']['a']:.3f} | "
            f"{r['dev_oof']['metrics']['brier']:.3f} | {cm['tn']}/{cm['fp']}/{cm['fn']}/{cm['tp']} |"
        )

    lines.append("\n### Top 5 features by mean |SHAP|\n")
    lines.append("| Target | Features |")
    lines.append("|---|---|")
    for k in ORDER:
        top = ", ".join(f"{r['label']} ({r['mean_abs_shap']:.2f})" for r in importance[k][:5])
        lines.append(f"| {t[k]['short']} | {top} |")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    print(render())
