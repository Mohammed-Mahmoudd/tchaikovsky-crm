"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Smile,
  Pencil,
  Reply,
  X,
  Check,
  Paperclip,
  Image as ImageIcon,
  FileText,
  Film,
  Music,
  Plus,
  Loader2,
} from "lucide-react";
import { EmojiPicker, recordRecentEmoji } from "./EmojiPicker";
import { ComposerAssistBar, FormatAction } from "./ComposerAssistBar";
import { FastRepliesPopover } from "./FastRepliesPopover";
import { FastReplyModal } from "./FastReplyModal";
import { GroupMentionPopover } from "./GroupMentionPopover";
import { ComposerAgentControl, type ComposerAgentNotice } from "./ComposerAgentControl";
import {
  ComposerEditor,
  type ComposerEditorHandle,
  type ComposerPopoverKey,
  type ComposerSnapshot,
} from "./composer/ComposerEditor";
import { useAuth, normalizeRole } from "./AuthProvider";
import type { LeadAgentScope } from "../utils/followupAgent";
import type { ComposerAgentId } from "../utils/composerAgent";
import { EMPTY_COMPOSER_FORMAT, detectSlashTrigger } from "../utils/composerCodec";
import {
  detectMentionTrigger,
  filterMentionCandidates,
  type ComposerMentionItem,
  type GroupMetaInfo,
  type GroupParticipant,
  type MentionCandidate,
  type MessageMention,
} from "../utils/groupMentions";
import {
  QuickReply,
  FetchLike,
  getStoredQuickReplies,
  saveStoredQuickReplies,
  filterQuickReplies,
  fetchRemoteQuickReplies,
  createRemoteQuickReply,
  updateRemoteQuickReply,
  deleteRemoteQuickReply,
} from "../utils/quickReplies";
import { getEmojiSuggestions, recordSuggestionPick } from "../utils/emojiSuggestions";
import {
  CHANNEL_CAPABILITIES,
  MessageChannel,
  stripWhatsAppMarkup,
} from "../utils/messageFormatting";
import {
  detectImageFormatFromBytes,
  planImageUploadTransform,
  replaceFileExtension,
} from "../utils/imageUpload";

export interface OutgoingAttachmentPayload {
  type: "image" | "video" | "audio" | "file";
  url?: string;
  publicUrl?: string;
  storedFileName?: string;
  dataBase64?: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  forceDocument?: boolean;
  width?: number;
  height?: number;
  jpegThumbnail?: string;
  previewUrl?: string;
}

interface QueuedAttachment {
  id: string;
  file: File;
  fileName: string;
  mimeType: string;
  fileSize: number;
  type: "image" | "video" | "audio" | "file";
  forceDocument: boolean;
  previewUrl: string;
  status: "uploading" | "ready" | "error";
  uploadedPayload?: OutgoingAttachmentPayload;
  uploadPromise: Promise<OutgoingAttachmentPayload>;
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function getFileType(file: File, forceDocument: boolean): "image" | "video" | "audio" | "file" {
  if (forceDocument) return "file";
  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("image/") && mime !== "image/svg+xml") return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

function fileToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = typeof reader.result === "string" ? reader.result : "";
      const b64 = res.includes(",") ? res.split(",")[1] : res;
      resolve(b64);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(blob);
  });
}

interface PreparedImageUpload {
  blob: Blob;
  mimeType: string;
  fileName: string;
  forceDocument: boolean;
  width?: number;
  height?: number;
  jpegThumbnail?: string;
}

function generateCanvasThumbnailBase64(
  img: HTMLImageElement,
  srcWidth: number,
  srcHeight: number
): string | undefined {
  try {
    const thumbMax = 48;
    const scale = Math.min(1, thumbMax / Math.max(srcWidth, srcHeight, 1));
    const tw = Math.max(1, Math.round(srcWidth * scale));
    const th = Math.max(1, Math.round(srcHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, tw, th);
    ctx.drawImage(img, 0, 0, tw, th);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.55);
    const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/i, "");
    if (!base64 || base64.length >= 16000) return undefined;
    return base64;
  } catch {
    return undefined;
  }
}

function loadImageElement(file: Blob): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      resolve(null);
    };
    img.src = objUrl;
  });
}

function encodeCanvasAsJpeg(
  img: HTMLImageElement,
  width: number,
  height: number,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      resolve(null);
      return;
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

/**
 * Normalizes outgoing images before upload:
 * - Inspects file magic bytes (catches WebP/AVIF/GIF/HEIC/BMP even if misnamed .jpg)
 * - Transcodes non-JPEG/PNG images to JPEG regardless of file size for WhatsApp compatibility
 * - Generates natural dimensions and a lightweight JPEG thumbnail
 * - Falls back to document delivery when an image format (e.g. HEIC/SVG) cannot be transcoded
 */
async function prepareImageForUpload(
  file: File,
  forceDocument: boolean
): Promise<PreparedImageUpload> {
  const declaredMime = (file.type || "").toLowerCase();
  const headerBuf = await file.slice(0, 64).arrayBuffer().catch(() => null);
  const detectedFormat = headerBuf
    ? detectImageFormatFromBytes(new Uint8Array(headerBuf))
    : "unknown";
  const resolvedMime =
    detectedFormat !== "unknown"
      ? detectedFormat
      : declaredMime || "application/octet-stream";

  if (forceDocument || !resolvedMime.startsWith("image/")) {
    return {
      blob: file,
      mimeType: resolvedMime,
      fileName: file.name,
      forceDocument,
    };
  }

  const initialPlan = planImageUploadTransform({
    mimeType: declaredMime,
    fileSize: file.size,
    detectedFormat,
    forceDocument,
  });

  if (initialPlan === "document_fallback") {
    return {
      blob: file,
      mimeType: resolvedMime,
      fileName: file.name,
      forceDocument: true,
    };
  }

  const img = await loadImageElement(file);
  if (!img || !img.naturalWidth || !img.naturalHeight) {
    // If browser cannot decode (e.g. HEIC/corrupt bytes), send as document so WhatsApp still delivers it
    return {
      blob: file,
      mimeType: resolvedMime,
      fileName: file.name,
      forceDocument: initialPlan === "transcode_required" ? true : forceDocument,
    };
  }

  const natW = img.naturalWidth;
  const natH = img.naturalHeight;
  const finalPlan = planImageUploadTransform({
    mimeType: declaredMime,
    fileSize: file.size,
    detectedFormat,
    forceDocument,
    width: natW,
    height: natH,
  });

  const jpegThumbnail = generateCanvasThumbnailBase64(img, natW, natH);

  if (finalPlan === "skip") {
    return {
      blob: file,
      mimeType: resolvedMime,
      fileName: file.name,
      forceDocument: false,
      width: natW,
      height: natH,
      jpegThumbnail,
    };
  }

  const maxDim = 1920;
  let targetW = natW;
  let targetH = natH;
  if (targetW > maxDim || targetH > maxDim) {
    const ratio = Math.min(maxDim / targetW, maxDim / targetH);
    targetW = Math.max(1, Math.round(targetW * ratio));
    targetH = Math.max(1, Math.round(targetH * ratio));
  }

  const jpegBlob = await encodeCanvasAsJpeg(img, targetW, targetH, 0.85);

  if (finalPlan === "transcode_required") {
    if (jpegBlob) {
      return {
        blob: jpegBlob,
        mimeType: "image/jpeg",
        fileName: replaceFileExtension(file.name, "jpg"),
        forceDocument: false,
        width: targetW,
        height: targetH,
        jpegThumbnail,
      };
    }
    return {
      blob: file,
      mimeType: resolvedMime,
      fileName: file.name,
      forceDocument: true,
    };
  }

  // Large native JPEG/PNG: keep compressed JPEG only if it actually reduces size
  if (jpegBlob && jpegBlob.size < file.size) {
    return {
      blob: jpegBlob,
      mimeType: "image/jpeg",
      fileName: replaceFileExtension(file.name, "jpg"),
      forceDocument: false,
      width: targetW,
      height: targetH,
      jpegThumbnail,
    };
  }

  return {
    blob: file,
    mimeType: resolvedMime,
    fileName: file.name,
    forceDocument: false,
    width: natW,
    height: natH,
    jpegThumbnail,
  };
}

/**
 * Pre-uploads the selected file in the background as soon as it is attached,
 * falling back to inline base64 if needed so clicking Send is instantaneous.
 */
async function preUploadFile(
  file: File,
  forceDocument: boolean,
  previewUrl: string,
  token?: string | null,
  fetchFn: FetchLike = fetch
): Promise<OutgoingAttachmentPayload> {
  const prepared = await prepareImageForUpload(file, forceDocument);
  const { blob, mimeType, fileName, forceDocument: effectiveForceDoc, width, height, jpegThumbnail } = prepared;
  const effectiveType: "image" | "video" | "audio" | "file" = effectiveForceDoc
    ? "file"
    : getFileType(file, false);

  // 1. Try zero-overhead raw binary upload
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/octet-stream",
      "X-File-Name": encodeURIComponent(fileName),
      "X-Mime-Type": mimeType || "application/octet-stream",
      "X-Force-Document": effectiveForceDoc ? "1" : "0",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetchFn("/api/messages/upload", {
      method: "POST",
      headers,
      body: blob,
    });
    if (res.ok) {
      const json = await res.json().catch(() => null);
      if (json?.success && json?.data?.storedFileName) {
        return {
          type: json.data.type || effectiveType,
          url: json.data.url,
          publicUrl: json.data.publicUrl,
          storedFileName: json.data.storedFileName,
          fileName: json.data.fileName || fileName,
          mimeType: json.data.mimeType || mimeType,
          fileSize: json.data.fileSize || blob.size,
          forceDocument: effectiveForceDoc,
          width,
          height,
          jpegThumbnail,
          previewUrl,
        };
      }
    }
  } catch {}

  // 2. Fallback: encode as base64 in memory so /reply can save and send it directly
  const dataBase64 = await fileToBase64(blob);
  return {
    type: effectiveType,
    dataBase64,
    fileName,
    mimeType: mimeType || "application/octet-stream",
    fileSize: blob.size,
    forceDocument: effectiveForceDoc,
    width,
    height,
    jpegThumbnail,
    previewUrl,
  };
}

