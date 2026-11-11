import * as React from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useDataStore } from "@/stores/dataStore";
import { useSessionStore } from "@/stores/sessionStore";
import { authService } from "@/services";

const EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const;

/**
 * Signs out of the demo persona after the configured period of inactivity
 * (Settings → Security Preferences → Idle lock). Browser-only behaviour for the
 * demo; real session expiry must be enforced by the backend.
 */
export function useIdleLock() {
  const minutes = useDataStore((s) => s.settings.security.idleLockMinutes);
  const userId = useSessionStore((s) => s.userId);
  const signOut = authService.signOut;
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!userId || minutes <= 0) return;
    let last = Date.now();
    const bump = () => (last = Date.now());
    EVENTS.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const timer = setInterval(() => {
      if (Date.now() - last >= minutes * 60_000) {
        signOut();
        navigate("/login");
        toast.info("Demo session locked after inactivity", { description: `No activity for ${minutes} minutes. Choose a persona to continue.` });
      }
    }, 15_000);
    return () => {
      clearInterval(timer);
      EVENTS.forEach((e) => window.removeEventListener(e, bump));
    };
  }, [minutes, userId, signOut, navigate]);
}
