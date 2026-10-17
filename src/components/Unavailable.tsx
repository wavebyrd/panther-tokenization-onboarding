import { Icon } from "./Icon";

/** Shown in place of a section whose source could not be read. */
export function Unavailable({ what, detail }: { what: string; detail?: string }) {
  return (
    <div className="card" role="status">
      <div className="stack" style={{ "--gap": "10px", justifyItems: "start" } as React.CSSProperties}>
        <span className="pill caution">
          <Icon name="alert" size={15} />
          Not available right now
        </span>
        <h2 className="heading">{what} could not be read</h2>
        <p className="muted" style={{ maxWidth: "56ch" }}>
          {detail ?? "The source this comes from did not answer. Nothing is shown rather than something out of date. Reload the page in a minute."}
        </p>
      </div>
    </div>
  );
}
