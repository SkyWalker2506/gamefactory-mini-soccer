import { state, mulberry32 } from "./world";

export function updateMatch(dt: number) {
  if (state.matchState === 'KICKOFF') {
    state.kickoffTimer -= dt;
    if (state.kickoffTimer <= 0) {
      state.matchState = 'PLAY';
    }
  } else if (state.matchState === 'PLAY') {
    state.timeRemaining -= dt;
    if (state.timeRemaining <= 0) {
      state.timeRemaining = 0;
      state.matchState = 'END';
      window.dispatchEvent(new CustomEvent("match-end"));
    }
    checkGoal();
  } else if (state.matchState === 'GOAL') {
    state.goalFreezeTimer -= dt;
    if (state.goalFreezeTimer <= 0) {
      resetPositionsForKickoff(state.ball.lastTouchTeam === 'BLUE' ? 'RED' : 'BLUE');
      state.matchState = 'KICKOFF';
      state.kickoffTimer = 3;
    }
  }

  // Update FX
  for (let i = state.fx.length - 1; i >= 0; i--) {
     state.fx[i].timer -= dt;
     if (state.fx[i].timer <= 0) {
       state.fx.splice(i, 1);
     } else if (state.fx[i].type === 'CONFETTI') {
       state.fx[i].vel.y += 600 * dt; // gravity
       state.fx[i].pos.x += state.fx[i].vel.x * dt;
       state.fx[i].pos.y += state.fx[i].vel.y * dt;
     }
  }
  if (state.cameraShake > 0) state.cameraShake -= dt;
  if (state.netFlutter.blue > 0) state.netFlutter.blue -= dt;
  if (state.netFlutter.red > 0) state.netFlutter.red -= dt;
  if (state.switchCooldown > 0) state.switchCooldown -= dt;
}

const FIELD_LEFT = 60, FIELD_RIGHT = 1220, FIELD_TOP = 60, FIELD_BOTTOM = 660;
const GOAL_TOP_Y = 270, GOAL_BOTTOM_Y = 450;

function checkGoal() {
  const bx = state.ball.pos.x;
  const by = state.ball.pos.y;
  
  if (by > GOAL_TOP_Y && by < GOAL_BOTTOM_Y) {
    if (bx < FIELD_LEFT) {
      triggerGoal('RED');
    } else if (bx > FIELD_RIGHT) {
      triggerGoal('BLUE');
    }
  }
}

export function triggerGoal(scoringTeam: 'BLUE' | 'RED') {
  if (state.matchState === 'GOAL') return;
  state.matchState = 'GOAL';
  state.goalFreezeTimer = 1.5;
  state.cameraShake = 0.12;
  
  if (scoringTeam === 'BLUE') {
    state.score.blue++;
    state.netFlutter.red = 1.2;
    spawnConfetti(1220, 360, ['#4488ff', '#ffffff']);
  } else {
    state.score.red++;
    state.netFlutter.blue = 1.2;
    spawnConfetti(60, 360, ['#ff4444', '#ffffff']);
  }
  
  state.fx.push({
    type: 'TEXT', text: 'GOAL!', pos: {x: 640, y: 360}, vel: {x: 0, y: -50}, timer: 1.5, color: '#ffea00'
  });
}

function spawnConfetti(x: number, y: number, colors: string[]) {
  for (let i = 0; i < 12; i++) {
    const angle = (mulberry32() * Math.PI) - Math.PI/2;
    const speed = 200 + mulberry32() * 200;
    const dir = x < 640 ? 1 : -1;
    state.fx.push({
      type: 'CONFETTI',
      pos: { x, y },
      vel: { x: Math.cos(angle) * speed * dir, y: Math.sin(angle) * speed - 200 },
      color: colors[Math.floor(mulberry32() * colors.length)],
      timer: 1.2
    });
  }
}

export function resetPositionsForKickoff(kickingTeam: 'BLUE' | 'RED') {
  state.ball.pos = { x: 640, y: 360 };
  state.ball.vel = { x: 0, y: 0 };
  state.ball.z = 1;
  state.ball.lastTouchedBy = null;
  state.ball.trail = [];
  
  const bluePositions = [{x: 580, y: 360}, {x: 400, y: 200}, {x: 400, y: 520}];
  const redPositions = [{x: 700, y: 360}, {x: 880, y: 200}, {x: 880, y: 520}];
  
  if (kickingTeam === 'BLUE') {
    bluePositions[0].x = 620;
  } else {
    redPositions[0].x = 660;
  }
  
  const bluePlayers = state.players.filter(p => p.team === 'BLUE');
  const redPlayers  = state.players.filter(p => p.team === 'RED');

  state.players.forEach(p => { p.vel = {x: 0, y: 0}; p.state = 'IDLE'; p.isSprinting = false; });
  bluePlayers.forEach((p, i) => { p.pos = {...bluePositions[i]}; p.facing = {x: 1, y: 0}; });
  redPlayers.forEach((p, i)  => { p.pos = {...redPositions[i]};  p.facing = {x: -1, y: 0}; });
  
  if (state.players[0].team === 'BLUE') {
    state.humanPlayerId = 0;
  }
}
