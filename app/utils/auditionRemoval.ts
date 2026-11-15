export interface AuditionActivityEntry {
  id: string;
  type:
    | "message_sent"
    | "lead_assigned"
    | "stage_changed"
    | "audition_booked"
    | "audition_outcome"
    | "followup_scheduled"
    | "followup_completed"
    | "cash_recorded"
    | "note_updated"
    | "branch_changed";
  actor: string;
  actorRole?: string;
  summary: string;
  detail?: string;
  fromValue?: string;
  toValue?: string;
  timestamp: number;
}

export interface AuditionSourceObject {
  campaign?: string;
  adset?: string;
  ad?: string;
  auditionBookedAt?: string;
  attendedAt?: string;
  enrolledAt?: string;
  paidAt?: string;
  bookedBy?: string;
  attendedBy?: string;
  enrolledBy?: string;
  leadNameEdited?: boolean;
  editedLeadName?: string;
  leadNameEditedAt?: string;
  cashIn?: number;
  activityLog?: AuditionActivityEntry[];
  [key: string]: unknown;
}

export interface AuditionRemovalConversation {
  id: string;
  pipeline?: string;
  notes?: string;
  followUpNote?: string;
  followUpDate?: string;
  followUpCompleted?: boolean;
  auditionDate?: string;
  auditionOutcome?: string;
  auditionBookedAt?: string;
  attendedAt?: string;
  enrolledAt?: string;
  bookedBy?: string;
  attendedBy?: string;
  enrolledBy?: string;
  cashIn?: number;
  branch?: string;
  formAnswers?: {
    instrument?: string;
    studentAge?: string;
    followUpNote?: string;
    notes?: string;
  };
  source?: AuditionSourceObject | string;
  activityLog?: AuditionActivityEntry[];
}

export interface RemoveAuditionPatchOptions {
  actorName?: string;
  actorRole?: string;
  nowTs?: number;
}

export type AuditionRemovalPatch = Record<string, unknown> & {
  pipeline: "Contacted";
  auditionDate: "";
  auditionOutcome: "";
  auditionBookedAt: null;
  attendedAt: null;
  enrolledAt: null;
  bookedBy: "";
  attendedBy: "";
  enrolledBy: "";
  source: AuditionSourceObject | string;
  activityLog: AuditionActivityEntry[];
  notes?: string;
  followUpDate?: "";
  followUpNote?: "";
  followUpCompleted?: false;
  followUpCompletedAt?: null;
};

const BOOKING_TIME_NOTE_RE = /^\d{1,2}:\d{2}(?:\s*(?:AM|PM))?(?:\s*·.*)?$/i;
const OUTCOME_FOLLOWUP_NOTES = new Set([
  "schedule to complete enrollment",
  "joining later - follow up",
]);

/** Collects all localStorage cache keys associated with a calendar slot ID and optional conversation ID. */
export function collectSlotLocalKeys(
  slotId: string | number,
  conversationId?: string
): string[] {
  const keys = new Set<string>([String(slotId)]);
  if (conversationId) {
    keys.add(conversationId);
    keys.add(`crm-${conversationId}`);
  }
  return Array.from(keys);
}

/** Removes the specified keys from a dictionary and captures the removed entries for rollback. */
export function omitRecordKeys<T>(
  record: Readonly<Record<string, T>>,
  keys: ReadonlyArray<string>
): { next: Record<string, T>; removed: Record<string, T>; changed: boolean } {
  const keySet = new Set(keys);
  const next: Record<string, T> = {};
  const removed: Record<string, T> = {};
  let changed = false;

  for (const [k, value] of Object.entries(record)) {
    if (keySet.has(k)) {
      removed[k] = value;
      changed = true;
    } else {
      next[k] = value;
    }
  }

  return { next, removed, changed };
}

/** Removes No-Show marker text added by audition outcome actions while preserving real agent notes. */
export function stripAuditionNoShowTag(notes?: string | null): string {
  if (!notes) return "";
  const cleaned = notes.replace(/\[no[- ]?show\]/gi, "").trim();
  if (cleaned.toLowerCase() === "no-show") {
    return "";
  }
  return cleaned;
}

/** Returns true when the lead's follow-up was created by audition booking or audition follow-up outcomes. */
export function isAuditionDerivedFollowUp(
  conv: Pick<
    AuditionRemovalConversation,
    "pipeline" | "auditionDate" | "auditionOutcome" | "followUpDate" | "followUpNote"
  >
): boolean {
  const outcome = (conv.auditionOutcome || "").trim().toLowerCase();
  const pipeline = (conv.pipeline || "").trim();
  if (
    outcome === "schedule-followup" ||
    outcome === "joining-later" ||
    pipeline === "Joining Later"
  ) {
    return true;
  }

  const auditionDate = (conv.auditionDate || "").trim();
  const followUpDate = (conv.followUpDate || "").trim();
  if (auditionDate && followUpDate && followUpDate === auditionDate) {
    return true;
  }

  const cleanNote = (conv.followUpNote || "").trim();
  if (!cleanNote) return false;
  if (BOOKING_TIME_NOTE_RE.test(cleanNote)) return true;
  return OUTCOME_FOLLOWUP_NOTES.has(cleanNote.toLowerCase());
}

