import assert from "node:assert/strict";
import { test } from "node:test";
import { DASH, month, percent, rate, shares, shortAddress, signedPercent, ticks, usd, usdCompact } from "./format.ts";

test("unknown values are written as a dash, never as zero", () => {
  for (const value of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(usd(value), DASH);
    assert.equal(usdCompact(value), DASH);
    assert.equal(rate(value), DASH);
    assert.equal(percent(value), DASH);
    assert.equal(signedPercent(value), DASH);
    assert.equal(shares(value), DASH);
  }
});

test("dollars drop the cents once they are noise", () => {
  assert.equal(usd(339.97), "$339.97");
  assert.equal(usd(12_345.67), "$12,346");
  assert.equal(usd(12_345.67, { cents: true }), "$12,345.67");
  assert.equal(usd(0), "$0.00");
});

test("large amounts are shortened", () => {
  assert.equal(usdCompact(950), "$950");
  assert.equal(usdCompact(3_900), "$3.9K");
  assert.equal(usdCompact(63_303), "$63K");
  assert.equal(usdCompact(1_586_075), "$1.6M");
  assert.equal(usdCompact(74_960_000_000), "$75B");
  assert.equal(usdCompact(6_700_000_000), "$6.7B");
});

test("signed percentages use a true minus and never show a signed zero", () => {
  assert.equal(signedPercent(0.0043), "+0.43%");
  assert.equal(signedPercent(-0.0013), "−0.13%");
  assert.equal(signedPercent(0.00001), "0.00%");
  assert.equal(signedPercent(-0.00001), "0.00%");
});

test("rates and fractions are told apart", () => {
  assert.equal(rate(4.256), "4.26%");
  assert.equal(percent(0.04256, 2), "4.26%");
});

test("addresses are shortened, short ones left alone", () => {
  assert.equal(shortAddress("0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9"), "0xaF3D…93f9");
  assert.equal(shortAddress("USDC"), "USDC");
});

test("months read as words", () => {
  assert.equal(month("2016-01"), "Jan 2016");
  assert.equal(month("2026-12"), "Dec 2026");
});

test("axis ticks are round numbers inside the range", () => {
  assert.deepEqual(ticks(0, 100, 4), [0, 25, 50, 75, 100]);
  assert.deepEqual(ticks(0, 212_000, 4), [0, 100_000, 200_000]);
  assert.deepEqual(ticks(-0.2, 0.3, 4), [-0.2, 0, 0.2]);
  for (const value of ticks(3, 17, 5)) assert.ok(value >= 3 && value <= 17);
});
