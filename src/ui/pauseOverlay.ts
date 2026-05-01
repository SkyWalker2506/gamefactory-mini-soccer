import { state } from "../game/world";
import { mountTitleScreen } from "./titleScreen";

export function mountPauseOverlay(uiRoot: HTMLElement) {
  const panel = document.createElement("div");
  panel.id = "pause-overlay";
  panel.style.cssText = "position:absolute; inset:0; background:rgba(0,0,0,0.7); display:flex; flex-direction:column; justify-content:center; align-items:center; color:#fff; z-index:100; pointer-events:auto;";
  
  panel.innerHTML = `
    <h2 style="font-size: 48px; margin-bottom: 40px;">PAUSED</h2>
    <div style="display:flex; gap:20px;">
      <button id="btn-resume" style="font-size: 24px; padding: 10px 20px; background: #4488ff; color: white; border: none; border-radius: 8px; cursor: pointer;">Resume</button>
      <button id="btn-quit" style="font-size: 24px; padding: 10px 20px; background: #ff4444; color: white; border: none; border-radius: 8px; cursor: pointer;">Quit to Menu</button>
    </div>
  `;
  
  uiRoot.appendChild(panel);

  document.getElementById("btn-resume")?.addEventListener("click", () => {
    state.isPaused = false;
    panel.remove();
  });

  document.getElementById("btn-quit")?.addEventListener("click", () => {
    state.isPaused = false;
    state.matchState = 'TITLE';
    uiRoot.innerHTML = '';
    mountTitleScreen(uiRoot);
  });
}
