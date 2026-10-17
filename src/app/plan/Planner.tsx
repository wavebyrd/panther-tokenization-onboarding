"use client";

import { useState } from "react";
import { Backtest } from "./Backtest";
import { GlidePath } from "./GlidePath";

type Tool = "glide" | "backtest";

export function Planner({
  initialTool,
  stableReturn,
  stableReturnBasis,
}: {
  initialTool: Tool;
  stableReturn: number | null;
  stableReturnBasis: string;
}) {
  const [tool, setTool] = useState<Tool>(initialTool);
  return (
    <div className="stack" style={{ "--gap": "28px" } as React.CSSProperties}>
      <div className="segmented" role="tablist" aria-label="Planning tool" style={{ justifySelf: "start" }}>
        <button type="button" role="tab" aria-selected={tool === "glide"} onClick={() => setTool("glide")}>
          Glide path
        </button>
        <button type="button" role="tab" aria-selected={tool === "backtest"} onClick={() => setTool("backtest")}>
          Backtest
        </button>
      </div>
      {/* Both stay mounted so switching tabs keeps what was entered. */}
      <div role="tabpanel" hidden={tool !== "glide"}>
        <GlidePath stableReturn={stableReturn} stableReturnBasis={stableReturnBasis} visible={tool === "glide"} />
      </div>
      <div role="tabpanel" hidden={tool !== "backtest"}>
        <Backtest stableReturn={stableReturn} visible={tool === "backtest"} />
      </div>
    </div>
  );
}
