"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

export interface Segment<T extends string> {
  value: T;
  label: ReactNode;
  /** Shown as a small muted number after the label. */
  count?: number;
}

interface Props<T extends string> {
  /** Accessible name of the radio group. */
  label: string;
  options: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}

/** A radio group drawn as segments. Arrow keys, Home and End move and select (one tab stop). */
export default function SegmentedControl<T extends string>({ label, options, value, onChange, disabled, size = "md" }: Props<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const last = options.length - 1;
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? current === last ? 0 : current + 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? current === 0 ? last : current - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  const pad = size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm";

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onKeyDown={disabled ? undefined : onKey}
      className="inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-full bg-subtle p-0.5"
    >
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`focus-ring whitespace-nowrap rounded-full font-medium transition-colors duration-150 disabled:opacity-60 ${pad} ${
              checked ? "bg-surface text-accent ring-1 ring-line" : "text-muted hover:text-ink"
            }`}
          >
            {o.label}
            {o.count !== undefined && (
              <span className={`ml-1.5 tabular-nums ${checked ? "text-accent/70" : "text-muted/80"}`}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
