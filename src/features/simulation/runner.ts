/**
 * Drives SIMULATED scans forward in the browser. Timers live outside React so a
 * simulation keeps progressing while the user navigates. On reload, any scan
 * left in "running" state is resumed from its persisted progress.
 *
 * This module never performs network I/O.
 */
import { useDataStore } from "@/stores/dataStore";
import { stageFor } from "./generator";

const timers = new Map<string, ReturnType<typeof setInterval>>();
const TICK_MS = 450;

export function startSimulation(scanId: string, onDone?: (findingCount: number) => void) {
  if (timers.has(scanId)) return;
  const timer = setInterval(() => {
    const { scans, setScanProgress, completeSimulatedScan } = useDataStore.getState();
    const scan = scans.find((s) => s.id === scanId);
    if (!scan || scan.status !== "running") {
      stopSimulation(scanId);
      return;
    }
    // Deterministic step size: slower in the middle "analysis" phase.
    const step = scan.progress < 30 ? 6 : scan.progress < 80 ? 4 : 7;
    const next = Math.min(100, scan.progress + step);
    if (next >= 100) {
      stopSimulation(scanId);
      const count = completeSimulatedScan(scanId);
      onDone?.(count);
    } else {
      setScanProgress(scanId, next, stageFor(next));
    }
  }, TICK_MS);
  timers.set(scanId, timer);
}

export function stopSimulation(scanId: string) {
  const t = timers.get(scanId);
  if (t) clearInterval(t);
  timers.delete(scanId);
}

export function resumeRunningSimulations() {
  useDataStore
    .getState()
    .scans.filter((s) => s.status === "running" && s.dataOrigin === "simulated")
    .forEach((s) => startSimulation(s.id));
}
