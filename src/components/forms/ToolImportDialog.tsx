import * as React from "react";
import { useNavigate } from "react-router";
import { FileCode2, FileUp, FlaskConical, Loader2, Network, ScanSearch, ShieldCheck, ShieldOff, Upload } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Callout, MiniStat } from "@/components/shared/display";
import { SeverityBadge } from "@/components/security/badges";
import { ChoiceCard, Field } from "./fields";
import { useDataStore } from "@/stores/dataStore";
import { buildImport, type ImportBundle } from "@/features/imports/buildImport";
import { MAX_IMPORT_BYTES, type ImportFormat, type ParseResult } from "@/features/imports/parsers";
import { SAMPLE_NMAP_XML, SAMPLE_ZAP_JSON } from "@/data/sampleImports";
import { SEVERITIES } from "@/lib/constants";
import { importService, IS_API } from "@/services";
import { nowISO } from "@/lib/format";

interface Preview {
  parsed: ParseResult;
  bundle: ImportBundle;
}

export function ToolImportDialog({ open, onOpenChange, defaultTargetId }: { open: boolean; onOpenChange: (o: boolean) => void; defaultTargetId?: string }) {
  const navigate = useNavigate();
  const targets = useDataStore((s) => s.targets);
  const eligible = targets.filter((t) => t.authorizationStatus === "authorized" && t.authorizationConfirmed);
  const [targetId, setTargetId] = React.useState(defaultTargetId ?? "");
  const [format, setFormat] = React.useState<ImportFormat>("nmap_xml");
  const [text, setText] = React.useState("");
  const [fileName, setFileName] = React.useState("pasted-report");
  const [error, setError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const target = eligible.find((t) => t.id === targetId);

  React.useEffect(() => {
    if (open) {
      setTargetId(defaultTargetId && eligible.some((t) => t.id === defaultTargetId) ? defaultTargetId : "");
      setText("");
      setFileName("pasted-report");
      setError(null);
      setPreview(null);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => {
    setPreview(null);
    setError(null);
  };

  const loadSample = () => {
    if (!target) return setError("Select a target first so the sample uses its in-scope host.");
    let host = target.url;
    try {
      host = new URL(target.url).hostname;
    } catch {
      /* keep url */
    }
    const origin = (() => {
      try {
        return new URL(target.url).origin;
      } catch {
        return target.url;
      }
    })();
    const ip = host === "localhost" ? "127.0.0.1" : "192.0.2.123";
    const raw = format === "nmap_xml" ? SAMPLE_NMAP_XML : SAMPLE_ZAP_JSON;
    setText(raw.replaceAll("{host}", host).replaceAll("{ip}", ip).replaceAll("{origin}", origin));
    setFileName(format === "nmap_xml" ? "synthetic-sample-nmap.xml" : "synthetic-sample-zap.json");
    reset();
  };

  const onFile = async (file: File) => {
    reset();
    if (file.size > MAX_IMPORT_BYTES) return setError("File is larger than the 2 MB demo import limit.");
    setFileName(file.name);
    setText(await file.text());
    if (/\.xml$/i.test(file.name)) setFormat("nmap_xml");
    if (/\.json$/i.test(file.name)) setFormat("zap_json");
  };

  const runPreview = () => {
    setError(null);
    if (!target) return setError("Select an authorized target.");
    if (!text.trim()) return setError("Choose a file, paste report content, or load the synthetic sample.");
    try {
      const parsed = importService.parse(format, text);
      const bundle = buildImport(parsed, target, { scanId: "preview", scanCode: "SCN-PREVIEW", findingStartIndex: 1, createdBy: "", assessorId: "", now: nowISO(), raw: text, fileName });
      setPreview({ parsed, bundle });
    } catch (e) {
      setPreview(null);
      setError((e as Error).message);
    }
  };

  const doImport = async () => {
    if (!preview || !target) return;
    setBusy(true);
    try {
      const r = await importService.importFor(target.id, preview.parsed, text, fileName);
      toast.success(`Imported as ${r.scanCode}`, { description: `${r.findingCount} finding(s) added as Pending Verification. ${r.skippedCount} out-of-scope item(s) skipped.` });
      onOpenChange(false);
      navigate(`/scans/${r.scanId}`);
    } catch (e) {
      if (!IS_API) toast.error((e as Error).message); // API errors are already shown by the client
    } finally {
      setBusy(false);
    }
  };

  const b = preview?.bundle;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileUp className="size-4" /> Import tool output</DialogTitle>
          <DialogDescription>Bring in an Nmap XML or OWASP ZAP JSON report produced during an authorized engagement. Parsed entirely in your browser.</DialogDescription>
        </DialogHeader>
        <Callout tone="warning" title="AEGIS does not run these tools">
          Only import output from tools you ran against this target within its written authorization. The file is read locally — nothing is uploaded and no host in it is contacted. Entries outside the target's approved scope are skipped. Imported findings start as <strong>Pending Verification</strong>.
        </Callout>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="imp-target" label="Authorized target" required>
            <Select value={targetId} onValueChange={(v) => { setTargetId(v); reset(); }}>
              <SelectTrigger id="imp-target"><SelectValue placeholder="Select target" /></SelectTrigger>
              <SelectContent>{eligible.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <div className="space-y-1.5">
            <p className="text-xs font-medium">Report format</p>
            <div className="grid grid-cols-2 gap-2">
              <ChoiceCard checked={format === "nmap_xml"} onToggle={() => { setFormat("nmap_xml"); reset(); }} title="Nmap XML" icon={<Network className="mt-0.5 size-4 text-cyan" />} />
              <ChoiceCard checked={format === "zap_json"} onToggle={() => { setFormat("zap_json"); reset(); }} title="ZAP JSON" icon={<ScanSearch className="mt-0.5 size-4 text-cyan" />} />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" accept={format === "nmap_xml" ? ".xml,text/xml,application/xml" : ".json,application/json"} className="hidden" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload /> Choose file…</Button>
            <Button variant="ghost" size="sm" onClick={loadSample} disabled={!target}><FlaskConical /> Load synthetic sample</Button>
            <span className="ml-auto truncate font-mono text-[11px] text-muted-foreground">{text ? `${fileName} · ${(new Blob([text]).size / 1024).toFixed(1)} KB` : "No content yet"}</span>
          </div>
          <Textarea aria-label="Report content" rows={6} value={text} onChange={(e) => { setText(e.target.value); setFileName("pasted-report"); reset(); }} placeholder={format === "nmap_xml" ? "<nmaprun …>" : '{ "site": [ … ] }'} className="font-mono text-[11px]" spellCheck={false} />
        </div>

        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

        {b && preview && (
          <div className="space-y-3 rounded-lg border border-border p-3 animate-in fade-in-0">
            <p className="flex items-center gap-2 text-xs font-semibold"><FileCode2 className="size-4 text-muted-foreground" /> Preview — {target?.name}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MiniStat label="Hosts in scope" value={b.hosts.length} />
              <MiniStat label="Ports" value={b.ports.length} />
              <MiniStat label="Findings" value={b.findings.length} tone="text-sev-medium" />
              <MiniStat label="Skipped (scope)" value={b.skipped.length} tone={b.skipped.length ? "text-sev-critical" : undefined} />
            </div>
            {b.findings.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {SEVERITIES.map((s) => {
                  const n = b.findings.filter((f) => f.severity === s).length;
                  return n ? <span key={s} className="flex items-center gap-1 text-xs"><SeverityBadge severity={s} /> ×{n}</span> : null;
                })}
              </div>
            )}
            {b.findings.length > 0 && (
              <ul className="max-h-32 space-y-1 overflow-y-auto text-xs">
                {b.findings.map((f) => <li key={f.id} className="flex items-center gap-2"><ShieldCheck className="size-3.5 shrink-0 text-primary" /> <span className="truncate">{f.title}</span> <span className="ml-auto truncate font-mono text-[10.5px] text-muted-foreground">{f.affectedAsset}</span></li>)}
              </ul>
            )}
            {b.skipped.length > 0 && (
              <details className="rounded-md border border-sev-critical/25 bg-sev-critical/[0.04]">
                <summary className="cursor-pointer px-3 py-1.5 text-xs text-sev-critical">{b.skipped.length} item(s) will NOT be imported (outside approved scope)</summary>
                <ul className="space-y-1 border-t border-sev-critical/20 px-3 py-2 text-[11px] text-muted-foreground">
                  {b.skipped.map((s, i) => <li key={i} className="flex gap-1.5"><ShieldOff className="mt-0.5 size-3 shrink-0 text-sev-critical" /> {s}</li>)}
                </ul>
              </details>
            )}
            {preview.parsed.warnings.map((w) => <p key={w} className="text-[11px] text-sev-medium">{w}</p>)}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          {!preview ? (
            <Button onClick={runPreview} disabled={!target || !text.trim()}>Parse & preview</Button>
          ) : (
            <Button onClick={doImport} disabled={busy || (b!.hosts.length + b!.findings.length === 0)}>
              {busy && <Loader2 className="animate-spin" />} Import {b!.findings.length} finding(s)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
