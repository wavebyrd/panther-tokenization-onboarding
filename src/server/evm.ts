// Minimal JSON-RPC and Multicall3 reads, enough for the few on-chain facts the
// site needs (an oracle price, a share multiplier). Read-only: nothing here
// can sign or send a transaction.

import { CHAINS, type ChainId } from "./chains";
import { ownRpc } from "./connections";

export const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";

// A public endpoint that does not answer quickly is not going to; waiting
// longer only holds up the page.
const RPC_TIMEOUT_MS = 3_500;
const BENCHED_MS = 5 * 60 * 1000;

// Endpoints that failed recently, and until when to try the others first.
const benched: Map<string, number> = ((globalThis as { __onboardingBenched?: Map<string, number> }).__onboardingBenched ??=
  new Map());

/**
 * One JSON-RPC call, tried against each of the chain's endpoints in turn.
 * An endpoint that fails is moved to the back of the line for a few minutes,
 * so one dead endpoint costs a wait once, not on every call.
 */
export async function rpc(chain: ChainId, method: string, params: unknown[]): Promise<unknown> {
  // Your own endpoints (PTO_RPC_<CHAIN>) first, then the public ones.
  const endpoints = [...ownRpc(chain), ...(CHAINS[chain].rpc ?? [])];
  if (!endpoints.length) throw new Error(`no rpc endpoint configured for ${chain}`);
  const now = Date.now();
  const healthy = (endpoint: string) => (benched.get(endpoint) ?? 0) <= now;
  const ordered = [...endpoints.filter(healthy), ...endpoints.filter((endpoint) => !healthy(endpoint))];

  let lastError: unknown = null;
  for (const endpoint of ordered) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        cache: "no-store",
        signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`rpc answered ${response.status}`);
      const body = (await response.json()) as { result?: unknown; error?: unknown };
      // The endpoint answered; what it said is about the call, not the endpoint.
      if (body.error || body.result === undefined) {
        lastError = new Error("rpc returned an error");
        continue;
      }
      benched.delete(endpoint);
      return body.result;
    } catch (error) {
      lastError = error;
      benched.set(endpoint, Date.now() + BENCHED_MS);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("no rpc endpoint answered");
}

const pad = (hex: string) => hex.padStart(64, "0");
const word = (value: number) => pad(value.toString(16));

/** A call: `data` is the selector plus ABI-encoded arguments, hex without 0x. */
export interface Call {
  target: string;
  data: string;
}

export const addressWord = (address: string) => pad(address.toLowerCase().replace(/^0x/, ""));
export const uintWord = (value: bigint) => pad(value.toString(16));

function encodeAggregate3(calls: readonly Call[]): string {
  const tuples = calls.map((call) => {
    const bytes = call.data.length / 2;
    return [
      pad(call.target.toLowerCase().slice(2)),
      word(1), // allowFailure
      word(0x60),
      word(bytes),
      call.data.padEnd(Math.ceil(bytes / 32) * 64, "0"),
    ].join("");
  });
  const head = [word(0x20), word(calls.length)];
  let offset = calls.length * 32;
  for (const tuple of tuples) {
    head.push(word(offset));
    offset += tuple.length / 2;
  }
  return "0x82ad56cb" + head.join("") + tuples.join("");
}

function decodeAggregate3(result: string, count: number): Array<string[] | null> {
  const hex = result.slice(2);
  const wordAt = (index: number) => hex.slice(index * 64, index * 64 + 64);
  const out: Array<string[] | null> = [];
  for (let i = 0; i < count; i++) {
    const tupleOffset = Number.parseInt(wordAt(2 + i), 16) / 32 + 2;
    const ok = Number.parseInt(wordAt(tupleOffset), 16) === 1;
    const length = Number.parseInt(wordAt(tupleOffset + 2), 16);
    if (!ok || length < 32) {
      out.push(null);
      continue;
    }
    const words: string[] = [];
    for (let w = 0; w < length / 32; w++) words.push(wordAt(tupleOffset + 3 + w));
    out.push(words);
  }
  return out;
}

/** Each call's 32-byte return words at the chain tip; null where that call failed. */
export async function readCalls(chain: ChainId, calls: readonly Call[]): Promise<Array<string[] | null>> {
  if (!calls.length) return [];
  const result = (await rpc(chain, "eth_call", [{ to: MULTICALL3, data: encodeAggregate3(calls) }, "latest"])) as string;
  return decodeAggregate3(result, calls.length);
}

export const toBigInt = (w: string) => BigInt("0x" + w);

/** A raw integer amount as a decimal number; precise to ~15 significant digits. */
export function scaled(value: bigint, decimals: number): number {
  if (decimals <= 0) return Number(value);
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = value % base;
  return Number(whole) + Number(fraction) / Number(base);
}

/** A decimal amount as a raw integer string, without floating point drift. */
export function toRaw(amount: number, decimals: number): string {
  const fixed = amount.toFixed(Math.min(decimals, 8));
  const [whole, fraction = ""] = fixed.split(".");
  return (BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0").slice(0, decimals) || "0")).toString();
}
