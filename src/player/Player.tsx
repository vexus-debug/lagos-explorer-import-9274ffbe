/**
 * First-person on-foot controller using Rapier's kinematic character controller.
 * Vehicles (future) should take over input via src/vehicles without touching this file:
 * when `active` is false the player stops reading input.
 */
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { CapsuleCollider, RigidBody, useRapier, type RapierCollider, type RapierRigidBody } from "@react-three/rapier";
import { footstep } from "../audio/audio";
import { useGame } from "../store/game";
import { nearestRoad, surfaceAt } from "../world/query";
import { worldState } from "../world/worldState";
import { input } from "./input";

const WALK = 3.4, SPRINT = 6.8, CROUCH = 1.6, ACCEL = 10, GRAVITY = 22, JUMP = 6.8;
const EYE = 1.7, CROUCH_EYE = 1.1, HALF = 0.55, RADIUS = 0.35, CENTER = HALF + RADIUS;

export function Player({ active = true }: { active?: boolean }) {
  const body = useRef<RapierRigidBody>(null);
  const col = useRef<RapierCollider>(null);
  const { world } = useRapier();
  const camera = useThree((s) => s.camera);
  const st = useRef({
    vx: 0, vz: 0, vy: 0, yaw: worldState.playerYaw, pitch: 0, eye: EYE, bob: 0, phase: 0,
    step: 0, safe: [...worldState.spawn] as number[], safeT: 0, pubT: 0, nameT: 0, grounded: false,
  });

  const ctrlRef = useRef<ReturnType<typeof world.createCharacterController> | null>(null);
  useEffect(() => {
    const c = world.createCharacterController(0.03);
    c.enableAutostep(0.45, 0.2, true);
    c.enableSnapToGround(0.4);
    c.setSlideEnabled(true);
    c.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    c.setMinSlopeSlideAngle((60 * Math.PI) / 180);
    ctrlRef.current = c;
    return () => {
      if (ctrlRef.current === c) ctrlRef.current = null;
      world.removeCharacterController(c);
    };
  }, [world]);

  useFrame((_, raw) => {
    const b = body.current, c = col.current, ctrl = ctrlRef.current;
    if (!b || !c || !ctrl) return;
    const dt = Math.min(raw, 0.05);
    const s = st.current;
    const game = useGame.getState();
    const playing = active && !game.paused && game.phase === "playing";

    // Look
    const sens = game.settings.sensitivity * 0.0022;
    if (playing) {
      s.yaw -= input.lookX * sens;
      s.pitch = Math.max(-1.45, Math.min(1.45, s.pitch - input.lookY * sens));
    }
    input.lookX = 0;
    input.lookY = 0;

    // Move (camera-relative)
    const k = input.keys;
    let f = 0, r = 0;
    if (playing) {
      f = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0) - input.joyY;
      r = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0) + input.joyX;
    }
    const len = Math.hypot(f, r);
    if (len > 1) { f /= len; r /= len; }
    const crouch = playing && (k.has("ControlLeft") || k.has("ControlRight") || k.has("KeyC") || input.crouch);
    const sprint = playing && !crouch && (k.has("ShiftLeft") || k.has("ShiftRight") || input.sprint);
    const speed = crouch ? CROUCH : sprint ? SPRINT : WALK;
    const sin = Math.sin(s.yaw), cos = Math.cos(s.yaw);
    const wx = (-sin * f + cos * r) * speed, wz = (-cos * f - sin * r) * speed;
    const a = 1 - Math.exp(-ACCEL * dt);
    s.vx += (wx - s.vx) * a;
    s.vz += (wz - s.vz) * a;

    s.vy -= GRAVITY * dt;
    if (playing && input.jump && s.grounded && !crouch) s.vy = JUMP;
    input.jump = false;

    const p = b.translation();
    const footY = p.y - CENTER;
    const desired = { x: s.vx * dt, y: s.vy * dt, z: s.vz * dt };
    // Lagoon: block walking off the island unless elevated (bridge deck)
    const land = worldState.land;
    if (land && footY < 0.3 && !land.isLand(p.x + desired.x * 4, p.z + desired.z * 4)) {
      if (!land.isLand(p.x + desired.x * 4, p.z)) { desired.x = 0; s.vx = 0; }
      if (!land.isLand(p.x, p.z + desired.z * 4)) { desired.z = 0; s.vz = 0; }
    }
    ctrl.computeColliderMovement(c, desired);
    const m = ctrl.computedMovement();
    s.grounded = ctrl.computedGrounded();
    if (s.grounded && s.vy < 0) s.vy = 0;
    if (!s.grounded && m.y > desired.y + 0.001 && s.vy > 0 && Math.abs(m.y) < 1e-4) s.vy = 0; // bonk head
    const nx = p.x + m.x, ny = p.y + m.y, nz = p.z + m.z;
    b.setNextKinematicTranslation({ x: nx, y: ny, z: nz });

    // Respawn
    if (ny < -10) {
      b.setNextKinematicTranslation({ x: s.safe[0], y: s.safe[1] + 1, z: s.safe[2] });
      s.vx = s.vz = s.vy = 0;
    }
    s.safeT += dt;
    if (s.safeT > 0.5 && s.grounded) {
      s.safeT = 0;
      if (!land || land.isLand(nx, nz) || footY > 0.3) s.safe = [nx, ny, nz];
    }

    // Camera + head bob
    const moved = Math.hypot(m.x, m.z);
    const hSpeed = moved / dt;
    s.eye += ((crouch ? CROUCH_EYE : EYE) - s.eye) * (1 - Math.exp(-12 * dt));
    if (s.grounded && hSpeed > 0.5) s.phase += dt * hSpeed * 2.1;
    const bobAmt = game.settings.headBob && s.grounded ? Math.min(1, hSpeed / WALK) : 0;
    s.bob += (Math.sin(s.phase) * 0.045 * bobAmt - s.bob) * (1 - Math.exp(-15 * dt));
    camera.position.set(nx + Math.cos(s.phase * 0.5) * 0.02 * bobAmt, ny - CENTER + s.eye + s.bob, nz);
    camera.rotation.set(s.pitch, s.yaw, 0, "YXZ");

    // Footsteps
    if (s.grounded && hSpeed > 0.5) {
      s.step += moved;
      const stride = sprint ? 1.6 : crouch ? 0.9 : 1.25;
      if (s.step > stride) {
        s.step = 0;
        footstep(surfaceAt(nx, nz, ny - CENTER), crouch ? 0.4 : sprint ? 1.2 : 0.8);
      }
    }

    worldState.playerPos.x = nx;
    worldState.playerPos.y = ny;
    worldState.playerPos.z = nz;
    worldState.playerYaw = s.yaw;

    s.pubT += dt;
    if (s.pubT > 0.1) {
      s.pubT = 0;
      game.setPlayer({ position: [nx, ny, nz], rotation: { yaw: s.yaw, pitch: s.pitch }, velocity: [s.vx, s.vy, s.vz] });
    }
    s.nameT += dt;
    if (s.nameT > 0.6) {
      s.nameT = 0;
      const n = nearestRoad(nx, nz, 35, true);
      const name = n?.road.name ?? "Lagos Island";
      if (name !== game.streetName) game.set({ streetName: name });
    }
  });

  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={worldState.spawn} enabledRotations={[false, false, false]}>
      <CapsuleCollider ref={col} args={[HALF, RADIUS]} />
    </RigidBody>
  );
}
