import type { ReactNode } from "react";

interface Props {
  label: string;
  value: ReactNode;
  note?: string;
  tone?: "default" | "warn";
}

/** A small muted label over a value. Use inside a <dl>. */
export default function Stat({ label, value, note, tone = "default" }: Props) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-0.5 text-base font-semibold tabular-nums tracking-tight ${tone === "warn" ? "text-warn" : "text-ink"}`}>
        {value}
      </dd>
      {note && <dd className="mt-0.5 text-xs text-muted">{note}</dd>}
    </div>
  );
}
