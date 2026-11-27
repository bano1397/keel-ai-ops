"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, LifeBuoy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingBlock, PageHeader, StatusBadge } from "@/components/common";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import type { Ticket, TicketStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function EscalationsPage() {
  const { data, setData, error, loading, reload } = useApi<Ticket[]>("/api/tickets");
  const [filter, setFilter] = useState<TicketStatus>("open");
  const [busy, setBusy] = useState<number | null>(null);

  async function resolve(id: number) {
    setBusy(id);
    try {
      await api(`/api/tickets/${id}/resolve`, { method: "POST" });
      setData((d) => d?.map((t) => (t.id === id ? { ...t, status: "resolved" } : t)) ?? d);
      toast.success(`Ticket #${id} resolved`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not resolve");
    } finally {
      setBusy(null);
    }
  }

  const list = (data ?? []).filter((t) => t.status === filter);

  return (
    <div>
      <PageHeader
        title="Escalations"
        description="Tickets the AI handed to a human, with a summary of what it already did."
        actions={
          <div className="bg-muted/60 flex gap-1 rounded-lg p-1">
            {(["open", "resolved"] as const).map((s) => (
              <button key={s} onClick={() => setFilter(s)} className={cn("rounded-md px-3 py-1 text-xs font-medium capitalize", filter === s ? "bg-background shadow-sm" : "text-muted-foreground")}>
                {s}
              </button>
            ))}
          </div>
        }
      />
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <LoadingBlock />
      ) : list.length === 0 ? (
        <EmptyState icon={LifeBuoy} title={`No ${filter} tickets`} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.map((t) => (
            <Card key={t.id}>
              <CardHeader className="flex flex-row flex-wrap items-center gap-2">
                <CardTitle className="text-sm">#{t.id}</CardTitle>
                <span className="text-xs font-medium capitalize">{t.kind.replace("_", " ")}</span>
                <StatusBadge value={t.risk} />
                <span className="text-muted-foreground ml-auto text-xs">{timeAgo(t.created_at)}</span>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <div className="font-medium">{t.customer?.name ?? `Customer ${t.customer_id}`}</div>
                  <p className="mt-1">{t.summary.issue}</p>
                </div>
                {t.summary.customer_ask && (
                  <p>
                    <span className="text-muted-foreground">Customer wants: </span>
                    {t.summary.customer_ask}
                  </p>
                )}
                {t.summary.actions_taken && t.summary.actions_taken.length > 0 && (
                  <ul className="text-muted-foreground list-inside list-disc space-y-0.5 text-xs">
                    {t.summary.actions_taken.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                )}
                {t.summary.recommended_next && (
                  <div className="bg-primary/[0.06] rounded-lg px-3 py-2 text-xs">
                    <span className="font-medium">Next: </span>
                    {t.summary.recommended_next}
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1">
                  {t.conversation_id && (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/conversations/${t.conversation_id}`}>Open conversation</Link>
                    </Button>
                  )}
                  {t.status === "open" ? (
                    <Button size="sm" className="ml-auto" disabled={busy === t.id} onClick={() => resolve(t.id)}>
                      <CheckCircle2 className="size-4" />
                      Resolve
                    </Button>
                  ) : (
                    <StatusBadge value="resolved" className="ml-auto" />
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
