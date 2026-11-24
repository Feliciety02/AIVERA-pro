import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDataStore } from "@/stores/dataStore";
import { useSessionStore } from "@/stores/sessionStore";
import type { ID, Project, Target, User } from "@/types";
import { APP_NAME } from "@/lib/constants";

export function useCurrentUser(): User | undefined {
  const userId = useSessionStore((s) => s.userId);
  return useDataStore((s) => s.users.find((u) => u.id === userId));
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · ${APP_NAME}`;
  }, [title]);
}

/** Short artificial loading phase so skeleton states are demonstrable on first render. */
export function useInitialLoading(ms = 350): boolean {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return loading;
}

export interface Lookups {
  users: Record<ID, User>;
  projects: Record<ID, Project>;
  targets: Record<ID, Target>;
}

export function useLookups(): Lookups {
  const { users, projects, targets } = useDataStore(useShallow((s) => ({ users: s.users, projects: s.projects, targets: s.targets })));
  return useMemo(
    () => ({
      users: Object.fromEntries(users.map((u) => [u.id, u])),
      projects: Object.fromEntries(projects.map((p) => [p.id, p])),
      targets: Object.fromEntries(targets.map((t) => [t.id, t])),
    }),
    [users, projects, targets],
  );
}
