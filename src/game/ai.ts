import { state } from "./world";
import { Player, v2, vSub, vAdd, vMul, vLen, vLenSq, vNorm, vDist } from "../types";
import { executePass, executeShoot } from "./physics";

const FIELD_LEFT = 60, FIELD_RIGHT = 1220, FIELD_TOP = 60, FIELD_BOTTOM = 660;

let aiTickTimer = 0;

export function updateAI(dt: number) {
    aiTickTimer -= dt;
    if (aiTickTimer <= 0) {
        aiTickTimer = 0.1; // 100ms tick per GDD
        assignRoles();
        state.players.forEach(p => {
            if (!p.isHuman) {
                decideAction(p);
            }
        });
    }
}

function assignRoles() {
    const possessor = state.ball.lastTouchTeam; // 'BLUE' | 'RED' | null
    if (possessor === null) {
        // Loose ball: closest player on each team chases (PRESSURER), others hold formation
        assignLooseBallRoles('BLUE');
        assignLooseBallRoles('RED');
    } else {
        assignTeamRoles('BLUE', possessor === 'BLUE');
        assignTeamRoles('RED',  possessor === 'RED');
    }
}

function assignLooseBallRoles(team: 'BLUE' | 'RED') {
    const teamPlayers = state.players.filter(p => p.team === team);
    let closest: Player | null = null;
    let minDist = Infinity;
    teamPlayers.forEach(p => {
        const d = vDist(p.pos, state.ball.pos);
        if (d < minDist) { minDist = d; closest = p; }
    });
    let sweeperAssigned = false;
    teamPlayers.forEach(p => {
        if (p === closest) {
            p.role = 'PRESSURER';
        } else if (!sweeperAssigned) {
            p.role = 'SWEEPER';
            sweeperAssigned = true;
        } else {
            p.role = 'MARKER';
        }
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
            if (p.id === carrierId) p.role = 'BALL_CARRIER';
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
        const carrier = state.players.find(x => x.role === 'BALL_CARRIER' && x.team === p.team);
        if (carrier) {
            const dirX = p.team === 'BLUE' ? 1 : -1;
            const offsetY = p.role === 'LANE_RUNNER_1' ? -120 : 120;
            const anchor = v2(carrier.pos.x + 200 * dirX, carrier.pos.y + offsetY);
            
            // Clamp anchor
            anchor.x = Math.max(FIELD_LEFT, Math.min(FIELD_RIGHT, anchor.x));
            anchor.y = Math.max(FIELD_TOP, Math.min(FIELD_BOTTOM, anchor.y));
            
            p.vel = vMul(vNorm(vSub(anchor, p.pos)), 180);
        }
    } else if (p.role === 'PRESSURER') {
        // Move to point between ball and goal
        const ballToGoal = vNorm(vSub(v2(ownGoalX, 360), state.ball.pos));
        const targetPos = vAdd(state.ball.pos, vMul(ballToGoal, 25));
        p.vel = vMul(vNorm(vSub(targetPos, p.pos)), 250); // sprint
    } else if (p.role === 'SWEEPER') {
        const targetPos = v2(ownGoalX + (p.team === 'BLUE' ? 200 : -200), 360);
        p.vel = vMul(vNorm(vSub(targetPos, p.pos)), 180);
    } else if (p.role === 'MARKER') {
        // Mark most threatening
        let bestEnemy: Player | null = null;
        let minDist = 9999;
        for (const enemy of state.players) {
            if (enemy.team !== p.team && enemy.id !== state.ball.lastTouchedBy) {
                const d = vDist(enemy.pos, v2(ownGoalX, 360));
                if (d < minDist) { minDist = d; bestEnemy = enemy; }
            }
        }
        if (bestEnemy) {
            const dirX = p.team === 'BLUE' ? -1 : 1;
            const targetPos = v2(bestEnemy.pos.x + dirX * 30, bestEnemy.pos.y);
            p.vel = vMul(vNorm(vSub(targetPos, p.pos)), 180);
        } else {
            p.vel = v2(0,0);
        }
    }
}
