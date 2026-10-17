"use client";

import { useState, type PointerEvent } from "react";
import { percent } from "@/lib/format";
import { useWidth } from "./useSize";

export interface ShareSeries {
  id: string;
  label: string;
  color: string;
  /** Share of the whole at each step, 0..1. The series together add to 1. */
  values: number[];
}

const PAD = { top: 8, right: 44, bottom: 28, left: 8 };
const GAP = 2;

/** How a whole divides between parts over time, as stacked areas parted by a gap of surface. */
export function ShareChart({
  x,
  series,
  height = 220,
  formatX = (value) => value,
}: {
  x: string[];
  series: ShareSeries[];
  height?: number;
  formatX?: (value: string) => string;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const plotWidth = Math.max(40, width - PAD.left - PAD.right);
  const plotHeight = height - PAD.top - PAD.bottom;
  const count = Math.max(1, x.length - 1);
  const px = (index: number) => PAD.left + (index / count) * plotWidth;
  const py = (share: number) => PAD.top + (1 - share) * plotHeight;

  // Each series sits on the running total of those before it.
  const floors = x.map(() => 0);
  const areas = series.map((item) => {
    const lower = [...floors];
    const upper = item.values.map((value, index) => (floors[index] += value));
    const top = upper.map((value, index) => `${index ? "L" : "M"}${px(index).toFixed(1)},${py(value).toFixed(1)}`).join("");
    const bottom = lower
      .map((value, index) => `L${px(index).toFixed(1)},${py(value).toFixed(1)}`)
      .reverse()
      .join("");
    return { item, d: `${top}${bottom}Z`, edge: top };
  });

  const room = Math.max(2, Math.floor(plotWidth / 90));
  const step = Math.max(1, Math.ceil((x.length - 1) / room));
  const labels = x.map((_, index) => index).filter((index) => index % step === 0 || index === x.length - 1);
  if (labels.length > 2 && labels[labels.length - 1] - labels[labels.length - 2] < step * 0.9) labels.splice(-2, 1);

  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - box.left - PAD.left) / plotWidth;
    setHover(Math.min(x.length - 1, Math.max(0, Math.round(ratio * (x.length - 1)))));
  };

  const onKey = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setHover((current) => {
      const from = current ?? 0;
      return Math.min(x.length - 1, Math.max(0, from + (event.key === "ArrowRight" ? 1 : -1)));
    });
  };

  // Not measured yet: hold the space, draw nothing.
  if (!width) return <div className="chart" ref={ref} style={{ height }} />;

  return (
    <div className="chart" ref={ref}>
      <svg
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Chart. Use the left and right arrow keys to read values."
        tabIndex={0}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKey}
        onBlur={() => setHover(null)}
        style={{ touchAction: "pan-y" }}
      >
        {areas.map(({ item, d }) => (
          <path key={item.id} d={d} fill={item.color} />
        ))}
        {/* The gap between neighbours, drawn in the surface colour. */}
        {areas.slice(0, -1).map(({ item, edge }) => (
          <path key={`${item.id}-gap`} d={edge} fill="none" stroke="var(--surface)" strokeWidth={GAP} />
        ))}

        {[0, 0.5, 1].map((share) => (
          <text key={share} className="tick" x={PAD.left + plotWidth + 8} y={py(share)} dy="0.32em">
            {percent(share, 0)}
          </text>
        ))}
        {labels.map((index) => (
          <text
            key={index}
            className="tick"
            x={px(index)}
            y={height - 8}
            textAnchor={index === 0 ? "start" : index === x.length - 1 ? "end" : "middle"}
          >
            {formatX(x[index])}
          </text>
        ))}

        {hover !== null ? (
          <line
            x1={px(hover)}
            x2={px(hover)}
            y1={PAD.top}
            y2={PAD.top + plotHeight}
            stroke="var(--surface)"
            strokeWidth={2}
          />
        ) : null}
      </svg>

      {hover !== null ? (
        <div className="chart-tip" style={{ left: Math.min(width - 90, Math.max(90, px(hover))), top: 0 }} role="status">
          <div className="when">{formatX(x[hover])}</div>
          {[...series].reverse().map((item) => (
            <div className="line" key={item.id}>
              <span className="key">
                <i style={{ "--c": item.color } as React.CSSProperties} />
                {item.label}
              </span>
              <b>{percent(item.values[hover], 0)}</b>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
