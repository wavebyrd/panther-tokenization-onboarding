import assert from "node:assert/strict";
import { test } from "node:test";
import { planPortfolio, sanitizePortfolioInput } from "./allocate.ts";
import { ASSET_CLASSES, covariance, DEFAULT_ASSUMPTIONS } from "./classes.ts";
import { optimize, projectToBoundedSimplex } from "./optimize.ts";

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

test("projection lands on the bounded simplex", () => {
  const bounds = [
    { min: 0, max: 0.5 },
    { min: 0.2, max: 1 },
    { min: 0, max: 1 },
  ];
  const projected = projectToBoundedSimplex([3, -1, 0.4], bounds);
  assert.ok(Math.abs(sum(projected) - 1) < 1e-9);
  projected.forEach((value, index) => {
    assert.ok(value >= bounds[index].min - 1e-9 && value <= bounds[index].max + 1e-9);
  });
  assert.equal(projected[0], 0.5);
});

test("the optimizer prefers the better asset and respects caps", () => {
  const weights = optimize({
    expectedReturns: [0.1, 0.02],
    covariance: [
      [0.01, 0],
      [0, 0.01],
    ],
    bounds: [
      { min: 0, max: 0.8 },
      { min: 0, max: 1 },
    ],
    riskAversion: 1,
  });
  assert.ok(Math.abs(weights[0] - 0.8) < 1e-6, `expected the cap, got ${weights[0]}`);
  assert.ok(Math.abs(sum(weights) - 1) < 1e-9);
});

test("more risk aversion gives a steadier mix", () => {
  const ids = ASSET_CLASSES.filter((assetClass) => assetClass.sleeve === "fixed").map((assetClass) => assetClass.id);
  const sigma = covariance(ids, DEFAULT_ASSUMPTIONS);
  const mu = ids.map((id) => DEFAULT_ASSUMPTIONS[id].expectedReturn);
  const bounds = ids.map(() => ({ min: 0, max: 1 }));
  const variance = (weights: number[]) =>
    weights.reduce((total, wi, i) => total + weights.reduce((row, wj, j) => row + wi * wj * sigma[i][j], 0), 0);
  const calm = optimize({ expectedReturns: mu, covariance: sigma, bounds, riskAversion: 20 });
  const bold = optimize({ expectedReturns: mu, covariance: sigma, bounds, riskAversion: 1 });
  assert.ok(variance(calm) < variance(bold));
});

test("a plan's holdings add up to the capital and the stock share", () => {
  const plan = planPortfolio({ capital: 50_000, equityShare: 0.6 });
  assert.ok(Math.abs(sum(plan.holdings.map((holding) => holding.amountUsd)) - 50_000) < 1e-6);
  const equity = sum(plan.holdings.filter((holding) => holding.sleeve === "equity").map((holding) => holding.weight));
  assert.ok(Math.abs(equity - 0.6) < 1e-9);
  assert.ok(plan.holdings.every((holding) => holding.tickers.length > 0));
  // US large companies is the core: it always holds at least its floor of the stock side.
  const core = plan.holdings.find((holding) => holding.classId === "us_large");
  assert.ok(core && core.weight >= 0.4 * 0.6 - 1e-9);
});

test("turning every class off falls back to the core of each side", () => {
  const plan = planPortfolio({ classes: [] });
  assert.deepEqual(
    plan.holdings.map((holding) => holding.classId).sort(),
    ["tbills", "us_large"],
  );
});

test("bad input is forced into range", () => {
  const input = sanitizePortfolioInput({
    capital: -5,
    equityShare: 3,
    years: 1000,
    classes: ["nonsense" as never, "gold"],
    assumptions: { gold: { expectedReturn: 9 } },
  });
  assert.equal(input.capital, 100);
  assert.equal(input.equityShare, 1);
  assert.equal(input.years, 45);
  assert.deepEqual(input.classes, ["gold"]);
  assert.equal(input.assumptions.gold?.expectedReturn, 0.3);
});

test("the same inputs give the same plan", () => {
  const a = planPortfolio({ capital: 10_000 });
  const b = planPortfolio({ capital: 10_000 });
  assert.equal(a.projection.glide.p50, b.projection.glide.p50);
});
