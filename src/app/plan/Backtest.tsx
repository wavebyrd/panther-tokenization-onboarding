"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { ColumnChart } from "@/components/charts/ColumnChart";
import { LineChart } from "@/components/charts/LineChart";
import { Icon } from "@/components/Icon";
import { month, percent, signedPercent, usd, usdCompact } from "@/lib/format";
import { CASH, type Rebalance } from "@/lib/sim/backtest";
import type { BacktestResponse } from "@/server/simulate";
import { MoneyField, PercentField } from "./fields";
import styles from "./plan.module.css";

interface Row {
  id: number;
  ticker: string;
  /** Percent, as typed. */
  weight: number;
}

const PRESETS: Array<{ label: string; rows: Array<[string, number]> }> = [
  { label: "Balanced", rows: [["SPY", 60], ["QQQ", 20], [CASH, 20]] },
  { label: "Growth", rows: [["QQQ", 50], ["SPY", 40], [CASH, 10]] },
  { label: "Cautious", rows: [["SPY", 30], ["SCHD", 20], [CASH, 50]] },
  { label: "Big tech", rows: [["AAPL", 20], ["MSFT", 20], ["NVDA", 20], ["GOOGL", 20], ["AMZN", 20]] },
];

const REBALANCE: Array<{ id: Rebalance; label: string }> = [
  { id: "yearly", label: "Once a year" },
  { id: "quarterly", label: "Every quarter" },
  { id: "monthly", label: "Every month" },
  { id: "never", label: "Never" },
];

const BLUE = "var(--series-1)";
const MUTED = "var(--series-muted)";
const ORANGE = "var(--series-2)";

const thisYear = new Date().getFullYear();
const YEARS = Array.from({ length: thisYear - 1995 }, (_, index) => thisYear - 1 - index);

let nextId = 1;
const toRows = (rows: Array<[string, number]>): Row[] => rows.map(([ticker, weight]) => ({ id: nextId++, ticker, weight }));

