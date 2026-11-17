export type PresenceStatus = "online" | "away" | "offline";

export interface ScreenRef {
  screen: string;
  label: string;
  path: string;
}

export interface ScreenTimeEntry extends ScreenRef {
  activeMs: number;
  lastSeenAt: number;
}

export interface ScreenBreakdownRow extends ScreenTimeEntry {
  sharePct: number;
  dotVar: string;
  bgVar: string;
  borderVar: string;
  textVar: string;
}

export interface AgentPerformanceStats {
  userId: string | null;
  name: string;
  role: string;
  email: string;
  avatar: string;
  isActiveAccount: boolean;
  status: PresenceStatus;
  currentScreen?: string | null;
  currentScreenLabel?: string | null;
  currentScreenPath?: string | null;
  activeScreens?: ScreenRef[];
  screens?: ScreenTimeEntry[];
  lastSeenAt: number;
  lastActiveAt: number;
  firstSeenAt: number;
  activeMs: number;
  connectedMs: number;
  daysActiveCount: number;
  firstResponseAvgMs: number | null;
  firstResponseMedianMs: number | null;
  firstResponseMinMs: number | null;
  firstResponseMaxMs: number | null;
  firstResponseCount: number;
  avgReplyMs: number | null;
  medianReplyMs: number | null;
  minReplyMs: number | null;
  maxReplyMs: number | null;
  replyTurnsCount: number;
  fastReply15mCount: number;
  fastReply15mPct: number;
  currentlyWaitingCount: number;
  oldestWaitingSinceMs: number | null;
}

export interface TeamPerformanceSummary {
  firstResponseAvgMs: number | null;
  firstResponseMedianMs: number | null;
  firstResponseMinMs: number | null;
  firstResponseMaxMs: number | null;
  firstResponseCount: number;
  avgReplyMs: number | null;
  medianReplyMs: number | null;
  minReplyMs: number | null;
  maxReplyMs: number | null;
  replyTurnsCount: number;
  fastReply15mCount: number;
  fastReply15mPct: number;
  currentlyWaitingCount: number;
  oldestWaitingSinceMs: number | null;
  unattributedCount?: number;
  unattributedFirstCount?: number;
  unattributedAvgMs?: number | null;
  unattributedMedianMs?: number | null;
  excludedCount?: number;
  activeMs: number;
  connectedMs: number;
  onlineCount: number;
  awayCount: number;
  screens?: ScreenTimeEntry[];
}

export interface TeamMetricsPayload {
  period: {
    startMs: number;
    endMs: number;
  };
  fastReplyThresholdMs: number;
  trackingStartedAt: number;
  team: TeamPerformanceSummary;
  agents: AgentPerformanceStats[];
}

export interface LivePresenceEntry {
  userId: string;
  userName?: string;
  status: PresenceStatus;
  currentScreen?: string | null;
  currentScreenLabel?: string | null;
  currentScreenPath?: string | null;
  activeScreens?: ScreenRef[];
  lastSeenAt: number;
  lastActiveAt: number;
}

export interface ResponseAuditRow {
  conversationId: string;
  leadName: string;
  channel: string;
  assignedAgent: string | null;
  agentName: string | null;
  attributionSource: "senderName" | "activityLog" | "unattributed";
  excludeReason?: "handled_in_crm" | "meta_window_exceeded" | null;
  incomingAt: number;
  repliedAt: number;
  responseMs: number;
  isFirstResponse: boolean;
}

export interface ResponseAuditReport {
  totalCount: number;
  unattributedCount?: number;
  excludedCount?: number;
  scope?: "verified" | "unattributed" | "excluded" | "all";
  sort?: ResponseAuditSort;
  avgMs: number | null;
  medianMs: number | null;
  minMs: number | null;
  maxMs: number | null;
  fastReply15mCount: number;
  fastReply15mPct: number;
  rows: ResponseAuditRow[];
}

export type ResponseAuditSort = "newest" | "oldest" | "slowest" | "fastest";

export interface StatusTokenMeta {
  label: string;
  bgVar: string;
  borderVar: string;
  textVar: string;
  dotVar: string;
}

/**
 * Formats a lead response duration (`ms`) into a concise human-readable string
 * such as `"42s"`, `"4m 15s"`, `"24m"`, `"2h 15m"`, or `"1d 4h"`.
 */
