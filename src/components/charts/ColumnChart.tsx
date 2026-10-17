"use client";

import { useState } from "react";
import { ticks } from "@/lib/format";
import { useWidth } from "./useSize";

export interface ColumnSeries {
  id: string;
  label: string;
  color: string;
  values: Array<number | null>;
}

const PAD = { top: 12, right: 48, bottom: 28, left: 8 };
const MAX_BAR = 22;
const GAP = 2;

/** Columns rising from, or falling below, a zero line. One or two series per category. */
export function ColumnChart({
  x,
  series,
  height = 260,
  formatY,
  notes = {},
}: {
  x: string[];
  series: ColumnSeries[];
  height?: number;
  formatY: (value: number) => string;
  /** A short remark per category, shown in its tooltip. */
  notes?: Record<string, string>;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const all = series.flatMap((item) => item.values.filter((value): value is number => value !== null));
  const min = Math.min(0, ...all);
  const max = Math.max(0, ...all);
  const span = max - min || 1;
  const yTicks = ticks(min - span * 0.05, max + span * 0.05, 4);
  const low = Math.min(min, yTicks[0] ?? min);
  const high = Math.max(max, yTicks[yTicks.length - 1] ?? max);

  const plotWidth = Math.max(40, width - PAD.left - PAD.right);
  const plotHeight = height - PAD.top - PAD.bottom;
  const band = plotWidth / Math.max(1, x.length);
  const bar = Math.max(3, Math.min(MAX_BAR, (band - 8 - GAP * (series.length - 1)) / series.length));
  const group = bar * series.length + GAP * (series.length - 1);
  const py = (value: number) => PAD.top + (1 - (value - low) / (high - low || 1)) * plotHeight;
  const zero = py(0);

  // Rounded at the data end, square where the column meets the zero line.
  const column = (left: number, value: number) => {
    const top = Math.min(py(value), zero);
    const size = Math.abs(py(value) - zero);
    const r = Math.min(4, size, bar / 2);
    const right = left + bar;
    if (size < 0.5) return `M${left},${zero - 0.5}h${bar}v1h${-bar}Z`;
    return value >= 0
      ? `M${left},${zero}V${top + r}Q${left},${top} ${left + r},${top}H${right - r}Q${right},${top} ${right},${top + r}V${zero}Z`
      : `M${left},${zero}V${top + size - r}Q${left},${top + size} ${left + r},${top + size}H${right - r}Q${right},${top + size} ${right},${top + size - r}V${zero}Z`;
  };

  const every = Math.max(1, Math.ceil(x.length / Math.max(2, Math.floor(plotWidth / 56))));

  // Not measured yet: hold the space, draw nothing.
  if (!width) return <div className="chart" ref={ref} style={{ height }} />;

  return (
    <div className="chart" ref={ref}>
      <svg height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Column chart">
        {yTicks.map((value) => (
          <g key={value}>
            <line className="grid-line" x1={PAD.left} x2={PAD.left + plotWidth} y1={py(value)} y2={py(value)} />
            <text className="tick" x={PAD.left + plotWidth + 8} y={py(value)} dy="0.32em">
              {formatY(value)}
            </text>
          </g>
        ))}
        <line className="axis-line" x1={PAD.left} x2={PAD.left + plotWidth} y1={zero} y2={zero} />

        {x.map((label, index) => {
          const start = PAD.left + band * index + (band - group) / 2;
          return (
            <g key={label} opacity={hover === null || hover === index ? 1 : 0.45}>
              {series.map((item, order) => {
                const value = item.values[index];
                if (value === null || value === undefined) return null;
                return <path key={item.id} d={column(start + order * (bar + GAP), value)} fill={item.color} />;
              })}
              {index % every === 0 ? (
                <text className="tick" x={PAD.left + band * index + band / 2} y={height - 8} textAnchor="middle">
                  {label}
                </text>
              ) : null}
              {/* The whole band is the target, not just the painted column. */}
              <rect
                x={PAD.left + band * index}
                y={PAD.top}
                width={band}
                height={plotHeight}
                fill="transparent"
                tabIndex={0}
                aria-label={`${label}: ${series
                  .map((item) => `${item.label} ${item.values[index] === null ? "no data" : formatY(item.values[index]!)}`)
                  .join(", ")}`}
                onPointerEnter={() => setHover(index)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(index)}
                onBlur={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>

      {hover !== null ? (
        <div
          className="chart-tip"
          style={{ left: Math.min(width - 90, Math.max(90, PAD.left + band * hover + band / 2)), top: 0 }}
          role="status"
        >
          <div className="when">
            {x[hover]}
            {notes[x[hover]] ? ` · ${notes[x[hover]]}` : ""}
          </div>
          {series.map((item) => {
            const value = item.values[hover];
            if (value === null || value === undefined) return null;
            return (
              <div className="line" key={item.id}>
                <span className="key">
                  <i style={{ "--c": item.color } as React.CSSProperties} />
                  {item.label}
                </span>
                <b>{formatY(value)}</b>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
