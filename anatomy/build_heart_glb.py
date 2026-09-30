"""Build the CardioLens anatomy asset (frontend/public/models/heart.glb) from BodyParts3D.

    python anatomy/build_heart_glb.py [--out frontend/public/models]

BodyParts3D (c) The Database Center for Life Science, CC BY-SA 2.1 Japan.
Source meshes are fetched from the STL mirror at
https://github.com/Kevin-Mattheus-Moerman/BodyParts3D and cached in anatomy/.cache.

Each output node groups one or more FMA primitives. The coronary nodes are named
after the model targets (vessel_LAD / vessel_LCX / vessel_RCA) so the viewer can
colour them directly from /api/predict. The myocardial wall carries per-vertex
territory weights in COLOR_0 (R = LAD, G = LCX, B = RCA) computed from surface
distance to each vessel; they drive the schematic perfusion-territory shading.
"""

from __future__ import annotations

import argparse
import json
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import trimesh
from scipy.spatial import cKDTree

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
CACHE = HERE / ".cache" / "stl"
MIRROR = "https://raw.githubusercontent.com/Kevin-Mattheus-Moerman/BodyParts3D/main/assets/BodyParts3D_data/stl/{}.stl"
SCALE = 0.01  # millimetres -> scene units (1 unit = 10 cm)
TERRITORY_SIGMA_MM = 22.0


@dataclass(frozen=True)
class Part:
    node: str
    label: str
    fma: tuple[str, ...]
    faces: int | None  # decimation target for the merged node (None = keep)


PARTS: list[Part] = [
    Part("heart_wall", "Heart wall (myocardium)", ("FMA7274",), 60000),
    # Coronary arteries, grouped exactly as the model targets.
    Part("vessel_LM", "Left main coronary artery", ("FMA4685",), None),
    Part("vessel_LAD", "Left anterior descending artery", ("FMA3862nsn", "FMA71670"), None),
    Part("vessel_LCX", "Left circumflex artery", ("FMA3895",), None),
    Part(
        "vessel_RCA",
        "Right coronary artery",
        ("FMA3802", "FMA3818", "FMA76994", "FMA3840nsn", "FMA71669"),
        None,
    ),
    # Great vessels and veins.
    Part("aorta", "Aorta", ("FMA3736", "FMA3768", "FMA3784"), 9000),
    Part("vena_cava", "Superior and inferior vena cava", ("FMA4720", "FMA10951"), 4000),
    Part("cardiac_veins", "Cardiac veins", ("FMA4707", "FMA4706", "FMA4713", "FMA71567", "FMA76751"), 8000),
    # Thoracic context.
    Part("lungs", "Lungs", ("FMA7333", "FMA7383", "FMA7337", "FMA7370", "FMA7371"), 24000),
    Part(
        "ribs",
        "Rib cage",
        tuple(
            f"FMA{i}"
            for i in (
                7987, 8012, 8039, 8148, 8093, 8202, 8256, 8310, 8391, 8472, 8532, 8534,
                7857, 7882, 7909, 7957, 8066, 8175, 8229, 8283, 8364, 8445, 8531, 8533,
            )
        ),
        36000,
    ),
    Part("sternum", "Sternum", ("FMA7486", "FMA7487", "FMA7488"), 5000),
    Part("trachea", "Trachea", ("FMA7394",), 2500),
    Part("skin", "Torso surface", ("FMA7163",), 22000),
]


def fetch(fma: str) -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{fma}.stl"
    if not path.exists():
        print(f"  downloading {fma}")
        with urllib.request.urlopen(MIRROR.format(fma), timeout=120) as resp:
            path.write_bytes(resp.read())
    return path


def load(fmas: tuple[str, ...]) -> trimesh.Trimesh:
    meshes = [trimesh.load_mesh(fetch(f), file_type="stl") for f in fmas]
    mesh = trimesh.util.concatenate(meshes)
    mesh.merge_vertices()
    return mesh


def decimate(mesh: trimesh.Trimesh, faces: int | None) -> trimesh.Trimesh:
    if faces is None or len(mesh.faces) <= faces:
        return mesh
    import fast_simplification

    ratio = 1.0 - faces / len(mesh.faces)
    v, f = fast_simplification.simplify(
        mesh.vertices.astype(np.float32), mesh.faces.astype(np.int32), target_reduction=ratio
    )
    out = trimesh.Trimesh(v, f, process=True)
    out.remove_unreferenced_vertices()
    return out


def crop_torso(skin: trimesh.Trimesh, ribs: trimesh.Trimesh, axes) -> trimesh.Trimesh:
    """Keep the thoracic part of the body surface and cut the arms away."""
    lo, hi = ribs.bounds
    up, lr = axes["up_axis"], axes["lr_axis"]
    c = skin.triangles_center
    keep = (
        (c[:, up] > lo[up] - 40)
        & (c[:, up] < hi[up] + 70)
        & (c[:, lr] > lo[lr] - 25)
        & (c[:, lr] < hi[lr] + 25)
    )
    mesh = skin.submesh([np.where(keep)[0]], append=True)
    # Keep the largest connected surface (drops arm stumps and loose fragments).
    labels = trimesh.graph.connected_component_labels(mesh.face_adjacency, node_count=len(mesh.faces))
    areas = np.bincount(labels, weights=mesh.area_faces)
    return mesh.submesh([np.where(labels == int(np.argmax(areas)))[0]], append=True)


def crop_below(mesh: trimesh.Trimesh, level: float, up_axis: int) -> trimesh.Trimesh:
    """Remove the abdominal continuation of the great vessels."""
    keep = np.where(mesh.triangles_center[:, up_axis] > level)[0]
    out = mesh.submesh([keep], append=True)
    out.remove_unreferenced_vertices()
    return out


