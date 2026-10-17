// How numbers and times are written across the site. Anything unknown is
// written as a dash, never as zero.

export const DASH = "—";

const known = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);

/** $1,234 or $1,234.56: whole dollars once the amount is large enough that cents are noise. */
export function usd(value: number | null | undefined, options: { cents?: boolean } = {}): string {
  if (!known(value)) return DASH;
  const cents = options.cents ?? Math.abs(value) < 1000;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
}

/** $4.2M, $1.3B: for sizes where the exact figure does not matter. */
export function usdCompact(value: number | null | undefined): string {
  if (!known(value)) return DASH;
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(abs >= 1e10 ? 0 : 1)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}K`;
  return `$${Math.round(value)}`;
}

/** A rate the source gives in percent (4.25 means 4.25%). */
export function rate(value: number | null | undefined, digits = 2): string {
  return known(value) ? `${value.toFixed(digits)}%` : DASH;
}

/** A fraction as a percent (0.0425 becomes 4.25%). */
export function percent(value: number | null | undefined, digits = 1): string {
  return known(value) ? `${(value * 100).toFixed(digits)}%` : DASH;
}

/** A signed fraction as a percent, with a true minus sign. */
export function signedPercent(value: number | null | undefined, digits = 2): string {
  if (!known(value)) return DASH;
  const scaled = value * 100;
  const rounded = Number(scaled.toFixed(digits));
  if (rounded === 0) return `${(0).toFixed(digits)}%`;
  return `${rounded > 0 ? "+" : "−"}${Math.abs(scaled).toFixed(digits)}%`;
}

export function number(value: number | null | undefined, digits = 0): string {
  return known(value)
    ? value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : DASH;
}

/** A share count: enough decimals to be exact for small orders, fewer for large ones. */
export function shares(value: number | null | undefined): string {
  if (!known(value)) return DASH;
  const digits = value >= 100 ? 2 : value >= 1 ? 4 : 5;
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** 0x1234…abcd */
export function shortAddress(address: string): string {
  return address.length > 14 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

/** "2:31 PM" in the reader's own time zone. */
export function clock(iso: string | number | null | undefined): string {
  if (iso === null || iso === undefined) return DASH;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return DASH;
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** "just now", "4 min ago", "3 hr ago", then a date. */
export function ago(iso: string | number | null | undefined, now = Date.now()): string {
  if (iso === null || iso === undefined) return DASH;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return DASH;
  const minutes = Math.round((now - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hr ago`;
  return new Date(then).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "2016-01" becomes "Jan 2016". */
export function month(value: string): string {
  const [year, index] = value.split("-").map(Number);
  if (!year || !index) return value;
  return new Date(Date.UTC(year, index - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "2026-09-28" becomes "Sep 28, 2026". */
export function day(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Round numbers for an axis that spans `min` to `max`, about `count` of them. */
export function ticks(min: number, max: number, count = 5): number[] {
  if (!(max > min)) return [min];
  const rough = (max - min) / Math.max(1, count);
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((candidate) => candidate >= rough) ?? 10 * power;
  const out: number[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max + step * 1e-9; value += step) {
    out.push(Number(value.toPrecision(12)));
  }
  return out;
}
