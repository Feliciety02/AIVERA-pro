/**
 * Autofill for the human verification form.
 *
 * Recognises the kind of finding from its title, CWE, tool, ZAP rule number and evidence,
 * then offers (1) the decision that usually fits and why, and (2) ready texts for the notes
 * and reason. Facts AIVERA knows are filled in (date, tool, rule, page, parameter, CWE).
 * Anything only a person can know is left as a [blank] that must be filled before saving.
 *
 * These are suggestions only: the assessor reads, edits and decides.
 */
import type { Evidence, VerificationStatus, VulnerabilityFinding } from "@/types";

type Decision = Exclude<VerificationStatus, "pending">;

export interface SuggestionContext {
  finding: VulnerabilityFinding;
  evidence: Evidence[];
  /** Other findings on the same target, used to spot duplicates. */
  siblings: VulnerabilityFinding[];
}

interface Facts {
  date: string;
  code: string;
  title: string;
  asset: string;
  tool: string;
  plugin?: string;
  param?: string;
  cwe?: string;
  evidenceText: string;
  duplicateOf?: string;
  /** An earlier finding with the same title and page, e.g. from running the same scan again. */
  repeatOf?: string;
}

interface Template {
  notes: string;
  reason: string;
}

interface Rule {
  id: string;
  /** Short name shown to the user, e.g. "Missing security header". */
  label: string;
  match: (f: Facts, ctx: SuggestionContext) => boolean;
  recommend?: Decision;
  why?: string | ((f: Facts) => string);
  confirmed?: Template;
  rejected?: Template;
  needs_review?: Template;
}

export interface VerificationSuggestion {
  label: string;
  recommend?: Decision;
  why?: string;
  notes: string;
  reason: string;
  /** One-line reasons that fit the chosen decision, with facts filled in. */
  reasonChips: string[];
}

/** A blank the person must fill: [like this]. Redaction markers are not blanks. */
export const BLANK_RE = /\[(?!REDACTED)[^\]\n]{2,}\]/g;
export const findBlanks = (text: string) => text.match(BLANK_RE) ?? [];

const TOOL_NAME: Record<string, string> = { owasp_zap: "OWASP ZAP", nmap: "Nmap", manual: "manual testing", http_inspector: "the HTTP inspector", dns_utils: "DNS utilities" };

/** Today in the user's own time zone (toISOString would give the UTC date). */
function localDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function facts(ctx: SuggestionContext): Facts {
  const { finding: f, evidence, siblings } = ctx;
  const evidenceText = evidence.map((e) => `${e.title}\n${e.content}`).join("\n");
  const plugin = /Plugin:\s*(\d+)/.exec(evidenceText)?.[1];
  const rawParam = /Parameter:\s*([^\s·]+)/.exec(evidenceText)?.[1];
  const param = f.parameter || (rawParam && rawParam !== "N/A" && rawParam !== "—" ? rawParam : undefined);
  // Same CWE and same target from another finding usually means one issue reported twice.
  const earliestFirst = [...siblings].sort((a, b) => a.code.localeCompare(b.code));
  const dup = f.cwe ? earliestFirst.find((s) => s.id !== f.id && s.cwe === f.cwe && s.verificationStatus !== "rejected" && s.sourceTool !== f.sourceTool) : undefined;
  return {
    date: localDate(),
    code: f.code,
    title: f.title,
    asset: f.affectedAsset,
    tool: TOOL_NAME[f.sourceTool] ?? f.sourceTool,
    plugin,
    param,
    cwe: f.cwe,
    evidenceText,
    duplicateOf: dup?.code,
    repeatOf: earliestFirst.find((s) => s.id !== f.id && s.title === f.title && s.affectedAsset === f.affectedAsset && s.code < f.code)?.code,
  };
}

