import { ago, clock } from "@/lib/format";

export interface SourceStamp {
  name: string;
  fetchedAt: number;
  stale: boolean;
}

/** Where the page's figures came from and when, at the foot of every data page. */
export function SourceLine({ sources, note }: { sources: SourceStamp[]; note?: string }) {
  if (!sources.length && !note) return null;
  return (
    <p className="tiny faint" style={{ marginTop: 40 }}>
      {sources.map((source, index) => (
        <span key={source.name}>
          {index === 0 ? "Data from " : index === sources.length - 1 ? " and " : ", "}
          {source.name}, read {ago(source.fetchedAt)} ({clock(source.fetchedAt)})
          {source.stale ? ", refreshing" : ""}
        </span>
      ))}
      {sources.length ? ". " : ""}
      {note}
    </p>
  );
}
