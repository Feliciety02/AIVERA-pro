import { FlaskConical } from "lucide-react";
import type { ReportModel } from "@/features/reports/reportModel";
import { riskSummary } from "@/features/reports/reportModel";
import { CATEGORY_BY_ID, ENVIRONMENTS, REMEDIATION_STATUS, REPORT_STATUS, SEVERITY_HEX, SEVERITY_META, SOURCE_LABEL, TOOL_META, VERIFICATION_STATUS } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";
import type { ReportSectionKey, Severity } from "@/types";

/** Ordered report sections; a section is listed (and numbered) only when it is included. */
const SECTIONS: { key: string; title: string; when: (has: (k: ReportSectionKey) => boolean, m: ReportModel) => boolean }[] = [
  { key: "assessment_info", title: "Assessment Information", when: (h) => h("assessment_info") },
  { key: "executive_summary", title: "Executive Summary", when: (h) => h("executive_summary") },
  { key: "scope", title: "Scope and Authorization", when: (h) => h("scope") },
  { key: "methodology", title: "Methodology", when: (h) => h("methodology") },
  { key: "tools", title: "Tools Used", when: (h) => h("tools") },
  { key: "summary", title: "Findings Summary", when: (h) => h("findings_summary") || h("severity_distribution") },
  { key: "detailed_findings", title: "Detailed Findings", when: (h) => h("detailed_findings") },
  { key: "risk_assessment", title: "Risk Assessment", when: (h) => h("risk_assessment") },
  { key: "remediation", title: "Remediation Plan", when: (h) => h("remediation") },
  { key: "unverified", title: "Appendix: Unverified Observations", when: (h, m) => h("unverified_observations") && m.report.includeUnverified },
  { key: "conclusion", title: "Conclusion", when: (h) => h("conclusion") },
  { key: "assessor_info", title: "Assessment Team", when: (h) => h("assessor_info") },
];

const BRAND = "#0b57d0";

function Logo({ size = 28 }: { size?: number }) {
  return <img src="/aivera-logo-128.webp" srcSet="/aivera-logo-128.webp 128w, /aivera-logo.webp 512w" sizes={`${size}px`} width={size} height={size} alt="AIVERA" className="shrink-0" />;
}

function H({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="mt-10 mb-4 flex items-center gap-3 break-after-avoid text-[16px] font-semibold tracking-tight text-slate-900">
      <span className="flex size-7 items-center justify-center rounded-md text-[11px] font-semibold text-white" style={{ background: BRAND }}>{n}</span>
      {children}
    </h2>
  );
}

