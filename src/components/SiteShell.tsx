"use client";

// The Panther Terminal workspace frame: a sidebar with the brand and the
// sections, a thin top bar with the breadcrumb, and the page beside it. Same
// structure and classes as the tokenization tabs on pantherterminal.com.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { BRAND, NAV } from "@/lib/brand";

const ICONS: Record<string, string> = {
  "/portfolio": "◈",
  "/dollars": "$",
  "/earn": "⌁",
  "/stocks": "▤",
  "/plan": "◷",
};

export function Brand() {
  return (
    <Link className="brand" href="/portfolio" aria-label={`${BRAND.name} home`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/panther-mark.webp" alt="" width={36} height={36} />
      <span>
        PANTHER<span className="brand-sub">ONBOARDING</span>
      </span>
    </Link>
  );
}

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = (href: string) => (pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined);
  const section = [...NAV, { href: "/developers", label: "API" }, { href: "/method", label: "Method" }].find(
    (item) => current(item.href),
  );

  return (
    <div className="workspace">
      <aside className="sidebar" data-open={open}>
        <Brand />
        <button className="mobile-toggle" type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
          Menu {open ? "−" : "+"}
        </button>
        <div className="sidebar-body">
          <p className="nav-caption">ONBOARDING</p>
          <nav aria-label="Main navigation">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} aria-current={current(item.href)} onClick={() => setOpen(false)}>
                <span className="nav-icon" aria-hidden>
                  {ICONS[item.href] ?? "·"}
                </span>
                {item.label}
              </Link>
            ))}
          </nav>
          <p className="nav-caption">BUILD ON IT</p>
          <nav aria-label="Developers">
            <Link href="/developers" aria-current={current("/developers")} onClick={() => setOpen(false)}>
              <span className="nav-icon" aria-hidden>
                {"{}"}
              </span>
              API
            </Link>
            <Link href="/method" aria-current={current("/method")} onClick={() => setOpen(false)}>
              <span className="nav-icon" aria-hidden>
                ≡
              </span>
              How we choose
            </Link>
            <a href="https://github.com/wavebyrd/panther-tokenization-onboarding" target="_blank" rel="noreferrer">
              <span className="nav-icon" aria-hidden>
                ⌥
              </span>
              Source<span className="nav-arrow">↗</span>
            </a>
          </nav>
          <div className="sidebar-bottom">
            <span className="nav-caption">PART OF PANTHER TERMINAL</span>
            <p>Real assets. On-chain intelligence.</p>
            <a href="https://pantherterminal.com/tokenization">Tokenization data ↗</a>
            <span className="version">EDUCATIONAL · NOT ADVICE</span>
          </div>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="workspace-top">
          <span>
            Tokenization <span className="breadcrumb">/</span> Onboarding <span className="breadcrumb">/</span>{" "}
            <strong>{section?.label ?? "Home"}</strong>
          </span>
          <span className="system-label">
            <i /> LIVE QUOTES · READ ONLY
          </span>
        </header>
        {children}
      </div>
    </div>
  );
}
