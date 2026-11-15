"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { clearAllCrmClientCaches } from "../utils/crmCache";
import {
  type LogoutReason,
  mapAuthCodeToLogoutReason,
} from "../utils/authSessionNotice";
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
  type LogoutReason,
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
  closeSession: (reason?: LogoutReason) => void;
  verifySession: (options?: { force?: boolean; fallbackReason?: LogoutReason }) => Promise<boolean>;
  updateSessionToken: (newToken: string) => void;
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
  closeSession: () => {},
  verifySession: async () => false,
  updateSessionToken: () => {},
  updateCurrentUser: () => {},
  authFetch: async (url, init) => fetch(url, init),
});

export function useAuth() {
  return useContext(AuthContext);
}

const TOKEN_KEY = "tchaikovsky-token";
const USER_KEY = "tchaikovsky-user";
const VERIFY_THROTTLE_MS = 5000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const tokenRef = useRef<string | null>(null);
  const loggingOutRef = useRef(false);
  const verifyInFlightRef = useRef<Promise<boolean> | null>(null);
  const lastVerifyAtRef = useRef(0);

  const closeSession = useCallback(
    (reason: LogoutReason = "manual") => {
      if (loggingOutRef.current) return;
      loggingOutRef.current = true;
      tokenRef.current = null;
      verifyInFlightRef.current = null;

      try {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      } catch {}
      clearAllCrmClientCaches();

      setToken(null);
      setUser(null);

      const target =
        reason !== "manual" ? `/login?reason=${encodeURIComponent(reason)}` : "/login";
      router.replace(target);
    },
    [router]
  );

  const logout = useCallback(() => {
    closeSession("manual");
  }, [closeSession]);

  const verifySession = useCallback(
    async (options?: { force?: boolean; fallbackReason?: LogoutReason }): Promise<boolean> => {
      const currentToken =
        tokenRef.current || (typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null);
      if (!currentToken) return false;

      if (verifyInFlightRef.current) {
        return verifyInFlightRef.current;
      }

      const now = Date.now();
      if (!options?.force && now - lastVerifyAtRef.current < VERIFY_THROTTLE_MS) {
        return true;
      }
      lastVerifyAtRef.current = now;

      const run = (async (): Promise<boolean> => {
        try {
          const res = await fetch("/crm-api/auth/me", {
            headers: { Authorization: `Bearer ${currentToken}` },
            cache: "no-store",
          });
          const data = await res.json().catch(() => null);

          if (data?.success && data.user) {
            setToken(currentToken);
            tokenRef.current = currentToken;
            setUser((prev) => {
              const updated: AuthUser = {
                ...data.user,
                avatar: data.user.avatar !== undefined ? data.user.avatar : (prev?.avatar || ""),
              };
              try {
                localStorage.setItem(USER_KEY, JSON.stringify(updated));
              } catch {}
              return updated;
            });
            return true;
          }

          if (res.status === 401 || res.status === 403) {
            const reason = mapAuthCodeToLogoutReason(
              data?.code,
              options?.fallbackReason || "session_expired"
            );
            closeSession(reason);
            return false;
          }

          return true;
        } catch {
          // Network failure keeps cached session intact until connectivity returns
          return true;
        } finally {
          verifyInFlightRef.current = null;
        }
      })();

      verifyInFlightRef.current = run;
      return run;
    },
    [closeSession]
  );

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

    tokenRef.current = stored;
    loggingOutRef.current = false;

    // Instantly hydrate cached session (0ms delay) without SSR hydration mismatch
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        if (parsed && !ignore) {
          queueMicrotask(() => {
            if (!ignore) {
              setToken(stored);
              setUser(parsed);
              setLoading(false);
            }
          });
        }
      } catch {}
    }

    verifySession({ force: true }).finally(() => {
      if (!ignore) setLoading(false);
    });

    return () => {
      ignore = true;
    };
  }, [verifySession]);

  // Listen for cross-tab auth storage changes, visibility focus, and manual session-revoked events
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleStorage = (e: StorageEvent) => {
      if (e.key !== TOKEN_KEY) return;
      if (!e.newValue) {
        if (!loggingOutRef.current) {
          loggingOutRef.current = true;
          tokenRef.current = null;
          clearAllCrmClientCaches();
          setToken(null);
          setUser(null);
          router.replace("/login");
        }
        return;
      }

      if (e.newValue !== tokenRef.current) {
        loggingOutRef.current = false;
        tokenRef.current = e.newValue;
        setToken(e.newValue);
        verifySession({ force: true });
      }
    };

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "hidden") return;
      if (tokenRef.current) {
        verifySession();
      }
    };

    const handleSessionRevoked = (event: Event) => {
      const customEvent = event as CustomEvent<{ reason?: string }>;
      const rawReason = customEvent?.detail?.reason;
      const reason: LogoutReason =
        rawReason === "deactivated" ||
        rawReason === "deleted" ||
        rawReason === "session_revoked" ||
        rawReason === "session_expired"
          ? rawReason
          : "session_revoked";
      closeSession(reason);
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);
    window.addEventListener("crm:session-revoked", handleSessionRevoked);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      window.removeEventListener("crm:session-revoked", handleSessionRevoked);
    };
  }, [closeSession, router, verifySession]);

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
      loggingOutRef.current = false;
      tokenRef.current = data.token;
      lastVerifyAtRef.current = Date.now();
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      return null;
    } catch {
      return "Network error. Unable to reach authentication server.";
    }
  }, []);

  const updateSessionToken = useCallback((newToken: string) => {
    if (!newToken) return;
    loggingOutRef.current = false;
    tokenRef.current = newToken;
    try {
      localStorage.setItem(TOKEN_KEY, newToken);
    } catch {}
    setToken(newToken);
  }, []);

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
      const currentToken =
        tokenRef.current || (typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null);
      const headers = new Headers(init?.headers);
      if (currentToken && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${currentToken}`);
      }
      const res = await fetch(url, { ...init, headers });

      if (res.status === 401 && currentToken && !url.includes("/auth/login")) {
        let code: string | undefined;
        try {
          const payload = await res.clone().json();
          code = payload?.code;
        } catch {}
        closeSession(mapAuthCodeToLogoutReason(code, "session_expired"));
      }

      return res;
    },
    [closeSession]
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
        closeSession,
        verifySession,
        updateSessionToken,
        updateCurrentUser,
        authFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
