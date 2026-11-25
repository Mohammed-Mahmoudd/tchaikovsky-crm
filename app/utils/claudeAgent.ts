export interface ClaudeConnectionStatus {
  hasApiKey: boolean;
  hasAgentId: boolean;
  agentIdSource: "env" | "synced" | "none";
  agentId: string | null;
  hasEnvironmentId: boolean;
  dryRun: boolean;
}

export interface ClaudeBranchConfig {
  _id?: string;
  city: string;
  branchName: string;
  displayName: string;
  landmark: string;
  mapUrl: string;
  schoolManagerName: string;
  weekdaySlots: string[];
  weekendSlots: string[];
  closedDates: string[];
  active: boolean;
}

export interface ClaudeSettingsData {
  enabled: boolean;
  pauseOnHumanReply: boolean;
  allowAutoBooking: boolean;
  allowLeadUpdates: boolean;
  allowWhatsAppEscalation: boolean;
  escalationPhone: string;
  existingStudentLabelName: string;
  environmentId?: string;
  lastSyncedAgentId?: string;
  branches: ClaudeBranchConfig[];
}

export interface PlatformAgentInfo {
  id: string;
  name: string;
  description: string;
  model: string;
  system: string;
  version: number;
  updatedAt: string | null;
  attachedCrmTools: string[];
  hasAllCrmTools: boolean;
}

export interface ClaudeModelOption {
  id: string;
  label: string;
}

export interface ClaudeStatusPayload {
  connection: ClaudeConnectionStatus;
  settings: ClaudeSettingsData;
  platformAgent: PlatformAgentInfo | null;
  platformError: string | null;
  availableModels: ClaudeModelOption[];
  playbookDefaults: {
    name: string;
    model: string;
    system: string;
  };
}

export interface ClaudeLeadRow {
  senderId: string;
  name?: string;
  leadName?: string;
  phone?: string;
  channel: string;
  branch?: string;
  pipeline?: string;
  claudeEnabled: boolean;
  claudePaused: boolean;
  claudePausedReason?: string;
  claudePausedAt?: string | null;
  claudeLastRepliedAt?: string | null;
  claudeLastError?: string;
  lastMessageAt?: number;
  lastMessageText?: string;
}

export interface ClaudeToolTrace {
  name: string;
  input: Record<string, unknown>;
  output: unknown;
  isError: boolean;
}

export interface ClaudeSandboxTurnResult {
  sessionId: string;
  reply: string;
  silentNoReply: boolean;
  toolTraces: ClaudeToolTrace[];
  simulatedUpdates: Array<Record<string, unknown>>;
}

export interface LeadClaudeStatusMeta {
  state: "active" | "paused" | "off" | "global_off";
  label: string;
  description: string;
  bgVar: string;
  borderVar: string;
  textVar: string;
  dotVar: string;
}

/** Formats internal pause reason codes into calm, readable CRM copy. */
export function formatClaudePausedReason(reason?: string | null): string {
  const clean = typeof reason === "string" ? reason.trim() : "";
  if (!clean) return "Paused";
  if (clean === "staff_replied") return "Paused after staff reply";
  if (clean === "manual_pause") return "Paused manually";
  if (clean.startsWith("escalated:")) {
    const type = clean.slice("escalated:".length).trim() || "Human";
    return `Escalated (${type})`;
  }
  return `Paused (${clean})`;
}

/** Computes theme-token badge metadata for a lead's Claude AI status. */
export function getLeadClaudeStatusMeta(params: {
  claudeEnabled?: boolean;
  claudePaused?: boolean;
  claudePausedReason?: string;
  globalEnabled?: boolean | null;
}): LeadClaudeStatusMeta {
  if (!params.claudeEnabled) {
    return {
      state: "off",
      label: "Off",
      description: "Adham will not reply automatically to this lead.",
      bgVar: "var(--label-slate-bg)",
      borderVar: "var(--label-slate-border)",
      textVar: "var(--label-slate-text)",
      dotVar: "var(--label-slate-dot)",
    };
  }

  if (params.claudePaused) {
    return {
      state: "paused",
      label: "Paused",
      description: formatClaudePausedReason(params.claudePausedReason),
      bgVar: "var(--label-amber-bg)",
      borderVar: "var(--label-amber-border)",
      textVar: "var(--label-amber-text)",
      dotVar: "var(--label-amber-dot)",
    };
  }

  if (params.globalEnabled === false) {
    return {
      state: "global_off",
      label: "Master off",
      description: "Lead is enabled, but global Claude auto-reply is turned off in Settings.",
      bgVar: "var(--label-blue-bg)",
      borderVar: "var(--label-blue-border)",
      textVar: "var(--label-blue-text)",
      dotVar: "var(--label-blue-dot)",
    };
  }

  return {
    state: "active",
    label: "Active",
    description: "Adham replies automatically to new incoming messages from this lead.",
    bgVar: "var(--label-green-bg)",
    borderVar: "var(--label-green-border)",
    textVar: "var(--label-green-text)",
    dotVar: "var(--label-green-dot)",
  };
}