export function Backtest({ stableReturn, visible }: { stableReturn: number | null; visible: boolean }) {
  const [rows, setRows] = useState<Row[]>(() => toRows(PRESETS[0].rows));
  const [startYear, setStartYear] = useState(2016);
  const [initial, setInitial] = useState(10_000);
  const [monthly, setMonthly] = useState(500);
  const [rebalance, setRebalance] = useState<Rebalance>("yearly");
  const [cashMode, setCashMode] = useState<"fixed" | "treasury">("fixed");
  const [cashRate, setCashRate] = useState(stableReturn ?? 0.04);

  const [result, setResult] = useState<BacktestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const started = useRef(false);
  const latest = useRef(0);

  const total = rows.reduce((sum, row) => sum + (Number.isFinite(row.weight) ? row.weight : 0), 0);
  const balanced = Math.abs(total - 100) < 0.01;
  const holdsCash = rows.some((row) => row.ticker === CASH && row.weight > 0);

  const run = useCallback(async () => {
    const id = ++latest.current;
    setRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/simulate/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holdings: rows.filter((row) => row.ticker.trim() && row.weight > 0).map((row) => ({ ticker: row.ticker.trim(), weight: row.weight / 100 })),
          start: `${startYear}-01`,
          initial,
          monthly,
          rebalance,
          cashMode,
          cashRate,
          benchmark: "SPY",
        }),
      });
      const body = await response.json();
      if (id !== latest.current) return;
      if (!response.ok) {
        setError(body?.error?.message ?? "The backtest could not be run.");
      } else {
        setResult(body.data as BacktestResponse);
      }
    } catch {
      if (id === latest.current) setError("The backtest could not be run. Check your connection and try again.");
    } finally {
      if (id === latest.current) setRunning(false);
    }
  }, [rows, startYear, initial, monthly, rebalance, cashMode, cashRate]);

  // Runs the opening example once, the first time the tab is shown.
  useEffect(() => {
    if (visible && !started.current) {
      started.current = true;
      void run();
    }
  }, [visible, run]);

  const update = (id: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  return (
    <div className="split">
      <form
        className={`card sticky ${styles.form}`}
        aria-label="Your portfolio"
        onSubmit={(event) => {
          event.preventDefault();
          if (balanced) void run();
        }}
      >
        <div className="field">
          <span className="label">Start from</span>
          <div className="chips">
            {PRESETS.map((preset) => (
              <button key={preset.label} type="button" className="chip small" onClick={() => setRows(toRows(preset.rows))}>
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="label">Holdings</span>
          <div className={styles.holdings}>
            {rows.map((row) => (
              <div key={row.id} className={styles.holding}>
                {row.ticker === CASH ? (
                  <span className={styles.fixed}>Stablecoin yield</span>
                ) : (
                  <input
                    className="input"
                    aria-label="Ticker"
                    placeholder="Ticker"
                    autoCapitalize="characters"
                    spellCheck={false}
                    maxLength={10}
                    value={row.ticker}
                    onChange={(event) => update(row.id, { ticker: event.target.value.toUpperCase().replace(/[^A-Z0-9.]/g, "") })}
                  />
                )}
                <div className="input-wrap">
                  <input
                    className="input has-suffix num"
                    type="number"
                    inputMode="decimal"
                    aria-label={`Share of ${row.ticker === CASH ? "stablecoin yield" : row.ticker || "holding"}, percent`}
                    min={0}
                    max={100}
                    step={5}
                    value={Number.isFinite(row.weight) ? row.weight : ""}
                    onChange={(event) => update(row.id, { weight: Math.min(100, Math.max(0, Number(event.target.value))) })}
                  />
                  <span className="affix end">%</span>
                </div>
                <button
                  type="button"
                  className={styles.remove}
                  aria-label={`Remove ${row.ticker === CASH ? "stablecoin yield" : row.ticker || "holding"}`}
                  onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
            ))}
          </div>
          <div className="row" style={{ "--gap": "8px", marginTop: 6 } as React.CSSProperties}>
            <button
              type="button"
              className="chip small"
              disabled={rows.length >= 12}
              onClick={() => setRows((current) => [...current, { id: nextId++, ticker: "", weight: 0 }])}
            >
              <Icon name="plus" size={14} />
              Stock or fund
            </button>
            {!rows.some((row) => row.ticker === CASH) ? (
              <button type="button" className="chip small" onClick={() => setRows((current) => [...current, { id: nextId++, ticker: CASH, weight: 0 }])}>
                <Icon name="plus" size={14} />
                Stablecoin yield
              </button>
            ) : null}
          </div>
          <div className={styles.total}>
            <span>Total</span>
            <span className={`num ${balanced ? "" : "down"}`}>
              {total.toFixed(total % 1 ? 1 : 0)}%{balanced ? "" : ` · ${total < 100 ? `${(100 - total).toFixed(0)}% to go` : `${(total - 100).toFixed(0)}% over`}`}
            </span>
          </div>
        </div>

        <div className={styles.pair}>
          <MoneyField label="Starting with" value={initial} onChange={setInitial} step={500} />
          <MoneyField label="Adding each month" value={monthly} onChange={setMonthly} step={50} />
        </div>

        <div className={styles.pair}>
          <div className="field">
            <label htmlFor="bt-start">Starting in</label>
            <select id="bt-start" className="select" value={startYear} onChange={(event) => setStartYear(Number(event.target.value))}>
              {YEARS.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="bt-rebalance">Rebalance</label>
            <select id="bt-rebalance" className="select" value={rebalance} onChange={(event) => setRebalance(event.target.value as Rebalance)}>
              {REBALANCE.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {holdsCash ? (
          <div className="field">
            <span className="label">Stablecoin yield earns</span>
            <div className="segmented" role="group" aria-label="Stablecoin yield">
              <button type="button" aria-pressed={cashMode === "fixed"} onClick={() => setCashMode("fixed")}>
                A fixed rate
              </button>
              <button type="button" aria-pressed={cashMode === "treasury"} onClick={() => setCashMode("treasury")}>
                Treasury bill history
              </button>
            </div>
            {cashMode === "fixed" ? (
              <PercentField label="Rate a year" value={cashRate} min={0} max={20} step={0.1} onChange={setCashRate} hint="The same rate every year, which real rates never are." />
            ) : (
              <span className="hint">
                On-chain lending is only a few years old. This uses what 3-month Treasury bills paid each month, as a
                stand-in.
              </span>
            )}
          </div>
        ) : null}

        <button type="submit" className="button primary" disabled={!balanced || running}>
          {running ? <span className="spinner" aria-hidden="true" /> : null}
          {running ? "Running" : "Run the backtest"}
        </button>
        {!balanced ? <p className="tiny down">Holdings need to add up to 100% before this can run.</p> : null}
      </form>

      <div className={`stack ${running && result ? "refetching" : ""}`} style={{ "--gap": "20px" } as React.CSSProperties} aria-live="polite">
        {error ? (
          <div className="notice critical" role="alert">
            <Icon name="alert" />
            <span>{error}</span>
          </div>
        ) : null}

        {result ? <Results result={result} /> : !error ? <div className="skeleton" style={{ height: 520, borderRadius: "var(--radius-l)" }} /> : null}
      </div>
    </div>
  );
}

function Results({ result }: { result: BacktestResponse }) {
  const { stats, benchmark } = result;
  const money = (value: number) => usdCompact(value);
  const fullYears = result.years;

  return (
    <>
      <section className="card" aria-label="Result">
        <div className="stack" style={{ "--gap": "22px" } as React.CSSProperties}>
          <div className="stat">
            <span className="label">
              {month(result.start)} to {month(result.end)}, this mix grew to
            </span>
            <span className="figure hero num">{usd(stats.finalValue, { cents: false })}</span>
            <span className="note">
              from {usd(stats.contributed, { cents: false })} paid in
              {benchmark ? `. The same money in ${benchmark.ticker} grew to ${usd(benchmark.stats.finalValue, { cents: false })}` : ""}
            </span>
          </div>
          <div className="stats">
            <div className="stat">
              <span className="label">Return a year</span>
              <span className="value num">{signedPercent(stats.yearlyReturn, 1)}</span>
              {benchmark ? <span className="note">{benchmark.ticker}: {signedPercent(benchmark.stats.yearlyReturn, 1)}</span> : null}
            </div>
            <div className="stat">
              <span className="label">Deepest fall</span>
              <span className="value num">−{percent(stats.maxDrawdown, 0)}</span>
              <span className="note">
                {month(stats.drawdownFrom)} to {month(stats.drawdownTo)}
                {benchmark ? ` · ${benchmark.ticker}: −${percent(benchmark.stats.maxDrawdown, 0)}` : ""}
              </span>
            </div>
            <div className="stat">
              <span className="label">Best year</span>
              <span className="value num">{stats.bestYear ? signedPercent(stats.bestYear.change, 0) : "—"}</span>
              <span className="note">{stats.bestYear?.year ?? "No full year yet"}</span>
            </div>
            <div className="stat">
              <span className="label">Worst year</span>
              <span className="value num">{stats.worstYear ? signedPercent(stats.worstYear.change, 0) : "—"}</span>
              <span className="note">{stats.worstYear?.year ?? "No full year yet"}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <ChartFrame
          title="Value over time"
          subtitle="With every contribution included"
          legend={[
            { label: "This mix", color: BLUE },
            ...(benchmark ? [{ label: `${benchmark.ticker} alone`, color: ORANGE }] : []),
            { label: "Paid in", color: MUTED },
          ]}
          table={{
            columns: ["Month", "This mix", ...(benchmark ? [benchmark.ticker] : []), "Paid in"],
            rows: [...result.points]
              .reverse()
              .map((point) => [
                month(point.month),
                usd(point.value, { cents: false }),
                ...(benchmark ? [usd(point.benchmark, { cents: false })] : []),
                usd(point.contributed, { cents: false }),
              ]),
          }}
        >
          <LineChart
            x={result.points.map((point) => point.month)}
            height={320}
            formatY={money}
            formatX={month}
            series={[
              { id: "paid", label: "Paid in", color: MUTED, weight: "context", values: result.points.map((point) => point.contributed) },
              ...(benchmark
                ? [{ id: "bench", label: `${benchmark.ticker} alone`, color: ORANGE, weight: "context" as const, values: result.points.map((point) => point.benchmark) }]
                : []),
              { id: "mix", label: "This mix", color: BLUE, values: result.points.map((point) => point.value) },
            ]}
            endLabels
          />
        </ChartFrame>
      </section>

      <section className="card">
        <ChartFrame
          title="Year by year"
          subtitle="Investment return each calendar year, contributions taken out"
          legend={[
            { label: "This mix", color: BLUE, mark: "box" },
            ...(benchmark ? [{ label: `${benchmark.ticker} alone`, color: ORANGE, mark: "box" as const }] : []),
          ]}
          table={{
            columns: ["Year", "This mix", ...(benchmark ? [benchmark.ticker] : [])],
            rows: [...fullYears]
              .reverse()
              .map((year) => [
                `${year.year}${year.partial ? " (part)" : ""}`,
                signedPercent(year.change, 1),
                ...(benchmark ? [signedPercent(year.benchmark, 1)] : []),
              ]),
          }}
        >
          <ColumnChart
            x={fullYears.map((year) => year.year)}
            formatY={(value) => signedPercent(value, 0)}
            notes={Object.fromEntries(fullYears.filter((year) => year.partial).map((year) => [year.year, "part of the year"]))}
            series={[
              { id: "mix", label: "This mix", color: BLUE, values: fullYears.map((year) => year.change) },
              ...(benchmark ? [{ id: "bench", label: `${benchmark.ticker} alone`, color: ORANGE, values: fullYears.map((year) => year.benchmark) }] : []),
            ]}
          />
        </ChartFrame>
      </section>

      <section className="card">
        <h3 className="subheading">Where it ended up</h3>
        <p className="small muted" style={{ marginBottom: 14 }}>
          The mix drifts as prices move. Rebalancing pulls it back to your targets.
        </p>
        <ul className={styles.mix}>
          {result.finalMix.map((item) => {
            const name = result.holdings.find((holding) => holding.ticker === item.ticker)?.name ?? item.ticker;
            return (
              <li key={item.ticker}>
                <span title={name} style={{ fontWeight: 600 }}>
                  {item.ticker === CASH ? "Stablecoins" : item.ticker}
                </span>
                <span className="meter" aria-hidden="true">
                  <span style={{ width: `${Math.max(1, item.actual * 100)}%` }} />
                </span>
                <span className="num small">
                  <strong style={{ fontWeight: 650 }}>{percent(item.actual, 0)}</strong>{" "}
                  <span className="faint">target {percent(item.target, 0)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="notice plain">
        <Icon name="info" />
        <span>
          {result.notes.join(" ")} Past results say nothing certain about the future, and fees and taxes are not
          included.
        </span>
      </div>
    </>
  );
}
