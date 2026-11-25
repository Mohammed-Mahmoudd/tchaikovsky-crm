import type {
  ClaudeConnectionStatus,
  ClaudeModelOption,
  PlatformAgentInfo,
} from "./claudeAgent";

export type FollowUpSection = "followups" | "instructions" | "skills" | "schedule";

export type FollowUpSendMode = "approval" | "auto";
export type FollowUpLeadReplyAction = "followup_continue" | "handoff_adham" | "handoff_staff";

export const FOLLOWUP_STAGE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "Contacted", label: "Contacted (Default)" },
  { value: "ALL", label: "All stages" },
  { value: "New", label: "New" },
  { value: "Qualified", label: "Qualified" },
  { value: "Audition Booked", label: "Audition Booked" },
  { value: "Attended", label: "Attended" },
  { value: "Joining Later", label: "Joining Later" },
  { value: "Unqualified", label: "Unqualified" },
  { value: "Lost", label: "Lost" },
  { value: "Enrolled", label: "Enrolled" },
];

export type FollowUpChannelTier =
  | "wa_open"
  | "meta_24h"
  | "meta_7d"
  | "meta_expired"
  | "meta_no_incoming"
  | "unsupported";

export type FollowUpEnrollmentStatus =
  | "scheduled"
  | "draft_ready"
  | "sending"
  | "waiting_reply"
  | "replied"
  | "completed"
  | "paused"
  | "stopped"
  | "failed";

export interface FollowUpAgentSettingsData {
  enabled: boolean;
  sendMode: FollowUpSendMode;
  autoEnrollContacted: boolean;
  targetStages: string[];
  channels: {
    wa: boolean;
    fb: boolean;
    ig: boolean;
  };
  allowMetaHumanAgentOnApproval: boolean;
  initialDelayHours: number;
  cadenceDays: number[];
  maxAttempts: number;
  dailyCap: number;
  minGapSeconds: number;
  businessHoursStart: number;
  businessHoursEnd: number;
  pauseOnHumanReply: boolean;
  onLeadReplyAction: FollowUpLeadReplyAction;
  allowAutoBooking: boolean;
  allowLeadUpdates: boolean;
  allowWhatsAppEscalation: boolean;
  environmentId?: string;
  lastSyncedAgentId?: string;
}

export interface FollowUpStatusPayload {
  connection: ClaudeConnectionStatus;
  settings: FollowUpAgentSettingsData;
  platformAgent: PlatformAgentInfo | null;
  platformError: string | null;
  availableModels: ClaudeModelOption[];
  playbookDefaults: {
    name: string;
    model: string;
    system: string;
  };
}

export interface FollowUpHistoryItem {
  attempt: number;
  text: string;
  sentAt: string;
  mode: "approval" | "auto" | "reply";
  channel: string;
  outcome: string;
  note?: string;
}

export interface FollowUpEnrollmentInfo {
  status: FollowUpEnrollmentStatus;
  attemptCount: number;
  nextAttemptAt: string | null;
  lastSentAt: string | null;
  lastDraftedAt: string | null;
  draftText: string;
  draftAttemptNumber: number;
  draftSkillsUsed: string[];
  stopReason: string;
  lastError: string;
  repliedAt: string | null;
  history: FollowUpHistoryItem[];
}

export interface FollowUpChannelWindowInfo {
  channel: string;
  tier: FollowUpChannelTier;
  autoSendable: boolean;
  approvalSendable: boolean;
  hoursRemaining: number | null;
  lastIncomingAt: number | null;
  hasPhone: boolean;
}

export interface FollowUpLeadRow {
  senderId: string;
  name: string;
  phone: string;
  channel: string;
  branch: string;
  pipeline: string;
  agent: string;
  lastMessageAt: number | null;
  lastMessageText: string;
  lastMessageDirection: "incoming" | "outgoing";
  adhamActive: boolean;
  window: FollowUpChannelWindowInfo;
  eligible: boolean;
  eligibilityReason: string;
  enrollment: FollowUpEnrollmentInfo | null;
}

export interface FollowUpLeadsSummary {
  total: number;
  waReady: number;
  meta24h: number;
  meta7d: number;
  metaExpired: number;
  enrolled: number;
  draftReady: number;
  scheduled: number;
  waitingReply: number;
  replied: number;
  completed: number;
  paused: number;
  sentToday: number;
  dailyCap: number;
  withinBusinessHours: boolean;
}

