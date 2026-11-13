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

