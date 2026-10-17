"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { LineChart } from "@/components/charts/LineChart";
import { ShareChart } from "@/components/charts/ShareChart";
import { Icon } from "@/components/Icon";
import { percent, usd, usdCompact } from "@/lib/format";
import { ASSET_CLASSES, type ClassId } from "@/lib/portfolio/classes";
import { planPortfolio, PORTFOLIO_DEFAULTS, type PortfolioInput, type RiskProfile } from "@/lib/portfolio/allocate";
import { stockShare, type GlideShape, type GlideYear } from "@/lib/sim/glidepath";
import type { ChainId } from "@/server/chains";
import type { FilledPlan, FillStatus, HoldingFill } from "@/server/portfolio";
import { MoneyField, PercentField, SliderField } from "../plan/fields";
import styles from "./portfolio.module.css";

const BLUE = "var(--series-1)";
const ORANGE = "var(--series-2)";
const MUTED = "var(--series-muted)";

const SHAPES: Array<{ id: GlideShape; label: string }> = [
  { id: "steady", label: "Steadily" },
  { id: "late", label: "Later" },
  { id: "early", label: "Sooner" },
];

const RISKS: Array<{ id: RiskProfile; label: string; explainer: string }> = [
  { id: "steady", label: "Steady", explainer: "Gives up some return for a calmer ride inside each side." },
  { id: "balanced", label: "Balanced", explainer: "The middle ground." },
  { id: "growth", label: "Growth", explainer: "Leans toward the higher-return classes inside each side." },
];

const CHAIN_CHOICES: Array<{ id: ChainId; label: string }> = [
  { id: "ethereum", label: "Ethereum" },
  { id: "robinhood", label: "Robinhood Chain" },
  { id: "solana", label: "Solana" },
  { id: "bsc", label: "BNB Chain" },
  { id: "base", label: "Base" },
  { id: "arbitrum", label: "Arbitrum" },
  { id: "hyperevm", label: "HyperEVM" },
  { id: "mantle", label: "Mantle" },
];

const LIMITS = [0.0025, 0.005, 0.01, 0.02];

const STATUS_TEXT: Record<FillStatus, { label: string; tone: string }> = {
  filled: { label: "Fills", tone: "good" },
  split: { label: "Fills, split", tone: "good" },
  direct: { label: "Buy direct", tone: "warn" },
  thin: { label: "Too thin", tone: "bad" },
  "no-venue": { label: "No market", tone: "bad" },
  "too-small": { label: "Too small", tone: "muted" },
};

const pct2 = (value: number) =>
  value > 0.5 ? "over 50%" : `${value < 0 ? "−" : ""}${Math.abs(value * 100).toFixed(2)}%`;

