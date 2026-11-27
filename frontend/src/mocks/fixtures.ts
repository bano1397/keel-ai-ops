import type {
  Analytics,
  ApprovalsResponse,
  ConversationDetail,
  ConversationSummary,
  Customer,
  CustomerListItem,
  CustomerProfile,
  EvalRun,
  Feedback,
  KbDoc,
  KbHit,
  Message,
  OpsQueue,
  Order,
  PromptVersion,
  Refund,
  SettingsResponse,
  Ticket,
  Trace,
} from "@/lib/types";

const NOW = Date.now();
const ago = (mins: number) => new Date(NOW - mins * 60_000).toISOString();
const dayIso = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000).toISOString().slice(0, 10);

export const customers: Customer[] = [
  { id: 1, name: "Amelia Hughes", email: "amelia.hughes@example.co.uk", telegram_chat_id: null, phone: "+44 7700 900123", tier: "vip", vulnerable: false, created_at: ago(60 * 24 * 410) },
  { id: 2, name: "Oliver Bennett", email: "oliver.bennett@example.co.uk", telegram_chat_id: "558120934", phone: null, tier: "standard", vulnerable: false, created_at: ago(60 * 24 * 120) },
  { id: 3, name: "Priya Shah", email: "priya.shah@example.co.uk", telegram_chat_id: null, phone: "+44 7700 900456", tier: "standard", vulnerable: true, created_at: ago(60 * 24 * 32) },
  { id: 4, name: "George Whitfield", email: "g.whitfield@example.co.uk", telegram_chat_id: null, phone: null, tier: "vip", vulnerable: false, created_at: ago(60 * 24 * 700) },
  { id: 5, name: "Sophie Clarke", email: "sophie.clarke@example.co.uk", telegram_chat_id: "771204556", phone: null, tier: "standard", vulnerable: false, created_at: ago(60 * 24 * 12) },
  { id: 6, name: "Hamza Iqbal", email: "hamza.iqbal@example.co.uk", telegram_chat_id: null, phone: "+44 7700 900789", tier: "standard", vulnerable: false, created_at: ago(60 * 24 * 220) },
];

const ref = (id: number) => {
  const c = customers.find((x) => x.id === id)!;
  return { id: c.id, name: c.name, email: c.email, tier: c.tier };
};

export const orders: Order[] = [
  { id: "HF-204817", customer_id: 1, status: "delivered", total_gbp: 184.0, items: [{ sku: "LIN-DUV-KG-OAT", name: "Washed Linen Duvet Cover, King, Oat", qty: 1, price_gbp: 129 }, { sku: "LIN-PIL-PR-OAT", name: "Linen Pillowcase Pair, Oat", qty: 1, price_gbp: 55 }], shipping_address: "14 Clarendon Rd, Leeds LS2 9NN", carrier: "DPD", tracking: "15501234567890", created_at: ago(60 * 24 * 9), delivered_at: ago(60 * 24 * 6), updated_at: ago(60 * 24 * 6) },
  { id: "HF-205133", customer_id: 1, status: "in_transit", total_gbp: 42.5, items: [{ sku: "CER-MUG-SET4-SAGE", name: "Stoneware Mug Set of 4, Sage", qty: 1, price_gbp: 38.55 }], shipping_address: "14 Clarendon Rd, Leeds LS2 9NN", carrier: "Royal Mail", tracking: "RM482019334GB", created_at: ago(60 * 24 * 2), delivered_at: null, updated_at: ago(60 * 5) },
  { id: "HF-203990", customer_id: 2, status: "delivered", total_gbp: 34.0, items: [{ sku: "CER-BWL-SET2-CHAR", name: "Ramen Bowl Pair, Charcoal", qty: 1, price_gbp: 34 }], shipping_address: "3 Abbey Lane, York YO1 7HD", carrier: "Evri", tracking: "H01HYA0012345678", created_at: ago(60 * 24 * 5), delivered_at: ago(60 * 24 * 1), updated_at: ago(60 * 24 * 1) },
  { id: "HF-201447", customer_id: 3, status: "delivered", total_gbp: 649.0, items: [{ sku: "FUR-SOF-3S-MOSS", name: "Hebden 3-Seater Sofa, Moss Velvet", qty: 1, price_gbp: 620 }, { sku: "DEL-2MAN", name: "Two-person delivery", qty: 1, price_gbp: 29 }], shipping_address: "22 Mill St, Manchester M4 1HN", carrier: "DPD", tracking: "15509988776655", created_at: ago(60 * 24 * 21), delivered_at: ago(60 * 24 * 11), updated_at: ago(60 * 24 * 11) },
  { id: "HF-205402", customer_id: 4, status: "processing", total_gbp: 1240.0, items: [{ sku: "FUR-TBL-OAK-6", name: "Ilkley Oak Dining Table, 6-seat", qty: 1, price_gbp: 1240 }], shipping_address: "The Old Rectory, Harrogate HG1 2AB", carrier: null, tracking: null, created_at: ago(60 * 20), delivered_at: null, updated_at: ago(60 * 20) },
  { id: "HF-204555", customer_id: 5, status: "dispatched", total_gbp: 67.9, items: [{ sku: "LGT-LMP-RAT", name: "Rattan Table Lamp", qty: 1, price_gbp: 67.9 }], shipping_address: "8 Bridge St, Bristol BS1 2EJ", carrier: "Evri", tracking: "H01HYA0098765432", created_at: ago(60 * 24 * 3), delivered_at: null, updated_at: ago(60 * 24 * 1) },
  { id: "HF-202871", customer_id: 6, status: "partially_refunded", total_gbp: 96.0, items: [{ sku: "TEX-THR-WOOL-RUST", name: "Merino Throw, Rust", qty: 1, price_gbp: 96 }], shipping_address: "41 Queen St, Glasgow G1 3DX", carrier: "Royal Mail", tracking: "RM118273645GB", created_at: ago(60 * 24 * 18), delivered_at: ago(60 * 24 * 15), updated_at: ago(60 * 24 * 4) },
];

