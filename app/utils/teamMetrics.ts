import type { CashEntry } from "./leadCash";
import {
  computeActiveCashTotal,
  resolveConversationCashPayments,
} from "./leadCashHelpers.mjs";

export interface ActivityLogEntryLike {
  id: string;
  type: string;
  actor?: string;
  toValue?: string;
  timestamp: number;
}

export interface ConversationSourceLike {
  auditionBookedAt?: string;
  attendedAt?: string;
  enrolledAt?: string;
  paidAt?: string;
  bookedBy?: string;
  attendedBy?: string;
  enrolledBy?: string;
  activityLog?: ReadonlyArray<ActivityLogEntryLike>;
}

export interface TeamConversationLike {
  pipeline?: string;
  auditionDate?: string;
  auditionOutcome?: string;
  auditionBookedAt?: string;
  attendedAt?: string;
  enrolledAt?: string;
  paidAt?: string;
  cashIn?: number;
  cashRecordedBy?: string;
  cashEntries?: ReadonlyArray<CashEntry>;
  createdAt?: string;
  updatedAt?: string;
  lastMessageAt?: number;
  source?: ConversationSourceLike | string;
  activityLog?: ReadonlyArray<ActivityLogEntryLike>;
}

export interface LoggedMessageKeys {
  ids: Set<string>;
  fallbackTimestamps: Set<number>;
}

export const ATTENDED_OUTCOMES = new Set([
  "registered",
  "paid-trial",
  "schedule-followup",
  "attended",
  "passed",
]);

export const BOOKED_PIPELINES = new Set([
  "audition booked",
  "attended",
  "enrolled",
]);

export const ATTENDED_PIPELINES = new Set([
  "attended",
  "enrolled",
]);

/** Returns true when an assigned agent name represents a real staff member (not a placeholder). */
export function isRealAssignedAgent(agent?: string | null): boolean {
  const clean = (agent || "").trim();
  return Boolean(clean) && clean !== "Unassigned" && clean !== "Staff" && clean !== "System";
}

/** Parses an ISO date string or epoch millisecond value into a finite epoch timestamp, or 0. */
export function parseValidTs(val?: string | number | null): number {
  if (val === undefined || val === null || val === "") return 0;
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  const t = Date.parse(val);
  return Number.isFinite(t) ? t : 0;
}

/** Returns which conversation field supplied `getCreatedTime` so audits can verify cohort dates. */
export function getCreatedTimeSource(
  c: TeamConversationLike
): "createdAt" | "lastMessageAt" | "updatedAt" | "unknown" {
  if (parseValidTs(c.createdAt) > 0) return "createdAt";
  if (c.lastMessageAt && Number.isFinite(c.lastMessageAt)) return "lastMessageAt";
  if (parseValidTs(c.updatedAt) > 0) return "updatedAt";
  return "unknown";
}

/** Returns the best creation timestamp for a conversation. */
export function getCreatedTime(c: TeamConversationLike): number {
  const created = parseValidTs(c.createdAt);
  if (created > 0) return created;
  if (c.lastMessageAt && Number.isFinite(c.lastMessageAt)) return c.lastMessageAt;
  return parseValidTs(c.updatedAt);
}

/** Returns the best last-updated timestamp for a conversation, falling back to creation time. */
export function getUpdatedTime(c: TeamConversationLike): number {
  const updated = parseValidTs(c.updatedAt);
  if (updated > 0) return updated;
  return getCreatedTime(c);
}

function getSourceObject(c: TeamConversationLike): ConversationSourceLike | null {
  return typeof c.source === "object" && c.source !== null ? c.source : null;
}

function findEarliestActivityTs(
  c: TeamConversationLike,
  predicate: (entry: ActivityLogEntryLike) => boolean
): number | null {
  const src = getSourceObject(c);
  const logs = [c.activityLog, src?.activityLog];
  let earliest: number | null = null;
  for (let l = 0; l < logs.length; l++) {
    const list = logs[l];
    if (!Array.isArray(list)) continue;
    for (let i = 0; i < list.length; i++) {
      const entry = list[i];
      if (!entry || !entry.timestamp || !Number.isFinite(entry.timestamp) || entry.timestamp <= 0) continue;
      if (!predicate(entry)) continue;
      if (earliest === null || entry.timestamp < earliest) {
        earliest = entry.timestamp;
      }
    }
  }
  return earliest;
}

function getEffectiveCashIn(c: TeamConversationLike): number {
  if (Array.isArray(c.cashEntries) && c.cashEntries.length > 0) {
    return computeActiveCashTotal(c);
  }
  return Math.round((Number(c.cashIn) || 0) * 100) / 100;
}

/**
 * Returns true if the lead's pipeline stage is Attended or Enrolled (Option A cumulative pipeline).
 */
export function isAttendedLead(c: TeamConversationLike): boolean {
  const p = (c.pipeline || "").toLowerCase().trim();
  return ATTENDED_PIPELINES.has(p);
}

/**
 * Returns true if the lead's pipeline stage is Audition Booked, Attended, or Enrolled (Option A cumulative pipeline).
 */
export function isBookedLead(c: TeamConversationLike): boolean {
  const p = (c.pipeline || "").toLowerCase().trim();
  return BOOKED_PIPELINES.has(p);
}

/**
 * Returns true if the lead's pipeline stage is Enrolled (Option A strict pipeline).
 */
export function isConvertedLead(c: TeamConversationLike): boolean {
  const p = (c.pipeline || "").toLowerCase().trim();
  return p === "enrolled";
}

/** Resolves the canonical booking timestamp for period filtering. */
export function getBookedTime(c: TeamConversationLike): number | null {
  if (!isBookedLead(c)) return null;
  const src = getSourceObject(c);
  const explicit = parseValidTs(c.auditionBookedAt || src?.auditionBookedAt);
  if (explicit > 0) return explicit;

  const logTs = findEarliestActivityTs(c, (e) => e.type === "audition_booked");
  if (logTs !== null) return logTs;

  const p = (c.pipeline || "").toLowerCase().trim();
  if (p === "audition booked") {
    const upd = getUpdatedTime(c);
    if (c.auditionDate && /^\d{4}-\d{2}-\d{2}$/.test(c.auditionDate)) {
      const [y, m, d] = c.auditionDate.split("-").map(Number);
      if (y >= 2020) {
        const auditionDayEnd = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
        if (upd > auditionDayEnd) {
          return Math.min(getCreatedTime(c), auditionDayEnd);
        }
      }
    }
    return upd;
  }

  if (isAttendedLead(c)) return getAttendedTime(c);
  return getCreatedTime(c);
}

