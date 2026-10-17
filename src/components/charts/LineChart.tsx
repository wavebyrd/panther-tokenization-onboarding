"use client";

import { useMemo, useState, type PointerEvent } from "react";
import { ticks } from "@/lib/format";
import { useWidth } from "./useSize";

export interface LineSeries {
  id: string;
  label: string;
  color: string;
  values: Array<number | null>;
  /** "context" draws the line thinner, as a reference the eye can pass over. */
  weight?: "main" | "context";
  /** Washes the area under the line; for a single series only. */
  fill?: boolean;
}

export interface Band {
  label: string;
  color: string;
  lower: number[];
  upper: number[];
  opacity: number;
}

const PAD = { top: 12, right: 12, bottom: 28, left: 8 };

/**
 * Lines over a shared x axis, with optional shaded ranges behind them. One
 * y axis, starting at zero unless told otherwise. Hovering or focusing reads
 * every series at the nearest point.
 */
export function LineChart({
  x,
  series,
  bands = [],
  height = 300,
  formatY,
  formatX = (value) => value,
  zeroBased = true,
  endLabels = false,
}: {
  x: string[];
  series: LineSeries[];
  bands?: Band[];
  height?: number;
  formatY: (value: number) => string;
  formatX?: (value: string) => string;
  zeroBased?: boolean;
  /** Writes each main series' last value at the line's end. */
  endLabels?: boolean;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const layout = useMemo(() => {
    const all: number[] = [];
    for (const item of series) for (const value of item.values) if (value !== null && Number.isFinite(value)) all.push(value);
    for (const band of bands) all.push(...band.lower, ...band.upper);
    const dataMin = all.length ? Math.min(...all) : 0;
    const dataMax = all.length ? Math.max(...all) : 1;
    const min = zeroBased ? Math.min(0, dataMin) : dataMin - (dataMax - dataMin) * 0.08;
    const max = dataMax + (dataMax - min) * 0.06 || 1;
    const yTicks = ticks(min, max, 4);
    const top = Math.max(max, yTicks[yTicks.length - 1] ?? max);

    // Room on the right for the widest tick label, which sits outside the plot.
    const widest = Math.max(...yTicks.map((value) => formatY(value).length), 3);
    const right = PAD.right + widest * 7 + 6;
    const plotWidth = Math.max(40, width - PAD.left - right);
    const plotHeight = height - PAD.top - PAD.bottom;
    const count = Math.max(1, x.length - 1);
    const px = (index: number) => PAD.left + (index / count) * plotWidth;
    const py = (value: number) => PAD.top + (1 - (value - min) / (top - min || 1)) * plotHeight;
    return { min, top, yTicks, plotWidth, plotHeight, px, py, right };
  }, [series, bands, width, height, x.length, zeroBased, formatY]);

  const { px, py, yTicks, plotWidth, plotHeight } = layout;

  const path = (values: Array<number | null>) => {
    let out = "";
    let drawing = false;
    values.forEach((value, index) => {
      if (value === null || !Number.isFinite(value)) {
        drawing = false;
        return;
      }
      out += `${drawing ? "L" : "M"}${px(index).toFixed(1)},${py(value).toFixed(1)}`;
      drawing = true;
    });
    return out;
  };

  const bandPath = (band: Band) => {
    const upper = band.upper.map((value, index) => `${index ? "L" : "M"}${px(index).toFixed(1)},${py(value).toFixed(1)}`).join("");
    const lower = band.lower
      .map((value, index) => `L${px(index).toFixed(1)},${py(value).toFixed(1)}`)
      .reverse()
      .join("");
    return `${upper}${lower}Z`;
  };

  // About one x label per 90px, always including the first and last.
  const xLabels = useMemo(() => {
    const room = Math.max(2, Math.floor(plotWidth / 90));
    const step = Math.max(1, Math.ceil((x.length - 1) / room));
    const picked: number[] = [];
    for (let index = 0; index < x.length; index += step) picked.push(index);
    const last = x.length - 1;
    if (picked[picked.length - 1] !== last) {
      // The last label is right-aligned, so it needs nearly a full step of room.
      if (last - picked[picked.length - 1] < step * 0.9) picked.pop();
      picked.push(last);
    }
    return picked;
  }, [x.length, plotWidth]);

  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - box.left - PAD.left) / plotWidth;
    setHover(Math.min(x.length - 1, Math.max(0, Math.round(ratio * (x.length - 1)))));
  };

  const onKey = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setHover((current) => {
      const from = current ?? x.length - 1;
      return Math.min(x.length - 1, Math.max(0, from + (event.key === "ArrowRight" ? 1 : -1)));
    });
  };

  const baseline = py(Math.max(layout.min, 0));
  const tipLeft = hover === null ? 0 : Math.min(width - 90, Math.max(90, px(hover)));

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
        {yTicks.map((value) => (
          <g key={value}>
            <line className="grid-line" x1={PAD.left} x2={PAD.left + plotWidth} y1={py(value)} y2={py(value)} />
            <text className="tick" x={PAD.left + plotWidth + 8} y={py(value)} dy="0.32em">
              {formatY(value)}
            </text>
          </g>
        ))}
        <line className="axis-line" x1={PAD.left} x2={PAD.left + plotWidth} y1={baseline} y2={baseline} />

        {bands.map((band) => (
          <path key={band.label} d={bandPath(band)} fill={band.color} opacity={band.opacity} />
        ))}

        {series.map((item) =>
          item.fill ? (
            <path
              key={`${item.id}-fill`}
              d={`${path(item.values)}L${px(item.values.length - 1).toFixed(1)},${baseline}L${px(0).toFixed(1)},${baseline}Z`}
              fill={item.color}
              opacity={0.1}
            />
          ) : null,
        )}

        {series.map((item) => (
          <path
            key={item.id}
            d={path(item.values)}
            fill="none"
            stroke={item.color}
            strokeWidth={item.weight === "context" ? 1.5 : 2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {endLabels
          ? series
              .filter((item) => item.weight !== "context")
              .map((item) => {
                const last = item.values[item.values.length - 1];
                if (last === null || !Number.isFinite(last)) return null;
                return (
                  <circle
                    key={`${item.id}-end`}
                    cx={px(item.values.length - 1)}
                    cy={py(last)}
                    r={4}
                    fill={item.color}
                    stroke="var(--surface)"
                    strokeWidth={2}
                  />
                );
              })
          : null}

        {xLabels.map((index) => (
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
          <g>
            <line className="crosshair" x1={px(hover)} x2={px(hover)} y1={PAD.top} y2={PAD.top + plotHeight} />
            {series.map((item) => {
              const value = item.values[hover];
              if (value === null || value === undefined || !Number.isFinite(value)) return null;
              return (
                <circle key={item.id} cx={px(hover)} cy={py(value)} r={4} fill={item.color} stroke="var(--surface)" strokeWidth={2} />
              );
            })}
          </g>
        ) : null}
      </svg>

      {hover !== null ? (
        <div className="chart-tip" style={{ left: tipLeft, top: 0 }} role="status">
          <div className="when">{formatX(x[hover])}</div>
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
          {bands.map((band) => (
            <div className="line" key={band.label}>
              <span className="key">
                <i style={{ "--c": band.color, opacity: 0.5 } as React.CSSProperties} />
                {band.label}
              </span>
              <b>
                {formatY(band.lower[hover])} – {formatY(band.upper[hover])}
              </b>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
