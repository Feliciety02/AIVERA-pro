import { Bot, Globe, Network, Plug, Radar, ScanSearch, ShieldAlert, type LucideIcon } from "lucide-react";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Hint } from "@/components/ui/misc";
import { Callout, KeyValue } from "@/components/shared/display";
import { ToneBadge } from "@/components/security/badges";
import { useDataStore } from "@/stores/dataStore";
import { useDocumentTitle } from "@/hooks";
import { formatRelative } from "@/lib/format";
import { API_ROUTES } from "@/services/api/contracts";
import type { Integration, IntegrationStatus } from "@/types";

const ICONS: Record<Integration["id"], LucideIcon> = { nmap: Network, owasp_zap: ScanSearch, dns_utils: Globe, http_inspector: Radar, ai_service: Bot };
const STATUS: Record<IntegrationStatus, { label: string; tone: "muted" | "warning" | "primary" | "danger" }> = {
  not_connected: { label: "Not Connected", tone: "muted" },
  demo_adapter: { label: "Demo Adapter", tone: "warning" },
  connected: { label: "Connected", tone: "primary" },
  error: { label: "Error", tone: "danger" },
};

export default function IntegrationsPage() {
  useDocumentTitle("Integrations");
  const integrations = useDataStore((s) => s.integrations);
  return (
    <ContentContainer wide>
      <PageHeader title="Integrations" description="Security tools and services AIVERA will orchestrate through its backend. Statuses below reflect the real state of this build." />
      <Callout tone="warning" icon={ShieldAlert} title="Check assessment prerequisites">
        The browser does not launch security tools. API mode can run an opt-in passive Nmap and ZAP assessment when Nmap, Docker, the ZAP image, and the live scan gate are configured on the lab server. These cards do not verify installed executables. “Last used” shows when tool data was recorded.
      </Callout>
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {integrations.map((i) => {
          const Icon = ICONS[i.id];
          return (
            <Card key={i.id} className="flex flex-col p-5">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40"><Icon className="size-5 text-cyan" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">{i.name}</h3>
                    <ToneBadge tone={STATUS[i.status].tone} dot>{STATUS[i.status].label}</ToneBadge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{i.purpose}</p>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3">
                <KeyValue label="Integration type">{i.integrationType}</KeyValue>
                <KeyValue label="Last used">{i.lastUsedAt ? `${formatRelative(i.lastUsedAt)} (demo data)` : "Never"}</KeyValue>
              </dl>
              <div className="mt-4">
                <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Available features</p>
                <div className="flex flex-wrap gap-1">{i.features.map((f) => <ToneBadge key={f} tone="muted">{f}</ToneBadge>)}</div>
              </div>
              <details className="mt-4 rounded-lg border border-border">
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium">Setup information</summary>
                <ol className="list-decimal space-y-1 border-t border-border px-3 py-2 pl-7 text-xs text-muted-foreground">{i.setupSteps.map((s) => <li key={s}>{s}</li>)}</ol>
                <p className="border-t border-border px-3 py-2 font-mono text-[11px] text-cyan">{i.futureEndpoint}</p>
              </details>
              <div className="mt-auto pt-4">
                <Hint label="Connecting integrations requires the AIVERA backend (not part of this phase).">
                  <span tabIndex={0} className="inline-block">
                    <Button size="sm" variant="outline" disabled><Plug /> Connect</Button>
                  </span>
                </Hint>
              </div>
            </Card>
          );
        })}
      </div>
      <Card className="p-5">
        <p className="text-sm font-semibold">Prepared backend API surface</p>
        <p className="mt-1 text-xs text-muted-foreground">Typed contracts in <code className="font-mono">src/services/api/contracts.ts</code>. None are called in demo mode.</p>
        <div className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
          {Object.entries(API_ROUTES).flatMap(([group, routes]) => Object.values(routes).map((r) => <code key={`${group}${r}`} className="font-mono text-[11px] text-muted-foreground">{r}</code>))}
        </div>
      </Card>
    </ContentContainer>
  );
}
