import { test } from "node:test";
import assert from "node:assert/strict";
import type { Target } from "@/types";
import { zapPlan } from "./automatedAssessment.ts";

function patterns(plan: string, key: "includePaths" | "excludePaths"): RegExp[] {
  const after = plan.split(`${key}:\n`)[1] ?? "";
  const lines: string[] = [];
  for (const line of after.split("\n")) {
    if (!line.startsWith("      - ")) break;
    lines.push(line.trim());
  }
  return lines.filter((line) => line.startsWith("- "))
    .map((line) => new RegExp(JSON.parse(line.slice(2)) as string));
}

test("ZAP context stays on the approved origin and respects excluded paths", () => {
  const target = { url: "http://lab.test:3000", scope: { allowedPaths: ["/"], excludedPaths: ["/admin/*"] } } as unknown as Target;
  const plan = zapPlan(target, 5);
  const included = patterns(plan, "includePaths");
  const excluded = patterns(plan, "excludePaths");
  assert.equal(included.length, 1);
  assert.equal(excluded.length, 1);
  assert.equal(included[0]!.test("http://lab.test:3000/search"), true);
  assert.equal(included[0]!.test("http://lab.test.evil:3000/search"), false);
  assert.equal(included[0]!.test("https://lab.test:3000/search"), false);
  assert.equal(excluded[0]!.test("http://lab.test:3000/admin/users"), true);
  assert.equal(excluded[0]!.test("http://lab.test:3000/admin"), true);
  assert.equal(excluded[0]!.test("http://lab.test:3000/catalog"), false);
  assert.equal(plan.includes("type: activeScan"), false);
});

test("path-limited context does not include the rest of the site", () => {
  const target = { url: "https://lab.test", scope: { allowedPaths: ["/api/*"], excludedPaths: [] } } as unknown as Target;
  const included = patterns(zapPlan(target, 5), "includePaths");
  assert.equal(included[0]!.test("https://lab.test/api/items"), true);
  assert.equal(included[0]!.test("https://lab.test/admin"), false);
});

import { nmapPortsInScope, toolPermitted, urlHostInScope } from "@/features/scanPermissions";

test("scope host check accepts host:port entries and rejects other ports and hosts", () => {
  assert.equal(urlHostInScope("http://127.0.0.1:8000/", ["127.0.0.1:8000"]), true);
  assert.equal(urlHostInScope("http://127.0.0.1:8000/", ["127.0.0.1"]), true);
  assert.equal(urlHostInScope("http://127.0.0.1:8001/", ["127.0.0.1:8000"]), false);
  assert.equal(urlHostInScope("http://10.0.0.5:8000/", ["127.0.0.1:8000"]), false);
  assert.equal(urlHostInScope("https://shop.lab.test/", ["*.lab.test"]), true);
  assert.equal(urlHostInScope("https://lab.test.evil/", ["*.lab.test"]), false);
});

test("each live tool needs its own scope permission", () => {
  assert.equal(toolPermitted("nmap", ["Port and service discovery"]), true);
  assert.equal(toolPermitted("nmap", ["Passive reconnaissance"]), false);
  assert.equal(toolPermitted("owasp_zap", ["automated web scanning (rate-limited)"]), true);
  assert.equal(toolPermitted("owasp_zap", ["Manual verification of findings"]), false);
});

test("Nmap only probes explicitly approved ports", () => {
  assert.deepEqual(nmapPortsInScope("http://lab.test:3000", ["lab.test:3000"]), [3000]);
  assert.deepEqual(nmapPortsInScope("https://lab.test", ["lab.test:443"]), [443]);
  assert.deepEqual(nmapPortsInScope("http://lab.test:3000", ["lab.test"]), [80, 443, 3000]);
  assert.deepEqual(nmapPortsInScope("http://lab.test:3000", ["other.test:3000"]), []);
});
