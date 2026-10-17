// Fills the caches when the server starts, so the first visitor does not pay
// for every source being read from cold. Nothing here is awaited by a request:
// a source that fails now is simply read later, when a page asks for it.

import { loadOnramps } from "./onramps";
import { loadStablecoins } from "./stablecoins";
import { lookupStock } from "./stocks/lookup";
import { loadRobinhoodQuotes } from "./stocks/reference";
import { FEATURED } from "./stocks/search";
import { loadUniverse } from "./stocks/universe";
import { loadYields } from "./yields";

const quiet = (work: Promise<unknown>) => work.then(() => undefined).catch(() => undefined);

export async function warm(): Promise<void> {
  await Promise.all([
    quiet(loadUniverse()),
    quiet(loadStablecoins().then(() => Promise.all([loadYields(), loadOnramps()]))),
    quiet(loadRobinhoodQuotes()),
  ]);
  // One at a time, so start-up never bursts past a source's rate limit. The
  // prices go stale within minutes; what lasts is each token's fixed facts
  // (decimals, share multiplier), which are what make a first lookup slow.
  for (const ticker of FEATURED) await quiet(lookupStock(ticker, 1000));
}
