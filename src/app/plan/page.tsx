import type { Metadata } from "next";
import { plannerDefaults } from "@/server/simulate";
import { Planner } from "./Planner";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Plan",
  description: "Map a path from stocks to steady yield, or test a portfolio against real history.",
};

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ tool?: string }> }) {
  const [params, defaults] = await Promise.all([searchParams, plannerDefaults()]);
  return (
    <main className="shell page">
      <header className="page-head">
        <span className="eyebrow">Step 4</span>
        <h1 className="title">Plan the long run</h1>
        <p className="lede">
          Two ways to think ahead. Map a path that moves from stocks toward steady yield as your goal nears, or see how
          a mix of your choosing would have done through real history.
        </p>
      </header>
      <Planner
        initialTool={params.tool === "backtest" ? "backtest" : "glide"}
        stableReturn={defaults.stableReturn}
        stableReturnBasis={defaults.stableReturnBasis}
      />
    </main>
  );
}
