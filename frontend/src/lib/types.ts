export type Role = "admin" | "agent";
export type Channel = "web" | "telegram" | "email";
export type ConversationStatus = "open" | "escalated" | "resolved";
export type MessageRole = "user" | "assistant" | "human_agent";
export type MessageStatus = "sent" | "pending_review" | "rejected" | "edited";
export type Tier = "standard" | "vip";
export type OrderStatus =
  | "processing"
  | "dispatched"
  | "in_transit"
  | "delivered"
  | "cancelled"
  | "refunded"
  | "partially_refunded";
export type RefundStatus = "issued" | "pending_approval" | "rejected";
export type TicketKind = "escalation" | "refund_approval" | "followup";
export type TicketStatus = "open" | "resolved";
export type ReviewAction = "approve" | "edit" | "reject";
export type PromptStatus = "proposed" | "active" | "retired";
export type QueueStatus = "pending" | "processing" | "done" | "retry" | "dead";
export type DocType = "pdf" | "web" | "csv";

export interface User {
  email: string;
  role: Role;
  name: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface CustomerRef {
  id?: number;
  name: string;
  email: string;
  tier: Tier;
}

export interface ConversationSummary {
  id: number;
  customer: CustomerRef;
  channel: Channel;
  status: ConversationStatus;
  last_message: string;
  pending_count: number;
  updated_at: string;
}

export interface Conversation {
  id: number;
  customer_id: number;
  channel: Channel;
  thread_id: string | null;
  status: ConversationStatus;
  created_at: string;
  updated_at: string;
}

export interface RouterDecision {
  label: string;
  route: string;
  confidence: number;
  model: string;
  risk?: string | null;
  reason?: string | null;
}

export interface TraceStep {
  type: string;
  agent: string;
  tool?: string | null;
  args?: Record<string, unknown> | null;
  result?: unknown;
  reason: string;
}

export interface Source {
  n: number;
  title: string;
  section: string | null;
  page: number | null;
  url: string | null;
  score: number;
}

export interface Trace {
  id: number;
  conversation_id: number;
  message_id: number;
  router: RouterDecision;
  steps: TraceStep[];
  sources: Source[];
  model: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  latency_ms: number;
  error: string | null;
  created_at: string;
}

export interface Message {
  id: number;
  conversation_id: number;
  role: MessageRole;
  content: string;
  agent: string | null;
  status: MessageStatus;
  confidence: number | null;
  trace_id: number | null;
  created_at: string;
  trace?: Trace | null;
}

export interface OrderItem {
  sku: string;
  name: string;
  qty: number;
  price_gbp: number;
}

export interface Order {
  id: string;
  customer_id: number;
  status: OrderStatus;
  total_gbp: number;
  items: OrderItem[];
  shipping_address: string;
  carrier: string | null;
  tracking: string | null;
  created_at: string;
  delivered_at: string | null;
  updated_at: string;
}

export interface Refund {
  id: number;
  order_id: string;
  amount_gbp: number;
  reason: string;
  status: RefundStatus;
  idempotency_key: string;
  created_by: string;
  approved_by: string | null;
  created_at: string;
}

export interface TicketSummary {
  issue: string;
  customer_ask?: string;
  actions_taken?: string[];
  recommended_next?: string;
  sentiment?: string;
}

export interface Ticket {
  id: number;
  conversation_id: number | null;
  customer_id: number;
  customer?: CustomerRef;
  kind: TicketKind;
  risk: string | null;
  summary: TicketSummary;
  status: TicketStatus;
  created_at: string;
}

export interface Customer {
  id: number;
  name: string;
  email: string;
  telegram_chat_id: string | null;
  phone: string | null;
  tier: Tier;
  vulnerable: boolean;
  created_at: string;
}

export interface Sentiment {
  score: number;
  label: "positive" | "neutral" | "negative";
  trend: { day: string; score: number }[];
}

export interface CustomerListItem extends Customer {
  orders_count: number;
  lifetime_gbp: number;
  open_tickets: number;
  sentiment: Sentiment["label"];
}

export interface CustomerProfile {
  customer: Customer;
  orders: Order[];
  refunds: Refund[];
  tickets: Ticket[];
  conversations: ConversationSummary[];
  sentiment: Sentiment;
}

export interface ConversationDetail {
  conversation: Conversation;
  customer_profile: CustomerProfile;
  messages: Message[];
  tickets: Ticket[];
}

export interface PendingMessage extends Message {
  customer: CustomerRef;
  customer_message: string;
  channel: Channel;
}

export interface PendingRefund extends Refund {
  customer: CustomerRef;
  conversation_id: number | null;
  order_total_gbp: number;
}

export interface ApprovalsResponse {
  messages: PendingMessage[];
  refunds: PendingRefund[];
}

export interface ReviewRequest {
  action: ReviewAction;
  corrected?: string;
  reason?: string;
}

export interface Kpis {
  conversations: number;
  auto_resolution_pct: number;
  avg_response_ms: number;
  p95_response_ms: number;
  cost_per_conversation_usd: number;
  escalations: number;
  refunds_count: number;
  refunds_gbp: number;
  pending_reviews: number;
  dead_letters: number;
}

export interface DailyPoint {
  day: string;
  count: number;
  avg_ms: number;
  cost: number;
}

export interface AccuracyPoint {
  day: string;
  human_approval_pct: number | null;
  eval_score: number | null;
}

export interface Analytics {
  kpis: Kpis;
  series: { daily: DailyPoint[]; accuracy: AccuracyPoint[] };
  routes: Record<string, number>;
  channels: Record<string, number>;
  top_issues: { label: string; count: number }[];
}

export interface KbDoc {
  id: number;
  title: string;
  source: string;
  type: DocType;
  url: string | null;
  chunks?: number;
}

export interface KbHit {
  chunk_id: number;
  doc_id: number;
  title: string;
  section: string | null;
  page: number | null;
  url: string | null;
  text: string;
  score: number;
}

export interface KbSearchResponse {
  query: string;
  keyword: KbHit[];
  vector: KbHit[];
  reranked: KbHit[];
}

export interface ReindexResponse {
  docs: number;
  chunks: number;
  took_ms: number;
}

export interface Feedback {
  id: number;
  message_id: number;
  agent: string;
  customer_message: string;
  original_reply: string;
  corrected_reply: string | null;
  action: ReviewAction;
  reason: string | null;
  reviewer: string;
  created_at: string;
}

export interface PromptVersion {
  id: number;
  agent: string;
  version: number;
  rules: string;
  status: PromptStatus;
  created_by: string;
  created_at: string;
}

export interface EvalCategory {
  score: number;
  n: number;
}

export interface EvalRun {
  id: number;
  score: number;
  breakdown: Record<string, EvalCategory>;
  n_cases: number;
  mode: string;
  created_at: string;
}

export interface InboxItem {
  id: number;
  channel: Channel;
  external_id: string;
  sender: string;
  payload: Record<string, unknown>;
  status: QueueStatus;
  attempts: number;
  next_attempt_at: string | null;
  last_error: string | null;
  created_at: string;
}

export interface OutboxItem {
  id: number;
  conversation_id: number | null;
  channel: string;
  recipient: string;
  body: string;
  status: QueueStatus;
  attempts: number;
  next_attempt_at: string | null;
  last_error: string | null;
  idempotency_key: string;
}

export interface OpsQueue {
  counts: Record<QueueStatus, number>;
  inbox: InboxItem[];
  outbox: OutboxItem[];
}

export interface Integration {
  name: string;
  status: "connected" | "not_configured" | "error";
  detail: string;
}

export interface SettingsResponse {
  tenant: string;
  integrations: Integration[];
  models: Record<string, string>;
  limits: Record<string, string | number>;
}

export interface OkResponse {
  ok: boolean;
  detail?: string;
}

export interface Health {
  status: string;
  version?: string;
}

export interface ChatRequest {
  email: string;
  name?: string;
  message: string;
  conversation_id?: number;
}

export interface ChatDone {
  message_id: number;
  conversation_id: number;
  status: MessageStatus;
  cost_usd: number;
  latency_ms: number;
}

export type ChatEvent =
  | { event: "router"; data: RouterDecision }
  | { event: "step"; data: TraceStep }
  | { event: "sources"; data: Source[] }
  | { event: "token"; data: { t: string } }
  | { event: "done"; data: ChatDone }
  | { event: "error"; data: { detail: string } };

export type LiveEvent =
  | { event: "message"; data: Message }
  | { event: "conversation"; data: ConversationSummary }
  | { event: "ticket"; data: Ticket };
