import { state } from "./world";
import { InputCommand, Vector2, v2, vAdd, vSub, vMul, vLen, vLenSq, vNorm, vDist, Player } from "../types";
import { playSfx } from "./tint";

const PITCH_W = 1280, PITCH_H = 720;
const FIELD_LEFT = 60, FIELD_RIGHT = 1220, FIELD_TOP = 60, FIELD_BOTTOM = 660;
const GOAL_TOP_Y = 270, GOAL_BOTTOM_Y = 450;
const BALL_FRICTION = 0.96;
const MAX_BALL_SPEED = 600;

export function updatePhysics(dt: number, input: InputCommand) {
  // 1. Update Human Player selection and inputs
  if (state.humanPlayerId !== null && state.players[state.humanPlayerId]) {
    const p = state.players[state.humanPlayerId];
    
    // Tab: manually cycle through BLUE team players
    if (input.switchPlayer && state.switchCooldown <= 0) {
      const bluePlayers = state.players.filter(pl => pl.team === 'BLUE');
      const currentIdx = bluePlayers.findIndex(pl => pl.id === state.humanPlayerId);
      const nextIdx = (currentIdx + 1) % bluePlayers.length;
      const nextPlayer = bluePlayers[nextIdx];
      if (nextPlayer && nextPlayer.id !== state.humanPlayerId) {
        state.players.forEach(pl => pl.isHuman = false);
        nextPlayer.isHuman = true;
        state.humanPlayerId = nextPlayer.id;
        state.switchCooldown = 0.3;
      }
    }

    // Auto-select: when ball is free (no possession), switch to closest BLUE player
    if (state.ball.lastTouchedBy === null && state.switchCooldown <= 0) {
      const bestId = getClosestTeammateToBall('BLUE');
      if (bestId !== null && bestId !== state.humanPlayerId) {
        state.players.forEach(pl => pl.isHuman = false);
        state.players[bestId].isHuman = true;
        state.humanPlayerId = bestId;
        state.switchCooldown = 0.3; // prevent immediate re-override of manual picks
      }
    }
    
    // Apply inputs
    if (p.state !== 'SLIDE') {
      applyPlayerMovement(p, input.moveDir, input.sprint, dt);
      if (input.pass) executePass(p);
      if (input.shoot) executeShoot(p);
      if (input.slide) tryStartSlide(p, input.moveDir);
    }
  }

  // 2. AI movement (applied elsewhere, but we run physics for all here)
  state.players.forEach(p => {
    // Slide cooldown ticks regardless
    if (p.slideCooldown > 0) p.slideCooldown = Math.max(0, p.slideCooldown - dt);

    if (p.state === 'SLIDE') {
      // Locked direction, decelerating slide
      p.slideTimer -= dt;
      p.pos = vAdd(p.pos, vMul(p.vel, dt));
      p.vel = vMul(p.vel, 0.94); // deceleration
      p.facing = vLenSq(p.slideDir) > 0 ? p.slideDir : p.facing;
      p.animTimer += dt;
      if (p.slideTimer <= 0) {
        p.state = 'IDLE';
        p.vel = v2(0, 0);
      }
    } else if (!p.isHuman) {
      if (vLenSq(p.vel) > 0) {
        p.pos = vAdd(p.pos, vMul(p.vel, dt));
        p.facing = vNorm(p.vel);
      }
      if (vLenSq(p.vel) > 10) {
        p.state = 'RUN';
        p.animTimer += dt;
      } else {
        p.state = 'IDLE';
        p.animTimer = 0;
      }
    } else {
      if (vLenSq(p.vel) > 0) {
        p.pos = vAdd(p.pos, vMul(p.vel, dt));
      }
    }

    updateSpriteName(p);
    clampToField(p);
  });
  
  // Anti-clumping repulsion (skip opposing tackler vs ball carrier so tackle range is reachable)
  const carrierId = state.ball.lastTouchedBy;
  for (let i = 0; i < state.players.length; i++) {
    for (let j = i + 1; j < state.players.length; j++) {
      const p1 = state.players[i];
      const p2 = state.players[j];

      if (carrierId !== null && p1.team !== p2.team &&
          (p1.id === carrierId || p2.id === carrierId)) {
        continue;
      }

      const dist = vDist(p1.pos, p2.pos);
      if (dist < 48 && dist > 0) {
        const repulse = vMul(vNorm(vSub(p1.pos, p2.pos)), (48 - dist) * 6 * dt);
        p1.pos = vAdd(p1.pos, repulse);
        p2.pos = vSub(p2.pos, repulse);
      }
    }
  }
  // Re-clamp after repulsion (repulsion can push players outside field)
  state.players.forEach(p => clampToField(p));

  // 3. Ball physics
  const carrier = state.ball.lastTouchedBy !== null
    ? state.players.find(pl => pl.id === state.ball.lastTouchedBy)
    : null;

  if (carrier && state.ball.z <= 1.05) {
    state.ball.vel = carrier.vel;
    state.ball.pos = vAdd(state.ball.pos, vMul(state.ball.vel, dt));
  } else {
    state.ball.vel = vMul(state.ball.vel, BALL_FRICTION);
    if (vLenSq(state.ball.vel) < 10) state.ball.vel = v2(0, 0);
    state.ball.pos = vAdd(state.ball.pos, vMul(state.ball.vel, dt));
  }
  
  // Z trajectory visual
  if (state.ball.z > 1) {
      state.ball.z -= dt * 2.5; // fast descent — lands in ~80ms
      if (state.ball.z < 1) state.ball.z = 1;
  }
  
  // Ball trail
  if (vLenSq(state.ball.vel) > 1000) {
      state.ball.trail.unshift({ x: state.ball.pos.x, y: state.ball.pos.y, alpha: 0.5 });
      if (state.ball.trail.length > 8) state.ball.trail.pop();
  } else {
      if (state.ball.trail.length > 0) state.ball.trail.pop();
  }
  for (const tr of state.ball.trail) tr.alpha *= 0.8;

  // 4. Possession (free ball only) & Slide-tackle steal
  state.players.forEach(p => {
    const ballOwned = state.ball.lastTouchedBy !== null;
    const distToBall = vDist(p.pos, state.ball.pos);
    const relSpeed = vLen(vSub(p.vel, state.ball.vel));

    // Free ball pickup — only when ball has no owner (magnet: 20px + relSpeed < 60)
    if (!ballOwned && distToBall < 20 && relSpeed < 60 && state.ball.z <= 1.05) {
      if (p.touchWindowTimer > 0) {
        p.touchWindowTimer -= dt;
      } else {
        state.ball.lastTouchedBy = p.id;
        state.ball.lastTouchTeam = p.team;
        p.lastTouchTime = Date.now();
        state.ball.vel = p.vel;
        state.ball.z = 1;
        if (p.team === 'BLUE' && !p.isHuman) {
          if (state.humanPlayerId !== null) state.players[state.humanPlayerId].isHuman = false;
          p.isHuman = true;
          state.humanPlayerId = p.id;
        }
      }
    } else if (distToBall > 22 || relSpeed >= 60 || ballOwned) {
      p.touchWindowTimer = 0.15;
    }

    // Slide-tackle: only a SLIDING player can steal from the carrier
    if (p.state === 'SLIDE' && ballOwned && state.ball.lastTouchedBy !== p.id) {
      const carrier = state.players.find(x => x.id === state.ball.lastTouchedBy);
      if (carrier && carrier.team !== p.team && vDist(p.pos, carrier.pos) < 38) {
        state.ball.lastTouchedBy = null;
        const knockDir = vNorm(vSub(carrier.pos, p.pos));
        state.ball.vel = vMul(knockDir, 280);
        state.ball.pos = vAdd(carrier.pos, vMul(knockDir, 30));
        state.ball.z = 1;
        p.lastTouchTime = Date.now();
        playSfx("tackle");
      }
    }
  });

  // 5. Out of bounds bounce & auto-resume
  handleOutOfBounds();
}

