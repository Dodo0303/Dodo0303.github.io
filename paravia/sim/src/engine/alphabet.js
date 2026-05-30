// The alphabet A = { ↑, ←, ↓, →, □, ∎ }  (paper, Def. 1).
//
// Arrow codes 0..3 are deliberately chosen so that an arrow's code *is* its
// direction index. That makes deflection a single assignment (`dir = sym`) and
// keeps the hot loop branch-free.

export const UP = 0;
export const LEFT = 1;
export const DOWN = 2;
export const RIGHT = 3;
export const BLANK = 4;
export const HALT = 5;

                                        

export const isArrow = (s     )          => s <= RIGHT;

// Direction vectors indexed by arrow code. y grows downward (paper's coords:
// top-left of the tile is (0,0), x/y grow to the bottom-right).
export const DIRS                                           = [
  [0, -1], // ↑ up
  [-1, 0], // ← left
  [0, 1], //  ↓ down
  [1, 0], //  → right
];

const GLYPH = ["↑", "←", "↓", "→", "□", "∎"]         ;

// The paper's glyphs plus ASCII aliases, so configs can be hand-written.
const FROM                                = {
  "↑": UP, "^": UP, U: UP, u: UP,
  "←": LEFT, "<": LEFT, L: LEFT, l: LEFT,
  "↓": DOWN, v: DOWN, V: DOWN, D: DOWN, d: DOWN,
  "→": RIGHT, ">": RIGHT, R: RIGHT, r: RIGHT,
  "□": BLANK, ".": BLANK, " ": BLANK, _: BLANK,
  "∎": HALT, "#": HALT, "*": HALT, X: HALT,
};

export function parseSym(token        )      {
  const s = FROM[token];
  if (s === undefined) throw new Error(`Unknown symbol: ${JSON.stringify(token)}`);
  return s;
}

export const glyph = (s     )         => GLYPH[s];

// A heading token ("U/L/D/R" or a glyph) → a direction index (0..3).
export function parseDir(token        )      {
  const s = parseSym(token);
  if (!isArrow(s)) throw new Error(`Not a direction: ${JSON.stringify(token)}`);
  return s;
}
