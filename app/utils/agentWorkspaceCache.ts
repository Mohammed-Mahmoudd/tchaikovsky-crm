import type {
  ClaudeActivityItem,
  ClaudeActivitySummary,
  ClaudeLeadRow,
  ClaudeSkillItem,
  ClaudeStatusPayload,
} from "./claudeAgent";
import type { FollowUpLeadsResponse, FollowUpStatusPayload } from "./followupAgent";

export const AGENT_CACHE_KEYS = {
  status: "crm_agent_status_v1",
  leads: "crm_agent_leads_v1",
  skills: "crm_agent_skills_v1",
  activity: "crm_agent_activity_v1",
  followupStatus: "crm_followup_status_v1",
  followupQueueReview: "crm_followup_queue_review_v1",
  followupQueueLeads: "crm_followup_queue_leads_v1",
} as const;

export const AGENT_CACHE_DEFAULT_TTL_MS = 5 * 60 * 1000;
export const AGENT_FRESH_WINDOW_MS = 15_000;

export interface CachedActivityPayload {
  items: ClaudeActivityItem[];
  summary: ClaudeActivitySummary;
}

interface CacheEnvelope<T> {
  updatedAt: number;
  data: T;
}

export interface AgentStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const memoryCache = new Map<string, CacheEnvelope<unknown>>();
const activityQueryCache = new Map<string, CacheEnvelope<CachedActivityPayload>>();
const followUpQueueQueryCache = new Map<string, CacheEnvelope<FollowUpLeadsResponse>>();
const inFlightRequests = new Map<string, Promise<unknown>>();
const MAX_ACTIVITY_QUERY_CACHE = 24;
const MAX_FOLLOWUP_QUERY_CACHE = 24;

function getDefaultStorage(): AgentStorageAdapter | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readEnvelope<T>(
  key: string,
  ttlMs = AGENT_CACHE_DEFAULT_TTL_MS,
  now = Date.now(),
  storage: AgentStorageAdapter | null = getDefaultStorage()
): CacheEnvelope<T> | null {
  const mem = memoryCache.get(key) as CacheEnvelope<T> | undefined;
  if (mem && now - mem.updatedAt <= ttlMs) {
    return mem;
  }

  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T> | null;
    if (!parsed || typeof parsed !== "object" || typeof parsed.updatedAt !== "number") {
      return null;
    }
    if (now - parsed.updatedAt > ttlMs) {
      return null;
    }
    memoryCache.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeEnvelope<T>(
  key: string,
  data: T,
  now = Date.now(),
  storage: AgentStorageAdapter | null = getDefaultStorage()
): void {
  const envelope: CacheEnvelope<T> = { updatedAt: now, data };
  memoryCache.set(key, envelope);
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Ignore storage quota or private-mode errors
  }
}

/** Reads synchronously from the in-memory Agent cache without touching DOM storage (safe during SSR/hydration). */
export function readAgentMemorySnapshot<T>(
  key: string,
  ttlMs = AGENT_CACHE_DEFAULT_TTL_MS,
  now = Date.now()
): T | null {
  const mem = memoryCache.get(key) as CacheEnvelope<T> | undefined;
  if (!mem || now - mem.updatedAt > ttlMs) return null;
  return mem.data;
}

/** Returns true if an in-memory cached entry exists within the given freshness window. */
export function isAgentCacheFresh(
  key: string,
  freshWindowMs = AGENT_FRESH_WINDOW_MS,
  now = Date.now()
): boolean {
  const mem = memoryCache.get(key);
  if (!mem) return false;
  return now - mem.updatedAt <= freshWindowMs;
}

/** Deduplicates concurrent async requests sharing the same cache/operation key. */
export function dedupeAgentRequest<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const existing = inFlightRequests.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = Promise.resolve()
    .then(loader)
    .finally(() => {
      if (inFlightRequests.get(key) === promise) {
        inFlightRequests.delete(key);
      }
    });

  inFlightRequests.set(key, promise);
  return promise;
}

export function readAgentStatusCache(
  ttlMs = AGENT_CACHE_DEFAULT_TTL_MS,
  storage?: AgentStorageAdapter | null
): ClaudeStatusPayload | null {
  return readEnvelope<ClaudeStatusPayload>(AGENT_CACHE_KEYS.status, ttlMs, Date.now(), storage)?.data ?? null;
}

