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

from .config import ARTIFACTS_DIR, Catalog, FeatureSpec, TargetSpec, load_catalog
from .explain import FeatureExplainer
from .features import percentile
from .models import FAMILIES, ModelFamily, model_margin

TOP_DRIVERS = 3


def _sigmoid(z: float) -> float:
    return 1.0 / (1.0 + math.exp(-z))


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


class Predictor:
    def __init__(self, artifacts_dir: Path = ARTIFACTS_DIR, catalog: Catalog | None = None) -> None:
        self.catalog = catalog or load_catalog()
        self.artifacts_dir = Path(artifacts_dir)
        self.schema = self._read_json("schema.json")
        self.metrics = self._read_json("metrics.json")
        self.importance = self._read_json("importance.json")
        self.cases = self._read_json("cases.json")
        self._stats = {f["id"]: f["stats"] for f in self.schema["features"]}
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
            self.models[spec.id] = TargetModel(
                spec=spec,
                family=family,
                prep=pipeline.named_steps["prep"],
                model=model,
                a=bundle["calibrator"]["a"],
                b=bundle["calibrator"]["b"],
                threshold=bundle["threshold"],
                ensemble=bundle["ensemble"],
                explainer=FeatureExplainer(
                    family, model, bundle["background"], bundle["owners"], self.feature_ids
                ),
            )

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

        frame = pd.DataFrame([row], columns=self.feature_ids)
        for spec in self.catalog.features:
            if spec.kind == "categorical":
                frame[spec.id] = frame[spec.id].astype(object)
            else:
                frame[spec.id] = frame[spec.id].astype(float)
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
        values = {}
        for spec in self.catalog.features:
            v = frame.iloc[0][spec.id]
            if spec.id in imputed:
                v = self._stats[spec.id]["default"]
            values[spec.id] = v
        return values

    # ---------------------------------------------------------------- prediction

    def predict(self, payload: dict[str, Any], with_interval: bool = True) -> dict[str, Any]:
        t0 = time.perf_counter()
        frame, imputed, warnings = self.encode(payload)
        values = self._filled_values(frame, imputed)
        label_of = {f.id: f.label for f in self.catalog.features}

        targets: dict[str, Any] = {}
        per_feature: dict[str, dict[str, float]] = {fid: {} for fid in self.feature_ids}
        for tid, tm in self.models.items():
            Xt = tm.prep.transform(frame)
            m = float(model_margin(tm.model, Xt, tm.family)[0])
            logit = tm.a * m + tm.b
            p = _sigmoid(logit)
            base, contrib = tm.explainer.explain(Xt)
            contrib = contrib[0] * tm.a
            base_logit = tm.a * base + tm.b

            interval = None
            if with_interval and tm.ensemble:
                ens = np.array([model_margin(e, Xt, tm.family)[0] for e in tm.ensemble])
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
            pct = percentile(stats, numeric_value)
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
            f"{subject} probability is {p:.0%} ({band.lower()} band, {relation} the decision threshold of {threshold:.0%})."
        ]
        if up:
            parts.append(f"Factors increasing the estimate: {fmt(up)}.")
        if down:
            parts.append(f"Factors decreasing it: {fmt(down)}.")
        return " ".join(parts)

    # ------------------------------------------------------------------- helpers

    def default_patient(self) -> dict[str, Any]:
        return {f["id"]: f["stats"]["default"] for f in self.schema["features"]}
