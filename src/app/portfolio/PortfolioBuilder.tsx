"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { LineChart } from "@/components/charts/LineChart";
import { ShareChart } from "@/components/charts/ShareChart";
import { percent, usd, usdCompact } from "@/lib/format";
import { ASSET_CLASSES, type ClassId } from "@/lib/portfolio/classes";
import { planPortfolio, PORTFOLIO_DEFAULTS, type PortfolioInput, type RiskProfile } from "@/lib/portfolio/allocate";
import { stockShare, type GlideShape, type GlideYear } from "@/lib/sim/glidepath";
import type { ChainId } from "@/server/chains";
import type { InvestorType, Residence } from "@/server/funds";
import type { FilledPlan, FillPiece, FillStatus, FundOption, HoldingFill } from "@/server/portfolio";
import { MoneyField, PercentField, SliderField } from "../plan/fields";
import styles from "./portfolio.module.css";

const VIOLET = "var(--series-1)";
const GREEN = "var(--series-2)";
const MUTED = "var(--series-muted)";

const SHAPES: Array<{ id: GlideShape; label: string }> = [
  { id: "steady", label: "Steady" },
  { id: "late", label: "Later" },
  { id: "early", label: "Sooner" },
];

const RISKS: Array<{ id: RiskProfile; label: string; explainer: string }> = [
  { id: "steady", label: "Steady", explainer: "Gives up some return for a calmer ride inside each side." },
  { id: "balanced", label: "Balanced", explainer: "The middle ground." },
  { id: "growth", label: "Growth", explainer: "Leans toward the higher-return classes inside each side." },
];

const RESIDENCES: Array<{ id: Residence; label: string }> = [
  { id: "non_us", label: "Outside the US" },
  { id: "us", label: "United States" },
];

const INVESTORS: Array<{ id: InvestorType; label: string }> = [
  { id: "everyone", label: "Individual" },
  { id: "accredited", label: "Accredited" },
  { id: "qualified_purchaser", label: "Qualified" },
  { id: "institutional", label: "Institution" },
];

const CHAIN_CHOICES: Array<{ id: ChainId; label: string }> = [
  { id: "ethereum", label: "Ethereum" },
  { id: "robinhood", label: "Robinhood" },
  { id: "solana", label: "Solana" },
  { id: "bsc", label: "BNB" },
  { id: "base", label: "Base" },
  { id: "arbitrum", label: "Arbitrum" },
  { id: "hyperevm", label: "HyperEVM" },
  { id: "avalanche", label: "Avalanche" },
];

const LIMITS = [0.0025, 0.005, 0.01, 0.02];

const STATUS: Record<FillStatus, { label: string; tone: "up" | "caution" | "down" | "muted" }> = {
  filled: { label: "FILLS", tone: "up" },
  split: { label: "FILLS · SPLIT", tone: "up" },
  direct: { label: "BUY DIRECT", tone: "caution" },
  thin: { label: "TOO THIN", tone: "down" },
  "no-venue": { label: "NO MARKET", tone: "down" },
  "too-small": { label: "TOO SMALL", tone: "muted" },
};

const cost = (value: number) => (value > 0.5 ? ">50%" : `${value < 0 ? "−" : value > 0 ? "+" : ""}${Math.abs(value * 100).toFixed(2)}%`);
const weightedCost = (pieces: FillPiece[]) =>
  pieces.reduce((total, entry) => total + entry.cost * entry.amountUsd, 0) / pieces.reduce((total, entry) => total + entry.amountUsd, 0);

/**
 * Where live fills are worked out. "server" asks this project's own API (the
 * Next app, with any keys you configured). "browser" runs the same engine in
 * the visitor's browser against Panther Terminal's API and the aggregators,
 * which is how the embedded widget runs with no server at all.
 */
export type Engine = "server" | "browser";

const DEFAULT_ENGINE: Engine =
  typeof process !== "undefined" && process.env?.NEXT_PUBLIC_PTO_ENGINE === "browser" ? "browser" : "server";