export function writeAgentStatusCache(
  data: ClaudeStatusPayload,
  storage?: AgentStorageAdapter | null
): void {
  writeEnvelope(AGENT_CACHE_KEYS.status, data, Date.now(), storage);
}

export function readAgentLeadsCache(
  ttlMs = AGENT_CACHE_DEFAULT_TTL_MS,
  storage?: AgentStorageAdapter | null
): ClaudeLeadRow[] | null {
  return readEnvelope<ClaudeLeadRow[]>(AGENT_CACHE_KEYS.leads, ttlMs, Date.now(), storage)?.data ?? null;
}

export function writeAgentLeadsCache(
  data: ClaudeLeadRow[],
  storage?: AgentStorageAdapter | null
): void {
  writeEnvelope(AGENT_CACHE_KEYS.leads, data, Date.now(), storage);
}

export function readAgentSkillsCache(
  ttlMs = AGENT_CACHE_DEFAULT_TTL_MS,
  storage?: AgentStorageAdapter | null
): ClaudeSkillItem[] | null {
  return readEnvelope<ClaudeSkillItem[]>(AGENT_CACHE_KEYS.skills, ttlMs, Date.now(), storage)?.data ?? null;
}

export function writeAgentSkillsCache(
  data: ClaudeSkillItem[],
  storage?: AgentStorageAdapter | null
): void {
  writeEnvelope(AGENT_CACHE_KEYS.skills, data, Date.now(), storage);
}

/** Reads a generic scoped workspace cache entry by key. */
export function readScopedAgentCache<T>(
  key: string,
  ttlMs = AGENT_CACHE_DEFAULT_TTL_MS,
  storage?: AgentStorageAdapter | null
): T | null {
  return readEnvelope<T>(key, ttlMs, Date.now(), storage)?.data ?? null;
}

/** Writes a generic scoped workspace cache entry by key. */
export function writeScopedAgentCache<T>(
  key: string,
  data: T,
  storage?: AgentStorageAdapter | null
): void {
  writeEnvelope(key, data, Date.now(), storage);
}

export function readAgentActivityCache(
  ttlMs = AGENT_CACHE_DEFAULT_TTL_MS,
  storage?: AgentStorageAdapter | null
): CachedActivityPayload | null {
  return readEnvelope<CachedActivityPayload>(AGENT_CACHE_KEYS.activity, ttlMs, Date.now(), storage)?.data ?? null;
}

export function writeAgentActivityCache(
  data: CachedActivityPayload,
  storage?: AgentStorageAdapter | null
): void {
  writeEnvelope(AGENT_CACHE_KEYS.activity, data, Date.now(), storage);
}

/** Reads an in-memory cached activity query response when within the freshness window. */
export function readAgentActivityQueryCache(
  queryKey: string,
  freshWindowMs = AGENT_FRESH_WINDOW_MS,
  now = Date.now()
): CachedActivityPayload | null {
  const entry = activityQueryCache.get(queryKey);
  if (!entry || now - entry.updatedAt > freshWindowMs) return null;
  return entry.data;
}

/** Stores a bounded in-memory activity query result for instant filter switching. */
export function writeAgentActivityQueryCache(
  queryKey: string,
  data: CachedActivityPayload,
  now = Date.now()
): void {
  if (activityQueryCache.has(queryKey)) {
    activityQueryCache.delete(queryKey);
  }
  activityQueryCache.set(queryKey, { updatedAt: now, data });
  if (activityQueryCache.size > MAX_ACTIVITY_QUERY_CACHE) {
    const oldest = activityQueryCache.keys().next().value;
    if (oldest) activityQueryCache.delete(oldest);
  }
}

/** Invalidates in-memory activity query caches (e.g. on live SSE update or manual refresh). */
export function invalidateAgentActivityQueryCache(): void {
  activityQueryCache.clear();
  memoryCache.delete(AGENT_CACHE_KEYS.activity);
}

/** Reads an in-memory cached Follow-up leads/review query response when within the freshness window. */
export function readFollowUpQueueQueryCache(
  queryKey: string,
  freshWindowMs = AGENT_FRESH_WINDOW_MS,
  now = Date.now()
): FollowUpLeadsResponse | null {
  const entry = followUpQueueQueryCache.get(queryKey);
  if (!entry || now - entry.updatedAt > freshWindowMs) return null;
  return entry.data;
}

