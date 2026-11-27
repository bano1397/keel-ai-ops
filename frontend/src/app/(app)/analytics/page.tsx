"use client";

import { useState } from "react";
import { AlertOctagon, Bot, Clock, Coins, LifeBuoy, MessagesSquare, PoundSterling, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AccuracyChart, CostChart, DonutChart, HBarChart, VBarChart, VolumeLatencyChart } from "@/components/charts/charts";
import { ErrorState, KpiCard, PageHeader } from "@/components/common";
import { useApi } from "@/hooks/use-api";
import { gbp, ms, num, pct, usd } from "@/lib/format";
import type { Analytics } from "@/lib/types";
import { cn } from "@/lib/utils";

function ChartCard({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const { data, error, loading, reload } = useApi<Analytics>("/api/analytics", { days });

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Volume, speed, accuracy and cost of the AI desk."
        actions={
          <div className="bg-muted/60 flex gap-1 rounded-lg p-1">
            {[7, 30, 90].map((d) => (
              <button key={d} onClick={() => setDays(d)} className={cn("rounded-md px-3 py-1 text-xs font-medium", days === d ? "bg-background shadow-sm" : "text-muted-foreground")}>
                {d}d
              </button>
            ))}
          </div>
        }
      />
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading || !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Conversations" value={num(data.kpis.conversations)} icon={MessagesSquare} hint={`Last ${days} days`} />
            <KpiCard label="Auto-resolution" value={pct(data.kpis.auto_resolution_pct)} icon={Bot} hint="Resolved without a human" />
            <KpiCard label="Response time" value={ms(data.kpis.avg_response_ms)} icon={Clock} hint={`p95 ${ms(data.kpis.p95_response_ms)}`} />
            <KpiCard label="Cost / conversation" value={usd(data.kpis.cost_per_conversation_usd)} icon={Coins} hint="LLM + embeddings" />
            <KpiCard label="Escalations" value={num(data.kpis.escalations)} icon={LifeBuoy} />
            <KpiCard label="Refunds" value={gbp(data.kpis.refunds_gbp)} icon={PoundSterling} hint={`${data.kpis.refunds_count} refunds`} />
            <KpiCard label="Pending reviews" value={num(data.kpis.pending_reviews)} icon={ShieldCheck} />
            <KpiCard label="Dead letters" value={num(data.kpis.dead_letters)} icon={AlertOctagon} />
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <ChartCard title="Daily volume and latency" description="Conversations per day against average response time">
              <VolumeLatencyChart data={data.series.daily} />
            </ChartCard>
            <ChartCard title="Accuracy over time" description="Human approval rate of AI replies vs offline eval score">
              <AccuracyChart data={data.series.accuracy} />
            </ChartCard>
          </div>
          <div className="grid gap-6 xl:grid-cols-3">
            <ChartCard title="Cost per conversation" className="xl:col-span-2">
              <CostChart data={data.series.daily} />
            </ChartCard>
            <ChartCard title="Routes">
              <DonutChart data={data.routes} />
            </ChartCard>
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <ChartCard title="Channels">
              <VBarChart data={Object.entries(data.channels).map(([label, value]) => ({ label, value }))} />
            </ChartCard>
            <ChartCard title="Top issues">
              <HBarChart data={data.top_issues.map((t) => ({ label: t.label, value: t.count }))} />
            </ChartCard>
          </div>
        </div>
      )}
    </div>
  );
}
