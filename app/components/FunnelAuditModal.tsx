"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  Award,
  Banknote,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Info,
  MessageSquare,
  RotateCcw,
  Search,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { useCRM } from "../context/CRMContext";
import { ConversationChatView } from "./ConversationChatView";
import { ConversationDetailsSidebar } from "./ConversationDetailsSidebar";
import {
  AuditConversationInput,
  buildFunnelAuditReport,
  clampRatePct,
  formatAuditOutcome,
  FunnelAuditExcludedReason,
  FunnelAuditExcludedRow,
  FunnelAuditLeadRow,
  FunnelAuditMetric,
  FunnelAuditTarget,
} from "../utils/teamMetrics";
import {
  FunnelAuditModalSnapshot,
  getAuditTargetKey,
  LeadSourceTargetInput,
  resolveLeadSourceRoute,
} from "../utils/teamAuditNav";

interface FunnelAuditModalProps {
  target: FunnelAuditTarget;
  conversations: ReadonlyArray<AuditConversationInput>;
  selectedAgent: string;
  filterMode: "all" | "day" | "week" | "range";
  periodStartMs: number;
  periodEndMs: number;
  periodDescription: string;
  getStageColor: (stage?: string) => string;
  getStageBadgeStyle: (stage?: string) => React.CSSProperties;
  onChangeTarget: (nextTarget: FunnelAuditTarget) => void;
  onClose: () => void;
  onOpenAssignedLeadsTab?: () => void;
  initialSnapshot?: FunnelAuditModalSnapshot | null;
  onSyncDraft?: (snapshot: FunnelAuditModalSnapshot) => void;
  onNavigateToSource?: (
    href: string,
    latestModalSnapshot: FunnelAuditModalSnapshot
  ) => void;
}

type SortOption =
  | "default"
  | "newest"
  | "oldest"
  | "name"
  | "name_desc"
  | "cash_desc"
  | "cash_asc";

type AuditViewMode = "included" | "excluded";

const AUDIT_BATCH_SIZE = 50;

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const FALLBACK_BAR_COLORS = [
  "bg-blue-500",
  "bg-teal-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-indigo-500",
] as const;

function formatAuditDate(ts?: number | null): string {
  if (!ts || !Number.isFinite(ts) || ts <= 0) return "—";
  return SHORT_DATE_FORMATTER.format(ts);
}

function formatAuditDateTime(ts?: number | null): string {
  if (!ts || !Number.isFinite(ts) || ts <= 0) return "—";
  return DATE_TIME_FORMATTER.format(ts);
}

function getReasonBarColor(reasonKey: string, idx: number): string {
  switch (reasonKey) {
    case "stage_booked":
    case "booked":
      return "bg-blue-500";
    case "stage_attended":
    case "outcome_attended":
    case "attended":
    case "progressed_attended":
      return "bg-teal-500";
    case "stage_enrolled":
    case "outcome_registered":
    case "cash_recorded":
    case "progressed_enrolled":
    case "paid_enrolled":
    case "enrolled":
      return "bg-emerald-500";
    case "audition_date_other":
    case "enrolled_rollup":
    case "unpaid_enrolled":
    case "new_unread":
    case "unread":
      return "bg-amber-500";
    case "not_booked":
      return "bg-slate-400";
    default:
      return FALLBACK_BAR_COLORS[idx % FALLBACK_BAR_COLORS.length];
  }
}

function getReasonPillClass(reasonKey: string): string {
  switch (reasonKey) {
    case "stage_booked":
    case "booked":
      return "text-blue-500 bg-blue-500/10 border-blue-500/25";
    case "stage_attended":
    case "outcome_attended":
    case "attended":
    case "progressed_attended":
      return "text-teal-500 bg-teal-500/10 border-teal-500/25";
    case "stage_enrolled":
    case "outcome_registered":
    case "cash_recorded":
    case "progressed_enrolled":
    case "paid_enrolled":
    case "enrolled":
      return "text-emerald-500 bg-emerald-500/10 border-emerald-500/25";
    case "audition_date_other":
    case "enrolled_rollup":
    case "unpaid_enrolled":
    case "new_unread":
    case "unread":
      return "text-amber-500 bg-amber-500/10 border-amber-500/25";
    default:
      return "text-[var(--text-secondary)] bg-[var(--bg-pill)] border-[var(--border-input)]";
  }
}

function getExcludedReasonBadge(reason: FunnelAuditExcludedReason): string {
  switch (reason) {
    case "unassigned":
      return "Unassigned lead";
    case "outside_period_created":
      return "Created before period";
    case "reassigned_actor":
      return "Reassigned owner";
    default:
      return "Excluded";
  }
}

function getActorAttributionNote(
  row: FunnelAuditLeadRow,
  metric: FunnelAuditMetric
): string | null {
  const ownerLower = row.assignedAgent.toLowerCase();
  if (metric === "booked" && row.bookedBy && row.bookedBy.toLowerCase() !== ownerLower) {
    return `Booked by ${row.bookedBy}`;
  }
  if (metric === "attended" && row.attendedBy && row.attendedBy.toLowerCase() !== ownerLower) {
    return `Attended marked by ${row.attendedBy}`;
  }
  if (
    (metric === "enrolled" || metric === "cash") &&
    row.enrolledBy &&
    row.enrolledBy.toLowerCase() !== ownerLower
  ) {
    return `Enrolled by ${row.enrolledBy}`;
  }
  return null;
}

function getMilestoneTimestamp(
  row: FunnelAuditLeadRow,
  metric: FunnelAuditMetric
): { label: string; ts: number | null } {
  if (metric === "booked") return { label: "Booked", ts: row.bookedTs };
  if (metric === "attended") return { label: "Attended", ts: row.attendedTs };
  if (metric === "enrolled" || metric === "cash") {
    return { label: "Converted", ts: row.convertedTs };
  }
  return { label: "Created", ts: row.createdTs };
}

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : '""';
  }
  const normalized = value.replace(/\r?\n/g, " ").trim();
  // Guard formula prefixes against spreadsheet formula execution when exporting names/notes
  const guarded = /^[=+\-@\t\r]/.test(normalized) ? `'${normalized}` : normalized;
  return `"${guarded.replace(/"/g, '""')}"`;
}