/** Parses comma-separated slot times entered by staff into trimmed strings. */
export function parseSlotListInput(raw: string): string[] {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Formats an array of slot strings for a single-line input control. */
export function formatSlotListInput(slots?: ReadonlyArray<string>): string {
  return Array.isArray(slots) ? slots.join(", ") : "";
}

/** Parses comma- or space-separated YYYY-MM-DD closed dates and deduplicates them. */
export function parseClosedDatesInput(raw: string): string[] {
  const out: string[] = [];
  for (const token of String(raw || "").split(/[\s,]+/)) {
    const clean = token.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean) && !out.includes(clean)) {
      out.push(clean);
    }
  }
  return out;
}

/** Formats YYYY-MM-DD closed dates for editing. */
export function formatClosedDatesInput(dates?: ReadonlyArray<string>): string {
  return Array.isArray(dates) ? dates.join(", ") : "";
}

export type ClaudeSubTab =
  | "overview"
  | "activity"
  | "skills"
  | "sandbox"
  | "leads"
  | "studio";

/** Resolves the Settings → Claude sub-tab from the current URL hash. */
export function resolveClaudeSubTabFromHash(hash?: string | null): ClaudeSubTab {
  const clean = String(hash || "").trim().toLowerCase();
  if (clean === "#claude-activity") return "activity";
  if (clean === "#claude-skills") return "skills";
  if (clean === "#claude-sandbox") return "sandbox";
  if (clean === "#claude-leads") return "leads";
  if (clean === "#claude-studio") return "studio";
  return "overview";
}

/** Returns the canonical URL hash string for a Settings → Claude sub-tab. */
export function getHashForClaudeSubTab(tab: ClaudeSubTab): string {
  if (tab === "activity") return "claude-activity";
  if (tab === "skills") return "claude-skills";
  if (tab === "sandbox") return "claude-sandbox";
  if (tab === "leads") return "claude-leads";
  if (tab === "studio") return "claude-studio";
  return "claude";
}

export type ClaudeAssignmentFilter =
  | "all"
  | "unassigned"
  | "assigned"
  | "active"
  | "paused"
  | "errors";

export interface ClaudeLeadCandidateLike {
  id: string;
  senderId?: string;
  channel?: string;
  pipeline?: string;
  branch?: string;
  isArchived?: boolean;
  isDone?: boolean;
  lastMessageAt?: number;
  claudeEnabled?: boolean;
  claudePaused?: boolean;
  claudePausedReason?: string;
  claudePausedAt?: string | null;
  claudeLastRepliedAt?: string | null;
  claudeLastError?: string;
}

export interface ClaudeLeadCounts {
  totalAssigned: number;
  activeCount: number;
  pausedCount: number;
  errorCount: number;
}

/** Computes summary counts across leads assigned or tracked by Adham AI. */
export function summarizeClaudeLeadCounts(
  leads: ReadonlyArray<{
    claudeEnabled?: boolean;
    claudePaused?: boolean;
    claudeLastError?: string;
  }>
): ClaudeLeadCounts {
  let totalAssigned = 0;
  let activeCount = 0;
  let pausedCount = 0;
  let errorCount = 0;

  for (const lead of leads) {
    if (lead.claudeEnabled) {
      totalAssigned += 1;
      if (lead.claudePaused) {
        pausedCount += 1;
      } else {
        activeCount += 1;
      }
    }
    if (typeof lead.claudeLastError === "string" && lead.claudeLastError.trim()) {
      errorCount += 1;
    }
  }

  return { totalAssigned, activeCount, pausedCount, errorCount };
}

