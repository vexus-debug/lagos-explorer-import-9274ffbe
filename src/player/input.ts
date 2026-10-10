/** Shared input state written by keyboard/mouse/touch handlers, read by the player each frame. */
export const input = {
  keys: new Set<string>(),
  lookX: 0,
  lookY: 0,
  joyX: 0,
  joyY: 0,
  jump: false,
  sprint: false,
  crouch: false,
  mobile: false,
};

export function attachDesktopInput() {
  const down = (e: KeyboardEvent) => {
    if (["Space", "Tab", "F3", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault();
    if (e.ctrlKey && e.code === "KeyW") e.preventDefault();
    input.keys.add(e.code);
    if (e.code === "Space") input.jump = true;
  };
  const up = (e: KeyboardEvent) => input.keys.delete(e.code);
  const move = (e: MouseEvent) => {
    if (!document.pointerLockElement) return;
    input.lookX += e.movementX;
    input.lookY += e.movementY;
  };
  const blur = () => input.keys.clear();
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  window.addEventListener("mousemove", move);
  window.addEventListener("blur", blur);
  return () => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
    window.removeEventListener("mousemove", move);
    window.removeEventListener("blur", blur);
  };
}
