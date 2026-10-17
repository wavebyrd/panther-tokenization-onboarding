"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { LineChart } from "@/components/charts/LineChart";
import { ShareChart } from "@/components/charts/ShareChart";
import { Icon } from "@/components/Icon";
import { percent, usd, usdCompact } from "@/lib/format";
import {
  GLIDE_DEFAULTS,
  GLIDE_LIMITS,
  runGlidePath,
  stockShare,
  type GlidePathInput,
  type GlideShape,
  type GlideYear,
} from "@/lib/sim/glidepath";
import { MoneyField, PercentField, SliderField } from "./fields";
import styles from "./plan.module.css";

const SHAPES: Array<{ id: GlideShape; label: string; explainer: string }> = [
  { id: "steady", label: "Steadily", explainer: "The same small step toward stablecoins every year." },
  { id: "late", label: "Later", explainer: "Stays in stocks longer, then shifts faster near the goal." },
  { id: "early", label: "Sooner", explainer: "Shifts early, then holds the safer mix for longer." },
];

const BLUE = "var(--series-1)";
const ORANGE = "var(--series-2)";
const MUTED = "var(--series-muted)";

export function GlidePath({
  stableReturn,
  stableReturnBasis,
  visible,
}: {
  stableReturn: number | null;
  stableReturnBasis: string;
  visible: boolean;
}) {
  const [input, setInput] = useState<GlidePathInput>(() => ({
    ...GLIDE_DEFAULTS,
    stableReturn: stableReturn ?? GLIDE_DEFAULTS.stableReturn,
  }));
  const set = <K extends keyof GlidePathInput>(key: K, value: GlidePathInput[K]) =>
    setInput((current) => ({ ...current, [key]: value }));

  // The simulation runs in the browser only. Server and browser round the last
  // digit of a float differently, so rendering it on both would never match.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Sliders stay responsive; the simulation catches up a moment later.
  const deferred = useDeferredValue(input);
  const result = useMemo(() => (visible && mounted ? runGlidePath(deferred) : null), [deferred, visible, mounted]);
  const settling = deferred !== input;

  if (!result) {
    return visible ? <div className="skeleton" style={{ height: 560, borderRadius: "var(--radius-l)" }} role="status" aria-label="Running the simulation" /> : null;
  }

  const years = ["Now", ...result.years.map((year) => `Year ${year.year}`)];
  const startValue = deferred.initial;
  const withStart = (pick: (year: GlideYear) => number) => [startValue, ...result.years.map(pick)];
  const shares = [stockShare(deferred, 0), ...result.years.map((year) => year.stocks)];
  const money = (value: number) => usdCompact(value);
  const dollars = result.inTodaysDollars ? "in today's dollars" : "not adjusted for inflation";

  return (
    <div className="split">
      <form className={`card sticky ${styles.form}`} onSubmit={(event) => event.preventDefault()} aria-label="Your plan">
        <SliderField
          label="Years until you need the money"
          value={input.years}
          min={GLIDE_LIMITS.years.min}
          max={45}
          format={(value) => `${value} ${value === 1 ? "year" : "years"}`}
          onChange={(value) => set("years", value)}
        />
        <div className={styles.pair}>
          <MoneyField label="Starting with" value={input.initial} onChange={(value) => set("initial", value)} step={500} />
          <MoneyField label="Adding each month" value={input.monthly} onChange={(value) => set("monthly", value)} step={50} />
        </div>
        <SliderField
          label="In stocks at the start"
          value={Math.round(input.startStocks * 100)}
          min={0}
          max={100}
          step={5}
          format={(value) => `${value}%`}
          onChange={(value) => set("startStocks", value / 100)}
        />
        <SliderField
          label="In stocks at the goal"
          value={Math.round(input.endStocks * 100)}
          min={0}
          max={100}
          step={5}
          format={(value) => `${value}%`}
          onChange={(value) => set("endStocks", value / 100)}
          hint="The rest sits in stablecoins earning interest."
        />
        <div className="field">
          <span className="label">Make the shift</span>
          <div className="segmented" role="group" aria-label="When to shift">
            {SHAPES.map((shape) => (
              <button key={shape.id} type="button" aria-pressed={input.shape === shape.id} onClick={() => set("shape", shape.id)}>
                {shape.label}
              </button>
            ))}
          </div>
          <span className="hint">{SHAPES.find((shape) => shape.id === input.shape)?.explainer}</span>
        </div>

        <details className="disclosure">
          <summary>
            Assumptions
            <Icon name="chevronDown" className="chevron" />
          </summary>
          <div className="body stack" style={{ "--gap": "16px" } as React.CSSProperties}>
            <div className={styles.pair}>
              <PercentField
                label="Stocks return, a year"
                value={input.stockReturn}
                min={-10}
                max={20}
                onChange={(value) => set("stockReturn", value)}
              />
              <PercentField
                label="Stocks swing, a year"
                value={input.stockVolatility}
                min={0}
                max={60}
                onChange={(value) => set("stockVolatility", value)}
              />
            </div>
            <div className={styles.pair}>
              <PercentField
                label="Stablecoin yield"
                value={input.stableReturn}
                min={0}
                max={20}
                step={0.1}
                onChange={(value) => set("stableReturn", value)}
              />
              <PercentField
                label="Inflation"
                value={input.inflation}
                min={0}
                max={15}
                step={0.1}
                onChange={(value) => set("inflation", value)}
              />
            </div>
            <p className="tiny faint">
              Stablecoin yield starts at {percent(stableReturn ?? GLIDE_DEFAULTS.stableReturn, 1)}.{" "}
              {stableReturnBasis} Stock figures are round numbers close to the long-run record of large US companies;
              change them to test other views.
            </p>
          </div>
        </details>
      </form>

      <div className={`stack ${settling ? "refetching" : ""}`} style={{ "--gap": "20px" } as React.CSSProperties}>
        <section className="card" aria-label="Where the plan could end up">
          <div className="stack" style={{ "--gap": "22px" } as React.CSSProperties}>
            <div className="stat">
              <span className="label">
                In a typical market, after {deferred.years} {deferred.years === 1 ? "year" : "years"}
              </span>
              <span className="figure hero num">{usd(result.glide.p50, { cents: false })}</span>
              <span className="note">
                from {usd(result.contributed, { cents: false })} paid in, {dollars}
              </span>
            </div>
            <div className="stats">
              <div className="stat">
                <span className="label">In a poor market</span>
                <span className="value num">{usd(result.glide.p10, { cents: false })}</span>
                <span className="note">1 in 10 futures end below this</span>
              </div>
              <div className="stat">
                <span className="label">In a strong market</span>
                <span className="value num">{usd(result.glide.p90, { cents: false })}</span>
                <span className="note">1 in 10 futures end above this</span>
              </div>
              <div className="stat">
                <span className="label">Chance of ending ahead</span>
                <span className="value num">{percent(result.glide.chanceAhead, 0)}</span>
                <span className="note">of what you paid in</span>
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <ChartFrame
            title="Where the balance could go"
            subtitle={`${deferred.simulations.toLocaleString("en-US")} simulated futures, ${dollars}`}
            legend={[
              { label: "Typical", color: BLUE },
              { label: "Poor to strong market", color: BLUE, mark: "band" },
              { label: "Paid in", color: MUTED },
            ]}
            table={{
              columns: ["Year", "Poor market", "Typical", "Strong market", "Paid in", "In stocks"],
              rows: result.years.map((year) => [
                year.year,
                usd(year.p10, { cents: false }),
                usd(year.p50, { cents: false }),
                usd(year.p90, { cents: false }),
                usd(year.contributed, { cents: false }),
                percent(year.stocks, 0),
              ]),
            }}
          >
            <LineChart
              x={years}
              height={320}
              formatY={money}
              bands={[
                { label: "Poor to strong", color: BLUE, opacity: 0.1, lower: withStart((y) => y.p10), upper: withStart((y) => y.p90) },
                { label: "Middle half", color: BLUE, opacity: 0.16, lower: withStart((y) => y.p25), upper: withStart((y) => y.p75) },
              ]}
              series={[
                { id: "paid", label: "Paid in", color: MUTED, weight: "context", values: withStart((y) => y.contributed) },
                { id: "typical", label: "Typical", color: BLUE, values: withStart((y) => y.p50) },
              ]}
              endLabels
            />
          </ChartFrame>
        </section>

        <section className="card">
          <ChartFrame
            title="How the mix shifts"
            subtitle="Share of the portfolio in each, rebalanced monthly"
            legend={[
              { label: "Tokenized stocks", color: BLUE, mark: "box" },
              { label: "Stablecoin yield", color: ORANGE, mark: "box" },
            ]}
            table={{
              columns: ["Year", "Tokenized stocks", "Stablecoin yield"],
              rows: shares.map((share, index) => [years[index], percent(share, 0), percent(1 - share, 0)]),
            }}
          >
            <ShareChart
              x={years}
              series={[
                { id: "stocks", label: "Tokenized stocks", color: BLUE, values: shares },
                { id: "stable", label: "Stablecoin yield", color: ORANGE, values: shares.map((share) => 1 - share) },
              ]}
            />
          </ChartFrame>
        </section>

        <section className="card">
          <h3 className="subheading">Against the alternatives</h3>
          <p className="small muted" style={{ marginBottom: 12 }}>
            The same money through the same simulated futures, invested three ways.
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Plan</th>
                  <th className="end">Typical</th>
                  <th className="end">Poor market</th>
                  <th className="end">A bad year near the goal</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { name: "This glide path", detail: `${percent(deferred.startStocks, 0)} stocks, shifting to ${percent(deferred.endStocks, 0)}`, data: result.glide },
                  { name: "No shift", detail: `${percent(deferred.startStocks, 0)} stocks throughout`, data: result.noShift },
                  { name: "Stablecoin yield only", detail: "No stocks at all", data: result.allStable },
                ].map((row) => (
                  <tr key={row.name}>
                    <td>
                      <strong style={{ fontWeight: 650 }}>{row.name}</strong>
                      <span className="tiny faint" style={{ display: "block" }}>
                        {row.detail}
                      </span>
                    </td>
                    <td className="end">{usd(row.data.p50, { cents: false })}</td>
                    <td className="end">{usd(row.data.p10, { cents: false })}</td>
                    <td className="end">
                      {row.data.lateSwing >= 0.0005 ? `−${percent(row.data.lateSwing, row.data.lateSwing < 0.01 ? 1 : 0)}` : "No loss"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tiny faint" style={{ marginTop: 12 }}>
            “A bad year near the goal” is the loss in the worst one year in ten, during the last ten years of the plan.
            It is why a plan shifts: a fall hurts most when there is no time left to recover.
          </p>
        </section>

        <div className="notice plain">
          <Icon name="info" />
          <span>
            This shows a range of possibilities from the assumptions on the left. It is not a forecast, and real
            markets can land outside the range. Fees, taxes and the chance of a stablecoin or lender failing are not
            included.
          </span>
        </div>
      </div>
    </div>
  );
}