/** Resolves the canonical attendance timestamp for period filtering. */
export function getAttendedTime(c: TeamConversationLike): number | null {
  if (!isAttendedLead(c)) return null;
  const src = getSourceObject(c);
  const explicit = parseValidTs(c.attendedAt || src?.attendedAt);
  if (explicit > 0) return explicit;

  if (c.auditionDate && /^\d{4}-\d{2}-\d{2}$/.test(c.auditionDate)) {
    const [y, m, d] = c.auditionDate.split("-").map(Number);
    if (y >= 2020) {
      return new Date(y, m - 1, d, 14, 0, 0, 0).getTime();
    }
  }

  const logTs = findEarliestActivityTs(
    c,
    (e) =>
      (e.type === "stage_changed" && ATTENDED_PIPELINES.has((e.toValue || "").toLowerCase().trim())) ||
      (e.type === "audition_outcome" && ATTENDED_OUTCOMES.has((e.toValue || "").toLowerCase().trim()))
  );
  if (logTs !== null) return logTs;

  if (isConvertedLead(c)) {
    return getConvertedTime(c);
  }

  return getUpdatedTime(c);
}

/** Resolves the canonical enrollment timestamp for period filtering. */
export function getConvertedTime(c: TeamConversationLike): number | null {
  if (!isConvertedLead(c)) return null;
  const src = getSourceObject(c);
  const explicit = parseValidTs(c.enrolledAt || c.paidAt || src?.enrolledAt || src?.paidAt);
  if (explicit > 0) return explicit;

  const logTs = findEarliestActivityTs(
    c,
    (e) =>
      (e.type === "stage_changed" && (e.toValue || "").toLowerCase().trim() === "enrolled") ||
      (e.type === "audition_outcome" && (e.toValue || "").toLowerCase().trim() === "registered")
  );
  if (logTs !== null) return logTs;

  return getUpdatedTime(c);
}

/** Computes a percentage clamped to [0, 100], returning 0 when denominator <= 0. */
export function clampRatePct(numerator: number, denominator: number): number {
  if (!denominator || denominator <= 0 || !numerator || numerator <= 0) return 0;
  return Math.min(100, Math.max(0, (numerator / denominator) * 100));
}

/**
 * Collects message IDs (and timestamp-only fallbacks) already represented as `message_sent`
 * entries in `activityLog` so loaded `messages[]` can backfill older/uncapped replies without duplicates.
 */
export function collectLoggedMessageKeys(
  activityLog?: ReadonlyArray<ActivityLogEntryLike>
): LoggedMessageKeys {
  const ids = new Set<string>();
  const fallbackTimestamps = new Set<number>();
  if (!Array.isArray(activityLog)) return { ids, fallbackTimestamps };

  for (let i = 0; i < activityLog.length; i++) {
    const entry = activityLog[i];
    if (!entry || entry.type !== "message_sent") continue;
    const rawId = String(entry.id || "");
    if (rawId.startsWith("msg_")) {
      const msgPart = rawId.slice(4);
      if (msgPart) ids.add(msgPart);
      // Only use timestamp matching when the logged ID fell back to a raw timestamp (no platform messageId).
      if (/^\d+$/.test(msgPart) && entry.timestamp > 0) {
        fallbackTimestamps.add(entry.timestamp);
      }
    } else if (entry.timestamp > 0) {
      fallbackTimestamps.add(entry.timestamp);
    }
  }
  return { ids, fallbackTimestamps };
}

/** Returns true if a loaded message is already accounted for by an `activityLog` `message_sent` entry. */
export function isMessageAlreadyInActivityLog(
  msg: { id?: string; timestamp?: number },
  logged: LoggedMessageKeys
): boolean {
  if (msg.id && logged.ids.has(String(msg.id))) return true;
  if (msg.timestamp && logged.fallbackTimestamps.has(msg.timestamp)) return true;
  return false;
}

/* ── Conversion Funnel Audit & Verification ── */

export type FunnelAuditMetric =
  | "leads"
  | "booked"
  | "attended"
  | "enrolled"
  | "cash"
  | "stage"
  | "channel"
  | "awaiting_reply";

export type FunnelAuditChannel = "WhatsApp" | "Instagram" | "Messenger";

export type FunnelAuditTarget =
  | {
      metric: "leads" | "booked" | "attended" | "enrolled" | "cash" | "awaiting_reply";
      agentName?: string;
    }
  | { metric: "stage"; stage: string; agentName?: string }
  | { metric: "channel"; channel: FunnelAuditChannel; agentName?: string };

export interface AuditConversationInput extends TeamConversationLike {
  id: string;
  name?: string;
  profileName?: string;
  leadName?: string;
  phone?: string;
  agent?: string;
  channel?: string;
  metaChannel?: string;
  branch?: string;
  unreadCount?: number;
  followUpDate?: string;
  bookedBy?: string;
  attendedBy?: string;
  enrolledBy?: string;
  cashRecordedBy?: string;
}

export interface BuildFunnelAuditOptions {
  target: FunnelAuditTarget;
  selectedAgent?: string | null;
  filterMode: "all" | "day" | "week" | "range";
  periodStartMs: number;
  periodEndMs: number;
  periodDescription: string;
}

export interface FunnelCounts {
  leads: number;
  booked: number;
  attended: number;
  enrolled: number;
  cash: number;
}

export interface TeamFunnelSummary {
  team: FunnelCounts;
  byAgent: Map<string, FunnelCounts>;
  unassigned: FunnelCounts;
}

export interface ComputeTeamFunnelOptions {
  filterMode: "all" | "day" | "week" | "range";
  periodStartMs: number;
  periodEndMs: number;
}

export interface FunnelAuditLeadRow {
  rowKey?: string;
  id: string;
  leadName: string;
  leadPhone: string;
  channelLabel: string;
  branch: string;
  assignedAgent: string;
  attributedAgent: string;
  bookedBy?: string;
  attendedBy?: string;
  enrolledBy?: string;
  cashRecordedBy?: string;
  pipeline: string;
  auditionDate: string;
  auditionOutcome: string;
  followUpDate: string;
  cashIn: number;
  paymentNote?: string;
  createdTs: number;
  createdSource: "createdAt" | "lastMessageAt" | "updatedAt" | "unknown";
  bookedTs: number | null;
  attendedTs: number | null;
  convertedTs: number | null;
  paidTs?: number | null;
  reasonKey: string;
  reasonLabel: string;
  reasonDetail: string;
  isBooked: boolean;
  isAttended: boolean;
  isEnrolled: boolean;
}

export interface FunnelAuditReasonBucket {
  key: string;
  label: string;
  description: string;
  count: number;
  cashTotal: number;
}

export interface FunnelAuditAgentBreakdown {
  agent: string;
  count: number;
  cashTotal: number;
}

export type FunnelAuditExcludedReason =
  | "unassigned"
  | "outside_period_created"
  | "reassigned_actor";

