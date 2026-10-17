// One registry of the chains the site covers, with the name each upstream
// source uses for it. Stablecoin addresses are the canonical issuer
// deployments; copycat tokens with the same symbol exist on most chains, so
// nothing here is ever matched by symbol alone.

export type ChainId =
  | "ethereum"
  | "base"
  | "arbitrum"
  | "optimism"
  | "bsc"
  | "solana"
  | "robinhood"
  | "mantle"
  | "hyperevm"
  | "polygon"
  | "avalanche"
  | "ink"
  | "xlayer"
  | "tron"
  | "ton";

export interface QuoteStable {
  symbol: string;
  address: string;
  decimals: number;
}

export interface Chain {
  id: ChainId;
  name: string;
  kind: "evm" | "solana" | "other";
  evmChainId?: number;
  /** Chain name in DefiLlama's yields and stablecoin data. */
  llama: string[];
  /** Chain id in DexScreener's API. */
  dexscreener?: string;
  /** Chain slug in KyberSwap's aggregator API. */
  kyber?: string;
  /** Network name in Backed's (xStocks) token list. */
  backed?: string;
  /** Network ids used by exchange withdrawal APIs (Coinbase, Bitstamp, Kraken naming). */
  exchangeNetworks: string[];
  rpc?: string[];
  tokenUrl: (address: string) => string;
  /** The dollar stablecoin a buy is quoted from on this chain. */
  quoteStable?: QuoteStable;
  /** What a simple transaction costs, in plain words. */
  feeNote: string;
}

const evmExplorer = (base: string) => (address: string) => `${base}/token/${address}`;

