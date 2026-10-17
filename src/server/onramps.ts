// What each on-ramp lists right now, read from its own public API: which
// stablecoins it sells for dollars, the live price it sells at, and which
// networks it will send them out on. Anything a provider does not publish
// stays null and is shown as "not published", never guessed.

import { cached, MINUTE, type Cached } from "./cache";
import { chainFromExchangeNetwork, type ChainId } from "./chains";
import { errorMessage, fetchJson } from "./http";
import { loadStablecoins } from "./stablecoins";
import { KIND_LABEL, ONRAMP_PROVIDERS, type OnrampProviderInfo, type ProviderKind } from "@/data/onramps";

export interface OnrampNetwork {
  chain: ChainId | null;
  label: string;
  /** Whether withdrawals (or purchases, for direct on-ramps) are open on it now. */
  enabled: boolean;
  minAmount: number | null;
}

export interface OnrampOffer {
  symbol: string;
  /** Fiat currencies the coin can be bought with here. */
  fiat: string[];
  /** Best price to buy one coin with dollars right now; null where unpublished. */
  ask: number | null;
  bid: number | null;
  /** What buying costs over $1, as a fraction, before the provider's own fee. */
  premium: number | null;
  /** True when the dollar market is too thin to trust the quoted price. */
  thinMarket: boolean;
  networks: OnrampNetwork[] | null;
  usAvailable: boolean | null;
  restriction: string | null;
  note: string | null;
}

export interface OnrampProvider {
  id: OnrampProviderInfo["id"];
  name: string;
  kind: ProviderKind;
  kindLabel: string;
  kindExplainer: string;
  url: string;
  funding: string[];
  feeSummary: string;
  feeUrl: string;
  dataGap: string | null;
  sourceUrl: string;
  status: "live" | "unavailable";
  statusDetail: string | null;
  offers: OnrampOffer[];
}

const FIAT = new Set(["USD", "EUR", "GBP"]);
// A quoted spread wider than this means nobody is really making the market.
const THIN_SPREAD = 0.01;

const num = (value: unknown): number | null => {
  const parsed = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

function priced(bid: number | null, ask: number | null) {
  const thinMarket = bid !== null && ask !== null ? (ask - bid) / ask > THIN_SPREAD : false;
  return { bid, ask, premium: ask !== null && !thinMarket ? ask - 1 : null, thinMarket };
}

// Names for networks outside the site's own chain list, which providers abbreviate.
const NETWORK_NAMES: Record<string, string> = {
  xlm: "Stellar",
  stellar: "Stellar",
  dot: "Polkadot",
  zksyncera: "zkSync Era",
  xdc: "XDC",
  xrp: "XRP Ledger",
  ripple: "XRP Ledger",
  near: "NEAR",
  hypercore: "Hyperliquid",
  worldchain: "World Chain",
};

const titleCase = (value: string) =>
  value
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());

/** One network a provider delivers on, matched to a chain the site covers where it is one. */
function network(id: string, name: string | null, enabled: boolean, minAmount: number | null): OnrampNetwork {
  const chain = chainFromExchangeNetwork(id) ?? (name ? chainFromExchangeNetwork(name) : null);
  const label = chain?.name ?? NETWORK_NAMES[id.toLowerCase()] ?? name ?? titleCase(id);
  return { chain: chain?.id ?? null, label, enabled, minAmount };
}

/** One row per network: providers list some twice (a native and a bridged token). */
function mergeNetworks(networks: OnrampNetwork[]): OnrampNetwork[] {
  const byLabel = new Map<string, OnrampNetwork>();
  for (const item of networks) {
    const seen = byLabel.get(item.label);
    if (!seen || (item.enabled && !seen.enabled)) byLabel.set(item.label, item);
  }
  return [...byLabel.values()];
}

type Adapter = (symbols: Set<string>) => Promise<OnrampOffer[]>;

// ---- Coinbase ----

interface CoinbaseProduct {
  id: string;
  base_currency: string;
  quote_currency: string;
  status: string;
  trading_disabled: boolean;
}
interface CoinbaseCurrency {
  id: string;
  status: string;
  supported_networks?: Array<{ id: string; name: string; status: string; min_withdrawal_amount?: number }>;
}

const COINBASE = "https://api.exchange.coinbase.com";

