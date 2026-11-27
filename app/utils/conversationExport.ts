import {
  createZipArchive,
  deduplicateArchiveFilenames,
  triggerBinaryFileDownload,
} from "./zipArchive.mjs";
import type { CashEntry } from "./leadCash";
import {
  computeActiveCashTotal,
  resolveConversationCashPayments,
} from "./leadCashHelpers.mjs";

export interface ExportAttachmentLike {
  type?: string;
  url?: string;
  previewUrl?: string;
  fileName?: string;
  title?: string;
  description?: string;
  fileSize?: number;
  mimeType?: string;
  payload?: {
    url?: string;
    title?: string;
    text?: string;
    subtitle?: string;
    template_type?: string;
    image_url?: string;
    generic?: {
      text?: string;
      elements?: ReadonlyArray<ExportTemplateElementRaw>;
    };
    button?: {
      elements?: ReadonlyArray<ExportTemplateElementRaw>;
    };
    elements?: ReadonlyArray<ExportTemplateElementRaw>;
  };
  elements?: ReadonlyArray<ExportTemplateElementRaw>;
}

interface ExportTemplateElementRaw {
  title?: string;
  subtitle?: string;
  url?: string;
  default_action?: { url?: string };
}

export interface ExportReactionLike {
  emoji?: string;
  sender?: string;
  fromMe?: boolean;
}

export interface ExportReplyToLike {
  id?: string;
  messageId?: string;
  text?: string;
  senderName?: string;
  isIncoming?: boolean;
}

export interface ExportMessageInput {
  id?: string;
  messageId?: string;
  text?: string;
  attachments?: ReadonlyArray<ExportAttachmentLike>;
  time?: string;
  timestamp?: number | string | Date;
  isIncoming?: boolean;
  direction?: "incoming" | "outgoing" | string;
  status?: string;
  senderName?: string;
  isEdited?: boolean;
  isDeleted?: boolean;
  deletedBy?: string;
  reactions?: ReadonlyArray<ExportReactionLike>;
  replyTo?: ExportReplyToLike;
}

export interface ExportSourceObject {
  campaign?: string;
  adset?: string;
  ad?: string;
  adId?: string;
  [key: string]: unknown;
}

export interface ExportConversationInput {
  id?: string;
  senderId?: string;
  name?: string;
  profileName?: string;
  leadName?: string;
  phone?: string;
  formPhone?: string;
  agent?: string;
  channel?: string;
  metaChannel?: string;
  inbox?: string;
  whatsappAccount?: string;
  isGroup?: boolean;
  status?: string;
  isDone?: boolean;
  doneBy?: string;
  isArchived?: boolean;
  archivedBy?: string;
  pipeline?: string;
  branch?: string;
  labels?: ReadonlyArray<string>;
  source?: ExportSourceObject | string;
  formAnswers?: {
    instrument?: string;
    studentAge?: string;
    [key: string]: unknown;
  };
  auditionDate?: string;
  auditionOutcome?: string;
  followUpDate?: string;
  followUpNote?: string;
  followUpCompleted?: boolean;
  followUpTags?: ReadonlyArray<string>;
  cashIn?: number;
  paidAt?: string | null;
  cashRecordedBy?: string;
  cashEntries?: ReadonlyArray<CashEntry>;
  notes?: string;
  savedForAgent?: boolean;
  savedForAgentAt?: string | null;
  savedForAgentBy?: string;
  messages?: ReadonlyArray<ExportMessageInput>;
}

export type BatchExportFormat = "txt" | "zip";

export interface ExportLabelLike {
  id: string;
  name: string;
}

export interface BuildTranscriptOptions {
  labels?: ReadonlyArray<ExportLabelLike>;
  inboxMode?: "admissions" | "operation";
  exportedAt?: number | Date;
  origin?: string;
}

const DATE_HEADER_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const EXPORTED_AT_FORMATTER = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const PLACEHOLDER_TEXT_SET = new Set([
  "📋 [form / template]",
  "[form / template]",
  "form / template",
  "template",
  "📋",
  "shared post/reel",
  "[shared post/reel]",
  "🔗 [shared post/reel]",
  "photo",
  "[photo]",
  "📷 [photo]",
  "voice message",
  "[voice message]",
  "🎤 [voice message]",
  "video",
  "[video]",
  "🎥 [video]",
  "file",
  "[file]",
  "📎 [file]",
  "attachment",
  "[attachment]",
]);

