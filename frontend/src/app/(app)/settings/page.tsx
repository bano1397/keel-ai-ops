"use client";

import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminGate, ErrorState, LoadingBlock, PageHeader, StatusBadge } from "@/components/common";
import { useApi } from "@/hooks/use-api";
import type { SettingsResponse } from "@/lib/types";

const ICON = { connected: CheckCircle2, not_configured: CircleDashed, error: XCircle };
const TONE = { connected: "text-emerald-500", not_configured: "text-muted-foreground", error: "text-rose-500" };

function SettingsBody() {
  const { data, error, loading, reload } = useApi<SettingsResponse>("/api/settings");
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) return <LoadingBlock />;
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Integrations</CardTitle>
          <CardDescription>Read-only. Configure through environment variables on the backend.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {data.integrations.map((i) => {
            const Icon = ICON[i.status];
            return (
              <div key={i.name} className="flex items-center gap-3 py-3">
                <Icon className={`size-5 ${TONE[i.status]}`} />
                <div className="flex-1">
                  <div className="text-sm font-medium">{i.name}</div>
                  <div className="text-muted-foreground text-xs">{i.detail}</div>
                </div>
                <StatusBadge value={i.status} />
              </div>
            );
          })}
        </CardContent>
      </Card>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Tenant</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{data.tenant}</CardContent>
        </Card>
        {[
          ["Models", data.models],
          ["Limits", data.limits],
        ].map(([title, obj]) => (
          <Card key={title as string}>
            <CardHeader>
              <CardTitle className="text-sm">{title as string}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(obj as Record<string, string | number>).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 text-xs">
                  <span className="text-muted-foreground">{k.replace(/_/g, " ")}</span>
                  <span className="text-right font-mono">{String(v)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div>
      <PageHeader title="Settings" description="Workspace configuration and integration health." />
      <AdminGate>
        <SettingsBody />
      </AdminGate>
    </div>
  );
}
