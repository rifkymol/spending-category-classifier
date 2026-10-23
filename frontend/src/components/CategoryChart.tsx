"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import BarList from "./BarList";
import { ChevronDownIcon } from "./icons";
import { GROUPS, OTHER_COLOR, colorFor, groupOf } from "@/lib/categories";
import { formatIDR } from "@/lib/format";
import { useLocale } from "@/lib/i18n";
import type { CategoryTotal, Summary } from "@/lib/types";

/** Prefix of the class that names each slice (e.g. "slice-groceries" or "slice-group-needs"). */
const SLICE_CLASS = "slice-";
/** Slice and row keys of whole groups; category keys never start with it. */
const GROUP_PREFIX = "group-";
/** Categories in no group (e.g. an old key) are collected under this pseudo-group. */
const OTHER_GROUP = "other";

interface Props {
  summary: Summary;
  byAmount: boolean;
  /** Opens the details of a category; `opener` is the list row to return focus to. */
  onOpen: (category: string, opener: HTMLElement | null) => void;
}

interface GroupTotal {
  key: string;
  label: string;
  color: string;
  value: number;
  count: number;
  share: number;
  categories: CategoryTotal[];
}

interface Slice {
  key: string;
  group: string;
  label: string;
  color: string;
  value: number;
  share: number;
}

/**
 * "Where it went", group first: a slim donut and a list of the three groups (Needs, Wants,
 * Transfers), each expandable to its categories, so twelve categories never crowd the view. An
 * expanded group's ring segment splits into its categories. Hovering a slice or a row (or focusing a
 * row) highlights it and the center shows its share; otherwise the center shows the total spend. No
 * floating tooltip. Clicking a group slice expands it; clicking a category slice or row opens that
 * category's details. The list rows are the keyboard path. Expanded groups are UI state only.
 */