/** Stores a bounded in-memory Follow-up leads/review query response for instant tab/filter switching. */
export function writeFollowUpQueueQueryCache(
  queryKey: string,
  data: FollowUpLeadsResponse,
  now = Date.now()
): void {
  if (followUpQueueQueryCache.has(queryKey)) {
    followUpQueueQueryCache.delete(queryKey);
  }
  followUpQueueQueryCache.set(queryKey, { updatedAt: now, data });
  if (followUpQueueQueryCache.size > MAX_FOLLOWUP_QUERY_CACHE) {
    const oldest = followUpQueueQueryCache.keys().next().value;
    if (oldest) followUpQueueQueryCache.delete(oldest);
  }
}

/** Clears cached Follow-up queue queries (and persistent review/leads snapshots if storage is passed). */
export function invalidateFollowUpQueueQueryCache(
  storage: AgentStorageAdapter | null = getDefaultStorage()
): void {
  followUpQueueQueryCache.clear();
  memoryCache.delete(AGENT_CACHE_KEYS.followupQueueReview);
  memoryCache.delete(AGENT_CACHE_KEYS.followupQueueLeads);
  if (!storage) return;
  try {
    storage.removeItem(AGENT_CACHE_KEYS.followupQueueReview);
    storage.removeItem(AGENT_CACHE_KEYS.followupQueueLeads);
  } catch {}
}

/** Reads cached Follow-up workspace status (settings + connection + optional platform agent). */
export function readFollowUpStatusCache(
  ttlMs = AGENT_CACHE_DEFAULT_TTL_MS,
  storage?: AgentStorageAdapter | null
): FollowUpStatusPayload | null {
  return readEnvelope<FollowUpStatusPayload>(AGENT_CACHE_KEYS.followupStatus, ttlMs, Date.now(), storage)?.data ?? null;
}

/** Writes Follow-up workspace status to memory + localStorage for instant reload recovery. */
export function writeFollowUpStatusCache(
  data: FollowUpStatusPayload,
  storage?: AgentStorageAdapter | null
): void {
  writeEnvelope(AGENT_CACHE_KEYS.followupStatus, data, Date.now(), storage);
}

/** Clears the in-memory and optional persisted Agent caches (e.g. on logout or test reset). */
export function clearAgentWorkspaceMemoryCache(
  storage: AgentStorageAdapter | null = getDefaultStorage()
): void {
  memoryCache.clear();
  activityQueryCache.clear();
  followUpQueueQueryCache.clear();
  inFlightRequests.clear();
  if (!storage) return;
  for (const key of Object.values(AGENT_CACHE_KEYS)) {
    try {
      storage.removeItem(key);
    } catch {}
  }
}

/** Maps legacy `/settings#claude*` hash anchors directly to the consolidated `/agent*` routes. */
export function resolveAgentRouteFromHash(hash?: string | null): string {
  const clean = String(hash || "").trim().toLowerCase();
  if (clean === "#claude-activity") return "/agent";
  if (clean === "#claude-skills") return "/agent/studio?section=skills";
  if (clean === "#claude-sandbox") return "/agent?sandbox=1";
  if (clean === "#claude-leads") return "/agent/leads";
  if (clean === "#claude-studio") return "/agent/studio";
  return "/agent";
}

export type AgentStudioSection = "playbook" | "skills" | "rules" | "branches";

/** Normalizes the `?section=` query param for `/agent/studio`. */
export function resolveAgentStudioSection(raw?: string | null): AgentStudioSection {
  const clean = String(raw || "").trim().toLowerCase();
  if (clean === "skills") return "skills";
  if (clean === "rules") return "rules";
  if (clean === "branches") return "branches";
  return "playbook";
}

export type AgentLeadsMode = "assigned" | "assign";

/** Normalizes the `?mode=` query param for `/agent/leads`. */
export function resolveAgentLeadsMode(raw?: string | null): AgentLeadsMode {
  const clean = String(raw || "").trim().toLowerCase();
  if (clean === "assign" || clean === "browse" || clean === "all") return "assign";
  return "assigned";
}