const coinbase: Adapter = async (symbols) => {
  const products = await fetchJson<CoinbaseProduct[]>(`${COINBASE}/products`);
  const pairs = products.filter(
    (product) =>
      symbols.has(product.base_currency.toUpperCase()) &&
      FIAT.has(product.quote_currency) &&
      product.status === "online" &&
      !product.trading_disabled,
  );
  const listed = new Set(pairs.map((pair) => pair.base_currency.toUpperCase()));
  // USDC has no dollar order book on Coinbase: dollars convert to it directly.
  if (symbols.has("USDC")) listed.add("USDC");

  const offers = await Promise.all(
    [...listed].map(async (symbol): Promise<OnrampOffer | null> => {
      const currency = await fetchJson<CoinbaseCurrency>(`${COINBASE}/currencies/${symbol}`).catch(() => null);
      if (!currency || currency.status !== "online") return null;
      const fiat = pairs.filter((pair) => pair.base_currency.toUpperCase() === symbol).map((pair) => pair.quote_currency);
      let quote = priced(null, null);
      if (fiat.includes("USD")) {
        const ticker = await fetchJson<{ bid?: string; ask?: string }>(`${COINBASE}/products/${symbol}-USD/ticker`).catch(
          () => null,
        );
        quote = priced(num(ticker?.bid), num(ticker?.ask));
      }
      const direct = symbol === "USDC";
      return {
        symbol,
        fiat: direct ? ["USD", ...fiat] : fiat,
        ...(direct ? { bid: 1, ask: 1, premium: 0, thinMarket: false } : quote),
        networks:
          currency.supported_networks?.map((item) =>
            network(item.id, item.name, item.status === "online", item.min_withdrawal_amount ?? null),
          ) ?? null,
        usAvailable: true,
        restriction: null,
        note: direct ? "Dollars convert to USDC one-for-one, so there is no market price to pay." : null,
      };
    }),
  );
  return offers.filter((offer): offer is OnrampOffer => offer !== null);
};

// ---- Kraken ----

interface KrakenPair {
  altname: string;
  wsname?: string;
  status?: string;
}

const kraken: Adapter = async (symbols) => {
  const pairs = await fetchJson<{ error: string[]; result?: Record<string, KrakenPair> }>(
    "https://api.kraken.com/0/public/AssetPairs",
    { timeoutMs: 20_000 },
  );
  if (!pairs.result) throw new Error(pairs.error?.[0] ?? "kraken returned no pairs");
  // Kraken answers ticker requests under the pair's own key, which differs from its altname.
  const wanted = Object.entries(pairs.result)
    .map(([key, pair]) => ({ key, ...pair }))
    .filter((pair) => {
      const [base, quote] = (pair.wsname ?? "").split("/");
      return pair.status === "online" && symbols.has(base?.toUpperCase()) && FIAT.has(quote);
    });
  if (!wanted.length) return [];
  const usd = wanted.filter((pair) => pair.wsname!.endsWith("/USD"));
  const tickers = usd.length
    ? await fetchJson<{ result?: Record<string, { a: string[]; b: string[] }> }>(
        `https://api.kraken.com/0/public/Ticker?pair=${usd.map((pair) => pair.altname).join(",")}`,
      ).catch(() => null)
    : null;

  const bySymbol = new Map<string, OnrampOffer>();
  for (const pair of wanted) {
    const [base, quote] = pair.wsname!.split("/");
    const symbol = base.toUpperCase();
    const offer =
      bySymbol.get(symbol) ??
      ({
        symbol,
        fiat: [],
        ...priced(null, null),
        networks: null,
        usAvailable: null,
        restriction: null,
        note: null,
      } satisfies OnrampOffer);
    offer.fiat.push(quote);
    if (quote === "USD") {
      const ticker = tickers?.result?.[pair.key] ?? tickers?.result?.[pair.altname];
      Object.assign(offer, priced(num(ticker?.b?.[0]), num(ticker?.a?.[0])));
    }
    bySymbol.set(symbol, offer);
  }
  return [...bySymbol.values()];
};

// ---- Bitstamp ----

interface BitstampCurrency {
  currency: string;
  deposit?: string;
  withdrawal?: string;
  networks?: Array<{ network: string; withdrawal?: string; withdrawal_minimum_amount?: string }>;
}
interface BitstampTicker {
  pair: string;
  bid: string;
  ask: string;
}

