import type {
  FunnelAuditExcludedReason,
  FunnelAuditMetric,
  FunnelAuditTarget,
} from "./teamMetrics";

export interface LeadSourceTargetInput {
  id: string;
  metric?: FunnelAuditMetric;
  pipeline?: string | null;
  auditionDate?: string | null;
  followUpDate?: string | null;
  auditionOutcome?: string | null;
  preferredTarget?: "auto" | "pipeline" | "auditions";
  from?: "team-performance";
}

export interface LeadSourceRoute {
  target: "auditions" | "pipeline";
  href: string;
  label: string;
}

export interface FunnelAuditModalSnapshot {
  targetKey: string;
  viewMode: "included" | "excluded";
  reasonFilter: string;
  agentFilter: string;
  excludedReasonFilter: "all" | FunnelAuditExcludedReason;
  searchQuery: string;
  sortBy:
    | "default"
    | "newest"
    | "oldest"
    | "name"
    | "name_desc"
    | "cash_desc"
    | "cash_asc";
  visibleCount: number;
  showFormula: boolean;
  mobileBreakdownOpen: boolean;
  drawerChatId: string | null;
  showChatDetails: boolean;
  workspaceScrollTop: number;
  sidebarScrollTop: number;
  mobileOuterScrollTop: number;
}

export interface TeamActivitiesSnapshot {
  restoreActive: boolean;
  cameInSameSpaSession: boolean;
  returnLabel: string;
  urlAgentAtSave: string;
  filterMode: "all" | "day" | "week" | "range";
  currentDateIso: string;
  customStartDate: string;
  customEndDate: string;
  userPickedAgent: { agent: string; urlAtPick: string } | null;
  mainTab: "timeline" | "funnel" | "leads";
  feedViewStyle: "timeline" | "compact";
  activitySearch: string;
  agentSearch: string;
  agentRoleFilter: string;
  visibleTimelineCount: number;
  visibleLeadsCount: number;
  scrollTop: number;
  auditTarget: FunnelAuditTarget | null;
  auditModal: FunnelAuditModalSnapshot | null;
  leadsDrawerChatId?: string | null;
  leadsShowChatDetails?: boolean;
}

const SNAPSHOT_STORAGE_KEY = "crm_team_activities_snapshot_v1";
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

let memorySnapshot: TeamActivitiesSnapshot | null = null;
let memoryDraftSnapshot: Omit<TeamActivitiesSnapshot, "restoreActive" | "cameInSameSpaSession"> | null = null;
let sidebarNavPending = false;
let sidebarNavTimer: ReturnType<typeof setTimeout> | null = null;

function cleanIsoDate(val?: string | null): string {
  const s = (val || "").trim();
  return ISO_DATE_RE.test(s) ? s : "";
}

/**
 * Resolves the CRM source page (`/auditions` or `/pipeline`) for a lead so users
 * auditing Conversion Funnel or Team Activities can verify the original card or slot.
 */
export function resolveLeadSourceRoute(input: LeadSourceTargetInput): LeadSourceRoute {
  const cleanId = (input.id || "").trim();
  const cleanPipeline = (input.pipeline || "").trim();
  const pipelineLower = cleanPipeline.toLowerCase();
  const cleanOutcome = (input.auditionOutcome || "").trim().toLowerCase();
  const validAuditionDate = cleanIsoDate(input.auditionDate) || cleanIsoDate(input.followUpDate);
  const from = input.from ?? "team-performance";

  const hasAuditionRecord =
    Boolean(cleanIsoDate(input.auditionDate)) ||
    pipelineLower === "audition booked" ||
    pipelineLower === "attended" ||
    (Boolean(cleanOutcome) && cleanOutcome !== "joining-later");

  const useAuditions =
    input.preferredTarget === "auditions" ||
    (input.preferredTarget !== "pipeline" &&
      (input.metric === "booked" || input.metric === "attended") &&
      hasAuditionRecord);

  const params = new URLSearchParams();
  if (cleanId) params.set("id", cleanId);

  if (useAuditions) {
    if (validAuditionDate) params.set("date", validAuditionDate);
    if (from) params.set("from", from);
    return {
      target: "auditions",
      href: `/auditions?${params.toString()}`,
      label: validAuditionDate
        ? `Open audition slot (${validAuditionDate})`
        : "Open audition in Auditions",
    };
  }

  if (from) params.set("from", from);
  return {
    target: "pipeline",
    href: `/pipeline?${params.toString()}`,
    label:
      cleanPipeline && pipelineLower !== "direct"
        ? `Open lead in Pipeline (${cleanPipeline})`
        : "Open lead in Pipeline",
  };
}