function normalizeTimestampMs(timestamp?: number | string | Date | null): number | null {
  if (timestamp === null || timestamp === undefined || timestamp === "") return null;
  let time = 0;
  if (typeof timestamp === "number") {
    time = timestamp;
  } else if (typeof timestamp === "string") {
    const trimmed = timestamp.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    time = Number.isFinite(numeric) ? numeric : new Date(trimmed).getTime();
  } else if (timestamp instanceof Date) {
    time = timestamp.getTime();
  } else {
    return null;
  }
  if (!Number.isFinite(time) || time <= 0) return null;
  if (time < 10_000_000_000) time *= 1000;
  return time;
}

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isRealPhone(phone?: string | null): boolean {
  if (!phone) return false;
  const lower = phone.trim().toLowerCase();
  if (!lower || lower.startsWith("live ") || lower === "live") return false;
  return phone.replace(/[^\d]/g, "").length >= 7;
}

function isGroupConv(conv: ExportConversationInput): boolean {
  if (conv.isGroup) return true;
  const rawId = String(conv.id || conv.senderId || "").trim().toLowerCase();
  return rawId.startsWith("op_grp_") || rawId.startsWith("grp_") || rawId.endsWith("@g.us");
}

function resolveInboxLabel(
  conv: ExportConversationInput,
  explicitMode?: "admissions" | "operation"
): string {
  if (explicitMode === "operation") return "Operation";
  if (explicitMode === "admissions") return "Admissions";
  if (isGroupConv(conv)) return "Operation";
  const raw = String(conv.inbox || conv.whatsappAccount || "").trim().toLowerCase();
  if (raw === "operation") return "Operation";
  const id = String(conv.id || conv.senderId || "").trim();
  return id.startsWith("op_") ? "Operation" : "Admissions";
}

function formatChannelLabel(conv: ExportConversationInput): string {
  const ch = String(conv.channel || "").toUpperCase();
  if (ch === "WA") {
    if (isGroupConv(conv)) return "WhatsApp Group";
    if (conv.metaChannel === "FB") return "WhatsApp · Facebook Form";
    if (conv.metaChannel === "IG") return "WhatsApp · Instagram Form";
    return "WhatsApp";
  }
  if (ch === "IG") return "Instagram";
  if (ch === "FB") return "Messenger";
  return conv.channel || "Direct";
}

function formatFileSize(bytes?: number): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function resolveAttachmentUrl(rawUrl: unknown, origin?: string): string {
  if (typeof rawUrl !== "string") return "";
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.startsWith("blob:")) return "";
  if (trimmed.startsWith("/") && origin) {
    return `${origin.replace(/\/+$/, "")}${trimmed}`;
  }
  return trimmed;
}

function isPlaceholderMessageText(text?: string): boolean {
  if (!text) return true;
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith("📋 [")) return true;
  const lower = trimmed.toLowerCase();
  return PLACEHOLDER_TEXT_SET.has(lower) || lower.includes("shared post/reel");
}

function isTemplateLikeAttachment(att: ExportAttachmentLike | undefined): boolean {
  if (!att) return false;
  return Boolean(
    att.type === "template" ||
      att.type === "fallback" ||
      att.payload?.template_type ||
      att.payload?.generic ||
      att.payload?.button ||
      att.payload?.elements ||
      att.elements
  );
}

