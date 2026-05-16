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

  // BLUE defends LEFT goal → blue half is x < 640. RED defends RIGHT → red half is x > 640.
  // For each team [0]=GK (deep, on own goal line), [1]=outfield upper, [2]=outfield lower.
  // The kicking team's striker (one outfielder) is pushed up to the center spot, touching ball.

  const blueGK    = { x: FIELD_LEFT + 30,  y: 360 };
  const redGK     = { x: FIELD_RIGHT - 30, y: 360 };

  // Default (defending) outfield: spread vertically inside own defensive half
  const blueDefendUpper = { x: 280, y: 220 };
  const blueDefendLower = { x: 280, y: 500 };
  const redDefendUpper  = { x: 1000, y: 220 };
  const redDefendLower  = { x: 1000, y: 500 };

  // Attacking team formation: 1 striker on center spot, 2 wingers slightly behind
  // (still in own half) spread vertically.
  const blueAttackStriker = { x: 620, y: 360 }; // just behind ball, touching it
  const blueAttackWingerU = { x: 480, y: 240 };
  const blueAttackWingerL = { x: 480, y: 480 };
  const redAttackStriker  = { x: 660, y: 360 };
  const redAttackWingerU  = { x: 800, y: 240 };
  const redAttackWingerL  = { x: 800, y: 480 };

  const bluePositions = kickingTeam === 'BLUE'
    ? [blueGK, blueAttackStriker, blueAttackWingerU, blueAttackWingerL]
    : [blueGK, blueDefendUpper, blueDefendLower];
  const redPositions = kickingTeam === 'RED'
    ? [redGK, redAttackStriker, redAttackWingerU, redAttackWingerL]
    : [redGK, redDefendUpper, redDefendLower];

  // 3-player rosters: drop the extra winger from the attacking layouts
  if (bluePositions.length > 3) bluePositions.length = 3;
  if (redPositions.length > 3) redPositions.length = 3;

  const bluePlayers = state.players.filter(p => p.team === 'BLUE');
  const redPlayers  = state.players.filter(p => p.team === 'RED');

  state.players.forEach(p => {
    p.vel = {x: 0, y: 0};
    p.state = 'IDLE';
    p.isSprinting = false;
    // Clear stale pickup-debounce so the striker at the center spot can grab
    // the free ball immediately on kickoff (otherwise a leftover 0.15s window
    // from before the goal blocks possession and play deadlocks).
    p.touchWindowTimer = 0;
    p.slideTimer = 0;
  });
  bluePlayers.forEach((p, i) => {
    p.pos = { ...bluePositions[i] };
    p.facing = { x: 1, y: 0 };
    // First BLUE slot is goalkeeper — lock the role so AI uses GK behavior.
    if (i === 0) p.role = 'GOALKEEPER';
  });
  redPlayers.forEach((p, i) => {
    p.pos = { ...redPositions[i] };
    p.facing = { x: -1, y: 0 };
    if (i === 0) p.role = 'GOALKEEPER';
  });

  // Human controls the first BLUE outfielder (slot 1), never the keeper.
  const humanCandidate = bluePlayers[1] ?? bluePlayers[0];
  if (humanCandidate) {
    bluePlayers.forEach(p => { p.isHuman = false; });
    redPlayers.forEach(p => { p.isHuman = false; });
    humanCandidate.isHuman = true;
    state.humanPlayerId = humanCandidate.id;
  }
}