export interface FunnelAuditExcludedRow {
  rowKey?: string;
  id: string;
  leadName: string;
  leadPhone: string;
  assignedAgent: string;
  actorName: string;
  pipeline: string;
  auditionDate: string;
  cashIn: number;
  createdTs: number;
  milestoneTs: number | null;
  excludedReason: FunnelAuditExcludedReason;
  excludedDetail: string;
}

export interface FunnelAuditReport {
  metric: FunnelAuditMetric;
  scopeLabel: string;
  isAllAgentsScope: boolean;
  title: string;
  ruleSummary: string;
  formulaText: string;
  totalCount: number;
  cohortLeadsCount: number;
  cohortBookedCount: number;
  cohortAttendedCount: number;
  cohortEnrolledCount: number;
  cohortCashTotal: number;
  totalCash: number;
  paidCount: number;
  unpaidEnrolledCount: number;
  rows: FunnelAuditLeadRow[];
  reasonBuckets: FunnelAuditReasonBucket[];
  agentBreakdown: FunnelAuditAgentBreakdown[];
  excludedRows: FunnelAuditExcludedRow[];
}

const AUDIT_OUTCOME_LABELS: Record<string, string> = {
  registered: "Registered (Enrolled)",
  "paid-trial": "Paid Trial",
  "schedule-followup": "Attended · Follow-up",
  "joining-later": "Joining Later",
  "no-show": "No-Show",
  booked: "Booked",
  attended: "Attended",
  passed: "Audition Passed",
};

interface ReasonMeta {
  key: string;
  label: string;
  description: string;
  detail: string;
}

export function formatAuditOutcome(outcome?: string): string {
  const clean = (outcome || "").trim();
  if (!clean) return "";
  return AUDIT_OUTCOME_LABELS[clean.toLowerCase()] || clean;
}

function formatSar(amount: number): string {
  return `${amount.toLocaleString("en-US")} SAR`;
}

function getAuditDisplayName(c: AuditConversationInput): string {
  return c.leadName || c.profileName || c.name || c.phone || c.id;
}

function getAuditChannelLabel(c: AuditConversationInput): string {
  const base = c.channel || "WA";
  return c.metaChannel ? `${base} · ${c.metaChannel}` : base;
}

function getAuditChannelBucket(channel?: string): FunnelAuditChannel | "Other" {
  const ch = (channel || "").toLowerCase();
  if (ch.includes("wa") || ch.includes("whatsapp")) return "WhatsApp";
  if (ch.includes("ig") || ch.includes("instagram")) return "Instagram";
  if (ch.includes("fb") || ch.includes("messenger") || ch.includes("facebook")) return "Messenger";
  return "Other";
}

function resolveStageFlagReason(
  c: AuditConversationInput,
  flags: { booked: boolean; attended: boolean; enrolled: boolean; cashIn: number }
): ReasonMeta {
  const pipeline = (c.pipeline || "New").trim();
  if (flags.enrolled) {
    return {
      key: "enrolled",
      label: "Enrolled",
      description: "Pipeline stage is Enrolled.",
      detail:
        flags.cashIn > 0
          ? `Stage: ${pipeline} · ${formatSar(flags.cashIn)}`
          : `Stage: ${pipeline} · Enrolled`,
    };
  }
  if (flags.attended) {
    return {
      key: "attended",
      label: "Attended (Not Enrolled)",
      description: "Pipeline stage is Attended.",
      detail: c.auditionOutcome
        ? `Stage: ${pipeline} · ${formatAuditOutcome(c.auditionOutcome)}`
        : `Stage: ${pipeline}`,
    };
  }
  if (flags.booked) {
    return {
      key: "booked",
      label: "Booked (Not Attended)",
      description: "Pipeline stage is Audition Booked.",
      detail: c.auditionDate ? `Stage: ${pipeline} · Audition ${c.auditionDate}` : `Stage: ${pipeline}`,
    };
  }
  return {
    key: "not_booked",
    label: "Not Booked",
    description: "Not yet in Audition Booked, Attended, or Enrolled.",
    detail: `Stage: ${pipeline}`,
  };
}

function classifyMetricReason(
  target: FunnelAuditTarget,
  c: AuditConversationInput,
  flags: {
    booked: boolean;
    attended: boolean;
    enrolled: boolean;
    directAttended: boolean;
    cashIn: number;
  }
): ReasonMeta | null {
  const pipeline = (c.pipeline || "New").trim();
  const auditionDate = (c.auditionDate || "").trim();

  switch (target.metric) {
    case "leads":
      return resolveStageFlagReason(c, flags);

    case "booked": {
      if (!flags.booked) return null;
      if (flags.enrolled) {
        const cashSuffix = flags.cashIn > 0 ? ` (${formatSar(flags.cashIn)})` : "";
        return {
          key: "progressed_enrolled",
          label: "Progressed to Enrolled",
          description: "Reached Enrolled (counted cumulatively in Booked).",
          detail: `Pipeline is ${pipeline}${cashSuffix}${auditionDate ? ` · Audition ${auditionDate}` : ""} · counted cumulatively in Booked`,
        };
      }
      if (flags.attended) {
        return {
          key: "progressed_attended",
          label: "Progressed to Attended",
          description: "Moved beyond booking to Attended (counted cumulatively in Booked).",
          detail: `Pipeline is ${pipeline}${auditionDate ? ` · Audition ${auditionDate}` : ""} · counted cumulatively in Booked`,
        };
      }
      return {
        key: "stage_booked",
        label: "Pipeline: Audition Booked",
        description: "Currently in the Audition Booked stage.",
        detail: auditionDate
          ? `Pipeline is ${pipeline} · Audition ${auditionDate}`
          : `Pipeline is ${pipeline}`,
      };
    }

    case "attended": {
      if (!flags.attended) return null;
      if (flags.enrolled) {
        return {
          key: "progressed_enrolled",
          label: "Progressed to Enrolled",
          description: "Attended and progressed to Enrolled (counted cumulatively in Attended).",
          detail: `Pipeline is ${pipeline}${flags.cashIn > 0 ? ` (${formatSar(flags.cashIn)})` : ""} · counted cumulatively in Attended`,
        };
      }
      return {
        key: "stage_attended",
        label: "Pipeline: Attended",
        description: "Currently in the Attended stage.",
        detail: auditionDate ? `Pipeline is ${pipeline} · Audition ${auditionDate}` : `Pipeline is ${pipeline}`,
      };
    }

    case "enrolled": {
      if (!flags.enrolled) return null;
      return {
        key: "stage_enrolled",
        label: "Pipeline: Enrolled",
        description: "Pipeline stage is Enrolled.",
        detail:
          flags.cashIn > 0
            ? `Pipeline is ${pipeline} · ${formatSar(flags.cashIn)} recorded`
            : `Pipeline is ${pipeline} · 0 SAR recorded`,
      };
    }

    case "cash": {
      if (flags.cashIn > 0) {
        return {
          key: "paid_enrolled",
          label: "Paid Tuition",
          description: "Tuition payment recorded for this lead.",
          detail: `${formatSar(flags.cashIn)} recorded · Pipeline: ${pipeline}`,
        };
      }
      if (!flags.enrolled) return null;
      return {
        key: "unpaid_enrolled",
        label: "Enrolled (0 SAR)",
        description: "Enrolled leads in this cohort with 0 SAR recorded.",
        detail: `Counted as enrolled (${pipeline}) with 0 SAR recorded`,
      };
    }

    case "stage": {
      if (pipeline !== target.stage.trim()) return null;
      return resolveStageFlagReason(c, flags);
    }

    case "channel": {
      if (getAuditChannelBucket(c.channel) !== target.channel) return null;
      return resolveStageFlagReason(c, flags);
    }

    case "awaiting_reply": {
      const hasUnread = Boolean(c.unreadCount && c.unreadCount > 0);
      const isNew = pipeline === "New";
      if (!hasUnread && !isNew) return null;
      if (hasUnread && isNew) {
        return {
          key: "new_unread",
          label: "New Stage + Unread",
          description: "In the New stage with unread incoming messages.",
          detail: `Stage: New · ${c.unreadCount} unread message${c.unreadCount === 1 ? "" : "s"}`,
        };
      }
      if (hasUnread) {
        return {
          key: "unread",
          label: "Unread Messages",
          description: "Has unread incoming messages.",
          detail: `Stage: ${pipeline} · ${c.unreadCount} unread message${c.unreadCount === 1 ? "" : "s"}`,
        };
      }
      return {
        key: "stage_new",
        label: "New Stage",
        description: "Still in the New stage awaiting first handling.",
        detail: "Stage: New (0 unread)",
      };
    }
  }
}

