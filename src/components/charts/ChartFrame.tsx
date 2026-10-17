"use client";

import { useId, useState, type ReactNode } from "react";
import { Icon } from "../Icon";

export interface LegendItem {
  label: string;
  color: string;
  /** How the series is drawn, so the key mirrors the mark. */
  mark?: "line" | "box" | "band";
}

export interface TableView {
  columns: string[];
  rows: Array<Array<string | number>>;
}

/**
 * The frame every chart sits in: a title, a legend that names each series in
 * text, and a switch to the same numbers as a table, so nothing is readable
 * only by colour or only by hovering.
 */
export function ChartFrame({
  title,
  subtitle,
  legend,
  table,
  children,
}: {
  title: string;
  subtitle?: string;
  legend?: LegendItem[];
  table?: TableView;
  children: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  const headingId = useId();

  return (
    <figure className="stack" style={{ "--gap": "14px" } as React.CSSProperties} aria-labelledby={headingId}>
      <div className="row between" style={{ alignItems: "start" }}>
        <figcaption>
          <h3 id={headingId} className="subheading">
            {title}
          </h3>
          {subtitle ? <p className="small muted">{subtitle}</p> : null}
        </figcaption>
        {table ? (
          <button type="button" className="chip small" aria-pressed={asTable} onClick={() => setAsTable((value) => !value)}>
            <Icon name={asTable ? "chart" : "table"} size={15} />
            {asTable ? "Chart" : "Table"}
          </button>
        ) : null}
      </div>

      {legend && legend.length > 1 && !asTable ? (
        <div className="legend">
          {legend.map((item) => (
            <span key={item.label}>
              <i className={item.mark === "box" ? "box" : item.mark === "band" ? "band" : undefined} style={{ "--c": item.color } as React.CSSProperties} />
              {item.label}
            </span>
          ))}
        </div>
      ) : null}

      {asTable && table ? (
        <div className="table-wrap" style={{ maxHeight: 360, overflowY: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                {table.columns.map((column, index) => (
                  <th key={column} className={index > 0 ? "end" : undefined}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, index) => (
                    <td key={index} className={index > 0 ? "end" : undefined}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </figure>
  );
}
