// The mutable preset being authored. It is the GUI's source of truth and lowers
// losslessly into the engine's ParaviaConfig (the on-disk / shareable format).

import {
           
           
                     
  BLANK,
  isArrow,
  glyph,
  parseSym,
  floorMod,
} from "../engine/index.js";

                        
            
            
                                           
                                                  
                                                               
                                                                                       
                                         
 

export const key = (x        , y        )         => `${x},${y}`;

export function blankDraft(W        , H        )        {
  const grid =    (v   )        => Array.from({ length: H }, () => Array   (W).fill(v));
  return { W, H, tile: grid     (BLANK), background: grid     (0), overrides: new Map(), colors: new Map(), start: null };
}

// --- queries over the infinite plane ---

export const arrowOf = (d       , x        , y        )      =>
  d.tile[floorMod(y, d.H)][floorMod(x, d.W)];

export const colorOf = (d       , x        , y        )         => d.colors.get(key(x, y)) ?? 0;

export function chargeOf(d       , x        , y        )      {
  const o = d.overrides.get(key(x, y));
  return o !== undefined ? o : d.background[floorMod(y, d.H)][floorMod(x, d.W)];
}

export const canRun = (d       )          => d.start !== null && isArrow(arrowOf(d, d.start.x, d.start.y));

// --- edits ---

export function toggleBackground(d       , x        , y        )       {
  const ly = floorMod(y, d.H);
  const lx = floorMod(x, d.W);
  d.background[ly][lx] = (1 - d.background[ly][lx])       ;
}

export function toggleOverride(d       , x        , y        )       {
  const k = key(x, y);
  const cur = chargeOf(d, x, y);
  const next = (1 - cur)       ;
  // Drop the override when it coincides with the background — keeps it sparse.
  if (next === d.background[floorMod(y, d.H)][floorMod(x, d.W)]) d.overrides.delete(k);
  else d.overrides.set(k, next);
}

// --- serialization ---

export function toConfig(d       )                {
  const cfg                = {
    tile: d.tile.map((row) => row.map(glyph)),
    background: d.background.map((row) => row.slice()),
    start: d.start ? { x: d.start.x, y: d.start.y } : { x: 0, y: 0 },
  };
  if (d.overrides.size) cfg.overrides = Object.fromEntries(d.overrides);
  if (d.colors.size) cfg.colors = Object.fromEntries(d.colors);
  return cfg;
}

// Inverse of toConfig (for URL-hash restore). Patches, if present, are ignored —
// our own exports only ever use the sparse `overrides` form.
export function fromConfig(cfg               )        {
  const H = cfg.tile.length;
  const W = cfg.tile[0].length;
  const tile = cfg.tile.map((row) => row.map(parseSym));
  const background = cfg.background.map((row) => row.map((b) => (b ? 1 : 0)       ));
  const overrides = new Map             ();
  for (const [k, v] of Object.entries(cfg.overrides ?? {})) overrides.set(k, (v ? 1 : 0)       );
  const colors = new Map                ();
  for (const [k, v] of Object.entries(cfg.colors ?? {})) colors.set(k, v | 0);
  const start = cfg.start ? { x: cfg.start.x, y: cfg.start.y } : null;
  return { W, H, tile, background, overrides, colors, start };
}
