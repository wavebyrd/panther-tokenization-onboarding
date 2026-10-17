"use client";

import { useEffect, useMemo, useState } from "react";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { LineChart } from "@/components/charts/LineChart";
import { Coin } from "@/components/Coin";
import { Icon } from "@/components/Icon";
import { day, percent, rate, usd, usdCompact } from "@/lib/format";
import type { RatePoint, SkippedProtocol, YieldOpportunity, YieldReport } from "@/server/yields";
import styles from "./earn.module.css";

type Sort = "steady" | "today" | "size";

const SORTS: Array<{ id: Sort; label: string }> = [
  { id: "steady", label: "Steady rate" },
  { id: "today", label: "Today's rate" },
  { id: "size", label: "Largest" },
];

/** The lower of today's rate and its 30-day average: what the pool has actually held. */
const steady = (item: YieldOpportunity) => (item.apy30d && item.apy30d > 0 ? Math.min(item.apy, item.apy30d) : item.apy);

export function EarnExplorer({
  opportunities,
  riskLevels,
  skipped,
  rules,
  reviewedOn,
  initialCoin,
  initialChain,
}: {
  opportunities: YieldOpportunity[];
  riskLevels: YieldReport["riskLevels"];
  skipped: SkippedProtocol[];
  rules: YieldReport["rules"];
  reviewedOn: string;
  initialCoin?: string;
  initialChain?: string;
}) {
  const coins = useMemo(() => [...new Set(opportunities.map((item) => item.asset))], [opportunities]);
  const [coin, setCoin] = useState<string | null>(
    () => coins.find((item) => item.toUpperCase() === initialCoin?.toUpperCase()) ?? null,
  );
  const [chain, setChain] = useState<string | null>(initialChain ?? null);
  const [maxRisk, setMaxRisk] = useState(1);
  const [rewards, setRewards] = useState(false);
  const [sort, setSort] = useState<Sort>("steady");
  const [amount, setAmount] = useState(10_000);
  const [open, setOpen] = useState<string | null>(null);

  const chains = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of opportunities) {
      if (!coin || item.asset === coin) seen.set(item.chain, item.chainName);
    }
    return [...seen].map(([id, name]) => ({ id, name }));
  }, [opportunities, coin]);
  const activeChain = chain && chains.some((item) => item.id === chain) ? chain : null;

  const { shown, hiddenByRewards } = useMemo(() => {
    const inScope = opportunities.filter(
      (item) => (!coin || item.asset === coin) && (!activeChain || item.chain === activeChain) && item.risk <= maxRisk,
    );
    const kept = inScope.filter((item) => rewards || !item.mostlyRewards);
    kept.sort((a, b) => (sort === "size" ? b.tvlUsd - a.tvlUsd : sort === "today" ? b.apy - a.apy : steady(b) - steady(a)));
    return { shown: kept, hiddenByRewards: inScope.length - kept.length };
  }, [opportunities, coin, activeChain, maxRisk, rewards, sort]);

  const top = shown[0];

  return (
    <div className="stack" style={{ "--gap": "28px" } as React.CSSProperties}>
      {/* ---- filters: one row above everything they scope ---- */}
      <section className={`card ${styles.filters}`} aria-label="Filters">
        <div className="field">
          <span className="label">Coin</span>
          <div className="chips" role="group" aria-label="Coin">
            <button type="button" className="chip small" aria-pressed={coin === null} onClick={() => setCoin(null)}>
              Any
            </button>
            {coins.map((item) => (
              <button key={item} type="button" className="chip small" aria-pressed={coin === item} onClick={() => setCoin(item)}>
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="label">Chain</span>
          <div className="chips" role="group" aria-label="Chain">
            <button type="button" className="chip small" aria-pressed={activeChain === null} onClick={() => setChain(null)}>
              Any
            </button>
            {chains.map((item) => (
              <button
                key={item.id}
                type="button"
                className="chip small"
                aria-pressed={activeChain === item.id}
                onClick={() => setChain(item.id)}
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.filterRow}>
          <div className="field">
            <span className="label">Include</span>
            <div className="segmented" role="group" aria-label="Risk group">
              {riskLevels.map((level) => (
                <button key={level.level} type="button" aria-pressed={maxRisk === level.level} onClick={() => setMaxRisk(level.level)}>
                  {level.level === 1 ? level.label : `+ ${level.label}`}
                </button>
              ))}
            </div>
            <span className="hint">{riskLevels.find((level) => level.level === maxRisk)?.explainer}</span>
          </div>

          <div className="field">
            <label htmlFor="deposit">If I deposit</label>
            <div className="input-wrap" style={{ maxWidth: 200 }}>
              <span className="affix">$</span>
              <input
                id="deposit"
                className="input has-prefix num"
                type="number"
                inputMode="decimal"
                min={0}
                step={100}
                value={Number.isFinite(amount) ? amount : ""}
                onChange={(event) => setAmount(Math.max(0, Number(event.target.value)))}
              />
            </div>
          </div>
        </div>

        <label className="switch">
          <input type="checkbox" checked={rewards} onChange={(event) => setRewards(event.target.checked)} />
          <span className="track" />
          <span>
            Include rates paid mostly in reward tokens
            <span className="tiny faint" style={{ display: "block" }}>
              These pay in another token instead of interest, and often shrink or end.
            </span>
          </span>
        </label>
      </section>

      {/* ---- the answer ---- */}
      {top ? (
        <section className={`card feature ${styles.answer}`} aria-label="Top rate">
          <div className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>
            <span className="pill brand" style={{ justifySelf: "start" }}>
              <Icon name="check" size={14} />
              Top {sort === "size" ? "by size" : "rate"} for your filters
            </span>
            <div className="row" style={{ "--gap": "14px", marginTop: 6 } as React.CSSProperties}>
              <Coin label={top.protocolName} size={52} />
              <div>
                <h2 className="heading">
                  {top.asset} on {top.protocolName}
                </h2>
                <p className="small muted">
                  {top.poolName ? `${top.poolName} · ` : ""}
                  {top.chainName} · {top.protocolKindLabel}
                </p>
              </div>
            </div>
          </div>
          <div className={styles.answerFigures}>
            <div className="stat">
              <span className="label">Steady rate</span>
              <span className="figure hero num">{rate(steady(top))}</span>
            </div>
            <div className="stat">
              <span className="label">On {usd(amount, { cents: false })}, about</span>
              <span className="figure medium num">{usd((amount * steady(top)) / 100, { cents: false })}</span>
              <span className="note">a year, if the rate held</span>
            </div>
          </div>
        </section>
      ) : null}

      {/* ---- the list ---- */}
      <section aria-labelledby="list">
        <div className="section-head">
          <div>
            <h2 id="list" className="heading">
              {shown.length} {shown.length === 1 ? "place" : "places"} to earn
            </h2>
            {hiddenByRewards > 0 ? (
              <p className="small">
                {hiddenByRewards} more pay mostly in reward tokens and are hidden.{" "}
                <button type="button" className="link" onClick={() => setRewards(true)}>
                  Show them
                </button>
              </p>
            ) : null}
          </div>
          <div className="segmented" role="group" aria-label="Sort by">
            {SORTS.map((item) => (
              <button key={item.id} type="button" aria-pressed={sort === item.id} onClick={() => setSort(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {shown.length ? (
          <ol className={styles.list}>
            {shown.map((item, index) => (
              <li key={item.id} className={`card tight ${styles.item}`}>
                <button
                  type="button"
                  className={styles.row}
                  aria-expanded={open === item.id}
                  aria-controls={`detail-${item.id}`}
                  onClick={() => setOpen(open === item.id ? null : item.id)}
                >
                  <span className={`${styles.rank} num`}>{index + 1}</span>
                  <Coin label={item.protocolName} size={42} />
                  <span className={styles.name}>
                    <strong>
                      {item.asset} on {item.protocolName}
                    </strong>
                    <span className="tiny faint">
                      {item.poolName ? `${item.poolName} · ` : ""}
                      {item.chainName}
                    </span>
                  </span>
                  <span className={styles.flags}>
                    {item.risk > 1 ? <span className="pill outline">{item.riskLabel}</span> : null}
                    {item.flags
                      .filter((flag) => flag.tone === "caution")
                      .slice(0, 2)
                      .map((flag) => (
                        <span key={flag.id + flag.label} className="pill caution">
                          <Icon name="alert" size={13} />
                          {flag.label}
                        </span>
                      ))}
                  </span>
                  <span className={styles.size}>
                    <span className="tiny faint">Deposits</span>
                    <span className="num">{usdCompact(item.tvlUsd)}</span>
                  </span>
                  <span className={styles.rate}>
                    <span className="figure medium num">{rate(steady(item))}</span>
                    <span className="tiny faint num">about {usd((amount * steady(item)) / 100, { cents: false })} a year</span>
                  </span>
                  <Icon name="chevronDown" className={styles.chevron} />
                </button>
                {open === item.id ? <Detail item={item} /> : null}
              </li>
            ))}
          </ol>
        ) : (
          <div className="notice plain">
            <Icon name="info" />
            <span>
              Nothing matches these filters. Try another chain, include more groups, or include rates paid in reward
              tokens.
            </span>
          </div>
        )}
      </section>

      {/* ---- how this list is made ---- */}
      <section>
        <details className="disclosure">
          <summary>
            How this list is made, and what was left out
            <Icon name="chevronDown" className="chevron" />
          </summary>
          <div className="body stack" style={{ "--gap": "14px" } as React.CSSProperties}>
            <ul className={styles.rules}>
              <li>The lender has been reviewed by us, last on {day(reviewedOn)}.</li>
              <li>
                The lender holds at least {usdCompact(rules.minProtocolTvlUsd)} and has run for at least a year.
              </li>
              <li>The pool holds one listed stablecoin, matched by its contract address, not its name.</li>
              <li>
                The pool holds at least {usdCompact(rules.minPoolTvlUsd)} and pays no more than {rate(rules.maxApy, 0)},
                above which a stablecoin rate is usually an error or a short promotion.
              </li>
              <li>Managed vaults must be listed by Morpho itself, open to deposits, and free of serious warnings.</li>
              <li>
                The steady rate is the lower of today's rate and its 30-day average, so a brief spike cannot rank
                first.
              </li>
            </ul>
            {skipped.length ? (
              <div>
                <h3 className="subheading" style={{ color: "var(--ink)" }}>
                  Left out today
                </h3>
                <ul className={styles.skipped}>
                  {skipped.map((item) => (
                    <li key={item.name}>
                      <strong>{item.name}</strong>
                      <span>{item.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </details>
      </section>
    </div>
  );
}

function Detail({ item }: { item: YieldOpportunity }) {
  const [history, setHistory] = useState<RatePoint[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setHistory(null);
    setFailed(false);
    fetch(`/api/v1/yields/${item.id}/history`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("unavailable"))))
      .then((body: { data: { history: RatePoint[] } }) => {
        if (live) setHistory(body.data.history.slice(-365));
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [item.id]);

  return (
    <div id={`detail-${item.id}`} className={styles.detail}>
      <div className="stack" style={{ "--gap": "18px" } as React.CSSProperties}>
        <div className="stats">
          <div className="stat">
            <span className="label">Today</span>
            <span className="value num">{rate(item.apy)}</span>
          </div>
          <div className="stat">
            <span className="label">30-day average</span>
            <span className="value num">{rate(item.apy30d)}</span>
          </div>
          <div className="stat">
            <span className="label">From interest</span>
            <span className="value num">{rate(item.apyBase)}</span>
          </div>
          <div className="stat">
            <span className="label">From rewards</span>
            <span className="value num">{item.apyReward ? rate(item.apyReward) : "None"}</span>
          </div>
        </div>

        <div>
          <h4 className="subheading">How it earns</h4>
          <p className="muted small" style={{ marginTop: 4, maxWidth: "62ch" }}>
            {item.how}
          </p>
        </div>
        <div>
          <h4 className="subheading">What could go wrong</h4>
          <ul className={styles.risks}>
            <li>
              <Icon name="info" size={16} />
              <span>{item.watchFor}</span>
            </li>
            {item.flags
              .filter((flag) => flag.id !== "managed" && flag.id !== "credit")
              .map((flag) => (
                <li key={flag.id + flag.label}>
                  <Icon name={flag.tone === "caution" ? "alert" : "info"} size={16} />
                  <span>{flag.detail}</span>
                </li>
              ))}
            <li>
              <Icon name="info" size={16} />
              <span>Like all of these, it runs on code that could have a flaw, and deposits are not insured.</span>
            </li>
          </ul>
        </div>
        <div className="row small" style={{ "--gap": "18px" } as React.CSSProperties}>
          <a className="link" href={item.protocolUrl} target="_blank" rel="noreferrer">
            Open {item.protocolName}
          </a>
          <a className="link" href={item.sourceUrl} target="_blank" rel="noreferrer">
            See the source data
          </a>
          <a className="link" href={`/dollars?coin=${item.asset}&chain=${item.chain}`}>
            Where to buy {item.asset} on {item.chainName}
          </a>
        </div>
      </div>

      <div className={styles.history}>
        {history && history.length > 1 ? (
          <ChartFrame
            title="Rate over the past year"
            subtitle={`${item.asset} on ${item.protocolName}, ${item.chainName}`}
            table={{
              columns: ["Date", "Rate", "Deposits"],
              rows: [...history].reverse().map((point) => [day(point.date), rate(point.apy), usdCompact(point.tvlUsd)]),
            }}
          >
            <LineChart
              x={history.map((point) => point.date)}
              series={[
                { id: "rate", label: "Rate", color: "var(--series-1)", values: history.map((point) => point.apy), fill: true },
              ]}
              height={220}
              formatY={(value) => rate(value, value < 10 ? 1 : 0)}
              formatX={(value) => day(value).replace(/, \d{4}$/, "")}
            />
          </ChartFrame>
        ) : failed ? (
          <p className="small faint">The rate history could not be read just now.</p>
        ) : history ? (
          <p className="small faint">This pool is too new to have a rate history.</p>
        ) : (
          <div className="skeleton" style={{ height: 260 }} />
        )}
        <p className="tiny faint" style={{ marginTop: 12 }}>
          {item.protocolName} holds {usdCompact(item.protocolTvlUsd)} in total
          {item.protocolAgeYears !== null ? ` and has been tracked for ${item.protocolAgeYears.toFixed(1)} years` : ""}.
          {item.managers.length ? ` This vault is managed by ${item.managers.join(" and ")}.` : ""}
          {item.apy30d && item.apy !== steady(item) ? ` Today's rate is ${percent(item.apy / item.apy30d - 1, 0)} above its average.` : ""}
        </p>
      </div>
    </div>
  );
}