function getBucketOrdering(metric: FunnelAuditMetric): ReadonlyArray<string> {
  switch (metric) {
    case "booked":
      return ["stage_booked", "progressed_attended", "progressed_enrolled"];
    case "attended":
      return ["stage_attended", "progressed_enrolled"];
    case "enrolled":
      return ["stage_enrolled"];
    case "cash":
      return ["paid_payment", "legacy_payment", "unattributed_payment"];
    case "awaiting_reply":
      return ["new_unread", "unread", "stage_new"];
    default:
      return ["booked", "attended", "enrolled", "not_booked"];
  }
}

interface ResolvedLeadMilestones {
  assignedAgent: string;
  assignedLower: string;
  realAssigned: boolean;
  bookedBy: string;
  attendedBy: string;
  enrolledBy: string;
  explicitBookedBy?: string;
  explicitAttendedBy?: string;
  explicitEnrolledBy?: string;
  directAttended: boolean;
  booked: boolean;
  attended: boolean;
  enrolled: boolean;
  cashIn: number;
  createdTs: number;
  bookedTs: number | null;
  attendedTs: number | null;
  convertedTs: number | null;
}

function resolveMilestoneActor(
  explicitActor: string | undefined,
  sourceActor: string | undefined,
  assignedAgent: string
): { actor: string; explicit?: string } {
  const first = (explicitActor || "").trim();
  if (isRealAssignedAgent(first)) return { actor: first, explicit: first };
  const second = (sourceActor || "").trim();
  if (isRealAssignedAgent(second)) return { actor: second, explicit: second };
  return { actor: assignedAgent, explicit: first || second || undefined };
}

function resolveConversationMilestones(c: AuditConversationInput): ResolvedLeadMilestones {
  const src = getSourceObject(c);
  const assignedAgent = (c.agent || "Unassigned").trim();
  const assignedLower = assignedAgent.toLowerCase();
  const realAssigned = isRealAssignedAgent(assignedAgent);
  const createdTs = getCreatedTime(c);

  const directEnrolled = isConvertedLead(c);
  const directAttended = isAttendedLead(c);
  const directBooked = isBookedLead(c);

  const enrolled = directEnrolled;
  const attended = enrolled || directAttended;
  const booked = attended || directBooked;
  const cashIn = enrolled ? getEffectiveCashIn(c) : 0;

  const convertedTs = enrolled ? getConvertedTime(c) : null;
  const attendedTs = attended ? getAttendedTime(c) ?? convertedTs : null;
  const bookedTs = booked
    ? getBookedTime(c) ?? (directAttended ? getAttendedTime(c) : null) ?? convertedTs
    : null;

  const bookResolved = resolveMilestoneActor(c.bookedBy, src?.bookedBy, assignedAgent);
  const attResolved = resolveMilestoneActor(c.attendedBy, src?.attendedBy, assignedAgent);
  const convResolved = resolveMilestoneActor(c.enrolledBy, src?.enrolledBy, assignedAgent);

  return {
    assignedAgent,
    assignedLower,
    realAssigned,
    bookedBy: bookResolved.actor,
    attendedBy: attResolved.actor,
    enrolledBy: convResolved.actor,
    explicitBookedBy: bookResolved.explicit,
    explicitAttendedBy: attResolved.explicit,
    explicitEnrolledBy: convResolved.explicit,
    directAttended,
    booked,
    attended,
    enrolled,
    cashIn,
    createdTs,
    bookedTs,
    attendedTs,
    convertedTs,
  };
}

/**
 * Computes Conversion Funnel totals and per-staff counts where each stage is filtered
 * by its own milestone date and attributed to the acting staff member (falling back to owner),
 * while each cash payment is credited strictly to the agent who recorded it.
 */
