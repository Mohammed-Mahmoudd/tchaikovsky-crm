"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  Clock,
  MessageSquare,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useAuth } from "./AuthProvider";
import {
  type ClaudeActivityItem,
  type ClaudeActivityOutcome,
  type ClaudeActivitySummary,
  formatDurationLabel,
  getActivityOutcomeMeta,
  splitDisplayReplyChunks,
} from "../utils/claudeAgent";
import {
  AGENT_CACHE_KEYS,
  type CachedActivityPayload,
  dedupeAgentRequest,
  isAgentCacheFresh,
  readAgentActivityCache,
  readAgentMemorySnapshot,
  writeAgentActivityCache,
} from "../utils/agentWorkspaceCache";
import { formatLastMessageTime } from "../utils/time";
import { ClaudeStatusPill } from "./ClaudeUiPrimitives";

export type ActivityFilter = "all" | ClaudeActivityOutcome;

const FILTER_OPTIONS: ReadonlyArray<{ id: ActivityFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "replied", label: "Replied" },
  { id: "booked", label: "Booked" },
  { id: "escalated", label: "Escalated" },
  { id: "silent", label: "Silent" },
  { id: "error", label: "Errors" },
];

interface ClaudeActivityPanelProps {
  onOpenLeadChat?: (senderId: string) => void;
  onOpenSkillsTab?: () => void;
  embedded?: boolean;
  outcomeFilter?: ActivityFilter;
  onOutcomeFilterChange?: (next: ActivityFilter) => void;
  onSummaryChange?: (summary: ClaudeActivitySummary) => void;
}

/**
 * Displays live Adham AI turns, tool traces, loaded skills, and outcomes
 * so the Chairman can monitor what the agent is doing in real conversations.
 */
