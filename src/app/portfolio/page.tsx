import type { Metadata } from "next";
import Link from "next/link";
import { PortfolioBuilder } from "./PortfolioBuilder";

export const metadata: Metadata = {
  title: "Portfolio builder",
  description:
    "Set your starting capital and a stock and bond target. Get a mix of asset classes, a glide path, and where each piece fills best on chain for its exact size.",
};

export default function PortfolioPage() {
  return (
    <main className="shell page">
      <header className={"page-head"} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <span className="eyebrow">Panther intelligence / onboarding</span>
          <h1 className="title">Portfolio builder</h1>
          <p className="lede">
            Capital and a stock/bond target in; a mean-variance mix, a glide path, and the tokenized fund, issuer and chain that
            fills each order at its real size out.
          </p>
        </div>
        <Link className="outline-link" href="/method">
          How it works ↗
        </Link>
      </header>
      <PortfolioBuilder />
    </main>
  );
}
