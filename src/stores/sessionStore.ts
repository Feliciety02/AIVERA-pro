import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ID } from "@/types";

/**
 * DEMO session. Selecting a demo account only changes which persona the UI
 * renders for. It is NOT authentication: anything in localStorage can be edited
 * by the user, so real access control must be enforced by the backend.
 */
interface SessionState {
  userId: ID | null;
  signIn: (userId: ID) => void;
  signOut: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      userId: null,
      signIn: (userId) => set({ userId }),
      signOut: () => set({ userId: null }),
    }),
    { name: "aegis-demo-session", version: 1 },
  ),
);

interface UIState {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  commandOpen: boolean;
  toggleSidebar: () => void;
  setMobileNav: (open: boolean) => void;
  setCommandOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      mobileNavOpen: false,
      commandOpen: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setMobileNav: (open) => set({ mobileNavOpen: open }),
      setCommandOpen: (open) => set({ commandOpen: open }),
    }),
    { name: "aegis-ui", version: 1, partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }) },
  ),
);
