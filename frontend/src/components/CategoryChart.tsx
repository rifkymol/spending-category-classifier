"use client";

import { useEffect, useRef, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import BarList from "./BarList";
import { colorFor, formatIDR } from "@/lib/format";
import { useLocale } from "@/lib/i18n";
import type { Summary } from "@/lib/types";

interface Props {
  summary: Summary;
  byAmount: boolean;
}

const tooltipStyle = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-line)",
  borderRadius: 10,
  boxShadow: "var(--shadow-pop)",
  color: "var(--color-ink)",
  fontSize: 13,
  padding: "6px 10px",
};

/** A slim donut with a center label, next to a ranked bar list that doubles as the legend. */
export default function CategoryChart({ summary, byAmount }: Props) {
  const { t, tc, percent, category } = useLocale();
  const [active, setActive] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // How the user last interacted: touch taps toggle the highlight; mouse hover and keyboard focus
  // set it and clear it on leave/blur. Taps also emulate mouseenter, which is ignored for touch.
  const pointer = useRef<string>("mouse");
  const hover = (key: string | null) => {
    if (pointer.current !== "touch") setActive(key);
  };
  const tap = (key: string) => {
    if (pointer.current === "touch") setActive((current) => (current === key ? null : key));
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
  const center = data.find((d) => d.name === active) ?? data[0];

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
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setActive(null);
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
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
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
              onMouseEnter={(_, i) => hover(data[i]?.name ?? null)}
              onMouseLeave={() => hover(null)}
              onClick={(_, i) => data[i] && tap(data[i].name)}
            >
              {data.map((d) => (
                <Cell key={d.name} fill={colorFor(d.name)} fillOpacity={active === null || active === d.name ? 1 : 0.35} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle}
              itemStyle={{ color: "var(--color-ink)", padding: 0 }}
              formatter={(value, name, item) => {
                const share = percent((item?.payload as { share: number }).share);
                const shown = byAmount ? formatIDR(Number(value)) : tc("chart.transactions", Number(value));
                return [`${shown} (${share})`, category(String(name))];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <figcaption
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
        >
          <span className="text-3xl font-semibold tabular-nums tracking-tight">{percent(center.share)}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: colorFor(center.name) }} />
            {category(center.name)}
          </span>
        </figcaption>
      </figure>
      <BarList items={items} activeKey={active} onActive={hover} onTap={tap} />
    </div>
  );
}
