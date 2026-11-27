export type DirectorBadgeTone =
  | "blue"
  | "indigo"
  | "teal"
  | "green"
  | "amber"
  | "orange"
  | "red"
  | "purple"
  | "slate";

export type DirectorTimelineCategory =
  | "stage"
  | "outcome"
  | "followup"
  | "note"
  | "reschedule"
  | "booking";

export interface DirectorTimelineItem {
  id: string;
  category: DirectorTimelineCategory;
  tone: DirectorBadgeTone;
  summary: string;
  detail?: string;
  fromValue?: string;
  toValue?: string;
  timestamp: number;
}

export interface DirectorFollowUpSummary {
  hasRequest: boolean;
  date: string;
  note: string;
  isJoiningLater: boolean;
  isScheduleFollowUp: boolean;
  isPaymentPending: boolean;
  isTrialSession: boolean;
  completed: boolean;
  completedAt: string;
}

export interface DirectorLeadInsights {
  hasUpdates: boolean;
  pipeline: string;
  pipelineTone: DirectorBadgeTone;
  auditionOutcome: string;
  auditionOutcomeLabel: string;
  auditionOutcomeTone: DirectorBadgeTone;
  hasStageChange: boolean;
  hasReschedule: boolean;
  lostReason: string;
  lostReasonNote: string;
  leadNote: string;
  followUp: DirectorFollowUpSummary;
  timeline: DirectorTimelineItem[];
  lastUpdatedAt: number | null;
}

export interface DirectorLeadActivityEntryLike {
  id?: string;
  type?: string;
  actor?: string;
  actorRole?: string;
  summary?: string;
  detail?: string;
  fromValue?: string;
  toValue?: string;
  timestamp?: number | string;
}

export interface DirectorLeadConversationLike {
  id?: string;
  pipeline?: string | null;
  auditionOutcome?: string | null;
  lostReason?: string | null;
  lostReasonNote?: string | null;
  notes?: string | null;
  followUpNote?: string | null;
  followUpDate?: string | null;
  followUpTags?: ReadonlyArray<string> | null;
  followUpCompleted?: boolean | null;
  followUpCompletedAt?: string | null;
  auditionDate?: string | null;
  auditionBookedAt?: string | number | null;
  formAnswers?: {
    instrument?: string | null;
    studentAge?: string | null;
    followUpNote?: string | null;
    notes?: string | null;
  } | null;
  activityLog?: ReadonlyArray<DirectorLeadActivityEntryLike> | null;
  updatedAt?: string | number | null;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PURE_TIME_RE =
  /^(?:(?:0?[1-9]|1[0-2]):[0-5][0-9]\s*(?:AM|PM)|(?:[01]?[0-9]|2[0-3]):[0-5][0-9])$/i;
const LEADING_TIME_AND_SUFFIX_RE =
  /^(?:(?:0?[1-9]|1[0-2]):[0-5][0-9]\s*(?:AM|PM)|(?:[01]?[0-9]|2[0-3]):[0-5][0-9])\s*[·\-|,]\s*(.+)$/i;

const PIPELINE_TONES: Record<string, DirectorBadgeTone> = {
  New: "blue",
  Contacted: "indigo",
  Qualified: "teal",
  "Audition Booked": "orange",
  Attended: "green",
  Enrolled: "green",
  "Joining Later": "amber",
  Unqualified: "slate",
  Lost: "red",
  direct: "slate",
};

const OUTCOME_META: Record<string, { label: string; tone: DirectorBadgeTone }> = {
  registered: { label: "Registered", tone: "green" },
  "schedule-followup": { label: "Schedule Follow-up", tone: "blue" },
  "paid-trial": { label: "Paid Trial", tone: "purple" },
  "joining-later": { label: "Joining Later", tone: "amber" },
  "no-show": { label: "No-Show", tone: "red" },
  booked: { label: "Audition Booked", tone: "orange" },
};

const BLOCKED_ACTIVITY_TYPES = new Set([
  "message_sent",
  "lead_assigned",
  "cash_recorded",
  "branch_changed",
]);

function isIsoDate(value?: string | null): value is string {
  return typeof value === "string" && ISO_DATE_RE.test(value.trim());
}

function normalizeOutcomeKey(raw?: string | null): string {
  if (!raw || typeof raw !== "string") return "";
  const val = raw.trim().toLowerCase();
  if (!val) return "";
  if (val === "attended" || val === "confirmed") return "schedule-followup";
  if (val === "declined") return "no-show";
  if (val === "no-response") return "booked";
  if (val === "enrolled") return "registered";
  return val;
}

function cleanLeadNoteText(raw?: string | null): string {
  if (!raw || typeof raw !== "string") return "";
  const stripped = raw.replace(/\[no[- ]?(?:response|show)\]/gi, "").trim();
  if (!stripped || stripped.toLowerCase() === "no-show" || stripped.toLowerCase() === "no show") {
    return "";
  }
  return stripped;
}

function parseTimestampMs(raw?: number | string | null): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  let ts = 0;
  if (typeof raw === "number") {
    ts = raw;
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    ts = Number.isFinite(numeric) ? numeric : new Date(trimmed).getTime();
  }
  if (!Number.isFinite(ts) || ts <= 0) return null;
  if (ts < 10_000_000_000) ts *= 1000;
  return ts;
}

