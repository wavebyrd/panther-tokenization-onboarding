"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

const asked = new Map<string, number>();
const AGAIN_AFTER_MS = 60_000;

/**
 * Starts a stock's price lookup on the server as soon as the pointer reaches
 * its link, so the quotes are already in hand by the time the page opens.
 */
export function warmStock(ticker: string): void {
  const key = ticker.toUpperCase();
  const last = asked.get(key) ?? 0;
  if (Date.now() - last < AGAIN_AFTER_MS) return;
  asked.set(key, Date.now());
  // The answer is not used here; the point is that the server now has it.
  void fetch(`/api/v1/stocks/${encodeURIComponent(key)}?amount=1000`, { priority: "low" }).catch(() => undefined);
}

export function WarmLink({ ticker, ...props }: { ticker: string } & ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      onPointerEnter={() => warmStock(ticker)}
      onFocus={() => warmStock(ticker)}
      onTouchStart={() => warmStock(ticker)}
    />
  );
}