export function formatResponseDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms === 0) return "0s";
  if (ms < 1000) return "<1s";

  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;

  const totalMin = Math.floor(totalSec / 60);
  const remSec = totalSec % 60;
  if (totalMin < 10) {
    return remSec > 0 ? `${totalMin}m ${remSec}s` : `${totalMin}m`;
  }

  if (totalMin < 60) {
    return `${Math.round(totalSec / 60)}m`;
  }

  const totalHours = Math.floor(totalMin / 60);
  const remMin = totalMin % 60;
  if (totalHours < 24) {
    return remMin > 0 ? `${totalHours}h ${remMin}m` : `${totalHours}h`;
  }

  const days = Math.floor(totalHours / 24);
  const remHours = totalHours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

/**
 * Formats cumulative CRM online duration (`ms`) in hours and minutes (`"0m"`, `"<1m"`, `"42m"`, `"6h 15m"`).
 */
export function formatOnlineDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms === 0) return "0m";
  if (ms < 60_000) return "<1m";

  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 60) return `${totalMinutes}m`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

/**
 * Returns theme-token styles and accessible text label for a staff member's live status.
 */
export function getPresenceStatusMeta(status?: PresenceStatus | null): StatusTokenMeta {
  switch (status) {
    case "online":
      return {
        label: "Online",
        bgVar: "var(--label-green-bg)",
        borderVar: "var(--label-green-border)",
        textVar: "var(--label-green-text)",
        dotVar: "var(--label-green-dot)",
      };
    case "away":
      return {
        label: "Away",
        bgVar: "var(--label-amber-bg)",
        borderVar: "var(--label-amber-border)",
        textVar: "var(--label-amber-text)",
        dotVar: "var(--label-amber-dot)",
      };
    default:
      return {
        label: "Offline",
        bgVar: "var(--label-slate-bg)",
        borderVar: "var(--label-slate-border)",
        textVar: "var(--label-slate-text)",
        dotVar: "var(--label-slate-dot)",
      };
  }
}

/**
 * Selects the typical response duration (`medianMs` first, falling back to `avgMs`)
 * so headline KPI cards and speed badges reflect normal admission speed without outlier skew.
 */
export function pickHeadlineDurationMs(
  medianMs: number | null | undefined,
  avgMs: number | null | undefined
): number | null {
  if (typeof medianMs === "number" && Number.isFinite(medianMs) && medianMs >= 0) {
    return medianMs;
  }
  if (typeof avgMs === "number" && Number.isFinite(avgMs) && avgMs >= 0) {
    return avgMs;
  }
  return null;
}

/**
 * Returns theme-token styles reflecting response speed (`<= 5m` fast, `<= 15m` good, `<= 60m` moderate, `> 60m` slow).
 */
export function getResponseSpeedTone(ms: number | null | undefined): StatusTokenMeta {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) {
    return {
      label: "No replies",
      bgVar: "var(--label-slate-bg)",
      borderVar: "var(--label-slate-border)",
      textVar: "var(--label-slate-text)",
      dotVar: "var(--label-slate-dot)",
    };
  }
  if (ms <= 5 * 60_000) {
    return {
      label: "Fast",
      bgVar: "var(--label-green-bg)",
      borderVar: "var(--label-green-border)",
      textVar: "var(--label-green-text)",
      dotVar: "var(--label-green-dot)",
    };
  }
  if (ms <= 15 * 60_000) {
    return {
      label: "On target",
      bgVar: "var(--label-blue-bg)",
      borderVar: "var(--label-blue-border)",
      textVar: "var(--label-blue-text)",
      dotVar: "var(--label-blue-dot)",
    };
  }
  if (ms <= 60 * 60_000) {
    return {
      label: "Moderate",
      bgVar: "var(--label-amber-bg)",
      borderVar: "var(--label-amber-border)",
      textVar: "var(--label-amber-text)",
      dotVar: "var(--label-amber-dot)",
    };
  }
  return {
    label: "Slow",
    bgVar: "var(--label-red-bg)",
    borderVar: "var(--label-red-border)",
    textVar: "var(--label-red-text)",
    dotVar: "var(--label-red-dot)",
  };
}

/**
 * Builds case-insensitive lookup maps for agent performance stats by name and userId.
 */
export function buildAgentMetricsLookup(
  agents: ReadonlyArray<AgentPerformanceStats> | null | undefined
): {
  byNameLower: Map<string, AgentPerformanceStats>;
  byUserId: Map<string, AgentPerformanceStats>;
} {
  const byNameLower = new Map<string, AgentPerformanceStats>();
  const byUserId = new Map<string, AgentPerformanceStats>();
  if (!Array.isArray(agents)) return { byNameLower, byUserId };

  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    if (!a) continue;
    const cleanName = (a.name || "").trim().toLowerCase();
    if (cleanName && !byNameLower.has(cleanName)) {
      byNameLower.set(cleanName, a);
    }
    if (a.userId) {
      byUserId.set(String(a.userId), a);
    }
  }
  return { byNameLower, byUserId };
}