async function runFills(engine: Engine, body: Record<string, unknown>): Promise<FilledPlan> {
  if (engine === "browser") {
    const { fillPortfolio } = await import("@/server/portfolio");
    return fillPortfolio(body);
  }
  const response = await fetch("/api/v1/portfolio/plan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = (await response.json()) as { data?: FilledPlan; error?: { message: string } };
  if (!response.ok || !parsed.data) throw new Error(parsed.error?.message ?? `The server answered ${response.status}.`);
  return parsed.data;
}

export function PortfolioBuilder({ engine = DEFAULT_ENGINE }: { engine?: Engine } = {}) {
  const [input, setInput] = useState<PortfolioInput>(PORTFOLIO_DEFAULTS);
  const [maxCost, setMaxCost] = useState(0.01);
  const [chains, setChains] = useState<ChainId[]>([]);
  const [residence, setResidence] = useState<Residence>("non_us");
  const [investor, setInvestor] = useState<InvestorType>("everyone");
  const [fills, setFills] = useState<{ plan: FilledPlan; key: string; at: Date } | null>(null);
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

  // The plan is pure maths and runs in the browser as you type. Only checking
  // fills reads live markets, and only when asked.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const deferred = useDeferredValue(input);
  const plan = useMemo(() => (mounted ? planPortfolio(deferred) : null), [deferred, mounted]);

  const fillKey = JSON.stringify({ input, maxCost, chains, residence, investor });
  const live = fills && fills.key === fillKey ? fills.plan : null;
  const stale = Boolean(fills && !live);
  const fillByClass = new Map((live ?? fills?.plan)?.holdings.map((holding) => [holding.classId, holding]) ?? []);

  async function checkFills() {
    setChecking(true);
    setError(null);
    const key = fillKey;
    try {
      const plan = await runFills(engine, { ...input, maxCost, chains, residence, investor });
      setFills({ plan, key, at: new Date() });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Fills could not be checked.");
    } finally {
      setChecking(false);
    }
  }

  if (!plan) {
    return <div className="skeleton" style={{ height: 620, borderRadius: 9 }} role="status" aria-label="Building the plan" />;
  }

  const { projection } = plan;
  const years = ["Now", ...projection.years.map((year) => `Y${year.year}`)];
  const withStart = (pick: (year: GlideYear) => number) => [deferred.capital, ...projection.years.map(pick)];
  const shares = [
    stockShare({ startStocks: deferred.equityShare, endStocks: deferred.endEquityShare, shape: deferred.shape }, 0),
    ...projection.years.map((year) => year.stocks),
  ];
  const dollars = projection.inTodaysDollars ? "today's dollars" : "nominal dollars";
  const shown = live ?? fills?.plan ?? null;
  const fundRows = dedupeFunds(shown?.holdings ?? []);
  const showFills = Boolean(shown) || checking;
  const fillSummary = checking
    ? "reading live quotes…"
    : live
      ? `${percent(live.filledUsd / deferred.capital, 0)} fills on chain within ${percent(live.maxCost, live.maxCost < 0.01 ? 2 : 0)}` +
        (live.averageCost != null ? ` · average ${cost(live.averageCost)}` : "") +
        ` · read ${fills!.at.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`
      : stale
        ? "inputs changed · check again"
        : "see where each piece fills on chain";

  return (
    <>
      <ul className="tiles" aria-label="Summary">
        <Tile
          label={`Typical in ${deferred.years} years`}
          value={usdCompact(projection.glide.p50)}
          note={`poor market ${usdCompact(projection.glide.p10)} · ${dollars}`}
          signal
        />
        <Tile label="Expected return" value={percent(plan.expectedReturn, 1)} note="a year, on today's mix" />
        <Tile label="Typical swing" value={percent(plan.volatility, 1)} note="yearly standard deviation" />
      </ul>

      <div className={styles.layout}>
        <form className={`card panel ${styles.controls}`} onSubmit={(event) => event.preventDefault()} aria-label="Your portfolio">
          <div className="panel-head">
            <h2>Your plan</h2>
            <span>updates as you type</span>
          </div>
          <div className={styles.controlBody}>
            <div className={styles.pair}>
              <MoneyField label="Starting capital" value={input.capital} onChange={(value) => set("capital", value)} step={1000} />
              <MoneyField label="Each month" value={input.monthly} onChange={(value) => set("monthly", value)} step={100} />
            </div>
            <SliderField
              label="Stocks today"
              value={Math.round(input.equityShare * 100)}
              min={0}
              max={100}
              step={5}
              format={(value) => `${value} / ${100 - value}`}
              onChange={(value) => set("equityShare", value / 100)}
            />
            <SliderField
              label="Years to the goal"
              value={input.years}
              min={1}
              max={45}
              format={(value) => `${value}Y`}
              onChange={(value) => set("years", value)}
            />
            <SliderField
              label="Stocks at the goal"
              value={Math.round(input.endEquityShare * 100)}
              min={0}
              max={100}
              step={5}
              format={(value) => `${value} / ${100 - value}`}
              onChange={(value) => set("endEquityShare", value / 100)}
            />
            <Segmented label="Where you live" options={RESIDENCES} value={residence} onChange={setResidence} />

            <details className="disclosure">
              <summary>More options</summary>
              <div className={styles.more}>
                <Segmented label="Glide shift" options={SHAPES} value={input.shape} onChange={(value) => set("shape", value)} />
                <Segmented
                  label="Inside each side"
                  options={RISKS}
                  value={input.risk}
                  onChange={(value) => set("risk", value)}
                  hint={RISKS.find((risk) => risk.id === input.risk)?.explainer}
                />
                <Segmented
                  label="Investor type"
                  options={INVESTORS}
                  value={investor}
                  onChange={setInvestor}
                  hint="Used only to filter what each issuer's own terms say you may buy."
                />

                <p className={styles.groupLabel}>Asset classes</p>
                <div className={styles.classes}>
                  {(["equity", "fixed"] as const).map((sleeve) => (
                    <fieldset key={sleeve}>
                      <legend>{sleeve === "equity" ? "Stocks" : "Bonds & steady"}</legend>
                      {ASSET_CLASSES.filter((assetClass) => assetClass.sleeve === sleeve).map((assetClass) => (
                        <label key={assetClass.id} title={assetClass.plain}>
                          <input type="checkbox" checked={input.classes.includes(assetClass.id)} onChange={() => toggleClass(assetClass.id)} />
                          <span>{assetClass.name}</span>
                          <span className={styles.tickers}>{assetClass.tickers[0]}</span>
                        </label>
                      ))}
                    </fieldset>
                  ))}
                </div>

                <p className={styles.groupLabel}>Buying on chain</p>
                <Segmented
                  label="Most over fair value"
                  options={LIMITS.map((limit) => ({ id: String(limit), label: percent(limit, limit < 0.01 ? 2 : 0) }))}
                  value={String(maxCost)}
                  onChange={(value) => setMaxCost(Number(value))}
                />
                <div className="field">
                  <span className="label">Chains (none = any)</span>
                  <div className={styles.chips}>
                    {CHAIN_CHOICES.map((chain) => (
                      <button key={chain.id} type="button" className="chip" aria-pressed={chains.includes(chain.id)} onClick={() => toggleChain(chain.id)}>
                        {chain.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </details>

            <details className="disclosure">
              <summary>Assumptions</summary>
              <div className={styles.assumptions}>
                <p className="tiny faint">Illustrative long-run figures, not forecasts. Change any; the mix and projection follow.</p>
                {ASSET_CLASSES.filter((assetClass) => input.classes.includes(assetClass.id)).map((assetClass) => (
                  <div key={assetClass.id} className={styles.assumption}>
                    <span>{assetClass.name}</span>
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
          </div>
        </form>

        <div className={styles.results}>
          <section className="card panel" aria-label="Target allocation">
            <div className="panel-head">
              <h2>Target allocation</h2>
              <span>{fillSummary}</span>
              <button type="button" className="button primary small" onClick={checkFills} disabled={checking}>
                {checking ? "Reading quotes…" : live ? "Re-check fills" : "Check live fills"}
              </button>
            </div>
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Class</th>
                    <th>Weight</th>
                    <th className="end">Amount</th>
                    {showFills ? (
                      <>
                        <th>Best fill now</th>
                        <th className="end">All-in</th>
                        <th>Status</th>
                      </>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {plan.holdings.map((holding) => {
                    const fill = fillByClass.get(holding.classId);
                    return (
                      <tr key={holding.classId} className={stale ? styles.staleRow : undefined}>
                        <td>
                          <span className={styles.className}>{holding.className}</span>
                          <span className={styles.sub}>
                            {holding.sleeve === "equity" ? "STOCKS" : "BONDS"} · {holding.tickers.slice(0, 2).join(" / ")}
                          </span>
                        </td>
                        <td>
                          <span className={styles.weight}>
                            <span className={styles.bar}>
                              <span style={{ width: `${Math.min(100, holding.weight * 100)}%` }} data-sleeve={holding.sleeve} />
                            </span>
                            {percent(holding.weight, 1)}
                          </span>
                        </td>
                        <td className="end">{usd(holding.amountUsd, { cents: false })}</td>
                        {showFills ? (
                          <>
                            <td>
                              <BestFill fill={fill} checking={checking} />
                            </td>
                            <td className="end">{fill?.pieces.length ? <Cost value={weightedCost(fill.pieces)} /> : "—"}</td>
                            <td>{fill ? <Badge status={fill.status} /> : <span className={styles.sub}>{checking ? "…" : "—"}</span>}</td>
                          </>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {shown ? <Execution plan={shown} /> : null}
          {fundRows.length ? <Funds funds={fundRows} asOf={shown?.fundsAsOf ?? null} residence={residence} /> : null}

          <div className={styles.chartGrid}>
            <section className="card panel">
              <div className="panel-head">
                <h2>Projection</h2>
                <span>2,000 simulated futures · {dollars}</span>
              </div>
              <div className="panel-body">
                <ChartFrame
                  title="Where the balance could go"
                  subtitle={`Typical ${usd(projection.glide.p50, { cents: false })} · ${percent(projection.glide.chanceAhead, 0)} chance of ending ahead`}
                  legend={[
                    { label: "Typical", color: VIOLET },
                    { label: "Poor to strong", color: VIOLET, mark: "band" },
                    { label: "Paid in", color: MUTED },
                  ]}
                  table={{
                    columns: ["Year", "Poor", "Typical", "Strong", "Paid in", "Stocks"],
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
                    height={260}
                    formatY={(value) => usdCompact(value)}
                    bands={[
                      { label: "Poor to strong", color: VIOLET, opacity: 0.1, lower: withStart((y) => y.p10), upper: withStart((y) => y.p90) },
                      { label: "Middle half", color: VIOLET, opacity: 0.18, lower: withStart((y) => y.p25), upper: withStart((y) => y.p75) },
                    ]}
                    series={[
                      { id: "paid", label: "Paid in", color: MUTED, weight: "context", values: withStart((y) => y.contributed) },
                      { id: "typical", label: "Typical", color: VIOLET, values: withStart((y) => y.p50) },
                    ]}
                    endLabels
                  />
                </ChartFrame>
              </div>
            </section>
            <section className="card panel">
              <div className="panel-head">
                <h2>Glide path</h2>
                <span>rebalanced monthly</span>
              </div>
              <div className="panel-body">
                <ChartFrame
                  title="Stocks and bonds over time"
                  subtitle={`${percent(shares[0], 0)} stocks now, ${percent(shares[shares.length - 1], 0)} at the goal`}
                  legend={[
                    { label: "Stocks", color: VIOLET, mark: "box" },
                    { label: "Bonds", color: GREEN, mark: "box" },
                  ]}
                  table={{
                    columns: ["Year", "Stocks", "Bonds"],
                    rows: shares.map((share, index) => [years[index], percent(share, 0), percent(1 - share, 0)]),
                  }}
                >
                  <ShareChart
                    x={years}
                    series={[
                      { id: "stocks", label: "Stocks", color: VIOLET, values: shares },
                      { id: "bonds", label: "Bonds", color: GREEN, values: shares.map((share) => 1 - share) },
                    ]}
                  />
                </ChartFrame>
              </div>
            </section>
          </div>

          <p className={styles.disclaimer}>
            Educational simulation, not advice. The mix comes from mean-variance optimisation on the assumptions you can edit; the
            projection is a range, not a forecast. Quotes come from swap aggregators and can change before you act; nothing is
            bought. Most tokenized stocks and funds are not offered to United States residents. Fees, taxes and issuer risk are not
            included.
          </p>
        </div>
      </div>
    </>
  );
}

function Tile({ label, value, note, signal = false }: { label: string; value: string; note: string; signal?: boolean }) {
  return (
    <li className="tile">
      <span className="tile-label">{label}</span>
      <span className={`tile-value ${signal ? "signal" : ""}`}>{value}</span>
      <span className="tile-note">{note}</span>
    </li>
  );
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  hint,
}: {
  label: string;
  options: Array<{ id: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  hint?: string;
}) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className="segmented" role="group" aria-label={label}>
        {options.map((option) => (
          <button key={option.id} type="button" aria-pressed={value === option.id} onClick={() => onChange(option.id)}>
            {option.label}
          </button>
        ))}
      </div>
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

function Badge({ status }: { status: FillStatus }) {
  const info = STATUS[status];
  return <span className={`${styles.badge} ${styles[info.tone]}`}>{info.label}</span>;
}

function Cost({ value }: { value: number }) {
  return <span className={value <= 0.002 ? "up" : value <= 0.01 ? undefined : "down"}>{cost(value)}</span>;
}

function BestFill({ fill, checking }: { fill: HoldingFill | undefined; checking: boolean }) {
  if (!fill) return <span className={styles.sub}>{checking ? "reading quotes…" : "not checked"}</span>;
  const first = fill.pieces[0];
  if (first) {
    return (
      <span>
        <span className="symbol">{first.tokenSymbol}</span>{" "}
        <span className={styles.sub}>
          {fill.pieces.length > 1 ? `+${fill.pieces.length - 1} more · ` : ""}
          {first.issuerName} · {first.chainName}
        </span>
      </span>
    );
  }
  if (fill.direct.length || fill.funds.some((fund) => fund.access)) {
    return <span className={styles.sub}>{[...fill.direct.map((option) => option.issuerName), ...fill.funds.filter((fund) => fund.access).slice(0, 1).map((fund) => fund.symbol)].join(" · ")}</span>;
  }
  return <span className={styles.sub}>{fill.note}</span>;
}

function Execution({ plan }: { plan: FilledPlan }) {
  const rows = plan.holdings.flatMap((holding) =>
    holding.pieces.length
      ? holding.pieces.map((entry, index) => ({ holding, entry, first: index === 0 }))
      : [{ holding, entry: null as FillPiece | null, first: true }],
  );
  return (
    <details className={`card panel ${styles.fold}`} aria-label="Execution">
      <summary className="panel-head">
        <h2>Order by order</h2>
        <span>
          {plan.residence === "us" ? "US resident" : "outside the US"} · limit {percent(plan.maxCost, plan.maxCost < 0.01 ? 2 : 0)} ·{" "}
          {plan.chains.length ? plan.chains.join(", ") : "any chain"}
        </span>
      </summary>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Holding</th>
              <th>Token</th>
              <th>Issuer · chain</th>
              <th className="end">Order</th>
              <th className="end">All-in</th>
              <th>Measured vs</th>
              <th className="end">Pool depth</th>
              <th>Route</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ holding, entry, first }) => (
              <tr key={`${holding.classId}:${entry?.venueId ?? "none"}:${entry?.ticker ?? ""}`}>
                <td>{first ? <span className={styles.className}>{holding.className}</span> : null}</td>
                {entry ? (
                  <>
                    <td>
                      <a className="symbol" href={entry.tokenUrl} target="_blank" rel="noreferrer">
                        {entry.tokenSymbol}
                      </a>
                    </td>
                    <td>
                      {entry.issuerName}
                      <span className={styles.sub}>{entry.chainName}</span>
                    </td>
                    <td className="end">{usd(entry.amountUsd, { cents: false })}</td>
                    <td className="end">
                      <Cost value={entry.cost} />
                    </td>
                    <td className={styles.sub}>{entry.costBasis === "fair-value" ? "FUND PRICE" : "$100 ORDER"}</td>
                    <td className="end">{entry.liquidityUsd > 0 ? usdCompact(entry.liquidityUsd) : "—"}</td>
                    <td className={styles.sub}>
                      {entry.route.length ? entry.route.map((hop) => `${hop.venue} ${percent(hop.share, 0)}`).join(" · ") : entry.aggregator ?? "—"}
                    </td>
                    <td>
                      {entry.swapUrl ? (
                        <a className={styles.link} href={entry.swapUrl} target="_blank" rel="noreferrer">
                          {entry.swapApp ?? "Swap"} ↗
                        </a>
                      ) : null}
                    </td>
                  </>
                ) : (
                  <td colSpan={8}>
                    <Badge status={holding.status} /> <span className={styles.sub}>{holding.note}</span>
                    {holding.direct.map((option) => (
                      <span key={option.issuerName} className={styles.directLine}>
                        <a className={styles.link} href={option.url} target="_blank" rel="noreferrer">
                          {option.issuerName} ↗
                        </a>{" "}
                        {option.summary} <span className={styles.sub}>{option.eligibility}{option.confirmed ? "" : " · unconfirmed"}</span>
                      </span>
                    ))}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.footnote}>
        All-in is price impact, spread and network fee against the fund&apos;s real price times the shares each token stands for, or,
        where that can&apos;t be read, against the same venue&apos;s price for a $100 order. Pool depth is the dollar liquidity in the
        token&apos;s pools on that chain.
      </p>
    </details>
  );
}

function dedupeFunds(holdings: HoldingFill[]): FundOption[] {
  const seen = new Map<string, FundOption>();
  for (const holding of holdings) for (const fund of holding.funds) if (!seen.has(fund.symbol)) seen.set(fund.symbol, fund);
  return [...seen.values()];
}

function Funds({ funds, asOf, residence }: { funds: FundOption[]; asOf: string | null; residence: Residence }) {
  return (
    <details className={`card panel ${styles.fold}`} aria-label="Tokenized funds for the bond side">
      <summary className="panel-head">
        <h2>Tokenized funds for the steady side</h2>
        <span>Panther Terminal data{asOf ? ` · as of ${asOf.slice(0, 10)}` : ""}</span>
      </summary>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Fund</th>
              <th>Kind</th>
              <th className="end">7d yield</th>
              <th className="end">30d yield</th>
              <th className="end">On chain</th>
              <th>Who can buy</th>
              <th>For you</th>
            </tr>
          </thead>
          <tbody>
            {funds.map((fund) => (
              <tr key={fund.symbol}>
                <td>
                  <a className="symbol" href={fund.website ?? fund.pantherUrl} target="_blank" rel="noreferrer">
                    {fund.symbol}
                  </a>
                  <span className={styles.sub}>{fund.issuer || fund.name}</span>
                </td>
                <td className={styles.sub}>{fund.kind.toUpperCase()}</td>
                <td className="end">{fund.yield7d != null ? percent(fund.yield7d, 2) : "—"}</td>
                <td className="end">{fund.yield30d != null ? percent(fund.yield30d, 2) : "—"}</td>
                <td className="end">{fund.valueUsd != null ? usdCompact(fund.valueUsd) : "—"}</td>
                <td>
                  {fund.eligibilitySource ? (
                    <a className={styles.link} href={fund.eligibilitySource} target="_blank" rel="noreferrer">
                      {fund.eligibilityLabel}
                    </a>
                  ) : (
                    fund.eligibilityLabel
                  )}
                  {fund.jurisdiction ? <span className={styles.sub}>{fund.jurisdiction}</span> : null}
                </td>
                <td>
                  <span className={`${styles.badge} ${styles[fund.access === true ? "up" : fund.access === false ? "down" : "muted"]}`}>
                    {fund.access === true ? "ELIGIBLE" : fund.access === false ? "NOT ELIGIBLE" : "CHECK TERMS"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.footnote}>
        Bought from the issuer at the fund&apos;s price rather than on an exchange. Eligibility is each fund&apos;s own rule, linked to
        its source, checked against your answers ({residence === "us" ? "United States" : "outside the US"}); “check terms” means the
        rule doesn&apos;t settle it for you.
      </p>
    </details>
  );
}
