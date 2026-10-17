// Reviewed stablecoin profiles. A coin is only shown to visitors when it has a
// profile here AND passes the live checks in server/stablecoins.ts (size and
// peg), so a coin that loses its peg drops off the list on its own.
//
// Keep every statement here a plain, checkable fact about the issuer or the
// backing. Figures that move (supply, price) never belong in this file.

export type Backing = "cash" | "crypto" | "synthetic";

export interface StablecoinProfile {
  symbol: string;
  /** DefiLlama's stablecoin id, the key live data is matched on. */
  llamaId: string;
  name: string;
  issuer: string;
  launched: number;
  backing: Backing;
  backingSummary: string;
  /** Who can turn the coin back into dollars with the issuer. */
  redemption: string;
  /** Things a first-time holder should know. */
  watchFor: string[];
  site: string;
  reservesUrl?: string;
}

export const PROFILES_REVIEWED_ON = "2026-09-28";

export const BACKING_LABEL: Record<Backing, { label: string; explainer: string }> = {
  cash: {
    label: "Cash-backed",
    explainer: "Each coin is backed by dollars and short-term US Treasuries held by the issuer.",
  },
  crypto: {
    label: "Crypto-backed",
    explainer: "Backed by more than a dollar of crypto and other assets locked in smart contracts.",
  },
  synthetic: {
    label: "Synthetic",
    explainer: "Holds its value through trading positions rather than dollars in a bank. Higher risk.",
  },
};

export const STABLECOIN_PROFILES: StablecoinProfile[] = [
  {
    symbol: "USDC",
    llamaId: "2",
    name: "USD Coin",
    issuer: "Circle",
    launched: 2018,
    backing: "cash",
    backingSummary: "Cash and short-dated US Treasuries, with monthly reserve reports from an outside accounting firm.",
    redemption: "Businesses redeem directly with Circle; individuals sell on an exchange.",
    watchFor: ["Circle can freeze coins at an address when legally required."],
    site: "https://www.circle.com/usdc",
    reservesUrl: "https://www.circle.com/transparency",
  },
  {
    symbol: "USDT",
    llamaId: "1",
    name: "Tether",
    issuer: "Tether",
    launched: 2014,
    backing: "cash",
    backingSummary:
      "Mostly US Treasury bills, plus smaller holdings that include gold, bitcoin and secured loans. Reserves are reported quarterly.",
    redemption: "Direct redemption has a high minimum; individuals sell on an exchange.",
    watchFor: [
      "Part of the reserve is not cash or Treasuries.",
      "Tether can freeze coins at an address.",
    ],
    site: "https://tether.to",
    reservesUrl: "https://tether.to/en/transparency/",
  },
  {
    symbol: "USDS",
    llamaId: "209",
    name: "Sky Dollar",
    issuer: "Sky (formerly MakerDAO)",
    launched: 2024,
    backing: "crypto",
    backingSummary:
      "The successor to DAI. Backed by more collateral than the coins issued, held in smart contracts and real-world assets.",
    redemption: "Converts 1:1 with DAI on-chain; individuals can also sell on an exchange.",
    watchFor: ["Run by token-holder votes rather than a regulated company."],
    site: "https://sky.money",
  },
  {
    symbol: "DAI",
    llamaId: "5",
    name: "Dai",
    issuer: "Sky (formerly MakerDAO)",
    launched: 2017,
    backing: "crypto",
    backingSummary:
      "Backed by more collateral than the coins issued, held in smart contracts and real-world assets.",
    redemption: "No issuer redemption desk; swaps 1:1 with USDC through Sky's on-chain module when it has funds.",
    watchFor: ["Run by token-holder votes rather than a regulated company."],
    site: "https://sky.money",
  },
  {
    symbol: "USDG",
    llamaId: "286",
    name: "Global Dollar",
    issuer: "Paxos",
    launched: 2024,
    backing: "cash",
    backingSummary: "Dollar deposits and short-term US government securities held by Paxos.",
    redemption: "Paxos customers redeem 1:1; individuals sell on an exchange.",
    watchFor: [
      "The dollar used on Robinhood Chain.",
      "Paxos can freeze coins at an address when legally required.",
    ],
    site: "https://globaldollar.com",
  },
  {
    symbol: "PYUSD",
    llamaId: "120",
    name: "PayPal USD",
    issuer: "Paxos, for PayPal",
    launched: 2023,
    backing: "cash",
    backingSummary: "Dollar deposits, US Treasuries and similar cash equivalents, with monthly reserve reports.",
    redemption: "PayPal and Venmo users convert to dollars in the app.",
    watchFor: ["Paxos can freeze coins at an address when legally required."],
    site: "https://www.paypal.com/pyusd",
    reservesUrl: "https://www.paxos.com/pyusd-transparency",
  },
  {
    symbol: "RLUSD",
    llamaId: "250",
    name: "Ripple USD",
    issuer: "Ripple (Standard Custody & Trust)",
    launched: 2024,
    backing: "cash",
    backingSummary: "Dollar deposits, US Treasuries and cash equivalents, with monthly reserve reports.",
    redemption: "Institutions redeem with the issuer; individuals sell on an exchange.",
    watchFor: ["Available on Ethereum and the XRP Ledger only."],
    site: "https://ripple.com/solutions/stablecoin/",
  },
  {
    symbol: "USD1",
    llamaId: "262",
    name: "World Liberty Financial USD",
    issuer: "World Liberty Financial",
    launched: 2025,
    backing: "cash",
    backingSummary: "Dollar deposits, US Treasuries and cash equivalents held with a custodian.",
    redemption: "Institutions redeem with the issuer; individuals sell on an exchange.",
    watchFor: ["The newest coin on this list, with the shortest track record."],
    site: "https://worldlibertyfinancial.com",
  },
  {
    symbol: "USDe",
    llamaId: "146",
    name: "Ethena USDe",
    issuer: "Ethena",
    launched: 2024,
    backing: "synthetic",
    backingSummary:
      "Holds crypto and tokenized assets and offsets their price moves with short futures positions on exchanges.",
    redemption: "Only approved firms mint and redeem; individuals buy and sell on an exchange.",
    watchFor: [
      "Not backed by dollars in a bank.",
      "Depends on futures markets and the exchanges that hold its positions.",
    ],
    site: "https://ethena.fi",
  },
];

/**
 * Tokens DefiLlama lists beside stablecoins that are really shares of a fund.
 * They are investments with their own eligibility rules, not spending dollars.
 */
export const FUND_TOKENS: Record<string, string> = {
  "173": "BUIDL is a share in a BlackRock money market fund, open to qualified investors only.",
  "237": "USYC is a share in a tokenized money market fund, not a payment stablecoin.",
  "129": "USDY is a yield-bearing note backed by Treasuries, not a payment stablecoin.",
};