function formatTemplateAttachment(att: ExportAttachmentLike): string {
  const payload = att.payload;
  const elements =
    (Array.isArray(payload?.generic?.elements) && payload.generic.elements) ||
    (Array.isArray(payload?.button?.elements) && payload.button.elements) ||
    (Array.isArray(payload?.elements) && payload.elements) ||
    (Array.isArray(att.elements) && att.elements) ||
    [];

  if (elements.length > 0) {
    const parts = elements
      .map((el) => {
        const title = String(el?.title || "").trim();
        const subtitle = String(el?.subtitle || "").trim().replace(/\s+/g, " ");
        const link = String(el?.default_action?.url || el?.url || "").trim();
        const text = [title, subtitle].filter(Boolean).join(" — ");
        if (!text && !link) return "";
        return link ? `${text || "Link"} (${link})` : text;
      })
      .filter(Boolean);
    if (parts.length > 0) {
      return `[Template: ${parts.join(" | ")}]`;
    }
  }

  const text = String(payload?.text || payload?.generic?.text || att.title || "").trim();
  const subtitle = String(payload?.subtitle || att.description || "").trim();
  const combined = [text, subtitle].filter(Boolean).join(" — ");
  return combined ? `[Template: ${combined}]` : "[Form / Template]";
}

function formatAttachmentSummary(att: ExportAttachmentLike, origin?: string): string {
  if (isTemplateLikeAttachment(att)) {
    return formatTemplateAttachment(att);
  }
  const url = resolveAttachmentUrl(att.url || att.payload?.url || att.previewUrl, origin);
  const fileName = String(att.fileName || att.payload?.title || att.title || "").trim();
  const sizeStr = formatFileSize(att.fileSize);
  const type = String(att.type || "attachment").toLowerCase();

  if (type === "image") {
    const label = fileName ? `Photo: ${fileName}` : "Photo";
    return url ? `[${label}] (${url})` : `[${label}]`;
  }
  if (type === "video") {
    const label = fileName ? `Video: ${fileName}` : "Video";
    return url ? `[${label}] (${url})` : `[${label}]`;
  }
  if (type === "audio") {
    const label = fileName ? `Voice message: ${fileName}` : "Voice message";
    return url ? `[${label}] (${url})` : `[${label}]`;
  }
  if (type === "file" || type === "document") {
    const details = [fileName || "Document", sizeStr].filter(Boolean).join(", ");
    return url ? `[File: ${details}] (${url})` : `[File: ${details}]`;
  }
  if (type === "ig_post" || type === "ig_reel" || type === "share") {
    const label = fileName ? `Shared post/reel: ${fileName}` : "Shared post/reel";
    return url ? `[${label}] (${url})` : `[${label}]`;
  }
  const genericLabel = fileName || type;
  return url ? `[Attachment: ${genericLabel}] (${url})` : `[Attachment: ${genericLabel}]`;
}

function formatSourceLine(source?: ExportSourceObject | string): string {
  if (!source) return "";
  if (typeof source === "string") {
    const trimmed = source.trim();
    if (!trimmed || trimmed.toLowerCase() === "direct") return "";
    return trimmed;
  }
  const campaign = typeof source.campaign === "string" ? source.campaign.trim() : "";
  const adset = typeof source.adset === "string" ? source.adset.trim() : "";
  const ad = typeof source.ad === "string" ? source.ad.trim() : "";
  const parts = [campaign, adset, ad].filter(
    (part) => part && part.toLowerCase() !== "direct"
  );
  return parts.join(" · ");
}

function resolveIncomingFlag(msg: ExportMessageInput): boolean {
  if (typeof msg.isIncoming === "boolean") return msg.isIncoming;
  if (typeof msg.direction === "string") {
    return msg.direction.toLowerCase() === "incoming";
  }
  return true;
}

function resolveContactDisplayName(conv: ExportConversationInput): string {
  const baseName = String(conv.name || "").trim();
  const leadName = String(conv.leadName || "").trim();
  const profileName = String(conv.profileName || "").trim();
  const primary = baseName || leadName || profileName || String(conv.phone || conv.id || conv.senderId || "Contact");
  if (leadName && leadName !== primary) {
    return `${primary} (${leadName})`;
  }
  return primary;
}

/**
 * Sanitizes a conversation identifier or name into a filesystem-safe filename segment.
 */
export function sanitizeExportFilenamePart(raw: string): string {
  const cleaned = String(raw || "")
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.\-_]+|[.\-_]+$/g, "")
    .slice(0, 60);
  return cleaned || "conversation";
}

/**
 * Builds a deterministic `.txt` download filename for a conversation transcript.
 */
