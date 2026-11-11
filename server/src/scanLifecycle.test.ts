import { test } from "node:test";
import assert from "node:assert/strict";
import { findingKey, uniqueFindings } from "@/features/scanLifecycle";
import type { VulnerabilityFinding } from "@/types";

const finding = (id: string, asset: string) => ({ id, targetId: "target-a", sourceTool: "owasp_zap", templateKey: "import:zap:10038", affectedAsset: asset, parameter: null }) as unknown as VulnerabilityFinding;

test("repeated findings are excluded across batches and within one batch", () => {
  const old = finding("old", "https://app.test/page?a=1&b=2");
  const repeated = finding("repeat", "https://app.test/page?b=2&a=1");
  const novel = { ...finding("new", "https://app.test/other"), templateKey: "import:zap:10020" };
  assert.equal(findingKey(old), findingKey(repeated));
  assert.deepEqual(uniqueFindings([repeated, novel, novel], [old]).map((item) => item.id), ["new"]);
});

test("a finding on another target stays distinct", () => {
  const old = finding("old", "https://app.test/page");
  const other = { ...old, id: "other", targetId: "target-b" };
  assert.deepEqual(uniqueFindings([other], [old]).map((item) => item.id), ["other"]);
});

test("ZAP alert identity survives instance ordering but keeps distinct alert names", () => {
  const first = { ...finding("first", "https://app.test/login"), title: "Missing CSP" };
  const reordered = { ...finding("second", "https://app.test/account"), title: "Missing CSP" };
  const different = { ...finding("third", "https://app.test/account"), title: "Other alert" };
  assert.equal(findingKey(first), findingKey(reordered));
  assert.deepEqual(uniqueFindings([reordered, different], [first]).map((item) => item.id), ["third"]);
});