/** Filters and sorts CRM conversations for the dedicated Adham Lead Assignment page. */
export function filterClaudeLeadCandidates<T extends ClaudeLeadCandidateLike>(
  items: ReadonlyArray<T>,
  options: {
    assignmentFilter?: ClaudeAssignmentFilter;
    channelFilter?: string;
    stageFilter?: string;
    branchFilter?: string;
    includeClosedBuckets?: boolean;
    matchesQuery?: (item: T) => boolean;
  }
): T[] {
  const {
    assignmentFilter = "all",
    channelFilter = "ALL",
    stageFilter = "ALL",
    branchFilter = "ALL",
    includeClosedBuckets = false,
    matchesQuery,
  } = options;

  const filtered = items.filter((item) => {
    if (!includeClosedBuckets && (item.isArchived || item.isDone)) {
      return false;
    }

    const enabled = Boolean(item.claudeEnabled);
    const paused = Boolean(item.claudePaused);
    const hasError = Boolean(item.claudeLastError && item.claudeLastError.trim());

    if (assignmentFilter === "assigned" && !enabled) return false;
    if (assignmentFilter === "unassigned" && enabled) return false;
    if (assignmentFilter === "active" && (!enabled || paused)) return false;
    if (assignmentFilter === "paused" && (!enabled || !paused)) return false;
    if (assignmentFilter === "errors" && !hasError) return false;

    if (channelFilter !== "ALL" && item.channel !== channelFilter) return false;
    if (stageFilter !== "ALL" && (item.pipeline || "") !== stageFilter) return false;

    if (branchFilter !== "ALL") {
      const cleanBranch = (item.branch || "").trim();
      if (branchFilter === "__none__") {
        if (cleanBranch) return false;
      } else if (cleanBranch !== branchFilter) {
        return false;
      }
    }

    if (matchesQuery && !matchesQuery(item)) return false;
    return true;
  });

  return filtered.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
}

/** Merges server `/claude/leads` rows with live CRMContext conversation state without duplicates. */
export function mergeAssignedClaudeLeads(
  serverLeads: ReadonlyArray<ClaudeLeadRow>,
  liveConversations: ReadonlyArray<
    ClaudeLeadCandidateLike & {
      name?: string;
      leadName?: string;
      phone?: string;
      lastMessageText?: string;
    }
  >
): ClaudeLeadRow[] {
  const byId = new Map<string, ClaudeLeadRow>();

  for (const row of serverLeads) {
    if (!row?.senderId) continue;
    byId.set(row.senderId, row);
  }

  for (const conv of liveConversations) {
    const id = conv.senderId || conv.id;
    if (!id) continue;
    const isTracked =
      Boolean(conv.claudeEnabled) ||
      Boolean(conv.claudePaused) ||
      Boolean(conv.claudeLastError && conv.claudeLastError.trim());
    const existing = byId.get(id);

    if (existing) {
      // If local state turned it off or paused it more recently via SSE/PATCH, reflect live status fields
      byId.set(id, {
        ...existing,
        name: conv.name || existing.name,
        leadName: conv.leadName || existing.leadName,
        phone: conv.phone || existing.phone,
        branch: conv.branch ?? existing.branch,
        pipeline: conv.pipeline ?? existing.pipeline,
        claudeEnabled: Boolean(conv.claudeEnabled),
        claudePaused: Boolean(conv.claudePaused),
        claudePausedReason: conv.claudePausedReason ?? existing.claudePausedReason,
        claudePausedAt: conv.claudePausedAt ?? existing.claudePausedAt,
        claudeLastRepliedAt: conv.claudeLastRepliedAt ?? existing.claudeLastRepliedAt,
        claudeLastError: conv.claudeLastError ?? existing.claudeLastError,
        lastMessageAt: Math.max(conv.lastMessageAt || 0, existing.lastMessageAt || 0) || undefined,
        lastMessageText: conv.lastMessageText || existing.lastMessageText,
      });
    } else if (isTracked) {
      byId.set(id, {
        senderId: id,
        name: conv.name,
        leadName: conv.leadName,
        phone: conv.phone,
        channel: conv.channel || "WA",
        branch: conv.branch,
        pipeline: conv.pipeline,
        claudeEnabled: Boolean(conv.claudeEnabled),
        claudePaused: Boolean(conv.claudePaused),
        claudePausedReason: conv.claudePausedReason,
        claudePausedAt: conv.claudePausedAt,
        claudeLastRepliedAt: conv.claudeLastRepliedAt,
        claudeLastError: conv.claudeLastError,
        lastMessageAt: conv.lastMessageAt,
        lastMessageText: conv.lastMessageText,
      });
    }
  }

  return Array.from(byId.values())
    .filter(
      (l) =>
        Boolean(l.claudeEnabled) ||
        Boolean(l.claudePaused) ||
        Boolean(l.claudeLastError && l.claudeLastError.trim())
    )
    .sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
}

