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

  // Camera shake — magnitude scales with remaining duration, max ±2px
  if (state.cameraShake > 0) {
    const mag = Math.min(state.cameraShake, 1) * 2;
    const dx = (Math.random() - 0.5) * mag;
    const dy = (Math.random() - 0.5) * mag;
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
      // Slide sprite (8-frame sheet, side-view, faces +X)
      if (p.state === 'SLIDE') {
        const frames = p.team === 'BLUE' ? assets.slideBlue : assets.slideRed;
        if (frames && frames.length > 0) {
          // Play full sequence over slide duration (~0.5s) — clamp to last frame
          const progress = Math.min(1, p.animTimer / 0.5);
          const idx = Math.min(frames.length - 1, Math.floor(progress * frames.length));
          const sprite = frames[idx];
          const targetH = 180;
          const dh = targetH;
          const dw = sprite.width / sprite.height * dh;
          // Use facing.x to determine flip; for pure up/down slides default to right
          const flipX = p.facing.x < -0.01;
          ctx.save();
          ctx.translate(p.pos.x, p.pos.y - 6);
          if (flipX) ctx.scale(-1, 1);
          ctx.drawImage(sprite, -dw / 2, -dh / 2, dw, dh);
          ctx.restore();
        } else {
          // Fallback: streak under player to show motion
          ctx.save();
          ctx.fillStyle = p.team === 'BLUE' ? 'rgba(80,160,255,0.7)' : 'rgba(255,90,90,0.7)';
          ctx.translate(p.pos.x, p.pos.y);
          ctx.rotate(Math.atan2(p.facing.y, p.facing.x));
          ctx.fillRect(-30, -8, 60, 16);
          ctx.restore();
        }
      } else {
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
          const targetH = 180;
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
      } // end non-SLIDE sprite branch
      // Human indicator: highlight ring + arrow above
      if (p.isHuman) {
        // Yellow selection ring
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(p.pos.x, p.pos.y, 18, 0, Math.PI * 2);
        ctx.stroke();

        // Small downward arrow above player
        const ax = p.pos.x, ay = p.pos.y - 42;
        ctx.fillStyle = '#ffff00';
        ctx.beginPath();
        ctx.moveTo(ax, ay + 10);       // arrow tip
        ctx.lineTo(ax - 7, ay);        // left wing
        ctx.lineTo(ax + 7, ay);        // right wing
        ctx.closePath();
        ctx.fill();

        // Stamina bar
        ctx.fillStyle = '#000';
        ctx.fillRect(p.pos.x - 15, p.pos.y - 34, 30, 4);
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(p.pos.x - 15, p.pos.y - 34, 30 * (p.stamina / 100), 4);

        // Slide cooldown bar (cyan when ready, gray while charging)
        ctx.fillStyle = '#000';
        ctx.fillRect(p.pos.x - 15, p.pos.y - 28, 30, 3);
        const slideReady = 1 - Math.min(1, p.slideCooldown / 5);
        ctx.fillStyle = p.slideCooldown <= 0 ? '#00e5ff' : '#888';
        ctx.fillRect(p.pos.x - 15, p.pos.y - 28, 30 * slideReady, 3);
      }
    }
  });

  // Ball drawn on top so it's never hidden by players
  {
    const b = state.ball;
    const scale = b.z;
    const size = 56 * scale;
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
    { key: 'C / L',       action: 'Kayma (5sn)' },
    { key: 'Q / Tab',     action: 'Oyuncu değiştir' },
    { key: 'Esc',         action: 'Duraklat' },
  ];
  const x0 = 12, y0 = PITCH_H - 12 - controls.length * 18;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(x0 - 4, y0 - 14, 255, controls.length * 18 + 8);
  ctx.font = 'bold 13px monospace';
  controls.forEach((c, i) => {
    const y = y0 + i * 18;
    ctx.fillStyle = '#ffe066';
    ctx.textAlign = 'left';
    ctx.fillText(c.key, x0, y);
    ctx.fillStyle = '#fff';
    ctx.fillText(` — ${c.action}`, x0 + 115, y);
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
