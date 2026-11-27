import type { ChatEvent, ChatRequest, LiveEvent, Source } from "@/lib/types";
import { conversations } from "@/mocks/fixtures";

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

const SOURCES: Source[] = [
  { n: 1, title: "Returns & Refunds Policy", section: "1. 30-day returns", page: 2, url: "https://help.hearthandfield.co.uk/returns", score: 0.89 },
  { n: 2, title: "Help Centre: Using the Returns Portal", section: "Printing your free label", page: null, url: "https://help.hearthandfield.co.uk/returns-portal", score: 0.76 },
];

function pickAnswer(message: string): { label: string; route: string; agent: string; tool: string; text: string } {
  const m = message.toLowerCase();
  if (/deliver|ship|arrive|where/.test(m))
    return { label: "delivery_question", route: "orders", agent: "orders", tool: "search_kb", text: "Standard delivery is £3.95 and takes 3–5 working days, and it's free on orders over £50 [1]. Express next working day is £6.95 if you order before 2pm Monday to Thursday. If you share your order number (it starts with HF-), I can check exactly where your parcel is." };
  return { label: "return_request", route: "returns", agent: "returns", tool: "search_kb", text: "You can return most items within 30 days of delivery, as long as they're unused and in the original packaging [1]. Returns are free: just print a label from the Returns Portal [2]. Your refund goes back to your original payment method within 5 working days of the parcel reaching our Leeds warehouse." };
}

export async function* mockChatStream(body: ChatRequest, signal?: AbortSignal): AsyncGenerator<ChatEvent> {
  const a = pickAnswer(body.message);
  const started = Date.now();
  await wait(350, signal);
  yield { event: "router", data: { label: a.label, route: a.route, confidence: 0.92, model: "claude-haiku-4-5" } };
  await wait(250, signal);
  yield { event: "step", data: { type: "tool", agent: a.agent, tool: a.tool, args: { q: body.message.slice(0, 60), k: 4 }, result: { hits: 4 }, reason: "Ground the answer in the help centre." } };
  await wait(300, signal);
  yield { event: "sources", data: SOURCES };
  for (const word of a.text.split(/(?<= )/)) {
    await wait(22 + Math.random() * 30, signal);
    yield { event: "token", data: { t: word } };
  }
  yield { event: "done", data: { message_id: 9000 + Math.floor(Math.random() * 999), conversation_id: body.conversation_id ?? 42, status: "sent", cost_usd: 0.0041, latency_ms: Date.now() - started } };
}

export function mockLive(onEvent: (e: LiveEvent) => void, onStatus?: (connected: boolean) => void): () => void {
  onStatus?.(true);
  const samples = [
    "Has my refund gone through yet?",
    "Can I change the delivery address on HF-205133?",
    "Do you price match Dunelm?",
    "Is the oak table back in stock?",
  ];
  let i = 0;
  const timer = setInterval(() => {
    const base = conversations[(i % 3) + 3];
    onEvent({ event: "conversation", data: { ...base, last_message: samples[i % samples.length], updated_at: new Date().toISOString(), status: "open", pending_count: base.pending_count + (i % 2) } });
    i += 1;
  }, 9000);
  return () => clearInterval(timer);
}
