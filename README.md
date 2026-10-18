# Panther Tokenization Onboarding

An educational portfolio simulator for tokenized assets. Enter your starting capital and how much you want in stocks
versus bonds. It builds a mix of asset classes with mean-variance optimisation, plots a glide path toward your goal, and
checks which tokenized fund, from which issuer, on which chain, can fill each order **at its real size, right now**.

Built for [Panther Terminal](https://pantherterminal.com/tokenization), where it runs on Panther's own data connections.
Run it yourself with your own.

> **Not advice.** This is a simulation. It holds no money, connects to no wallet and places no trades. Every price is a
> quote that can change before you act. Most tokenized stocks and funds are not offered to United States residents.

## What it does

| Step | How |
|---|---|
| **1. Your answers** | Starting capital, monthly additions, stocks vs. bonds today and at the goal, years to the goal, risk level, and which asset classes to use |
| **2. The mix** | Each side (stocks, bonds) is spread across asset classes by long-only mean-variance optimisation (Markowitz), with a floor on the core holdings and a cap on everything else. Assumptions are editable |
| **3. The glide path** | 2,000 simulated futures with correlated stock and bond returns, rebalanced monthly, moving from today's mix to the goal mix the way a target-date fund does |
| **4. The fills** | For each holding, every issuer and chain that sells a tokenized version of the fund is quoted for the exact dollar amount. The cheapest all-in fill within your limit wins; orders one market cannot absorb are split across venues; funds whose pools are too thin point to buying directly from the issuer |

Asset classes and the funds behind them:

| Stocks | Bonds and steady assets |
|---|---|
| US large companies (SPY, IVV, VOO, VTI) | Treasury bills (SGOV, BIL, USFR) |
| US tech and growth (QQQ) | Short-, intermediate- and long-term Treasuries (SHY, IEF, TLT) |
| US small companies (IWM) | US bond market (AGG, BND) |
| International developed (EFA) | Inflation-protected Treasuries (TIP), high-yield bonds (HYG), gold (GLD, IAU) |

Tokenized versions come from Robinhood Stock Tokens, Ondo Global Markets, xStocks and Coinbase (read live from each
issuer's own catalog) and Dinari and bStocks (read from [Panther Terminal](https://pantherterminal.com/tokenization)'s
catalog). For the steadiest classes it also lists tokenized Treasury and money market funds (BUIDL, USYC, BENJI, USTB and
others) with their yields, size on chain and who may buy them, from Panther Terminal's fund data.

### Your situation

Tell it where you live and what kind of investor you are. Venues whose issuer does not offer its tokens in the United
States are left out for US residents, and each fund's own eligibility rule (linked to its source) is checked against your
answers. Unclear rules say "check terms" rather than guessing.

### How a fill is measured

For an order of `$X` at one venue:

- **Against fair value**, where possible: the all-in price (aggregator quote plus network fee) over the real fund price
  times the shares each token stands for.
- **Against what the venues agree on**, when no share price can be read (a closed market): the median price per share
  across the quoted venues.
- **Against a small order**, otherwise: the same venue's price for `$X` over its price for `$100`. This is the price
  impact of size alone, which is the question "can this pool fill me?" asks.

Quotes come from swap aggregators (KyberSwap on EVM chains, Jupiter on Solana). Nothing is signed or sent.

## Two ways to run it

| | **Server app** (this repo, `npm run dev`) | **Widget** (`npm run build:widget`) |
|---|---|---|
| Where it runs | A Node server: pages plus the `/api/v1` API | Entirely in the visitor's browser, as static files |
| Issuer catalogs | Read from each issuer (`PTO_CATALOG=direct`, default) or from Panther Terminal (`PTO_CATALOG=panther`) | Panther Terminal's API (some issuers' catalogs refuse browsers) |
| Fair value | Exchange price, Robinhood's round-the-clock quote, or the venues' consensus | The venues' consensus |
| Your keys | Server env vars, never sent to the browser | `window.PANTHER_ONBOARDING` or build-time `VITE_PTO_*`: public to every visitor |
| Used by | Anyone self-hosting, the public API | [pantherterminal.com/tokenization/onboarding](https://pantherterminal.com/tokenization/onboarding) |

Both run the same engine (`src/server/portfolio.ts`), switched by `src/server/connections.ts`.

### Embedding the widget

```bash
PTO_WIDGET_BASE=/your/path/ npm run build:widget
```

Serve `dist-widget/` from that path and frame it. It posts its height so the frame can grow:

```js
addEventListener("message", (e) => {
  if (e.origin === location.origin && e.data?.type === "panther-onboarding:height") frame.style.height = e.data.height + "px";
});
```

Its Content-Security-Policy needs `connect-src` for the Panther API, the aggregators (KyberSwap, Jupiter, DexScreener)
and the public RPC endpoints in `src/server/chains.ts`.

## Run it

Needs Node 22 or newer.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3400/portfolio.

```bash
npm test
```

```bash
npm run typecheck
```

### Your own connections

Every source works without a key, but free public endpoints are rate-limited. Copy `.env.example` to `.env.local` and
add what you have:

| Variable | What it does |
|---|---|
| `PTO_RPC_<CHAIN>` | Your RPC URLs for a chain (e.g. `PTO_RPC_ETHEREUM`), comma-separated, tried before the public ones |
| `PTO_JUPITER_API_KEY` | Solana quotes go to Jupiter's keyed API instead of the free lite endpoint |
| `PTO_KYBERSWAP_CLIENT_ID` | The client id sent to KyberSwap |
| `PTO_PANTHER_API` | Panther Terminal's API, for issuer catalogs and fund data (default `https://api.pantherterminal.com`) |

Keys are read on the server only and are never sent to the browser. You are responsible for following the terms of the
providers you connect.

## The API

Every page is built on the API under `/api/v1`. Responses are `{ data, meta }`.

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/portfolio/plan` | Target mix, glide path, and live fills for each holding |
| `POST /api/v1/portfolio/allocate` | Target mix and glide path only, no market reads |
| `GET /api/v1/stocks/{ticker}?amount=` | Every venue for one stock or fund, ranked by all-in cost |
| `POST /api/v1/simulate/glidepath` | Glide path projection |
| `POST /api/v1/simulate/backtest` | Portfolio backtest |
| `GET /api/v1/stablecoins`, `/onramps`, `/yields` | Getting dollars in and earning on them |
| `GET /api/v1/openapi.json` | OpenAPI 3 description |

Example:

```bash
curl -X POST http://localhost:3400/api/v1/portfolio/plan -H "content-type: application/json" -d "{\"capital\":25000,\"equityShare\":0.7,\"maxCost\":0.01}"
```

## Where things live

```
src/
  lib/portfolio/   asset classes, assumptions, the optimizer and the planner (pure, tested)
  lib/sim/         glide path and backtest simulators (pure, tested)
  server/          everything that reads an outside source; portfolio.ts finds the fills
  data/            hand-written issuer, coin and lender facts, each with a review date
  app/             pages and API routes; /portfolio is the simulator
```

## Being a good citizen

Every request carries an honest User-Agent naming this project; it never poses as a browser. Free endpoints with rate
limits are paced. A source that refuses honest requests is left unread and the page says so.

## Limits

- **Assumptions are illustrative.** Expected returns, swings and correlations are round long-run figures, not
  forecasts. Change them in the Assumptions panel.
- **Quotes move.** A quote is what an aggregator says an order would fill at now; it is not an order.
- **Issuer details are hand-reviewed** (`src/data/`) and marked unconfirmed where not checked against the issuer's own
  terms.
- **Data sources have their own terms.** Some sources used here restrict commercial reuse. Check each one's terms before
  running this for anyone but yourself.

## Copyright

© 2026 wavebyrd. All rights reserved.

This repository is public so the code can be read. No license is granted to copy, modify, distribute or use it
commercially. For permission, open an issue or contact the owner.