const bitstamp: Adapter = async (symbols) => {
  const [currencies, tickers] = await Promise.all([
    fetchJson<BitstampCurrency[]>("https://www.bitstamp.net/api/v2/currencies/"),
    fetchJson<BitstampTicker[]>("https://www.bitstamp.net/api/v2/ticker/"),
  ]);
  const offers: OnrampOffer[] = [];
  for (const currency of currencies) {
    const symbol = currency.currency.toUpperCase();
    if (!symbols.has(symbol)) continue;
    const pairs = tickers.filter((ticker) => {
      const [base, quote] = ticker.pair.split("/");
      return base.toUpperCase() === symbol && FIAT.has(quote);
    });
    if (!pairs.length) continue;
    const usd = pairs.find((ticker) => ticker.pair.endsWith("/USD"));
    offers.push({
      symbol,
      fiat: pairs.map((ticker) => ticker.pair.split("/")[1]),
      ...priced(num(usd?.bid), num(usd?.ask)),
      networks:
        currency.networks?.map((item) =>
          network(item.network, null, item.withdrawal === "Enabled", num(item.withdrawal_minimum_amount)),
        ) ?? null,
      usAvailable: null,
      restriction: null,
      note: null,
    });
  }
  return offers;
};

// ---- Gemini ----

const gemini: Adapter = async (symbols) => {
  const listed = await fetchJson<string[]>("https://api.gemini.com/v1/symbols");
  const bySymbol = new Map<string, string[]>();
  for (const pair of listed) {
    const match = /^([a-z0-9]+)(usd|eur|gbp)$/.exec(pair);
    if (!match) continue;
    const symbol = match[1].toUpperCase();
    if (!symbols.has(symbol)) continue;
    bySymbol.set(symbol, [...(bySymbol.get(symbol) ?? []), match[2].toUpperCase()]);
  }
  return Promise.all(
    [...bySymbol].map(async ([symbol, fiat]): Promise<OnrampOffer> => {
      const ticker = fiat.includes("USD")
        ? await fetchJson<{ bid?: string; ask?: string }>(
            `https://api.gemini.com/v1/pubticker/${symbol.toLowerCase()}usd`,
          ).catch(() => null)
        : null;
      return {
        symbol,
        fiat,
        ...priced(num(ticker?.bid), num(ticker?.ask)),
        networks: null,
        usAvailable: true,
        restriction: null,
        note: null,
      };
    }),
  );
};

// ---- MoonPay ----

interface MoonpayCurrency {
  type: string;
  code: string;
  name: string;
  isSuspended?: boolean;
  isSupportedInUS?: boolean;
  notAllowedUSStates?: string[];
  minBuyAmount?: number | null;
  metadata?: { networkCode?: string | null } | null;
}

const moonpay: Adapter = async (symbols) => {
  const currencies = await fetchJson<MoonpayCurrency[]>("https://api.moonpay.com/v3/currencies");
  const bySymbol = new Map<string, { offer: OnrampOffer; blocked: Set<string>; us: boolean[] }>();
  for (const currency of currencies) {
    // Bridged copies are different tokens from the issuer's own coin.
    if (currency.type !== "crypto" || /bridged/i.test(currency.code)) continue;
    const symbol = [...symbols].find((item) => item === currency.code.split("_")[0].toUpperCase());
    const code = currency.metadata?.networkCode;
    if (!symbol || !code) continue;
    const entry =
      bySymbol.get(symbol) ??
      {
        offer: {
          symbol,
          fiat: ["USD", "EUR", "GBP"],
          ...priced(null, null),
          networks: [],
          usAvailable: null,
          restriction: null,
          note: "The price is set when you buy and includes MoonPay's fee.",
        } satisfies OnrampOffer,
        blocked: new Set<string>(),
        us: [],
      };
    entry.offer.networks!.push(network(code, null, !currency.isSuspended, currency.minBuyAmount ?? null));
    if (!currency.isSuspended) {
      entry.us.push(currency.isSupportedInUS === true);
      for (const state of currency.notAllowedUSStates ?? []) entry.blocked.add(state);
    }
    bySymbol.set(symbol, entry);
  }
  return [...bySymbol.values()].map(({ offer, blocked, us }) => ({
    ...offer,
    usAvailable: us.length ? us.some(Boolean) : null,
    restriction: blocked.size ? `Not sold in: ${[...blocked].sort().join(", ")}.` : null,
  }));
};

// ---- Ramp Network ----

interface RampAsset {
  symbol: string;
  chain: string;
  enabled: boolean;
  hidden: boolean;
  minPurchaseAmount?: number;
}

