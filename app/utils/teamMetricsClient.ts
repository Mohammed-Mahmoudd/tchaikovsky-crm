import type { TeamMetricsPayload } from "./agentMetrics";

export const TEAM_METRICS_API_BASE = "/api";
export const TEAM_METRICS_DIRECT_API_BASE = "https://api.tchaikovskyschool.com/crm-api";
export const TEAM_METRICS_CACHE_KEY = "crm_team_metrics_cache_v1";
export const TEAM_METRICS_CACHE_MAX_ENTRIES = 8;
export const TEAM_METRICS_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface TeamMetricsStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface StoredCacheEntry {
  key: string;
  savedAt: number;
  data: TeamMetricsPayload;
}

const memoryCache = new Map<string, StoredCacheEntry>();

function isLocalHostname(hostname: string): boolean {
  const clean = hostname.trim().toLowerCase();
  return clean === "localhost" || clean === "127.0.0.1" || clean === "::1" || clean === "[::1]";
}

/**
 * Returns ordered candidate URLs for `/team-metrics*` calls.
 * In production browser sessions, hits the API origin directly first (avoiding the
 * Next.js/Vercel rewrite proxy hop and proxy timeouts) and falls back to `/api`.
 */
export function buildTeamMetricsApiUrls(pathWithQuery: string, hostname = ""): string[] {
  const cleanPath = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
  const directUrl = `${TEAM_METRICS_DIRECT_API_BASE}${cleanPath}`;
  const proxyUrl = `${TEAM_METRICS_API_BASE}${cleanPath}`;

  if (hostname && !isLocalHostname(hostname)) {
    return [directUrl, proxyUrl];
  }
  return [proxyUrl, directUrl];
}

export async function fetchTeamMetricsEndpoint(
  pathWithQuery: string,
  {
    authFetch,
    signal,
  }: {
    authFetch: (url: string, init?: RequestInit) => Promise<Response>;
    signal?: AbortSignal;
  }
): Promise<Response | null> {
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  const urls = buildTeamMetricsApiUrls(pathWithQuery, hostname);

  let lastRes: Response | null = null;
  for (let i = 0; i < urls.length; i++) {
    if (signal?.aborted) return null;
    const res = await authFetch(urls[i], {
      cache: "no-store",
      signal,
    }).catch(() => null);

    if (signal?.aborted) return null;
    if (res) {
      lastRes = res;
      if (res.ok || res.status === 401 || res.status === 403 || res.status === 404) {
        return res;
      }
    }
  }
  return lastRes;
}

function getSafeStorage(explicit?: TeamMetricsStorageLike | null): TeamMetricsStorageLike | null {
  if (explicit !== undefined) return explicit;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStoredEntries(storage: TeamMetricsStorageLike | null): StoredCacheEntry[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(TEAM_METRICS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is StoredCacheEntry =>
        Boolean(
          item &&
            typeof item.key === "string" &&
            typeof item.savedAt === "number" &&
            item.data &&
            typeof item.data === "object" &&
            item.data.team &&
            Array.isArray(item.data.agents)
        )
    );
  } catch {
    return [];
  }
}

function writeStoredEntries(
  storage: TeamMetricsStorageLike | null,
  entries: StoredCacheEntry[]
): void {
  if (!storage) return;
  try {
    storage.setItem(TEAM_METRICS_CACHE_KEY, JSON.stringify(entries));
  } catch {
    // Fallback to trimming older entries if browser storage is near quota
    try {
      if (entries.length > 1) {
        storage.setItem(TEAM_METRICS_CACHE_KEY, JSON.stringify(entries.slice(0, 2)));
      }
    } catch {}
  }
}

/**
 * Reads cached team performance metrics from RAM or bounded `localStorage` for instant hydration.
 */
export function readCachedTeamMetrics(
  cacheKey: string,
  options?: { storage?: TeamMetricsStorageLike | null; now?: number }
): TeamMetricsPayload | null {
  if (!cacheKey) return null;
  const now = options?.now ?? Date.now();

  const memEntry = memoryCache.get(cacheKey);
  if (memEntry) {
    if (now - memEntry.savedAt <= TEAM_METRICS_CACHE_MAX_AGE_MS) {
      return memEntry.data;
    }
    memoryCache.delete(cacheKey);
  }

  const storage = getSafeStorage(options?.storage);
  const entries = readStoredEntries(storage);
  const matched = entries.find((e) => e.key === cacheKey);
  if (!matched) return null;
  if (now - matched.savedAt > TEAM_METRICS_CACHE_MAX_AGE_MS) {
    return null;
  }
  memoryCache.set(cacheKey, matched);
  return matched.data;
}

/**
 * Persists a bounded LRU cache of team performance metrics in RAM and `localStorage`.
 */
export function writeCachedTeamMetrics(
  cacheKey: string,
  data: TeamMetricsPayload,
  options?: { storage?: TeamMetricsStorageLike | null; now?: number }
): void {
  if (!cacheKey || !data) return;
  const now = options?.now ?? Date.now();
  const entry: StoredCacheEntry = { key: cacheKey, savedAt: now, data };

  memoryCache.delete(cacheKey);
  memoryCache.set(cacheKey, entry);
  while (memoryCache.size > TEAM_METRICS_CACHE_MAX_ENTRIES) {
    const oldestKey = memoryCache.keys().next().value;
    if (!oldestKey) break;
    memoryCache.delete(oldestKey);
  }

  const storage = getSafeStorage(options?.storage);
  if (!storage) return;
  const existing = readStoredEntries(storage).filter(
    (item) => item.key !== cacheKey && now - item.savedAt <= TEAM_METRICS_CACHE_MAX_AGE_MS
  );
  const next = [entry, ...existing].slice(0, TEAM_METRICS_CACHE_MAX_ENTRIES);
  writeStoredEntries(storage, next);
}

/**
 * Clears in-memory cached team metrics (paired with `clearAllCrmClientCaches` on logout).
 */
export function clearTeamMetricsMemoryCache(): void {
  memoryCache.clear();
}

