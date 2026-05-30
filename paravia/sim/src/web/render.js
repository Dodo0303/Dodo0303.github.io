// Canvas rendering of the infinite plane. Pure draw — reads a scene, writes
// pixels. Near-monochrome; charge is shown as solid (charged) vs dashed
// (discharged), matching the paper's notation.

import {                     isArrow, HALT, floorMod } from "../engine/index.js";
import {             arrowOf, colorOf } from "./draft.js";

// Decorative cell tints (index 1..N; 0 = none). Soft pastels so dark arrows read
// on top. Purely a design aid — the engine never sees these.
export const COLORS = ["#fde68a", "#a7f3d0", "#bfdbfe", "#fbcfe8", "#ddd6fe", "#fecaca"];

                         
                                                    
             
                                   
 

                        
               
                 
                                                                                                  
                                                                                                   
                                         
                                                  
                                                                            
                                                                                                    
 

const C = {
  bg: "#fbfbf9",
  line: "#ebe9e3",
  tileLine: "#d4d1c7",
  ink: "#26241f",
  ghost: "#bdb9ad",
  accent: "#2f6df6",
  ball: "#e0533d",
};

const ANGLE = [-Math.PI / 2, Math.PI, Math.PI / 2, 0]; // up, left, down, right (y grows down)

const sx = (cam        , w        , x        )         => (x - cam.cx) * cam.scale + w / 2;
const sy = (cam        , h        , y        )         => (y - cam.cy) * cam.scale + h / 2;

export function screenToWorld(cam        , w        , h        , px        , py        )                           {
  return { x: (px - w / 2) / cam.scale + cam.cx, y: (py - h / 2) / cam.scale + cam.cy };
}
export const cellAt = (cam        , w        , h        , px        , py        )                           => {
  const p = screenToWorld(cam, w, h, px, py);
  return { x: Math.floor(p.x), y: Math.floor(p.y) };
};

function drawArrow(ctx                          , cx        , cy        , s        , dir     , charged         )       {
  const L = s * 0.52;
  const head = s * 0.2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ANGLE[dir]);
  ctx.lineWidth = charged ? Math.max(1.4, s * 0.07) : Math.max(1, s * 0.05);
  ctx.strokeStyle = charged ? C.ink : C.ghost;
  ctx.setLineDash(charged ? [] : [s * 0.12, s * 0.1]);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(-L / 2, 0);
  ctx.lineTo(L / 2, 0);
  ctx.moveTo(L / 2, 0);
  ctx.lineTo(L / 2 - head, -head);
  ctx.moveTo(L / 2, 0);
  ctx.lineTo(L / 2 - head, head);
  ctx.stroke();
  ctx.restore();
}

function tileOutline(ctx                          , cam        , w        , h        , tx        , ty        , W        , H        , color        , lw        )       {
  const x = sx(cam, w, tx);
  const y = sy(cam, h, ty);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.setLineDash([]);
  ctx.strokeRect(x, y, W * cam.scale, H * cam.scale);
}

