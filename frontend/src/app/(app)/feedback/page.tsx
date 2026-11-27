"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorState, LoadingBlock, PageHeader, StatusBadge } from "@/components/common";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import type { Feedback, PromptVersion } from "@/lib/types";

export default function FeedbackPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const fb = useApi<Feedback[]>("/api/feedback");
  const pr = useApi<PromptVersion[]>("/api/prompts");
  const [busy, setBusy] = useState<string | null>(null);

  async function propose(agent: string) {
    setBusy(`propose-${agent}`);
    try {
      const p = await api<PromptVersion>("/api/prompts/propose", { body: { agent } });
      pr.setData((list) => [p, ...(list ?? [])]);
      toast.success(`Proposed ${p.agent} v${p.version}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Propose failed");
    } finally {
      setBusy(null);
    }
  }

  async function activate(p: PromptVersion) {
    setBusy(`activate-${p.id}`);
    try {
      await api<PromptVersion>(`/api/prompts/${p.id}/activate`, { method: "POST" });
      pr.setData((list) => list?.map((x) => (x.id === p.id ? { ...x, status: "active" } : x.agent === p.agent && x.status === "active" ? { ...x, status: "retired" } : x)) ?? list);
      toast.success(`${p.agent} v${p.version} is now active`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Activate failed");
    } finally {
      setBusy(null);
    }
  }

  const agents = Array.from(new Set((pr.data ?? []).map((p) => p.agent)));

  return (
    <div>
      <PageHeader title="Feedback" description="Human reviews of AI replies, and the prompt rules learned from them." />
      <Tabs defaultValue="feedback">
        <TabsList>
          <TabsTrigger value="feedback">Reviews</TabsTrigger>
          <TabsTrigger value="prompts">Prompt versions</TabsTrigger>
        </TabsList>
        <TabsContent value="feedback" className="mt-4 space-y-4">
          {fb.error ? (
            <ErrorState message={fb.error} onRetry={fb.reload} />
          ) : fb.loading && !fb.data ? (
            <LoadingBlock />
          ) : (
            fb.data?.map((f) => (
              <Card key={f.id}>
                <CardHeader className="flex flex-row flex-wrap items-center gap-2">
                  <StatusBadge value={f.action === "approve" ? "sent" : f.action === "edit" ? "edited" : "rejected"} />
                  <Badge variant="secondary" className="capitalize">
                    {f.agent}
                  </Badge>
                  <span className="text-muted-foreground text-xs">
                    {f.reviewer} · {timeAgo(f.created_at)}
                  </span>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="text-muted-foreground">&ldquo;{f.customer_message}&rdquo;</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border p-3">
                      <div className="text-muted-foreground mb-1 text-xs font-medium">Original</div>
                      <p className={f.action !== "approve" ? "decoration-rose-500/50 line-through" : ""}>{f.original_reply}</p>
                    </div>
                    {f.corrected_reply && (
                      <div className="border-primary/20 bg-primary/[0.05] rounded-lg border p-3">
                        <div className="text-muted-foreground mb-1 text-xs font-medium">Corrected</div>
                        <p>{f.corrected_reply}</p>
                      </div>
                    )}
                  </div>
                  {f.reason && (
                    <p className="text-xs">
                      <span className="text-muted-foreground">Reason: </span>
                      {f.reason}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
        <TabsContent value="prompts" className="mt-4 space-y-4">
          {isAdmin && agents.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {agents.map((a) => (
                <Button key={a} variant="outline" size="sm" disabled={busy !== null} onClick={() => propose(a)}>
                  {busy === `propose-${a}` ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  Propose {a} rules
                </Button>
              ))}
            </div>
          )}
          {pr.error ? (
            <ErrorState message={pr.error} onRetry={pr.reload} />
          ) : pr.loading && !pr.data ? (
            <LoadingBlock />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {pr.data?.map((p) => (
                <Card key={p.id}>
                  <CardHeader className="flex flex-row items-center gap-2">
                    <CardTitle className="text-sm capitalize">
                      {p.agent} v{p.version}
                    </CardTitle>
                    <StatusBadge value={p.status} />
                    <span className="text-muted-foreground ml-auto text-xs">
                      {p.created_by} · {timeAgo(p.created_at)}
                    </span>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <pre className="bg-muted/60 rounded-lg p-3 font-sans text-xs leading-relaxed whitespace-pre-wrap">{p.rules}</pre>
                    {isAdmin && p.status === "proposed" && (
                      <Button size="sm" disabled={busy !== null} onClick={() => activate(p)}>
                        Activate
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
