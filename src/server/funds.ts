// Tokenized funds that hold the bond side directly: tokenized Treasury and
// money market funds (BUIDL, USYC, BENJI, USTB, OUSG and the rest). Most are
// bought from the issuer at the fund's price rather than on an exchange, so
// they are an alternative to a tokenized ETF for the steadiest classes.
//
// Read from Panther Terminal's class boards, which carry each fund's on-chain
// supply, price, yield and its eligibility rule with the source it came from.

import { cached, HOUR, type Cached } from "./cache";
import { pantherApi } from "./connections";
import { fetchJson } from "./http";

/** Who a fund is open to, as its own documents state it. */
export type Eligibility = "retail" | "accredited" | "qualified_purchaser" | "institutional" | "non_us_only" | "unknown";

export interface FundToken {
  id: string;
  symbol: string;
  name: string;
  issuer: string;
  kind: "Treasury fund" | "Money market fund" | "Treasury note";
  /** Value held on chain, in dollars. */
  valueUsd: number | null;
  /** Price of one token, in dollars. */
  price: number | null;
  priceAt: string | null;
  /** Yield earned over the last 7 and 30 days, as yearly fractions, from the fund's own price. */
  yield7d: number | null;
  yield30d: number | null;
  chains: string[];
  eligibility: Eligibility;
  eligibilitySource: string | null;
  /** Where the fund is domiciled; an "open to individuals" rule applies there. */
  jurisdiction: string | null;
  minInvestmentUsd: number | null;
  redemption: string | null;
  website: string | null;
  summary: string | null;
  /** The Panther page for the fund's class. */
  pantherUrl: string;
}

export interface FundCatalog {
  funds: FundToken[];
  /** When the boards behind this were generated. */
  asOf: string | null;
}

interface BoardEntry {
  id: string;
  symbol: string;
  name: string;
  issuer?: { name?: string } | null;
  sub_class?: string | null;
  chains?: string[];
  deployments?: Array<{ chain: string; supply: number | null }>;
  price?: number | null;
  price_at?: string | null;
  value_usd?: number | null;
  yield_7d?: number | null;
  yield_30d?: number | null;
  summary?: string | null;
  links?: { website?: string | null } | null;
  profile?: {
    min_investment_usd?: number | null;
    eligibility?: { value?: string | null; source_url?: string | null } | null;
    jurisdiction?: { value?: string | null } | null;
    redemption?: { value?: string | null } | null;
  } | null;
}

interface Board {
  as_of?: string;
  entries?: BoardEntry[];
}

const KIND: Record<string, FundToken["kind"]> = {
  treasury_fund: "Treasury fund",
  money_market_fund: "Money market fund",
  prime_money_market_fund: "Money market fund",
  treasury_note: "Treasury note",
};

const ELIGIBILITY = new Set<Eligibility>(["retail", "accredited", "qualified_purchaser", "institutional", "non_us_only"]);

const finite = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

function toFund(entry: BoardEntry, board: string): FundToken | null {
  const kind = KIND[entry.sub_class ?? ""];
  if (!kind) return null;
  const eligibility = entry.profile?.eligibility?.value as Eligibility | undefined;
  const chains = (entry.deployments ?? []).filter((item) => (item.supply ?? 0) > 0).map((item) => item.chain);
  return {
    id: entry.id,
    symbol: entry.symbol,
    name: entry.name,
    issuer: entry.issuer?.name ?? "",
    kind,
    valueUsd: finite(entry.value_usd),
    price: finite(entry.price),
    priceAt: entry.price_at ?? null,
    yield7d: finite(entry.yield_7d),
    yield30d: finite(entry.yield_30d),
    chains: chains.length ? chains : entry.chains ?? [],
    eligibility: eligibility && ELIGIBILITY.has(eligibility) ? eligibility : "unknown",
    eligibilitySource: entry.profile?.eligibility?.source_url ?? null,
    jurisdiction: entry.profile?.jurisdiction?.value ?? null,
    minInvestmentUsd: finite(entry.profile?.min_investment_usd),
    redemption: entry.profile?.redemption?.value ?? null,
    website: entry.links?.website ?? null,
    summary: entry.summary ?? null,
    pantherUrl: `https://pantherterminal.com/tokenization/${board === "money_market" ? "money-market" : "treasuries"}`,
  };
}

export async function loadFundCatalog(): Promise<Cached<FundCatalog>> {
  return cached("fund-catalog", { ttlMs: HOUR, staleMs: 24 * HOUR }, async () => {
    const boards = ["treasury", "money_market"];
    const read = await Promise.all(
      boards.map((board) =>
        fetchJson<Board>(`${pantherApi()}/v1/classes/${board}/board`, { timeoutMs: 15_000 })
          .then((body) => ({ board, body }))
          .catch(() => null),
      ),
    );
    const seen = new Set<string>();
    const funds: FundToken[] = [];
    let asOf: string | null = null;
    for (const item of read) {
      if (!item?.body.entries) continue;
      asOf = asOf ?? item.body.as_of ?? null;
      for (const entry of item.body.entries) {
        const fund = toFund(entry, item.board);
        if (!fund || seen.has(fund.symbol)) continue;
        seen.add(fund.symbol);
        funds.push(fund);
      }
    }
    if (!funds.length) throw new Error("no fund board could be read");
    funds.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));
    return { funds, asOf };
  });
}

export type Residence = "us" | "non_us";
export type InvestorType = "everyone" | "accredited" | "qualified_purchaser" | "institutional";

const RANK: Record<InvestorType, number> = { everyone: 0, accredited: 1, qualified_purchaser: 2, institutional: 3 };

/** Whether a fund's own eligibility rule admits this reader. Unknown rules are never assumed open. */
export function canAccess(fund: FundToken, residence: Residence, investor: InvestorType): boolean | null {
  switch (fund.eligibility) {
    case "retail":
      // A retail fund is open to the public of its own country; elsewhere it depends on the issuer.
      if (!fund.jurisdiction) return null;
      if (/united states|^us$|delaware/i.test(fund.jurisdiction)) return residence === "us" ? true : null;
      return residence === "non_us" ? null : false;
    case "non_us_only":
      return residence === "non_us";
    case "accredited":
      return RANK[investor] >= RANK.accredited;
    case "qualified_purchaser":
      return RANK[investor] >= RANK.qualified_purchaser;
    case "institutional":
      return investor === "institutional";
    default:
      return null;
  }
}

export const ELIGIBILITY_LABEL: Record<Eligibility, string> = {
  retail: "Open to individuals",
  accredited: "Accredited investors",
  qualified_purchaser: "Qualified purchasers",
  institutional: "Institutions only",
  non_us_only: "Outside the US only",
  unknown: "Not stated",
};