export const refunds: Refund[] = [
  { id: 31, order_id: "HF-203990", amount_gbp: 34.0, reason: "Damaged on arrival, photo supplied", status: "issued", idempotency_key: "rf-HF-203990-dmg", created_by: "refund_agent", approved_by: null, created_at: ago(60 * 3) },
  { id: 32, order_id: "HF-201447", amount_gbp: 649.0, reason: "Sofa frame cracked, faulty within 30 days (CRA 2015)", status: "pending_approval", idempotency_key: "rf-HF-201447-fault", created_by: "refund_agent", approved_by: null, created_at: ago(42) },
  { id: 33, order_id: "HF-204817", amount_gbp: 129.0, reason: "Duvet cover colour not as pictured, unopened", status: "pending_approval", idempotency_key: "rf-HF-204817-col", created_by: "refund_agent", approved_by: null, created_at: ago(18) },
  { id: 28, order_id: "HF-202871", amount_gbp: 24.0, reason: "Price promise: John Lewis listing £72", status: "issued", idempotency_key: "rf-HF-202871-pp", created_by: "refund_agent", approved_by: null, created_at: ago(60 * 24 * 4) },
];

export const conversations: ConversationSummary[] = [
  { id: 1, customer: ref(1), channel: "web", status: "open", last_message: "Thanks, the colour is quite different from the photos. Can I return the duvet cover?", pending_count: 1, updated_at: ago(4) },
  { id: 2, customer: ref(3), channel: "email", status: "escalated", last_message: "The sofa frame has cracked after a week. I'm really upset, this cost £649.", pending_count: 0, updated_at: ago(41) },
  { id: 3, customer: ref(2), channel: "telegram", status: "resolved", last_message: "Brilliant, thanks for sorting the refund so quickly!", pending_count: 0, updated_at: ago(170) },
  { id: 4, customer: ref(5), channel: "telegram", status: "open", last_message: "Where is my lamp? Evri says it's been at the depot since Tuesday.", pending_count: 1, updated_at: ago(12) },
  { id: 5, customer: ref(4), channel: "email", status: "open", last_message: "Can the oak table be delivered on a Saturday? I'm a VIP member.", pending_count: 0, updated_at: ago(65) },
  { id: 6, customer: ref(6), channel: "web", status: "resolved", last_message: "Do you ship to Dublin?", pending_count: 0, updated_at: ago(60 * 26) },
  { id: 7, customer: ref(1), channel: "email", status: "resolved", last_message: "How many Hearth Rewards points do I have?", pending_count: 0, updated_at: ago(60 * 24 * 3) },
];

