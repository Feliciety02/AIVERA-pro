/**
 * Scan worker: a separate Node process that runs ONE tool for ONE target, then exits.
 *
 * It is started by workerClient.ts with a stripped environment: no database URL, no AI keys, no
 * audit or credential keys. It has no database connection, so it can only return tool output; the
 * API process re-checks scope and stores the results. Before any tool runs, the worker applies the
 * egress rules in egress.ts.
 *
 * This is process isolation, not a network sandbox: the operating system does not stop the worker
 * from opening other connections. For network-level isolation, run this worker in a container or
 * VM whose firewall only allows the approved hosts (see README, "Scan worker").
 */
import type { ScanConfig, Target } from "@/types";
import { assertEgressAllowed } from "./egress.ts";
import { AUTOMATED_ADAPTERS, type AutomatedTool, type RunOptions } from "./automatedAssessment.ts";

export interface WorkerJob { tool: AutomatedTool; target: Target; config: ScanConfig; opts: RunOptions }
export type WorkerReply = { ok: true; raw: string; parsed: unknown; checkedAddresses: string[] } | { ok: false; error: string };

process.once("message", async (job: WorkerJob) => {
  let reply: WorkerReply;
  try {
    const checkedAddresses = await assertEgressAllowed(job.target.url);
    const out = await AUTOMATED_ADAPTERS[job.tool](job.target, job.config, job.opts);
    reply = { ok: true, raw: out.raw, parsed: out.parsed, checkedAddresses };
  } catch (e) {
    reply = { ok: false, error: (e as Error).message };
  }
  process.send?.(reply, () => process.exit(0));
});
