import Link from "next/link";
import { Suspense } from "react";
import { Coin } from "@/components/Coin";
import { Icon, type IconName } from "@/components/Icon";
import { BRAND } from "@/lib/brand";
import { percent, rate, signedPercent, usd, usdCompact } from "@/lib/format";
import { loadStablecoins, STABLECOIN_RULES } from "@/server/stablecoins";
import { lookupStock } from "@/server/stocks/lookup";
import { loadUniverse } from "@/server/stocks/universe";
import { loadYields, steadyRate, YIELD_RULES } from "@/server/yields";
import styles from "./home.module.css";

export const dynamic = "force-dynamic";

const STEPS: Array<{ href: string; icon: IconName; title: string; body: string; action: string }> = [
  {
    href: "/dollars",
    icon: "dollar",
    title: "Get digital dollars",
    body: "See which stablecoins pass our checks and where to buy each one with a bank transfer or card.",
    action: "Compare on-ramps",
  },
  {
    href: "/earn",
    icon: "sprout",
    title: "Put them to work",
    body: "Compare interest rates across vetted lenders, with the risks of each written in plain words.",
    action: "See today's rates",
  },
  {
    href: "/stocks",
    icon: "chart",
    title: "Buy tokenized stocks",
    body: "Type a ticker. We check every issuer and chain and show where your order fills at the best price.",
    action: "Look up a stock",
  },
  {
    href: "/plan",
    icon: "compass",
    title: "Plan the long run",
    body: "Test a mix against real history, or map a path that shifts from stocks to steady yield over time.",
    action: "Open the planner",
  },
];

async function RateTile() {
  try {
    const { value } = await loadYields();
    const top = value.opportunities
      .filter((item) => item.risk === 1 && !item.mostlyRewards && !item.flags.some((flag) => flag.tone === "caution"))
      .sort((a, b) => steadyRate(b) - steadyRate(a))[0];
    if (!top) return null;
    return (
      <Link href={`/earn?coin=${top.asset}`} className={styles.tile}>
        <span className={styles.tileLabel}>Top established rate</span>
        <span className="figure medium">{rate(steadyRate(top))}</span>
        <span className="small muted">
          {top.asset} on {top.protocolName} · {top.chainName}
        </span>
      </Link>
    );
  } catch {
    return null;
  }
}

async function StockTile() {
  try {
    const { value } = await lookupStock("AAPL", 1000);
    const best = value?.venues.find((venue) => venue.id === value.bestVenueId);
    if (!value || !best) return null;
    return (
      <Link href="/stocks/AAPL" className={styles.tile}>
        <span className={styles.tileLabel}>Best place to buy Apple now</span>
        <span className="figure medium">{best.chainName}</span>
        <span className="small muted">
          {usd(best.allInPerShare)} a share, {signedPercent(best.premium)} vs the stock
        </span>
      </Link>
    );
  } catch {
    return null;
  }
}

async function CoinsTile() {
  try {
    const { value } = await loadStablecoins();
    const total = value.coins.reduce((sum, coin) => sum + coin.supplyUsd, 0);
    return (
      <Link href="/dollars" className={styles.tile}>
        <span className={styles.tileLabel}>Stablecoins that pass our checks</span>
        <span className="row" style={{ "--gap": "0px" } as React.CSSProperties}>
          {value.coins.slice(0, 5).map((coin, index) => (
            <span key={coin.symbol} style={{ marginLeft: index ? -8 : 0, borderRadius: 999, boxShadow: "0 0 0 2px var(--surface)" }}>
              <Coin label={coin.symbol} size={34} />
            </span>
          ))}
          <span className="figure medium" style={{ marginLeft: 12 }}>
            {value.coins.length}
          </span>
        </span>
        <span className="small muted">{usdCompact(total)} in circulation between them</span>
      </Link>
    );
  } catch {
    return null;
  }
}

async function CatalogLine() {
  try {
    const { value } = await loadUniverse();
    return (
      <>
        {value.stocks.length.toLocaleString("en-US")} stocks and funds tracked across {new Set(value.stocks.flatMap((stock) => stock.chains)).size} chains
      </>
    );
  } catch {
    return <>Stocks and funds tracked across every major chain</>;
  }
}

