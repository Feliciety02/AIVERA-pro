import { router } from "@/app/router";

/**
 * A toast action that opens a page. With it, the whole toast is clickable (see useToastClick in
 * App.tsx), so a notification about something always leads to that thing.
 */
export const toastLink = (to: string, label = "Open") => ({ label, onClick: () => void router.navigate(to) });
