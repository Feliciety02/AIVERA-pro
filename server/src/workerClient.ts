/** Starts scanWorker.ts for one tool run and waits for its answer. */
import { fork } from "node:child_process";
import { resolve } from "node:path";
import type { ScanConfig, Target } from "@/types";
import type { ParseResult } from "@/features/imports/parsers";
import type { AutomatedTool, RunOptions, ToolOutput } from "./automatedAssessment.ts";
import type { WorkerJob, WorkerReply } from "./scanWorker.ts";

const WORKER = resolve(process.cwd(), "server/src/scanWorker.ts");

/** Variables the worker may see. Everything else (DATABASE_URL, API keys, AIVERA_*_KEY) is left out. */
const PASS = [/^(path|pathext|systemroot|windir|comspec|temp|tmp|tmpdir|home|userprofile|appdata|localappdata|programdata|programfiles(\(x86\))?|programw6432|lang|tz)$/i, /^TSX_/, /^NODE_OPTIONS$/, /^AIVERA_(NMAP_PATH|ZAP_PATH|JAVA_PATH|ALLOWED_SCAN_HOSTS)$/];

export function workerEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { AIVERA_SCAN_WORKER: "1" };
  for (const [k, v] of Object.entries(source)) if (v !== undefined && PASS.some((re) => re.test(k))) env[k] = v;
  return env;
}

export function runToolInWorker(tool: AutomatedTool, target: Target, config: ScanConfig, opts: RunOptions = {}): Promise<ToolOutput & { checkedAddresses: string[] }> {
  return new Promise((done, fail) => {
    const child = fork(WORKER, [], { env: workerEnv(), execArgv: process.execArgv, serialization: "advanced", stdio: ["ignore", "inherit", "inherit", "ipc"] });
    let settled = false;
    const finish = (fn: () => void) => { if (settled) return; settled = true; clearTimeout(timer); fn(); };
    // The tool has its own time limit; this is the backstop if the worker itself hangs.
    const timer = setTimeout(() => { child.kill(); finish(() => fail(new Error(`${tool} worker exceeded its time limit.`))); }, config.timeLimitMinutes * 60_000 + 180_000);
    child.on("message", (r: WorkerReply) => finish(() => (r.ok ? done({ tool, raw: r.raw, parsed: r.parsed as ParseResult, checkedAddresses: r.checkedAddresses }) : fail(new Error(r.error)))));
    child.on("error", (e) => finish(() => fail(new Error(`Scan worker could not start: ${e.message}`))));
    child.on("exit", (code) => finish(() => fail(new Error(`Scan worker stopped unexpectedly (exit ${code}).`))));
    const job: WorkerJob = { tool, target, config, opts };
    child.send(job);
  });
}