def detect_axes(heart: trimesh.Trimesh, sternum: trimesh.Trimesh, lungs_left: trimesh.Trimesh, lungs_right: trimesh.Trimesh):
    """BodyParts3D is Z-up; find which horizontal axes point anterior and to the patient's left."""
    anterior = sternum.centroid - heart.centroid
    left = lungs_left.centroid - lungs_right.centroid
    ap_axis = int(np.argmax(np.abs(anterior[:2])))
    lr_axis = 1 - ap_axis
    return {
        "up_axis": 2,
        "ap_axis": ap_axis,
        "ap_sign": float(np.sign(anterior[ap_axis])),
        "lr_axis": lr_axis,
        "lr_sign": float(np.sign(left[lr_axis])),
    }


def to_scene(points: np.ndarray, center: np.ndarray, axes) -> np.ndarray:
    """Map to three.js convention: +X patient's left, +Y up, +Z anterior (towards the viewer)."""
    p = points - center
    out = np.empty_like(p)
    out[:, 0] = p[:, axes["lr_axis"]] * axes["lr_sign"]
    out[:, 1] = p[:, axes["up_axis"]]
    out[:, 2] = p[:, axes["ap_axis"]] * axes["ap_sign"]
    return out * SCALE


def handedness(axes) -> float:
    """Determinant of the axis mapping; negative means triangle winding must be flipped."""
    M = np.zeros((3, 3))
    M[0, axes["lr_axis"]] = axes["lr_sign"]
    M[1, axes["up_axis"]] = 1
    M[2, axes["ap_axis"]] = axes["ap_sign"]
    return float(np.linalg.det(M))


def territory_colors(wall: trimesh.Trimesh, vessels: dict[str, trimesh.Trimesh]) -> np.ndarray:
    channels = []
    for key in ("vessel_LAD", "vessel_LCX", "vessel_RCA"):
        tree = cKDTree(vessels[key].vertices)
        d, _ = tree.query(wall.vertices)
        channels.append(np.exp(-((d / TERRITORY_SIGMA_MM) ** 2)))
    w = np.stack(channels, axis=1)
    rgba = np.concatenate([w, np.ones((len(w), 1))], axis=1)
    return (np.clip(rgba, 0, 1) * 255).astype(np.uint8)


def anchor(mesh: trimesh.Trimesh, bias: np.ndarray | None = None) -> list[float]:
    """A surface point near the middle of the structure for labels and camera targets."""
    target = mesh.centroid if bias is None else mesh.centroid + bias
    idx = int(np.argmin(np.linalg.norm(mesh.vertices - target, axis=1)))
    return [round(float(v), 4) for v in mesh.vertices[idx]]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=ROOT / "frontend" / "public" / "models")
    args = parser.parse_args()

    print("Loading BodyParts3D primitives")
    raw = {p.node: load(p.fma) for p in PARTS}
    lungs_left = load(("FMA7370", "FMA7371"))
    lungs_right = load(("FMA7333", "FMA7383", "FMA7337"))
    axes = detect_axes(raw["heart_wall"], raw["sternum"], lungs_left, lungs_right)
    print(f"  axes: {axes}")

    raw["skin"] = crop_torso(raw["skin"], raw["ribs"], axes)
    diaphragm_level = raw["heart_wall"].bounds[0][axes["up_axis"]] - 70
    for node in ("aorta", "vena_cava"):
        raw[node] = crop_below(raw[node], diaphragm_level, axes["up_axis"])
    territory_vessels = {k: raw[k] for k in ("vessel_LAD", "vessel_LCX", "vessel_RCA")}

    center = raw["heart_wall"].bounds.mean(axis=0)
    flip = handedness(axes)
    scene = trimesh.Scene()
    meta = {"units": "1 scene unit = 10 cm", "source": "BodyParts3D (DBCLS), CC BY-SA 2.1 JP", "nodes": {}}
    total_faces = 0
    for part in PARTS:
        mesh = decimate(raw[part.node], part.faces)
        if part.node == "heart_wall":
            colors = territory_colors(mesh, territory_vessels)
        faces = mesh.faces if flip > 0 else mesh.faces[:, ::-1]
        mesh = trimesh.Trimesh(to_scene(mesh.vertices, center, axes), faces, process=False)
        if mesh.volume < 0:  # some source surfaces are stored inside-out
            mesh.invert()
        if part.node == "heart_wall":
            mesh.visual = trimesh.visual.ColorVisuals(mesh, vertex_colors=colors)
        total_faces += len(mesh.faces)
        scene.add_geometry(mesh, geom_name=part.node, node_name=part.node)
        meta["nodes"][part.node] = {
            "label": part.label,
            "fma": list(part.fma),
            "faces": int(len(mesh.faces)),
            "anchor": anchor(mesh),
            "center": [round(float(v), 4) for v in mesh.bounds.mean(axis=0)],
            "radius": round(float(np.linalg.norm(mesh.extents) / 2), 4),
        }
        print(f"  {part.node:<14} {len(mesh.faces):>7} faces")

    args.out.mkdir(parents=True, exist_ok=True)
    glb = trimesh.exchange.gltf.export_glb(scene, include_normals=True)
    (args.out / "heart.glb").write_bytes(glb)
    (args.out / "heart.meta.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    print(f"Wrote {args.out / 'heart.glb'}: {len(glb) / 1e6:.2f} MB, {total_faces} faces")


if __name__ == "__main__":
    main()
