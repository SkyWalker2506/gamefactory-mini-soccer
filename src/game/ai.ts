import { state } from "./world";
import { Player, v2, vSub, vAdd, vMul, vLen, vLenSq, vNorm, vDist } from "../types";
import { executePass, executeShoot, tryStartSlide } from "./physics";

const FIELD_LEFT = 60, FIELD_RIGHT = 1220, FIELD_TOP = 60, FIELD_BOTTOM = 660;

let aiTickTimer = 0;

export function updateAI(dt: number) {
    aiTickTimer -= dt;
    if (aiTickTimer <= 0) {
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
        const teammates = state.players.filter(p => p.team === team && !p.isHuman);
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

function assignLooseBallRoles(team: 'BLUE' | 'RED') {
    const teamPlayers = state.players.filter(p => p.team === team);
    // Sort by distance to ball
    const sorted = [...teamPlayers].sort((a, b) => vDist(a.pos, state.ball.pos) - vDist(b.pos, state.ball.pos));
    sorted.forEach((p, i) => {
        if (i === 0) p.role = 'PRESSURER';       // closest → sprint to ball
        else if (i === 1) p.role = 'LANE_RUNNER_2'; // second → receiving position behind ball
        else p.role = 'SWEEPER';                    // third → defensive position
    });
}

function assignTeamRoles(team: 'BLUE' | 'RED', hasBall: boolean) {
    const teamPlayers = state.players.filter(p => p.team === team);
    
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
        
        const shotThreshold = 0.65 + (1 - skill) * 0.2;
        
        if (shotScore >= shotThreshold) {
            executeShoot(p);
        } else if (pressure >= 0.7) {
            executePass(p);
        } else {
            // Dribble toward goal
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
        // Try slide-tackle when close to opposing ball carrier
        const carrier = state.ball.lastTouchedBy !== null ? state.players.find(x => x.id === state.ball.lastTouchedBy) : null;
        if (carrier && carrier.team !== p.team && p.slideCooldown <= 0) {
            const d = vDist(p.pos, carrier.pos);
            if (d < 70 && d > 20) {
                const dir = vNorm(vSub(vAdd(carrier.pos, vMul(carrier.vel, 0.15)), p.pos));
                tryStartSlide(p, dir);
                return;
            }
        }
    }
    if (p.role === 'PRESSURER') {
        // If ball is loose, sprint directly to ball; otherwise intercept between ball and own goal
        const isLoose = state.ball.lastTouchedBy === null;
        let targetPos;
        if (isLoose) {
            targetPos = { x: state.ball.pos.x, y: state.ball.pos.y };
        } else {
            const ballToGoal = vNorm(vSub(v2(ownGoalX, 360), state.ball.pos));
            targetPos = vAdd(state.ball.pos, vMul(ballToGoal, 25));
        }
        p.vel = vMul(vNorm(vSub(targetPos, p.pos)), 250); // sprint
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
