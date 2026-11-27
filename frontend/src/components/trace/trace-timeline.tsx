"use client";

import { useState } from "react";
import { Bot, ChevronDown, Clock, Coins, FileText, GitBranch, Hash, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { JsonBlock, StatusBadge } from "@/components/common";
import { ms, usd } from "@/lib/format";
import type { Source, Trace, TraceStep } from "@/lib/types";
import { cn } from "@/lib/utils";

function ConfidenceBar({ value }: { value: number }) {
  const pctValue = Math.round(value * 100);
  const tone = value >= 0.85 ? "bg-primary" : value >= 0.7 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="flex items-center gap-2" data-testid="confidence-bar">
      <div className="bg-muted h-1.5 w-32 overflow-hidden rounded-full">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${pctValue}%` }} />
      </div>
      <span className="text-xs font-medium tabular-nums">{pctValue}%</span>
    </div>
  );
}

function Chip({ icon: Icon, children }: { icon: typeof Clock; children: React.ReactNode }) {
  return (
    <span className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium tabular-nums">
      <Icon className="size-3" />
      {children}
    </span>
  );
}

function Node({ icon: Icon, title, children, last }: { icon: typeof Clock; title: React.ReactNode; children?: React.ReactNode; last?: boolean }) {
  return (
    <li className="relative flex gap-3 pb-5">
      {!last && <span className="bg-border absolute top-7 bottom-0 left-[13px] w-px" />}
      <span className="bg-background text-primary ring-border z-10 flex size-7 shrink-0 items-center justify-center rounded-full ring-1">
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="text-sm font-medium">{title}</div>
        {children && <div className="mt-1.5 space-y-2">{children}</div>}
      </div>
    </li>
  );
}

function ToolStep({ step }: { step: TraceStep }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border p-3" data-testid="tool-call">
      <button className="flex w-full items-center gap-2 text-left" onClick={() => setOpen((o) => !o)}>
        <code className="text-primary font-mono text-xs font-semibold">{step.tool}</code>
        <span className="text-muted-foreground truncate text-xs">{step.reason}</span>
        <ChevronDown className={cn("text-muted-foreground ml-auto size-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div>
            <div className="text-muted-foreground mb-1 text-[11px] font-medium uppercase">Args</div>
            <JsonBlock value={step.args ?? {}} />
          </div>
          <div>
            <div className="text-muted-foreground mb-1 text-[11px] font-medium uppercase">Result</div>
            <JsonBlock value={step.result ?? null} />
          </div>
        </div>
      )}
    </div>
  );
}

export function SourceChips({ sources }: { sources: Source[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {sources.map((s) => {
        const label = (
          <>
            <span className="bg-primary/10 text-primary rounded px-1 font-semibold">{s.n}</span>
            <span className="max-w-56 truncate">
              {s.title}
              {s.section ? ` · ${s.section}` : ""}
              {s.page ? ` · p${s.page}` : ""}
            </span>
          </>
        );
        const cls = "hover:border-primary/40 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11.5px] transition-colors";
        return s.url ? (
          <a key={s.n} href={s.url} target="_blank" rel="noreferrer" className={cls}>
            {label}
          </a>
        ) : (
          <span key={s.n} className={cls}>
            {label}
          </span>
        );
      })}
    </div>
  );
}

export function TraceTimeline({ trace }: { trace: Trace }) {
  const agents = Array.from(new Set(trace.steps.map((s) => s.agent).filter((a) => a !== "router")));
  const tools = trace.steps.filter((s) => s.tool);
  const others = trace.steps.filter((s) => !s.tool && s.agent !== "router");
  return (
    <div className="bg-card rounded-xl border p-4" data-testid="trace-timeline">
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-semibold tracking-wide uppercase">Agent trace</span>
        <Chip icon={Hash}>
          {trace.tokens_in.toLocaleString()} in / {trace.tokens_out.toLocaleString()} out
        </Chip>
        <Chip icon={Coins}>{usd(trace.cost_usd)}</Chip>
        <Chip icon={Clock}>{ms(trace.latency_ms)}</Chip>
        <Chip icon={Bot}>{trace.model}</Chip>
      </div>
      <ol>
        <Node
          icon={GitBranch}
          title={
            <span className="flex flex-wrap items-center gap-2">
              Router <Badge variant="secondary">{trace.router.label}</Badge>
              <span className="text-muted-foreground">→</span>
              <Badge>{trace.router.route}</Badge>
              {trace.router.risk && <StatusBadge value={trace.router.risk} />}
            </span>
          }
        >
          <div className="flex flex-wrap items-center gap-3">
            <ConfidenceBar value={trace.router.confidence} />
            <span className="text-muted-foreground font-mono text-xs">{trace.router.model}</span>
          </div>
          {trace.router.reason && <p className="text-muted-foreground text-xs">{trace.router.reason}</p>}
        </Node>
        <Node icon={Bot} title={<span>Agent: {agents.join(", ") || trace.router.route}</span>}>
          {others.map((s, i) => (
            <p key={i} className="text-muted-foreground text-xs">
              {s.reason}
            </p>
          ))}
        </Node>
        {tools.length > 0 && (
          <Node icon={Wrench} title={`Tool calls (${tools.length})`}>
            {tools.map((s, i) => (
              <ToolStep key={i} step={s} />
            ))}
          </Node>
        )}
        <Node icon={FileText} title={`Retrieved sources (${trace.sources.length})`} last>
          <ul className="space-y-1.5">
            {trace.sources.map((s) => (
              <li key={s.n} className="flex items-center gap-2 text-xs">
                <span className="bg-primary/10 text-primary rounded px-1.5 font-semibold">{s.n}</span>
                <span className="truncate">
                  {s.title}
                  {s.section && <span className="text-muted-foreground"> · {s.section}</span>}
                  {s.page && <span className="text-muted-foreground"> · p{s.page}</span>}
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <span className="bg-muted h-1 w-16 overflow-hidden rounded-full">
                    <span className="bg-primary block h-full" style={{ width: `${Math.round(s.score * 100)}%` }} />
                  </span>
                  <span className="text-muted-foreground w-10 text-right font-mono tabular-nums">{s.score.toFixed(2)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Node>
      </ol>
      {trace.error && <div className="text-destructive mt-2 text-xs">Error: {trace.error}</div>}
    </div>
  );
}
