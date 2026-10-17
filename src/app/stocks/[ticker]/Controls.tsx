"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { usd } from "@/lib/format";
import styles from "../stocks.module.css";

const PRESETS = [100, 500, 1_000, 5_000, 25_000];

/** Order size. Changing it asks for fresh quotes at the new size, since price depends on size. */
export function AmountControl({ ticker, amount }: { ticker: string; amount: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [custom, setCustom] = useState(PRESETS.includes(amount) ? "" : String(amount));

  useEffect(() => {
    setCustom(PRESETS.includes(amount) ? "" : String(amount));
  }, [amount]);

  const go = (next: number) => {
    if (!Number.isFinite(next) || next < 10 || next === amount) return;
    startTransition(() => router.replace(`/stocks/${ticker}?amount=${Math.min(1_000_000, Math.round(next))}`, { scroll: false }));
  };

  return (
    <div className="field">
      <span className="label">How much do you want to buy?</span>
      <div className={styles.amounts} role="group" aria-label="Order size">
        {PRESETS.map((preset) => (
          <button key={preset} type="button" className="chip" aria-pressed={amount === preset} onClick={() => go(preset)}>
            {usd(preset, { cents: false })}
          </button>
        ))}
        <form
          className={`input-wrap ${styles.custom}`}
          onSubmit={(event) => {
            event.preventDefault();
            go(Number(custom));
          }}
        >
          <span className="affix">$</span>
          <input
            className="input has-prefix num"
            type="number"
            inputMode="decimal"
            min={10}
            max={1_000_000}
            step={1}
            placeholder="Other"
            aria-label="Another amount in dollars"
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            onBlur={() => custom && go(Number(custom))}
          />
        </form>
        {pending ? <span className="spinner" role="status" aria-label="Getting new quotes" /> : null}
      </div>
      <span className="hint">Bigger orders move the price more, so the best place can change with size.</span>
    </div>
  );
}

/** Asks for fresh quotes. Quotes are a snapshot; nothing updates behind the reader's back. */
export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button type="button" className="button ghost small" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
      {pending ? <span className="spinner" aria-hidden="true" /> : <Icon name="refresh" size={15} />}
      {pending ? "Getting quotes" : "Refresh prices"}
    </button>
  );
}
