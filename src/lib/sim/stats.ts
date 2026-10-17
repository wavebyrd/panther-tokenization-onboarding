// Small, dependency-free statistics shared by the simulators.

/** A seeded random source, so the same inputs always draw the same paths. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal draws from a uniform source (Box-Muller). */
export function normalSource(random: () => number): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    let u = 0;
    while (u === 0) u = random();
    const v = random();
    const radius = Math.sqrt(-2 * Math.log(u));
    spare = radius * Math.sin(2 * Math.PI * v);
    return radius * Math.cos(2 * Math.PI * v);
  };
}

/** The value below which `p` (0..1) of a sorted list falls, interpolated. */
export function percentile(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (!n) return NaN;
  const position = Math.min(n - 1, Math.max(0, p * (n - 1)));
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

export function mean(values: readonly number[]): number {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : NaN;
}

/** Sample standard deviation. */
export function deviation(values: readonly number[]): number {
  if (values.length < 2) return NaN;
  const average = mean(values);
  const squares = values.reduce((total, value) => total + (value - average) ** 2, 0);
  return Math.sqrt(squares / (values.length - 1));
}

/** The deepest fall from a running high, as a positive fraction, and where it happened. */
export function maxDrawdown(levels: readonly number[]): { depth: number; peakIndex: number; troughIndex: number } {
  let peak = -Infinity;
  let peakAt = 0;
  let worst = { depth: 0, peakIndex: 0, troughIndex: 0 };
  levels.forEach((level, index) => {
    if (level > peak) {
      peak = level;
      peakAt = index;
    }
    const depth = peak > 0 ? 1 - level / peak : 0;
    if (depth > worst.depth) worst = { depth, peakIndex: peakAt, troughIndex: index };
  });
  return worst;
}

/** The yearly growth rate that turns `start` into `end` over `years`. */
export function annualized(start: number, end: number, years: number): number {
  if (!(start > 0) || !(end > 0) || !(years > 0)) return NaN;
  return (end / start) ** (1 / years) - 1;
}
