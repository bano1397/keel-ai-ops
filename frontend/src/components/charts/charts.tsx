"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { shortDay } from "@/lib/format";

const VARS = { primary: "--chart-1", secondary: "--chart-2", amber: "--chart-3", violet: "--chart-4", rose: "--chart-5", axis: "--muted-foreground", grid: "--border" } as const;
type Palette = Record<keyof typeof VARS, string>;
const FALLBACK: Palette = { primary: "#0f6b6b", secondary: "#3aa79a", amber: "#d9a441", violet: "#8b6fd1", rose: "#d9604f", axis: "#737373", grid: "#e5e5e5" };

function useColors(): { C: Palette; SEQ: string[] } {
  const { resolvedTheme } = useTheme();
  const [C, setC] = useState<Palette>(FALLBACK);
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    const next = { ...FALLBACK };
    for (const [k, v] of Object.entries(VARS)) {
      const val = cs.getPropertyValue(v).trim();
      if (val) next[k as keyof Palette] = val;
    }
    setC(next);
  }, [resolvedTheme]);
  return { C, SEQ: [C.primary, C.secondary, C.amber, C.violet, C.rose, C.axis] };
}

type Fmt = (v: number, name: string) => string;

function TooltipBox({ active, payload, label, fmt }: Partial<TooltipContentProps<number, string>> & { fmt?: Fmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover text-popover-foreground rounded-lg border px-3 py-2 text-xs shadow-md">
      {label !== undefined && <div className="mb-1 font-medium">{typeof label === "string" && /^\d{4}-/.test(label) ? shortDay(label) : String(label)}</div>}
      {payload.map((p) => (
        <div key={String(p.dataKey ?? p.name)} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: (p.color ?? (p.payload as { fill?: string })?.fill) as string }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto font-medium tabular-nums">{fmt ? fmt(Number(p.value), String(p.name)) : Number(p.value).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}


export function VolumeLatencyChart({ data }: { data: { day: string; count: number; avg_ms: number }[] }) {
  const { C } = useColors();
  const axis = { tick: { fontSize: 11, fill: C.axis }, tickLine: false, axisLine: false } as const;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="vol" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.primary} stopOpacity={0.3} />
            <stop offset="100%" stopColor={C.primary} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="day" tickFormatter={shortDay} minTickGap={24} {...axis} />
        <YAxis yAxisId="l" allowDecimals={false} {...axis} />
        <YAxis yAxisId="r" orientation="right" tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}s`} {...axis} />
        <Tooltip content={<TooltipBox fmt={(v, n) => (n === "Avg latency" ? `${(v / 1000).toFixed(2)}s` : v.toLocaleString())} />} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
        <Area yAxisId="l" type="monotone" dataKey="count" name="Conversations" stroke={C.primary} strokeWidth={2} fill="url(#vol)" />
        <Line yAxisId="r" type="monotone" dataKey="avg_ms" name="Avg latency" stroke={C.amber} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function AccuracyChart({ data }: { data: { day: string; human_approval_pct: number | null; eval_score: number | null }[] }) {
  const { C } = useColors();
  const axis = { tick: { fontSize: 11, fill: C.axis }, tickLine: false, axisLine: false } as const;
  const rows = data.map((d) => ({ day: d.day, approval: d.human_approval_pct, evals: d.eval_score === null ? null : d.eval_score * 100 }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="day" tickFormatter={shortDay} minTickGap={24} {...axis} />
        <YAxis domain={[60, 100]} tickFormatter={(v: number) => `${v}%`} {...axis} />
        <Tooltip content={<TooltipBox fmt={(v) => `${v.toFixed(1)}%`} />} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
        <Line type="monotone" dataKey="approval" name="Human approval %" stroke={C.primary} strokeWidth={2} dot={false} connectNulls />
        <Line type="monotone" dataKey="evals" name="Eval score" stroke={C.violet} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CostChart({ data }: { data: { day: string; cost: number; count: number }[] }) {
  const { C } = useColors();
  const axis = { tick: { fontSize: 11, fill: C.axis }, tickLine: false, axisLine: false } as const;
  const rows = data.map((d) => ({ day: d.day, cpc: d.count ? d.cost / d.count : 0 }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={rows} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
        <defs>
          <linearGradient id="cpc" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.secondary} stopOpacity={0.35} />
            <stop offset="100%" stopColor={C.secondary} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="day" tickFormatter={shortDay} minTickGap={24} {...axis} />
        <YAxis tickFormatter={(v: number) => `$${v.toFixed(3)}`} width={56} {...axis} />
        <Tooltip content={<TooltipBox fmt={(v) => `$${v.toFixed(4)}`} />} />
        <Area type="monotone" dataKey="cpc" name="Cost / conversation" stroke={C.secondary} strokeWidth={2} fill="url(#cpc)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data }: { data: Record<string, number> }) {
  const { SEQ } = useColors();
  const rows = Object.entries(data).map(([name, value]) => ({ name, value }));
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <div className="flex items-center gap-6">
      <div className="relative h-[200px] w-[200px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={2} stroke="none">
              {rows.map((r, i) => (
                <Cell key={r.name} fill={SEQ[i % SEQ.length]} />
              ))}
            </Pie>
            <Tooltip content={<TooltipBox />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-xl font-semibold tabular-nums">{total.toLocaleString()}</div>
          <div className="text-muted-foreground text-[11px]">routed</div>
        </div>
      </div>
      <ul className="flex-1 space-y-1.5 text-sm">
        {rows.map((r, i) => (
          <li key={r.name} className="flex items-center gap-2">
            <span className="size-2.5 rounded-full" style={{ background: SEQ[i % SEQ.length] }} />
            <span className="capitalize">{r.name}</span>
            <span className="text-muted-foreground ml-auto tabular-nums">{total ? Math.round((r.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HBarChart({ data, height = 220 }: { data: { label: string; value: number }[]; height?: number }) {
  const { C } = useColors();
  const axis = { tick: { fontSize: 11, fill: C.axis }, tickLine: false, axisLine: false } as const;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={C.grid} strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} {...axis} />
        <YAxis type="category" dataKey="label" width={150} {...axis} tick={{ fontSize: 11, fill: C.axis }} />
        <Tooltip cursor={{ fill: "var(--muted)" }} content={<TooltipBox />} />
        <Bar dataKey="value" name="Count" fill={C.primary} radius={[0, 4, 4, 0]} barSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function VBarChart({ data }: { data: { label: string; value: number }[] }) {
  const { C, SEQ } = useColors();
  const axis = { tick: { fontSize: 11, fill: C.axis }, tickLine: false, axisLine: false } as const;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" {...axis} tickFormatter={(v: string) => v.charAt(0).toUpperCase() + v.slice(1)} />
        <YAxis allowDecimals={false} {...axis} />
        <Tooltip cursor={{ fill: "var(--muted)" }} content={<TooltipBox />} />
        <Bar dataKey="value" name="Conversations" radius={[6, 6, 0, 0]} barSize={44}>
          {data.map((d, i) => (
            <Cell key={d.label} fill={SEQ[i % SEQ.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ScoreLineChart({ data, height = 240, domain = [-1, 1], name = "Score", pctAxis = false }: { data: { x: string; y: number }[]; height?: number; domain?: [number, number]; name?: string; pctAxis?: boolean }) {
  const { C } = useColors();
  const axis = { tick: { fontSize: 11, fill: C.axis }, tickLine: false, axisLine: false } as const;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="x" tickFormatter={shortDay} minTickGap={20} {...axis} />
        <YAxis domain={domain} tickFormatter={(v: number) => (pctAxis ? `${Math.round(v * 100)}%` : v.toFixed(1))} {...axis} />
        <Tooltip content={<TooltipBox fmt={(v) => (pctAxis ? `${(v * 100).toFixed(1)}%` : v.toFixed(2))} />} />
        <Line type="monotone" dataKey="y" name={name} stroke={C.primary} strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
