"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  Clock,
  MessageSquare,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useAuth } from "./AuthProvider";
import {
  type ClaudeActivityFilter,
  type ClaudeActivityItem,
  type ClaudeActivitySummary,
  type ClaudeActivityWindow,
  filterCachedActivityItems,
  formatDurationLabel,
  formatSkillDisplayLabel,
  getActivityOutcomeMeta,
  splitDisplayReplyChunks,
} from "../utils/claudeAgent";
import {
  AGENT_CACHE_KEYS,
  type CachedActivityPayload,
  dedupeAgentRequest,
  invalidateAgentActivityQueryCache,
  readAgentActivityCache,
  readAgentActivityQueryCache,
  readAgentMemorySnapshot,
  writeAgentActivityCache,
  writeAgentActivityQueryCache,
} from "../utils/agentWorkspaceCache";
import { formatLastMessageTime } from "../utils/time";
import { ClaudeStatusPill } from "./ClaudeUiPrimitives";

export type ActivityFilter = ClaudeActivityFilter;

const FILTER_OPTIONS: ReadonlyArray<{ id: ClaudeActivityFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "booked", label: "Booked" },
  { id: "escalated", label: "Escalated" },
  { id: "updated", label: "Updated" },
  { id: "replied", label: "Replied" },
  { id: "silent", label: "Silent" },
  { id: "error", label: "Errors" },
];

const EMPTY_SUMMARY: ClaudeActivitySummary = {
  total: 0,
  replied: 0,
  booked: 0,
  updated: 0,
  escalated: 0,
  silent: 0,
  error: 0,
};

interface ClaudeActivityPanelProps {
  onOpenLeadChat?: (senderId: string) => void;
  embedded?: boolean;
  outcomeFilter?: ClaudeActivityFilter;
  windowFilter?: ClaudeActivityWindow;
  onOutcomeFilterChange?: (next: ClaudeActivityFilter) => void;
  onWindowFilterChange?: (next: ClaudeActivityWindow) => void;
  onSummaryChange?: (summary: ClaudeActivitySummary) => void;
}

/**
 * Displays live Adham AI turns inside a single connected container where the
 * search, filters, count strip, and activity feed share one unified card.
 */
