import { test } from "node:test";
import assert from "node:assert/strict";
import type { Target } from "@/types";
import { zapPlan } from "./automatedAssessment.ts";
import { assertEgressAllowed, isInternalAddress } from "./egress.ts";
import { workerEnv } from "./workerClient.ts";
import { inspectorAlerts } from "./inspector.ts";
import { isLoopbackUrl } from "@/features/scanPermissions";
import { open, seal } from "./secretBox.ts";

const target = (url: string) => ({ url, scope: { allowedPaths: ["/"], excludedPaths: [] } }) as unknown as Target;

test("signed-in plan adds the session header and never follows logout links", () => {
  const plan = zapPlan(target("http://127.0.0.1:8000"), 10, 1, "/zap/wrk", { auth: { headerName: "Cookie", value: "laravel_session=abc" } });
  assert.match(plan, /type: replacer/);
  assert.match(plan, /matchString: "Cookie"/);
  assert.match(plan, /replacementString: "laravel_session=abc"/);
  assert.match(plan, /log-\?out\|sign-\?out/);
  assert.match(plan, /postForm: false/);
  assert.equal(plan.includes("type: activeScan"), false);
});

test("active profile only builds for a loopback copy", () => {
  assert.match(zapPlan(target("http://127.0.0.1:8000"), 10, 1, "/zap/wrk", { active: true }), /type: activeScan/);
  assert.throws(() => zapPlan(target("https://umerch3-0-r74e.onrender.com"), 10, 1, "/zap/wrk", { active: true }), /only allowed against a copy/);
  assert.equal(isLoopbackUrl("http://localhost:8000"), true);
  assert.equal(isLoopbackUrl("http://127.1.2.3"), true);
  assert.equal(isLoopbackUrl("http://127.0.0.1.evil.com"), false);
});

test("egress blocks unlisted hosts and names that resolve inward", async () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "::ffff:10.0.0.1"]) assert.equal(isInternalAddress(ip), true, ip);
  for (const ip of ["8.8.8.8", "216.24.57.1", "2606:4700::1111"]) assert.equal(isInternalAddress(ip), false, ip);
  await assert.rejects(assertEgressAllowed("http://example.org", new Set(["127.0.0.1"])), /not on the server's live scan allowlist/);
  assert.deepEqual(await assertEgressAllowed("http://127.0.0.1:8000", new Set(["127.0.0.1"])), ["127.0.0.1"]);
  // "localhost.localdomain"-style tricks: an approved name that resolves to loopback is refused.
  await assert.rejects(assertEgressAllowed("http://localtest.me", new Set(["localtest.me"])), /internal address|did not resolve|ENOTFOUND|EAI_AGAIN/);
});

test("scan worker gets no database URL or secrets", () => {
  const env = workerEnv({ PATH: "/bin", DATABASE_URL: "file:x", GEMINI_API_KEY: "k", GROQ_API_KEY: "k", AIVERA_AUDIT_KEY: "k", AIVERA_SECRET_KEY: "k", AIVERA_ZAP_PATH: "C:/zap", AIVERA_ALLOWED_SCAN_HOSTS: "127.0.0.1", TSX_TSCONFIG_PATH: "x" });
  assert.deepEqual(Object.keys(env).sort(), ["AIVERA_ALLOWED_SCAN_HOSTS", "AIVERA_SCAN_WORKER", "AIVERA_ZAP_PATH", "PATH", "TSX_TSCONFIG_PATH"]);
});

test("stored sessions are encrypted and tamper-checked", () => {
  process.env.AIVERA_SECRET_KEY = "test-only-key"; // never touch server/.env from tests
  const sealed = seal("laravel_session=secret");
  assert.equal(sealed.includes("secret"), false);
  assert.equal(open(sealed), "laravel_session=secret");
  const parts = sealed.split(".");
  parts[3] = Buffer.from("x".repeat(22)).toString("base64");
  assert.throws(() => open(parts.join(".")));
});

test("inspector reports missing headers, weak cookies and legacy TLS without storing cookie values", () => {
  const alerts = inspectorAlerts(target("https://shop.example"), {
    request: "GET https://shop.example/", status: 200,
    headers: { server: "nginx/1.18.0", "x-content-type-options": "nosniff" },
    setCookies: ["laravel_session=SECRETVALUE; path=/"],
    tls: { protocol: "TLSv1.3", cipher: "x", authorized: true, daysLeft: 5, validTo: "Nov 18 2026" },
    legacyTls: ["TLSv1.1"], errors: [],
  });
  const ids = alerts.map((a) => a.pluginId);
  for (const id of ["insp-hsts", "insp-csp", "insp-framing", "insp-version-server", "insp-cookie-laravel_session", "insp-cert-expiring", "insp-legacy-tlsv11"]) assert.ok(ids.includes(id), id);
  assert.equal(ids.includes("insp-nosniff"), false);
  assert.equal(JSON.stringify(alerts).includes("SECRETVALUE"), false);
  // A local http copy is not flagged for missing HTTPS.
  const local = inspectorAlerts(target("http://127.0.0.1:8000"), { request: "", status: 200, headers: {}, setCookies: [], legacyTls: [], errors: [] });
  assert.equal(local.some((a) => a.pluginId === "insp-no-https"), false);
});
