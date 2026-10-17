import assert from "node:assert/strict";
import { test } from "node:test";
import { BacktestError, CASH, monthRange, runBacktest, type BacktestInput, type BacktestSeries } from "./backtest.ts";

const near = (actual: number, expected: number, tolerance: number, label: string) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} is not within ${tolerance} of ${expected}`);

const months = monthRange("2020-01", "2022-12");

/** A price that grows by the same factor every month. */
const steady = (ticker: string, monthlyGrowth: number, from = months): BacktestSeries => ({
  ticker,
  months: from,
  prices: from.map((_, index) => 100 * monthlyGrowth ** index),
});

const base: BacktestInput = {
  holdings: [{ ticker: "UP", weight: 1 }],
  start: "2020-01",
  end: "2022-12",
  initial: 1000,
  monthly: 0,
  rebalance: "never",
  cashRate: 0.04,
};

test("months are listed in order across year ends", () => {
  assert.deepEqual(monthRange("2021-11", "2022-02"), ["2021-11", "2021-12", "2022-01", "2022-02"]);
});

test("one holding with no contributions simply follows its price", () => {
  const result = runBacktest(base, [steady("UP", 1.01)]);
  near(result.stats.finalValue, 1000 * 1.01 ** 35, 1e-6, "final value");
  near(result.stats.yearlyReturn, 1.01 ** 12 - 1, 1e-9, "yearly return");
  assert.equal(result.stats.maxDrawdown, 0);
  assert.equal(result.stats.contributed, 1000);
  assert.equal(result.months, 36);
});

test("the stablecoin side compounds at its yearly rate", () => {
  const result = runBacktest({ ...base, holdings: [{ ticker: CASH, weight: 1 }], cashRate: 0.05 }, []);
  near(result.stats.finalValue, 1000 * 1.05 ** (35 / 12), 1e-6, "final value");
  near(result.stats.yearlyReturn, 0.05, 1e-9, "yearly return");
});

test("monthly rates for the stablecoin side override the fixed one", () => {
  const cashRates = new Map(months.map((month) => [month, 0.12]));
  const result = runBacktest({ ...base, holdings: [{ ticker: CASH, weight: 1 }], cashRates }, []);
  near(result.stats.yearlyReturn, 0.12, 1e-9, "yearly return");
});

test("contributions are counted as paid in, not as return", () => {
  // A flat price: the portfolio is worth exactly what was paid in, and the return is zero.
  const result = runBacktest({ ...base, monthly: 100 }, [steady("UP", 1)]);
  assert.equal(result.stats.contributed, 1000 + 100 * 35);
  near(result.stats.finalValue, 4500, 1e-9, "final value");
  near(result.stats.yearlyReturn, 0, 1e-12, "yearly return");
  assert.equal(result.points.at(-1)!.contributed, 4500);
});

test("rebalancing pulls the mix back to target; leaving it lets it drift", () => {
  const series = [steady("UP", 1.03), steady("FLAT", 1)];
  const holdings = [
    { ticker: "UP", weight: 0.5 },
    { ticker: "FLAT", weight: 0.5 },
  ];
  const drifted = runBacktest({ ...base, holdings, rebalance: "never" }, series);
  const kept = runBacktest({ ...base, holdings, rebalance: "monthly" }, series);
  assert.ok(drifted.finalMix[0].actual > 0.7, "the riser takes over when left alone");
  near(kept.finalMix[0].actual, 0.5, 1e-9, "monthly rebalancing holds the target");
  // Letting a steady winner run beats trimming it.
  assert.ok(drifted.stats.finalValue > kept.stats.finalValue);
});

test("the deepest fall is measured from the high before it", () => {
  const prices = [100, 120, 90, 60, 80, 130, 110, 100, 105, 110, 115, 120, 125];
  const own = monthRange("2020-01", "2021-01");
  const result = runBacktest({ ...base, end: "2021-01" }, [{ ticker: "UP", months: own, prices }]);
  near(result.stats.maxDrawdown, 0.5, 1e-12, "120 down to 60");
  assert.equal(result.stats.drawdownFrom, "2020-02");
  assert.equal(result.stats.drawdownTo, "2020-04");
});

test("calendar years are reported, and a part year is marked", () => {
  const result = runBacktest(base, [steady("UP", 1.01)]);
  assert.deepEqual(
    result.years.map((year) => [year.year, year.partial]),
    [
      ["2020", true], // eleven monthly returns: the first month has none
      ["2021", false],
      ["2022", false],
    ],
  );
  near(result.years[1].change, 1.01 ** 12 - 1, 1e-9, "a full year");
  assert.equal(result.stats.bestYear?.year, "2021");
});

test("the benchmark receives the same money on the same dates", () => {
  const result = runBacktest({ ...base, monthly: 50, benchmark: "BENCH" }, [steady("UP", 1.01), steady("BENCH", 1.01)]);
  near(result.benchmark!.stats.finalValue, result.stats.finalValue, 1e-6, "identical series, identical result");
  assert.equal(result.points[10].benchmark !== null, true);
});

test("the run starts where the youngest holding's history starts, and says so", () => {
  const late = monthRange("2021-01", "2022-12");
  const result = runBacktest(
    {
      ...base,
      holdings: [
        { ticker: "UP", weight: 0.5 },
        { ticker: "NEW", weight: 0.5 },
      ],
    },
    [steady("UP", 1.01), steady("NEW", 1.02, late)],
  );
  assert.equal(result.start, "2021-01");
  assert.ok(result.notes.some((note) => note.includes("NEW")));
});

test("a portfolio that cannot be run is refused with a reason", () => {
  const series = [steady("UP", 1.01)];
  assert.throws(() => runBacktest({ ...base, holdings: [] }, series), BacktestError);
  assert.throws(() => runBacktest({ ...base, holdings: [{ ticker: "UP", weight: 0.6 }] }, series), /100%/);
  assert.throws(() => runBacktest({ ...base, holdings: [{ ticker: "GONE", weight: 1 }] }, series), /GONE/);
  assert.throws(() => runBacktest({ ...base, initial: 0, monthly: 0 }, series), /amount/);
  assert.throws(() => runBacktest({ ...base, start: "2022-06" }, series), /less than a year/);
});
