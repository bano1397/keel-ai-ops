"use client";

import { useState } from "react";
import { Loader2, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminGate, ErrorState, KpiCard, LoadingBlock, PageHeader, StatusBadge } from "@/components/common";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { num, timeAgo } from "@/lib/format";
import type { OkResponse, OpsQueue, QueueStatus } from "@/lib/types";

function OpsBody() {
  const { data, setData, error, loading, reload } = useApi<OpsQueue>("/api/ops/queue");
  const [busy, setBusy] = useState<number | "report" | null>(null);

  async function retry(id: number, kind: "inbox" | "outbox" = "inbox") {
    setBusy(id);
    try {
      await api<OkResponse>(`/api/ops/queue/${kind}/${id}/retry`, { method: "POST" });
      setData((d) =>
        d
          ? kind === "inbox"
            ? { ...d, inbox: d.inbox.map((i) => (i.id === id ? { ...i, status: "pending" as QueueStatus, last_error: null } : i)) }
            : { ...d, outbox: d.outbox.map((o) => (o.id === id ? { ...o, status: "pending" as QueueStatus, last_error: null } : o)) }
          : d,
      );
      toast.success(`Item #${id} re-queued`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setBusy(null);
    }
  }

  async function sendReport() {
    setBusy("report");
    try {
      const r = await api<OkResponse>("/api/ops/report/send", { method: "POST" });
      toast.success(r.detail ?? "Daily report sent");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(null);
    }
  }

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) return <LoadingBlock />;
  const dead = [...data.inbox, ...data.outbox].filter((i) => i.status === "dead");

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={sendReport} disabled={busy === "report"}>
          {busy === "report" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Send daily report now
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-5">
        {(["pending", "processing", "retry", "dead", "done"] as QueueStatus[]).map((s) => (
          <KpiCard key={s} label={s.charAt(0).toUpperCase() + s.slice(1)} value={num(data.counts[s] ?? 0)} />
        ))}
      </div>
      <Card className="gap-3">
        <CardHeader>
          <CardTitle className="text-sm">Inbox · dead letters across queues: {dead.length}</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Item</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Sender</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Last error</TableHead>
                <TableHead className="pr-6 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.inbox.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="pl-6">
                    <div className="font-mono text-xs">#{i.id}</div>
                    <div className="text-muted-foreground text-xs">{timeAgo(i.created_at)}</div>
                  </TableCell>
                  <TableCell className="capitalize">{i.channel}</TableCell>
                  <TableCell className="max-w-40 truncate text-xs">{i.sender}</TableCell>
                  <TableCell>
                    <StatusBadge value={i.status} />
                  </TableCell>
                  <TableCell className="tabular-nums">{i.attempts}</TableCell>
                  <TableCell className="text-muted-foreground max-w-72 truncate font-mono text-xs">{i.last_error ?? "—"}</TableCell>
                  <TableCell className="pr-6 text-right">
                    {(i.status === "dead" || i.status === "retry") && (
                      <Button size="sm" variant="outline" disabled={busy === i.id} onClick={() => retry(i.id)}>
                        <RotateCcw className="size-3.5" />
                        Retry
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card className="gap-3">
        <CardHeader>
          <CardTitle className="text-sm">Outbox</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Item</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Body</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Last error</TableHead>
                <TableHead className="pr-6 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.outbox.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="pl-6 font-mono text-xs">#{o.id}</TableCell>
                  <TableCell className="capitalize">{o.channel}</TableCell>
                  <TableCell className="max-w-40 truncate text-xs">{o.recipient}</TableCell>
                  <TableCell className="max-w-72 truncate text-xs">{o.body}</TableCell>
                  <TableCell>
                    <StatusBadge value={o.status} />
                  </TableCell>
                  <TableCell className="tabular-nums">{o.attempts}</TableCell>
                  <TableCell className="text-muted-foreground max-w-72 truncate font-mono text-xs">{o.last_error ?? "—"}</TableCell>
                  <TableCell className="pr-6 text-right">
                    {(o.status === "dead" || o.status === "retry") && (
                      <Button size="sm" variant="outline" disabled={busy === o.id} onClick={() => retry(o.id, "outbox")}>
                        <RotateCcw className="size-3.5" />
                        Retry
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default function OpsPage() {
  return (
    <div>
      <PageHeader title="Ops" description="Message queues, dead letters and scheduled reports." />
      <AdminGate>
        <OpsBody />
      </AdminGate>
    </div>
  );
}
