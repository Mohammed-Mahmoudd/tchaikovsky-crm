export type ComposerAgentId = "admissions" | "followup";

export interface ComposerAgentSettingsSummary {
  admissionSendMode: "draft" | "auto";
  admissionGlobalEnabled: boolean;
  admissionActivated: boolean;
  followUpSendMode: "approval" | "auto";
  followUpGlobalEnabled: boolean;
  followUpActivated: boolean;
  loadedAt: number;
}

export interface ComposerAgentVisualState {
  admissionActive: boolean;
  admissionGenerating: boolean;
  followUpActive: boolean;
  followUpGenerating: boolean;
  anyActive: boolean;
  anyGenerating: boolean;
}

const SETTINGS_CACHE_TTL_MS = 30_000;
const ACTIVE_FOLLOWUP_STATUSES = new Set([
  "scheduled",
  "sending",
  "waiting_reply",
  "replied",
]);

let cachedSettingsSummary: ComposerAgentSettingsSummary | null = null;

/** Replaces multi-bubble [[SPLIT]] markers with paragraph breaks inside composer drafts. */
export function stripSplitMarkerForComposer(text: string): string {
  return String(text || "")
    .replace(/\s*\[\[SPLIT\]\]\s*/gi, "\n\n")
    .trim();
}

/** Returns true when a Follow-up enrollment stays actively tracked across messages. */
export function isFollowUpEnrollmentActive(status?: string | null): boolean {
  return Boolean(status && ACTIVE_FOLLOWUP_STATUSES.has(status));
}

/**
 * Computes the active/generating state of each agent icon in the chat composer.
 * Draft mode highlights only while generating and clears as soon as the draft lands.
 * Auto mode remains active while turned on for the conversation, including after sending.
 */
export function resolveComposerAgentVisualState(params: {
  admissionSendMode: "draft" | "auto";
  followUpSendMode: "approval" | "auto";
  claudeEnabled?: boolean;
  claudePaused?: boolean;
  followUpEnrollmentStatus?: string | null;
  generatingAgent?: ComposerAgentId | null;
}): ComposerAgentVisualState {
  const admissionGenerating = params.generatingAgent === "admissions";
  const followUpGenerating = params.generatingAgent === "followup";

  const admissionActive =
    admissionGenerating ||
    (params.admissionSendMode === "auto" &&
      Boolean(params.claudeEnabled) &&
      !Boolean(params.claudePaused));

  const followUpActive =
    followUpGenerating ||
    (params.followUpSendMode === "auto" &&
      isFollowUpEnrollmentActive(params.followUpEnrollmentStatus));

  return {
    admissionActive,
    admissionGenerating,
    followUpActive,
    followUpGenerating,
    anyActive: admissionActive || followUpActive,
    anyGenerating: admissionGenerating || followUpGenerating,
  };
}

/** Reads the short-lived client cache of Admission & Follow-up settings for composer icons. */
export function readComposerAgentSettingsCache(
  nowMs: number = Date.now()
): ComposerAgentSettingsSummary | null {
  if (!cachedSettingsSummary) return null;
  if (nowMs - cachedSettingsSummary.loadedAt > SETTINGS_CACHE_TTL_MS) {
    return null;
  }
  return cachedSettingsSummary;
}

/** Writes the short-lived client cache of Admission & Follow-up settings. */
export function writeComposerAgentSettingsCache(
  summary: Omit<ComposerAgentSettingsSummary, "loadedAt">,
  nowMs: number = Date.now()
): ComposerAgentSettingsSummary {
  cachedSettingsSummary = {
    ...summary,
    loadedAt: nowMs,
  };
  return cachedSettingsSummary;
}

/** Clears the cached composer agent settings (e.g. after SSE settings updates). */
export function invalidateComposerAgentSettingsCache(): void {
  cachedSettingsSummary = null;
}

export interface ChatTimelineDraft {
  chatId: string;
  agent: ComposerAgentId;
  text: string;
}

/**
 * Resolves the active draft bubble to display at the bottom of a chat timeline.
 * Prefers the latest session-generated draft on the active chat, falling back to
 * a server-persisted Admission draft unless explicitly dismissed on that chat.
 */
export function resolveChatDraftState(params: {
  chatId: string;
  localDraft: ChatTimelineDraft | null;
  serverDraftText?: string | null;
  dismissedServerDraft?: { chatId: string; text: string } | null;
}): ChatTimelineDraft | null {
  const cleanChatId = String(params.chatId || "").trim();
  if (!cleanChatId) return null;

  if (
    params.localDraft &&
    params.localDraft.chatId === cleanChatId &&
    params.localDraft.text.trim()
  ) {
    return {
      chatId: cleanChatId,
      agent: params.localDraft.agent,
      text: params.localDraft.text,
    };
  }

  const cleanServer = stripSplitMarkerForComposer(params.serverDraftText || "");
  if (!cleanServer) return null;

  if (
    params.dismissedServerDraft &&
    params.dismissedServerDraft.chatId === cleanChatId &&
    stripSplitMarkerForComposer(params.dismissedServerDraft.text) === cleanServer
  ) {
    return null;
  }

  return {
    chatId: cleanChatId,
    agent: "admissions",
    text: cleanServer,
  };
}


