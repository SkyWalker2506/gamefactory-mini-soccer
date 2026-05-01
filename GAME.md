# Mini Soccer 3v3 — Game Design Document

**Genre:** 2D top-down arcade soccer
**Target session:** 3-minute matches, single-player vs AI
**Stack:** Vite + TypeScript + HTML5 Canvas2D (no engine)
**Implementer:** Gemini 3 Pro (gemini-3-pro-preview)
**Status:** GDD locked — implementation pending user approval

---

## 1. Vision Statement

A pick-up-and-play arcade football game where every match feels fast, decisive, and full of "I made that goal happen" moments. The player controls one striker on a 3-player team while AI handles teammates and the full opposing lineup. No fouls, no offside, no menus between moves — just space, timing, and the sweet click of a well-placed pass into a clean shot.

**Three feelings the player must have, often:**

1. *"I found the gap."* — the AI's lane-creation movement makes this readable.
2. *"I picked the right pass."* — the auto-target is generous but the player still chooses *when*.
3. *"That was going in the second I hit shoot."* — shot trajectory is honest; no RNG.

---

## 2. Match Structure

| Element | Value |
|---|---|
| Teams | Blue (1 human + 2 AI) vs Red (3 AI) |
| Match length | 180 s real-time |
| Pitch view | Top-down, full pitch always visible |
| Goals | Best score wins; ties allowed |
| Stoppage | Only on goal (1.5 s freeze + restart) |

**Match flow:**

1. Kickoff countdown `3 → 2 → 1 → GO!` (3 s, no input)
2. Ball at center. Blue starts the first kickoff.
3. On goal: 1.5 s freeze with `GOAL!` flash, conceding team kicks off.
4. At 0:00, final whistle: `WIN / DRAW / LOSE` panel + "Play Again" / "Main Menu" buttons.

---

## 3. Pitch Geometry

Logical resolution: **1280 × 720** (CSS-scaled to viewport, letterboxed).

```
                        1280
   ┌────────────────────────────────────────────┐
   │                  TOUCHLINE                 │
   │  ┌──────────────────────────────────────┐  │
G  │  │          PLAYABLE FIELD              │  │ G
O  │  │  (margin 60px from each touchline)   │  │ O
A  │  │                                      │  │ A
L  │  │              ●  CENTER               │  │ L
   │  │                                      │  │
   │  └──────────────────────────────────────┘  │
   │                                            │
   └────────────────────────────────────────────┘
                         720
```

Constants:
- `PITCH_W = 1280`, `PITCH_H = 720`
- `MARGIN = 60` (touchline padding)
- `FIELD_LEFT = 60`, `FIELD_RIGHT = 1220`, `FIELD_TOP = 60`, `FIELD_BOTTOM = 660`
- `GOAL_HEIGHT = 180` (centered vertically)
- `GOAL_DEPTH = 30` (visual; the goal line is the inside edge of the touchline)
- `GOAL_TOP_Y = 270`, `GOAL_BOTTOM_Y = 450`
- `CENTER = (640, 360)`

Field background: `assets/field.png` drawn full-bleed (1280×720, scaled from 1448×1086 source).

---

## 4. Entities

### 4.1 Ball

| Property | Value |
|---|---|
| Radius | 8 px |
| Mass | 1.0 |
| Friction | 0.96 per frame at 60 fps (≈ 8% per 0.1 s) |
| Max speed | 600 px/s |
| Sprite | `assets/ball.png` rendered 24×24 |
| Possession magnet | If a player is within 18 px of the ball with relative speed < 60 px/s, ball snaps to their dribble offset. |

### 4.2 Player

| Property | Value |
|---|---|
| Radius | 14 px |
| Base speed | 180 px/s |
| Sprint speed | 250 px/s (max 2.5 s, refills at 1.5×) |
| Acceleration | 900 px/s² (snappy) |
| Turn responsiveness | Linear velocity blend in 80 ms |
| Dribble offset | 18 px in facing direction |
| Tackle reach | 22 px (ball strip when player walks into it from side/behind) |

**Sprite rendering (per facing):**
- `up` → `running-up-nonbg.png`
- `down` → `running-down-nonbg.png`
- `right` → `running-right-nonbg.png`
- `left` → mirror of `right`
- `idle` → `red-player.png` (base pose)
- `shoot` → `shoot-right-nonbg.png` (mirrored for left, rotated 90° for up/down)

