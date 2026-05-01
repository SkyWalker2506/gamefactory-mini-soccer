import { state } from "../game/world";
import { mountTitleScreen } from "./titleScreen";

export function mountMatchEndScreen(uiRoot: HTMLElement) {
  let resultText = "DRAW";
  let resultColor = "#fff";
  if (state.score.blue > state.score.red) { resultText = "YOU WIN!"; resultColor = "#4488ff"; }
  else if (state.score.red > state.score.blue) { resultText = "YOU LOSE!"; resultColor = "#ff4444"; }

  const panel = document.createElement("div");
  panel.style.cssText = "position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); width:480px; height:320px; background:rgba(0,0,0,0.9); border:4px solid " + resultColor + "; border-radius:16px; display:flex; flex-direction:column; justify-content:center; align-items:center; color:#fff; pointer-events:auto;";
  
  panel.innerHTML = `
    <h2 style="font-size: 48px; color: ${resultColor}; margin-bottom: 10px;">${resultText}</h2>
    <p style="font-size: 32px; margin-bottom: 40px;">${state.score.blue} - ${state.score.red}</p>
    <div style="display:flex; gap:20px;">
      <button id="btn-again" style="font-size: 24px; padding: 10px 20px; background: #4488ff; color: white; border: none; border-radius: 8px; cursor: pointer;">Play Again</button>
      <button id="btn-menu" style="font-size: 24px; padding: 10px 20px; background: #555; color: white; border: none; border-radius: 8px; cursor: pointer;">Main Menu</button>
    </div>
  `;
  
  uiRoot.appendChild(panel);

  document.getElementById("btn-again")?.addEventListener("click", () => {
     uiRoot.innerHTML = '';
     mountTitleScreen(uiRoot);
     document.getElementById("btn-play")?.click();
  });

  document.getElementById("btn-menu")?.addEventListener("click", () => {
    state.matchState = 'TITLE';
    uiRoot.innerHTML = '';
    mountTitleScreen(uiRoot);
  });
}
