"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, FolderKanban, ListChecks, Trophy } from "lucide-react";
import { globalSearch, type SearchResult } from "@/actions/search";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const TYPE_ICON = {
  project: FolderKanban,
  activity: ListChecks,
  win: Trophy,
} as const;

const TYPE_LABEL = {
  project: "Projetos",
  activity: "Atividades",
  win: "WINs",
} as const;

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const found = await globalSearch(query);
      setResults(found);
      setSelectedIndex(0);
      setLoading(false);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function goTo(result: SearchResult) {
    setOpen(false);
    router.push(result.href);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      goTo(results[selectedIndex]);
    }
  }

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.type] ??= []).push(r);
    return acc;
  }, {});

  let flatIndex = -1;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full max-w-md items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-ring"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Buscar projetos, atividades, WINs…</span>
        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs">⌘K</kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[15%] max-w-lg translate-y-0 gap-0 p-0" showCloseButton={false}>
          <DialogTitle className="sr-only">Busca global</DialogTitle>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar projetos, atividades, WINs…"
            className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />

          <div className="max-h-80 overflow-y-auto p-2">
            {loading && <p className="px-3 py-4 text-sm text-muted-foreground">Buscando…</p>}

            {!loading && query.trim().length >= 2 && results.length === 0 && (
              <p className="px-3 py-4 text-sm text-muted-foreground">Nada encontrado para &quot;{query}&quot;.</p>
            )}

            {!loading &&
              (Object.entries(grouped) as [SearchResult["type"], SearchResult[]][]).map(([type, items]) => (
                <div key={type} className="mb-2">
                  <div className="px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {TYPE_LABEL[type]}
                  </div>
                  {items.map((item) => {
                    flatIndex += 1;
                    const isSelected = flatIndex === selectedIndex;
                    const Icon = TYPE_ICON[type];
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => goTo(item)}
                        onMouseEnter={() => setSelectedIndex(flatIndex)}
                        className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                          isSelected ? "bg-sidebar-accent text-foreground" : "text-secondary-foreground"
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate">{item.title}</span>
                        <span className="shrink-0 truncate text-xs text-muted-foreground">{item.subtitle}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
