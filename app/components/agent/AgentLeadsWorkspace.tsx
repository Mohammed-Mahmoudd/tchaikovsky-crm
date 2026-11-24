"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquare,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  UserPlus,
  X,
} from "lucide-react";
import { useAgentAssignedLeads, useAgentCore } from "../../context/AgentWorkspaceContext";
import { useBranches } from "../../lib/branches";
import {
  type ClaudeAssignmentFilter,
  filterClaudeLeadCandidates,
  formatClaudeActivationNote,
  getLeadClaudeStatusMeta,
} from "../../utils/claudeAgent";
import {
  type AgentLeadsMode,
  resolveAgentLeadsMode,
} from "../../utils/agentWorkspaceCache";
import { buildLabelNameMap, matchLeadSearch } from "../../utils/search";
import { formatLastMessageTime } from "../../utils/time";
import { LeadLabelBadges } from "../LeadLabelBadges";
import { ClaudeStatusPill } from "../ClaudeUiPrimitives";

const PIPELINE_STAGES = [
  "New",
  "Contacted",
  "Qualified",
  "Audition Booked",
  "Attended",
  "Enrolled",
  "Joining Later",
  "Unqualified",
  "Lost",
  "direct",
] as const;

const PAGE_SIZE = 40;
const BULK_BATCH_SIZE = 5;

interface UnifiedLeadItem {
  id: string;
  name?: string;
  leadName?: string;
  phone?: string;
  channel: string;
  branch?: string;
  pipeline?: string;
  agent?: string;
  labels?: string[];
  isArchived?: boolean;
  isDone?: boolean;
  claudeEnabled: boolean;
  claudePaused: boolean;
  claudePausedReason?: string;
  claudeLastError?: string;
  lastMessageAt?: number;
  lastMessageText?: string;
}

interface ActionStatusNotice {
  running: boolean;
  ok: boolean;
  msg: string;
}

/**
 * Unified AI Leads workspace combining Assigned Leads control and full-CRM
 * search & bulk assignment into a single page with instant mode switching.
 */
