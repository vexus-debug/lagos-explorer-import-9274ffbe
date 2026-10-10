/**
 * Shared materials. The building material draws procedural window grids,
 * ground-floor shopfronts and doors from a per-vertex "facade" attribute
 * (u = metres along the perimeter, v = metres up). Detail fades out past ~150 m
 * so distant buildings read as simple blocks.
 */
import * as THREE from "three";
import { worldState } from "./worldState";

export const buildingMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
buildingMaterial.onBeforeCompile = (shader) => {
  shader.uniforms.uNight = worldState.night;
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nattribute vec2 facade;\nvarying vec2 vFacade;\nvarying float vDist;")
    .replace("#include <fog_vertex>", "#include <fog_vertex>\nvFacade = facade;\nvDist = length(mvPosition.xyz);");
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      `#include <common>
uniform float uNight; varying vec2 vFacade; varying float vDist;
float fhash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }`,
    )
    .replace(
      "#include <color_fragment>",
      `#include <color_fragment>
float winEmit = 0.0;
if (vFacade.x >= 0.0) {
  float detail = 1.0 - smoothstep(110.0, 170.0, vDist);
  vec2 cell = vec2(vFacade.x / 3.4, vFacade.y / 3.0);
  vec2 f = fract(cell);
  float h = fhash(floor(cell));
  if (cell.y >= 1.0) {
    float win = step(0.22, f.x) * step(f.x, 0.78) * step(0.28, f.y) * step(f.y, 0.82);
    float lit = step(0.55, h);
    vec3 glass = mix(vec3(0.13, 0.16, 0.19), vec3(1.0, 0.78, 0.45), uNight * lit);
    diffuseColor.rgb = mix(diffuseColor.rgb, glass, win * detail);
    // sill line
    diffuseColor.rgb *= 1.0 - 0.18 * step(f.y, 0.06) * detail;
    winEmit = win * detail * uNight * lit;
  } else {
    // ground floor: shop shutters, a door every few bays, dark plinth
    float door = step(0.3, f.x) * step(f.x, 0.7) * step(f.y, 0.78) * step(0.62, h);
    float shutter = step(0.08, f.x) * step(f.x, 0.92) * step(0.05, f.y) * step(f.y, 0.78) * (1.0 - door);
    float stripes = 0.85 + 0.15 * step(0.5, fract(vFacade.y * 6.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.45, 0.47, 0.48) * stripes, shutter * detail * 0.9);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.28, 0.17, 0.1), door * detail);
    diffuseColor.rgb *= 1.0 - 0.35 * step(vFacade.y, 0.25);
    winEmit = shutter * detail * uNight * step(0.7, h) * 0.6;
  }
}`,
    )
    .replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.72, 0.38) * winEmit * 0.9;",
    );
};

export const groundMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
export const propMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
export const lampHeadMaterial = new THREE.MeshLambertMaterial({ color: "#fff1d0", emissive: "#ffb35c", emissiveIntensity: 0 });
