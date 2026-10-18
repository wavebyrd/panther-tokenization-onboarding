import Link from "next/link";
import { DISCLAIMER } from "@/lib/brand";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell stack" style={{ "--gap": "8px" } as React.CSSProperties}>
        <nav className="footer-links row" style={{ gap: 18, flexWrap: "wrap" }} aria-label="Footer">
          <span>Panther Onboarding</span>
          <Link href="/developers">API</Link>
          <Link href="/method">How we choose</Link>
          <a href="https://pantherterminal.com/tokenization">Panther Terminal ↗</a>
        </nav>
        <p style={{ maxWidth: "110ch" }}>{DISCLAIMER}</p>
      </div>
    </footer>
  );
}
