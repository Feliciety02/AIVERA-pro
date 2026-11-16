/** End-to-end API test against a disposable SQLite database and a loopback lab site. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const PASSWORD = "LocalLabTest#2026";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Session = { cookie: string; id: string };

test("authorized lab scan, review, remediation and report approval", { timeout: 120_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "aivera-e2e-"));
  const dbPath = join(dir, "lab.db");
  const dbUrl = `file:${dbPath.replace(/\\/g, "/")}`;
  const env = { ...process.env, DATABASE_URL: dbUrl, SEED_DEMO_PASSWORD: PASSWORD, RUST_LOG: "trace",
    GEMINI_API_KEY: "", AI_FALLBACK_BASE_URL: "", AI_FALLBACK_MODEL: "",
    AI_FALLBACK_2_BASE_URL: "", AI_FALLBACK_2_MODEL: "", AI_FALLBACK_3_BASE_URL: "", AI_FALLBACK_3_MODEL: "",
    AIVERA_LIVE_SCANS_ENABLED: "true",
    AIVERA_ALLOWED_SCAN_HOSTS: "127.0.0.1", AIVERA_TRUST_PROXY: "false", NODE_ENV: "development" };
  let api: ChildProcess | undefined;
  let apiOutput = "";
  let cookieHardened = false;
  const lab = createServer((req, res) => {
    const respond = () => {
      res.setHeader("Set-Cookie", `session_id=LOCAL_TEST_VALUE; Path=/${cookieHardened ? "; HttpOnly; SameSite=Lax" : ""}`);
      res.setHeader("Server", "aivera-local-lab/1.0");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<!doctype html><title>Authorized local test</title><h1>Local lab</h1>");
    };
    if (req.url === "/slow") setTimeout(respond, 2000);
    else respond();
  });
  try {
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { cwd: ROOT, env, stdio: "pipe" });
    execFileSync(process.execPath, ["--import", "tsx", "server/src/seed.ts"], { cwd: ROOT, env, stdio: "pipe" });
    await new Promise<void>((done) => lab.listen(0, "127.0.0.1", done));
    const labPort = (lab.address() as { port: number }).port;
    const port = 41000 + Math.floor(Math.random() * 10000);
    const startApi = (nodeEnv = "development") => {
      api = spawn(process.execPath, ["--import", "tsx", "server/src/index.ts"], {
        cwd: ROOT, env: { ...env, NODE_ENV: nodeEnv, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
      });
      api.stdout?.on("data", (b: Buffer) => { apiOutput += b.toString(); });
      api.stderr?.on("data", (b: Buffer) => { apiOutput += b.toString(); });
    };
    startApi();
    const base = `http://127.0.0.1:${port}/api`;
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { ready = (await fetch(`${base}/health`)).ok; } catch { /* starting */ }
      if (ready) break;
      await wait(200);
    }
    assert.ok(ready, `API did not start: ${apiOutput.slice(-1000)}`);

    async function call(path: string, method = "GET", body?: unknown, session?: Session, origin?: string) {
      const res = await fetch(`${base}${path}`, { method, headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(session ? { cookie: session.cookie } : {}), ...(origin ? { origin } : {}),
      }, body: body === undefined ? undefined : JSON.stringify(body) });
      const data = await res.json() as Record<string, any>;
      return { status: res.status, data, cookie: res.headers.get("set-cookie")?.split(";")[0] ?? "" };
    }
    async function login(email: string): Promise<Session> {
      const r = await call("/auth/login", "POST", { email, password: PASSWORD });
      assert.equal(r.status, 200, JSON.stringify(r.data));
      assert.ok(r.cookie);
      return { cookie: r.cookie, id: r.data.user.id as string };
    }
    const admin = await login("admin@aivera.local");
    const lead = await login("lead@aivera.local");
    const assessor = await login("assessor@aivera.local");
    const developer = await login("developer@aivera.local");
    const viewer = await login("viewer@aivera.local");
    assert.equal((await call("/projects", "POST", {}, viewer)).status, 403);
    assert.equal((await call("/projects", "POST", {}, admin, "https://cross-site.example")).status, 403);

    const now = new Date();
    const projectRes = await call("/projects", "POST", {
      name: "Authorized local lab", description: "Disposable loopback test of the assessment workflow.",
      assessmentType: "web_application", ownerId: assessor.id, leadId: lead.id,
      remediationOwnerId: developer.id, memberIds: [assessor.id, lead.id, developer.id],
      status: "in_progress", startDate: now.toISOString(),
      dueDate: new Date(now.getTime() + 86400_000).toISOString(),
      objectives: "Test the local lab and verify the resulting observations.", notes: "Test fixture only",
    }, admin);
    assert.equal(projectRes.status, 201, JSON.stringify(projectRes.data));
    const projectId = projectRes.data.id as string;
    const targetUrl = `http://127.0.0.1:${labPort}/`;
    const targetRes = await call("/targets", "POST", {
      name: "Loopback lab site", url: targetUrl, projectId,
      description: "Intentionally incomplete headers and a test cookie.", assetType: "web_application",
      environment: "lab", owner: "AIVERA test suite", authorizationStatus: "authorized",
      authorizationReference: "LOCAL-LAB-TEST", authorizationConfirmed: true, testingNotes: "Loopback only",
      scope: { inScopeHosts: [`127.0.0.1:${labPort}`], allowedPaths: ["/"], excludedPaths: [],
        allowedCategories: ["session", "config_https", "info_disclosure"],
        allowedActivities: ["Security header review"], restrictedActivities: ["Active scanning"] },
    }, admin);
    assert.equal(targetRes.status, 201, JSON.stringify(targetRes.data));
    const targetId = targetRes.data.id as string;
    const viewerData = await call("/bootstrap", "GET", undefined, viewer);
    assert.equal((viewerData.data.projects as Array<{ id: string }>).some((p) => p.id === projectId), false);

    const scanRes = await call("/scans/automated", "POST", { name: "Real loopback inspector run", projectId, targetId,
      config: { tools: ["http_inspector"], categories: ["session", "config_https", "info_disclosure"],
        profile: "passive", timeLimitMinutes: 5, requestsPerSecond: 1, maxConcurrency: 1,
        outputFormat: "json", respectExclusions: true, scopeConfirmed: true, authenticated: false },
    }, assessor);
    assert.equal(scanRes.status, 202, JSON.stringify(scanRes.data));
    const scanId = scanRes.data.id as string;
    let state: Record<string, any> = {};
    let scan: Record<string, any> | undefined;
    for (let i = 0; i < 120; i++) {
      state = (await call("/bootstrap", "GET", undefined, assessor)).data;
      scan = (state.scans as Array<Record<string, any>>).find((s) => s.id === scanId);
      if (scan?.status === "completed" || scan?.status === "failed") break;
      await wait(250);
    }
    assert.equal(scan?.status, "completed", `${JSON.stringify(scan)}\n${apiOutput.slice(-1500)}`);
    const result = (state.scanResults as Array<Record<string, any>>).find((r) => r.scanId === scanId);
    assert.ok(result);
    assert.equal((result.rawOutput as string).includes("LOCAL_TEST_VALUE"), false);
    const finding = (state.findings as Array<Record<string, any>>).find((f) => f.scanId === scanId && String(f.title).startsWith('Cookie "session_id"'));
    assert.ok(finding, "Expected a medium-severity cookie observation");
    assert.equal(finding.verificationStatus, "pending");
    const verified = await call(`/findings/${finding.id}/verifications`, "POST", {
      toStatus: "confirmed", notes: "Reproduced on the loopback lab response; the session cookie lacks HttpOnly.",
      decisionReason: "Observed directly in the test response", evidenceReviewed: true,
    }, assessor);
    assert.equal(verified.status, 200, JSON.stringify(verified.data));
    state = (await call("/bootstrap", "GET", undefined, assessor)).data;
    const task = (state.remediation as Array<Record<string, any>>).find((t) => t.findingId === finding.id);
    assert.ok(task, "Confirmation should create a fix task");
    assert.equal((await call(`/remediation/${task.id}/status`, "POST", { to: "in_progress", note: "Working on cookie flags" }, developer)).status, 200);
    assert.equal((await call(`/remediation/${task.id}/status`, "POST", { to: "awaiting_retest", note: "Cookie flag added in lab copy" }, developer)).status, 200);
    cookieHardened = true;
    const retestCookie = (await fetch(targetUrl)).headers.get("set-cookie") ?? "";
    assert.match(retestCookie, /; HttpOnly; SameSite=Lax/);
    assert.equal((await call(`/remediation/${task.id}/retest`, "POST", { result: "passed", note: "Observed the corrected test cookie" }, assessor)).status, 200);
    assert.equal((await call(`/remediation/${task.id}/status`, "POST", { to: "resolved", note: "Reviewed the passed retest" }, lead)).status, 200);

    const reportRes = await call("/reports", "POST", { title: "Local lab assessment report", projectId,
      targetIds: [targetId], templateId: "technical", periodStart: now.toISOString(), periodEnd: new Date().toISOString(),
      findingIds: [finding.id], includeUnverified: false, sections: ["cover", "assessment_info", "scope", "findings_summary", "detailed_findings"],
      executiveSummary: "A real loopback response was inspected. One cookie observation was verified and remediated.",
    }, assessor);
    assert.equal(reportRes.status, 201, JSON.stringify(reportRes.data));
    const reportId = reportRes.data.id as string;
    assert.equal((await call(`/reports/${reportId}/submit`, "POST", {}, assessor)).status, 200);
    assert.equal((await call(`/reports/${reportId}/approve`, "POST", { note: "Reviewed local lab evidence" }, assessor)).status, 403);
    assert.equal((await call(`/reports/${reportId}/approve`, "POST", { note: "Reviewed local lab evidence" }, lead)).status, 200);

    // A running tool is interrupted, then the next API process resumes the saved scan.
    const slowTarget = await call("/targets", "POST", {
      name: "Slow loopback fixture", url: `${targetUrl}slow`, projectId,
      description: "Same owned loopback server with a delayed response.", assetType: "web_application",
      environment: "lab", owner: "AIVERA test suite", authorizationStatus: "authorized",
      authorizationReference: "LOCAL-LAB-RESTART", authorizationConfirmed: true, testingNotes: "Restart test",
      scope: { inScopeHosts: [`127.0.0.1:${labPort}`], allowedPaths: ["/slow"], excludedPaths: [],
        allowedCategories: ["session", "config_https", "info_disclosure"], allowedActivities: ["Security header review"], restrictedActivities: [] },
    }, admin);
    assert.equal(slowTarget.status, 201, JSON.stringify(slowTarget.data));
    const restartScan = await call("/scans/automated", "POST", { name: "Restart recovery", projectId, targetId: slowTarget.data.id,
      config: { tools: ["http_inspector"], categories: ["session", "config_https", "info_disclosure"],
        profile: "passive", timeLimitMinutes: 5, requestsPerSecond: 1, maxConcurrency: 1,
        outputFormat: "json", respectExclusions: true, scopeConfirmed: true, authenticated: false },
    }, assessor);
    assert.equal(restartScan.status, 202, JSON.stringify(restartScan.data));
    const restartId = restartScan.data.id as string;
    for (let i = 0; i < 30; i++) {
      const b = (await call("/bootstrap", "GET", undefined, assessor)).data;
      if ((b.scans as Array<Record<string, any>>).find((s) => s.id === restartId)?.status === "running") break;
      await wait(100);
    }
    const stopped = new Promise<void>((done) => api!.once("exit", () => done()));
    api!.kill();
    await stopped;
    startApi();
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`${base}/health`)).ok) break; } catch { /* restarting */ }
      await wait(100);
    }
    let resumed: Record<string, any> | undefined;
    for (let i = 0; i < 100; i++) {
      const b = (await call("/bootstrap", "GET", undefined, assessor)).data;
      resumed = (b.scans as Array<Record<string, any>>).find((s) => s.id === restartId);
      if (resumed?.status === "completed" || resumed?.status === "failed") break;
      await wait(200);
    }
    assert.equal(resumed?.status, "completed", `${JSON.stringify(resumed)}\n${apiOutput.slice(-1500)}`);

    // Failed-login limits live in SQLite and survive a second API restart.
    for (let i = 0; i < 10; i++)
      assert.equal((await call("/auth/login", "POST", { email: "missing@local.test", password: "incorrect" })).status, 401);
    assert.equal((await call("/auth/login", "POST", { email: "missing@local.test", password: "incorrect" })).status, 429);
    const stoppedForProd = new Promise<void>((done) => api!.once("exit", () => done()));
    api!.kill();
    await stoppedForProd;
    startApi("production");
    let prodHealth: Response | undefined;
    for (let i = 0; i < 100; i++) {
      try { prodHealth = await fetch(`${base}/health`); if (prodHealth.ok) break; } catch { /* restarting */ }
      await wait(100);
    }
    assert.ok(prodHealth?.ok);
    assert.match(prodHealth.headers.get("content-security-policy") ?? "", /default-src 'self'/);
    const stoppedAgain = new Promise<void>((done) => api!.once("exit", () => done()));
    api!.kill();
    await stoppedAgain;
    startApi();
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`${base}/health`)).ok) break; } catch { /* restarting */ }
      await wait(100);
    }
    assert.equal((await call("/auth/login", "POST", { email: "missing@local.test", password: "incorrect" })).status, 429);

    if (process.env.AIVERA_WRITE_LAB_EVIDENCE === "1") {
      const out = join(ROOT, "docs", "evidence", "local-lab-2026-11-13");
      await mkdir(out, { recursive: true });
      await writeFile(join(out, "assessment.json"), JSON.stringify({
        authorization: "LOCAL-LAB-TEST (self-owned disposable loopback fixture)", targetUrl,
        scan: { id: scanId, status: scan?.status, tools: ["http_inspector"], startedAt: scan?.startedAt, completedAt: scan?.completedAt },
        result: { tool: result.tool, rawOutput: result.rawOutput },
        reviewedFinding: { code: finding.code, title: finding.title, severity: finding.severity, decision: "confirmed", remediation: "resolved after recorded retest", retestCookie: "session_id=[value hidden]; Path=/; HttpOnly; SameSite=Lax" },
        report: { id: reportId, title: reportRes.data.title, status: "final" },
        restartRecovery: { scanId: restartId, status: resumed?.status },
        loginThrottle: "Blocked after ten failed attempts and remained blocked after API restart",
        productionHeaders: "Content-Security-Policy observed on the API health response",
        limitations: "Loopback fixture only; no Nmap, ZAP, external site, AI provider, or production deployment was exercised.",
      }, null, 2));
    }
  } finally {
    if (api && api.exitCode === null) {
      const stopped = new Promise<void>((done) => api!.once("exit", () => done()));
      api.kill();
      await stopped;
    }
    await new Promise<void>((done) => lab.close(() => done()));
    if (dir.startsWith(join(tmpdir(), "aivera-e2e-"))) await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});
