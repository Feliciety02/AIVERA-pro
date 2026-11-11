import * as React from "react";
import { useNavigate } from "react-router";
import { FileText, FolderKanban, ScanLine, Search, ShieldAlert, Target, Wrench, type LucideIcon } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useDataStore } from "@/stores/dataStore";
import { useUIStore } from "@/stores/sessionStore";
import { cn } from "@/lib/utils";
import { NAV } from "./nav";

interface Result {
  id: string;
  label: string;
  sub: string;
  to: string;
  icon: LucideIcon;
  group: string;
}

export function GlobalSearch() {
  const open = useUIStore((s) => s.commandOpen);
  const setOpen = useUIStore((s) => s.setCommandOpen);
  const navigate = useNavigate();
  const [q, setQ] = React.useState("");
  const [active, setActive] = React.useState(0);
  const data = useDataStore(useShallow((s) => ({ projects: s.projects, targets: s.targets, findings: s.findings, scans: s.scans, reports: s.reports, remediation: s.remediation })));

  const results = React.useMemo<Result[]>(() => {
    const term = q.trim().toLowerCase();
    const pages: Result[] = NAV.flatMap((g) => g.items.map((i) => ({ id: i.to, label: i.label, sub: g.label, to: i.to, icon: i.icon, group: "Pages" })));
    if (!term) return pages.slice(0, 8);
    const m = (...fields: (string | undefined)[]) => fields.some((f) => f?.toLowerCase().includes(term));
    return [
      ...pages.filter((p) => m(p.label)),
      ...data.projects.filter((p) => m(p.name, p.code)).map((p) => ({ id: p.id, label: p.name, sub: p.code, to: `/projects/${p.id}`, icon: FolderKanban, group: "Projects" })),
      ...data.targets.filter((t) => m(t.name, t.url)).map((t) => ({ id: t.id, label: t.name, sub: t.url, to: `/targets/${t.id}`, icon: Target, group: "Targets" })),
      ...data.findings.filter((f) => m(f.title, f.code, f.affectedAsset)).map((f) => ({ id: f.id, label: f.title, sub: `${f.code} · ${f.severity}`, to: `/findings/${f.id}`, icon: ShieldAlert, group: "Findings" })),
      ...data.scans.filter((s) => m(s.name, s.code)).map((s) => ({ id: s.id, label: s.name, sub: s.code, to: `/scans/${s.id}`, icon: ScanLine, group: "Scans" })),
      ...data.remediation.filter((r) => m(r.title, r.code)).map((r) => ({ id: r.id, label: r.title, sub: r.code, to: `/remediation?task=${r.id}`, icon: Wrench, group: "Remediation" })),
      ...data.reports.filter((r) => m(r.title, r.code)).map((r) => ({ id: r.id, label: r.title, sub: r.code, to: `/reports/${r.id}`, icon: FileText, group: "Reports" })),
    ].slice(0, 30);
  }, [q, data]);

  React.useEffect(() => setActive(0), [q]);
  React.useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const go = (r: Result) => {
    setOpen(false);
    navigate(r.to);
  };

  let lastGroup = "";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent hideClose className="top-[18%] max-w-xl translate-y-0 gap-0 p-0">
        <DialogTitle className="sr-only">Global search</DialogTitle>
        <DialogDescription className="sr-only">Search pages and demo records</DialogDescription>
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="size-4 text-muted-foreground" aria-hidden />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(results.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter" && results[active]) go(results[active]);
            }}
            placeholder="Search projects, targets, findings, scans, reports…"
            aria-label="Search"
            role="combobox"
            aria-expanded
            aria-controls="global-search-results"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border border-border bg-muted px-1.5 py-px text-[10px] text-muted-foreground">Esc</kbd>
        </div>
        <ul id="global-search-results" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-8 text-center text-xs text-muted-foreground">No matches for “{q}”.</li>}
          {results.map((r, i) => {
            const header = r.group !== lastGroup ? r.group : null;
            lastGroup = r.group;
            return (
              <React.Fragment key={r.group + r.id}>
                {header && <li className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">{header}</li>}
                <li role="option" aria-selected={i === active}>
                  <button type="button" onMouseEnter={() => setActive(i)} onClick={() => go(r)} className={cn("flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left", i === active && "bg-accent")}>
                    <r.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{r.label}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{r.sub}</span>
                    </span>
                  </button>
                </li>
              </React.Fragment>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
