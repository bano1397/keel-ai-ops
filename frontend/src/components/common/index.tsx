"use client";

import { AlertTriangle, Lock, Mail, MessageCircle, Globe, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import type { Channel } from "@/lib/types";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const TONES: Record<string, string> = {
  open: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",
  escalated: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  resolved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  sent: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  issued: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  delivered: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  connected: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  done: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  positive: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  pending_review: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  pending_approval: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  proposed: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  retry: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  medium: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  in_transit: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",
  dispatched: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",
  processing: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",
  pending: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",
  edited: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20",
  rejected: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
  dead: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
  error: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
  high: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
  negative: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
  vip: "bg-primary/10 text-primary border-primary/20",
};

export function StatusBadge({ value, className }: { value: string | null | undefined; className?: string }) {
  if (!value) return null;
  return (
    <Badge variant="outline" className={cn("font-medium capitalize", TONES[value] ?? "text-muted-foreground", className)}>
      {value.replace(/_/g, " ")}
    </Badge>
  );
}

const CHANNEL_ICON: Record<Channel, LucideIcon> = { web: Globe, telegram: MessageCircle, email: Mail };

export function ChannelBadge({ channel }: { channel: Channel }) {
  const Icon = CHANNEL_ICON[channel] ?? Globe;
  return (
    <Badge variant="secondary" className="gap-1 font-normal capitalize">
      <Icon className="size-3" />
      {channel}
    </Badge>
  );
}

export function KpiCard({ label, value, hint, icon: Icon }: { label: string; value: string; hint?: string; icon?: LucideIcon }) {
  return (
    <Card className="gap-0 py-5">
      <CardContent className="px-5">
        <div className="text-muted-foreground flex items-center justify-between text-xs font-medium">
          {label}
          {Icon && <Icon className="size-4" />}
        </div>
        <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
        {hint && <div className="text-muted-foreground mt-1 text-xs">{hint}</div>}
      </CardContent>
    </Card>
  );
}

export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="border-destructive/30">
      <CardContent className="flex items-center gap-3 text-sm">
        <AlertTriangle className="text-destructive size-4" />
        <span className="flex-1">{message}</span>
        {onRetry && (
          <button onClick={onRetry} className="text-primary text-sm font-medium hover:underline">
            Retry
          </button>
        )}
      </CardContent>
    </Card>
  );
}

export function EmptyState({ title, description, icon: Icon }: { title: string; description?: string; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center">
      {Icon && <Icon className="text-muted-foreground mb-3 size-6" />}
      <div className="text-sm font-medium">{title}</div>
      {description && <div className="text-muted-foreground mt-1 max-w-sm text-sm">{description}</div>}
    </div>
  );
}

export function JsonBlock({ value, className }: { value: unknown; className?: string }) {
  return (
    <pre className={cn("bg-muted/60 max-h-56 overflow-auto rounded-lg p-3 font-mono text-[11.5px] leading-relaxed", className)}>
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function AdminGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== "admin") {
    return (
      <div data-testid="admin-required">
        <EmptyState icon={Lock} title="Admin access required" description="This area is limited to admins. Ask an admin if you need access." />
      </div>
    );
  }
  return <>{children}</>;
}
