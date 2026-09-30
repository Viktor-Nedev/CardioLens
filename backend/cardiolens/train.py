"""End-to-end training pipeline.

    python -m cardiolens.train [--outer-repeats 5] [--bootstrap 25] [--quick]

Steps per target (CAD, LAD, LCX, RCA):
  1. stratified 80/20 split into development and hold-out sets (shared by all targets)
  2. nested cross-validation of every model family on the development set
  3. select the family with the best mean ROC-AUC (ties -> simpler model)
  4. tune it on the full development set, compute out-of-fold scores,
     fit a Platt calibrator and pick the decision threshold (Youden J)
  5. evaluate once on the untouched hold-out set with bootstrap 95% CIs
  6. compute SHAP global importance, permutation importance and a bootstrap
     ensemble for prediction intervals, then persist everything to artifacts/
"""

from __future__ import annotations

import argparse
import json
import platform
import time
from datetime import datetime, timezone
from typing import Any

import joblib
import numpy as np
import pandas as pd
import sklearn
from joblib import Parallel, delayed
from sklearn.base import clone
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

from . import __version__
from .config import ARTIFACTS_DIR, FIGURES_DIR, MODELS_DIR, SEED, Catalog, load_catalog
from .data import build_frames, load_raw, stratification_key
from .evaluation import (
    PlattCalibrator,
    confusion,
    curves,
    f1_threshold,
    metrics_with_ci,
    nested_cv,
    oof_margins,
    point_metrics,
    tuned_search,
    youden_threshold,
)
from .explain import FeatureExplainer
from .features import build_preprocessor, build_schema, output_feature_map
from .models import BASELINE_FEATURES, FAMILIES, ModelFamily, margin, model_margin

TIE_TOLERANCE = 0.01


def log(msg: str) -> None:
    print(f"[{datetime.now():%H:%M:%S}] {msg}", flush=True)


