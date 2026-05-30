// Coordinate helpers for the infinite, periodically-tiled plane.

// Always-positive modulo, so negative global coordinates wrap correctly.
export const floorMod = (a        , n        )         => ((a % n) + n) % n;

// Pack a signed lattice point into one non-negative safe-integer key
// (zig-zag per axis, 26 bits each). Range: ±33,554,431 per axis — far beyond
// any realistic step cap, since |coord| ≤ stepCount. Using a number key avoids
// the per-step string allocation a "x,y" Map key would incur in the hot loop.
const BITS = 26;
const SPAN = 1 << BITS; // 67,108,864
const zig = (n        )         => (n < 0 ? -2 * n - 1 : 2 * n);

export function packKey(x        , y        )         {
  const zx = zig(x);
  const zy = zig(y);
  if (zx >= SPAN || zy >= SPAN) {
    throw new Error(`Coordinate out of packing range at (${x}, ${y})`);
  }
  return zx * SPAN + zy; // < 2^52 + 2^26 < 2^53, stays a safe integer
}
