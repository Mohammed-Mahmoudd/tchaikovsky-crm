"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeRole, useAuth } from "../components/AuthProvider";
import {
  applyLivePresenceToMetrics,
  type LivePresenceEntry,
  type PresenceStatus,
  type ScreenRef,
  type TeamMetricsPayload,
} from "../utils/agentMetrics";
import {
  clearTeamMetricsMemoryCache,
  fetchTeamMetricsEndpoint,
  readCachedTeamMetrics,
  writeCachedTeamMetrics,
} from "../utils/teamMetricsClient";

export interface UseTeamPerformanceMetricsOptions {
  startMs: number;
  endMs: number;
  agent?: string | null;
  enabled?: boolean;
}

export interface UseTeamPerformanceMetricsResult {
  metrics: TeamMetricsPayload | null;
  loading: boolean;
  error: string | null;
  unsupported: boolean;
  refresh: () => Promise<void>;
}

export function useTeamPerformanceMetrics({
  startMs,
  endMs,
  agent = null,
  enabled = true,
}: UseTeamPerformanceMetricsOptions): UseTeamPerformanceMetricsResult {
  const { token, user, authFetch } = useAuth();
  const [metrics, setMetrics] = useState<TeamMetricsPayload | null>(null);
  const [resolvedKey, setResolvedKey] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState<boolean>(false);

  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const liveUpdatesRef = useRef<Map<string, LivePresenceEntry>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const dirtyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyWhileHiddenRef = useRef<boolean>(false);

  const cleanAgent =
    agent && agent.trim() && agent.trim() !== "__all__" && agent.trim().toLowerCase() !== "all"
      ? agent.trim()
      : "";
  const requestKey =
    enabled && token ? `${Math.floor(startMs)}:${Math.floor(endMs)}:${cleanAgent}` : "";

  const getScopedCacheKey = useCallback((reqKey: string): string => {
    const activeUser = userRef.current;
    if (!reqKey || !activeUser?.id) return "";
    return `${activeUser.id}:${normalizeRole(activeUser.role)}:${reqKey}`;
  }, []);

  const runFetch = useCallback(
    async ({
      keyForRun,
      silent = false,
      signal,
    }: {
      keyForRun: string;
      silent?: boolean;
      signal?: AbortSignal;
    }) => {
      if (!keyForRun || !token) return;

      const params = new URLSearchParams();
      if (startMs > 0) params.set("startMs", String(Math.floor(startMs)));
      if (endMs > 0) params.set("endMs", String(Math.floor(endMs)));
      if (cleanAgent) params.set("agent", cleanAgent);
      const qs = params.toString() ? `?${params.toString()}` : "";

      try {
        const res = await fetchTeamMetricsEndpoint(`/team-metrics${qs}`, {
          authFetch,
          signal,
        });

        if (signal?.aborted) return;

        if (!res) {
          if (!silent) {
            setError("Unable to load response and presence metrics.");
            setResolvedKey(keyForRun);
          }
          return;
        }

        if (res.status === 404) {
          setUnsupported(true);
          setError(null);
          setResolvedKey(keyForRun);
          return;
        }

        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success || !json?.data) {
          if (!silent) {
            setError(json?.error || "Unable to load response and presence metrics.");
            setResolvedKey(keyForRun);
          }
          return;
        }

        const payload = json.data as TeamMetricsPayload;
        const cacheKey = getScopedCacheKey(keyForRun);
        if (cacheKey) {
          writeCachedTeamMetrics(cacheKey, payload);
        }

        setUnsupported(false);
        setError(null);
        const merged = applyLivePresenceToMetrics(payload, liveUpdatesRef.current);
        setMetrics(merged);
        setResolvedKey(keyForRun);
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        if (!silent) {
          setError("Unable to load response and presence metrics.");
          setResolvedKey(keyForRun);
        }
      }
    },
    [token, startMs, endMs, cleanAgent, authFetch, getScopedCacheKey]
  );

  useEffect(() => {
    if (!token) {
      clearTeamMetricsMemoryCache();
      queueMicrotask(() => {
        setMetrics(null);
        setResolvedKey("");
        setError(null);
      });
      return;
    }
    if (!requestKey) return;
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    const cacheKey = getScopedCacheKey(requestKey);
    const cached = cacheKey ? readCachedTeamMetrics(cacheKey) : null;

    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      if (cached) {
        setUnsupported(false);
        setError(null);
        setMetrics(applyLivePresenceToMetrics(cached, liveUpdatesRef.current));
        setResolvedKey(requestKey);
      }
      void runFetch({
        keyForRun: requestKey,
        silent: Boolean(cached),
        signal: controller.signal,
      });
    });

    return () => {
      controller.abort();
    };
  }, [token, requestKey, runFetch, getScopedCacheKey]);

  // Real-time SSE live presence patching + background refresh on message activity
  useEffect(() => {
    if (!requestKey || typeof window === "undefined") return;

    const handlePresenceEvent = (event: Event) => {
      const detail = (event as CustomEvent<{
        userId?: string;
        userName?: string;
        status?: PresenceStatus;
        currentScreen?: string | null;
        currentScreenLabel?: string | null;
        currentScreenPath?: string | null;
        activeScreens?: ScreenRef[];
        lastSeenAt?: number;
        lastActiveAt?: number;
      }>)?.detail;
      if (!detail?.userId || !detail.status) return;

      const entry: LivePresenceEntry = {
        userId: String(detail.userId),
        userName: detail.userName,
        status: detail.status,
        currentScreen: detail.currentScreen ?? null,
        currentScreenLabel: detail.currentScreenLabel ?? null,
        currentScreenPath: detail.currentScreenPath ?? null,
        activeScreens: Array.isArray(detail.activeScreens) ? detail.activeScreens : [],
        lastSeenAt: Number(detail.lastSeenAt) || Date.now(),
        lastActiveAt: Number(detail.lastActiveAt) || 0,
      };
      liveUpdatesRef.current.set(entry.userId, entry);
      setMetrics((prev) => applyLivePresenceToMetrics(prev, liveUpdatesRef.current));
    };

    const scheduleSilentRefresh = (delayMs: number) => {
      if (dirtyTimerRef.current) clearTimeout(dirtyTimerRef.current);
      dirtyTimerRef.current = setTimeout(() => {
        dirtyTimerRef.current = null;
        if (typeof document !== "undefined" && document.visibilityState === "hidden") {
          dirtyWhileHiddenRef.current = true;
          return;
        }
        void runFetch({ keyForRun: requestKey, silent: true });
      }, delayMs);
    };

    const handleMetricsDirty = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        dirtyWhileHiddenRef.current = true;
        return;
      }
      scheduleSilentRefresh(1500);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && dirtyWhileHiddenRef.current) {
        dirtyWhileHiddenRef.current = false;
        scheduleSilentRefresh(150);
      }
    };

    window.addEventListener("crm:presence-updated", handlePresenceEvent);
    window.addEventListener("crm:metrics-dirty", handleMetricsDirty);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void runFetch({ keyForRun: requestKey, silent: true });
      }
    }, 30_000);

    return () => {
      window.removeEventListener("crm:presence-updated", handlePresenceEvent);
      window.removeEventListener("crm:metrics-dirty", handleMetricsDirty);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(interval);
      if (dirtyTimerRef.current) {
        clearTimeout(dirtyTimerRef.current);
        dirtyTimerRef.current = null;
      }
    };
  }, [requestKey, runFetch]);

  const refresh = useCallback(async () => {
    if (!requestKey) return;
    setError(null);
    setResolvedKey("");
    await runFetch({ keyForRun: requestKey, silent: false });
  }, [requestKey, runFetch]);

  const loading = Boolean(requestKey) && resolvedKey !== requestKey;

  return { metrics, loading, error, unsupported, refresh };
}
