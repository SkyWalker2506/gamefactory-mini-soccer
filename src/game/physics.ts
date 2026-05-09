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
      }
    }
    
    // Apply inputs
    applyPlayerMovement(p, input.moveDir, input.sprint, dt);
    
    if (input.pass) executePass(p);
    if (input.shoot) executeShoot(p);
  }

  // 2. AI movement (applied elsewhere, but we run physics for all here)
  state.players.forEach(p => {
    if (!p.isHuman) {
      // AI movement is set in AI update, we just apply velocity to pos
      if (vLenSq(p.vel) > 0) {
        p.pos = vAdd(p.pos, vMul(p.vel, dt));
        p.facing = vNorm(p.vel);
      }
      
      // Update anim state
      if (vLenSq(p.vel) > 10) {
        p.state = 'RUN';
        p.animTimer += dt;
      } else {
        p.state = 'IDLE';
        p.animTimer = 0;
      }
    } else {
       // Human pos update
      if (vLenSq(p.vel) > 0) {
        p.pos = vAdd(p.pos, vMul(p.vel, dt));
        // facing updated in applyPlayerMovement
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
  state.ball.vel = vMul(state.ball.vel, BALL_FRICTION);
  if (vLenSq(state.ball.vel) < 10) state.ball.vel = v2(0, 0);
  
  state.ball.pos = vAdd(state.ball.pos, vMul(state.ball.vel, dt));
  
  // Z trajectory visual
  if (state.ball.z > 1) {
      state.ball.z -= dt * 0.4;
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

  // 4. Possession & Tackle
  state.players.forEach(p => {
    const distToBall = vDist(p.pos, state.ball.pos);
    const relSpeed = vLen(vSub(p.vel, state.ball.vel));

    // Touch window: player must be in range for 150ms before gaining possession
    if (distToBall < 20 && relSpeed < 300) {
      // Currently in range — countdown touch window
      if (p.touchWindowTimer > 0) {
        p.touchWindowTimer -= dt;
      } else {
        // Window elapsed — grant possession
        state.ball.lastTouchedBy = p.id;
        state.ball.lastTouchTeam = p.team;
        p.lastTouchTime = Date.now();

        const dribbleOffset = vAdd(p.pos, vMul(p.facing, 18));
        const lerpFactor = Math.min(1, dt * 20); // smooth snap over ~50ms
        state.ball.pos = {
          x: state.ball.pos.x + (dribbleOffset.x - state.ball.pos.x) * lerpFactor,
          y: state.ball.pos.y + (dribbleOffset.y - state.ball.pos.y) * lerpFactor,
        };
        state.ball.vel = p.vel;

        // Auto-switch to possessor
        if (p.team === 'BLUE' && !p.isHuman) {
          if (state.humanPlayerId !== null) state.players[state.humanPlayerId].isHuman = false;
          p.isHuman = true;
          state.humanPlayerId = p.id;
        }
      }
    } else {
      // Out of range — reset touch window timer
      if (distToBall >= 20 || relSpeed >= 300) {
        // Only reset if they're clearly out of the window zone
        if (distToBall > 30) {
          p.touchWindowTimer = 0.15; // 150ms window on next approach
        }
      }
    }
    
    // Tackle
    if (state.ball.lastTouchedBy !== null && state.ball.lastTouchedBy !== p.id) {
        const carrier = state.players.find(x => x.id === state.ball.lastTouchedBy);
        if (carrier && carrier.team !== p.team) {
            if (vDist(p.pos, carrier.pos) < 32) {
                const toTackler = vNorm(vSub(p.pos, carrier.pos));
                const dot = carrier.facing.x * toTackler.x + carrier.facing.y * toTackler.y;
                if (dot < 0.85) {
                    state.ball.lastTouchedBy = null;
                    // Knock the ball loose past the tackler so the carrier's magnet doesn't re-grab it
                    const knockDir = vNorm(vSub(p.pos, carrier.pos));
                    state.ball.vel = vMul(knockDir, 260);
                    state.ball.pos = vAdd(carrier.pos, vMul(knockDir, 42));
                    p.lastTouchTime = Date.now();
                    playSfx("tackle");
                }
            }
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

function updateSpriteName(p: Player) {
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
  const BOUNCE = 0.75;
  const MIN_BOUNCE_SPEED = 80;

  if (b.x < FIELD_LEFT && !inGoalY) {
      b.x = FIELD_LEFT;
      state.ball.vel.x = Math.abs(state.ball.vel.x) * BOUNCE;
      if (state.ball.vel.x < MIN_BOUNCE_SPEED) state.ball.vel.x = MIN_BOUNCE_SPEED;
  } else if (b.x > FIELD_RIGHT && !inGoalY) {
      b.x = FIELD_RIGHT;
      state.ball.vel.x = -Math.abs(state.ball.vel.x) * BOUNCE;
      if (state.ball.vel.x > -MIN_BOUNCE_SPEED) state.ball.vel.x = -MIN_BOUNCE_SPEED;
  }

  if (b.y < FIELD_TOP) {
      b.y = FIELD_TOP;
      state.ball.vel.y = Math.abs(state.ball.vel.y) * BOUNCE;
      if (state.ball.vel.y < MIN_BOUNCE_SPEED) state.ball.vel.y = MIN_BOUNCE_SPEED;
  } else if (b.y > FIELD_BOTTOM) {
      b.y = FIELD_BOTTOM;
      state.ball.vel.y = -Math.abs(state.ball.vel.y) * BOUNCE;
      if (state.ball.vel.y > -MIN_BOUNCE_SPEED) state.ball.vel.y = -MIN_BOUNCE_SPEED;
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
                
                const openLaneScore = 1 - ((120 - minEnemyDist) / 120);
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
    
    // Add inaccuracy
    const dist = vDist(p.pos, bestPoint);
    const spread = dist < 200 ? 0.035 : 0.14; // radians
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
