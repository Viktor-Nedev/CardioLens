import { Sparkles } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useStore } from "../../state/store";

const ACCENT = "#5cc8f5";
const TICKS = 72;

/** Thin holographic gantry ring with tick marks and orbiting markers around the heart. */
function HoloRings() {
  const spin = useRef<THREE.Group>(null);
  const orbit = useRef<THREE.Group>(null);
  const ticks = useRef<THREE.InstancedMesh>(null);

  const materials = useMemo(
    () => ({
      ring: new THREE.MeshBasicMaterial({
        color: ACCENT,
        transparent: true,
        opacity: 0.38,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      faint: new THREE.MeshBasicMaterial({
        color: ACCENT,
        transparent: true,
        opacity: 0.14,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      dot: new THREE.MeshBasicMaterial({ color: "#d8f4ff", transparent: true }),
    }),
    [],
  );

  useLayoutEffect(() => {
    const mesh = ticks.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < TICKS; i++) {
      const a = (i / TICKS) * Math.PI * 2;
      const major = i % 6 === 0;
      q.setFromAxisAngle(up, -a);
      m.compose(
        new THREE.Vector3(Math.cos(a) * 1.085, 0, Math.sin(a) * 1.085),
        q,
        new THREE.Vector3(major ? 0.05 : 0.026, 1, 1),
      );
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame((state, delta) => {
    if (spin.current) spin.current.rotation.y += delta * 0.08;
    if (orbit.current) orbit.current.rotation.y -= delta * 0.32;
    // Fade the rings out in close-ups so they never cross the anatomy being inspected.
    const fade = THREE.MathUtils.clamp((state.camera.position.length() - 2.6) / 1.0, 0, 1);
    materials.ring.opacity = 0.38 * fade;
    materials.faint.opacity = 0.14 * fade;
    materials.dot.opacity = fade;
    if (spin.current) spin.current.visible = fade > 0.01;
    if (orbit.current) orbit.current.visible = fade > 0.01;
  });

  const noRaycast = () => null;

  return (
    <group position={[0, -0.05, 0]} rotation={[0.16, 0, 0.05]}>
      <group ref={spin}>
        <mesh rotation-x={Math.PI / 2} material={materials.ring} raycast={noRaycast}>
          <torusGeometry args={[1.02, 0.0022, 6, 256]} />
        </mesh>
        <mesh rotation-x={Math.PI / 2} material={materials.faint} raycast={noRaycast}>
          <torusGeometry args={[1.16, 0.0015, 6, 256]} />
        </mesh>
        <instancedMesh ref={ticks} args={[undefined, undefined, TICKS]} material={materials.faint} raycast={noRaycast}>
          <boxGeometry args={[1, 0.003, 0.003]} />
        </instancedMesh>
      </group>
      <group ref={orbit}>
        {[0, 2.1, 4.2].map((a) => (
          <mesh key={a} position={[Math.cos(a) * 1.02, 0, Math.sin(a) * 1.02]} material={materials.dot} raycast={noRaycast}>
            <sphereGeometry args={[0.011, 12, 12]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Decorative layers: holographic rings and drifting particles. */
export function Ambience() {
  const viewer = useStore((s) => s.viewer);
  if (viewer.performance || !viewer.hologram) return null;
  return (
    <>
      <HoloRings />
      <Sparkles count={46} scale={[3.2, 2.4, 3.2]} size={1.8} speed={0.28} opacity={0.5} noise={0.8} color="#86dcff" />
    </>
  );
}

/** Bloom makes emissive vessels, flow pulses and the scan band glow; ACES keeps colours natural. */
export function PostFX() {
  const viewer = useStore((s) => s.viewer);
  if (viewer.performance || !viewer.bloom) return null;
  return (
    // 8-bit buffers: half-float targets are not available on every integrated / software GPU.
    <EffectComposer multisampling={4} frameBufferType={THREE.UnsignedByteType}>
      <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.5} luminanceSmoothing={0.3} radius={0.72} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
