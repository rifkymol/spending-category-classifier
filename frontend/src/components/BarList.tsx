import type { ReactNode } from "react";

export interface BarItem {
  key: string;
  label: ReactNode;
  value: number;
  /** The figure shown on the right (e.g. a Rupiah amount). */
  display: string;
  /** A muted second line under the label. */
  sub?: string;
  /** Dot and bar color; no dot is drawn without one. */
  color?: string;
}

interface Props {
  items: BarItem[];
  /** Key of the highlighted row (others dim), e.g. while a chart slice is hovered. */
  activeKey?: string | null;
  /** Hover and keyboard focus enter (key) or leave (null) a row. */
  onActive?: (key: string | null) => void;
  /** A click or tap on a row. */
  onTap?: (key: string) => void;
  className?: string;
}

/** Ranked rows: dot, name, figure (tabular numbers) and a thin bar proportional to the largest value. */
export default function BarList({ items, activeKey = null, onActive, onTap, className = "" }: Props) {
  const max = Math.max(...items.map((i) => i.value), 0);
  return (
    <ol className={`space-y-3 ${className}`}>
      {items.map((item) => {
        const dim = activeKey !== null && activeKey !== item.key;
        return (
          <li
            key={item.key}
            tabIndex={onActive ? 0 : undefined}
            onMouseEnter={onActive && (() => onActive(item.key))}
            onMouseLeave={onActive && (() => onActive(null))}
            onFocus={onActive && (() => onActive(item.key))}
            onBlur={onActive && (() => onActive(null))}
            onClick={onTap && (() => onTap(item.key))}
            className={`rounded-sm transition-opacity duration-150 ${onActive ? "focus-ring" : ""} ${dim ? "opacity-45" : ""}`}
          >
            <div className="flex items-baseline gap-2 text-sm">
              {item.color && (
                <span aria-hidden="true" className="h-2 w-2 shrink-0 self-center rounded-full" style={{ background: item.color }} />
              )}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              <span className="shrink-0 font-medium tabular-nums">{item.display}</span>
            </div>
            {item.sub && <p className={`mt-0.5 text-xs tabular-nums text-muted ${item.color ? "pl-4" : ""}`}>{item.sub}</p>}
            <div aria-hidden="true" className={`mt-1.5 h-1 overflow-hidden rounded-full bg-subtle ${item.color ? "ml-4" : ""}`}>
              <div
                className="h-full rounded-full"
                style={{ width: `${max > 0 ? (item.value / max) * 100 : 0}%`, background: item.color ?? "var(--color-muted)" }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
