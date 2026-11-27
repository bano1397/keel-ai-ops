"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bot, ExternalLink, UserRound, Headset } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ChannelBadge, ErrorState, LoadingBlock, StatusBadge } from "@/components/common";
import { ReviewActions } from "@/components/trace/review-actions";
import { TraceTimeline } from "@/components/trace/trace-timeline";
import { useApi } from "@/hooks/use-api";
import { dateTime, gbp, initials } from "@/lib/format";
import { subscribeLive } from "@/lib/sse";
import type { ConversationDetail, Message } from "@/lib/types";
import { cn } from "@/lib/utils";

function MessageRow({ m, onChange }: { m: Message; onChange: (m: Message) => void }) {
  const [showTrace, setShowTrace] = useState(m.status === "pending_review");
  const isUser = m.role === "user";
  const Icon = m.role === "user" ? UserRound : m.role === "human_agent" ? Headset : Bot;
  return (
    <div className={cn("flex gap-3", isUser ? "" : "flex-row-reverse")} data-testid={`message-${m.role}`}>
      <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", isUser ? "bg-muted" : "bg-primary/10 text-primary")}>
        <Icon className="size-4" />
      </div>
      <div className={cn("flex max-w-[85%] min-w-0 flex-col gap-2", isUser ? "items-start" : "items-end")}>
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <span className="font-medium capitalize">{m.role === "assistant" ? m.agent ?? "assistant" : m.role.replace("_", " ")}</span>
          <span>{dateTime(m.created_at)}</span>
          {m.role !== "user" && <StatusBadge value={m.status} />}
          {m.confidence !== null && <span className="tabular-nums">conf {Math.round(m.confidence * 100)}%</span>}
        </div>
        <div className={cn("rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap", isUser ? "bg-muted rounded-tl-sm" : "bg-primary/[0.06] border-primary/15 rounded-tr-sm border")}>{m.content}</div>
        {m.status === "pending_review" && (
          <ReviewActions messageId={m.id} content={m.content} onDone={(status, content) => onChange({ ...m, status, content })} />
        )}
        {m.trace && (
          <button className="text-primary text-xs font-medium hover:underline" onClick={() => setShowTrace((s) => !s)} data-testid="toggle-trace">
            {showTrace ? "Hide trace" : "Show agent trace"}
          </button>
        )}
        {m.trace && showTrace && (
          <div className="w-full min-w-0 sm:min-w-[560px]">
            <TraceTimeline trace={m.trace} />
          </div>
        )}
      </div>
    </div>
  );
}

export function ConversationView({ id, compact }: { id: number; compact?: boolean }) {
  const { data, setData, error, loading, reload } = useApi<ConversationDetail>(`/api/conversations/${id}`);

  useEffect(
    () =>
      subscribeLive((e) => {
        if (e.event === "message" && e.data.conversation_id === id) {
          setData((d) => (d ? { ...d, messages: [...d.messages.filter((m) => m.id !== e.data.id), e.data] } : d));
        }
      }),
    [id, setData],
  );

  if (loading && !data) return <LoadingBlock rows={4} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const { conversation, customer_profile: profile } = data;
  const c = profile.customer;
  const update = (m: Message) => setData({ ...data, messages: data.messages.map((x) => (x.id === m.id ? m : x)) });

  return (
    <div className={cn("grid gap-6", !compact && "xl:grid-cols-[1fr_320px]")}>
      <Card className="min-w-0">
        <CardHeader className="flex flex-row items-center gap-3 border-b">
          <Avatar className="size-10">
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">{initials(c.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 text-base">
              {c.name} {c.tier === "vip" && <StatusBadge value="vip" />}
              {c.vulnerable && <Badge variant="destructive">Vulnerable</Badge>}
            </CardTitle>
            <div className="text-muted-foreground text-xs">{c.email}</div>
          </div>
          <ChannelBadge channel={conversation.channel} />
          <StatusBadge value={conversation.status} />
          {compact && (
            <Button asChild variant="ghost" size="icon" aria-label="Open full conversation">
              <Link href={`/conversations/${id}`}>
                <ExternalLink className="size-4" />
              </Link>
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-6 py-2">
          {data.messages.map((m) => (
            <MessageRow key={m.id} m={m} onChange={update} />
          ))}
        </CardContent>
      </Card>
      {!compact && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tier</span>
                <span className="capitalize">{c.tier}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sentiment</span>
                <StatusBadge value={profile.sentiment.label} />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Orders</span>
                <span>{profile.orders.length}</span>
              </div>
              <Separator />
              {profile.orders.slice(0, 3).map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs">{o.id}</span>
                  <StatusBadge value={o.status} />
                  <span className="tabular-nums">{gbp(o.total_gbp)}</span>
                </div>
              ))}
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link href={`/customers/${c.id}`}>View profile</Link>
              </Button>
            </CardContent>
          </Card>
          {data.tickets.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Tickets</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.tickets.map((t) => (
                  <div key={t.id} className="space-y-1 rounded-lg border p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium capitalize">{t.kind.replace("_", " ")}</span>
                      <StatusBadge value={t.risk} />
                      <StatusBadge value={t.status} className="ml-auto" />
                    </div>
                    <p className="text-muted-foreground text-xs">{t.summary.issue}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
