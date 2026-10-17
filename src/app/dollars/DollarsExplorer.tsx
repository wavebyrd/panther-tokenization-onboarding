"use client";

import { useMemo, useState } from "react";
import { Coin } from "@/components/Coin";
import { Icon } from "@/components/Icon";
import { day, percent, signedPercent, usd, usdCompact } from "@/lib/format";
import type { OnrampOffer, OnrampProvider } from "@/server/onramps";
import type { ExcludedCoin, Stablecoin, StablecoinReport } from "@/server/stablecoins";
import styles from "./dollars.module.css";

const BACKING_TONE: Record<Stablecoin["backing"], string> = { cash: "good", crypto: "info", synthetic: "caution" };

interface Match {
  provider: OnrampProvider;
  offer: OnrampOffer;
  /** Whether the provider is known to deliver on the chosen chain; null when it does not publish networks. */
  delivers: boolean | null;
}

export function DollarsExplorer({
  coins,
  excluded,
  rules,
  reviewedOn,
  providers,
  initialCoin,
  initialChain,
}: {
  coins: Stablecoin[];
  excluded: ExcludedCoin[];
  rules: StablecoinReport["rules"];
  reviewedOn: string;
  providers: OnrampProvider[];
  initialCoin?: string;
  initialChain?: string;
}) {
  // Opens on USDC: the coin the most on-ramps sell and the most lenders accept.
  const [symbol, setSymbol] = useState(
    () =>
      coins.find((coin) => coin.symbol.toUpperCase() === (initialCoin ?? "USDC").toUpperCase())?.symbol ??
      coins[0]?.symbol,
  );
  const [chain, setChain] = useState<string | null>(initialChain ?? null);
  const coin = coins.find((item) => item.symbol === symbol) ?? coins[0];

  const chains = useMemo(() => coin.chains.filter((item) => item.chain !== null).slice(0, 8), [coin]);
  const activeChain = chain && chains.some((item) => item.chain === chain) ? chain : null;
  const chainName = chains.find((item) => item.chain === activeChain)?.label ?? null;

  const { matches, without, down } = useMemo(() => {
    const found: Match[] = [];
    const missing: string[] = [];
    for (const provider of providers) {
      if (provider.status !== "live") continue;
      const offer = provider.offers.find((item) => item.symbol === coin.symbol);
      if (!offer) {
        missing.push(provider.name);
        continue;
      }
      const delivers =
        activeChain === null
          ? true
          : offer.networks === null
            ? null
            : offer.networks.some((item) => item.chain === activeChain && item.enabled);
      if (delivers === false) {
        missing.push(provider.name);
        continue;
      }
      found.push({ provider, offer, delivers });
    }
    // Known to deliver first, then exchanges before direct on-ramps, then the cheaper price.
    found.sort(
      (a, b) =>
        Number(b.delivers === true) - Number(a.delivers === true) ||
        Number(a.provider.kind === "direct") - Number(b.provider.kind === "direct") ||
        (a.offer.premium ?? 1) - (b.offer.premium ?? 1),
    );
    return {
      matches: found,
      without: missing,
      down: providers.filter((provider) => provider.status !== "live").map((provider) => provider.name),
    };
  }, [providers, coin.symbol, activeChain]);

  return (
    <div className="stack" style={{ "--gap": "clamp(28px, 4vw, 44px)" } as React.CSSProperties}>
      {/* ---- choose a coin ---- */}
      <section aria-labelledby="choose">
        <h2 id="choose" className="sr-only">
          Choose a stablecoin
        </h2>
        <div className={styles.coins} role="radiogroup" aria-label="Stablecoin">
          {coins.map((item) => (
            <button
              key={item.symbol}
              type="button"
              role="radio"
              aria-checked={item.symbol === coin.symbol}
              className={styles.coin}
              onClick={() => {
                setSymbol(item.symbol);
                setChain(null);
              }}
            >
              <Coin label={item.symbol} size={38} />
              <span className={styles.coinText}>
                <strong>{item.symbol}</strong>
                <span className="tiny faint num">{usdCompact(item.supplyUsd)}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* ---- about the coin ---- */}
      <section className={`card ${styles.about}`} aria-labelledby="about-coin">
        <div className="stack" style={{ "--gap": "18px" } as React.CSSProperties}>
          <div className="row" style={{ "--gap": "14px" } as React.CSSProperties}>
            <Coin label={coin.symbol} size={56} />
            <div>
              <h2 id="about-coin" className="heading">
                {coin.name}
              </h2>
              <p className="small muted">
                {coin.symbol} · issued by {coin.issuer} · since {coin.launched}
              </p>
            </div>
          </div>
          <div className="row" style={{ "--gap": "8px" } as React.CSSProperties}>
            <span className={`pill ${BACKING_TONE[coin.backing]}`}>
              <Icon name={coin.backing === "synthetic" ? "alert" : "shield"} size={14} />
              {coin.backingLabel}
            </span>
            {coin.pegDeviation !== null ? (
              <span className="pill good">
                <Icon name="check" size={14} />
                Holding at {usd(coin.price, { cents: true })}
              </span>
            ) : null}
          </div>
          <p className="muted" style={{ maxWidth: "58ch" }}>
            {coin.backingSummary}
          </p>

          <dl className="facts">
            <div>
              <dt>In circulation</dt>
              <dd>
                {usdCompact(coin.supplyUsd)}
                {coin.supplyChange30d !== null ? (
                  <span className="small faint"> · {signedPercent(coin.supplyChange30d, 1)} in 30 days</span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt>Distance from $1 now</dt>
              <dd>{coin.pegDeviation !== null ? percent(coin.pegDeviation, 2) : "Not published"}</dd>
            </div>
          </dl>

          <div>
            <h3 className="subheading">Turning it back into dollars</h3>
            <p className="muted small" style={{ marginTop: 4, maxWidth: "58ch" }}>
              {coin.redemption}
            </p>
          </div>

          <div className="row small" style={{ "--gap": "18px" } as React.CSSProperties}>
            <a className="link" href={coin.site} target="_blank" rel="noreferrer">
              {coin.issuer.split(/[ ,(]/)[0]}'s site
            </a>
            {coin.reservesUrl ? (
              <a className="link" href={coin.reservesUrl} target="_blank" rel="noreferrer">
                Reserve reports
              </a>
            ) : null}
          </div>
        </div>

        <div className="stack" style={{ "--gap": "20px" } as React.CSSProperties}>
          <div className={styles.panel}>
            <h3 className="subheading">Good to know</h3>
            <ul className={styles.watch}>
              {coin.watchFor.map((item) => (
                <li key={item}>
                  <Icon name="info" size={17} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className={styles.panel}>
            <h3 className="subheading">Where it lives</h3>
            <p className="tiny faint" style={{ marginBottom: 12 }}>
              Share of all {coin.symbol} on each chain
            </p>
            <ul className={styles.bars}>
              {coin.chains.slice(0, 6).map((item) => (
                <li key={item.label}>
                  <span className="small">{item.label}</span>
                  <span className="meter" aria-hidden="true">
                    <span style={{ width: `${Math.max(1.5, item.share * 100)}%` }} />
                  </span>
                  <span className="small num" style={{ fontWeight: 600 }}>
                    {percent(item.share, item.share < 0.1 ? 1 : 0)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ---- where to buy ---- */}
      <section aria-labelledby="buy">
        <div className="section-head">
          <div>
            <h2 id="buy" className="heading">
              Where to buy {coin.symbol}
            </h2>
            <p>
              Prices are the live market price for one coin, before each provider's own fee.
              {chains.length ? " Choose a chain to see who can deliver it there." : ""}
            </p>
          </div>
        </div>

        {chains.length ? (
          <div className="chips scroll" style={{ marginBottom: 20 }} role="group" aria-label="Deliver on chain">
            <button type="button" className="chip small" aria-pressed={activeChain === null} onClick={() => setChain(null)}>
              Any chain
            </button>
            {chains.map((item) => (
              <button
                key={item.label}
                type="button"
                className="chip small"
                aria-pressed={activeChain === item.chain}
                onClick={() => setChain(item.chain)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}

        {matches.length ? (
          <ul className={styles.providers}>
            {matches.map(({ provider, offer, delivers }, index) => (
              <li key={provider.id} className="card rise" style={{ "--i": index } as React.CSSProperties}>
                <ProviderCard provider={provider} offer={offer} delivers={delivers} chain={activeChain} chainName={chainName} symbol={coin.symbol} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="notice plain">
            <Icon name="info" />
            <span>
              None of the providers we read sells {coin.symbol}
              {chainName ? ` with delivery on ${chainName}` : ""} right now.
              {chainName ? " Try another chain, or buy it on a different chain and move it across." : ""}
            </span>
          </div>
        )}

        {without.length || down.length ? (
          <p className="small faint" style={{ marginTop: 16 }}>
            {without.length ? (
              <>
                Does not sell {coin.symbol}
                {chainName ? ` on ${chainName}` : ""}: {without.join(", ")}.{" "}
              </>
            ) : null}
            {down.length ? <>Could not be read just now: {down.join(", ")}.</> : null}
          </p>
        ) : null}
      </section>

      {/* ---- what was left out ---- */}
      <section aria-labelledby="left-out">
        <details className="disclosure">
          <summary>
            <span id="left-out">Large dollar tokens we do not list, and why</span>
            <Icon name="chevronDown" className="chevron" />
          </summary>
          <div className="body stack" style={{ "--gap": "14px" } as React.CSSProperties}>
            <p className="small" style={{ maxWidth: "70ch" }}>
              A coin is listed when we have reviewed how it is backed, it has at least {usdCompact(rules.minSupplyUsd)}{" "}
              in circulation, and it trades within {percent(rules.maxPegDeviation, 1)} of a dollar. A listed coin that
              stops meeting these drops off on its own. Profiles were last reviewed on {day(reviewedOn)}.
            </p>
            <ul className={styles.excluded}>
              {excluded.map((item) => (
                <li key={item.symbol}>
                  <strong>{item.symbol}</strong>
                  <span className="faint num">{usdCompact(item.supplyUsd)}</span>
                  <span>{item.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        </details>
      </section>
    </div>
  );
}

function ProviderCard({
  provider,
  offer,
  delivers,
  chain,
  chainName,
  symbol,
}: {
  provider: OnrampProvider;
  offer: OnrampOffer;
  delivers: boolean | null;
  chain: string | null;
  chainName: string | null;
  symbol: string;
}) {
  const networks = offer.networks?.filter((item) => item.enabled) ?? null;
  const shown = networks?.slice(0, 7) ?? [];
  const more = networks ? networks.length - shown.length : 0;

  return (
    <div className={styles.provider}>
      <div className={styles.providerHead}>
        <Coin label={provider.name} size={46} />
        <div>
          <h3 className="subheading">{provider.name}</h3>
          <p className="tiny faint">{provider.kindLabel}</p>
        </div>
        <div className={styles.price}>
          {offer.ask !== null && !offer.thinMarket ? (
            <>
              <span className="figure medium num">{offer.ask === 1 ? "$1.00" : `$${offer.ask.toFixed(4)}`}</span>
              <span className="tiny faint">
                {offer.premium === 0 || offer.premium === null
                  ? "per coin"
                  : `per coin · ${signedPercent(offer.premium, 2)} vs $1`}
              </span>
            </>
          ) : offer.thinMarket ? (
            <span className="pill caution">
              <Icon name="alert" size={14} />
              Few sellers
            </span>
          ) : (
            <span className="tiny faint" style={{ maxWidth: "18ch", textAlign: "right" }}>
              Price shown when you buy
            </span>
          )}
        </div>
      </div>

      {chain && delivers === null ? (
        <div className="notice plain small">
          <Icon name="info" size={17} />
          <span>
            {provider.name} does not publish which networks it sends {symbol} on. Check that it supports {chainName}{" "}
            before you buy.
          </span>
        </div>
      ) : null}
      {offer.thinMarket ? (
        <div className="notice caution small">
          <Icon name="alert" size={17} />
          <span>
            Almost nobody is selling {symbol} for dollars here right now, so the price could be well off $1. Another
            provider is likely cheaper.
          </span>
        </div>
      ) : null}

      <dl className={styles.details}>
        <div>
          <dt>Sends it on</dt>
          <dd>
            {networks === null ? (
              <span className="faint">Not published</span>
            ) : networks.length ? (
              <span className="row" style={{ "--gap": "6px" } as React.CSSProperties}>
                {shown.map((item) => (
                  <span key={item.label} className={`pill ${item.chain === chain && chain ? "brand" : ""}`}>
                    {item.label}
                  </span>
                ))}
                {more > 0 ? <span className="pill outline">+{more} more</span> : null}
              </span>
            ) : (
              <span className="faint">Withdrawals are paused</span>
            )}
          </dd>
        </div>
        <div>
          <dt>Pay with</dt>
          <dd>{provider.funding.join(" · ")}</dd>
        </div>
        <div>
          <dt>Fees</dt>
          <dd>
            {provider.feeSummary}{" "}
            <a className="link" href={provider.feeUrl} target="_blank" rel="noreferrer">
              Current fees
            </a>
          </dd>
        </div>
        {offer.usAvailable !== null || offer.restriction ? (
          <div>
            <dt>United States</dt>
            <dd>
              {offer.usAvailable === true ? "Available" : offer.usAvailable === false ? "Not available" : ""}
              {offer.restriction ? `${offer.usAvailable !== null ? ". " : ""}${offer.restriction}` : ""}
            </dd>
          </div>
        ) : null}
      </dl>

      {offer.note ? <p className="tiny faint">{offer.note}</p> : null}

      <a className="button ghost small" href={provider.url} target="_blank" rel="noreferrer" style={{ justifySelf: "start" }}>
        Go to {provider.name}
        <Icon name="arrowUpRight" size={15} />
      </a>
    </div>
  );
}
