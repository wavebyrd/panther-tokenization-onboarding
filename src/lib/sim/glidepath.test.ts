import assert from "node:assert/strict";
import { test } from "node:test";
import { GLIDE_DEFAULTS, runGlidePath, sanitizeGlideInput, stockShare } from "./glidepath.ts";

const near = (actual: number, expected: number, tolerance: number, label: string) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} is not within ${tolerance} of ${expected}`);

test("the path starts and ends at the chosen shares, whatever its shape", () => {
  for (const shape of ["steady", "late", "early"] as const) {
    const plan = { startStocks: 0.9, endStocks: 0.3, shape };
    near(stockShare(plan, 0), 0.9, 1e-12, `${shape} start`);
    near(stockShare(plan, 1), 0.3, 1e-12, `${shape} end`);
  }
});

test("a late shift holds more stocks midway than a steady one, an early shift fewer", () => {
  const plan = { startStocks: 0.9, endStocks: 0.3 };
  const steady = stockShare({ ...plan, shape: "steady" }, 0.5);
  near(steady, 0.6, 1e-12, "steady midpoint");
  assert.ok(stockShare({ ...plan, shape: "late" }, 0.5) > steady);
  assert.ok(stockShare({ ...plan, shape: "early" }, 0.5) < steady);
});

test("with no swings, the result is plain compound growth", () => {
  // All in stablecoins at a fixed 6%, no inflation: every future is the same sum.
  const result = runGlidePath({
    ...GLIDE_DEFAULTS,
    years: 10,
    initial: 1000,
    monthly: 100,
    startStocks: 0,
    endStocks: 0,
    stableReturn: 0.06,
    stableVolatility: 0,
    inflation: 0,
    simulations: 200,
  });
  const growth = 1.06 ** (1 / 12);
  let expected = 1000;
  for (let month = 0; month < 120; month++) {
    if (month > 0) expected += 100;
    expected *= growth;
  }
  near(result.glide.p50, expected, 0.01, "median");
  near(result.glide.p10, result.glide.p90, 1e-6, "no spread");
  assert.equal(result.contributed, 1000 + 100 * 119);
  assert.equal(result.glide.chanceAhead, 1);
  assert.equal(result.glide.lateSwing, 0);
});

test("the same inputs give the same result every time", () => {
  const a = runGlidePath({ ...GLIDE_DEFAULTS, years: 8, simulations: 300 });
  const b = runGlidePath({ ...GLIDE_DEFAULTS, years: 8, simulations: 300 });
  assert.deepEqual(a, b);
  const c = runGlidePath({ ...GLIDE_DEFAULTS, years: 8, simulations: 300, seed: 7 });
  assert.notEqual(a.glide.p50, c.glide.p50);
});

test("simulated stocks earn what they were told to, on average", () => {
  // The mean of many futures should compound at the stated return.
  const result = runGlidePath({
    ...GLIDE_DEFAULTS,
    years: 1,
    initial: 10_000,
    monthly: 0,
    startStocks: 1,
    endStocks: 1,
    stockReturn: 0.08,
    stockVolatility: 0.16,
    inflation: 0,
    simulations: 5000,
  });
  // The median of a lognormal sits below its mean by half the variance.
  const expectedMedian = 10_000 * Math.exp(Math.log(1.08) - 0.16 ** 2 / 2);
  near(result.glide.p50, expectedMedian, 10_000 * 0.012, "median after one year");
});

test("shifting toward stablecoins narrows the range and softens a bad late year", () => {
  const result = runGlidePath({ ...GLIDE_DEFAULTS, years: 25, simulations: 1500 });
  const spread = (outcome: { p10: number; p90: number }) => outcome.p90 - outcome.p10;
  assert.ok(spread(result.glide) < spread(result.noShift), "glide path has the narrower range");
  assert.ok(result.glide.lateSwing < result.noShift.lateSwing, "glide path has the milder bad year");
  assert.ok(result.glide.p10 > result.noShift.p10, "glide path holds up better in a poor market");
  assert.ok(result.noShift.p50 > result.glide.p50, "staying in stocks has the higher typical outcome");
});

test("percentiles are in order and years line up", () => {
  const result = runGlidePath({ ...GLIDE_DEFAULTS, years: 12, simulations: 400 });
  assert.equal(result.years.length, 12);
  for (const year of result.years) {
    assert.ok(year.p10 <= year.p25 && year.p25 <= year.p50 && year.p50 <= year.p75 && year.p75 <= year.p90);
    near(year.stocks + year.stable, 1, 1e-12, "shares add to one");
  }
  assert.equal(result.years.at(-1)!.p50, result.glide.p50);
});

test("nonsense input is forced into range rather than run", () => {
  const input = sanitizeGlideInput({
    years: 900,
    initial: -5,
    monthly: Number.NaN,
    startStocks: 4,
    endStocks: -1,
    simulations: 1e9,
    shape: "sideways" as never,
  });
  assert.equal(input.years, 50);
  assert.equal(input.initial, 0);
  assert.equal(input.monthly, GLIDE_DEFAULTS.monthly);
  assert.equal(input.startStocks, 1);
  assert.equal(input.endStocks, 0);
  assert.equal(input.simulations, 5000);
  assert.equal(input.shape, "steady");
});
