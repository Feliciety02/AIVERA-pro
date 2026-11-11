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
  /** First-run page tutorials (per browser). */
  tutorialsEnabled: boolean;
  seenTours: string[];
  activeTour: string | null;
  /** General "Demo mode" reminders (header chip, sidebar box, demo banners). Record labels stay. */
  showDemoNotices: boolean;
  /** Simple mode: a short menu in workflow order with plain names. Off shows every tool. */
  simpleMode: boolean;
  toggleSidebar: () => void;
  setMobileNav: (open: boolean) => void;
  setCommandOpen: (open: boolean) => void;
  startTour: (key: string) => void;
  finishTour: (key: string) => void;
  setTutorialsEnabled: (on: boolean) => void;
  resetTours: () => void;
  setShowDemoNotices: (on: boolean) => void;
  setSimpleMode: (on: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      mobileNavOpen: false,
      commandOpen: false,
      tutorialsEnabled: true,
      seenTours: [],
      activeTour: null,
      showDemoNotices: true,
      simpleMode: true,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setMobileNav: (open) => set({ mobileNavOpen: open }),
      setCommandOpen: (open) => set({ commandOpen: open }),
      startTour: (key) => set({ activeTour: key }),
      finishTour: (key) => set((s) => ({ activeTour: null, seenTours: s.seenTours.includes(key) ? s.seenTours : [...s.seenTours, key] })),
      setTutorialsEnabled: (on) => set({ tutorialsEnabled: on, activeTour: null }),
      resetTours: () => set({ seenTours: [], tutorialsEnabled: true }),
      setShowDemoNotices: (on) => set({ showDemoNotices: on }),
      setSimpleMode: (on) => set({ simpleMode: on }),
    }),
    {
      name: "aegis-ui",
      version: 3,
      // v2 → v3 adds Simple mode (on by default) and keeps everything else the user chose.
      migrate: (s, version) =>
        (version >= 2 ? { ...(s as object), simpleMode: true } : { ...(s as object), tutorialsEnabled: true, seenTours: [], showDemoNotices: true, simpleMode: true }) as unknown as UIState,
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, tutorialsEnabled: s.tutorialsEnabled, seenTours: s.seenTours, showDemoNotices: s.showDemoNotices, simpleMode: s.simpleMode }),
    },
  ),
);
