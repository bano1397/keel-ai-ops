"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type RequestOptions } from "@/lib/api";

export function useApi<T>(path: string | null, query?: RequestOptions["query"]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const key = path ? `${path}|${JSON.stringify(query ?? {})}` : null;

  const load = useCallback(async () => {
    if (!key) return;
    const [p, q] = key.split("|");
    setLoading(true);
    setError(null);
    try {
      setData(await api<T>(p, { query: JSON.parse(q) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, setData, error, loading, reload: load };
}
