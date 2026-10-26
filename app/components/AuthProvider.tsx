"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

export type Role =
  | "chairman"
  | "enrollment_director"
  | "admission_officer"
  | "finance"
  | "marketing"
  | "owner"
  | "manager"
  | "agent"
  | "analyst";

export function normalizeRole(role?: string): "chairman" | "enrollment_director" | "admission_officer" | "finance" | "marketing" {
  if (!role) return "admission_officer";
  const r = role.toLowerCase().trim();
  if (r === "chairman" || r === "owner" || r === "manager") return "chairman";
  if (r === "enrollment_director") return "enrollment_director";
  if (r === "admission_officer" || r === "agent") return "admission_officer";
  if (r === "finance" || r === "analyst") return "finance";
  if (r === "marketing") return "marketing";
  return "admission_officer";
}

export function getRoleDisplayName(role?: string): string {
  const norm = normalizeRole(role);
  switch (norm) {
    case "chairman":
      return "Chairman";
    case "enrollment_director":
      return "Enrollment Director";
    case "admission_officer":
      return "Admission Officer";
    case "finance":
      return "Finance";
    case "marketing":
      return "Marketing";
    default:
      return "Admission Officer";
  }
}

export function isReadOnlyRole(role?: string): boolean {
  return normalizeRole(role) === "marketing";
}

export function canManageTeamRole(role?: string): boolean {
  return normalizeRole(role) === "chairman";
}

export function canAccessRoute(role: string | undefined, pathname: string): boolean {
  if (pathname === "/login") return true;
  const norm = normalizeRole(role);

  if (norm === "chairman" || norm === "marketing") {
    return true;
  }

  if (norm === "enrollment_director") {
    return pathname === "/auditions" || pathname === "/settings";
  }

  if (norm === "finance") {
    return pathname === "/pipeline" || pathname === "/reports" || pathname === "/settings";
  }

  if (norm === "admission_officer") {
    return pathname !== "/reports";
  }

  return true;
}

export function getDefaultRouteForRole(role?: string): string {
  const norm = normalizeRole(role);
  switch (norm) {
    case "enrollment_director":
      return "/auditions";
    case "finance":
      return "/pipeline";
    case "admission_officer":
    case "chairman":
    case "marketing":
    default:
      return "/";
  }
}

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
  roleDisplayName: string;
  isReadOnly: boolean;
  canManageTeam: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => void;
  updateCurrentUser: (updates: Partial<AuthUser>) => void;
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  loading: true,
  roleDisplayName: "Admission Officer",
  isReadOnly: false,
  canManageTeam: false,
  login: async () => "Not ready",
  logout: () => {},
  updateCurrentUser: () => {},
  authFetch: async (url, init) => fetch(url, init),
});

export function useAuth() {
  return useContext(AuthContext);
}

const TOKEN_KEY = "tchaikovsky-token";
const USER_KEY = "tchaikovsky-user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // On client mount: restore session from cache instantly, then verify in background
  useEffect(() => {
    let ignore = false;
    const stored = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
    const storedUser = typeof window !== "undefined" ? localStorage.getItem(USER_KEY) : null;

    if (!stored) {
      queueMicrotask(() => {
        if (!ignore) setLoading(false);
      });
      return () => {
        ignore = true;
      };
    }

    // Instantly hydrate cached session (0ms delay) without SSR hydration mismatch
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        if (parsed && !ignore) {
          setToken(stored);
          setUser(parsed);
          setLoading(false);
        }
      } catch {}
    }

    // Verify token validity in background
    fetch("/crm-api/auth/me", {
      headers: { Authorization: `Bearer ${stored}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!ignore) {
          if (data.success && data.user) {
            setToken(stored);
            setUser(data.user);
            try {
              localStorage.setItem(USER_KEY, JSON.stringify(data.user));
            } catch {}
          } else {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
            setToken(null);
            setUser(null);
          }
        }
      })
      .catch(() => {
        // Only wipe session if explicitly 401/invalid, network failure should keep cached session
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
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      return null;
    } catch {
      return "Network error. Unable to reach authentication server.";
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    router.push("/login");
  }, [router]);

  const updateCurrentUser = useCallback((updates: Partial<AuthUser>) => {
    setUser((prev) => {
      if (!prev) return null;
      const updated = { ...prev, ...updates };
      try {
        localStorage.setItem(USER_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
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

  const roleDisplayName = getRoleDisplayName(user?.role);
  const isReadOnly = isReadOnlyRole(user?.role);
  const canManageTeam = canManageTeamRole(user?.role);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        roleDisplayName,
        isReadOnly,
        canManageTeam,
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
