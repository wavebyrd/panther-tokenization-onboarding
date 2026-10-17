"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import styles from "./developers.module.css";

const LIMIT = 6000;

/** Runs an endpoint's example against this server and shows what comes back. */
export function TryIt({ method, path, body }: { method: "GET" | "POST"; path: string; body?: Record<string, unknown> }) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [status, setStatus] = useState<number | null>(null);
  const [took, setTook] = useState(0);
  const [text, setText] = useState("");

  const run = async () => {
    setState("loading");
    const started = performance.now();
    try {
      const response = await fetch(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = JSON.stringify(await response.json(), null, 2);
      setStatus(response.status);
      setText(json.length > LIMIT ? `${json.slice(0, LIMIT)}\n… ${(json.length - LIMIT).toLocaleString("en-US")} more characters` : json);
    } catch {
      setStatus(null);
      setText("The request could not be completed.");
    }
    setTook(Math.round(performance.now() - started));
    setState("done");
  };

  return (
    <div className="stack" style={{ "--gap": "12px" } as React.CSSProperties}>
      <div className="row">
        <button type="button" className="button dark small" onClick={run} disabled={state === "loading"}>
          {state === "loading" ? <span className="spinner" aria-hidden="true" /> : <Icon name="arrowRight" size={15} />}
          {state === "done" ? "Run again" : "Try it"}
        </button>
        {state === "done" ? (
          <span className="small muted num" role="status">
            {status === null ? "Failed" : `Status ${status}`} · {took.toLocaleString("en-US")} ms
          </span>
        ) : null}
        {state === "done" ? (
          <button type="button" className="link small" onClick={() => setState("idle")}>
            Hide
          </button>
        ) : null}
      </div>
      {state === "done" ? (
        <pre className={`${styles.code} ${styles.response}`} tabIndex={0}>
          <code>{text}</code>
        </pre>
      ) : null}
    </div>
  );
}
