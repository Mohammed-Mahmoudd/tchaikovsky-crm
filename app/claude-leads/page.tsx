"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquare,
  Pause,
  Play,
  Search,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react";
import { useAuth, normalizeRole } from "../components/AuthProvider";
import { useCRM } from "../context/CRMContext";
import { useBranches } from "../lib/branches";
import { LeadLabelBadges } from "../components/LeadLabelBadges";
import { ClaudeStatusPill } from "../components/ClaudeUiPrimitives";
import { SlideOverChatDrawer, useSlideOverChatDrawer } from "../components/SlideOverChatDrawer";
import {
  type ClaudeAssignmentFilter,
  filterClaudeLeadCandidates,
  getLeadClaudeStatusMeta,
  summarizeClaudeLeadCounts,
} from "../utils/claudeAgent";
import { buildLabelNameMap, matchLeadSearch } from "../utils/search";
import { formatLastMessageTime } from "../utils/time";

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

export default function ClaudeLeadsAssignmentPage() {
  const { user, authFetch } = useAuth();
  const isChairman = normalizeRole(user?.role) === "chairman";
  const { admissionsConversations: conversations, labels, updateConversationClaude } = useCRM();
  const { allBranchNames } = useBranches();
  const {
    chatId: drawerChatId,
    showDetails: showChatDetails,
    setShowDetails: setShowChatDetails,
    isClosing: isDrawerClosing,
    panelRef: drawerPanelRef,
    open: openDrawer,
    close: closeDrawer,
    handleAnimationEnd: handleDrawerAnimationEnd,
  } = useSlideOverChatDrawer();

  const [globalEnabled, setGlobalEnabled] = useState<boolean | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [assignmentFilter, setAssignmentFilter] = useState<ClaudeAssignmentFilter>("all");
  const [channelFilter, setChannelFilter] = useState<"ALL" | "WA" | "FB" | "IG">("ALL");
  const [stageFilter, setStageFilter] = useState<string>("ALL");
  const [branchFilter, setBranchFilter] = useState<string>("ALL");
  const [includeClosedBuckets, setIncludeClosedBuckets] = useState(false);
  const [page, setPage] = useState(1);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
  const [bulkStatus, setBulkStatus] = useState<{
    running: boolean;
    done: number;
    total: number;
    ok: boolean;
    msg: string;
  } | null>(null);

  useEffect(() => {
    if (!isChairman) return;
    let cancelled = false;
    authFetch("/crm-api/claude/status", { cache: "no-store" })
      .then((res) => res.json().catch(() => null))
      .then((json) => {
        if (!cancelled && json?.success && json.data?.settings) {
          setGlobalEnabled(Boolean(json.data.settings.enabled));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authFetch, isChairman]);

  const labelNameMap = useMemo(() => buildLabelNameMap(labels), [labels]);

  const branchOptions = useMemo(() => {
    const names = new Set<string>(allBranchNames);
    for (const c of conversations) {
      if (c.branch && c.branch.trim()) names.add(c.branch.trim());
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [allBranchNames, conversations]);

  const crmCounts = useMemo(
    () => summarizeClaudeLeadCounts(conversations),
    [conversations]
  );

  const filteredLeads = useMemo(() => {
    const cleanQ = searchQuery.trim();
    return filterClaudeLeadCandidates(conversations, {
      assignmentFilter,
      channelFilter,
      stageFilter,
      branchFilter,
      includeClosedBuckets,
      matchesQuery: cleanQ
        ? (conv) => matchLeadSearch(conv, cleanQ, labelNameMap)
        : undefined,
    });
  }, [
    conversations,
    assignmentFilter,
    channelFilter,
    stageFilter,
    branchFilter,
    includeClosedBuckets,
    searchQuery,
    labelNameMap,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageLeads = useMemo(
    () => filteredLeads.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredLeads, safePage]
  );

  const pageAllSelected =
    pageLeads.length > 0 && pageLeads.every((lead) => selectedIds.has(lead.id));

  const toggleSelectOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectPage = useCallback(() => {
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

  const handleSingleAction = useCallback(
    async (
      id: string,
      payload: { claudeEnabled?: boolean; claudePaused?: boolean }
    ) => {
      setBusyIds((prev) => new Set(prev).add(id));
      const shouldTrigger = payload.claudeEnabled === true || payload.claudePaused === false;
      const res = await updateConversationClaude(id, {
        ...payload,
        ...(shouldTrigger ? { triggerReply: true } : {}),
      });
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (!res.ok) {
        setBulkStatus({
          running: false,
          done: 0,
          total: 0,
          ok: false,
          msg: res.error || "Could not update lead assignment.",
        });
      }
    },
    [updateConversationClaude]
  );

  const handleBulkAction = useCallback(
    async (
      payload: { claudeEnabled?: boolean; claudePaused?: boolean },
      actionVerb: string
    ) => {
      const targetIds = Array.from(selectedIds);
      if (targetIds.length === 0) return;

      setBulkStatus({
        running: true,
        done: 0,
        total: targetIds.length,
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
        setBulkStatus({
          running: true,
          done: i + batch.length,
          total: targetIds.length,
          ok: failed === 0,
          msg: `${actionVerb} ${Math.min(i + batch.length, targetIds.length)} of ${targetIds.length}...`,
        });
      }

      if (failed === 0) {
        setSelectedIds(new Set());
        setBulkStatus({
          running: false,
          done: targetIds.length,
          total: targetIds.length,
          ok: true,
          msg: `Updated ${succeeded} lead${succeeded === 1 ? "" : "s"} cleanly. They are now visible in Settings → Claude.`,
        });
      } else {
        setBulkStatus({
          running: false,
          done: targetIds.length,
          total: targetIds.length,
          ok: false,
          msg: `Updated ${succeeded} leads, but ${failed} failed.`,
        });
      }
    },
    [selectedIds, updateConversationClaude]
  );

  if (!isChairman) {
    return (
      <div
        className="flex-1 flex items-center justify-center p-6"
        style={{ background: "var(--bg-page)", color: "var(--text-primary)" }}
      >
        <div
          className="max-w-md w-full rounded-xl p-6 text-center space-y-3"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)" }}
        >
          <AlertCircle className="w-8 h-8 mx-auto" style={{ color: "var(--label-red-text)" }} />
          <h1 className="text-[15px] font-bold">Chairman Access Only</h1>
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            Only the Chairman can assign leads to Adham AI Agent.
          </p>
          <Link
            href="/settings"
            className="inline-flex items-center justify-center min-h-[40px] px-4 rounded-lg text-[12px] font-semibold text-white"
            style={{ background: "var(--bg-banner)" }}
          >
            Back to Settings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
      <div
        className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 pb-12 w-full"
        style={{ background: "var(--bg-page)", color: "var(--text-primary)", WebkitOverflowScrolling: "touch" }}
      >
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <Link
              href="/settings#claude-leads"
              className="inline-flex items-center gap-1.5 text-[12px] font-medium hover:underline"
              style={{ color: "var(--bg-banner)" }}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Settings → Claude</span>
            </Link>
            <div className="flex items-center gap-2.5 flex-wrap">
              <Bot className="w-5 h-5 shrink-0" style={{ color: "var(--bg-banner)" }} />
              <h1 className="text-[17px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
                Search & Assign Leads to Adham AI
              </h1>
              {globalEnabled !== null && (
                <ClaudeStatusPill
                  label={globalEnabled ? "Master Auto-Reply ON" : "Master Auto-Reply OFF"}
                  tone={globalEnabled ? "green" : "amber"}
                />
              )}
            </div>
            <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
              Search across all CRM conversations by name, phone, label, channel, or stage and assign leads to Adham. Assigned leads appear automatically in Settings → Claude.
            </p>
          </div>

          <Link
            href="/settings#claude-leads"
            className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 rounded-lg text-[12px] font-semibold shrink-0"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-input)",
              color: "var(--text-primary)",
            }}
          >
            <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--bg-banner)" }} />
            <span>View Assigned ({crmCounts.totalAssigned})</span>
          </Link>
        </div>

        {/* Master switch reminder banner if OFF */}
        {globalEnabled === false && (
          <div
            className="rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[12px]"
            style={{
              background: "var(--label-amber-bg)",
              border: "1px solid var(--label-amber-border)",
              color: "var(--label-amber-text)",
            }}
          >
            <span>
              Global auto-reply is currently paused in Claude Settings. Leads you assign here are queued cleanly as{" "}
              <strong>Master off</strong> until you enable automatic replies.
            </span>
            <Link href="/settings#claude" className="font-semibold underline shrink-0">
              Open Master Control →
            </Link>
          </div>
        )}

        {/* KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Matching filter", value: filteredLeads.length, tone: "var(--text-primary)" },
            { label: "Assigned to Adham", value: crmCounts.totalAssigned, tone: "var(--label-blue-text)" },
            { label: "Active", value: crmCounts.activeCount, tone: "var(--label-green-text)" },
            { label: "Paused", value: crmCounts.pausedCount, tone: "var(--label-amber-text)" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl px-4 py-3"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-main)",
                boxShadow: "var(--shadow-card)",
              }}
            >
              <p className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
                {stat.label}
              </p>
              <p className="text-[20px] font-bold mt-0.5 tabular-nums" style={{ color: stat.tone }}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        {/* Search & Filter Toolbar */}
        <div
          className="rounded-xl p-4 space-y-3"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-main)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <div className="flex flex-col lg:flex-row gap-2.5">
            {/* Search input */}
            <div className="relative flex-1 min-w-0">
              <Search
                className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: "var(--text-muted)" }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by lead name, phone, CRM ID, or label..."
                className="w-full min-h-[42px] pl-9 pr-9 text-[16px] sm:text-[13px] rounded-lg outline-none"
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
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded cursor-pointer"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Filters */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <select
                aria-label="Filter by Adham assignment"
                value={assignmentFilter}
                onChange={(e) => {
                  setAssignmentFilter(e.target.value as ClaudeAssignmentFilter);
                  setPage(1);
                }}
                className="min-h-[42px] px-2.5 text-[16px] sm:text-[12px] rounded-lg outline-none cursor-pointer"
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
                className="min-h-[42px] px-2.5 text-[16px] sm:text-[12px] rounded-lg outline-none cursor-pointer"
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
                className="min-h-[42px] px-2.5 text-[16px] sm:text-[12px] rounded-lg outline-none cursor-pointer"
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
                className="min-h-[42px] px-2.5 text-[16px] sm:text-[12px] rounded-lg outline-none cursor-pointer"
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

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <label className="inline-flex items-center gap-2 text-[12px] cursor-pointer" style={{ color: "var(--text-secondary)" }}>
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
              {(searchQuery ||
                assignmentFilter !== "all" ||
                channelFilter !== "ALL" ||
                stageFilter !== "ALL" ||
                branchFilter !== "ALL" ||
                includeClosedBuckets) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setAssignmentFilter("all");
                    setChannelFilter("ALL");
                    setStageFilter("ALL");
                    setBranchFilter("ALL");
                    setIncludeClosedBuckets(false);
                    setPage(1);
                  }}
                  className="font-semibold hover:underline cursor-pointer"
                  style={{ color: "var(--bg-banner)" }}
                >
                  Reset filters
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Bulk Selection / Action Bar */}
        {(selectedIds.size > 0 || bulkStatus) && (
          <div
            className="rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            style={{
              background: bulkStatus && !bulkStatus.ok ? "var(--label-red-bg)" : "var(--bg-selected)",
              border: `1px solid ${bulkStatus && !bulkStatus.ok ? "var(--label-red-border)" : "var(--label-blue-border)"}`,
            }}
          >
            <div className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>
              {bulkStatus ? (
                <span className="inline-flex items-center gap-2">
                  {bulkStatus.running ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : bulkStatus.ok ? (
                    <Check className="w-4 h-4 shrink-0" style={{ color: "var(--label-green-text)" }} />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" style={{ color: "var(--label-red-text)" }} />
                  )}
                  <span>{bulkStatus.msg}</span>
                </span>
              ) : (
                <span>
                  <strong>{selectedIds.size}</strong> lead{selectedIds.size === 1 ? "" : "s"} selected
                </span>
              )}
            </div>

            {selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={bulkStatus?.running}
                  onClick={() => void handleBulkAction({ claudeEnabled: true }, "Assigning")}
                  className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 rounded-lg text-[12px] font-semibold text-white cursor-pointer disabled:opacity-50"
                  style={{ background: "var(--bg-banner)" }}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Assign ({selectedIds.size})</span>
                </button>
                <button
                  type="button"
                  disabled={bulkStatus?.running}
                  onClick={() => void handleBulkAction({ claudePaused: true }, "Pausing")}
                  className="min-h-[38px] px-3 rounded-lg text-[12px] font-medium cursor-pointer disabled:opacity-50"
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
                  disabled={bulkStatus?.running}
                  onClick={() => void handleBulkAction({ claudeEnabled: false }, "Removing")}
                  className="min-h-[38px] px-3 rounded-lg text-[12px] font-medium cursor-pointer disabled:opacity-50"
                  style={{
                    background: "var(--label-red-bg)",
                    border: "1px solid var(--label-red-border)",
                    color: "var(--label-red-text)",
                  }}
                >
                  Remove from Adham
                </button>
                <button
                  type="button"
                  disabled={bulkStatus?.running}
                  onClick={() => setSelectedIds(new Set())}
                  className="min-h-[38px] px-2.5 rounded-lg text-[12px] cursor-pointer"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Clear
                </button>
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
          {/* Select-all header row */}
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
            <span className="hidden sm:inline">Adham Status & Actions</span>
          </div>

          {pageLeads.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                No leads match these filters
              </p>
              <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                Try clearing your search query or toggling “Include DONE and Archived leads”.
              </p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--border-main)" }}>
              {pageLeads.map((lead) => {
                const isSelected = selectedIds.has(lead.id);
                const isBusy = busyIds.has(lead.id);
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
                          <span className="text-[13.5px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                            {displayName}
                          </span>
                          <ClaudeStatusPill label={lead.channel} tone="slate" />
                          {lead.pipeline && (
                            <ClaudeStatusPill label={lead.pipeline} tone="blue" />
                          )}
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

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                          {lead.phone && lead.phone !== displayName && <span>{lead.phone}</span>}
                          <span>Branch: {lead.branch || "Unassigned"}</span>
                          <span>Staff: {lead.agent || "Unassigned"}</span>
                          {timeLabel && <span>Last msg: {timeLabel}</span>}
                        </div>

                        {lead.lastMessageText && (
                          <p
                            dir="auto"
                            className="text-[11.5px] truncate max-w-2xl"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {lead.lastMessageText}
                          </p>
                        )}

                        {lead.labels && lead.labels.length > 0 && (
                          <LeadLabelBadges labelIds={lead.labels} catalog={labels} maxVisible={4} />
                        )}
                      </div>
                    </div>

                    {/* Per-lead controls */}
                    <div className="flex flex-wrap items-center gap-2 pl-7 lg:pl-0 shrink-0">
                      {!lead.claudeEnabled ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            void handleSingleAction(lead.id, { claudeEnabled: true })
                          }
                          className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 rounded-lg text-[12px] font-semibold text-white cursor-pointer disabled:opacity-50"
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
                              onClick={() =>
                                void handleSingleAction(lead.id, { claudePaused: false })
                              }
                              className="inline-flex items-center gap-1 min-h-[38px] px-3 rounded-lg text-[12px] font-semibold text-white cursor-pointer disabled:opacity-50"
                              style={{ background: "var(--bg-banner)" }}
                            >
                              <Play className="w-3.5 h-3.5" />
                              <span>Resume</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                void handleSingleAction(lead.id, { claudePaused: true })
                              }
                              className="inline-flex items-center gap-1 min-h-[38px] px-3 rounded-lg text-[12px] font-medium cursor-pointer disabled:opacity-50"
                              style={{
                                background: "var(--bg-panel)",
                                border: "1px solid var(--border-input)",
                                color: "var(--text-primary)",
                              }}
                            >
                              <Pause className="w-3.5 h-3.5" />
                              <span>Pause</span>
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              void handleSingleAction(lead.id, { claudeEnabled: false })
                            }
                            className="min-h-[38px] px-3 rounded-lg text-[12px] font-medium cursor-pointer disabled:opacity-50"
                            style={{
                              background: "var(--label-red-bg)",
                              border: "1px solid var(--label-red-border)",
                              color: "var(--label-red-text)",
                            }}
                          >
                            Remove
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => openDrawer(lead.id)}
                        className="inline-flex items-center gap-1 min-h-[38px] px-3 rounded-lg text-[12px] font-medium cursor-pointer"
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
                  className="inline-flex items-center gap-1 min-h-[36px] px-3 rounded-lg font-medium cursor-pointer disabled:opacity-40"
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
                  className="inline-flex items-center gap-1 min-h-[36px] px-3 rounded-lg font-medium cursor-pointer disabled:opacity-40"
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
      </div>

      <SlideOverChatDrawer
        chatId={drawerChatId}
        showDetails={showChatDetails}
        isClosing={isDrawerClosing}
        panelRef={drawerPanelRef}
        onToggleDetails={() => setShowChatDetails((prev) => !prev)}
        onCloseDetails={() => setShowChatDetails(false)}
        onClose={closeDrawer}
        onAnimationEnd={handleDrawerAnimationEnd}
      />
    </div>
  );
}
