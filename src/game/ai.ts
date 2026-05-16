import { state } from "./world";
import { Player, v2, vSub, vAdd, vMul, vLen, vNorm, vDist } from "../types";
import { executePass, executeShoot, tryStartSlide } from "./physics";

const FIELD_LEFT = 60, FIELD_RIGHT = 1220, FIELD_TOP = 60, FIELD_BOTTOM = 660;
const GOAL_TOP_Y = 270, GOAL_BOTTOM_Y = 450;
const SLIDE_SPEED = 360; // px/s — matches physics.ts tryStartSlide initial velocity

// Per-player reaction-delay timers. AI must "see" the situation for this long
// before acting on a shoot/pass/press decision. Reaction shrinks with aiSkill.
const reactionTimer = new Map<number, number>();

function getReactionDelay(skill: number): number {
    // GAME.md §7.4: 250 ms × (1 − skill) + 50 ms × skill.
    return 0.25 * (1 - skill) + 0.05 * skill;
}

function tickReaction(p: Player, dt: number): boolean {
    // Returns true when the player has "reacted" (timer expired).
    const skill = state.difficulty;
    const cur = reactionTimer.get(p.id) ?? 0;
    if (cur <= 0) {
        reactionTimer.set(p.id, getReactionDelay(skill));
        return false;
    }
    const next = cur - dt;
    reactionTimer.set(p.id, next);
    return next <= 0;
}

function resetReaction(p: Player) {
    reactionTimer.set(p.id, 0);
}

let aiTickTimer = 0;
let lastTickDt = 0.1;

export function updateAI(dt: number) {
    aiTickTimer -= dt;
    if (aiTickTimer <= 0) {
        lastTickDt = 0.1 - aiTickTimer; // actual time since last tick
        aiTickTimer = 0.1; // 100ms tick per GDD
        assignRoles();
        state.players.forEach(p => {
            if (!p.isHuman && p.state !== 'SLIDE') {
                decideAction(p);
            }
        });
        // Soft separation: no two teammates within 80px should target same spot
        applyTeammateSeparation();
    }
}

function applyTeammateSeparation() {
    const teams: Array<'BLUE' | 'RED'> = ['BLUE', 'RED'];
    for (const team of teams) {
        // Exclude the GK from soft separation — it must hold its goal line.
        const teammates = state.players.filter(p =>
            p.team === team && !p.isHuman && p.role !== 'GOALKEEPER');
        for (let i = 0; i < teammates.length; i++) {
            for (let j = i + 1; j < teammates.length; j++) {
                const a = teammates[i];
                const b = teammates[j];
                const dist = vDist(a.pos, b.pos);
                if (dist < 80 && dist > 0) {
                    const push = vMul(vNorm(vSub(a.pos, b.pos)), (80 - dist) * 0.5);
                    a.vel = vAdd(a.vel, push);
                    b.vel = vSub(b.vel, push);
                }
            }
        }
    }
}

function assignRoles() {
    // Ball is loose if no player currently has possession (lastTouchedBy === null)
    const isLoose = state.ball.lastTouchedBy === null;
    if (isLoose) {
        assignLooseBallRoles('BLUE');
        assignLooseBallRoles('RED');
    } else {
        const possessorTeam = state.players.find(p => p.id === state.ball.lastTouchedBy)?.team ?? null;
        assignTeamRoles('BLUE', possessorTeam === 'BLUE');
        assignTeamRoles('RED',  possessorTeam === 'RED');
    }
}

// Outfielders only (GK keeps its role forever).
function outfield(team: 'BLUE' | 'RED'): Player[] {
    return state.players.filter(p => p.team === team && p.role !== 'GOALKEEPER');
}