export interface FollowUpLeadsResponse {
  items: FollowUpLeadRow[];
  pagination: {
    page: number;
    limit: number;
    totalFiltered: number;
    totalPages: number;
  };
  summary: FollowUpLeadsSummary;
}

export type FollowUpPillTone = "green" | "amber" | "red" | "blue" | "slate";

export type LeadAgentScope = "admissions" | "followup" | "both";

export interface SingleLeadFollowUpState {
  senderId: string;
  channel: string;
  pipeline: string;
  adhamActive: boolean;
  window: FollowUpChannelWindowInfo;
  eligible: boolean;
  eligibilityReason: string;
  eligibilityMessage: string;
  enrollment: FollowUpEnrollmentInfo | null;
  settingsSummary: {
    enabled: boolean;
    sendMode: FollowUpSendMode;
    maxAttempts: number;
    isActivated: boolean;
  };
}

/** Resolves which AI agent controls should appear in the chat right sidebar for a given route. */
export function resolveLeadAgentScopeForPath(pathname?: string | null): LeadAgentScope {
  const clean = String(pathname || "").trim().toLowerCase();
  if (clean === "/agent/follow-up" || clean.startsWith("/agent/follow-up/")) {
    return "followup";
  }
  if (clean === "/agent" || clean.startsWith("/agent/") || clean === "/claude-leads") {
    return "admissions";
  }
  return "both";
}

/** Normalizes the `?section=` query param for `/agent/follow-up`. */
export function resolveFollowUpSection(raw?: string | null): FollowUpSection {
  const clean = String(raw || "").trim().toLowerCase();
  if (clean === "instructions" || clean === "playbook" || clean === "role") return "instructions";
  if (clean === "skills") return "skills";
  if (clean === "schedule" || clean === "rules" || clean === "cadence") return "schedule";
  return "followups";
}

/** Converts internal eligibility or pause reason codes into plain, non-technical CRM copy. */
export function formatFollowUpReason(reason?: string | null): string {
  const clean = String(reason || "").trim();
  if (!clean) return "";
  if (clean === "admissions_adham_active") return "Another assistant is already active on this chat.";
  if (clean === "existing_student") return "Marked as an existing student.";
  if (clean === "wrong_stage" || clean.startsWith("stage_changed:")) {
    return "Lead moved out of the Contacted stage.";
  }
  if (clean === "window_meta_expired" || clean === "meta_expired") {
    return "Messaging window closed on Messenger or Instagram.";
  }
  if (clean === "window_meta_no_incoming" || clean === "meta_no_incoming") {
    return "Waiting for the lead to send a message on Messenger or Instagram first.";
  }
  if (clean === "window_meta_7d" || clean === "meta_7d_approval_disabled") {
    return "Needs manual review before sending on Messenger or Instagram.";
  }
  if (clean === "channel_disabled") return "This channel is turned off in Schedule.";
  if (clean === "max_attempts_reached") return "All scheduled follow-ups have already been sent.";
  if (clean === "silence_not_elapsed") return "Waiting for the scheduled follow-up delay.";
  if (clean === "staff_replied") return "Paused after a team member replied.";
  if (clean === "manual_pause") return "Paused by staff.";
  if (clean === "manual_stop") return "Stopped by staff.";
  if (clean === "draft_discarded") return "Draft skipped.";
  if (clean === "agent_no_reply") return "Adham chose not to message this lead based on the chat.";
  if (clean === "archived" || clean === "lead_archived") return "Chat is archived.";
  if (clean === "marked_done" || clean === "lead_done") return "Chat is marked done.";
  if (clean.startsWith("escalated:")) return "Handed over to staff for attention.";
  return clean;
}

