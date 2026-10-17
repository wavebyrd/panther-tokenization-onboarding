"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BRAND, NAV } from "@/lib/brand";
import { Icon, type IconName } from "./Icon";

const TAB_ICONS: Record<string, IconName> = {
  "/dollars": "dollar",
  "/earn": "sprout",
  "/stocks": "chart",
  "/plan": "compass",
};

type Theme = "light" | "dark";

function readTheme(): Theme {
  const stamped = document.documentElement.dataset.theme;
  if (stamped === "light" || stamped === "dark") return stamped;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function LogoMark() {
  return (
    <span className="logo-mark" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 20V9M12 20V4M19 20v-7M5 14l7-5M12 12l7 4" />
      </svg>
    </span>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  const toggleTheme = () => {
    const next: Theme = readTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // A blocked store only means the choice is not remembered.
    }
    setTheme(next);
  };

  const current = (href: string) => (pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined);

  return (
    <>
      <header className="site-header" data-scrolled={scrolled}>
        <div className="shell">
          <Link href="/" className="logo" aria-label={`${BRAND.name} home`}>
            <LogoMark />
            {BRAND.name}
          </Link>
          <nav className="nav" aria-label="Main">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} aria-current={current(item.href)}>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="header-end">
            <Link href="/developers" className="button ghost small" aria-current={current("/developers")}>
              <Icon name="code" size={16} />
              API
            </Link>
            <button
              type="button"
              className="icon-button"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            >
              <Icon name={theme === "dark" ? "sun" : "moon"} size={17} />
            </button>
          </div>
        </div>
      </header>
      <nav className="tabbar" aria-label="Main">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} aria-current={current(item.href)}>
            <Icon name={TAB_ICONS[item.href]} size={21} />
            {item.short}
          </Link>
        ))}
      </nav>
    </>
  );
}