const SCREEN_THEME_META: Record<string, StatusTokenMeta & ScreenRef> = {
  inbox: {
    screen: "inbox",
    label: "Inbox",
    path: "/",
    bgVar: "var(--label-blue-bg)",
    borderVar: "var(--label-blue-border)",
    textVar: "var(--label-blue-text)",
    dotVar: "var(--label-blue-dot)",
  },
  pipeline: {
    screen: "pipeline",
    label: "Pipeline",
    path: "/pipeline",
    bgVar: "var(--label-indigo-bg)",
    borderVar: "var(--label-indigo-border)",
    textVar: "var(--label-indigo-text)",
    dotVar: "var(--label-indigo-dot)",
  },
  leads: {
    screen: "leads",
    label: "Leads",
    path: "/leads",
    bgVar: "var(--label-amber-bg)",
    borderVar: "var(--label-amber-border)",
    textVar: "var(--label-amber-text)",
    dotVar: "var(--label-amber-dot)",
  },
  auditions: {
    screen: "auditions",
    label: "Auditions",
    path: "/auditions",
    bgVar: "var(--label-green-bg)",
    borderVar: "var(--label-green-border)",
    textVar: "var(--label-green-text)",
    dotVar: "var(--label-green-dot)",
  },
  followups: {
    screen: "followups",
    label: "Follow-ups",
    path: "/follow-ups",
    bgVar: "var(--label-red-bg)",
    borderVar: "var(--label-red-border)",
    textVar: "var(--label-red-text)",
    dotVar: "var(--label-red-dot)",
  },
  reports: {
    screen: "reports",
    label: "Reports",
    path: "/reports",
    bgVar: "var(--label-purple-bg)",
    borderVar: "var(--label-purple-border)",
    textVar: "var(--label-purple-text)",
    dotVar: "var(--label-purple-dot)",
  },
  team_performance: {
    screen: "team_performance",
    label: "Team Activities",
    path: "/team-performance",
    bgVar: "var(--label-teal-bg)",
    borderVar: "var(--label-teal-border)",
    textVar: "var(--label-teal-text)",
    dotVar: "var(--label-teal-dot)",
  },
  profile: {
    screen: "profile",
    label: "Profile",
    path: "/profile",
    bgVar: "var(--label-orange-bg)",
    borderVar: "var(--label-orange-border)",
    textVar: "var(--label-orange-text)",
    dotVar: "var(--label-orange-dot)",
  },
  settings: {
    screen: "settings",
    label: "Settings",
    path: "/settings",
    bgVar: "var(--label-slate-bg)",
    borderVar: "var(--label-slate-border)",
    textVar: "var(--label-slate-text)",
    dotVar: "var(--label-slate-dot)",
  },
  other: {
    screen: "other",
    label: "Other CRM",
    path: "",
    bgVar: "var(--label-slate-bg)",
    borderVar: "var(--label-slate-border)",
    textVar: "var(--label-slate-text)",
    dotVar: "var(--label-slate-dot)",
  },
};

/**
 * Returns canonical label, route path, and CSS theme tokens for a CRM screen key.
 */
export function getScreenThemeMeta(screenKey?: string | null): StatusTokenMeta & ScreenRef {
  const clean = (screenKey || "").trim();
  if (clean && SCREEN_THEME_META[clean]) {
    return SCREEN_THEME_META[clean];
  }
  return {
    ...SCREEN_THEME_META.other,
    screen: clean || "other",
    label: clean || "CRM",
  };
}

/**
 * Normalizes and ranks per-screen active durations with clean share percentages.
 */
export function buildScreenTimeRows(
  screens: ReadonlyArray<ScreenTimeEntry> | null | undefined,
  totalActiveMs?: number | null
): ScreenBreakdownRow[] {
  if (!Array.isArray(screens) || screens.length === 0) return [];
  let sumScreens = 0;
  for (let i = 0; i < screens.length; i++) {
    sumScreens += Math.max(0, Number(screens[i]?.activeMs) || 0);
  }
  const denominator =
    sumScreens > 0
      ? Math.max(sumScreens, Math.max(0, Number(totalActiveMs) || 0))
      : 0;

  return screens
    .filter((s) => s && s.screen)
    .map((s) => {
      const activeMs = Math.max(0, Number(s.activeMs) || 0);
      const theme = getScreenThemeMeta(s.screen);
      const sharePct =
        denominator > 0 ? Math.min(100, Math.round((activeMs / denominator) * 100)) : 0;
      return {
        screen: s.screen,
        label: s.label || theme.label,
        path: s.path || theme.path,
        activeMs,
        lastSeenAt: Number(s.lastSeenAt) || 0,
        sharePct,
        dotVar: theme.dotVar,
        bgVar: theme.bgVar,
        borderVar: theme.borderVar,
        textVar: theme.textVar,
      };
    })
    .sort((a, b) =>
      b.activeMs !== a.activeMs ? b.activeMs - a.activeMs : b.lastSeenAt - a.lastSeenAt
    );
}

