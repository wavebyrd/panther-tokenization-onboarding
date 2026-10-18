// The embeddable portfolio builder. Runs entirely in the browser: the plan is
// computed locally, fills are quoted straight from the swap aggregators, and
// catalogs and fund data come from Panther Terminal's public API.
//
// Framed by a host page, it reports its height so the frame can grow with it:
//   window.addEventListener("message", (e) => {
//     if (e.data?.type === "panther-onboarding:height") frame.style.height = `${e.data.height}px`;
//   });
//
// A host can pass settings before loading it (only values safe to make public):
//   window.PANTHER_ONBOARDING = { pantherApi, jupiterApiKey, kyberClientId, rpc: { ethereum: [...] } }
// or, when framed, as query parameters: ?api=https://api.pantherterminal.com

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/app/globals.css";
import "@/app/panther.css";
import { PortfolioBuilder } from "@/app/portfolio/PortfolioBuilder";
import "./widget.css";

const params = new URLSearchParams(location.search);
const api = params.get("api");
if (api && /^https:\/\//.test(api)) {
  const host = window as unknown as { PANTHER_ONBOARDING?: Record<string, unknown> };
  host.PANTHER_ONBOARDING = { ...(host.PANTHER_ONBOARDING ?? {}), pantherApi: api };
}

function Widget() {
  return (
    <main className="pto-widget">
      <PortfolioBuilder engine="browser" />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Widget />
  </StrictMode>,
);

// Tell a framing page how tall the content is, whenever it changes.
// Reported on resize, on any change to the content (results arriving), and on a
// slow timer as a backstop for browsers that pause observers in hidden frames.
if (window.parent !== window) {
  let last = 0;
  const report = () => {
    const root = document.getElementById("root");
    const height = Math.ceil(root ? root.getBoundingClientRect().height : document.body.scrollHeight);
    if (Math.abs(height - last) < 2) return;
    last = height;
    window.parent.postMessage({ type: "panther-onboarding:height", height }, "*");
  };
  new ResizeObserver(report).observe(document.body);
  new MutationObserver(report).observe(document.body, { childList: true, subtree: true, attributes: true });
  window.addEventListener("load", report);
  setInterval(report, 1_000);
  report();
}
