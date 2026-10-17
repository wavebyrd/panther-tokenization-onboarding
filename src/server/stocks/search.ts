// Finding a stock by what a visitor types: a ticker, or part of a name.

import type { Stock } from "./universe";

/** Well-known names shown before the visitor has typed anything. */
export const FEATURED = ["AAPL", "NVDA", "TSLA", "MSFT", "AMZN", "GOOGL", "META", "SPY", "QQQ", "COIN", "MSTR", "PLTR"];

export function searchStocks(stocks: readonly Stock[], query: string, limit: number): Stock[] {
  const text = query.trim().toUpperCase();
  if (!text) {
    const byTicker = new Map(stocks.map((stock) => [stock.ticker, stock]));
    const featured = FEATURED.flatMap((ticker) => byTicker.get(ticker) ?? []);
    const rest = stocks.filter((stock) => !FEATURED.includes(stock.ticker));
    return [...featured, ...rest].slice(0, limit);
  }
  const scored: Array<{ stock: Stock; score: number }> = [];
  for (const stock of stocks) {
    const name = stock.name.toUpperCase();
    let score = -1;
    if (stock.ticker === text) score = 100;
    else if (stock.ticker.startsWith(text)) score = 80 - (stock.ticker.length - text.length);
    else if (name.startsWith(text)) score = 60;
    else if (name.split(/[\s&.,-]+/).some((word) => word.startsWith(text))) score = 50;
    // Letters buried inside a word ("tes" in "States") are not what anyone is searching for.
    if (score < 0) continue;
    // Among equal matches, the more widely issued stock is the likelier target.
    scored.push({ stock, score: score + stock.issuers.length });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.stock.ticker.localeCompare(b.stock.ticker))
    .slice(0, limit)
    .map((item) => item.stock);
}
