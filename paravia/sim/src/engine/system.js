// The pure, headless, deterministic Paravia engine (spec §1). No canvas, no DOM,
// no timers. A renderer *reads* this; it never mutates it.

import {           HALT, LEFT, RIGHT, isArrow, DIRS } from "./alphabet.js";
import {                                             } from "./config.js";
import { floorMod, packKey } from "./coords.js";

                                                           

                           
            
            
           
                 
                
 

// `cap` = step limit hit; result is *unknown* (general non-halt is undecidable).
                            
                                             
                
 

// Growable Int8 log of pre-step headings — the only per-step history we keep
// (~1 byte/step). Everything else needed for an exact O(1) undo is recomputable.
class DirLog {
          buf = new Int8Array(1024);
          n = 0;
  get length()         {
    return this.n;
  }
  push(d        )       {
    if (this.n === this.buf.length) {
      const next = new Int8Array(this.buf.length * 2);
      next.set(this.buf);
      this.buf = next;
    }
    this.buf[this.n++] = d;
  }
  pop()         {
    return this.buf[--this.n];
  }
}

export class ParaviaSystem {
           W        ;
           H        ;
           deflectOn           ;

          tile         ;
          background            ;
  // Sparse deviations from the periodic background. Kept minimal: a cell is
  // dropped from the map the moment it equals its background again — so memory
  // tracks cells *currently* differing from background, not all cells touched.
          overrides                  ;
          visits                            ;

          x        ;
          y        ;
          dir     ;
          _status         = "running";
          _steps = 0;
          laneChecked = false;
          history = new DirLog();

  constructor(cfg              , opts                            = {}) {
    this.W = cfg.W;
    this.H = cfg.H;
    this.deflectOn = cfg.deflectOn;
    this.tile = cfg.tile;
    this.background = cfg.background;
    this.overrides = new Map(cfg.overrides);
    this.visits = opts.trackVisits ? new Map() : null;
    this.x = cfg.start.x;
    this.y = cfg.start.y;
    this.dir = cfg.initialDir;
    if (this.visits) this.bumpVisit(this.x, this.y, 1);
  }

  // --- pure spatial queries: O(1), zero geometry storage ---

  // Geometry is periodic ⇒ a pure function of position, no grid allocation.
  arrowAt(x        , y        )      {
    return this.tile[floorMod(y, this.H)][floorMod(x, this.W)];
  }

  // Charge is defined only on arrows; reported as 0 elsewhere.
  chargeAt(x        , y        )      {
    return isArrow(this.arrowAt(x, y)) ? this.rawCharge(x, y) : 0;
  }

  visitsAt(x        , y        )         {
    return this.visits ? this.visits.get(packKey(x, y)) ?? 0 : 0;
  }

  get status()         {
    return this._status;
  }
  get steps()         {
    return this._steps;
  }

  snapshot()           {
    return { x: this.x, y: this.y, dir: this.dir, status: this._status, steps: this._steps };
  }

  // --- core dynamics (exact, paper §1.2 / spec §3) ---

  step()       {
    if (this._status !== "running") return;

    // Sound, charge-independent non-halt detector. Re-run only when the heading
    // just changed (geometry along a lane is fixed, so one scan/lane suffices).
    if (!this.laneChecked) {
      this.laneChecked = true;
      if (this.laneEscapes()) {
        this._status = "nonhalt_lane";
        return;
      }
    }

    const sym = this.arrowAt(this.x, this.y);

    if (sym === HALT) {
      this._status = "halted";
      return; // halt: do not move (paper §1.2)
    }

    const dirBefore = this.dir;

    if (isArrow(sym)) {
      const c = this.rawCharge(this.x, this.y); // pre-arrival charge
      const deflect = this.deflectOn === "charged" ? c === 1 : c === 0;
      this.setCharge(this.x, this.y, (1 - c)       ); // charge ALWAYS toggles on an arrow
      if (deflect) this.dir = sym; //                   arrow code == its direction index
    }
    // BLANK (□): coast, no charge change.

    const [dx, dy] = DIRS[this.dir];
    this.x += dx;
    this.y += dy;
    this._steps++;
    this.history.push(dirBefore);
    if (this.visits) this.bumpVisit(this.x, this.y, 1);
    if (this.dir !== dirBefore) this.laneChecked = false;
  }

  // Exact O(1) inverse. The processed cell is recoverable as (pos − currentDir);
  // whether it toggled is just `isArrow` of that cell. So only the pre-step
  // heading needs to have been stored.
  stepBack()          {
    if (this._status !== "running") {
      // Halt / non-halt are terminal *observations* that consumed no move.
      this._status = "running";
      this.laneChecked = false;
      return true;
    }
    if (this.history.length === 0) return false;

    if (this.visits) this.bumpVisit(this.x, this.y, -1);
    const [dx, dy] = DIRS[this.dir]; // reverse using the post-step heading
    this.x -= dx;
    this.y -= dy;
    if (isArrow(this.arrowAt(this.x, this.y))) {
      this.setCharge(this.x, this.y, (1 - this.rawCharge(this.x, this.y))       );
    }
    this.dir = this.history.pop()       ;
    this._steps--;
    this.laneChecked = false;
    return true;
  }

  // Run up to `maxSteps` further steps. Returns 'cap' (unknown) if still running.
  run(maxSteps        )            {
    const start = this._steps;
    while (this._status === "running" && this._steps - start < maxSteps) this.step();
    if (this._status === "halted") return { outcome: "halted", steps: this._steps };
    if (this._status === "nonhalt_lane") return { outcome: "nonhalt_lane", steps: this._steps };
    return { outcome: "cap", steps: this._steps };
  }

  // --- internals ---

          bgIndex(x        , y        )         {
    return floorMod(y, this.H) * this.W + floorMod(x, this.W);
  }

          rawCharge(x        , y        )      {
    const o = this.overrides.get(packKey(x, y));
    return o !== undefined ? o : (this.background[this.bgIndex(x, y)]       );
  }

          setCharge(x        , y        , b     )       {
    const k = packKey(x, y);
    if (b === this.background[this.bgIndex(x, y)]) this.overrides.delete(k);
    else this.overrides.set(k, b);
  }

          bumpVisit(x        , y        , delta        )       {
    if (!this.visits) return;
    const k = packKey(x, y);
    const n = (this.visits.get(k) ?? 0) + delta;
    if (n <= 0) this.visits.delete(k);
    else this.visits.set(k, n);
  }

  // True ⇒ the ball provably never halts: scanning one lane period along the
  // current heading finds no ∎ and no *turning* arrow. Parallel arrows and
  // blanks both keep the ball going straight regardless of charge, so the ball
  // marches to infinity. Sound and charge-independent (the geometry is fixed).
          laneEscapes()          {
    const horizontal = this.dir === LEFT || this.dir === RIGHT;
    const period = horizontal ? this.W : this.H;
    const [dx, dy] = DIRS[this.dir];
    let x = this.x;
    let y = this.y;
    for (let k = 0; k < period; k++) {
      const s = this.arrowAt(x, y);
      if (s === HALT) return false; //              would halt
      if (isArrow(s) && s !== this.dir) return false; // turning arrow ⇒ indeterminate
      x += dx;
      y += dy;
    }
    return true;
  }
}
