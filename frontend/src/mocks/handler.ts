import * as fx from "@/mocks/fixtures";
import type { PromptVersion, ReviewRequest, User } from "@/lib/types";

export interface MockResponse {
  status: number;
  body: unknown;
}

const USERS: Record<string, { password: string; user: User }> = {
  "admin@keel.demo": { password: "KeelAdmin!2026", user: { email: "admin@keel.demo", role: "admin", name: "Maya Admin" } },
  "agent@keel.demo": { password: "KeelAgent!2026", user: { email: "agent@keel.demo", role: "agent", name: "Sam Agent" } },
};

function userFromToken(token: string | null): User | null {
  if (!token?.startsWith("mock.")) return null;
  return USERS[token.slice(5)]?.user ?? null;
}

const ok = (body: unknown): MockResponse => ({ status: 200, body });
const err = (status: number, detail: string): MockResponse => ({ status, body: { detail } });
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ADMIN_ONLY = [/^\/api\/kb\/reindex$/, /^\/api\/prompts\/propose$/, /^\/api\/prompts\/\d+\/activate$/, /^\/api\/evals\/run$/, /^\/api\/ops\//, /^\/api\/settings$/];

export async function mockRequest(method: string, fullPath: string, body: unknown, token: string | null): Promise<MockResponse> {
  await delay(120 + Math.random() * 180);
  const url = new URL(fullPath, "http://mock");
  const path = url.pathname;
  const q = url.searchParams;

  if (path === "/health") return ok({ status: "ok", version: "mock" });
  if (path === "/api/auth/login" && method === "POST") {
    const b = body as { email?: string; password?: string };
    const entry = USERS[(b.email ?? "").toLowerCase()];
    if (!entry || entry.password !== b.password) return err(401, "Invalid email or password");
    return ok({ token: `mock.${entry.user.email}`, user: entry.user });
  }

  const user = userFromToken(token);
  if (!user) return err(401, "Not authenticated");
  if (ADMIN_ONLY.some((r) => r.test(path)) && user.role !== "admin") return err(403, "Admin only");

  let m: RegExpMatchArray | null;
  if (path === "/api/auth/me") return ok(user);
  if (path === "/api/conversations") {
    return ok(fx.conversations.filter((c) => (!q.get("status") || c.status === q.get("status")) && (!q.get("channel") || c.channel === q.get("channel"))));
  }
  if ((m = path.match(/^\/api\/conversations\/(\d+)$/))) {
    const d = fx.conversationDetail(Number(m[1]));
    return d ? ok(d) : err(404, "Conversation not found");
  }
  if (path === "/api/approvals") return ok(fx.approvals());
  if ((m = path.match(/^\/api\/messages\/(\d+)\/review$/))) {
    const b = body as ReviewRequest;
    if (b.action === "reject" && !b.reason) return err(422, "Reason required");
    return ok({ ok: true, status: b.action === "approve" ? "sent" : b.action === "edit" ? "edited" : "rejected" });
  }
  if ((m = path.match(/^\/api\/refunds\/(\d+)\/decision$/))) return ok({ ok: true, status: (body as { approve: boolean }).approve ? "issued" : "rejected" });
  if (path === "/api/tickets") return ok(fx.tickets);
  if ((m = path.match(/^\/api\/tickets\/(\d+)\/resolve$/))) return ok({ ok: true });
  if (path === "/api/customers") return ok(fx.customerList);
  if ((m = path.match(/^\/api\/customers\/(\d+)$/))) {
    const p = fx.customerProfile(Number(m[1]));
    return p ? ok(p) : err(404, "Customer not found");
  }
  if (path === "/api/analytics") return ok(fx.analytics(Number(q.get("days") ?? 30)));
  if (path === "/api/kb/docs") return ok(fx.kbDocs);
  if (path === "/api/kb/search") return ok(fx.kbSearch(q.get("q") ?? ""));
  if (path === "/api/kb/reindex") {
    await delay(900);
    return ok({ docs: fx.kbDocs.length, chunks: 291, took_ms: 8420 });
  }
  if (path === "/api/feedback") return ok(fx.feedback);
  if (path === "/api/prompts") return ok(fx.prompts);
  if (path === "/api/prompts/propose") {
    const agent = (body as { agent?: string })?.agent ?? "returns";
    const p: PromptVersion = { id: 99, agent, version: 5, rules: "- Mined from latest edits: mention Klarna limits (£30–£1,000).", status: "proposed", created_by: user.email, created_at: new Date().toISOString() };
    return ok(p);
  }
  if ((m = path.match(/^\/api\/prompts\/(\d+)\/activate$/))) {
    const p = fx.prompts.find((x) => x.id === Number(m![1]));
    return p ? ok({ ...p, status: "active" }) : err(404, "Prompt not found");
  }
  if (path === "/api/evals/runs") return ok(fx.evalRuns);
  if (path === "/api/evals/run") {
    await delay(1200);
    const last = fx.evalRuns[0];
    return ok({ ...last, id: last.id + 1, mode: "subset", n_cases: 20, created_at: new Date().toISOString() });
  }
  if (path === "/api/ops/queue") return ok(fx.opsQueue);
  if ((m = path.match(/^\/api\/ops\/queue\/(inbox|outbox)\/(\d+)\/retry$/))) return ok({ ok: true });
  if (path === "/api/ops/report/send") return ok({ ok: true, detail: "Daily report sent to ops@hearthandfield.co.uk" });
  if (path === "/api/settings") return ok(fx.settings);
  return err(404, `No mock for ${method} ${path}`);
}