export function buildConversationExportFilename(
  conv: ExportConversationInput,
  exportedAt: number | Date = new Date()
): string {
  const rawLabel =
    String(conv.leadName || "").trim() ||
    String(conv.name || "").trim() ||
    String(conv.phone || "").trim() ||
    String(conv.id || conv.senderId || "").trim() ||
    "conversation";
  const slug = sanitizeExportFilenamePart(rawLabel);
  const dateObj = exportedAt instanceof Date ? exportedAt : new Date(exportedAt);
  const validDate = Number.isNaN(dateObj.getTime()) ? new Date() : dateObj;
  return `conversation-${slug}-${toLocalDateKey(validDate)}.txt`;
}

/**
 * Formats a conversation's lead metadata and full message history into a clean,
 * UTF-8 readable plain-text transcript.
 */
export function formatConversationTranscript(
  conv: ExportConversationInput,
  options: BuildTranscriptOptions = {}
): string {
  const exportedDate =
    options.exportedAt instanceof Date
      ? options.exportedAt
      : options.exportedAt !== undefined
      ? new Date(options.exportedAt)
      : new Date();
  const validExportedDate = Number.isNaN(exportedDate.getTime()) ? new Date() : exportedDate;

  const isGroup = isGroupConv(conv);
  const inboxLabel = resolveInboxLabel(conv, options.inboxMode);
  const isOperation = inboxLabel === "Operation";
  const contactDisplay = resolveContactDisplayName(conv);
  const leadFallbackName =
    String(conv.leadName || conv.profileName || conv.name || "").trim() || "Lead";

  const bucketTags: string[] = [];
  if (conv.isArchived) {
    bucketTags.push(conv.archivedBy ? `Archived by ${conv.archivedBy}` : "Archived");
  } else if (conv.isDone) {
    bucketTags.push(conv.doneBy ? `DONE by ${conv.doneBy}` : "DONE");
  }
  const statusDisplay = [conv.status || "Open", ...bucketTags].join(" · ");

  const labelMap = new Map<string, string>(
    (options.labels || []).map((l) => [l.id, l.name])
  );
  const resolvedLabels = Array.isArray(conv.labels)
    ? conv.labels.map((id) => labelMap.get(id) || id).filter(Boolean)
    : [];

  const phoneValue = !isGroup
    ? isRealPhone(conv.phone)
      ? String(conv.phone).trim()
      : isRealPhone(conv.formPhone)
      ? `+${String(conv.formPhone).replace(/\D/g, "")}`
      : ""
    : "";

  const isWhatsAppConv = String(conv.channel || "").toUpperCase() === "WA";
  const rawMessages = Array.isArray(conv.messages)
    ? conv.messages.filter((m) => {
        if (!m) return false;
        if (!isWhatsAppConv || m.isDeleted) return true;
        const hasText = typeof m.text === "string" && m.text.trim().length > 0;
        const hasAttachments = Array.isArray(m.attachments) && m.attachments.length > 0;
        if (hasText || hasAttachments) return true;
        return Boolean(m.replyTo) || (Array.isArray(m.reactions) && m.reactions.length > 0);
      })
    : [];

  const headerLines: string[] = [
    "Tchaikovsky School — Conversation Transcript",
    "==========================================",
    `Contact: ${contactDisplay}`,
    `Channel: ${formatChannelLabel(conv)}`,
  ];

  if (phoneValue && phoneValue !== contactDisplay) {
    headerLines.push(`Phone: ${phoneValue}`);
  }
  const convId = String(conv.id || conv.senderId || "").trim();
  if (convId) {
    headerLines.push(`Conversation ID: ${convId}`);
  }
  headerLines.push(`Inbox: ${inboxLabel}`);
  headerLines.push(`Status: ${statusDisplay}`);
  headerLines.push(`Assigned to: ${String(conv.agent || "").trim() || "Unassigned"}`);

  if (!isOperation && conv.pipeline && conv.pipeline !== "direct") {
    headerLines.push(`Pipeline: ${conv.pipeline}`);
  }
  if (conv.branch) {
    headerLines.push(`Branch: ${conv.branch}`);
  }
  if (resolvedLabels.length > 0) {
    headerLines.push(`Labels: ${resolvedLabels.join(", ")}`);
  }

  if (!isOperation) {
    const sourceText = formatSourceLine(conv.source);
    if (sourceText) {
      headerLines.push(`Source: ${sourceText}`);
    }
    const formParts: string[] = [];
    if (conv.formAnswers?.instrument) {
      formParts.push(`Instrument: ${conv.formAnswers.instrument}`);
    }
    if (conv.formAnswers?.studentAge) {
      formParts.push(`Student Age: ${conv.formAnswers.studentAge}`);
    }
    if (formParts.length > 0) {
      headerLines.push(`Form Answers: ${formParts.join(" · ")}`);
    }
    if (conv.auditionDate || conv.auditionOutcome) {
      const auditionParts = [conv.auditionDate, conv.auditionOutcome].filter(Boolean);
      headerLines.push(`Audition: ${auditionParts.join(" · ")}`);
    }
    if (conv.followUpDate || conv.followUpNote || (conv.followUpTags && conv.followUpTags.length > 0)) {
      const followParts = [
        conv.followUpDate,
        conv.followUpNote,
        conv.followUpTags && conv.followUpTags.length > 0
          ? `[${conv.followUpTags.join(", ")}]`
          : "",
        conv.followUpCompleted ? "(Completed)" : "",
      ].filter(Boolean);
      headerLines.push(`Follow-up: ${followParts.join(" · ")}`);
    }
    const cashPayments = resolveConversationCashPayments(conv);
    const totalCash = cashPayments.length > 0 ? computeActiveCashTotal(conv) : Number(conv.cashIn) || 0;
    if (totalCash > 0) {
      headerLines.push(`Cash In: ${totalCash} SAR`);
      if (Array.isArray(conv.cashEntries) && conv.cashEntries.length > 0 && cashPayments.length > 0) {
        for (const payment of cashPayments) {
          const actorLabel = payment.actor ? `Added by ${payment.actor}` : "Legacy";
          const dateLabel =
            payment.timestamp > 0 ? DATE_HEADER_FORMATTER.format(new Date(payment.timestamp)) : "";
          const noteSuffix = payment.note ? ` · ${payment.note}` : "";
          headerLines.push(
            `  - ${payment.amount.toLocaleString("en-US")} SAR · ${actorLabel}${dateLabel ? ` · ${dateLabel}` : ""}${noteSuffix}`
          );
        }
      }
    }
  }

  if (conv.notes && conv.notes.trim()) {
    headerLines.push(`Notes: ${conv.notes.trim().replace(/\r?\n/g, " | ")}`);
  }

  headerLines.push(`Messages: ${rawMessages.length}`);
  headerLines.push(`Exported: ${EXPORTED_AT_FORMATTER.format(validExportedDate)}`);
  headerLines.push("==========================================");

  if (rawMessages.length === 0) {
    return `${headerLines.join("\n")}\n\n(No messages in this conversation.)\n`;
  }

  const bodyLines: string[] = [];
  let lastDateKey: string | null = null;

  for (let i = 0; i < rawMessages.length; i++) {
    const msg = rawMessages[i];
    const tsMs = normalizeTimestampMs(msg.timestamp);
    const dateObj = tsMs !== null ? new Date(tsMs) : null;

    if (dateObj) {
      const dateKey = toLocalDateKey(dateObj);
      if (dateKey !== lastDateKey) {
        lastDateKey = dateKey;
        bodyLines.push("");
        bodyLines.push(`--- ${DATE_HEADER_FORMATTER.format(dateObj)} ---`);
      }
    }

    const timeLabel = dateObj
      ? TIME_FORMATTER.format(dateObj)
      : (msg.time || "--:--").trim() || "--:--";

    const isIncoming = resolveIncomingFlag(msg);
    const senderLabel = isIncoming
      ? isGroup
        ? String(msg.senderName || "").trim() || "Group Member"
        : String(msg.senderName || "").trim() || leadFallbackName
      : String(msg.senderName || "").trim() || "Staff";

    if (msg.isDeleted) {
      const deletedBy = String(msg.deletedBy || "").trim();
      const deletedNotice = deletedBy
        ? `[Message deleted by ${deletedBy}]`
        : "[Message deleted]";
      bodyLines.push(`[${timeLabel}] ${senderLabel}: ${deletedNotice}`);
      continue;
    }

    const attachments: ReadonlyArray<ExportAttachmentLike> = Array.isArray(msg.attachments)
      ? msg.attachments
      : [];
    const attachmentLines = attachments.map((att) =>
      formatAttachmentSummary(att, options.origin)
    );

    const rawText = typeof msg.text === "string" ? msg.text.trim() : "";
    const hasNonTemplateAttachment = attachments.some((a) => !isTemplateLikeAttachment(a));
    const matchesAttFileName =
      hasNonTemplateAttachment &&
      attachments.some((a) => a.fileName && a.fileName.trim() === rawText);

    const showText =
      Boolean(rawText) &&
      !matchesAttFileName &&
      !(attachments.length > 0 && isPlaceholderMessageText(rawText));

    const editedSuffix = msg.isEdited ? " (edited)" : "";
    const pendingSuffix = msg.status === "pending" ? " (sending)" : "";

    if (showText) {
      bodyLines.push(`[${timeLabel}] ${senderLabel}${editedSuffix}${pendingSuffix}: ${rawText}`);
    } else if (attachmentLines.length > 0) {
      bodyLines.push(
        `[${timeLabel}] ${senderLabel}${editedSuffix}${pendingSuffix}: ${attachmentLines[0]}`
      );
      for (let j = 1; j < attachmentLines.length; j++) {
        bodyLines.push(`  ${attachmentLines[j]}`);
      }
    } else if (isWhatsAppConv) {
      bodyLines.push(`[${timeLabel}] ${senderLabel}${editedSuffix}${pendingSuffix}: [Message unavailable in CRM]`);
    } else {
      bodyLines.push(`[${timeLabel}] ${senderLabel}${editedSuffix}${pendingSuffix}: (empty message)`);
    }

    if (showText && attachmentLines.length > 0) {
      for (let j = 0; j < attachmentLines.length; j++) {
        bodyLines.push(`  ${attachmentLines[j]}`);
      }
    }

    if (msg.replyTo) {
      const replyAuthor =
        msg.replyTo.senderName ||
        (msg.replyTo.isIncoming === false ? "Staff" : leadFallbackName);
      const replyExcerpt = String(msg.replyTo.text || "Attachment")
        .trim()
        .replace(/\r?\n/g, " ");
      bodyLines.push(`  > Replying to ${replyAuthor}: ${replyExcerpt}`);
    }

    const reactions: ReadonlyArray<ExportReactionLike> = Array.isArray(msg.reactions)
      ? msg.reactions
      : [];
    if (reactions.length > 0) {
      const reactionItems = reactions
        .filter((r) => r && r.emoji)
        .map((r) => {
          const who = r.fromMe ? "Staff" : r.sender || leadFallbackName;
          return `${r.emoji} ${who}`;
        });
      if (reactionItems.length > 0) {
        bodyLines.push(`  [Reactions: ${reactionItems.join(", ")}]`);
      }
    }
  }

  return `${headerLines.join("\n")}\n${bodyLines.join("\n")}\n`;
}