/** Maps a lead's messaging window tier to a calm, plain-English pill label and tone. */
export function getChannelWindowMeta(windowInfo?: FollowUpChannelWindowInfo | null): {
  label: string;
  tone: FollowUpPillTone;
  detail: string;
} {
  if (!windowInfo) {
    return { label: "Unavailable", tone: "slate", detail: "Channel status unavailable." };
  }
  switch (windowInfo.tier) {
    case "wa_open":
      return {
        label: "Ready",
        tone: "green",
        detail: "Ready to message on WhatsApp.",
      };
    case "meta_24h":
      return {
        label: "Ready",
        tone: "green",
        detail: "Open messaging window.",
      };
    case "meta_7d":
      return {
        label: "Review to send",
        tone: "amber",
        detail: "Past 24 hours — review and send manually.",
      };
    case "meta_expired":
      return {
        label: windowInfo.hasPhone ? "Call or WhatsApp only" : "Unavailable",
        tone: "slate",
        detail: windowInfo.hasPhone
          ? "Social chat window closed, but a phone number is saved."
          : "Social chat window closed after 7 days.",
      };
    case "meta_no_incoming":
      return {
        label: "Unavailable",
        tone: "slate",
        detail: "No incoming social message yet.",
      };
    default:
      return {
        label: "Unavailable",
        tone: "slate",
        detail: "Channel is not supported for follow-ups.",
      };
  }
}

/** Maps a FollowUpEnrollment status to a calm, plain-English CRM status pill. */
export function getEnrollmentStatusMeta(enrollment?: FollowUpEnrollmentInfo | null): {
  label: string;
  tone: FollowUpPillTone;
} {
  if (!enrollment) {
    return { label: "Not assigned", tone: "slate" };
  }
  switch (enrollment.status) {
    case "draft_ready":
      return { label: "Draft ready", tone: "blue" };
    case "scheduled":
      return { label: "Assigned", tone: "blue" };
    case "sending":
      return { label: "Sending", tone: "blue" };
    case "waiting_reply":
      return { label: "Waiting reply", tone: "amber" };
    case "replied":
      return { label: "Replied", tone: "green" };
    case "completed":
      return { label: "Completed", tone: "green" };
    case "paused":
      return { label: "Paused", tone: "amber" };
    case "stopped":
      return { label: "Stopped", tone: "slate" };
    case "failed":
      return { label: "Needs attention", tone: "red" };
    default:
      return { label: enrollment.status, tone: "slate" };
  }
}

export type FollowUpCadencePresetId = "gentle" | "standard" | "light";

export interface FollowUpCadencePreset {
  id: FollowUpCadencePresetId;
  label: string;
  description: string;
  initialDelayHours: number;
  cadenceDays: number[];
  maxAttempts: number;
}

export const FOLLOWUP_CADENCE_PRESETS: ReadonlyArray<FollowUpCadencePreset> = [
  {
    id: "gentle",
    label: "Gentle (Recommended)",
    description: "After 24 hours, then 3 days, then 7 days (3 messages max)",
    initialDelayHours: 24,
    cadenceDays: [1, 3, 7],
    maxAttempts: 3,
  },
  {
    id: "standard",
    label: "Standard",
    description: "After 24 hours, then 2 days, then 5 days (3 messages max)",
    initialDelayHours: 24,
    cadenceDays: [1, 2, 5],
    maxAttempts: 3,
  },
  {
    id: "light",
    label: "Light",
    description: "After 24 hours, then 4 days (2 messages max)",
    initialDelayHours: 24,
    cadenceDays: [1, 4],
    maxAttempts: 2,
  },
];

/** Matches current settings to the closest plain-language cadence preset. */
export function resolveCadencePresetId(
  settings?: Partial<Pick<FollowUpAgentSettingsData, "cadenceDays" | "maxAttempts">> | null
): FollowUpCadencePresetId {
  const maxAttempts = Number(settings?.maxAttempts || 3);
  const days = Array.isArray(settings?.cadenceDays) ? settings.cadenceDays : [1, 3, 7];
  if (maxAttempts <= 2 || (days.length === 2 && days[1] === 4)) return "light";
  if (days[1] === 2) return "standard";
  return "gentle";
}

export const FOLLOWUP_DAILY_LIMIT_OPTIONS: ReadonlyArray<{
  value: number;
  label: string;
  note: string;
}> = [
  { value: 15, label: "15 / day", note: "Conservative" },
  { value: 25, label: "25 / day", note: "Recommended" },
  { value: 40, label: "40 / day", note: "Active" },
];

export const WORKING_HOUR_START_OPTIONS: ReadonlyArray<number> = [7, 8, 9, 10, 11, 12, 13, 14];
export const WORKING_HOUR_END_OPTIONS: ReadonlyArray<number> = [16, 17, 18, 19, 20, 21, 22, 23];

