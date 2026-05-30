// The app: a small state machine over four phases —
//   size → tile (paint geometry) → charge (infinite canvas) → run (playback).
// One canvas throughout; phases differ only in what's drawn and what a click does.

import {
           
  ParaviaSystem,
  parseConfig,
  glyph,
  isArrow,
  UP, LEFT, DOWN, RIGHT, BLANK, HALT,
  floorMod,
} from "../engine/index.js";
import {
             
  blankDraft,
  key,
  arrowOf,
  chargeOf,
  canRun,
  toggleBackground,
  toggleOverride,
  toConfig,
  fromConfig,
} from "./draft.js";
import {                          render, cellAt, screenToWorld, COLORS } from "./render.js";

                                       
// Charge-phase tools: charge edits (periodic / single cell), set start, or paint a decorative tint.
                                                         

const $ =                        (id        )    => document.getElementById(id)     ;
const canvas = $("view")                     ;
const ctx = canvas.getContext("2d") ;
const elPhase = $("phase");
const elTools = $("tools");
const elActions = $("actions");
const elStatus = $("status");

const view = { w: 0, h: 0 };

const S = {
  phase: "tile"         ,
  draft: blankDraft(5, 5),
  camera: { cx: 2.5, cy: 2.5, scale: 60 }          ,
  paint: RIGHT       , //          arrow brush (geometry phase)
  mode: "periodic"              , // charge phase tool
  tint: 1, //                       selected tint colour (charge phase)
  hover: null                                   ,
  sys: null                        ,
  trail: []                              ,
  playing: false,
  sps: 12, //                      steps per second when playing
  acc: 0,
  tween: null                                                                                                                      ,
};
const TRAIL_MAX = 28;

// Dev hook: lets the browser console (and automated checks) inspect/drive state.
(globalThis                           ).PARAVIA = S;

// ── canvas sizing ───────────────────────────────────────────────────────────

function resize()       {
  const r = canvas.getBoundingClientRect();
  view.w = r.width;
  view.h = r.height;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
new ResizeObserver(resize).observe(canvas);

// ── camera ──────────────────────────────────────────────────────────────────

function fitScale(pad        )         {
  const { W, H } = S.draft;
  return Math.min(view.w / (W + pad), view.h / (H + pad));
}
function centerOnTile()       {
  S.camera.cx = S.draft.W / 2;
  S.camera.cy = S.draft.H / 2;
}
function tweenScale(toS        , toCx        , toCy        , dur = 620)       {
  S.tween = { fromS: S.camera.scale, toS, fcx: S.camera.cx, tcx: toCx, fcy: S.camera.cy, tcy: toCy, t0: performance.now(), dur };
}
const easeOut = (t        )         => 1 - Math.pow(1 - t, 3);

function advance(now        )       {
  const tw = S.tween;
  if (!tw) return;
  const k = easeOut(Math.min(1, (now - tw.t0) / tw.dur));
  S.camera.scale = tw.fromS + (tw.toS - tw.fromS) * k;
  S.camera.cx = tw.fcx + (tw.tcx - tw.fcx) * k;
  S.camera.cy = tw.fcy + (tw.tcy - tw.fcy) * k;
  if (k >= 1) S.tween = null;
}

// ── main loop ─────────────────────────────────────────────────────────────────

let lastTime = performance.now();
function frame(now        )       {
  const dt = now - lastTime;
  lastTime = now;
  advance(now);

  if (S.phase === "run" && S.sys) {
    if (S.playing) {
      S.acc += (dt / 1000) * S.sps;
      let budget = 200_000;
      while (S.acc >= 1 && S.sys.status === "running" && budget-- > 0) {
        S.sys.step();
        pushTrail();
        S.acc -= 1;
      }
      if (S.sys.status !== "running") {
        S.playing = false;
        buildBar();
      }
    }
    const b = S.sys.snapshot();
    S.camera.cx += (b.x + 0.5 - S.camera.cx) * 0.12;
    S.camera.cy += (b.y + 0.5 - S.camera.cy) * 0.12;
  }

  draw();
  requestAnimationFrame(frame);
}

function pushTrail()       {
  const b = S.sys .snapshot();
  S.trail.push({ x: b.x, y: b.y });
  if (S.trail.length > TRAIL_MAX) S.trail.shift();
}

// ── scene assembly + draw ─────────────────────────────────────────────────────

function tileOrigin(x        , y        )                           {
  return { x: x - floorMod(x, S.draft.W), y: y - floorMod(y, S.draft.H) };
}

function draw()       {
  let highlight                                  = null;
  let ball                = null;
  if (S.phase === "tile") highlight = { x: 0, y: 0 };
  else if (S.phase === "run" && S.sys) {
    const b = S.sys.snapshot();
    ball = { x: b.x, y: b.y, dir: b.dir };
    highlight = tileOrigin(b.x, b.y);
  } else if (S.draft.start) highlight = tileOrigin(S.draft.start.x, S.draft.start.y);

  const sys = S.sys;
  const scene        = {
    draft: S.draft,
    camera: S.camera,
    charge: sys ? (x, y) => sys.chargeAt(x, y) : (x, y) => chargeOf(S.draft, x, y),
    showTiling: S.phase !== "tile",
    hover: S.phase === "charge" ? S.hover : S.phase === "tile" && S.hover && inTile(S.hover) ? S.hover : null,
    ball,
    trail: S.phase === "run" ? S.trail : [],
    highlight,
  };
  render(ctx, view.w, view.h, scene);
  updateStatus();
}

// ── chrome ────────────────────────────────────────────────────────────────────

// ■ renders cleanly in the UI font; the ∎ glyph used on the canvas does not.
const brushGlyph = (s     )         => (s === HALT ? "■" : s === BLANK ? "·" : glyph(s));

function btn(label        , onClick            , opts                                                                         = {})                    {
  const b = document.createElement("button");
  b.textContent = label;
  b.className = `btn${opts.cls ? " " + opts.cls : ""}${opts.active ? " active" : ""}`;
  if (opts.title) b.title = opts.title;
  b.disabled = !!opts.disabled;
  b.onclick = onClick;
  return b;
}
function group(...nodes        )                 {
  const g = document.createElement("div");
  g.className = "group";
  nodes.forEach((n) => g.appendChild(n));
  return g;
}

// Resize the tile in place, preserving the overlapping top-left region.
// Cheap because charges in geometry phase are still all-background; overrides
// and start (global coords) keep their meaning and are re-validated at run.
function setSize(W        , H        )       {
  const d = S.draft;
  if (W === d.W && H === d.H) return;
  d.tile = Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => (y < d.H && x < d.W ? d.tile[y][x] : BLANK)));
  d.background = Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => (y < d.H && x < d.W ? d.background[y][x] : 0)));
  d.W = W;
  d.H = H;
  centerOnTile();
  S.camera.scale = fitScale(1.4);
}

