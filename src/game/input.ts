import { InputCommand, Vector2, v2, vLenSq, vNorm } from "../types";

const activeKeys = new Set<string>();
const singleFrameKeys = new Set<string>();

window.addEventListener("keydown", (e) => {
  if (["Space", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyC"].includes(e.code)) {
    e.preventDefault();
  }
  activeKeys.add(e.code);
  if (!e.repeat) {
    singleFrameKeys.add(e.code);
  }
});

window.addEventListener("keyup", (e) => {
  activeKeys.delete(e.code);
});

// Touch state
let touchMoveDir = v2(0, 0);
let touchSprint = false;
let touchPass = false;
let touchShoot = false;
let touchPassFrame = false;
let touchShootFrame = false;

export function getInputCommand(): InputCommand {
  let moveDir = v2(0, 0);
  if (activeKeys.has("KeyW") || activeKeys.has("ArrowUp")) moveDir.y -= 1;
  if (activeKeys.has("KeyS") || activeKeys.has("ArrowDown")) moveDir.y += 1;
  if (activeKeys.has("KeyA") || activeKeys.has("ArrowLeft")) moveDir.x -= 1;
  if (activeKeys.has("KeyD") || activeKeys.has("ArrowRight")) moveDir.x += 1;

  if (vLenSq(moveDir) > 0) {
    moveDir = vNorm(moveDir);
  } else if (vLenSq(touchMoveDir) > 0) {
    moveDir = touchMoveDir;
  }

  const sprint = activeKeys.has("ShiftLeft") || activeKeys.has("ShiftRight") || touchSprint;
  const pass = singleFrameKeys.has("Space") || singleFrameKeys.has("KeyJ") || touchPassFrame;
  const shoot = singleFrameKeys.has("KeyX") || singleFrameKeys.has("KeyK") || touchShootFrame;
  const switchPlayer = singleFrameKeys.has("KeyQ") || singleFrameKeys.has("Tab");
  const pause = singleFrameKeys.has("Escape") || singleFrameKeys.has("KeyP");
  const slide = singleFrameKeys.has("KeyC") || singleFrameKeys.has("KeyL");

  singleFrameKeys.clear();
  touchPassFrame = false;
  touchShootFrame = false;

  return { moveDir, sprint, pass, shoot, switchPlayer, pause, slide };
}

export function setTouchInput(dir: Vector2, sprint: boolean) {
  touchMoveDir = dir;
  touchSprint = sprint;
}

export function setTouchButtons(pass: boolean, shoot: boolean) {
  if (pass && !touchPass) touchPassFrame = true;
  if (shoot && !touchShoot) touchShootFrame = true;
  touchPass = pass;
  touchShoot = shoot;
}
