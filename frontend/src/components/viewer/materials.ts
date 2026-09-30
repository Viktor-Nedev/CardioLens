import * as THREE from "three";

export interface HeartUniforms {
  uTerritoryColor: { value: THREE.Color[] };
  uTerritoryMix: { value: number };
  uSelected: { value: THREE.Vector3 };
  uPulse: { value: number };
}

/**
 * Myocardium material. The GLB stores, per vertex, how close the surface is to
 * the LAD / LCX / RCA (attribute `territory`). The fragment shader tints each
 * region with the risk colour of its supplying artery and pulses the territory
 * of the selected vessel. This is a schematic perfusion map, not a lesion map.
 */
export function createHeartMaterial(): { material: THREE.MeshStandardMaterial; uniforms: HeartUniforms } {
  const uniforms: HeartUniforms = {
    uTerritoryColor: { value: [new THREE.Color("#888"), new THREE.Color("#888"), new THREE.Color("#888")] },
    uTerritoryMix: { value: 1 },
    uSelected: { value: new THREE.Vector3(0, 0, 0) },
    uPulse: { value: 0 },
  };
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#8d7279"),
    roughness: 0.62,
    metalness: 0.02,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute vec4 territory;\nvarying vec3 vTerritory;",
      )
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvTerritory = territory.rgb;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform vec3 uTerritoryColor[3];
uniform float uTerritoryMix;
uniform vec3 uSelected;
uniform float uPulse;
varying vec3 vTerritory;`,
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
}`,
      );
  };
  material.customProgramCacheKey = () => "cardiolens-myocardium";
  return { material, uniforms };
}

/** Fresnel rim shader for the translucent torso surface. */
export function createHologramMaterial(color = "#5cc8f5", opacity = 0.2): THREE.ShaderMaterial {
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
