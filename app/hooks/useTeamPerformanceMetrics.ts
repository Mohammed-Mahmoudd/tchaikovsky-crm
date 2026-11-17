"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../components/AuthProvider";
import {
  applyLivePresenceToMetrics,
  type LivePresenceEntry,
  type PresenceStatus,
  type ScreenRef,
  type TeamMetricsPayload,
} from "../utils/agentMetrics";

const API_BASE = "/api";
const DIRECT_API_BASE = "https://api.tchaikovskyschool.com/crm-api";

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
  const { token, authFetch } = useAuth();
  const [metrics, setMetrics] = useState<TeamMetricsPayload | null>(null);
  const [resolvedKey, setResolvedKey] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState<boolean>(false);

  const liveUpdatesRef = useRef<Map<string, LivePresenceEntry>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const dirtyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanAgent =
    agent && agent.trim() && agent.trim() !== "__all__" && agent.trim().toLowerCase() !== "all"
      ? agent.trim()
      : "";
  const requestKey =
    enabled && token ? `${Math.floor(startMs)}:${Math.floor(endMs)}:${cleanAgent}` : "";

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
        let res = await authFetch(`${API_BASE}/team-metrics${qs}`, {
          cache: "no-store",
          signal,
        }).catch(() => null);

        if (signal?.aborted) return;

        if (!res || (!res.ok && res.status !== 401 && res.status !== 403 && res.status !== 404)) {
          res = await authFetch(`${DIRECT_API_BASE}/team-metrics${qs}`, {
            cache: "no-store",
            signal,
          }).catch(() => null);
        }

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

        setUnsupported(false);
        setError(null);
        const merged = applyLivePresenceToMetrics(
          json.data as TeamMetricsPayload,
          liveUpdatesRef.current
        );
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
    [token, startMs, endMs, cleanAgent, authFetch]
  );

  useEffect(() => {
    if (!requestKey) return;
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        void runFetch({ keyForRun: requestKey, silent: false, signal: controller.signal });
      }
    });

    return () => {
      controller.abort();
    };
  }, [requestKey, runFetch]);

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

    const handleMetricsDirty = () => {
      if (dirtyTimerRef.current) clearTimeout(dirtyTimerRef.current);
      dirtyTimerRef.current = setTimeout(() => {
        void runFetch({ keyForRun: requestKey, silent: true });
      }, 1500);
    };

    window.addEventListener("crm:presence-updated", handlePresenceEvent);
    window.addEventListener("crm:metrics-dirty", handleMetricsDirty);

    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void runFetch({ keyForRun: requestKey, silent: true });
      }
    }, 30_000);

    return () => {
      window.removeEventListener("crm:presence-updated", handlePresenceEvent);
      window.removeEventListener("crm:metrics-dirty", handleMetricsDirty);
      clearInterval(interval);
      if (dirtyTimerRef.current) {
        clearTimeout(dirtyTimerRef.current);
        dirtyTimerRef.current = null;
      }
    };
  }, [requestKey, runFetch]);

  const refresh = useCallback(async () => {
    if (!requestKey) return;
    setResolvedKey("");
    await runFetch({ keyForRun: requestKey, silent: false });
  }, [requestKey, runFetch]);

  const loading = Boolean(requestKey) && resolvedKey !== requestKey;

  return { metrics, loading, error, unsupported, refresh };
}
