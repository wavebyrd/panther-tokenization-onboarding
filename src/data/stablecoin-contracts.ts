// Canonical stablecoin contracts, keyed by chain and address. A lending pool is
// matched to a stablecoin by the address of the token it holds, never by its
// symbol: copycat tokens reuse every well-known symbol.
//
// Generated on 2026-09-28 from published sources, which had to agree
// wherever they overlapped: the issuers' own documentation (collected in the
// Arb project's stablecarry registry), the xStocks issuer API, and MoonPay's
// currency list. Each row names the source it came from.

import type { ChainId } from "@/server/chains";

export interface StablecoinContract {
  chain: ChainId;
  symbol: string;
  address: string;
  /** Set when this is not the issuer's own native deployment. */
  variant: string | null;
  source: string;
}

export const STABLECOIN_CONTRACTS: StablecoinContract[] = [
  { chain: "arbitrum", symbol: "DAI", address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", variant: "bridged", source: "https://tokenlist.arbitrum.io/ArbTokenLists/arbed_uniswap_labs.json" },
  { chain: "base", symbol: "DAI", address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", variant: "bridged", source: "https://static.optimism.io/optimism.tokenlist.json" },
  { chain: "ethereum", symbol: "DAI", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", variant: null, source: "https://chainlog.skyeco.com/api/mainnet/active.json" },
  { chain: "optimism", symbol: "DAI", address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", variant: "bridged", source: "https://static.optimism.io/optimism.tokenlist.json" },
  { chain: "arbitrum", symbol: "PYUSD", address: "0x46850aD61C2B7d64d08c9C754F45254596696984", variant: null, source: "https://docs.paxos.com/guides/stablecoin/pyusd/mainnet" },
  { chain: "ethereum", symbol: "PYUSD", address: "0x6c3ea9036406852006290770BEdFcAbA0e23A0e8", variant: null, source: "https://docs.paxos.com/guides/stablecoin/pyusd/mainnet" },
  { chain: "polygon", symbol: "PYUSD", address: "0x99aF3EeA856556646C98c8B9b2548Fe815240750", variant: null, source: "https://docs.paxos.com/guides/stablecoin/pyusd/mainnet" },
  { chain: "ethereum", symbol: "RLUSD", address: "0x8292Bb45bf1Ee4d140127049757C2E0fF06317eD", variant: null, source: "https://api.moonpay.com/v3/currencies" },
  { chain: "bsc", symbol: "USD1", address: "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d", variant: null, source: "https://api.moonpay.com/v3/currencies" },
  { chain: "ethereum", symbol: "USD1", address: "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d", variant: null, source: "https://api.moonpay.com/v3/currencies" },
  { chain: "arbitrum", symbol: "USDC", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", variant: null, source: "https://developers.circle.com/stablecoins/usdc-contract-addresses" },
  { chain: "avalanche", symbol: "USDC", address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", variant: null, source: "https://developers.circle.com/stablecoins/usdc-contract-addresses" },
  { chain: "base", symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", variant: null, source: "https://developers.circle.com/stablecoins/usdc-contract-addresses" },
  { chain: "bsc", symbol: "USDC", address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", variant: "Binance-Peg", source: "not listed by issuer (Binance-Peg); on-chain check only" },
  { chain: "ethereum", symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", variant: null, source: "https://developers.circle.com/stablecoins/usdc-contract-addresses" },
  { chain: "hyperevm", symbol: "USDC", address: "0xb88339cb7199b77e23db6e890353e22632ba630f", variant: null, source: "https://api.xstocks.fi/api/v2/public/assets" },
  { chain: "ink", symbol: "USDC", address: "0x2d270e6886d130d724215a266106e6832161eaed", variant: null, source: "https://api.xstocks.fi/api/v2/public/assets" },
  { chain: "mantle", symbol: "USDC", address: "0x09bc4e0d864854c6afb6eb9a9cdf58ac190d0df9", variant: null, source: "https://api.xstocks.fi/api/v2/public/assets" },
  { chain: "optimism", symbol: "USDC", address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", variant: null, source: "https://developers.circle.com/stablecoins/usdc-contract-addresses" },
  { chain: "polygon", symbol: "USDC", address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", variant: null, source: "https://developers.circle.com/stablecoins/usdc-contract-addresses" },
  { chain: "solana", symbol: "USDC", address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", variant: null, source: "https://api.xstocks.fi/api/v2/public/assets" },
  { chain: "xlayer", symbol: "USDC", address: "0xb6ceceab302e2e4948951ee7843fc24e92933061", variant: null, source: "https://api.xstocks.fi/api/v2/public/assets" },
  { chain: "arbitrum", symbol: "USDe", address: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34", variant: "bridged", source: "https://docs.ethena.fi/technical-design/key-addresses" },
  { chain: "base", symbol: "USDe", address: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34", variant: "bridged", source: "https://docs.ethena.fi/technical-design/key-addresses" },
  { chain: "bsc", symbol: "USDe", address: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34", variant: "bridged", source: "https://docs.ethena.fi/technical-design/key-addresses" },
  { chain: "ethereum", symbol: "USDe", address: "0x4c9EDD5852cd905f086C759E8383e09bff1E68B3", variant: null, source: "https://docs.ethena.fi/technical-design/key-addresses" },
  { chain: "optimism", symbol: "USDe", address: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34", variant: "bridged", source: "https://docs.ethena.fi/technical-design/key-addresses" },
  { chain: "arbitrum", symbol: "USDG", address: "0x004B506865409877C9fA29bfb1ebA929984B9bbC", variant: null, source: "https://docs.paxos.com/guides/stablecoin/usdg/mainnet" },
  { chain: "ethereum", symbol: "USDG", address: "0xe343167631d89B6Ffc58B88d6b7fB0228795491D", variant: null, source: "https://docs.paxos.com/guides/stablecoin/usdg/mainnet" },
  { chain: "ink", symbol: "USDG", address: "0xe343167631d89B6Ffc58B88d6b7fB0228795491D", variant: null, source: "https://docs.paxos.com/guides/stablecoin/usdg/mainnet" },
  { chain: "mantle", symbol: "USDG", address: "0x063C1d1ef6e9099Ce3E8e9AD5C6173d12C49C086", variant: null, source: "https://docs.paxos.com/guides/stablecoin/usdg/mainnet" },
  { chain: "robinhood", symbol: "USDG", address: "0x5fc5360d0400a0fd4f2af552add042d716f1d168", variant: null, source: "https://api.moonpay.com/v3/currencies" },
  { chain: "solana", symbol: "USDG", address: "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH", variant: null, source: "https://api.xstocks.fi/api/v2/public/assets" },
  { chain: "xlayer", symbol: "USDG", address: "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8", variant: null, source: "https://api.xstocks.fi/api/v2/public/assets" },
  { chain: "arbitrum", symbol: "USDS", address: "0x6491c05A82219b8D1479057361ff1654749b876b", variant: "bridged", source: "https://tokenlist.arbitrum.io/ArbTokenLists/arbed_uniswap_labs.json" },
  { chain: "base", symbol: "USDS", address: "0x820C137fa70C8691f0e44Dc420a5e53c168921Dc", variant: "bridged", source: "https://developers.skyeco.com/guides/skylink/base-eth-native-bridge/" },
  { chain: "ethereum", symbol: "USDS", address: "0xdC035D45d973E3EC169d2276DDab16f1e407384F", variant: null, source: "https://chainlog.skyeco.com/api/mainnet/active.json" },
  { chain: "arbitrum", symbol: "USDT", address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", variant: "USDT0", source: "https://docs.usdt0.to/technical-documentation/deployments" },
  { chain: "avalanche", symbol: "USDT", address: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", variant: null, source: "https://tether.to/en/supported-protocols/" },
  { chain: "base", symbol: "USDT", address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", variant: "bridged", source: "https://static.optimism.io/optimism.tokenlist.json" },
  { chain: "bsc", symbol: "USDT", address: "0x55d398326f99059fF775485246999027B3197955", variant: "Binance-Peg", source: "not listed by issuer (Binance-Peg); on-chain check only" },
  { chain: "ethereum", symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", variant: null, source: "https://tether.to/en/supported-protocols/" },
  { chain: "optimism", symbol: "USDT", address: "0x01bFF41798a0BcF287b996046Ca68b395DbC1071", variant: "USDT0", source: "https://docs.usdt0.to/technical-documentation/deployments" },
  { chain: "optimism", symbol: "USDT", address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", variant: "bridged", source: "https://static.optimism.io/optimism.tokenlist.json" },
  { chain: "polygon", symbol: "USDT", address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", variant: "USDT0", source: "https://docs.usdt0.to/technical-documentation/deployments" },
  { chain: "solana", symbol: "USDT", address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", variant: null, source: "https://api.moonpay.com/v3/currencies" },
  { chain: "ton", symbol: "USDT", address: "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs", variant: null, source: "https://api.moonpay.com/v3/currencies" },
  { chain: "tron", symbol: "USDT", address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", variant: null, source: "https://api.moonpay.com/v3/currencies" },
];