export function getAuditTargetKey(target: FunnelAuditTarget | null): string {
  if (!target) return "";
  const agentPart = (target.agentName || "").trim();
  if (target.metric === "stage") return `stage:${target.stage}:${agentPart}`;
  if (target.metric === "channel") return `channel:${target.channel}:${agentPart}`;
  return `${target.metric}:${agentPart}`;
}

export function formatAuditReturnLabel(target: FunnelAuditTarget | null): string {
  if (!target) return "Back to Team Activities";
  switch (target.metric) {
    case "leads":
      return "Back to Funnel Audit (Total Leads)";
    case "booked":
      return "Back to Funnel Audit (Auditions Booked)";
    case "attended":
      return "Back to Funnel Audit (Attended)";
    case "enrolled":
      return "Back to Funnel Audit (Enrolled)";
    case "cash":
      return "Back to Funnel Audit (Cash In)";
    case "awaiting_reply":
      return "Back to Funnel Audit (Awaiting Reply)";
    case "stage":
      return `Back to Funnel Audit (${target.stage})`;
    case "channel":
      return `Back to Funnel Audit (${target.channel})`;
    default:
      return "Back to Funnel Audit";
  }
}

function writeStorageSnapshot(snapshot: TeamActivitiesSnapshot | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!snapshot) {
      window.sessionStorage.removeItem(SNAPSHOT_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
    }
  } catch {
    // Ignore storage quota or private browsing errors
  }
}

function readStorageSnapshot(): TeamActivitiesSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SNAPSHOT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TeamActivitiesSnapshot;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Keeps an in-memory draft synced while Team Activities / Funnel Audit is open. */
export function updateTeamActivitiesDraft(
  draft: Omit<TeamActivitiesSnapshot, "restoreActive" | "cameInSameSpaSession"> | null
): void {
  memoryDraftSnapshot = draft;
  if (draft && memorySnapshot && memorySnapshot.restoreActive) {
    memorySnapshot = {
      ...draft,
      restoreActive: true,
      cameInSameSpaSession: memorySnapshot.cameInSameSpaSession,
    };
    writeStorageSnapshot(memorySnapshot);
  }
}

/** Persists the current Team Activities + Funnel Audit state before drilling down to a source page. */
export function saveTeamActivitiesSnapshot(
  snapshot: TeamActivitiesSnapshot
): void {
  memorySnapshot = snapshot;
  memoryDraftSnapshot = {
    returnLabel: snapshot.returnLabel,
    urlAgentAtSave: snapshot.urlAgentAtSave,
    filterMode: snapshot.filterMode,
    currentDateIso: snapshot.currentDateIso,
    customStartDate: snapshot.customStartDate,
    customEndDate: snapshot.customEndDate,
    userPickedAgent: snapshot.userPickedAgent,
    mainTab: snapshot.mainTab,
    feedViewStyle: snapshot.feedViewStyle,
    activitySearch: snapshot.activitySearch,
    agentSearch: snapshot.agentSearch,
    agentRoleFilter: snapshot.agentRoleFilter,
    visibleTimelineCount: snapshot.visibleTimelineCount,
    visibleLeadsCount: snapshot.visibleLeadsCount,
    scrollTop: snapshot.scrollTop,
    auditTarget: snapshot.auditTarget,
    auditModal: snapshot.auditModal,
    leadsDrawerChatId: snapshot.leadsDrawerChatId ?? null,
    leadsShowChatDetails: snapshot.leadsShowChatDetails ?? false,
  };
  writeStorageSnapshot(snapshot);
}

