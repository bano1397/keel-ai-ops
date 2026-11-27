"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorState, LoadingBlock, PageHeader, StatusBadge } from "@/components/common";
import { useApi } from "@/hooks/use-api";
import { gbp } from "@/lib/format";
import type { CustomerListItem } from "@/lib/types";

export default function CustomersPage() {
  const router = useRouter();
  const { data, error, loading, reload } = useApi<CustomerListItem[]>("/api/customers");
  const [q, setQ] = useState("");
  const list = (data ?? []).filter((c) => `${c.name} ${c.email}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Hearth & Field shoppers with orders, refunds and sentiment."
        actions={
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers" className="w-64 pl-8" />
          </div>
        }
      />
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <LoadingBlock />
      ) : (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Customer</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Lifetime</TableHead>
                <TableHead className="text-right">Open tickets</TableHead>
                <TableHead className="pr-5">Sentiment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => router.push(`/customers/${c.id}`)}>
                  <TableCell className="pl-5">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-muted-foreground text-xs">{c.email}</div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={c.tier} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.orders_count}</TableCell>
                  <TableCell className="text-right tabular-nums">{gbp(c.lifetime_gbp)}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.open_tickets}</TableCell>
                  <TableCell className="pr-5">
                    <StatusBadge value={c.sentiment} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
