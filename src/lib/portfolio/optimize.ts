// Classic mean-variance portfolio choice (Markowitz), kept small enough to read.
//
// It finds the mix that maximises
//
//     expected return − (risk aversion ÷ 2) × variance
//
// with no short selling and a floor and cap on each holding. Higher risk
// aversion gives a steadier, lower-return mix. A dozen classes at most, so a
// simple projected-gradient loop is exact enough and needs no library.
//
// Pure: no I/O.

export interface Bounds {
  min: number;
  max: number;
}

/** The point nearest `values` whose entries sum to 1 and sit within their bounds. */
export function projectToBoundedSimplex(values: number[], bounds: Bounds[]): number[] {
  const lowSum = bounds.reduce((total, bound) => total + bound.min, 0);
  const highSum = bounds.reduce((total, bound) => total + bound.max, 0);
  if (lowSum > 1 + 1e-9) {
    // The floors alone overshoot: scale them down so the mix still adds up.
    return bounds.map((bound) => bound.min / lowSum);
  }
  if (highSum < 1 - 1e-9) {
    // The caps cannot reach 100%: fill every holding to its cap and spread the rest evenly.
    const spare = (1 - highSum) / bounds.length;
    return bounds.map((bound) => bound.max + spare);
  }
  // Shift every value by the same amount until the clipped values sum to 1.
  const clipped = (shift: number) =>
    values.map((value, index) => Math.min(bounds[index].max, Math.max(bounds[index].min, value - shift)));
  const total = (shift: number) => clipped(shift).reduce((sum, value) => sum + value, 0);
  let low = Math.min(...values) - 2;
  let high = Math.max(...values) + 2;
  for (let step = 0; step < 100; step++) {
    const middle = (low + high) / 2;
    if (total(middle) > 1) low = middle;
    else high = middle;
  }
  return clipped((low + high) / 2);
}

export interface OptimizeInput {
  expectedReturns: number[];
  covariance: number[][];
  bounds: Bounds[];
  riskAversion: number;
}

export function portfolioReturn(weights: number[], expectedReturns: number[]): number {
  return weights.reduce((total, weight, index) => total + weight * expectedReturns[index], 0);
}

export function portfolioVariance(weights: number[], covariance: number[][]): number {
  let variance = 0;
  for (let i = 0; i < weights.length; i++) {
    for (let j = 0; j < weights.length; j++) variance += weights[i] * weights[j] * covariance[i][j];
  }
  return variance;
}

/** The long-only, bounded mix with the best return for the risk taken, at this risk aversion. */
export function optimize(input: OptimizeInput): number[] {
  const n = input.expectedReturns.length;
  if (n === 0) return [];
  if (n === 1) return [1];
  const { expectedReturns: mu, covariance: sigma, bounds, riskAversion } = input;

  // Step size from the largest curvature, so the loop cannot overshoot.
  const trace = sigma.reduce((total, row, index) => total + row[index], 0);
  const step = 1 / Math.max(1e-6, riskAversion * trace * 2);

  let weights = projectToBoundedSimplex(new Array(n).fill(1 / n), bounds);
  for (let iteration = 0; iteration < 5000; iteration++) {
    const gradient = weights.map((_, i) => {
      let risk = 0;
      for (let j = 0; j < n; j++) risk += sigma[i][j] * weights[j];
      return mu[i] - riskAversion * risk;
    });
    const next = projectToBoundedSimplex(
      weights.map((weight, i) => weight + step * gradient[i]),
      bounds,
    );
    const moved = next.reduce((total, value, i) => total + Math.abs(value - weights[i]), 0);
    weights = next;
    if (moved < 1e-10) break;
  }
  // Tidy rounding dust so tiny holdings read as zero.
  const tidy = weights.map((weight) => (weight < 1e-4 ? 0 : weight));
  const sum = tidy.reduce((total, weight) => total + weight, 0);
  return tidy.map((weight) => weight / sum);
}
