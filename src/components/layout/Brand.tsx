import { cn } from "@/lib/utils";

/** Simple solid shield mark — no gradients or glow. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-6 shrink-0", className)} aria-hidden>
      <path d="M12 2.5l7.5 3v5.6c0 4.7-3.2 8.4-7.5 9.9-4.3-1.5-7.5-5.2-7.5-9.9V5.5L12 2.5z" className="fill-primary" />
      <path d="M8.8 12.2l2.2 2.2 4.3-4.4" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="dark:stroke-[#202124]" />
    </svg>
  );
}

export function BrandWordmark({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <BrandMark />
      {!collapsed && <span className="truncate text-[18px] text-foreground">AEGIS <span className="text-muted-foreground">AI</span></span>}
    </div>
  );
}
