"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  type CanonicalRole,
  type Role,
  type RoleOption,
  ROLE_OPTIONS,
  normalizeRole,
  getRoleDisplayName,
  isReadOnlyRole,
  canManageTeamRole,
  isDirectorOrChairmanRole,
  isAdmissionRole,
  isAssignableRole,
  canAccessRoute,
  getDefaultRouteForRole,
} from "../utils/roles";

export {
  type CanonicalRole,
  type Role,
  type RoleOption,
  ROLE_OPTIONS,
  normalizeRole,
  getRoleDisplayName,
  isReadOnlyRole,
  canManageTeamRole,
  isDirectorOrChairmanRole,
  isAdmissionRole,
  isAssignableRole,
  canAccessRoute,
  getDefaultRouteForRole,
};

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatar?: string;
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
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        return { status: r.status, ok: r.ok, data };
      })
      .then(({ status, data }) => {
        if (!ignore) {
          if (data?.success && data.user) {
            setToken(stored);
            setUser((prev) => {
              const updated = {
                ...data.user,
                avatar: data.user.avatar !== undefined ? data.user.avatar : (prev?.avatar || ""),
              };
              try {
                localStorage.setItem(USER_KEY, JSON.stringify(updated));
              } catch {}
              return updated;
            });
          } else if (status === 401 || status === 403) {
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
      const data = await res.json().catch(() => null);
      if (!data) {
        return "Network error. Unable to reach authentication server.";
      }
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