// Rules look at the title. Raw evidence (full header dumps) mentions many things, so it is only
// searched where a rule explicitly needs it (hasEvidence).
const has = (f: Facts, ...words: string[]) => words.some((w) => f.title.toLowerCase().includes(w.toLowerCase()));
const hasEvidence = (f: Facts, ...words: string[]) => words.some((w) => f.evidenceText.toLowerCase().includes(w.toLowerCase()));
const ruleRef = (f: Facts) => (f.plugin ? `${f.tool} rule ${f.plugin}` : f.tool);

// Missing response headers, keyed by ZAP rule number with title fallbacks.
const HEADERS: { plugins: string[]; words: string[]; header: string; risk: string }[] = [
  { plugins: ["10038"], words: ["content security policy", "csp header"], header: "Content-Security-Policy", risk: "limit the damage of injected scripts" },
  { plugins: ["10020"], words: ["anti-clickjacking", "x-frame-options", "clickjacking"], header: "X-Frame-Options (or CSP frame-ancestors)", risk: "stop the page being framed by another site" },
  { plugins: ["10021"], words: ["x-content-type-options"], header: "X-Content-Type-Options: nosniff", risk: "stop browsers guessing content types" },
  { plugins: ["10035"], words: ["strict-transport-security", "hsts"], header: "Strict-Transport-Security", risk: "force HTTPS on later visits" },
  { plugins: ["10063"], words: ["permissions policy"], header: "Permissions-Policy", risk: "limit browser features the page may use" },
];

