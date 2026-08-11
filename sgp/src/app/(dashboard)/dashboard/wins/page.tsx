import { getMyWinsThisWeek, getMyWinsLastWeek, getTeamWinsThisWeek } from "@/actions/wins";
import { getMyRisks } from "@/actions/risks";
import { getMyHelpRequests } from "@/actions/help-requests";
import { getProjects } from "@/actions/projects";
import { getCurrentDbUser } from "@/lib/auth";
import { WinFormDialog } from "@/components/wins/win-form-dialog";
import { WinEditDialog } from "@/components/wins/win-edit-dialog";
import { RiskFormDialog } from "@/components/wins/risk-form-dialog";
import { HelpRequestFormDialog } from "@/components/wins/help-request-form-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

const WIN_STATUS_LABEL: Record<string, string> = {
  TODO: "A Fazer",
  IN_PROGRESS: "Em Andamento",
  DONE: "Concluída",
  BLOCKED: "Bloqueada",
  CANCELLED: "Cancelada",
};

const RISK_LEVEL_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = {
  LOW: "secondary",
  MEDIUM: "outline",
  HIGH: "destructive",
  CRITICAL: "destructive",
};

const RISK_LEVEL_LABEL: Record<string, string> = {
  LOW: "Baixo",
  MEDIUM: "Médio",
  HIGH: "Alto",
  CRITICAL: "Crítico",
};

const TEAM_VIEW_ROLES = ["admin", "director", "coordinator"];

export default async function WinsPage() {
  const currentUser = await getCurrentDbUser();
  const canViewTeam = !!currentUser && TEAM_VIEW_ROLES.includes(currentUser.role);

  const [thisWeek, lastWeek, risks, helpRequests, projects, teamWins] = await Promise.all([
    getMyWinsThisWeek(),
    getMyWinsLastWeek(),
    getMyRisks(),
    getMyHelpRequests(),
    getProjects(),
    canViewTeam ? getTeamWinsThisWeek() : Promise.resolve([]),
  ]);

  const projectLabel = new Map(projects.map((p) => [p.id, `${p.code} — ${p.name}`]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Card WIN</h1>
          <p className="text-muted-foreground">
            Registre o que você entregou esta semana, riscos e pedidos de ajuda.
          </p>
        </div>
        <WinFormDialog projects={projects} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>WINs desta semana ({thisWeek.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {thisWeek.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum WIN registrado ainda esta semana.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Suporte</TableHead>
                  <TableHead>Projeto</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {thisWeek.map((win) => (
                  <TableRow key={win.id}>
                    <TableCell>{win.title}</TableCell>
                    <TableCell>{win.supportName ?? "—"}</TableCell>
                    <TableCell>
                      {win.projectId ? projectLabel.get(win.projectId) ?? "—" : "—"}
                    </TableCell>
                    <TableCell className="font-mono">{formatDate(win.dueDate)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{WIN_STATUS_LABEL[win.status]}</Badge>
                    </TableCell>
                    <TableCell>
                      <WinEditDialog win={win} projects={projects} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Retrospectiva — semana anterior ({lastWeek.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {lastWeek.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum WIN registrado na semana anterior.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lastWeek.map((win) => (
                  <TableRow key={win.id}>
                    <TableCell>{win.title}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{WIN_STATUS_LABEL[win.status]}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Alertas de risco abertos ({risks.length})</CardTitle>
          <RiskFormDialog />
        </CardHeader>
        <CardContent>
          {risks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum risco em aberto.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Nível</TableHead>
                  <TableHead>Prazo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {risks.map((risk) => (
                  <TableRow key={risk.id}>
                    <TableCell>{risk.title}</TableCell>
                    <TableCell>
                      <Badge variant={RISK_LEVEL_VARIANT[risk.level]}>
                        {RISK_LEVEL_LABEL[risk.level]}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono">
                      {risk.dueDate ? formatDate(risk.dueDate) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Pedidos de ajuda em aberto ({helpRequests.length})</CardTitle>
          <HelpRequestFormDialog />
        </CardHeader>
        <CardContent>
          {helpRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum pedido de ajuda em aberto.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Destinatário</TableHead>
                  <TableHead>Prazo de resposta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {helpRequests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>{request.description}</TableCell>
                    <TableCell>{request.targetName}</TableCell>
                    <TableCell className="font-mono">
                      {request.dueDate ? formatDate(request.dueDate) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {canViewTeam && (
        <Card>
          <CardHeader>
            <CardTitle>Card WIN da equipe — semana atual ({teamWins.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {teamWins.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum WIN registrado pela equipe esta semana.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Projeto</TableHead>
                    <TableHead>Prazo</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamWins.map((win) => (
                    <TableRow key={win.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar size="sm">
                            <AvatarImage src={win.user.avatarUrl ?? undefined} />
                            <AvatarFallback>{win.user.name.slice(0, 2)}</AvatarFallback>
                          </Avatar>
                          {win.user.name}
                        </div>
                      </TableCell>
                      <TableCell>{win.title}</TableCell>
                      <TableCell>
                        {win.project ? `${win.project.code} — ${win.project.name}` : "—"}
                      </TableCell>
                      <TableCell className="font-mono">{formatDate(win.dueDate)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{WIN_STATUS_LABEL[win.status]}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
