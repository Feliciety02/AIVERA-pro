import * as React from "react";
import { toast } from "sonner";
import { Bot, ChevronDown, Globe, Loader2, Network, Plug, Radar, RefreshCw, ScanSearch, Server, ShieldCheck, ShieldOff, type LucideIcon } from "lucide-react";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/dashboard/widgets";
import { SectionCard, IconChip } from "@/components/shared/display";
import { ToneBadge } from "@/components/security/badges";
import { useDataStore } from "@/stores/dataStore";
import { useDocumentTitle } from "@/hooks";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/constants";
import { IS_API, integrationService } from "@/services";
import type { Integration, IntegrationStatus, ScanGate } from "@/types";

const ICONS: Record<Integration["id"], LucideIcon> = { nmap: Network, owasp_zap: ScanSearch, dns_utils: Globe, http_inspector: Radar, ai_service: Bot };
const ORDER: Integration["id"][] = ["nmap", "owasp_zap", "http_inspector", "dns_utils", "ai_service"];
const TOOL_NAMES: Record<Integration["id"], string> = { nmap: "Open port checks", owasp_zap: "Website security checks", http_inspector: "Headers and certificates", dns_utils: "Domain records", ai_service: "AI explanations" };

const STATUS: Record<IntegrationStatus, { label: string; tone: Tone }> = {
  connected: { label: "Connected", tone: "primary" },
  demo_adapter: { label: "Practice only", tone: "warning" },
  not_connected: { label: "Not installed", tone: "muted" },
  error: { label: "Needs attention", tone: "danger" },
};

export default function IntegrationsPage() {
  useDocumentTitle("Testing tools");
  const integrations = useDataStore((s) => s.integrations);
  const [checking, setChecking] = React.useState(false);
  const [gate, setGate] = React.useState<ScanGate | null>(null);

  React.useEffect(() => {
    void integrationService.gate().then(setGate).catch(() => setGate(null));
  }, []);

  const check = async () => {
    setChecking(true);
    try {
      const res = await integrationService.check();
      setGate(res.gate);
      const ok = res.integrations.filter((i) => i.status === "connected").length;
      toast.success("Tools checked", { description: `${ok} of ${res.integrations.length} connected.` });
    } catch (e) {
      toast.error("Could not check the tools", { description: (e as Error).message });
    } finally {
      setChecking(false);
    }
  };

  const sorted = [...integrations].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  const connected = integrations.filter((i) => i.status === "connected").length;
  const checkedAt = integrations.map((i) => i.checkedAt).filter(Boolean).sort().at(-1);

  return (
    <ContentContainer wide>
      <PageHeader
        title="Testing tools"
        actions={
          IS_API && (
            <Button onClick={check} disabled={checking}>
              {checking ? <Loader2 className="animate-spin" /> : <RefreshCw />} Check again
            </Button>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Tools ready"
          value={IS_API ? `${connected}/${integrations.length}` : "—"}
          icon={Plug}
          accent={IS_API && connected === integrations.length ? "var(--success)" : "var(--primary)"}
          tooltip="The AIVERA server starts each tool to confirm it works. Use Check again after installing or changing one."
          sub={IS_API ? (checkedAt ? `checked ${formatRelative(checkedAt)}` : "checked by the server") : "needs the AIVERA server"}
        />
        <StatCard
          label="Real checks"
          value={gate ? (gate.liveScansEnabled ? "On" : "Off") : "—"}
          icon={gate?.liveScansEnabled ? ShieldCheck : ShieldOff}
          accent={gate?.liveScansEnabled ? "var(--success)" : "var(--warning)"}
          tooltip="An administrator turns on real checks in the server settings."
          sub={gate ? (gate.liveScansEnabled ? "real checks allowed" : "turned off on the server") : "needs the AIVERA server"}
        />
        <StatCard
          label="Allowed websites"
          value={gate ? gate.approvedHosts.length : "—"}
          icon={Server}
          accent="var(--cyan)"
          tooltip="Only these website addresses can be scanned by this server."
          sub={gate ? <span className="truncate" title={gate.approvedHosts.join(", ")}>{gate.approvedHosts.join(", ") || "none yet"}</span> : "needs the AIVERA server"}
        />
        <StatCard
          label="Hosted site checks"
          value={gate ? (gate.egressIsolated ? "All tools" : "Limited") : "—"}
          icon={Globe}
          accent="var(--sev-medium)"
          tooltip="Open port and website checks need a separate scan network for hosted sites. The headers and certificates check can run without one."
          sub={gate ? (gate.egressIsolated ? "separate scan network" : "headers and certificates only") : "needs the AIVERA server"}
        />
      </div>

      <SectionCard title="Tools" icon={Plug} flush>
        <ul className="divide-y divide-border">
          {sorted.map((i) => (
            <IntegrationRow key={i.id} i={i} />
          ))}
        </ul>
      </SectionCard>
    </ContentContainer>
  );
}

function IntegrationRow({ i }: { i: Integration }) {
  const Icon = ICONS[i.id];
  // Demo mode has no server to ask, so nothing is "not found", only not checked yet.
  const st = !IS_API ? { label: "Not checked", tone: "muted" as Tone } : STATUS[i.status];
  const [open, setOpen] = React.useState(false);
  const note = IS_API ? i.statusNote : "Start the AIVERA server to check this tool.";
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="grid w-full items-center gap-x-4 gap-y-2 px-6 py-4 text-left transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_150px_auto]"
      >
        <div className="flex min-w-0 items-center gap-3">
          <IconChip icon={Icon} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{TOOL_NAMES[i.id]}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{i.purpose}</p>
          </div>
        </div>
        <div className="min-w-0 pl-12 md:pl-0">
          <p className="truncate text-sm">{note ?? "Not checked yet."}</p>
          {IS_API && i.statusDetail && (
            <p className="truncate font-mono text-[11px] text-muted-foreground" title={i.statusDetail}>
              {i.statusDetail}
            </p>
          )}
        </div>
        <p className="pl-12 text-xs text-muted-foreground md:pl-0">{i.lastUsedAt ? `Last run ${formatRelative(i.lastUsedAt)}` : "No runs yet"}</p>
        <div className="flex items-center justify-between gap-3 pl-12 md:justify-end md:pl-0">
          <ToneBadge tone={st.tone}>{st.label}</ToneBadge>
          <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
        </div>
      </button>
      {open && (
        <div className="grid gap-6 border-t border-border bg-muted/30 px-6 py-4 md:grid-cols-2 md:pl-[4.5rem]">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">What it does</p>
            <div className="flex flex-wrap gap-1.5">
              {i.features.map((f) => (
                <ToneBadge key={f} tone="neutral">
                  {f}
                </ToneBadge>
              ))}
            </div>
            {IS_API && i.statusDetail && <p className="mt-3 break-words font-mono text-[11px] text-muted-foreground">{i.statusDetail}</p>}
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Setup</p>
            <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
              {i.setupSteps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </li>
  );
}