export function ClaudeActivityPanel({
  onOpenLeadChat,
  embedded = false,
  outcomeFilter: controlledOutcome,
  windowFilter: controlledWindow,
  onOutcomeFilterChange,
  onWindowFilterChange,
  onSummaryChange,
}: ClaudeActivityPanelProps) {
  const { authFetch } = useAuth();

  const initialSnapshot = readAgentMemorySnapshot<CachedActivityPayload>(AGENT_CACHE_KEYS.activity);

  const [items, setItems] = useState<ClaudeActivityItem[]>(() => initialSnapshot?.items ?? []);
  const [summary, setSummary] = useState<ClaudeActivitySummary>(
    () => initialSnapshot?.summary ?? EMPTY_SUMMARY
  );
  const [loading, setLoading] = useState(() => !initialSnapshot);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [internalOutcome, setInternalOutcome] = useState<ClaudeActivityFilter>("all");
  const [internalWindow, setInternalWindow] = useState<ClaudeActivityWindow>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const hasItemsRef = useRef(Boolean(initialSnapshot));
  const onSummaryChangeRef = useRef(onSummaryChange);

  useEffect(() => {
    onSummaryChangeRef.current = onSummaryChange;
  }, [onSummaryChange]);

  const outcomeFilter = controlledOutcome ?? internalOutcome;
  const windowFilter = controlledWindow ?? internalWindow;

  const setOutcomeFilter = useCallback(
    (next: ClaudeActivityFilter) => {
      if (onOutcomeFilterChange) {
        onOutcomeFilterChange(next);
      } else {
        setInternalOutcome(next);
      }
    },
    [onOutcomeFilterChange]
  );

  const setWindowFilter = useCallback(
    (next: ClaudeActivityWindow) => {
      if (onWindowFilterChange) {
        onWindowFilterChange(next);
      } else {
        setInternalWindow(next);
      }
    },
    [onWindowFilterChange]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchActivity = useCallback(
    async ({ silent = false, force = false }: { silent?: boolean; force?: boolean } = {}) => {
      const isDefaultQuery =
        outcomeFilter === "all" && windowFilter === "all" && !debouncedSearch;
      const requestKey = `agent:activity:${outcomeFilter}:${windowFilter}:40:${debouncedSearch}`;

      if (!force) {
        const cachedQuery = readAgentActivityQueryCache(requestKey);
        if (cachedQuery) {
          hasItemsRef.current = true;
          setItems(cachedQuery.items);
          setSummary(cachedQuery.summary);
          onSummaryChangeRef.current?.(cachedQuery.summary);
          setLoading(false);
          setRefreshing(false);
          return;
        }

        if (isDefaultQuery) {
          const mem = readAgentMemorySnapshot<CachedActivityPayload>(AGENT_CACHE_KEYS.activity);
          if (mem) {
            hasItemsRef.current = true;
            setItems(mem.items);
            setSummary(mem.summary);
            onSummaryChangeRef.current?.(mem.summary);
            setLoading(false);
          }
        } else {
          const baseSnapshot =
            readAgentMemorySnapshot<CachedActivityPayload>(AGENT_CACHE_KEYS.activity) ??
            readAgentActivityCache();
          if (baseSnapshot) {
            const optimistic = filterCachedActivityItems(baseSnapshot.items, {
              outcome: outcomeFilter,
              window: windowFilter,
              search: debouncedSearch,
            });
            hasItemsRef.current = true;
            setItems(optimistic);
            setLoading(false);
          }
        }
      }

      if (!silent && !hasItemsRef.current) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set("outcome", outcomeFilter);
        params.set("window", windowFilter);
        params.set("limit", "40");
        if (debouncedSearch) params.set("search", debouncedSearch);

        const result = await dedupeAgentRequest(requestKey, async () => {
          const res = await authFetch(`/crm-api/claude/activity?${params.toString()}`, {
            cache: "no-store",
          });
          const json = await res.json().catch(() => null);
          if (!res.ok || !json?.success || !json.data) {
            return { ok: false as const, error: json?.error || "Could not load agent activity." };
          }
          const nextItems = Array.isArray(json.data.items)
            ? (json.data.items as ClaudeActivityItem[])
            : [];
          const nextSummary = (json.data.summary as ClaudeActivitySummary | undefined) ?? EMPTY_SUMMARY;
          writeAgentActivityQueryCache(requestKey, { items: nextItems, summary: nextSummary });
          if (isDefaultQuery) {
            writeAgentActivityCache({ items: nextItems, summary: nextSummary });
          }
          return { ok: true as const, items: nextItems, summary: nextSummary };
        });

        if (!result.ok) {
          if (!silent || !hasItemsRef.current) {
            setError(result.error);
          }
          return;
        }

        hasItemsRef.current = true;
        setItems(result.items);
        setSummary(result.summary);
        onSummaryChangeRef.current?.(result.summary);
      } catch {
        if (!silent || !hasItemsRef.current) {
          setError("Network error while loading agent activity.");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [authFetch, debouncedSearch, outcomeFilter, windowFilter]
  );

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (
        outcomeFilter === "all" &&
        windowFilter === "all" &&
        !debouncedSearch &&
        !hasItemsRef.current
      ) {
        const cached = readAgentActivityCache();
        if (cached) {
          hasItemsRef.current = true;
          setItems(cached.items);
          setSummary(cached.summary);
          onSummaryChangeRef.current?.(cached.summary);
          setLoading(false);
          void fetchActivity({ silent: true });
          return;
        }
      }
      void fetchActivity({
        silent: hasItemsRef.current,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, fetchActivity, outcomeFilter, windowFilter]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleLiveActivityUpdate = () => {
      invalidateAgentActivityQueryCache();
      void fetchActivity({ silent: true, force: true });
    };
    window.addEventListener("crm:claude-activity-updated", handleLiveActivityUpdate);
    return () => {
      window.removeEventListener("crm:claude-activity-updated", handleLiveActivityUpdate);
    };
  }, [fetchActivity]);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleManualRefresh = () => {
    invalidateAgentActivityQueryCache();
    void fetchActivity({ force: true });
  };

  const hasActiveFilters =
    outcomeFilter !== "all" || windowFilter !== "all" || Boolean(debouncedSearch);

  const resetAllFilters = () => {
    setOutcomeFilter("all");
    setWindowFilter("all");
    setSearchQuery("");
  };

  const activeOutcomeLabel =
    outcomeFilter === "attention"
      ? "Escalated & Errors"
      : FILTER_OPTIONS.find((opt) => opt.id === outcomeFilter)?.label ?? "All";

  return (
    <section
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-main)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      {/* Attached Header, Search & Outcome Filters */}
      <div className="p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
              Live Activity
            </h2>
            {outcomeFilter === "attention" && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                style={{
                  background: "var(--label-amber-bg)",
                  border: "1px solid var(--label-amber-border)",
                  color: "var(--label-amber-text)",
                }}
              >
                <span>Escalated &amp; Errors</span>
                <button
                  type="button"
                  onClick={() => setOutcomeFilter("all")}
                  aria-label="Clear attention filter"
                  className="cursor-pointer hover:opacity-75"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* 24h vs All recent window switcher */}
            <div
              role="group"
              aria-label="Activity time window"
              className="inline-flex items-center p-0.5 rounded-lg"
              style={{
                background: "var(--bg-pill)",
                border: "1px solid var(--border-input)",
              }}
            >
              {(
                [
                  { id: "24h", label: "Last 24h" },
                  { id: "all", label: "All recent" },
                ] as const
              ).map((opt) => {
                const active = windowFilter === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setWindowFilter(opt.id)}
                    className={`min-h-[36px] sm:min-h-[30px] px-2.5 rounded-md text-[11px] font-semibold cursor-pointer transition-colors ${
                      active ? "text-white" : "hover:bg-[var(--bg-hover)]"
                    }`}
                    style={
                      active
                        ? { background: "var(--bg-banner)" }
                        : { color: "var(--text-secondary)" }
                    }
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={loading || refreshing}
              className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-[34px] px-3 rounded-lg text-[11.5px] font-medium cursor-pointer hover:bg-[var(--bg-hover)] disabled:opacity-50"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-input)",
                color: "var(--text-primary)",
              }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading || refreshing ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Last 24h KPIs (hidden when embedded in Overview which renders unified KPIs) */}
        {!embedded && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            {[
              { label: "Turns (24h)", value: summary.total, tone: "var(--text-primary)" },
              { label: "Sessions booked", value: summary.booked, tone: "var(--label-green-text)" },
              { label: "Escalations", value: summary.escalated, tone: "var(--label-amber-text)" },
              { label: "Errors", value: summary.error, tone: "var(--label-red-text)" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg px-3.5 py-2.5"
                style={{
                  background: "var(--bg-panel)",
                  border: "1px solid var(--border-main)",
                }}
              >
                <p className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
                  {stat.label}
                </p>
                <p className="text-[19px] font-bold mt-0.5 tabular-nums" style={{ color: stat.tone }}>
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Search & Outcome Filters */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          <div className="relative flex-1 min-w-0">
            <Search
              className="w-3.5 h-3.5 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "var(--text-muted)" }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search lead, branch, or message..."
              className="w-full min-h-[44px] sm:min-h-[36px] ps-8 pe-8 text-[16px] sm:text-[12px] rounded-lg outline-none"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-input)",
                color: "var(--text-primary)",
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear activity search"
                className="absolute end-2 top-1/2 -translate-y-1/2 p-1.5 rounded cursor-pointer"
                style={{ color: "var(--text-secondary)" }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {FILTER_OPTIONS.map((opt) => {
              const active = outcomeFilter === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setOutcomeFilter(opt.id)}
                  className={`min-h-[40px] sm:min-h-[34px] px-2.5 rounded-lg text-[11px] font-semibold cursor-pointer ${
                    active ? "text-white" : "hover:bg-[var(--bg-hover)]"
                  }`}
                  style={
                    active
                      ? { background: "var(--bg-banner)" }
                      : {
                          background: "var(--bg-pill)",
                          border: "1px solid var(--border-input)",
                          color: "var(--text-secondary)",
                        }
                  }
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Connected Status Strip Bridging Toolbar and Activity Rows */}
      <div
        className="px-4 sm:px-5 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium"
        style={{
          background: "var(--bg-panel)",
          borderTop: "1px solid var(--border-main)",
          borderBottom: "1px solid var(--border-main)",
          color: "var(--text-secondary)",
        }}
      >
        <span>
          {loading
            ? "Loading activity…"
            : `${items.length} turn${items.length === 1 ? "" : "s"} · ${
                windowFilter === "24h" ? "Last 24h" : "All recent"
              }${outcomeFilter !== "all" ? ` · ${activeOutcomeLabel}` : ""}`}
        </span>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetAllFilters}
            className="font-semibold hover:underline cursor-pointer"
            style={{ color: "var(--label-blue-text)" }}
          >
            Reset filters
          </button>
        )}
      </div>

      {/* Connected Feed Body Inside Outer Container */}
      <div
        className="p-3 sm:p-4"
        style={{ background: "var(--bg-panel)" }}
      >
        {loading ? (
          <div className="space-y-2.5" aria-busy="true" aria-label="Loading agent activity">
            {[1, 2, 3].map((k) => (
              <div
                key={k}
                className="rounded-lg p-3.5 sm:p-4 animate-pulse space-y-2.5"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-main)",
                }}
              >
                <div className="h-4 w-44 rounded" style={{ background: "var(--bg-column)" }} />
                <div className="h-3 w-full max-w-lg rounded" style={{ background: "var(--bg-column)" }} />
                <div className="h-3 w-full max-w-md rounded" style={{ background: "var(--bg-column)" }} />
              </div>
            ))}
          </div>
        ) : error ? (
          <div
            className="rounded-lg p-4 space-y-3"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-main)",
            }}
          >
            <div className="flex items-start gap-2" style={{ color: "var(--label-red-text)" }}>
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="text-[13px] font-medium">{error}</p>
            </div>
            <button
              type="button"
              onClick={handleManualRefresh}
              className="min-h-[44px] sm:min-h-[38px] px-4 rounded-lg text-[12px] font-semibold text-white cursor-pointer"
              style={{ background: "var(--bg-banner)" }}
            >
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div
            className="rounded-lg px-4 sm:px-6 py-8 text-center space-y-2"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-main)",
            }}
          >
            <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
              No activity matches this filter
            </p>
            <p className="text-[12px] max-w-md mx-auto" style={{ color: "var(--text-secondary)" }}>
              {windowFilter === "24h"
                ? "No matching turns in the last 24 hours. Try switching to All recent."
                : "Turns appear here automatically whenever Adham replies, books, updates, or escalates a lead."}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="mt-1 inline-flex items-center min-h-[40px] sm:min-h-[34px] px-3.5 rounded-lg text-[11.5px] font-semibold cursor-pointer hover:bg-[var(--bg-hover)]"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-input)",
                  color: "var(--text-primary)",
                }}
              >
                Show all recent activity
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {items.map((item) => {
              const meta = getActivityOutcomeMeta(item.outcome);
              const tsNum = item.createdAt ? new Date(item.createdAt).getTime() : 0;
              const timeLabel = tsNum ? formatLastMessageTime(tsNum) : "";
              const skillsUsed = Array.isArray(item.skillsUsed) ? item.skillsUsed : [];
              const replyChunks = splitDisplayReplyChunks(item.replyText);
              const joinedReply = replyChunks.join("\n\n");
              const isExpanded = Boolean(expandedIds[item._id]);
              const hasLongText =
                (item.incomingText?.length || 0) > 140 || joinedReply.length > 220;
              const hasDetails =
                hasLongText || skillsUsed.length > 0 || Boolean(item.durationMs && item.durationMs > 0);

              return (
                <article
                  key={item._id}
                  className="rounded-lg p-3.5 sm:p-4 space-y-2"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-main)",
                  }}
                >
                  {/* Row Header: Lead, Channel, Outcome, Branch, Time, Open Chat */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span
                        className="text-[13.5px] font-semibold truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {item.leadName || item.senderId}
                      </span>
                      <ClaudeStatusPill label={item.channel || "WA"} tone="slate" />
                      <ClaudeStatusPill label={meta.label} tone={meta.tone} />
                      {item.branch && (
                        <span className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>
                          {item.branch}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      {timeLabel && (
                        <span
                          className="inline-flex items-center gap-1 text-[11px]"
                          style={{ color: "var(--text-muted)" }}
                        >
                          <Clock className="w-3 h-3" />
                          <span>{timeLabel}</span>
                        </span>
                      )}
                      {onOpenLeadChat && item.senderId && (
                        <button
                          type="button"
                          onClick={() => onOpenLeadChat(item.senderId)}
                          className="inline-flex items-center gap-1 min-h-[44px] sm:min-h-[32px] px-2.5 rounded-md text-[11px] font-medium cursor-pointer hover:bg-[var(--bg-hover)]"
                          style={{
                            background: "var(--bg-input)",
                            border: "1px solid var(--border-input)",
                            color: "var(--text-primary)",
                          }}
                        >
                          <MessageSquare className="w-3 h-3" />
                          <span>Open chat</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Concise 1-line CRM Action Highlight (for booked / updated / escalated) */}
                  {item.actionSummary && item.outcome !== "error" && (
                    <p className="text-[12px] font-medium" style={{ color: "var(--label-blue-text)" }}>
                      {item.actionSummary}
                    </p>
                  )}

                  {/* Scannable Exchange Block */}
                  <div
                    className="rounded-lg px-3 py-2 space-y-1.5 text-[12.5px]"
                    style={{ background: "var(--bg-panel)" }}
                  >
                    <div className="space-y-0.5">
                      <span
                        className="text-[10.5px] font-semibold uppercase tracking-wide"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Lead
                      </span>
                      <p
                        dir="auto"
                        className={`whitespace-pre-wrap break-words ${isExpanded ? "" : "line-clamp-2"}`}
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {item.incomingText || "(Empty message)"}
                      </p>
                    </div>

                    <div className="pt-1.5 space-y-0.5" style={{ borderTop: "1px solid var(--border-main)" }}>
                      <span
                        className="text-[10.5px] font-semibold uppercase tracking-wide"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {item.outcome === "error" ? "Error" : "Adham"}
                      </span>
                      {item.outcome === "error" ? (
                        <p className="break-words font-medium" style={{ color: "var(--label-red-text)" }}>
                          {item.errorMessage || "Turn failed"}
                        </p>
                      ) : replyChunks.length > 0 ? (
                        isExpanded ? (
                          <div className="space-y-1.5">
                            {replyChunks.map((chunk, chunkIdx) => (
                              <p
                                key={`${item._id}-chunk-${chunkIdx}`}
                                dir="auto"
                                className="whitespace-pre-wrap break-words"
                                style={{ color: "var(--text-primary)" }}
                              >
                                {chunk}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p
                            dir="auto"
                            className="whitespace-pre-wrap break-words line-clamp-3"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {joinedReply}
                          </p>
                        )
                      ) : (
                        <p className="italic" style={{ color: "var(--text-secondary)" }}>
                          Handled silently in CRM (no message sent).
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Expandable Details (Skills & Full Text / Debug Latency) */}
                  {hasDetails && (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          onClick={() => toggleExpanded(item._id)}
                          className="inline-flex items-center gap-1 min-h-[36px] sm:min-h-[26px] text-[11px] font-medium cursor-pointer hover:underline"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          <span>{isExpanded ? "Show less" : hasLongText ? "Show full message" : "Details"}</span>
                          <ChevronDown
                            className={`w-3.5 h-3.5 transition-transform duration-150 ${
                              isExpanded ? "rotate-180" : ""
                            }`}
                          />
                        </button>

                        {!isExpanded && skillsUsed.length > 0 && (
                          <span className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>
                            {skillsUsed.length} skill{skillsUsed.length === 1 ? "" : "s"} used
                          </span>
                        )}
                      </div>

                      {isExpanded && (skillsUsed.length > 0 || (item.durationMs && item.durationMs > 0)) && (
                        <div
                          className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] pt-0.5"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {skillsUsed.length > 0 && (
                            <span>
                              Skills: {skillsUsed.map((slug) => formatSkillDisplayLabel(slug)).join(", ")}
                            </span>
                          )}
                          {item.durationMs && item.durationMs > 0 ? (
                            <span>Response time: {formatDurationLabel(item.durationMs)}</span>
                          ) : null}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
