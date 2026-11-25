"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Loader2,
  MessageSquare,
  Pause,
  Play,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react";
import { useAuth } from "../AuthProvider";
import { useBranches } from "../../lib/branches";
import { useAgentCore, type FeedbackNotice } from "../../context/AgentWorkspaceContext";
import {
  FOLLOWUP_STAGE_OPTIONS,
  type FollowUpAgentSettingsData,
  type FollowUpLeadRow,
  type FollowUpLeadsResponse,
  type FollowUpStatusPayload,
  formatChannelName,
  formatFollowUpReason,
  formatRiyadhHourLabel,
  getChannelWindowMeta,
  getEnrollmentStatusMeta,
} from "../../utils/followupAgent";
import {
  AGENT_CACHE_KEYS,
  AGENT_FRESH_WINDOW_MS,
  dedupeAgentRequest,
  invalidateFollowUpQueueQueryCache,
  readAgentMemorySnapshot,
  readFollowUpQueueQueryCache,
  readScopedAgentCache,
  writeFollowUpQueueQueryCache,
  writeScopedAgentCache,
} from "../../utils/agentWorkspaceCache";
import { formatLastMessageTime } from "../../utils/time";
import { ClaudeActivityPanel } from "../ClaudeActivityPanel";
import { ClaudeSettingSwitch, ClaudeStatusPill } from "../ClaudeUiPrimitives";

type WorkspaceTab = "review" | "leads" | "history";

interface FollowUpQueueSectionProps {
  statusData: FollowUpStatusPayload;
  settingsDraft: FollowUpAgentSettingsData;
  savingSettings: boolean;
  creatingAgent: boolean;
  createFeedback: FeedbackNotice | null;
  onToggleMaster: () => Promise<void>;
  onCreateAgent: () => Promise<void>;
  onDraftCountChange?: (count: number) => void;
}

const HISTORY_FILTER_OPTIONS = [
  { id: "all", label: "All" },
  { id: "followup_sent", label: "Sent" },
  { id: "followup_draft", label: "Drafts" },
  { id: "replied", label: "Replied" },
  { id: "booked", label: "Booked" },
  { id: "skipped", label: "Skipped" },
] as const;

const EMPTY_SUMMARY = {
  total: 0,
  waReady: 0,
  meta24h: 0,
  meta7d: 0,
  metaExpired: 0,
  enrolled: 0,
  draftReady: 0,
  scheduled: 0,
  waitingReply: 0,
  replied: 0,
  completed: 0,
  paused: 0,
  sentToday: 0,
  dailyCap: 25,
  withinBusinessHours: true,
};

/**
 * Daily Follow-ups workspace for the Chairman:
 * 1) Ready to review (1-click Send / Rewrite / Skip)
 * 2) Contacted leads (clean assignment of reachable leads by default)
 * 3) History (simple turn feed)
 */