export function computeTeamFunnelSummary(
  conversations: ReadonlyArray<AuditConversationInput>,
  options: ComputeTeamFunnelOptions
): TeamFunnelSummary {
  const isAllTime = options.filterMode === "all";
  const inPeriod = (ts: number | null | undefined): boolean => {
    if (isAllTime) return true;
    if (!ts || ts <= 0) return false;
    return ts >= options.periodStartMs && ts <= options.periodEndMs;
  };

  const emptyCounts = (): FunnelCounts => ({
    leads: 0,
    booked: 0,
    attended: 0,
    enrolled: 0,
    cash: 0,
  });
  const team = emptyCounts();
  const unassigned = emptyCounts();
  const byAgent = new Map<string, FunnelCounts>();

  const ensureAgent = (agentName: string): FunnelCounts => {
    const lower = agentName.toLowerCase();
    let counts = byAgent.get(lower);
    if (!counts) {
      counts = emptyCounts();
      byAgent.set(lower, counts);
    }
    return counts;
  };

  for (let i = 0; i < conversations.length; i++) {
    const c = conversations[i];
    const m = resolveConversationMilestones(c);
    const isPipelineLead = (c.pipeline || "").toLowerCase().trim() !== "direct";

    if (isPipelineLead && inPeriod(m.createdTs)) {
      team.leads += 1;
      if (m.realAssigned) {
        ensureAgent(m.assignedAgent).leads += 1;
      } else {
        unassigned.leads += 1;
      }
    }

    if (m.booked && inPeriod(m.bookedTs)) {
      team.booked += 1;
      if (isRealAssignedAgent(m.bookedBy)) {
        ensureAgent(m.bookedBy).booked += 1;
      } else {
        unassigned.booked += 1;
      }
    }

    if (m.attended && inPeriod(m.attendedTs)) {
      team.attended += 1;
      if (isRealAssignedAgent(m.attendedBy)) {
        ensureAgent(m.attendedBy).attended += 1;
      } else {
        unassigned.attended += 1;
      }
    }

    if (m.enrolled && inPeriod(m.convertedTs)) {
      team.enrolled += 1;
      if (isRealAssignedAgent(m.enrolledBy)) {
        ensureAgent(m.enrolledBy).enrolled += 1;
      } else {
        unassigned.enrolled += 1;
      }
    }

    const payments = resolveConversationCashPayments(c);
    for (let j = 0; j < payments.length; j++) {
      const p = payments[j];
      if (inPeriod(p.timestamp)) {
        team.cash = Math.round((team.cash + p.amount) * 100) / 100;
        if (isRealAssignedAgent(p.actor)) {
          const agentCounts = ensureAgent(p.actor);
          agentCounts.cash = Math.round((agentCounts.cash + p.amount) * 100) / 100;
        } else {
          unassigned.cash = Math.round((unassigned.cash + p.amount) * 100) / 100;
        }
      }
    }
  }

  return { team, byAgent, unassigned };
}

function checkExcludedMilestone(
  metric: FunnelAuditMetric,
  c: AuditConversationInput,
  m: ResolvedLeadMilestones,
  metricTarget: {
    qualified: boolean;
    qualifiesForExclusion: boolean;
    ts: number | null;
    actor: string;
    word: string;
  },
  options: {
    isAllTime: boolean;
    agentFilterLower: string | null;
    inPeriod: (ts: number | null | undefined) => boolean;
  }
): FunnelAuditExcludedRow | null {
  if (!metricTarget.qualifiesForExclusion) return null;
  if (!options.isAllTime && !options.inPeriod(metricTarget.ts)) return null;

  const pipeline = (c.pipeline || "New").trim();
  const auditionDate = (c.auditionDate || "").trim();

  const makeRow = (
    excludedReason: FunnelAuditExcludedReason,
    excludedDetail: string
  ): FunnelAuditExcludedRow => ({
    id: c.id,
    leadName: getAuditDisplayName(c),
    leadPhone: c.phone || "",
    assignedAgent: m.assignedAgent,
    actorName: metricTarget.actor,
    pipeline,
    auditionDate,
    cashIn: m.cashIn,
    createdTs: m.createdTs,
    milestoneTs: metricTarget.ts,
    excludedReason,
    excludedDetail,
  });

  if (options.agentFilterLower === null && !isRealAssignedAgent(metricTarget.actor)) {
    return makeRow(
      "unassigned",
      metric === "leads"
        ? `Lead is ${m.assignedAgent} (not assigned to a staff member), so it is excluded from team metrics.`
        : `Milestone (${metricTarget.word}) has no assigned staff member (${metricTarget.actor}), so it is excluded from team metrics.`
    );
  }

  if (
    metric !== "leads" &&
    options.agentFilterLower !== null &&
    isRealAssignedAgent(metricTarget.actor) &&
    metricTarget.actor.toLowerCase() !== options.agentFilterLower &&
    m.realAssigned &&
    m.assignedLower === options.agentFilterLower
  ) {
    return makeRow(
      "reassigned_actor",
      `Lead is currently assigned to ${m.assignedAgent}, but ${metricTarget.word} by ${metricTarget.actor} (credited to ${metricTarget.actor}).`
    );
  }

  return null;
}

function buildAuditCopy(
  target: FunnelAuditTarget,
  scopeLabel: string,
  periodDescription: string,
  counts: {
    totalCount: number;
    cohortLeadsCount: number;
    cohortBookedCount: number;
    cohortAttendedCount: number;
    cohortEnrolledCount: number;
    cohortCashTotal: number;
    paidCount: number;
    unpaidEnrolledCount: number;
  }
): { title: string; ruleSummary: string; formulaText: string } {
  const periodLabel = periodDescription || "All Time";
  const bookingRate = clampRatePct(counts.cohortBookedCount, counts.cohortLeadsCount);
  const bookingRateStr =
    bookingRate > 0 && bookingRate < 10 ? bookingRate.toFixed(1) : Math.round(bookingRate).toString();
  const showRateStr = Math.round(
    clampRatePct(counts.cohortAttendedCount, counts.cohortBookedCount)
  ).toString();
  const closeRateStr = Math.round(
    clampRatePct(counts.cohortEnrolledCount, counts.cohortAttendedCount)
  ).toString();
  const winRateStr =
    counts.cohortLeadsCount > 0
      ? clampRatePct(counts.cohortEnrolledCount, counts.cohortLeadsCount).toFixed(1)
      : "0";
  const scopeActorClause = scopeLabel === "All Agents" ? "" : ` by ${scopeLabel}`;

  switch (target.metric) {
    case "leads":
      return {
        title: `Leads Audit — ${counts.totalCount.toLocaleString("en-US")}`,
        ruleSummary:
          scopeLabel === "All Agents"
            ? `All pipeline leads whose creation timestamp falls inside ${periodLabel} (including Unassigned leads).`
            : `All conversations currently assigned to ${scopeLabel} whose creation timestamp falls inside ${periodLabel}.`,
        formulaText: `${counts.cohortLeadsCount} leads · ${counts.cohortBookedCount} booked (${bookingRateStr}%) · ${counts.cohortAttendedCount} attended · ${counts.cohortEnrolledCount} enrolled (${winRateStr}% win)`,
      };
    case "booked":
      return {
        title: `Booked Audit — ${counts.totalCount.toLocaleString("en-US")}`,
        ruleSummary: `${counts.totalCount} lead${counts.totalCount === 1 ? "" : "s"} in Audition Booked, Attended, or Enrolled inside ${periodLabel}${scopeActorClause} (cumulative pipeline).`,
        formulaText: `${counts.cohortBookedCount} booked in period / ${counts.cohortLeadsCount} leads = ${bookingRateStr}% booking rate`,
      };
    case "attended":
      return {
        title: `Attended Audit — ${counts.totalCount.toLocaleString("en-US")}`,
        ruleSummary: `${counts.totalCount} lead${counts.totalCount === 1 ? "" : "s"} in Attended or Enrolled inside ${periodLabel}${scopeActorClause} (cumulative pipeline).`,
        formulaText: `${counts.cohortAttendedCount} attended / ${counts.cohortBookedCount} booked = ${showRateStr}% show-up rate`,
      };
    case "enrolled":
      return {
        title: `Enrolled Audit — ${counts.totalCount.toLocaleString("en-US")}`,
        ruleSummary: `${counts.totalCount} lead${counts.totalCount === 1 ? "" : "s"} in the Enrolled pipeline stage inside ${periodLabel}${scopeActorClause}.`,
        formulaText: `${counts.cohortEnrolledCount} enrolled / ${counts.cohortAttendedCount} attended = ${closeRateStr}% close rate (${winRateStr}% of ${counts.cohortLeadsCount} leads)`,
      };
    case "cash": {
      const avgPerStudent =
        counts.cohortEnrolledCount > 0
          ? Math.round(counts.cohortCashTotal / counts.cohortEnrolledCount)
          : 0;
      return {
        title: `Revenue Audit — ${formatSar(counts.cohortCashTotal)}`,
        ruleSummary: `Sum of active payments recorded inside ${periodLabel}${scopeActorClause} (each payment credited to the staff member who recorded it).`,
        formulaText: `${formatSar(counts.cohortCashTotal)} across ${counts.paidCount} payment${counts.paidCount === 1 ? "" : "s"}${counts.unpaidEnrolledCount > 0 ? ` · ${counts.unpaidEnrolledCount} enrolled with 0 SAR` : ""} · avg ${formatSar(avgPerStudent)} / enrolled`,
      };
    }
    case "stage": {
      const pct = Math.round(clampRatePct(counts.totalCount, counts.cohortLeadsCount));
      return {
        title: `Stage Audit: ${target.stage} — ${counts.totalCount.toLocaleString("en-US")}`,
        ruleSummary: `Leads assigned to ${scopeLabel} created in ${periodLabel} whose current pipeline stage is "${target.stage}".`,
        formulaText: `${counts.totalCount} of ${counts.cohortLeadsCount} assigned leads (${pct}%)`,
      };
    }
    case "channel": {
      const pct = Math.round(clampRatePct(counts.totalCount, counts.cohortLeadsCount));
      return {
        title: `Channel Audit: ${target.channel} — ${counts.totalCount.toLocaleString("en-US")}`,
        ruleSummary: `Leads assigned to ${scopeLabel} created in ${periodLabel} originating from ${target.channel}.`,
        formulaText: `${counts.totalCount} of ${counts.cohortLeadsCount} assigned leads (${pct}%)`,
      };
    }
    case "awaiting_reply":
      return {
        title: `Awaiting Reply Audit — ${counts.totalCount.toLocaleString("en-US")}`,
        ruleSummary: `Leads assigned to ${scopeLabel} created in ${periodLabel} that have unread incoming messages or remain in the New stage.`,
        formulaText: `${counts.totalCount} of ${counts.cohortLeadsCount} assigned leads awaiting reply`,
      };
  }
}