/** Filters audition booking/outcome events out of activity history while keeping non-audition logs intact. */
export function sanitizeAuditionActivityLog(
  activityLog?: ReadonlyArray<AuditionActivityEntry> | null
): AuditionActivityEntry[] {
  if (!Array.isArray(activityLog)) return [];
  return activityLog.filter(
    (entry) =>
      Boolean(entry) &&
      entry.type !== "audition_booked" &&
      entry.type !== "audition_outcome"
  );
}

/** Strips audition booking/attendance metadata from `source` while keeping attribution and payment data. */
export function sanitizeAuditionSource(
  source: AuditionRemovalConversation["source"],
  cleanedActivityLog: AuditionActivityEntry[]
): AuditionSourceObject | string {
  if (typeof source === "object" && source !== null) {
    const rest: AuditionSourceObject = {};
    const excluded = new Set([
      "auditionBookedAt",
      "attendedAt",
      "enrolledAt",
      "bookedBy",
      "attendedBy",
      "enrolledBy",
      "activityLog",
    ]);
    for (const [key, val] of Object.entries(source)) {
      if (!excluded.has(key)) {
        rest[key] = val;
      }
    }
    if (cleanedActivityLog.length > 0) {
      rest.activityLog = cleanedActivityLog;
    }
    return rest;
  }

  if (cleanedActivityLog.length > 0) {
    const campaign =
      typeof source === "string" && source.trim() && source !== "direct"
        ? source
        : "Organic / Direct";
    return {
      campaign,
      activityLog: cleanedActivityLog,
    };
  }

  return typeof source === "string" && source.trim() ? source : "direct";
}

/** Builds a full-undo PATCH payload that clears audition schedule, outcome, metrics, and reverts stage to Contacted. */
export function buildRemoveAuditionPatch(
  conv: AuditionRemovalConversation,
  options: RemoveAuditionPatchOptions = {}
): AuditionRemovalPatch {
  const nowTs = options.nowTs ?? Date.now();
  const actorName = (options.actorName || "Staff").trim() || "Staff";
  const actorRole = options.actorRole || "";
  const prevPipeline = (conv.pipeline || "New").trim();

  const cleanedLog = sanitizeAuditionActivityLog(conv.activityLog);
  const nextActivityLog: AuditionActivityEntry[] =
    prevPipeline === "Contacted"
      ? [
          {
            id: `act_${nowTs}_audrem`,
            type: "stage_changed" as const,
            actor: actorName,
            actorRole,
            summary: "Removed audition booking",
            detail: conv.auditionDate
              ? `Cleared audition (${conv.auditionDate})`
              : "Cleared audition slot",
            fromValue: conv.auditionDate || "Audition Booked",
            toValue: "Contacted",
            timestamp: nowTs,
          },
          ...cleanedLog,
        ].slice(0, 250)
      : cleanedLog;

  const cleanedSource = sanitizeAuditionSource(conv.source, nextActivityLog);

  const patch: AuditionRemovalPatch = {
    pipeline: "Contacted",
    auditionDate: "",
    auditionOutcome: "",
    auditionBookedAt: null,
    attendedAt: null,
    enrolledAt: null,
    bookedBy: "",
    attendedBy: "",
    enrolledBy: "",
    source: cleanedSource,
    activityLog: nextActivityLog,
  };

  const rawNotes = (conv.notes || "").trim();
  const cleanedNotes = stripAuditionNoShowTag(conv.notes);
  if (cleanedNotes !== rawNotes) {
    patch.notes = cleanedNotes;
  }

  if (isAuditionDerivedFollowUp(conv)) {
    patch.followUpDate = "";
    patch.followUpNote = "";
    patch.followUpCompleted = false;
    patch.followUpCompletedAt = null;
  }

  return patch;
}

/** Returns true when a CRM conversation belongs on the Auditions calendar. */
export function isLiveAuditionConversation(
  c: Pick<
    AuditionRemovalConversation,
    "id" | "pipeline" | "auditionOutcome" | "auditionDate" | "followUpDate" | "notes" | "formAnswers"
  >,
  statusOverrides: Readonly<Record<string, unknown>>,
  auditionDates: Readonly<Record<string, string>>
): boolean {
  return (
    c.pipeline === "Audition Booked" ||
    c.pipeline === "Attended" ||
    c.pipeline === "Enrolled" ||
    (Boolean(c.auditionOutcome) &&
      (c.auditionOutcome !== "joining-later" ||
        Boolean(c.auditionDate) ||
        Boolean(auditionDates[c.id]) ||
        Boolean(auditionDates[`crm-${c.id}`]))) ||
    statusOverrides[c.id] !== undefined ||
    statusOverrides[`crm-${c.id}`] !== undefined ||
    (c.pipeline === "Contacted" && Boolean(c.auditionDate)) ||
    (c.pipeline === "Qualified" && Boolean(c.auditionDate)) ||
    (c.pipeline === "Joining Later" && Boolean(c.auditionDate)) ||
    (c.pipeline === "Lost" &&
      (Boolean(c.auditionDate) ||
        Boolean(c.followUpDate) ||
        Boolean(c.notes) ||
        Boolean(c.formAnswers?.instrument)))
  );
}
