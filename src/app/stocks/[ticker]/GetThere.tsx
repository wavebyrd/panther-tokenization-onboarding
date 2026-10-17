import Link from "next/link";
import { Icon } from "@/components/Icon";
import { shares, shortAddress, usd } from "@/lib/format";
import type { Venue } from "@/server/stocks/lookup";
import { CopyButton } from "./Live";
import styles from "../stocks.module.css";

/**
 * The way from "this is the best price" to holding the token, as three steps
 * with a link for each. Every link hands off to another app; the buyer
 * confirms each step there themselves.
 */
export function GetThere({ venue, amountUsd }: { venue: Venue; amountUsd: number }) {
  const { handoff, quote } = venue;
  const { funding, wallet, swap } = handoff;
  const compare = `/dollars?coin=${funding.symbol}&chain=${venue.chain}`;
  const direct = funding.direct;

  return (
    <section className={styles.getThere} aria-labelledby={`get-${venue.id}`}>
      <h3 id={`get-${venue.id}`} className="subheading">
        Get there in three steps
      </h3>
      <ol className={styles.steps}>
        <li>
          <span className={styles.stepNumber} aria-hidden="true">
            1
          </span>
          <div className={styles.stepBody}>
            <h4>
              Get {funding.symbol} on {venue.chainName}
            </h4>
            {direct && direct.length ? (
              <>
                <p>These send it straight to {venue.chainName}:</p>
                <div className={styles.sources}>
                  {direct.slice(0, 4).map((source) => (
                    <a key={source.id} className="chip small" href={source.url} target="_blank" rel="noreferrer">
                      {source.name}
                      <Icon name="arrowUpRight" size={13} />
                    </a>
                  ))}
                </div>
              </>
            ) : direct ? (
              <p>
                None of the on-ramps we read sends {funding.symbol} straight to {venue.chainName}. Buy a stablecoin on
                another chain, then move it across.
              </p>
            ) : (
              <p>See who sells {funding.symbol} and which of them can deliver it on {venue.chainName}.</p>
            )}
            <div className={styles.stepLinks}>
              <Link className="link" href={compare}>
                Compare on-ramps
              </Link>
              {funding.bridgeUrl ? (
                <a className="link" href={funding.bridgeUrl} target="_blank" rel="noreferrer">
                  Move coins from another chain
                </a>
              ) : null}
            </div>
            {funding.bridgeUrl && direct && !direct.length ? (
              <p className="tiny faint">Moving coins uses a bridge, a separate app with its own fee and its own risk.</p>
            ) : null}
          </div>
        </li>

        <li>
          <span className={styles.stepNumber} aria-hidden="true">
            2
          </span>
          <div className={styles.stepBody}>
            <h4>Set up a wallet</h4>
            <p>
              {wallet.needs} works.
              {wallet.chainId !== null ? ` Add the ${venue.chainName} network to it (chain ID ${wallet.chainId}).` : ""} Keep
              a few dollars of {wallet.feeCoin} in it to pay network fees.
            </p>
            {wallet.setupUrl ? (
              <div className={styles.stepLinks}>
                <a className="link" href={wallet.setupUrl} target="_blank" rel="noreferrer">
                  Add {venue.chainName} to a wallet
                </a>
              </div>
            ) : null}
          </div>
        </li>

        <li>
          <span className={styles.stepNumber} aria-hidden="true">
            3
          </span>
          <div className={styles.stepBody}>
            <h4>Make the swap</h4>
            {swap && quote ? (
              <>
                <p>
                  This opens {swap.app} with {quote.paidSymbol} to {venue.token.symbol} already chosen. Enter{" "}
                  {usd(amountUsd, { cents: false })} and you should be offered about{" "}
                  <strong className="num">
                    {shares(quote.tokensOut)} {venue.token.symbol}
                  </strong>
                  .
                </p>
                <a className="button primary small" href={swap.url} target="_blank" rel="noreferrer" style={{ justifySelf: "start" }}>
                  Open this swap on {swap.app}
                  <Icon name="arrowUpRight" size={15} />
                </a>
                <p className="tiny faint">
                  If it offers much less, the price has moved. Come back and refresh before you confirm.
                </p>
              </>
            ) : (
              <p>
                No swap app we can link to covers {venue.chainName} yet. Use an exchange on that chain, and match the
                token address below before you confirm.
              </p>
            )}
            <div className={styles.address}>
              <span className="tiny faint">Token address to match</span>
              <span className={styles.addressRow}>
                <a className="link num" href={venue.token.url} target="_blank" rel="noreferrer" title={venue.token.address}>
                  {shortAddress(venue.token.address)}
                </a>
                <CopyButton value={venue.token.address} label={`the ${venue.token.symbol} token address`} />
              </span>
            </div>
          </div>
        </li>
      </ol>
    </section>
  );
}

/** The same hand-off, in one line, for venues further down the list. */
export function GetThereBrief({ venue }: { venue: Venue }) {
  const { funding, swap } = venue.handoff;
  return (
    <div className={styles.brief}>
      {swap ? (
        <a className="button primary small" href={swap.url} target="_blank" rel="noreferrer">
          Open this swap on {swap.app}
          <Icon name="arrowUpRight" size={15} />
        </a>
      ) : null}
      <Link className="link small" href={`/dollars?coin=${funding.symbol}&chain=${venue.chain}`}>
        Get {funding.symbol} on {venue.chainName}
      </Link>
      {venue.handoff.wallet.setupUrl ? (
        <a className="link small" href={venue.handoff.wallet.setupUrl} target="_blank" rel="noreferrer">
          Add {venue.chainName} to a wallet
        </a>
      ) : null}
    </div>
  );
}