/**
 * Builds a deterministic, reconciled audit report for any metric or breakdown inside Conversion Funnel.
 * Every reason bucket sums exactly to `totalCount`, and `totalCash` equals the sum of `cashIn` across included rows.
 */
export function buildFunnelAuditReport(
  conversations: ReadonlyArray<AuditConversationInput>,
  options: BuildFunnelAuditOptions
): FunnelAuditReport {
  const { target, selectedAgent, filterMode, periodStartMs, periodEndMs, periodDescription } = options;
  const isAllTime = filterMode === "all";

  const requestedAgent = (target.agentName !== undefined ? target.agentName : selectedAgent || "").trim();
  const isAllAgentsScope = !requestedAgent || requestedAgent === "__all__" || requestedAgent.toLowerCase() === "all";
  const agentFilterLower = isAllAgentsScope ? null : requestedAgent.toLowerCase();
  const scopeLabel = isAllAgentsScope ? "All Agents" : requestedAgent;

  const inPeriod = (ts: number | null | undefined): boolean => {
    if (isAllTime) return true;
    if (!ts || ts <= 0) return false;
    return ts >= periodStartMs && ts <= periodEndMs;
  };

  const matchesScope = (actorName: string): boolean => {
    if (agentFilterLower === null) return true;
    return isRealAssignedAgent(actorName) && actorName.toLowerCase() === agentFilterLower;
  };

  let cohortLeadsCount = 0;
  let cohortBookedCount = 0;
  let cohortAttendedCount = 0;
  let cohortEnrolledCount = 0;
  let cohortCashTotal = 0;
  let paidCount = 0;
  let unpaidEnrolledCount = 0;

  const rows: FunnelAuditLeadRow[] = [];
  const excludedRows: FunnelAuditExcludedRow[] = [];
  const bucketMap = new Map<string, FunnelAuditReasonBucket>();
  const agentMap = new Map<string, FunnelAuditAgentBreakdown>();

  for (let i = 0; i < conversations.length; i++) {
    const c = conversations[i];
    const m = resolveConversationMilestones(c);
    const isPipelineLead = (c.pipeline || "").toLowerCase().trim() !== "direct";

    if (isPipelineLead && matchesScope(m.assignedAgent) && inPeriod(m.createdTs)) {
      cohortLeadsCount += 1;
    }
    if (m.booked && matchesScope(m.bookedBy) && inPeriod(m.bookedTs)) {
      cohortBookedCount += 1;
    }
    if (m.attended && matchesScope(m.attendedBy) && inPeriod(m.attendedTs)) {
      cohortAttendedCount += 1;
    }
    if (m.enrolled && matchesScope(m.enrolledBy) && inPeriod(m.convertedTs)) {
      cohortEnrolledCount += 1;
    }

    const cashPayments = resolveConversationCashPayments(c);
    for (let j = 0; j < cashPayments.length; j++) {
      const p = cashPayments[j];
      if (matchesScope(p.actor) && inPeriod(p.timestamp)) {
        cohortCashTotal = Math.round((cohortCashTotal + p.amount) * 100) / 100;
      }
    }

    if (target.metric === "cash") {
      if (m.enrolled && matchesScope(m.enrolledBy) && inPeriod(m.convertedTs) && m.cashIn <= 0) {
        unpaidEnrolledCount += 1;
      }

      for (let j = 0; j < cashPayments.length; j++) {
        const p = cashPayments[j];
        const inPaymentPeriod = inPeriod(p.timestamp);
        if (matchesScope(p.actor) && inPaymentPeriod) {
          paidCount += 1;
          const isRealActor = isRealAssignedAgent(p.actor);
          const displayActor = isRealActor ? p.actor : "Unattributed";
          const reasonKey = !isRealActor
            ? "unattributed_payment"
            : p.isLegacy
              ? "legacy_payment"
              : "paid_payment";
          const reasonLabel = !isRealActor
            ? "Legacy Payment (Unattributed)"
            : p.isLegacy
              ? "Legacy Payment"
              : "Recorded Payment";
          const ownerNote =
            isRealActor && p.actor.toLowerCase() !== m.assignedLower
              ? ` (Lead owner: ${m.assignedAgent})`
              : !isRealActor && m.realAssigned
                ? ` · Lead owner: ${m.assignedAgent}`
                : "";
          const actorPhrase = isRealActor ? `added by ${p.actor}` : "no recorded staff actor";
          const reasonDetail = `${formatSar(p.amount)} (${actorPhrase})${
            p.note ? ` · ${p.note}` : ""
          }${ownerNote}`;

          rows.push({
            rowKey: `${c.id}_${p.id}`,
            id: c.id,
            leadName: getAuditDisplayName(c),
            leadPhone: c.phone || "",
            channelLabel: getAuditChannelLabel(c),
            branch: (c.branch || "").trim(),
            assignedAgent: m.assignedAgent,
            attributedAgent: displayActor,
            bookedBy: m.explicitBookedBy,
            attendedBy: m.explicitAttendedBy,
            enrolledBy: m.explicitEnrolledBy,
            cashRecordedBy: isRealActor ? p.actor : undefined,
            pipeline: (c.pipeline || "New").trim(),
            auditionDate: (c.auditionDate || "").trim(),
            auditionOutcome: (c.auditionOutcome || "").trim(),
            followUpDate: (c.followUpDate || "").trim(),
            cashIn: p.amount,
            paymentNote: p.note,
            createdTs: m.createdTs,
            createdSource: getCreatedTimeSource(c),
            bookedTs: m.bookedTs,
            attendedTs: m.attendedTs,
            convertedTs: m.convertedTs,
            paidTs: p.timestamp,
            reasonKey,
            reasonLabel,
            reasonDetail,
            isBooked: m.booked,
            isAttended: m.attended,
            isEnrolled: m.enrolled,
          });

          const existingBucket = bucketMap.get(reasonKey);
          if (existingBucket) {
            existingBucket.count += 1;
            existingBucket.cashTotal = Math.round((existingBucket.cashTotal + p.amount) * 100) / 100;
          } else {
            bucketMap.set(reasonKey, {
              key: reasonKey,
              label: reasonLabel,
              description: !isRealActor
                ? "Legacy tuition payment with no recorded staff actor."
                : p.isLegacy
                  ? "Legacy tuition payment attributed via recorded actor or enrollment."
                  : "Tuition payment attributed to the staff member who recorded it.",
              count: 1,
              cashTotal: p.amount,
            });
          }

          const actorLower = displayActor.toLowerCase();
          const existingAgent = agentMap.get(actorLower);
          if (existingAgent) {
            existingAgent.count += 1;
            existingAgent.cashTotal = Math.round((existingAgent.cashTotal + p.amount) * 100) / 100;
          } else {
            agentMap.set(actorLower, {
              agent: displayActor,
              count: 1,
              cashTotal: p.amount,
            });
          }
          continue;
        }

        if (!isAllTime && !inPaymentPeriod) continue;
        const pipeline = (c.pipeline || "New").trim();
        const auditionDate = (c.auditionDate || "").trim();
        if (
          agentFilterLower !== null &&
          isRealAssignedAgent(p.actor) &&
          p.actor.toLowerCase() !== agentFilterLower &&
          m.realAssigned &&
          m.assignedLower === agentFilterLower
        ) {
          excludedRows.push({
            rowKey: `${c.id}_${p.id}_ex`,
            id: c.id,
            leadName: getAuditDisplayName(c),
            leadPhone: c.phone || "",
            assignedAgent: m.assignedAgent,
            actorName: p.actor,
            pipeline,
            auditionDate,
            cashIn: p.amount,
            createdTs: m.createdTs,
            milestoneTs: p.timestamp || null,
            excludedReason: "reassigned_actor",
            excludedDetail: `Lead is currently assigned to ${m.assignedAgent}, but ${formatSar(p.amount)} was recorded by ${p.actor} (credited to ${p.actor}).`,
          });
        }
      }
      continue;
    }

    let metricTarget: {
      qualified: boolean;
      qualifiesForExclusion: boolean;
      ts: number | null;
      actor: string;
      word: string;
    };
    if (target.metric === "booked") {
      metricTarget = {
        qualified: m.booked,
        qualifiesForExclusion: m.booked,
        ts: m.bookedTs,
        actor: m.bookedBy,
        word: "booked",
      };
    } else if (target.metric === "attended") {
      metricTarget = {
        qualified: m.attended,
        qualifiesForExclusion: m.attended,
        ts: m.attendedTs,
        actor: m.attendedBy,
        word: "attended",
      };
    } else if (target.metric === "enrolled") {
      metricTarget = {
        qualified: m.enrolled,
        qualifiesForExclusion: m.enrolled,
        ts: m.convertedTs,
        actor: m.enrolledBy,
        word: "enrolled",
      };
    } else {
      metricTarget = {
        qualified: isPipelineLead,
        qualifiesForExclusion: isPipelineLead && target.metric === "leads",
        ts: m.createdTs,
        actor: m.assignedAgent,
        word: "created",
      };
    }

    const inMetricScope =
      metricTarget.qualified &&
      matchesScope(metricTarget.actor) &&
      inPeriod(metricTarget.ts);

    if (!inMetricScope) {
      if (
        target.metric === "leads" ||
        target.metric === "booked" ||
        target.metric === "attended" ||
        target.metric === "enrolled"
      ) {
        const excluded = checkExcludedMilestone(target.metric, c, m, metricTarget, {
          isAllTime,
          agentFilterLower,
          inPeriod,
        });
        if (excluded) excludedRows.push(excluded);
      }
      continue;
    }

    const reason = classifyMetricReason(target, c, {
      booked: m.booked,
      attended: m.attended,
      enrolled: m.enrolled,
      directAttended: m.directAttended,
      cashIn: m.cashIn,
    });
    if (!reason) continue;

    if (m.enrolled) {
      if (m.cashIn > 0) paidCount += 1;
      else unpaidEnrolledCount += 1;
    }

    const displayActor = isRealAssignedAgent(metricTarget.actor) ? metricTarget.actor : "Unassigned";

    rows.push({
      id: c.id,
      leadName: getAuditDisplayName(c),
      leadPhone: c.phone || "",
      channelLabel: getAuditChannelLabel(c),
      branch: (c.branch || "").trim(),
      assignedAgent: m.assignedAgent,
      attributedAgent: displayActor,
      bookedBy: m.explicitBookedBy,
      attendedBy: m.explicitAttendedBy,
      enrolledBy: m.explicitEnrolledBy,
      pipeline: (c.pipeline || "New").trim(),
      auditionDate: (c.auditionDate || "").trim(),
      auditionOutcome: (c.auditionOutcome || "").trim(),
      followUpDate: (c.followUpDate || "").trim(),
      cashIn: m.cashIn,
      createdTs: m.createdTs,
      createdSource: getCreatedTimeSource(c),
      bookedTs: m.bookedTs,
      attendedTs: m.attendedTs,
      convertedTs: m.convertedTs,
      reasonKey: reason.key,
      reasonLabel: reason.label,
      reasonDetail: reason.detail,
      isBooked: m.booked,
      isAttended: m.attended,
      isEnrolled: m.enrolled,
    });

    const existingBucket = bucketMap.get(reason.key);
    if (existingBucket) {
      existingBucket.count += 1;
      existingBucket.cashTotal += m.cashIn;
    } else {
      bucketMap.set(reason.key, {
        key: reason.key,
        label: reason.label,
        description: reason.description,
        count: 1,
        cashTotal: m.cashIn,
      });
    }

    const actorLower = displayActor.toLowerCase();
    const existingAgent = agentMap.get(actorLower);
    if (existingAgent) {
      existingAgent.count += 1;
      existingAgent.cashTotal += m.cashIn;
    } else {
      agentMap.set(actorLower, {
        agent: displayActor,
        count: 1,
        cashTotal: m.cashIn,
      });
    }
  }

  rows.sort((a, b) => {
    if (target.metric === "cash") {
      if (b.cashIn !== a.cashIn) return b.cashIn - a.cashIn;
      return (b.paidTs || b.convertedTs || b.createdTs) - (a.paidTs || a.convertedTs || a.createdTs);
    }
    if (target.metric === "booked") {
      return (b.bookedTs || b.convertedTs || b.createdTs) - (a.bookedTs || a.convertedTs || a.createdTs);
    }
    if (target.metric === "attended") {
      return (b.attendedTs || b.convertedTs || b.createdTs) - (a.attendedTs || a.convertedTs || a.createdTs);
    }
    if (target.metric === "enrolled") {
      return (b.convertedTs || b.createdTs) - (a.convertedTs || a.createdTs);
    }
    return b.createdTs - a.createdTs;
  });

  const bucketOrder = getBucketOrdering(target.metric);
  const reasonBuckets = Array.from(bucketMap.values()).sort((a, b) => {
    const ia = bucketOrder.indexOf(a.key);
    const ib = bucketOrder.indexOf(b.key);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  const agentBreakdown = Array.from(agentMap.values()).sort((a, b) => {
    if (target.metric === "cash" && b.cashTotal !== a.cashTotal) {
      return b.cashTotal - a.cashTotal;
    }
    if (b.count !== a.count) return b.count - a.count;
    return a.agent.localeCompare(b.agent);
  });

  const totalCash = Math.round(rows.reduce((sum, r) => sum + r.cashIn, 0) * 100) / 100;
  const { title, ruleSummary, formulaText } = buildAuditCopy(target, scopeLabel, periodDescription, {
    totalCount: rows.length,
    cohortLeadsCount,
    cohortBookedCount,
    cohortAttendedCount,
    cohortEnrolledCount,
    cohortCashTotal,
    paidCount,
    unpaidEnrolledCount,
  });

  return {
    metric: target.metric,
    scopeLabel,
    isAllAgentsScope,
    title,
    ruleSummary,
    formulaText,
    totalCount: rows.length,
    cohortLeadsCount,
    cohortBookedCount,
    cohortAttendedCount,
    cohortEnrolledCount,
    cohortCashTotal,
    totalCash,
    paidCount,
    unpaidEnrolledCount,
    rows,
    reasonBuckets,
    agentBreakdown,
    excludedRows,
  };
}

export interface AssignedLeadAgentOption {
  name: string;
  count: number;
}

export interface AssignedLeadsAgentPool {
  total: number;
  options: AssignedLeadAgentOption[];
}

/**
 * Returns true if `assignedAgent` belongs to a real staff member and matches
 * the Assigned Leads agent dropdown filter (`"all"` matches any real agent).
 */
export function matchesAssignedLeadAgentFilter(
  assignedAgent: string | null | undefined,
  agentFilter: string
): boolean {
  if (!isRealAssignedAgent(assignedAgent)) return false;
  const cleanFilter = (agentFilter || "").trim();
  if (!cleanFilter || cleanFilter.toLowerCase() === "all") return true;
  return (assignedAgent || "").trim().toLowerCase() === cleanFilter.toLowerCase();
}

/**
 * Builds sorted agent dropdown options with period lead counts for Assigned Leads.
 * Only agents present in `settingsAgentNames` are included as dropdown options,
 * while `total` counts all real assigned leads in the period for "All agents".
 */
export function buildAssignedLeadsAgentPool(
  leadAgents: ReadonlyArray<string | null | undefined>,
  settingsAgentNames: ReadonlyArray<string>
): AssignedLeadsAgentPool {
  const canonicalByLower = new Map<string, string>();
  const countsByLower = new Map<string, number>();

  for (let i = 0; i < settingsAgentNames.length; i++) {
    const rawName = settingsAgentNames[i];
    if (!isRealAssignedAgent(rawName)) continue;
    const clean = rawName.trim();
    const lower = clean.toLowerCase();
    if (!canonicalByLower.has(lower)) {
      canonicalByLower.set(lower, clean);
      countsByLower.set(lower, 0);
    }
  }

  let total = 0;
  for (let i = 0; i < leadAgents.length; i++) {
    const rawAgent = leadAgents[i];
    if (!isRealAssignedAgent(rawAgent)) continue;
    total += 1;
    const lower = (rawAgent || "").trim().toLowerCase();
    if (canonicalByLower.has(lower)) {
      countsByLower.set(lower, (countsByLower.get(lower) ?? 0) + 1);
    }
  }

  const options: AssignedLeadAgentOption[] = [];
  canonicalByLower.forEach((name, lower) => {
    options.push({ name, count: countsByLower.get(lower) ?? 0 });
  });

  options.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.name.localeCompare(b.name);
  });

  return { total, options };
}

export interface SettingsStaffEntry {
  name: string;
  role?: string;
  email?: string;
  avatar?: string;
  active?: boolean;
}

/**
 * Indexes active staff members configured in Settings by lowercase name so
 * historical or deleted test accounts (e.g. from old lead logs) are excluded from staff lists.
 */
export function buildSettingsStaffLookup<T extends SettingsStaffEntry>(
  members: ReadonlyArray<T> | null | undefined,
  { includeInactive = false }: { includeInactive?: boolean } = {}
): Map<string, T> {
  const map = new Map<string, T>();
  if (!Array.isArray(members)) return map;
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    if (!m || (!includeInactive && m.active === false) || !isRealAssignedAgent(m.name)) continue;
    const cleanName = m.name.trim();
    const lower = cleanName.toLowerCase();
    if (!map.has(lower)) {
      map.set(lower, { ...m, name: cleanName, active: m.active !== false });
    }
  }
  return map;
}