/** Promotes the live in-memory draft to an active restorable snapshot on child navigation. */
export function activateTeamAuditRestoreFromDraft(): void {
  if (!memoryDraftSnapshot) return;
  const next: TeamActivitiesSnapshot = {
    ...memoryDraftSnapshot,
    restoreActive: true,
    cameInSameSpaSession: true,
  };
  memorySnapshot = next;
  writeStorageSnapshot(next);
}

/**
 * Synchronous in-memory snapshot reader used inside `useState` initializers so
 * client-side SPA return navigation renders frame-1 with zero loading and zero SSR mismatch.
 */
export function getMemoryTeamSnapshot(
  currentUrlAgent: string,
  forceRestore = false
): TeamActivitiesSnapshot | null {
  if (!memorySnapshot) return null;
  if (!forceRestore && !memorySnapshot.restoreActive) return null;
  if (!forceRestore && currentUrlAgent && memorySnapshot.urlAgentAtSave !== currentUrlAgent) {
    return null;
  }
  return memorySnapshot;
}

/** SessionStorage fallback reader used only after a full browser reload. */
export function getStorageTeamSnapshot(
  currentUrlAgent: string,
  forceRestore = false
): TeamActivitiesSnapshot | null {
  const stored = readStorageSnapshot();
  if (!stored) return null;
  if (!forceRestore && !stored.restoreActive) return null;
  if (!forceRestore && currentUrlAgent && stored.urlAgentAtSave !== currentUrlAgent) {
    return null;
  }
  return stored;
}

/** Marks that the user intentionally clicked a top-level Sidebar link rather than drilling down. */
export function markTeamSidebarNavigation(): void {
  sidebarNavPending = true;
  if (sidebarNavTimer) clearTimeout(sidebarNavTimer);
  sidebarNavTimer = setTimeout(() => {
    sidebarNavPending = false;
    sidebarNavTimer = null;
  }, 500);
  if (memorySnapshot) {
    memorySnapshot = { ...memorySnapshot, restoreActive: false, cameInSameSpaSession: false };
    writeStorageSnapshot(null);
  } else {
    writeStorageSnapshot(null);
  }
}

export function wasTeamSidebarNavigation(): boolean {
  return sidebarNavPending;
}

export function getTeamReturnBannerInfo(): {
  label: string;
  canUseHistoryBack: boolean;
} {
  const snap = memorySnapshot || readStorageSnapshot();
  return {
    label: snap?.returnLabel || "Back to Funnel Audit",
    canUseHistoryBack: Boolean(memorySnapshot?.cameInSameSpaSession),
  };
}

/** Returns cleanly to Team Activities without triggering a full reload or losing audit state. */
export function navigateBackToTeamActivities(router: {
  back: () => void;
  push: (href: string) => void;
}): void {
  const snap = memorySnapshot || readStorageSnapshot();
  if (snap) {
    saveTeamActivitiesSnapshot({ ...snap, restoreActive: true });
  }
  if (
    memorySnapshot?.cameInSameSpaSession &&
    typeof window !== "undefined" &&
    window.history.length > 1
  ) {
    router.back();
    return;
  }
  router.push("/team-performance?restore=1");
}

export function resetTeamAuditTestState(): void {
  memorySnapshot = null;
  memoryDraftSnapshot = null;
  sidebarNavPending = false;
  if (sidebarNavTimer) {
    clearTimeout(sidebarNavTimer);
    sidebarNavTimer = null;
  }
  writeStorageSnapshot(null);
}