const RULES: Rule[] = [
  {
    id: "simulated",
    label: "Simulated practice data",
    match: (_f, ctx) => ctx.finding.dataOrigin === "simulated",
    recommend: "rejected",
    why: "This finding came from a demo simulation, not a real scan, so it can't be real evidence.",
    rejected: { notes: "Finding {code} was generated by the demo simulation, not by a real tool run against the target.", reason: "Simulated practice data; not a real result." },
  },
  {
    id: "xsrf-cookie",
    label: "CSRF token cookie without HttpOnly",
    match: (f) => (f.plugin === "10010" || has(f, "httponly")) && /xsrf|csrf/i.test(f.param ?? ""),
    recommend: "rejected",
    why: "The flagged cookie is the framework's CSRF token. It is meant to be readable by JavaScript so the page can send it back, so a missing HttpOnly flag is expected.",
    rejected: {
      notes: "Re-checked on {date}: the flagged cookie is {param}, the CSRF token cookie that the framework intentionally exposes to JavaScript. The session cookie [name of session cookie] [has / does not have] HttpOnly.",
      reason: "False positive: the cookie is designed to be readable by scripts and is not a session identifier.",
    },
  },
  {
    id: "cookie-httponly",
    label: "Cookie without HttpOnly",
    match: (f) => f.plugin === "10010" || has(f, "no httponly", "httponly flag"),
    recommend: "confirmed",
    why: "A cookie readable by JavaScript can be stolen if any script injection exists. Check whether it is a session cookie.",
    confirmed: { notes: "Re-checked on {date}: Set-Cookie for {param} on {asset} has no HttpOnly attribute ([how you checked: browser DevTools / curl -I]).", reason: "Reproduced; cookie readable by JavaScript (CWE-1004)." },
  },
  {
    id: "cookie-secure",
    label: "Cookie without Secure",
    match: (f) => f.cwe === "CWE-614" || f.plugin === "10011" || has(f, "secure flag", "without secure"),
    recommend: "confirmed",
    why: "Without Secure, the cookie can travel over plain HTTP on an HTTPS site.",
    confirmed: { notes: "Checked on {date}: {param} cookie on {asset} is set without the Secure attribute ([where you saw it]).", reason: "Confirmed configuration gap for HTTPS deployments (CWE-614)." },
  },
  {
    id: "sri-third-party-fonts",
    label: "Subresource Integrity on a font stylesheet",
    match: (f) => (f.plugin === "90003" || has(f, "sub resource integrity", "subresource integrity")) && hasEvidence(f, "fonts.googleapis.com"),
    recommend: "rejected",
    why: "The flagged tag loads Google Fonts CSS, which Google generates per browser. A fixed integrity hash would break it, so SRI can't be applied.",
    rejected: { notes: "The only flagged resource is the Google Fonts stylesheet, which is generated per user agent; SRI cannot be applied. [Optional: self-host the fonts to remove the dependency.]", reason: "Not applicable to this resource: Google Fonts CSS is dynamic." },
  },
  {
    id: "sri",
    label: "Subresource Integrity missing",
    match: (f) => f.plugin === "90003" || has(f, "sub resource integrity", "subresource integrity"),
    recommend: "confirmed",
    why: "A third-party script or stylesheet without an integrity hash can be swapped by whoever controls that server.",
    confirmed: { notes: "Re-checked on {date}: {asset} loads [which external file] without an integrity attribute.", reason: "Reproduced; external resource loaded without integrity check (CWE-345)." },
  },
  {
    id: "security-headers",
    label: "Missing security headers",
    match: (f) => has(f, "security header"),
    recommend: "confirmed",
    why: "Several protective response headers are missing. Confirm by looking at the response headers in the browser or with curl -I.",
    confirmed: { notes: "Re-checked on {date}: responses from {asset} are missing [which headers]. [How you checked: browser DevTools / curl -I].", reason: "Reproduced; security headers missing ({cwe})." },
  },
  ...HEADERS.map<Rule>((h) => ({
    id: `header-${h.header}`,
    label: `Missing ${h.header.split(/[ :]/)[0]} header`,
    match: (f) => (!!f.plugin && h.plugins.includes(f.plugin)) || has(f, ...h.words),
    recommend: "confirmed",
    why: `The ${h.header} header is missing. It helps ${h.risk}. Easy to confirm by looking at the response headers.`,
    confirmed: {
      notes: `Re-checked on {date}: responses from {asset} have no ${h.header} header ([how you checked: browser DevTools / curl -I]). Reported by ${"{ruleRef}"}.`,
      reason: `Reproduced; ${h.header.split(/[ :]/)[0]} header missing (${"{cwe}"}).`,
    },
    rejected: {
      notes: `Re-checked on {date}: responses from {asset} [do include ${h.header} / the alert was for a non-HTML file where it does not matter].`,
      reason: "False positive: [why the header is present or not needed here].",
    },
  })),
  {
    id: "version-leak",
    label: "Server or framework version disclosed",
    match: (f) => ["10037", "10036"].includes(f.plugin ?? "") || has(f, "x-powered-by", "server leaks version", "version information"),
    recommend: "confirmed",
    why: "Revealing exact versions helps attackers look up known issues. Low severity, easy to confirm.",
    confirmed: { notes: "Re-checked on {date}: responses from {asset} include [header and value, e.g. X-Powered-By: PHP/8.x]. Reported by {ruleRef}.", reason: "Reproduced; software version disclosed in response headers (CWE-497)." },
  },
  {
    id: "zap-informational",
    label: "Informational scanner note",
    match: (f, ctx) => ctx.finding.severity === "info" && (["10109", "10112", "10104", "10111"].includes(f.plugin ?? "") || has(f, "modern web application", "session management response identified", "user agent fuzzer", "authentication request identified")),
    recommend: "rejected",
    why: "This is an informational note from the scanner that describes the site, not a weakness.",
    rejected: { notes: "{ruleRef} reported an informational alert ({title}) that describes the application and identifies no weakness.", reason: "Informational only; not a vulnerability." },
  },
  {
    id: "suspicious-comments",
    label: "Suspicious comments (low confidence)",
    match: (f) => f.plugin === "10027" || has(f, "suspicious comments"),
    recommend: "rejected",
    why: "The scanner matches words like \"query\" or \"todo\" anywhere in a file, often inside minified library code. Open the file and look for a real developer comment before deciding.",
    rejected: { notes: "Searched {asset} on {date} for comments containing [the flagged word]: [no developer comment found / the match is minified library code].", reason: "False positive (low-confidence pattern match, no real comment)." },
    confirmed: { notes: "Found a developer comment in {asset} on {date}: [quote the comment, remove any secrets].", reason: "Confirmed; comment reveals [what it reveals] (CWE-615)." },
  },
  {
    id: "timestamp",
    label: "Timestamp disclosure",
    match: (f) => has(f, "timestamp disclosure"),
    recommend: "rejected",
    why: "Usually a number in a file that happens to look like a date. Rarely a real issue.",
    rejected: { notes: "Checked {asset} on {date}: the flagged value [value] is [a version number / cache key / harmless date].", reason: "False positive: the value is not sensitive." },
  },
  {
    id: "hardcoded-credentials",
    label: "Hard-coded credentials",
    match: (f) => f.cwe === "CWE-798" || has(f, "hard-coded", "hardcoded"),
    recommend: "confirmed",
    why: "Passwords written in source code are known to anyone with the code. Confirm by finding them in the source, and ideally by signing in to your own local copy.",
    confirmed: { notes: "Reviewed {asset} source on {date}: a fixed username and password are compared before normal login. Signing in to the local copy with those values [result: reached the admin side / failed].", reason: "Confirmed by source review [and live sign-in]; hard-coded credentials grant access (CWE-798)." },
  },
  {
    id: "debug-exposure",
    label: "Debug or configuration exposure",
    match: (f) => has(f, "debug", "phpinfo", "stack trace", "/.env", "environment variable", "configuration without"),
    recommend: "confirmed",
    why: "Debug pages and configuration dumps show attackers how the system is built. Confirm by opening the page while signed out.",
    confirmed: { notes: "Re-checked on {date}: GET {asset} while signed out returned [what it showed]. [Route or file where it is defined].", reason: "Reproduced; sensitive configuration exposed without authentication (CWE-200)." },
  },
  {
    id: "brute-force",
    label: "Weak login protection",
    match: (f) => f.cwe === "CWE-307" || has(f, "brute", "lockout", "rate limit", "recaptcha"),
    recommend: "confirmed",
    why: "Weak lockouts let attackers guess passwords quickly. Confirm from the code, or with a few wrong logins on a test account.",
    confirmed: { notes: "Checked on {date}: [what you observed, e.g. after 5 wrong passwords the account unlocked after 10 seconds / code sets a 10 s lockout].", reason: "Confirmed; login allows rapid password guessing (CWE-307)." },
  },
  {
    id: "plaintext-password",
    label: "Plain-text password handling",
    match: (f) => ["CWE-256", "CWE-522", "CWE-319"].includes(f.cwe ?? "") || has(f, "plain-text password", "plaintext password", "plain text"),
    recommend: "confirmed",
    why: "Confirm the code path. Check whether any stored password is actually unhashed to set the severity.",
    confirmed: { notes: "Reviewed {asset} on {date}: [what the code does]. Stored passwords checked: [all hashed / some plain text].", reason: "Confirmed as a code weakness (CWE-256); severity [kept / lowered] because [reason]." },
  },
  {
    id: "cors",
    label: "Permissive cross-origin access (CORS)",
    match: (f) => f.cwe === "CWE-942" || has(f, "access-control-allow-origin", "cors"),
    recommend: "confirmed",
    why: "Any website can read this data from a visitor's browser. Whether it matters depends on whether the data is meant to be public.",
    confirmed: { notes: "Re-checked on {date}: {asset} returns data without login and sends Access-Control-Allow-Origin: *. Data returned: [what it contains].", reason: "Confirmed; any origin can read the response (CWE-942). Owner to decide if the data is public: [answer or pending]." },
    needs_review: { notes: "Confirmed {asset} sends Access-Control-Allow-Origin: * on {date}. Waiting for the owner to say whether [this data] is meant to be public.", reason: "Needs the owner to confirm whether the data is public." },
  },
  {
    id: "xss",
    label: "Cross-site scripting",
    match: (f) => f.cwe === "CWE-79" || has(f, "cross site scripting", "cross-site scripting", "xss"),
    recommend: "needs_review",
    why: "Scanners often flag reflections that are actually encoded. Reproduce with a harmless marker before confirming.",
    confirmed: { notes: "Reproduced on {date}: sent [harmless marker, e.g. <b>aivera</b>] in {param} on {asset}; the response [rendered it as HTML / reflected it unencoded].", reason: "Reproduced manually; input reflected without encoding (CWE-79)." },
    rejected: { notes: "Tested on {date}: the marker [marker] sent in {param} on {asset} came back HTML-encoded and did not execute.", reason: "False positive: output is encoded." },
  },
  {
    id: "sqli",
    label: "SQL injection",
    match: (f) => f.cwe === "CWE-89" || has(f, "sql injection", "sqli"),
    recommend: "needs_review",
    why: "Only confirm after a safe, non-destructive check (for example a quote causing a database error, or a true/false difference).",
    confirmed: { notes: "Reproduced on {date} with a non-destructive test: [what you sent to {param} on {asset} and the database error or difference you saw].", reason: "Reproduced manually; input reaches the database query unsafely (CWE-89)." },
    rejected: { notes: "Tested {param} on {asset} on {date} with [test]; the application [handled it safely / used parameterised queries].", reason: "False positive: input is handled safely." },
  },
  {
    id: "exposed-files",
    label: "Exposed file or directory listing",
    match: (f) => ["CWE-548", "CWE-538", "CWE-530"].includes(f.cwe ?? "") || has(f, "directory browsing", "directory listing", ".git", "backup file"),
    recommend: "confirmed",
    why: "Confirm by opening the address while signed out and noting what is visible.",
    confirmed: { notes: "Re-checked on {date}: GET {asset} returned [what was listed or downloadable].", reason: "Reproduced; files exposed to anyone (CWE-548)." },
  },
  {
    id: "access-control",
    label: "Access control",
    match: (f) => ["CWE-639", "CWE-284", "CWE-285", "CWE-862", "CWE-863"].includes(f.cwe ?? "") || has(f, "idor", "authorization", "access control", "without authentication"),
    recommend: "needs_review",
    why: "Confirm with two test accounts: can one see or change the other's data?",
    confirmed: { notes: "Reproduced on {date} with test accounts [A] and [B]: account [A] could [view / change] [what] belonging to [B] at {asset}.", reason: "Reproduced manually; missing authorization check (CWE-639)." },
  },
  {
    id: "open-port",
    label: "Open port or service",
    match: (_f, ctx) => ctx.finding.sourceTool === "nmap",
    recommend: "needs_review",
    why: "An open port is only a problem if the service shouldn't be reachable or is outdated. Check it against the owner's list of expected services.",
    confirmed: { notes: "Nmap on {date} found {asset} open. The owner [does not expect / expects] this service. Version: [version].", reason: "Confirmed; unexpected or outdated service exposed." },
    rejected: { notes: "Nmap on {date} found {asset} open; this is the application's normal port and is expected.", reason: "Expected service; not a vulnerability." },
  },
];