export function render(ctx                          , w        , h        , scene       )       {
  const { camera: cam, draft: d } = scene;
  const s = cam.scale;

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, w, h);

  // Visible cell range, clamped to the tile in phase 1.
  let x0 = Math.floor(cam.cx - w / 2 / s) - 1;
  let x1 = Math.ceil(cam.cx + w / 2 / s) + 1;
  let y0 = Math.floor(cam.cy - h / 2 / s) - 1;
  let y1 = Math.ceil(cam.cy + h / 2 / s) + 1;
  if (!scene.showTiling) {
    x0 = Math.max(x0, 0); y0 = Math.max(y0, 0);
    x1 = Math.min(x1, d.W); y1 = Math.min(y1, d.H);
  }

  // Decorative tints, painted under everything (grid hairlines draw on top).
  for (let gy = y0; gy < y1; gy++) {
    for (let gx = x0; gx < x1; gx++) {
      const idx = colorOf(d, gx, gy);
      if (idx > 0) {
        ctx.fillStyle = COLORS[(idx - 1) % COLORS.length];
        ctx.fillRect(sx(cam, w, gx), sy(cam, h, gy), s, s);
      }
    }
  }

  // Grid hairlines (skip when too dense to read).
  if (s >= 5) {
    ctx.lineCap = "butt";
    for (let gx = x0; gx <= x1; gx++) {
      const onTile = floorMod(gx, d.W) === 0;
      ctx.strokeStyle = onTile ? C.tileLine : C.line;
      ctx.lineWidth = onTile ? 1.25 : 1;
      ctx.beginPath();
      ctx.moveTo(sx(cam, w, gx), sy(cam, h, y0));
      ctx.lineTo(sx(cam, w, gx), sy(cam, h, y1));
      ctx.stroke();
    }
    for (let gy = y0; gy <= y1; gy++) {
      const onTile = floorMod(gy, d.H) === 0;
      ctx.strokeStyle = onTile ? C.tileLine : C.line;
      ctx.lineWidth = onTile ? 1.25 : 1;
      ctx.beginPath();
      ctx.moveTo(sx(cam, w, x0), sy(cam, h, gy));
      ctx.lineTo(sx(cam, w, x1), sy(cam, h, gy));
      ctx.stroke();
    }
  }

  // Highlighted tile (start tile / ball tile).
  if (scene.highlight) tileOutline(ctx, cam, w, h, scene.highlight.x, scene.highlight.y, d.W, d.H, C.accent, 2);

  // Cell contents.
  for (let gy = y0; gy < y1; gy++) {
    for (let gx = x0; gx < x1; gx++) {
      const sym = arrowOf(d, gx, gy);
      const ccx = sx(cam, w, gx + 0.5);
      const ccy = sy(cam, h, gy + 0.5);
      if (sym === HALT) {
        ctx.fillStyle = C.ink;
        const q = s * 0.34;
        ctx.fillRect(ccx - q, ccy - q, q * 2, q * 2);
      } else if (isArrow(sym) && s >= 8) {
        drawArrow(ctx, ccx, ccy, s, sym, scene.charge(gx, gy) === 1);
      } else if (isArrow(sym)) {
        ctx.fillStyle = scene.charge(gx, gy) === 1 ? C.ink : C.ghost;
        ctx.beginPath();
        ctx.arc(ccx, ccy, Math.max(1, s * 0.12), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Ball trail (oldest faint → newest).
  const n = scene.trail.length;
  for (let i = 0; i < n; i++) {
    const t = scene.trail[i];
    ctx.globalAlpha = ((i + 1) / (n + 1)) * 0.35;
    ctx.fillStyle = C.ball;
    ctx.beginPath();
    ctx.arc(sx(cam, w, t.x + 0.5), sy(cam, h, t.y + 0.5), s * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Start marker: a dashed ring (the ball-to-be) sized to enclose the cell's
  // arrow, so it doesn't overlap the glyph. It contracts into the solid ball on run.
  // Only shown on the plane (charge phase) — not while editing geometry.
  if (d.start && !scene.ball && scene.showTiling) {
    ctx.strokeStyle = C.ball;
    ctx.lineWidth = Math.max(1.5, s * 0.05);
    ctx.setLineDash([Math.max(2, s * 0.16), Math.max(2, s * 0.12)]);
    ctx.beginPath();
    ctx.arc(sx(cam, w, d.start.x + 0.5), sy(cam, h, d.start.y + 0.5), s * 0.42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Ball.
  if (scene.ball) {
    ctx.fillStyle = C.ball;
    ctx.beginPath();
    ctx.arc(sx(cam, w, scene.ball.x + 0.5), sy(cam, h, scene.ball.y + 0.5), s * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Hover cell.
  if (scene.hover && s >= 5) {
    ctx.strokeStyle = C.accent;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.strokeRect(sx(cam, w, scene.hover.x) + 1, sy(cam, h, scene.hover.y) + 1, s - 2, s - 2);
    ctx.globalAlpha = 1;
  }
}