def to_jsonable(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {str(k): to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [to_jsonable(v) for v in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating, float)):
        f = float(obj)
        return None if np.isnan(f) else round(f, 5)
    if isinstance(obj, np.ndarray):
        return to_jsonable(obj.tolist())
    return obj


def select_family(comparison: dict[str, dict[str, Any]]) -> str:
    """Best mean nested-CV ROC-AUC; within TIE_TOLERANCE prefer the simpler model."""
    candidates = {k: v for k, v in comparison.items() if FAMILIES[k].selectable}
    best_auc = max(v["cv"]["roc_auc_mean"] for v in candidates.values())
    near = [k for k, v in candidates.items() if v["cv"]["roc_auc_mean"] >= best_auc - TIE_TOLERANCE]
    return min(near, key=lambda k: (FAMILIES[k].complexity, -candidates[k]["cv"]["roc_auc_mean"]))


def fit_family(
    family: ModelFamily,
    catalog: Catalog,
    X_dev: pd.DataFrame,
    y_dev: np.ndarray,
    X_test: pd.DataFrame,
    y_test: np.ndarray,
    outer_repeats: int,
) -> dict[str, Any]:
    t0 = time.perf_counter()
    cv = nested_cv(family, catalog, X_dev, y_dev, SEED, outer_repeats=outer_repeats)
    search = tuned_search(family, catalog, SEED, n_jobs=-1).fit(X_dev, y_dev)
    best = search.best_estimator_
    oof = oof_margins(best, family, X_dev, y_dev, SEED)
    calibrator = PlattCalibrator.fit(oof, y_dev)
    p_oof = calibrator(oof)
    threshold = youden_threshold(y_dev, p_oof)
    p_test = calibrator(margin(best, X_test, family))
    return {
        "family": family,
        "pipeline": best,
        "best_params": {k.removeprefix("model__"): v for k, v in search.best_params_.items()},
        "calibrator": calibrator,
        "oof_margin": oof,
        "p_oof": p_oof,
        "p_test": p_test,
        "threshold": threshold,
        "cv": cv,
        "seconds": time.perf_counter() - t0,
    }


def baseline_results(catalog, X_dev, y_dev, X_test, y_test, outer_repeats) -> dict[str, Any]:
    prevalence = float(y_dev.mean())
    p_prev = np.full(len(y_test), prevalence)

    # Pre-test risk factors only, logistic regression.
    sub_catalog = Catalog(
        groups=catalog.groups,
        features=[catalog.feature(f) for f in BASELINE_FEATURES],
        targets=catalog.targets,
        leakage_columns=catalog.leakage_columns,
        risk_bands=catalog.risk_bands,
    )
    fam = FAMILIES["logreg"]
    fit = fit_family(fam, sub_catalog, X_dev[BASELINE_FEATURES], y_dev, X_test[BASELINE_FEATURES], y_test, outer_repeats)
    return {
        "prevalence": {
            "label": "Prevalence (always predicts the dev-set base rate)",
            "cv_roc_auc": 0.5,
            "holdout": {"roc_auc": 0.5, "brier": float(np.mean((p_prev - y_test) ** 2))},
        },
        "risk_factors_lr": {
            "label": "Logistic regression on pre-test risk factors only",
            "features": BASELINE_FEATURES,
            "cv_roc_auc": fit["cv"]["roc_auc_mean"],
            "cv_roc_auc_std": fit["cv"]["roc_auc_std"],
            "holdout": point_metrics(y_test, fit["p_test"], fit["threshold"]),
        },
    }


def bootstrap_ensemble(model, Xt_dev: np.ndarray, y_dev: np.ndarray, n: int, seed: int) -> list:
    """Refits of the tuned estimator on bootstrap resamples of the (preprocessed) dev set.

    Members share the main preprocessor so a live prediction transforms the input once.
    """
    rng = np.random.default_rng(seed)
    draws = []
    while len(draws) < n:
        idx = rng.integers(0, len(y_dev), len(y_dev))
        if len(np.unique(y_dev[idx])) == 2:
            draws.append(idx)
    return Parallel(n_jobs=-1)(
        delayed(lambda i: clone(model).fit(Xt_dev[i], y_dev[i]))(idx) for idx in draws
    )


# Validated categorical palette (light surface) and chart chrome for the report figures.
PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"]
CONTEXT_GRAY = "#898781"
INK, INK_2, GRID, AXIS, SURFACE = "#0b0b0b", "#52514e", "#e1e0d9", "#c3c2b7", "#fcfcfb"


def _style_axes(ax) -> None:
    ax.set_facecolor(SURFACE)
    ax.grid(color=GRID, linewidth=0.8, linestyle="-")
    ax.set_axisbelow(True)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(AXIS)
    ax.tick_params(colors=INK_2, labelsize=8)
    ax.xaxis.label.set_color(INK_2)
    ax.yaxis.label.set_color(INK_2)
    ax.title.set_color(INK)


def make_figures(report: dict[str, Any], shap_payload: dict[str, Any], catalog: Catalog) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import shap

    FIGURES_DIR.mkdir(parents=True, exist_ok=True)
    targets = catalog.targets

    # ROC (top) and calibration (bottom) as small multiples, one column per target.
    fig, axes = plt.subplots(2, len(targets), figsize=(3.4 * len(targets), 6.6), facecolor=SURFACE)
    for col, t in enumerate(targets):
        r = report["targets"][t.id]
        auc = r["holdout"]["metrics"]["roc_auc"]
        roc = np.array(r["holdout"]["curves"]["roc"])
        ax = axes[0, col]
        _style_axes(ax)
        ax.plot([0, 1], [0, 1], color=AXIS, linewidth=1)
        ax.plot(roc[:, 0], roc[:, 1], color=PALETTE[0], linewidth=2, solid_joinstyle="round")
        ax.set_title(f"{t.short} · hold-out AUC {auc['value']:.2f} [{auc['ci_low']:.2f}–{auc['ci_high']:.2f}]", fontsize=9)
        ax.set_xlabel("False positive rate", fontsize=8)
        if col == 0:
            ax.set_ylabel("True positive rate", fontsize=8)
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1.02)

        ax = axes[1, col]
        _style_axes(ax)
        ax.plot([0, 1], [0, 1], color=AXIS, linewidth=1)
        for key, color, label in (("dev_oof", PALETTE[0], "Dev out-of-fold"), ("holdout", CONTEXT_GRAY, "Hold-out")):
            cal = np.array(r[key]["curves"]["calibration"])
            ax.plot(cal[:, 0], cal[:, 1], "-o", color=color, linewidth=2, markersize=6,
                    markeredgecolor=SURFACE, markeredgewidth=1.5, label=label)
        ax.set_title(f"{t.short} · calibration", fontsize=9)
        ax.set_xlabel("Predicted probability", fontsize=8)
        if col == 0:
            ax.set_ylabel("Observed frequency", fontsize=8)
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1.02)
    handles, labels = axes[1, 0].get_legend_handles_labels()
    fig.legend(handles, labels, loc="lower center", ncol=2, frameon=False, fontsize=8, labelcolor=INK_2)
    fig.tight_layout(rect=(0, 0.04, 1, 1))
    fig.savefig(FIGURES_DIR / "roc_calibration.png", dpi=160, facecolor=SURFACE)
    plt.close(fig)

    # Nested-CV comparison: grouped bars (4 families, fixed palette order) + baseline marker.
    fam_ids = [f for f in FAMILIES if f in report["targets"][targets[0].id]["comparison"]]
    fig, ax = plt.subplots(figsize=(11, 4.2), facecolor=SURFACE)
    _style_axes(ax)
    ax.grid(axis="x", visible=False)
    width = 0.8 / len(fam_ids)
    xs = np.arange(len(targets))
    for i, fid in enumerate(fam_ids):
        means = [report["targets"][t.id]["comparison"][fid]["cv"]["roc_auc_mean"] for t in targets]
        stds = [report["targets"][t.id]["comparison"][fid]["cv"]["roc_auc_std"] for t in targets]
        ax.bar(xs + i * width - 0.4 + width / 2, np.array(means) - 0.5, width * 0.92, bottom=0.5,
               yerr=stds, capsize=2, error_kw={"elinewidth": 1, "ecolor": INK_2},
               color=PALETTE[i % len(PALETTE)], edgecolor=SURFACE, linewidth=1.5, label=FAMILIES[fid].label)
    base = [report["targets"][t.id]["baselines"]["risk_factors_lr"]["cv_roc_auc"] for t in targets]
    ax.scatter(xs, base, marker="_", s=1400, color=INK, linewidths=2, zorder=5)
    ax.set_xticks(xs, [t.short for t in targets])
    ax.set_ylim(0.5, 1.0)
    ax.set_ylabel("Nested CV ROC-AUC (0.5 = chance)", fontsize=9)
    ax.set_title("Model family comparison on the development set (mean ± sd, 25 outer folds)", fontsize=10)
    from matplotlib.lines import Line2D

    handles, labels = ax.get_legend_handles_labels()
    handles.append(Line2D([0], [0], color=INK, linewidth=2))
    labels.append("Risk-factor LR baseline")
    ax.legend(handles, labels, ncol=5, fontsize=8, frameon=False, loc="upper center",
              bbox_to_anchor=(0.5, -0.1), labelcolor=INK_2)
    fig.tight_layout()
    fig.savefig(FIGURES_DIR / "model_comparison.png", dpi=160, facecolor=SURFACE)
    plt.close(fig)

    for t in targets:
        payload = shap_payload[t.id]
        plt.figure()
        shap.summary_plot(
            payload["values"],
            features=payload["display"],
            feature_names=payload["labels"],
            max_display=12,
            show=False,
            plot_size=(8, 5),
        )
        plt.title(f"{t.short}: SHAP contributions (calibrated log-odds)")
        plt.tight_layout()
        plt.savefig(FIGURES_DIR / f"shap_{t.id}.png", dpi=150)
        plt.close("all")


