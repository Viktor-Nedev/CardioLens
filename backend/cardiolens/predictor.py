"""Inference: encode a patient record, predict every target and explain it."""

from __future__ import annotations

import json
import math
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import sklearn

from .config import ARTIFACTS_DIR, Catalog, FeatureSpec, TargetSpec, load_catalog
from .explain import FeatureExplainer
from .features import aggregation_matrix, percentile, percentile_table
from .models import FAMILIES, ModelFamily, model_margin
from .surrogate import agreement, fit_surrogate, kernel_weights, sample_masks

TOP_DRIVERS = 3


def _sigmoid(z: float) -> float:
    return 1.0 / (1.0 + math.exp(-z))


def fmt_pct(p: float) -> str:
    """Percentages for text; extremes read as <1% / >99% rather than a false 0% / 100%."""
    if p > 0.995:
        return ">99%"
    if p < 0.005:
        return "<1%"
    return f"{p:.0%}"


@dataclass
class TargetModel:
    spec: TargetSpec
    family: ModelFamily
    prep: Any
    model: Any
    a: float
    b: float
    threshold: float
    ensemble: list
    explainer: FeatureExplainer
    # Linear ensembles collapse into one matrix product: margins = Xt @ W.T + w0.
    ens_W: np.ndarray | None = None
    ens_w0: np.ndarray | None = None

    def ensemble_margins(self, Xt: np.ndarray) -> np.ndarray:
        if self.ens_W is not None:
            return Xt[0] @ self.ens_W.T + self.ens_w0
        return np.array([model_margin(e, Xt, self.family)[0] for e in self.ensemble])


