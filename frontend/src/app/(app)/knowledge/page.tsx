"use client";

import { useState } from "react";
import { FileSpreadsheet, FileText, Globe, Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ErrorState, LoadingBlock, PageHeader } from "@/components/common";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { DocType, KbDoc, KbHit, KbSearchResponse, ReindexResponse } from "@/lib/types";

const TYPE_META: Record<DocType, { label: string; icon: typeof FileText }> = {
  pdf: { label: "PDF policies", icon: FileText },
  web: { label: "Help centre pages", icon: Globe },
  csv: { label: "Product data", icon: FileSpreadsheet },
};

function HitList({ title, hits, scoreLabel }: { title: string; hits: KbHit[]; scoreLabel: string }) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm">
          {title}
          <span className="text-muted-foreground text-xs font-normal">{scoreLabel}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {hits.map((h, i) => (
          <div key={`${h.chunk_id}-${i}`} className="rounded-lg border p-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="bg-primary/10 text-primary rounded px-1.5 font-semibold">{i + 1}</span>
              <span className="truncate font-medium">{h.title}</span>
              <span className="text-muted-foreground ml-auto font-mono tabular-nums">{h.score.toFixed(3)}</span>
            </div>
            <div className="text-muted-foreground mt-1 text-[11px]">
              {h.section}
              {h.page && ` · p${h.page}`}
            </div>
            <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed">{h.text}</p>
          </div>
        ))}
        {hits.length === 0 && <p className="text-muted-foreground text-xs">No results</p>}
      </CardContent>
    </Card>
  );
}

export default function KnowledgePage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi<KbDoc[]>("/api/kb/docs");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<KbSearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [reindexing, setReindexing] = useState(false);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setSearching(true);
    try {
      setResults(await api<KbSearchResponse>("/api/kb/search", { query: { q } }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function reindex() {
    setReindexing(true);
    try {
      const r = await api<ReindexResponse>("/api/kb/reindex", { method: "POST" });
      toast.success(`Reindexed ${r.docs} docs, ${r.chunks} chunks in ${(r.took_ms / 1000).toFixed(1)}s`);
      void reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reindex failed");
    } finally {
      setReindexing(false);
    }
  }

  const groups = (Object.keys(TYPE_META) as DocType[]).map((t) => ({ type: t, docs: (data ?? []).filter((d) => d.type === t) }));

  return (
    <div>
      <PageHeader
        title="Knowledge"
        description="The Hearth & Field corpus the agents retrieve from."
        actions={
          user?.role === "admin" && (
            <Button variant="outline" onClick={reindex} disabled={reindexing}>
              {reindexing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Reindex
            </Button>
          )
        }
      />
      <form onSubmit={search} className="mb-6 flex gap-2">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try: can I return an opened pillow?" className="h-11 pl-9" />
        </div>
        <Button type="submit" className="h-11" disabled={searching}>
          {searching && <Loader2 className="size-4 animate-spin" />}
          Search
        </Button>
      </form>
      {results && (
        <div className="mb-8 grid gap-4 lg:grid-cols-3">
          <HitList title="Keyword (BM25)" hits={results.keyword} scoreLabel="ts_rank" />
          <HitList title="Vector" hits={results.vector} scoreLabel="cosine" />
          <HitList title="Reranked" hits={results.reranked} scoreLabel="cross-encoder" />
        </div>
      )}
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <LoadingBlock />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {groups.map(({ type, docs }) => {
            const Meta = TYPE_META[type];
            return (
              <Card key={type}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Meta.icon className="text-primary size-4" />
                    {Meta.label}
                    <Badge variant="secondary" className="ml-auto">
                      {docs.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {docs.map((d) => (
                    <div key={d.id} className="rounded-lg border px-3 py-2.5">
                      <div className="text-sm font-medium">{d.title}</div>
                      <div className="text-muted-foreground flex justify-between gap-2 text-xs">
                        <span className="truncate font-mono">{d.source}</span>
                        {d.chunks !== undefined && <span className="shrink-0">{d.chunks} chunks</span>}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
