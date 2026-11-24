import * as React from "react";
import { Link, useSearchParams } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useShallow } from "zustand/react/shallow";
import { Download, FileUp, Loader2, Radar } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger, Hint } from "@/components/ui/misc";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DataTable } from "@/components/shared/DataTable";
import { ALL, FilterBar, FilterSelect, SearchInput } from "@/components/shared/filters";
import {  KeyValue, MiniStat, SectionCard } from "@/components/shared/display";
import { EmptyState } from "@/components/shared/states";
import { OriginBadge, ToneBadge, ToolBadge } from "@/components/security/badges";
import { ChartCard, StackedBars } from "@/components/charts/charts";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser, useInitialLoading, useLookups } from "@/hooks";
import { formatDateTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { IS_API, reconService } from "@/services";
import { ToolImportDialog } from "@/components/forms/ToolImportDialog";
import type { DnsRecord, Endpoint, Host, Port, ReconRun } from "@/types";

type PortRow = Port & { hostname: string; ip: string; targetId: string };


/** Discovery view (hosts, ports, services, DNS, endpoints), shown on the Websites page (?view=discovery). */
export function DiscoveryView() {
  const loading = useInitialLoading();
  const user = useCurrentUser();
  const lookups = useLookups();
  const [params, setParams] = useSearchParams();
  const target = params.get("target") ?? ALL;
  const setTarget = (v: string) => setParams(v === ALL ? {} : { target: v }, { replace: true });
  const data = useDataStore(useShallow((s) => ({ hosts: s.hosts, ports: s.ports, dns: s.dnsRecords, endpoints: s.endpoints, runs: s.reconRuns, integrations: s.integrations })));
  const [q, setQ] = React.useState("");
  const [origin, setOrigin] = React.useState(ALL);
  const [selectedHost, setSelectedHost] = React.useState<Host | null>(null);
  const [importing, setImporting] = React.useState(false);
  const [toolImportOpen, setToolImportOpen] = React.useState(false);

  const match = <T extends { targetId: string; dataOrigin: string }>(r: T, ...fields: string[]) =>
    (target === ALL || r.targetId === target) && (origin === ALL || r.dataOrigin === origin) && (!q || fields.some((f) => f.toLowerCase().includes(q.toLowerCase())));

  const hostById = React.useMemo(() => Object.fromEntries(data.hosts.map((h) => [h.id, h])), [data.hosts]);
  const hosts = React.useMemo(() => data.hosts.filter((h) => match(h, h.hostname, h.ipAddress)), [data.hosts, target, origin, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const ports = React.useMemo<PortRow[]>(
    () =>
      data.ports
        .map((p) => ({ ...p, hostname: hostById[p.hostId]?.hostname ?? "?", ip: hostById[p.hostId]?.ipAddress ?? "?", targetId: hostById[p.hostId]?.targetId ?? "" }))
        .filter((p) => match(p, p.hostname, String(p.port), p.service, p.version)),
    [data.ports, hostById, target, origin, q], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const dns = React.useMemo(() => data.dns.filter((d) => match(d, d.name, d.value, d.type)), [data.dns, target, origin, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const endpoints = React.useMemo(() => data.endpoints.filter((e) => match(e, e.path, e.method)), [data.endpoints, target, origin, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const runs = React.useMemo(() => data.runs.filter((r) => match(r, r.label)), [data.runs, target, origin, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const services = React.useMemo(() => {
    const map = new Map<string, { service: string; versions: Set<string>; count: number; hosts: Set<string> }>();
    ports.filter((p) => p.state === "open").forEach((p) => {
      const e = map.get(p.service) ?? { service: p.service, versions: new Set(), count: 0, hosts: new Set() };
      e.versions.add(p.version);
      e.count++;
      e.hosts.add(p.hostname);
      map.set(p.service, e);
    });
    return [...map.values()].map((s) => ({ name: s.service, value: s.count, versions: [...s.versions], hosts: [...s.hosts] }));
  }, [ports]);

  const authorizedTargets = Object.values(lookups.targets).filter((t) => t.authorizationStatus === "authorized" && t.authorizationConfirmed);
  const selectedTarget = target !== ALL ? lookups.targets[target] : undefined;
  const canImport = can(user?.role, "run_demo_scans") && !!selectedTarget && selectedTarget.authorizationStatus === "authorized" && selectedTarget.authorizationConfirmed;

  const hostCols: ColumnDef<Host, unknown>[] = [
    { accessorKey: "hostname", header: "Hostname", cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() as string}</span> },
    { accessorKey: "ipAddress", header: "IP Address", cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() as string}</span> },
    { accessorKey: "state", header: "State", cell: ({ getValue }) => <ToneBadge tone={getValue() === "up" ? "primary" : "muted"} dot>{String(getValue())}</ToneBadge> },
    { id: "ports", header: "Open ports", accessorFn: (h) => data.ports.filter((p) => p.hostId === h.id && p.state === "open").length },
    { accessorKey: "osGuess", header: "OS guess", cell: ({ getValue }) => <span className="text-xs text-muted-foreground">{(getValue() as string) ?? "N/A"}</span> },
    { id: "target", header: "Target", accessorFn: (h) => lookups.targets[h.targetId]?.name ?? "", cell: ({ getValue }) => <span className="text-xs">{getValue() as string}</span> },
    { accessorKey: "source", header: "Source", cell: ({ row }) => <ToolBadge tool={row.original.source} /> },
    { accessorKey: "dataOrigin", header: "Origin", cell: ({ row }) => <OriginBadge origin={row.original.dataOrigin} /> },
    { accessorKey: "observedAt", header: "Observed", cell: ({ getValue }) => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(getValue() as string)}</span> },
  ];
  const portCols: ColumnDef<PortRow, unknown>[] = [
    { accessorKey: "hostname", header: "Host", cell: ({ row }) => <span className="font-mono text-xs">{row.original.hostname} <span className="text-muted-foreground">({row.original.ip})</span></span> },
    { accessorKey: "port", header: "Port", cell: ({ getValue }) => <span className="font-mono text-xs font-semibold">{getValue() as number}</span> },
    { accessorKey: "protocol", header: "Protocol", cell: ({ getValue }) => <span className="font-mono text-xs uppercase">{getValue() as string}</span> },
    { accessorKey: "state", header: "State", cell: ({ getValue }) => <ToneBadge tone={getValue() === "open" ? "warning" : "muted"} dot>{String(getValue())}</ToneBadge> },
    { accessorKey: "service", header: "Service", cell: ({ getValue }) => <span className="font-mono text-xs text-cyan">{getValue() as string}</span> },
    { accessorKey: "version", header: "Service Version", cell: ({ getValue }) => <span className="text-xs">{getValue() as string}</span> },
    { accessorKey: "dataOrigin", header: "Origin", cell: ({ row }) => <OriginBadge origin={row.original.dataOrigin} /> },
    { accessorKey: "observedAt", header: "Observed", cell: ({ getValue }) => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(getValue() as string)}</span> },
  ];
  const dnsCols: ColumnDef<DnsRecord, unknown>[] = [
    { accessorKey: "name", header: "Name", cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() as string}</span> },
    { accessorKey: "type", header: "DNS Record", cell: ({ getValue }) => <ToneBadge tone="cyan">{getValue() as string}</ToneBadge> },
    { accessorKey: "value", header: "Value", cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() as string}</span> },
    { accessorKey: "ttl", header: "TTL" },
    { accessorKey: "source", header: "Source", cell: ({ row }) => <ToolBadge tool={row.original.source} /> },
    { accessorKey: "dataOrigin", header: "Origin", cell: ({ row }) => <OriginBadge origin={row.original.dataOrigin} /> },
    { accessorKey: "observedAt", header: "Observed", cell: ({ getValue }) => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(getValue() as string)}</span> },
  ];
  const epCols: ColumnDef<Endpoint, unknown>[] = [
    { accessorKey: "method", header: "Method", cell: ({ getValue }) => <span className="font-mono text-[11px] font-bold text-cyan">{getValue() as string}</span> },
    { accessorKey: "path", header: "Endpoint", cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() as string}</span> },
    { accessorKey: "statusCode", header: "Status", cell: ({ getValue }) => <span className="font-mono text-xs">{(getValue() as number) || "N/A"}</span> },
    { accessorKey: "contentType", header: "Content type", cell: ({ getValue }) => <span className="text-xs text-muted-foreground">{getValue() as string}</span> },
    { accessorKey: "authRequired", header: "Auth", cell: ({ getValue }) => (getValue() ? <ToneBadge tone="info">Required</ToneBadge> : <ToneBadge tone="muted">Public</ToneBadge>) },
    { id: "target", header: "Target", accessorFn: (e) => lookups.targets[e.targetId]?.name ?? "", cell: ({ getValue }) => <span className="text-xs">{getValue() as string}</span> },
    { accessorKey: "source", header: "Discovery Source", cell: ({ row }) => <ToolBadge tool={row.original.source} /> },
    { accessorKey: "dataOrigin", header: "Origin", cell: ({ row }) => <OriginBadge origin={row.original.dataOrigin} /> },
  ];
  const runCols: ColumnDef<ReconRun, unknown>[] = [
    { accessorKey: "ranAt", header: "When", cell: ({ getValue }) => <span className="whitespace-nowrap text-xs">{formatDateTime(getValue() as string)}</span> },
    { accessorKey: "label", header: "Activity" },
    { id: "target", header: "Target", accessorFn: (r) => lookups.targets[r.targetId]?.name ?? "" },
    { accessorKey: "tool", header: "Tool", cell: ({ row }) => <ToolBadge tool={row.original.tool} /> },
    { accessorKey: "recordsAdded", header: "Records" },
    { accessorKey: "dataOrigin", header: "Origin", cell: ({ row }) => <OriginBadge origin={row.original.dataOrigin} /> },
  ];

  const doImport = async () => {
    if (!selectedTarget) return;
    setImporting(true);
    const n = await reconService.importSample(selectedTarget.id);
    setImporting(false);
    toast.success(`Imported ${n} sample records`, { description: "Synthetic demo bundle, no lookups or scans were performed." });
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Hosts, ports, services, DNS and endpoints found for your authorized websites.</p>
        <div className="flex flex-wrap items-center gap-2">
          <>
          {!IS_API && <Hint label={canImport ? "Adds a labelled synthetic sample bundle for the selected target." : "Select an authorized target first. Requires an assessor or admin demo role."}>
            <span tabIndex={0}>
              <Button size="sm" variant="outline" onClick={doImport} disabled={!canImport || importing}>
                {importing ? <Loader2 className="animate-spin" /> : <Download />} Import demo sample
              </Button>
            </span>
          </Hint>}
          {can(user?.role, "run_demo_scans") && (
            <Button size="sm" onClick={() => setToolImportOpen(true)}>
              <FileUp /> Import Nmap / ZAP report
            </Button>
          )}
          </>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterBar active={target !== ALL || origin !== ALL || !!q} onReset={() => { setTarget(ALL); setOrigin(ALL); setQ(""); }}>
          <FilterSelect label="Targets" value={target} onChange={setTarget} options={Object.values(lookups.targets).map((t) => ({ value: t.id, label: t.name }))} />
          <FilterSelect label="Origins" value={origin} onChange={setOrigin} options={[{ value: "imported", label: "Imported sample" }, { value: "simulated", label: "Simulated" }, { value: "synthetic", label: "Synthetic" }]} />
          <SearchInput value={q} onChange={setQ} placeholder="Filter hosts, ports, services, paths" />
        </FilterBar>
        {selectedTarget && !canImport && <span className="text-[11px] text-sev-medium">Import disabled: {selectedTarget.name} is not an authorized, confirmed target.</span>}
      </div>

      {/* Three tabs instead of seven. Tool status lives on the Integrations page, not repeated here. */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview ({services.length} services)</TabsTrigger>
          <TabsTrigger value="network">Hosts & ports ({hosts.length + ports.length})</TabsTrigger>
          <TabsTrigger value="web">Web & DNS ({endpoints.length + dns.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <MiniStat label="Hosts" value={hosts.length} />
            <MiniStat label="Open ports" value={ports.filter((p) => p.state === "open").length} tone="text-sev-medium" />
            <MiniStat label="Services" value={services.length} tone="text-cyan" />
            <MiniStat label="DNS records" value={dns.length} />
            <MiniStat label="Endpoints" value={endpoints.length} />
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {services.length === 0 && <EmptyState title="No services identified" className="md:col-span-2 xl:col-span-3" />}
          {services.map((s) => (
            <details key={s.name} className="group rounded-xl border border-border bg-card p-4 open:border-cyan/30">
              <summary className="flex cursor-pointer list-none items-center justify-between">
                <span className="font-mono text-sm font-semibold text-cyan">{s.name}</span>
                <span className="text-xs text-muted-foreground">{s.value} open port(s) · expand</span>
              </summary>
              <dl className="mt-3 grid gap-3 border-t border-border pt-3">
                <KeyValue label="Service versions">{s.versions.join(", ")}</KeyValue>
                <KeyValue label="Hosts" mono>{s.hosts.join(", ")}</KeyValue>
              </dl>
            </details>
          ))}
          </div>
          <ChartCard title="Open services" description="Count of open ports per identified service" summary={services.map((s) => `${s.name}: ${s.value}`).join(", ")} height={220}>
            <StackedBars data={services} xKey="name" series={[{ key: "value", name: "Open ports", color: "var(--cyan)" }]} legend={false} />
          </ChartCard>
          <SectionCard title="Import history" description="Every reconnaissance import, newest first" actions={<Button variant="ghost" size="sm" asChild><Link to="/integrations">Tool setup</Link></Button>}>
            <DataTable data={runs} columns={runCols} getRowId={(r) => r.id} initialSorting={[{ id: "ranAt", desc: true }]} caption="Reconnaissance history" />
          </SectionCard>
        </TabsContent>

        <TabsContent value="network" className="space-y-4">
          <SectionCard title="Hosts" description="Click a host for details" flush>
            <DataTable data={hosts} columns={hostCols} getRowId={(h) => h.id} loading={loading} onRowClick={setSelectedHost} caption="Discovered hosts" empty={<EmptyState icon={Radar} title="No hosts" description="Import a report or demo sample for an authorized target." />} />
          </SectionCard>
          <SectionCard title="Ports" flush>
            <DataTable data={ports} columns={portCols} getRowId={(p) => p.id} loading={loading} caption="Discovered ports" />
          </SectionCard>
        </TabsContent>

        <TabsContent value="web" className="space-y-4">
          <SectionCard title="Endpoints" description="Pages and API routes found" flush>
            <DataTable data={endpoints} columns={epCols} getRowId={(e) => e.id} loading={loading} caption="Endpoint inventory" />
          </SectionCard>
          <SectionCard title="DNS records" flush>
            <DataTable data={dns} columns={dnsCols} getRowId={(d) => d.id} loading={loading} caption="DNS records" />
          </SectionCard>
        </TabsContent>
      </Tabs>

      <p className="text-[11px] text-muted-foreground">{authorizedTargets.length} target(s) are currently authorized for reconnaissance.</p>

      <Sheet open={!!selectedHost} onOpenChange={(o) => !o && setSelectedHost(null)}>
        <SheetContent>
          {selectedHost && (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono">{selectedHost.hostname}</SheetTitle>
                <SheetDescription>Host details · {lookups.targets[selectedHost.targetId]?.name}</SheetDescription>
              </SheetHeader>
              <SheetBody className="space-y-5">
                <div className="flex flex-wrap gap-2">
                  <OriginBadge origin={selectedHost.dataOrigin} />
                  <ToolBadge tool={selectedHost.source} />
                </div>
                <dl className="grid grid-cols-2 gap-4">
                  <KeyValue label="IP address" mono>{selectedHost.ipAddress}</KeyValue>
                  <KeyValue label="State">{selectedHost.state}</KeyValue>
                  <KeyValue label="OS guess">{selectedHost.osGuess ?? "N/A"}</KeyValue>
                  <KeyValue label="Observed">{formatDateTime(selectedHost.observedAt)}</KeyValue>
                </dl>
                <div>
                  <p className="mb-2 text-xs font-semibold">Ports</p>
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {data.ports.filter((p) => p.hostId === selectedHost.id).map((p) => (
                      <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                        <span className="w-16 font-mono font-semibold">{p.port}/{p.protocol}</span>
                        <span className="w-24 font-mono text-cyan">{p.service}</span>
                        <span className="flex-1 text-muted-foreground">{p.version}</span>
                        <ToneBadge tone={p.state === "open" ? "warning" : "muted"}>{p.state}</ToneBadge>
                      </li>
                    ))}
                  </ul>
                </div>
                {selectedHost.scanId && (
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/scans/${selectedHost.scanId}`}>Open source scan</Link>
                  </Button>
                )}
              </SheetBody>
            </>
          )}
        </SheetContent>
      </Sheet>
      <ToolImportDialog open={toolImportOpen} onOpenChange={setToolImportOpen} defaultTargetId={target !== ALL ? target : undefined} />
    </>
  );
}
