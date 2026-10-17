"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Coin } from "@/components/Coin";
import { Icon } from "@/components/Icon";
import { warmStock } from "@/components/WarmLink";
import styles from "./stocks.module.css";

interface Result {
  ticker: string;
  name: string;
  kind: "stock" | "fund";
  issuers: string[];
  chains: string[];
}

export function StockSearch({ total }: { total: number }) {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [active, setActive] = useState(0);
  const [state, setState] = useState<"idle" | "loading" | "done" | "failed">("idle");
  const [going, setGoing] = useState<string | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    const text = query.trim();
    if (!text) {
      setResults([]);
      setState("idle");
      return;
    }
    const id = ++latest.current;
    setState("loading");
    const timer = setTimeout(() => {
      fetch(`/api/v1/stocks?q=${encodeURIComponent(text)}&limit=8`)
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error("unavailable"))))
        .then((body: { data: { stocks: Result[] } }) => {
          // A slower, older request must not overwrite a newer one.
          if (id !== latest.current) return;
          setResults(body.data.stocks);
          setActive(0);
          setState("done");
          // The top match is the likeliest choice; have its prices ready.
          if (body.data.stocks[0]) warmStock(body.data.stocks[0].ticker);
        })
        .catch(() => {
          if (id === latest.current) setState("failed");
        });
    }, 140);
    return () => clearTimeout(timer);
  }, [query]);

  const go = (ticker: string) => {
    setGoing(ticker);
    router.push(`/stocks/${ticker}`);
  };

  const onKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!results.length) return;
      event.preventDefault();
      setActive((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const chosen = results[active];
      if (chosen) go(chosen.ticker);
      // Nothing matched yet: trust what was typed if it could be a ticker.
      else if (/^[A-Za-z][A-Za-z0-9.]{0,9}$/.test(query.trim())) go(query.trim().toUpperCase());
    } else if (event.key === "Escape") {
      setQuery("");
    }
  };

  const open = query.trim().length > 0;

  return (
    <div className={styles.search}>
      <div className={styles.searchBox} data-open={open}>
        <Icon name="search" size={22} />
        <input
          className={styles.searchInput}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && results[active] ? `${listId}-${results[active].ticker}` : undefined}
          aria-label="Search for a stock by ticker or name"
          placeholder="Try AAPL, Tesla, or S&P 500"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKey}
        />
        {state === "loading" || going ? <span className="spinner" aria-hidden="true" /> : null}
      </div>

      {open ? (
        <ul id={listId} className={styles.results} role="listbox">
          {results.map((stock, index) => (
            <li key={stock.ticker} id={`${listId}-${stock.ticker}`} role="option" aria-selected={index === active}>
              <button
                type="button"
                className={styles.result}
                data-active={index === active}
                onMouseEnter={() => {
                  setActive(index);
                  warmStock(stock.ticker);
                }}
                onClick={() => go(stock.ticker)}
              >
                <Coin label={stock.ticker} size={38} />
                <span className={styles.stockText}>
                  <strong>{stock.name}</strong>
                  <span className="tiny faint">
                    {stock.ticker} · {stock.kind === "fund" ? "Fund" : "Stock"} · {stock.issuers.length}{" "}
                    {stock.issuers.length === 1 ? "issuer" : "issuers"}
                  </span>
                </span>
                <Icon name="arrowRight" size={16} className={styles.go} />
              </button>
            </li>
          ))}
          {state === "done" && !results.length ? (
            <li className={styles.empty}>
              No tokenized form of “{query.trim()}” was found among the issuers we read.
            </li>
          ) : null}
          {state === "failed" ? <li className={styles.empty}>The search could not be run just now. Try again.</li> : null}
        </ul>
      ) : null}

      <p className="small faint" style={{ marginTop: 12 }}>
        {total.toLocaleString("en-US")} stocks and funds have a tokenized form.
      </p>
    </div>
  );
}
