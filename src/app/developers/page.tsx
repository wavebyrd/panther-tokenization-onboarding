import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { BRAND } from "@/lib/brand";
import { API_VERSION, ENDPOINTS, type Endpoint } from "@/server/endpoints";
import { TryIt } from "./TryIt";
import styles from "./developers.module.css";

export const metadata: Metadata = {
  title: "API",
  description: "Everything on the site, as a read-only JSON API.",
};

const GROUPS: Endpoint["group"][] = ["Stablecoins", "Earn", "Stocks", "Plan", "Service"];

function curl(endpoint: Endpoint, origin: string) {
  const url = `${origin}${endpoint.example.path}`;
  if (endpoint.method === "GET") return `curl "${url}"`;
  return `curl -X POST "${url}" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(endpoint.example.body)}'`;
}

export default function DevelopersPage() {
  const origin = "http://localhost:3400";
  return (
    <main className={`shell page ${styles.docs}`}>
      <header className="page-head">
        <span className="eyebrow">API · version {API_VERSION}</span>
        <h1 className="title">Everything here, as JSON</h1>
        <p className="lede">
          The site is built on its own API. Every figure you see on a page comes from one of these endpoints, and you
          can call them yourself.
        </p>
        <div className="row">
          <a className="button ghost small" href="/api/v1/openapi.json" target="_blank" rel="noreferrer">
            <Icon name="code" size={15} />
            OpenAPI document
          </a>
          <a className="button ghost small" href="/api/v1" target="_blank" rel="noreferrer">
            Endpoint index
          </a>
        </div>
      </header>

      <section className={`card sunk ${styles.basics}`}>
        <div>
          <h2 className="subheading">Read-only</h2>
          <p className="small muted">
            No keys, no accounts, nothing to sign. The API reads public data; it cannot hold money or place a trade.
          </p>
        </div>
        <div>
          <h2 className="subheading">One envelope</h2>
          <p className="small muted">
            Every answer is <code>{"{ data, meta }"}</code>. <code>meta.sources</code> names what was read and when;{" "}
            <code>meta.notes</code> carries the caveats to show beside the data.
          </p>
        </div>
        <div>
          <h2 className="subheading">Unknown stays unknown</h2>
          <p className="small muted">
            A value that could not be read is <code>null</code>, never zero. Errors come back as{" "}
            <code>{"{ error: { code, message } }"}</code>.
          </p>
        </div>
      </section>

      {GROUPS.map((group) => {
        const endpoints = ENDPOINTS.filter((endpoint) => endpoint.group === group);
        if (!endpoints.length) return null;
        return (
          <section key={group} className="section" aria-labelledby={`group-${group}`}>
            <div className="section-head">
              <h2 id={`group-${group}`} className="heading">
                {group}
              </h2>
            </div>
            <div className="stack" style={{ "--gap": "16px" } as React.CSSProperties}>
              {endpoints.map((endpoint) => (
                <article key={endpoint.id} id={endpoint.id} className="card">
                  <div className="stack" style={{ "--gap": "16px" } as React.CSSProperties}>
                    <div className="stack" style={{ "--gap": "8px" } as React.CSSProperties}>
                      <div className={styles.signature}>
                        <span className={`pill ${endpoint.method === "GET" ? "good" : "info"}`}>{endpoint.method}</span>
                        <code>{endpoint.path}</code>
                      </div>
                      <h3 className="subheading">{endpoint.summary}</h3>
                      <p className="muted small" style={{ maxWidth: "76ch" }}>
                        {endpoint.description}
                      </p>
                    </div>

                    {endpoint.params.length ? (
                      <div className="table-wrap">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Field</th>
                              <th>Where</th>
                              <th>What it does</th>
                            </tr>
                          </thead>
                          <tbody>
                            {endpoint.params.map((param) => (
                              <tr key={param.name}>
                                <td>
                                  <code>{param.name}</code>
                                  {param.required ? <span className="tiny faint"> required</span> : null}
                                </td>
                                <td className="small muted">{param.in}</td>
                                <td className="small muted">
                                  {param.description}
                                  {param.example !== undefined ? (
                                    <>
                                      {" "}
                                      Example: <code>{String(param.example)}</code>
                                    </>
                                  ) : null}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}

                    <pre className={styles.code}>
                      <code>{curl(endpoint, origin)}</code>
                    </pre>
                    <TryIt method={endpoint.method} path={endpoint.example.path} body={endpoint.example.body} />
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}

      <p className="tiny faint" style={{ marginTop: 40 }}>
        {BRAND.name} reads public data from DefiLlama, Morpho, DexScreener, KyberSwap, Jupiter, Nasdaq, Yahoo Finance,
        and each issuer's and exchange's own public API. Several of those restrict commercial reuse. Before this runs
        anywhere public, their terms need checking and, where required, a licence.
      </p>
    </main>
  );
}
