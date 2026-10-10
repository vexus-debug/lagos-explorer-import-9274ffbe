/** Day/night cycle: sky, fog, sun, window glow and warm streetlights. */
import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { qualityConfig, useGame } from "../store/game";
import { lampHeadMaterial } from "./materials";
import { worldState } from "./worldState";

const NIGHT = new THREE.Color("#0c1424"), DAY = new THREE.Color("#a9c6d6"), DUSK = new THREE.Color("#e39a66");
const sky = new THREE.Color();

export function Atmosphere() {
  const scene = useThree((s) => s.scene);
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const lights = useRef<(THREE.PointLight | null)[]>([]);
  const acc = useRef(0);
  const lampT = useRef(1);

  useFrame((_, dt) => {
    const g = useGame.getState();
    acc.current += dt;
    if (acc.current > 0.5) {
      if (g.autoTime && g.phase === "playing" && !g.paused) g.set({ hour: (g.hour + (acc.current * 24) / 720) % 24 });
      acc.current = 0;
    }
    const elev = Math.sin(((g.hour - 6) / 12) * Math.PI);
    const day = THREE.MathUtils.clamp((elev + 0.1) / 0.4, 0, 1);
    const dusk = Math.max(0, 1 - Math.abs(elev) / 0.3);
    const night = 1 - THREE.MathUtils.smoothstep(elev, -0.12, 0.12);
    worldState.night.value = night;
    sky.copy(NIGHT).lerp(DAY, day).lerp(DUSK, dusk * 0.55);
    scene.background = sky.clone();
    const far = qualityConfig(g.settings.quality).fogFar;
    if (!scene.fog) scene.fog = new THREE.Fog(sky, 40, far);
    (scene.fog as THREE.Fog).color.copy(sky);
    (scene.fog as THREE.Fog).far = far;
    const p = worldState.playerPos;
    if (sun.current) {
      const ang = ((g.hour - 6) / 12) * Math.PI;
      sun.current.position.set(p.x + Math.cos(ang) * 80, Math.max(5, Math.sin(ang) * 120), p.z + 30);
      sun.current.target.position.set(p.x, 0, p.z);
      sun.current.target.updateMatrixWorld();
      sun.current.intensity = 1.7 * day;
      sun.current.color.set(dusk > 0.3 ? "#ffc58f" : "#fff4e0");
    }
    if (hemi.current) hemi.current.intensity = 0.45 + 0.75 * day;
    lampHeadMaterial.emissiveIntensity = night * 2.5;

    lampT.current += dt;
    if (lampT.current > 0.5) {
      lampT.current = 0;
      const cand: [number, number, number, number][] = [];
      for (const t of worldState.loaded.values())
        for (let i = 0; i < t.lamps.length; i += 3) {
          const d = Math.hypot(t.lamps[i] - p.x, t.lamps[i + 2] - p.z);
          if (d < 60) cand.push([d, t.lamps[i], t.lamps[i + 1], t.lamps[i + 2]]);
        }
      cand.sort((a, b) => a[0] - b[0]);
      lights.current.forEach((l, i) => {
        if (!l) return;
        const c = cand[i];
        l.visible = !!c && night > 0.05;
        if (c) l.position.set(c[1], c[2] - 0.3, c[3]);
        l.intensity = night * 25;
      });
    }
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={["#cfe3ff", "#6b5a45", 1]} />
      <directionalLight ref={sun} intensity={1.5} />
      {Array.from({ length: 6 }).map((_, i) => (
        <pointLight key={i} ref={(l) => { lights.current[i] = l; }} color="#ffb866" distance={22} decay={1.5} />
      ))}
    </>
  );
}
