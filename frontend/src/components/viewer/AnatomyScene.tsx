import { Html, useGLTF } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  MODEL_URL,
  STRUCTURE_BY_NODE,
  TARGET_NODE,
  TERRITORY_TARGETS,
  type AnatomyMeta,
} from "../../anatomy/registry";
import { riskColor } from "../../lib/colors";
import { pct } from "../../lib/format";
import type { TargetId } from "../../lib/types";
import { useStore } from "../../state/store";
import { AnimatedNumber } from "../ui/primitives";
import { addFlowAttribute, createHeartMaterial, createHologramMaterial, createVesselMaterial, inflate } from "./materials";

const NEUTRAL = "#8a93a3";
const SCAN_SECONDS = 2.2;
const VESSEL_TARGETS: TargetId[] = ["lad", "lcx", "rca"];

interface Parts {
  [node: string]: THREE.BufferGeometry;
}

function useAnatomyGeometry(): Parts {
  const { scene } = useGLTF(MODEL_URL);
  return useMemo(() => {
    scene.updateMatrixWorld(true);
    const parts: Parts = {};
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const g = mesh.geometry.clone();
      g.applyMatrix4(mesh.matrixWorld);
      if (g.attributes.color) {
        g.setAttribute("territory", g.attributes.color);
        g.deleteAttribute("color");
      }
      if (!g.attributes.normal) g.computeVertexNormals();
      g.computeBoundingSphere();
      parts[mesh.name] = g;
    });
    return parts;
  }, [scene]);
}

/** Dominant supplying artery at a picked myocardium face. */
function territoryAt(geometry: THREE.BufferGeometry, face: THREE.Face | null | undefined): { target: TargetId; weight: number } | null {
  const attr = geometry.getAttribute("territory") as THREE.BufferAttribute | undefined;
  if (!attr || !face) return null;
  const w = [0, 0, 0];
  for (const idx of [face.a, face.b, face.c]) {
    w[0] += attr.getX(idx);
    w[1] += attr.getY(idx);
    w[2] += attr.getZ(idx);
  }
  const best = w.indexOf(Math.max(...w));
  const weight = w[best] / 3;
  return weight > 0.18 ? { target: TERRITORY_TARGETS[best], weight } : null;
}

