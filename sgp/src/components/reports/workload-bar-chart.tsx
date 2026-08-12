"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface WorkloadBarChartProps {
  data: {
    user: { name: string };
    activeCount: number;
    color: "green" | "amber" | "red";
  }[];
}

const COLOR_VAR: Record<string, string> = {
  green: "var(--color-chart-2)",
  amber: "var(--color-chart-3)",
  red: "var(--color-chart-4)",
};

export function WorkloadBarChart({ data }: WorkloadBarChartProps) {
  const rows = [...data].sort((a, b) => b.activeCount - a.activeCount).map((d) => ({
    name: d.user.name,
    count: d.activeCount,
    color: COLOR_VAR[d.color],
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Carga de trabalho ativa por colaborador</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Sem dados no período.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(180, rows.length * 32)}>
            <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 24 }}>
              <CartesianGrid horizontal={false} stroke="var(--border)" />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={140}
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
                formatter={(value) => [value, "Atividades ativas"]}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={16}>
                {rows.map((row) => (
                  <Cell key={row.name} fill={row.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Cor relativa à média do grupo (mesma área) — verde = abaixo, âmbar = próximo, vermelho = acima da média.
        </p>
      </CardContent>
    </Card>
  );
}
