import { getAllActivities } from "@/actions/activities";
import { getProjects } from "@/actions/projects";
import { getActiveUsers } from "@/actions/users";
import { getCurrentDbUser } from "@/lib/auth";
import { parseDashboardFilters, hasActiveFilters } from "@/lib/dashboard-filters";
import { DashboardFilterBar } from "@/components/dashboard/dashboard-filter-bar";
import { ActivityRow } from "@/components/activities/activity-row";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const CROSS_PROJECT_VIEW_ROLES = ["admin", "director", "coordinator"];

interface AtividadesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AtividadesPage({ searchParams }: AtividadesPageProps) {
  const currentUser = await getCurrentDbUser();
  const isManager = !!currentUser && CROSS_PROJECT_VIEW_ROLES.includes(currentUser.role);

  const filters = parseDashboardFilters(await searchParams);
  const filtersActive = hasActiveFilters(filters);

  const [activities, projects, members] = await Promise.all([
    getAllActivities(filters),
    getProjects(),
    isManager ? getActiveUsers() : Promise.resolve(undefined),
  ]);

  const areaOptions = Array.from(new Set(projects.map((p) => p.area))).sort();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Atividades</h1>
        <p className="text-muted-foreground">
          {activities.length} atividade{activities.length === 1 ? "" : "s"}
          {isManager ? " em todos os projetos" : " atribuídas a você"}.
        </p>
      </div>

      <DashboardFilterBar
        projects={projects}
        areas={areaOptions}
        members={members}
        hasActiveFilters={filtersActive}
      />

      <Card>
        <CardContent>
          {activities.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma atividade encontrada.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Projeto</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead>Progresso</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activities.map((activity) => (
                  <ActivityRow key={activity.id} activity={activity} showProject />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
