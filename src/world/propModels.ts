/** Low-poly prop geometries (merged primitives with vertex colours). Local +x = along the road. */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { PropType } from "./buildTile";

function part(g: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0, rx = 0, rz = 0) {
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  const ng = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color);
  const n = ng.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  ng.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  ng.deleteAttribute("uv");
  return ng;
}
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (r: number, h: number, s = 8) => new THREE.CylinderGeometry(r, r, h, s);
const merge = (...g: THREE.BufferGeometry[]) => mergeGeometries(g)!;

function wheels(len: number, wid: number) {
  const out: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(part(cyl(0.33, 0.22, 8), "#1a1a1a", sx * len * 0.32, 0.33, sz * wid * 0.5, Math.PI / 2));
  return out;
}

let cache: Record<string, THREE.BufferGeometry> | null = null;
export function propGeometries(): Record<PropType | "lampHead", THREE.BufferGeometry> {
  if (cache) return cache as Record<PropType | "lampHead", THREE.BufferGeometry>;
  cache = {
    lamp: merge(part(cyl(0.08, 6, 6), "#6b6e70", 0, 3, 0), part(box(0.08, 0.08, 1.4), "#6b6e70", 0, 6, 0.65), part(cyl(0.18, 0.3, 6), "#55585a", 0, 0.15, 0)),
    lampHead: part(box(0.32, 0.12, 0.6), "#ffffff", 0, 5.92, 1.2),
    tree: merge(
      part(cyl(0.16, 2.6, 6), "#6b4a2f", 0, 1.3, 0),
      part(new THREE.IcosahedronGeometry(1.7, 0), "#3f7a3a", 0, 3.6, 0),
      part(new THREE.IcosahedronGeometry(1.1, 0), "#4f8d40", 0.6, 4.6, 0.3),
    ),
    kiosk: merge(part(box(2.2, 2.2, 1.6), "#f2f2f2", 0, 1.1, 0), part(box(2.6, 0.12, 2.1), "#7c7c7c", 0, 2.28, 0.15), part(box(1.6, 0.9, 0.05), "#2b2b2b", 0, 1.35, 0.81)),
    stall: merge(
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => part(box(0.07, 2.1, 0.07), "#6b5a45", sx * 1.1, 1.05, sz * 0.8))),
      part(box(2.3, 0.08, 1.7), "#8b6a45", 0, 0.85, 0),
      part(box(2.6, 0.06, 2.0), "#ffffff", 0, 2.12, 0, 0.12),
      part(box(0.4, 0.3, 0.4), "#c9542e", -0.6, 1.04, 0.1),
      part(box(0.5, 0.25, 0.4), "#e3b23c", 0.3, 1.02, -0.2),
      part(box(0.35, 0.35, 0.35), "#4f8d40", 0.8, 1.06, 0.25),
    ),
    car: merge(
      part(box(4.2, 0.75, 1.8), "#ffffff", 0, 0.68, 0),
      part(box(2.2, 0.6, 1.6), "#e8e8e8", -0.2, 1.35, 0),
      part(box(2.25, 0.4, 1.62), "#3a4148", -0.2, 1.38, 0),
      ...wheels(4.2, 1.8),
    ),
    danfo: merge(
      part(box(5, 1.8, 2), "#f2c21b", 0, 1.25, 0),
      part(box(5.02, 0.12, 2.02), "#151515", 0, 1.0, 0),
      part(box(5.02, 0.12, 2.02), "#151515", 0, 1.45, 0),
      part(box(3.8, 0.5, 2.03), "#2a3138", -0.3, 1.82, 0),
      part(box(0.05, 0.6, 1.7), "#2a3138", 2.51, 1.75, 0),
      part(box(5, 0.08, 2), "#d6a816", 0, 2.19, 0),
      ...wheels(5, 2),
    ),
    trash: merge(
      part(new THREE.DodecahedronGeometry(0.7, 0), "#4d4a42", 0, 0.25, 0),
      part(new THREE.DodecahedronGeometry(0.4, 0), "#2f5fa3", 0.5, 0.25, 0.3),
      part(new THREE.DodecahedronGeometry(0.35, 0), "#d9d2c0", -0.4, 0.2, -0.3),
    ),
    billboard: merge(
      part(cyl(0.12, 6.5, 6), "#5d6062", -1.8, 3.25, 0),
      part(cyl(0.12, 6.5, 6), "#5d6062", 1.8, 3.25, 0),
      part(box(6.2, 3.2, 0.25), "#ffffff", 0, 7.6, 0),
      part(box(6.4, 0.15, 0.4), "#3a3a3a", 0, 5.95, 0),
    ),
    tank: merge(part(cyl(0.7, 1.4, 10), "#ffffff", 0, 0.75, 0), part(box(1.6, 0.1, 1.6), "#555555", 0, 0.05, 0)),
  };
  for (const g of Object.values(cache)) g.computeBoundingSphere();
  return cache as Record<PropType | "lampHead", THREE.BufferGeometry>;
}