const ramp: Adapter = async (symbols) => {
  const body = await fetchJson<{ assets?: RampAsset[] }>("https://api.ramp.network/api/host-api/v3/assets");
  const bySymbol = new Map<string, OnrampOffer>();
  for (const asset of body.assets ?? []) {
    const symbol = asset.symbol.toUpperCase();
    // Bridged variants (USDC.e) are different tokens; only the issuer's own coin counts.
    if (!symbols.has(symbol) || asset.hidden) continue;
    const offer =
      bySymbol.get(symbol) ??
      ({
        symbol,
        fiat: ["USD", "EUR", "GBP"],
        ...priced(null, null),
        networks: [],
        usAvailable: null,
        restriction: null,
        note: "The price is set when you buy and includes Ramp's fee.",
      } satisfies OnrampOffer);
    const minimum = typeof asset.minPurchaseAmount === "number" && asset.minPurchaseAmount > 0 ? asset.minPurchaseAmount : null;
    offer.networks!.push(network(asset.chain, null, asset.enabled, minimum));
    bySymbol.set(symbol, offer);
  }
  return [...bySymbol.values()];
};

const ADAPTERS: Record<OnrampProviderInfo["id"], { run: Adapter; sourceUrl: string }> = {
  coinbase: { run: coinbase, sourceUrl: `${COINBASE}/currencies` },
  kraken: { run: kraken, sourceUrl: "https://api.kraken.com/0/public/AssetPairs" },
  bitstamp: { run: bitstamp, sourceUrl: "https://www.bitstamp.net/api/v2/currencies/" },
  gemini: { run: gemini, sourceUrl: "https://api.gemini.com/v1/symbols" },
  moonpay: { run: moonpay, sourceUrl: "https://api.moonpay.com/v3/currencies" },
  ramp: { run: ramp, sourceUrl: "https://api.ramp.network/api/host-api/v3/assets" },
};

const RANK = ["USDC", "USDT", "USDS", "DAI", "USDG", "PYUSD", "RLUSD", "USD1", "USDE"];

function sortOffers(offers: OnrampOffer[], canonical: Map<string, string>): OnrampOffer[] {
  const rank = (symbol: string) => {
    const index = RANK.indexOf(symbol.toUpperCase());
    return index === -1 ? RANK.length : index;
  };
  return offers
    .map((offer) => ({
      ...offer,
      // Adapters match in upper case; show the coin the way its issuer writes it.
      symbol: canonical.get(offer.symbol.toUpperCase()) ?? offer.symbol,
      fiat: [...new Set(offer.fiat)].sort((a, b) => (a === "USD" ? -1 : b === "USD" ? 1 : a.localeCompare(b))),
      networks: offer.networks
        ? mergeNetworks(offer.networks).sort(
            (a, b) =>
              Number(b.enabled) - Number(a.enabled) ||
              // Chains the site covers first: those are the ones its other pages point to.
              Number(b.chain !== null) - Number(a.chain !== null) ||
              a.label.localeCompare(b.label),
          )
        : null,
    }))
    .sort((a, b) => rank(a.symbol) - rank(b.symbol));
}

export async function loadOnramps(): Promise<Cached<OnrampProvider[]>> {
  return cached("onramps", { ttlMs: 5 * MINUTE }, async () => {
    const stablecoins = await loadStablecoins();
    const canonical = new Map(stablecoins.value.coins.map((coin) => [coin.symbol.toUpperCase(), coin.symbol]));
    const symbols = new Set(canonical.keys());
    const providers = await Promise.all(
      ONRAMP_PROVIDERS.map(async (info): Promise<OnrampProvider> => {
        const adapter = ADAPTERS[info.id];
        const base = {
          id: info.id,
          name: info.name,
          kind: info.kind,
          kindLabel: KIND_LABEL[info.kind].label,
          kindExplainer: KIND_LABEL[info.kind].explainer,
          url: info.url,
          funding: info.funding,
          feeSummary: info.feeSummary,
          feeUrl: info.feeUrl,
          dataGap: info.dataGap ?? null,
          sourceUrl: adapter.sourceUrl,
        };
        try {
          const offers = sortOffers(await adapter.run(symbols), canonical);
          return { ...base, status: "live", statusDetail: null, offers };
        } catch (error) {
          return { ...base, status: "unavailable", statusDetail: errorMessage(error), offers: [] };
        }
      }),
    );
    // One provider being down is reported, not fatal; all of them down is.
    if (providers.every((provider) => provider.status === "unavailable")) {
      throw new Error("no on-ramp could be read");
    }
    return providers;
  });
}
