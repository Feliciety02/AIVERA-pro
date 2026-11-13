import * as React from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useDataStore } from "@/stores/dataStore";
import { IS_API } from "@/services";
import { refresh } from "@/services/api/sync";
import type { Notification } from "@/types";

const ACTIVE_POLL_MS = 5_000;
const IDLE_POLL_MS = 60_000;

/**
 * Full app only. Keeps data fresh while a scan runs (faster) or idles (slower), and pops up any
 * notification that arrives after the page loaded, so a scan that finishes, fails or is
 * interrupted is seen on whatever page you are on.
 */
export function LiveUpdates() {
  const navigate = useNavigate();
  const scanActive = useDataStore((s) => s.scans.some((x) => x.dataOrigin === "real" && (x.status === "queued" || x.status === "running")));
  const notifications = useDataStore((s) => s.notifications);
  const seen = React.useRef<Set<string> | null>(null);

  React.useEffect(() => {
    if (!IS_API) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh().catch(() => undefined);
    }, scanActive ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    return () => clearInterval(timer);
  }, [scanActive]);

  React.useEffect(() => {
    if (!IS_API) return;
    // The first list is history: remember it without popping anything up.
    if (!seen.current) {
      seen.current = new Set(notifications.map((n) => n.id));
      return;
    }
    const fresh = notifications.filter((n) => !n.read && !seen.current!.has(n.id));
    for (const n of notifications) seen.current.add(n.id);
    for (const n of fresh.slice(0, 3)) show(n, navigate);
  }, [notifications, navigate]);

  return null;
}

function show(n: Notification, navigate: (to: string) => void) {
  const opts = { description: n.message, duration: n.tone === "critical" || n.tone === "warning" ? 12_000 : 6_000, action: n.link ? { label: "Open", onClick: () => navigate(n.link!) } : undefined };
  if (n.tone === "critical") toast.error(n.title, opts);
  else if (n.tone === "warning") toast.warning(n.title, opts);
  else if (n.tone === "success") toast.success(n.title, opts);
  else toast.info(n.title, opts);
}