const trace1: Trace = {
  id: 501,
  conversation_id: 1,
  message_id: 12,
  router: { label: "return_request", route: "returns", confidence: 0.93, model: "claude-haiku-4-5", risk: "medium", reason: "Customer asks to return an item citing colour mismatch; order id present in history." },
  steps: [
    { type: "route", agent: "router", reason: "Classified as return_request with 0.93 confidence; routed to returns agent." },
    { type: "tool", agent: "returns", tool: "lookup_order", args: { order_id: "HF-204817", email: "amelia.hughes@example.co.uk" }, result: { status: "delivered", delivered_at: "2026-11-21", total_gbp: 184, items: 2 }, reason: "Verify order ownership and delivery date before quoting return window." },
    { type: "tool", agent: "returns", tool: "search_kb", args: { q: "return bedding opened hygiene 30 days", k: 4 }, result: { hits: 4, top: "Returns policy §2 Bedding" }, reason: "Duvet covers may fall under hygiene exclusion; check policy." },
    { type: "tool", agent: "returns", tool: "check_refund_eligibility", args: { order_id: "HF-204817", sku: "LIN-DUV-KG-OAT", opened: false }, result: { eligible: true, amount_gbp: 129, requires_approval: true, rule: "amount > £50" }, reason: "Amount exceeds £50 auto-refund limit, so a human must approve." },
    { type: "tool", agent: "returns", tool: "create_refund", args: { order_id: "HF-204817", amount_gbp: 129, reason: "Colour not as pictured, unopened" }, result: { refund_id: 33, status: "pending_approval" }, reason: "Queue refund for human approval; reply is held for review." },
  ],
  sources: [
    { n: 1, title: "Returns & Refunds Policy", section: "2. Bedding and hygiene", page: 3, url: "https://help.hearthandfield.co.uk/returns#bedding", score: 0.91 },
    { n: 2, title: "Returns & Refunds Policy", section: "1. 30-day returns", page: 2, url: "https://help.hearthandfield.co.uk/returns", score: 0.87 },
    { n: 3, title: "Help Centre: Using the Returns Portal", section: "Printing your free label", page: null, url: "https://help.hearthandfield.co.uk/returns-portal", score: 0.74 },
  ],
  model: "claude-sonnet-4-5",
  tokens_in: 3184,
  tokens_out: 212,
  cost_usd: 0.0127,
  latency_ms: 2840,
  error: null,
  created_at: ago(4),
};

const trace0: Trace = {
  id: 499,
  conversation_id: 1,
  message_id: 10,
  router: { label: "order_status", route: "orders", confidence: 0.97, model: "claude-haiku-4-5", risk: "low", reason: "Delivery status question with order number." },
  steps: [
    { type: "route", agent: "router", reason: "Order status intent, low risk." },
    { type: "tool", agent: "orders", tool: "lookup_order", args: { order_id: "HF-205133" }, result: { status: "in_transit", carrier: "Royal Mail", tracking: "RM482019334GB", eta: "2026-11-28" }, reason: "Fetch live order status." },
  ],
  sources: [{ n: 1, title: "Delivery Information", section: "Standard delivery", page: 1, url: "https://help.hearthandfield.co.uk/delivery", score: 0.82 }],
  model: "claude-haiku-4-5",
  tokens_in: 1420,
  tokens_out: 96,
  cost_usd: 0.0019,
  latency_ms: 1180,
  error: null,
  created_at: ago(9),
};

const conv1Messages: Message[] = [
  { id: 9, conversation_id: 1, role: "user", content: "Hi, where is my mug set? Order HF-205133.", agent: null, status: "sent", confidence: null, trace_id: null, created_at: ago(10) },
  { id: 10, conversation_id: 1, role: "assistant", content: "Hi Amelia, your Stoneware Mug Set (HF-205133) is with Royal Mail and due tomorrow, 28 November. You can track it with RM482019334GB.", agent: "orders", status: "sent", confidence: 0.95, trace_id: 499, created_at: ago(9), trace: trace0 },
  { id: 11, conversation_id: 1, role: "user", content: "Thanks, the colour is quite different from the photos. Can I return the duvet cover from HF-204817? It's still in the packaging.", agent: null, status: "sent", confidence: null, trace_id: null, created_at: ago(5) },
  { id: 12, conversation_id: 1, role: "assistant", content: "I'm sorry the colour isn't what you expected. As the duvet cover is unopened and within 30 days of delivery, you can return it for a full refund of £129 [1][2]. I've started the refund, and because it's over £50 a member of our team will confirm it shortly. You can print a free returns label from the Returns Portal [3].", agent: "returns", status: "pending_review", confidence: 0.81, trace_id: 501, created_at: ago(4), trace: trace1 },
];