function normalizeIsoDateString(raw?: string | null): string {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (ISO_DATE_RE.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  return "";
}

/**
 * Extracts a meaningful follow-up note while ignoring auto-generated audition time prefixes
 * such as `"05:00 PM"` or `"05:00 PM · Piano"`.
 */
export function extractMeaningfulDirectorFollowUpNote(input: {
  followUpNote?: string | null;
  formAnswers?: {
    instrument?: string | null;
    followUpNote?: string | null;
  } | null;
}): string {
  const raw = (input.followUpNote || input.formAnswers?.followUpNote || "").trim();
  if (!raw) return "";
  if (PURE_TIME_RE.test(raw)) return "";

  const match = raw.match(LEADING_TIME_AND_SUFFIX_RE);
  if (match) {
    const suffix = match[1].trim();
    if (!suffix) return "";
    const instrument = (input.formAnswers?.instrument || "").trim();
    if (instrument && suffix.toLowerCase() === instrument.toLowerCase()) {
      return "";
    }
    return suffix;
  }

  return raw;
}

/** Formats a YYYY-MM-DD calendar date safely without UTC timezone shift. */
export function formatIsoDateDisplay(isoDate: string): string {
  const normalized = normalizeIsoDateString(isoDate);
  if (!normalized) return isoDate;
  const [y, m, d] = normalized.split("-").map(Number);
  if (!y || !m || !d) return normalized;
  const localDate = new Date(y, m - 1, d);
  if (Number.isNaN(localDate.getTime())) return normalized;
  return localDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Returns whether a YYYY-MM-DD follow-up date is overdue, today, or upcoming relative to today. */
export function getFollowUpDateRelativeLabel(
  isoDate: string,
  todayIso?: string
): "overdue" | "today" | "upcoming" | null {
  const target = normalizeIsoDateString(isoDate);
  if (!target) return null;
  const now = new Date();
  const refToday =
    todayIso && isIsoDate(todayIso)
      ? todayIso.trim()
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
          now.getDate()
        ).padStart(2, "0")}`;
  if (target < refToday) return "overdue";
  if (target === refToday) return "today";
  return "upcoming";
}

function getPipelineTone(pipeline: string): DirectorBadgeTone {
  return PIPELINE_TONES[pipeline] || "slate";
}

function getStageChangeTone(toStage?: string, summary?: string): DirectorBadgeTone {
  const target = (toStage || "").trim();
  if (target && PIPELINE_TONES[target]) return PIPELINE_TONES[target];
  if (summary && summary.toLowerCase().includes("lost")) return "red";
  return "indigo";
}

/**
 * Derives Enrollment Director lead insights, `(i)` badge visibility, and a strictly
 * anonymized, chat-free change timeline from a conversation record.
 */
export function computeDirectorLeadInsights(
  conv?: DirectorLeadConversationLike | null
): DirectorLeadInsights {
  const pipeline = (conv?.pipeline || "").trim() || "Audition Booked";
  const pipelineTone = getPipelineTone(pipeline);
  const rawOutcome = normalizeOutcomeKey(conv?.auditionOutcome);
  const outcomeMeta = rawOutcome ? OUTCOME_META[rawOutcome] : undefined;
  const auditionOutcome = rawOutcome;
  const auditionOutcomeLabel = outcomeMeta?.label || (rawOutcome ? rawOutcome : "");
  const auditionOutcomeTone: DirectorBadgeTone = outcomeMeta?.tone || "slate";

  const lostReason = pipeline === "Lost" ? (conv?.lostReason || "").trim() : "";
  const lostReasonNote = pipeline === "Lost" ? (conv?.lostReasonNote || "").trim() : "";

  const leadNote =
    cleanLeadNoteText(conv?.notes) || cleanLeadNoteText(conv?.formAnswers?.notes);

  const auditionDate = normalizeIsoDateString(conv?.auditionDate);
  const followUpDateRaw = normalizeIsoDateString(conv?.followUpDate);
  const tags = Array.isArray(conv?.followUpTags)
    ? conv.followUpTags.map((t) => String(t).trim().toLowerCase()).filter(Boolean)
    : [];

  const isJoiningLater = pipeline === "Joining Later" || auditionOutcome === "joining-later";
  const isScheduleFollowUp = auditionOutcome === "schedule-followup";
  const isPaymentPending = tags.includes("payment-pending");
  const isTrialSession = tags.includes("trial-session");
  const followUpCompleted = Boolean(conv?.followUpCompleted);
  const followUpCompletedAt = normalizeIsoDateString(conv?.followUpCompletedAt);

  const meaningfulFollowUpNote = extractMeaningfulDirectorFollowUpNote({
    followUpNote: conv?.followUpNote,
    formAnswers: conv?.formAnswers,
  });

  const hasExplicitFollowUpDate = Boolean(
    isIsoDate(followUpDateRaw) &&
      (!auditionDate ||
        followUpDateRaw !== auditionDate ||
        isJoiningLater ||
        isScheduleFollowUp ||
        isPaymentPending ||
        isTrialSession ||
        Boolean(meaningfulFollowUpNote) ||
        followUpCompleted)
  );

  const followUp: DirectorFollowUpSummary = {
    hasRequest: Boolean(
      isJoiningLater ||
        isScheduleFollowUp ||
        isPaymentPending ||
        isTrialSession ||
        hasExplicitFollowUpDate ||
        meaningfulFollowUpNote ||
        followUpCompleted
    ),
    date: hasExplicitFollowUpDate ? followUpDateRaw : "",
    note: meaningfulFollowUpNote,
    isJoiningLater,
    isScheduleFollowUp,
    isPaymentPending,
    isTrialSession,
    completed: followUpCompleted,
    completedAt: followUpCompletedAt,
  };

  const hasStageChange = Boolean(
    (pipeline && pipeline !== "Audition Booked") ||
      (auditionOutcome && auditionOutcome !== "booked") ||
      (pipeline === "Lost" && (lostReason || lostReasonNote))
  );

  // Sanitize activity log chronologically first so earliest booking vs reschedules are clear.
  const rawLog = Array.isArray(conv?.activityLog) ? conv.activityLog : [];
  const validEntries: Array<{
    entry: DirectorLeadActivityEntryLike;
    id: string;
    type: string;
    ts: number;
  }> = [];

  for (let i = 0; i < rawLog.length; i++) {
    const entry = rawLog[i];
    if (!entry || typeof entry !== "object") continue;
    const type = typeof entry.type === "string" ? entry.type.trim() : "";
    if (!type || BLOCKED_ACTIVITY_TYPES.has(type)) continue;
    const id = typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : "";
    if (!id) continue;
    const ts = parseTimestampMs(entry.timestamp);
    if (ts === null) continue;
    validEntries.push({ entry, id, type, ts });
  }

  validEntries.sort((a, b) => a.ts - b.ts);

  const bookingTimestamps = new Set<number>();
  let earliestBookingTs: number | null = parseTimestampMs(conv?.auditionBookedAt);
  let auditionBookedCount = 0;

  for (const item of validEntries) {
    if (item.type === "audition_booked") {
      auditionBookedCount += 1;
      bookingTimestamps.add(item.ts);
      if (earliestBookingTs === null || item.ts < earliestBookingTs) {
        earliestBookingTs = item.ts;
      }
    }
  }

  let hasReschedule = false;
  let hasPostBookingActivity = false;
  let seenInitialBooking = false;
  const sanitizedChronological: DirectorTimelineItem[] = [];

  for (const { entry, id, type, ts } of validEntries) {
    const rawSummary = typeof entry.summary === "string" ? entry.summary.trim() : "";
    const rawDetail = typeof entry.detail === "string" ? entry.detail.trim() : "";
    const fromVal = typeof entry.fromValue === "string" ? entry.fromValue.trim() : "";
    const toVal = typeof entry.toValue === "string" ? entry.toValue.trim() : "";

    if (type === "audition_booked") {
      const explicitDateChange =
        isIsoDate(fromVal) && isIsoDate(toVal) && fromVal !== toVal;
      const isSubsequentBooking = auditionBookedCount >= 2 && seenInitialBooking;
      seenInitialBooking = true;

      if (explicitDateChange || isSubsequentBooking) {
        hasReschedule = true;
        hasPostBookingActivity = true;
        sanitizedChronological.push({
          id,
          category: "reschedule",
          tone: "blue",
          summary: "Audition rescheduled",
          ...(rawDetail ? { detail: rawDetail } : {}),
          ...(fromVal ? { fromValue: fromVal } : {}),
          ...(toVal ? { toValue: toVal } : {}),
          timestamp: ts,
        });
      } else {
        sanitizedChronological.push({
          id,
          category: "booking",
          tone: "orange",
          summary: rawSummary || "Booked audition",
          ...(rawDetail ? { detail: rawDetail } : {}),
          ...(fromVal ? { fromValue: fromVal } : {}),
          ...(toVal ? { toValue: toVal } : {}),
          timestamp: ts,
        });
      }
      continue;
    }

    if (type === "followup_scheduled") {
      const meaningfulDetail = extractMeaningfulDirectorFollowUpNote({
        followUpNote: rawDetail,
        formAnswers: conv?.formAnswers,
      });
      const matchesBooking =
        (auditionDate && toVal === auditionDate) || bookingTimestamps.has(ts);

      if (matchesBooking && !meaningfulDetail) {
        // Skip synthetic follow-up log generated automatically when booking an audition slot.
        continue;
      }

      hasPostBookingActivity = true;
      sanitizedChronological.push({
        id,
        category: "followup",
        tone: "blue",
        summary: rawSummary || "Follow-up scheduled",
        ...(meaningfulDetail ? { detail: meaningfulDetail } : {}),
        ...(fromVal ? { fromValue: fromVal } : {}),
        ...(toVal ? { toValue: toVal } : {}),
        timestamp: ts,
      });
      continue;
    }

    if (type === "followup_completed") {
      hasPostBookingActivity = true;
      const cleanDetail = extractMeaningfulDirectorFollowUpNote({
        followUpNote: rawDetail,
        formAnswers: conv?.formAnswers,
      });
      sanitizedChronological.push({
        id,
        category: "followup",
        tone: "green",
        summary: rawSummary || "Follow-up completed",
        ...(cleanDetail ? { detail: cleanDetail } : {}),
        ...(fromVal ? { fromValue: fromVal } : {}),
        ...(toVal ? { toValue: toVal } : {}),
        timestamp: ts,
      });
      continue;
    }

    if (type === "audition_outcome") {
      hasPostBookingActivity = true;
      const outcomeTone = OUTCOME_META[normalizeOutcomeKey(toVal)]?.tone || "teal";
      sanitizedChronological.push({
        id,
        category: "outcome",
        tone: outcomeTone,
        summary: rawSummary || "Updated audition outcome",
        ...(rawDetail ? { detail: rawDetail } : {}),
        ...(fromVal ? { fromValue: fromVal } : {}),
        ...(toVal ? { toValue: toVal } : {}),
        timestamp: ts,
      });
      continue;
    }

    if (type === "note_updated") {
      const cleanDetail = cleanLeadNoteText(rawDetail);
      const cleanTo = cleanLeadNoteText(toVal);
      const cleanFrom = cleanLeadNoteText(fromVal);
      const isLostReasonUpdate = rawSummary.toLowerCase().includes("lost reason");
      if (!cleanDetail && !cleanTo && !isLostReasonUpdate) {
        continue;
      }
      hasPostBookingActivity = true;
      sanitizedChronological.push({
        id,
        category: "note",
        tone: isLostReasonUpdate ? "red" : "slate",
        summary: rawSummary || "Updated lead notes",
        ...(cleanDetail ? { detail: cleanDetail } : {}),
        ...(cleanFrom ? { fromValue: cleanFrom } : {}),
        ...(cleanTo ? { toValue: cleanTo } : {}),
        timestamp: ts,
      });
      continue;
    }

    if (type === "stage_changed") {
      if (earliestBookingTs === null || ts > earliestBookingTs) {
        hasPostBookingActivity = true;
      }
      sanitizedChronological.push({
        id,
        category: "stage",
        tone: getStageChangeTone(toVal, rawSummary),
        summary: rawSummary || (toVal ? `Moved stage to ${toVal}` : "Stage updated"),
        ...(rawDetail ? { detail: rawDetail } : {}),
        ...(fromVal ? { fromValue: fromVal } : {}),
        ...(toVal ? { toValue: toVal } : {}),
        timestamp: ts,
      });
    }
  }

  // Deduplicate identical consecutive entries and return newest first.
  const deduped: DirectorTimelineItem[] = [];
  let prevSig = "";
  for (const item of sanitizedChronological) {
    const sig = `${item.category}|${item.summary}|${item.detail || ""}|${item.fromValue || ""}|${
      item.toValue || ""
    }|${item.timestamp}`;
    if (sig === prevSig) continue;
    prevSig = sig;
    deduped.push(item);
  }

  const timeline = deduped.reverse();
  const latestTimelineTs = timeline.length > 0 ? timeline[0].timestamp : null;
  const fallbackUpdatedTs = parseTimestampMs(conv?.updatedAt);
  const lastUpdatedAt = latestTimelineTs ?? fallbackUpdatedTs;

  const hasUpdates = Boolean(
    leadNote ||
      followUp.hasRequest ||
      hasStageChange ||
      hasReschedule ||
      hasPostBookingActivity
  );

  return {
    hasUpdates,
    pipeline,
    pipelineTone,
    auditionOutcome,
    auditionOutcomeLabel,
    auditionOutcomeTone,
    hasStageChange,
    hasReschedule,
    lostReason,
    lostReasonNote,
    leadNote,
    followUp,
    timeline,
    lastUpdatedAt,
  };
}

