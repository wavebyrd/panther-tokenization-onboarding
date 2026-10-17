import Link from "next/link";

export default function NotFound() {
  return (
    <main className="shell page">
      <div className="stack" style={{ "--gap": "16px", justifyItems: "start", maxWidth: "60ch" } as React.CSSProperties}>
        <span className="eyebrow">Not found</span>
        <h1 className="title">There is nothing at this address</h1>
        <p className="lede">The page may have moved, or the link may be mistyped.</p>
        <Link href="/" className="button primary">
          Back to the start
        </Link>
      </div>
    </main>
  );
}
