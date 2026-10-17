import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { SourceLine } from "@/components/SourceLine";
import { Unavailable } from "@/components/Unavailable";
import { loadOnramps } from "@/server/onramps";
import { loadStablecoins } from "@/server/stablecoins";
import { DollarsExplorer } from "./DollarsExplorer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Get dollars in",
  description: "Which stablecoins pass our checks, and where to buy each one with a bank transfer or card.",
};

export default async function DollarsPage({
  searchParams,
}: {
  searchParams: Promise<{ coin?: string; chain?: string }>;
}) {
  const params = await searchParams;
  const [coins, onramps] = await Promise.all([loadStablecoins().catch(() => null), loadOnramps().catch(() => null)]);

  return (
    <main className="shell page">
      <header className="page-head">
        <span className="eyebrow">Step 1</span>
        <h1 className="title">Get digital dollars</h1>
        <p className="lede">
          A stablecoin is a token built to stay worth one dollar. It is what you use to earn interest and buy tokenized
          stocks. Pick one, then see where to buy it.
        </p>
      </header>

      {coins ? (
        <DollarsExplorer
          coins={coins.value.coins}
          excluded={coins.value.excluded}
          rules={coins.value.rules}
          reviewedOn={coins.value.profilesReviewedOn}
          providers={onramps?.value ?? []}
          initialCoin={params.coin}
          initialChain={params.chain}
        />
      ) : (
        <Unavailable what="Stablecoin data" />
      )}

      {coins && !onramps ? (
        <div className="notice caution" style={{ marginTop: 24 }}>
          <Icon name="alert" />
          <span>On-ramp listings could not be read just now. The coins above are current; try again in a minute.</span>
        </div>
      ) : null}

      <SourceLine
        sources={[
          ...(coins ? [{ name: "DefiLlama", fetchedAt: coins.fetchedAt, stale: coins.stale }] : []),
          ...(onramps ? [{ name: "each provider's public API", fetchedAt: onramps.fetchedAt, stale: onramps.stale }] : []),
        ]}
      />
    </main>
  );
}
