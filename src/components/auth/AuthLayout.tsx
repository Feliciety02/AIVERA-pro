import * as React from "react";
import { Link } from "react-router";
import { ArrowLeft, CircleAlert, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/layout/Brand";
import { IS_API } from "@/services";
import { cn } from "@/lib/utils";

/* ------------------------------- Shared layout ------------------------------ */

/**
 * Google style sign in layout: a wide rounded card with the logo, title and subtitle on the
 * left and the form on the right (stacked on phones), a thin progress bar while busy, a
 * Back to home button, and a small footer under the card.
 */
export function AuthCard({ title, subtitle, busy, children }: { title: React.ReactNode; subtitle?: React.ReactNode; busy?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center bg-card sm:justify-center sm:bg-muted sm:px-6 sm:py-10 dark:sm:bg-background">
      <main
        className="relative grid w-full max-w-[1040px] flex-1 overflow-hidden bg-card px-6 pt-6 pb-8 sm:flex-none sm:rounded-[28px] sm:p-9 md:min-h-[400px] md:grid-cols-2 md:gap-x-12 md:p-10"
        aria-busy={busy}
      >
        {busy && (
          <div className="absolute inset-x-0 top-0 h-1 overflow-hidden bg-primary/15" role="progressbar" aria-label="Working">
            <div className="auth-progress h-full w-1/3 bg-primary" />
          </div>
        )}
        <div className="min-w-0">
          <Link
            to="/"
            className="-ml-3 inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/8 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ArrowLeft className="size-4" aria-hidden /> Back to home
          </Link>
          <BrandMark className="mt-5 size-12" />
          <h1 className="mt-5 text-[2rem] leading-tight font-normal md:text-[2.25rem]">{title}</h1>
          {subtitle && <div className="mt-4 text-base text-foreground/80">{subtitle}</div>}
        </div>
        <fieldset disabled={busy} className={cn("mt-8 min-w-0 transition-opacity md:mt-[4.75rem]", busy && "opacity-60")}>
          {children}
        </fieldset>
      </main>
      <footer className="flex w-full max-w-[1040px] flex-wrap items-center justify-between gap-2 bg-card px-6 py-4 text-xs text-muted-foreground sm:bg-transparent sm:px-3 dark:sm:bg-transparent">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="size-3.5" aria-hidden /> AIVERA{!IS_API && " · Frontend demo"}
        </span>
        <span>Only test systems you are authorized to test</span>
      </footer>
    </div>
  );
}

/** Outlined text field with a floating label and an inline error, like Google's. */
export const FloatingField = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string | null; trailing?: React.ReactNode; hint?: React.ReactNode }
>(function FloatingField({ label, error, trailing, hint, id, className, ...props }, ref) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  return (
    <div>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          placeholder=" "
          aria-invalid={!!error}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={cn(
            "peer h-14 w-full rounded-md border bg-transparent px-4 pt-1 text-base text-foreground outline-none transition-[border-color,box-shadow]",
            "border-input hover:border-foreground/40 focus:border-primary focus:shadow-[inset_0_0_0_1px_var(--color-primary)]",
            error && "border-destructive hover:border-destructive focus:border-destructive focus:shadow-[inset_0_0_0_1px_var(--color-destructive)]",
            trailing && "pr-12",
            className,
          )}
          {...props}
        />
        <label
          htmlFor={id}
          className={cn(
            "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 bg-card px-1 text-base text-muted-foreground transition-all",
            "peer-focus:top-0 peer-focus:text-xs peer-focus:text-primary",
            "peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:text-xs",
            error && "text-destructive peer-focus:text-destructive peer-[:not(:placeholder-shown)]:text-destructive",
          )}
        >
          {label}
        </label>
        {trailing && <div className="absolute top-1/2 right-2 -translate-y-1/2">{trailing}</div>}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="mt-2 flex items-start gap-2 text-xs text-destructive">
          <CircleAlert className="mt-px size-4 shrink-0" aria-hidden /> {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
