import type { VulnerabilityFinding } from "@/types";

type FindingIdentity = { targetId: string; sourceTool: string; templateKey: string; affectedAsset: string; parameter?: string | null; title?: string };

export const awaitsReview = (finding: Pick<VulnerabilityFinding, "verificationStatus">) =>
  finding.verificationStatus === "pending" || finding.verificationStatus === "needs_review";

/** Stable identity for the same tool alert on the same asset across scan batches. */
export function findingKey(finding: FindingIdentity): string {
  let asset = finding.affectedAsset.trim();
  try {
    const url = new URL(asset);
    url.hash = "";
    url.searchParams.sort();
    asset = finding.sourceTool === "owasp_zap" && finding.templateKey.startsWith("import:zap:") ? url.origin : url.href;
  } catch { /* Nmap service labels are not URLs. */ }
  const parameter = finding.sourceTool === "owasp_zap" && finding.templateKey.startsWith("import:zap:") ? "" : finding.parameter ?? "";
  const title = finding.sourceTool === "owasp_zap" && finding.templateKey.startsWith("import:zap:") ? finding.title ?? "" : "";
  return [finding.targetId, finding.sourceTool, finding.templateKey, asset, parameter, title]
    .map((part) => part.trim().toLowerCase()).join("\u0000");
}

export function uniqueFindings<T extends FindingIdentity>(incoming: T[], existing: FindingIdentity[]): T[] {
  const seen = new Set(existing.map(findingKey));
  return incoming.filter((finding) => {
    const key = findingKey(finding);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