const TOOL_DISPLAY_LABELS: Record<string, string> = {
  get_lead_profile: "Checked lead CRM profile",
  get_audition_availability: "Checked open discovery slots",
  book_discovery_session: "Booked discovery session (simulated)",
  update_lead_details: "Updated lead CRM details (simulated)",
  escalate_to_human: "Escalated to human admission officer (simulated)",
  get_skill_guidance: "Loaded trained skill guidance",
};

/** Formats Managed Agent tool names into friendly disclosure labels in the Sandbox. */
export function formatToolTraceTitle(name: string): string {
  return TOOL_DISPLAY_LABELS[name] || `Used ${name}`;
}

export type ClaudeActivityOutcome =
  | "replied"
  | "booked"
  | "updated"
  | "escalated"
  | "silent"
  | "error";

export type ClaudeActivityFilter = "all" | "attention" | ClaudeActivityOutcome;
export type ClaudeActivityWindow = "24h" | "all";

export interface ClaudeActivityItem {
  _id: string;
  senderId: string;
  leadName?: string;
  channel: string;
  branch?: string;
  pipeline?: string;
  sessionId?: string;
  incomingText: string;
  replyText: string;
  outcome: ClaudeActivityOutcome;
  actionSummary?: string;
  skillsUsed?: string[];
  toolTraces?: ClaudeToolTrace[];
  errorMessage?: string;
  durationMs?: number;
  createdAt: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Filters cached live-activity items client-side for instant filter/window switches before revalidation. */
export function filterCachedActivityItems(
  items: ReadonlyArray<ClaudeActivityItem>,
  options: {
    outcome?: ClaudeActivityFilter;
    window?: ClaudeActivityWindow;
    search?: string;
    nowMs?: number;
  }
): ClaudeActivityItem[] {
  const { outcome = "all", window = "all", search = "", nowMs = Date.now() } = options;
  const cleanSearch = search.trim().toLowerCase();
  const cutoff = nowMs - DAY_MS;

  return items.filter((item) => {
    if (outcome === "attention") {
      if (item.outcome !== "escalated" && item.outcome !== "error") return false;
    } else if (outcome !== "all" && item.outcome !== outcome) {
      return false;
    }

    if (window === "24h") {
      const ts = item.createdAt ? new Date(item.createdAt).getTime() : 0;
      if (!Number.isFinite(ts) || ts < cutoff) return false;
    }

    if (cleanSearch) {
      const haystack = [
        item.leadName,
        item.senderId,
        item.branch,
        item.incomingText,
        item.replyText,
        item.actionSummary,
        ...(Array.isArray(item.skillsUsed) ? item.skillsUsed : []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(cleanSearch)) return false;
    }

    return true;
  });
}

/** Returns assigned/paused leads currently requiring staff attention (errors first, then escalations). */
export function selectAttentionLeads(leads: ReadonlyArray<ClaudeLeadRow>): ClaudeLeadRow[] {
  const filtered = leads.filter((lead) => {
    const hasError = Boolean(lead.claudeLastError && lead.claudeLastError.trim());
    const isEscalatedPause =
      Boolean(lead.claudeEnabled) &&
      Boolean(lead.claudePaused) &&
      typeof lead.claudePausedReason === "string" &&
      lead.claudePausedReason.startsWith("escalated:");
    return hasError || isEscalatedPause;
  });

  return filtered.sort((a, b) => {
    const aErr = Boolean(a.claudeLastError && a.claudeLastError.trim()) ? 1 : 0;
    const bErr = Boolean(b.claudeLastError && b.claudeLastError.trim()) ? 1 : 0;
    if (aErr !== bErr) return bErr - aErr;
    return (b.lastMessageAt || 0) - (a.lastMessageAt || 0);
  });
}

/** Formats a skill slug into a calm readable label for expandable details. */
export function formatSkillDisplayLabel(slug: string): string {
  const clean = String(slug || "").trim();
  if (!clean) return "";
  const words = clean.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface ClaudeActivitySummary {
  total: number;
  replied: number;
  booked: number;
  updated: number;
  escalated: number;
  silent: number;
  error: number;
}

export interface ClaudeSkillItem {
  _id: string;
  slug: string;
  title: string;
  whenToUse: string;
  instructions: string;
  examples?: string;
  enabled: boolean;
  usageCount: number;
  lastUsedAt?: string | null;
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Maps a live turn outcome to a calm label and theme pill tone. */
export function getActivityOutcomeMeta(outcome: ClaudeActivityOutcome): {
  label: string;
  tone: "green" | "blue" | "amber" | "red" | "slate";
} {
  if (outcome === "booked") return { label: "Booked session", tone: "green" };
  if (outcome === "escalated") return { label: "Escalated", tone: "amber" };
  if (outcome === "silent") return { label: "Silent handoff", tone: "slate" };
  if (outcome === "updated") return { label: "Updated CRM", tone: "blue" };
  if (outcome === "error") return { label: "Error", tone: "red" };
  return { label: "Replied", tone: "blue" };
}

/** Formats turn latency in milliseconds into a compact readable string. */
export function formatDurationLabel(durationMs?: number): string {
  const ms = Number(durationMs || 0);
  if (!Number.isFinite(ms) || ms <= 0) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Splits Adham replies into 1 or 2 display bubbles when [[SPLIT]] is present. */
export function splitDisplayReplyChunks(replyText?: string | null): string[] {
  const clean = String(replyText || "").trim();
  if (!clean) return [];
  if (!/\[\[SPLIT\]\]/i.test(clean)) return [clean];
  const parts = clean
    .split(/\[\[SPLIT\]\]/i)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length <= 1) return parts;
  const first = parts[0];
  const second = parts.slice(1).join("\n\n").trim();
  return second ? [first, second] : [first];
}

export interface ClaudeActivationNoteResult {
  message: string;
  tone: "info" | "warning";
}

/** Formats user-facing feedback when enabling or resuming Adham AI on a lead. */
export function formatClaudeActivationNote(
  verb: "Enabled" | "Resumed",
  res: { autoReplyTriggered?: boolean; autoReplySkippedReason?: string | null }
): ClaudeActivationNoteResult {
  if (res.autoReplyTriggered) {
    return {
      message: `${verb}. Adham is reading the chat and replying now.`,
      tone: "info",
    };
  }
  if (res.autoReplySkippedReason === "meta_7d_window_expired") {
    return {
      message: `${verb} for future replies — Meta's 7-day Messenger/Instagram window expired, so Adham cannot auto-reply until the lead messages again.`,
      tone: "warning",
    };
  }
  if (res.autoReplySkippedReason === "meta_24h_window_expired") {
    return {
      message: `${verb} for future replies — Meta's 24-hour Messenger/Instagram window expired, so Adham cannot auto-reply until the lead messages again.`,
      tone: "warning",
    };
  }
  if (res.autoReplySkippedReason === "global_disabled") {
    return {
      message: `${verb} for this lead (Global Auto-Reply is OFF in Settings).`,
      tone: "warning",
    };
  }
  if (res.autoReplySkippedReason === "lead_archived") {
    return {
      message: `${verb} for this lead (archived chats do not receive auto-replies).`,
      tone: "warning",
    };
  }
  if (res.autoReplySkippedReason === "service_unavailable") {
    return {
      message: `${verb} for this lead (auto-reply service is currently unavailable).`,
      tone: "warning",
    };
  }
  return {
    message: `${verb} for this lead.`,
    tone: "info",
  };
}

