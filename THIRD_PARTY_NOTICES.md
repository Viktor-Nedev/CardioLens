# Third-party data and assets

## Dataset: Extension of Z-Alizadeh Sani dataset

- File: `backend/data/raw/extention of Z-Alizadeh sani dataset.xlsx` (unmodified copy)
- Source: UCI Machine Learning Repository, dataset #411
  <https://archive.ics.uci.edu/dataset/411/extention+of+z+alizadeh+sani+dataset>
- License: Creative Commons Attribution 4.0 International (CC BY 4.0)
- Citation: Alizadehsani, R., Roshanzamir, M., & Sani, Z. (2013). *Extention of
  Z-Alizadeh Sani dataset* [Dataset]. UCI Machine Learning Repository.
  <https://doi.org/10.24432/C5461K>

## 3D anatomy: BodyParts3D

- Files: `frontend/public/models/heart.glb` and `heart.meta.json`, built by
  `anatomy/build_heart_glb.py` (merged, re-oriented and decimated meshes, plus
  computed per-vertex perfusion-territory weights).
- Source: BodyParts3D, © The Database Center for Life Science (DBCLS),
  <https://lifesciencedb.jp/bp3d/>, obtained through the STL conversion by
  Kevin M. Moerman, <https://github.com/Kevin-Mattheus-Moerman/BodyParts3D>.
- License: Creative Commons Attribution-Share Alike 2.1 Japan (CC BY-SA 2.1 JP).
  The derived `heart.glb` is distributed under the same license.
- Reference: Mitsuhashi N. et al. BodyParts3D: 3D structure database for
  anatomical concepts. *Nucleic Acids Research* 37 (Database issue), D782–D785 (2009).

## Software

Python: NumPy, pandas, scikit-learn, SciPy, SHAP, numba, FastAPI, Uvicorn,
Pydantic, PyYAML, joblib, openpyxl, matplotlib, trimesh, fast-simplification.
JavaScript: React, three.js, React Three Fiber, drei, zustand, Tailwind CSS,
lucide-react, Inter (SIL Open Font License). Each is used under its own
open-source license (MIT, BSD, Apache-2.0 or OFL).

SHAP method: Lundberg, S. M. & Lee, S.-I. A unified approach to interpreting
model predictions. *NeurIPS* 2017.
