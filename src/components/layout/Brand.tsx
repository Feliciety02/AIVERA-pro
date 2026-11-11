import { cn } from "@/lib/utils";

/** AIVERA logo (transparent, works on light and dark backgrounds). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src="/aivera-logo-128.webp"
      srcSet="/aivera-logo-128.webp 128w, /aivera-logo.webp 512w"
      sizes="(min-width: 1px) 64px"
      alt=""
      aria-hidden
      draggable={false}
      className={cn("size-6 shrink-0 object-contain select-none", className)}
    />
  );
}

export function BrandWordmark({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <BrandMark className="size-7" />
      {!collapsed && <span className="truncate text-[18px] font-medium tracking-wide text-foreground">AIVERA</span>}
    </div>
  );
}
