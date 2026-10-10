/**
 * Renders another player from replicated PlayerState. Unused for now –
 * a future multiplayer layer maps remote states to <RemotePlayer state={...} />.
 */
import type { PlayerState } from "../store/game";

export function RemotePlayer({ state }: { state: PlayerState }) {
  const [x, y, z] = state.position;
  return (
    <group position={[x, y, z]} rotation={[0, state.rotation.yaw, 0]}>
      <mesh position={[0, 0, 0]}>
        <capsuleGeometry args={[0.35, 1.1, 4, 8]} />
        <meshLambertMaterial color="#e3b23c" flatShading />
      </mesh>
    </group>
  );
}
