import { notFound } from "next/navigation";
import { getAuditLogs } from "@/actions/audit";
import { getCurrentDbUser } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const AUDIT_VIEW_ROLES = ["admin", "director"];

function formatTimestamp(date: Date) {
  return new Date(date).toLocaleString("pt-BR");
}

export default async function AuditoriaPage() {
  const currentUser = await getCurrentDbUser();
  if (!currentUser || !AUDIT_VIEW_ROLES.includes(currentUser.role)) notFound();

  const logs = await getAuditLogs();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Auditoria</h1>
        <p className="text-muted-foreground">
          Trilha imutável das últimas {logs.length} ações críticas do sistema (RN-15).
        </p>
      </div>

      <Card>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum registro de auditoria ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Quem</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Entidade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono">{formatTimestamp(log.createdAt)}</TableCell>
                    <TableCell>{log.user.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{log.action}</Badge>
                    </TableCell>
                    <TableCell>
                      {log.entity} <span className="text-muted-foreground">#{log.entityId.slice(0, 8)}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