export function PortfolioBuilder() {
  const [input, setInput] = useState<PortfolioInput>(PORTFOLIO_DEFAULTS);
  const [maxCost, setMaxCost] = useState(0.01);
  const [chains, setChains] = useState<ChainId[]>([]);
  const [fills, setFills] = useState<{ plan: FilledPlan; key: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof PortfolioInput>(key: K, value: PortfolioInput[K]) =>
    setInput((current) => ({ ...current, [key]: value }));
  const toggleClass = (id: ClassId) =>
    set("classes", input.classes.includes(id) ? input.classes.filter((entry) => entry !== id) : [...input.classes, id]);
  const toggleChain = (id: ChainId) =>
    setChains((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));
  const setAssumption = (id: ClassId, field: "expectedReturn" | "volatility", value: number) =>
    set("assumptions", { ...input.assumptions, [id]: { ...input.assumptions[id], [field]: value } });

  // The plan itself is pure maths and runs in the browser as you type. Only
  // checking fills reads live markets, and only when asked.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const deferred = useDeferredValue(input);
  const plan = useMemo(() => (mounted ? planPortfolio(deferred) : null), [deferred, mounted]);

  const fillKey = JSON.stringify({ input, maxCost, chains });
  const fillsCurrent = fills && fills.key === fillKey ? fills.plan : null;
  const fillsByClass = new Map((fillsCurrent?.holdings ?? []).map((holding) => [holding.classId, holding]));

  async function checkFills() {
    setChecking(true);
    setError(null);
    const key = fillKey;
    try {
      const response = await fetch("/api/v1/portfolio/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...input, maxCost, chains }),
      });
      const body = (await response.json()) as { data?: FilledPlan; error?: { message: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? `The server answered ${response.status}.`);
      setFills({ plan: body.data, key });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Fills could not be checked.");
    } finally {
      setChecking(false);
    }
  }

  if (!plan) {
    return <div className="skeleton" style={{ height: 560, borderRadius: "var(--radius-l)" }} role="status" aria-label="Building the plan" />;
  }

  const { projection } = plan;
  const years = ["Now", ...projection.years.map((year) => `Year ${year.year}`)];
  const withStart = (pick: (year: GlideYear) => number) => [deferred.capital, ...projection.years.map(pick)];
  const shares = [stockShare({ startStocks: deferred.equityShare, endStocks: deferred.endEquityShare, shape: deferred.shape }, 0), ...projection.years.map((year) => year.stocks)];
  const dollars = projection.inTodaysDollars ? "in today's dollars" : "not adjusted for inflation";

  return (
    <div className="split">
      <form className={`card sticky ${styles.form}`} onSubmit={(event) => event.preventDefault()} aria-label="Your portfolio">
        <div className={styles.pair}>
          <MoneyField label="Starting capital" value={input.capital} onChange={(value) => set("capital", value)} step={1000} />
          <MoneyField label="Adding each month" value={input.monthly} onChange={(value) => set("monthly", value)} step={100} />
        </div>
        <SliderField
          label="In stocks today"
          value={Math.round(input.equityShare * 100)}
          min={0}
          max={100}
          step={5}
          format={(value) => `${value}% stocks · ${100 - value}% bonds`}
          onChange={(value) => set("equityShare", value / 100)}
        />
        <SliderField
          label="Years until the goal"
          value={input.years}
          min={1}
          max={45}
          format={(value) => `${value} ${value === 1 ? "year" : "years"}`}
          onChange={(value) => set("years", value)}
        />
        <SliderField
          label="In stocks at the goal"
          value={Math.round(input.endEquityShare * 100)}
          min={0}
          max={100}
          step={5}
          format={(value) => `${value}%`}
          onChange={(value) => set("endEquityShare", value / 100)}
          hint="The glide path moves from today's mix to this one, like a target-date fund."
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
        </div>
        <div className="field">
          <span className="label">Inside each side</span>
          <div className="segmented" role="group" aria-label="Risk inside each side">
            {RISKS.map((risk) => (
              <button key={risk.id} type="button" aria-pressed={input.risk === risk.id} onClick={() => set("risk", risk.id)}>
                {risk.label}
              </button>
            ))}
          </div>
          <span className="hint">{RISKS.find((risk) => risk.id === input.risk)?.explainer}</span>
        </div>

        <details className="disclosure" open>
          <summary>
            Asset classes
            <Icon name="chevronDown" className="chevron" />
          </summary>
          <div className="body">
            {(["equity", "fixed"] as const).map((sleeve) => (
              <fieldset key={sleeve} className={styles.toggles}>
                <legend className="tiny faint">{sleeve === "equity" ? "Stocks" : "Bonds and steady assets"}</legend>
                {ASSET_CLASSES.filter((assetClass) => assetClass.sleeve === sleeve).map((assetClass) => (
                  <label key={assetClass.id} className={styles.toggle} title={assetClass.plain}>
                    <input type="checkbox" checked={input.classes.includes(assetClass.id)} onChange={() => toggleClass(assetClass.id)} />
                    <span>{assetClass.name}</span>
                    <span className="tiny faint">{assetClass.tickers.join(" · ")}</span>
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
        </details>

        <details className="disclosure">
          <summary>
            Filling the orders
            <Icon name="chevronDown" className="chevron" />
          </summary>
          <div className="body stack" style={{ "--gap": "14px" } as React.CSSProperties}>
            <div className="field">
              <span className="label">Most you will pay over fair value</span>
              <div className="segmented" role="group" aria-label="Highest acceptable cost">
                {LIMITS.map((limit) => (
                  <button key={limit} type="button" aria-pressed={maxCost === limit} onClick={() => setMaxCost(limit)}>
                    {percent(limit, limit < 0.01 ? 2 : 0)}
                  </button>
                ))}
              </div>
              <span className="hint">Price impact, spread and network fee together. Orders that cost more are split or flagged.</span>
            </div>
            <fieldset className={styles.toggles}>
              <legend className="tiny faint">Chains you can use (none ticked means any)</legend>
              {CHAIN_CHOICES.map((chain) => (
                <label key={chain.id} className={styles.toggle}>
                  <input type="checkbox" checked={chains.includes(chain.id)} onChange={() => toggleChain(chain.id)} />
                  <span>{chain.label}</span>
                </label>
              ))}
            </fieldset>
          </div>
        </details>

        <details className="disclosure">
          <summary>
            Assumptions
            <Icon name="chevronDown" className="chevron" />
          </summary>
          <div className="body stack" style={{ "--gap": "10px" } as React.CSSProperties}>
            <p className="tiny faint">
              Illustrative long-run figures, not forecasts. Change any of them; the mix and the projection follow.
            </p>
            {ASSET_CLASSES.filter((assetClass) => input.classes.includes(assetClass.id)).map((assetClass) => (
              <div key={assetClass.id} className={styles.assumption}>
                <span className="small">{assetClass.name}</span>
                <PercentField
                  label="Return"
                  value={plan.assumptions[assetClass.id].expectedReturn}
                  min={-10}
                  max={30}
                  step={0.1}
                  onChange={(value) => setAssumption(assetClass.id, "expectedReturn", value)}
                />
                <PercentField
                  label="Swing"
                  value={plan.assumptions[assetClass.id].volatility}
                  min={0.1}
                  max={80}
                  step={0.1}
                  onChange={(value) => setAssumption(assetClass.id, "volatility", value)}
                />
              </div>
            ))}
            <PercentField label="Inflation" value={input.inflation} min={0} max={15} step={0.1} onChange={(value) => set("inflation", value)} />
          </div>
        </details>
      </form>

      <div className="stack" style={{ "--gap": "20px" } as React.CSSProperties}>
        <section className="card" aria-label="Your target mix">
          <div className="row between" style={{ marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 className="subheading">Your target mix today</h2>
              <p className="small muted">
                Expected {percent(plan.expectedReturn, 1)} a year, swinging about {percent(plan.volatility, 1)} in a typical year.
              </p>
            </div>
            <button type="button" className="button primary" onClick={checkFills} disabled={checking}>
              {checking ? "Checking live markets…" : fillsCurrent ? "Check again" : "Check where it fills"}
            </button>
          </div>
          {error ? (
            <div className="notice" role="alert">
              <Icon name="info" />
              <span>{error}</span>
            </div>
          ) : null}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Asset class</th>
                  <th className="end">Share</th>
                  <th className="end">Amount</th>
                  <th>Where it fills best</th>
                </tr>
              </thead>
              <tbody>
                {plan.holdings.map((holding) => (
                  <tr key={holding.classId}>
                    <td>
                      <strong style={{ fontWeight: 650 }}>{holding.className}</strong>
                      <span className="tiny faint" style={{ display: "block" }}>
                        {holding.sleeve === "equity" ? "Stocks" : "Bonds"} · {holding.tickers.slice(0, 2).join(" or ")}
                      </span>
                    </td>
                    <td className="end num">{percent(holding.weight, 1)}</td>
                    <td className="end num">{usd(holding.amountUsd, { cents: false })}</td>
                    <td>
                      <FillCell fill={fillsByClass.get(holding.classId)} checking={checking} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {fillsCurrent ? (
            <p className="tiny faint" style={{ marginTop: 12 }}>
              {usd(fillsCurrent.filledUsd, { cents: false })} of {usd(deferred.capital, { cents: false })} fills within{" "}
              {percent(fillsCurrent.maxCost, fillsCurrent.maxCost < 0.01 ? 2 : 0)}
              {fillsCurrent.averageCost !== null ? `, at ${pct2(fillsCurrent.averageCost)} all-in on average` : ""}. Live
              quotes read {(fillsCurrent.tookMs / 1000).toFixed(1)}s ago could already be different; nothing was bought.
            </p>
          ) : (
            <p className="tiny faint" style={{ marginTop: 12 }}>
              “Check where it fills” asks swap aggregators what each exact amount would fill at right now, across every issuer and
              chain that sells a tokenized version of the fund.
            </p>
          )}
        </section>

        {fillsCurrent ? <FillDetails holdings={fillsCurrent.holdings} /> : null}

        <section className="card">
          <ChartFrame
            title="Where the balance could go"
            subtitle={`${(2000).toLocaleString("en-US")} simulated futures along the glide path, ${dollars}`}
            legend={[
              { label: "Typical", color: BLUE },
              { label: "Poor to strong market", color: BLUE, mark: "band" },
              { label: "Paid in", color: MUTED },
            ]}
            table={{
              columns: ["Year", "Poor market", "Typical", "Strong market", "Paid in", "In stocks"],
              rows: projection.years.map((year) => [
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
              height={300}
              formatY={(value) => usdCompact(value)}
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
          <div className="stats" style={{ marginTop: 16 }}>
            <div className="stat">
              <span className="label">Typical result</span>
              <span className="value num">{usd(projection.glide.p50, { cents: false })}</span>
            </div>
            <div className="stat">
              <span className="label">Poor market</span>
              <span className="value num">{usd(projection.glide.p10, { cents: false })}</span>
              <span className="note">1 in 10 end below</span>
            </div>
            <div className="stat">
              <span className="label">Chance of ending ahead</span>
              <span className="value num">{percent(projection.glide.chanceAhead, 0)}</span>
            </div>
          </div>
        </section>

        <section className="card">
          <ChartFrame
            title="How the mix shifts"
            subtitle="Share in stocks and in bonds, rebalanced monthly"
            legend={[
              { label: "Stocks", color: BLUE, mark: "box" },
              { label: "Bonds", color: ORANGE, mark: "box" },
            ]}
            table={{
              columns: ["Year", "Stocks", "Bonds"],
              rows: shares.map((share, index) => [years[index], percent(share, 0), percent(1 - share, 0)]),
            }}
          >
            <ShareChart
              x={years}
              series={[
                { id: "stocks", label: "Stocks", color: BLUE, values: shares },
                { id: "bonds", label: "Bonds", color: ORANGE, values: shares.map((share) => 1 - share) },
              ]}
            />
          </ChartFrame>
          <div className={styles.sleeves}>
            {[plan.equity, plan.fixed].map((mix) => (
              <div key={mix.sleeve}>
                <h3 className="small" style={{ fontWeight: 650, marginBottom: 6 }}>
                  Inside the {mix.sleeve === "equity" ? "stock" : "bond"} side
                </h3>
                <ul className={styles.mix}>
                  {mix.classes
                    .filter((entry) => entry.weight > 0)
                    .map((entry) => (
                      <li key={entry.id}>
                        <span>{entry.name}</span>
                        <span className="num">{percent(entry.weight, 0)}</span>
                      </li>
                    ))}
                </ul>
                <p className="tiny faint">
                  {percent(mix.expectedReturn, 1)} expected, {percent(mix.volatility, 1)} swing
                </p>
              </div>
            ))}
          </div>
        </section>

        <div className="notice plain">
          <Icon name="info" />
          <span>
            An educational simulation, not advice. The mix comes from mean-variance optimisation on the assumptions on the left;
            the projection is a range of possibilities, not a forecast. Most tokenized stocks and funds are not offered to United
            States residents, and fees, taxes and issuer risk are not included.
          </span>
        </div>
      </div>
    </div>
  );
}

function FillCell({ fill, checking }: { fill: HoldingFill | undefined; checking: boolean }) {
  if (!fill) return <span className="tiny faint">{checking ? "Reading quotes…" : "Not checked yet"}</span>;
  const status = STATUS_TEXT[fill.status];
  const first = fill.pieces[0];
  return (
    <span className={styles.fill}>
      <span className={`${styles.badge} ${styles[status.tone]}`}>{status.label}</span>
      {first ? (
        <span className="small">
          {fill.pieces.length > 1 ? `${fill.pieces.length} venues` : `${first.tokenSymbol} on ${first.chainName}`} ·{" "}
          {pct2(fill.pieces.reduce((total, piece) => total + piece.cost * piece.amountUsd, 0) / fill.pieces.reduce((total, piece) => total + piece.amountUsd, 0))}
        </span>
      ) : fill.direct.length ? (
        <span className="small">{fill.direct.map((option) => option.issuerName).join(" or ")}</span>
      ) : null}
    </span>
  );
}

function FillDetails({ holdings }: { holdings: HoldingFill[] }) {
  return (
    <section className="card">
      <h2 className="subheading">Order by order</h2>
      <p className="small muted" style={{ marginBottom: 12 }}>
        Each holding at its exact size. Costs are all-in: price impact, spread and the network fee.
      </p>
      <div className="stack" style={{ "--gap": "14px" } as React.CSSProperties}>
        {holdings.map((holding) => (
          <div key={holding.classId} className={styles.order}>
            <div className="row between" style={{ gap: 12, flexWrap: "wrap" }}>
              <strong style={{ fontWeight: 650 }}>
                {holding.className} · {usd(holding.amountUsd, { cents: false })}
              </strong>
              <span className={`${styles.badge} ${styles[STATUS_TEXT[holding.status].tone]}`}>{STATUS_TEXT[holding.status].label}</span>
            </div>
            <p className="small muted">{holding.note}</p>
            {holding.pieces.length ? (
              <ul className={styles.pieces}>
                {holding.pieces.map((piece) => (
                  <li key={`${piece.venueId}:${piece.ticker}`}>
                    <span>
                      <a href={piece.tokenUrl} target="_blank" rel="noreferrer">
                        {piece.tokenSymbol}
                      </a>{" "}
                      from {piece.issuerName} on {piece.chainName}
                      <span className="tiny faint">
                        {" "}
                        · {piece.aggregator ?? "quote"} · measured against{" "}
                        {piece.costBasis === "fair-value" ? "the fund price" : "a $100 order"}
                      </span>
                    </span>
                    <span className="num">
                      {usd(piece.amountUsd, { cents: false })} · {pct2(piece.cost)}
                      {piece.swapUrl ? (
                        <>
                          {" "}
                          ·{" "}
                          <a href={piece.swapUrl} target="_blank" rel="noreferrer">
                            {piece.swapApp ?? "Swap"}
                          </a>
                        </>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {holding.direct.length && !holding.pieces.length ? (
              <ul className={styles.pieces}>
                {holding.direct.map((option) => (
                  <li key={option.issuerName}>
                    <span>
                      <a href={option.url} target="_blank" rel="noreferrer">
                        {option.issuerName}
                      </a>
                      : {option.summary}
                      <span className="tiny faint" style={{ display: "block" }}>
                        {option.eligibility}
                        {option.confirmed ? "" : " Not yet confirmed from the issuer's own terms."}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