export const CHAINS: Record<ChainId, Chain> = {
  ethereum: {
    id: "ethereum",
    name: "Ethereum",
    kind: "evm",
    evmChainId: 1,
    llama: ["Ethereum"],
    dexscreener: "ethereum",
    kyber: "ethereum",
    backed: "Ethereum",
    exchangeNetworks: ["ethereum", "erc20", "eth"],
    rpc: ["https://ethereum-rpc.publicnode.com", "https://eth.llamarpc.com"],
    tokenUrl: evmExplorer("https://etherscan.io"),
    quoteStable: { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
    feeNote: "Highest fees of any chain here; a swap often costs a few dollars.",
  },
  base: {
    id: "base",
    name: "Base",
    kind: "evm",
    evmChainId: 8453,
    llama: ["Base"],
    dexscreener: "base",
    kyber: "base",
    backed: "Base",
    exchangeNetworks: ["base"],
    rpc: ["https://base-rpc.publicnode.com", "https://mainnet.base.org"],
    tokenUrl: evmExplorer("https://basescan.org"),
    quoteStable: { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
    feeNote: "Fees are usually a cent or two.",
  },
  arbitrum: {
    id: "arbitrum",
    name: "Arbitrum",
    kind: "evm",
    evmChainId: 42161,
    llama: ["Arbitrum"],
    dexscreener: "arbitrum",
    kyber: "arbitrum",
    backed: "Arbitrum",
    exchangeNetworks: ["arbitrum", "arbitrum-one", "arbevm"],
    rpc: ["https://arbitrum-one-rpc.publicnode.com", "https://arb1.arbitrum.io/rpc"],
    tokenUrl: evmExplorer("https://arbiscan.io"),
    quoteStable: { symbol: "USDC", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
    feeNote: "Fees are usually a few cents.",
  },
  optimism: {
    id: "optimism",
    name: "Optimism",
    kind: "evm",
    evmChainId: 10,
    llama: ["OP Mainnet", "Optimism"],
    dexscreener: "optimism",
    kyber: "optimism",
    backed: "Optimism",
    exchangeNetworks: ["optimism", "op-mainnet", "op_mainnet", "op mainnet"],
    rpc: ["https://optimism-rpc.publicnode.com", "https://mainnet.optimism.io"],
    tokenUrl: evmExplorer("https://optimistic.etherscan.io"),
    quoteStable: { symbol: "USDC", address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6 },
    feeNote: "Fees are usually a few cents.",
  },
  bsc: {
    id: "bsc",
    name: "BNB Chain",
    kind: "evm",
    evmChainId: 56,
    llama: ["BSC", "Binance"],
    dexscreener: "bsc",
    kyber: "bsc",
    backed: "BinanceSmartChain",
    exchangeNetworks: ["bsc", "bep20", "bnb", "binance_smart_chain"],
    rpc: ["https://bsc-rpc.publicnode.com", "https://bsc-dataseed.bnbchain.org"],
    tokenUrl: evmExplorer("https://bscscan.com"),
    quoteStable: { symbol: "USDT", address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
    feeNote: "Fees are usually under ten cents.",
  },
  solana: {
    id: "solana",
    name: "Solana",
    kind: "solana",
    llama: ["Solana"],
    dexscreener: "solana",
    backed: "Solana",
    exchangeNetworks: ["solana", "sol"],
    rpc: ["https://solana-rpc.publicnode.com", "https://api.mainnet-beta.solana.com"],
    tokenUrl: (address) => `https://solscan.io/token/${address}`,
    quoteStable: { symbol: "USDC", address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 },
    feeNote: "Fees are a fraction of a cent.",
  },
  robinhood: {
    id: "robinhood",
    name: "Robinhood Chain",
    kind: "evm",
    evmChainId: 4663,
    llama: ["Robinhood Chain"],
    dexscreener: "robinhood",
    kyber: "robinhood",
    exchangeNetworks: ["robinhood"],
    rpc: ["https://robinhood.drpc.org", "https://rpc.mainnet.chain.robinhood.com"],
    tokenUrl: evmExplorer("https://robinhoodchain.blockscout.com"),
    // USDG is the dollar on Robinhood Chain; tokens named USDC or USDT there are copycats.
    quoteStable: { symbol: "USDG", address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", decimals: 6 },
    feeNote: "Fees are about a cent.",
  },
  mantle: {
    id: "mantle",
    name: "Mantle",
    kind: "evm",
    evmChainId: 5000,
    llama: ["Mantle"],
    dexscreener: "mantle",
    kyber: "mantle",
    backed: "Mantle",
    exchangeNetworks: ["mantle"],
    rpc: ["https://rpc.mantle.xyz", "https://mantle-rpc.publicnode.com"],
    tokenUrl: evmExplorer("https://mantlescan.xyz"),
    quoteStable: { symbol: "USDC", address: "0x09bc4e0d864854c6afb6eb9a9cdf58ac190d0df9", decimals: 6 },
    feeNote: "Fees are usually a few cents.",
  },
  hyperevm: {
    id: "hyperevm",
    name: "HyperEVM",
    kind: "evm",
    evmChainId: 999,
    // DefiLlama's "Hyperliquid L1" also counts the exchange's own ledger, which is not this chain.
    llama: ["HyperEVM"],
    dexscreener: "hyperevm",
    kyber: "hyperevm",
    backed: "HyperEVM",
    exchangeNetworks: ["hyperevm"],
    rpc: ["https://rpc.hyperliquid.xyz/evm"],
    tokenUrl: evmExplorer("https://hyperevmscan.io"),
    quoteStable: { symbol: "USDC", address: "0xb88339cb7199b77e23db6e890353e22632ba630f", decimals: 6 },
    feeNote: "Fees are usually a few cents.",
  },
  polygon: {
    id: "polygon",
    name: "Polygon",
    kind: "evm",
    evmChainId: 137,
    llama: ["Polygon"],
    dexscreener: "polygon",
    kyber: "polygon",
    backed: "Polygon",
    exchangeNetworks: ["polygon", "matic"],
    tokenUrl: evmExplorer("https://polygonscan.com"),
    feeNote: "Fees are usually under a cent.",
  },
  avalanche: {
    id: "avalanche",
    name: "Avalanche",
    kind: "evm",
    evmChainId: 43114,
    llama: ["Avalanche"],
    dexscreener: "avalanche",
    kyber: "avalanche",
    backed: "Avalanche",
    exchangeNetworks: ["avacchain", "avalanche", "avax", "avalanche_c_chain", "avalanche-c-chain", "avalanche c-chain"],
    tokenUrl: evmExplorer("https://snowscan.xyz"),
    feeNote: "Fees are usually a few cents.",
  },
  ink: {
    id: "ink",
    name: "Ink",
    kind: "evm",
    evmChainId: 57073,
    llama: ["Ink"],
    dexscreener: "ink",
    backed: "Ink",
    exchangeNetworks: ["ink"],
    rpc: ["https://rpc-gel.inkonchain.com", "https://ink-rpc.publicnode.com"],
    tokenUrl: evmExplorer("https://explorer.inkonchain.com"),
    feeNote: "Fees are usually under a cent.",
  },
  xlayer: {
    id: "xlayer",
    name: "X Layer",
    kind: "evm",
    evmChainId: 196,
    llama: ["X Layer"],
    dexscreener: "xlayer",
    backed: "XLayer",
    exchangeNetworks: ["xlayer"],
    tokenUrl: evmExplorer("https://www.oklink.com/xlayer"),
    feeNote: "Fees are usually under a cent.",
  },
  tron: {
    id: "tron",
    name: "Tron",
    kind: "other",
    llama: ["Tron"],
    dexscreener: "tron",
    backed: "Tron",
    exchangeNetworks: ["tron", "trx", "trc20"],
    tokenUrl: (address) => `https://tronscan.org/#/token20/${address}`,
    feeNote: "Fees vary with account resources, often around a dollar for a token transfer.",
  },
  ton: {
    id: "ton",
    name: "TON",
    kind: "other",
    llama: ["TON"],
    dexscreener: "ton",
    backed: "Ton",
    exchangeNetworks: ["ton"],
    tokenUrl: (address) => `https://tonviewer.com/${address}`,
    feeNote: "Fees are usually a few cents.",
  },
};

/** The coin each chain charges its fees in. A wallet needs a little of it before it can swap. */
export const FEE_COIN: Record<ChainId, string> = {
  ethereum: "ETH",
  base: "ETH",
  arbitrum: "ETH",
  optimism: "ETH",
  bsc: "BNB",
  solana: "SOL",
  robinhood: "ETH",
  mantle: "MNT",
  hyperevm: "HYPE",
  polygon: "POL",
  avalanche: "AVAX",
  ink: "ETH",
  xlayer: "OKB",
  tron: "TRX",
  ton: "TON",
};

export const CHAIN_LIST: Chain[] = Object.values(CHAINS);

const byLlama = new Map<string, Chain>();
const byBacked = new Map<string, Chain>();
const byDexscreener = new Map<string, Chain>();
const byExchangeNetwork = new Map<string, Chain>();
const byEvmId = new Map<number, Chain>();
for (const chain of CHAIN_LIST) {
  for (const name of chain.llama) byLlama.set(name.toLowerCase(), chain);
  if (chain.backed) byBacked.set(chain.backed.toLowerCase(), chain);
  if (chain.dexscreener) byDexscreener.set(chain.dexscreener, chain);
  for (const network of chain.exchangeNetworks) byExchangeNetwork.set(network, chain);
  if (chain.evmChainId !== undefined) byEvmId.set(chain.evmChainId, chain);
}

export const chainFromLlama = (name: string) => byLlama.get(name.toLowerCase()) ?? null;
export const chainFromBacked = (name: string) => byBacked.get(name.toLowerCase()) ?? null;
export const chainFromDexscreener = (id: string) => byDexscreener.get(id) ?? null;
export const chainFromExchangeNetwork = (id: string) => byExchangeNetwork.get(id.toLowerCase()) ?? null;
export const chainFromEvmId = (id: number) => byEvmId.get(id) ?? null;
export const chainById = (id: string) => (CHAINS as Record<string, Chain | undefined>)[id] ?? null;

/** Addresses compare case-insensitively on EVM chains and exactly elsewhere. */
export function sameAddress(chain: Chain, a: string, b: string): boolean {
  return chain.kind === "evm" ? a.toLowerCase() === b.toLowerCase() : a === b;
}