export function FollowUpQueueSection({
  statusData,
  settingsDraft,
  savingSettings,
  creatingAgent,
  createFeedback,
  onToggleMaster,
  onCreateAgent,
  onDraftCountChange,
}: FollowUpQueueSectionProps) {
  const { authFetch } = useAuth();
  const { allBranchNames } = useBranches();
  const { openLeadChat } = useAgentCore();

  const initialReviewSnap = readAgentMemorySnapshot<FollowUpLeadsResponse>(
    AGENT_CACHE_KEYS.followupQueueReview
  );
  const initialLeadsSnap = readAgentMemorySnapshot<FollowUpLeadsResponse>(
    AGENT_CACHE_KEYS.followupQueueLeads
  );

  const [activeTab, setActiveTab] = useState<WorkspaceTab>(
    initialReviewSnap && initialReviewSnap.summary.draftReady > 0 ? "review" : "leads"
  );
  const initialTabSelectedRef = useRef(
    Boolean(initialReviewSnap || initialLeadsSnap)
  );

  const [reviewData, setReviewData] = useState<FollowUpLeadsResponse | null>(initialReviewSnap);
  const [leadsData, setLeadsData] = useState<FollowUpLeadsResponse | null>(initialLeadsSnap);
  const [loadingReview, setLoadingReview] = useState(!initialReviewSnap);
  const [loadingLeads, setLoadingLeads] = useState(!initialLeadsSnap);
  const [refreshing, setRefreshing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [leadsError, setLeadsError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<"ALL" | "WA" | "FB" | "IG">("ALL");
  const [stageFilter, setStageFilter] = useState<string>("Contacted");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [branchFilter, setBranchFilter] = useState<string>("ALL");
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [reviewPage, setReviewPage] = useState(1);
  const [page, setPage] = useState(1);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [notice, setNotice] = useState<FeedbackNotice | null>(null);
  const [editingDraftById, setEditingDraftById] = useState<Record<string, string>>({});
  const [confirmStopId, setConfirmStopId] = useState<string | null>(null);

  const reviewDataRef = useRef<FollowUpLeadsResponse | null>(initialReviewSnap);
  const leadsDataRef = useRef<FollowUpLeadsResponse | null>(initialLeadsSnap);
  const reviewReqSeqRef = useRef(0);
  const leadsReqSeqRef = useRef(0);

  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === debouncedSearch) return;
    const timer = setTimeout(() => {
      setDebouncedSearch(trimmed);
      setPage(1);
    }, 220);
    return () => clearTimeout(timer);
  }, [debouncedSearch, searchInput]);

  const executeQueueQuery = useCallback(
    async ({
      tab,
      qs,
      cacheKey,
      isDefaultQuery,
      silent = false,
      force = false,
      skipIfFresh = true,
    }: {
      tab: "review" | "leads";
      qs: string;
      cacheKey: string;
      isDefaultQuery: boolean;
      silent?: boolean;
      force?: boolean;
      skipIfFresh?: boolean;
    }) => {
      const isReview = tab === "review";
      const setTabData = isReview ? setReviewData : setLeadsData;
      const dataRef = isReview ? reviewDataRef : leadsDataRef;
      const setTabLoading = isReview ? setLoadingReview : setLoadingLeads;
      const setTabError = isReview ? setReviewError : setLeadsError;
      const seqRef = isReview ? reviewReqSeqRef : leadsReqSeqRef;
      const defaultStorageKey = isReview
        ? AGENT_CACHE_KEYS.followupQueueReview
        : AGENT_CACHE_KEYS.followupQueueLeads;

      const freshMem = force ? null : readFollowUpQueueQueryCache(cacheKey, AGENT_FRESH_WINDOW_MS);
      if (freshMem) {
        dataRef.current = freshMem;
        setTabData(freshMem);
        setTabError(null);
        setTabLoading(false);
        if (skipIfFresh) return;
      } else if (!force && isDefaultQuery && !dataRef.current) {
        const persisted = readScopedAgentCache<FollowUpLeadsResponse>(defaultStorageKey);
        if (persisted) {
          dataRef.current = persisted;
          setTabData(persisted);
          setTabError(null);
          setTabLoading(false);
        }
      }

      const seq = ++seqRef.current;
      const hasVisible = Boolean(dataRef.current);
      if (!silent && !hasVisible) {
        setTabLoading(true);
      } else if (!silent && hasVisible) {
        setRefreshing(true);
      }
      if (!hasVisible) setTabError(null);

      try {
        const requestUrl = force
          ? `/crm-api/followup-agent/leads?${qs}&refresh=1`
          : `/crm-api/followup-agent/leads?${qs}`;

        const load = async () => {
          const res = await authFetch(requestUrl, { cache: "no-store" });
          const json = await res.json().catch(() => null);
          return { ok: res.ok, json };
        };

        const result = force ? await load() : await dedupeAgentRequest(cacheKey, load);
        if (seq !== seqRef.current) return;

        if (!result.ok || !result.json?.success || !result.json.data) {
          if (!dataRef.current) {
            setTabError(result.json?.error || "Could not load leads.");
          }
          return;
        }

        const payload = result.json.data as FollowUpLeadsResponse;
        dataRef.current = payload;
        setTabData(payload);
        setTabError(null);
        writeFollowUpQueueQueryCache(cacheKey, payload);
        if (isDefaultQuery) {
          writeScopedAgentCache(defaultStorageKey, payload);
        }

        if (!initialTabSelectedRef.current) {
          initialTabSelectedRef.current = true;
          if (payload.summary.draftReady > 0) {
            setActiveTab("review");
          }
        }
      } catch {
        if (seq === seqRef.current && !dataRef.current) {
          setTabError("Network error while loading leads.");
        }
      } finally {
        if (seq === seqRef.current) {
          setTabLoading(false);
          if (!silent) setRefreshing(false);
        }
      }
    },
    [authFetch]
  );

  const buildReviewParams = useCallback(
    (targetPage = reviewPage) => {
      const params = new URLSearchParams();
      params.set("enrollmentStatus", "draft_ready");
      params.set("windowTier", "ALL");
      params.set("stage", "ALL");
      params.set("page", String(targetPage));
      params.set("limit", "25");
      const qs = params.toString();
      return { qs, cacheKey: `review:${qs}`, isDefaultQuery: targetPage === 1 };
    },
    [reviewPage]
  );

  const buildLeadsParams = useCallback(() => {
    const params = new URLSearchParams();
    params.set("channel", channelFilter);
    params.set("stage", stageFilter);
    params.set("windowTier", showUnavailable ? "ALL" : "reachable");
    params.set("enrollmentStatus", statusFilter);
    params.set("branch", branchFilter);
    if (debouncedSearch) params.set("search", debouncedSearch);
    params.set("page", String(page));
    params.set("limit", "30");
    const qs = params.toString();
    const isDefaultQuery =
      channelFilter === "ALL" &&
      stageFilter === "Contacted" &&
      !showUnavailable &&
      statusFilter === "ALL" &&
      branchFilter === "ALL" &&
      !debouncedSearch &&
      page === 1;
    return { qs, cacheKey: `leads:${qs}`, isDefaultQuery };
  }, [
    branchFilter,
    channelFilter,
    debouncedSearch,
    page,
    showUnavailable,
    stageFilter,
    statusFilter,
  ]);

  const fetchReviewQueue = useCallback(
    async ({ silent = false, force = false }: { silent?: boolean; force?: boolean } = {}) => {
      const spec = buildReviewParams();
      await executeQueueQuery({ tab: "review", ...spec, silent, force });
    },
    [buildReviewParams, executeQueueQuery]
  );

  const fetchLeadsQueue = useCallback(
    async ({ silent = false, force = false }: { silent?: boolean; force?: boolean } = {}) => {
      const spec = buildLeadsParams();
      await executeQueueQuery({ tab: "leads", ...spec, silent, force });
    },
    [buildLeadsParams, executeQueueQuery]
  );

  const fetchActiveQueues = useCallback(
    async ({ silent = false, force = false }: { silent?: boolean; force?: boolean } = {}) => {
      if (force) invalidateFollowUpQueueQueryCache();
      if (activeTab === "review") {
        await fetchReviewQueue({ silent, force });
        void fetchLeadsQueue({ silent: true, force });
        return;
      }
      if (activeTab === "leads") {
        await fetchLeadsQueue({ silent, force });
        return;
      }
    },
    [activeTab, fetchLeadsQueue, fetchReviewQueue]
  );

  // Hydrate persisted caches synchronously on mount and warm both queues in parallel without waterfall
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const persistedReview = !reviewDataRef.current
        ? readScopedAgentCache<FollowUpLeadsResponse>(AGENT_CACHE_KEYS.followupQueueReview)
        : null;
      const persistedLeads = !leadsDataRef.current
        ? readScopedAgentCache<FollowUpLeadsResponse>(AGENT_CACHE_KEYS.followupQueueLeads)
        : null;

      if (persistedReview) {
        reviewDataRef.current = persistedReview;
        setReviewData(persistedReview);
        setLoadingReview(false);
        if (!initialTabSelectedRef.current && persistedReview.summary.draftReady > 0) {
          initialTabSelectedRef.current = true;
          setActiveTab("review");
        }
      }
      if (persistedLeads) {
        leadsDataRef.current = persistedLeads;
        setLeadsData(persistedLeads);
        setLoadingLeads(false);
        if (!initialTabSelectedRef.current) {
          initialTabSelectedRef.current = true;
          if (persistedLeads.summary.draftReady > 0) {
            setActiveTab("review");
          }
        }
      }

      void fetchReviewQueue({ silent: Boolean(reviewDataRef.current) });
      void fetchLeadsQueue({ silent: Boolean(leadsDataRef.current) });
    });
    return () => {
      cancelled = true;
    };
    // Initial mount warm-up only; filter/page changes are handled by tab effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-query Review queue when its page changes or tab becomes active
  useEffect(() => {
    if (activeTab !== "review") return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void fetchReviewQueue({ silent: Boolean(reviewDataRef.current) });
    });
    return () => {
      cancelled = true;
    };
  }, [activeTab, fetchReviewQueue]);

  // Re-query Leads queue when filters/page change or tab becomes active
  useEffect(() => {
    if (activeTab !== "leads") return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void fetchLeadsQueue({ silent: Boolean(leadsDataRef.current) });
    });
    return () => {
      cancelled = true;
    };
  }, [activeTab, fetchLeadsQueue]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleUpdated = () => {
      invalidateFollowUpQueueQueryCache();
      void fetchReviewQueue({ silent: true, force: true });
      void fetchLeadsQueue({ silent: true, force: true });
    };
    window.addEventListener("crm:followup-updated", handleUpdated);
    return () => {
      window.removeEventListener("crm:followup-updated", handleUpdated);
    };
  }, [fetchLeadsQueue, fetchReviewQueue]);

  const activeData = activeTab === "review" ? reviewData : leadsData;
  const loading = activeTab === "review" ? loadingReview && !reviewData : loadingLeads && !leadsData;
  const loadError = activeTab === "review" ? reviewError : leadsError;

  const items = useMemo(() => activeData?.items ?? [], [activeData]);
  const pagination = activeData?.pagination ?? {
    page: activeTab === "review" ? reviewPage : page,
    limit: activeTab === "review" ? 25 : 30,
    totalFiltered: 0,
    totalPages: 1,
  };
  const summary = useMemo(() => {
    const preferred =
      activeTab === "review"
        ? reviewData?.summary ?? leadsData?.summary
        : leadsData?.summary ?? reviewData?.summary;
    const base = preferred ?? EMPTY_SUMMARY;
    const draftReady =
      (activeTab === "review"
        ? reviewData?.summary.draftReady
        : leadsData?.summary.draftReady) ??
      reviewData?.summary.draftReady ??
      leadsData?.summary.draftReady ??
      base.draftReady;
    const leadsSummary = leadsData?.summary;
    if (leadsSummary && activeTab === "review" && base.total === 0) {
      return {
        ...base,
        draftReady,
        total: leadsSummary.total,
        waReady: leadsSummary.waReady,
        meta24h: leadsSummary.meta24h,
        meta7d: leadsSummary.meta7d,
        metaExpired: leadsSummary.metaExpired,
      };
    }
    return { ...base, draftReady };
  }, [activeTab, leadsData, reviewData]);

  useEffect(() => {
    onDraftCountChange?.(summary.draftReady);
  }, [onDraftCountChange, summary.draftReady]);

  const branchOptions = useMemo(() => {
    const set = new Set<string>(allBranchNames);
    for (const row of items) {
      if (row.branch && row.branch.trim()) set.add(row.branch.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allBranchNames, items]);

  const selectablePageIds = useMemo(
    () => items.filter((r) => r.eligible).map((r) => r.senderId),
    [items]
  );

  const allPageSelected =
    selectablePageIds.length > 0 && selectablePageIds.every((id) => selectedIds.has(id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllOnPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const id of selectablePageIds) next.delete(id);
      } else {
        for (const id of selectablePageIds) next.add(id);
      }
      return next;
    });
  };

  const enrollIds = async (ids: string[], generateDraft: boolean, singleName?: string) => {
    if (bulkBusy || busyId || ids.length === 0) return;
    if (singleName) setBusyId(ids[0]);
    else setBulkBusy(true);
    setNotice(null);

    try {
      const res = await authFetch("/crm-api/followup-agent/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderIds: ids, generateDraft }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setNotice({ ok: false, msg: json?.error || "Could not assign leads." });
        return;
      }
      const enrolledCount = json.data?.enrolled?.length ?? 0;
      const skippedCount = json.data?.skipped?.length ?? 0;
      setSelectedIds(new Set());
      if (singleName) {
        setNotice({
          ok: enrolledCount > 0,
          msg:
            enrolledCount > 0
              ? `Assigned ${singleName} to Follow-up Adham.`
              : `${singleName} could not be assigned right now.`,
        });
      } else {
        setNotice({
          ok: true,
          msg: `Assigned ${enrolledCount} lead${enrolledCount === 1 ? "" : "s"}${
            generateDraft ? " and wrote drafts" : ""
          }${skippedCount > 0 ? ` (${skippedCount} unavailable)` : ""}.`,
        });
      }
      await fetchActiveQueues({ silent: true, force: true });
    } catch {
      setNotice({ ok: false, msg: "Network error while assigning leads." });
    } finally {
      setBulkBusy(false);
      setBusyId(null);
    }
  };

  const handleGenerateDraft = async (row: FollowUpLeadRow) => {
    if (busyId) return;
    setBusyId(row.senderId);
    setNotice(null);
    try {
      const res = await authFetch(
        `/crm-api/followup-agent/leads/${encodeURIComponent(row.senderId)}/draft`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ forceRegenerate: true }),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setNotice({ ok: false, msg: json?.error || "Could not prepare a draft for this lead." });
        return;
      }
      if (json.data?.draftText) {
        setEditingDraftById((prev) => ({ ...prev, [row.senderId]: json.data.draftText }));
        setNotice({
          ok: true,
          msg: `Draft ready for ${row.name}.`,
        });
      } else {
        setNotice({
          ok: true,
          msg: `Adham reviewed ${row.name} and decided no follow-up is needed.`,
        });
      }
      await fetchActiveQueues({ silent: true, force: true });
    } catch {
      setNotice({ ok: false, msg: "Network error while writing draft." });
    } finally {
      setBusyId(null);
    }
  };

  const handleSendDraft = async (row: FollowUpLeadRow) => {
    if (busyId) return;
    const text = (editingDraftById[row.senderId] ?? row.enrollment?.draftText ?? "").trim();
    if (!text) return;

    setBusyId(row.senderId);
    setNotice(null);
    try {
      const res = await authFetch(
        `/crm-api/followup-agent/leads/${encodeURIComponent(row.senderId)}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setNotice({ ok: false, msg: json?.error || "Could not send message." });
        return;
      }
      setEditingDraftById((prev) => {
        const next = { ...prev };
        delete next[row.senderId];
        return next;
      });
      setNotice({ ok: true, msg: `Message sent to ${row.name}.` });
      await fetchActiveQueues({ silent: true, force: true });
    } catch {
      setNotice({ ok: false, msg: "Network error while sending message." });
    } finally {
      setBusyId(null);
    }
  };

  const handleEnrollmentAction = async (
    row: FollowUpLeadRow,
    action: "pause" | "resume" | "stop" | "discard_draft"
  ) => {
    if (busyId) return;
    setBusyId(row.senderId);
    setNotice(null);
    try {
      const res = await authFetch(
        `/crm-api/followup-agent/leads/${encodeURIComponent(row.senderId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setNotice({ ok: false, msg: json?.error || "Could not update lead." });
        return;
      }
      setConfirmStopId(null);
      if (action === "discard_draft") {
        setNotice({ ok: true, msg: `Skipped draft for ${row.name}.` });
      }
      await fetchActiveQueues({ silent: true, force: true });
    } catch {
      setNotice({ ok: false, msg: "Network error while updating lead." });
    } finally {
      setBusyId(null);
    }
  };

  const { connection } = statusData;
  const isActivated = connection.hasApiKey && connection.hasAgentId;

  return (
    <div className="space-y-4">
      {/* Calm Status Header */}
      <section
        className="rounded-xl p-4 sm:p-5 space-y-3"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-main)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2
                id="followup-master-label"
                className="text-[14px] font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                Follow-up Adham
              </h2>
              <ClaudeStatusPill
                label={!isActivated ? "Not activated" : settingsDraft.enabled ? "Active" : "Paused"}
                tone={!isActivated ? "amber" : settingsDraft.enabled ? "green" : "slate"}
              />
            </div>
            <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
              {settingsDraft.sendMode === "approval"
                ? "Review before sending"
                : "Sending automatically"}{" "}
              · {summary.sentToday} of {summary.dailyCap} sent today · Working hours{" "}
              {formatRiyadhHourLabel(settingsDraft.businessHoursStart)} –{" "}
              {formatRiyadhHourLabel(settingsDraft.businessHoursEnd)}
            </p>
          </div>

          <ClaudeSettingSwitch
            checked={settingsDraft.enabled}
            disabled={savingSettings || !isActivated}
            labelledBy="followup-master-label"
            onToggle={() => void onToggleMaster()}
          />
        </div>

        {!connection.hasAgentId && connection.hasApiKey && (
          <div
            className="rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--border-main)",
            }}
          >
            <p className="text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
              Activate Follow-up Adham once so you can assign leads and prepare replies.
            </p>
            <button
              type="button"
              disabled={creatingAgent}
              onClick={() => void onCreateAgent()}
              className="min-h-[44px] sm:min-h-[38px] px-4 rounded-lg text-[12px] font-semibold text-white shrink-0 cursor-pointer disabled:opacity-50"
              style={{ background: "var(--bg-banner)" }}
            >
              {creatingAgent ? "Activating..." : "Activate Follow-up Adham"}
            </button>
          </div>
        )}

        {createFeedback && (
          <div
            className="rounded-lg p-3 flex items-start gap-2 text-[12px]"
            style={{
              background: createFeedback.ok ? "var(--label-green-bg)" : "var(--label-red-bg)",
              border: `1px solid ${createFeedback.ok ? "var(--label-green-border)" : "var(--label-red-border)"}`,
              color: createFeedback.ok ? "var(--label-green-text)" : "var(--label-red-text)",
            }}
          >
            {createFeedback.ok ? (
              <Check className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span>{createFeedback.msg}</span>
          </div>
        )}
      </section>

      {/* Main Workspace Card with 3 Clean Sub-Tabs */}
      <section
        className="rounded-xl overflow-hidden"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-main)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        {/* Tab Switcher Header */}
        <div
          className="px-4 py-3 flex flex-wrap items-center justify-between gap-3"
          style={{ borderBottom: "1px solid var(--border-main)" }}
        >
          <div
            role="tablist"
            aria-label="Follow-up views"
            className="inline-flex items-center p-1 rounded-lg flex-wrap gap-1"
            style={{ background: "var(--bg-pill)", border: "1px solid var(--border-input)" }}
          >
            {(
              [
                { id: "review", label: "Ready to review", count: summary.draftReady },
                { id: "leads", label: "Leads", count: summary.waReady + summary.meta24h + summary.meta7d },
                { id: "history", label: "History", count: null },
              ] as const
            ).map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  onClick={() => {
                    setActiveTab(tab.id);
                    if (tab.id === "review") setReviewPage(1);
                    if (tab.id === "leads") setPage(1);
                    setSelectedIds(new Set());
                    setNotice(null);
                  }}
                  className={`inline-flex items-center gap-1.5 min-h-[38px] sm:min-h-[32px] px-3 rounded-md text-[12px] font-semibold cursor-pointer transition-colors ${
                    active ? "text-white" : "hover:bg-[var(--bg-hover)]"
                  }`}
                  style={
                    active
                      ? { background: "var(--bg-banner)" }
                      : { color: "var(--text-secondary)" }
                  }
                >
                  <span>{tab.label}</span>
                  {tab.count !== null && tab.count > 0 && (
                    <span
                      className="px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums"
                      style={
                        active
                          ? { background: "var(--bg-card)", color: "var(--text-primary)" }
                          : { background: "var(--bg-card)", color: "var(--text-secondary)" }
                      }
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {activeTab !== "history" && (
            <button
              type="button"
              onClick={() => void fetchActiveQueues({ force: true })}
              disabled={loading || refreshing}
              className="inline-flex items-center gap-1.5 min-h-[40px] sm:min-h-[34px] px-3 rounded-lg text-[12px] font-medium cursor-pointer hover:bg-[var(--bg-hover)] disabled:opacity-50"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-input)",
                color: "var(--text-primary)",
              }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading || refreshing ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          )}
        </div>

        {/* Notice Banner */}
        {notice && activeTab !== "history" && (
          <div
            className="mx-4 mt-3 rounded-lg p-3 flex items-center justify-between gap-2 text-[12px]"
            style={{
              background: notice.ok ? "var(--label-green-bg)" : "var(--label-red-bg)",
              border: `1px solid ${notice.ok ? "var(--label-green-border)" : "var(--label-red-border)"}`,
              color: notice.ok ? "var(--label-green-text)" : "var(--label-red-text)",
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              {notice.ok ? (
                <Check className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span className="min-w-0 break-words">{notice.msg}</span>
            </div>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Dismiss notice"
              className="p-1 rounded cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* TAB 3: HISTORY */}
        {activeTab === "history" && (
          <div className="p-4">
            <ClaudeActivityPanel
              embedded
              simpleMode
              onOpenLeadChat={openLeadChat}
              apiBasePath="/crm-api/followup-agent"
              cacheKeyPrefix="followup"
              sseEventName="crm:followup-activity-updated"
              filterOptions={HISTORY_FILTER_OPTIONS}
              emptySubtitle="Follow-ups Adham prepares or sends will appear here."
            />
          </div>
        )}

        {/* TAB 1: READY TO REVIEW */}
        {activeTab === "review" && (
          <div className="p-4 space-y-3">
            {loading ? (
              <div className="space-y-3" aria-busy="true">
                {[1, 2].map((k) => (
                  <div
                    key={k}
                    className="rounded-xl p-4 animate-pulse space-y-2.5"
                    style={{ background: "var(--bg-panel)", border: "1px solid var(--border-main)" }}
                  >
                    <div className="h-4 w-44 rounded" style={{ background: "var(--bg-column)" }} />
                    <div className="h-16 w-full rounded" style={{ background: "var(--bg-column)" }} />
                  </div>
                ))}
              </div>
            ) : loadError ? (
              <div className="py-6 text-center space-y-3">
                <p className="text-[13px]" style={{ color: "var(--label-red-text)" }}>
                  {loadError}
                </p>
                <button
                  type="button"
                  onClick={() => void fetchActiveQueues({ force: true })}
                  className="min-h-[40px] px-4 rounded-lg text-[12px] font-semibold text-white cursor-pointer"
                  style={{ background: "var(--bg-banner)" }}
                >
                  Retry
                </button>
              </div>
            ) : items.length === 0 ? (
              <div className="py-10 text-center space-y-3">
                <p className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  No messages waiting for review
                </p>
                <p className="text-[12.5px] max-w-md mx-auto" style={{ color: "var(--text-secondary)" }}>
                  Select leads in Leads and click Write draft or Assign to prepare follow-ups here.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab("leads")}
                  className="min-h-[42px] sm:min-h-[38px] px-4 rounded-lg text-[12px] font-semibold text-white cursor-pointer"
                  style={{ background: "var(--bg-banner)" }}
                >
                  Browse leads
                </button>
              </div>
            ) : (
              items.map((row) => {
                const isBusy = busyId === row.senderId;
                const draftText =
                  editingDraftById[row.senderId] ?? row.enrollment?.draftText ?? "";
                const touchNum =
                  row.enrollment?.draftAttemptNumber || (row.enrollment?.attemptCount || 0) + 1;

                return (
                  <article
                    key={row.senderId}
                    className="rounded-xl p-4 space-y-3"
                    style={{
                      background: "var(--bg-panel)",
                      border: "1px solid var(--border-main)",
                    }}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span
                          className="text-[14px] font-semibold truncate"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {row.name}
                        </span>
                        <ClaudeStatusPill label={formatChannelName(row.channel)} tone="slate" />
                        {row.pipeline && row.pipeline !== "Contacted" && (
                          <span
                            className="text-[11px] font-medium px-2 py-0.5 rounded-md"
                            style={{
                              background: "var(--bg-card)",
                              border: "1px solid var(--border-main)",
                              color: "var(--text-secondary)",
                            }}
                          >
                            {row.pipeline}
                          </span>
                        )}
                        {row.branch && (
                          <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                            {row.branch}
                          </span>
                        )}
                        <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                          Follow-up {touchNum} of {settingsDraft.maxAttempts}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => openLeadChat(row.senderId)}
                        className="inline-flex items-center gap-1 min-h-[38px] sm:min-h-[32px] px-2.5 rounded-md text-[11.5px] font-medium cursor-pointer hover:bg-[var(--bg-hover)] self-start sm:self-auto"
                        style={{
                          background: "var(--bg-card)",
                          border: "1px solid var(--border-input)",
                          color: "var(--text-primary)",
                        }}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Open chat</span>
                      </button>
                    </div>

                    {row.lastMessageText && (
                      <div
                        className="rounded-lg px-3 py-2 text-[12px]"
                        style={{
                          background: "var(--bg-card)",
                          border: "1px solid var(--border-main)",
                        }}
                      >
                        <span className="font-medium" style={{ color: "var(--text-muted)" }}>
                          Last message ({row.lastMessageDirection === "outgoing" ? "Team" : "Lead"}):{" "}
                        </span>
                        <span dir="auto" style={{ color: "var(--text-secondary)" }}>
                          {row.lastMessageText}
                        </span>
                      </div>
                    )}

                    <div>
                      <label
                        htmlFor={`draft-box-${row.senderId}`}
                        className="block text-[11px] font-medium mb-1"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Adham&apos;s reply (you can edit before sending)
                      </label>
                      <textarea
                        id={`draft-box-${row.senderId}`}
                        rows={3}
                        dir="auto"
                        value={draftText}
                        onChange={(e) =>
                          setEditingDraftById((prev) => ({
                            ...prev,
                            [row.senderId]: e.target.value,
                          }))
                        }
                        className="w-full p-3 text-[16px] sm:text-[13px] leading-relaxed rounded-lg outline-none"
                        style={{
                          background: "var(--bg-card)",
                          border: "1px solid var(--border-input)",
                          color: "var(--text-primary)",
                        }}
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleGenerateDraft(row)}
                          className="inline-flex items-center gap-1.5 min-h-[40px] sm:min-h-[34px] px-3 rounded-lg text-[12px] font-medium cursor-pointer disabled:opacity-50"
                          style={{
                            background: "var(--bg-card)",
                            border: "1px solid var(--border-input)",
                            color: "var(--text-primary)",
                          }}
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? "animate-spin" : ""}`} />
                          <span>Rewrite</span>
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleEnrollmentAction(row, "discard_draft")}
                          className="min-h-[40px] sm:min-h-[34px] px-3 rounded-lg text-[12px] font-medium cursor-pointer disabled:opacity-50"
                          style={{
                            background: "var(--bg-card)",
                            border: "1px solid var(--border-input)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          Skip
                        </button>
                      </div>

                      <button
                        type="button"
                        disabled={isBusy || !draftText.trim()}
                        onClick={() => void handleSendDraft(row)}
                        className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-[36px] px-4 rounded-lg text-[12.5px] font-semibold text-white cursor-pointer disabled:opacity-50"
                        style={{ background: "var(--bg-banner)" }}
                      >
                        {isBusy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        <span>{isBusy ? "Sending..." : "Send"}</span>
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        )}

        {/* TAB 2: CONTACTED LEADS (ASSIGNMENT) */}
        {activeTab === "leads" && (
          <div>
            {/* Clean Two-Row Filter Bar (keeps Search generous on desktop & tablet) */}
            <div className="p-4 space-y-2.5" style={{ borderBottom: "1px solid var(--border-main)" }}>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1 min-w-0">
                  <Search
                    className="w-3.5 h-3.5 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: "var(--text-muted)" }}
                  />
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search by name, phone, or branch..."
                    className="w-full min-h-[42px] sm:min-h-[36px] ps-8 pe-8 text-[16px] sm:text-[12.5px] rounded-lg outline-none"
                    style={{
                      background: "var(--bg-input)",
                      border: "1px solid var(--border-input)",
                      color: "var(--text-primary)",
                    }}
                  />
                  {searchInput && (
                    <button
                      type="button"
                      onClick={() => setSearchInput("")}
                      aria-label="Clear search"
                      className="absolute end-2 top-1/2 -translate-y-1/2 p-1 rounded cursor-pointer"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  aria-pressed={showUnavailable}
                  onClick={() => {
                    setShowUnavailable((v) => !v);
                    setPage(1);
                  }}
                  className="min-h-[42px] sm:min-h-[36px] px-3 rounded-lg text-[11.5px] font-medium cursor-pointer shrink-0 whitespace-nowrap"
                  style={
                    showUnavailable
                      ? {
                          background: "var(--bg-selected)",
                          border: "1px solid var(--label-blue-border)",
                          color: "var(--label-blue-text)",
                        }
                      : {
                          background: "var(--bg-input)",
                          border: "1px solid var(--border-input)",
                          color: "var(--text-secondary)",
                        }
                  }
                >
                  {showUnavailable ? "Hiding unavailable: Off" : `Show unavailable (${summary.metaExpired})`}
                </button>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                <select
                  aria-label="Filter by pipeline stage"
                  value={stageFilter}
                  onChange={(e) => {
                    setStageFilter(e.target.value);
                    setSelectedIds(new Set());
                    setPage(1);
                  }}
                  className="w-full min-h-[42px] sm:min-h-[36px] px-2.5 text-[16px] sm:text-[12px] rounded-lg outline-none"
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-input)",
                    color: "var(--text-primary)",
                  }}
                >
                  {FOLLOWUP_STAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Filter by channel"
                  value={channelFilter}
                  onChange={(e) => {
                    setChannelFilter(e.target.value as "ALL" | "WA" | "FB" | "IG");
                    setPage(1);
                  }}
                  className="w-full min-h-[42px] sm:min-h-[36px] px-2.5 text-[16px] sm:text-[12px] rounded-lg outline-none"
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-input)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="ALL">All channels</option>
                  <option value="WA">WhatsApp</option>
                  <option value="FB">Messenger</option>
                  <option value="IG">Instagram</option>
                </select>

                <select
                  aria-label="Filter by branch"
                  value={branchFilter}
                  onChange={(e) => {
                    setBranchFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full min-h-[42px] sm:min-h-[36px] px-2.5 text-[16px] sm:text-[12px] rounded-lg outline-none"
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-input)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="ALL">All branches</option>
                  <option value="__none__">No branch yet</option>
                  {branchOptions.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Filter by follow-up status"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full min-h-[42px] sm:min-h-[36px] px-2.5 text-[16px] sm:text-[12px] rounded-lg outline-none"
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-input)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="ALL">All statuses</option>
                  <option value="not_enrolled">Not assigned</option>
                  <option value="assigned">Assigned</option>
                  <option value="waiting_reply">Waiting reply</option>
                  <option value="replied">Replied</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              {selectedIds.size > 0 && (
                <div
                  className="rounded-lg px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2"
                  style={{
                    background: "var(--bg-selected)",
                    border: "1px solid var(--label-blue-border)",
                  }}
                >
                  <span className="text-[12.5px] font-semibold" style={{ color: "var(--text-primary)" }}>
                    {selectedIds.size} lead{selectedIds.size === 1 ? "" : "s"} selected
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={bulkBusy}
                      onClick={() => void enrollIds(Array.from(selectedIds), false)}
                      className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-md text-[12px] font-semibold text-white cursor-pointer disabled:opacity-50"
                      style={{ background: "var(--bg-banner)" }}
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Assign selected</span>
                    </button>
                    <button
                      type="button"
                      disabled={bulkBusy || !isActivated}
                      onClick={() => void enrollIds(Array.from(selectedIds), true)}
                      className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-md text-[12px] font-semibold cursor-pointer disabled:opacity-50"
                      style={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border-input)",
                        color: "var(--text-primary)",
                      }}
                    >
                      <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--bg-banner)" }} />
                      <span>Assign &amp; write drafts</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedIds(new Set())}
                      className="min-h-[36px] px-2.5 text-[12px] font-medium cursor-pointer"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Select All Strip */}
            <div
              className="px-4 py-2 flex items-center justify-between gap-2 text-[11.5px] font-medium"
              style={{
                background: "var(--bg-panel)",
                borderBottom: "1px solid var(--border-main)",
                color: "var(--text-secondary)",
              }}
            >
              <div>
                {selectablePageIds.length > 0 && (
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleSelectAllOnPage}
                      className="w-4 h-4 rounded"
                    />
                    <span>Select all on page</span>
                  </label>
                )}
              </div>
              <span>
                {pagination.totalFiltered} {stageFilter === "ALL" ? "" : `${stageFilter} `}
                lead{pagination.totalFiltered === 1 ? "" : "s"}
              </span>
            </div>

            {/* Lead Rows */}
            {loading ? (
              <div className="p-4 space-y-3" aria-busy="true">
                {[1, 2, 3].map((k) => (
                  <div
                    key={k}
                    className="rounded-lg p-4 animate-pulse space-y-2"
                    style={{ background: "var(--bg-panel)", border: "1px solid var(--border-main)" }}
                  >
                    <div className="h-4 w-48 rounded" style={{ background: "var(--bg-column)" }} />
                    <div className="h-3 w-full max-w-md rounded" style={{ background: "var(--bg-column)" }} />
                  </div>
                ))}
              </div>
            ) : loadError ? (
              <div className="p-6 text-center space-y-3">
                <p className="text-[13px]" style={{ color: "var(--label-red-text)" }}>
                  {loadError}
                </p>
                <button
                  type="button"
                  onClick={() => void fetchActiveQueues({ force: true })}
                  className="min-h-[40px] px-4 rounded-lg text-[12px] font-semibold text-white cursor-pointer"
                  style={{ background: "var(--bg-banner)" }}
                >
                  Retry
                </button>
              </div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <p className="text-[13.5px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  No {stageFilter === "ALL" ? "" : `${stageFilter} `}leads match your filters
                </p>
                <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  Try clearing your search or changing the channel or branch filter.
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {items.map((row) => {
                  const winMeta = getChannelWindowMeta(row.window);
                  const enrMeta = getEnrollmentStatusMeta(row.enrollment);
                  const isBusy = busyId === row.senderId;
                  const isSelected = selectedIds.has(row.senderId);
                  const isEnrolled = Boolean(row.enrollment);
                  const hasDraft =
                    row.enrollment?.status === "draft_ready" && Boolean(row.enrollment.draftText);
                  const isPaused = row.enrollment?.status === "paused";
                  const isActiveQueue =
                    row.enrollment &&
                    ["scheduled", "draft_ready", "waiting_reply"].includes(row.enrollment.status);

                  // Keep each row calm: at most 1 status pill (plus channel name)
                  const singlePill = isEnrolled
                    ? { label: enrMeta.label, tone: enrMeta.tone }
                    : row.window.tier === "meta_7d" || !row.window.approvalSendable
                    ? { label: winMeta.label, tone: winMeta.tone }
                    : null;

                  const friendlyIssue = row.enrollment?.lastError
                    ? row.enrollment.lastError
                    : !row.eligible && !isEnrolled && row.eligibilityReason
                    ? formatFollowUpReason(row.eligibilityReason)
                    : row.enrollment?.stopReason
                    ? formatFollowUpReason(row.enrollment.stopReason)
                    : "";

                  return (
                    <article
                      key={row.senderId}
                      className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                    >
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.name}`}
                          disabled={!row.eligible}
                          checked={isSelected}
                          onChange={() => toggleSelect(row.senderId)}
                          className="w-4 h-4 mt-1 shrink-0 rounded disabled:opacity-35"
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className="text-[13.5px] font-semibold truncate"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {row.name}
                            </span>
                              <span
                                className="text-[11px] font-medium px-2 py-0.5 rounded-md"
                                style={{
                                  background: "var(--bg-pill)",
                                  color: "var(--text-secondary)",
                                }}
                              >
                                {formatChannelName(row.channel)}
                              </span>
                              {stageFilter !== "Contacted" && row.pipeline && (
                                <span
                                  className="text-[11px] font-medium px-2 py-0.5 rounded-md"
                                  style={{
                                    background: "var(--bg-pill)",
                                    color: "var(--text-secondary)",
                                  }}
                                >
                                  {row.pipeline}
                                </span>
                              )}
                            {singlePill && (
                              <ClaudeStatusPill label={singlePill.label} tone={singlePill.tone} />
                            )}
                          </div>

                          <div
                            className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px]"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {row.branch && <span>{row.branch}</span>}
                            <span>Officer: {row.agent || "Unassigned"}</span>
                            {row.enrollment && (
                              <span>
                                {row.enrollment.attemptCount} of {settingsDraft.maxAttempts} sent
                              </span>
                            )}
                            {row.lastMessageAt && (
                              <span>Last chat {formatLastMessageTime(row.lastMessageAt)}</span>
                            )}
                          </div>

                          {row.lastMessageText && (
                            <p
                              dir="auto"
                              className="text-[12px] truncate"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {row.lastMessageDirection === "outgoing" ? "Team: " : "Lead: "}
                              {row.lastMessageText}
                            </p>
                          )}

                          {friendlyIssue && (
                            <p
                              className="text-[11.5px]"
                              style={{
                                color: row.enrollment?.lastError
                                  ? "var(--label-red-text)"
                                  : "var(--text-secondary)",
                              }}
                            >
                              {friendlyIssue}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Clean Row Actions */}
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {!isEnrolled && row.eligible && (
                          <button
                            type="button"
                            disabled={isBusy || bulkBusy}
                            onClick={() => void enrollIds([row.senderId], false, row.name)}
                            className="inline-flex items-center gap-1 min-h-[40px] sm:min-h-[32px] px-3 rounded-md text-[11.5px] font-semibold text-white cursor-pointer disabled:opacity-45"
                            style={{ background: "var(--bg-banner)" }}
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            <span>Assign</span>
                          </button>
                        )}

                        {hasDraft ? (
                          <button
                            type="button"
                            onClick={() => setActiveTab("review")}
                            className="inline-flex items-center gap-1 min-h-[40px] sm:min-h-[32px] px-3 rounded-md text-[11.5px] font-semibold text-white cursor-pointer"
                            style={{ background: "var(--bg-banner)" }}
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>Review &amp; send</span>
                          </button>
                        ) : (
                          row.eligible && (
                            <button
                              type="button"
                              disabled={isBusy || !isActivated}
                              onClick={() => void handleGenerateDraft(row)}
                              className="inline-flex items-center gap-1 min-h-[40px] sm:min-h-[32px] px-2.5 rounded-md text-[11.5px] font-medium cursor-pointer hover:bg-[var(--bg-hover)] disabled:opacity-45"
                              style={{
                                background: "var(--bg-input)",
                                border: "1px solid var(--border-input)",
                                color: "var(--text-primary)",
                              }}
                            >
                              {isBusy ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Edit3 className="w-3.5 h-3.5" />
                              )}
                              <span>Write draft</span>
                            </button>
                          )
                        )}

                        {isPaused && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleEnrollmentAction(row, "resume")}
                            className="inline-flex items-center gap-1 min-h-[40px] sm:min-h-[32px] px-2.5 rounded-md text-[11.5px] font-medium cursor-pointer"
                            style={{
                              background: "var(--bg-input)",
                              border: "1px solid var(--border-input)",
                              color: "var(--text-primary)",
                            }}
                          >
                            <Play className="w-3 h-3" />
                            <span>Resume</span>
                          </button>
                        )}

                        {isActiveQueue && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleEnrollmentAction(row, "pause")}
                            className="inline-flex items-center gap-1 min-h-[40px] sm:min-h-[32px] px-2.5 rounded-md text-[11.5px] font-medium cursor-pointer"
                            style={{
                              background: "var(--bg-input)",
                              border: "1px solid var(--border-input)",
                              color: "var(--text-primary)",
                            }}
                          >
                            <Pause className="w-3 h-3" />
                            <span>Pause</span>
                          </button>
                        )}

                        {row.enrollment && row.enrollment.status !== "stopped" && (
                          confirmStopId === row.senderId ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleEnrollmentAction(row, "stop")}
                                className="min-h-[32px] px-2.5 rounded-md text-[11px] font-semibold cursor-pointer"
                                style={{
                                  background: "var(--label-red-bg)",
                                  border: "1px solid var(--label-red-border)",
                                  color: "var(--label-red-text)",
                                }}
                              >
                                Stop {row.name}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmStopId(null)}
                                className="min-h-[32px] px-2 text-[11px] cursor-pointer"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setConfirmStopId(row.senderId)}
                              className="min-h-[40px] sm:min-h-[32px] px-2.5 rounded-md text-[11.5px] font-medium cursor-pointer"
                              style={{
                                background: "var(--bg-input)",
                                border: "1px solid var(--border-input)",
                                color: "var(--label-red-text)",
                              }}
                            >
                              Stop
                            </button>
                          )
                        )}

                        <button
                          type="button"
                          onClick={() => openLeadChat(row.senderId)}
                          className="inline-flex items-center gap-1 min-h-[40px] sm:min-h-[32px] px-2.5 rounded-md text-[11.5px] font-medium cursor-pointer hover:bg-[var(--bg-hover)]"
                          style={{
                            background: "var(--bg-input)",
                            border: "1px solid var(--border-input)",
                            color: "var(--text-primary)",
                          }}
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>Open chat</span>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {pagination.totalPages > 1 && (
              <div
                className="px-4 py-3 flex items-center justify-between gap-2"
                style={{ background: "var(--bg-panel)", borderTop: "1px solid var(--border-main)" }}
              >
                <button
                  type="button"
                  disabled={pagination.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 min-h-[38px] px-3 rounded-lg text-[12px] font-medium cursor-pointer disabled:opacity-40"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-input)",
                    color: "var(--text-primary)",
                  }}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </button>
                <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  type="button"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  className="inline-flex items-center gap-1 min-h-[38px] px-3 rounded-lg text-[12px] font-medium cursor-pointer disabled:opacity-40"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-input)",
                    color: "var(--text-primary)",
                  }}
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