const TileFallback = () => <div className={`skeleton ${styles.tileSkeleton}`} />;

export default function Home() {
  return (
    <main>
      <section className={styles.hero}>
        <div className={`shell ${styles.heroGrid}`}>
          <div className="stack" style={{ "--gap": "24px" } as React.CSSProperties}>
            <span className="pill outline" style={{ justifySelf: "start" }}>
              <span className="live-dot" />
              <Suspense fallback="Live prices and rates">
                <CatalogLine />
              </Suspense>
            </span>
            <h1 className="display">
              Your first tokenized portfolio, <em>made clear.</em>
            </h1>
            <p className="lede">{BRAND.description}</p>
            <div className="row">
              <Link href="/dollars" className="button primary">
                Start with dollars
                <Icon name="arrowRight" size={17} />
              </Link>
              <Link href="/stocks" className="button ghost">
                Look up a stock
              </Link>
            </div>
          </div>

          <div className={styles.tiles} aria-label="Live right now">
            <Suspense fallback={<TileFallback />}>
              <RateTile />
            </Suspense>
            <Suspense fallback={<TileFallback />}>
              <StockTile />
            </Suspense>
            <Suspense fallback={<TileFallback />}>
              <CoinsTile />
            </Suspense>
          </div>
        </div>
      </section>

      <section className="shell section" aria-labelledby="steps">
        <div className="section-head">
          <div>
            <span className="eyebrow">Four steps</span>
            <h2 id="steps" className="title" style={{ marginTop: 8 }}>
              From dollars to a portfolio
            </h2>
          </div>
        </div>
        <ol className={styles.steps}>
          {STEPS.map((step, index) => (
            <li key={step.href} className="rise" style={{ "--i": index } as React.CSSProperties}>
              <Link href={step.href} className={`card ${styles.step}`}>
                <span className={styles.stepTop}>
                  <span className={styles.stepIcon}>
                    <Icon name={step.icon} size={22} />
                  </span>
                  <span className={styles.stepNumber}>{index + 1}</span>
                </span>
                <h3 className="heading">{step.title}</h3>
                <p className="muted">{step.body}</p>
                <span className={styles.stepAction}>
                  {step.action}
                  <Icon name="arrowRight" size={16} />
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="shell section" aria-labelledby="principles">
        <div className={`card sunk ${styles.principles}`}>
          <div className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>
            <span className="eyebrow">How we choose</span>
            <h2 id="principles" className="title">
              Checked before it is shown
            </h2>
            <p className="muted" style={{ maxWidth: "46ch" }}>
              Nothing appears here because someone paid for it. Every coin, lender and token passes written rules
              first, and we tell you what we left out.
            </p>
            <Link href="/method" className="link" style={{ justifySelf: "start", marginTop: 6 }}>
              Read the rules
            </Link>
          </div>
          <ul className={styles.principleList}>
            <li>
              <Icon name="shield" size={22} />
              <div>
                <h3 className="subheading">Vetted, with reasons</h3>
                <p className="small muted">
                  Stablecoins must hold within {percent(STABLECOIN_RULES.maxPegDeviation, 1)} of a dollar with over{" "}
                  {usdCompact(STABLECOIN_RULES.minSupplyUsd)} in circulation. Lenders need a year of history and{" "}
                  {usdCompact(YIELD_RULES.minProtocolTvlUsd)} in deposits.
                </p>
              </div>
            </li>
            <li>
              <Icon name="clock" size={22} />
              <div>
                <h3 className="subheading">Live, not last week</h3>
                <p className="small muted">
                  Stock prices are real quotes for your order size, taken when you ask. Every figure shows where it
                  came from and when.
                </p>
              </div>
            </li>
            <li>
              <Icon name="info" size={22} />
              <div>
                <h3 className="subheading">Honest about gaps</h3>
                <p className="small muted">
                  When something cannot be read, we say so and leave it blank. We never fill a gap with a guess.
                </p>
              </div>
            </li>
          </ul>
        </div>
      </section>
    </main>
  );
}
