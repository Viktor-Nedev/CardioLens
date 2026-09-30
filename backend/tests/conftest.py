import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from cardiolens.config import ARTIFACTS_DIR  # noqa: E402

needs_artifacts = pytest.mark.skipif(
    not (ARTIFACTS_DIR / "models" / "cad.joblib").exists(),
    reason="trained artifacts missing; run: python -m cardiolens.train",
)


@pytest.fixture(scope="session")
def predictor():
    from cardiolens.predictor import Predictor

    return Predictor()
