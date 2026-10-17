// The companies that issue tokenized stocks. Which tokens each one lists comes
// live from its own catalog (server/stocks/universe.ts); only the descriptive
// facts below are hand-written.
//
// Eligibility is the most important line here and the one most likely to
// change. Where it has not been confirmed from the issuer's own terms it is
// marked "unconfirmed" rather than guessed.

export type IssuerId = "robinhood" | "coinbase" | "xstocks" | "ondo";

export interface IssuerProfile {
  id: IssuerId;
  name: string;
  /** The company behind it. */
  company: string;
  /** What the holder actually owns. */
  whatYouOwn: string;
  /** How dividends reach the holder. */
  dividends: string;
  eligibility: {
    status: "restricted" | "unconfirmed";
    summary: string;
  };
  /** Where its tokens mostly trade. */
  home: string;
  /**
   * Buying from the issuer or its own app instead of a trading pool. This fills
   * near the fund price whatever the order size, for people it accepts, but it is
   * not quoted here. Not confirmed from the issuer's own terms unless marked.
   */
  direct: { summary: string; url: string; confirmed: boolean } | null;
  url: string;
  catalogUrl: string;
}

export const ISSUERS_REVIEWED_ON = "2026-09-28";

export const ISSUERS: Record<IssuerId, IssuerProfile> = {
  robinhood: {
    id: "robinhood",
    name: "Robinhood Stock Tokens",
    company: "Robinhood",
    whatYouOwn:
      "A token that tracks the share price. It is a contract with Robinhood's issuing company, not the share itself, and carries no voting rights.",
    dividends: "Added to the token: each token stands for slightly more of a share after every dividend.",
    eligibility: {
      status: "restricted",
      summary:
        "Issued for customers outside the United States. Only Robinhood's approved partners can create or redeem tokens; everyone else trades them on exchanges.",
    },
    home: "Robinhood Chain",
    direct: {
      summary: "Bought inside the Robinhood app by eligible customers in the EU, then held or withdrawn as a token.",
      url: "https://robinhood.com/eu/en/invest/",
      confirmed: false,
    },
    url: "https://robinhood.com/eu/en/invest/",
    catalogUrl: "https://api.robinhood.com/rhj/assets",
  },
  coinbase: {
    id: "coinbase",
    name: "Coinbase Tokenized Stocks",
    company: "Coinbase",
    whatYouOwn: "A token on Base that tracks the share price, issued through Coinbase.",
    dividends: "Not confirmed from Coinbase's published terms.",
    eligibility: {
      status: "unconfirmed",
      summary: "Availability differs by country. Check Coinbase's own terms for where you live before buying.",
    },
    home: "Base",
    direct: null,
    url: "https://www.coinbase.com/tokenize",
    catalogUrl: "https://docs.base.org",
  },
  xstocks: {
    id: "xstocks",
    name: "xStocks",
    company: "Backed (owned by Kraken)",
    whatYouOwn:
      "A token backed one-for-one by shares held with a custodian. It tracks the share price and carries no voting rights.",
    dividends: "Added to the token: each token stands for slightly more of a share after every dividend.",
    eligibility: {
      status: "restricted",
      summary: "Not offered to United States residents, and restricted in several other countries.",
    },
    home: "Solana",
    direct: {
      summary: "Sold on partner exchanges such as Kraken and Bybit to eligible customers outside the United States.",
      url: "https://xstocks.com",
      confirmed: false,
    },
    url: "https://xstocks.com",
    catalogUrl: "https://api.backed.fi/api/v1/token",
  },
  ondo: {
    id: "ondo",
    name: "Ondo Global Markets",
    company: "Ondo Finance",
    whatYouOwn:
      "A token that tracks the total return of the share, backed by shares held at a broker. It carries no voting rights.",
    dividends: "Reinvested: each token stands for slightly more of a share after every dividend.",
    eligibility: {
      status: "restricted",
      summary: "Not offered to United States residents. Creating and redeeming tokens requires an approved account.",
    },
    home: "Ethereum and BNB Chain",
    direct: {
      summary: "Minted and redeemed at the share price through Ondo's own app by approved accounts outside the United States.",
      url: "https://ondo.finance/global-markets",
      confirmed: false,
    },
    url: "https://ondo.finance/global-markets",
    catalogUrl: "https://github.com/ondoprotocol/ondo-global-markets-token-list",
  },
};

/** Coinbase's tokens on Base and the Chainlink feed that prices each, verified on chain in the Radar project. */
export const COINBASE_TOKENS = [
  { ticker: "AAPL", symbol: "AAPLc", name: "Apple", address: "0xb200000000000000000000C2e324d24d7eEcd1fb", feed: "0x787f13dEa48Db0897CbCDD985de77809D837F988" },
  { ticker: "AMZN", symbol: "AMZNc", name: "Amazon", address: "0xb200000000000000000000d9192b6B456483C2E8", feed: "0x06A8E4b3aBB3B7543d8396FB2B763d22820cB295" },
  { ticker: "GOOGL", symbol: "GOOGLc", name: "Alphabet", address: "0xb2000000000000000000002D0BA3164cc74f58B7", feed: "0x5bF49E0ffA937Ce2FfF033c739aD7C634c4D34F2" },
  { ticker: "META", symbol: "METAc", name: "Meta Platforms", address: "0xb2000000000000000000008bC8786B856E61707C", feed: "0x6526aE6797A76123638b863AeE4dD27Ba4E4b27D" },
  { ticker: "MSFT", symbol: "MSFTc", name: "Microsoft", address: "0xB200000000000000000000Ab99cFa739E253872B", feed: "0xeB10A6c9aa7E537aEd766C08c35Dae35B321b18c" },
  { ticker: "MSTR", symbol: "MSTRc", name: "Strategy", address: "0xb2000000000000000000004884b426556b92883d", feed: "0xB3cE282CD188b35DA0E38D8Bc7d58e33173D202a" },
  { ticker: "NVDA", symbol: "NVDAc", name: "NVIDIA", address: "0xb20000000000000000000078ee7ce2fE4908108C", feed: "0x04689a41629776563E6822F76f2e57D148d28513" },
  { ticker: "SNDK", symbol: "SNDKc", name: "Sandisk", address: "0xb200000000000000000000397293Cb8cda9a10c5", feed: "0x388b0dC46C0Fb05A74BeE0994fa5b02c6Fcca2eA" },
  { ticker: "SPCX", symbol: "SPCXc", name: "SpaceX", address: "0xb2000000000000000000007b9fcbd005511aCBd5", feed: "0x6A634B235903C4ad6376892180d6fF8612e3Fa68" },
  { ticker: "TSLA", symbol: "TSLAc", name: "Tesla", address: "0xb2000000000000000000001e800a7f5189430cD0", feed: "0xFaf869185383a24F8cb00e27BdA6b63B9905DCb4" },
] as const;

export const COINBASE_DECIMALS = 8;