export function conversationDetail(id: number): ConversationDetail | null {
  const summary = conversations.find((c) => c.id === id);
  if (!summary) return null;
  const custId = summary.customer.id!;
  const messages: Message[] =
    id === 1
      ? conv1Messages
      : [
          { id: id * 100 + 1, conversation_id: id, role: "user", content: summary.last_message, agent: null, status: "sent", confidence: null, trace_id: null, created_at: summary.updated_at },
          {
            id: id * 100 + 2,
            conversation_id: id,
            role: "assistant",
            content: id === 2 ? "I'm so sorry about the sofa. A cracked frame within 30 days counts as faulty, so you're entitled to a full refund. I've passed this to our team who will contact you today." : "Thanks for getting in touch. I've checked this for you and replied with the details above.",
            agent: id === 2 ? "escalation" : "faq",
            status: id === 4 ? "pending_review" : "sent",
            confidence: id === 2 ? 0.62 : 0.88,
            trace_id: 600 + id,
            created_at: summary.updated_at,
            trace: { ...trace0, id: 600 + id, conversation_id: id, message_id: id * 100 + 2, router: { ...trace0.router, label: id === 2 ? "complaint_faulty" : "general", route: id === 2 ? "escalation" : "faq", confidence: id === 2 ? 0.64 : 0.9, risk: id === 2 ? "high" : "low" } },
          },
        ];
  return {
    conversation: { id, customer_id: custId, channel: summary.channel, status: summary.status, thread_id: null, created_at: ago(60 * 24), updated_at: summary.updated_at },
    customer_profile: customerProfile(custId)!,
    messages,
    tickets: tickets.filter((t) => t.conversation_id === id),
  };
}

export const tickets: Ticket[] = [
  { id: 71, conversation_id: 2, customer_id: 3, customer: ref(3), kind: "escalation", risk: "high", summary: { issue: "Hebden sofa frame cracked 10 days after delivery (HF-201447, £649).", customer_ask: "Full refund and collection.", actions_taken: ["Verified order and delivery date", "Confirmed fault within 30 days under CRA 2015", "Created refund #32 pending approval"], recommended_next: "Approve refund, book collection with two-person team.", sentiment: "negative" }, status: "open", created_at: ago(41) },
  { id: 72, conversation_id: 1, customer_id: 1, customer: ref(1), kind: "refund_approval", risk: "medium", summary: { issue: "Unopened duvet cover return, £129 refund above auto limit.", customer_ask: "Return for colour mismatch.", actions_taken: ["Checked hygiene exclusion: item unopened"], recommended_next: "Approve refund #33." }, status: "open", created_at: ago(4) },
  { id: 73, conversation_id: 4, customer_id: 5, customer: ref(5), kind: "followup", risk: "low", summary: { issue: "Evri parcel stuck at depot for 3 days.", customer_ask: "Find the lamp.", actions_taken: ["Raised carrier enquiry"], recommended_next: "Check Evri response tomorrow 10:00." }, status: "open", created_at: ago(12) },
  { id: 64, conversation_id: 3, customer_id: 2, customer: ref(2), kind: "refund_approval", risk: "low", summary: { issue: "Ramen bowls damaged on arrival, under £40.", actions_taken: ["Auto-refunded £34"], recommended_next: "None" }, status: "resolved", created_at: ago(180) },
];

function sentimentFor(id: number): CustomerProfile["sentiment"] {
  const base = id === 3 ? -0.55 : id === 5 ? -0.1 : 0.45;
  return {
    score: base,
    label: base > 0.2 ? "positive" : base < -0.2 ? "negative" : "neutral",
    trend: Array.from({ length: 8 }, (_, i) => ({ day: dayIso(7 - i), score: Math.max(-1, Math.min(1, base + Math.sin(i + id) * 0.25)) })),
  };
}