function applyPlayerMovement(p: Player, moveDir: Vector2, sprintInput: boolean, dt: number) {
  if (p.sprintCooldown) {
    p.stamina += 25 * dt;
    if (p.stamina >= 30) p.sprintCooldown = false;
  } else if (!sprintInput || vLenSq(moveDir) === 0) {
    p.stamina += 25 * dt;
  }
  
  if (p.stamina > 100) p.stamina = 100;

  p.isSprinting = sprintInput && !p.sprintCooldown && vLenSq(moveDir) > 0 && p.stamina > 0;
  if (p.isSprinting) {
    p.stamina -= 40 * dt;
    if (p.stamina <= 0) {
      p.stamina = 0;
      p.sprintCooldown = true;
      p.isSprinting = false;
    }
  }

  const targetSpeed = p.isSprinting ? 250 : (vLenSq(moveDir) > 0 ? 180 : 0);
  const targetVel = vMul(moveDir, targetSpeed);
  
  // Linear velocity blend (80ms responsiveness)
  p.vel.x += (targetVel.x - p.vel.x) * (dt / 0.08);
  p.vel.y += (targetVel.y - p.vel.y) * (dt / 0.08);
  
  if (vLenSq(p.vel) > 10) {
    p.facing = vNorm(p.vel);
    p.state = 'RUN';
    p.animTimer += dt;
  } else {
    p.state = 'IDLE';
    p.animTimer = 0;
  }
}

