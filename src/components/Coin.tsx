// A round badge for a coin, chain or company: its initials on a quiet tint.
// No third-party logos are loaded, so nothing here depends on another site.

const TINTS = [
  ["#e2f3e7", "#0a5c30"],
  ["#e5eefa", "#1a4f93"],
  ["#fdf1d3", "#7a4f00"],
  ["#f3e8fb", "#5d2a8c"],
  ["#fde7e0", "#9a3412"],
  ["#e0f4f4", "#0f5f63"],
  ["#eceae2", "#3d463f"],
] as const;

function tint(label: string) {
  let hash = 0;
  for (const char of label) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length];
}

function initials(label: string) {
  const clean = label.replace(/[^A-Za-z0-9 ]/g, "").trim();
  if (clean.length <= 4 && !clean.includes(" ")) return clean.toUpperCase();
  const words = clean.split(/\s+/);
  return (words.length > 1 ? words[0][0] + words[1][0] : clean.slice(0, 2)).toUpperCase();
}

export function Coin({ label, size = 40 }: { label: string; size?: number }) {
  const [background, color] = tint(label);
  const text = initials(label);
  return (
    <span
      className="coin"
      aria-hidden="true"
      style={
        {
          "--size": `${size}px`,
          background,
          color,
          boxShadow: "none",
          fontSize: size * (text.length > 3 ? 0.26 : text.length > 2 ? 0.3 : 0.36),
        } as React.CSSProperties
      }
    >
      {text}
    </span>
  );
}
