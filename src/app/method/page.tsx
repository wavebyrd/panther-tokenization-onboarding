import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { ISSUERS_REVIEWED_ON } from "@/data/issuers";
import { PROTOCOLS, PROTOCOLS_REVIEWED_ON, RISK_LABEL } from "@/data/protocols";
import { PROFILES_REVIEWED_ON, STABLECOIN_PROFILES } from "@/data/stablecoins";
import { BRAND } from "@/lib/brand";
import { day, percent, rate, usdCompact } from "@/lib/format";
import { STABLECOIN_RULES } from "@/server/stablecoins";
import { LOOKUP_RULES } from "@/server/stocks/lookup";
import { YIELD_RULES } from "@/server/yields";

export const metadata: Metadata = {
  title: "How we choose",
  description: "The written rules every stablecoin, lender and tokenized stock passes before it is shown.",
};

export default function MethodPage() {
  return (
    <main className="shell page">
      <header className="page-head">
        <span className="eyebrow">How we choose</span>
        <h1 className="title">The rules, written down</h1>
        <p className="lede">
          {BRAND.name} shows a short list on purpose. These are the checks behind it. They are the same numbers the
          code uses, so this page cannot drift from what the site does.
        </p>
      </header>

      <div className="stack" style={{ "--gap": "20px", maxWidth: 860 } as React.CSSProperties}>
        <section className="card" aria-labelledby="m-coins">
          <div className="stack" style={{ "--gap": "14px" } as React.CSSProperties}>
            <h2 id="m-coins" className="heading">
              Stablecoins
            </h2>
            <p className="muted">A coin is listed only when all of these hold. One that stops passing drops off by itself.</p>
            <ul className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>
              <Rule>
                We have read how it is backed and who issues it. {STABLECOIN_PROFILES.length} coins have a reviewed
                profile, last checked {day(PROFILES_REVIEWED_ON)}.
              </Rule>
              <Rule>At least {usdCompact(STABLECOIN_RULES.minSupplyUsd)} of it is in circulation.</Rule>
              <Rule>It trades within {percent(STABLECOIN_RULES.maxPegDeviation, 1)} of one dollar right now.</Rule>
              <Rule>It is a coin for spending and saving, not a share in a fund, and not an algorithmic design.</Rule>
            </ul>
            <p className="small muted">
              Each coin is labelled by what backs it: cash, crypto, or trading positions. We say which, and leave the
              judgement to you. <Link className="link" href="/dollars">See the coins</Link>
            </p>
          </div>
        </section>

        <section className="card" aria-labelledby="m-earn">
          <div className="stack" style={{ "--gap": "14px" } as React.CSSProperties}>
            <h2 id="m-earn" className="heading">
              Lenders and rates
            </h2>
            <ul className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>
              <Rule>
                The lender is one of {PROTOCOLS.length} we have reviewed, last checked {day(PROTOCOLS_REVIEWED_ON)}.
              </Rule>
              <Rule>
                It holds at least {usdCompact(YIELD_RULES.minProtocolTvlUsd)} and has run for at least{" "}
                {Math.round(YIELD_RULES.minProtocolAgeDays / 365)} year.
              </Rule>
              <Rule>
                The pool holds a single listed stablecoin, matched by its contract address. Copycat tokens reuse every
                well-known name, so a name alone is never trusted.
              </Rule>
              <Rule>
                The pool holds at least {usdCompact(YIELD_RULES.minPoolTvlUsd)} and pays no more than{" "}
                {rate(YIELD_RULES.maxApy, 0)} a year.
              </Rule>
              <Rule>
                A managed vault must be listed by Morpho itself, open to deposits, and free of any warning Morpho marks
                serious.
              </Rule>
              <Rule>
                Rates are ranked by the lower of today's rate and the 30-day average. Rates paid mostly in reward
                tokens are hidden unless you ask for them.
              </Rule>
            </ul>
            <div className="stack" style={{ "--gap": "8px", marginTop: 6 } as React.CSSProperties}>
              {([1, 2, 3] as const).map((level) => (
                <p key={level} className="small">
                  <strong style={{ fontWeight: 650 }}>{RISK_LABEL[level].label}.</strong>{" "}
                  <span className="muted">{RISK_LABEL[level].explainer}</span>
                </p>
              ))}
            </div>
            <p className="small muted">
              These groups are our own sorting, not a rating from anyone else, and no group is safe. Rates are reported
              by DefiLlama and are not checked against each lender's contracts.{" "}
              <Link className="link" href="/earn">See the rates</Link>
            </p>
          </div>
        </section>

        <section className="card" aria-labelledby="m-stocks">
          <div className="stack" style={{ "--gap": "14px" } as React.CSSProperties}>
            <h2 id="m-stocks" className="heading">
              Tokenized stocks
            </h2>
            <ul className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>
              <Rule>
                A token is shown only if its issuer's own catalog lists it at that address. Issuer facts were last
                checked {day(ISSUERS_REVIEWED_ON)}.
              </Rule>
              <Rule>
                Prices are live quotes for your exact order size, from a swap aggregator that searches every pool on
                the chain. A pool's displayed price is not used, because it is not what an order fills at.
              </Rule>
              <Rule>
                Each token is compared with the real share price times the shares one token stands for. Issuers fold
                dividends into that number, so skipping it would compare different things.
              </Rule>
              <Rule>The network fee is added before venues are ranked.</Rule>
              <Rule>
                Venues within {percent(LOOKUP_RULES.tieMargin, 1)} of the cheapest count as tied, since quotes move
                that much from second to second. Among tied venues the deepest market wins.
              </Rule>
              <Rule>
                A venue charging more than {percent(LOOKUP_RULES.thinPremium, 0)} over the share price is called too
                thin for the order rather than given a price.
              </Rule>
            </ul>
            <p className="small muted">
              When the stock market is closed the comparison uses a round-the-clock quote if one exists, and says so.{" "}
              <Link className="link" href="/stocks">Look up a stock</Link>
            </p>
          </div>
        </section>

        <section className="card" aria-labelledby="m-plan">
          <div className="stack" style={{ "--gap": "14px" } as React.CSSProperties}>
            <h2 id="m-plan" className="heading">
              Simulations
            </h2>
            <ul className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>
              <Rule>
                Backtests run on the real stocks and funds, using prices adjusted for dividends and splits. Tokens are
                too new to have history of their own.
              </Rule>
              <Rule>
                The glide path simulates thousands of possible futures from the return and swing you set. The same
                futures are used for every plan being compared, so the difference is the plan, not the luck.
              </Rule>
              <Rule>Neither includes trading costs, network fees, taxes, or the failure of a stablecoin or lender.</Rule>
            </ul>
          </div>
        </section>

        <div className="notice plain">
          <Icon name="info" />
          <span>
            Passing these checks means something met a written standard on the day it was read. It does not mean it
            is safe, and it is not a recommendation to buy.
          </span>
        </div>
      </div>
    </main>
  );
}

function Rule({ children }: { children: React.ReactNode }) {
  return (
    <li style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, alignItems: "start" }}>
      <span style={{ color: "var(--brand)", marginTop: 3 }}>
        <Icon name="check" size={17} stroke={2.2} />
      </span>
      <span>{children}</span>
    </li>
  );
}
