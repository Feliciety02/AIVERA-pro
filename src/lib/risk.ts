import type { LikertScore, Risk, RiskLevel, Severity } from "@/types";

/**
 * Deterministic DEMO risk model: score = likelihood × impact (1–25).
 *
 * This is a simple qualitative matrix used for prioritisation in the demo.
 * It is NOT a CVSS score and must not be presented as one. A real CVSS v3.1/v4.0
 * calculator would be a separate implementation of the FIRST specification.
 */
export function riskScore(likelihood: number, impact: number): number {
  return likelihood * impact;
}

export function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 20) return "critical";
  if (score >= 12) return "high";
  if (score >= 6) return "medium";
  return "low";
}

export function riskLevel(risk: Pick<Risk, "likelihood" | "impact">): RiskLevel {
  return riskLevelFromScore(riskScore(risk.likelihood, risk.impact));
}

export const RISK_LEVEL_META: Record<RiskLevel, { label: string; color: string; cell: string }> = {
  critical: { label: "Critical", color: "var(--sev-critical)", cell: "bg-sev-critical/25 border-sev-critical/40" },
  high: { label: "High", color: "var(--sev-high)", cell: "bg-sev-high/20 border-sev-high/35" },
  medium: { label: "Medium", color: "var(--sev-medium)", cell: "bg-sev-medium/15 border-sev-medium/30" },
  low: { label: "Low", color: "var(--sev-low)", cell: "bg-sev-low/12 border-sev-low/25" },
};

/** Default likelihood/impact suggestion used when a risk record is created from a finding. */
export function defaultRiskInputs(severity: Severity): { likelihood: LikertScore; impact: LikertScore } {
  switch (severity) {
    case "critical":
      return { likelihood: 4, impact: 5 };
    case "high":
      return { likelihood: 4, impact: 4 };
    case "medium":
      return { likelihood: 3, impact: 3 };
    case "low":
      return { likelihood: 2, impact: 2 };
    default:
      return { likelihood: 1, impact: 1 };
  }
}

export const LIKELIHOOD_LABELS: Record<LikertScore, string> = { 1: "Rare", 2: "Unlikely", 3: "Possible", 4: "Likely", 5: "Almost certain" };
export const IMPACT_LABELS: Record<LikertScore, string> = { 1: "Negligible", 2: "Minor", 3: "Moderate", 4: "Major", 5: "Severe" };
