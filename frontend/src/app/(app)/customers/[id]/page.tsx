"use client";

import Link from "next/link";
import { use } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScoreLineChart } from "@/components/charts/charts";
import { ChannelBadge, EmptyState, ErrorState, LoadingBlock, StatusBadge } from "@/components/common";
import { useApi } from "@/hooks/use-api";
import { dateTime, gbp, initials, timeAgo } from "@/lib/format";
import type { CustomerProfile } from "@/lib/types";

export default function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, loading, reload } = useApi<CustomerProfile>(`/api/customers/${id}`);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) return <LoadingBlock rows={4} />;
  const { customer: c, orders, refunds, tickets, conversations, sentiment } = data;
  const lifetime = orders.reduce((s, o) => s + o.total_gbp, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar className="size-14">
          <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">{initials(c.name)}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            {c.name} <StatusBadge value={c.tier} />
            {c.vulnerable && <Badge variant="destructive">Vulnerable</Badge>}
          </h1>
          <div className="text-muted-foreground text-sm">
            {c.email}
            {c.phone && ` · ${c.phone}`}
            {c.telegram_chat_id && ` · Telegram ${c.telegram_chat_id}`} · customer since {new Date(c.created_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Lifetime spend", gbp(lifetime)],
          ["Orders", String(orders.length)],
          ["Refunded", gbp(refunds.filter((r) => r.status === "issued").reduce((s, r) => s + r.amount_gbp, 0))],
          ["Open tickets", String(tickets.filter((t) => t.status === "open").length)],
        ].map(([k, v]) => (
          <Card key={k} className="py-4">
            <CardContent className="px-5">
              <div className="text-muted-foreground text-xs">{k}</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{v}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardContent>
            <Tabs defaultValue="orders">
              <TabsList>
                <TabsTrigger value="orders">Orders</TabsTrigger>
                <TabsTrigger value="refunds">Refunds</TabsTrigger>
                <TabsTrigger value="tickets">Tickets</TabsTrigger>
                <TabsTrigger value="conversations">Conversations</TabsTrigger>
              </TabsList>
              <TabsContent value="orders" className="mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Carrier</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell>
                          <div className="font-mono text-xs">{o.id}</div>
                          <div className="text-muted-foreground text-xs">{dateTime(o.created_at)}</div>
                        </TableCell>
                        <TableCell className="max-w-64 truncate text-xs">{o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</TableCell>
                        <TableCell>
                          <StatusBadge value={o.status} />
                        </TableCell>
                        <TableCell className="text-xs">
                          {o.carrier ?? "—"}
                          {o.tracking && <div className="text-muted-foreground font-mono">{o.tracking}</div>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{gbp(o.total_gbp)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>
              <TabsContent value="refunds" className="mt-4">
                {refunds.length === 0 ? (
                  <EmptyState title="No refunds" />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Refund</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {refunds.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-xs">
                            #{r.id} · <span className="font-mono">{r.order_id}</span>
                          </TableCell>
                          <TableCell className="text-xs">{r.reason}</TableCell>
                          <TableCell>
                            <StatusBadge value={r.status} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{gbp(r.amount_gbp)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
              <TabsContent value="tickets" className="mt-4 space-y-3">
                {tickets.length === 0 && <EmptyState title="No tickets" />}
                {tickets.map((t) => (
                  <div key={t.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">#{t.id}</span>
                      <span className="text-xs capitalize">{t.kind.replace("_", " ")}</span>
                      <StatusBadge value={t.risk} />
                      <StatusBadge value={t.status} className="ml-auto" />
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs">{t.summary.issue}</p>
                  </div>
                ))}
              </TabsContent>
              <TabsContent value="conversations" className="mt-4 space-y-2">
                {conversations.map((cv) => (
                  <Link key={cv.id} href={`/conversations/${cv.id}`} className="hover:bg-muted/50 flex items-center gap-3 rounded-lg border p-3 text-sm">
                    <ChannelBadge channel={cv.channel} />
                    <span className="flex-1 truncate">{cv.last_message}</span>
                    <StatusBadge value={cv.status} />
                    <span className="text-muted-foreground text-xs">{timeAgo(cv.updated_at)}</span>
                  </Link>
                ))}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Sentiment</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tabular-nums">{sentiment.score.toFixed(2)}</span>
              <StatusBadge value={sentiment.label} />
            </div>
          </CardHeader>
          <CardContent>
            <ScoreLineChart data={sentiment.trend.map((t) => ({ x: t.day, y: t.score }))} name="Sentiment" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