**Frame size:** Each source PNG contains a single pose. Display them at 56×56 game-pixel size centered on the player's collider. Animation = swap between `idle` and `running-<dir>` every 120 ms while moving (creates a 2-frame walk cycle without needing a sheet).

**Team tint:** Source sprites are red. Blue team = canvas `globalCompositeOperation: "multiply"` blue overlay drawn from a pre-tinted offscreen canvas built once at boot. Red team = source as-is.

### 4.3 Goal & Net

- Drawn as a 30×180 rectangle just outside the touchline on each side.
- Net flutter on goal: 6 vertical lines that wave for 1.2 s after a shot enters.

---

## 5. Controls

### 5.1 Keyboard (primary)

| Action | Key |
|---|---|
| Move | `WASD` or arrow keys |
| Sprint | `Shift` |
| Pass | `Space` or `J` |
| Shoot | `X` or `K` |
| Switch player (off-ball only) | `Q` or `Tab` |
| Pause | `Escape` |

### 5.2 Touch (mobile)

- Left side: virtual stick (8-direction).
- Right side: two stacked buttons — top = SHOOT, bottom = PASS.
- Sprint = double-tap stick in direction (auto-sprints while held).

### 5.3 Auto-switch

Off-ball control auto-switches to the closest teammate to the ball whenever:
- The ball changes possession to the opposing team, OR
- A pass is initiated and the ball leaves the controlled player.

Manual switch (`Q`/`Tab`) overrides for 2 s before auto-switch resumes.

---

## 6. Core Mechanics

### 6.1 Possession

- Ball follows whoever last touched it within 18 px (snap zone).
- Loose ball: any player within 18 px and moving < 60 px/s relative to ball can claim it.
- Tackle: a non-possessing player walking into a possessor from the side/behind transfers the ball. The defender keeps moving in their input direction; the ball pops 30 px in the carrier's facing direction with 200 px/s velocity.

### 6.2 Pass

- Targets the teammate that maximizes `(open_lane_score) − 0.5 * distance_normalized`.
- `open_lane_score` = 1 − (closest enemy perpendicular distance to the pass line, clamped 0..120 px) ÷ 120.
- Ball speed: 320 px/s.
- Lead pass: target = teammate position + (teammate velocity × 0.4 s).
- Failed pass (no eligible teammate within 200° forward arc) → directional lob 280 px ahead at 280 px/s.

### 6.3 Shot

- Aims at the nearest unblocked point on the opposing goal mouth.
- Goal mouth divided into 5 sample points; shot picks the one with the largest perpendicular gap from any defender.
- Speed: 480 px/s base, scales to 540 px/s if shooter is sprinting on contact.
- Shot accuracy falls with distance from goal: ±2° at 200 px, ±8° at 600 px.
- Slight upward arc visual: ball scales 1.0 → 1.2 → 1.0 over flight (no real Z, just feel).

### 6.4 Stamina (sprint only)

- 100 units, drains at 40/s while sprinting, refills at 25/s while not.
- Sprint disabled at 0; re-enabled at 30.
- Visual: a thin yellow bar under the human player only.

### 6.5 Out of bounds

GDD says no fouls/offside, but ball still leaves the pitch:
- **Side touchlines:** ball wraps to the nearest touchline point and gets a soft 1.0 s "throw-in equivalent" — closest player from the team that *didn't* touch it last walks to the spot, holds 0.5 s, then auto-passes forward.
- **Behind goal line (not in goal):** same rule, defending team takes it from the corner.

This keeps the action flowing without drawing the player into a menu.

---

## 7. AI Design

The opposing team and the player's two teammates use the same brain. Each player has a **role** that biases their behavior; roles re-assign every 0.5 s based on ball position.

### 7.1 Roles per team-state

**When team has the ball (attack):**

| Role | Behavior |
|---|---|
| `BALL_CARRIER` | The player nearest the ball with possession. Dribbles toward goal until pressured, then passes or shoots. |
| `LANE_RUNNER_1` | Moves to a position 200 px ahead of the ball carrier and 120 px above their lateral axis, but always inside the field. |
| `LANE_RUNNER_2` | Mirror of `LANE_RUNNER_1` but 120 px below. |

If the human is `BALL_CARRIER`, the AI teammates take `LANE_RUNNER_1/2`. The roles snap; no overlap.

**When team is defending:**

