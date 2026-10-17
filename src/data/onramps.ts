// The places a visitor can turn dollars into stablecoins. What each one lists
// and which networks it withdraws to is read live from its public API (see
// server/onramps.ts); only the descriptive facts below are hand-written, and
// each carries a link where the visitor can confirm the current terms.

export type ProviderKind = "exchange" | "direct";

export interface OnrampProviderInfo {
  id: "coinbase" | "kraken" | "bitstamp" | "gemini" | "moonpay" | "ramp";
  name: string;
  kind: ProviderKind;
  url: string;
  /** How the visitor can pay in. */
  funding: string[];
  /** Fees in plain words; never a number that could go stale. */
  feeSummary: string;
  feeUrl: string;
  /** What the public API does not tell us. */
  dataGap?: string;
}

export const KIND_LABEL: Record<ProviderKind, { label: string; explainer: string }> = {
  exchange: {
    label: "Exchange",
    explainer: "Open an account, deposit dollars, buy the stablecoin, then withdraw it to your wallet.",
  },
  direct: {
    label: "Direct to wallet",
    explainer: "Pay by card or bank and the stablecoin is sent straight to your own wallet. Simpler, usually pricier.",
  },
};

export const ONRAMP_PROVIDERS: OnrampProviderInfo[] = [
  {
    id: "coinbase",
    name: "Coinbase",
    kind: "exchange",
    url: "https://www.coinbase.com",
    funding: ["Bank transfer", "Wire", "Debit card"],
    feeSummary:
      "Dollars convert to USDC one-for-one with no fee. Other coins carry a spread and a fee shown before you confirm.",
    feeUrl: "https://help.coinbase.com/en/coinbase/trading-and-funding/pricing-and-fees/fees",
  },
  {
    id: "kraken",
    name: "Kraken",
    kind: "exchange",
    url: "https://www.kraken.com",
    funding: ["Bank transfer", "Wire"],
    feeSummary:
      "Kraken Pro charges a small trading fee that falls with volume. The instant-buy screen in the main app costs more.",
    feeUrl: "https://www.kraken.com/features/fee-schedule",
    dataGap: "Kraken does not publish its withdrawal networks; check its funding page.",
  },
  {
    id: "bitstamp",
    name: "Bitstamp by Robinhood",
    kind: "exchange",
    url: "https://www.bitstamp.net",
    funding: ["Bank transfer", "Wire", "Card"],
    feeSummary: "Charges a trading fee that falls with volume, plus a fee on card purchases.",
    feeUrl: "https://www.bitstamp.net/fee-schedule/",
  },
  {
    id: "gemini",
    name: "Gemini",
    kind: "exchange",
    url: "https://www.gemini.com",
    funding: ["Bank transfer", "Wire", "Debit card"],
    feeSummary:
      "ActiveTrader charges a small trading fee that falls with volume. The simple buy screen costs more.",
    feeUrl: "https://www.gemini.com/fees",
    dataGap: "Gemini does not publish its withdrawal networks; check its transfers page.",
  },
  {
    id: "moonpay",
    name: "MoonPay",
    kind: "direct",
    url: "https://www.moonpay.com/buy",
    funding: ["Card", "Apple Pay", "Google Pay", "Bank transfer"],
    feeSummary:
      "Card purchases usually cost a few percent; bank transfers cost less. The full price is shown before you pay.",
    feeUrl: "https://support.moonpay.com/en/",
  },
  {
    id: "ramp",
    name: "Ramp Network",
    kind: "direct",
    url: "https://ramp.network/buy",
    funding: ["Card", "Apple Pay", "Google Pay", "Bank transfer"],
    feeSummary:
      "Card purchases usually cost a few percent; bank transfers cost less. The full price is shown before you pay.",
    feeUrl: "https://support.rampnetwork.com/en/articles/10415-what-fees-are-charged-when-buying-crypto",
    dataGap: "Ramp's asset list does not say which countries each asset is sold in.",
  },
];