export function tryStartSlide(p: Player, moveDir: Vector2) {
    if (p.slideCooldown > 0 || p.state === 'SLIDE') return;
    // Carrier cannot slide (slide is for stealing)
    if (state.ball.lastTouchedBy === p.id) return;
    let dir = vLenSq(moveDir) > 0 ? vNorm(moveDir) : (vLenSq(p.facing) > 0 ? vNorm(p.facing) : v2(1, 0));
    p.slideDir = dir;
    p.facing = dir;
    p.vel = vMul(dir, 360);
    p.state = 'SLIDE';
    p.slideTimer = 0.5;
    p.slideCooldown = 5.0;
    p.animTimer = 0;
    playSfx("slide");
}

function updateSpriteName(p: Player) {
    if (p.state === 'SLIDE') {
        p.spriteName = 'slide';
        return;
    }
    if (p.state === 'SHOOT') {
        p.spriteName = 'shoot';
        return;
    }
    if (p.state === 'IDLE') {
        p.spriteName = 'idle';
        return;
    }
    const absX = Math.abs(p.facing.x);
    const absY = Math.abs(p.facing.y);
    if (absX > absY) {
        p.spriteName = p.facing.x > 0 ? 'right' : 'left';
    } else {
        p.spriteName = p.facing.y > 0 ? 'down' : 'up';
    }
}

function clampToField(p: Player) {
  p.pos.x = Math.max(FIELD_LEFT, Math.min(FIELD_RIGHT, p.pos.x));
  p.pos.y = Math.max(FIELD_TOP, Math.min(FIELD_BOTTOM, p.pos.y));
}

function handleOutOfBounds() {
  const b = state.ball.pos;
  const inGoalY = b.y > GOAL_TOP_Y && b.y < GOAL_BOTTOM_Y;

  const outSide = (b.x < FIELD_LEFT || b.x > FIELD_RIGHT) && !inGoalY;
  const outEnd = b.y < FIELD_TOP || b.y > FIELD_BOTTOM;
  if (!outSide && !outEnd) return;

  b.x = Math.max(FIELD_LEFT + 1, Math.min(FIELD_RIGHT - 1, b.x));
  b.y = Math.max(FIELD_TOP + 1, Math.min(FIELD_BOTTOM - 1, b.y));
  state.ball.vel = v2(0, 0);
  state.ball.z = 1;

  // Award possession to nearest player on the team that did NOT last touch the ball
  const lastTeam = state.ball.lastTouchTeam;
  const oppTeam: 'BLUE' | 'RED' | null = lastTeam === 'BLUE' ? 'RED' : lastTeam === 'RED' ? 'BLUE' : null;
  let restartId: number | null = null;
  let minDist = Infinity;
  state.players.forEach(pl => {
    if (oppTeam !== null && pl.team !== oppTeam) return;
    const d = vDist(pl.pos, state.ball.pos);
    if (d < minDist) { minDist = d; restartId = pl.id; }
  });
  if (restartId !== null) {
    const pl = state.players[restartId];
    state.ball.lastTouchedBy = pl.id;
    state.ball.lastTouchTeam = pl.team;
    pl.lastTouchTime = Date.now();
  }
}