// The W × H control that lives in the geometry toolbar (replaces a size screen).
function sizeGroup()              {
  const dim = (val        , on                     )                   => {
    const i = document.createElement("input");
    i.type = "number";
    i.min = "1";
    i.max = "40";
    i.value = String(val);
    i.className = "dim";
    i.title = "tile size";
    i.onchange = () => {
      const v = Math.max(1, Math.min(40, Math.round(Number(i.value)) || 1));
      i.value = String(v);
      on(v);
    };
    return i;
  };
  const x = document.createElement("span");
  x.textContent = "×";
  x.className = "x";
  return group(dim(S.draft.W, (v) => setSize(v, S.draft.H)), x, dim(S.draft.H, (v) => setSize(S.draft.W, v)));
}

// Speed slider with a live "N/s" readout (updated without rebuilding the bar).
function speedControl()              {
  const cap = document.createElement("span");
  cap.className = "cap";
  cap.textContent = "speed";
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "1";
  slider.max = "400";
  slider.value = String(S.sps);
  slider.className = "speed";
  const val = document.createElement("span");
  val.className = "val";
  val.textContent = `${S.sps}/s`;
  slider.oninput = () => {
    S.sps = Number(slider.value);
    val.textContent = `${S.sps}/s`;
  };
  return group(cap, slider, val);
}