def explain_target(
    catalog: Catalog,
    family: ModelFamily,
    pipeline: Pipeline,
    calibrator: PlattCalibrator,
    background: np.ndarray,
    X_dev: pd.DataFrame,
    X_test: pd.DataFrame,
    y_test: np.ndarray,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Global SHAP importance on the dev set and permutation importance on the hold-out set."""
    feature_ids = catalog.feature_ids
    label_of = {f.id: f.label for f in catalog.features}
    prep = pipeline.named_steps["prep"]
    model = pipeline.named_steps["model"]
    explainer = FeatureExplainer(family, model, background, output_feature_map(prep), feature_ids)
    _, contrib_dev = explainer.explain(prep.transform(X_dev))
    contrib_dev = contrib_dev * calibrator.a  # calibrated log-odds units
    mean_abs = np.abs(contrib_dev).mean(axis=0)
    mean_signed = contrib_dev.mean(axis=0)

    perm = permutation_importance(
        pipeline, X_test, y_test, scoring="roc_auc", n_repeats=30, random_state=SEED, n_jobs=-1
    )
    rows = sorted(
        (
            {
                "feature": fid,
                "label": label_of[fid],
                "mean_abs_shap": float(mean_abs[i]),
                "mean_shap": float(mean_signed[i]),
                "permutation_auc_drop": float(perm.importances_mean[i]),
                "permutation_auc_drop_std": float(perm.importances_std[i]),
            }
            for i, fid in enumerate(feature_ids)
        ),
        key=lambda d: -d["mean_abs_shap"],
    )
    display = X_dev.copy()
    for f in catalog.features:
        if f.kind == "categorical":
            display[f.id] = display[f.id].astype("category").cat.codes
    payload = {
        "values": contrib_dev,
        "display": display.astype(float).to_numpy(),
        "labels": [label_of[f] for f in feature_ids],
    }
    return rows, payload


def split_frames(catalog: Catalog):
    """Load the data and reproduce the seeded development / hold-out split."""
    raw = load_raw()
    X, Y = build_frames(raw, catalog)
    strat = stratification_key(Y)
    dev_ids, test_ids = train_test_split(X.index.to_numpy(), test_size=0.2, stratify=strat, random_state=SEED)
    dev_ids, test_ids = np.sort(dev_ids), np.sort(test_ids)
    return raw, X, Y, dev_ids, test_ids


def refresh_explanations() -> None:
    """Recompute importance.json and the SHAP figures from the saved models (no refitting)."""
    catalog = load_catalog()
    _, X, Y, dev_ids, test_ids = split_frames(catalog)
    report = json.loads((ARTIFACTS_DIR / "metrics.json").read_text(encoding="utf-8"))
    importance: dict[str, Any] = {}
    shap_payload: dict[str, Any] = {}
    for target in catalog.targets:
        bundle = joblib.load(MODELS_DIR / f"{target.id}.joblib")
        calibrator = PlattCalibrator(**bundle["calibrator"])
        importance[target.id], shap_payload[target.id] = explain_target(
            catalog,
            FAMILIES[bundle["family_id"]],
            bundle["pipeline"],
            calibrator,
            bundle["background"],
            X.loc[dev_ids],
            X.loc[test_ids],
            Y.loc[test_ids, target.id].to_numpy(),
        )
        log(f"   {target.short}: explanations refreshed")
    (ARTIFACTS_DIR / "importance.json").write_text(json.dumps(to_jsonable(importance), indent=1), encoding="utf-8")
    make_figures(report, shap_payload, catalog)


def run(outer_repeats: int, n_bootstrap: int, quick: bool) -> dict[str, Any]:
    started = time.perf_counter()
    sklearn.set_config(skip_parameter_validation=True)
    catalog = load_catalog()
    raw, X, Y, dev_ids, test_ids = split_frames(catalog)

    # Leakage guard: no angiography-derived column may be a model input.
    source_columns = {f.column for f in catalog.features}
    assert not source_columns & set(catalog.leakage_columns), "target leakage"
    assert not set(X.columns) & {t.id for t in catalog.targets}, "target leakage"

    X_dev, X_test = X.loc[dev_ids], X.loc[test_ids]
    Y_dev, Y_test = Y.loc[dev_ids], Y.loc[test_ids]
    log(f"Split: {len(dev_ids)} development / {len(test_ids)} hold-out patients")

    families = {k: v for k, v in FAMILIES.items() if not quick or k in ("logreg", "gradient_boosting")}
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    feature_ids = catalog.feature_ids

    vessel_pattern = (raw[["LAD", "LCX", "RCA"]] == "Stenotic").sum(axis=1)
    report: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "version": __version__,
        "environment": {"python": platform.python_version(), "scikit_learn": sklearn.__version__},
        "dataset": {
            "name": "Extension of Z-Alizadeh Sani dataset (UCI #411)",
            "n_patients": int(len(X)),
            "n_features": len(feature_ids),
            "excluded": {"leakage": catalog.leakage_columns, "constant": ["Exertional CP"]},
            "prevalence": {t.id: float(Y[t.id].mean()) for t in catalog.targets},
            "cad_vs_vessels": {
                "cad_with_no_stenotic_vessel": int(((Y["cad"] == 1) & (vessel_pattern.values == 0)).sum()),
                "normal_with_stenotic_vessel": int(((Y["cad"] == 0) & (vessel_pattern.values > 0)).sum()),
                "vessel_count_distribution": {str(k): int(v) for k, v in vessel_pattern.value_counts().sort_index().items()},
            },
        },
        "split": {
            "method": "Stratified on the joint CAD/LAD/LCX/RCA label pattern (rare patterns merged)",
            "seed": SEED,
            "n_dev": int(len(dev_ids)),
            "n_holdout": int(len(test_ids)),
            "holdout_prevalence": {t.id: float(Y_test[t.id].mean()) for t in catalog.targets},
        },
        "protocol": {
            "selection": f"Nested CV ROC-AUC; ties within {TIE_TOLERANCE} go to the simpler family",
            "calibration": "Platt scaling fitted on 5x repeated 5-fold out-of-fold scores of the dev set",
            "threshold": "Youden J on calibrated out-of-fold probabilities (dev set)",
            "holdout": "Single evaluation on the untouched 20% hold-out; 2000-sample bootstrap 95% CIs",
            "outer_repeats": outer_repeats,
        },
        "targets": {},
    }
    importance: dict[str, Any] = {}
    shap_payload: dict[str, Any] = {}
    holdout_probs: dict[str, np.ndarray] = {}
    holdout_intervals: dict[str, np.ndarray] = {}

    for target in catalog.targets:
        y_dev = Y_dev[target.id].to_numpy()
        y_test = Y_test[target.id].to_numpy()
        log(f"== {target.short}: prevalence dev {y_dev.mean():.2f} / hold-out {y_test.mean():.2f}")

        fits: dict[str, dict[str, Any]] = {}
        comparison: dict[str, Any] = {}
        for fid, family in families.items():
            fit = fit_family(family, catalog, X_dev, y_dev, X_test, y_test, outer_repeats)
            fits[fid] = fit
            comparison[fid] = {
                "label": family.label,
                "selectable": family.selectable,
                "cv": fit["cv"],
                "best_params": fit["best_params"],
                # Reported for transparency only; selection never looks at the hold-out set.
                "holdout_reference": point_metrics(y_test, fit["p_test"], fit["threshold"]),
            }
            log(
                f"   {family.label:<36} nested CV AUC {fit['cv']['roc_auc_mean']:.3f} ± {fit['cv']['roc_auc_std']:.3f}"
                f"  ({fit['seconds']:.0f}s)"
            )

        chosen_id = select_family(comparison)
        chosen = fits[chosen_id]
        family = FAMILIES[chosen_id]
        pipeline: Pipeline = chosen["pipeline"]
        calibrator: PlattCalibrator = chosen["calibrator"]
        threshold = chosen["threshold"]
        p_test = chosen["p_test"]
        p_oof = chosen["p_oof"]
        log(f"   selected: {family.label} | threshold {threshold:.3f}")

        baselines = baseline_results(catalog, X_dev, y_dev, X_test, y_test, outer_repeats)

        # --- explanations -------------------------------------------------------
        prep = pipeline.named_steps["prep"]
        model = pipeline.named_steps["model"]
        owners = output_feature_map(prep)
        Xt_dev = prep.transform(X_dev)
        rng = np.random.default_rng(SEED)
        bg_idx = rng.choice(len(Xt_dev), size=min(100, len(Xt_dev)), replace=False)
        background = Xt_dev[bg_idx]
        importance[target.id], shap_payload[target.id] = explain_target(
            catalog, family, pipeline, calibrator, background, X_dev, X_test, y_test
        )

        # --- uncertainty ----------------------------------------------------------
        ensemble = bootstrap_ensemble(model, Xt_dev, y_dev, n_bootstrap, SEED) if n_bootstrap else []
        if ensemble:
            Xt_test = prep.transform(X_test)
            ens = np.stack([calibrator(model_margin(m, Xt_test, family)) for m in ensemble])
            holdout_intervals[target.id] = np.percentile(ens, [10, 90], axis=0)
        holdout_probs[target.id] = p_test

        report["targets"][target.id] = {
            "label": target.label,
            "short": target.short,
            "selected_family": chosen_id,
            "selected_label": family.label,
            "best_params": chosen["best_params"],
            "threshold": threshold,
            "threshold_f1": f1_threshold(y_dev, p_oof),
            "calibration": {"a": calibrator.a, "b": calibrator.b},
            "comparison": comparison,
            "baselines": baselines,
            "dev_oof": {
                "metrics": point_metrics(y_dev, p_oof, threshold),
                "curves": curves(y_dev, p_oof, n_bins=8),
            },
            "holdout": {
                "n": int(len(y_test)),
                "positives": int(y_test.sum()),
                "metrics": metrics_with_ci(y_test, p_test, threshold, seed=SEED),
                "confusion": confusion(y_test, p_test, threshold),
                "curves": curves(y_test, p_test, n_bins=5),
            },
        }

        joblib.dump(
            {
                "target": target.id,
                "family_id": chosen_id,
                "pipeline": pipeline,
                "calibrator": {"a": calibrator.a, "b": calibrator.b},
                "threshold": threshold,
                "background": background,
                "owners": owners,
                "feature_ids": feature_ids,
                "ensemble": ensemble,
                "trained_on": "development split",
                "version": __version__,
            },
            MODELS_DIR / f"{target.id}.joblib",
            compress=3,
        )

    # --- cases (hold-out patients, never seen by the served models) -----------------
    cases = []
    for pos, pid in enumerate(test_ids):
        row = X_test.loc[pid]
        features = {
            f.id: (str(row[f.id]) if f.kind == "categorical" else float(row[f.id])) for f in catalog.features
        }
        truth = {t.id: int(Y_test.loc[pid, t.id]) for t in catalog.targets}
        predicted = {t.id: float(holdout_probs[t.id][pos]) for t in catalog.targets}
        interval = {
            t.id: [float(v) for v in holdout_intervals[t.id][:, pos]]
            for t in catalog.targets
            if t.id in holdout_intervals
        }
        sex = "M" if features["sex_male"] == 1 else "F"
        cases.append(
            {
                "id": f"H{int(pid):03d}",
                "patient_id": int(pid),
                "title": f"Hold-out patient #{int(pid)}",
                "subtitle": f"{int(features['age'])} y, {sex}"
                + (", typical angina" if features["typical_chest_pain"] == 1 else "")
                + (", diabetic" if features["dm"] == 1 else ""),
                "features": features,
                "truth": truth,
                "predicted": predicted,
                "interval": interval,
            }
        )
    cases.sort(key=lambda c: c["predicted"]["cad"])

    schema = build_schema(catalog, X_dev)
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    (ARTIFACTS_DIR / "metrics.json").write_text(json.dumps(to_jsonable(report), indent=1), encoding="utf-8")
    (ARTIFACTS_DIR / "importance.json").write_text(json.dumps(to_jsonable(importance), indent=1), encoding="utf-8")
    (ARTIFACTS_DIR / "schema.json").write_text(json.dumps(to_jsonable(schema), indent=1, ensure_ascii=False), encoding="utf-8")
    (ARTIFACTS_DIR / "cases.json").write_text(json.dumps(to_jsonable(cases), indent=1), encoding="utf-8")

    make_figures(report, shap_payload, catalog)
    log(f"Done in {time.perf_counter() - started:.0f}s. Artifacts in {ARTIFACTS_DIR}")
    for t in catalog.targets:
        m = report["targets"][t.id]["holdout"]["metrics"]
        log(
            f"   {t.short}: {report['targets'][t.id]['selected_label']:<34} hold-out AUC "
            f"{m['roc_auc']['value']:.3f} [{m['roc_auc']['ci_low']:.2f}-{m['roc_auc']['ci_high']:.2f}]"
            f"  F1 {m['f1']['value']:.3f}  acc {m['accuracy']['value']:.3f}"
        )
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Train CardioLens models")
    parser.add_argument("--outer-repeats", type=int, default=5, help="repeats of the outer 5-fold CV")
    parser.add_argument("--bootstrap", type=int, default=25, help="bootstrap ensemble size for intervals")
    parser.add_argument("--quick", action="store_true", help="fewer families and repeats (smoke test)")
    parser.add_argument(
        "--explain-only", action="store_true", help="recompute SHAP importance and figures from saved models"
    )
    args = parser.parse_args()
    if args.explain_only:
        refresh_explanations()
        return
    if args.quick:
        args.outer_repeats = min(args.outer_repeats, 1)
        args.bootstrap = min(args.bootstrap, 5)
    run(args.outer_repeats, args.bootstrap, args.quick)


if __name__ == "__main__":
    main()
