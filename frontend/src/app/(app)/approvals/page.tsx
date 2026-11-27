"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCheck, PoundSterling } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChannelBadge, EmptyState, ErrorState, LoadingBlock, PageHeader, StatusBadge } from "@/components/common";
import { ReviewActions } from "@/components/trace/review-actions";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { gbp, timeAgo } from "@/lib/format";
import type { ApprovalsResponse, PendingRefund } from "@/lib/types";

function RefundCard({ r, onDone }: { r: PendingRefund; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  async function decide(approve: boolean) {
    setBusy(true);
    try {
      await api(`/api/refunds/${r.id}/decision`, { body: { approve } });
      toast.success(approve ? `Refund of ${gbp(r.amount_gbp)} issued` : "Refund rejected");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Decision failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-xl">
          <PoundSterling className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold tabular-nums">{gbp(r.amount_gbp)}</span>
            <span className="text-muted-foreground text-sm">of {gbp(r.order_total_gbp)}</span>
            <span className="font-mono text-xs">{r.order_id}</span>
            <StatusBadge value={r.status} />
          </div>
          <p className="mt-1 text-sm">{r.reason}</p>
          <div className="text-muted-foreground mt-1 text-xs">
            {r.customer.name} · requested by {r.created_by} · {timeAgo(r.created_at)}
            {r.conversation_id && (
              <>
                {" · "}
                <Link className="text-primary hover:underline" href={`/conversations/${r.conversation_id}`}>
                  conversation
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={() => decide(true)}>
            Approve refund
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => decide(false)}>
            Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ApprovalsPage() {
  const { data, setData, error, loading, reload } = useApi<ApprovalsResponse>("/api/approvals");
  const dropMessage = (id: number) => setData((d) => (d ? { ...d, messages: d.messages.filter((m) => m.id !== id) } : d));
  const dropRefund = (id: number) => setData((d) => (d ? { ...d, refunds: d.refunds.filter((r) => r.id !== id) } : d));

  return (
    <div>
      <PageHeader title="Approvals" description="Replies held for review and refunds above the £50 auto-refund limit." />
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <LoadingBlock />
      ) : data ? (
        <Tabs defaultValue="replies">
          <TabsList>
            <TabsTrigger value="replies">
              Replies <Badge variant="secondary">{data.messages.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="refunds">
              Refunds <Badge variant="secondary">{data.refunds.length}</Badge>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="replies" className="mt-4 space-y-4">
            {data.messages.length === 0 && <EmptyState icon={CheckCheck} title="Queue is clear" description="No replies are waiting for review." />}
            {data.messages.map((m) => (
              <Card key={m.id}>
                <CardHeader className="flex flex-row flex-wrap items-center gap-2">
                  <CardTitle className="text-sm">{m.customer.name}</CardTitle>
                  <ChannelBadge channel={m.channel} />
                  <Badge variant="secondary" className="capitalize">
                    {m.agent}
                  </Badge>
                  {m.confidence !== null && <span className="text-muted-foreground text-xs tabular-nums">confidence {Math.round(m.confidence * 100)}%</span>}
                  <Link href={`/conversations/${m.conversation_id}`} className="text-primary ml-auto text-xs font-medium hover:underline">
                    Open trace
                  </Link>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-muted rounded-xl px-4 py-3 text-sm">
                    <div className="text-muted-foreground mb-1 text-xs font-medium">Customer</div>
                    {m.customer_message}
                  </div>
                  <div className="border-primary/15 bg-primary/[0.05] rounded-xl border px-4 py-3 text-sm">
                    <div className="text-muted-foreground mb-1 text-xs font-medium">Draft reply</div>
                    {m.content}
                  </div>
                  <ReviewActions messageId={m.id} content={m.content} onDone={() => dropMessage(m.id)} />
                </CardContent>
              </Card>
            ))}
          </TabsContent>
          <TabsContent value="refunds" className="mt-4 space-y-4">
            {data.refunds.length === 0 && <EmptyState icon={PoundSterling} title="No refunds pending" />}
            {data.refunds.map((r) => (
              <RefundCard key={r.id} r={r} onDone={() => dropRefund(r.id)} />
            ))}
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  );
}
