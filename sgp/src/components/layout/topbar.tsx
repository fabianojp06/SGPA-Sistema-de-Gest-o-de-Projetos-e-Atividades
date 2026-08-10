import { Bell, Search } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { Badge } from "@/components/ui/badge";

export function Topbar() {
  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-background px-6">
      <div className="flex w-full max-w-md items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
        <Search className="h-4 w-4" />
        <span className="flex-1">Buscar projetos, atividades, WINs…</span>
        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs">
          ⌘K
        </kbd>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          className="relative rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Notificações"
        >
          <Bell className="h-5 w-5" />
          <Badge className="absolute -right-1 -top-1 h-4 min-w-4 justify-center rounded-full bg-[var(--accent-danger)] px-1 text-[10px]">
            3
          </Badge>
        </button>

        <UserButton />
      </div>
    </header>
  );
}
