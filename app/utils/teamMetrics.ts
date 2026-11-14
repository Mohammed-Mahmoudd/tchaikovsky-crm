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
  "audition confirmed",
  "audition attended",
  "audition passed",
  "payment pending",
  "registered",
]);

export const ATTENDED_PIPELINES = new Set([
  "attended",
  "enrolled",
  "audition attended",
  "audition passed",
  "payment pending",
  "registered",
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

/**
 * Returns true if the lead actually attended an audition (or progressed past it),
 * explicitly excluding non-attendance outcomes such as "no-show" and "joining-later".
 */
export function isAttendedLead(c: TeamConversationLike): boolean {
  const p = (c.pipeline || "").toLowerCase().trim();
  const out = (c.auditionOutcome || "").toLowerCase().trim();
  const cash = Number(c.cashIn) || 0;
  if (out === "no-show" && p !== "enrolled" && cash <= 0) {
    return false;
  }
  if (ATTENDED_PIPELINES.has(p)) return true;
  return ATTENDED_OUTCOMES.has(out);
}

/** Returns true if an audition was booked for the lead (including past/no-show bookings). */
export function isBookedLead(c: TeamConversationLike): boolean {
  const p = (c.pipeline || "").toLowerCase().trim();
  if (BOOKED_PIPELINES.has(p)) return true;
  if (c.auditionDate && String(c.auditionDate).trim()) return true;
  return isAttendedLead(c);
}

/** Returns true if the lead enrolled or recorded tuition cash. */
export function isConvertedLead(c: TeamConversationLike): boolean {
  const p = (c.pipeline || "").toLowerCase().trim();
  const out = (c.auditionOutcome || "").toLowerCase().trim();
  return p === "enrolled" || p.includes("registered") || out === "registered" || (Number(c.cashIn) || 0) > 0;
}

/** Resolves the canonical booking timestamp for period filtering. */
export function getBookedTime(c: TeamConversationLike): number | null {
  if (!isBookedLead(c)) return null;
  const src = getSourceObject(c);
  const explicit = parseValidTs(c.auditionBookedAt || src?.auditionBookedAt);
  if (explicit > 0) return explicit;

  const logTs = findEarliestActivityTs(c, (e) => e.type === "audition_booked");
  if (logTs !== null) return logTs;

  if (c.pipeline === "Audition Booked") {
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
      (e.type === "audition_outcome" && ATTENDED_OUTCOMES.has((e.toValue || "").toLowerCase().trim())) ||
      (e.type === "stage_changed" && ATTENDED_PIPELINES.has((e.toValue || "").toLowerCase().trim()))
  );
  if (logTs !== null) return logTs;

  return getUpdatedTime(c);
}

/** Resolves the canonical enrollment / payment timestamp for period filtering. */
export function getConvertedTime(c: TeamConversationLike): number | null {
  if (!isConvertedLead(c)) return null;
  const src = getSourceObject(c);
  const explicit = parseValidTs(c.enrolledAt || c.paidAt || src?.enrolledAt || src?.paidAt);
  if (explicit > 0) return explicit;

  const logTs = findEarliestActivityTs(
    c,
    (e) =>
      e.type === "cash_recorded" ||
      (e.type === "audition_outcome" && (e.toValue || "").toLowerCase().trim() === "registered") ||
      (e.type === "stage_changed" && (e.toValue || "").toLowerCase().trim() === "enrolled")
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
}

export interface BuildFunnelAuditOptions {
  target: FunnelAuditTarget;
  selectedAgent?: string | null;
  filterMode: "all" | "day" | "week" | "range";
  periodStartMs: number;
  periodEndMs: number;
  periodDescription: string;
}

export interface FunnelAuditLeadRow {
  id: string;
  leadName: string;
  leadPhone: string;
  channelLabel: string;
  branch: string;
  assignedAgent: string;
  bookedBy?: string;
  attendedBy?: string;
  enrolledBy?: string;
  pipeline: string;
  auditionDate: string;
  auditionOutcome: string;
  followUpDate: string;
  cashIn: number;
  createdTs: number;
  createdSource: "createdAt" | "lastMessageAt" | "updatedAt" | "unknown";
  bookedTs: number | null;
  attendedTs: number | null;
  convertedTs: number | null;
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

function formatEgp(amount: number): string {
  return `${amount.toLocaleString("en-US")} EGP`;
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

function hasExplicitAuditionBookingRecord(c: TeamConversationLike): boolean {
  if (c.auditionDate && String(c.auditionDate).trim()) return true;
  const src = getSourceObject(c);
  if (parseValidTs(c.auditionBookedAt || src?.auditionBookedAt) > 0) return true;
  return findEarliestActivityTs(c, (e) => e.type === "audition_booked") !== null;
}

function resolveStageFlagReason(
  c: AuditConversationInput,
  flags: { booked: boolean; attended: boolean; enrolled: boolean; cashIn: number }
): ReasonMeta {
  const pipeline = (c.pipeline || "New").trim();
  if (flags.enrolled) {
    return {
      key: "enrolled",
      label: "Enrolled / Paid",
      description: "Converted to enrolled student or recorded tuition cash.",
      detail:
        flags.cashIn > 0
          ? `Stage: ${pipeline} · ${formatEgp(flags.cashIn)}`
          : `Stage: ${pipeline} · Enrolled`,
    };
  }
  if (flags.attended) {
    return {
      key: "attended",
      label: "Attended (Not Enrolled)",
      description: "Attended an audition, not yet enrolled or paid.",
      detail: c.auditionOutcome
        ? `Stage: ${pipeline} · ${formatAuditOutcome(c.auditionOutcome)}`
        : `Stage: ${pipeline}`,
    };
  }
  if (flags.booked) {
    return {
      key: "booked",
      label: "Booked (Not Attended)",
      description: "Has a booked audition or audition date, not yet attended.",
      detail: c.auditionDate ? `Stage: ${pipeline} · Audition ${c.auditionDate}` : `Stage: ${pipeline}`,
    };
  }
  return {
    key: "not_booked",
    label: "Not Booked",
    description: "No audition booking, attendance, or payment recorded yet.",
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
  const pipelineLower = pipeline.toLowerCase();
  const outcomeLower = (c.auditionOutcome || "").toLowerCase().trim();
  const outcomeLabel = formatAuditOutcome(c.auditionOutcome);
  const auditionDate = (c.auditionDate || "").trim();

  switch (target.metric) {
    case "leads":
      return resolveStageFlagReason(c, flags);

    case "booked": {
      if (!flags.booked) return null;
      if (flags.enrolled) {
        const cashSuffix = flags.cashIn > 0 ? ` (${formatEgp(flags.cashIn)})` : "";
        let detail: string;
        if (hasExplicitAuditionBookingRecord(c)) {
          detail = `Enrolled${cashSuffix}${auditionDate ? ` · Audition ${auditionDate}` : ""} · counted cumulatively in Booked`;
        } else if (
          pipelineLower === "enrolled" ||
          pipelineLower.includes("registered") ||
          outcomeLower === "registered"
        ) {
          detail = `Enrolled${cashSuffix} without an audition date · counted cumulatively in Booked`;
        } else {
          detail = `Direct payment (${formatEgp(flags.cashIn)}) in ${pipeline} · rolled up cumulatively to Booked`;
        }
        return {
          key: "progressed_enrolled",
          label: "Progressed to Enrolled / Paid",
          description: "Reached Enrolled or paid tuition (counted cumulatively in Booked).",
          detail,
        };
      }
      if (flags.attended) {
        const detail = ATTENDED_PIPELINES.has(pipelineLower)
          ? `Currently in ${pipeline}${auditionDate ? ` · Audition ${auditionDate}` : ""} (attended leads passed booking)`
          : `Outcome is ${outcomeLabel} while stage is ${pipeline} (counted cumulatively)`;
        return {
          key: "progressed_attended",
          label: "Progressed to Attended",
          description: "Moved beyond booking to Attended (counted cumulatively in Booked).",
          detail,
        };
      }
      if (BOOKED_PIPELINES.has(pipelineLower)) {
        return {
          key: "stage_booked",
          label: "Pipeline: Audition Booked",
          description: "Currently in an Audition Booked or Confirmed stage.",
          detail: auditionDate
            ? `Pipeline is ${pipeline} · Audition ${auditionDate}`
            : `Pipeline is ${pipeline}`,
        };
      }
      return {
        key: "audition_date_other",
        label: "Audition Date (Past / No-Show)",
        description: "In another pipeline stage (such as Lost or Joining Later) with an audition date recorded.",
        detail: `Stage is ${pipeline}${outcomeLabel ? ` (${outcomeLabel})` : ""}, counted via audition date ${auditionDate}`,
      };
    }

    case "attended": {
      if (!flags.attended) return null;
      if (flags.enrolled && flags.directAttended) {
        return {
          key: "progressed_enrolled",
          label: "Progressed to Enrolled / Paid",
          description: "Attended and progressed to Enrolled / Paid (counted cumulatively).",
          detail: `Enrolled${flags.cashIn > 0 ? ` (${formatEgp(flags.cashIn)})` : ""} · counted cumulatively in Attended`,
        };
      }
      if (flags.enrolled && !flags.directAttended) {
        return {
          key: "enrolled_rollup",
          label: "Direct Payment / Enrollment Roll-up",
          description: "Enrolled or paid directly without an Attended stage or attended audition outcome.",
          detail:
            flags.cashIn > 0
              ? `Rolled up from tuition payment (${formatEgp(flags.cashIn)}) while stage is ${pipeline}`
              : `Rolled up from ${outcomeLabel || pipeline} without an Attended stage`,
        };
      }
      if (ATTENDED_PIPELINES.has(pipelineLower)) {
        return {
          key: "stage_attended",
          label: "Pipeline: Attended",
          description: "Currently in an Attended pipeline stage.",
          detail: `Pipeline is ${pipeline}${auditionDate ? ` · Audition ${auditionDate}` : ""}`,
        };
      }
      return {
        key: "outcome_attended",
        label: "Attended via Outcome",
        description: "Has an attended audition outcome (such as Paid Trial or Follow-up).",
        detail: `Audition outcome is ${outcomeLabel} while stage is ${pipeline}`,
      };
    }

    case "enrolled": {
      if (!flags.enrolled) return null;
      if (pipelineLower === "enrolled" || pipelineLower.includes("registered")) {
        return {
          key: "stage_enrolled",
          label: "Pipeline: Enrolled",
          description: "Pipeline stage is Enrolled or Registered.",
          detail:
            flags.cashIn > 0
              ? `Pipeline is ${pipeline} · ${formatEgp(flags.cashIn)} recorded`
              : `Pipeline is ${pipeline} · 0 EGP recorded`,
        };
      }
      if (outcomeLower === "registered") {
        return {
          key: "outcome_registered",
          label: "Outcome: Registered",
          description: "Audition outcome is Registered while pipeline is another stage.",
          detail: `Outcome is Registered (stage: ${pipeline})${flags.cashIn > 0 ? ` · ${formatEgp(flags.cashIn)}` : ""}`,
        };
      }
      return {
        key: "cash_recorded",
        label: "Tuition Cash Recorded",
        description: "Positive tuition payment (cashIn > 0) recorded without Enrolled stage.",
        detail: `Cash recorded (${formatEgp(flags.cashIn)}) while stage is ${pipeline}`,
      };
    }

    case "cash": {
      if (!flags.enrolled) return null;
      if (flags.cashIn > 0) {
        const origin =
          pipelineLower === "enrolled" || pipelineLower.includes("registered")
            ? "Pipeline: Enrolled"
            : outcomeLower === "registered"
              ? "Outcome: Registered"
              : `Direct payment in ${pipeline}`;
        return {
          key: "paid_enrolled",
          label: "Paid Tuition",
          description: "Enrolled/converted leads with positive cash recorded.",
          detail: `${formatEgp(flags.cashIn)} recorded · ${origin}`,
        };
      }
      return {
        key: "unpaid_enrolled",
        label: "Enrolled (0 EGP)",
        description: "Enrolled leads in this cohort with 0 EGP recorded.",
        detail: `Counted as enrolled (${pipeline}) with 0 EGP recorded`,
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
      return ["stage_booked", "progressed_attended", "progressed_enrolled", "audition_date_other"];
    case "attended":
      return ["stage_attended", "outcome_attended", "progressed_enrolled", "enrolled_rollup"];
    case "enrolled":
      return ["stage_enrolled", "outcome_registered", "cash_recorded"];
    case "cash":
      return ["paid_enrolled", "unpaid_enrolled"];
    case "awaiting_reply":
      return ["new_unread", "unread", "stage_new"];
    default:
      return ["booked", "attended", "enrolled", "not_booked"];
  }
}

function checkExcludedMilestone(
  metric: FunnelAuditMetric,
  c: AuditConversationInput,
  flags: { booked: boolean; attended: boolean; enrolled: boolean; cashIn: number },
  createdTs: number,
  options: {
    isAllTime: boolean;
    realAssigned: boolean;
    matchesAgent: boolean;
    agentFilterLower: string | null;
    inPeriod: (ts: number | null | undefined) => boolean;
    assignedAgent: string;
  }
): FunnelAuditExcludedRow | null {
  const src = getSourceObject(c);
  const pipeline = (c.pipeline || "New").trim();
  const auditionDate = (c.auditionDate || "").trim();

  let milestoneReached = false;
  let milestoneTs: number | null = null;
  let actorName = options.assignedAgent;
  let milestoneWord = "lead";

  if (metric === "leads") {
    milestoneReached = true;
    milestoneTs = createdTs;
    milestoneWord = "created";
  } else if (metric === "booked") {
    milestoneReached = flags.booked;
    milestoneTs = getBookedTime(c) ?? (flags.enrolled ? getConvertedTime(c) : null);
    actorName = (c.bookedBy || src?.bookedBy || options.assignedAgent).trim();
    milestoneWord = "booked";
  } else if (metric === "attended") {
    milestoneReached = flags.attended;
    milestoneTs = getAttendedTime(c) ?? (flags.enrolled ? getConvertedTime(c) : null);
    actorName = (c.attendedBy || src?.attendedBy || options.assignedAgent).trim();
    milestoneWord = "attended";
  } else if (metric === "enrolled" || metric === "cash") {
    milestoneReached = metric === "cash" ? flags.enrolled && flags.cashIn > 0 : flags.enrolled;
    milestoneTs = getConvertedTime(c);
    actorName = (c.enrolledBy || src?.enrolledBy || options.assignedAgent).trim();
    milestoneWord = metric === "cash" ? "paid" : "enrolled";
  } else {
    return null;
  }

  if (!milestoneReached) return null;

  const makeRow = (
    excludedReason: FunnelAuditExcludedReason,
    excludedDetail: string
  ): FunnelAuditExcludedRow => ({
    id: c.id,
    leadName: getAuditDisplayName(c),
    leadPhone: c.phone || "",
    assignedAgent: options.assignedAgent,
    actorName,
    pipeline,
    auditionDate,
    cashIn: flags.cashIn,
    createdTs,
    milestoneTs,
    excludedReason,
    excludedDetail,
  });

  if (options.agentFilterLower === null && !options.realAssigned) {
    const relevantTs = metric === "leads" ? createdTs : milestoneTs || createdTs;
    if (options.isAllTime || options.inPeriod(relevantTs)) {
      return makeRow(
        "unassigned",
        `Lead is ${options.assignedAgent} (not assigned to a staff member), so it is excluded from agent cohort metrics.`
      );
    }
    return null;
  }

  if (
    metric !== "leads" &&
    !options.isAllTime &&
    options.realAssigned &&
    options.matchesAgent &&
    !options.inPeriod(createdTs) &&
    options.inPeriod(milestoneTs)
  ) {
    return makeRow(
      "outside_period_created",
      `Milestone (${milestoneWord}) occurred in this period, but lead was created outside the selected date range.`
    );
  }

  if (
    metric !== "leads" &&
    options.agentFilterLower !== null &&
    options.realAssigned &&
    !options.matchesAgent &&
    (options.isAllTime || options.inPeriod(createdTs)) &&
    actorName.toLowerCase() === options.agentFilterLower
  ) {
    return makeRow(
      "reassigned_actor",
      `Action logged by ${actorName}, but lead is currently assigned to ${options.assignedAgent} (attributed to current owner).`
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

  switch (target.metric) {
    case "leads":
      return {
        title: `Assigned Leads Audit — ${counts.totalCount.toLocaleString("en-US")}`,
        ruleSummary: `All conversations currently assigned to ${scopeLabel} whose creation timestamp falls inside ${periodLabel}. Unassigned, Staff, and System threads are excluded.`,
        formulaText: `${counts.cohortLeadsCount} assigned leads -> ${counts.cohortBookedCount} booked (${bookingRateStr}%) -> ${counts.cohortAttendedCount} attended -> ${counts.cohortEnrolledCount} enrolled (${winRateStr}% win)`,
      };
    case "booked":
      return {
        title: `Booked Audit — ${counts.totalCount.toLocaleString("en-US")}`,
        ruleSummary: `From the ${counts.cohortLeadsCount} assigned leads in ${scopeLabel} (${periodLabel}), ${counts.totalCount} reached Audition Booked or a later cumulative stage (Attended / Enrolled), or have an audition date recorded.`,
        formulaText: `${counts.cohortBookedCount} booked / ${counts.cohortLeadsCount} assigned leads = ${bookingRateStr}% booking rate (${Math.max(0, counts.cohortLeadsCount - counts.cohortBookedCount)} not booked)`,
      };
    case "attended":
      return {
        title: `Attended Audit — ${counts.totalCount.toLocaleString("en-US")}`,
        ruleSummary: `From the ${counts.cohortBookedCount} booked leads in ${scopeLabel} (${periodLabel}), ${counts.totalCount} attended an audition or enrolled/paid directly. No-Show and Joining Later are excluded unless later enrolled.`,
        formulaText: `${counts.cohortAttendedCount} attended / ${counts.cohortBookedCount} booked = ${showRateStr}% show-up rate (${Math.max(0, counts.cohortBookedCount - counts.cohortAttendedCount)} booked not attended)`,
      };
    case "enrolled":
      return {
        title: `Enrolled Audit — ${counts.totalCount.toLocaleString("en-US")}`,
        ruleSummary: `From ${scopeLabel}'s cohort (${periodLabel}), ${counts.totalCount} leads have pipeline Enrolled/Registered, outcome Registered, or recorded tuition cash (> 0 EGP).`,
        formulaText: `${counts.cohortEnrolledCount} enrolled / ${counts.cohortAttendedCount} attended = ${closeRateStr}% close rate (${winRateStr}% of ${counts.cohortLeadsCount} leads)`,
      };
    case "cash": {
      const avgPerStudent =
        counts.cohortEnrolledCount > 0
          ? Math.round(counts.cohortCashTotal / counts.cohortEnrolledCount)
          : 0;
      return {
        title: `Revenue Audit — ${formatEgp(counts.cohortCashTotal)}`,
        ruleSummary: `Sum of cashIn across the ${counts.cohortEnrolledCount} enrolled/converted leads in ${scopeLabel}'s cohort (${periodLabel}).`,
        formulaText: `${formatEgp(counts.cohortCashTotal)} from ${counts.paidCount} paid record${counts.paidCount === 1 ? "" : "s"}${counts.unpaidEnrolledCount > 0 ? ` + ${counts.unpaidEnrolledCount} enrolled with 0 EGP` : ""} · avg ${formatEgp(avgPerStudent)} / enrolled`,
      };
    }
    case "stage": {
      const pct = Math.round(clampRatePct(counts.totalCount, counts.cohortLeadsCount));
      return {
        title: `Stage Audit: ${target.stage} — ${counts.totalCount.toLocaleString("en-US")}`,
        ruleSummary: `Leads in ${scopeLabel}'s cohort (${periodLabel}) whose current pipeline stage is "${target.stage}".`,
        formulaText: `${counts.totalCount} of ${counts.cohortLeadsCount} cohort leads (${pct}%)`,
      };
    }
    case "channel": {
      const pct = Math.round(clampRatePct(counts.totalCount, counts.cohortLeadsCount));
      return {
        title: `Channel Audit: ${target.channel} — ${counts.totalCount.toLocaleString("en-US")}`,
        ruleSummary: `Leads in ${scopeLabel}'s cohort (${periodLabel}) originating from ${target.channel}.`,
        formulaText: `${counts.totalCount} of ${counts.cohortLeadsCount} cohort leads (${pct}%)`,
      };
    }
    case "awaiting_reply":
      return {
        title: `Awaiting Reply Audit — ${counts.totalCount.toLocaleString("en-US")}`,
        ruleSummary: `Leads in ${scopeLabel}'s cohort (${periodLabel}) that have unread incoming messages or remain in the New stage.`,
        formulaText: `${counts.totalCount} of ${counts.cohortLeadsCount} cohort leads awaiting reply`,
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
    if (!ts || ts <= 0) return false;
    if (isAllTime) return true;
    return ts >= periodStartMs && ts <= periodEndMs;
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
    const cashIn = enrolled ? Number(c.cashIn) || 0 : 0;

    const matchesAgent = agentFilterLower === null ? realAssigned : assignedLower === agentFilterLower;
    const inCohort = realAssigned && matchesAgent && inPeriod(createdTs);

    if (!inCohort) {
      const excluded = checkExcludedMilestone(
        target.metric,
        c,
        { booked, attended, enrolled, cashIn },
        createdTs,
        {
          isAllTime,
          realAssigned,
          matchesAgent,
          agentFilterLower,
          inPeriod,
          assignedAgent,
        }
      );
      if (excluded) excludedRows.push(excluded);
      continue;
    }

    cohortLeadsCount += 1;
    if (booked) cohortBookedCount += 1;
    if (attended) cohortAttendedCount += 1;
    if (enrolled) {
      cohortEnrolledCount += 1;
      cohortCashTotal += cashIn;
    }

    const reason = classifyMetricReason(target, c, {
      booked,
      attended,
      enrolled,
      directAttended,
      cashIn,
    });
    if (!reason) continue;

    if (enrolled) {
      if (cashIn > 0) paidCount += 1;
      else unpaidEnrolledCount += 1;
    }

    const bookedTs = booked ? getBookedTime(c) : null;
    const attendedTs = attended ? getAttendedTime(c) : null;
    const convertedTs = enrolled ? getConvertedTime(c) : null;

    rows.push({
      id: c.id,
      leadName: getAuditDisplayName(c),
      leadPhone: c.phone || "",
      channelLabel: getAuditChannelLabel(c),
      branch: (c.branch || "").trim(),
      assignedAgent,
      bookedBy: (c.bookedBy || src?.bookedBy || "").trim() || undefined,
      attendedBy: (c.attendedBy || src?.attendedBy || "").trim() || undefined,
      enrolledBy: (c.enrolledBy || src?.enrolledBy || "").trim() || undefined,
      pipeline: (c.pipeline || "New").trim(),
      auditionDate: (c.auditionDate || "").trim(),
      auditionOutcome: (c.auditionOutcome || "").trim(),
      followUpDate: (c.followUpDate || "").trim(),
      cashIn,
      createdTs,
      createdSource: getCreatedTimeSource(c),
      bookedTs,
      attendedTs,
      convertedTs,
      reasonKey: reason.key,
      reasonLabel: reason.label,
      reasonDetail: reason.detail,
      isBooked: booked,
      isAttended: attended,
      isEnrolled: enrolled,
    });

    const existingBucket = bucketMap.get(reason.key);
    if (existingBucket) {
      existingBucket.count += 1;
      existingBucket.cashTotal += cashIn;
    } else {
      bucketMap.set(reason.key, {
        key: reason.key,
        label: reason.label,
        description: reason.description,
        count: 1,
        cashTotal: cashIn,
      });
    }

    const existingAgent = agentMap.get(assignedLower);
    if (existingAgent) {
      existingAgent.count += 1;
      existingAgent.cashTotal += cashIn;
    } else {
      agentMap.set(assignedLower, {
        agent: assignedAgent,
        count: 1,
        cashTotal: cashIn,
      });
    }
  }

  rows.sort((a, b) => {
    if (target.metric === "cash") {
      if (b.cashIn !== a.cashIn) return b.cashIn - a.cashIn;
      return (b.convertedTs || b.createdTs) - (a.convertedTs || a.createdTs);
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

  const totalCash = rows.reduce((sum, r) => sum + r.cashIn, 0);
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

