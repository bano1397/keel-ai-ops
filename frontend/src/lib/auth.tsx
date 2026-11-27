"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, clearSession, getStoredUser, getToken, setSession } from "@/lib/api";
import type { LoginResponse, User } from "@/lib/types";

interface AuthState {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getToken();
    setUser(token ? getStoredUser<User>() : null);
    setReady(true);
    if (token) {
      api<User>("/api/auth/me")
        .then((u) => {
          setUser(u);
          setSession(token, u);
        })
        .catch(() => {});
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<LoginResponse>("/api/auth/login", { body: { email, password }, auth: false });
    setSession(res.token, res.user);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
    window.location.href = "/login";
  }, []);

  return <AuthContext.Provider value={{ user, ready, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