/**
 * Triggers an immediate client-side UTF-8 `.txt` file download using a temporary Blob URL.
 */
export function triggerTextFileDownload(filename: string, content: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined") return;
  const blob = new Blob([`\uFEFF${content}`], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

/**
 * Builds a deterministic filename for batch conversation downloads (`.txt` or `.zip`).
 */
export function buildBatchConversationExportFilename(
  format: BatchExportFormat,
  prefix = "saved-conversations",
  exportedAt: number | Date = new Date()
): string {
  const slug = sanitizeExportFilenamePart(prefix) || "saved-conversations";
  const dateObj = exportedAt instanceof Date ? exportedAt : new Date(exportedAt);
  const validDate = Number.isNaN(dateObj.getTime()) ? new Date() : dateObj;
  const ext = format === "zip" ? "zip" : "txt";
  return `${slug}-${toLocalDateKey(validDate)}.${ext}`;
}

export interface BatchTranscriptOptions extends BuildTranscriptOptions {
  title?: string;
}

/**
 * Formats multiple conversations into a single UTF-8 transcript bundle with a
 * table of contents so it can be uploaded directly to Adham / Claude or reviewed offline.
 */
export function formatCombinedConversationsTranscript(
  conversations: ReadonlyArray<ExportConversationInput>,
  options: BatchTranscriptOptions = {}
): string {
  const exportedDate =
    options.exportedAt instanceof Date
      ? options.exportedAt
      : options.exportedAt !== undefined
      ? new Date(options.exportedAt)
      : new Date();
  const validExportedDate = Number.isNaN(exportedDate.getTime()) ? new Date() : exportedDate;
  const title = (options.title || "").trim() || "Tchaikovsky School — Saved Conversations Bundle";

  const totalMessages = conversations.reduce(
    (sum, conv) => sum + (Array.isArray(conv.messages) ? conv.messages.length : 0),
    0
  );

  const summaryLines: string[] = [
    title,
    "=".repeat(title.length),
    `Conversations: ${conversations.length}`,
    `Total Messages: ${totalMessages}`,
    `Exported: ${EXPORTED_AT_FORMATTER.format(validExportedDate)}`,
  ];

  if (conversations.length === 0) {
    summaryLines.push("=".repeat(title.length), "", "(No conversations in this export.)");
    return `${summaryLines.join("\n")}\n`;
  }

  summaryLines.push("", "Contents:");
  conversations.forEach((conv, idx) => {
    const contact = resolveContactDisplayName(conv);
    const channel = formatChannelLabel(conv);
    const inbox = resolveInboxLabel(conv, options.inboxMode);
    const msgCount = Array.isArray(conv.messages) ? conv.messages.length : 0;
    summaryLines.push(
      `${idx + 1}. ${contact} (${channel} · ${inbox} · ${msgCount} ${msgCount === 1 ? "message" : "messages"})`
    );
  });
  summaryLines.push("=".repeat(title.length));

  const sections = conversations.map((conv, idx) => {
    const transcript = formatConversationTranscript(conv, {
      ...options,
      exportedAt: validExportedDate,
    });
    return [
      "========================================================================",
      `[Conversation ${idx + 1} of ${conversations.length}]`,
      transcript.trimEnd(),
    ].join("\n");
  });

  return `${summaryLines.join("\n")}\n\n${sections.join("\n\n")}\n`;
}

/**
 * Builds deduplicated UTF-8 `.txt` archive entries for a batch of conversations.
 */
export function buildConversationArchiveEntries(
  conversations: ReadonlyArray<ExportConversationInput>,
  options: BuildTranscriptOptions = {}
): Array<{ name: string; content: string }> {
  const exportedDate =
    options.exportedAt instanceof Date
      ? options.exportedAt
      : options.exportedAt !== undefined
      ? new Date(options.exportedAt)
      : new Date();
  const validExportedDate = Number.isNaN(exportedDate.getTime()) ? new Date() : exportedDate;

  const rawNames = conversations.map((conv) =>
    buildConversationExportFilename(conv, validExportedDate)
  );
  const uniqueNames = deduplicateArchiveFilenames(rawNames);

  return conversations.map((conv, idx) => {
    const transcript = formatConversationTranscript(conv, {
      ...options,
      exportedAt: validExportedDate,
    });
    return {
      name: uniqueNames[idx],
      content: `\uFEFF${transcript}`,
    };
  });
}

/**
 * Generates and downloads a `.zip` file containing one UTF-8 `.txt` transcript per conversation.
 */
export async function triggerConversationsZipDownload(
  filename: string,
  conversations: ReadonlyArray<ExportConversationInput>,
  options: BuildTranscriptOptions = {}
): Promise<void> {
  const entries = buildConversationArchiveEntries(conversations, options);
  const zipBytes = await createZipArchive(entries, { compress: true });
  triggerBinaryFileDownload(filename, zipBytes, "application/zip");
}