function buildCsvAndDownload(
  filename: string,
  headers: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>
): void {
  const lines = [headers.map((h) => escapeCsvCell(h)).join(",")];
  for (let i = 0; i < rows.length; i++) {
    lines.push(rows[i].map((cell) => escapeCsvCell(cell)).join(","));
  }
  // UTF-8 BOM preserves Arabic names cleanly when opened in Excel
  const blob = new Blob([`\uFEFF${lines.join("\n")}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Full-screen Two-Pane Audit Workspace for verifying Conversion Funnel figures in Team Activities.
 * Combines a sticky visual reconciliation sidebar (equation bar, reason breakdown, agent share)
 * with a sticky-header data table, Counted vs. Excluded view tabs, and CSV export.
 */
export function FunnelAuditModal({
  target,
  conversations,
  selectedAgent,
  filterMode,
  periodStartMs,
  periodEndMs,
  periodDescription,
  getStageColor,
  getStageBadgeStyle,
  onChangeTarget,
  onClose,
  onOpenAssignedLeadsTab,
  initialSnapshot,
  onSyncDraft,
  onNavigateToSource,
}: FunnelAuditModalProps) {
  const router = useRouter();
  const { conversations: crmConversations } = useCRM();

  const currentTargetKey = getAuditTargetKey(target);
  const matchingInitialSnap =
    initialSnapshot && initialSnapshot.targetKey === currentTargetKey
      ? initialSnapshot
      : null;

  const [viewMode, setViewMode] = useState<AuditViewMode>(
    () => matchingInitialSnap?.viewMode ?? "included"
  );
  const [reasonFilter, setReasonFilter] = useState<string>(
    () => matchingInitialSnap?.reasonFilter ?? "all"
  );
  const [agentFilter, setAgentFilter] = useState<string>(
    () => matchingInitialSnap?.agentFilter ?? "all"
  );
  const [excludedReasonFilter, setExcludedReasonFilter] = useState<
    "all" | FunnelAuditExcludedReason
  >(() => matchingInitialSnap?.excludedReasonFilter ?? "all");
  const [searchQuery, setSearchQuery] = useState<string>(
    () => matchingInitialSnap?.searchQuery ?? ""
  );
  const [sortBy, setSortBy] = useState<SortOption>(
    () => matchingInitialSnap?.sortBy ?? "default"
  );
  const [visibleCount, setVisibleCount] = useState<number>(
    () => matchingInitialSnap?.visibleCount ?? AUDIT_BATCH_SIZE
  );
  const [showFormula, setShowFormula] = useState<boolean>(
    () => matchingInitialSnap?.showFormula ?? false
  );
  const [mobileBreakdownOpen, setMobileBreakdownOpen] = useState<boolean>(
    () => matchingInitialSnap?.mobileBreakdownOpen ?? false
  );

  // In-screen chat drawer state (matches Pipeline slide-over pattern)
  const [drawerChatId, setDrawerChatId] = useState<string | null>(
    () => matchingInitialSnap?.drawerChatId ?? null
  );
  const [showChatDetails, setShowChatDetails] = useState<boolean>(
    () => matchingInitialSnap?.showChatDetails ?? false
  );
  const [isDrawerClosing, setIsDrawerClosing] = useState<boolean>(false);
  const drawerPanelRef = useRef<HTMLDivElement | null>(null);
  const drawerCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mobileOuterScrollRef = useRef<HTMLDivElement | null>(null);
  const sidebarScrollRef = useRef<HTMLElement | null>(null);
  const workspaceScrollRef = useRef<HTMLDivElement | null>(null);
  const initialScrollRef = useRef<{
    targetKey: string;
    workspaceScrollTop: number;
    sidebarScrollTop: number;
    mobileOuterScrollTop: number;
  } | null>(
    matchingInitialSnap
      ? {
          targetKey: matchingInitialSnap.targetKey,
          workspaceScrollTop: matchingInitialSnap.workspaceScrollTop,
          sidebarScrollTop: matchingInitialSnap.sidebarScrollTop,
          mobileOuterScrollTop: matchingInitialSnap.mobileOuterScrollTop,
        }
      : null
  );
  const didRestoreScrollRef = useRef<boolean>(false);

  useEffect(() => {
    router.prefetch("/pipeline");
    router.prefetch("/auditions");
  }, [router]);

  useLayoutEffect(() => {
    if (didRestoreScrollRef.current) return;
    const saved = initialScrollRef.current;
    if (!saved || saved.targetKey !== currentTargetKey) return;
    didRestoreScrollRef.current = true;
    if (saved.workspaceScrollTop > 0 && workspaceScrollRef.current) {
      workspaceScrollRef.current.scrollTop = saved.workspaceScrollTop;
    }
    if (saved.sidebarScrollTop > 0 && sidebarScrollRef.current) {
      sidebarScrollRef.current.scrollTop = saved.sidebarScrollTop;
    }
    if (saved.mobileOuterScrollTop > 0 && mobileOuterScrollRef.current) {
      mobileOuterScrollRef.current.scrollTop = saved.mobileOuterScrollTop;
    }
  }, [currentTargetKey]);

  const buildModalSnapshot = useCallback(
    (): FunnelAuditModalSnapshot => ({
      targetKey: currentTargetKey,
      viewMode,
      reasonFilter,
      agentFilter,
      excludedReasonFilter,
      searchQuery,
      sortBy,
      visibleCount,
      showFormula,
      mobileBreakdownOpen,
      drawerChatId,
      showChatDetails,
      workspaceScrollTop: workspaceScrollRef.current?.scrollTop ?? 0,
      sidebarScrollTop: sidebarScrollRef.current?.scrollTop ?? 0,
      mobileOuterScrollTop: mobileOuterScrollRef.current?.scrollTop ?? 0,
    }),
    [
      currentTargetKey,
      viewMode,
      reasonFilter,
      agentFilter,
      excludedReasonFilter,
      searchQuery,
      sortBy,
      visibleCount,
      showFormula,
      mobileBreakdownOpen,
      drawerChatId,
      showChatDetails,
    ]
  );

  useEffect(() => {
    onSyncDraft?.(buildModalSnapshot());
  }, [onSyncDraft, buildModalSnapshot]);

  const handleNavigateLeadSource = useCallback(
    (
      lead: Omit<LeadSourceTargetInput, "metric" | "from">,
      preferredTarget: "auto" | "pipeline" | "auditions" = "auto"
    ) => {
      const route = resolveLeadSourceRoute({
        ...lead,
        metric: target.metric,
        preferredTarget,
        from: "team-performance",
      });
      const latest = buildModalSnapshot();
      if (onNavigateToSource) {
        onNavigateToSource(route.href, latest);
      } else {
        router.push(route.href);
      }
    },
    [target.metric, buildModalSnapshot, onNavigateToSource, router]
  );

  const activeDrawerConv = useMemo(
    () => (drawerChatId ? crmConversations.find((c) => c.id === drawerChatId) ?? null : null),
    [crmConversations, drawerChatId]
  );

  const report = useMemo(
    () =>
      buildFunnelAuditReport(conversations, {
        target,
        selectedAgent,
        filterMode,
        periodStartMs,
        periodEndMs,
        periodDescription,
      }),
    [conversations, target, selectedAgent, filterMode, periodStartMs, periodEndMs, periodDescription]
  );

  const effectiveViewMode: AuditViewMode =
    viewMode === "excluded" && report.excludedRows.length === 0 ? "included" : viewMode;

  const handleOpenChatDrawer = useCallback((conversationId: string) => {
    if (drawerCloseTimerRef.current) {
      clearTimeout(drawerCloseTimerRef.current);
      drawerCloseTimerRef.current = null;
    }
    setDrawerChatId(conversationId);
    setShowChatDetails(false);
    setIsDrawerClosing(false);
  }, []);

  const handleCloseChatDrawer = useCallback(() => {
    if (!drawerChatId || isDrawerClosing) return;
    setIsDrawerClosing(true);
    setShowChatDetails(false);
    if (drawerCloseTimerRef.current) clearTimeout(drawerCloseTimerRef.current);
    drawerCloseTimerRef.current = setTimeout(() => {
      setDrawerChatId(null);
      setIsDrawerClosing(false);
      setShowChatDetails(false);
    }, 240);
  }, [drawerChatId, isDrawerClosing]);

  const handleDrawerAnimationEnd = useCallback(
    (e: React.AnimationEvent<HTMLDivElement>) => {
      if (e.target === drawerPanelRef.current && isDrawerClosing) {
        if (drawerCloseTimerRef.current) {
          clearTimeout(drawerCloseTimerRef.current);
          drawerCloseTimerRef.current = null;
        }
        setDrawerChatId(null);
        setIsDrawerClosing(false);
        setShowChatDetails(false);
      }
    },
    [isDrawerClosing]
  );

  useEffect(() => {
    return () => {
      if (drawerCloseTimerRef.current) clearTimeout(drawerCloseTimerRef.current);
    };
  }, []);

  // Close Details sidebar -> Chat drawer -> Full Audit view on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showChatDetails) {
          setShowChatDetails(false);
        } else if (drawerChatId) {
          handleCloseChatDrawer();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showChatDetails, drawerChatId, handleCloseChatDrawer, onClose]);

  const resetLocalFilters = () => {
    setViewMode("included");
    setReasonFilter("all");
    setAgentFilter("all");
    setExcludedReasonFilter("all");
    setSearchQuery("");
    setSortBy("default");
    setVisibleCount(AUDIT_BATCH_SIZE);
    setDrawerChatId(null);
    setShowChatDetails(false);
    setIsDrawerClosing(false);
  };

  const handleSwitchCoreMetric = (
    metric: "leads" | "booked" | "attended" | "enrolled" | "cash"
  ) => {
    resetLocalFilters();
    onChangeTarget({ metric, agentName: target.agentName });
  };

  const handleResetToAllAgents = () => {
    resetLocalFilters();
    onChangeTarget({ ...target, agentName: "__all__" });
  };

  const handleSelectReasonFilter = (key: string) => {
    setViewMode("included");
    setReasonFilter(key);
    setVisibleCount(AUDIT_BATCH_SIZE);
  };

  const handleSelectAgentFilter = (agent: string) => {
    setViewMode("included");
    setAgentFilter(agent);
    setVisibleCount(AUDIT_BATCH_SIZE);
  };

  const handleSwitchViewMode = (mode: AuditViewMode) => {
    setViewMode(mode);
    setVisibleCount(AUDIT_BATCH_SIZE);
  };

  const handleToggleColumnSort = (asc: SortOption, desc: SortOption) => {
    setSortBy((prev) => {
      if (prev === asc) return desc;
      if (prev === desc) return "default";
      return asc;
    });
  };

  const activeReasonBucket = useMemo(
    () => report.reasonBuckets.find((b) => b.key === reasonFilter) || null,
    [report.reasonBuckets, reasonFilter]
  );

  const excludedCountsByReason = useMemo(() => {
    let unassigned = 0;
    let outsidePeriod = 0;
    let reassigned = 0;
    for (let i = 0; i < report.excludedRows.length; i++) {
      const r = report.excludedRows[i].excludedReason;
      if (r === "unassigned") unassigned += 1;
      else if (r === "outside_period_created") outsidePeriod += 1;
      else if (r === "reassigned_actor") reassigned += 1;
    }
    return { unassigned, outsidePeriod, reassigned };
  }, [report.excludedRows]);

  const filteredIncludedRows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const agentLower = agentFilter === "all" ? null : agentFilter.toLowerCase();

    const matched = report.rows.filter((row) => {
      if (reasonFilter !== "all" && row.reasonKey !== reasonFilter) return false;
      if (agentLower && row.assignedAgent.toLowerCase() !== agentLower) return false;
      if (!q) return true;
      return (
        row.leadName.toLowerCase().includes(q) ||
        row.leadPhone.toLowerCase().includes(q) ||
        row.branch.toLowerCase().includes(q) ||
        row.pipeline.toLowerCase().includes(q) ||
        row.assignedAgent.toLowerCase().includes(q) ||
        row.reasonLabel.toLowerCase().includes(q) ||
        row.reasonDetail.toLowerCase().includes(q) ||
        row.auditionDate.toLowerCase().includes(q)
      );
    });

    if (sortBy === "default") return matched;

    const sorted = [...matched];
    sorted.sort((a, b) => {
      if (sortBy === "newest") return b.createdTs - a.createdTs;
      if (sortBy === "oldest") return a.createdTs - b.createdTs;
      if (sortBy === "name") return a.leadName.localeCompare(b.leadName);
      if (sortBy === "name_desc") return b.leadName.localeCompare(a.leadName);
      if (sortBy === "cash_desc") {
        if (b.cashIn !== a.cashIn) return b.cashIn - a.cashIn;
        return b.createdTs - a.createdTs;
      }
      if (sortBy === "cash_asc") {
        if (a.cashIn !== b.cashIn) return a.cashIn - b.cashIn;
        return b.createdTs - a.createdTs;
      }
      return 0;
    });
    return sorted;
  }, [report.rows, reasonFilter, agentFilter, searchQuery, sortBy]);

  const filteredExcludedRows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const matched = report.excludedRows.filter((row) => {
      if (excludedReasonFilter !== "all" && row.excludedReason !== excludedReasonFilter) {
        return false;
      }
      if (!q) return true;
      return (
        row.leadName.toLowerCase().includes(q) ||
        row.leadPhone.toLowerCase().includes(q) ||
        row.assignedAgent.toLowerCase().includes(q) ||
        row.actorName.toLowerCase().includes(q) ||
        row.pipeline.toLowerCase().includes(q) ||
        row.excludedDetail.toLowerCase().includes(q) ||
        row.auditionDate.toLowerCase().includes(q)
      );
    });

    if (sortBy === "default") return matched;

    const sorted = [...matched];
    sorted.sort((a, b) => {
      if (sortBy === "newest") return (b.milestoneTs || b.createdTs) - (a.milestoneTs || a.createdTs);
      if (sortBy === "oldest") return (a.milestoneTs || a.createdTs) - (b.milestoneTs || b.createdTs);
      if (sortBy === "name") return a.leadName.localeCompare(b.leadName);
      if (sortBy === "name_desc") return b.leadName.localeCompare(a.leadName);
      if (sortBy === "cash_desc") return b.cashIn - a.cashIn;
      if (sortBy === "cash_asc") return a.cashIn - b.cashIn;
      return 0;
    });
    return sorted;
  }, [report.excludedRows, excludedReasonFilter, searchQuery, sortBy]);

  const filteredCashSubtotal = useMemo(
    () => filteredIncludedRows.reduce((sum, r) => sum + r.cashIn, 0),
    [filteredIncludedRows]
  );

  const displayedIncludedRows = useMemo(
    () => filteredIncludedRows.slice(0, visibleCount),
    [filteredIncludedRows, visibleCount]
  );

  const displayedExcludedRows = useMemo(
    () => filteredExcludedRows.slice(0, visibleCount),
    [filteredExcludedRows, visibleCount]
  );

  const activeTotalCount =
    effectiveViewMode === "included" ? filteredIncludedRows.length : filteredExcludedRows.length;
  const activeShownCount =
    effectiveViewMode === "included"
      ? displayedIncludedRows.length
      : displayedExcludedRows.length;
  const hasMoreRows = visibleCount < activeTotalCount;

  const coreTabs: ReadonlyArray<{
    id: "leads" | "booked" | "attended" | "enrolled" | "cash";
    label: string;
    value: string;
    icon: React.ReactNode;
  }> = [
    {
      id: "leads",
      label: "Leads",
      value: report.cohortLeadsCount.toLocaleString("en-US"),
      icon: <Users className="w-3.5 h-3.5" />,
    },
    {
      id: "booked",
      label: "Booked",
      value: report.cohortBookedCount.toLocaleString("en-US"),
      icon: <Calendar className="w-3.5 h-3.5" />,
    },
    {
      id: "attended",
      label: "Attended",
      value: report.cohortAttendedCount.toLocaleString("en-US"),
      icon: <UserCheck className="w-3.5 h-3.5" />,
    },
    {
      id: "enrolled",
      label: "Enrolled",
      value: report.cohortEnrolledCount.toLocaleString("en-US"),
      icon: <Award className="w-3.5 h-3.5" />,
    },
    {
      id: "cash",
      label: "Revenue",
      value: `${report.cohortCashTotal.toLocaleString("en-US")} EGP`,
      icon: <Banknote className="w-3.5 h-3.5" />,
    },
  ];

  const isCoreMetric =
    target.metric === "leads" ||
    target.metric === "booked" ||
    target.metric === "attended" ||
    target.metric === "enrolled" ||
    target.metric === "cash";

  const nonCorePillLabel =
    target.metric === "stage"
      ? `Stage: ${target.stage}`
      : target.metric === "channel"
        ? `Channel: ${target.channel}`
        : target.metric === "awaiting_reply"
          ? "Awaiting Reply"
          : null;

  const hasActiveSubFilters =
    effectiveViewMode === "included"
      ? reasonFilter !== "all" || agentFilter !== "all" || searchQuery.trim().length > 0
      : excludedReasonFilter !== "all" || searchQuery.trim().length > 0;

  const cohortSharePct = Math.round(
    clampRatePct(report.totalCount, report.cohortLeadsCount)
  );

  const canSwitchToAllAgents =
    !report.isAllAgentsScope &&
    Boolean(target.agentName) &&
    target.agentName !== "__all__";

  const handleExportCsv = () => {
    const scopeSlug = report.scopeLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const suffix = effectiveViewMode === "excluded" ? "excluded" : "counted";
    const filename = `funnel-audit-${target.metric}-${suffix}-${scopeSlug || "team"}.csv`;

    if (effectiveViewMode === "excluded") {
      buildCsvAndDownload(
        filename,
        [
          "#",
          "Lead Name",
          "Phone",
          "Assigned Owner",
          "Action Actor",
          "Pipeline Stage",
          "Audition Date",
          "Exclusion Category",
          "Why Excluded",
          "Created Date",
          "Milestone Date",
          "Cash (EGP)",
        ],
        filteredExcludedRows.map((row, idx) => [
          idx + 1,
          row.leadName,
          row.leadPhone,
          row.assignedAgent,
          row.actorName,
          row.pipeline,
          row.auditionDate,
          getExcludedReasonBadge(row.excludedReason),
          row.excludedDetail,
          formatAuditDateTime(row.createdTs),
          formatAuditDateTime(row.milestoneTs),
          row.cashIn,
        ])
      );
      return;
    }

    buildCsvAndDownload(
      filename,
      [
        "#",
        "Lead Name",
        "Phone",
        "Channel",
        "Branch",
        "Assigned Owner",
        "Actor Note",
        "Pipeline Stage",
        "Audition Date",
        "Audition Outcome",
        "Why Counted",
        "Reason Detail",
        "Created Date",
        "Created Field",
        "Milestone Date",
        "Cash (EGP)",
      ],
      filteredIncludedRows.map((row, idx) => {
        const milestone = getMilestoneTimestamp(row, target.metric);
        return [
          idx + 1,
          row.leadName,
          row.leadPhone,
          row.channelLabel,
          row.branch,
          row.assignedAgent,
          getActorAttributionNote(row, target.metric) || "",
          row.pipeline,
          row.auditionDate,
          formatAuditOutcome(row.auditionOutcome),
          row.reasonLabel,
          row.reasonDetail,
          formatAuditDateTime(row.createdTs),
          row.createdSource,
          milestone.ts ? formatAuditDateTime(milestone.ts) : "",
          row.cashIn,
        ];
      })
    );
  };

  const renderSortIcon = (asc: SortOption, desc: SortOption) => {
    if (sortBy === asc) return <ArrowUp className="w-3 h-3 text-blue-500" />;
    if (sortBy === desc) return <ArrowDown className="w-3 h-3 text-blue-500" />;
    return <ArrowUpDown className="w-3 h-3 opacity-45" />;
  };

  const renderSidebarContent = () => (
    <>
      {/* 1. Hero Reconciliation & Segmented Bar */}
      <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-main)] shadow-xs space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              {target.metric === "cash" ? "Verified Revenue" : "Verified Count"}
            </span>
            <div className="text-2xl font-bold tracking-tight text-[var(--text-primary)] tabular-nums mt-0.5">
              {target.metric === "cash"
                ? `${report.totalCash.toLocaleString("en-US")} EGP`
                : report.totalCount.toLocaleString("en-US")}
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              {target.metric === "cash"
                ? `${report.paidCount} paid lead${report.paidCount === 1 ? "" : "s"}${
                    report.unpaidEnrolledCount > 0
                      ? ` · ${report.unpaidEnrolledCount} enrolled (0 EGP)`
                      : ""
                  }`
                : target.metric === "leads"
                  ? `100% of ${report.scopeLabel} cohort`
                  : `${report.totalCount} of ${report.cohortLeadsCount} cohort leads (${cohortSharePct}%)`}
            </p>
          </div>
          {canSwitchToAllAgents && (
            <button
              type="button"
              onClick={handleResetToAllAgents}
              className="min-h-[32px] px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 bg-[var(--bg-pill)] border border-[var(--border-input)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer shrink-0"
              title="Zoom out from this agent to Team Total"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Team Total</span>
            </button>
          )}
        </div>

        {/* Visual Stacked Reconciliation Bar */}
        {report.reasonBuckets.length > 0 && report.totalCount > 0 && (
          <div className="space-y-2 pt-1">
            <div
              className="h-2.5 w-full rounded-full overflow-hidden flex gap-0.5 bg-[var(--bg-pill)]"
              role="group"
              aria-label="Reason composition bar"
            >
              {report.reasonBuckets.map((bucket, idx) => {
                const widthPct = (bucket.count / report.totalCount) * 100;
                const dimmed = reasonFilter !== "all" && reasonFilter !== bucket.key;
                return (
                  <button
                    key={bucket.key}
                    type="button"
                    onClick={() =>
                      handleSelectReasonFilter(
                        reasonFilter === bucket.key ? "all" : bucket.key
                      )
                    }
                    title={`${bucket.label}: ${bucket.count} (${Math.round(widthPct)}%)`}
                    className={`h-full transition-opacity cursor-pointer ${getReasonBarColor(
                      bucket.key,
                      idx
                    )} ${dimmed ? "opacity-30" : "opacity-100 hover:opacity-85"}`}
                    style={{ width: `${Math.max(widthPct, 2)}%` }}
                    aria-label={`Filter by ${bucket.label} (${bucket.count})`}
                  />
                );
              })}
            </div>

            {report.reasonBuckets.length > 1 && (
              <div className="text-xs font-mono text-[var(--text-secondary)] flex items-center gap-1 flex-wrap tabular-nums">
                {report.reasonBuckets.map((bucket, idx) => (
                  <React.Fragment key={bucket.key}>
                    {idx > 0 && <span className="text-[var(--text-muted)]">+</span>}
                    <span
                      className={
                        reasonFilter === bucket.key
                          ? "font-bold text-[var(--text-primary)] underline"
                          : ""
                      }
                    >
                      {bucket.count}
                    </span>
                  </React.Fragment>
                ))}
                <span className="text-[var(--text-muted)]">=</span>
                <strong className="text-[var(--text-primary)]">{report.totalCount}</strong>
              </div>
            )}
          </div>
        )}

        {/* Collapsible Technical Rule & Formula */}
        <div className="pt-2 border-t border-[var(--border-main)]">
          <button
            type="button"
            onClick={() => setShowFormula((prev) => !prev)}
            aria-expanded={showFormula}
            className="w-full min-h-[32px] flex items-center justify-between gap-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <span className="inline-flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-blue-500" />
              <span>Calculation rule &amp; formula</span>
            </span>
            {showFormula ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
          {showFormula && (
            <div className="mt-2 p-2.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-main)] space-y-1.5">
              <p className="text-xs text-[var(--text-primary)] leading-relaxed">
                {report.ruleSummary}
              </p>
              <p className="text-xs font-mono text-[var(--text-secondary)] break-words">
                {report.formulaText}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 2. Why Counted — Interactive Breakdown Bars */}
      {report.reasonBuckets.length > 0 && (
        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-main)] shadow-xs space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Why Included
            </h3>
            {reasonFilter !== "all" && (
              <button
                type="button"
                onClick={() => handleSelectReasonFilter("all")}
                className="text-xs font-semibold text-blue-500 hover:underline cursor-pointer"
              >
                Show all
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            {report.reasonBuckets.map((bucket, idx) => {
              const active =
                effectiveViewMode === "included" && reasonFilter === bucket.key;
              const pct = Math.round(clampRatePct(bucket.count, report.totalCount));
              return (
                <button
                  key={bucket.key}
                  type="button"
                  onClick={() => handleSelectReasonFilter(active ? "all" : bucket.key)}
                  className={`w-full text-left p-2.5 rounded-lg border transition-colors cursor-pointer space-y-1.5 ${
                    active
                      ? "bg-[var(--bg-selected)] border-[var(--border-input)]"
                      : "bg-[var(--bg-panel)] border-[var(--border-main)] hover:bg-[var(--bg-hover)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[var(--text-primary)] truncate min-w-0">
                      {bucket.label}
                    </span>
                    <span className="text-xs font-bold tabular-nums text-[var(--text-primary)] shrink-0">
                      {bucket.count.toLocaleString("en-US")}
                      <span className="ml-1 font-normal text-[var(--text-muted)]">
                        ({pct}%)
                      </span>
                    </span>
                  </div>

                  <div className="h-1.5 w-full rounded-full overflow-hidden bg-[var(--bg-pill)]">
                    <div
                      className={`h-full rounded-full ${getReasonBarColor(bucket.key, idx)}`}
                      style={{ width: `${Math.max(pct, bucket.count > 0 ? 4 : 0)}%` }}
                    />
                  </div>

                  {target.metric === "cash" && bucket.cashTotal > 0 && (
                    <div className="text-xs font-mono text-emerald-500 tabular-nums">
                      {bucket.cashTotal.toLocaleString("en-US")} EGP
                    </div>
                  )}

                  {active && (
                    <p className="text-xs text-[var(--text-secondary)] leading-snug pt-0.5">
                      {bucket.description}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. By Assigned Agent — Ranked Split Bars */}
      {report.isAllAgentsScope && report.agentBreakdown.length > 1 && (
        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-main)] shadow-xs space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              By Assigned Agent ({report.agentBreakdown.length})
            </h3>
            {agentFilter !== "all" && (
              <button
                type="button"
                onClick={() => handleSelectAgentFilter("all")}
                className="text-xs font-semibold text-blue-500 hover:underline cursor-pointer"
              >
                All staff
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            {report.agentBreakdown.map((ag) => {
              const active =
                effectiveViewMode === "included" &&
                agentFilter.toLowerCase() === ag.agent.toLowerCase();
              const denominator =
                target.metric === "cash" && report.totalCash > 0
                  ? report.totalCash
                  : report.totalCount;
              const numerator =
                target.metric === "cash" && report.totalCash > 0 ? ag.cashTotal : ag.count;
              const sharePct = Math.round(clampRatePct(numerator, denominator));

              return (
                <button
                  key={ag.agent}
                  type="button"
                  onClick={() => handleSelectAgentFilter(active ? "all" : ag.agent)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg border transition-colors cursor-pointer space-y-1 ${
                    active
                      ? "bg-[var(--bg-selected)] border-[var(--border-input)]"
                      : "bg-[var(--bg-panel)] border-[var(--border-main)] hover:bg-[var(--bg-hover)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-[var(--text-primary)] truncate">
                      {ag.agent}
                    </span>
                    <span className="font-bold tabular-nums text-[var(--text-primary)] shrink-0">
                      {target.metric === "cash" && ag.cashTotal > 0
                        ? `${ag.cashTotal.toLocaleString("en-US")} EGP (${ag.count})`
                        : `${ag.count} (${sharePct}%)`}
                    </span>
                  </div>
                  <div className="h-1 w-full rounded-full overflow-hidden bg-[var(--bg-pill)]">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${Math.max(sharePct, numerator > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="funnel-audit-modal-title"
      className="fixed inset-0 z-50 flex flex-col w-full h-[100dvh] overflow-hidden bg-[var(--bg-page)] text-[var(--text-primary)] pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]"
    >
      {/* Full-Screen Header */}
      <div className="px-4 sm:px-6 py-3 sm:py-3.5 shrink-0 border-b border-[var(--border-main)] bg-[var(--bg-card)]">
        <div className="w-full max-w-[1680px] mx-auto flex items-start sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
            <button
              type="button"
              onClick={onClose}
              aria-label="Back to conversion funnel"
              className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-0 sm:px-3 flex items-center justify-center gap-1.5 rounded-lg bg-[var(--bg-pill)] border border-[var(--border-input)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back</span>
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2
                  id="funnel-audit-modal-title"
                  className="text-base sm:text-lg font-bold tracking-tight text-[var(--text-primary)]"
                >
                  {report.title}
                </h2>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[var(--bg-pill)] border border-[var(--border-input)] text-[var(--text-secondary)]">
                  {report.scopeLabel}
                </span>
                {canSwitchToAllAgents && (
                  <button
                    type="button"
                    onClick={handleResetToAllAgents}
                    className="text-xs font-semibold text-blue-500 hover:underline cursor-pointer"
                  >
                    Switch to Team Total
                  </button>
                )}
              </div>
              <p className="text-xs mt-0.5 text-[var(--text-secondary)]">
                Period: <strong className="text-[var(--text-primary)]">{periodDescription}</strong> · Cohort anchored on lead creation date
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={activeTotalCount === 0}
              className="min-h-[44px] sm:min-h-[36px] px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 bg-[var(--bg-pill)] border border-[var(--border-input)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title={`Export ${activeTotalCount} visible rows as CSV`}
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>

            {target.metric === "leads" && onOpenAssignedLeadsTab && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAssignedLeadsTab();
                }}
                className="hidden md:inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg text-xs font-semibold bg-[var(--bg-pill)] border border-[var(--border-input)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
              >
                <span>Open Assigned Leads tab</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Close audit view"
              className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center rounded-lg bg-[var(--bg-pill)] border border-[var(--border-input)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Core Funnel Switcher Strip */}
      <div className="px-4 sm:px-6 py-2 shrink-0 border-b border-[var(--border-main)] bg-[var(--bg-panel)] overflow-x-auto no-scrollbar">
        <div className="w-full max-w-[1680px] mx-auto flex items-center gap-1.5 min-w-max">
          {coreTabs.map((tab) => {
            const active = target.metric === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSwitchCoreMetric(tab.id)}
                className={`min-h-[38px] sm:min-h-[32px] px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  active
                    ? "bg-[var(--text-primary)] text-[var(--bg-card)] shadow-xs"
                    : "bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border-input)] hover:text-[var(--text-primary)]"
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                <span
                  className={`font-bold tabular-nums px-1.5 py-0.5 rounded text-xs ${
                    active
                      ? "bg-[var(--bg-card)] text-[var(--text-primary)]"
                      : "bg-[var(--bg-pill)] text-[var(--text-primary)]"
                  }`}
                >
                  {tab.value}
                </span>
              </button>
            );
          })}

          {!isCoreMetric && nonCorePillLabel && (
            <span className="min-h-[38px] sm:min-h-[32px] px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 bg-[var(--text-primary)] text-[var(--bg-card)] shadow-xs">
              <span>{nonCorePillLabel}</span>
              <span className="font-bold tabular-nums px-1.5 py-0.5 rounded text-xs bg-[var(--bg-card)] text-[var(--text-primary)]">
                {report.totalCount.toLocaleString("en-US")}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Main Two-Pane Audit Workspace */}
      <div
        ref={mobileOuterScrollRef}
        className="flex-1 min-h-0 w-full max-w-[1680px] mx-auto flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden"
      >
        {/* Desktop Sticky Left Reconciliation Rail (lg+) */}
        <aside
          ref={sidebarScrollRef}
          className="hidden lg:block lg:w-[340px] xl:w-[380px] shrink-0 lg:overflow-y-auto border-r border-[var(--border-main)] bg-[var(--bg-panel)] p-5 space-y-4"
        >
          {renderSidebarContent()}
        </aside>

        {/* Mobile / Tablet Compact Reconciliation Accordion (< lg) */}
        <div className="lg:hidden px-4 pt-3 pb-2 space-y-2.5 border-b border-[var(--border-main)] bg-[var(--bg-panel)] shrink-0">
          {/* Always-visible Equation Summary Bar on Mobile */}
          <div className="p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-main)] space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-sm font-bold text-[var(--text-primary)] tabular-nums">
                  {target.metric === "cash"
                    ? `${report.totalCash.toLocaleString("en-US")} EGP`
                    : `${report.totalCount.toLocaleString("en-US")} verified`}
                </span>
                <span className="ml-2 text-xs text-[var(--text-secondary)]">
                  {target.metric === "leads"
                    ? "total cohort"
                    : target.metric === "cash"
                      ? `${report.paidCount} paid`
                      : `of ${report.cohortLeadsCount} leads (${cohortSharePct}%)`}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setMobileBreakdownOpen((prev) => !prev)}
                aria-expanded={mobileBreakdownOpen}
                className="min-h-[36px] px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 bg-[var(--bg-pill)] border border-[var(--border-input)] text-[var(--text-primary)] cursor-pointer shrink-0"
              >
                <span>{mobileBreakdownOpen ? "Hide Why" : "Why & Filters"}</span>
                {mobileBreakdownOpen ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {report.reasonBuckets.length > 0 && report.totalCount > 0 && (
              <div className="h-2 w-full rounded-full overflow-hidden flex gap-0.5 bg-[var(--bg-pill)]">
                {report.reasonBuckets.map((bucket, idx) => (
                  <div
                    key={bucket.key}
                    className={`h-full ${getReasonBarColor(bucket.key, idx)}`}
                    style={{
                      width: `${Math.max((bucket.count / report.totalCount) * 100, 2)}%`,
                    }}
                  />
                ))}
              </div>
            )}

            {/* Single-line Horizontal Quick Reason Chips on Mobile */}
            {!mobileBreakdownOpen && report.reasonBuckets.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
                <button
                  type="button"
                  onClick={() => handleSelectReasonFilter("all")}
                  className={`min-h-[34px] px-2.5 rounded-lg text-xs font-semibold border whitespace-nowrap cursor-pointer ${
                    reasonFilter === "all" && effectiveViewMode === "included"
                      ? "bg-[var(--text-primary)] text-[var(--bg-card)] border-transparent"
                      : "bg-[var(--bg-panel)] text-[var(--text-secondary)] border-[var(--border-input)]"
                  }`}
                >
                  All ({report.totalCount})
                </button>
                {report.reasonBuckets.map((bucket) => {
                  const active =
                    effectiveViewMode === "included" && reasonFilter === bucket.key;
                  return (
                    <button
                      key={bucket.key}
                      type="button"
                      onClick={() => handleSelectReasonFilter(active ? "all" : bucket.key)}
                      className={`min-h-[34px] px-2.5 rounded-lg text-xs font-semibold border whitespace-nowrap cursor-pointer ${
                        active
                          ? "bg-[var(--text-primary)] text-[var(--bg-card)] border-transparent"
                          : "bg-[var(--bg-panel)] text-[var(--text-primary)] border-[var(--border-input)]"
                      }`}
                    >
                      {bucket.label} ({bucket.count})
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {mobileBreakdownOpen && <div className="space-y-3 pb-1">{renderSidebarContent()}</div>}
        </div>

        {/* Right Dedicated Data Workspace */}
        <section className="flex-1 min-w-0 flex flex-col lg:min-h-0 lg:overflow-hidden">
          {/* Pinned Workspace Controls: Counted vs. Excluded Tabs + Search + Sort */}
          <div className="px-4 sm:px-6 py-3 border-b border-[var(--border-main)] bg-[var(--bg-card)] shrink-0 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              {/* Counted vs. Excluded View Tabs */}
              <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-main)] self-start">
                <button
                  type="button"
                  onClick={() => handleSwitchViewMode("included")}
                  className={`min-h-[36px] sm:min-h-[30px] px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                    effectiveViewMode === "included"
                      ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-xs border border-[var(--border-main)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <span>Counted</span>
                  <span className="font-bold tabular-nums">
                    {report.totalCount.toLocaleString("en-US")}
                  </span>
                </button>

                {report.excludedRows.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleSwitchViewMode("excluded")}
                    className={`min-h-[36px] sm:min-h-[30px] px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                      effectiveViewMode === "excluded"
                        ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-xs border border-[var(--border-main)]"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                    <span>Excluded / Cross-Check</span>
                    <span className="font-bold tabular-nums text-amber-500">
                      {report.excludedRows.length.toLocaleString("en-US")}
                    </span>
                  </button>
                )}
              </div>

              {/* Active Filter Summary */}
              <div className="flex items-center gap-2.5 flex-wrap text-xs text-[var(--text-secondary)]">
                <span className="tabular-nums">
                  {effectiveViewMode === "included" ? (
                    <>
                      {hasActiveSubFilters
                        ? `${filteredIncludedRows.length} of ${report.totalCount} matching`
                        : `${report.totalCount} verified record${
                            report.totalCount === 1 ? "" : "s"
                          }`}
                      {(target.metric === "cash" || filteredCashSubtotal > 0) &&
                        ` · ${filteredCashSubtotal.toLocaleString("en-US")} EGP`}
                    </>
                  ) : (
                    `${filteredExcludedRows.length} excluded record${
                      filteredExcludedRows.length === 1 ? "" : "s"
                    } outside cohort`
                  )}
                </span>

                {hasActiveSubFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setReasonFilter("all");
                      setAgentFilter("all");
                      setExcludedReasonFilter("all");
                      setSearchQuery("");
                      setVisibleCount(AUDIT_BATCH_SIZE);
                    }}
                    className="text-xs font-semibold text-blue-500 hover:underline cursor-pointer"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </div>

            {/* Active Reason Callout or Excluded Reason Filter Chips */}
            {effectiveViewMode === "included" && (activeReasonBucket || agentFilter !== "all") && (
              <div className="flex items-center gap-2 flex-wrap text-xs">
                {activeReasonBucket && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--bg-panel)] border border-[var(--border-input)] text-[var(--text-primary)]">
                    <span className="font-semibold">{activeReasonBucket.label}</span>
                    <span className="text-[var(--text-secondary)]">
                      — {activeReasonBucket.description}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSelectReasonFilter("all")}
                      aria-label="Clear reason filter"
                      className="ml-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {agentFilter !== "all" && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--bg-selected)] border border-[var(--border-input)] text-[var(--text-primary)] font-semibold">
                    <span>Agent: {agentFilter}</span>
                    <button
                      type="button"
                      onClick={() => handleSelectAgentFilter("all")}
                      aria-label="Clear agent filter"
                      className="ml-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
              </div>
            )}

            {effectiveViewMode === "excluded" && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setExcludedReasonFilter("all")}
                  className={`min-h-[34px] sm:min-h-[28px] px-2.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                    excludedReasonFilter === "all"
                      ? "bg-[var(--text-primary)] text-[var(--bg-card)] border-transparent"
                      : "bg-[var(--bg-panel)] text-[var(--text-secondary)] border-[var(--border-input)]"
                  }`}
                >
                  All ({report.excludedRows.length})
                </button>
                {excludedCountsByReason.unassigned > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setExcludedReasonFilter((prev) =>
                        prev === "unassigned" ? "all" : "unassigned"
                      )
                    }
                    className={`min-h-[34px] sm:min-h-[28px] px-2.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                      excludedReasonFilter === "unassigned"
                        ? "bg-[var(--text-primary)] text-[var(--bg-card)] border-transparent"
                        : "bg-[var(--bg-panel)] text-[var(--text-primary)] border-[var(--border-input)]"
                    }`}
                  >
                    Unassigned ({excludedCountsByReason.unassigned})
                  </button>
                )}
                {excludedCountsByReason.outsidePeriod > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setExcludedReasonFilter((prev) =>
                        prev === "outside_period_created" ? "all" : "outside_period_created"
                      )
                    }
                    className={`min-h-[34px] sm:min-h-[28px] px-2.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                      excludedReasonFilter === "outside_period_created"
                        ? "bg-[var(--text-primary)] text-[var(--bg-card)] border-transparent"
                        : "bg-[var(--bg-panel)] text-[var(--text-primary)] border-[var(--border-input)]"
                    }`}
                  >
                    Created before period ({excludedCountsByReason.outsidePeriod})
                  </button>
                )}
                {excludedCountsByReason.reassigned > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setExcludedReasonFilter((prev) =>
                        prev === "reassigned_actor" ? "all" : "reassigned_actor"
                      )
                    }
                    className={`min-h-[34px] sm:min-h-[28px] px-2.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                      excludedReasonFilter === "reassigned_actor"
                        ? "bg-[var(--text-primary)] text-[var(--bg-card)] border-transparent"
                        : "bg-[var(--bg-panel)] text-[var(--text-primary)] border-[var(--border-input)]"
                    }`}
                  >
                    Reassigned owner ({excludedCountsByReason.reassigned})
                  </button>
                )}
              </div>
            )}

            {/* Search & Sort Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="relative flex-1 sm:max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setVisibleCount(AUDIT_BATCH_SIZE);
                  }}
                  placeholder={
                    effectiveViewMode === "excluded"
                      ? "Filter excluded leads, owner, actor, reason..."
                      : "Filter by lead, phone, branch, stage, reason..."
                  }
                  aria-label="Filter audited records"
                  className="w-full h-11 sm:h-9 pl-9 pr-9 text-base sm:text-xs rounded-lg outline-none bg-[var(--bg-input)] border border-[var(--border-input)] text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-blue-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setVisibleCount(AUDIT_BATCH_SIZE);
                    }}
                    aria-label="Clear filter"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="inline-flex items-center gap-1.5 self-end sm:self-auto">
                <ArrowUpDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  aria-label="Sort audited records"
                  className="h-11 sm:h-9 px-2.5 rounded-lg text-base sm:text-xs font-medium bg-[var(--bg-pill)] border border-[var(--border-input)] text-[var(--text-primary)] outline-none cursor-pointer"
                >
                  <option value="default">Default order</option>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="name">Lead name (A–Z)</option>
                  <option value="name_desc">Lead name (Z–A)</option>
                  <option value="cash_desc">Cash (High–Low)</option>
                  <option value="cash_asc">Cash (Low–High)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Dedicated Scrollable Table / Card Region */}
          <div
            ref={workspaceScrollRef}
            className="flex-1 lg:min-h-0 lg:overflow-auto p-4 sm:p-5 lg:px-6 lg:pt-4 lg:pb-6 space-y-4"
          >
            {activeTotalCount === 0 ? (
              <div className="rounded-xl p-8 text-center border border-[var(--border-main)] bg-[var(--bg-card)]">
                <CheckCircle2 className="w-7 h-7 mx-auto mb-2 text-[var(--text-muted)]" />
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  No matching records
                </p>
                <p className="text-xs mt-1 text-[var(--text-secondary)]">
                  {hasActiveSubFilters
                    ? "No records match the current reason, agent, or text filter."
                    : `Zero records qualified under ${report.scopeLabel} for ${periodDescription}.`}
                </p>
                {hasActiveSubFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setReasonFilter("all");
                      setAgentFilter("all");
                      setExcludedReasonFilter("all");
                      setSearchQuery("");
                    }}
                    className="mt-3 min-h-[44px] sm:min-h-[34px] px-4 rounded-lg text-xs font-semibold bg-[var(--bg-pill)] border border-[var(--border-input)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : effectiveViewMode === "included" ? (
              <>
                {/* Mobile & Small Tablet Cards (< md) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:hidden gap-3">
                  {displayedIncludedRows.map((row, idx) => {
                    const actorNote = getActorAttributionNote(row, target.metric);
                    const milestone = getMilestoneTimestamp(row, target.metric);
                    const primarySourceTitle = resolveLeadSourceRoute({
                      id: row.id,
                      metric: target.metric,
                      pipeline: row.pipeline,
                      auditionDate: row.auditionDate,
                      followUpDate: row.followUpDate,
                      auditionOutcome: row.auditionOutcome,
                    }).label;
                    return (
                      <div
                        key={row.id}
                        className={`p-3.5 rounded-xl border bg-[var(--bg-card)] flex flex-col justify-between gap-2.5 ${
                          drawerChatId === row.id
                            ? "border-[#0066FF] ring-1 ring-[#0066FF]/30"
                            : "border-[var(--border-main)]"
                        }`}
                      >
                        <div className="space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono text-[var(--text-muted)] tabular-nums">
                                  #{idx + 1}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleNavigateLeadSource(row, "auto")}
                                  className="group/lead text-sm font-bold text-left text-[var(--text-primary)] hover:text-[#0066FF] hover:underline inline-flex items-center gap-1 min-w-0 cursor-pointer"
                                  title={primarySourceTitle}
                                >
                                  <span className="truncate">{row.leadName}</span>
                                  <ArrowUpRight className="w-3.5 h-3.5 shrink-0 opacity-60 group-hover/lead:opacity-100" />
                                </button>
                              </div>
                              <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
                                {row.leadPhone ? `${row.leadPhone} · ` : ""}
                                {row.channelLabel}
                                {row.branch ? ` · ${row.branch}` : ""}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleNavigateLeadSource(row, "pipeline")}
                              title="Open lead in Pipeline"
                              className="text-xs font-semibold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5 shrink-0 cursor-pointer hover:brightness-95 transition"
                              style={getStageBadgeStyle(row.pipeline)}
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ background: getStageColor(row.pipeline) }}
                              />
                              {row.pipeline}
                            </button>
                          </div>

                          <div className="p-2.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-main)] space-y-1">
                            <span
                              className={`inline-block text-xs font-semibold px-2 py-0.5 rounded border ${getReasonPillClass(
                                row.reasonKey
                              )}`}
                            >
                              {row.reasonLabel}
                            </span>
                            <p className="text-xs text-[var(--text-primary)] leading-snug">
                              {row.reasonDetail}
                            </p>
                            {(row.auditionDate || row.auditionOutcome) && (
                              <p className="text-xs text-[var(--text-secondary)]">
                                {row.auditionDate ? (
                                  <button
                                    type="button"
                                    onClick={() => handleNavigateLeadSource(row, "auditions")}
                                    className="hover:text-[#0066FF] hover:underline cursor-pointer font-medium"
                                    title={`Open audition slot (${row.auditionDate})`}
                                  >
                                    Audition: {row.auditionDate}
                                  </button>
                                ) : (
                                  ""
                                )}
                                {row.auditionDate && row.auditionOutcome ? " · " : ""}
                                {row.auditionOutcome
                                  ? formatAuditOutcome(row.auditionOutcome)
                                  : ""}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-secondary)] flex-wrap">
                            <div>
                              <span className="font-medium text-[var(--text-primary)]">
                                {row.assignedAgent}
                              </span>
                              {actorNote && (
                                <span className="ml-1 text-[var(--text-muted)]">
                                  ({actorNote})
                                </span>
                              )}
                              <div className="mt-0.5">
                                Created {formatAuditDate(row.createdTs)}
                                {row.createdSource !== "createdAt" &&
                                row.createdSource !== "unknown"
                                  ? ` (via ${row.createdSource})`
                                  : ""}
                                {milestone.ts && milestone.label !== "Created"
                                  ? ` · ${milestone.label} ${formatAuditDate(milestone.ts)}`
                                  : ""}
                              </div>
                            </div>

                            {row.cashIn > 0 && (
                              <span className="text-sm font-bold tabular-nums text-emerald-500">
                                {row.cashIn.toLocaleString("en-US")} EGP
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleOpenChatDrawer(row.id)}
                          className="w-full min-h-[44px] px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 bg-[var(--bg-pill)] border border-[var(--border-input)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>Open Chat</span>
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Sticky-Header Table (md+) */}
                <div className="hidden md:block w-full lg:w-max lg:min-w-full rounded-xl border border-[var(--border-main)] bg-[var(--bg-card)] shadow-xs overflow-x-auto lg:overflow-x-visible">
                  <table className="w-full text-left border-separate border-spacing-0">
                    <thead className="sticky top-0 z-10 text-xs uppercase tracking-wider font-bold bg-[var(--bg-table-header)] text-[var(--text-secondary)]">
                      <tr>
                        <th className="py-3 px-4 w-12 text-right border-b border-[var(--border-main)] rounded-tl-xl bg-[var(--bg-table-header)]">
                          #
                        </th>
                        <th className="py-3 px-3 border-b border-[var(--border-main)] bg-[var(--bg-table-header)]">
                          <button
                            type="button"
                            onClick={() => handleToggleColumnSort("name", "name_desc")}
                            className="inline-flex items-center gap-1 font-bold uppercase tracking-wider hover:text-[var(--text-primary)] cursor-pointer"
                          >
                            <span>Lead</span>
                            {renderSortIcon("name", "name_desc")}
                          </button>
                        </th>
                        <th className="py-3 px-3 border-b border-[var(--border-main)] bg-[var(--bg-table-header)]">
                          Owner
                        </th>
                        <th className="py-3 px-3 border-b border-[var(--border-main)] bg-[var(--bg-table-header)]">
                          Stage &amp; Audition
                        </th>
                        <th className="py-3 px-3 border-b border-[var(--border-main)] bg-[var(--bg-table-header)]">
                          Why Counted
                        </th>
                        <th className="py-3 px-3 text-right border-b border-[var(--border-main)] bg-[var(--bg-table-header)]">
                          <button
                            type="button"
                            onClick={() =>
                              target.metric === "cash"
                                ? handleToggleColumnSort("cash_desc", "cash_asc")
                                : handleToggleColumnSort("newest", "oldest")
                            }
                            className="inline-flex items-center justify-end gap-1 font-bold uppercase tracking-wider hover:text-[var(--text-primary)] cursor-pointer"
                          >
                            <span>Dates / Cash</span>
                            {target.metric === "cash"
                              ? renderSortIcon("cash_desc", "cash_asc")
                              : renderSortIcon("newest", "oldest")}
                          </button>
                        </th>
                        <th className="py-3 px-4 text-right border-b border-[var(--border-main)] rounded-tr-xl bg-[var(--bg-table-header)]">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="text-xs text-[var(--text-primary)]">
                      {displayedIncludedRows.map((row, idx) => {
                        const actorNote = getActorAttributionNote(row, target.metric);
                        const milestone = getMilestoneTimestamp(row, target.metric);
                        const canClickAgent =
                          report.isAllAgentsScope && report.agentBreakdown.length > 1;
                        const primarySourceTitle = resolveLeadSourceRoute({
                          id: row.id,
                          metric: target.metric,
                          pipeline: row.pipeline,
                          auditionDate: row.auditionDate,
                          followUpDate: row.followUpDate,
                          auditionOutcome: row.auditionOutcome,
                        }).label;
                        return (
                          <tr
                            key={row.id}
                            className="hover:bg-[var(--bg-hover)] transition-colors"
                            style={{
                              background:
                                drawerChatId === row.id
                                  ? "var(--bg-selected)"
                                  : idx % 2 === 0
                                    ? "transparent"
                                    : "var(--bg-table-alt)",
                            }}
                          >
                            <td className="py-3 px-4 text-right font-mono text-[var(--text-muted)] tabular-nums align-top border-b border-[var(--border-main)]">
                              {idx + 1}
                            </td>

                            <td className="py-3 px-3 align-top max-w-[260px] border-b border-[var(--border-main)]">
                              <button
                                type="button"
                                onClick={() => handleNavigateLeadSource(row, "auto")}
                                className="group/lead font-semibold text-left text-[var(--text-primary)] hover:text-[#0066FF] hover:underline inline-flex items-center gap-1 max-w-full cursor-pointer"
                                title={primarySourceTitle}
                              >
                                <span className="truncate">{row.leadName}</span>
                                <ArrowUpRight className="w-3 h-3 shrink-0 opacity-60 group-hover/lead:opacity-100" />
                              </button>
                              <div className="text-xs text-[var(--text-secondary)] mt-0.5 flex items-center gap-1 flex-wrap">
                                {row.leadPhone && <span>{row.leadPhone}</span>}
                                {row.leadPhone && <span>·</span>}
                                <span className="truncate">{row.channelLabel}</span>
                              </div>
                              {row.branch && (
                                <div className="text-xs text-[var(--text-muted)] truncate">
                                  {row.branch}
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-3 align-top whitespace-nowrap border-b border-[var(--border-main)]">
                              {canClickAgent ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleSelectAgentFilter(
                                      agentFilter.toLowerCase() === row.assignedAgent.toLowerCase()
                                        ? "all"
                                        : row.assignedAgent
                                    )
                                  }
                                  className="font-medium text-[var(--text-primary)] hover:underline cursor-pointer text-left"
                                  title={`Filter table by ${row.assignedAgent}`}
                                >
                                  {row.assignedAgent}
                                </button>
                              ) : (
                                <div className="font-medium text-[var(--text-primary)]">
                                  {row.assignedAgent}
                                </div>
                              )}
                              {actorNote && (
                                <div className="text-xs text-[var(--text-muted)] mt-0.5">
                                  {actorNote}
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-3 align-top border-b border-[var(--border-main)]">
                              <button
                                type="button"
                                onClick={() => handleNavigateLeadSource(row, "pipeline")}
                                title="Open lead in Pipeline"
                                className="text-xs font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer hover:brightness-95 transition"
                                style={getStageBadgeStyle(row.pipeline)}
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ background: getStageColor(row.pipeline) }}
                                />
                                {row.pipeline}
                              </button>
                              {(row.auditionDate || row.auditionOutcome) && (
                                <div className="text-xs text-[var(--text-secondary)] mt-1 whitespace-nowrap">
                                  {row.auditionDate ? (
                                    <button
                                      type="button"
                                      onClick={() => handleNavigateLeadSource(row, "auditions")}
                                      className="hover:text-[#0066FF] hover:underline cursor-pointer"
                                      title={`Open audition slot (${row.auditionDate})`}
                                    >
                                      Audition: {row.auditionDate}
                                    </button>
                                  ) : (
                                    ""
                                  )}
                                  {row.auditionDate && row.auditionOutcome ? " · " : ""}
                                  {row.auditionOutcome
                                    ? formatAuditOutcome(row.auditionOutcome)
                                    : ""}
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-3 align-top max-w-[380px] xl:max-w-[460px] border-b border-[var(--border-main)]">
                              <button
                                type="button"
                                onClick={() =>
                                  handleSelectReasonFilter(
                                    reasonFilter === row.reasonKey ? "all" : row.reasonKey
                                  )
                                }
                                title="Filter by this inclusion reason"
                                className={`inline-block text-xs font-semibold px-2 py-0.5 rounded border cursor-pointer hover:opacity-85 ${getReasonPillClass(
                                  row.reasonKey
                                )}`}
                              >
                                {row.reasonLabel}
                              </button>
                              <p className="text-xs text-[var(--text-secondary)] mt-1 leading-snug">
                                {row.reasonDetail}
                              </p>
                            </td>

                            <td className="py-3 px-3 text-right align-top whitespace-nowrap tabular-nums border-b border-[var(--border-main)]">
                              {row.cashIn > 0 && (
                                <div className="font-bold text-emerald-500">
                                  {row.cashIn.toLocaleString("en-US")} EGP
                                </div>
                              )}
                              <div
                                className="text-xs text-[var(--text-secondary)]"
                                title={`Created timestamp: ${formatAuditDateTime(row.createdTs)}`}
                              >
                                Created {formatAuditDate(row.createdTs)}
                              </div>
                              {row.createdSource !== "createdAt" &&
                                row.createdSource !== "unknown" && (
                                  <div className="text-xs text-[var(--text-muted)]">
                                    via {row.createdSource}
                                  </div>
                                )}
                              {milestone.ts && milestone.label !== "Created" && (
                                <div
                                  className="text-xs text-[var(--text-muted)]"
                                  title={`${milestone.label} timestamp: ${formatAuditDateTime(
                                    milestone.ts
                                  )}`}
                                >
                                  {milestone.label} {formatAuditDate(milestone.ts)}
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-4 text-right align-top border-b border-[var(--border-main)]">
                              <button
                                type="button"
                                onClick={() => handleOpenChatDrawer(row.id)}
                                className="min-h-[32px] px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 bg-[var(--bg-pill)] border border-[var(--border-input)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                <span>Chat</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              /* Excluded / Outside-Cohort Cross-Check View */
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:hidden gap-3">
                  {displayedExcludedRows.map((ex: FunnelAuditExcludedRow, idx) => {
                    const exSourceTitle = resolveLeadSourceRoute({
                      id: ex.id,
                      metric: target.metric,
                      pipeline: ex.pipeline,
                      auditionDate: ex.auditionDate,
                    }).label;
                    return (
                    <div
                      key={`${ex.id}-${ex.excludedReason}`}
                      className={`p-3.5 rounded-xl border bg-[var(--bg-card)] flex flex-col justify-between gap-2.5 ${
                        drawerChatId === ex.id
                          ? "border-[#0066FF] ring-1 ring-[#0066FF]/30"
                          : "border-[var(--border-main)]"
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono text-[var(--text-muted)] tabular-nums">
                                #{idx + 1}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleNavigateLeadSource(ex, "auto")}
                                className="group/lead text-sm font-bold text-left text-[var(--text-primary)] hover:text-[#0066FF] hover:underline inline-flex items-center gap-1 min-w-0 cursor-pointer"
                                title={exSourceTitle}
                              >
                                <span className="truncate">{ex.leadName}</span>
                                <ArrowUpRight className="w-3.5 h-3.5 shrink-0 opacity-60 group-hover/lead:opacity-100" />
                              </button>
                            </div>
                            <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
                              {ex.leadPhone ? `${ex.leadPhone} · ` : ""}Owner: {ex.assignedAgent}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleNavigateLeadSource(ex, "pipeline")}
                            title="Open lead in Pipeline"
                            className="text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0 cursor-pointer hover:brightness-95 transition"
                            style={getStageBadgeStyle(ex.pipeline)}
                          >
                            {ex.pipeline}
                          </button>
                        </div>

                        <div className="p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20 space-y-1">
                          <span className="inline-block text-xs px-2 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-500 font-semibold">
                            {getExcludedReasonBadge(ex.excludedReason)}
                          </span>
                          <p className="text-xs text-[var(--text-primary)] leading-snug">
                            {ex.excludedDetail}
                          </p>
                        </div>

                        <div className="text-xs text-[var(--text-secondary)] flex items-center justify-between gap-2 flex-wrap">
                          <span>
                            {ex.createdTs > 0 ? `Created ${formatAuditDate(ex.createdTs)}` : ""}
                            {ex.milestoneTs && ex.milestoneTs !== ex.createdTs
                              ? ` · Milestone ${formatAuditDate(ex.milestoneTs)}`
                              : ""}
                          </span>
                          {ex.cashIn > 0 && (
                            <span className="font-bold text-emerald-500 tabular-nums">
                              {ex.cashIn.toLocaleString("en-US")} EGP
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleOpenChatDrawer(ex.id)}
                        className="w-full min-h-[44px] px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 bg-[var(--bg-pill)] border border-[var(--border-input)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Open Chat</span>
                      </button>
                    </div>
                  );
                  })}
                </div>

                <div className="hidden md:block w-full lg:w-max lg:min-w-full rounded-xl border border-[var(--border-main)] bg-[var(--bg-card)] shadow-xs overflow-x-auto lg:overflow-x-visible">
                  <table className="w-full text-left border-separate border-spacing-0">
                    <thead className="sticky top-0 z-10 text-xs uppercase tracking-wider font-bold bg-[var(--bg-table-header)] text-[var(--text-secondary)]">
                      <tr>
                        <th className="py-3 px-4 w-12 text-right border-b border-[var(--border-main)] rounded-tl-xl bg-[var(--bg-table-header)]">
                          #
                        </th>
                        <th className="py-3 px-3 border-b border-[var(--border-main)] bg-[var(--bg-table-header)]">
                          Lead
                        </th>
                        <th className="py-3 px-3 border-b border-[var(--border-main)] bg-[var(--bg-table-header)]">
                          Owner / Actor
                        </th>
                        <th className="py-3 px-3 border-b border-[var(--border-main)] bg-[var(--bg-table-header)]">
                          Stage
                        </th>
                        <th className="py-3 px-3 border-b border-[var(--border-main)] bg-[var(--bg-table-header)]">
                          Why Excluded
                        </th>
                        <th className="py-3 px-3 text-right border-b border-[var(--border-main)] bg-[var(--bg-table-header)]">
                          Dates / Cash
                        </th>
                        <th className="py-3 px-4 text-right border-b border-[var(--border-main)] rounded-tr-xl bg-[var(--bg-table-header)]">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="text-xs text-[var(--text-primary)]">
                      {displayedExcludedRows.map((ex: FunnelAuditExcludedRow, idx) => {
                        const exSourceTitle = resolveLeadSourceRoute({
                          id: ex.id,
                          metric: target.metric,
                          pipeline: ex.pipeline,
                          auditionDate: ex.auditionDate,
                        }).label;
                        return (
                        <tr
                          key={`${ex.id}-${ex.excludedReason}`}
                          className="hover:bg-[var(--bg-hover)] transition-colors"
                          style={{
                            background:
                              drawerChatId === ex.id
                                ? "var(--bg-selected)"
                                : idx % 2 === 0
                                  ? "transparent"
                                  : "var(--bg-table-alt)",
                          }}
                        >
                          <td className="py-3 px-4 text-right font-mono text-[var(--text-muted)] tabular-nums align-top border-b border-[var(--border-main)]">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-3 align-top max-w-[260px] border-b border-[var(--border-main)]">
                            <button
                              type="button"
                              onClick={() => handleNavigateLeadSource(ex, "auto")}
                              className="group/lead font-semibold text-left text-[var(--text-primary)] hover:text-[#0066FF] hover:underline inline-flex items-center gap-1 max-w-full cursor-pointer"
                              title={exSourceTitle}
                            >
                              <span className="truncate">{ex.leadName}</span>
                              <ArrowUpRight className="w-3 h-3 shrink-0 opacity-60 group-hover/lead:opacity-100" />
                            </button>
                            {ex.leadPhone && (
                              <div className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
                                {ex.leadPhone}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 align-top whitespace-nowrap border-b border-[var(--border-main)]">
                            <div className="font-medium text-[var(--text-primary)]">
                              {ex.assignedAgent}
                            </div>
                            {ex.actorName &&
                              ex.actorName.toLowerCase() !== ex.assignedAgent.toLowerCase() && (
                                <div className="text-xs text-[var(--text-muted)] mt-0.5">
                                  Actor: {ex.actorName}
                                </div>
                              )}
                          </td>
                          <td className="py-3 px-3 align-top border-b border-[var(--border-main)]">
                            <button
                              type="button"
                              onClick={() => handleNavigateLeadSource(ex, "pipeline")}
                              title="Open lead in Pipeline"
                              className="text-xs font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer hover:brightness-95 transition"
                              style={getStageBadgeStyle(ex.pipeline)}
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ background: getStageColor(ex.pipeline) }}
                              />
                              {ex.pipeline}
                            </button>
                            {ex.auditionDate && (
                              <div className="text-xs text-[var(--text-secondary)] mt-1 whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => handleNavigateLeadSource(ex, "auditions")}
                                  className="hover:text-[#0066FF] hover:underline cursor-pointer"
                                  title={`Open audition slot (${ex.auditionDate})`}
                                >
                                  Audition: {ex.auditionDate}
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 align-top max-w-[400px] xl:max-w-[480px] border-b border-[var(--border-main)]">
                            <span className="inline-block text-xs px-2 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-500 font-semibold">
                              {getExcludedReasonBadge(ex.excludedReason)}
                            </span>
                            <p className="text-xs text-[var(--text-secondary)] mt-1 leading-snug">
                              {ex.excludedDetail}
                            </p>
                          </td>
                          <td className="py-3 px-3 text-right align-top whitespace-nowrap tabular-nums border-b border-[var(--border-main)]">
                            {ex.cashIn > 0 && (
                              <div className="font-bold text-emerald-500">
                                {ex.cashIn.toLocaleString("en-US")} EGP
                              </div>
                            )}
                            {ex.createdTs > 0 && (
                              <div className="text-xs text-[var(--text-secondary)]">
                                Created {formatAuditDate(ex.createdTs)}
                              </div>
                            )}
                            {ex.milestoneTs && ex.milestoneTs !== ex.createdTs && (
                              <div className="text-xs text-[var(--text-muted)]">
                                Milestone {formatAuditDate(ex.milestoneTs)}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right align-top border-b border-[var(--border-main)]">
                            <button
                              type="button"
                              onClick={() => handleOpenChatDrawer(ex.id)}
                              className="min-h-[32px] px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 bg-[var(--bg-pill)] border border-[var(--border-input)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>Chat</span>
                            </button>
                          </td>
                        </tr>
                      );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {hasMoreRows && (
              <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
                <span className="text-xs text-[var(--text-secondary)] tabular-nums">
                  Showing {activeShownCount} of {activeTotalCount} records
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleCount((prev) =>
                        Math.min(prev + AUDIT_BATCH_SIZE, activeTotalCount)
                      )
                    }
                    className="min-h-[44px] sm:min-h-[34px] px-4 rounded-lg text-xs font-semibold bg-[var(--bg-card)] border border-[var(--border-input)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                  >
                    Show {Math.min(AUDIT_BATCH_SIZE, activeTotalCount - visibleCount)} more
                  </button>
                  {activeTotalCount - visibleCount > AUDIT_BATCH_SIZE && (
                    <button
                      type="button"
                      onClick={() => setVisibleCount(activeTotalCount)}
                      className="min-h-[44px] sm:min-h-[34px] px-4 rounded-lg text-xs font-semibold bg-[var(--bg-pill)] border border-[var(--border-input)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                    >
                      Show all ({activeTotalCount})
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* In-Screen Slide-Over Chat Backdrop */}
      {drawerChatId && (
        <div
          className={`absolute inset-0 z-40 bg-black/30 backdrop-blur-[1px] ${
            isDrawerClosing ? "animate-backdrop-out pointer-events-none" : "animate-backdrop-in"
          }`}
          onClick={handleCloseChatDrawer}
        />
      )}

      {/* In-Screen Slide-Over Chat Drawer (Exact Pipeline Screen Design) */}
      {drawerChatId && (
        <div
          ref={drawerPanelRef}
          onAnimationEnd={handleDrawerAnimationEnd}
          onClickCapture={() => onSyncDraft?.(buildModalSnapshot())}
          className={`absolute right-0 top-0 h-full z-50 flex flex-col transition-[width] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[width,transform] shadow-2xl ${
            isDrawerClosing ? "animate-drawer-out pointer-events-none" : "animate-drawer-in"
          } ${
            showChatDetails
              ? "w-full sm:w-[820px] md:w-[860px] xl:w-[900px] sm:max-w-[96vw]"
              : "w-full sm:w-[500px] md:w-[540px] xl:w-[580px]"
          }`}
          style={{
            background: "var(--bg-panel)",
            borderLeft: "1px solid var(--border-main)",
            boxShadow: "-10px 0 25px rgba(0,0,0,0.12)",
          }}
        >
          <div className="flex h-full w-full overflow-hidden relative animate-panel-fade">
            <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
              <ConversationChatView
                conversationId={drawerChatId}
                onClose={handleCloseChatDrawer}
                extraHeaderActions={
                  <button
                    type="button"
                    onClick={() => setShowChatDetails((prev) => !prev)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-[6px] active:scale-95 transition-all duration-150 cursor-pointer select-none ${
                      showChatDetails
                        ? "bg-[#0066FF] text-white shadow-xs"
                        : "hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
                    }`}
                    style={{
                      border: showChatDetails
                        ? "1px solid #0066FF"
                        : "1px solid var(--border-input)",
                      background: showChatDetails ? "#0066FF" : "var(--bg-pill)",
                    }}
                    title={showChatDetails ? "Hide lead details" : "View lead details"}
                  >
                    Details
                  </button>
                }
              />
            </div>

            {/* Collapsible Right Lead Details Sidebar */}
            <div
              className={`shrink-0 h-full flex flex-col overflow-hidden transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[transform,width,opacity] absolute sm:relative inset-0 sm:inset-auto z-20 sm:z-auto border-l ${
                showChatDetails
                  ? "w-full sm:w-[320px] opacity-100 translate-x-0"
                  : "w-full sm:w-0 opacity-0 sm:opacity-0 translate-x-full sm:translate-x-0 pointer-events-none border-l-0"
              }`}
              style={{
                borderColor: "var(--border-main)",
                background: "var(--bg-panel)",
              }}
            >
              <div className="w-full sm:w-[320px] h-full flex flex-col min-w-[300px] sm:min-w-[320px]">
                {activeDrawerConv && (
                  <ConversationDetailsSidebar
                    conversation={activeDrawerConv}
                    showOpenConversationButton={false}
                    onClose={() => setShowChatDetails(false)}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
