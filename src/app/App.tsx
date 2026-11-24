import * as React from "react";
import { RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/misc";
import { useDataStore } from "@/stores/dataStore";
import { resumeRunningSimulations } from "@/features/simulation/runner";
import { checkOverdueRemediation, checkUnverifiedFindings } from "@/features/notifications";
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

/**
 * Clicking anywhere on a toast that links somewhere (it has an action button such as "Open" or
 * "Review") does what that button does. Clicks on the buttons themselves are left alone.
 */
function useToastClick() {
  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      const toastEl = el?.closest("[data-sonner-toast]");
      if (!toastEl || el!.closest("button, a")) return;
      (toastEl.querySelector("[data-action]") as HTMLButtonElement | null)?.click();
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
}

export function App() {
  const theme = useThemeSync();
  useToastClick();
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
    const check = () => {
      checkOverdueRemediation();
      checkUnverifiedFindings();
    };
    check();
    const t = setInterval(check, 60 * 60 * 1000);
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
          // "system" follows the OS like the rest of the app (it used to fall through to dark).
          theme={theme}
          position="bottom-right"
          closeButton
          toastOptions={{
            // A light card in the app's own colours; the type shows as a coloured icon and edge.
            classNames: {
              // pr-10 leaves room for the close button, which sits inside the top-right corner.
              // A toast with a link (its action button) is clickable as a whole; see useToastClick.
              toast: "!rounded-2xl !border !border-border !bg-card !text-foreground !shadow-lg !text-[13px] !gap-3 !py-3.5 !pl-4 !pr-10 !border-l-4 has-[[data-action]]:cursor-pointer has-[[data-action]]:hover:!bg-accent/40",
              title: "!font-semibold !text-foreground",
              description: "!text-muted-foreground !leading-relaxed",
              icon: "!mt-0.5 !self-start",
              closeButton: "!left-auto !right-2.5 !top-2.5 ![transform:none] !size-6 !rounded-full !border-0 !bg-transparent !text-muted-foreground hover:!bg-accent hover:!text-foreground",
              actionButton: "!rounded-full !bg-primary !text-primary-foreground !font-medium",
              cancelButton: "!rounded-full !bg-muted !text-foreground",
              success: "!border-l-[var(--success)] [&_[data-icon]]:!text-[var(--success)]",
              error: "!border-l-[var(--sev-high)] [&_[data-icon]]:!text-[var(--sev-high)]",
              warning: "!border-l-[var(--warning)] [&_[data-icon]]:!text-[var(--warning)]",
              info: "!border-l-[var(--primary)] [&_[data-icon]]:!text-[var(--primary)]",
            },
          }}
        />
      )}
    </TooltipProvider>
  );
}