export function customerProfile(id: number): CustomerProfile | null {
  const customer = customers.find((c) => c.id === id);
  if (!customer) return null;
  const os = orders.filter((o) => o.customer_id === id);
  return {
    customer,
    orders: os,
    refunds: refunds.filter((r) => os.some((o) => o.id === r.order_id)),
    tickets: tickets.filter((t) => t.customer_id === id),
    conversations: conversations.filter((c) => c.customer.id === id),
    sentiment: sentimentFor(id),
  };
}

export const customerList: CustomerListItem[] = customers.map((c) => {
  const os = orders.filter((o) => o.customer_id === c.id);
  return {
    ...c,
    orders_count: os.length,
    lifetime_gbp: os.reduce((s, o) => s + o.total_gbp, 0),
    open_tickets: tickets.filter((t) => t.customer_id === c.id && t.status === "open").length,
    sentiment: sentimentFor(c.id).label,
  };
});

export function approvals(): ApprovalsResponse {
  return {
    messages: [
      { ...conv1Messages[3], customer: ref(1), customer_message: conv1Messages[2].content, channel: "web" },
      { id: 402, conversation_id: 4, role: "assistant", content: "Sorry for the wait, Sophie. Evri shows your lamp at their Bristol depot. I've raised an enquiry and if it isn't moving by tomorrow we'll send a replacement by Express at no cost.", agent: "orders", status: "pending_review", confidence: 0.71, trace_id: 604, created_at: ago(12), customer: ref(5), customer_message: "Where is my lamp? Evri says it's been at the depot since Tuesday.", channel: "telegram" },
    ],
    refunds: refunds
      .filter((r) => r.status === "pending_approval")
      .map((r) => {
        const o = orders.find((x) => x.id === r.order_id)!;
        return { ...r, customer: ref(o.customer_id), conversation_id: r.id === 32 ? 2 : 1, order_total_gbp: o.total_gbp };
      }),
  };
}

export function analytics(days: number): Analytics {
  const daily = Array.from({ length: days }, (_, i) => {
    const d = days - 1 - i;
    const wk = new Date(NOW - d * 86_400_000).getUTCDay();
    const count = Math.round(48 + 18 * Math.sin(i / 3) + (wk === 1 ? 22 : 0) + i * 0.6);
    return { day: dayIso(d), count, avg_ms: Math.round(2100 + 500 * Math.cos(i / 4) - i * 12), cost: Number((count * (0.011 - i * 0.00008)).toFixed(3)) };
  });
  const accuracy = daily.map((p, i) => ({ day: p.day, human_approval_pct: Number((82 + i * 0.35 + 3 * Math.sin(i / 2)).toFixed(1)), eval_score: i % 3 === 0 ? Number((0.79 + i * 0.004).toFixed(3)) : null }));
  const total = daily.reduce((s, p) => s + p.count, 0);
  return {
    kpis: { conversations: total, auto_resolution_pct: 78.4, avg_response_ms: 2140, p95_response_ms: 5210, cost_per_conversation_usd: 0.0094, escalations: 61, refunds_count: 48, refunds_gbp: 2173.5, pending_reviews: 2, dead_letters: 2 },
    series: { daily, accuracy },
    routes: { orders: Math.round(total * 0.34), returns: Math.round(total * 0.22), faq: Math.round(total * 0.27), refunds: Math.round(total * 0.09), escalation: Math.round(total * 0.05), smalltalk: Math.round(total * 0.03) },
    channels: { web: Math.round(total * 0.52), email: Math.round(total * 0.31), telegram: Math.round(total * 0.17) },
    top_issues: [
      { label: "Where is my order", count: 412 },
      { label: "Return a bedding item", count: 233 },
      { label: "Damaged on arrival", count: 141 },
      { label: "Klarna instalments", count: 96 },
      { label: "Two-person delivery slot", count: 88 },
      { label: "Discount codes (NHS / student)", count: 71 },
    ],
  };
}