function T({ head, rows, widths }: { head: string[]; rows: React.ReactNode[][]; widths?: string[] }) {
  return (
    <table className="w-full border-collapse text-[11.5px]">
      {widths && <colgroup>{widths.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>}
      <thead>
        <tr className="border-y border-slate-300 bg-slate-100 text-left">
          {head.map((h) => <th key={h} className="px-2.5 py-2 text-[10px] font-semibold tracking-wide text-slate-600 uppercase">{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-slate-200 break-inside-avoid">{r.map((c, j) => <td key={j} className="px-2.5 py-2 align-top text-slate-700">{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

function SevPill({ s }: { s: Severity }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: SEVERITY_HEX[s] }}>
      <span className="size-2 rounded-full" style={{ background: SEVERITY_HEX[s] }} />
      {SEVERITY_META[s].label}
    </span>
  );
}

const Mono = ({ children }: { children: React.ReactNode }) => <span className="font-mono text-[11px]">{children}</span>;

/** Print-friendly report that preserves the provenance of each source. */
export function ReportDocument({ model: m }: { model: ReportModel }) {
  const has = (k: ReportSectionKey) => m.report.sections.includes(k);
  const included = SECTIONS.filter((s) => s.when(has, m));
  const num = (key: string) => included.findIndex((s) => s.key === key) + 1;
  const show = (key: string) => num(key) > 0;
  const maxCount = Math.max(1, ...m.severityCounts.map((c) => c.count));
  const targetName = (id: string) => m.targets.find((t) => t.id === id)?.name ?? "";

  return (
    <article className="print-root relative mx-auto max-w-[820px] overflow-hidden rounded-lg border border-border bg-white text-slate-800 shadow-xl">
      {m.watermark && (
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="-rotate-[30deg] text-[110px] font-black tracking-widest text-slate-900/[0.035]">DEMO DATA</span>
        </div>
      )}

      {/* Cover */}
      {has("cover") && (
        <header className="relative flex min-h-[640px] flex-col border-b border-slate-200 px-12 pt-10 pb-10 break-after-page">
          <div className="h-1.5 w-full rounded-full" style={{ background: `linear-gradient(90deg, ${BRAND}, #22d3ee)` }} />
          <div className="mt-6 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Logo size={34} />
              <div>
                <p className="text-[15px] font-bold tracking-[0.18em] text-slate-900">AIVERA</p>
                <p className="text-[10px] text-slate-500">Intelligent Security. Verified Decisions.</p>
              </div>
            </div>
            <span className="rounded border border-red-300 px-2 py-0.5 text-[10px] font-semibold tracking-[0.15em] text-red-700 uppercase">Confidential</span>
          </div>

          <div className="mt-auto pt-24">
            <p className="text-[11px] font-semibold tracking-[0.2em] uppercase" style={{ color: BRAND }}>Security Assessment Report</p>
            <h1 className="mt-3 text-[32px] leading-tight font-semibold tracking-tight text-slate-900">{m.report.title}</h1>
            <p className="mt-2 text-[14px] text-slate-600">{m.project.name} <span className="text-slate-400">· {m.project.code}</span></p>
            <div className="mt-6 h-px w-24" style={{ background: BRAND }} />
          </div>

          <dl className="mt-10 grid grid-cols-2 gap-x-10 gap-y-4 text-[11.5px] sm:grid-cols-3">
            {[
              ["Prepared for", m.organization],
              ["Prepared by", m.preparedBy],
              ["Assessment period", `${formatDate(m.report.periodStart)} to ${formatDate(m.report.periodEnd)}`],
              ["Report ID", <Mono key="id">{m.report.code}</Mono>],
              ["Status", REPORT_STATUS[m.report.status].label],
              ["Issued", formatDate(m.report.createdAt)],
            ].map(([k, v]) => (
              <div key={String(k)}>
                <dt className="text-[10px] font-medium tracking-wide text-slate-500 uppercase">{k}</dt>
                <dd className="mt-0.5 font-medium text-slate-900">{v}</dd>
              </div>
            ))}
          </dl>
        </header>
      )}

      <div className="relative px-12 pb-12">
        {/* Running header for the body pages */}
        <div className="flex items-center justify-between border-b border-slate-200 py-4 text-[10px] text-slate-500">
          <span className="flex items-center gap-2"><Logo size={16} /> <span className="font-semibold tracking-[0.14em] text-slate-700">AIVERA</span> · {m.report.title}</span>
          <span className="font-mono">{m.report.code}</span>
        </div>

        <div className="mt-6 flex gap-2.5 border-l-[3px] border-amber-400 bg-amber-50/70 px-3.5 py-2.5 text-[11.5px] text-amber-900">
          <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{m.sourceNotice}</p>
        </div>

        {/* Contents */}
        {included.length > 2 && (
          <nav aria-label="Contents" className="mt-8 break-inside-avoid">
            <p className="text-[10px] font-semibold tracking-[0.18em] text-slate-500 uppercase">Contents</p>
            <ol className="mt-3 grid gap-x-10 gap-y-1.5 text-[12px] sm:grid-cols-2">
              {included.map((s, i) => (
                <li key={s.key} className="flex items-baseline gap-2.5 border-b border-dotted border-slate-200 pb-1">
                  <span className="w-5 font-mono text-[11px]" style={{ color: BRAND }}>{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-slate-700">{s.title}</span>
                </li>
              ))}
            </ol>
          </nav>
        )}

        {show("assessment_info") && (
          <>
            <H n={num("assessment_info")}>Assessment Information</H>
            <T widths={["28%", "72%"]} head={["Item", "Detail"]} rows={[["Project", `${m.project.code} · ${m.project.name}`], ["Project owner", m.owner?.name ?? "N/A"], ["Organization", m.organization], ["Targets", m.targets.map((t) => `${t.name} (${t.url})`).join("; ")], ["Objectives", m.project.objectives], ["Generated", formatDateTime(m.report.createdAt)]]} />
          </>
        )}

        {show("executive_summary") && (
          <>
            <H n={num("executive_summary")}>Executive Summary</H>
            <p className="text-[13px] leading-relaxed text-slate-700">{m.report.executiveSummary || "No executive summary provided."}</p>
            <div className="mt-5 grid grid-cols-5 overflow-hidden rounded-lg border border-slate-200">
              {m.severityCounts.map((c) => (
                <div key={c.severity} className="border-r border-slate-200 px-3 py-3 last:border-r-0" style={{ borderTop: `3px solid ${SEVERITY_HEX[c.severity]}` }}>
                  <p className="text-[22px] leading-none font-semibold text-slate-900">{c.count}</p>
                  <p className="mt-1 text-[10px] font-medium tracking-wide text-slate-500 uppercase">{c.label}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10.5px] text-slate-500">Verified vulnerabilities by severity. Only findings confirmed by a person are counted.</p>
          </>
        )}

        {show("scope") && (
          <>
            <H n={num("scope")}>Scope and Authorization</H>
            <T head={["Target", "Environment", "In-scope hosts", "Excluded paths", "Authorization"]} rows={m.targets.map((t) => [<span className="font-medium text-slate-900">{t.name}</span>, ENVIRONMENTS[t.environment], <Mono>{t.scope.inScopeHosts.join(", ")}</Mono>, <Mono>{t.scope.excludedPaths.join(", ") || "None"}</Mono>, <span className="capitalize">{t.authorizationStatus} · {t.authorizationReference}</span>])} />
          </>
        )}

        {show("methodology") && (
          <>
            <H n={num("methodology")}>Methodology</H>
            <ol className="space-y-2 text-[12.5px] text-slate-700">
              {m.methodology.map((x, i) => (
                <li key={x} className="flex gap-3"><span className="font-mono text-[11px] text-slate-400">{i + 1}.</span><span>{x}</span></li>
              ))}
            </ol>
          </>
        )}

        {show("tools") && (
          <>
            <H n={num("tools")}>Tools Used</H>
            <T widths={["26%", "74%"]} head={["Tool", "Purpose"]} rows={m.tools.length ? m.tools.map((t) => [<span className="font-medium text-slate-900">{TOOL_META[t].label}</span>, TOOL_META[t].description]) : [["N/A", "No tool runs recorded"]]} />
            <p className="mt-2 text-[10.5px] text-slate-500">Scan records in period: {m.scanOrigins.real} live, {m.scanOrigins.imported} imported, {m.scanOrigins.simulated} simulated.</p>
          </>
        )}

        {show("summary") && (
          <>
            <H n={num("summary")}>Findings Summary</H>
            {has("severity_distribution") && (
              <div className="mb-5 space-y-2">
                {m.severityCounts.map((c) => (
                  <div key={c.severity} className="flex items-center gap-3 text-[11px]">
                    <span className="w-16 text-slate-600">{c.label}</span>
                    <div className="h-2 flex-1 rounded-full bg-slate-100">
                      <div className="h-full rounded-full" style={{ width: `${(c.count / maxCount) * 100}%`, background: SEVERITY_HEX[c.severity] }} />
                    </div>
                    <span className="w-6 text-right font-semibold text-slate-900">{c.count}</span>
                  </div>
                ))}
              </div>
            )}
            {has("findings_summary") && <T widths={["14%", "50%", "14%", "22%"]} head={["ID", "Finding", "Severity", "Target"]} rows={m.verified.length ? m.verified.map((f) => [<Mono>{f.code}</Mono>, f.title, <SevPill s={f.severity} />, targetName(f.targetId)]) : [["N/A", "No verified findings", "", ""]]} />}
            {m.excluded.length > 0 && <p className="mt-2 text-[11px] text-amber-700">{m.excluded.length} selected finding(s) are no longer confirmed and were excluded: {m.excluded.map((f) => f.code).join(", ")}.</p>}
          </>
        )}

        {show("detailed_findings") && (
          <>
            <H n={num("detailed_findings")}>Detailed Findings</H>
            {m.verified.length === 0 && <p className="text-[12.5px] text-slate-500">No verified findings.</p>}
            <div className="space-y-6">
              {m.verified.map((f) => (
                <section key={f.id} className="break-inside-avoid overflow-hidden rounded-lg border border-slate-200" style={{ borderLeft: `4px solid ${SEVERITY_HEX[f.severity]}` }}>
                  <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-3">
                    <div>
                      <p className="font-mono text-[10.5px] text-slate-500">{f.code}</p>
                      <p className="text-[14px] font-semibold text-slate-900">{f.title}</p>
                    </div>
                    <SevPill s={f.severity} />
                  </div>
                  <dl className="grid grid-cols-[130px_1fr] gap-x-4 gap-y-1.5 border-b border-slate-100 bg-slate-50/60 px-4 py-3 text-[11.5px]">
                    <dt className="text-slate-500">Verification</dt><dd>{VERIFICATION_STATUS[f.verificationStatus].label} by a human assessor</dd>
                    <dt className="text-slate-500">Category</dt><dd>{CATEGORY_BY_ID[f.category].name}{f.cwe ? ` · ${f.cwe}` : ""}{f.owasp ? ` · ${f.owasp}` : ""}</dd>
                    <dt className="text-slate-500">Affected asset</dt><dd><Mono>{f.affectedAsset}</Mono></dd>
                    <dt className="text-slate-500">Source</dt><dd>{SOURCE_LABEL[f.sourceTool]} {f.dataOrigin === "simulated" && <span className="font-semibold text-amber-700">(simulated)</span>}</dd>
                  </dl>
                  <div className="space-y-3 px-4 py-3 text-[12px] leading-relaxed text-slate-700">
                    <div><p className="text-[10px] font-semibold tracking-wide text-slate-500 uppercase">Description</p><p className="mt-0.5">{f.description}</p></div>
                    <div><p className="text-[10px] font-semibold tracking-wide text-slate-500 uppercase">Impact</p><p className="mt-0.5">{f.impact}</p></div>
                    {has("evidence") && (m.evidence[f.id] ?? []).map((e) => (
                      <div key={e.id}>
                        <p className="text-[10px] font-semibold tracking-wide text-slate-500 uppercase">Evidence · {e.title}</p>
                        <pre className="mt-1 overflow-hidden rounded-md border border-slate-200 bg-slate-50 p-2.5 font-mono text-[10.5px] leading-snug whitespace-pre-wrap text-slate-700">{e.content}</pre>
                      </div>
                    ))}
                    {has("remediation") && (
                      <div className="rounded-md bg-blue-50/70 px-3 py-2">
                        <p className="text-[10px] font-semibold tracking-wide uppercase" style={{ color: BRAND }}>Recommendation</p>
                        <p className="mt-0.5">{f.remediation}</p>
                      </div>
                    )}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}

        {show("risk_assessment") && (
          <>
            <H n={num("risk_assessment")}>Risk Assessment</H>
            <p className="mb-3 text-[11px] text-slate-500">Qualitative model: likelihood × impact, scored 1 to 25. Not CVSS.</p>
            <T widths={["18%", "52%", "30%"]} head={["Finding", "Risk score", "Mitigation"]} rows={m.verified.map((f) => [<Mono>{f.code}</Mono>, riskSummary(m.risks[f.id]), <span className="capitalize">{m.risks[f.id]?.mitigationStatus.replace("_", " ") ?? "N/A"}</span>])} />
          </>
        )}

        {show("remediation") && (
          <>
            <H n={num("remediation")}>Remediation Plan</H>
            <T widths={["14%", "50%", "18%", "18%"]} head={["Finding", "Action", "Status", "Due"]} rows={m.verified.flatMap((f) => (m.remediation[f.id]?.length ? m.remediation[f.id]!.map((t) => [<Mono>{f.code}</Mono>, t.title, REMEDIATION_STATUS[t.status].label, formatDate(t.dueDate)]) : [[<Mono>{f.code}</Mono>, f.remediation, "No task", "N/A"]]))} />
          </>
        )}

        {show("unverified") && (
          <>
            <H n={num("unverified")}>Appendix: Unverified Observations</H>
            <p className="mb-3 border-l-[3px] border-amber-400 bg-amber-50/70 px-3 py-2 text-[11.5px] text-amber-900">These observations have not been verified by an assessor and must not be treated as confirmed vulnerabilities.</p>
            <T widths={["14%", "50%", "18%", "18%"]} head={["ID", "Observation", "Status", "Origin"]} rows={m.unverified.length ? m.unverified.map((f) => [<Mono>{f.code}</Mono>, f.title, VERIFICATION_STATUS[f.verificationStatus].label, <span className="capitalize">{f.dataOrigin}</span>]) : [["N/A", "None in period", "", ""]]} />
          </>
        )}

        {show("conclusion") && (
          <>
            <H n={num("conclusion")}>Conclusion</H>
            <p className="text-[13px] leading-relaxed text-slate-700">{m.conclusion}</p>
          </>
        )}

        {show("assessor_info") && (
          <>
            <H n={num("assessor_info")}>Assessment Team</H>
            <T widths={["32%", "34%", "34%"]} head={["Name", "Role", "Contact"]} rows={m.assessors.map((u) => [<span className="font-medium text-slate-900">{u.name}</span>, u.title, u.email])} />
          </>
        )}

        <footer className="mt-12 flex items-center justify-between border-t border-slate-200 pt-3 text-[10px] text-slate-400">
          <span className="flex items-center gap-1.5"><Logo size={12} /> AIVERA · Confidential{m.hasSimulated ? " · includes demonstration data" : ""}</span>
          <span className="font-mono">{m.report.code}</span>
        </footer>
      </div>
    </article>
  );
}
