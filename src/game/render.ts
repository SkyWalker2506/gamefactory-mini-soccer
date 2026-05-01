import { state } from "./world";
import { assets } from "./tint";

const PITCH_W = 1280, PITCH_H = 720;
const FIELD_LEFT = 60, FIELD_RIGHT = 1220, FIELD_TOP = 60, FIELD_BOTTOM = 660;
const GOAL_TOP_Y = 270, GOAL_BOTTOM_Y = 450;
const GOAL_DEPTH = 30;

export function render(ctx: CanvasRenderingContext2D) {
  ctx.save();

  if (state.matchState === 'TITLE') {
    ctx.fillStyle = '#000';
    ctx.fillRect(0,0,PITCH_W,PITCH_H);
    ctx.restore();
    return;
  }

  // Camera shake
  if (state.cameraShake > 0) {
    const dx = (Math.random() - 0.5) * 6;
    const dy = (Math.random() - 0.5) * 6;
    ctx.translate(dx, dy);
  }

  // Field
  if (assets.field) {
    ctx.drawImage(assets.field, 0, 0, PITCH_W, PITCH_H);
  } else {
    ctx.fillStyle = '#2d5a27';
    ctx.fillRect(0,0,PITCH_W,PITCH_H);
  }

  // Pitch markings (semi-transparent white)
  ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
  ctx.lineWidth = 3;
  // Center line
  ctx.beginPath();
  ctx.moveTo(640, FIELD_TOP);
  ctx.lineTo(640, FIELD_BOTTOM);
  ctx.stroke();
  // Center circle
  ctx.beginPath();
  ctx.arc(640, 360, 60, 0, Math.PI * 2);
  ctx.stroke();
  // Center spot
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.beginPath();
  ctx.arc(640, 360, 3, 0, Math.PI * 2);
  ctx.fill();

  // Goals & Nets
  drawGoal(ctx, 'RED', FIELD_LEFT - GOAL_DEPTH, GOAL_TOP_Y);
  drawGoal(ctx, 'BLUE', FIELD_RIGHT, GOAL_TOP_Y);

  // Ball Trail
  for (const tr of state.ball.trail) {
      ctx.globalAlpha = tr.alpha;
      if (assets.ball) ctx.drawImage(assets.ball, tr.x - 12, tr.y - 12, 24, 24);
  }
  ctx.globalAlpha = 1.0;

  // Player Shadows
  state.players.forEach(p => {
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(p.pos.x, p.pos.y + 14, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // Ball Shadow
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(state.ball.pos.x, state.ball.pos.y + 14, 10, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Entities Y-sort (players only — ball drawn on top after)
  const entities: any[] = [];
  state.players.forEach(p => entities.push({ type: 'player', y: p.pos.y, obj: p }));
  entities.sort((a, b) => a.y - b.y);

  entities.forEach(e => {
    if (e.type === 'player') {
      const p = e.obj;
      const set = p.team === 'BLUE' ? assets.blue : assets.red;
      if (set) {
        let frames: ImageBitmap[] = set.down;
        let flipX = false;
        let fps = 12;
        switch (p.spriteName) {
          case 'up':    frames = set.up;    break;
          case 'down':  frames = set.down;  break;
          case 'right': frames = set.right; break;
          case 'left':  frames = set.right; flipX = true; break;
          case 'shoot': frames = set.shoot; fps = 18; break;
          case 'idle':  frames = set.down;  break;
        }
        const idx = p.spriteName === 'idle'
          ? 0
          : Math.floor(p.animTimer * fps) % frames.length;
        const sprite = frames[idx];
        if (sprite) {
          const targetH = 60;
          const dh = targetH;
          const dw = sprite.width / sprite.height * dh;
          if (flipX) {
            ctx.save();
            ctx.translate(p.pos.x, p.pos.y);
            ctx.scale(-1, 1);
            ctx.drawImage(sprite, -dw / 2, -dh / 2 - 10, dw, dh);
            ctx.restore();
          } else {
            ctx.drawImage(sprite, p.pos.x - dw / 2, p.pos.y - dh / 2 - 10, dw, dh);
          }
        }
      }
      // Human indicator
      if (p.isHuman) {
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.pos.x, p.pos.y - 20, 8, 0, Math.PI * 2);
        ctx.stroke();
        
        // Stamina bar
        ctx.fillStyle = '#000';
        ctx.fillRect(p.pos.x - 15, p.pos.y - 30, 30, 4);
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(p.pos.x - 15, p.pos.y - 30, 30 * (p.stamina / 100), 4);
      }
    }
  });

  // Ball drawn on top so it's never hidden by players
  {
    const b = state.ball;
    const scale = b.z;
    const size = 72 * scale;
    const yOffset = (scale - 1) * -40;
    if (assets.ball) {
      ctx.drawImage(assets.ball, b.pos.x - size/2, b.pos.y - size/2 + yOffset, size, size);
    } else {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.pos.x, b.pos.y + yOffset, size/2, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // FX
  state.fx.forEach(fx => {
    if (fx.type === 'CONFETTI') {
      ctx.fillStyle = fx.color || '#fff';
      ctx.fillRect(fx.pos.x, fx.pos.y, 4, 4);
    } else if (fx.type === 'TEXT') {
      ctx.fillStyle = fx.color || '#fff';
      ctx.font = 'bold 48px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(fx.text || '', fx.pos.x, fx.pos.y);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#000';
      ctx.strokeText(fx.text || '', fx.pos.x, fx.pos.y);
    }
  });

  // Time-of-day tint
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = "rgba(255, 140, 0, 0.08)"; // Warm evening orange
  ctx.fillRect(0, 0, PITCH_W, PITCH_H);
  ctx.globalCompositeOperation = "source-over";

  // Minimap
  drawMiniMap(ctx);

  // Controls HUD (bottom-left)
  drawControls(ctx);

  if (state.matchState === 'KICKOFF') {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 72px sans-serif';
    ctx.textAlign = 'center';
    const text = Math.ceil(state.kickoffTimer) > 0 ? Math.ceil(state.kickoffTimer).toString() : 'GO!';
    ctx.fillText(text, 640, 360);
    ctx.strokeStyle = '#000';
    ctx.strokeText(text, 640, 360);
  }

  ctx.restore();
}

function drawGoal(ctx: CanvasRenderingContext2D, team: 'BLUE'|'RED', x: number, y: number) {
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.fillRect(x, y, GOAL_DEPTH, 180);
  
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, GOAL_DEPTH, 180);
  
  // Net
  ctx.beginPath();
  const flutter = team === 'BLUE' ? state.netFlutter.blue : state.netFlutter.red;
  for(let i=1; i<6; i++) {
    const wave = flutter > 0 ? Math.sin(Date.now()/50 + i) * 5 * flutter : 0;
    ctx.moveTo(x + i*5 + wave, y);
    ctx.lineTo(x + i*5 + wave, y + 180);
  }
  for(let i=1; i<8; i++) {
    ctx.moveTo(x, y + i*22.5);
    ctx.lineTo(x + GOAL_DEPTH, y + i*22.5);
  }
  ctx.stroke();
}

function drawControls(ctx: CanvasRenderingContext2D) {
  const controls = [
    { key: '↑↓←→ / WASD', action: 'Hareket' },
    { key: 'Shift',        action: 'Sprint' },
    { key: 'Space / J',   action: 'Pas' },
    { key: 'X / K',       action: 'Şut' },
    { key: 'Q / Tab',     action: 'Oyuncu değiştir' },
    { key: 'Esc',         action: 'Duraklat' },
  ];
  const x0 = 12, y0 = PITCH_H - 12 - controls.length * 18;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(x0 - 4, y0 - 14, 230, controls.length * 18 + 8);
  ctx.font = 'bold 13px monospace';
  controls.forEach((c, i) => {
    const y = y0 + i * 18;
    ctx.fillStyle = '#ffe066';
    ctx.textAlign = 'left';
    ctx.fillText(c.key, x0, y);
    ctx.fillStyle = '#fff';
    ctx.fillText(` — ${c.action}`, x0 + 100, y);
  });
  ctx.restore();
}

function drawMiniMap(ctx: CanvasRenderingContext2D) {
  const mw = 160, mh = 90;
  const mx = PITCH_W - mw - 20, my = 20;
  
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(mx, my, mw, mh);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
  ctx.strokeRect(mx, my, mw, mh);
  
  state.players.forEach(p => {
    ctx.fillStyle = p.team === 'BLUE' ? '#4488ff' : '#ff4444';
    ctx.beginPath();
    ctx.arc(mx + (p.pos.x / PITCH_W) * mw, my + (p.pos.y / PITCH_H) * mh, 3, 0, Math.PI*2);
    ctx.fill();
  });
  
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(mx + (state.ball.pos.x / PITCH_W) * mw, my + (state.ball.pos.y / PITCH_H) * mh, 2, 0, Math.PI*2);
  ctx.fill();
}