function assignLooseBallRoles(team: 'BLUE' | 'RED') {
    const teamPlayers = outfield(team);
    // Sort by distance to ball
    const sorted = [...teamPlayers].sort((a, b) => vDist(a.pos, state.ball.pos) - vDist(b.pos, state.ball.pos));
    sorted.forEach((p, i) => {
        if (i === 0) p.role = 'PRESSURER';       // closest → sprint to ball
        else if (i === 1) p.role = 'LANE_RUNNER_2'; // second → receiving position behind ball
        else p.role = 'SWEEPER';                    // third → defensive position
    });
}

function assignTeamRoles(team: 'BLUE' | 'RED', hasBall: boolean) {
    const teamPlayers = outfield(team);

    if (hasBall) {
        // Find carrier
        let carrierId = state.ball.lastTouchedBy;
        if (!teamPlayers.find(p => p.id === carrierId)) {
             // If nobody officially has it but team has possession, pick closest
             let minDist = 9999;
             teamPlayers.forEach(p => {
                 const d = vDist(p.pos, state.ball.pos);
                 if (d < minDist) { minDist = d; carrierId = p.id; }
             });
        }

        teamPlayers.forEach(p => {
            if (p.id === carrierId && (!p.isHuman || state.ball.lastTouchedBy === p.id)) p.role = 'BALL_CARRIER';
            else if (!teamPlayers.find(x => x.role === 'LANE_RUNNER_1')) p.role = 'LANE_RUNNER_1';
            else p.role = 'LANE_RUNNER_2';
        });
    } else {
        // Defending
        let closestDist = 9999;
        let pressurer: Player | null = null;
        teamPlayers.forEach(p => {
            const d = vDist(p.pos, state.ball.pos);
            if (d < closestDist) { closestDist = d; pressurer = p; }
        });

        teamPlayers.forEach(p => {
            if (p === pressurer) p.role = 'PRESSURER';
            else if (!teamPlayers.find(x => x.role === 'SWEEPER')) p.role = 'SWEEPER';
            else p.role = 'MARKER';
        });
    }
}

