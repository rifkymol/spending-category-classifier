"use client";

import { useEffect, useRef, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import BarList from "./BarList";
import { colorFor, formatIDR } from "@/lib/format";
import { useLocale } from "@/lib/i18n";
import type { Summary } from "@/lib/types";

/** Prefix of the class that names each slice's category (e.g. "slice-food"). */
const SLICE_CLASS = "slice-";

interface Props {
  summary: Summary;
  byAmount: boolean;
  /** Opens the details of a category; `opener` is the list row to return focus to. */
  onOpen: (category: string, opener: HTMLElement | null) => void;
}

/**
 * A slim donut next to a ranked bar list that doubles as the legend. Hovering a slice (or hovering or
 * focusing its list row) highlights it and the center shows that category; otherwise the center
 * shows the total spend. No floating tooltip. Clicking or tapping a slice or a row opens that
 * category's details; the list rows are the keyboard path.
 */
export default function CategoryChart({ summary, byAmount, onOpen }: Props) {
  const { t, tc, number, percent, compactIDR, category } = useLocale();
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);
  // How the user last interacted. Taps also emulate mouseenter, which is ignored for touch, so a
  // tap opens the details in one go instead of leaving a sticky highlight behind.
  const pointer = useRef<string>("mouse");
  const hover = (key: string | null) => {
    if (pointer.current !== "touch") setActive(key);
  };

  // A tap or click anywhere outside the chart and its list clears the highlight.
  useEffect(() => {
    if (active === null) return;
    const onDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setActive(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [active]);
  const data = summary.by_category
    .filter((c) => (byAmount ? c.total_amount > 0 : c.count > 0))
    .map((c) => ({ name: c.category, value: byAmount ? c.total_amount : c.count, share: c.share }))
    .sort((a, b) => b.value - a.value);

  const ranked = [...summary.by_category].sort((a, b) =>
    byAmount ? b.total_amount - a.total_amount || b.count - a.count : b.count - a.count,
  );
  const items = ranked.map((c) => ({
    key: c.category,
    label: category(c.category),
    value: byAmount ? c.total_amount : c.count,
    display: byAmount ? formatIDR(c.total_amount) : `${c.count}`,
    sub: `${tc("chart.transactions", c.count)} · ${percent(c.share)}`,
    color: colorFor(c.category),
  }));

  if (data.length === 0) return <p className="mt-4 text-sm text-muted">{t("chart.empty")}</p>;

  const description = data.map((d) => `${category(d.name)} ${percent(d.share)}`).join(", ");
  const spendCount = summary.by_category.reduce((sum, c) => sum + c.count, 0);
  const highlighted = data.find((d) => d.name === active) ?? null;
  // A slice click returns focus to the matching list row when the details close.
  const rowFor = (key: string) =>
    listRef.current?.querySelector<HTMLElement>(`button[data-key="${CSS.escape(key)}"]`) ?? null;

  return (
    <div
      ref={containerRef}
      onPointerDownCapture={(e) => {
        pointer.current = e.pointerType;
      }}
      onKeyDownCapture={() => {
        pointer.current = "keyboard";
      }}
      onPointerLeave={(e) => {
        // A lifted finger also "leaves"; only a mouse or pen moving away clears the highlight.
        if (e.pointerType !== "touch") setActive(null);
      }}
      className="mt-6 grid items-center gap-8 sm:grid-cols-[minmax(0,15rem)_1fr] sm:gap-12"
    >
      <figure
        className="relative mx-auto aspect-square w-full max-w-60"
        role="img"
        aria-label={t("chart.aria", { description })}
        onPointerLeave={(e) => {
          // Recharts may miss the slice's mouseleave on a fast exit; leaving the donut clears it too.
          if (e.pointerType !== "touch") setActive(null);
        }}
        onClick={(e) => {
          // Handled here rather than on <Pie>: Recharts re-mounts a hovered slice as its "active
          // shape", so a quick hover-and-click can press one node and release on another, and the
          // click then lands on the pie layer. The clicked slice's class, else the hovered slice, wins.
          const slice = (e.target as Element).closest?.(`[class*="${SLICE_CLASS}"]`);
          const named = slice ? [...slice.classList].find((c) => c.startsWith(SLICE_CLASS)) : undefined;
          const key = named ? named.slice(SLICE_CLASS.length) : (e.target as Element).closest?.(".recharts-pie") ? active : null;
          if (key && data.some((d) => d.name === key)) onOpen(key, rowFor(key));
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart accessibilityLayer={false}>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="76%"
              outerRadius="96%"
              paddingAngle={data.length > 1 ? 2 : 0}
              cornerRadius={3}
              stroke="none"
              isAnimationActive={false}
              rootTabIndex={-1}
              onMouseEnter={(_, i) => hover(data[i]?.name ?? null)}
              onMouseLeave={() => hover(null)}
            >
              {data.map((d) => (
                <Cell
                  key={d.name}
                  className={`${SLICE_CLASS}${d.name}`}
                  fill={colorFor(d.name)}
                  fillOpacity={active === null || active === d.name ? 1 : 0.35}
                  style={{ cursor: "pointer", outline: "none", transition: "fill-opacity 150ms" }}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <figcaption
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center"
        >
          {highlighted ? (
            <>
              <span className="text-3xl font-semibold tabular-nums tracking-tight">{percent(highlighted.share)}</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
                <span className="h-2 w-2 rounded-full" style={{ background: colorFor(highlighted.name) }} />
                {category(highlighted.name)}
              </span>
            </>
          ) : (
            <>
              <span className="text-xs text-muted">{byAmount ? t("chart.total") : t("results.transactions")}</span>
              <span className="mt-0.5 text-3xl font-semibold tabular-nums tracking-tight">
                {byAmount ? compactIDR(summary.total_amount) : number(spendCount)}
              </span>
              {byAmount && <span className="mt-0.5 text-xs tabular-nums text-muted">{formatIDR(summary.total_amount)}</span>}
            </>
          )}
        </figcaption>
      </figure>
      <div ref={listRef}>
        <BarList
          items={items}
          onSelect={(key, button) => onOpen(key, button)}
          popup="dialog"
          activeKey={active}
          onActive={hover}
        />
      </div>
    </div>
  );
}