function buildBar()       {
  elTools.replaceChildren();
  elActions.replaceChildren();
  elPhase.textContent = { tile: "geometry", charge: "charges", run: "run" }[S.phase];
  document.body.dataset.phase = S.phase; // CSS hooks (e.g. the charge-phase top scrim)

  if (S.phase === "tile") {
    // No blank brush — right-click erases. ■ (not the ∎ glyph) renders cleanly here.
    const palette = [UP, LEFT, DOWN, RIGHT, HALT]         ;
    elTools.append(
      sizeGroup(),
      group(...palette.map((s) => btn(brushGlyph(s), () => { S.paint = s; buildBar(); }, { active: S.paint === s, cls: "brush" }))),
    );
    elActions.appendChild(btn("charges ›", () => toCharge(), { cls: "primary" }));
  } else if (S.phase === "charge") {
    const modes                         = [["periodic", "periodic"], ["cell", "single cell"], ["start", "set start"]];
    const swatches = COLORS.map((col, i) => {
      const b = btn("", () => { S.mode = "tint"; S.tint = i + 1; buildBar(); },
        { active: S.mode === "tint" && S.tint === i + 1, cls: "swatch", title: "tint cells (decorative)" });
      b.style.background = col;
      return b;
    });
    elTools.append(
      group(...modes.map(([m, label]) => btn(label, () => { S.mode = m; buildBar(); }, { active: S.mode === m }))),
      group(...swatches),
    );
    const copyBtn = btn("copy JSON", () => {});
    copyBtn.onclick = async () => {
      const ok = await copyConfig();
      copyBtn.textContent = ok ? "copied ✓" : "link in URL ✓"; // hash always updates
      copyBtn.classList.add("ok");
      window.setTimeout(() => { copyBtn.textContent = "copy JSON"; copyBtn.classList.remove("ok"); }, 1400);
    };
    elActions.appendChild(group(
      btn("‹ geometry", () => toTile()),
      copyBtn,
      btn("run ▶", () => toRun(), { cls: "primary", disabled: !canRun(S.draft), title: canRun(S.draft) ? "" : "set a start cell on an arrow first" }),
    ));
  } else if (S.phase === "run") {
    const playing = S.playing;
    elTools.append(
      group(
        btn("↺ reset", () => resetRun(), { title: "back to the start" }),
        btn("‹ back", () => { S.sys .stepBack(); S.trail.pop(); S.playing = false; buildBar(); }, { title: "one step back" }),
        btn(playing ? "❙❙ pause" : "▶ play", () => { S.playing = !S.playing; buildBar(); }, { cls: "primary" }),
        btn("step ›", () => { if (S.sys .status === "running") { S.sys .step(); pushTrail(); } S.playing = false; buildBar(); }, { title: "one step forward" }),
      ),
      speedControl(),
    );
    elActions.appendChild(btn("‹ edit", () => toEdit()));
  }
}

function updateStatus()       {
  if (S.phase === "tile") {
    elStatus.textContent = `${S.draft.W}×${S.draft.H} · brush ${brushGlyph(S.paint)} · drag to paint · right-click clears`;
  } else if (S.phase === "charge") {
    const h = S.hover;
    const where = h ? `cell (${h.x},${h.y}) ${isArrow(arrowOf(S.draft, h.x, h.y)) ? "charge " + chargeOf(S.draft, h.x, h.y) : "—"}` : "—";
    const st = S.draft.start ? `start (${S.draft.start.x},${S.draft.start.y})` : "no start";
    const hint = S.mode === "tint" ? " · click to tint · right-click clears" : "";
    elStatus.textContent = `${where} · ${st}${hint}`;
  } else if (S.phase === "run" && S.sys) {
    const b = S.sys.snapshot();
    elStatus.textContent = `step ${b.steps} · ball (${b.x},${b.y}) · heading ${glyph(b.dir)} · ${b.status}`;
  } else elStatus.textContent = "";
}

// ── phase transitions ───────────────────────────────────────────────────────

function toTile()       {
  S.phase = "tile";
  S.sys = null;
  centerOnTile();
  tweenScale(fitScale(1.4), S.draft.W / 2, S.draft.H / 2);
  buildBar();
}
function toCharge()       {
  S.phase = "charge";
  tweenScale(fitScale(1.4) * 0.42, S.draft.W / 2, S.draft.H / 2); // zoom out → the plane becomes infinite
  buildBar();
}
function toRun()       {
  if (!canRun(S.draft)) return;
  S.sys = new ParaviaSystem(parseConfig(toConfig(S.draft)));
  S.trail = [{ x: S.draft.start .x, y: S.draft.start .y }];
  S.playing = false;
  S.acc = 0;
  S.phase = "run";
  buildBar();
}
function toEdit()       {
  S.sys = null;
  S.trail = [];
  S.phase = "charge";
  buildBar();
}
function resetRun()       {
  S.sys = new ParaviaSystem(parseConfig(toConfig(S.draft)));
  S.trail = [{ x: S.draft.start .x, y: S.draft.start .y }];
  S.playing = false;
  S.acc = 0;
  buildBar();
}

// ── input ─────────────────────────────────────────────────────────────────────

