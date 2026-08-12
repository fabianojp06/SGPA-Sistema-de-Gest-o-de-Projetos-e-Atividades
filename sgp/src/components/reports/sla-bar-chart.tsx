"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SlaBarChartProps {
  data: { project: { id: string; name: string }; slaRate: number | null }[];
}

function slaColor(rate: number) {
  if (rate >= 80) return "var(--color-chart-2)";
  if (rate >= 50) return "var(--color-chart-3)";
  return "var(--color-chart-4)";
}

export function SlaBarChart({ data }: SlaBarChartProps) {
  const rows = data
    .filter((d) => d.slaRate !== null)
    .map((d) => ({ name: d.project.name, sla: d.slaRate as number }))
    .sort((a, b) => a.sla - b.sla);

  return (
    <Card>
      <CardHeader>
        <CardTitle>SLA de entrega por projeto</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Sem entregas concluídas no período para calcular SLA.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(180, rows.length * 36)}>
            <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 24 }}>
              <CartesianGrid horizontal={false} stroke="var(--border)" />
              <XAxis
                type="number"
                domain={[0, 100]}
                tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                tickFormatter={(v) => `${v}%`}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={160}
                tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)" }}
                contentStyle={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value) => [`${value}%`, "SLA"]}
              />
              <Bar dataKey="sla" radius={[0, 4, 4, 0]} maxBarSize={18}>
                {rows.map((row) => (
                  <Cell key={row.name} fill={slaColor(row.sla)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
