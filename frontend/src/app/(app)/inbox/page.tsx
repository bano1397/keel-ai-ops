"use client";

import { useEffect, useState } from "react";
import { Inbox as InboxIcon, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ChannelBadge, EmptyState, ErrorState, LoadingBlock, PageHeader, StatusBadge } from "@/components/common";
import { ConversationView } from "@/components/inbox/conversation-view";
import { useApi } from "@/hooks/use-api";
import { timeAgo } from "@/lib/format";
import { subscribeLive } from "@/lib/sse";
import type { Channel, ConversationStatus, ConversationSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const CHANNELS: (Channel | "")[] = ["", "web", "telegram", "email"];
const STATUSES: (ConversationStatus | "")[] = ["", "open", "escalated", "resolved"];

function Filter<T extends string>({ label, options, value, onChange }: { label: string; options: T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="bg-muted/60 flex items-center gap-1 rounded-lg p-1" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o || "all"}
          onClick={() => onChange(o)}
          className={cn("rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors", value === o ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
        >
          {o || "All"}
        </button>
      ))}
    </div>
  );
}

export default function InboxPage() {
  const [channel, setChannel] = useState<Channel | "">("");
  const [status, setStatus] = useState<ConversationStatus | "">("");
  const [selected, setSelected] = useState<number | null>(null);
  const [live, setLive] = useState(false);
  const { data, setData, error, loading, reload } = useApi<ConversationSummary[]>("/api/conversations", { channel, status });

  useEffect(
    () =>
      subscribeLive(
        (e) => {
          if (e.event !== "conversation") return;
          const c = e.data;
          setData((list) => {
            if (!list) return list;
            const rest = list.filter((x) => x.id !== c.id);
            const matches = (!channel || c.channel === channel) && (!status || c.status === status);
            return matches ? [c, ...rest] : rest;
          });
        },
        setLive,
      ),
    [channel, status, setData],
  );

  const list = data ?? [];
  const current = selected ?? list[0]?.id ?? null;

  return (
    <div>
      <PageHeader
        title="Inbox"
        description="Every customer conversation across web, Telegram and email."
        actions={
          <Badge variant="outline" className="gap-1.5">
            <Radio className={cn("size-3", live ? "text-emerald-500" : "text-muted-foreground")} />
            {live ? "Live" : "Offline"}
          </Badge>
        }
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <Filter label="Channel" options={CHANNELS} value={channel} onChange={setChannel} />
        <Filter label="Status" options={STATUSES} value={status} onChange={setStatus} />
      </div>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <Card className="gap-0 overflow-hidden p-0">
            {loading && !data ? (
              <div className="p-3">
                <LoadingBlock rows={5} />
              </div>
            ) : list.length === 0 ? (
              <div className="p-4">
                <EmptyState icon={InboxIcon} title="No conversations" description="Nothing matches these filters." />
              </div>
            ) : (
              <ul className="divide-y" data-testid="conversation-list">
                {list.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => setSelected(c.id)}
                      data-testid={`conversation-${c.id}`}
                      className={cn("w-full px-4 py-3.5 text-left transition-colors", current === c.id ? "bg-accent" : "hover:bg-muted/50")}
                    >
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{c.customer.name}</span>
                        {c.customer.tier === "vip" && <StatusBadge value="vip" />}
                        <span className="text-muted-foreground ml-auto shrink-0 text-xs">{timeAgo(c.updated_at)}</span>
                      </div>
                      <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-relaxed">{c.last_message}</p>
                      <div className="mt-2 flex items-center gap-1.5">
                        <ChannelBadge channel={c.channel} />
                        <StatusBadge value={c.status} />
                        {c.pending_count > 0 && <Badge className="ml-auto">{c.pending_count} to review</Badge>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <div className="min-w-0">{current ? <ConversationView key={current} id={current} compact /> : <EmptyState title="Select a conversation" />}</div>
        </div>
      )}
    </div>
  );
}