export const kbDocs: KbDoc[] = [
  { id: 1, title: "Returns & Refunds Policy", source: "corpus/pdf/returns-policy.pdf", type: "pdf", url: null, chunks: 24 },
  { id: 2, title: "Delivery Information", source: "corpus/pdf/delivery.pdf", type: "pdf", url: null, chunks: 18 },
  { id: 3, title: "Warranty & Care Guide", source: "corpus/pdf/warranty.pdf", type: "pdf", url: null, chunks: 15 },
  { id: 4, title: "Help Centre: Using the Returns Portal", source: "corpus/site/returns-portal.html", type: "web", url: "https://help.hearthandfield.co.uk/returns-portal", chunks: 6 },
  { id: 5, title: "Help Centre: Hearth Rewards", source: "corpus/site/rewards.html", type: "web", url: "https://help.hearthandfield.co.uk/rewards", chunks: 7 },
  { id: 6, title: "Help Centre: Paying with Klarna", source: "corpus/site/klarna.html", type: "web", url: "https://help.hearthandfield.co.uk/klarna", chunks: 5 },
  { id: 7, title: "Help Centre: Discounts", source: "corpus/site/discounts.html", type: "web", url: "https://help.hearthandfield.co.uk/discounts", chunks: 4 },
  { id: 8, title: "Product catalogue", source: "corpus/products.csv", type: "csv", url: null, chunks: 212 },
];

export function kbSearch(q: string) {
  const hit = (chunk_id: number, doc_id: number, section: string, page: number | null, text: string, score: number): KbHit => {
    const d = kbDocs.find((x) => x.id === doc_id)!;
    return { chunk_id, doc_id, title: d.title, section, page, url: d.url, text, score };
  };
  const a = hit(1201, 1, "1. 30-day returns", 2, "You can return most items within 30 days of delivery, unused and in original packaging, using a free label from the Returns Portal.", 0.0);
  const b = hit(1204, 1, "2. Bedding and hygiene", 3, "Opened bedding, pillows and mattresses cannot be returned unless faulty, for hygiene reasons.", 0.0);
  const c = hit(1210, 1, "4. Refund timing", 3, "Refunds are made to the original payment method within 5 working days of the return reaching our Leeds warehouse.", 0.0);
  const d = hit(4102, 4, "Printing your free label", null, "Sign in, choose the order and items, and print the prepaid label. Drop off at any Evri ParcelShop.", 0.0);
  return {
    query: q,
    keyword: [{ ...a, score: 7.42 }, { ...c, score: 5.18 }, { ...d, score: 3.9 }],
    vector: [{ ...b, score: 0.842 }, { ...a, score: 0.817 }, { ...d, score: 0.701 }],
    reranked: [{ ...a, score: 0.962 }, { ...b, score: 0.913 }, { ...c, score: 0.644 }],
  };
}

export const feedback: Feedback[] = [
  { id: 88, message_id: 301, agent: "returns", customer_message: "Can I return a pillow I opened?", original_reply: "Yes, you can return any item within 30 days.", corrected_reply: "Opened pillows can't be returned for hygiene reasons unless they're faulty. If there's a fault, send us a photo and we'll sort it.", action: "edit", reason: "Missed hygiene exclusion", reviewer: "agent@keel.demo", created_at: ago(60 * 5) },
  { id: 87, message_id: 297, agent: "orders", customer_message: "Do you deliver to Jersey?", original_reply: "Yes, we deliver to the Channel Islands.", corrected_reply: null, action: "approve", reason: null, reviewer: "agent@keel.demo", created_at: ago(60 * 7) },
  { id: 86, message_id: 290, agent: "faq", customer_message: "Can I use my NHS and student discount together?", original_reply: "Yes, you can stack them for 25% off.", corrected_reply: null, action: "reject", reason: "Discounts are not combinable", reviewer: "admin@keel.demo", created_at: ago(60 * 26) },
  { id: 85, message_id: 284, agent: "returns", customer_message: "My lamp arrived broken.", original_reply: "Sorry to hear that. Please send a photo within 48 hours and we'll replace it.", corrected_reply: null, action: "approve", reason: null, reviewer: "agent@keel.demo", created_at: ago(60 * 30) },
];

