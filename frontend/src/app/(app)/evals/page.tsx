"use client";

import { useState } from "react";
import { FlaskConical, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScoreLineChart } from "@/components/charts/charts";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/common";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import type { EvalRun } from "@/lib/types";

const pctStr = (v: number) => `${(v * 100).toFixed(1)}%`;

export default function EvalsPage() {
  const { user } = useAuth();
  const { data, setData, error, loading, reload } = useApi<EvalRun[]>("/api/evals/runs");
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  async function run() {
    setRunning(true);
    try {
      const r = await api<EvalRun>("/api/evals/run", { body: {} });
      setData((list) => [r, ...(list ?? [])]);
      setSelected(r.id);
      toast.success(`Subset run #${r.id}: ${pctStr(r.score)} on ${r.n_cases} cases`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Eval run failed");
    } finally {
      setRunning(false);
    }
  }

  const runs = data ?? [];
  const current = runs.find((r) => r.id === selected) ?? runs[0];
  const chart = [...runs].reverse().map((r) => ({ x: r.created_at, y: r.score }));

  return (
    <div>
      <PageHeader
        title="Evals"
        description="Offline evaluation of the agent pipeline on the golden dataset."
        actions={
          user?.role === "admin" && (
            <Button onClick={run} disabled={running}>
              {running ? <Loader2 className="size-4 animate-spin" /> : <FlaskConical className="size-4" />}
              Run subset
            </Button>
          )
        }
      />
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <LoadingBlock />
      ) : runs.length === 0 ? (
        <EmptyState icon={FlaskConical} title="No eval runs yet" />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Score over runs</CardTitle>
              </CardHeader>
              <CardContent>
                <ScoreLineChart data={chart} domain={[0.6, 1]} name="Score" pctAxis height={260} />
              </CardContent>
            </Card>
            {current && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-sm">
                    Run #{current.id} by category
                    <span className="text-primary text-base tabular-nums">{pctStr(current.score)}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {Object.entries(current.breakdown).map(([cat, v]) => (
                    <div key={cat}>
                      <div className="flex justify-between text-xs">
                        <span className="capitalize">{cat}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {pctStr(v.score)} · {v.n} cases
                        </span>
                      </div>
                      <div className="bg-muted mt-1 h-1.5 overflow-hidden rounded-full">
                        <div className="bg-primary h-full rounded-full" style={{ width: `${v.score * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
          <Card className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Run</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead className="text-right">Cases</TableHead>
                  <TableHead className="pr-5 text-right">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" data-state={current?.id === r.id ? "selected" : undefined} onClick={() => setSelected(r.id)}>
                    <TableCell className="pl-5 font-medium">#{r.id}</TableCell>
                    <TableCell>{dateTime(r.created_at)}</TableCell>
                    <TableCell className="capitalize">{r.mode}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.n_cases}</TableCell>
                    <TableCell className="pr-5 text-right font-medium tabular-nums">{pctStr(r.score)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}
    </div>
  );
}