export function executePass(p: Player) {
    if (state.ball.lastTouchedBy !== p.id) return;
    
    // Find best teammate
    let bestScore = -999;
    let target: Player | null = null;
    
    for (const mate of state.players) {
        if (mate.team === p.team && mate.id !== p.id) {
            const dist = vDist(p.pos, mate.pos);
            const toMate = vNorm(vSub(mate.pos, p.pos));
            const fwdDot = p.facing.x * toMate.x + p.facing.y * toMate.y;
            
            if (fwdDot > -0.5) { // Within 240 deg forward arc
                let minEnemyDist = 120;
                for (const enemy of state.players) {
                    if (enemy.team !== p.team) {
                        const enemyToMate = vDist(enemy.pos, mate.pos);
                        if (enemyToMate < minEnemyDist) minEnemyDist = enemyToMate;
                    }
                }
                
                const openLaneScore = Math.min(1, Math.max(0, minEnemyDist / 120));
                const score = openLaneScore - 0.5 * (dist / 1280);
                if (score > bestScore) {
                    bestScore = score;
                    target = mate;
                }
            }
        }
    }
    
    state.ball.lastTouchedBy = null;
    if (target) {
        const leadPos = vAdd(target.pos, vMul(target.vel, 0.4));
        state.ball.vel = vMul(vNorm(vSub(leadPos, state.ball.pos)), 320);
    } else {
        // Failed pass
        state.ball.vel = vMul(p.facing, 280);
        state.ball.z = 1.2;
    }
    
    p.state = 'SHOOT';
    setTimeout(() => p.state = 'IDLE', 150);
    playSfx("pass");
}

export function executeShoot(p: Player) {
    if (state.ball.lastTouchedBy !== p.id) return;
    
    const targetX = p.team === 'BLUE' ? FIELD_RIGHT : FIELD_LEFT;
    
    // 5 goal mouth samples
    const samples = [];
    for (let i = 0; i < 5; i++) {
        samples.push(v2(targetX, GOAL_TOP_Y + 15 + i * 37.5));
    }
    
    let bestPoint = samples[0];
    let maxEnemyDist = -1;
    
    samples.forEach(pt => {
        let minDist = 9999;
        state.players.forEach(enemy => {
            if (enemy.team !== p.team) {
                const dist = Math.abs(enemy.pos.y - pt.y); // Rough perpendicular dist
                if (dist < minDist) minDist = dist;
            }
        });
        if (minDist > maxEnemyDist) {
            maxEnemyDist = minDist;
            bestPoint = pt;
        }
    });
    
    const speed = p.isSprinting ? 540 : 480;
    let aimDir = vNorm(vSub(bestPoint, p.pos));
    
    // Add inaccuracy — linear from ±2° at 200px to ±8° at 600px
    const dist = vDist(p.pos, bestPoint);
    const t = Math.min(1, Math.max(0, (dist - 200) / 400));
    const spread = 0.035 + (0.14 - 0.035) * t; // radians
    const angle = Math.atan2(aimDir.y, aimDir.x) + (Math.random() * spread * 2 - spread);
    aimDir = v2(Math.cos(angle), Math.sin(angle));
    
    state.ball.vel = vMul(aimDir, speed);
    state.ball.z = 1.2; // arc
    state.ball.lastTouchedBy = null;
    
    p.state = 'SHOOT';
    setTimeout(() => p.state = 'IDLE', 200);
    
    state.cameraShake = 0.04;
    playSfx("kick");
}

export function getClosestTeammateToBall(team: string): number | null {
    let best = null;
    let minDist = 99999;
    state.players.forEach(p => {
        if (p.team === team) {
            const dist = vDist(p.pos, state.ball.pos);
            if (dist < minDist) {
                minDist = dist;
                best = p.id;
            }
        }
    });
    return best;
}
