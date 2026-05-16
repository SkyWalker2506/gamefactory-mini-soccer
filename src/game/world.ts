import { updatePhysics } from "./physics";
import { updateAI } from "./ai";
import { updateMatch } from "./match";
import { getInputCommand } from "./input";
import { GameState, v2 } from "../types";

export let state: GameState;

// Field/goal geometry (mirrors physics.ts/match.ts constants — keep in sync)
export const FIELD_LEFT = 60, FIELD_RIGHT = 1220, FIELD_TOP = 60, FIELD_BOTTOM = 660;
export const GOAL_TOP_Y = 270, GOAL_BOTTOM_Y = 450;
export const GOAL_CENTER_Y = (GOAL_TOP_Y + GOAL_BOTTOM_Y) / 2;

// Difficulty presets — one aiSkill float (0..1) per GAME.md §7.4
// Tuned so Normal feels "I lose if I'm sloppy, win if I read the field" (not deathball).
export const DIFFICULTY_PRESETS = {
  easy:   0.35,
  normal: 0.55,
  hard:   0.85,
} as const;

// Seeded PRNG
let seed = Date.now();
export function setSeed(s: number) { seed = s; }
export function mulberry32() {
  let t = seed += 0x6D2B79F5;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

export function initWorld(initialSeed: number) {
  setSeed(initialSeed);
  state = {
    matchState: 'TITLE',
    timeRemaining: 180,
    score: { blue: 0, red: 0 },
    players: [],
    ball: {
      pos: v2(640, 360),
      vel: v2(0, 0),
      z: 1,
      lastTouchedBy: null,
      lastTouchTeam: null,
      trail: []
    },
    humanPlayerId: null,
    kickoffTimer: 0,
    goalFreezeTimer: 0,
    cameraShake: 0,
    netFlutter: { blue: 0, red: 0 },
    difficulty: DIFFICULTY_PRESETS.normal,
    seed: initialSeed,
    switchCooldown: 0,
    fx: [],
    isPaused: false
  };

  // Setup players — initial roster only. resetPositionsForKickoff() in match.ts
  // is the single source of truth for kickoff positioning; called by titleScreen/post-goal.
  // BLUE defends LEFT goal, attacks RIGHT. RED defends RIGHT goal, attacks LEFT.
  // id 0 = BLUE GK, ids 1-2 = BLUE outfield. id 3 = RED GK, ids 4-5 = RED outfield.
  // Human controls id 1 (a BLUE outfielder) so they're not stuck in goal.
  for (let i = 0; i < 3; i++) {
    state.players.push({
      id: i, team: 'BLUE', pos: v2(0, 0), vel: v2(0, 0), facing: v2(1, 0),
      stamina: 100, isSprinting: false, sprintCooldown: false, state: 'IDLE', stateTimer: 0,
      role: i === 0 ? 'GOALKEEPER' : (i === 1 ? 'BALL_CARRIER' : 'LANE_RUNNER_1'),
      roleAnchor: v2(0,0), isHuman: i === 1, animTimer: 0, spriteName: 'idle',
      lastTouchTime: 0, touchWindowTimer: 0, slideCooldown: 0, slideTimer: 0, slideDir: v2(0, 0)
    });
  }
  for (let i = 0; i < 3; i++) {
    state.players.push({
      id: 3+i, team: 'RED', pos: v2(0, 0), vel: v2(0, 0), facing: v2(-1, 0),
      stamina: 100, isSprinting: false, sprintCooldown: false, state: 'IDLE', stateTimer: 0,
      role: i === 0 ? 'GOALKEEPER' : 'PRESSURER',
      roleAnchor: v2(0,0), isHuman: false, animTimer: 0, spriteName: 'idle',
      lastTouchTime: 0, touchWindowTimer: 0, slideCooldown: 0, slideTimer: 0, slideDir: v2(0, 0)
    });
  }
  state.humanPlayerId = 1;
}

const TICK_RATE = 60;
export const TICK_DT = 1 / TICK_RATE;
let accumulator = 0;
let lastTime = 0;

export function startGameLoop(onRender: () => void) {
  lastTime = performance.now();
  requestAnimationFrame((time) => loop(time, onRender));
}

function loop(time: number, onRender: () => void) {
  const frameTime = (time - lastTime) / 1000;
  lastTime = time;

  accumulator += frameTime;

  let catchUpFrames = 0;
  while (accumulator >= TICK_DT) {
    if (catchUpFrames < 4) {
      step(TICK_DT);
    }
    accumulator -= TICK_DT;
    catchUpFrames++;
  }

  onRender();
  requestAnimationFrame((t) => loop(t, onRender));
}

function step(dt: number) {
  if (state.isPaused || state.matchState === 'TITLE' || state.matchState === 'END') return;
  
  const input = getInputCommand();
  
  if (input.pause) {
    state.isPaused = true;
    const pauseEvent = new CustomEvent("toggle-pause");
    window.dispatchEvent(pauseEvent);
    return;
  }

  updateMatch(dt);
  
  if (state.matchState === 'PLAY') {
    updateAI(dt);
    updatePhysics(dt, input);
  } else if (state.matchState === 'KICKOFF' || state.matchState === 'GOAL') {
    // Players can stand still but animate
    updatePhysics(dt, { moveDir: v2(0,0), sprint: false, pass: false, shoot: false, switchPlayer: false, pause: false, slide: false });
  }
}