| Role | Behavior |
|---|---|
| `PRESSURER` | Closest player to the ball. Moves to a point 25 px between ball and own goal, plus a small lateral offset to force the carrier wide. |
| `MARKER` | Marks the most threatening opponent (closest to own goal who isn't the carrier), staying 30 px goalside of them. |
| `SWEEPER` | Holds position 200 px in front of own goal, on the line between ball and goal center. |

### 7.2 Decision tree (per AI tick, 100 ms)

```
if I_HAVE_BALL:
    if shot_score >= 0.65:    -> SHOOT
    elif pass_score >= 0.55:  -> PASS to best target
    elif pressure >= 0.7:     -> PASS or fallback dribble away
    else:                     -> DRIBBLE toward goal
else if MY_TEAM_HAS_BALL:
    move toward role anchor (LANE_RUNNER_1/2)
    if open passing lane to me persists 0.4 s:
        signal "open" — caller's pass_score weights us higher
else:
    move toward role anchor (PRESSURER/MARKER/SWEEPER)
    if within 22 px of ball-carrier from non-front side: TACKLE
```

**Scoring functions:**

- `shot_score` = `(distance_factor × 0.5) + (lane_clear × 0.5)`
  where `distance_factor = clamp01(1 − distance_to_goal / 600)` and `lane_clear = 1 − blocked_fraction`.
- `pass_score` = max over teammates of `(open_lane × 0.6) + (forward_progress × 0.4)`
  where `forward_progress = clamp01((teammate.x − me.x) × team_attack_dir / 400)`.
- `pressure` = number of opponents within 60 px ÷ 2, clamped 0..1.

### 7.3 Anti-clumping rule

Every AI applies a soft repulsion vector from any teammate within 70 px (10% of their move budget). This prevents the "two AIs running into the same spot" failure that ruins arcade soccer.

### 7.4 Difficulty knob (one number, default 0.7)

A single `aiSkill` float (0..1) scales:
- Reaction time: 250 ms × (1 − skill) + 50 ms × skill
- Pass accuracy lateral spread: ±25 px × (1 − skill)
- Shot timing window: 60% × skill of theoretically perfect

At `skill = 0.7`, the AI feels "I lose if I'm sloppy, win if I read the field."

---

## 8. Visual / Art Direction

The game uses the user's provided sprite set. **No procedural art** beyond:
- Field grass texture (already in `field.png`)
- Pitch markings (drawn over field.png with semi-transparent white lines at runtime — center line, center circle, penalty arcs)
- HUD (CSS over canvas)
- Ball shadow (radial gradient ellipse below ball)
- Player shadows (12 px radius black ellipse, 30% alpha, under each player)
- Goal nets (drawn as 6×8 line grid, white, behind goal mouth)
- Confetti on goal (12 colored particles for 1.2 s, gravity 600 px/s²)
- Ball trail (last 8 positions, fading alpha)

**Polish from the first build (per project memory: "Forge — use beautiful UI/visuals from Run 1"):**
- Camera shake (3 px, 200 ms) on shot impact and on goal.
- Time-of-day tint: a static warm-evening overlay (multiply, 8% strength, orange) for atmosphere — single setting, no day/night cycle.
- HUD: top-center scoreboard `BLU 0  —  RED 0` with a thin progress bar showing match time.
- Mini-map: top-right corner, 160×90, dot-based, refreshed at 30 fps.

---

## 9. HUD & UI

| Element | Position |
|---|---|
| Scoreboard | Top center (CSS, 32 px tall) |
| Time | Inside scoreboard, format `M:SS` |
| Stamina bar | Under human player on canvas |
| Mini-map | Top-right, 160×90 |
| Pause overlay | Full-screen translucent on `Esc` |
| Match end panel | Centered, 480×320, with WIN/DRAW/LOSE + buttons |

Title screen (loaded first):
- Logo placeholder text "MINI SOCCER" in bold sans-serif
- Single button "PLAY"
- Optional difficulty radio (Easy 0.4 / Normal 0.7 / Hard 0.95), default Normal

---

## 10. Audio (deferred)

The user does not produce audio in this pass. Stub all sound calls behind a `playSfx(name)` function that no-ops. Hooks to add later:
- `kick`, `pass`, `goal`, `whistle_start`, `whistle_end`, `tackle`, `crowd_loop`.

---

## 11. Technical Architecture

### 11.1 Files

```
games/mini-soccer/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── assets/                  (already populated)
│   ├── ball.png
│   ├── field.png
│   ├── red-player.png
│   ├── running-up-nonbg.png
│   ├── running-down-nonbg.png
│   ├── running-right-nonbg.png
│   └── shoot-right-nonbg.png
└── src/
    ├── main.ts              (boot, asset preload, scene switching)
    ├── game/
    │   ├── world.ts         (entity arrays, fixed-timestep loop)
    │   ├── physics.ts       (ball, player movement, friction, collisions)
    │   ├── input.ts         (keyboard + touch → InputCommand)
    │   ├── ai.ts            (role assignment, behavior tree, scoring)
    │   ├── match.ts         (match state machine: Kickoff/Play/Goal/End)
    │   ├── render.ts        (canvas draw: field, players, ball, HUD, FX)
    │   └── tint.ts          (offscreen blue-tinted player sprite cache)
    ├── ui/
    │   ├── titleScreen.ts
    │   ├── matchEndScreen.ts
    │   └── pauseOverlay.ts
    └── types.ts             (Player, Ball, Team, InputCommand, MatchState)
```

### 11.2 Loop

- **Fixed timestep:** 60 Hz simulation (16.667 ms), accumulator pattern, max 4 catch-up frames per render.
- **Render:** requestAnimationFrame at display refresh rate.
- **Determinism:** seeded `Math.random()` replacement (`mulberry32(seed)`) for AI tie-breaks. Default seed = match start `Date.now()`, but exposed via URL param `?seed=N` for testing.

### 11.3 Performance budget

- Target 60 fps on a 2018 MacBook Air at 1280×720.
- < 1 ms per frame for AI (3 + 3 = 6 entities × 100 ms tick = 60 calls/s, trivial).
- < 4 ms per frame for render. No per-frame allocations in the hot loop.

### 11.4 No external dependencies

Vanilla TS, no Phaser, no PixiJS. Direct Canvas2D. Keeps build time low and matches user preference (memory: "Canvas/DOM over Phaser").

---

## 12. Acceptance Criteria (must all pass before "done")

A first build is accepted when:

1. ✅ The page loads at `npm run dev`, no console errors, all assets render.
2. ✅ The title screen appears, "PLAY" starts a match.
3. ✅ Kickoff countdown plays, ball spawns at center.
4. ✅ Player can move with WASD, sprint with Shift, shoot with X, pass with Space.
5. ✅ AI teammates run lanes when player has the ball; pressure when they don't.
6. ✅ Red AI plays a recognizable game — not random walk, not deathball, holds shape.
7. ✅ Possession changes feel fair — no sticky ball, no impossible-to-tackle carrier.
8. ✅ Goals trigger freeze, score, kickoff to conceding team.
9. ✅ Match ends at 3:00 with WIN/DRAW/LOSE panel.
10. ✅ A full 3-minute test match completes without any AI getting stuck on a wall, in a corner, or chasing forever.
11. ✅ At default difficulty (0.7), a competent human can win >50% of matches but lose sometimes.

---

## 13. Out of Scope (do not implement)

- Fouls, offside, throw-ins (auto-resume only)
- Yellow/red cards
- Substitutions
- Multiple match modes (no league, no tournament)
- Network multiplayer
- Save data, profile, settings persistence
- Audio (deferred — stubbed only)
- Multiple stadiums or weather

---

## 14. Implementation Plan (for the coder)

The implementer (Gemini 3 Pro) should produce the project in this order:

1. **Bootstrap:** `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`. Vite + TS only — no Tailwind needed (HUD is small, plain CSS is fine).
2. **Asset preload + tint cache** (`main.ts`, `tint.ts`).
3. **Render loop with field + idle players + ball** (`render.ts`, `world.ts`). No physics yet — just see things on screen.
4. **Input + player movement** (`input.ts`, `physics.ts`).
5. **Ball physics + possession magnet** (`physics.ts`).
6. **Pass + shoot** (`physics.ts`, `match.ts` for goal detection).
7. **AI roles + decision tree** (`ai.ts`).
8. **Match state machine** (`match.ts`): Kickoff → Play → Goal → Play → End.
9. **HUD: scoreboard, timer, stamina, mini-map** (`render.ts`).
10. **Title + match end screens** (`ui/`).
11. **Polish:** ball trail, confetti, camera shake, net flutter, anti-clumping.
12. **QA pass:** play one full match, fix any acceptance-criteria failure.

Each step should leave the game in a **runnable** state. No "scaffolding everything before anything works" — get pixels on screen by step 3, controllable player by step 4, a kickable ball by step 5.

---

## 15. Open Questions (none — GDD locked)

If the implementer needs a number that isn't in this doc, they should pick a value, comment it as `// CHOSEN: <value>` so a human can tune it later, and keep going. Do not block on missing constants.
