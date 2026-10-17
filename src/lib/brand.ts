// The product's name and voice, in one place.

export const BRAND = {
  name: "Panther Onboarding",
  tagline: "Your first tokenized portfolio, step by step.",
  description:
    "Build a stock and bond portfolio from tokenized funds, see where each order fills best on chain, get digital dollars in, and earn on them through vetted lenders.",
} as const;

export const NAV = [
  { href: "/portfolio", label: "Build a portfolio", short: "Portfolio" },
  { href: "/dollars", label: "Get dollars in", short: "Dollars" },
  { href: "/earn", label: "Earn", short: "Earn" },
  { href: "/stocks", label: "Stocks", short: "Stocks" },
  { href: "/plan", label: "Plan", short: "Plan" },
] as const;

export const DISCLAIMER =
  "Panther Onboarding is an educational tool that shows information, not advice. It does not hold money, place trades, or recommend what you should buy. Rates and prices change constantly, and tokenized assets can lose value. Check each provider's own terms, including whether it serves your country, before you act.";
