"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface MeetingsByTypeChartProps {
  data: { type: string; label: string; count: number }[];
}

// Ordem fixa (nunca cycled) — cada tipo de reunião sempre tem a mesma cor,
// independente de filtro ou de quais tipos têm dado no momento.
const TYPE_COLOR: Record<string, string> = {
  DAILY: "var(--color-chart-1)",
  WEEKLY: "var(--color-chart-2)",
  BIWEEKLY: "var(--color-chart-3)",
  MONTHLY: "var(--color-chart-4)",
  ONE_ON_ONE: "var(--color-chart-5)",
};

export function MeetingsByTypeChart({ data }: MeetingsByTypeChartProps) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const rows = data.filter((d) => d.count > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reuniões por tipo</CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma reunião no período filtrado.</p>
        ) : (
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <ResponsiveContainer width="100%" height={200} className="sm:w-1/2">
              <PieChart>
                <Pie data={rows} dataKey="count" nameKey="label" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {rows.map((row) => (
                    <Cell key={row.type} fill={TYPE_COLOR[row.type]} stroke="var(--bg-surface)" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value, name) => [value, name]}
                />
              </PieChart>
            </ResponsiveContainer>

            <ul className="flex flex-1 flex-col gap-1.5">
              {data.map((row) => (
                <li key={row.type} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: TYPE_COLOR[row.type] }}
                    />
                    <span className="text-secondary-foreground">{row.label}</span>
                  </span>
                  <span className="font-mono text-muted-foreground">{row.count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