/** Formats an integer 24-hour clock value into a clean 12-hour Riyadh label. */
export function formatRiyadhHourLabel(hour: number): string {
  const normalized = ((Math.round(Number(hour)) % 24) + 24) % 24;
  if (normalized === 0) return "12:00 AM";
  if (normalized === 12) return "12:00 PM";
  return normalized > 12 ? `${normalized - 12}:00 PM` : `${normalized}:00 AM`;
}

/** Parses comma-separated cadence day offsets (e.g. "1, 3, 7") into clamped positive integers. */
export function parseCadenceDaysInput(raw: string): number[] {
  const parsed = String(raw || "")
    .split(/[,\s]+/)
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 60)
    .map((n) => Math.round(n))
    .slice(0, 6);
  return parsed.length > 0 ? parsed : [1, 3, 7];
}

/** Formats cadence day offsets for editing. */
export function formatCadenceDaysInput(days?: ReadonlyArray<number>): string {
  return Array.isArray(days) && days.length > 0 ? days.join(", ") : "1, 3, 7";
}

/** Formats a channel code into a plain display name. */
export function formatChannelName(channel?: string): string {
  const ch = String(channel || "").toUpperCase().trim();
  if (ch === "FB") return "Messenger";
  if (ch === "IG") return "Instagram";
  return "WhatsApp";
}

export const FOLLOWUP_SKILL_TEMPLATES: ReadonlyArray<{
  title: string;
  whenToUse: string;
  instructions: string;
  examples: string;
}> = [
  {
    title: "Silent After Price Quote",
    whenToUse:
      "When the last outgoing message shared program pricing and the lead stopped replying.",
    instructions:
      "1. Do not repeat the price table or justify the price defensively.\n2. Ask one gentle question about whether they had a chance to consider a Free Discovery Session at the branch.\n3. Mention Tamara split payments only if they previously expressed budget hesitation.",
    examples:
      "Adham: أهلًا أستاذة سارة 🌷 حبيت أطمن إذا قدرتي تراجعي تفاصيل برنامج البيانو، هل تحبي نرتب لك جلسة تعريفية مجانية في فرع الرياض بارك مول تشوفوا الأجواء عن قرب؟",
  },
  {
    title: "Silent After Slot Offer",
    whenToUse:
      "When open Discovery Session slots were offered earlier and the lead did not pick a time.",
    instructions:
      "1. Call get_audition_availability to fetch current open slots (never reuse stale dates).\n2. Offer two fresh times (one weekday afternoon, one weekend) in one short message.\n3. Keep the tone relaxed with zero urgency.",
    examples:
      "Adham: أهلًا بك 😊 لو المواعيد السابقة ما ناسبت جدولكم، متاح عندنا هذا الأسبوع جلسة تعريفية مجانية يوم الخميس 5:30 م أو السبت 11:00 ص، أي وقت أريح لكم؟",
  },
  {
    title: "Outbound Form Lead First Check-in",
    whenToUse:
      "When a Contacted WhatsApp lead submitted an ad form and never replied to the first message.",
    instructions:
      "1. Greet warmly by name as Adham from Tchaikovsky School.\n2. Reference the instrument or branch from their form if present.\n3. Ask one simple qualifying question (child or adult, and preferred city).",
    examples:
      "Adham: أهلًا محمد 🌷 معك أدهم من مدرسة تشايكوفسكي للموسيقى. شفنا اهتمامك بالبيانو وحاب أتأكد إذا الاستفسار لحضرتك أو لطفل، وفي أي مدينة تفضّل؟",
  },
  {
    title: "Final Polite Check-in (Touch 3)",
    whenToUse:
      "When reaching the final follow-up touch after earlier messages had no response.",
    instructions:
      "1. Keep it to 1-2 short, warm lines.\n2. Let the lead know there is no pressure and they can reply whenever the timing suits them.\n3. Do not dump branch info or prices.",
    examples:
      "Adham: أهلًا بك 🌷 ما حبيت أزعجك بالرسائل، بس حبيت أذكرك إن باب الجلسة التعريفية المجانية مفتوح لكم بأي وقت يناسب جدولكم 🎹",
  },
];