class Predictor:
    def __init__(self, artifacts_dir: Path = ARTIFACTS_DIR, catalog: Catalog | None = None) -> None:
        self.catalog = catalog or load_catalog()
        self.artifacts_dir = Path(artifacts_dir)
        self.schema = self._read_json("schema.json")
        self.metrics = self._read_json("metrics.json")
        self.importance = self._read_json("importance.json")
        self.cases = self._read_json("cases.json")
        self._stats = {f["id"]: f["stats"] for f in self.schema["features"]}
        self._pct_tables = {fid: percentile_table(st) for fid, st in self._stats.items()}
        self.feature_ids = self.catalog.feature_ids
        self.models: dict[str, TargetModel] = {}
        for spec in self.catalog.targets:
            bundle = joblib.load(self.artifacts_dir / "models" / f"{spec.id}.joblib")
            if bundle["feature_ids"] != self.feature_ids:
                raise RuntimeError(
                    f"Model for {spec.id} was trained on a different feature set; retrain."
                )
            family = FAMILIES[bundle["family_id"]]
            pipeline = bundle["pipeline"]
            model = pipeline.named_steps["model"]
            ensemble = bundle["ensemble"]
            linear = family.margin == "decision" and ensemble and all(hasattr(e, "coef_") for e in ensemble)
            self.models[spec.id] = TargetModel(
                spec=spec,
                family=family,
                prep=pipeline.named_steps["prep"],
                model=model,
                a=bundle["calibrator"]["a"],
                b=bundle["calibrator"]["b"],
                threshold=bundle["threshold"],
                ensemble=ensemble,
                explainer=FeatureExplainer(
                    family, model, bundle["background"], bundle["owners"], self.feature_ids
                ),
                ens_W=np.vstack([e.coef_[0] for e in ensemble]) if linear else None,
                ens_w0=np.array([e.intercept_[0] for e in ensemble]) if linear else None,
            )
        self._prep_groups = self._group_preprocessors()
        self._owners = joblib.load(self.artifacts_dir / "models" / f"{self.catalog.targets[0].id}.joblib")["owners"]
        self.cohort = self._read_json("cohort.json") if (self.artifacts_dir / "cohort.json").exists() else []
        self._map: dict[str, Any] | None = None
        self._map_xy: np.ndarray | None = None
        self._build_similarity_space()

    def _group_preprocessors(self) -> list[tuple[Any, list[str]]]:
        """Targets whose fitted preprocessors transform identically share one transform call."""
        probe = pd.concat([self.encode(c["features"])[0] for c in self.cases[:20]] + [self.encode({})[0]])
        groups: list[tuple[Any, list[str], np.ndarray]] = []
        for tid, tm in self.models.items():
            out = tm.prep.transform(probe)
            for prep, members, ref in groups:
                if ref.shape == out.shape and np.allclose(ref, out, atol=0, rtol=0):
                    members.append(tid)
                    break
            else:
                groups.append((tm.prep, [tid], out))
        return [(prep, members) for prep, members, _ in groups]

    def _read_json(self, name: str) -> Any:
        return json.loads((self.artifacts_dir / name).read_text(encoding="utf-8"))

    # ------------------------------------------------------------------ encoding

    def encode(self, payload: dict[str, Any]) -> tuple[pd.DataFrame, list[str], list[str]]:
        """Validate raw UI input. Missing or invalid fields are imputed by the pipeline."""
        row: dict[str, Any] = {}
        imputed: list[str] = []
        warnings: list[str] = []
        known = set(self.feature_ids)
        for key in payload:
            if key not in known:
                warnings.append(f"Unknown feature '{key}' ignored.")

        for spec in self.catalog.features:
            value = payload.get(spec.id)
            if value is None or (isinstance(value, str) and value.strip() == ""):
                row[spec.id] = None if spec.kind == "categorical" else np.nan
                imputed.append(spec.id)
                continue
            try:
                row[spec.id] = self._coerce(spec, value)
            except ValueError as exc:
                warnings.append(f"{spec.label}: {exc}; value imputed.")
                row[spec.id] = None if spec.kind == "categorical" else np.nan
                imputed.append(spec.id)

        frame = pd.DataFrame(
            {
                spec.id: np.array([row[spec.id]], dtype=object if spec.kind == "categorical" else float)
                for spec in self.catalog.features
            }
        )
        return frame, imputed, warnings

    @staticmethod
    def _coerce(spec: FeatureSpec, value: Any) -> Any:
        if spec.kind == "categorical":
            allowed = {str(o["value"]) for o in spec.options}
            if str(value) not in allowed:
                raise ValueError(f"'{value}' is not one of {sorted(allowed)}")
            return str(value)
        if isinstance(value, bool):
            value = int(value)
        if isinstance(value, str):
            lowered = value.strip().lower()
            if spec.kind == "binary" and lowered in {"y", "yes", "true", "male"}:
                return 1.0
            if spec.kind == "binary" and lowered in {"n", "no", "false", "female"}:
                return 0.0
        number = float(value)
        if not math.isfinite(number):
            raise ValueError("not a finite number")
        if spec.kind == "binary" and number not in (0.0, 1.0):
            raise ValueError("expected 0 or 1")
        if spec.kind == "ordinal":
            allowed = {float(o["value"]) for o in spec.options}
            if number not in allowed:
                raise ValueError(f"expected one of {sorted(int(a) for a in allowed)}")
        return number

    # ---------------------------------------------------------------- formatting

    def format_value(self, spec: FeatureSpec, value: Any) -> str:
        if value is None or (isinstance(value, float) and math.isnan(value)):
            return "unknown"
        if spec.kind in ("binary", "ordinal", "categorical"):
            for o in spec.options:
                if str(o["value"]) == str(value) or (
                    not isinstance(value, str) and float(o["value"]) == float(value)
                ):
                    if spec.kind == "binary" and spec.id != "sex_male":
                        return "present" if float(value) == 1 else "absent"
                    return str(o["label"])
            return str(value)
        step = spec.step or 1
        decimals = 0 if step >= 1 else len(str(step).split(".")[-1])
        text = f"{float(value):,.{decimals}f}"
        return f"{text} {spec.unit}" if spec.unit else text

    def _filled_values(self, frame: pd.DataFrame, imputed: list[str]) -> dict[str, Any]:
        row = frame.iloc[0].to_dict()
        return {
            spec.id: self._stats[spec.id]["default"] if spec.id in imputed else row[spec.id]
            for spec in self.catalog.features
        }

    # ---------------------------------------------------------------- prediction

    def predict(self, payload: dict[str, Any], with_interval: bool = True) -> dict[str, Any]:
        # Inputs are validated in `encode`; skip sklearn's per-call re-validation.
        with sklearn.config_context(assume_finite=True, skip_parameter_validation=True):
            return self._predict(payload, with_interval)

    def _predict(self, payload: dict[str, Any], with_interval: bool) -> dict[str, Any]:
        t0 = time.perf_counter()
        frame, imputed, warnings = self.encode(payload)
        values = self._filled_values(frame, imputed)
        label_of = {f.id: f.label for f in self.catalog.features}

        targets: dict[str, Any] = {}
        per_feature: dict[str, dict[str, float]] = {fid: {} for fid in self.feature_ids}
        transformed: dict[str, np.ndarray] = {}
        for prep, members in self._prep_groups:
            out = prep.transform(frame)
            for tid in members:
                transformed[tid] = out

        for tid, tm in self.models.items():
            Xt = transformed[tid]
            m = float(model_margin(tm.model, Xt, tm.family)[0])
            logit = tm.a * m + tm.b
            p = _sigmoid(logit)
            base, contrib = tm.explainer.explain(Xt)
            contrib = contrib[0] * tm.a
            base_logit = tm.a * base + tm.b

            interval = None
            if with_interval and tm.ensemble:
                ens = tm.ensemble_margins(Xt)
                probs = 1.0 / (1.0 + np.exp(-(tm.a * ens + tm.b)))
                interval = [float(np.percentile(probs, 10)), float(np.percentile(probs, 90))]

            contributions = []
            for i, fid in enumerate(self.feature_ids):
                c = float(contrib[i])
                per_feature[fid][tid] = c
                contributions.append(
                    {
                        "feature": fid,
                        "label": label_of[fid],
                        "display": self.format_value(self.catalog.feature(fid), values[fid]),
                        "contribution": c,
                        # Probability change if this feature's contribution were removed.
                        "delta_pp": 100 * (p - _sigmoid(logit - c)),
                        "imputed": fid in imputed,
                    }
                )
            contributions.sort(key=lambda d: -abs(d["contribution"]))
            band = self.catalog.risk_band(p)
            targets[tid] = {
                "id": tid,
                "label": tm.spec.label,
                "short": tm.spec.short,
                "structure": tm.spec.structure,
                "probability": p,
                "interval": interval,
                "threshold": tm.threshold,
                "positive": p >= tm.threshold,
                "risk_band": {"id": band.id, "label": band.label},
                "model": tm.family.label,
                "base_logit": base_logit,
                "base_probability": _sigmoid(base_logit),
                "logit": logit,
                "additivity_error": abs(base_logit + float(contrib.sum()) - logit),
                "contributions": contributions,
                "summary": self._summary(tm.spec, p, tm.threshold, band.label, contributions),
            }

        physiology = [self._physiology_row(spec, values[spec.id], spec.id in imputed, per_feature[spec.id])
                      for spec in self.catalog.features]
        return {
            "targets": targets,
            "physiology": physiology,
            "imputed": imputed,
            "warnings": warnings,
            "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
        }

    def _physiology_row(self, spec: FeatureSpec, value: Any, imputed: bool, contribs: dict[str, float]) -> dict[str, Any]:
        stats = self._stats[spec.id]
        flag = None
        pct = None
        numeric_value = None
        if spec.kind == "numeric" and value is not None:
            numeric_value = float(value)
            pct = percentile(stats, numeric_value, self._pct_tables[spec.id])
            if spec.ref:
                lo, hi = spec.ref
                flag = "low" if numeric_value < lo else "high" if numeric_value > hi else "normal"
        elif spec.kind in ("binary", "ordinal") and value is not None:
            numeric_value = float(value)
            if spec.id != "sex_male":
                flag = "abnormal" if numeric_value > 0 else "normal"
        elif spec.kind == "categorical":
            flag = "normal" if str(value) in ("N", "None") else "abnormal"
        return {
            "feature": spec.id,
            "label": spec.label,
            "group": spec.group,
            "kind": spec.kind,
            "value": numeric_value if spec.kind != "categorical" else value,
            "display": self.format_value(spec, value),
            "unit": spec.unit,
            "ref": list(spec.ref) if spec.ref else None,
            "flag": flag,
            "percentile": pct,
            "imputed": imputed,
            "contributions": contribs,
        }

    def _summary(self, spec: TargetSpec, p: float, threshold: float, band: str, contributions: list[dict]) -> str:
        subject = "Overall CAD" if spec.kind == "overall" else f"{spec.short} stenosis"
        relation = "above" if p >= threshold else "below"
        up = [c for c in contributions if c["contribution"] > 0.02][:TOP_DRIVERS]
        down = [c for c in contributions if c["contribution"] < -0.02][:TOP_DRIVERS]

        def fmt(items):
            return ", ".join(f"{c['label'].lower()} ({c['display']})" for c in items)

        parts = [
            f"{subject} probability is {fmt_pct(p)} ({band.lower()} band, {relation} the decision threshold of {fmt_pct(threshold)})."
        ]
        if up:
            parts.append(f"Factors increasing the estimate: {fmt(up)}.")
        if down:
            parts.append(f"Factors decreasing it: {fmt(down)}.")
        return " ".join(parts)

    # ------------------------------------------------------------------- helpers

    # ------------------------------------------------------------- what-if profile

    def profile(self, payload: dict[str, Any], feature_id: str, points: int = 41) -> dict[str, Any]:
        """Predicted probability of every target while one feature varies and the rest stay fixed
        (an individual conditional expectation curve: model sensitivity, not a causal effect)."""
        spec = self.catalog.feature(feature_id)
        frame, imputed, _ = self.encode(payload)
        stats = self._stats[feature_id]
        grid, labels = self._grid(spec, points)

        batch = pd.concat([frame] * len(grid), ignore_index=True)
        batch[feature_id] = pd.Series(grid, dtype=object if spec.kind == "categorical" else float)
        with sklearn.config_context(assume_finite=True, skip_parameter_validation=True):
            transformed: dict[str, np.ndarray] = {}
            for prep, members in self._prep_groups:
                out = prep.transform(batch)
                for tid in members:
                    transformed[tid] = out
            curves = {}
            for tid, tm in self.models.items():
                m = model_margin(tm.model, transformed[tid], tm.family)
                curves[tid] = [round(float(v), 5) for v in 1.0 / (1.0 + np.exp(-(tm.a * m + tm.b)))]

        current = payload.get(feature_id)
        if feature_id in imputed or current is None:
            current = stats["default"]
        return {
            "feature": feature_id,
            "label": spec.label,
            "kind": spec.kind,
            "unit": spec.unit,
            "ref": list(spec.ref) if spec.ref else None,
            "grid": grid,
            "labels": labels,
            "current": current,
            "targets": curves,
            "thresholds": {tid: tm.threshold for tid, tm in self.models.items()},
        }

    def _grid(self, spec: FeatureSpec, points: int) -> tuple[list[Any], list[str] | None]:
        """Values to sweep a feature over: its plausible range for numbers, its options otherwise."""
        if spec.kind == "numeric":
            stats = self._stats[spec.id]
            lo, hi = spec.range if spec.range else (stats.get("min") or 0.0, stats.get("max") or 1.0)
            return [round(float(v), 4) for v in np.linspace(lo, hi, max(5, min(points, 101)))], None
        grid = [o["value"] if spec.kind == "categorical" else float(o["value"]) for o in spec.options]
        return grid, [str(o["label"]) for o in spec.options]

    # --------------------------------------------------------- global dependence

    def dependence(self, feature_id: str, points: int = 25) -> dict[str, Any]:
        """Partial dependence over the hold-out patients: each patient's curve (ICE) while one
        feature varies, their average (PDP) and the 10-90th percentile band, for every target."""
        spec = self.catalog.feature(feature_id)
        grid, labels = self._grid(spec, points)
        frames = [self.encode(c["features"])[0] for c in self.cases]
        base = pd.concat(frames, ignore_index=True)
        n, g = len(base), len(grid)
        batch = base.loc[base.index.repeat(g)].reset_index(drop=True)
        batch[feature_id] = pd.Series(grid * n, dtype=object if spec.kind == "categorical" else float)
        with sklearn.config_context(assume_finite=True, skip_parameter_validation=True):
            transformed: dict[str, np.ndarray] = {}
            for prep, members in self._prep_groups:
                out = prep.transform(batch)
                for tid in members:
                    transformed[tid] = out
            targets = {}
            for tid, tm in self.models.items():
                m = model_margin(tm.model, transformed[tid], tm.family)
                P = (1.0 / (1.0 + np.exp(-(tm.a * m + tm.b)))).reshape(n, g)
                targets[tid] = {
                    "pdp": [round(float(v), 4) for v in P.mean(axis=0)],
                    "lo": [round(float(v), 4) for v in np.percentile(P, 10, axis=0)],
                    "hi": [round(float(v), 4) for v in np.percentile(P, 90, axis=0)],
                    "ice": [[round(float(v), 3) for v in row] for row in P],
                    "threshold": tm.threshold,
                }
        return {
            "feature": feature_id,
            "label": spec.label,
            "kind": spec.kind,
            "unit": spec.unit,
            "grid": grid,
            "labels": labels,
            # Each hold-out patient's own value, for a rug under the curves.
            "values": [c["features"].get(feature_id) for c in self.cases],
            "n": n,
            "targets": targets,
        }

    # ------------------------------------------------------------ similar patients

    def _build_similarity_space(self) -> None:
        """Standardised feature space weighted by global importance (mean |SHAP| over targets)."""
        self._sim_matrix = None
        self._cohort_frame: pd.DataFrame | None = None
        if not self.cohort:
            return
        weights = np.zeros(len(self.feature_ids))
        index = {fid: i for i, fid in enumerate(self.feature_ids)}
        for rows in self.importance.values():
            for r in rows:
                weights[index[r["feature"]]] += r["mean_abs_shap"]
        weights = weights / max(weights.sum(), 1e-9)
        M = aggregation_matrix(self._owners, self.feature_ids)  # columns -> features
        self._sim_weights = np.sqrt(M @ weights)
        frame = pd.concat([self.encode(c["features"])[0] for c in self.cohort], ignore_index=True)
        self._cohort_frame = frame
        with sklearn.config_context(assume_finite=True, skip_parameter_validation=True):
            Z = self._prep_groups[0][0].transform(frame)
        self._sim_matrix = Z * self._sim_weights

    def similar(self, payload: dict[str, Any], k: int = 5) -> dict[str, Any]:
        """The k development patients closest to this one, with their angiography results."""
        if self._sim_matrix is None:
            return {"neighbours": [], "summary": {}, "k": 0, "pool": 0, "position": None}
        frame, _, _ = self.encode(payload)
        with sklearn.config_context(assume_finite=True, skip_parameter_validation=True):
            z = self._prep_groups[0][0].transform(frame)[0] * self._sim_weights
        d = np.sqrt(((self._sim_matrix - z) ** 2).sum(axis=1))
        scale = float(np.percentile(d, 50)) or 1.0
        order = np.argsort(d)[: max(1, min(k, 15))]
        label_of = {f.id: f for f in self.catalog.features}
        neighbours = []
        for i in order:
            c = self.cohort[int(i)]
            feats = c["features"]
            neighbours.append(
                {
                    "patient_id": c["patient_id"],
                    "similarity": round(float(max(0.0, 1.0 - d[i] / (2 * scale))), 4),
                    "distance": round(float(d[i]), 4),
                    "summary": ", ".join(
                        x
                        for x in [
                            f"{int(feats['age'])} y",
                            "M" if feats["sex_male"] == 1 else "F",
                            "typical angina" if feats["typical_chest_pain"] == 1 else None,
                            "diabetic" if feats["dm"] == 1 else None,
                            f"EF {int(feats['ejection_fraction'])}%" if "ejection_fraction" in label_of else None,
                        ]
                        if x
                    ),
                    "truth": c["truth"],
                    "features": feats,
                }
            )
        summary = {t.id: int(sum(n["truth"][t.id] for n in neighbours)) for t in self.catalog.targets}
        # Position on the cohort map: inverse-distance average of the 5 nearest patients
        # (exactly a patient's own point when it is one of them).
        xy = self.cohort_map_xy()
        near = np.argsort(d)[:5]
        w = 1.0 / (d[near] + 1e-6) ** 2
        position = [round(float(v), 4) for v in (xy[near] * w[:, None]).sum(axis=0) / w.sum()]
        return {
            "neighbours": neighbours,
            "summary": summary,
            "k": len(neighbours),
            "pool": len(self.cohort),
            "position": position,
        }

    # ----------------------------------------------------------------- cohort map

    def cohort_map_xy(self) -> np.ndarray:
        """2D t-SNE coordinates (0..1) of the development patients in the similarity space.
        Computed once (about 2 s) and cached; seeded, so the map is stable between runs."""
        if self._map_xy is None:
            from sklearn.manifold import TSNE

            E = TSNE(n_components=2, perplexity=30, init="pca", learning_rate="auto", random_state=0).fit_transform(
                self._sim_matrix
            )
            lo, hi = E.min(axis=0), E.max(axis=0)
            self._map_xy = (E - lo) / np.maximum(hi - lo, 1e-9)
        return self._map_xy

    def cohort_map(self) -> dict[str, Any]:
        """The development cohort as map points, coloured client-side by the angiography result."""
        if self._map is None:
            if self._sim_matrix is None:
                return {"method": None, "pool": 0, "points": []}
            xy = self.cohort_map_xy()
            vessels = [t.id for t in self.catalog.targets if t.kind != "overall"]
            overall = next(t.id for t in self.catalog.targets if t.kind == "overall")
            self._map = {
                "method": "t-SNE (perplexity 30) of the similarity space",
                "pool": len(self.cohort),
                "points": [
                    {
                        "patient_id": c["patient_id"],
                        "x": round(float(xy[i, 0]), 4),
                        "y": round(float(xy[i, 1]), 4),
                        "cad": int(c["truth"][overall]),
                        "vessels": int(sum(c["truth"][v] for v in vessels)),
                    }
                    for i, c in enumerate(self.cohort)
                ],
            }
        return self._map

    # ---------------------------------------------------------- LIME cross-check

    def lime(self, payload: dict[str, Any], samples: int = 1000, seed: int = 0, donors: int = 5) -> dict[str, Any]:
        """LIME-style local surrogate per target (see `surrogate.py`), compared with SHAP.
        Seeded, so the same patient always gets the same explanation."""
        if self._cohort_frame is None:
            raise RuntimeError("LIME needs artifacts/cohort.json (the development patients).")
        t0 = time.perf_counter()
        rng = np.random.default_rng(seed)
        frame, imputed, _ = self.encode(payload)
        n, d = max(2, int(samples)), len(self.feature_ids)
        width = 0.75 * math.sqrt(d)
        m = max(1, int(donors))
        Z = sample_masks(n, d, rng)
        donor_rows = rng.integers(0, len(self._cohort_frame), size=n * m)
        keep = np.repeat(Z, m, axis=0)  # every mask is evaluated with m different donor patients
        batch = pd.DataFrame(
            {
                fid: np.where(keep[:, j], frame[fid].to_numpy()[0], self._cohort_frame[fid].to_numpy()[donor_rows])
                for j, fid in enumerate(self.feature_ids)
            }
        )
        with sklearn.config_context(assume_finite=True, skip_parameter_validation=True):
            transformed: dict[str, np.ndarray] = {}
            for prep, members in self._prep_groups:
                out = prep.transform(batch)
                for tid in members:
                    transformed[tid] = out
            logits = {
                tid: (tm.a * model_margin(tm.model, transformed[tid], tm.family) + tm.b).reshape(n, m).mean(axis=1)
                for tid, tm in self.models.items()
            }
        w = kernel_weights(Z, width)
        shap = self.predict(payload, with_interval=False)["targets"]
        values = self._filled_values(frame, imputed)

        targets: dict[str, Any] = {}
        for tid in self.models:
            intercept, beta, r2 = fit_surrogate(Z, np.asarray(logits[tid], dtype=float), w)
            by_feature = {c["feature"]: c["contribution"] for c in shap[tid]["contributions"]}
            shap_vec = np.array([by_feature[fid] for fid in self.feature_ids])
            rows = [
                {
                    "feature": fid,
                    "label": self.catalog.feature(fid).label,
                    "display": self.format_value(self.catalog.feature(fid), values[fid]),
                    "lime": round(float(beta[j]), 5),
                    "shap": round(float(shap_vec[j]), 5),
                    "imputed": fid in imputed,
                }
                for j, fid in enumerate(self.feature_ids)
            ]
            rows.sort(key=lambda r: -abs(r["lime"]))
            targets[tid] = {
                "intercept": round(intercept, 5),
                "r2": round(r2, 4),
                **agreement(shap_vec, beta),
                "weights": rows,
            }
        return {
            "samples": n,
            "donors": m,
            "kernel_width": round(width, 4),
            "seed": seed,
            "targets": targets,
            "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
        }

    def default_patient(self) -> dict[str, Any]:
        return {f["id"]: f["stats"]["default"] for f in self.schema["features"]}
