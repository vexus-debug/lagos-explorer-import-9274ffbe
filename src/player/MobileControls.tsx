/** Touch controls for movement, camera look, and player actions. */
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { input } from "./input";

const STICK = 48;

export function MobileControls() {
  const [stick, setStick] = useState({ x: 0, y: 0, active: false });
  const joy = useRef<{ id: number; cx: number; cy: number } | null>(null);
  const look = useRef<{ id: number; x: number; y: number } | null>(null);
  const [sprint, setSprint] = useState(false);
  const [crouch, setCrouch] = useState(false);

  useEffect(() => {
    input.sprint = sprint;
  }, [sprint]);
  useEffect(() => {
    input.crouch = crouch;
  }, [crouch]);

  const startJoy = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" || joy.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    joy.current = { id: e.pointerId, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
    setStick({ x: 0, y: 0, active: true });
    moveJoy(e);
  };

  const moveJoy = (e: PointerEvent<HTMLDivElement>) => {
    if (joy.current?.id !== e.pointerId) return;
    let dx = e.clientX - joy.current.cx;
    let dy = e.clientY - joy.current.cy;
    const len = Math.hypot(dx, dy);
    if (len > STICK) {
      dx = (dx / len) * STICK;
      dy = (dy / len) * STICK;
    }
    input.joyX = dx / STICK;
    input.joyY = dy / STICK;
    setStick({ x: dx, y: dy, active: true });
  };

  const endJoy = (e: PointerEvent<HTMLDivElement>) => {
    if (joy.current?.id !== e.pointerId) return;
    joy.current = null;
    input.joyX = 0;
    input.joyY = 0;
    setStick({ x: 0, y: 0, active: false });
  };

  const startLook = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" || look.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    look.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };

  const moveLook = (e: PointerEvent<HTMLDivElement>) => {
    if (look.current?.id !== e.pointerId) return;
    input.lookX += (e.clientX - look.current.x) * 2.5;
    input.lookY += (e.clientY - look.current.y) * 2.5;
    look.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };

  const endLook = (e: PointerEvent<HTMLDivElement>) => {
    if (look.current?.id === e.pointerId) look.current = null;
  };

  const btn = "pointer-events-auto flex h-16 w-16 items-center justify-center rounded-full border border-foreground/30 bg-background/60 font-display text-sm text-foreground backdrop-blur active:bg-primary/40";

  return (
    <div className="pointer-events-none fixed inset-0 z-20 select-none">
      <div
        aria-label="Look around"
        className="pointer-events-auto absolute inset-y-0 left-[40%] right-0 touch-none"
        onPointerDown={startLook}
        onPointerMove={moveLook}
        onPointerUp={endLook}
        onPointerCancel={endLook}
        onLostPointerCapture={endLook}
      />
      <div
        aria-label="Move"
        className="pointer-events-auto absolute bottom-8 left-8 grid h-32 w-32 touch-none place-items-center rounded-full border border-foreground/25 bg-background/40 backdrop-blur"
        onPointerDown={startJoy}
        onPointerMove={moveJoy}
        onPointerUp={endJoy}
        onPointerCancel={endJoy}
        onLostPointerCapture={endJoy}
      >
        <div
          className="pointer-events-none h-14 w-14 rounded-full bg-foreground/70"
          style={{ transform: `translate(${stick.x}px, ${stick.y}px)` }}
        />
      </div>
      <div className="pointer-events-none absolute bottom-8 right-6 z-10 flex flex-col items-end gap-3">
        <button
          className={btn}
          onPointerDown={(e) => {
            e.stopPropagation();
            input.jump = true;
          }}
        >
          Jump
        </button>
        <div className="flex gap-3">
          <button
            className={`${btn} ${crouch ? "bg-primary/50" : ""}`}
            onPointerDown={(e) => {
              e.stopPropagation();
              setCrouch((value) => !value);
            }}
          >
            Crouch
          </button>
          <button
            className={`${btn} ${sprint ? "bg-primary/50" : ""}`}
            onPointerDown={(e) => {
              e.stopPropagation();
              setSprint((value) => !value);
            }}
          >
            Sprint
          </button>
        </div>
      </div>
    </div>
  );
}