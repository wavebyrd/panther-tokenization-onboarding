import Link from "next/link";
import { BRAND, DISCLAIMER, NAV } from "@/lib/brand";
import { LogoMark } from "./SiteHeader";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell">
        <div className="row between">
          <span className="logo">
            <LogoMark />
            {BRAND.name}
          </span>
          <nav className="footer-links" aria-label="Footer">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
            <Link href="/developers">API</Link>
            <Link href="/method">How we choose</Link>
          </nav>
        </div>
        <p className="small" style={{ maxWidth: "88ch" }}>
          {DISCLAIMER}
        </p>
      </div>
    </footer>
  );
}
