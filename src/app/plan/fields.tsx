"use client";

import { useId } from "react";

/** A dollar amount. */
export function MoneyField({
  label,
  value,
  onChange,
  hint,
  step = 100,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: string;
  step?: number;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-wrap">
        <span className="affix">$</span>
        <input
          id={id}
          className="input has-prefix num"
          type="number"
          inputMode="decimal"
          min={0}
          step={step}
          value={Number.isFinite(value) ? value : ""}
          onChange={(event) => onChange(Math.max(0, Number(event.target.value)))}
        />
      </div>
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

/** A percentage typed as a whole number, held as a fraction. */
export function PercentField({
  label,
  value,
  onChange,
  hint,
  min = 0,
  max = 100,
  step = 0.5,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-wrap">
        <input
          id={id}
          className="input has-suffix num"
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(value) ? Number((value * 100).toFixed(2)) : ""}
          onChange={(event) => onChange(Math.min(max, Math.max(min, Number(event.target.value))) / 100)}
        />
        <span className="affix end">%</span>
      </div>
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

/** A slider with its value written beside the label. */
export function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format,
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  format: (value: number) => string;
  hint?: string;
}) {
  const id = useId();
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div className="field">
      <div className="row between">
        <label htmlFor={id} style={{ fontSize: "0.875rem", fontWeight: 600 }}>
          {label}
        </label>
        <output htmlFor={id} className="num" style={{ fontWeight: 650 }}>
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        className="range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ "--fill": `${fill}%` } as React.CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}
