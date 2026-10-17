import type { Metadata } from "next";
import { PortfolioBuilder } from "./PortfolioBuilder";

export const metadata: Metadata = {
  title: "Build a portfolio",
  description:
    "Set your starting capital and a stock and bond target. Get a mix of asset classes, a glide path, and where each piece fills best on chain for its exact size.",
};

export default function PortfolioPage() {
  return (
    <main className="shell page">
      <header className="page-head">
        <span className="eyebrow">Start here</span>
        <h1 className="title">Build a tokenized portfolio</h1>
        <p className="lede">
          Tell it what you have and how much you want in stocks. It spreads each side across asset classes with classic portfolio
          maths, plots a glide path toward your goal, and checks which tokenized fund, issuer and chain can fill each order at its
          real size, right now.
        </p>
      </header>
      <PortfolioBuilder />
    </main>
  );
}