/**
 * Formats a compact live status string combining availability and current CRM screen.
 */
export function formatPresenceWithScreen(
  status?: PresenceStatus | null,
  currentScreenLabel?: string | null
): string {
  const meta = getPresenceStatusMeta(status);
  if (status !== "offline" && currentScreenLabel) {
    return `${meta.label} · ${currentScreenLabel}`;
  }
  return meta.label;
}

/**
 * Applies a live SSE presence update onto an existing TeamMetricsPayload without dropping response stats.
 */
export function applyLivePresenceToMetrics(
  payload: TeamMetricsPayload | null,
  liveByUserId: ReadonlyMap<string, LivePresenceEntry>
): TeamMetricsPayload | null {
  if (!payload || liveByUserId.size === 0) return payload;

  let changed = false;
  const nextAgents = payload.agents.map((agent) => {
    if (!agent.userId) return agent;
    const live = liveByUserId.get(String(agent.userId));
    if (!live) return agent;
    const nextScreen = live.currentScreen !== undefined ? live.currentScreen : agent.currentScreen || null;
    const nextScreenLabel =
      live.currentScreen !== undefined ? live.currentScreenLabel || null : agent.currentScreenLabel || null;
    const nextScreenPath =
      live.currentScreen !== undefined ? live.currentScreenPath || null : agent.currentScreenPath || null;
    const nextActiveScreens =
      live.activeScreens !== undefined ? live.activeScreens : agent.activeScreens || [];

    if (
      agent.status === live.status &&
      (agent.currentScreen || null) === (nextScreen || null) &&
      (agent.currentScreenLabel || null) === (nextScreenLabel || null) &&
      agent.lastSeenAt >= live.lastSeenAt &&
      agent.lastActiveAt >= live.lastActiveAt
    ) {
      return agent;
    }
    changed = true;
    return {
      ...agent,
      status: live.status,
      currentScreen: nextScreen,
      currentScreenLabel: nextScreenLabel,
      currentScreenPath: nextScreenPath,
      activeScreens: nextActiveScreens,
      lastSeenAt: Math.max(agent.lastSeenAt, live.lastSeenAt),
      lastActiveAt: Math.max(agent.lastActiveAt, live.lastActiveAt),
    };
  });

  if (!changed) return payload;

  let onlineCount = 0;
  let awayCount = 0;
  for (let i = 0; i < nextAgents.length; i++) {
    if (nextAgents[i].status === "online") onlineCount += 1;
    else if (nextAgents[i].status === "away") awayCount += 1;
  }

  return {
    ...payload,
    team: {
      ...payload.team,
      onlineCount,
      awayCount,
    },
    agents: nextAgents,
  };
}

/**
 * Filters and sorts Response Audit rows deterministically.
 */
export function filterAndSortResponseAuditRows(
  rows: ReadonlyArray<ResponseAuditRow>,
  {
    searchQuery = "",
    sortBy = "newest",
  }: { searchQuery?: string; sortBy?: ResponseAuditSort } = {}
): ResponseAuditRow[] {
  const q = searchQuery.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) => {
        return (
          r.leadName.toLowerCase().includes(q) ||
          r.channel.toLowerCase().includes(q) ||
          (r.agentName || "").toLowerCase().includes(q) ||
          r.conversationId.toLowerCase().includes(q)
        );
      })
    : rows.slice();

  filtered.sort((a, b) => {
    switch (sortBy) {
      case "slowest":
        return b.responseMs !== a.responseMs ? b.responseMs - a.responseMs : b.repliedAt - a.repliedAt;
      case "fastest":
        return a.responseMs !== b.responseMs ? a.responseMs - b.responseMs : b.repliedAt - a.repliedAt;
      case "oldest":
        return a.repliedAt - b.repliedAt;
      case "newest":
      default:
        return b.repliedAt - a.repliedAt;
    }
  });

  return filtered;
}

