import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RigidBody, TrimeshCollider } from "@react-three/rapier";
import { PROP_STRIDE, PROP_TYPES, type PropType, type TileMesh } from "./buildTile";
import { buildingMaterial, groundMaterial, lampHeadMaterial, propMaterial } from "./materials";
import { propGeometries } from "./propModels";

function geo(attrs: Record<string, [Float32Array, number]>) {
  const g = new THREE.BufferGeometry();
  for (const [k, [a, n]] of Object.entries(attrs)) g.setAttribute(k, new THREE.BufferAttribute(a, n));
  g.computeBoundingSphere();
  return g;
}

export function Tile({ mesh, detailed, shadows }: { mesh: TileMesh; detailed: boolean; shadows: boolean }) {
  const bld = useMemo(
    () => geo({ position: [mesh.bld.position, 3], normal: [mesh.bld.normal, 3], color: [mesh.bld.color, 3], facade: [mesh.bld.facade, 2] }),
    [mesh],
  );
  const ground = useMemo(() => geo({ position: [mesh.ground.position, 3], normal: [mesh.ground.normal, 3], color: [mesh.ground.color, 3] }), [mesh]);
  useEffect(() => () => { bld.dispose(); ground.dispose(); }, [bld, ground]);

  return (
    <group>
      {mesh.bld.position.length > 0 && <mesh geometry={bld} material={buildingMaterial} castShadow={shadows} receiveShadow={shadows} />}
      {mesh.ground.position.length > 0 && <mesh geometry={ground} material={groundMaterial} receiveShadow={shadows} />}
      {mesh.colIdx.length > 0 && (
        <RigidBody type="fixed" colliders={false}>
          <TrimeshCollider args={[mesh.colVerts, mesh.colIdx]} />
        </RigidBody>
      )}
      {detailed && PROP_TYPES.map((t) => <Props key={t} type={t} data={mesh.props[t]} shadows={shadows} />)}
      {detailed && <Props type="lampHead" data={mesh.props.lamp} shadows={false} />}
    </group>
  );
}

const tmp = new THREE.Object3D();
const col = new THREE.Color();
function Props({ type, data, shadows }: { type: PropType | "lampHead"; data: Float32Array; shadows: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = data.length / PROP_STRIDE;
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    for (let i = 0; i < count; i++) {
      const o = i * PROP_STRIDE;
      tmp.position.set(data[o], data[o + 1], data[o + 2]);
      tmp.rotation.set(0, data[o + 3], 0);
      tmp.scale.setScalar(data[o + 4]);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
      m.setColorAt(i, col.setRGB(data[o + 5], data[o + 6], data[o + 7]));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [data, count]);
  if (!count) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[propGeometries()[type], type === "lampHead" ? lampHeadMaterial : propMaterial, count]}
      castShadow={shadows}
      frustumCulled
    />
  );
}
