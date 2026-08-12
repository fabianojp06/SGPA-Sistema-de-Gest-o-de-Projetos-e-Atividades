"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AgendaAdoptionChartProps {
  total: number;
  withAgenda: number;
  rate: number | null;
}

export function AgendaAdoptionChart({ total, withAgenda, rate }: AgendaAdoptionChartProps) {
  const data =
    rate === null ? [] : [
      { name: "Com pauta gerada", value: withAgenda },
      { name: "Sem pauta", value: total - withAgenda },
    ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Adoção da pauta gerada por IA</CardTitle>
      </CardHeader>
      <CardContent>
        {rate === null ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma reunião no período filtrado.
          </p>
        ) : (
          <div className="flex items-center gap-4">
            <div className="relative h-[120px] w-[120px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data} dataKey="value" innerRadius={42} outerRadius={58} startAngle={90} endAngle={-270}>
                    <Cell fill="var(--color-chart-1)" />
                    <Cell fill="var(--border)" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="font-mono text-2xl font-semibold text-foreground">{rate}%</span>
              </div>
            </div>
            <div className="flex flex-col gap-1 text-sm">
              <span className="text-secondary-foreground">
                <span className="font-mono font-semibold">{withAgenda}</span> de{" "}
                <span className="font-mono font-semibold">{total}</span> reuniões com pauta gerada
              </span>
              <span className="text-xs text-muted-foreground">
                Mede o quanto a equipe está usando a geração automática (Ondas 6–10) em vez de deixar a pauta em branco.
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
