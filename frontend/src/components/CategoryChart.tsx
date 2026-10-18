"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { colorFor, formatIDR, formatPercent } from "@/lib/format";
import type { Summary } from "@/lib/types";

interface Props {
  summary: Summary;
  byAmount: boolean;
}

export default function CategoryChart({ summary, byAmount }: Props) {
  const data = summary.by_category
    .filter((c) => (byAmount ? c.total_amount > 0 : c.count > 0))
    .map((c) => ({ name: c.category, value: byAmount ? c.total_amount : c.count, share: c.share }));

  if (data.length === 0) return <p className="mt-4 text-sm text-slate-600">Nothing to chart.</p>;

  const description = data.map((d) => `${d.name} ${formatPercent(d.share)}`).join(", ");

  return (
    <figure className="mt-2 h-80" role="img" aria-label={`Donut chart: ${description}`}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={1} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.name} fill={colorFor(d.name)} stroke="#fff" />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, name, item) => {
              const share = formatPercent((item?.payload as { share: number }).share);
              const shown = byAmount ? formatIDR(Number(value)) : `${value} transactions`;
              return [`${shown} (${share})`, String(name)];
            }}
          />
          <Legend formatter={(value) => <span className="capitalize text-slate-700">{value}</span>} />
        </PieChart>
      </ResponsiveContainer>
    </figure>
  );
}
