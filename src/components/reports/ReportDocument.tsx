import { FlaskConical } from "lucide-react";
import type { ReportModel } from "@/features/reports/reportModel";
import { riskSummary } from "@/features/reports/reportModel";
import { CATEGORY_BY_ID, ENVIRONMENTS, REMEDIATION_STATUS, SEVERITY_META, SOURCE_LABEL, TOOL_META, VERIFICATION_STATUS } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ReportSectionKey } from "@/types";

function H({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="mt-8 mb-3 flex items-baseline gap-2 border-b border-slate-200 pb-1.5 text-[15px] font-semibold text-slate-900">
      <span className="font-mono text-xs text-blue-700">{String(n).padStart(2, "0")}</span>
      {children}
    </h2>
  );
}

function T({ head, rows }: { head: string[]; rows: (React.ReactNode)[][] }) {
  return (
    <table className="w-full border-collapse text-[11.5px]">
      <thead>
        <tr className="bg-slate-900 text-left text-slate-100">{head.map((h) => <th key={h} className="px-2 py-1.5 font-semibold">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-slate-200 odd:bg-slate-50">{r.map((c, j) => <td key={j} className="px-2 py-1.5 align-top">{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

/** Print-friendly report that preserves the provenance of each source. */
export function ReportDocument({ model: m }: { model: ReportModel }) {
  const has = (k: ReportSectionKey) => m.report.sections.includes(k);
  let n = 0;
  const next = () => ++n;
  const maxCount = Math.max(1, ...m.severityCounts.map((c) => c.count));
  return (
    <article className="print-root relative mx-auto max-w-[820px] overflow-hidden rounded-lg border border-border bg-white text-slate-800 shadow-xl">
      {m.watermark && (
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="-rotate-[30deg] text-[110px] font-black tracking-widest text-slate-900/[0.04]">DEMO DATA</span>
        </div>
      )}
      {has("cover") && (
        <header className="bg-[#0B111B] px-10 pt-10 pb-8 text-slate-100">
          <p className="text-xs font-bold tracking-[0.2em] text-blue-300">AEGIS AI</p>
          <p className="text-[10px] text-slate-400">Intelligent Security. Verified Decisions.</p>
          <h1 className="mt-10 text-[26px] font-semibold leading-tight">{m.report.title}</h1>
          <p className="mt-2 text-sm text-slate-300">{m.project.code} · {m.project.name}</p>
          <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-2 text-[11px] sm:grid-cols-4">
            <div><p className="text-slate-500">Report</p><p className="font-mono">{m.report.code}</p></div>
            <div><p className="text-slate-500">Status</p><p>{m.report.status === "final" ? "Final" : "Draft"}</p></div>
            <div><p className="text-slate-500">Period</p><p>{formatDate(m.report.periodStart)} – {formatDate(m.report.periodEnd)}</p></div>
            <div><p className="text-slate-500">Prepared by</p><p>{m.preparedBy}</p></div>
          </div>
        </header>
      )}
      <div className="relative px-10 pb-12">
        <div className="mt-6 flex gap-2.5 rounded-md border border-amber-300 bg-amber-50 p-3 text-[11.5px] font-medium text-amber-900">
          <FlaskConical className="mt-0.5 size-4 shrink-0" />
          <p>{m.sourceNotice}</p>
        </div>

        {has("assessment_info") && (
          <>
            <H n={next()}>Assessment Information</H>
            <T head={["Item", "Detail"]} rows={[["Project", `${m.project.code} — ${m.project.name}`], ["Owner", m.owner?.name ?? "—"], ["Organization", m.organization], ["Targets", m.targets.map((t) => `${t.name} (${t.url})`).join("; ")], ["Objectives", m.project.objectives], ["Generated", formatDateTime(m.report.createdAt)]]} />
          </>
        )}
        {has("executive_summary") && (
          <>
            <H n={next()}>Executive Summary</H>
            <p className="text-[13px] leading-relaxed">{m.report.executiveSummary || "No executive summary provided."}</p>
            <div className="mt-3 grid grid-cols-5 gap-2">
              {m.severityCounts.map((c) => (
                <div key={c.severity} className="rounded border border-slate-200 p-2 text-center">
                  <p className={cn("text-xl font-semibold text-slate-500", c.severity === "critical" && "text-red-600", c.severity === "high" && "text-orange-600", c.severity === "medium" && "text-yellow-600", c.severity === "low" && "text-blue-600")}>{c.count}</p>
                  <p className="text-[10px] text-slate-500">{c.label}</p>
                </div>
              ))}
            </div>
          </>
        )}
        {has("scope") && (
          <>
            <H n={next()}>Scope and Authorization</H>
            <T head={["Target", "Environment", "In-scope hosts", "Excluded paths", "Authorization"]} rows={m.targets.map((t) => [t.name, ENVIRONMENTS[t.environment], <span className="font-mono">{t.scope.inScopeHosts.join(", ")}</span>, <span className="font-mono">{t.scope.excludedPaths.join(", ") || "none"}</span>, `${t.authorizationStatus} · ${t.authorizationReference}`])} />
          </>
        )}
        {has("methodology") && (
          <>
            <H n={next()}>Assessment Methodology</H>
            <ul className="list-disc space-y-1 pl-5 text-[12.5px]">{m.methodology.map((x) => <li key={x}>{x}</li>)}</ul>
          </>
        )}
        {has("tools") && (
          <>
            <H n={next()}>Security Tools Used</H>
            <T head={["Tool", "Purpose"]} rows={m.tools.length ? m.tools.map((t) => [TOOL_META[t].label, TOOL_META[t].description]) : [["—", "No tool runs recorded"]]} />
            <p className="mt-2 text-[11px] text-slate-500">Scan records in period: {m.scanOrigins.real} live, {m.scanOrigins.imported} imported, {m.scanOrigins.simulated} simulated.</p>
          </>
        )}
        {(has("findings_summary") || has("severity_distribution")) && (
          <>
            <H n={next()}>Findings Summary & Severity Distribution</H>
            {has("severity_distribution") && (
              <div className="mb-4 space-y-1.5">
                {m.severityCounts.map((c) => (
                  <div key={c.severity} className="flex items-center gap-3 text-[11px]">
                    <span className="w-14 text-slate-500">{c.label}</span>
                    <div className="h-2.5 flex-1 rounded bg-slate-100">
                      <div className={cn("h-full rounded", c.severity === "critical" ? "bg-red-500" : c.severity === "high" ? "bg-orange-500" : c.severity === "medium" ? "bg-yellow-500" : c.severity === "low" ? "bg-blue-500" : "bg-slate-400")} style={{ width: `${(c.count / maxCount) * 100}%` }} />
                    </div>
                    <span className="w-5 text-right font-semibold">{c.count}</span>
                  </div>
                ))}
              </div>
            )}
            {has("findings_summary") && <T head={["ID", "Title", "Severity", "Target"]} rows={m.verified.length ? m.verified.map((f) => [<span className="font-mono">{f.code}</span>, f.title, SEVERITY_META[f.severity].label, m.targets.find((t) => t.id === f.targetId)?.name]) : [["—", "No verified findings", "", ""]]} />}
            {m.excluded.length > 0 && <p className="mt-2 text-[11px] text-amber-700">{m.excluded.length} selected finding(s) are no longer confirmed and were excluded: {m.excluded.map((f) => f.code).join(", ")}.</p>}
          </>
        )}
        {has("detailed_findings") && (
          <>
            <H n={next()}>Detailed Verified Findings</H>
            {m.verified.length === 0 && <p className="text-[12.5px] text-slate-500">No verified findings.</p>}
            <div className="space-y-6">
              {m.verified.map((f) => (
                <section key={f.id} className="break-inside-avoid rounded-md border border-slate-200">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[13px] font-semibold"><span className="font-mono text-slate-500">{f.code}</span> {f.title}</p>
                    <span className="rounded border border-slate-300 px-1.5 text-[10px] font-semibold uppercase">{SEVERITY_META[f.severity].label}</span>
                  </div>
                  <div className="space-y-2 p-3 text-[12px]">
                    <p><span className="font-semibold">Verification:</span> {VERIFICATION_STATUS[f.verificationStatus].label} by a human assessor</p>
                    <p><span className="font-semibold">Category:</span> {CATEGORY_BY_ID[f.category].name} · {f.cwe} · {f.owasp}</p>
                    <p><span className="font-semibold">Affected asset:</span> <span className="font-mono">{f.affectedAsset}</span></p>
                    <p><span className="font-semibold">Source:</span> {SOURCE_LABEL[f.sourceTool]} {f.dataOrigin === "simulated" && <span className="font-semibold text-amber-700">(SIMULATED)</span>}</p>
                    <p>{f.description}</p>
                    <p><span className="font-semibold">Impact:</span> {f.impact}</p>
                    {has("evidence") && (m.evidence[f.id] ?? []).map((e) => (
                      <div key={e.id}>
                        <p className="text-[11px] font-semibold text-slate-500">Evidence — {e.title} <span className="font-mono">({e.id})</span></p>
                        <pre className="mt-1 overflow-hidden rounded bg-slate-100 p-2 font-mono text-[10.5px] leading-snug whitespace-pre-wrap">{e.content}</pre>
                      </div>
                    ))}
                    {has("remediation") && <p><span className="font-semibold">Recommendation:</span> {f.remediation}</p>}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
        {has("risk_assessment") && (
          <>
            <H n={next()}>Risk Assessment</H>
            <p className="mb-2 text-[11px] text-slate-500">Demo qualitative model (likelihood × impact, 1–25). Not CVSS.</p>
            <T head={["Finding", "Risk score", "Mitigation"]} rows={m.verified.map((f) => [<span className="font-mono">{f.code}</span>, riskSummary(m.risks[f.id]), m.risks[f.id]?.mitigationStatus.replace("_", " ") ?? "—"])} />
          </>
        )}
        {has("remediation") && (
          <>
            <H n={next()}>Remediation Recommendations</H>
            <T head={["Finding", "Action", "Status", "Due"]} rows={m.verified.flatMap((f) => (m.remediation[f.id]?.length ? m.remediation[f.id]!.map((t) => [<span className="font-mono">{f.code}</span>, t.title, REMEDIATION_STATUS[t.status].label, formatDate(t.dueDate)]) : [[<span className="font-mono">{f.code}</span>, f.remediation, "No task", "—"]]))} />
          </>
        )}
        {has("unverified_observations") && m.report.includeUnverified && (
          <>
            <H n={next()}>Appendix — Unverified Observations</H>
            <p className="mb-2 rounded border border-amber-300 bg-amber-50 p-2 text-[11.5px] text-amber-900">These observations have NOT been verified by an assessor and must not be treated as confirmed vulnerabilities.</p>
            <T head={["ID", "Title", "Status", "Origin"]} rows={m.unverified.length ? m.unverified.map((f) => [<span className="font-mono">{f.code}</span>, f.title, VERIFICATION_STATUS[f.verificationStatus].label, f.dataOrigin === "simulated" ? "SIMULATED" : f.dataOrigin]) : [["—", "None in period", "", ""]]} />
          </>
        )}
        {has("conclusion") && (
          <>
            <H n={next()}>Conclusion</H>
            <p className="text-[13px] leading-relaxed">{m.conclusion}</p>
          </>
        )}
        {has("assessor_info") && (
          <>
            <H n={next()}>Assessor Information</H>
            <T head={["Name", "Role", "Contact"]} rows={m.assessors.map((u) => [u.name, u.title, u.email])} />
          </>
        )}
        <p className="mt-10 border-t border-slate-200 pt-3 text-center text-[10px] text-slate-400">{m.report.code} · AEGIS AI security assessment report{m.hasSimulated ? " · includes demonstration data" : ""}</p>
      </div>
    </article>
  );
}
