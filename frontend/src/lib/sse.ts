import { API_URL, MOCK, getToken } from "@/lib/api";
import type { ChatEvent, ChatRequest, LiveEvent } from "@/lib/types";
import { mockChatStream, mockLive } from "@/mocks/stream";

export function parseFrame(frame: string): { event: string; data: unknown } | null {
  let event = "message";
  const data: string[] = [];
  for (const raw of frame.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
  }
  if (data.length === 0) return null;
  const text = data.join("\n");
  try {
    return { event, data: JSON.parse(text) };
  } catch {
    return { event, data: text };
  }
}

export async function* readSse(response: Response): AsyncGenerator<{ event: string; data: unknown }> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let idx = buffer.indexOf("\n\n");
      while (idx !== -1) {
        const parsed = parseFrame(buffer.slice(0, idx));
        buffer = buffer.slice(idx + 2);
        if (parsed) yield parsed;
        idx = buffer.indexOf("\n\n");
      }
    }
    const tail = parseFrame(buffer);
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

export async function* streamChat(body: ChatRequest, signal?: AbortSignal): AsyncGenerator<ChatEvent> {
  if (MOCK) {
    yield* mockChatStream(body, signal);
    return;
  }
  const res = await fetch(`${API_URL}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    let detail = `Chat failed (${res.status})`;
    try {
      const j = await res.json();
      if (typeof j?.detail === "string") detail = j.detail;
    } catch {}
    yield { event: "error", data: { detail } };
    return;
  }
  for await (const frame of readSse(res)) {
    yield frame as ChatEvent;
  }
}

const LIVE_EVENTS = ["message", "conversation", "ticket"] as const;

export function subscribeLive(onEvent: (e: LiveEvent) => void, onStatus?: (connected: boolean) => void): () => void {
  if (MOCK) return mockLive(onEvent, onStatus);
  const token = getToken();
  if (!token || typeof EventSource === "undefined") return () => {};
  const es = new EventSource(`${API_URL}/api/live?token=${encodeURIComponent(token)}`);
  es.onopen = () => onStatus?.(true);
  es.onerror = () => onStatus?.(false);
  for (const name of LIVE_EVENTS) {
    es.addEventListener(name, (ev) => {
      try {
        onEvent({ event: name, data: JSON.parse((ev as MessageEvent<string>).data) } as LiveEvent);
      } catch {}
    });
  }
  return () => es.close();
}