const GENERIC: Record<Decision, Template> = {
  confirmed: { notes: "Re-checked on {date} using [method: browser, curl, source review]: [what you did on {asset}] and [what you saw]. Matches the evidence from {ruleRef}.", reason: "Reproduced manually; matches the reported evidence." },
  rejected: { notes: "Checked on {date}: [what you did on {asset}] showed [why the issue is not real or not relevant].", reason: "False positive: [why the tool was wrong]." },
  needs_review: { notes: "Looked at {asset} on {date}: [what is still unclear] needs [owner input / a test account / a retest].", reason: "Needs further review: [what is needed]." },
};

const REASON_CHIPS: Record<VerificationStatus, string[]> = {
  confirmed: ["Reproduced manually; matches the reported evidence.", "Confirmed by source code review.", "Confirmed by two independent tools and a manual check.", "Re-checked live on {date}; issue still present."],
  rejected: ["False positive: [why the tool was wrong].", "Duplicate of [FND-xxxx].", "Informational only; not a vulnerability.", "Not applicable to this resource: [why].", "Simulated practice data; not a real result."],
  needs_review: ["Needs the owner to confirm [question].", "Needs a test account to reproduce.", "Could not reproduce yet; retest after [condition]."],
  pending: ["Reopened for another review: [why]."],
};

