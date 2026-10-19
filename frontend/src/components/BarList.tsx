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
  /** Makes every row a button; called with the row's key and the button (to return focus to it). */
  onSelect?: (key: string, button: HTMLButtonElement) => void;
  /** With onSelect: what a row button opens, for assistive tech (e.g. "dialog"). */
  popup?: "dialog";
  /** Key of the highlighted row (others dim), e.g. while a chart slice is hovered. */
  activeKey?: string | null;
  /** Hover and keyboard focus enter (key) or leave (null) a row. */
  onActive?: (key: string | null) => void;
  className?: string;
}

function Row({ item, max }: { item: BarItem; max: number }) {
  return (
    <>
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
    </>
  );
}

/** Ranked rows: dot, name, figure (tabular numbers) and a thin bar proportional to the largest value. */
export default function BarList({ items, onSelect, popup, activeKey = null, onActive, className = "" }: Props) {
  const max = Math.max(...items.map((i) => i.value), 0);
  return (
    <ol className={`${onSelect ? "space-y-1" : "space-y-3"} ${className}`}>
      {items.map((item) => (
        <li
          key={item.key}
          onMouseEnter={onActive && (() => onActive(item.key))}
          onMouseLeave={onActive && (() => onActive(null))}
          onFocus={onActive && (() => onActive(item.key))}
          onBlur={onActive && (() => onActive(null))}
          className={`transition-opacity duration-150 ${activeKey !== null && activeKey !== item.key ? "opacity-45" : ""}`}
        >
          {onSelect ? (
            <button
              type="button"
              data-key={item.key}
              aria-haspopup={popup}
              onClick={(e) => onSelect(item.key, e.currentTarget)}
              className="focus-ring -mx-2 block w-[calc(100%+1rem)] rounded-md px-2 py-1.5 text-left transition-colors duration-150 hover:bg-subtle"
            >
              <Row item={item} max={max} />
            </button>
          ) : (
            <Row item={item} max={max} />
          )}
        </li>
      ))}
    </ol>
  );
}
