import * as React from "react";
import { RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/misc";
import { useDataStore } from "@/stores/dataStore";
import { resumeRunningSimulations } from "@/features/simulation/runner";
import { checkOverdueRemediation } from "@/features/notifications";
import { setDisplayPreferences } from "@/lib/format";
import { router } from "./router";
import { Loader2 } from "lucide-react";
import { IS_API } from "@/services";
import { restoreSession } from "@/services/api/sync";
import { UNAUTHORIZED_EVENT } from "@/services/api/http";
import { useSessionStore } from "@/stores/sessionStore";

/** Applies the persisted theme preference to <html> and follows the OS when set to "system". */
function useThemeSync() {
  const theme = useDataStore((s) => s.settings.appearance.theme);
  const reduceMotion = useDataStore((s) => s.settings.appearance.reduceMotion);
  React.useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && mql.matches));
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, [theme]);
  React.useEffect(() => {
    document.documentElement.classList.toggle("motion-reduce", reduceMotion);
  }, [reduceMotion]);
  return theme;
}

export function App() {
  const theme = useThemeSync();
  const toastsEnabled = useDataStore((s) => s.settings.notifications.toastsEnabled);
  const general = useDataStore((s) => s.settings.general);
  const remediationDue = useDataStore((s) => s.settings.notifications.remediationDue);
  const remediation = useDataStore((s) => s.remediation);
  // Applied synchronously so the first render already uses the configured format/zone.
  setDisplayPreferences({ dateFormat: general.dateFormat, timezone: general.timezone });

  // API mode: restore the server session before rendering routes.
  const [ready, setReady] = React.useState(!IS_API);
  React.useEffect(() => {
    if (!IS_API) return;
    restoreSession().finally(() => setReady(true));
    const onUnauthorized = () => {
      useSessionStore.getState().signOut();
      // Public pages (landing, sign-in, sign-up) stay put; everything else needs a session.
      const path = window.location.pathname;
      if (path !== "/" && !path.startsWith("/login") && !path.startsWith("/signup")) void router.navigate("/login");
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  // Client-side jobs only exist in demo mode; the server handles them in API mode.
  React.useEffect(() => {
    if (!IS_API) resumeRunningSimulations();
  }, []);

  React.useEffect(() => {
    if (IS_API) return;
    checkOverdueRemediation();
    const t = setInterval(checkOverdueRemediation, 60 * 60 * 1000);
    return () => clearInterval(t);
  }, [remediation, remediationDue]);

  return (
    <TooltipProvider delayDuration={250}>
      {!ready ? (
        <div className="flex min-h-dvh items-center justify-center gap-3 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" /> Connecting to AIVERA server…
        </div>
      ) : (
        /* Re-mount on display-preference change so every formatted date re-renders. */
        <React.Fragment key={`${general.dateFormat}|${general.timezone}`}>
          <RouterProvider router={router} />
        </React.Fragment>
      )}
      {toastsEnabled && (
        <Toaster
          theme={theme === "light" ? "light" : "dark"}
          position="bottom-right"
          richColors
          closeButton
          toastOptions={{ classNames: { toast: "!border-border !text-[13px]" } }}
        />
      )}
    </TooltipProvider>
  );
}
