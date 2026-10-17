import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Coin } from "@/components/Coin";
import { Icon } from "@/components/Icon";
import { Unavailable } from "@/components/Unavailable";
import { clock, number, percent, shares, shortAddress, signedPercent, usd, usdCompact } from "@/lib/format";
import { CHAINS } from "@/server/chains";
import { lookupStock, normalizeAmount, type StockLookup, type Venue, type VenueStatus } from "@/server/stocks/lookup";
import { findStock } from "@/server/stocks/universe";
import { AmountControl, RefreshButton } from "./Controls";
import { GetThere, GetThereBrief } from "./GetThere";
import { Refreshing } from "./Live";
import styles from "../stocks.module.css";

export const dynamic = "force-dynamic";

const TICKER = /^[A-Za-z][A-Za-z0-9.]{0,9}$/;
const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-muted)"];

interface Props {
  params: Promise<{ ticker: string }>;
  searchParams: Promise<{ amount?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const stock = TICKER.test(ticker) ? await findStock(ticker).catch(() => null) : null;
  return {
    title: stock ? `${stock.name} (${stock.ticker})` : "Stock not found",
    description: stock ? `Where to buy tokenized ${stock.name} at the best live price.` : undefined,
  };
}

const STATUS: Record<VenueStatus, { label: string; tone: string }> = {
  best: { label: "Best price", tone: "brand" },
  good: { label: "Close to the share price", tone: "good" },
  fair: { label: "A little over", tone: "" },
  costly: { label: "Costly", tone: "caution" },
  thin: { label: "Too thin for this order", tone: "critical" },
  indicative: { label: "Pool price only", tone: "info" },
  unranked: { label: "Could not be compared", tone: "" },
  "no-market": { label: "Not trading", tone: "" },
};

export default async function StockPage({ params, searchParams }: Props) {
  const [{ ticker }, query] = await Promise.all([params, searchParams]);
  if (!TICKER.test(ticker)) notFound();
  const parsed = Number(query.amount);
  const amount = normalizeAmount(Number.isFinite(parsed) && parsed > 0 ? parsed : 1000);

  let stock;
  try {
    stock = await findStock(ticker);
  } catch {
    return (
      <main className="shell page">
        <Unavailable what="The list of tokenized stocks" />
      </main>
    );
  }

  if (!stock) notFound();

  return (
    <main className="shell page">
      <Link href="/stocks" className="link small" style={{ display: "inline-flex", gap: 6, alignItems: "center", marginBottom: 20 }}>
        All stocks
      </Link>

      <div className={styles.head}>
        <div className={styles.identity}>
          <Coin label={stock.ticker} size={64} />
          <div>
            <h1 className="title">{stock.name}</h1>
            <p className="muted">
              {stock.ticker} · {stock.kind === "fund" ? "Fund" : "Stock"} · tokenized by {stock.issuers.length}{" "}
              {stock.issuers.length === 1 ? "issuer" : "issuers"}
            </p>
          </div>
        </div>
      </div>

      <div className={styles.controls}>
        <AmountControl ticker={stock.ticker} amount={amount} />
        <RefreshButton />
      </div>

      <Suspense key={`${stock.ticker}:${amount}`} fallback={<ResultSkeleton />}>
        <Result ticker={stock.ticker} amount={amount} />
      </Suspense>
    </main>
  );
}

function ResultSkeleton() {
  return (
    <div className={styles.resultSkeleton} role="status" aria-label="Getting live quotes from every venue">
      <p className="small faint row" style={{ "--gap": "10px" } as React.CSSProperties}>
        <span className="spinner" aria-hidden="true" />
        Asking every venue for a live quote. This takes a few seconds.
      </p>
      <div className="skeleton" style={{ height: 300, borderRadius: "var(--radius-l)" }} />
      <div className="skeleton" style={{ height: 76 }} />
      <div className="skeleton" style={{ height: 76 }} />
      <div className="skeleton" style={{ height: 76 }} />
    </div>
  );
}

async function Result({ ticker, amount }: { ticker: string; amount: number }) {
  let read;
  try {
    read = await lookupStock(ticker, amount);
  } catch {
    return <Unavailable what="Live prices" />;
  }
  const result = read.value;
  if (!result) return <Unavailable what="Live prices" />;

  const best = result.venues.find((venue) => venue.id === result.bestVenueId) ?? null;
  const others = result.venues.filter((venue) => venue !== best);

  return (
    <div className="stack" style={{ "--gap": "28px" } as React.CSSProperties}>
      {read.stale ? (
        <Refreshing readAt={read.fetchedAt} ageSeconds={Math.max(0, Math.round((Date.now() - read.fetchedAt) / 1000))} />
      ) : null}

      <ReferenceLine result={result} readAt={read.fetchedAt} />

      {result.notes.map((note) => (
        <div key={note} className="notice caution">
          <Icon name="alert" />
          <span>{note}</span>
        </div>
      ))}

      {best ? (
        <BestCard venue={best} result={result} />
      ) : (
        <div className="notice plain">
          <Icon name="info" />
          <span>
            <strong>No venue can be called best for this order.</strong>{" "}
            {result.venues.length
              ? "None of them filled it at a sensible price, or their prices could not be compared. The details are below."
              : "The token is listed but nobody is trading it right now."}
          </span>
        </div>
      )}

      {others.length ? (
        <section aria-labelledby="others">
          <div className="section-head">
            <div>
              <h2 id="others" className="heading">
                {best ? "Everywhere else" : "Every venue"}
              </h2>
              <p>Ranked by what the same {usd(amount, { cents: false })} order would cost, network fee included.</p>
            </div>
          </div>
          <ul className={styles.venues}>
            {others.map((venue) => (
              <li key={venue.id}>
                <VenueRow venue={venue} result={result} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {result.dormant.length ? (
        <p className="small faint">
          Also issued, but not trading anywhere we can see:{" "}
          {result.dormant.map((item) => `${item.issuerName} on ${item.chains.join(", ")}`).join("; ")}.
        </p>
      ) : null}

      <section aria-labelledby="own">
        <div className="section-head">
          <div>
            <h2 id="own" className="heading">
              What you would own
            </h2>
            <p>A token tracks the stock. It is not the share itself, and each issuer works differently.</p>
          </div>
        </div>
        <div className="notice caution" style={{ marginBottom: 16 }}>
          <Icon name="alert" />
          <span>
            <strong>Most tokenized stocks are not offered to people in the United States.</strong> Check the issuer's
            terms for your country before you buy.
          </span>
        </div>
        <div className="card flat">
          {result.issuers.map((issuer) => (
            <details key={issuer.id} className="disclosure">
              <summary>
                {issuer.name}
                <Icon name="chevronDown" className="chevron" />
              </summary>
              <div className="body">
                <dl className={styles.issuerFacts}>
                  <div>
                    <dt>What it is</dt>
                    <dd>{issuer.whatYouOwn}</dd>
                  </div>
                  <div>
                    <dt>Dividends</dt>
                    <dd>{issuer.dividends}</dd>
                  </div>
                  <div>
                    <dt>Who can buy</dt>
                    <dd>
                      {issuer.eligibility}
                      {!issuer.eligibilityConfirmed ? " We have not confirmed this from the issuer's terms." : ""}
                    </dd>
                  </div>
                </dl>
                <a className="link small" href={issuer.url} target="_blank" rel="noreferrer">
                  {issuer.company.split(" ")[0]}'s terms
                </a>
              </div>
            </details>
          ))}
        </div>
      </section>

      <p className="tiny faint">
        Quotes from KyberSwap and Jupiter, pools from DexScreener, read at {clock(read.fetchedAt)}. A quote is what an
        order would fill at when it was asked; it is not an order, and the price can move before you trade.
      </p>
    </div>
  );
}

function ReferenceLine({ result, readAt }: { result: StockLookup; readAt: number }) {
  const reference = result.reference;
  return (
    <div className="card tight row between">
      <div className="row" style={{ "--gap": "12px" } as React.CSSProperties}>
        <span className={`live-dot ${reference?.live ? "" : "off"}`} aria-hidden="true" />
        <div>
          <p className="tiny faint">The real share</p>
          <p style={{ fontWeight: 650 }} className="num">
            {reference ? usd(reference.price, { cents: true }) : "Not available"}
          </p>
        </div>
      </div>
      <p className="small muted" style={{ maxWidth: "52ch", textAlign: "right" }}>
        {reference
          ? `${reference.label}${reference.marketOpen ? "" : ". The stock market is closed"}. Token prices below are measured against it.`
          : "The share price could not be read, so token prices are shown without a comparison."}{" "}
        <span className="faint">Read at {clock(readAt)}.</span>
      </p>
    </div>
  );
}

function premiumText(venue: Venue) {
  if (venue.premium === null) return "Could not be compared with the share price";
  // Closer than the figure can show: calling it over or under would be noise.
  if (Math.abs(venue.premium) < 0.00005) return "Level with the stock";
  const sign = signedPercent(venue.premium, 2);
  return venue.premium < 0 ? `${sign}, a touch under the stock` : `${sign} over the stock`;
}

function Fills({ venue }: { venue: Venue }) {
  const quote = venue.quote;
  if (!quote) return null;
  const main = quote.fills.filter((fill) => fill.share >= 0.02).slice(0, 3);
  const rest = 1 - main.reduce((sum, fill) => sum + fill.share, 0);
  const rows = [
    ...main.map((fill) => ({
      label: fill.venue,
      detail: fill.poolIsAddress ? `pool ${shortAddress(fill.pool)}` : "quoting directly",
      url: fill.url,
      share: fill.share,
    })),
    ...(rest > 0.005
      ? [{ label: "Smaller pools", detail: `${quote.fills.length - main.length} of them`, url: null, share: rest }]
      : []),
  ];

  return (
    <div className={styles.route}>
      <div>
        <h3 className="subheading row" style={{ "--gap": "8px" } as React.CSSProperties}>
          <Icon name="route" size={18} />
          How the order fills
        </h3>
        <p className="tiny faint" style={{ marginTop: 2 }}>
          {quote.direct
            ? `${quote.paidSymbol} is swapped straight for ${venue.token.symbol}`
            : `${quote.paidSymbol} is swapped into another asset first, then into ${venue.token.symbol}`}
          , through {quote.fills.length === 1 ? "one pool" : `${quote.fills.length} pools`}.
        </p>
      </div>
      {rows.length > 1 ? (
        <div className="sharebar" aria-hidden="true">
          {rows.map((row, index) => (
            <span key={row.label + index} style={{ flex: row.share, "--c": SERIES[Math.min(index, 3)] } as React.CSSProperties} />
          ))}
        </div>
      ) : null}
      <ul className={styles.fills}>
        {rows.map((row, index) => (
          <li key={row.label + index}>
            <i style={{ "--c": SERIES[Math.min(index, 3)] } as React.CSSProperties} />
            <span className={styles.where}>
              <strong style={{ fontWeight: 600 }}>{row.label}</strong>{" "}
              {row.url ? (
                <a className="link faint" href={row.url} target="_blank" rel="noreferrer" style={{ fontWeight: 450 }}>
                  {row.detail}
                </a>
              ) : (
                <span className="faint">{row.detail}</span>
              )}
            </span>
            <span className="num" style={{ fontWeight: 650 }}>
              {percent(row.share, 0)}
            </span>
          </li>
        ))}
      </ul>
      <p className="tiny faint">
        Route found by {quote.aggregator} at {clock(quote.quotedAt)}.
      </p>
    </div>
  );
}

function BestCard({ venue, result }: { venue: Venue; result: StockLookup }) {
  const quote = venue.quote!;
  const chain = CHAINS[venue.chain];
  return (
    <section className={`card feature ${styles.best}`} aria-labelledby="best">
      <div className="stack" style={{ "--gap": "16px" } as React.CSSProperties}>
        <span className="pill brand" style={{ justifySelf: "start" }}>
          <Icon name="check" size={14} />
          Best price for {usd(result.amountUsd, { cents: false })} right now
        </span>
        <div className="row" style={{ "--gap": "14px" } as React.CSSProperties}>
          <Coin label={venue.chainName} size={52} />
          <div>
            <h2 id="best" className="heading">
              {venue.chainName}
            </h2>
            <p className="small muted">
              {venue.token.symbol} from {venue.issuerName}
            </p>
          </div>
        </div>

        <div className={styles.bestFigures}>
          <div className="stat">
            <span className="label">You pay, per share</span>
            <span className="figure hero num">{usd(venue.allInPerShare, { cents: true })}</span>
            <span className="note">{premiumText(venue)}</span>
          </div>
          <div className="stat">
            <span className="label">You get</span>
            <span className="figure medium num">{shares(venue.sharesOut)}</span>
            <span className="note">shares' worth of {result.ticker}</span>
          </div>
        </div>

        <dl className="facts">
          <div>
            <dt>Network fee</dt>
            <dd>
              {quote.networkFeeUsd === null
                ? "Not quoted"
                : `${quote.networkFeeEstimated ? "About " : ""}${usd(quote.networkFeeUsd, { cents: true })}`}
            </dd>
          </div>
          <div>
            <dt>Traded here in the last day</dt>
            <dd>{venue.volume24hUsd > 0 ? usdCompact(venue.volume24hUsd) : "Not published"}</dd>
          </div>
          <div>
            <dt>Held in its pools</dt>
            <dd>{venue.liquidityUsd > 0 ? usdCompact(venue.liquidityUsd) : "Filled by market makers"}</dd>
          </div>
          {venue.sharesPerToken !== null && Math.abs(venue.sharesPerToken - 1) > 0.00005 ? (
            <div>
              <dt>One token stands for</dt>
              <dd>{number(venue.sharesPerToken, 4)} shares</dd>
            </div>
          ) : null}
        </dl>
      </div>

      <div className="stack" style={{ "--gap": "16px" } as React.CSSProperties}>
        <Fills venue={venue} />
        <ul className={styles.notes}>
          {[chain.feeNote, ...venue.notes].map((note) => (
            <li key={note}>
              <Icon name="info" size={16} />
              <span>{note}</span>
            </li>
          ))}
        </ul>
      </div>

      <GetThere venue={venue} amountUsd={result.amountUsd} />
    </section>
  );
}

function VenueRow({ venue, result }: { venue: Venue; result: StockLookup }) {
  const status = STATUS[venue.status];
  const priced = venue.quote && venue.status !== "thin";
  return (
    <details className={`card tight ${styles.venue}`}>
      <summary>
        <Coin label={venue.chainName} size={42} />
        <span className={styles.venueName}>
          <strong>{venue.chainName}</strong>
          <span className="tiny faint">
            {venue.token.symbol} from {venue.issuerName}
          </span>
        </span>
        <span className={styles.venueStatus}>
          <span className={`pill ${status.tone}`}>
            {venue.status === "thin" || venue.status === "costly" ? <Icon name="alert" size={13} /> : null}
            {status.label}
          </span>
        </span>
        <span className={styles.venueLiquidity}>
          <span className="tiny faint">In pools</span>
          <span className="num">{venue.liquidityUsd > 0 ? usdCompact(venue.liquidityUsd) : "—"}</span>
        </span>
        <span className={styles.venuePrice}>
          {priced ? (
            <>
              <span className="figure medium num">{usd(venue.allInPerShare ?? venue.allInPerToken, { cents: true })}</span>
              <span className="tiny faint num">
                {venue.premium !== null
                  ? `${signedPercent(venue.premium, 2)} vs the stock`
                  : venue.allInPerShare === null
                    ? "per token"
                    : "per share"}
              </span>
            </>
          ) : venue.indicativePerToken !== null ? (
            <>
              <span className="figure medium num">{usd(venue.indicativePerToken, { cents: true })}</span>
              <span className="tiny faint">per token, in its largest pool</span>
            </>
          ) : (
            <span className="small faint">No usable price</span>
          )}
        </span>
        <Icon name="chevronDown" className={styles.venueChevron} />
      </summary>

      <div className={styles.venueBody}>
        <div className="stack" style={{ "--gap": "16px" } as React.CSSProperties}>
          {venue.quote ? (
            <dl className="facts">
              <div>
                <dt>For {usd(result.amountUsd, { cents: false })} you get</dt>
                <dd>
                  {venue.sharesOut !== null ? `${shares(venue.sharesOut)} shares' worth` : `${shares(venue.quote.tokensOut)} tokens`}
                </dd>
              </div>
              <div>
                <dt>Extra cost over the share price</dt>
                <dd>{venue.premiumUsd !== null ? usd(Math.max(0, venue.premiumUsd), { cents: true }) : "Could not be compared"}</dd>
              </div>
              <div>
                <dt>Network fee</dt>
                <dd>
                  {venue.quote.networkFeeUsd === null
                    ? "Not quoted"
                    : `${venue.quote.networkFeeEstimated ? "About " : ""}${usd(venue.quote.networkFeeUsd, { cents: true })}`}
                </dd>
              </div>
            </dl>
          ) : (
            <div className="notice plain small">
              <Icon name="info" size={17} />
              <span>{venue.quoteIssue}</span>
            </div>
          )}
          {venue.notes.length ? (
            <ul className={styles.notes}>
              {venue.notes.map((note) => (
                <li key={note}>
                  <Icon name="info" size={16} />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="small">
            Token address:{" "}
            <a className="link num" href={venue.token.url} target="_blank" rel="noreferrer" title={venue.token.address}>
              {shortAddress(venue.token.address)}
            </a>
          </p>
          {venue.status !== "thin" ? <GetThereBrief venue={venue} /> : null}
        </div>

        <div className="stack" style={{ "--gap": "16px" } as React.CSSProperties}>
          {venue.quote && venue.status !== "thin" ? <Fills venue={venue} /> : null}
          {venue.pools.length ? (
            <div>
              <h3 className="subheading">Largest pools</h3>
              <ul className={styles.pools} style={{ marginTop: 6 }}>
                {venue.pools.map((pool) => (
                  <li key={pool.address}>
                    <a className="link" href={pool.url} target="_blank" rel="noreferrer" style={{ fontWeight: 550 }}>
                      {pool.venue} · with {pool.counterSymbol}
                    </a>
                    <span className="num">{usd(pool.priceUsd, { cents: true })}</span>
                    <span className="num faint" style={{ minWidth: 64, textAlign: "right" }}>
                      {usdCompact(pool.liquidityUsd)}
                    </span>
                  </li>
                ))}
              </ul>
              {venue.poolCount > venue.pools.length ? (
                <p className="tiny faint" style={{ marginTop: 8 }}>
                  And {venue.poolCount - venue.pools.length} smaller ones.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </details>
  );
}