export type ActiveReplyContext = {
  id: string;
  text: string;
  senderName?: string;
  isIncoming?: boolean;
  attachments?: unknown[];
};

interface ChatInputBarProps {
  chatId: string;
  /** Conversation channel — controls formatting support (WhatsApp) vs plain text (IG / FB) */
  channel?: MessageChannel;
  isGroup?: boolean;
  groupParticipants?: GroupParticipant[];
  groupMeta?: GroupMetaInfo | null;
  isLoadingParticipants?: boolean;
  onRefreshParticipants?: () => void;
  token?: string | null;
  isReadOnly: boolean;
  canSendMessages: boolean;
  readOnlyReason?: string;
  isAssignedToOther: boolean;
  assignedAgent?: string;
  userName?: string;
  windowLeft?: string;
  isUnassigned: boolean;
  isAdmission: boolean;
  onAssignToMe?: () => void;
  onSendMessage: (
    text: string,
    attachments?: OutgoingAttachmentPayload[],
    replyTo?: { id: string; text: string; senderName?: string; isIncoming?: boolean },
    mentionPayload?: { mentions?: MessageMention[]; mentionAll?: boolean }
  ) => Promise<boolean>;
  editingMessage?: {
    id: string;
    text: string;
    mentions?: MessageMention[];
    mentionAll?: boolean;
  } | null;
  onCancelEdit?: () => void;
  onSaveEdit?: (
    messageId: string,
    newText: string,
    mentionPayload?: { mentions?: MessageMention[]; mentionAll?: boolean }
  ) => Promise<boolean>;
  replyingTo?: ActiveReplyContext | null;
  onCancelReply?: () => void;
  onJumpToMessage?: (id: string) => void;
  externalDroppedFiles?: { files: File[]; timestamp: number; chatId?: string } | null;
  onExternalDroppedFilesConsumed?: () => void;
  inboxMode?: "admissions" | "operation";
  agentScope?: LeadAgentScope;
  claudeEnabled?: boolean;
  claudePaused?: boolean;
  pipeline?: string;
  onDraftGenerated?: (agent: ComposerAgentId, text: string) => void;
  onAgentGeneratingChange?: (agent: ComposerAgentId | null) => void;
  agentRewriteRequest?: { id: number; agent: ComposerAgentId } | null;
}