function fill(text: string, f: Facts): string {
  return text
    .replaceAll("{date}", f.date)
    .replaceAll("{code}", f.code)
    .replaceAll("{title}", f.title)
    .replaceAll("{asset}", f.asset)
    .replaceAll("{tool}", f.tool)
    .replaceAll("{ruleRef}", ruleRef(f))
    .replaceAll("{param}", f.param ?? "[cookie or parameter name]")
    .replaceAll("({cwe})", f.cwe ? `(${f.cwe})` : "")
    .replaceAll("{cwe}", f.cwe ?? "")
    .replace(/\s+\./g, ".");
}

/** Builds the autofill for one finding and the decision the assessor chose. */
export function suggestVerification(ctx: SuggestionContext, status: VerificationStatus): VerificationSuggestion {
  const f = facts(ctx);
  if (f.repeatOf && ctx.finding.dataOrigin !== "simulated") {
    const t: Template = {
      notes: `${ctx.finding.code} repeats ${f.repeatOf} (same issue on the same page, found again by a later scan). The original finding and its decision are kept on ${f.repeatOf}.`,
      reason: `Duplicate of ${f.repeatOf} (found again by a later scan).`,
    };
    const tpl = status === "rejected" ? t : status === "pending" ? { notes: "Reopened on {date}: [why this finding needs another look].", reason: "Reopened for another review: [why]." } : (GENERIC[status] as Template);
    return {
      label: "Repeat of an earlier finding",
      recommend: "rejected",
      why: `This is the same issue on the same page as ${f.repeatOf}, found again by a later scan. Decide on ${f.repeatOf} and reject this one as a duplicate, so the report doesn't count it twice.`,
      notes: fill(tpl.notes, f),
      reason: fill(tpl.reason, f),
      reasonChips: [...new Set([t.reason, ...REASON_CHIPS[status].map((c) => fill(c, f))])],
    };
  }
  const rule = RULES.find((r) => r.match(f, ctx));
  const decision: Decision = status === "pending" ? "needs_review" : status;
  // A duplicate beats a generic match: same weakness already recorded by another tool.
  const duplicate = !rule?.recommend || rule.id.startsWith("header-") || rule.id === "version-leak" || rule.id === "security-headers" ? f.duplicateOf : undefined;
  const template = (status === "rejected" && duplicate
    ? { notes: `The same weakness (${f.cwe}) on this target is already recorded as ${duplicate}, with its own evidence.`, reason: `Duplicate of ${duplicate}.` }
    : rule?.[decision]) ?? GENERIC[decision];
  const why = typeof rule?.why === "function" ? rule.why(f) : rule?.why;
  return {
    label: rule?.label ?? "General finding",
    recommend: duplicate && ctx.finding.sourceTool === "manual" ? "rejected" : rule?.recommend,
    why: duplicate && ctx.finding.sourceTool === "manual" ? `${why ?? ""} Note: ${duplicate} reports the same weakness (${f.cwe}) from a scanner; one of the two is likely a duplicate.`.trim() : why,
    notes: status === "pending" ? fill("Reopened on {date}: [why this finding needs another look].", f) : fill(template.notes, f),
    reason: status === "pending" ? fill(REASON_CHIPS.pending[0]!, f) : fill(template.reason, f),
    reasonChips: [...new Set([fill(template.reason, f), ...REASON_CHIPS[status].map((c) => fill(c, f)), ...(duplicate ? [`Duplicate of ${duplicate}.`] : [])])],
  };
}
