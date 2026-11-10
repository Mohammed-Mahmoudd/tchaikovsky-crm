"use client";

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
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
import {
  QuickReply,
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
  EditResult,
  toggleInlineMarker,
  toggleLinePrefix,
  continueListOnNewline,
  stripWhatsAppMarkup,
  renderEditorHighlight,
} from "../utils/messageFormatting";

const MAX_TEXTAREA_HEIGHT = 140; // ~6 lines, then scroll

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

/**
 * Fast client-side image compression using offscreen HTML5 canvas.
 * Shrinks multi-megabyte phone photos to crisp <=1920px JPEGs in ~30ms for near-instant upload.
 */
async function compressImageIfNeeded(file: File, forceDocument: boolean): Promise<{ blob: Blob; mimeType: string; fileName: string }> {
  const mime = (file.type || "").toLowerCase();
  if (
    forceDocument ||
    !mime.startsWith("image/") ||
    mime === "image/gif" ||
    mime === "image/svg+xml" ||
    file.size <= 350 * 1024
  ) {
    return { blob: file, mimeType: file.type || "application/octet-stream", fileName: file.name };
  }

  return new Promise((resolve) => {
    const img = new window.Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      const MAX_DIM = 1920;
      let { width, height } = img;
      if (width <= MAX_DIM && height <= MAX_DIM && file.size <= 600 * 1024) {
        resolve({ blob: file, mimeType: file.type, fileName: file.name });
        return;
      }
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width >= height) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }
      }
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve({ blob: file, mimeType: file.type, fileName: file.name });
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const targetMime = mime === "image/png" && file.size < 1.2 * 1024 * 1024 ? "image/png" : "image/jpeg";
        canvas.toBlob(
          (compressedBlob) => {
            if (compressedBlob && compressedBlob.size < file.size) {
              const cleanName =
                targetMime === "image/jpeg"
                  ? file.name.replace(/\.[^.]+$/, "") + ".jpg"
                  : file.name;
              resolve({ blob: compressedBlob, mimeType: targetMime, fileName: cleanName });
            } else {
              resolve({ blob: file, mimeType: file.type, fileName: file.name });
            }
          },
          targetMime,
          0.85
        );
      } catch {
        resolve({ blob: file, mimeType: file.type, fileName: file.name });
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      resolve({ blob: file, mimeType: file.type || "image/jpeg", fileName: file.name });
    };
    img.src = objUrl;
  });
}

/**
 * Pre-uploads the selected file in the background as soon as it is attached,
 * falling back to inline base64 if needed so clicking Send is instantaneous.
 */
async function preUploadFile(
  file: File,
  forceDocument: boolean,
  previewUrl: string,
  token?: string | null
): Promise<OutgoingAttachmentPayload> {
  const type = getFileType(file, forceDocument);
  const { blob, mimeType, fileName } = await compressImageIfNeeded(file, forceDocument);

  // 1. Try zero-overhead raw binary upload
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/octet-stream",
      "X-File-Name": encodeURIComponent(fileName),
      "X-Mime-Type": mimeType || "application/octet-stream",
      "X-Force-Document": forceDocument ? "1" : "0",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch("/api/messages/upload", {
      method: "POST",
      headers,
      body: blob,
    });
    if (res.ok) {
      const json = await res.json().catch(() => null);
      if (json?.success && json?.data?.storedFileName) {
        return {
          type: json.data.type || type,
          url: json.data.url,
          publicUrl: json.data.publicUrl,
          storedFileName: json.data.storedFileName,
          fileName: json.data.fileName || fileName,
          mimeType: json.data.mimeType || mimeType,
          fileSize: json.data.fileSize || blob.size,
          forceDocument,
          previewUrl,
        };
      }
    }
  } catch {}

  // 2. Fallback: encode as base64 in memory so /reply can save and send it directly
  const dataBase64 = await fileToBase64(blob);
  return {
    type,
    dataBase64,
    fileName,
    mimeType: mimeType || "application/octet-stream",
    fileSize: blob.size,
    forceDocument,
    previewUrl,
  };
}

export type ActiveReplyContext = {
  id: string;
  text: string;
  senderName?: string;
  isIncoming?: boolean;
  attachments?: any[];
};