export function AgentLeadsWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlMode = resolveAgentLeadsMode(searchParams.get("mode"));

  const {
    settingsDraft,
    savingSettings,
    handleToggleMaster,
    openLeadChat,
  } = useAgentCore();
  const {
    admissionsConversations,
    labels,
    mergedAssignedLeads,
    leadCounts,
    loadingLeads,
    leadBusyId,
    fetchClaudeLeads,
    handleLeadBoardAction,
    updateConversationClaude,
  } = useAgentAssignedLeads();
  const { allBranchNames } = useBranches();

  const [mode, setMode] = useState<AgentLeadsMode>(urlMode);
  const [searchQuery, setSearchQuery] = useState("");
  const [assignedStatusFilter, setAssignedStatusFilter] = useState<
    "all" | "active" | "paused" | "errors"
  >("all");
  const [assignmentFilter, setAssignmentFilter] = useState<ClaudeAssignmentFilter>("all");
  const [channelFilter, setChannelFilter] = useState<"ALL" | "WA" | "FB" | "IG">("ALL");
  const [stageFilter, setStageFilter] = useState<string>("ALL");
  const [branchFilter, setBranchFilter] = useState<string>("ALL");
  const [includeClosedBuckets, setIncludeClosedBuckets] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkBusyIds, setBulkBusyIds] = useState<Set<string>>(() => new Set());
  const [confirmBulkRemove, setConfirmBulkRemove] = useState(false);
  const [actionStatus, setActionStatus] = useState<ActionStatusNotice | null>(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setMode(urlMode);
        setPage(1);
        setSelectedIds(new Set());
        setConfirmBulkRemove(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [urlMode]);

  const switchMode = useCallback(
    (nextMode: AgentLeadsMode) => {
      setMode(nextMode);
      setPage(1);
      setSelectedIds(new Set());
      setConfirmBulkRemove(false);
      setActionStatus(null);
      router.replace(
        nextMode === "assign" ? "/agent/leads?mode=assign" : "/agent/leads",
        { scroll: false }
      );
    },
    [router]
  );

  const labelNameMap = useMemo(() => buildLabelNameMap(labels), [labels]);

  const branchOptions = useMemo(() => {
    const names = new Set<string>(allBranchNames);
    for (const c of admissionsConversations) {
      if (c.branch && c.branch.trim()) names.add(c.branch.trim());
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [allBranchNames, admissionsConversations]);

  const assignedItems = useMemo<UnifiedLeadItem[]>(() => {
    const convById = new Map(admissionsConversations.map((c) => [c.id, c]));
    return mergedAssignedLeads.map((row) => {
      const conv = convById.get(row.senderId);
      return {
        id: row.senderId,
        name: row.name,
        leadName: row.leadName,
        phone: row.phone,
        channel: row.channel,
        branch: row.branch,
        pipeline: row.pipeline,
        agent: conv?.agent,
        labels: conv?.labels,
        isArchived: conv?.isArchived,
        isDone: conv?.isDone,
        claudeEnabled: Boolean(row.claudeEnabled),
        claudePaused: Boolean(row.claudePaused),
        claudePausedReason: row.claudePausedReason,
        claudeLastError: row.claudeLastError,
        lastMessageAt: row.lastMessageAt,
        lastMessageText: row.lastMessageText,
      };
    });
  }, [admissionsConversations, mergedAssignedLeads]);

  const assignPoolItems = useMemo<UnifiedLeadItem[]>(
    () =>
      admissionsConversations.map((c) => ({
        id: c.id,
        name: c.name,
        leadName: c.leadName,
        phone: c.phone,
        channel: c.channel,
        branch: c.branch,
        pipeline: c.pipeline,
        agent: c.agent,
        labels: c.labels,
        isArchived: c.isArchived,
        isDone: c.isDone,
        claudeEnabled: Boolean(c.claudeEnabled),
        claudePaused: Boolean(c.claudePaused),
        claudePausedReason: c.claudePausedReason,
        claudeLastError: c.claudeLastError,
        lastMessageAt: c.lastMessageAt,
        lastMessageText: c.lastMessageText,
      })),
    [admissionsConversations]
  );

  const filteredLeads = useMemo(() => {
    const cleanQ = searchQuery.trim();
    if (mode === "assigned") {
      return assignedItems.filter((item) => {
        if (assignedStatusFilter === "active" && !(item.claudeEnabled && !item.claudePaused)) {
          return false;
        }
        if (assignedStatusFilter === "paused" && !(item.claudeEnabled && item.claudePaused)) {
          return false;
        }
        if (
          assignedStatusFilter === "errors" &&
          !(item.claudeLastError && item.claudeLastError.trim())
        ) {
          return false;
        }
        if (cleanQ) {
          return matchLeadSearch(item, cleanQ, labelNameMap);
        }
        return true;
      });
    }

    return filterClaudeLeadCandidates(assignPoolItems, {
      assignmentFilter,
      channelFilter,
      stageFilter,
      branchFilter,
      includeClosedBuckets,
      matchesQuery: cleanQ ? (item) => matchLeadSearch(item, cleanQ, labelNameMap) : undefined,
    });
  }, [
    mode,
    searchQuery,
    assignedItems,
    assignedStatusFilter,
    labelNameMap,
    assignPoolItems,
    assignmentFilter,
    channelFilter,
    stageFilter,
    branchFilter,
    includeClosedBuckets,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageLeads = useMemo(
    () => filteredLeads.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredLeads, safePage]
  );

  const pageAllSelected =
    pageLeads.length > 0 && pageLeads.every((lead) => selectedIds.has(lead.id));

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (assignmentFilter !== "all") count += 1;
    if (channelFilter !== "ALL") count += 1;
    if (stageFilter !== "ALL") count += 1;
    if (branchFilter !== "ALL") count += 1;
    if (includeClosedBuckets) count += 1;
    return count;
  }, [assignmentFilter, channelFilter, stageFilter, branchFilter, includeClosedBuckets]);

  const toggleSelectOne = useCallback((id: string) => {
    setConfirmBulkRemove(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectPage = useCallback(() => {
    setConfirmBulkRemove(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (pageAllSelected) {
        for (const lead of pageLeads) next.delete(lead.id);
      } else {
        for (const lead of pageLeads) next.add(lead.id);
      }
      return next;
    });
  }, [pageAllSelected, pageLeads]);

  const handleRowAction = useCallback(
    async (
      id: string,
      payload: { claudeEnabled?: boolean; claudePaused?: boolean; resetSession?: boolean }
    ) => {
      setActionStatus(null);
      if (mode === "assigned") {
        const res = await handleLeadBoardAction(id, payload);
        if (!res.ok) {
          setActionStatus({
            running: false,
            ok: false,
            msg: res.error || "Could not update lead assignment.",
          });
        } else if (res.activationNote && res.autoReplySkippedReason) {
          setActionStatus({
            running: false,
            ok: true,
            msg: res.activationNote.message,
          });
        } else if (payload.resetSession) {
          setActionStatus({
            running: false,
            ok: true,
            msg: "Reset Adham conversation memory for this lead.",
          });
        }
        return;
      }

      setBulkBusyIds((prev) => new Set(prev).add(id));
      const shouldTrigger = payload.claudeEnabled === true || payload.claudePaused === false;
      const res = await updateConversationClaude(id, {
        ...payload,
        ...(shouldTrigger ? { triggerReply: true } : {}),
      });
      setBulkBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (!res.ok) {
        setActionStatus({
          running: false,
          ok: false,
          msg: res.error || "Could not update lead assignment.",
        });
      } else {
        void fetchClaudeLeads({ force: true });
        if (shouldTrigger && res.autoReplySkippedReason) {
          const note = formatClaudeActivationNote(
            payload.claudeEnabled === true ? "Enabled" : "Resumed",
            res
          );
          setActionStatus({
            running: false,
            ok: true,
            msg: note.message,
          });
        }
      }
    },
    [fetchClaudeLeads, handleLeadBoardAction, mode, updateConversationClaude]
  );

  const handleBulkAction = useCallback(
    async (
      payload: { claudeEnabled?: boolean; claudePaused?: boolean },
      actionVerb: string
    ) => {
      const targetIds = Array.from(selectedIds);
      if (targetIds.length === 0) return;

      setConfirmBulkRemove(false);
      setActionStatus({
        running: true,
        ok: true,
        msg: `${actionVerb} ${targetIds.length} lead${targetIds.length === 1 ? "" : "s"}...`,
      });

      let succeeded = 0;
      let failed = 0;

      for (let i = 0; i < targetIds.length; i += BULK_BATCH_SIZE) {
        const batch = targetIds.slice(i, i + BULK_BATCH_SIZE);
        const results = await Promise.all(
          batch.map((id) => updateConversationClaude(id, payload))
        );
        for (const res of results) {
          if (res.ok) succeeded += 1;
          else failed += 1;
        }
        setActionStatus({
          running: true,
          ok: failed === 0,
          msg: `${actionVerb} ${Math.min(i + batch.length, targetIds.length)} of ${targetIds.length}...`,
        });
      }

      void fetchClaudeLeads({ force: true });

      if (failed === 0) {
        setSelectedIds(new Set());
        setActionStatus({
          running: false,
          ok: true,
          msg: `Updated ${succeeded} lead${succeeded === 1 ? "" : "s"}. Changes are live in Assigned leads.`,
        });
      } else {
        setActionStatus({
          running: false,
          ok: false,
          msg: `Updated ${succeeded} leads, but ${failed} failed.`,
        });
      }
    },
    [fetchClaudeLeads, selectedIds, updateConversationClaude]
  );

  const resetAssignFilters = useCallback(() => {
    setSearchQuery("");
    setAssignmentFilter("all");
    setChannelFilter("ALL");
    setStageFilter("ALL");
    setBranchFilter("ALL");
    setIncludeClosedBuckets(false);
    setPage(1);
  }, []);

  const globalEnabled = settingsDraft?.enabled ?? null;

  return (
    <div className="space-y-4">
      {/* Master switch reminder banner if OFF */}
      {globalEnabled === false && (
        <div
          className="rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-[12px]"
          style={{
            background: "var(--label-amber-bg)",
            border: "1px solid var(--label-amber-border)",
            color: "var(--label-amber-text)",
          }}
        >
          <span>
            Automatic replies are currently paused. Leads you assign here stay queued as{" "}
            <strong>Master off</strong> until you enable automatic replies.
          </span>
          <button
            type="button"
            disabled={savingSettings}
            onClick={() => void handleToggleMaster()}
            className="min-h-[40px] sm:min-h-[34px] px-3.5 rounded-lg text-[11.5px] font-semibold text-white shrink-0 cursor-pointer disabled:opacity-50"
            style={{ background: "var(--bg-banner)" }}
          >
            {savingSettings ? "Turning on..." : "Turn ON"}
          </button>
        </div>
      )}

      {/* 4-Card Summary KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: "Assigned",
            value: leadCounts.totalAssigned,
            tone: "var(--label-blue-text)",
            filter: "all" as const,
          },
          {
            label: "Active",
            value: leadCounts.activeCount,
            tone: "var(--label-green-text)",
            filter: "active" as const,
          },
          {
            label: "Paused",
            value: leadCounts.pausedCount,
            tone: "var(--label-amber-text)",
            filter: "paused" as const,
          },
          {
            label: "With Errors",
            value: leadCounts.errorCount,
            tone: leadCounts.errorCount > 0 ? "var(--label-red-text)" : "var(--text-secondary)",
            filter: "errors" as const,
          },
        ].map((stat) => {
          const isActiveCard = mode === "assigned" && assignedStatusFilter === stat.filter;
          return (
            <button
              key={stat.label}
              type="button"
              onClick={() => {
                if (mode !== "assigned") switchMode("assigned");
                setAssignedStatusFilter(stat.filter);
                setPage(1);
              }}
              className="rounded-xl px-4 py-3 text-left transition-colors hover:bg-[var(--bg-hover)] cursor-pointer"
              style={{
                background: "var(--bg-card)",
                border: `1px solid ${isActiveCard ? "var(--label-blue-border)" : "var(--border-main)"}`,
                boxShadow: "var(--shadow-card)",
              }}
            >
              <p className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
                {stat.label}
              </p>
              <p className="text-[20px] font-bold mt-0.5 tabular-nums" style={{ color: stat.tone }}>
                {stat.value}
              </p>
            </button>
          );
        })}
      </div>

      {/* Mode Switch + Search & Filters Toolbar */}
      <section
        className="rounded-xl p-4 space-y-3"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-main)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {/* Segmented Mode Control */}
          <div
            role="tablist"
            aria-label="Lead workspace mode"
            className="inline-flex rounded-lg p-1 self-start"
            style={{
              background: "var(--bg-input)",
              border: "1px solid var(--border-input)",
            }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "assigned"}
              onClick={() => switchMode("assigned")}
              className="inline-flex items-center gap-1.5 min-h-[40px] sm:min-h-[34px] px-3.5 rounded-md text-[12px] font-semibold cursor-pointer transition-colors"
              style={
                mode === "assigned"
                  ? {
                      background: "var(--bg-card)",
                      color: "var(--text-primary)",
                      boxShadow: "var(--shadow-card)",
                    }
                  : { color: "var(--text-secondary)" }
              }
            >
              <span>Assigned</span>
              <span
                className="px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums"
                style={{
                  background: "var(--bg-pill)",
                  color: mode === "assigned" ? "var(--label-blue-text)" : "var(--text-secondary)",
                }}
              >
                {leadCounts.totalAssigned}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "assign"}
              onClick={() => switchMode("assign")}
              className="inline-flex items-center gap-1.5 min-h-[40px] sm:min-h-[34px] px-3.5 rounded-md text-[12px] font-semibold cursor-pointer transition-colors"
              style={
                mode === "assign"
                  ? {
                      background: "var(--bg-card)",
                      color: "var(--text-primary)",
                      boxShadow: "var(--shadow-card)",
                    }
                  : { color: "var(--text-secondary)" }
              }
            >
              <UserPlus className="w-3.5 h-3.5" style={{ color: "var(--bg-banner)" }} />
              <span>Find &amp; Assign</span>
            </button>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {mode === "assign" && (
              <button
                type="button"
                onClick={() => setMobileFiltersOpen((v) => !v)}
                aria-expanded={mobileFiltersOpen}
                className="md:hidden inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-lg text-[12px] font-medium cursor-pointer"
                style={{
                  background: mobileFiltersOpen ? "var(--bg-selected)" : "var(--bg-input)",
                  border: `1px solid ${
                    mobileFiltersOpen ? "var(--label-blue-border)" : "var(--border-input)"
                  }`,
                  color: "var(--text-primary)",
                }}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => void fetchClaudeLeads({ force: true })}
              aria-label="Refresh leads"
              className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-[36px] px-3 rounded-lg text-[12px] font-medium cursor-pointer hover:bg-[var(--bg-hover)]"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-input)",
                color: "var(--text-primary)",
              }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingLeads ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Search + Mode-Specific Filters */}
        {mode === "assigned" ? (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
            <div className="relative flex-1 min-w-0">
              <Search
                className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: "var(--text-muted)" }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Filter assigned leads by name, phone, CRM ID, or label..."
                className="w-full min-h-[44px] sm:min-h-[38px] ps-9 pe-9 text-[16px] sm:text-[12.5px] rounded-lg outline-none"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-input)",
                  color: "var(--text-primary)",
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setPage(1);
                  }}
                  aria-label="Clear search"
                  className="absolute end-2 top-1/2 -translate-y-1/2 p-1.5 rounded cursor-pointer"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(["all", "active", "paused", "errors"] as const).map((f) => {
                const active = assignedStatusFilter === f;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => {
                      setAssignedStatusFilter(f);
                      setPage(1);
                    }}
                    className={`min-h-[40px] sm:min-h-[36px] px-3 rounded-lg text-[11px] font-semibold capitalize cursor-pointer ${
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
                    {f}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col lg:flex-row gap-2.5">
              <div className="relative flex-1 min-w-0">
                <Search
                  className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: "var(--text-muted)" }}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search all CRM leads by name, phone, CRM ID, or label..."
                  className="w-full min-h-[44px] sm:min-h-[40px] ps-9 pe-9 text-[16px] sm:text-[12.5px] rounded-lg outline-none"
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-input)",
                    color: "var(--text-primary)",
                  }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setPage(1);
                    }}
                    aria-label="Clear search"
                    className="absolute end-2.5 top-1/2 -translate-y-1/2 p-1 rounded cursor-pointer"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div
                className={`${
                  mobileFiltersOpen ? "grid" : "hidden md:grid"
                } grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2`}
              >
                <select
                  aria-label="Filter by Adham assignment"
                  value={assignmentFilter}
                  onChange={(e) => {
                    setAssignmentFilter(e.target.value as ClaudeAssignmentFilter);
                    setPage(1);
                  }}
                  className="min-h-[44px] sm:min-h-[40px] px-2.5 text-[16px] sm:text-[12px] rounded-lg outline-none cursor-pointer"
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-input)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="all">Adham: All leads</option>
                  <option value="unassigned">Not assigned yet</option>
                  <option value="assigned">Assigned to Adham</option>
                  <option value="active">Active only</option>
                  <option value="paused">Paused only</option>
                  <option value="errors">With AI errors</option>
                </select>

                <select
                  aria-label="Filter by channel"
                  value={channelFilter}
                  onChange={(e) => {
                    setChannelFilter(e.target.value as "ALL" | "WA" | "FB" | "IG");
                    setPage(1);
                  }}
                  className="min-h-[44px] sm:min-h-[40px] px-2.5 text-[16px] sm:text-[12px] rounded-lg outline-none cursor-pointer"
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-input)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="ALL">Channel: All</option>
                  <option value="WA">WhatsApp</option>
                  <option value="FB">Messenger</option>
                  <option value="IG">Instagram</option>
                </select>

                <select
                  aria-label="Filter by pipeline stage"
                  value={stageFilter}
                  onChange={(e) => {
                    setStageFilter(e.target.value);
                    setPage(1);
                  }}
                  className="min-h-[44px] sm:min-h-[40px] px-2.5 text-[16px] sm:text-[12px] rounded-lg outline-none cursor-pointer"
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-input)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="ALL">Stage: All</option>
                  {PIPELINE_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Filter by branch"
                  value={branchFilter}
                  onChange={(e) => {
                    setBranchFilter(e.target.value);
                    setPage(1);
                  }}
                  className="min-h-[44px] sm:min-h-[40px] px-2.5 text-[16px] sm:text-[12px] rounded-lg outline-none cursor-pointer"
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-input)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="ALL">Branch: All</option>
                  <option value="__none__">No branch assigned</option>
                  {branchOptions.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <label
                className="inline-flex items-center gap-2 text-[12px] cursor-pointer"
                style={{ color: "var(--text-secondary)" }}
              >
                <input
                  type="checkbox"
                  checked={includeClosedBuckets}
                  onChange={(e) => {
                    setIncludeClosedBuckets(e.target.checked);
                    setPage(1);
                  }}
                  className="w-4 h-4 accent-[var(--bg-banner)] cursor-pointer"
                />
                <span>Include DONE and Archived leads</span>
              </label>

              <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                <span>
                  Showing {pageLeads.length} of {filteredLeads.length} matching leads
                </span>
                {(searchQuery || activeFilterCount > 0) && (
                  <button
                    type="button"
                    onClick={resetAssignFilters}
                    className="font-semibold hover:underline cursor-pointer"
                    style={{ color: "var(--bg-banner)" }}
                  >
                    Reset filters
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Bulk Selection & Feedback Bar */}
      {(selectedIds.size > 0 || actionStatus) && (
        <div
          className="rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          style={{
            background:
              actionStatus && !actionStatus.ok ? "var(--label-red-bg)" : "var(--bg-selected)",
            border: `1px solid ${
              actionStatus && !actionStatus.ok
                ? "var(--label-red-border)"
                : "var(--label-blue-border)"
            }`,
          }}
        >
          <div className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>
            {actionStatus ? (
              <span className="inline-flex items-center gap-2">
                {actionStatus.running ? (
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                ) : actionStatus.ok ? (
                  <Check className="w-4 h-4 shrink-0" style={{ color: "var(--label-green-text)" }} />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" style={{ color: "var(--label-red-text)" }} />
                )}
                <span>{actionStatus.msg}</span>
              </span>
            ) : (
              <span>
                <strong>{selectedIds.size}</strong> lead{selectedIds.size === 1 ? "" : "s"} selected
              </span>
            )}
          </div>

          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {confirmBulkRemove ? (
                <>
                  <span className="text-[11.5px] font-semibold" style={{ color: "var(--label-red-text)" }}>
                    Remove {selectedIds.size} lead{selectedIds.size === 1 ? "" : "s"} from Adham?
                  </span>
                  <button
                    type="button"
                    disabled={actionStatus?.running}
                    onClick={() => void handleBulkAction({ claudeEnabled: false }, "Removing")}
                    className="min-h-[40px] sm:min-h-[36px] px-3 rounded-lg text-[12px] font-semibold cursor-pointer disabled:opacity-50"
                    style={{
                      background: "var(--label-red-bg)",
                      border: "1px solid var(--label-red-border)",
                      color: "var(--label-red-text)",
                    }}
                  >
                    Confirm remove
                  </button>
                  <button
                    type="button"
                    disabled={actionStatus?.running}
                    onClick={() => setConfirmBulkRemove(false)}
                    className="min-h-[40px] sm:min-h-[36px] px-2.5 rounded-lg text-[12px] cursor-pointer"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  {mode === "assign" && (
                    <button
                      type="button"
                      disabled={actionStatus?.running}
                      onClick={() => void handleBulkAction({ claudeEnabled: true }, "Assigning")}
                      className="inline-flex items-center gap-1.5 min-h-[40px] sm:min-h-[36px] px-3.5 rounded-lg text-[12px] font-semibold text-white cursor-pointer disabled:opacity-50"
                      style={{ background: "var(--bg-banner)" }}
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Assign ({selectedIds.size})</span>
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={actionStatus?.running}
                    onClick={() => void handleBulkAction({ claudePaused: false }, "Resuming")}
                    className="min-h-[40px] sm:min-h-[36px] px-3 rounded-lg text-[12px] font-medium cursor-pointer disabled:opacity-50"
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-input)",
                      color: "var(--text-primary)",
                    }}
                  >
                    Resume
                  </button>
                  <button
                    type="button"
                    disabled={actionStatus?.running}
                    onClick={() => void handleBulkAction({ claudePaused: true }, "Pausing")}
                    className="min-h-[40px] sm:min-h-[36px] px-3 rounded-lg text-[12px] font-medium cursor-pointer disabled:opacity-50"
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-input)",
                      color: "var(--text-primary)",
                    }}
                  >
                    Pause
                  </button>
                  <button
                    type="button"
                    disabled={actionStatus?.running}
                    onClick={() => setConfirmBulkRemove(true)}
                    className="min-h-[40px] sm:min-h-[36px] px-3 rounded-lg text-[12px] font-medium cursor-pointer disabled:opacity-50"
                    style={{
                      background: "var(--label-red-bg)",
                      border: "1px solid var(--label-red-border)",
                      color: "var(--label-red-text)",
                    }}
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    disabled={actionStatus?.running}
                    onClick={() => setSelectedIds(new Set())}
                    className="min-h-[40px] sm:min-h-[36px] px-2.5 rounded-lg text-[12px] cursor-pointer"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Clear
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Lead List Card */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-main)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div
          className="px-4 py-2.5 flex items-center justify-between gap-2 text-[11px] font-semibold"
          style={{
            background: "var(--bg-panel)",
            borderBottom: "1px solid var(--border-main)",
            color: "var(--text-secondary)",
          }}
        >
          <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={pageAllSelected}
              onChange={toggleSelectPage}
              disabled={pageLeads.length === 0}
              className="w-4 h-4 accent-[var(--bg-banner)] cursor-pointer"
            />
            <span>
              {pageAllSelected
                ? `All ${pageLeads.length} on page selected`
                : `Select all ${pageLeads.length} on this page`}
            </span>
          </label>
          <span className="hidden sm:inline">Adham Status &amp; Actions</span>
        </div>

        {pageLeads.length === 0 ? (
          <div className="p-8 text-center space-y-2.5">
            <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
              {mode === "assigned" && assignedItems.length === 0
                ? "No leads are currently assigned to Adham"
                : "No leads match these filters"}
            </p>
            <p className="text-[12px] max-w-md mx-auto" style={{ color: "var(--text-secondary)" }}>
              {mode === "assigned" && assignedItems.length === 0
                ? "Switch to Find & Assign to search across your CRM and assign conversations to Adham."
                : "Try clearing your search query or adjusting the active filters."}
            </p>
            {mode === "assigned" && assignedItems.length === 0 ? (
              <button
                type="button"
                onClick={() => switchMode("assign")}
                className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-[38px] px-4 rounded-lg text-[12px] font-semibold text-white cursor-pointer"
                style={{ background: "var(--bg-banner)" }}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Find &amp; Assign leads</span>
              </button>
            ) : mode === "assign" && (searchQuery || activeFilterCount > 0) ? (
              <button
                type="button"
                onClick={resetAssignFilters}
                className="inline-flex items-center min-h-[40px] px-4 rounded-lg text-[12px] font-semibold cursor-pointer"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-input)",
                  color: "var(--text-primary)",
                }}
              >
                Reset filters
              </button>
            ) : null}
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border-main)" }}>
            {pageLeads.map((lead) => {
              const isSelected = selectedIds.has(lead.id);
              const isBusy = leadBusyId === lead.id || bulkBusyIds.has(lead.id);
              const meta = getLeadClaudeStatusMeta({
                claudeEnabled: lead.claudeEnabled,
                claudePaused: lead.claudePaused,
                claudePausedReason: lead.claudePausedReason,
                globalEnabled,
              });
              const displayName = lead.leadName || lead.name || lead.phone || lead.id;
              const timeLabel = formatLastMessageTime(lead.lastMessageAt);

              return (
                <div
                  key={lead.id}
                  className="px-4 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 transition-colors hover:bg-[var(--bg-hover)]"
                  style={{
                    background: isSelected ? "var(--bg-selected)" : undefined,
                    borderColor: "var(--border-main)",
                  }}
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectOne(lead.id)}
                      aria-label={`Select ${displayName}`}
                      className="w-4 h-4 mt-1 shrink-0 accent-[var(--bg-banner)] cursor-pointer"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="text-[13.5px] font-semibold truncate"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {displayName}
                        </span>
                        <ClaudeStatusPill label={lead.channel} tone="slate" />
                        {lead.pipeline && <ClaudeStatusPill label={lead.pipeline} tone="blue" />}
                        <ClaudeStatusPill
                          label={meta.label}
                          tone={
                            meta.state === "active"
                              ? "green"
                              : meta.state === "paused"
                              ? "amber"
                              : meta.state === "global_off"
                              ? "blue"
                              : "slate"
                          }
                        />
                      </div>

                      <div
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {lead.phone && lead.phone !== displayName && <span>{lead.phone}</span>}
                        <span>Branch: {lead.branch || "Unassigned"}</span>
                        {mode === "assign" && <span>Staff: {lead.agent || "Unassigned"}</span>}
                        {timeLabel && <span>Last msg: {timeLabel}</span>}
                      </div>

                      {(lead.claudeLastError || lead.claudePaused || lead.lastMessageText) && (
                        <p
                          dir="auto"
                          className="text-[11.5px] truncate max-w-2xl"
                          style={{
                            color: lead.claudeLastError
                              ? "var(--label-red-text)"
                              : "var(--text-muted)",
                          }}
                        >
                          {lead.claudeLastError
                            ? `Error: ${lead.claudeLastError}`
                            : lead.claudePaused
                            ? meta.description
                            : lead.lastMessageText}
                        </p>
                      )}

                      {lead.labels && lead.labels.length > 0 && (
                        <LeadLabelBadges labelIds={lead.labels} catalog={labels} maxVisible={4} />
                      )}
                    </div>
                  </div>

                  {/* Per-lead controls */}
                  <div className="flex flex-wrap items-center gap-2 ps-7 lg:ps-0 shrink-0">
                    {!lead.claudeEnabled ? (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleRowAction(lead.id, { claudeEnabled: true })}
                        className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-[36px] px-3.5 rounded-lg text-[12px] font-semibold text-white cursor-pointer disabled:opacity-50"
                        style={{ background: "var(--bg-banner)" }}
                      >
                        {isBusy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <UserPlus className="w-3.5 h-3.5" />
                        )}
                        <span>Assign to Adham</span>
                      </button>
                    ) : (
                      <>
                        {lead.claudePaused ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleRowAction(lead.id, { claudePaused: false })}
                            className="inline-flex items-center gap-1 min-h-[44px] sm:min-h-[36px] px-3 rounded-lg text-[11.5px] font-semibold text-white cursor-pointer disabled:opacity-50"
                            style={{ background: "var(--bg-banner)" }}
                          >
                            <Play className="w-3 h-3" />
                            <span>Resume</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleRowAction(lead.id, { claudePaused: true })}
                            className="inline-flex items-center gap-1 min-h-[44px] sm:min-h-[36px] px-3 rounded-lg text-[11.5px] font-medium cursor-pointer disabled:opacity-50"
                            style={{
                              background: "var(--bg-panel)",
                              border: "1px solid var(--border-input)",
                              color: "var(--text-primary)",
                            }}
                          >
                            <Pause className="w-3 h-3" />
                            <span>Pause</span>
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleRowAction(lead.id, { resetSession: true })}
                          title="Start a fresh Claude conversation memory for this lead"
                          className="inline-flex items-center gap-1 min-h-[44px] sm:min-h-[36px] px-2.5 rounded-lg text-[11.5px] font-medium cursor-pointer disabled:opacity-50"
                          style={{
                            background: "var(--bg-panel)",
                            border: "1px solid var(--border-input)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Reset</span>
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleRowAction(lead.id, { claudeEnabled: false })}
                          className="min-h-[44px] sm:min-h-[36px] px-3 rounded-lg text-[11.5px] font-medium cursor-pointer disabled:opacity-50"
                          style={{
                            background: "var(--label-red-bg)",
                            border: "1px solid var(--label-red-border)",
                            color: "var(--label-red-text)",
                          }}
                        >
                          Turn off
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => openLeadChat(lead.id)}
                      className="inline-flex items-center gap-1 min-h-[44px] sm:min-h-[36px] px-3 rounded-lg text-[11.5px] font-medium cursor-pointer hover:bg-[var(--bg-hover)]"
                      style={{
                        background: "var(--bg-panel)",
                        border: "1px solid var(--border-input)",
                        color: "var(--text-primary)",
                      }}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Open</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div
            className="px-4 py-3 flex items-center justify-between gap-2 text-[12px]"
            style={{
              background: "var(--bg-panel)",
              borderTop: "1px solid var(--border-main)",
              color: "var(--text-secondary)",
            }}
          >
            <span>
              Page {safePage} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 min-h-[40px] sm:min-h-[36px] px-3 rounded-lg font-medium cursor-pointer disabled:opacity-40"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-input)",
                  color: "var(--text-primary)",
                }}
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Prev</span>
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 min-h-[40px] sm:min-h-[36px] px-3 rounded-lg font-medium cursor-pointer disabled:opacity-40"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-input)",
                  color: "var(--text-primary)",
                }}
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

