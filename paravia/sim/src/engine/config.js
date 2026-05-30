// JSON config is the single source of truth (spec §9). This module validates
// it and lowers it into a compact, engine-ready form.

import {           isArrow, parseSym, parseDir } from "./alphabet.js";
import { floorMod, packKey } from "./coords.js";

                        
                                                 

// A patch applies a sparse set of charge overrides (keyed by LOCAL tile
// coordinates "lx,ly") to every tile instance listed in `at`. Tile grid
// positions are relative to the tile that contains the ball's start cell:
// [0,0] = start tile, [1,0] = one tile to the right, [-1,2] = one left and
// two down, etc.
//
// Patches are applied in order, later entries winning over earlier ones.
// The top-level `overrides` field is applied last, on top of all patches —
// it can pin individual global cells regardless of what patches did.
//
// Layering: background → patches (in order) → overrides
                        
                                                                   
                                                                     
 

// External shape, exactly as authored / serialized for blog figures.
                                
                                                         
                                                                            
                                                                              
                                                                                
                                                
                                                                                    
                                                                                                        
 

// Normalized, engine-ready form.
                               
            
            
                                       
                                                      
                              
                                  
                                             
                       
 

function parseBit(v         , label        )      {
  if (v !== 0 && v !== 1) throw new Error(`${label} must be 0 or 1, got ${JSON.stringify(v)}`);
  return v;
}

function parseLocalKey(k        , W        , H        )                   {
  const m = /^(-?\d+),(-?\d+)$/.exec(k);
  if (!m) throw new Error(`Bad local coordinate key ${JSON.stringify(k)} (want "lx,ly")`);
  const lx = Number(m[1]);
  const ly = Number(m[2]);
  if (lx < 0 || lx >= W || ly < 0 || ly >= H) {
    throw new Error(`Local coord (${lx},${ly}) out of tile bounds [0,${W}) × [0,${H})`);
  }
  return [lx, ly];
}

export function parseConfig(cfg               )               {
  const H = cfg.tile.length;
  if (H === 0) throw new Error("tile must have at least one row");
  const W = cfg.tile[0].length;
  if (W === 0) throw new Error("tile rows must be non-empty");

  const tile          = cfg.tile.map((row, y) => {
    if (row.length !== W) throw new Error(`tile row ${y} width ${row.length} ≠ ${W}`);
    return row.map(parseSym);
  });

  if (cfg.background.length !== H) throw new Error("background height must match tile");
  const background = new Uint8Array(H * W);
  cfg.background.forEach((row, y) => {
    if (row.length !== W) throw new Error(`background row ${y} width ${row.length} ≠ ${W}`);
    row.forEach((b, x) => {
      background[y * W + x] = parseBit(b, `background[${y}][${x}]`);
    });
  });

  const { x: sx, y: sy } = cfg.start;
  if (!Number.isInteger(sx) || !Number.isInteger(sy)) {
    throw new Error("start.x / start.y must be integers");
  }

  // The start cell must be an arrow: it fixes the initial heading (paper §1.2).
  const startSym = tile[floorMod(sy, H)][floorMod(sx, W)];
  if (!isArrow(startSym)) throw new Error("start cell must be an arrow");

  // Global origin of the tile that contains the ball's start (tile [0,0]).
  const originX = sx - floorMod(sx, W);
  const originY = sy - floorMod(sy, H);

  const overrides = new Map             ();

  // ── patches ──────────────────────────────────────────────────────────────
  // Applied in order; later patches overwrite earlier ones at the same cell.
  for (const [pi, patch] of (cfg.patches ?? []).entries()) {
    if (!Array.isArray(patch.at)) throw new Error(`patch[${pi}].at must be an array`);
    const localEntries = Object.entries(patch.charges).map(([k, v]) => {
      const [lx, ly] = parseLocalKey(k, W, H);
      return [lx, ly, parseBit(v, `patch[${pi}].charges["${k}"]`)]         ;
    });
    for (const tilePos of patch.at) {
      if (!Array.isArray(tilePos) || tilePos.length !== 2) {
        throw new Error(`patch[${pi}].at entries must be [ti, tj] pairs`);
      }
      const [ti, tj] = tilePos;
      if (!Number.isInteger(ti) || !Number.isInteger(tj)) {
        throw new Error(`patch[${pi}].at tile indices must be integers`);
      }
      for (const [lx, ly, bit] of localEntries) {
        const gx = originX + ti * W + lx;
        const gy = originY + tj * H + ly;
        overrides.set(packKey(gx, gy), bit);
      }
    }
  }

  // ── explicit global overrides (highest priority) ──────────────────────────
  for (const [k, v] of Object.entries(cfg.overrides ?? {})) {
    const m = /^(-?\d+),(-?\d+)$/.exec(k);
    if (!m) throw new Error(`Bad override key ${JSON.stringify(k)} (want "gx,gy")`);
    overrides.set(packKey(Number(m[1]), Number(m[2])), parseBit(v, `override["${k}"]`));
  }

  // Heading defaults to the start arrow's direction.
  // An explicit start.dir is accepted as an experimental override.
  const initialDir = cfg.start.dir !== undefined ? parseDir(cfg.start.dir) : startSym;

  return {
    W, H, tile, background, overrides,
    start: { x: sx, y: sy },
    initialDir,
    deflectOn: cfg.deflectOn ?? "charged",
  };
}
