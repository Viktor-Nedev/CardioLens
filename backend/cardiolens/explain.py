"""SHAP explanations folded back onto clinical features."""

from __future__ import annotations

import warnings

import numpy as np
import shap

from .features import aggregation_matrix
from .models import ModelFamily, model_margin


class FeatureExplainer:
    """Explains the model margin and returns one additive contribution per clinical feature.

    Contributions are expressed in the model's margin units; multiply by the
    Platt slope to get calibrated log-odds (see `predictor.py`).
    """

    def __init__(
        self,
        family: ModelFamily,
        model,
        background: np.ndarray,
        owners: list[str],
        feature_ids: list[str],
    ) -> None:
        self.family = family
        self.model = model
        self.M = aggregation_matrix(owners, feature_ids)

        if family.explainer == "linear":
            self._explainer = shap.LinearExplainer(model, background)
        elif family.explainer == "tree":
            self._explainer = shap.TreeExplainer(
                model,
                data=background,
                feature_perturbation="interventional",
                model_output="raw",
            )
        else:
            summary = shap.kmeans(background, min(10, len(background)))
            self._explainer = shap.KernelExplainer(
                lambda Z: model_margin(model, Z, family), summary
            )

    @property
    def expected_value(self) -> float:
        ev = np.atleast_1d(self._explainer.expected_value)
        return float(ev[-1])

    def explain(self, Xt: np.ndarray) -> tuple[float, np.ndarray]:
        """Return (base_value, contributions[n_samples, n_features]) in margin units."""
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            if self.family.explainer == "kernel":
                values = self._explainer.shap_values(Xt, nsamples=300, silent=True)
            elif self.family.explainer == "tree":
                values = self._explainer.shap_values(Xt, check_additivity=False)
            else:
                values = self._explainer.shap_values(Xt)
        values = np.asarray(values)
        if values.ndim == 3:  # (n, features, classes) for probability-output forests
            values = values[..., -1]
        return self.expected_value, values @ self.M