let down = false;
let dragged = false;
let erasing = false; // right-button drag in the tile phase
let dragStart = { x: 0, y: 0 };
let last = { x: 0, y: 0 };
const pos = (e                                      )                           => {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};
const cellOf = (p                          ) => cellAt(S.camera, view.w, view.h, p.x, p.y);

canvas.addEventListener("pointerdown", (e) => {
  try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic / lost pointer */ }
  down = true;
  dragged = false;
  erasing = e.button === 2; // right button → erase (paint blank)
  dragStart = last = pos(e);
  if (S.phase === "tile") paintAt(dragStart, erasing);
});
canvas.addEventListener("pointermove", (e) => {
  const p = pos(e);
  S.hover = cellOf(p);
  if (down) {
    if (S.phase === "tile") {
      paintAt(p, erasing);
    } else if (!S.tween) {
      if (!dragged && Math.hypot(p.x - dragStart.x, p.y - dragStart.y) > 4) dragged = true;
      if (dragged) {
        S.camera.cx -= (p.x - last.x) / S.camera.scale;
        S.camera.cy -= (p.y - last.y) / S.camera.scale;
      }
    }
  }
  last = p;
});
canvas.addEventListener("pointerup", (e) => {
  if (!down) return;
  down = false;
  if (S.phase === "charge" && !dragged && !erasing) chargeClick(cellOf(pos(e)));
});
canvas.addEventListener("pointerleave", () => { S.hover = null; });
// Suppress the browser menu so right-drag can erase. Geometry erase is handled
// by the pointer handlers; in the charge phase, right-click clears a tint.
canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (S.phase === "charge") {
    const c = cellOf(pos(e));
    S.draft.colors.delete(key(c.x, c.y));
  }
});

canvas.addEventListener("wheel", (e) => {
  if (S.phase === "tile" || S.tween) return;
  e.preventDefault();
  const p = pos(e);
  const before = screenToWorld(S.camera, view.w, view.h, p.x, p.y);
  S.camera.scale = Math.max(4, Math.min(160, S.camera.scale * Math.exp(-e.deltaY * 0.0015)));
  const after = screenToWorld(S.camera, view.w, view.h, p.x, p.y);
  S.camera.cx += before.x - after.x; // keep the cursor anchored to its world point
  S.camera.cy += before.y - after.y;
}, { passive: false });

const inTile = (c                          )          =>
  c.x >= 0 && c.x < S.draft.W && c.y >= 0 && c.y < S.draft.H;

// Phase 1 edits only the finite tile, never a wrapped copy. Right-click erases.
function paintAt(p                          , erase         )       {
  const c = cellOf(p);
  if (!inTile(c)) return;
  S.draft.tile[c.y][c.x] = erase ? BLANK : S.paint;
}
function chargeClick(c                          )       {
  if (S.mode === "periodic") toggleBackground(S.draft, c.x, c.y);
  else if (S.mode === "cell") toggleOverride(S.draft, c.x, c.y);
  else if (S.mode === "start") { if (isArrow(arrowOf(S.draft, c.x, c.y))) S.draft.start = { x: c.x, y: c.y }; }
  else if (S.mode === "tint") S.draft.colors.set(key(c.x, c.y), S.tint);
  buildBar(); // run-enabled state may have changed
}

// ── export / sharing ──────────────────────────────────────────────────────────

// Legacy synchronous copy — works in contexts where the async Clipboard API is
// blocked (e.g. "document is not focused", some embeds).
function legacyCopy(text        )          {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.top = "-1000px";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { ok = false; }
  ta.remove();
  return ok;
}

// Copies the config JSON and refreshes the shareable URL hash (the hash always
// updates, so the permalink works even if the clipboard write is blocked).
async function copyConfig()                   {
  const json = JSON.stringify(toConfig(S.draft), null, 2);
  location.hash = encodeURIComponent(JSON.stringify(toConfig(S.draft)));
  try {
    await navigator.clipboard.writeText(json);
    return true;
  } catch {
    return legacyCopy(json);
  }
}

// ── boot ────────────────────────────────────────────────────────────────────

function boot()       {
  resize();
  // A config in the URL hash restores straight into the charge phase; otherwise
  // open the geometry editor on a default tile (size is adjustable inline).
  if (location.hash.length > 1) {
    try {
      S.draft = fromConfig(JSON.parse(decodeURIComponent(location.hash.slice(1))));
      toCharge();
    } catch {
      toTile();
    }
  } else {
    toTile();
  }
  requestAnimationFrame(frame);
}
boot();