export const prompts: PromptVersion[] = [
  { id: 14, agent: "returns", version: 4, rules: "- Opened bedding, pillows and mattresses are non-returnable unless faulty.\n- Quote the 30-day window from delivery, not order date.\n- Refunds over £50 need approval: say a team member will confirm.", status: "proposed", created_by: "feedback-miner", created_at: ago(60 * 4) },
  { id: 12, agent: "returns", version: 3, rules: "- Quote the 30-day window from delivery.\n- Refunds over £50 need approval.", status: "active", created_by: "admin@keel.demo", created_at: ago(60 * 24 * 6) },
  { id: 13, agent: "faq", version: 2, rules: "- Discounts (student 10%, NHS 15%) are not combinable and not valid on sale items.", status: "active", created_by: "admin@keel.demo", created_at: ago(60 * 24 * 2) },
  { id: 9, agent: "returns", version: 2, rules: "- Be concise.", status: "retired", created_by: "admin@keel.demo", created_at: ago(60 * 24 * 20) },
];

const cats = ["orders", "returns", "refunds", "delivery", "policy", "escalation", "safety"];
export const evalRuns: EvalRun[] = Array.from({ length: 10 }, (_, i) => {
  const score = Number((0.74 + i * 0.016 + (i % 3 === 1 ? -0.01 : 0)).toFixed(3));
  return {
    id: 20 + i,
    score,
    n_cases: i % 4 === 3 ? 20 : 120,
    mode: i % 4 === 3 ? "subset" : "full",
    breakdown: Object.fromEntries(cats.map((c, j) => [c, { score: Number(Math.min(0.99, score + Math.sin(i + j) * 0.07).toFixed(3)), n: i % 4 === 3 ? 3 : 17 }])),
    created_at: ago(60 * 24 * (10 - i) * 2),
  };
}).reverse();

export const opsQueue: OpsQueue = {
  counts: { pending: 3, processing: 1, done: 1842, retry: 2, dead: 2 },
  inbox: [
    { id: 9012, channel: "telegram", external_id: "tg-771204556-8812", sender: "771204556", payload: { text: "Any update on my lamp?" }, status: "processing", attempts: 1, next_attempt_at: null, last_error: null, created_at: ago(1) },
    { id: 9010, channel: "email", external_id: "re_8dk2l1", sender: "g.whitfield@example.co.uk", payload: { subject: "Saturday delivery" }, status: "retry", attempts: 2, next_attempt_at: ago(-3), last_error: "LLM provider timeout after 30s", created_at: ago(9) },
    { id: 9004, channel: "email", external_id: "re_7ab991", sender: "noreply@bounce.example", payload: { subject: "Undeliverable" }, status: "dead", attempts: 5, next_attempt_at: null, last_error: "Sender not a customer and payload missing body", created_at: ago(60 * 3) },
    { id: 8998, channel: "telegram", external_id: "tg-558120934-7702", sender: "558120934", payload: { text: "/start" }, status: "dead", attempts: 5, next_attempt_at: null, last_error: "psycopg.OperationalError: connection reset", created_at: ago(60 * 6) },
  ],
  outbox: [
    { id: 4411, conversation_id: 5, channel: "email", recipient: "g.whitfield@example.co.uk", body: "Saturday delivery isn't available for two-person furniture…", status: "retry", attempts: 1, next_attempt_at: ago(-2), last_error: "Resend 429 rate limited", idempotency_key: "ob-5-551" },
    { id: 4410, conversation_id: 3, channel: "telegram", recipient: "558120934", body: "Your refund of £34 has been issued.", status: "done", attempts: 1, next_attempt_at: null, last_error: null, idempotency_key: "ob-3-540" },
  ],
};

export const settings: SettingsResponse = {
  tenant: "Hearth & Field Ltd",
  integrations: [
    { name: "Anthropic", status: "connected", detail: "claude-sonnet-4-5, claude-haiku-4-5" },
    { name: "Postgres + pgvector", status: "connected", detail: "8 docs, 291 chunks, bge-small 384d" },
    { name: "Telegram bot", status: "connected", detail: "@HearthFieldHelpBot webhook set" },
    { name: "Resend email", status: "connected", detail: "Inbound on support@hearthandfield.co.uk" },
    { name: "n8n", status: "not_configured", detail: "KEEL_N8N_SECRET not set" },
    { name: "Langfuse", status: "error", detail: "401 from host, check public key" },
  ],
  models: { router: "claude-haiku-4-5", agents: "claude-sonnet-4-5", embeddings: "BAAI/bge-small-en-v1.5", reranker: "cross-encoder/ms-marco-MiniLM-L-6-v2" },
  limits: { auto_refund_limit_gbp: 50, review_confidence_threshold: 0.75, max_retries: 5, daily_report_time: "08:00 Europe/London" },
};
