/** Island land mass, quay edges, lagoon water and the ground collider. */
import { useMemo } from "react";
import * as THREE from "three";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { bboxMeters } from "../map/config";
import { signedArea } from "../map/geom";
import { worldState } from "./worldState";

const toV2 = (pts: number[]) => {
  const out: THREE.Vector2[] = [];
  for (let i = 0; i < pts.length; i += 2) out.push(new THREE.Vector2(pts[i], pts[i + 1]));
  return out;
};

export function Ground() {
  const { land, quay } = useMemo(() => {
    const pos: number[] = [];
    const q: number[] = [];
    for (const a of worldState.data?.land ?? []) {
      const outer = toV2(a.pts);
      const holes = (a.holes ?? []).map(toV2);
      try {
        const all = [...outer, ...holes.flat()];
        for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(outer, holes))
          for (const v of [all[i], all[k], all[j]]) pos.push(v.x, 0, v.y);
      } catch { /* ignore */ }
      // Quay wall dropping into the water
      for (const ring of [a.pts, ...(a.holes ?? [])]) {
        const n = ring.length / 2;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          const ax = ring[i * 2], az = ring[i * 2 + 1], bx = ring[j * 2], bz = ring[j * 2 + 1];
          q.push(ax, 0, az, bx, 0, bz, bx, -1.4, bz, ax, 0, az, bx, -1.4, bz, ax, -1.4, az);
        }
      }
      void signedArea;
    }
    // Solid ground from the land mask (covers streets where OSM land polygons are missing).
    const m = worldState.land;
    if (m) {
      const y = 0.005;
      for (let r = 0; r < m.h; r++) {
        let c = 0;
        while (c < m.w) {
          if (m.data[r * m.w + c] !== 1) { c++; continue; }
          const s = c;
          while (c < m.w && m.data[r * m.w + c] === 1) c++;
          const x0 = m.minX + s * m.cell, x1 = m.minX + c * m.cell;
          const z0 = m.minZ + r * m.cell, z1 = z0 + m.cell;
          pos.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0);
        }
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    lg.computeVertexNormals();
    const qg = new THREE.BufferGeometry();
    qg.setAttribute("position", new THREE.Float32BufferAttribute(q, 3));
    qg.computeVertexNormals();
    return { land: lg, quay: qg };
  }, []);

  const bb = bboxMeters();
  const cx = (bb.minX + bb.maxX) / 2, cz = (bb.minZ + bb.maxZ) / 2;
  const hx = (bb.maxX - bb.minX) / 2 + 200, hz = (bb.maxZ - bb.minZ) / 2 + 200;

  return (
    <>
      <mesh geometry={land} receiveShadow>
        <meshLambertMaterial color="#8d8474" side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={quay}>
        <meshLambertMaterial color="#7d7a72" side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[cx, -0.7, cz]}>
        <planeGeometry args={[30000, 30000]} />
        <meshLambertMaterial color="#2f6a80" emissive="#0b2733" emissiveIntensity={0.5} />
      </mesh>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[hx, 0.5, hz]} position={[cx, -0.5, cz]} />
      </RigidBody>
    </>
  );
}
