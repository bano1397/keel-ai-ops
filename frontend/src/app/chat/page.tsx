"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronDown, Home, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SourceChips } from "@/components/trace/trace-timeline";
import { streamChat } from "@/lib/sse";
import type { RouterDecision, Source, TraceStep } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Turn {
  id: string;
  role: "user" | "assistant";
  text: string;
  router?: RouterDecision;
  steps?: TraceStep[];
  sources?: Source[];
  pending?: boolean;
  held?: boolean;
  error?: string;
}

const SUGGESTIONS = ["How much is delivery?", "Can I return an opened pillow?", "Where is my order HF-205133?"];
const EMAIL_KEY = "keel.chat.email";
const CONV_KEY = "keel.chat.conversation";

function HowIAnswered({ t }: { t: Turn }) {
  const [open, setOpen] = useState(false);
  if (!t.router && !t.steps?.length) return null;
  const agents = Array.from(new Set((t.steps ?? []).map((s) => s.agent)));
  const tools = (t.steps ?? []).filter((s) => s.tool).map((s) => s.tool as string);
  return (
    <div className="text-muted-foreground text-[11.5px]" data-testid="how-i-answered">
      <button onClick={() => setOpen((o) => !o)} className="hover:text-foreground inline-flex items-center gap-1">
        <Sparkles className="size-3" />
        How I answered
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="bg-muted/60 mt-1.5 space-y-1 rounded-lg px-3 py-2">
          {t.router && (
            <div>
              Topic <span className="text-foreground font-medium">{t.router.label.replace(/_/g, " ")}</span> ({Math.round(t.router.confidence * 100)}% sure)
            </div>
          )}
          {agents.length > 0 && (
            <div>
              Agent <span className="text-foreground font-medium">{agents.join(", ")}</span>
            </div>
          )}
          {tools.length > 0 && (
            <div>
              Tools <span className="text-foreground font-mono">{tools.join(", ")}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ChatPage() {
  const [email, setEmail] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<number | undefined>();
  const [embed, setEmbed] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    setEmbed(new URLSearchParams(window.location.search).get("embed") === "1");
    try {
      const e = window.localStorage.getItem(EMAIL_KEY);
      if (e) {
        setEmail(e);
        setConfirmed(true);
      }
      const c = window.localStorage.getItem(CONV_KEY);
      if (c) setConversationId(Number(c));
    } catch {}
    return () => abort.current?.abort();
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  const patch = (id: string, fn: (t: Turn) => Turn) => setTurns((ts) => ts.map((t) => (t.id === id ? fn(t) : t)));

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    const aid = `a-${Date.now()}`;
    setTurns((ts) => [...ts, { id: `u-${Date.now()}`, role: "user", text: message }, { id: aid, role: "assistant", text: "", pending: true, steps: [] }]);
    abort.current = new AbortController();
    try {
      for await (const ev of streamChat({ email, message, conversation_id: conversationId }, abort.current.signal)) {
        if (ev.event === "router") patch(aid, (t) => ({ ...t, router: ev.data }));
        else if (ev.event === "step") patch(aid, (t) => ({ ...t, steps: [...(t.steps ?? []), ev.data] }));
        else if (ev.event === "sources") patch(aid, (t) => ({ ...t, sources: ev.data }));
        else if (ev.event === "token") patch(aid, (t) => ({ ...t, text: t.text + ev.data.t }));
        else if (ev.event === "done") {
          patch(aid, (t) => ({ ...t, pending: false, held: ev.data.status === "pending_review" }));
          setConversationId(ev.data.conversation_id);
          try {
            window.localStorage.setItem(CONV_KEY, String(ev.data.conversation_id));
          } catch {}
        } else if (ev.event === "error") patch(aid, (t) => ({ ...t, pending: false, error: ev.data.detail }));
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") patch(aid, (t) => ({ ...t, pending: false, error: "Connection lost. Please try again." }));
    } finally {
      patch(aid, (t) => ({ ...t, pending: false }));
      setBusy(false);
    }
  }

  function start(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) return;
    try {
      window.localStorage.setItem(EMAIL_KEY, email);
    } catch {}
    setConfirmed(true);
  }

  return (
    <div className={cn("flex min-h-screen items-center justify-center", embed ? "bg-transparent" : "bg-[radial-gradient(ellipse_at_top,var(--accent),var(--background)_60%)] p-4")}>
      <div className={cn("bg-card flex w-full flex-col overflow-hidden", embed ? "h-screen" : "h-[min(760px,92vh)] max-w-md rounded-3xl border shadow-xl")}>
        <header className="bg-primary text-primary-foreground flex items-center gap-3 px-5 py-4">
          <div className="flex size-10 items-center justify-center rounded-full bg-white/15">
            <Home className="size-5" />
          </div>
          <div className="flex-1">
            <div className="font-semibold">Hearth &amp; Field</div>
            <div className="text-xs opacity-80">Support · usually replies instantly</div>
          </div>
          <span className="size-2 rounded-full bg-emerald-300" />
        </header>

        {!confirmed ? (
          <form onSubmit={start} className="flex flex-1 flex-col justify-center gap-4 p-6">
            <div>
              <h1 className="text-xl font-semibold">Hi there</h1>
              <p className="text-muted-foreground mt-1 text-sm">Ask us about orders, delivery, returns or anything in our range. Your email lets us look up your orders.</p>
            </div>
            <Input type="email" placeholder="you@example.co.uk" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" required />
            <Button type="submit">Start chatting</Button>
            <p className="text-muted-foreground text-center text-[11px]">We keep support conversations for 2 years (UK GDPR).</p>
          </form>
        ) : (
          <>
            <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto px-4 py-5" data-testid="chat-log">
              {turns.length === 0 && (
                <div className="space-y-3 pt-6 text-center">
                  <p className="text-muted-foreground text-sm">How can we help today?</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} onClick={() => send(s)} className="hover:border-primary/50 hover:bg-accent rounded-full border px-3 py-1.5 text-xs transition-colors">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {turns.map((t) =>
                t.role === "user" ? (
                  <div key={t.id} className="flex justify-end">
                    <div className="bg-primary text-primary-foreground max-w-[80%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm">{t.text}</div>
                  </div>
                ) : (
                  <div key={t.id} className="flex max-w-[88%] flex-col gap-2" data-testid="assistant-turn">
                    <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
                      {t.text || (t.pending && <Loader2 className="text-muted-foreground size-4 animate-spin" />)}
                      {t.pending && t.text && <span className="bg-primary ml-0.5 inline-block h-4 w-1.5 animate-pulse align-text-bottom" />}
                      {t.error && <span className="text-destructive">{t.error}</span>}
                    </div>
                    {t.held && <p className="text-muted-foreground text-[11.5px]">A member of our team will double-check this before it&apos;s final.</p>}
                    {t.sources && t.sources.length > 0 && !t.pending && <SourceChips sources={t.sources} />}
                    {!t.pending && <HowIAnswered t={t} />}
                  </div>
                ),
              )}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
              className="flex items-center gap-2 border-t p-3"
            >
              <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type your message…" className="h-11 rounded-full" aria-label="Message" disabled={busy} />
              <Button type="submit" size="icon" className="size-11 shrink-0 rounded-full" disabled={busy || !input.trim()} aria-label="Send">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
              </Button>
            </form>
            <div className="text-muted-foreground pb-2 text-center text-[10.5px]">Powered by Keel</div>
          </>
        )}
      </div>
    </div>
  );
}
