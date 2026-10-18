// Every tokenized stock the site knows, grouped by the real ticker behind it.
// Each issuer's list comes from that issuer's own published catalog, so a
// token only appears here if its issuer says it exists at that address.

import { cached, HOUR, type Cached } from "../cache";
import { CHAINS, chainFromBacked, chainFromEvmId, type ChainId } from "../chains";
import { pantherApi } from "../connections";
import { errorMessage, fetchJson } from "../http";
import { COINBASE_DECIMALS, COINBASE_TOKENS, ISSUERS, type IssuerId } from "@/data/issuers";

export interface Listing {
  issuer: IssuerId;
  /** The token's own symbol, e.g. AAPLx. */
  symbol: string;
  chain: ChainId;
  address: string;
  /** Null until read from the chain. */
  decimals: number | null;
  /** How the token relates to the issuer's main token, when it is a wrapped form. */
  form: "token" | "wrapped";
  /** Shares per token as the issuer's catalog states it; null when the catalog does not. */
  catalogMultiplier: number | null;
  /** Chainlink feed that prices the token, where the issuer uses one. */
  priceFeed: string | null;
}

export interface Stock {
  ticker: string;
  name: string;
  kind: "stock" | "fund";
  issuers: IssuerId[];
  chains: ChainId[];
  listings: Listing[];
}

export interface Universe {
  stocks: Stock[];
  /** Issuers whose catalog could not be read this time. */
  missing: Array<{ issuer: IssuerId; detail: string }>;
}

interface Draft {
  ticker: string;
  names: Partial<Record<IssuerId, string>>;
  listings: Listing[];
}

const TICKER = /^[A-Z][A-Z0-9.]{0,9}$/;

function add(drafts: Map<string, Draft>, ticker: string, issuer: IssuerId, name: string, listing: Omit<Listing, "issuer">) {
  const key = ticker.toUpperCase();
  if (!TICKER.test(key)) return;
  const draft = drafts.get(key) ?? { ticker: key, names: {}, listings: [] };
  draft.names[issuer] ??= name;
  draft.listings.push({ issuer, ...listing });
  drafts.set(key, draft);
}

// ---- Robinhood ----

interface RobinhoodAsset {
  tokenSymbol: string;
  tokenName: string;
  status: string;
  currentMultiplier?: string;
  tokenDecimals?: number;
  deployments?: Array<{ contractAddress: string; chainId: number }>;
}

export const ROBINHOOD_ASSETS = "https://api.robinhood.com/rhj/assets";

async function robinhood(drafts: Map<string, Draft>) {
  const body = await fetchJson<{ assets?: RobinhoodAsset[] }>(ROBINHOOD_ASSETS);
  if (!body.assets?.length) throw new Error("catalog came back empty");
  for (const asset of body.assets) {
    if (asset.status !== "ASSET_STATUS_ACTIVE") continue;
    const multiplier = Number(asset.currentMultiplier);
    for (const deployment of asset.deployments ?? []) {
      const chain = chainFromEvmId(deployment.chainId);
      if (!chain) continue;
      add(drafts, asset.tokenSymbol, "robinhood", asset.tokenName.replace(/\s*•.*$/, "").trim(), {
        symbol: asset.tokenSymbol,
        chain: chain.id,
        address: deployment.contractAddress,
        decimals: asset.tokenDecimals ?? 18,
        form: "token",
        catalogMultiplier: Number.isFinite(multiplier) && multiplier > 0 ? multiplier : null,
        priceFeed: null,
      });
    }
  }
}

// ---- Ondo ----

interface OndoToken {
  chainId: number;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
}

export const ONDO_LIST =
  "https://raw.githubusercontent.com/ondoprotocol/ondo-global-markets-token-list/main/tokenlist.json";
// Cash and Treasury tokens share Ondo's list but are not stocks.
const ONDO_NOT_STOCKS = new Set(["USDon", "USDY"]);

async function ondo(drafts: Map<string, Draft>) {
  const body = await fetchJson<{ tokens?: OndoToken[] }>(ONDO_LIST);
  if (!body.tokens?.length) throw new Error("catalog came back empty");
  for (const token of body.tokens) {
    if (ONDO_NOT_STOCKS.has(token.symbol) || !token.symbol.endsWith("on")) continue;
    const chain = chainFromEvmId(token.chainId);
    if (!chain) continue;
    add(drafts, token.symbol.slice(0, -2), "ondo", token.name.replace(/\s*\(Ondo Tokenized[^)]*\)\s*$/i, "").trim(), {
      symbol: token.symbol,
      chain: chain.id,
      address: token.address,
      decimals: token.decimals,
      form: "token",
      catalogMultiplier: null,
      priceFeed: null,
    });
  }
}

// ---- xStocks ----

interface BackedToken {
  symbol: string;
  name: string;
  underlyingSymbol?: string;
  deployments?: Array<{ address: string; network: string; wrapperAddressV2?: string }>;
}

export const BACKED_LIST = "https://api.backed.fi/api/v1/token";

