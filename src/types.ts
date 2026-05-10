export interface Vector2 { x: number; y: number; }
export function v2(x: number, y: number): Vector2 { return { x, y }; }
export function vAdd(a: Vector2, b: Vector2): Vector2 { return { x: a.x + b.x, y: a.y + b.y }; }
export function vSub(a: Vector2, b: Vector2): Vector2 { return { x: a.x - b.x, y: a.y - b.y }; }
export function vMul(a: Vector2, s: number): Vector2 { return { x: a.x * s, y: a.y * s }; }
export function vLenSq(a: Vector2): number { return a.x * a.x + a.y * a.y; }
export function vLen(a: Vector2): number { return Math.sqrt(vLenSq(a)); }
export function vNorm(a: Vector2): Vector2 { const l = vLen(a); return l > 0 ? vMul(a, 1/l) : v2(0, 0); }
export function vDist(a: Vector2, b: Vector2): number { return vLen(vSub(a, b)); }

export type Team = 'BLUE' | 'RED';
export type PlayerState = 'IDLE' | 'RUN' | 'SHOOT' | 'TACKLE' | 'SLIDE';
export type MatchState = 'TITLE' | 'KICKOFF' | 'PLAY' | 'GOAL' | 'END';
export type Role = 'BALL_CARRIER' | 'LANE_RUNNER_1' | 'LANE_RUNNER_2' | 'PRESSURER' | 'MARKER' | 'SWEEPER';

export interface Player {
  id: number;
  team: Team;
  pos: Vector2;
  vel: Vector2;
  facing: Vector2;
  stamina: number;
  isSprinting: boolean;
  sprintCooldown: boolean;
  state: PlayerState;
  stateTimer: number;
  role: Role;
  roleAnchor: Vector2;
  isHuman: boolean;
  animTimer: number;
  spriteName: 'idle' | 'up' | 'down' | 'right' | 'left' | 'shoot' | 'slide';
  lastTouchTime: number;
  touchWindowTimer: number;
  slideCooldown: number;
  slideTimer: number;
  slideDir: Vector2;
}

export interface Ball {
  pos: Vector2;
  vel: Vector2;
  z: number;
  lastTouchedBy: number | null;
  lastTouchTeam: Team | null;
  trail: { x: number; y: number; alpha: number }[];
}

export interface InputCommand {
  moveDir: Vector2;
  sprint: boolean;
  pass: boolean;
  shoot: boolean;
  switchPlayer: boolean;
  pause: boolean;
  slide: boolean;
}

export interface GameState {
  matchState: MatchState;
  timeRemaining: number;
  score: { blue: number; red: number };
  players: Player[];
  ball: Ball;
  humanPlayerId: number | null;
  kickoffTimer: number;
  goalFreezeTimer: number;
  cameraShake: number;
  netFlutter: { blue: number; red: number };
  difficulty: number;
  seed: number;
  switchCooldown: number;
  fx: { type: 'CONFETTI' | 'TEXT', pos: Vector2, vel: Vector2, color?: string, text?: string, timer: number }[];
  isPaused: boolean;
}
