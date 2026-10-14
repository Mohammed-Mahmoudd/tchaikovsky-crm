"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

export type Role = "owner" | "manager" | "agent" | "analyst";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => void;
  updateCurrentUser: (updates: Partial<AuthUser>) => void;
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  loading: true,
  login: async () => "Not ready",
  logout: () => {},
  updateCurrentUser: () => {},
  authFetch: async (url, init) => fetch(url, init),
});

export function useAuth() {
  return useContext(AuthContext);
}

const TOKEN_KEY = "tchaikovsky-token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // On mount: restore session from localStorage and strictly verify with server
  useEffect(() => {
    let ignore = false;
    const stored = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
    if (!stored) {
      queueMicrotask(() => {
        if (!ignore) setLoading(false);
      });
      return () => {
        ignore = true;
      };
    }

    fetch("/crm-api/auth/me", {
      headers: { Authorization: `Bearer ${stored}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!ignore) {
          if (data.success && data.user) {
            setToken(stored);
            setUser(data.user);
          } else {
            localStorage.removeItem(TOKEN_KEY);
            setToken(null);
            setUser(null);
          }
        }
      })
      .catch(() => {
        if (!ignore) {
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
          setUser(null);
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<string | null> => {
    const cleanEmail = email.toLowerCase().trim();
    try {
      const res = await fetch("/crm-api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, password }),
      });
      const data = await res.json();
      if (!data.success) {
        return data.error || "Invalid email or password";
      }
      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      setUser(data.user);
      return null;
    } catch {
      return "Network error. Unable to reach authentication server.";
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    router.push("/login");
  }, [router]);

  const updateCurrentUser = useCallback((updates: Partial<AuthUser>) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : null));
  }, []);

  const authFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const currentToken = token || (typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null);
      const headers = new Headers(init?.headers);
      if (currentToken) {
        headers.set("Authorization", `Bearer ${currentToken}`);
      }
      return fetch(url, { ...init, headers });
    },
    [token]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        logout,
        updateCurrentUser,
        authFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
