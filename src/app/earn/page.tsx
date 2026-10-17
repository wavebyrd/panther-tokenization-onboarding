import type { Metadata } from "next";
import { SourceLine } from "@/components/SourceLine";
import { Unavailable } from "@/components/Unavailable";
import { loadYields } from "@/server/yields";
import { EarnExplorer } from "./EarnExplorer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Earn",
  description: "Interest rates on stablecoins across vetted lenders, with the risks of each in plain words.",
};

export default async function EarnPage({
  searchParams,
}: {
  searchParams: Promise<{ coin?: string; chain?: string }>;
}) {
  const params = await searchParams;
  const yields = await loadYields().catch(() => null);

  return (
    <main className="shell page">
      <header className="page-head">
        <span className="eyebrow">Step 2</span>
        <h1 className="title">Put your dollars to work</h1>
        <p className="lede">
          Lenders pay interest on stablecoins you deposit with them. These are the ones that pass our checks, ranked
          by the rate they have actually held, not a one-day spike.
        </p>
      </header>

      {yields ? (
        <EarnExplorer
          opportunities={yields.value.opportunities}
          riskLevels={yields.value.riskLevels}
          skipped={yields.value.skippedProtocols}
          rules={yields.value.rules}
          reviewedOn={yields.value.protocolsReviewedOn}
          initialCoin={params.coin}
          initialChain={params.chain}
        />
      ) : (
        <Unavailable what="Interest rates" />
      )}

      <SourceLine
        sources={yields ? [{ name: "DefiLlama and Morpho", fetchedAt: yields.fetchedAt, stale: yields.stale }] : []}
        note="Rates are variable and can change at any time. Deposits are not insured."
      />
    </main>
  );
}