function decideAction(p: Player) {
    const targetX = p.team === 'BLUE' ? FIELD_RIGHT : FIELD_LEFT;
    const ownGoalX = p.team === 'BLUE' ? FIELD_LEFT : FIELD_RIGHT;
    const skill = state.difficulty;

    if (p.role === 'GOALKEEPER') {
        decideGoalkeeper(p, ownGoalX);
        return;
    }

    if (p.role === 'BALL_CARRIER') {
        const distToGoal = vDist(p.pos, v2(targetX, 360));
        const distFactor = Math.max(0, Math.min(1, 1 - distToGoal / 600));

        // Simple blocked fraction
        let blockers = 0;
        state.players.forEach(enemy => {
            if (enemy.team !== p.team && vDist(enemy.pos, v2(targetX, 360)) < distToGoal) {
                blockers++;
            }
        });
        const laneClear = Math.max(0, 1 - (blockers * 0.3));
        const shotScore = (distFactor * 0.5) + (laneClear * 0.5);

        let pressureCount = 0;
        state.players.forEach(enemy => {
            if (enemy.team !== p.team && vDist(enemy.pos, p.pos) < 60) pressureCount++;
        });
        const pressure = Math.min(1, pressureCount / 2);

        // aiSkill gates BOTH thresholds — weaker AI is pickier about shots and
        // bails to a pass under less pressure (or hesitates entirely).
        // Easy 0.35 → shotThr 0.78 / passThr 0.85. Hard 0.85 → 0.68 / 0.62.
        const shotThreshold = 0.65 + (1 - skill) * 0.4;
        const passPressureThreshold = 0.5 + (1 - skill) * 0.7;
        const reacted = tickReaction(p, lastTickDt);

        if (reacted && shotScore >= shotThreshold) {
            executeShoot(p);
            resetReaction(p);
        } else if (reacted && pressure >= passPressureThreshold) {
            executePass(p);
            resetReaction(p);
        } else {
            // Dribble toward goal at base speed — even while "reacting".
            const aimDir = vNorm(vSub(v2(targetX, 360), p.pos));
            p.vel = vMul(aimDir, 180);
        }
    } else if (p.role.startsWith('LANE_RUNNER')) {
        // When ball is loose, LANE_RUNNER_2 acts as a receiving position behind the ball
        if (state.ball.lastTouchedBy === null && p.role === 'LANE_RUNNER_2') {
            const dirX = p.team === 'BLUE' ? 1 : -1;
            // Hold 150px behind ball (toward own goal side) as second ball receiver
            const anchor = v2(state.ball.pos.x - dirX * 150, state.ball.pos.y);
            anchor.x = Math.max(FIELD_LEFT + 30, Math.min(FIELD_RIGHT - 30, anchor.x));
            anchor.y = Math.max(FIELD_TOP + 30, Math.min(FIELD_BOTTOM - 30, anchor.y));
            p.vel = vMul(vNorm(vSub(anchor, p.pos)), 160);
        } else {
        const carrier = state.players.find(x => x.role === 'BALL_CARRIER' && x.team === p.team);
        if (carrier) {
            const dirX = p.team === 'BLUE' ? 1 : -1;
            let anchor;
            if (p.role === 'LANE_RUNNER_1') {
                // Advanced position on OPPOSITE side of carrier — width play, ahead of ball
                const carrierSideY = carrier.pos.y;
                const oppositeLaneY = carrierSideY < 360 ? 560 : 160; // push to opposite lane
                const advanceX = carrier.pos.x + dirX * 200; // 150-250px ahead toward goal
                anchor = v2(advanceX, oppositeLaneY);
            } else {
                // LANE_RUNNER_2: support position slightly behind carrier, offset perpendicular
                const offsetY = carrier.pos.y < 360 ? 100 : -100; // same general area but offset
                anchor = v2(carrier.pos.x - dirX * 80, carrier.pos.y + offsetY);
            }

            // Clamp anchor
            anchor.x = Math.max(FIELD_LEFT + 30, Math.min(FIELD_RIGHT - 30, anchor.x));
            anchor.y = Math.max(FIELD_TOP + 30, Math.min(FIELD_BOTTOM - 30, anchor.y));

            p.vel = vMul(vNorm(vSub(anchor, p.pos)), 180);
        }
        } // end else (carrier block)
    } else if (p.role === 'PRESSURER' || p.role === 'MARKER') {
        // Try slide-tackle when close to opposing ball carrier.
        // Reaction delay also gates the slide attempt so weak AI commits late.
        const carrier = state.ball.lastTouchedBy !== null ? state.players.find(x => x.id === state.ball.lastTouchedBy) : null;
        if (carrier && carrier.team !== p.team && p.slideCooldown <= 0) {
            const d = vDist(p.pos, carrier.pos);
            if (d < 70 && d > 4) {
                if (!tickReaction(p, lastTickDt)) {
                    // Still reacting — keep closing on the carrier instead of sliding.
                } else {
                    // Lead-time scales with range: long slides need more projection.
                    const lead = Math.min(0.4, Math.max(0.1, d / SLIDE_SPEED));
                    const dir = vNorm(vSub(vAdd(carrier.pos, vMul(carrier.vel, lead)), p.pos));
                    tryStartSlide(p, dir);
                    resetReaction(p);
                    return;
                }
            }
        }
    }
    if (p.role === 'PRESSURER') {
        const isLoose = state.ball.lastTouchedBy === null;
        let targetPos;
        if (isLoose) {
            targetPos = { x: state.ball.pos.x, y: state.ball.pos.y };
        } else {
            const ballToGoal = vNorm(vSub(v2(ownGoalX, 360), state.ball.pos));
            targetPos = vAdd(state.ball.pos, vMul(ballToGoal, 25));
        }
        // Slow down within pickup range so relSpeed<60 condition can fire on loose ball.
        // Outside ~50px: sprint. Within: scale to ~6*dist so 8px≈48px/s grabs cleanly.
        const dist = vDist(p.pos, targetPos);
        const speed = isLoose && dist < 50 ? Math.max(30, dist * 6) : 250;
        const dir = dist > 0.01 ? vNorm(vSub(targetPos, p.pos)) : v2(0, 0);
        p.vel = vMul(dir, speed);
    } else if (p.role === 'SWEEPER') {
        // Position centrally between ball and own goal
        const midX = (state.ball.pos.x + ownGoalX) / 2;
        const midY = (state.ball.pos.y + 360) / 2;
        const targetPos = v2(
            Math.max(FIELD_LEFT + 40, Math.min(FIELD_RIGHT - 40, midX)),
            Math.max(FIELD_TOP + 40, Math.min(FIELD_BOTTOM - 40, midY))
        );
        p.vel = vMul(vNorm(vSub(targetPos, p.pos)), 180);
    } else if (p.role === 'MARKER') {
        // Mark most dangerous opponent who is NOT the ball carrier — stay within 40px
        let bestEnemy: Player | null = null;
        let minDist = 9999;
        for (const enemy of state.players) {
            if (enemy.team !== p.team && enemy.id !== state.ball.lastTouchedBy) {
                const d = vDist(enemy.pos, v2(ownGoalX, 360));
                if (d < minDist) { minDist = d; bestEnemy = enemy; }
            }
        }
        if (bestEnemy) {
            const toEnemy = vSub(bestEnemy.pos, p.pos);
            const distToEnemy = vLen(toEnemy);
            if (distToEnemy > 40) {
                p.vel = vMul(vNorm(toEnemy), 200);
            } else {
                // Closely shadowing — move with enemy
                p.vel = vMul(vNorm(toEnemy), 80);
            }
        } else {
            p.vel = v2(0,0);
        }
    }
}