export const ChatInputBar = React.memo(function ChatInputBar({
  chatId,
  channel = "WA",
  isGroup = false,
  groupParticipants = [],
  groupMeta = null,
  isLoadingParticipants = false,
  onRefreshParticipants,
  token,
  isReadOnly,
  canSendMessages,
  readOnlyReason,
  isAssignedToOther,
  assignedAgent,
  userName,
  windowLeft,
  isUnassigned,
  isAdmission,
  onAssignToMe,
  onSendMessage,
  editingMessage,
  onCancelEdit,
  onSaveEdit,
  replyingTo,
  onCancelReply,
  onJumpToMessage,
  externalDroppedFiles,
  onExternalDroppedFilesConsumed,
  inboxMode = "admissions",
  agentScope = "both",
  claudeEnabled = false,
  claudePaused = false,
  pipeline = "",
  onDraftGenerated,
  onAgentGeneratingChange,
  agentRewriteRequest = null,
}: ChatInputBarProps) {
  const { user, authFetch } = useAuth();
  const isChairman = normalizeRole(user?.role) === "chairman";
  // Local state completely isolated from parent page — typing does NOT re-render chat or sidebar
  const [snapshot, setSnapshot] = useState<ComposerSnapshot>({
    text: "",
    paragraphTextBeforeCaret: "",
    mentionTextBeforeCaret: "",
    textBeforeCaret: "",
    paragraphCount: 1,
    mentions: [],
    mentionAll: false,
    activeFormats: EMPTY_COMPOSER_FORMAT,
    isEmpty: true,
  });
  const [hasWrappedMultiline, setHasWrappedMultiline] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showAgentTray, setShowAgentTray] = useState(false);
  const [agentNotice, setAgentNotice] = useState<ComposerAgentNotice | null>(null);
  const [queuedAttachments, setQueuedAttachments] = useState<QueuedAttachment[]>([]);
  const [isMentionDismissed, setIsMentionDismissed] = useState(false);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);

  const editorRef = useRef<ComposerEditorHandle>(null);
  const activeChatIdRef = useRef<string>(chatId);
  const editingMessageIdRef = useRef<string | null>(editingMessage?.id ?? null);
  useEffect(() => {
    activeChatIdRef.current = chatId;
    return () => {
      if (activeChatIdRef.current === chatId) {
        activeChatIdRef.current = "";
      }
    };
  }, [chatId]);
  useEffect(() => {
    editingMessageIdRef.current = editingMessage?.id ?? null;
  }, [editingMessage?.id]);
  const groupParticipantsRef = useRef<GroupParticipant[]>(groupParticipants);
  useEffect(() => {
    groupParticipantsRef.current = groupParticipants;
  }, [groupParticipants]);

  // Word count at which the agent dismissed suggestions (Esc) — reappear on the next word
  const [dismissedAtWords, setDismissedAtWords] = useState<number | null>(null);
  const supportsFormatting = CHANNEL_CAPABILITIES[channel]?.formatting ?? false;
  const mentionsEnabled = Boolean(isGroup && channel === "WA");

  const handleSnapshotChange = useCallback((next: ComposerSnapshot) => {
    setSnapshot(next);
    if (!next.text || (next.paragraphCount <= 1 && next.text.length < 24)) {
      setHasWrappedMultiline(false);
    }
  }, []);

  const handleWrapMultiline = useCallback(() => {
    setHasWrappedMultiline(true);
  }, []);

  const isMultiline = snapshot.paragraphCount > 1 || hasWrappedMultiline;

  const text = snapshot.text;
  const paragraphTextBeforeCaret = snapshot.paragraphTextBeforeCaret;
  const mentionTextBeforeCaret = snapshot.mentionTextBeforeCaret;
  const textBeforeCaret = snapshot.textBeforeCaret;
  const selectedMentions: ComposerMentionItem[] = useMemo(
    () =>
      snapshot.mentions.map((m) => ({
        jid: m.jid || (m.userId ? `${m.userId}@s.whatsapp.net` : m.displayName),
        userId: m.userId,
        phone: m.phone,
        displayName: m.displayName,
        token: m.token || `@${m.displayName}`,
        isSelf: m.isSelf,
        isGroupMention: m.isGroupMention,
      })),
    [snapshot.mentions]
  );

  const photoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);

  // ── Fast Replies (WhatsApp-style quick replies triggered by "/") ─────────
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>(() => getStoredQuickReplies());
  const [isFastRepliesDismissed, setIsFastRepliesDismissed] = useState(false);
  const [activeReplyIndex, setActiveReplyIndex] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingReply, setEditingReply] = useState<QuickReply | null>(null);
  const [modalInitialShortcut, setModalInitialShortcut] = useState("");

  // Sync quick replies with backend & listen to SSE/storage updates
  useEffect(() => {
    let isMounted = true;
    fetchRemoteQuickReplies(token, authFetch).then((data) => {
      if (isMounted && data && data.length > 0) {
        setQuickReplies(data);
      }
    });

    const handleUpdated = () => {
      fetchRemoteQuickReplies(token, authFetch).then((data) => {
        if (isMounted && data && data.length > 0) {
          setQuickReplies(data);
        }
      });
    };

    if (typeof window !== "undefined") {
      window.addEventListener("crm:quick-replies-updated", handleUpdated);
      window.addEventListener("storage", handleUpdated);
    }

    return () => {
      isMounted = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("crm:quick-replies-updated", handleUpdated);
        window.removeEventListener("storage", handleUpdated);
      }
    };
  }, [token, authFetch]);

  // Reset input, attachments, and focus when switching conversations
  useEffect(() => {
    editorRef.current?.clear();
    setDismissedAtWords(null);
    setIsFastRepliesDismissed(false);
    setActiveReplyIndex(0);
    setIsMentionDismissed(false);
    setActiveMentionIndex(0);
    setIsSending(false);
    setShowEmojiPicker(false);
    setShowAttachMenu(false);
    setShowAgentTray(false);
    setAgentNotice(null);
    onAgentGeneratingChange?.(null);
    setQueuedAttachments([]);
    if (typeof window !== "undefined" && window.innerWidth >= 768) {
      editorRef.current?.focus();
    }
  }, [chatId, onAgentGeneratingChange]);

  // Close attach popover when clicking outside
  useEffect(() => {
    if (!showAttachMenu) return;
    const handleOutside = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [showAttachMenu]);

  // Populate input when entering WhatsApp Edit Message mode
  useEffect(() => {
    if (editingMessage) {
      setDismissedAtWords(null);
      setShowAttachMenu(false);
      const initialMentions: MessageMention[] = (editingMessage.mentions || [])
        .filter((m) => Boolean(m?.jid || m?.userId || m?.displayName))
        .map((m) => ({
          jid: m.jid || (m.userId ? `${m.userId}@s.whatsapp.net` : m.displayName),
          userId: m.userId,
          phone: m.phone,
          displayName: m.displayName,
          token: m.token || `@${m.displayName}`,
          isSelf: m.isSelf,
          isGroupMention: m.isGroupMention,
        }));
      setIsMentionDismissed(false);
      setActiveMentionIndex(0);
      editorRef.current?.setContent(editingMessage.text, {
        mentions: initialMentions,
        mentionAll: Boolean(editingMessage.mentionAll),
        participants: groupParticipantsRef.current,
        clearHistory: true,
      });
      requestAnimationFrame(() => {
        editorRef.current?.focus();
      });
    }
  }, [editingMessage]);

  // Focus input when entering Threaded Reply mode
  useEffect(() => {
    if (replyingTo) {
      setShowAttachMenu(false);
      requestAnimationFrame(() => {
        editorRef.current?.focus();
      });
    }
  }, [replyingTo]);

  const enqueueFiles = useCallback(
    (files: FileList | File[], forceDocument = false) => {
      const list = Array.from(files || []);
      if (list.length === 0) return;
      const originChatId = chatId;

      const newItems: QueuedAttachment[] = list.map((file) => {
        const id = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const type = getFileType(file, forceDocument);
        const previewUrl = URL.createObjectURL(file);

        const uploadPromise = preUploadFile(file, forceDocument, previewUrl, token, authFetch).then(
          (payload) => {
            if (activeChatIdRef.current !== originChatId) {
              return payload;
            }
            setQueuedAttachments((prev) =>
              prev.map((item) =>
                item.id === id
                  ? {
                      ...item,
                      type: payload.type,
                      fileName: payload.fileName,
                      mimeType: payload.mimeType,
                      fileSize: payload.fileSize,
                      forceDocument: Boolean(payload.forceDocument),
                      status: "ready",
                      uploadedPayload: payload,
                    }
                  : item
              )
            );
            return payload;
          }
        );

        return {
          id,
          file,
          fileName: file.name || (type === "image" ? "Photo.jpg" : "File"),
          mimeType: file.type || "application/octet-stream",
          fileSize: file.size,
          type,
          forceDocument,
          previewUrl,
          status: "uploading",
          uploadPromise,
        };
      });

      setQueuedAttachments((prev) => [...prev, ...newItems]);
      setShowAttachMenu(false);
      requestAnimationFrame(() => {
        editorRef.current?.focus();
      });
    },
    [chatId, token, authFetch]
  );

  // Handle files dropped onto the conversation area in parent page
  const lastDropTimestampRef = useRef<number>(0);
  useEffect(() => {
    if (
      externalDroppedFiles &&
      externalDroppedFiles.files.length > 0 &&
      externalDroppedFiles.timestamp !== lastDropTimestampRef.current
    ) {
      lastDropTimestampRef.current = externalDroppedFiles.timestamp;
      const matchesChat = !externalDroppedFiles.chatId || externalDroppedFiles.chatId === chatId;
      if (matchesChat && !editingMessage && !isReadOnly && canSendMessages) {
        enqueueFiles(externalDroppedFiles.files, false);
      }
      onExternalDroppedFilesConsumed?.();
    }
  }, [
    externalDroppedFiles,
    chatId,
    editingMessage,
    isReadOnly,
    canSendMessages,
    enqueueFiles,
    onExternalDroppedFilesConsumed,
  ]);

  const handleRemoveAttachment = useCallback((id: string) => {
    setQueuedAttachments((prev) => prev.filter((item) => item.id !== id));
    requestAnimationFrame(() => {
      editorRef.current?.focus();
    });
  }, []);

  const handlePasteFiles = useCallback(
    (files: File[]) => {
      if (editingMessage || isReadOnly || !canSendMessages || files.length === 0) return;
      enqueueFiles(files, false);
    },
    [editingMessage, isReadOnly, canSendMessages, enqueueFiles]
  );

  const handleInsertEmoji = useCallback((emoji: string) => {
    editorRef.current?.insertText(emoji);
  }, []);

  // ── Smart emoji suggestions (pure, memoized, sub-millisecond) ──
  const wordCountBeforeCaret = useMemo(
    () => (textBeforeCaret.trim() ? textBeforeCaret.trim().split(/\s+/).length : 0),
    [textBeforeCaret]
  );
  const suggestion = useMemo(() => getEmojiSuggestions(textBeforeCaret), [textBeforeCaret]);
  const isSuggestionDismissed = dismissedAtWords !== null && wordCountBeforeCaret === dismissedAtWords;

  // Reset dismissal once the agent moves on to another word (or clears the input)
  useEffect(() => {
    if (dismissedAtWords !== null && wordCountBeforeCaret !== dismissedAtWords) setDismissedAtWords(null);
  }, [wordCountBeforeCaret, dismissedAtWords]);

  const handlePickSuggestion = useCallback(
    (emoji: string) => {
      const needsLeadingSpace = textBeforeCaret.length > 0 && !/\s$/.test(textBeforeCaret);
      recordSuggestionPick(suggestion.keywords, emoji);
      recordRecentEmoji(emoji);
      editorRef.current?.insertText(`${needsLeadingSpace ? " " : ""}${emoji} `);
    },
    [textBeforeCaret, suggestion.keywords]
  );

  const handleFormat = useCallback((action: FormatAction) => {
    editorRef.current?.applyFormat(action);
  }, []);

  const handleCancelEditMode = useCallback(() => {
    editorRef.current?.clear();
    setHasWrappedMultiline(false);
    setIsMentionDismissed(false);
    setShowEmojiPicker(false);
    onCancelEdit?.();
    requestAnimationFrame(() => {
      editorRef.current?.focus();
    });
  }, [onCancelEdit]);

  const handleSendOrSave = useCallback(async () => {
    const payload = editorRef.current?.getPayload() ?? {
      text: snapshot.text,
      mentions: snapshot.mentions,
      mentionAll: snapshot.mentionAll,
    };
    const trimmed = payload.text.trim();
    const hasAttachments = queuedAttachments.length > 0;
    if ((!trimmed && !hasAttachments) || isSending || isReadOnly || !canSendMessages) return;

    const originChatId = chatId;
    const mentionPayload = mentionsEnabled
      ? {
          mentions: payload.mentions,
          mentionAll: payload.mentionAll,
        }
      : undefined;

    // If editing an existing WhatsApp message
    if (editingMessage && onSaveEdit) {
      const serializeMentionKey = (list?: MessageMention[]) =>
        (list || [])
          .map((m) =>
            String(m?.jid || m?.userId || m?.token || m?.displayName || "")
              .trim()
              .toLowerCase()
          )
          .filter(Boolean)
          .sort()
          .join("|");
      if (
        trimmed === editingMessage.text.trim() &&
        Boolean(mentionPayload?.mentionAll) === Boolean(editingMessage.mentionAll) &&
        serializeMentionKey(mentionPayload?.mentions) ===
          serializeMentionKey(editingMessage.mentions)
      ) {
        handleCancelEditMode();
        return;
      }
      const originEditId = editingMessage.id;
      setIsSending(true);
      setShowEmojiPicker(false);
      editorRef.current?.clear();
      let ok = false;
      try {
        ok = await onSaveEdit(originEditId, trimmed, mentionPayload);
      } catch {
        ok = false;
      }
      if (activeChatIdRef.current !== originChatId) {
        return;
      }
      setIsSending(false);
      if (!ok) {
        if (editingMessageIdRef.current === originEditId) {
          editorRef.current?.setContent(trimmed, {
            mentions: payload.mentions,
            mentionAll: payload.mentionAll,
            participants: groupParticipantsRef.current,
          });
        }
      } else {
        editorRef.current?.focus();
      }
      return;
    }

    const attachmentsSnapshot = [...queuedAttachments];
    const replyPayload = replyingTo
      ? {
          id: replyingTo.id,
          text: replyingTo.text || (replyingTo.attachments?.length ? "Attachment" : "Message"),
          senderName: replyingTo.senderName,
          isIncoming: replyingTo.isIncoming,
        }
      : undefined;

    setIsSending(true);
    setShowEmojiPicker(false);
    setShowAttachMenu(false);
    setShowAgentTray(false);
    // Optimistically clear immediately so the user can keep typing without waiting
    editorRef.current?.clear();
    setHasWrappedMultiline(false);
    setIsMentionDismissed(false);
    setQueuedAttachments([]);
    onCancelReply?.();

    try {
      let readyPayloads: OutgoingAttachmentPayload[] | undefined = undefined;
      if (attachmentsSnapshot.length > 0) {
        readyPayloads = await Promise.all(
          attachmentsSnapshot.map((item) =>
            item.uploadedPayload ? Promise.resolve(item.uploadedPayload) : item.uploadPromise
          )
        );
      }

      // Instagram / Messenger render plain text only — strip WhatsApp markup so no raw * _ ~ leak through
      const outgoing = supportsFormatting ? trimmed : stripWhatsAppMarkup(trimmed);

      const success = await onSendMessage(outgoing, readyPayloads, replyPayload, mentionPayload);
      if (activeChatIdRef.current !== originChatId) {
        return;
      }
      setIsSending(false);

      if (!success) {
        // Restore input text, mentions, and attachments on network/server error so nothing is lost
        editorRef.current?.setContent(trimmed, {
          mentions: payload.mentions,
          mentionAll: payload.mentionAll,
          participants: groupParticipantsRef.current,
        });
        setQueuedAttachments(attachmentsSnapshot);
      } else {
        editorRef.current?.focus();
      }
    } catch {
      if (activeChatIdRef.current !== originChatId) {
        return;
      }
      setIsSending(false);
      editorRef.current?.setContent(trimmed, {
        mentions: payload.mentions,
        mentionAll: payload.mentionAll,
        participants: groupParticipantsRef.current,
      });
      setQueuedAttachments(attachmentsSnapshot);
    }
  }, [
    chatId,
    snapshot.text,
    snapshot.mentions,
    snapshot.mentionAll,
    queuedAttachments,
    isSending,
    isReadOnly,
    canSendMessages,
    mentionsEnabled,
    editingMessage,
    onSaveEdit,
    handleCancelEditMode,
    replyingTo,
    onCancelReply,
    onSendMessage,
    supportsFormatting,
  ]);

  const isWindowClosed = windowLeft === "Closed";
  const isDisabled = isSending || isReadOnly || !canSendMessages;
  const hasQueuedAttachments = queuedAttachments.length > 0;
  const showAgentControl = Boolean(
    isChairman &&
      !isGroup &&
      inboxMode !== "operation" &&
      !chatId.startsWith("op_") &&
      !editingMessage &&
      !isReadOnly &&
      canSendMessages
  );

  // Auto-dismiss calm info notices after 5s
  useEffect(() => {
    if (!agentNotice || agentNotice.tone !== "info") return;
    const t = setTimeout(() => setAgentNotice(null), 5000);
    return () => clearTimeout(t);
  }, [agentNotice]);

  const handleInsertAgentDraft = useCallback(
    (agent: ComposerAgentId, draftText: string) => {
      setAgentNotice(null);
      onDraftGenerated?.(agent, draftText);
    },
    [onDraftGenerated]
  );

  // ── Fast Replies trigger detection and matching ─────────────────────────
  const slashMatch = useMemo(
    () => detectSlashTrigger(paragraphTextBeforeCaret),
    [paragraphTextBeforeCaret]
  );

  const lastQueryRef = useRef<string | null>(null);
  useEffect(() => {
    const currentQuery = slashMatch ? slashMatch.query : null;
    if (currentQuery !== lastQueryRef.current) {
      lastQueryRef.current = currentQuery;
      setIsFastRepliesDismissed(false);
      setActiveReplyIndex(0);
    }
  }, [slashMatch]);

  const filteredReplies = useMemo(() => {
    if (!slashMatch) return [];
    return filterQuickReplies(quickReplies, slashMatch.query);
  }, [quickReplies, slashMatch]);

  const showFastReplies = Boolean(
    slashMatch &&
      !isFastRepliesDismissed &&
      !isDisabled &&
      !isWindowClosed &&
      !editingMessage
  );

  const handleInsertFastReply = useCallback(
    (reply: QuickReply) => {
      if (!slashMatch) return;
      const charCount = slashMatch.endIndex - slashMatch.startIndex;
      editorRef.current?.replaceBeforeCaret(charCount, reply.text, {
        parseFormatting: supportsFormatting,
      });
      setIsFastRepliesDismissed(true);
    },
    [slashMatch, supportsFormatting]
  );

  const handleSaveQuickReply = useCallback(
    async (data: { id?: string; shortcut: string; title?: string; text: string; category?: string }) => {
      try {
        if (data.id) {
          setQuickReplies((prev) => {
            const next = prev.map((item) => (item.id === data.id ? { ...item, ...data } : item));
            saveStoredQuickReplies(next);
            return next;
          });
          await updateRemoteQuickReply(data.id, data, token, authFetch);
          return { success: true };
        } else {
          const tempId = `qr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const newReply: QuickReply = {
            id: tempId,
            shortcut: data.shortcut,
            title: data.title || data.shortcut,
            text: data.text,
            category: data.category || "General",
            order: quickReplies.length,
          };
          setQuickReplies((prev) => {
            const next = [...prev, newReply];
            saveStoredQuickReplies(next);
            return next;
          });
          createRemoteQuickReply(data, token, authFetch).then((remote) => {
            if (remote && remote.id) {
              setQuickReplies((prev) => {
                const updated = prev.map((item) => (item.id === tempId ? remote : item));
                saveStoredQuickReplies(updated);
                return updated;
              });
            }
          });
          return { success: true };
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to save quick reply";
        return { success: false, error: message };
      }
    },
    [token, authFetch, quickReplies.length]
  );

  const handleDeleteQuickReply = useCallback(
    (id: string, shortcut: string) => {
      if (typeof window !== "undefined" && !window.confirm(`Are you sure you want to delete the fast reply "/${shortcut}"?`)) {
        return;
      }
      setQuickReplies((prev) => {
        const next = prev.filter((item) => item.id !== id);
        saveStoredQuickReplies(next);
        return next;
      });
      deleteRemoteQuickReply(id, token, authFetch);
    },
    [token, authFetch]
  );

  // ── @Mention autocomplete detection (WhatsApp group chats in Operation Inbox) ──
  const mentionTrigger = useMemo(
    () =>
      mentionsEnabled
        ? detectMentionTrigger(
            mentionTextBeforeCaret,
            mentionTextBeforeCaret.length,
            selectedMentions
          )
        : null,
    [mentionsEnabled, mentionTextBeforeCaret, selectedMentions]
  );

  const lastMentionQueryRef = useRef<string | null>(null);
  useEffect(() => {
    const q = mentionTrigger ? mentionTrigger.query : null;
    if (q !== lastMentionQueryRef.current) {
      lastMentionQueryRef.current = q;
      setIsMentionDismissed(false);
      setActiveMentionIndex(0);
    }
  }, [mentionTrigger]);

  const autoFetchedGroupRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      mentionTrigger &&
      mentionsEnabled &&
      (!groupParticipants || groupParticipants.length === 0) &&
      !isLoadingParticipants &&
      onRefreshParticipants &&
      autoFetchedGroupRef.current !== chatId
    ) {
      autoFetchedGroupRef.current = chatId;
      onRefreshParticipants();
    }
  }, [
    mentionTrigger,
    mentionsEnabled,
    groupParticipants,
    isLoadingParticipants,
    onRefreshParticipants,
    chatId,
  ]);

  const mentionCandidates = useMemo(
    () => (mentionTrigger ? filterMentionCandidates(groupParticipants, mentionTrigger.query, groupMeta) : []),
    [mentionTrigger, groupParticipants, groupMeta]
  );

  const showGroupMentions = Boolean(
    mentionsEnabled &&
      mentionTrigger &&
      !isMentionDismissed &&
      !isDisabled &&
      !isWindowClosed &&
      !showFastReplies
  );

  const handleSelectMentionCandidate = useCallback(
    (candidate: MentionCandidate) => {
      if (!mentionTrigger) return;
      const charCount = mentionTrigger.endIndex - mentionTrigger.startIndex;
      const mentionItem: ComposerMentionItem =
        candidate.kind === "all"
          ? {
              jid: "all",
              displayName: "All",
              token: "@all",
              isGroupMention: true,
            }
          : (() => {
              const cleanLabel = candidate.displayName.replace(/\s+/g, " ").trim();
              return {
                jid: candidate.jid,
                userId: candidate.userId,
                phone: candidate.phone,
                displayName: cleanLabel,
                token: `@${cleanLabel}`,
                isSelf: Boolean(candidate.isSelf),
                isGroupMention: false,
              };
            })();
      setIsMentionDismissed(false);
      editorRef.current?.insertMention(charCount, mentionItem);
    },
    [mentionTrigger]
  );

  const showSuggestions =
    suggestion.emojis.length > 0 && !isSuggestionDismissed && !showFastReplies && !showGroupMentions;

  const handlePopoverKey = useCallback(
    (key: ComposerPopoverKey): boolean => {
      if (showGroupMentions) {
        if (key === "ArrowDown") {
          if (mentionCandidates.length > 0) {
            setActiveMentionIndex((prev) => (prev + 1) % mentionCandidates.length);
          }
          return true;
        }
        if (key === "ArrowUp") {
          if (mentionCandidates.length > 0) {
            setActiveMentionIndex(
              (prev) => (prev - 1 + mentionCandidates.length) % mentionCandidates.length
            );
          }
          return true;
        }
        if (key === "Enter" || key === "Tab") {
          if (mentionCandidates.length > 0) {
            const chosen = mentionCandidates[activeMentionIndex] || mentionCandidates[0];
            if (chosen) handleSelectMentionCandidate(chosen);
            return true;
          }
        }
        if (key === "Escape") {
          setIsMentionDismissed(true);
          return true;
        }
      }

      if (showFastReplies) {
        if (key === "ArrowDown") {
          if (filteredReplies.length > 0) {
            setActiveReplyIndex((prev) => (prev + 1) % filteredReplies.length);
          }
          return true;
        }
        if (key === "ArrowUp") {
          if (filteredReplies.length > 0) {
            setActiveReplyIndex(
              (prev) => (prev - 1 + filteredReplies.length) % filteredReplies.length
            );
          }
          return true;
        }
        if (key === "Enter" || key === "Tab") {
          if (filteredReplies.length > 0) {
            const chosen = filteredReplies[activeReplyIndex] || filteredReplies[0];
            if (chosen) handleInsertFastReply(chosen);
            return true;
          }
        }
        if (key === "Escape") {
          setIsFastRepliesDismissed(true);
          return true;
        }
      }

      if (key === "Tab" && showSuggestions) {
        handlePickSuggestion(suggestion.emojis[0]);
        return true;
      }

      if (key === "Escape") {
        if (showSuggestions) {
          setDismissedAtWords(wordCountBeforeCaret);
          return true;
        }
        if (editingMessage) {
          handleCancelEditMode();
          return true;
        }
        if (replyingTo) {
          onCancelReply?.();
          return true;
        }
        if (showAttachMenu) {
          setShowAttachMenu(false);
          return true;
        }
      }

      return false;
    },
    [
      showGroupMentions,
      mentionCandidates,
      activeMentionIndex,
      handleSelectMentionCandidate,
      showFastReplies,
      filteredReplies,
      activeReplyIndex,
      handleInsertFastReply,
      showSuggestions,
      handlePickSuggestion,
      suggestion.emojis,
      wordCountBeforeCaret,
      editingMessage,
      handleCancelEditMode,
      replyingTo,
      onCancelReply,
      showAttachMenu,
    ]
  );

  const placeholderText = editingMessage
    ? "Edit message..."
    : isReadOnly || !canSendMessages
      ? readOnlyReason || (isReadOnly ? "View-only mode (Marketing role)" : "View-only chat mode")
      : hasQueuedAttachments
        ? "Add a caption (optional)..."
        : isAssignedToOther && userName
          ? `Reply as ${userName} (Assigned to ${assignedAgent || "Staff"})...`
          : "Type a message or paste a photo...";

  const actionControls = (
    <>
      {showAgentControl && (
        <ComposerAgentControl
          chatId={chatId}
          agentScope={agentScope}
          claudeEnabled={claudeEnabled}
          claudePaused={claudePaused}
          pipeline={pipeline}
          disabled={isDisabled}
          compact={isMultiline}
          isExpanded={showAgentTray}
          onToggleExpanded={(next) => {
            setShowAttachMenu(false);
            setShowEmojiPicker(false);
            setShowAgentTray((prev) => (typeof next === "boolean" ? next : !prev));
          }}
          onInsertDraft={handleInsertAgentDraft}
          onStatusNotice={setAgentNotice}
          onGeneratingChange={(agent) => onAgentGeneratingChange?.(agent)}
          rewriteRequest={agentRewriteRequest}
        />
      )}

      {/* Attach Files / Photos Menu Button */}
      {!editingMessage && (
        <div ref={attachMenuRef} className="relative shrink-0">
          {showAttachMenu && !isDisabled && (
            <div
              className="absolute bottom-full left-0 mb-2 w-44 rounded-xl border shadow-xl p-1 z-50 animate-in fade-in zoom-in-95 duration-100"
              style={{
                background: "var(--bg-card)",
                borderColor: "var(--border-main)",
                boxShadow: "0 10px 28px rgba(0,0,0,0.22)",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setShowAttachMenu(false);
                  photoInputRef.current?.click();
                }}
                className="w-full group flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[12px] font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                style={{ color: "var(--text-primary)" }}
              >
                <ImageIcon className="w-4 h-4 shrink-0 text-[var(--text-secondary)] group-hover:text-[#0066FF] transition-colors" />
                <span>Photos & Videos</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowAttachMenu(false);
                  fileInputRef.current?.click();
                }}
                className="w-full group flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[12px] font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer mt-0.5"
                style={{ color: "var(--text-primary)" }}
              >
                <FileText className="w-4 h-4 shrink-0 text-[var(--text-secondary)] group-hover:text-[#0066FF] transition-colors" />
                <span>Document / File</span>
              </button>
            </div>
          )}

          <button
            type="button"
            disabled={isDisabled}
            onClick={() => {
              setShowEmojiPicker(false);
              setShowAgentTray(false);
              setShowAttachMenu((prev) => !prev);
            }}
            title="Attach photo or file"
            aria-label="Attach photo or file"
            className={`flex items-center justify-center rounded-lg shrink-0 transition-all duration-150 cursor-pointer disabled:opacity-40 border ${
              isMultiline ? "w-8 h-8" : "w-[36px] min-h-[36px] mb-[3px] sm:mb-[1px]"
            } ${
              showAttachMenu || hasQueuedAttachments
                ? "text-[#0066FF] bg-[var(--bg-selected)] border-[#0066FF]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-transparent hover:border-[var(--border-input)] hover:bg-black/5 dark:hover:bg-white/5"
            }`}
            style={{
              background:
                showAttachMenu || hasQueuedAttachments ? "var(--bg-selected)" : undefined,
              color:
                showAttachMenu || hasQueuedAttachments ? "#0066FF" : undefined,
            }}
          >
            <Paperclip className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Emoji Toggle Button */}
      <button
        type="button"
        disabled={isDisabled}
        onClick={() => {
          setShowAttachMenu(false);
          setShowAgentTray(false);
          setShowEmojiPicker((prev) => !prev);
        }}
        title="Emoji"
        aria-label="Emoji"
        className={`flex items-center justify-center rounded-lg shrink-0 transition-all duration-150 cursor-pointer disabled:opacity-40 border ${
          isMultiline ? "w-8 h-8" : "w-[36px] min-h-[36px] mb-[3px] sm:mb-[1px]"
        } ${
          showEmojiPicker
            ? "text-[#0066FF] bg-[var(--bg-selected)] border-[#0066FF]"
            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-transparent hover:border-[var(--border-input)] hover:bg-black/5 dark:hover:bg-white/5"
        }`}
        style={{
          background: showEmojiPicker ? "var(--bg-selected)" : undefined,
          color: showEmojiPicker ? "#0066FF" : undefined,
        }}
      >
        <Smile className={isMultiline ? "w-[18px] h-[18px]" : "w-5 h-5"} />
      </button>
    </>
  );

  return (
    <div
      className="px-4 md:px-6 py-3.5 shrink-0 relative"
      style={{
        background: "var(--bg-card)",
        borderTop: "1px solid var(--border-main)",
      }}
    >
      {/* Hidden File Inputs */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            enqueueFiles(e.target.files, false);
            e.target.value = "";
          }
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,application/*,text/*,audio/*,image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            enqueueFiles(e.target.files, true);
            e.target.value = "";
          }
        }}
      />

      {/* Threaded Reply Preview Banner (WA, IG, FB) */}
      {!editingMessage && replyingTo && (
        <div
          className="rounded-lg px-3 py-1.5 mb-2 flex items-center justify-between gap-2.5 border border-[var(--border-main)] border-s-[3px] animate-in fade-in slide-in-from-bottom-1 duration-150"
          style={{
            background: "var(--bg-pill)",
            borderInlineStartColor:
              channel === "WA" ? "#25D366" : channel === "IG" ? "#E1306C" : "#0066FF",
          }}
        >
          <div
            onClick={() => {
              if (replyingTo.id && onJumpToMessage) {
                onJumpToMessage(replyingTo.id);
              }
            }}
            className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer select-none group/replyBanner"
            title="Click to view quoted message in conversation"
          >
            <Reply
              className="w-3.5 h-3.5 shrink-0 transition-transform group-hover/replyBanner:-translate-y-0.5"
              style={{
                color:
                  channel === "WA" ? "#25D366" : channel === "IG" ? "#E1306C" : "#0066FF",
              }}
            />
            <div className="min-w-0 flex-1">
              <p
                className="text-[11px] font-semibold leading-tight flex items-center gap-1.5 truncate"
                style={{
                  color:
                    channel === "WA" ? "#25D366" : channel === "IG" ? "#E1306C" : "#0066FF",
                }}
              >
                <span>
                  {replyingTo.isIncoming
                    ? `Replying to ${replyingTo.senderName || "Lead"}`
                    : "Replying to yourself"}
                </span>
              </p>
              <p
                className="text-[11px] truncate mt-0.5"
                style={{ color: "var(--text-primary)" }}
              >
                {replyingTo.text || (replyingTo.attachments?.length ? "Attachment" : "Message")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            title="Cancel reply (Esc)"
            className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
            style={{ color: "var(--text-secondary)" }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* WhatsApp Edit Message Banner */}
      {editingMessage && (
        <div
          className="rounded-lg px-3 py-2 mb-2.5 flex items-center justify-between gap-3 border border-[var(--border-main)] border-s-2 border-s-[var(--border-input)] animate-in fade-in slide-in-from-bottom-1 duration-150"
          style={{
            background: "var(--bg-pill)",
          }}
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <Pencil className="w-3.5 h-3.5 text-[var(--text-secondary)] mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-[var(--text-secondary)] leading-tight">
                Edit message
              </p>
              <p
                className="text-[12px] truncate mt-0.5"
                style={{ color: "var(--text-primary)" }}
              >
                {editingMessage.text}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCancelEditMode}
            title="Cancel edit (Esc)"
            className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
            style={{ color: "var(--text-secondary)" }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Queued Attachments Preview Strip */}
      {!editingMessage && hasQueuedAttachments && (
        <div
          className="mb-2 px-2 py-1.5 rounded-[10px] border animate-in fade-in slide-in-from-bottom-1 duration-150"
          style={{
            background: "var(--bg-pill)",
            borderColor: "var(--border-input)",
          }}
        >
          {queuedAttachments.length > 1 && (
            <div className="flex items-center justify-between mb-1 px-0.5">
              <span className="text-[10.5px] font-semibold" style={{ color: "var(--text-secondary)" }}>
                {queuedAttachments.length} attachments ready
              </span>
              <button
                type="button"
                onClick={() => setQueuedAttachments([])}
                className="text-[10.5px] font-semibold text-red-500 hover:underline cursor-pointer"
              >
                Clear all
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {queuedAttachments.map((item) => {
              const ext =
                item.fileName.includes(".")
                  ? item.fileName.split(".").pop()?.toUpperCase().slice(0, 5) || "FILE"
                  : "FILE";

              return (
                <div
                  key={item.id}
                  className="relative group shrink-0 rounded-lg border overflow-hidden transition-all"
                  style={{
                    background: "var(--bg-card)",
                    borderColor: "var(--border-main)",
                  }}
                >
                  {item.type === "image" ? (
                    <div className="w-10 h-10 relative bg-black/5">
                      <img
                        src={item.previewUrl}
                        alt={item.fileName}
                        className="w-full h-full object-cover"
                      />
                      {item.status === "uploading" && (
                        <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
                          <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(item.id)}
                        title="Remove attachment"
                        aria-label={`Remove ${item.fileName}`}
                        className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/75 hover:bg-red-600 text-white flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ) : item.type === "video" ? (
                    <div className="w-10 h-10 relative bg-black flex flex-col items-center justify-center text-white">
                      <Film className="w-4 h-4 opacity-90" />
                      {item.status === "uploading" && (
                        <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
                          <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(item.id)}
                        title="Remove attachment"
                        aria-label={`Remove ${item.fileName}`}
                        className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/75 hover:bg-red-600 text-white flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 pl-1.5 pr-1 py-1 min-w-[140px] max-w-[220px] sm:max-w-[245px] h-10">
                      <div
                        className="w-7 h-7 rounded-md flex flex-col items-center justify-center shrink-0 border"
                        style={{
                          background: "var(--file-icon-bg)",
                          borderColor: "var(--file-icon-border)",
                          color: "var(--file-icon-color)",
                        }}
                      >
                        {item.type === "audio" ? (
                          <Music className="w-3.5 h-3.5" />
                        ) : (
                          <>
                            <FileText className="w-3 h-3" />
                            <span className="text-[7px] font-extrabold leading-none mt-0.5">
                              {ext}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className="text-[11px] font-semibold leading-tight truncate"
                          style={{ color: "var(--text-primary)" }}
                          title={item.fileName}
                        >
                          {item.fileName}
                        </p>
                        <p
                          className="text-[10px] leading-tight flex items-center gap-1 mt-0.5"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          <span>{formatFileSize(item.fileSize)}</span>
                          {item.status === "uploading" && (
                            <Loader2 className="w-2.5 h-2.5 animate-spin text-[#0066FF]" />
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(item.id)}
                        title="Remove attachment"
                        aria-label={`Remove ${item.fileName}`}
                        className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors hover:bg-red-500/10 hover:text-red-500 cursor-pointer"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Compact "+ Add" tile */}
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              title="Add more photos or files"
              aria-label="Add more photos or files"
              className="w-10 h-10 rounded-lg border border-dashed flex items-center justify-center shrink-0 transition-colors hover:border-[#0066FF] hover:text-[#0066FF] cursor-pointer"
              style={{
                borderColor: "var(--border-input)",
                color: "var(--text-secondary)",
              }}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {!editingMessage && isAssignedToOther && (
        <div
          className="rounded-[8px] px-3 py-1.5 text-[11px] mb-2.5 flex items-center justify-between"
          style={{
            background: "var(--bg-pill)",
            border: "1px solid var(--border-input)",
            color: "var(--text-secondary)",
          }}
        >
          <div className="flex items-center gap-1.5">
            <span className="font-medium" style={{ color: "var(--text-primary)" }}>
              Assigned to {assignedAgent || "Staff"}
            </span>
            <span>·</span>
            <span>
              Sending as <strong style={{ color: "var(--text-primary)" }}>{userName || "Staff"}</strong>
            </span>
          </div>
        </div>
      )}

      {!editingMessage && !isReadOnly && canSendMessages && isUnassigned && isAdmission && userName && onAssignToMe && (
        <div
          className="rounded-[8px] px-3 py-1.5 text-[11px] mb-2.5 flex items-center justify-between"
          style={{
            background: "var(--bg-pill)",
            border: "1px solid var(--border-input)",
            color: "var(--text-secondary)",
          }}
        >
          <span>Unassigned lead · Replying will assign to you automatically</span>
          <button
            type="button"
            onClick={onAssignToMe}
            className="font-semibold text-[#0066FF] hover:underline cursor-pointer"
          >
            Assign to me now
          </button>
        </div>
      )}

      {/* Fast Replies Popover (Triggered by "/" or slash button) */}
      <FastRepliesPopover
        isOpen={showFastReplies}
        query={slashMatch?.query ?? ""}
        replies={filteredReplies}
        activeIndex={activeReplyIndex}
        onSelect={handleInsertFastReply}
        onClose={() => setIsFastRepliesDismissed(true)}
        onOpenCreate={(initialSc) => {
          setModalInitialShortcut(initialSc || "");
          setEditingReply(null);
          setShowCreateModal(true);
        }}
        onEditReply={(reply) => {
          setEditingReply(reply);
          setShowCreateModal(true);
        }}
        onDeleteReply={handleDeleteQuickReply}
        onSetActiveIndex={setActiveReplyIndex}
      />

      {/* Group @Mention Popover (Triggered by "@" in Operation WhatsApp groups) */}
      {mentionsEnabled && (
        <GroupMentionPopover
          isOpen={showGroupMentions}
          query={mentionTrigger?.query ?? ""}
          candidates={mentionCandidates}
          activeIndex={activeMentionIndex}
          isLoading={isLoadingParticipants}
          groupMeta={groupMeta}
          onSelect={handleSelectMentionCandidate}
          onClose={() => setIsMentionDismissed(true)}
          onSetActiveIndex={setActiveMentionIndex}
          onRefresh={onRefreshParticipants}
        />
      )}

      {/* Smart emoji suggestions + WhatsApp formatting bar (+ docked controls when multiline) */}
      {!isWindowClosed && !isReadOnly && canSendMessages && !showFastReplies && !showGroupMentions && (isMultiline || !showEmojiPicker) && (
        <ComposerAssistBar
          suggestions={showSuggestions && !showEmojiPicker ? suggestion.emojis : []}
          onPickSuggestion={handlePickSuggestion}
          showToolbar={supportsFormatting && (isMultiline || text.length > 0)}
          onFormat={handleFormat}
          activeFormats={snapshot.activeFormats}
          leftSlot={isMultiline ? actionControls : undefined}
          popoverSlot={
            isMultiline && showEmojiPicker && !isDisabled ? (
              <EmojiPicker
                onSelect={handleInsertEmoji}
                onClose={() => setShowEmojiPicker(false)}
                position="top"
                align="left"
              />
            ) : undefined
          }
          disabled={isDisabled}
        />
      )}

      {/* AI Agent Notice Banner */}
      {showAgentControl && agentNotice && (
        <div
          className="rounded-lg px-3 py-1.5 mb-2 flex items-center justify-between gap-2 border text-[11.5px]"
          style={
            agentNotice.tone === "error"
              ? {
                  background: "var(--label-red-bg)",
                  borderColor: "var(--label-red-border)",
                  color: "var(--label-red-text)",
                }
              : agentNotice.tone === "warning"
              ? {
                  background: "var(--label-amber-bg)",
                  borderColor: "var(--label-amber-border)",
                  color: "var(--label-amber-text)",
                }
              : {
                  background: "var(--bg-pill)",
                  borderColor: "var(--border-input)",
                  color: "var(--text-secondary)",
                }
          }
        >
          <span className="min-w-0 break-words">{agentNotice.message}</span>
          <button
            type="button"
            onClick={() => setAgentNotice(null)}
            aria-label="Dismiss agent message"
            className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {isWindowClosed ? (
        <div
          className="rounded-[8px] p-4 text-[12px] text-center"
          style={{
            background: "var(--bg-input)",
            border: "1px solid var(--border-main)",
            color: "var(--text-secondary)",
          }}
        >
          The 24-hour reply window is closed. It reopens the next time this customer messages — outside it WhatsApp only allows approved template messages.
        </div>
      ) : (
        <div
          className={`relative grid items-end gap-2 ${
            isMultiline
              ? "grid-cols-[minmax(0,1fr)_auto]"
              : "grid-cols-[auto_minmax(0,1fr)_auto]"
          }`}
        >
          {/* Single-line WhatsApp Emoji Picker Popover (multiline mounts it inside ComposerAssistBar) */}
          {!isMultiline && showEmojiPicker && !isDisabled && (
            <EmojiPicker
              onSelect={handleInsertEmoji}
              onClose={() => setShowEmojiPicker(false)}
              position="top"
              align="left"
            />
          )}

          {/* Slot 1 (fixed sibling index): Standalone input box so single-line ↔ multiline never remounts Lexical */}
          <div
            className={`${
              isMultiline ? "col-start-1" : "col-start-2"
            } row-start-1 relative min-w-0 rounded-[8px] transition-colors border border-[var(--border-main)] ${
              isDisabled ? "opacity-60" : ""
            }`}
            style={{
              background: "var(--bg-input)",
              color: "var(--text-primary)",
              WebkitFontSmoothing: "antialiased",
            }}
          >
            <ComposerEditor
              ref={editorRef}
              placeholder={placeholderText}
              disabled={isDisabled}
              supportsFormatting={supportsFormatting}
              isMultiline={isMultiline}
              onWrapMultiline={handleWrapMultiline}
              onSnapshotChange={handleSnapshotChange}
              onSend={handleSendOrSave}
              onPasteFiles={handlePasteFiles}
              onPopoverKey={handlePopoverKey}
            />
          </div>

          {/* Slot 2: Standalone left icons outside input box on single-line (docked to top bar on multiline) */}
          {!isMultiline && (
            <div className="col-start-1 row-start-1 flex items-end gap-2">
              {actionControls}
            </div>
          )}

          {/* Slot 3: Standalone Send / Save button */}
          <div
            className={
              isMultiline
                ? "col-start-2 row-start-1 flex items-center self-end"
                : "col-start-3 row-start-1 flex items-center self-end"
            }
          >
            {editingMessage ? (
              <button
                type="button"
                onClick={handleSendOrSave}
                disabled={isDisabled || !text.trim()}
                title="Save edited message (Enter)"
                className="bg-[#25D366] hover:bg-[#1ebe5d] disabled:opacity-50 text-white font-semibold text-[13px] px-3.5 min-h-[42px] sm:min-h-[38px] rounded-[8px] shrink-0 transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span className="hidden sm:inline">{isSending ? "Saving..." : "Save"}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSendOrSave}
                disabled={isDisabled || (!text.trim() && !hasQueuedAttachments)}
                className="bg-[#0066FF] hover:bg-[#0055D6] disabled:bg-[#78B4F9] text-white font-semibold text-[13px] px-4 min-h-[42px] sm:min-h-[38px] rounded-[8px] shrink-0 transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {isSending ? "Sending..." : "Send"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Fast Reply Create / Edit Modal */}
      <FastReplyModal
        isOpen={showCreateModal}
        editingReply={editingReply}
        initialShortcut={modalInitialShortcut}
        onClose={() => {
          setShowCreateModal(false);
          setEditingReply(null);
          requestAnimationFrame(() => editorRef.current?.focus());
        }}
        onSave={handleSaveQuickReply}
      />
    </div>
  );
});
