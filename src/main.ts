import { preloadAndTintAssets } from "./game/tint";
import { startGameLoop, initWorld } from "./game/world";
import { render } from "./game/render";
import { mountTitleScreen } from "./ui/titleScreen";
import { mountMatchEndScreen } from "./ui/matchEndScreen";
import { mountPauseOverlay } from "./ui/pauseOverlay";

async function boot() {
  await preloadAndTintAssets();
  
  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const uiRoot = document.getElementById("ui-root")!;
  
  initWorld(Date.now()); // Dummy init to ensure state is defined
  mountTitleScreen(uiRoot);

  window.addEventListener("match-end", () => {
    mountMatchEndScreen(uiRoot);
  });

  window.addEventListener("toggle-pause", () => {
    if (document.getElementById("pause-overlay")) {
       // logic toggles, but here we can just do nothing if handled
    } else {
       mountPauseOverlay(uiRoot);
    }
  });

  startGameLoop(() => render(ctx));
}

boot();
