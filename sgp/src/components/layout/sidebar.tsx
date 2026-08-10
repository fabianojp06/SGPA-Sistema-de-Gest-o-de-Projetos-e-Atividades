import Link from "next/link";
import {
  LayoutDashboard,
  FolderKanban,
  ListChecks,
  Trophy,
  CalendarClock,
  FileText,
  ScrollText,
  ShieldAlert,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { getCurrentWeek } from "@/lib/utils";
import { prisma } from "@/lib/prisma";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/projetos", label: "Projetos", icon: FolderKanban },
  { href: "/dashboard/atividades", label: "Atividades", icon: ListChecks },
  { href: "/dashboard/wins", label: "Meus WINs", icon: Trophy },
];

const meetingItems = [
  { href: "/dashboard/reunioes/agenda", label: "Agenda", icon: CalendarClock },
  { href: "/dashboard/reunioes/pautas", label: "Pautas", icon: FileText },
  { href: "/dashboard/reunioes/atas", label: "Atas", icon: ScrollText },
];

const statusColors: Record<string, string> = {
  ACTIVE: "bg-[var(--accent-success)]",
  PAUSED: "bg-[var(--accent-warning)]",
  COMPLETED: "bg-[var(--accent)]",
  ARCHIVED: "bg-[var(--text-muted)]",
  CANCELLED: "bg-[var(--accent-danger)]",
};

export async function Sidebar() {
  const { week, year } = getCurrentWeek();
  const monthLabel = new Date().toLocaleDateString("pt-BR", { month: "short" });

  const activeProjects = await prisma.project
    .findMany({
      where: { deletedAt: null, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, name: true, status: true },
    })
    .catch(() => []);

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-sidebar">
      <div className="flex items-center gap-2 px-5 py-5">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
        </span>
        <span className="text-lg font-semibold tracking-tight text-foreground">
          SGPA
        </span>
      </div>

      <Separator />

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-secondary-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}

        <div className="mt-6 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Reuniões
        </div>
        {meetingItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-secondary-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}

        <Link
          href="/dashboard/riscos"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-secondary-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
        >
          <ShieldAlert className="h-4 w-4" />
          Riscos
        </Link>

        {activeProjects.length > 0 && (
          <>
            <div className="mt-6 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Projetos ativos
            </div>
            <div className="flex flex-col gap-1">
              {activeProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/dashboard/projetos/${project.id}`}
                  className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-secondary-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      statusColors[project.status] ?? "bg-muted"
                    }`}
                  />
                  <span className="truncate">{project.name}</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </nav>

      <Separator />

      <div className="px-5 py-4">
        <span className="rounded-full bg-sidebar-accent px-3 py-1 text-xs text-muted-foreground">
          S{week} · {monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}/{year}
        </span>
      </div>
    </aside>
  );
}
