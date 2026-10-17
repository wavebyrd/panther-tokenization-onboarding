"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";

/**
 * Shown when the page opened on prices a little old. Fresh ones are already
 * being fetched; this asks for them, a few times at most, and says so.
 */
export function Refreshing({ readAt, ageSeconds }: { readAt: number; ageSeconds: number }) {
  const router = useRouter();
  const tries = useRef(0);
  // Starts from the age the server worked out, so the first render matches
  // what the server sent; it counts up from the clock only once mounted.
  const [age, setAge] = useState(ageSeconds);

  useEffect(() => {
    const now = () => setAge(Math.max(0, Math.round((Date.now() - readAt) / 1000)));
    now();
    const tick = setInterval(now, 1000);
    return () => clearInterval(tick);
  }, [readAt]);

  useEffect(() => {
    if (tries.current >= 4) return;
    const timer = setTimeout(
      () => {
        tries.current += 1;
        router.refresh();
      },
      tries.current === 0 ? 1200 : 2500,
    );
    return () => clearTimeout(timer);
    // Runs again whenever a refresh brings back prices that are still old.
  }, [readAt, router]);

  return (
    <div className="notice plain small" role="status">
      <span className="spinner" aria-hidden="true" style={{ marginTop: 2 }} />
      <span>
        These prices are {age} seconds old. Fresh ones are on the way and will replace them in a moment.
      </span>
    </div>
  );
}

/** Copies a value, for an address that has to be matched exactly. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access can be refused; the address is still on the page to select.
    }
  };

  return (
    <button type="button" className="chip small" onClick={copy} aria-label={`Copy ${label}`}>
      <Icon name={copied ? "check" : "copy"} size={14} />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
