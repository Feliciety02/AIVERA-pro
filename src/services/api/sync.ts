/**
 * API mode keeps the database as the single source of truth. The Zustand store
 * becomes a read cache that is replaced by GET /api/bootstrap after sign-in and
 * after every successful mutation.
 */
import type { User } from "@/types";
import { useDataStore, type DataState } from "@/stores/dataStore";
import { useSessionStore } from "@/stores/sessionStore";
import { api } from "./http";

type Bootstrap = Omit<DataState, "seededAt"> & { me: User };

let inflight: Promise<void> | null = null;

export function refresh(): Promise<void> {
  // Coalesce concurrent refreshes (e.g. several quick mutations).
  inflight ??= api<Bootstrap>("/bootstrap", { silent: true })
    .then(({ me, ...data }) => {
      useDataStore.setState({ ...data, seededAt: new Date().toISOString() });
      useSessionStore.getState().signIn(me.id);
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export async function restoreSession(): Promise<boolean> {
  try {
    await api("/auth/me", { silent: true });
    await refresh();
    return true;
  } catch {
    useSessionStore.getState().signOut();
    return false;
  }
}