export function AnatomyScene({ meta }: { meta: AnatomyMeta | null }) {
  const parts = useAnatomyGeometry();
  const prediction = useStore((s) => s.prediction);
  const selected = useStore((s) => s.selected);
  const hovered = useStore((s) => s.hovered);
  const viewer = useStore((s) => s.viewer);
  const pulseRate = useStore((s) => s.patient.pulse_rate);
  const select = useStore((s) => s.select);
  const setHovered = useStore((s) => s.setHovered);
  const setHoverInfo = useStore((s) => s.setHoverInfo);

  const heart = useMemo(() => createHeartMaterial(), []);
  const hologram = useMemo(() => createHologramMaterial(), []);

  const vesselMaterials = useMemo(() => {
    const out = {} as Record<TargetId, ReturnType<typeof createVesselMaterial>>;
    for (const t of VESSEL_TARGETS) out[t] = createVesselMaterial(NEUTRAL);
    return out;
  }, []);
  const scanRingMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#5cc8f5",
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );

  const staticMaterials = useMemo(
    () => ({
      lm: new THREE.MeshStandardMaterial({ color: "#d9dee7", roughness: 0.35, emissive: "#58606c", emissiveIntensity: 0.25 }),
      aorta: new THREE.MeshStandardMaterial({ color: "#a64e55", roughness: 0.5, metalness: 0.02 }),
      cava: new THREE.MeshStandardMaterial({ color: "#46598f", roughness: 0.55 }),
      veins: new THREE.MeshStandardMaterial({ color: "#4a4f86", roughness: 0.5 }),
      lungs: new THREE.MeshStandardMaterial({
        color: "#8fb2dc",
        transparent: true,
        opacity: 0.09,
        depthWrite: false,
        side: THREE.DoubleSide,
        roughness: 0.9,
      }),
      bone: new THREE.MeshStandardMaterial({
        color: "#a9a293",
        roughness: 0.9,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
      }),
      hit: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
      // Selection outline: a slightly fatter copy drawn from the inside (back faces only).
      outline: new THREE.MeshBasicMaterial({ color: "#ffffff", side: THREE.BackSide, transparent: true, opacity: 0.9 }),
    }),
    [],
  );

  // Fattened copies: a hair thicker for display, much thicker (invisible) for picking.
  const vesselGeo = useMemo(() => {
    const display = {} as Record<TargetId, THREE.BufferGeometry>;
    const outline = {} as Record<TargetId, THREE.BufferGeometry>;
    const hit = {} as Record<TargetId, THREE.BufferGeometry>;
    for (const t of VESSEL_TARGETS) {
      const g = parts[TARGET_NODE[t]];
      if (!g) continue;
      display[t] = addFlowAttribute(inflate(g, 0.0025));
      outline[t] = inflate(g, 0.009);
      hit[t] = inflate(g, 0.022);
    }
    return { display, outline, hit };
  }, [parts]);

  // Heart x-ray mode toggles transparency on the myocardium.
  useEffect(() => {
    const m = heart.material;
    m.transparent = viewer.xray;
    m.opacity = viewer.xray ? 0.3 : 1;
    m.depthWrite = !viewer.xray;
    m.side = viewer.xray ? THREE.DoubleSide : THREE.FrontSide;
    m.needsUpdate = true;
  }, [viewer.xray, heart.material]);

  const targetColors = useMemo(() => {
    const out = {} as Record<TargetId, THREE.Color>;
    for (const t of ["cad", ...VESSEL_TARGETS] as TargetId[]) {
      const p = prediction?.targets[t]?.probability;
      out[t] = new THREE.Color(p == null ? NEUTRAL : riskColor(p));
    }
    return out;
  }, [prediction]);

  const heartGroup = useRef<THREE.Group>(null);
  const scanRing = useRef<THREE.Mesh>(null);
  const bpm = typeof pulseRate === "number" && pulseRate > 30 ? pulseRate : 72;

  // Every new prediction triggers a top-to-bottom "re-analysis" scan of the myocardium.
  const scanNonce = useStore((s) => s.scanNonce);
  const scanPending = useRef(false);
  const scanStart = useRef(-100);
  useEffect(() => {
    if (scanNonce > 0) scanPending.current = true;
  }, [scanNonce]);

  useFrame((state, delta) => {
    const k = 1 - Math.exp(-delta * 5);
    const t = state.clock.elapsedTime;

    const effects = !viewer.performance;
    const flowTarget = effects && viewer.flow ? 1 : 0;

    // Vessel colours ease towards the new prediction; brightness also rises with risk.
    for (const v of VESSEL_TARGETS) {
      const { material: m, uniforms: u } = vesselMaterials[v];
      u.uTime.value = t;
      u.uBeat.value = bpm / 60;
      u.uFlow.value = THREE.MathUtils.lerp(u.uFlow.value, flowTarget, k);
      m.color.lerp(targetColors[v], k);
      m.emissive.lerp(targetColors[v], k);
      const pred = prediction?.targets[v];
      const p = pred?.probability ?? 0;
      const above = pred ? p >= pred.threshold : false;
      const focus = v === selected ? 0.35 : v === hovered ? 0.25 : 0;
      const glow = above ? 0.22 * (0.6 + 0.4 * Math.sin(t * 4)) : 0;
      m.emissiveIntensity = THREE.MathUtils.lerp(m.emissiveIntensity, 0.12 + 0.45 * p + focus + glow, k);
    }

    // Myocardial territories follow the vessel colours.
    TERRITORY_TARGETS.forEach((v, i) => heart.uniforms.uTerritoryColor.value[i].lerp(targetColors[v], k));
    heart.uniforms.uTerritoryMix.value = THREE.MathUtils.lerp(
      heart.uniforms.uTerritoryMix.value,
      viewer.territories ? 1 : 0,
      k,
    );
    const selIdx = TERRITORY_TARGETS.indexOf(selected);
    heart.uniforms.uSelected.value.set(selIdx === 0 ? 1 : 0, selIdx === 1 ? 1 : 0, selIdx === 2 ? 1 : 0);
    heart.uniforms.uPulse.value = 0.12 + 0.12 * (0.5 + 0.5 * Math.sin(t * 3));
    staticMaterials.outline.opacity = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(t * 3.2));

    // Scan sweep (ease in-out) after each prediction update.
    if (scanPending.current) {
      scanPending.current = false;
      if (t - scanStart.current > SCAN_SECONDS) scanStart.current = t;
    }
    const progress = (t - scanStart.current) / SCAN_SECONDS;
    const scanning = effects && progress >= 0 && progress <= 1;
    const eased = progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2;
    const scanY = 0.6 - 1.2 * Math.min(1, Math.max(0, eased));
    const strength = scanning ? Math.sin(Math.PI * Math.min(1, progress)) : 0;
    heart.uniforms.uScanY.value = scanY;
    heart.uniforms.uScanStrength.value = strength;
    if (scanRing.current) {
      scanRing.current.position.y = scanY;
      scanRing.current.visible = strength > 0.01;
      scanRingMaterial.opacity = 0.75 * strength;
    }

    // Heartbeat at the patient's recorded pulse rate.
    if (heartGroup.current) {
      let s = 1;
      if (viewer.heartbeat && !viewer.performance) {
        const phase = (t * bpm) / 60 % 1;
        s = 1 + 0.014 * Math.exp(-(((phase - 0.08) / 0.05) ** 2)) + 0.008 * Math.exp(-(((phase - 0.3) / 0.07) ** 2));
      }
      heartGroup.current.scale.setScalar(s);
    }
  });

  // ---------------------------------------------------------------- interaction

  const hoverVessel = (t: TargetId) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(t);
    document.body.style.cursor = "pointer";
    const pred = prediction?.targets[t];
    setHoverInfo({
      title: `${pred?.short ?? t.toUpperCase()} · ${STRUCTURE_BY_NODE[TARGET_NODE[t]].label}`,
      detail: pred ? `Stenosis probability ${pct(pred.probability)} · threshold ${pct(pred.threshold)}` : undefined,
      target: t,
      x: e.nativeEvent.offsetX,
      y: e.nativeEvent.offsetY,
    });
  };

  const hoverHeart = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const terr = territoryAt(parts.heart_wall, e.face);
    const cad = prediction?.targets.cad;
    document.body.style.cursor = "pointer";
    if (terr) {
      const pred = prediction?.targets[terr.target];
      setHovered(terr.target);
      setHoverInfo({
        title: `Myocardium · ${pred?.short ?? terr.target.toUpperCase()} territory (schematic)`,
        detail: pred ? `Supplying-artery stenosis probability ${pct(pred.probability)}` : undefined,
        target: terr.target,
        x: e.nativeEvent.offsetX,
        y: e.nativeEvent.offsetY,
      });
    } else {
      setHovered(null);
      setHoverInfo({
        title: "Myocardium",
        detail: cad ? `Overall CAD probability ${pct(cad.probability)}` : undefined,
        target: "cad",
        x: e.nativeEvent.offsetX,
        y: e.nativeEvent.offsetY,
      });
    }
  };

  const hoverContext = (node: string) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const def = STRUCTURE_BY_NODE[node];
    setHovered(null);
    document.body.style.cursor = "default";
    setHoverInfo({
      title: def.label,
      detail: def.note ?? "Anatomical context (not a model output)",
      x: e.nativeEvent.offsetX,
      y: e.nativeEvent.offsetY,
    });
  };

  const leave = () => {
    setHovered(null);
    setHoverInfo(null);
    document.body.style.cursor = "default";
  };

  const clickVessel = (t: TargetId) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 6) return; // was an orbit drag, not a click
    select(t);
  };

  const clickHeart = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 6) return;
    const terr = territoryAt(parts.heart_wall, e.face);
    select(terr?.target ?? "cad", false);
  };

  const noRaycast = () => null;

  return (
    <group>
      <group ref={heartGroup}>
        {parts.heart_wall && (
          <mesh
            geometry={parts.heart_wall}
            material={heart.material}
            onPointerMove={hoverHeart}
            onPointerOut={leave}
            onClick={clickHeart}
          />
        )}
        {VESSEL_TARGETS.map((t) =>
          vesselGeo.display[t] ? (
            <group key={t}>
              <mesh geometry={vesselGeo.display[t]} material={vesselMaterials[t].material} raycast={noRaycast} renderOrder={2} />
              {selected === t && (
                <mesh geometry={vesselGeo.outline[t]} material={staticMaterials.outline} raycast={noRaycast} renderOrder={1} />
              )}
              <mesh
                geometry={vesselGeo.hit[t]}
                material={staticMaterials.hit}
                onPointerMove={hoverVessel(t)}
                onPointerOut={leave}
                onClick={clickVessel(t)}
              />
            </group>
          ) : null,
        )}
        {parts.vessel_LM && (
          <mesh
            geometry={parts.vessel_LM}
            material={staticMaterials.lm}
            onPointerMove={hoverContext("vessel_LM")}
            onPointerOut={leave}
          />
        )}
        {viewer.veins && parts.cardiac_veins && (
          <mesh
            geometry={parts.cardiac_veins}
            material={staticMaterials.veins}
            onPointerMove={hoverContext("cardiac_veins")}
            onPointerOut={leave}
          />
        )}
      </group>

      {viewer.greatVessels && parts.aorta && (
        <mesh geometry={parts.aorta} material={staticMaterials.aorta} onPointerMove={hoverContext("aorta")} onPointerOut={leave} />
      )}
      {viewer.greatVessels && parts.vena_cava && (
        <mesh
          geometry={parts.vena_cava}
          material={staticMaterials.cava}
          onPointerMove={hoverContext("vena_cava")}
          onPointerOut={leave}
        />
      )}
      {viewer.lungs && parts.lungs && <mesh geometry={parts.lungs} material={staticMaterials.lungs} raycast={noRaycast} />}
      {viewer.lungs && parts.trachea && <mesh geometry={parts.trachea} material={staticMaterials.lungs} raycast={noRaycast} />}
      {viewer.ribs && parts.ribs && <mesh geometry={parts.ribs} material={staticMaterials.bone} raycast={noRaycast} />}
      {viewer.ribs && parts.sternum && <mesh geometry={parts.sternum} material={staticMaterials.bone} raycast={noRaycast} />}
      {viewer.torso && parts.skin && <mesh geometry={parts.skin} material={hologram} raycast={noRaycast} renderOrder={10} />}

      <mesh ref={scanRing} rotation-x={Math.PI / 2} material={scanRingMaterial} raycast={noRaycast} visible={false}>
        <torusGeometry args={[0.74, 0.0035, 8, 160]} />
      </mesh>

      {viewer.labels && meta && <VesselLabels meta={meta} />}
    </group>
  );
}