export function ClaudeActivityPanel({
  onOpenLeadChat,
  onOpenSkillsTab,
  embedded = false,
  outcomeFilter: controlledOutcome,
  onOutcomeFilterChange,
  onSummaryChange,
}: ClaudeActivityPanelProps) {
  const { authFetch } = useAuth();

  const initialSnapshot = readAgentMemorySnapshot<CachedActivityPayload>(AGENT_CACHE_KEYS.activity);

  const [items, setItems] = useState<ClaudeActivityItem[]>(() => initialSnapshot?.items ?? []);
  const [summary, setSummary] = useState<ClaudeActivitySummary>(() =>
    initialSnapshot?.summary ?? {
      total: 0,
      replied: 0,
      booked: 0,
      updated: 0,
      escalated: 0,
      silent: 0,
      error: 0,
    }
  );
  const [loading, setLoading] = useState(() => !initialSnapshot);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [internalOutcome, setInternalOutcome] = useState<ActivityFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const hasItemsRef = useRef(Boolean(initialSnapshot));
  const onSummaryChangeRef = useRef(onSummaryChange);

  useEffect(() => {
    onSummaryChangeRef.current = onSummaryChange;
  }, [onSummaryChange]);

  const outcomeFilter = controlledOutcome ?? internalOutcome;
  const setOutcomeFilter = useCallback(
    (next: ActivityFilter) => {
      if (onOutcomeFilterChange) {
        onOutcomeFilterChange(next);
      } else {
        setInternalOutcome(next);
      }
    },
    [onOutcomeFilterChange]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchActivity = useCallback(
    async ({ silent = false, force = false }: { silent?: boolean; force?: boolean } = {}) => {
      const isDefaultQuery = outcomeFilter === "all" && !debouncedSearch;

      if (!force && isDefaultQuery && isAgentCacheFresh(AGENT_CACHE_KEYS.activity)) {
        const mem = readAgentMemorySnapshot<CachedActivityPayload>(AGENT_CACHE_KEYS.activity);
        if (mem) {
          hasItemsRef.current = true;
          setItems(mem.items);
          setSummary(mem.summary);
          onSummaryChangeRef.current?.(mem.summary);
          setLoading(false);
          return;
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
        params.set("limit", "40");
        if (debouncedSearch) params.set("search", debouncedSearch);

        const requestKey = `agent:activity:${outcomeFilter}:40:${debouncedSearch}`;
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
          const nextSummary = json.data.summary as ClaudeActivitySummary | undefined;
          if (isDefaultQuery && nextSummary) {
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
        if (result.summary) {
          setSummary(result.summary);
          onSummaryChangeRef.current?.(result.summary);
        }
      } catch {
        if (!silent || !hasItemsRef.current) {
          setError("Network error while loading agent activity.");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [authFetch, outcomeFilter, debouncedSearch]
  );

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (outcomeFilter === "all" && !debouncedSearch && !hasItemsRef.current) {
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
        silent: hasItemsRef.current && outcomeFilter === "all" && !debouncedSearch,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, fetchActivity, outcomeFilter]);

  return (
    <div className="space-y-4">
      {/* Header & Toolbar Card */}
      <section
        className="rounded-xl p-4 sm:p-5 space-y-4"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-main)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
              Live Activity
            </h3>
            <p className="text-[11.5px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
              Review live replies Adham handled, including Discovery Session bookings, escalations, and skills used.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onOpenSkillsTab && (
              <button
                type="button"
                onClick={onOpenSkillsTab}
                className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-[38px] px-3 rounded-lg text-[12px] font-medium cursor-pointer hover:bg-[var(--bg-hover)]"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-input)",
                  color: "var(--text-primary)",
                }}
              >
                <BookOpen className="w-3.5 h-3.5" style={{ color: "var(--bg-banner)" }} />
                <span>Manage skills</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => void fetchActivity({ force: true })}
              disabled={loading || refreshing}
              className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-[38px] px-3.5 rounded-lg text-[12px] font-semibold text-white cursor-pointer disabled:opacity-50"
              style={{ background: "var(--bg-banner)" }}
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
              placeholder="Search by lead name, message, or skill..."
              className="w-full min-h-[44px] sm:min-h-[38px] ps-8 pe-8 text-[16px] sm:text-[12px] rounded-lg outline-none"
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
                  onClick={() => setOutcomeFilter(opt.id)}
                  className={`min-h-[40px] sm:min-h-[36px] px-3 rounded-lg text-[11px] font-semibold cursor-pointer ${
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
      </section>

      {/* Feed Content */}
      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading agent activity">
          {[1, 2, 3].map((k) => (
            <div
              key={k}
              className="rounded-xl p-4 animate-pulse space-y-2.5"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)" }}
            >
              <div className="h-4 w-44 rounded" style={{ background: "var(--bg-column)" }} />
              <div className="h-3 w-full max-w-lg rounded" style={{ background: "var(--bg-column)" }} />
              <div className="h-3 w-full max-w-md rounded" style={{ background: "var(--bg-column)" }} />
            </div>
          ))}
        </div>
      ) : error ? (
        <div
          className="rounded-xl p-5 space-y-3"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)" }}
        >
          <div className="flex items-start gap-2" style={{ color: "var(--label-red-text)" }}>
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="text-[13px] font-medium">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => void fetchActivity({ force: true })}
            className="min-h-[44px] sm:min-h-[38px] px-4 rounded-lg text-[12px] font-semibold text-white cursor-pointer"
            style={{ background: "var(--bg-banner)" }}
          >
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div
          className="rounded-xl p-6 text-center space-y-2"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-main)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
            No live activity matches this filter
          </p>
          <p className="text-[12px] max-w-md mx-auto" style={{ color: "var(--text-secondary)" }}>
            Live turns appear here automatically whenever Adham replies to, books, updates, or escalates an assigned lead.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const meta = getActivityOutcomeMeta(item.outcome);
            const tsNum = item.createdAt ? new Date(item.createdAt).getTime() : 0;
            const timeLabel = tsNum ? formatLastMessageTime(tsNum) : "";
            const latencyLabel = formatDurationLabel(item.durationMs);
            const skillsUsed = Array.isArray(item.skillsUsed) ? item.skillsUsed : [];

            return (
              <article
                key={item._id}
                className="rounded-xl p-4 space-y-3"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-main)",
                  boxShadow: "var(--shadow-card)",
                }}
              >
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
                    {skillsUsed.map((slug) => (
                      <ClaudeStatusPill key={slug} label={`Skill: ${slug}`} tone="blue" />
                    ))}
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    {(timeLabel || latencyLabel) && (
                      <span
                        className="inline-flex items-center gap-1 text-[11px]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <Clock className="w-3 h-3" />
                        <span>
                          {[timeLabel, latencyLabel].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    )}
                    {onOpenLeadChat && item.senderId && (
                      <button
                        type="button"
                        onClick={() => onOpenLeadChat(item.senderId)}
                        className="inline-flex items-center gap-1 min-h-[40px] sm:min-h-[32px] px-2.5 rounded-md text-[11px] font-medium cursor-pointer hover:bg-[var(--bg-hover)]"
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

                {/* Conversation snippet */}
                <div
                  className="rounded-lg p-3 space-y-2 text-[12.5px]"
                  style={{
                    background: "var(--bg-panel)",
                    border: "1px solid var(--border-main)",
                  }}
                >
                  <div className="space-y-0.5">
                    <span className="text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                      Lead message
                    </span>
                    <p dir="auto" className="whitespace-pre-wrap break-words" style={{ color: "var(--text-secondary)" }}>
                      {item.incomingText || "(Empty message)"}
                    </p>
                  </div>

                  <div className="pt-2 space-y-0.5" style={{ borderTop: "1px solid var(--border-main)" }}>
                    <span className="text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                      {item.outcome === "error" ? "Error detail" : "Adham action"}
                    </span>
                    {item.outcome === "error" ? (
                      <p className="break-words font-medium" style={{ color: "var(--label-red-text)" }}>
                        {item.errorMessage || "Turn failed"}
                      </p>
                    ) : item.replyText ? (
                      <div className="space-y-1.5">
                        {splitDisplayReplyChunks(item.replyText).map((chunk, chunkIdx) => (
                          <p
                            key={`${item._id}-chunk-${chunkIdx}`}
                            dir="auto"
                            className="whitespace-pre-wrap break-words rounded-md px-2.5 py-1.5"
                            style={{
                              background: "var(--bg-card)",
                              border: "1px solid var(--border-main)",
                              color: "var(--text-primary)",
                            }}
                          >
                            {chunk}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="italic" style={{ color: "var(--text-secondary)" }}>
                        No message sent to lead (handled silently in CRM).
                      </p>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
