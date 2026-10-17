import type { Metadata } from "next";
import { Coin } from "@/components/Coin";
import { Icon } from "@/components/Icon";
import { SourceLine } from "@/components/SourceLine";
import { Unavailable } from "@/components/Unavailable";
import { WarmLink } from "@/components/WarmLink";
import { ISSUERS } from "@/data/issuers";
import { CHAINS } from "@/server/chains";
import { FEATURED, searchStocks } from "@/server/stocks/search";
import { loadUniverse } from "@/server/stocks/universe";
import { StockSearch } from "./StockSearch";
import styles from "./stocks.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stocks",
  description: "Type a ticker and see where its tokenized form can be bought at the best live price.",
};

export default async function StocksPage() {
  const universe = await loadUniverse().catch(() => null);
  const featured = universe ? searchStocks(universe.value.stocks, "", FEATURED.length) : [];

  return (
    <main className="shell page">
      <header className="page-head">
        <span className="eyebrow">Step 3</span>
        <h1 className="title">Buy tokenized stocks</h1>
        <p className="lede">
          The same stock is sold as a token by several companies, on several chains, at slightly different prices.
          Type a ticker and we will find where your order fills best right now.
        </p>
      </header>

      {universe ? (
        <>
          <StockSearch total={universe.value.stocks.length} />

          <section className="section" aria-labelledby="popular">
            <div className="section-head">
              <h2 id="popular" className="heading">
                Popular
              </h2>
            </div>
            <ul className="grid" style={{ "--min": "250px", "--gap": "14px" } as React.CSSProperties}>
              {featured.map((stock, index) => (
                <li key={stock.ticker} className="rise" style={{ "--i": index } as React.CSSProperties}>
                  <WarmLink ticker={stock.ticker} href={`/stocks/${stock.ticker}`} className={`card tight ${styles.stock}`}>
                    <Coin label={stock.ticker} size={44} />
                    <span className={styles.stockText}>
                      <strong>{stock.name}</strong>
                      <span className="tiny faint">
                        {stock.ticker} · {stock.issuers.length} {stock.issuers.length === 1 ? "issuer" : "issuers"} ·{" "}
                        {stock.chains.length} {stock.chains.length === 1 ? "chain" : "chains"}
                      </span>
                    </span>
                    <Icon name="arrowRight" size={17} className={styles.go} />
                  </WarmLink>
                </li>
              ))}
            </ul>
          </section>

          <section className="section" aria-labelledby="issuers">
            <div className="section-head">
              <div>
                <h2 id="issuers" className="heading">
                  Who issues them
                </h2>
                <p>A token is only as good as the company standing behind it. These are the issuers we read.</p>
              </div>
            </div>
            <div className="notice caution" style={{ marginBottom: 18 }}>
              <Icon name="alert" />
              <span>
                <strong>Most tokenized stocks are not offered to people in the United States.</strong> Each issuer sets
                its own rules by country. Check them before you buy.
              </span>
            </div>
            <ul className="grid" style={{ "--min": "300px" } as React.CSSProperties}>
              {Object.values(ISSUERS).map((issuer) => {
                const count = universe.value.stocks.filter((stock) => stock.issuers.includes(issuer.id)).length;
                const unread = universe.value.missing.some((item) => item.issuer === issuer.id);
                return (
                  <li key={issuer.id} className="card">
                    <div className="stack" style={{ "--gap": "12px" } as React.CSSProperties}>
                      <div className="row" style={{ "--gap": "12px" } as React.CSSProperties}>
                        <Coin label={issuer.company} size={44} />
                        <div>
                          <h3 className="subheading">{issuer.name}</h3>
                          <p className="tiny faint">
                            {unread ? "Catalog could not be read" : `${count.toLocaleString("en-US")} stocks and funds`} ·
                            mostly on {issuer.home}
                          </p>
                        </div>
                      </div>
                      <p className="small muted">{issuer.whatYouOwn}</p>
                      <dl className={styles.issuerFacts}>
                        <div>
                          <dt>Dividends</dt>
                          <dd>{issuer.dividends}</dd>
                        </div>
                        <div>
                          <dt>Who can buy</dt>
                          <dd>{issuer.eligibility.summary}</dd>
                        </div>
                      </dl>
                      <a className="link small" href={issuer.url} target="_blank" rel="noreferrer" style={{ justifySelf: "start" }}>
                        {issuer.company.split(" ")[0]}'s terms
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      ) : (
        <Unavailable what="The list of tokenized stocks" />
      )}

      <SourceLine
        sources={universe ? [{ name: "each issuer's own catalog", fetchedAt: universe.fetchedAt, stale: universe.stale }] : []}
        note={`Chains covered: ${Object.values(CHAINS)
          .filter((chain) => chain.dexscreener)
          .map((chain) => chain.name)
          .join(", ")}.`}
      />
    </main>
  );
}
