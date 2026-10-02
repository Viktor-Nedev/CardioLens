import * as THREE from "three";

export interface HeartUniforms {
  uTerritoryColor: { value: THREE.Color[] };
  uTerritoryMix: { value: number };
  uSelected: { value: THREE.Vector3 };
  uPulse: { value: number };
  uScanY: { value: number };
  uScanStrength: { value: number };
  uScanColor: { value: THREE.Color };
}

/**
 * Myocardium material. The GLB stores, per vertex, how close the surface is to
 * the LAD / LCX / RCA (attribute `territory`). The fragment shader tints each
 * region with the risk colour of its supplying artery, pulses the territory of
 * the selected vessel, and draws a horizontal scan band when a new prediction
 * arrives. The territory map is schematic, not a lesion map.
 */
export function createHeartMaterial(): { material: THREE.MeshStandardMaterial; uniforms: HeartUniforms } {
  const uniforms: HeartUniforms = {
    uTerritoryColor: { value: [new THREE.Color("#888"), new THREE.Color("#888"), new THREE.Color("#888")] },
    uTerritoryMix: { value: 1 },
    uSelected: { value: new THREE.Vector3(0, 0, 0) },
    uPulse: { value: 0 },
    uScanY: { value: 10 },
    uScanStrength: { value: 0 },
    uScanColor: { value: new THREE.Color("#5cc8f5") },
  };
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#8d7279"),
    roughness: 0.58,
    metalness: 0.04,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute vec4 territory;\nvarying vec3 vTerritory;\nvarying float vWorldY;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvTerritory = territory.rgb;\nvWorldY = (modelMatrix * vec4(transformed, 1.0)).y;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform vec3 uTerritoryColor[3];
uniform float uTerritoryMix;
uniform vec3 uSelected;
uniform float uPulse;
uniform float uScanY;
uniform float uScanStrength;
uniform vec3 uScanColor;
varying vec3 vTerritory;
varying float vWorldY;`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
{
  vec3 w = vTerritory;
  float wsum = w.x + w.y + w.z;
  float strength = clamp(max(max(w.x, w.y), w.z) * 1.2, 0.0, 1.0) * uTerritoryMix;
  if (wsum > 0.0001) {
    vec3 tint = (w.x * uTerritoryColor[0] + w.y * uTerritoryColor[1] + w.z * uTerritoryColor[2]) / wsum;
    diffuseColor.rgb = mix(diffuseColor.rgb, tint, strength * 0.72);
  }
}`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
{
  float sel = dot(vTerritory, uSelected);
  vec3 selTint = uSelected.x * uTerritoryColor[0] + uSelected.y * uTerritoryColor[1] + uSelected.z * uTerritoryColor[2];
  totalEmissiveRadiance += selTint * sel * uPulse * uTerritoryMix;
  // Scan band: bright leading edge with a soft trail above it.
  // (squares written out: pow() with a negative base is undefined in GLSL)
  float d = vWorldY - uScanY;
  float e = d / 0.032;
  float tr = max(d, 0.0) / 0.18;
  float band = exp(-e * e) + 0.2 * exp(-tr * tr) * step(0.0, d);
  totalEmissiveRadiance += uScanColor * band * uScanStrength * 1.1;
}`,
      );
  };
  material.customProgramCacheKey = () => "cardiolens-myocardium-v3";
  return { material, uniforms };
}

export interface VesselUniforms {
  uTime: { value: number };
  uBeat: { value: number };
  uFlow: { value: number };
}

/**
 * Coronary artery material. `aFlow` holds each vertex's distance from the vessel's
 * origin, so emissive pulses travel from the ostium to the periphery once per
 * heartbeat (a visual cue of blood flow; it does not encode where a lesion is).
 */
export function createVesselMaterial(color: string): { material: THREE.MeshStandardMaterial; uniforms: VesselUniforms } {
  const uniforms: VesselUniforms = {
    uTime: { value: 0 },
    uBeat: { value: 1.2 },
    uFlow: { value: 1 },
  };
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.2,
    roughness: 0.3,
    metalness: 0.1,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aFlow;\nvarying float vFlow;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFlow = aFlow;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float uTime;\nuniform float uBeat;\nuniform float uFlow;\nvarying float vFlow;",
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
{
  float w = fract(vFlow * 4.0 - uTime * uBeat);
  float pulse = smoothstep(0.0, 0.05, w) * (1.0 - smoothstep(0.05, 0.4, w));
  totalEmissiveRadiance += emissive * pulse * 2.2 * uFlow + vec3(0.08) * pulse * uFlow;
}`,
      );
  };
  material.customProgramCacheKey = () => "cardiolens-vessel-v1";
  return { material, uniforms };
}

/** Distance of every vertex from the vessel origin (its highest point, near the aortic root). */
export function addFlowAttribute(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  let top = 0;
  for (let i = 1; i < pos.count; i++) if (pos.getY(i) > pos.getY(top)) top = i;
  const ox = pos.getX(top);
  const oy = pos.getY(top);
  const oz = pos.getZ(top);
  const flow = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    flow[i] = Math.hypot(pos.getX(i) - ox, pos.getY(i) - oy, pos.getZ(i) - oz);
  }
  geometry.setAttribute("aFlow", new THREE.BufferAttribute(flow, 1));
  return geometry;
}

/** Fresnel rim shader for the translucent torso surface. */
export function createHologramMaterial(color = "#5cc8f5", opacity = 0.13): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormalV;
      varying vec3 vViewDir;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormalV = normalize(normalMatrix * normal);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec3 vNormalV;
      varying vec3 vViewDir;
      void main() {
        float f = 1.0 - abs(dot(normalize(vNormalV), normalize(vViewDir)));
        f = pow(f, 3.2);
        gl_FragColor = vec4(uColor * f, f * uOpacity);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

/** Push every vertex along its normal: slightly fattened copies for display and picking. */
export function inflate(geometry: THREE.BufferGeometry, distance: number): THREE.BufferGeometry {
  const g = geometry.clone();
  if (!g.attributes.normal) g.computeVertexNormals();
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(
      i,
      pos.getX(i) + nrm.getX(i) * distance,
      pos.getY(i) + nrm.getY(i) * distance,
      pos.getZ(i) + nrm.getZ(i) * distance,
    );
  }
  pos.needsUpdate = true;
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/** Radial gradient used as the scene background (keeps post-processing opaque and stable). */
export function createBackdropTexture(): THREE.Texture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(size * 0.5, size * 0.42, 0, size * 0.5, size * 0.5, size * 0.72);
    g.addColorStop(0, "#17263c");
    g.addColorStop(0.5, "#0c1320");
    g.addColorStop(1, "#06090f");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
