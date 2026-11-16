export interface MessageLike {
  text?: string;
  senderName?: string;
  isIncoming: boolean;
  attachments?: ReadonlyArray<unknown>;
}

export interface ConversationMessageState {
  messages?: ReadonlyArray<MessageLike>;
  lastMessageDirection?: "incoming" | "outgoing";
  unreadCount?: number;
}

interface TemplateAttachmentShape {
  type?: unknown;
  payload?: {
    generic?: { elements?: ReadonlyArray<{ title?: unknown }> };
    button?: { elements?: ReadonlyArray<{ title?: unknown }> };
    elements?: ReadonlyArray<{ title?: unknown }>;
  };
  elements?: ReadonlyArray<{ title?: unknown }>;
}

const AUTOMATED_TEMPLATE_TEXT_PATTERNS = [
  /^Thanks,\s*you['’]re all set/i,
  /Thank you for connecting with us/i,
  /شكرًا، لقد أكملت/i,
];

/**
 * Returns true if the message is an automated Meta form-confirmation echo
 * rather than a human staff reply or customer message.
 */
export function isAutomatedTemplateMsg(m: MessageLike): boolean {
  if (m.senderName && m.senderName !== "Staff") return false;
  const t = (m.text || "").trim();
  if (
    t === "Template" ||
    t === "[Form / Template]" ||
    t === "Form / Template" ||
    AUTOMATED_TEMPLATE_TEXT_PATTERNS.some((pattern) => pattern.test(t))
  ) {
    return true;
  }

  if (Array.isArray(m.attachments) && m.attachments.length > 0) {
    const first = m.attachments[0];
    if (first && typeof first === "object") {
      const att = first as TemplateAttachmentShape;
      if (att.type === "template") {
        const elements =
          att.payload?.generic?.elements ||
          att.payload?.button?.elements ||
          att.payload?.elements ||
          att.elements ||
          [];
        if (elements.length === 0) return true;
        const firstTitle = typeof elements[0]?.title === "string" ? elements[0].title : "";
        if (/Thanks,\s*you['’]re all set|Thank you for connecting with us/i.test(firstTitle)) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Counts consecutive incoming messages after the last human staff reply,
 * ignoring automated Meta form-confirmation templates.
 */
export function computeUnreadFromMessages(messages?: ReadonlyArray<MessageLike>): number {
  if (!Array.isArray(messages) || messages.length === 0) return 0;
  let count = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;
    if (isAutomatedTemplateMsg(m)) continue;
    if (!m.isIncoming) {
      break;
    }
    count++;
  }
  return count;
}

/**
 * Returns the direction of the most recent non-automated message, if available.
 */
export function getLastRealMessageDirection(
  messages?: ReadonlyArray<MessageLike>
): "incoming" | "outgoing" | undefined {
  if (!Array.isArray(messages) || messages.length === 0) return undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;
    if (isAutomatedTemplateMsg(m)) continue;
    return m.isIncoming ? "incoming" : "outgoing";
  }
  return undefined;
}

/**
 * Determines whether the latest real message in a conversation was sent by the lead.
 * Uses loaded messages when present, and falls back to server slim metadata otherwise.
 */
export function isLastMessageFromLead(conv?: ConversationMessageState | null): boolean {
  if (!conv) return false;
  if (Array.isArray(conv.messages) && conv.messages.length > 0) {
    return getLastRealMessageDirection(conv.messages) === "incoming";
  }
  if (conv.lastMessageDirection === "incoming") return true;
  if (conv.lastMessageDirection === "outgoing") return false;
  return Number(conv.unreadCount) > 0;
}

const PLACEHOLDER_SENDER_NAMES = new Set(["Staff", "System", "Unassigned"]);

const MESSAGE_STATUS_RANK: Record<string, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

export interface ConfirmedReplyMessageInput {
  message_id?: string;
  messageId?: string;
  text?: string;
  attachments?: unknown[];
  timestamp?: number;
  senderName?: string;
  replyTo?: {
    id?: string;
    messageId?: string;
    text?: string;
    senderName?: string;
    isIncoming?: boolean;
  };
  [key: string]: unknown;
}

export interface ReplySendResponseShape {
  senderName?: string;
  messages?: ConfirmedReplyMessageInput[];
  data?: ConfirmedReplyMessageInput;
}

export interface MergeableChatMessage {
  id: string;
  text: string;
  attachments?: unknown[];
  time: string;
  timestamp?: number;
  isIncoming: boolean;
  status?: "pending" | "sent" | "delivered" | "read";
  seenAt?: number;
  deliveredAt?: number;
  isRead?: boolean;
  senderName?: string;
  isEdited?: boolean;
  editedAt?: number;
  isDeleted?: boolean;
  deletedAt?: number;
  deletedBy?: string;
  reactions?: unknown[];
  replyTo?: {
    id: string;
    text: string;
    senderName?: string;
    isIncoming?: boolean;
  };
}

function cleanTrimmedName(name: unknown): string {
  return typeof name === "string" ? name.trim() : "";
}

/**
 * Returns true if `name` represents an actual staff member rather than
 * a missing or generic placeholder label (`"Staff"`, `"System"`, `"Unassigned"`).
 */
export function isRealSenderName(name: unknown): boolean {
  const clean = cleanTrimmedName(name);
  return Boolean(clean) && !PLACEHOLDER_SENDER_NAMES.has(clean);
}

/**
 * Picks the strongest available senderName so a real agent name is never downgraded
 * to `"Staff"` or cleared by a concurrent echo or confirmation payload.
 */
export function resolvePreferredSenderName(
  incomingName?: string | null,
  existingName?: string | null
): string | undefined {
  const cleanIncoming = cleanTrimmedName(incomingName);
  const cleanExisting = cleanTrimmedName(existingName);
  if (cleanIncoming && !PLACEHOLDER_SENDER_NAMES.has(cleanIncoming)) return cleanIncoming;
  if (cleanExisting && !PLACEHOLDER_SENDER_NAMES.has(cleanExisting)) return cleanExisting;
  return cleanIncoming || cleanExisting || undefined;
}

/**
 * Normalizes the `/api/messages/:senderId/reply` response into confirmed message items,
 * ensuring every item retains the sending agent's `senderName` across text and attachment replies.
 */
export function buildConfirmedReplyMessages(
  json: ReplySendResponseShape | null | undefined,
  textToSend: string,
  fallbackUserName?: string | null,
  fallbackReplyTo?: ConfirmedReplyMessageInput["replyTo"]
): ConfirmedReplyMessageInput[] | undefined {
  const topSender = resolvePreferredSenderName(json?.senderName, fallbackUserName);

  if (Array.isArray(json?.messages) && json.messages.length > 0) {
    return json.messages.map((item) => ({
      ...item,
      senderName: resolvePreferredSenderName(item.senderName, topSender),
    }));
  }

  if (json?.data) {
    const trimmed = textToSend.trim();
    return [
      {
        ...json.data,
        text: trimmed || json.data.text || "",
        senderName: resolvePreferredSenderName(json.data.senderName, topSender),
        replyTo: fallbackReplyTo || json.data.replyTo,
      },
    ];
  }

  return undefined;
}

/**
 * Merges an SSE `message` update onto an already-cached message without downgrading
 * a real agent `senderName` to `"Staff"`, losing delivery/read ticks, or clearing reactions.
 */
export function mergeExistingMessageFromSse<T extends MergeableChatMessage>(
  existing: T,
  incoming: T
): T {
  const existingRank = existing.status ? (MESSAGE_STATUS_RANK[existing.status] ?? 1) : 0;
  const incomingRank = incoming.status ? (MESSAGE_STATUS_RANK[incoming.status] ?? 1) : 0;
  const bestStatus = existingRank > incomingRank ? existing.status : incoming.status || existing.status;

  const mergedReactions =
    Array.isArray(incoming.reactions) && incoming.reactions.length > 0
      ? incoming.reactions
      : existing.reactions;

  return {
    ...existing,
    ...incoming,
    attachments:
      Array.isArray(incoming.attachments) && incoming.attachments.length > 0
        ? incoming.attachments
        : existing.attachments,
    senderName: resolvePreferredSenderName(incoming.senderName, existing.senderName),
    status: bestStatus,
    seenAt: incoming.seenAt ?? existing.seenAt,
    deliveredAt: incoming.deliveredAt ?? existing.deliveredAt,
    isRead: Boolean(existing.isRead || incoming.isRead || bestStatus === "read"),
    isEdited: Boolean(existing.isEdited || incoming.isEdited),
    editedAt: incoming.editedAt ?? existing.editedAt,
    isDeleted: Boolean(existing.isDeleted || incoming.isDeleted),
    deletedAt: incoming.deletedAt ?? existing.deletedAt,
    deletedBy: incoming.deletedBy ?? existing.deletedBy,
    reactions: mergedReactions,
    replyTo: incoming.replyTo || existing.replyTo,
  };
}

