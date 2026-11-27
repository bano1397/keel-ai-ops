"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { KeelLogo } from "@/components/shell/logo";
import { useAuth } from "@/lib/auth";

const DEMO = [
  { role: "Admin", email: "admin@keel.demo", password: "KeelAdmin!2026" },
  { role: "Agent", email: "agent@keel.demo", password: "KeelAgent!2026" },
];

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      const next = params.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/inbox");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Sign in</CardTitle>
        <CardDescription>Hearth &amp; Field support workspace</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Sign in
          </Button>
        </form>
        <div className="bg-muted/50 mt-6 rounded-lg border border-dashed p-3" data-testid="demo-credentials">
          <div className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">Demo credentials</div>
          <div className="space-y-1.5">
            {DEMO.map((d) => (
              <button
                key={d.email}
                type="button"
                onClick={() => {
                  setEmail(d.email);
                  setPassword(d.password);
                }}
                className="hover:bg-background flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-xs transition-colors"
              >
                <span className="font-medium">{d.role}</span>
                <span className="text-muted-foreground font-mono">
                  {d.email} / {d.password}
                </span>
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="bg-background relative flex min-h-screen flex-col items-center justify-center gap-8 px-4">
      <div className="from-primary/10 pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b to-transparent" />
      <div className="relative">
        <KeelLogo />
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