async function xstocks(drafts: Map<string, Draft>) {
  const body = await fetchJson<{ nodes?: BackedToken[] }>(BACKED_LIST, { timeoutMs: 30_000 });
  if (!body.nodes?.length) throw new Error("catalog came back empty");
  for (const token of body.nodes) {
    // Only the xStocks line (ticker + "x"); Backed's older b-prefixed trackers are retired.
    if (!/x$/.test(token.symbol) || !token.underlyingSymbol) continue;
    const name = token.name.replace(/\s*xStock\s*$/i, "").trim();
    for (const deployment of token.deployments ?? []) {
      const chain = chainFromBacked(deployment.network);
      if (!chain) continue;
      const bare = deployment.address.replace(/^[a-z]+:/i, "");
      if (chain.kind === "evm") {
        // On EVM chains the main token's balance moves with dividends, which
        // exchanges cannot handle, so trading happens in the wrapped form.
        if (!deployment.wrapperAddressV2) continue;
        add(drafts, token.underlyingSymbol, "xstocks", name, {
          symbol: `w${token.symbol}`,
          chain: chain.id,
          address: deployment.wrapperAddressV2,
          decimals: null,
          form: "wrapped",
          catalogMultiplier: null,
          priceFeed: null,
        });
      } else if (chain.kind === "solana") {
        add(drafts, token.underlyingSymbol, "xstocks", name, {
          symbol: token.symbol,
          chain: chain.id,
          address: bare,
          decimals: null,
          form: "token",
          catalogMultiplier: null,
          priceFeed: null,
        });
      }
    }
  }
}

// ---- Coinbase ----

async function coinbase(drafts: Map<string, Draft>) {
  for (const token of COINBASE_TOKENS) {
    add(drafts, token.ticker, "coinbase", token.name, {
      symbol: token.symbol,
      chain: "base",
      address: token.address,
      decimals: COINBASE_DECIMALS,
      form: "token",
      catalogMultiplier: null,
      priceFeed: token.feed,
    });
  }
}

// ---- Issuers read from Panther Terminal's catalog ----
//
// Dinari and bStocks publish no machine-readable token list of their own that
// this project reads, so their listings come from Panther Terminal's public
// venue boards, which track every token each issuer has deployed.

interface PantherBoard {
  tokens?: Array<{
    symbol: string;
    name: string;
    asset_id?: string | null;
    deployments?: Array<{ chain: string; address: string }>;
  }>;
}

function fromPanther(issuer: "dinari" | "bstocks") {
  return async (drafts: Map<string, Draft>) => {
    const body = await fetchJson<PantherBoard>(`${pantherApi()}/v1/venues/${issuer}/board`, { timeoutMs: 20_000 });
    if (!body.tokens?.length) throw new Error("catalog came back empty");
    for (const token of body.tokens) {
      const ticker = token.asset_id?.startsWith("sym:") ? token.asset_id.slice(4) : null;
      if (!ticker) continue;
      for (const deployment of token.deployments ?? []) {
        const chain = deployment.chain as ChainId;
        if (!(chain in CHAINS) || CHAINS[chain].kind !== "evm") continue;
        add(drafts, ticker, issuer, token.name, {
          symbol: token.symbol,
          chain,
          address: deployment.address,
          decimals: null,
          form: "token",
          catalogMultiplier: null,
          priceFeed: null,
        });
      }
    }
  };
}

const FUND_HINT = /\b(ETF|Trust|Fund|Index|iShares|Vanguard|SPDR|Invesco|Treasury|Bond)\b/i;
// The issuer whose naming reads best to a newcomer comes first.
const NAME_ORDER: IssuerId[] = ["robinhood", "coinbase", "xstocks", "ondo", "dinari", "bstocks"];

export async function loadUniverse(): Promise<Cached<Universe>> {
  return cached("stock-universe", { ttlMs: 6 * HOUR, staleMs: 48 * HOUR }, async () => {
    const drafts = new Map<string, Draft>();
    const missing: Universe["missing"] = [];
    const sources: Array<[IssuerId, (drafts: Map<string, Draft>) => Promise<void>]> = [
      ["robinhood", robinhood],
      ["ondo", ondo],
      ["xstocks", xstocks],
      ["coinbase", coinbase],
      ["dinari", fromPanther("dinari")],
      ["bstocks", fromPanther("bstocks")],
    ];
    await Promise.all(
      sources.map(async ([issuer, run]) => {
        try {
          await run(drafts);
        } catch (error) {
          missing.push({ issuer, detail: errorMessage(error) });
        }
      }),
    );
    if (!drafts.size) throw new Error("no issuer catalog could be read");

    const stocks: Stock[] = [...drafts.values()].map((draft) => {
      const name = NAME_ORDER.map((issuer) => draft.names[issuer]).find(Boolean) ?? draft.ticker;
      return {
        ticker: draft.ticker,
        name,
        kind: FUND_HINT.test(Object.values(draft.names).join(" ")) ? "fund" : "stock",
        issuers: NAME_ORDER.filter((issuer) => draft.listings.some((listing) => listing.issuer === issuer)),
        chains: [...new Set(draft.listings.map((listing) => listing.chain))],
        listings: draft.listings,
      };
    });
    // Widely issued names first: they are the ones a newcomer is looking for.
    stocks.sort((a, b) => b.issuers.length - a.issuers.length || a.ticker.localeCompare(b.ticker));
    return { stocks, missing };
  });
}

export async function findStock(ticker: string): Promise<Stock | null> {
  const universe = await loadUniverse();
  const key = ticker.trim().toUpperCase();
  return universe.value.stocks.find((stock) => stock.ticker === key) ?? null;
}

export const issuerName = (id: IssuerId) => ISSUERS[id].name;