interface ChatInputBarProps {
  chatId: string;
  /** Conversation channel — controls formatting support (WhatsApp) vs plain text (IG / FB) */
  channel?: MessageChannel;
  token?: string | null;
  isReadOnly: boolean;
  canSendMessages: boolean;
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
    replyTo?: { id: string; text: string; senderName?: string; isIncoming?: boolean }
  ) => Promise<boolean>;
  editingMessage?: { id: string; text: string } | null;
  onCancelEdit?: () => void;
  onSaveEdit?: (messageId: string, newText: string) => Promise<boolean>;
  replyingTo?: ActiveReplyContext | null;
  onCancelReply?: () => void;
  onJumpToMessage?: (id: string) => void;
  externalDroppedFiles?: { files: File[]; timestamp: number } | null;
}

export const ChatInputBar = React.memo(function ChatInputBar({
  chatId,
  channel = "WA",
  token,
  isReadOnly,
  canSendMessages,
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
}: ChatInputBarProps) {
  // Local state completely isolated from parent page — typing does NOT re-render chat or sidebar
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [queuedAttachments, setQueuedAttachments] = useState<QueuedAttachment[]>([]);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  // Caret position drives context-aware emoji suggestions
  const [caret, setCaret] = useState(0);
  // Word count at which the agent dismissed suggestions (Esc) — reappear on the next word
  const [dismissedAtWords, setDismissedAtWords] = useState<number | null>(null);
  const supportsFormatting = CHANNEL_CAPABILITIES[channel]?.formatting ?? false;
  const editorHighlight = useMemo(
    () => (supportsFormatting && text ? renderEditorHighlight(text, true) : null),
    [supportsFormatting, text]
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
    fetchRemoteQuickReplies(token).then((data) => {
      if (isMounted && data && data.length > 0) {
        setQuickReplies(data);
      }
    });

    const handleUpdated = () => {
      fetchRemoteQuickReplies(token).then((data) => {
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
  }, [token]);

  // Reset input, attachments, and focus when switching conversations
  useEffect(() => {
    setText("");
    setCaret(0);
    setDismissedAtWords(null);
    setIsFastRepliesDismissed(false);
    setActiveReplyIndex(0);
    setIsSending(false);
    setShowEmojiPicker(false);
    setShowAttachMenu(false);
    setQueuedAttachments([]);
    if (typeof window !== "undefined" && window.innerWidth >= 768) {
      inputRef.current?.focus();
    }
  }, [chatId]);

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
      setText(editingMessage.text);
      const len = editingMessage.text.length;
      setCaret(len);
      setDismissedAtWords(null);
      setShowAttachMenu(false);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.setSelectionRange(len, len);
        }
      }, 10);
    }
  }, [editingMessage]);

  // Focus input when entering Threaded Reply mode
  useEffect(() => {
    if (replyingTo) {
      setShowAttachMenu(false);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 10);
    }
  }, [replyingTo]);

  const enqueueFiles = useCallback(
    (files: FileList | File[], forceDocument = false) => {
      const list = Array.from(files || []);
      if (list.length === 0) return;

      const newItems: QueuedAttachment[] = list.map((file) => {
        const id = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const type = getFileType(file, forceDocument);
        const previewUrl = URL.createObjectURL(file);

        const uploadPromise = preUploadFile(file, forceDocument, previewUrl, token).then(
          (payload) => {
            setQueuedAttachments((prev) =>
              prev.map((item) =>
                item.id === id
                  ? { ...item, status: "ready", uploadedPayload: payload }
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
        inputRef.current?.focus();
      });
    },
    [token]
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
      enqueueFiles(externalDroppedFiles.files, false);
    }
  }, [externalDroppedFiles, enqueueFiles]);

  const handleRemoveAttachment = useCallback((id: string) => {
    setQueuedAttachments((prev) => prev.filter((item) => item.id !== id));
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (editingMessage || isReadOnly || !canSendMessages) return;
      const items = e.clipboardData?.items;
      if (!items) return;

      const filesToAttach: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file") {
          const f = item.getAsFile();
          if (f) {
            // Give pasted screenshots a clean timestamped name
            if (!f.name || f.name === "image.png") {
              const ext = (f.type.split("/")[1] || "png").split(";")[0];
              const namedFile = new File([f], `Screenshot_${Date.now()}.${ext}`, { type: f.type });
              filesToAttach.push(namedFile);
            } else {
              filesToAttach.push(f);
            }
          }
        }
      }

      if (filesToAttach.length > 0) {
        e.preventDefault();
        enqueueFiles(filesToAttach, false);
      }
    },
    [editingMessage, isReadOnly, canSendMessages, enqueueFiles]
  );

  const handleInsertEmoji = useCallback(
    (emoji: string) => {
      const input = inputRef.current;
      if (!input) {
        setText((prev) => prev + emoji);
        return;
      }
      const start = input.selectionStart ?? text.length;
      const end = input.selectionEnd ?? text.length;
      const nextText = text.slice(0, start) + emoji + text.slice(end);
      setText(nextText);
      const nextCursor = start + emoji.length;
      requestAnimationFrame(() => {
        input.focus();
        input.setSelectionRange(nextCursor, nextCursor);
      });
    },
    [text]
  );

  /** Apply a text edit and restore the caret / selection on the next frame. */
  const applyEdit = useCallback((result: EditResult) => {
    setText(result.text);
    setCaret(result.selEnd);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(result.selStart, result.selEnd);
    });
  }, []);

  // ── Smart emoji suggestions (pure, memoized, sub-millisecond) ──
  const textBeforeCaret = text.slice(0, Math.min(caret, text.length));
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
      const el = inputRef.current;
      const start = el?.selectionStart ?? caret;
      const end = el?.selectionEnd ?? caret;
      const before = text.slice(0, start);
      const after = text.slice(end);
      const needsLeadingSpace = before.length > 0 && !/\s$/.test(before);
      const needsTrailingSpace = !/^\s/.test(after);
      const insert = (needsLeadingSpace ? " " : "") + emoji + (needsTrailingSpace ? " " : "");
      const pos = start + insert.length;
      recordSuggestionPick(suggestion.keywords, emoji);
      recordRecentEmoji(emoji);
      applyEdit({ text: before + insert + after, selStart: pos, selEnd: pos });
    },
    [text, caret, suggestion.keywords, applyEdit]
  );

  const handleFormat = useCallback(
    (action: FormatAction) => {
      const el = inputRef.current;
      const start = el?.selectionStart ?? text.length;
      const end = el?.selectionEnd ?? text.length;
      applyEdit(
        action.kind === "inline"
          ? toggleInlineMarker(text, start, end, action.marker)
          : toggleLinePrefix(text, start, end, action.prefix)
      );
    },
    [text, applyEdit]
  );

  const syncCaret = useCallback(() => {
    const el = inputRef.current;
    if (el) setCaret(el.selectionEnd ?? 0);
  }, []);

  const syncScroll = useCallback(() => {
    const el = inputRef.current;
    const mirror = mirrorRef.current;
    if (el && mirror) {
      mirror.scrollTop = el.scrollTop;
      mirror.scrollLeft = el.scrollLeft;
    }
  }, []);

  // Auto-grow textarea height with content (up to MAX_TEXTAREA_HEIGHT, then scroll)
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > MAX_TEXTAREA_HEIGHT ? "auto" : "hidden";
    if (mirrorRef.current) {
      mirrorRef.current.style.height = `${next}px`;
      mirrorRef.current.scrollTop = el.scrollTop;
    }
  }, [text]);

  const handleCancelEditMode = useCallback(() => {
    setText("");
    setShowEmojiPicker(false);
    onCancelEdit?.();
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [onCancelEdit]);

  const handleSendOrSave = useCallback(async () => {
    const trimmed = text.trim();
    const hasAttachments = queuedAttachments.length > 0;
    if ((!trimmed && !hasAttachments) || isSending || isReadOnly || !canSendMessages) return;

    // If editing an existing WhatsApp message
    if (editingMessage && onSaveEdit) {
      if (trimmed === editingMessage.text.trim()) {
        handleCancelEditMode();
        return;
      }
      setIsSending(true);
      setShowEmojiPicker(false);
      setText("");
      const ok = await onSaveEdit(editingMessage.id, trimmed);
      setIsSending(false);
      if (!ok) {
        setText(trimmed);
      } else {
        inputRef.current?.focus();
      }
      return;
    }

    const attachmentsSnapshot = [...queuedAttachments];
    setIsSending(true);
    setShowEmojiPicker(false);
    setShowAttachMenu(false);
    // Optimistically clear immediately so the user can keep typing without waiting
    setText("");
    setQueuedAttachments([]);

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
      const replyPayload = replyingTo
        ? {
            id: replyingTo.id,
            text: replyingTo.text || (replyingTo.attachments?.length ? "Attachment" : "Message"),
            senderName: replyingTo.senderName,
            isIncoming: replyingTo.isIncoming,
          }
        : undefined;

      onCancelReply?.();

      const success = await onSendMessage(outgoing, readyPayloads, replyPayload);
      setIsSending(false);

      if (!success) {
        // Restore input text and attachments on network/server error so nothing is lost
        setText(trimmed);
        setQueuedAttachments(attachmentsSnapshot);
      } else {
        inputRef.current?.focus();
      }
    } catch {
      setIsSending(false);
      setText(trimmed);
      setQueuedAttachments(attachmentsSnapshot);
    }
  }, [
    text,
    queuedAttachments,
    isSending,
    isReadOnly,
    canSendMessages,
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

  // ── Fast Replies trigger detection and matching ─────────────────────────
  const slashMatch = useMemo(() => {
    // Only match '/' preceded by start of string or whitespace
    const match = textBeforeCaret.match(/(?:^|\s)\/([^\s]*)$/);
    if (!match) return null;
    const fullMatch = match[0];
    const query = match[1];
    const slashOffsetInMatch = fullMatch.indexOf("/");
    const matchStart = caret - fullMatch.length;
    const slashIndex = matchStart + slashOffsetInMatch;
    return { query, slashIndex };
  }, [textBeforeCaret, caret]);

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
      const beforeSlash = text.slice(0, slashMatch.slashIndex);
      const afterCaret = text.slice(caret);
      const insertText = reply.text;
      const nextText = beforeSlash + insertText + afterCaret;
      const nextCaret = beforeSlash.length + insertText.length;

      applyEdit({
        text: nextText,
        selStart: nextCaret,
        selEnd: nextCaret,
      });
      setIsFastRepliesDismissed(true);
    },
    [slashMatch, text, caret, applyEdit]
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
          await updateRemoteQuickReply(data.id, data, token);
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
          createRemoteQuickReply(data, token).then((remote) => {
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
      } catch (err: any) {
        return { success: false, error: err.message || "Failed to save quick reply" };
      }
    },
    [token, quickReplies.length]
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
      deleteRemoteQuickReply(id, token);
    },
    [token]
  );

  const showSuggestions = suggestion.emojis.length > 0 && !isSuggestionDismissed && !showFastReplies;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Never hijack keys while an IME (e.g. Arabic / CJK keyboard) is composing
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;

    // Fast replies keyboard navigation (WhatsApp-style)
    if (showFastReplies) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (filteredReplies.length > 0) {
          setActiveReplyIndex((prev) => (prev + 1) % filteredReplies.length);
        }
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (filteredReplies.length > 0) {
          setActiveReplyIndex((prev) => (prev - 1 + filteredReplies.length) % filteredReplies.length);
        }
        return;
      }
      if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey) {
        if (filteredReplies.length > 0) {
          e.preventDefault();
          const chosen = filteredReplies[activeReplyIndex] || filteredReplies[0];
          if (chosen) {
            handleInsertFastReply(chosen);
          }
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setIsFastRepliesDismissed(true);
        return;
      }
    }

    // Tab → insert the top emoji suggestion
    if (e.key === "Tab" && !e.shiftKey && showSuggestions) {
      e.preventDefault();
      handlePickSuggestion(suggestion.emojis[0]);
      return;
    }

    if (e.key === "Escape") {
      if (showSuggestions) {
        e.preventDefault();
        setDismissedAtWords(wordCountBeforeCaret);
        return;
      }
      if (editingMessage) {
        e.preventDefault();
        handleCancelEditMode();
        return;
      }
      if (replyingTo) {
        e.preventDefault();
        onCancelReply?.();
        return;
      }
      if (showAttachMenu) {
        e.preventDefault();
        setShowAttachMenu(false);
        return;
      }
    }

    // WhatsApp formatting shortcuts
    if (supportsFormatting && (e.ctrlKey || e.metaKey) && !e.altKey) {
      const key = e.key.toLowerCase();
      let action: FormatAction | null = null;
      if (key === "b" && !e.shiftKey) action = { kind: "inline", marker: "*" };
      else if (key === "i" && !e.shiftKey) action = { kind: "inline", marker: "_" };
      else if (key === "x" && e.shiftKey) action = { kind: "inline", marker: "~" };
      else if (key === "e" && !e.shiftKey) action = { kind: "inline", marker: "```" };
      if (action) {
        e.preventDefault();
        handleFormat(action);
        return;
      }
    }

    if (e.key === "Enter") {
      if (e.shiftKey) {
        // Shift+Enter → new line; continue bullet / numbered / quote lists automatically
        const el = e.currentTarget;
        if (supportsFormatting && el.selectionStart === el.selectionEnd) {
          const result = continueListOnNewline(text, el.selectionStart);
          if (result) {
            e.preventDefault();
            applyEdit(result);
          }
        }
        return;
      }
      e.preventDefault();
      handleSendOrSave();
    }
  };

  const placeholderText = editingMessage
    ? "Edit message..."
    : isReadOnly
      ? "View-only mode (Marketing role)"
      : hasQueuedAttachments
        ? "Add a caption (optional)..."
        : isAssignedToOther && userName
          ? `Reply as ${userName} (Assigned to ${assignedAgent || "Staff"})...`
          : "Type a message or paste a photo...";

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
          className="mb-2.5 p-2.5 rounded-xl border animate-in fade-in slide-in-from-bottom-1 duration-150"
          style={{
            background: "var(--bg-pill)",
            borderColor: "var(--border-input)",
          }}
        >
          <div className="flex items-center justify-between mb-2 px-0.5">
            <span className="text-[11px] font-semibold" style={{ color: "var(--text-secondary)" }}>
              {queuedAttachments.length}{" "}
              {queuedAttachments.length === 1 ? "attachment ready" : "attachments ready"}
            </span>
            <button
              type="button"
              onClick={() => setQueuedAttachments([])}
              className="text-[11px] font-semibold text-red-500 hover:underline cursor-pointer"
            >
              Clear all
            </button>
          </div>

          <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
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
                    <div className="w-16 h-16 relative bg-black/5">
                      <img
                        src={item.previewUrl}
                        alt={item.fileName}
                        className="w-full h-full object-cover"
                      />
                      {item.status === "uploading" && (
                        <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
                          <Loader2 className="w-4 h-4 text-white animate-spin" />
                        </div>
                      )}
                    </div>
                  ) : item.type === "video" ? (
                    <div className="w-16 h-16 relative bg-black flex flex-col items-center justify-center text-white p-1">
                      <Film className="w-5 h-5 opacity-90" />
                      <span className="text-[9px] mt-1 truncate max-w-full px-1 opacity-80">
                        {formatFileSize(item.fileSize)}
                      </span>
                      {item.status === "uploading" && (
                        <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
                          <Loader2 className="w-4 h-4 text-white animate-spin" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5 px-3 py-2 min-w-[165px] max-w-[220px] h-16">
                      <div
                        className="w-9 h-9 rounded-lg flex flex-col items-center justify-center shrink-0 border"
                        style={{
                          background: "var(--file-icon-bg)",
                          borderColor: "var(--file-icon-border)",
                          color: "var(--file-icon-color)",
                        }}
                      >
                        {item.type === "audio" ? (
                          <Music className="w-4 h-4" />
                        ) : (
                          <>
                            <FileText className="w-3.5 h-3.5" />
                            <span className="text-[8px] font-extrabold leading-none mt-0.5">
                              {ext}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 pr-3">
                        <p
                          className="text-[11px] font-semibold truncate"
                          style={{ color: "var(--text-primary)" }}
                          title={item.fileName}
                        >
                          {item.fileName}
                        </p>
                        <p
                          className="text-[10px] flex items-center gap-1 mt-0.5"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          <span>{formatFileSize(item.fileSize)}</span>
                          {item.status === "uploading" && (
                            <Loader2 className="w-2.5 h-2.5 animate-spin text-[#0066FF]" />
                          )}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Remove single attachment button */}
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(item.id)}
                    title="Remove attachment"
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 hover:bg-red-600 text-white flex items-center justify-center transition-colors cursor-pointer shadow-xs"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}

            {/* Quick "+ Add more" tile */}
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              title="Add more photos or files"
              className="w-16 h-16 rounded-lg border border-dashed flex flex-col items-center justify-center gap-1 shrink-0 transition-colors hover:border-[#0066FF] hover:text-[#0066FF] cursor-pointer"
              style={{
                borderColor: "var(--border-input)",
                color: "var(--text-secondary)",
              }}
            >
              <Plus className="w-4 h-4" />
              <span className="text-[9px] font-semibold">Add</span>
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

      {!editingMessage && !isReadOnly && isUnassigned && isAdmission && userName && onAssignToMe && (
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

      {/* Smart emoji suggestions + WhatsApp formatting toolbar (appears while typing) */}
      {!isWindowClosed && !isDisabled && !showEmojiPicker && !showFastReplies && (
        <ComposerAssistBar
          suggestions={showSuggestions ? suggestion.emojis : []}
          onPickSuggestion={handlePickSuggestion}
          showToolbar={supportsFormatting && text.length > 0}
          onFormat={handleFormat}
        />
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
        <div className="flex gap-2 items-end relative">
          {/* WhatsApp Emoji Picker Popover */}
          {showEmojiPicker && !isDisabled && (
            <EmojiPicker
              onSelect={handleInsertEmoji}
              onClose={() => setShowEmojiPicker(false)}
              position="top"
              align="left"
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
                  setShowAttachMenu((prev) => !prev);
                }}
                title="Attach photo or file"
                className={`flex items-center justify-center w-[36px] min-h-[36px] mb-[3px] sm:mb-[1px] rounded-lg shrink-0 transition-all duration-150 cursor-pointer disabled:opacity-40 border ${
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
              setShowEmojiPicker((prev) => !prev);
            }}
            title="Emoji"
            className={`flex items-center justify-center w-[36px] min-h-[36px] mb-[3px] sm:mb-[1px] rounded-lg shrink-0 transition-all duration-150 cursor-pointer disabled:opacity-40 border ${
              showEmojiPicker
                ? "text-[#0066FF] bg-[var(--bg-selected)] border-[#0066FF]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-transparent hover:border-[var(--border-input)] hover:bg-black/5 dark:hover:bg-white/5"
            }`}
            style={{
              background: showEmojiPicker ? "var(--bg-selected)" : undefined,
              color: showEmojiPicker ? "#0066FF" : undefined,
            }}
          >
            <Smile className="w-5 h-5" />
          </button>

          <div
            className={`relative flex-1 min-w-0 rounded-[8px] transition-colors ${
              isDisabled ? "opacity-60" : ""
            }`}
            style={{
              border: "1px solid var(--border-main)",
              background: "var(--bg-input)",
              color: "var(--text-primary)",
              WebkitFontSmoothing: "antialiased",
            }}
          >
            {editorHighlight !== null && (
              <div
                ref={mirrorRef}
                aria-hidden="true"
                dir="auto"
                className="wa-ed-mirror absolute inset-0 px-3.5 py-[9px] sm:py-[8px] leading-[22px] sm:leading-[20px] text-[16px] sm:text-[13px]"
                style={{ color: "var(--text-primary)" }}
              >
                {editorHighlight}
              </div>
            )}
            <textarea
              ref={inputRef}
              rows={1}
              dir="auto"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setCaret(e.target.selectionEnd ?? e.target.value.length);
              }}
              onSelect={syncCaret}
              onScroll={syncScroll}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              autoComplete="off"
              autoCorrect="on"
              spellCheck={true}
              placeholder={placeholderText}
              disabled={isDisabled}
              className={`relative z-10 w-full block resize-none rounded-[8px] px-3.5 py-[9px] sm:py-[8px] leading-[22px] sm:leading-[20px] min-h-[42px] sm:min-h-[38px] text-[16px] sm:text-[13px] outline-none placeholder:text-[var(--text-muted)] ${
                editorHighlight !== null ? "wa-ed-input" : "bg-transparent"
              }`}
              style={{
                color: editorHighlight !== null ? "transparent" : "var(--text-primary)",
              }}
            />
          </div>

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
      )}

      {/* Fast Reply Create / Edit Modal */}
      <FastReplyModal
        isOpen={showCreateModal}
        editingReply={editingReply}
        initialShortcut={modalInitialShortcut}
        onClose={() => {
          setShowCreateModal(false);
          setEditingReply(null);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        onSave={handleSaveQuickReply}
      />
    </div>
  );
});
