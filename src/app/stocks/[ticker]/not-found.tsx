import Link from "next/link";

export default function StockNotFound() {
  return (
    <main className="shell page">
      <div className="stack" style={{ "--gap": "16px", justifyItems: "start", maxWidth: "60ch" } as React.CSSProperties}>
        <span className="eyebrow">Not found</span>
        <h1 className="title">That ticker has no tokenized form yet</h1>
        <p className="lede">
          None of the issuers we read lists a token for it. It may be spelled differently, or simply not be tokenized.
        </p>
        <Link href="/stocks" className="button primary">
          Search again
        </Link>
      </div>
    </main>
  );
}
