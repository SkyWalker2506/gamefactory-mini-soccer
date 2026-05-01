import { state, initWorld } from "../game/world";
import { resetPositionsForKickoff } from "../game/match";

export function mountTitleScreen(uiRoot: HTMLElement) {
  uiRoot.innerHTML = `
    <div id="title-screen" style="width:100%; height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; background:rgba(0,0,0,0.8); color:#fff; pointer-events:auto;">
      <h1 style="font-size: 64px; margin-bottom: 20px;">MINI SOCCER</h1>
      
      <div style="margin-bottom: 30px; font-size: 20px;">
        <label><input type="radio" name="diff" value="0.4"> Easy</label>
        <label style="margin: 0 15px;"><input type="radio" name="diff" value="0.7" checked> Normal</label>
        <label><input type="radio" name="diff" value="0.95"> Hard</label>
      </div>

      <button id="btn-play" style="font-size: 32px; padding: 15px 40px; background: #4488ff; color: white; border: none; border-radius: 8px; cursor: pointer;">PLAY</button>
    </div>
  `;

  document.getElementById("btn-play")?.addEventListener("click", () => {
    const diff = parseFloat((document.querySelector('input[name="diff"]:checked') as HTMLInputElement).value);
    
    const params = new URLSearchParams(window.location.search);
    const seedParam = params.get('seed');
    const initialSeed = seedParam ? parseInt(seedParam, 10) : Date.now();
    
    initWorld(initialSeed);
    state.difficulty = diff;
    resetPositionsForKickoff('BLUE');
    state.matchState = 'KICKOFF';
    state.kickoffTimer = 3;
    
    uiRoot.innerHTML = '';
    mountHUD(uiRoot);
  });
}

export function mountHUD(uiRoot: HTMLElement) {
  const hud = document.createElement("div");
  hud.id = "hud";
  hud.style.cssText = "position:absolute; top:20px; left:50%; transform:translateX(-50%); width:300px; height:32px; background:rgba(0,0,0,0.6); display:flex; justify-content:space-between; align-items:center; padding:0 20px; border-radius:16px; font-size:24px; font-weight:bold;";
  
  hud.innerHTML = `
    <span style="color:#4488ff" id="score-blue">0</span>
    <span id="match-time">3:00</span>
    <span style="color:#ff4444" id="score-red">0</span>
    <div style="position:absolute; bottom:-4px; left:0; height:4px; background:#fff; width:100%;" id="time-bar"></div>
  `;
  uiRoot.appendChild(hud);

  const updateHUD = () => {
    if (state.matchState === 'TITLE') return;
    const sBlue = document.getElementById("score-blue");
    const sRed = document.getElementById("score-red");
    const tMatch = document.getElementById("match-time");
    const tBar = document.getElementById("time-bar");
    
    if (sBlue) sBlue.textContent = state.score.blue.toString();
    if (sRed) sRed.textContent = state.score.red.toString();
    
    if (tMatch) {
      const m = Math.floor(state.timeRemaining / 60);
      const s = Math.floor(state.timeRemaining % 60);
      tMatch.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    }
    
    if (tBar) {
      tBar.style.width = `${(state.timeRemaining / 180) * 100}%`;
    }
    
    if (state.matchState !== 'END') {
        requestAnimationFrame(updateHUD);
    }
  };
  requestAnimationFrame(updateHUD);
}