function decideGoalkeeper(p: Player, ownGoalX: number) {
    // Goalkeeper anchors on own goal-mouth center and slides vertically to
    // shadow the ball's Y. If the ball is close and moving toward the goal,
    // the keeper dives out at sprint speed to smother it.
    const ball = state.ball;

    // Anchor X is 30 px inside own goal (keeps GK on its line, never wanders).
    const dirIntoField = ownGoalX === FIELD_LEFT ? 1 : -1;
    const anchorX = ownGoalX + dirIntoField * 30;

    // Track ball.y, clamped to goal-mouth.
    const trackY = Math.max(GOAL_TOP_Y + 10, Math.min(GOAL_BOTTOM_Y - 10, ball.pos.y));

    // Dive condition: ball within 80 px of own goal AND moving toward it.
    const dxBall = ball.pos.x - ownGoalX;
    const distXToGoal = Math.abs(dxBall);
    const ballMovingToGoal = ownGoalX === FIELD_LEFT ? ball.vel.x < -20 : ball.vel.x > 20;
    const shouldDive = distXToGoal < 80 && ballMovingToGoal;

    let target;
    let speed;
    if (shouldDive) {
        target = { x: ball.pos.x, y: ball.pos.y };
        speed = 250; // sprint
    } else {
        target = { x: anchorX, y: trackY };
        speed = 180;
    }

    // Hard clamp: GK never strays more than 40 px from goal-mouth center on X
    // when not diving, so it stays "near own goal-mouth center" as specified.
    if (!shouldDive) {
        const goalMouthCenterX = ownGoalX + dirIntoField * 20;
        target.x = Math.max(goalMouthCenterX - 40, Math.min(goalMouthCenterX + 40, target.x));
    }

    const toTarget = vSub(target, p.pos);
    const distToTarget = vLen(toTarget);
    if (distToTarget < 4) {
        p.vel = v2(0, 0);
    } else {
        p.vel = vMul(vNorm(toTarget), speed);
    }
}
