import { cn } from "@/lib/utils";

export function KeelMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path d="M8 11h16l-3.2 9.5a2 2 0 0 1-1.9 1.4h-5.8a2 2 0 0 1-1.9-1.4Z" className="fill-primary-foreground" opacity="0.95" />
      <path d="M16 6v5" className="stroke-primary-foreground" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function KeelLogo() {
  return (
    <div className="flex items-center gap-2.5">
      <KeelMark />
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-tight">Keel</div>
        <div className="text-muted-foreground text-[11px]">AI operations desk</div>
      </div>
    </div>
  );
}