export default function CategoryChart({ summary, byAmount, onOpen }: Props) {
  const { t, tc, number, percent, compactIDR, category, group } = useLocale();
  const baseId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  // How the user last interacted. Taps also emulate mouseenter, which is ignored for touch, so a
  // tap opens the details in one go instead of leaving a sticky highlight behind.
  const pointer = useRef<string>("mouse");
  const hover = (key: string | null) => {
    if (pointer.current !== "touch") setActive(key);
  };
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // A tap or click anywhere outside the chart and its list clears the highlight.
  useEffect(() => {
    if (active === null) return;
    const onDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setActive(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [active]);

  const valueOf = (c: CategoryTotal) => (byAmount ? c.total_amount : c.count);
  const shown = (c: CategoryTotal) => (byAmount ? c.total_amount > 0 : c.count > 0);
  const byValue = (a: CategoryTotal, b: CategoryTotal) => valueOf(b) - valueOf(a) || b.count - a.count;

  const groupList = [
    ...GROUPS.map((g) => ({ key: g.key, label: group(g.key), color: g.color })),
    { key: OTHER_GROUP, label: t("picker.other"), color: OTHER_COLOR },
  ];
  const groups: GroupTotal[] = groupList
    .map((g) => {
      const categories = summary.by_category
        .filter((c) => (groupOf(c.category) ?? OTHER_GROUP) === g.key && shown(c))
        .sort(byValue);
      return {
        ...g,
        categories,
        value: categories.reduce((sum, c) => sum + valueOf(c), 0),
        count: categories.reduce((sum, c) => sum + c.count, 0),
        share: categories.reduce((sum, c) => sum + c.share, 0),
      };
    })
    .filter((g) => g.categories.length > 0);

  if (groups.length === 0) return <p className="mt-4 text-sm text-muted">{t("chart.empty")}</p>;

  // The ring keeps the group order; an expanded group shows its categories in its place.
  const data: Slice[] = groups.flatMap((g) =>
    expanded.has(g.key)
      ? g.categories.map((c) => ({
          key: c.category,
          group: g.key,
          label: category(c.category),
          color: colorFor(c.category),
          value: valueOf(c),
          share: c.share,
        }))
      : [{ key: `${GROUP_PREFIX}${g.key}`, group: g.key, label: g.label, color: g.color, value: g.value, share: g.share }],
  );

  const activeGroup = active?.startsWith(GROUP_PREFIX) ? active.slice(GROUP_PREFIX.length) : null;
  const lit = (slice: Slice) => active === null || active === slice.key || activeGroup === slice.group;
  const highlighted =
    (activeGroup ? groups.find((g) => g.key === activeGroup) : null) ??
    data.find((d) => d.key === active) ??
    null;

  const description = groups.map((g) => `${g.label} ${percent(g.share)}`).join(", ");
  const spendCount = summary.by_category.reduce((sum, c) => sum + c.count, 0);
  const groupMax = Math.max(...groups.map((g) => g.value), 0);
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
      className="mt-6 grid items-start gap-8 sm:grid-cols-[minmax(0,15rem)_1fr] sm:gap-12"
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
          if (!key || !data.some((d) => d.key === key)) return;
          if (key.startsWith(GROUP_PREFIX)) toggle(key.slice(GROUP_PREFIX.length));
          else onOpen(key, rowFor(key));
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart accessibilityLayer={false}>
            <Pie
              data={data}
              dataKey="value"
              nameKey="key"
              innerRadius="76%"
              outerRadius="96%"
              paddingAngle={data.length > 1 ? 2 : 0}
              cornerRadius={3}
              stroke="none"
              isAnimationActive={false}
              rootTabIndex={-1}
              onMouseEnter={(_, i) => hover(data[i]?.key ?? null)}
              onMouseLeave={() => hover(null)}
            >
              {data.map((d) => (
                <Cell
                  key={d.key}
                  className={`${SLICE_CLASS}${d.key}`}
                  fill={d.color}
                  fillOpacity={lit(d) ? 1 : 0.35}
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
              <span className="mt-0.5 flex items-center gap-1.5 text-sm leading-snug text-muted">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: highlighted.color }} />
                {highlighted.label}
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
        <ul className="space-y-1">
          {groups.map((g) => {
            const open = expanded.has(g.key);
            const groupKey = `${GROUP_PREFIX}${g.key}`;
            const panelId = `${baseId}-${g.key}`;
            const dimmed = active !== null && active !== groupKey && !g.categories.some((c) => c.category === active);
            // Inside an open group: hovering the group row lights all its categories; another group dims them.
            const innerActive = activeGroup === null ? active : activeGroup === g.key ? null : "";
            return (
              <li key={g.key}>
                <div
                  onMouseEnter={() => hover(groupKey)}
                  onMouseLeave={() => hover(null)}
                  onFocus={() => hover(groupKey)}
                  onBlur={() => hover(null)}
                  className={`transition-opacity duration-150 ${dimmed ? "opacity-45" : ""}`}
                >
                  <button
                    type="button"
                    data-key={groupKey}
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => toggle(g.key)}
                    className="focus-ring -mx-2 block w-[calc(100%+1rem)] rounded-md px-2 py-2 text-left transition-colors duration-150 hover:bg-subtle"
                  >
                    <span className="flex items-baseline gap-2">
                      <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 self-center rounded-full" style={{ background: g.color }} />
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{g.label}</span>
                      <span className="shrink-0 text-[15px] font-semibold tabular-nums">
                        {byAmount ? formatIDR(g.value) : number(g.count)}
                      </span>
                      <ChevronDownIcon
                        className={`h-4 w-4 shrink-0 self-center text-muted transition-transform duration-150 ${open ? "rotate-180" : ""}`}
                      />
                    </span>
                    <span className="mt-0.5 block pl-[1.125rem] text-xs tabular-nums text-muted">
                      {tc("chart.transactions", g.count)} · {percent(g.share)}
                    </span>
                    <span aria-hidden="true" className="ml-[1.125rem] mr-6 mt-1.5 block h-1.5 overflow-hidden rounded-full bg-subtle">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${groupMax > 0 ? (g.value / groupMax) * 100 : 0}%`, background: g.color }}
                      />
                    </span>
                  </button>
                </div>
                <div id={panelId} hidden={!open} className="mb-2 ml-1 mt-1 border-l border-line pl-4">
                  <BarList
                    items={g.categories.map((c) => ({
                      key: c.category,
                      label: category(c.category),
                      value: valueOf(c),
                      display: byAmount ? formatIDR(c.total_amount) : `${c.count}`,
                      sub: `${tc("chart.transactions", c.count)} · ${percent(c.share)}`,
                      color: colorFor(c.category),
                    }))}
                    onSelect={(key, button) => onOpen(key, button)}
                    popup="dialog"
                    activeKey={innerActive}
                    onActive={hover}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
