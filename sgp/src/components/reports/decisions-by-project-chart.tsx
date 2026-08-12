"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface DecisionsByProjectChartProps {
  data: { projectId: string; projectName: string; count: number }[];
}

export function DecisionsByProjectChart({ data }: DecisionsByProjectChartProps) {
  const rows = data.map((d) => ({ name: d.projectName, count: d.count }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Decisões registradas por projeto</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma decisão registrada no período filtrado.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(180, rows.length * 36)}>
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
                formatter={(value) => [value, "Decisões"]}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={18} fill="var(--color-chart-5)" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