function VesselLabels({ meta }: { meta: AnatomyMeta }) {
  const prediction = useStore((s) => s.prediction);
  const selected = useStore((s) => s.selected);
  const hovered = useStore((s) => s.hovered);
  const select = useStore((s) => s.select);
  const setHovered = useStore((s) => s.setHovered);

  return (
    <>
      {VESSEL_TARGETS.map((t) => {
        const node = meta.nodes[TARGET_NODE[t]];
        if (!node) return null;
        const pred = prediction?.targets[t];
        const [x, y, z] = node.center;
        const len = Math.hypot(x, y, z) || 1;
        const push = 0.22 / len;
        const pos: [number, number, number] = [x + x * push, y + y * push, z + z * push];
        const active = selected === t || hovered === t;
        return (
          <Html key={t} position={pos} center zIndexRange={[30, 0]}>
            <motion.button
              initial={{ opacity: 0, scale: 0.6, y: 6 }}
              animate={{ opacity: 1, scale: active ? 1.08 : 1, y: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 22, delay: 0.1 * VESSEL_TARGETS.indexOf(t) }}
              type="button"
              onClick={() => select(t)}
              onPointerEnter={() => setHovered(t)}
              onPointerLeave={() => setHovered(null)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold shadow-lg backdrop-blur-md transition-colors ${
                active ? "border-white/60 bg-[#0b111bcc] text-ink" : "border-white/15 bg-[#0b111b99] text-ink-2"
              }`}
              aria-label={`Select ${pred?.short ?? t}`}
            >
              <span
                className="inline-block h-2 w-2 rounded-full transition-colors duration-700"
                style={{
                  background: pred ? riskColor(pred.probability) : NEUTRAL,
                  boxShadow: pred ? `0 0 8px ${riskColor(pred.probability)}` : "none",
                }}
              />
              {pred?.short ?? t.toUpperCase()}
              {pred ? (
                <AnimatedNumber value={pred.probability} format={pct} className="tabular font-medium text-ink" />
              ) : (
                <span className="text-ink-3">…</span>
              )}
            </motion.button>
          </Html>
        );
      })}
    </>
  );
}

useGLTF.preload(MODEL_URL);
