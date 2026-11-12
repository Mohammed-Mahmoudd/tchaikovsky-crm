"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  ArrowLeft,
  X,
  AlertCircle,
  Pencil,
  Reply,
  Copy,
  Check,
  CheckCheck,
  Plus,
  FileText,
  Download,
  ExternalLink,
  Clock,
  Trash2,
  UploadCloud,
  SmilePlus,
} from "lucide-react";
import { useCRM, Message, Conversation } from "../context/CRMContext";
import { useAuth } from "./AuthProvider";
import { ChatInputBar, OutgoingAttachmentPayload, formatFileSize } from "./ChatInputBar";
import { renderWhatsAppText } from "../utils/messageFormatting";
import { EmojiPicker, WHATSAPP_QUICK_REACTIONS, recordRecentEmoji } from "./EmojiPicker";
import { formatMetaErrorMessage, ParsedMetaError } from "../utils/errorParser";
import MessageTemplate, { parseTemplateAttachment } from "./MessageTemplate";
import InstagramMedia from "./InstagramMedia";
import { VoiceNotePlayer } from "./VoiceNotePlayer";

// ─── Helper Functions ────────────────────────────────────────────────────────

const isPlaceholderText = (text?: string) => {
  if (!text) return true;
  const s = text.trim();
  const lower = s.toLowerCase();
  return (
    s === "📋 [Form / Template]" ||
    s === "[Form / Template]" ||
    s === "Form / Template" ||
    s === "Template" ||
    s.startsWith("📋 [") ||
    s === "📋" ||
    lower === "shared post/reel" ||
    lower === "[shared post/reel]" ||
    lower === "🔗 [shared post/reel]" ||
    lower.includes("shared post/reel") ||
    lower === "photo" ||
    lower === "[photo]" ||
    lower === "📷 [photo]" ||
    lower === "voice message" ||
    lower === "[voice message]" ||
    lower === "🎤 [voice message]" ||
    lower === "video" ||
    lower === "[video]" ||
    lower === "🎥 [video]" ||
    lower === "file" ||
    lower === "[file]" ||
    lower === "📎 [file]" ||
    lower === "attachment" ||
    lower === "[attachment]"
  );
};

const isRealPhone = (p?: string): boolean => {
  if (!p) return false;
  const s = p.trim().toLowerCase();
  if (s.startsWith("live ") || s === "live") return false;
  const digits = p.replace(/[^\d]/g, "");
  return digits.length >= 7;
};

interface AttachmentItem {
  type?: string;
  url?: string;
  previewUrl?: string;
  fileName?: string;
  title?: string;
  fileSize?: number;
  mimeType?: string;
  payload?: {
    url?: string;
    title?: string;
    template_type?: string;
    generic?: unknown;
    button?: unknown;
    elements?: unknown;
    ig_post_media_id?: string;
  };
  elements?: unknown;
  caption?: string;
  author?: string;
  username?: string;
  timestamp?: number;
  mediaUrl?: string;
}

const extractPhoneFromConversation = (conv?: Conversation | null): string => {
  if (!conv) return "";
  if (isRealPhone(conv.phone)) return conv.phone;
  if (conv.formPhone && isRealPhone(conv.formPhone)) return `+${String(conv.formPhone).replace(/\D/g, "")}`;
  const fa = conv.formAnswers as Record<string, unknown> | undefined;
  if (fa && typeof fa.phone === "string" && isRealPhone(fa.phone)) {
    return fa.phone;
  }
  for (const m of conv.messages || []) {
    if (!m.text) continue;
    const match = m.text.match(
      /(?:phone(?:\s*number)?|mobile|tel|رقم(?:\s*الهاتف|\s*الجوال)?|هاتف|جوال|واتس)?[:\s]*(\+?966[\d\s-]{8,}|05[\d\s-]{8,}|\+?201[0125][\d\s-]{7,}|01[0125][\d\s-]{7,})/i
    );
    if (match && match[1]) {
      return match[1].trim();
    }
    const digitMatch = m.text.match(
      /\b(05\d[\d\s-]{6,}\d|\+?966[\d\s-]{7,}\d|01[0125][\d\s-]{6,}\d|\+?201[0125][\d\s-]{6,}\d)\b/
    );
    if (digitMatch && digitMatch[1]) {
      return digitMatch[1].trim();
    }
    const genMatch = m.text.match(/(?:^|\s)(?:\+?\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}(?:\s|$)/);
    if (genMatch && genMatch[0].replace(/[^\d]/g, "").length >= 7) {
      return genMatch[0].trim();
    }
  }
  return "";
};

const isTemplateAttachment = (att: AttachmentItem | unknown) => {
  const a = att as AttachmentItem | undefined;
  return Boolean(
    a && (
      a.type === "template" ||
      a.payload?.template_type ||
      Boolean(a.payload?.generic) ||
      Boolean(a.payload?.button) ||
      Boolean(a.payload?.elements) ||
      Boolean(a.elements) ||
      a.type === "fallback"
    )
  );
};

// ─── Component Props ─────────────────────────────────────────────────────────

export interface ConversationChatViewProps {
  conversationId: string;
  onClose?: () => void;
  onBackToDetails?: () => void;
  showBackToDetails?: boolean;
  extraHeaderActions?: React.ReactNode;
  className?: string;
}

export const ConversationChatView = React.memo(function ConversationChatView({
  conversationId,
  onClose,
  onBackToDetails,
  showBackToDetails = false,
  extraHeaderActions,
  className = "",
}: ConversationChatViewProps) {
  const {
    conversations,
    setActiveChatId,
    fetchChatMessages,
    patchConversation,
    refresh,
    editMessage,
    unsendMessage,
    reactToMessage,
    addOptimisticMessages,
    finalizeOptimisticMessages,
    openChat,
  } = useCRM();

  const { user, token, isReadOnly } = useAuth();

  const activeConv = useMemo(
    () => conversations.find((c) => c.id === conversationId) ?? null,
    [conversations, conversationId]
  );

  const userClean = (user?.name || "").trim().toLowerCase();
  const agentClean = (activeConv?.agent || "").trim().toLowerCase();
  const isAssigned = !!agentClean && agentClean !== "unassigned";
  const isAssignedToMe = isAssigned && !!userClean && userClean === agentClean;
  const isChairman =
    user?.role === "chairman" ||
    user?.role === "owner" ||
    user?.role === "manager" ||
    user?.role === "enrollment_director";
  const isAdmission = user?.role === "admission_officer" || user?.role === "agent";
  const isAssignedToOther = isAssigned && !isAssignedToMe;
  const canSendMessages = !isReadOnly;

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement | null>(null);

  const [sendError, setSendError] = useState<ParsedMetaError | null>(null);
  const [editingMessage, setEditingMessage] = useState<{ id: string; text: string } | null>(null);
  const [unsendingMessage, setUnsendingMessage] = useState<{
    id: string;
    text: string;
    time: string;
  } | null>(null);
  const [isUnsending, setIsUnsending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{
    id: string;
    text: string;
    senderName?: string;
    isIncoming?: boolean;
    attachments?: AttachmentItem[];
  } | null>(null);

  const [activeReactionMenu, setActiveReactionMenu] = useState<{
    msgId: string;
    style: React.CSSProperties;
    anchorRect: DOMRect;
    isIncoming: boolean;
  } | null>(null);

  const [fullEmojiMenu, setFullEmojiMenu] = useState<{
    msgId: string;
    style: React.CSSProperties;
  } | null>(null);

  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; fileName?: string } | null>(null);
  const [isDraggingOverChat, setIsDraggingOverChat] = useState(false);
  const [droppedFilesForInput, setDroppedFilesForInput] = useState<{
    files: File[];
    timestamp: number;
  } | null>(null);
  const dragDepthRef = useRef(0);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const isNavigatingToFullChatRef = useRef<boolean>(false);

  // Smooth-scroll viewport to referenced original message
  const scrollToMessage = useCallback((targetId: string) => {
    if (!targetId) return;
    const el = document.getElementById(`msg-${targetId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      const bubble = (el.querySelector("[data-msg-bubble]") || el) as HTMLElement;
      if (bubble) {
        bubble.classList.remove("msg-jump-highlight");
        void bubble.offsetWidth;
        bubble.classList.add("msg-jump-highlight");
        setTimeout(() => {
          bubble.classList.remove("msg-jump-highlight");
        }, 1500);
      }
    }
  }, []);

  // Compute clamped fixed coordinates for reaction bars
  const computeReactionBarStyle = useCallback((anchorRect: DOMRect, isIncoming: boolean): React.CSSProperties => {
    const BAR_W = 284;
    const BAR_H = 46;
    const containerRect = chatScrollContainerRef.current?.getBoundingClientRect();
    const minTop = (containerRect ? containerRect.top : 64) + 8;
    const maxBottom = (containerRect ? containerRect.bottom : window.innerHeight - 70) - 8;
    const minLeft = (containerRect ? containerRect.left : 0) + 12;
    const maxRight = (containerRect ? containerRect.right : window.innerWidth) - 12;

    let top = anchorRect.top - BAR_H - 8;
    if (top < minTop) {
      top = Math.min(maxBottom - BAR_H, anchorRect.bottom + 8);
    }

    let left = isIncoming ? anchorRect.left : anchorRect.right - BAR_W;
    left = Math.max(minLeft, Math.min(left, maxRight - BAR_W));

    return { top, left };
  }, []);

  const computeFullPickerStyle = useCallback((anchorRect: DOMRect, isIncoming: boolean): React.CSSProperties => {
    const PICKER_W = typeof window !== "undefined" && window.innerWidth < 640 ? 300 : 330;
    const PICKER_H = 304;
    const containerRect = chatScrollContainerRef.current?.getBoundingClientRect();
    const minTop = (containerRect ? containerRect.top : 64) + 8;
    const maxBottom = (containerRect ? containerRect.bottom : window.innerHeight - 70) - 8;
    const minLeft = (containerRect ? containerRect.left : 0) + 12;
    const maxRight = (containerRect ? containerRect.right : window.innerWidth) - 12;

    const spaceAbove = anchorRect.top - minTop;
    const spaceBelow = maxBottom - anchorRect.bottom;

    let top: number;
    if (spaceAbove >= PICKER_H + 8) {
      top = anchorRect.top - PICKER_H - 8;
    } else if (spaceBelow >= PICKER_H + 8) {
      top = anchorRect.bottom + 8;
    } else {
      top = Math.max(minTop, Math.min(anchorRect.bottom + 8, maxBottom - PICKER_H));
    }

    let left = isIncoming ? anchorRect.left : anchorRect.right - PICKER_W;
    left = Math.max(minLeft, Math.min(left, maxRight - PICKER_W));

    return { top, left };
  }, []);

  // Clear delivery error, reply context and active menus on conversation change
  useEffect(() => {
    setSendError(null);
    setEditingMessage(null);
    setReplyingTo(null);
    setActiveReactionMenu(null);
    setFullEmojiMenu(null);
    prevMsgCountRef.current = 0;
  }, [conversationId]);

  // Activate chat in CRM context & load message history
  useEffect(() => {
    if (!conversationId) return;

    setActiveChatId(conversationId);

    const hasCached = Boolean(activeConv?.messages && activeConv.messages.length > 0);
    if (!hasCached) {
      setIsLoadingMessages(true);
    }

    let isSubscribed = true;
    fetchChatMessages(conversationId)
      .catch((err) => {
        console.warn("Failed to fetch messages for conversation:", conversationId, err);
      })
      .finally(() => {
        if (isSubscribed) {
          setIsLoadingMessages(false);
        }
      });

    return () => {
      isSubscribed = false;
      if (!isNavigatingToFullChatRef.current) {
        setActiveChatId(null);
      }
    };
  }, [conversationId, setActiveChatId, fetchChatMessages]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dismiss quick reaction menu on outside click
  useEffect(() => {
    if (!activeReactionMenu) return;
    const handleClickOutside = () => {
      setActiveReactionMenu(null);
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [activeReactionMenu]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  const prevMsgCountRef = useRef(0);
  useEffect(() => {
    if (activeConv?.messages) {
      const currentCount = activeConv.messages.length;
      if (currentCount !== prevMsgCountRef.current) {
        prevMsgCountRef.current = currentCount;
        scrollToBottom("auto");
      }
    }
  }, [activeConv?.messages, scrollToBottom]);

  const isNearBottomRef = useRef(true);

  const handleChatScroll = useCallback(() => {
    if (!chatScrollContainerRef.current) return;
    if (activeReactionMenu) setActiveReactionMenu(null);
    if (fullEmojiMenu) setFullEmojiMenu(null);

    const c = chatScrollContainerRef.current;
    isNearBottomRef.current = c.scrollHeight - c.scrollTop - c.clientHeight <= 140;
  }, [activeReactionMenu, fullEmojiMenu]);

  useEffect(() => {
    if (!chatScrollContainerRef.current) return;

    const timer = setTimeout(() => {
      if (replyingTo?.id) {
        if (isNearBottomRef.current) {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        } else {
          const targetEl = document.getElementById(`msg-${replyingTo.id}`);
          if (targetEl) {
            targetEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        }
      } else if (isNearBottomRef.current) {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }, 60);

    return () => clearTimeout(timer);
  }, [replyingTo]);

  // Sending reply with 0ms optimistic message insertion & server sync
  const handleSendReply = useCallback(
    async (
      textToSend: string,
      attachments?: OutgoingAttachmentPayload[],
      replyTo?: { id: string; text: string; senderName?: string; isIncoming?: boolean }
    ): Promise<boolean> => {
      const hasText = Boolean(textToSend && textToSend.trim());
      const hasAttachments = Boolean(attachments && attachments.length > 0);
      if (isReadOnly || (!hasText && !hasAttachments) || !activeConv || !canSendMessages) return false;

      const chatId = activeConv.id;

      if ((isAdmission || isChairman) && !isAssigned && user?.name) {
        patchConversation(chatId, { agent: user.name });
      }

      setSendError(null);
      setReplyingTo(null);

      let resolvedReplyTo = replyTo;
      if (replyTo) {
        const refMsg = activeConv.messages.find((m) => m.id === replyTo.id);
        const quoteAuthor =
          replyTo.senderName ||
          (replyTo.isIncoming !== false
            ? refMsg?.senderName || activeConv.leadName || activeConv.profileName || activeConv.name || "Customer"
            : "You");
        const quoteText =
          replyTo.text && replyTo.text !== "Attachment"
            ? replyTo.text
            : refMsg?.text || (refMsg?.attachments?.length ? "Attachment" : replyTo.text || "Message");
        resolvedReplyTo = {
          id: replyTo.id,
          text: quoteText,
          senderName: quoteAuthor,
          isIncoming: replyTo.isIncoming !== undefined ? replyTo.isIncoming : Boolean(refMsg?.isIncoming),
        };
      }

      const now = Date.now();
      const timeStr = new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const tempIds: string[] = [];

      if (hasAttachments && attachments) {
        const optimisticMsgs = attachments.map((att, idx) => {
          const tempId = `temp_${now}_${idx}`;
          tempIds.push(tempId);
          const captionForThis = idx === 0 ? textToSend.trim() : "";
          const displayText =
            captionForThis ||
            (att.type === "image"
              ? "Photo"
              : att.type === "video"
              ? "Video"
              : att.type === "audio"
              ? "Voice message"
              : att.fileName || "File");
          return {
            id: tempId,
            text: displayText,
            attachments: [
              {
                type: att.type,
                url: att.previewUrl || att.url,
                fileName: att.fileName,
                mimeType: att.mimeType,
                fileSize: att.fileSize,
              },
            ],
            time: timeStr,
            timestamp: now + idx,
            isIncoming: false,
            status: "pending" as const,
            senderName: user?.name || "Staff",
            replyTo: idx === 0 && resolvedReplyTo ? resolvedReplyTo : undefined,
          };
        });
        addOptimisticMessages(chatId, optimisticMsgs);
      } else {
        const tempId = `temp_${now}_0`;
        tempIds.push(tempId);
        addOptimisticMessages(chatId, [
          {
            id: tempId,
            text: textToSend.trim(),
            attachments: [],
            time: timeStr,
            timestamp: now,
            isIncoming: false,
            status: "pending" as const,
            senderName: user?.name || "Staff",
            replyTo: resolvedReplyTo || undefined,
          },
        ]);
      }

      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const serverAttachments = hasAttachments
          ? attachments!.map((att) => {
              const copy = { ...att };
              delete copy.previewUrl;
              return copy;
            })
          : undefined;

        const res = await fetch(`/api/messages/${chatId}/reply`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            text: textToSend,
            channel: activeConv.channel,
            attachments: serverAttachments,
            replyTo: resolvedReplyTo || undefined,
          }),
        });
        if (res.ok) {
          const json = await res.json().catch(() => null);
          const confirmedList = Array.isArray(json?.messages)
            ? json.messages
            : json?.data
            ? [
                {
                  ...json.data,
                  text: textToSend.trim(),
                  senderName: json.senderName || user?.name,
                  replyTo: resolvedReplyTo || json.data.replyTo,
                },
              ]
            : undefined;
          finalizeOptimisticMessages(chatId, tempIds, confirmedList);
          refresh();
          return true;
        } else {
          finalizeOptimisticMessages(chatId, tempIds);
          const data = await res.json().catch(() => null);
          const parsed = formatMetaErrorMessage(data?.error || data);
          setSendError(parsed);
          return false;
        }
      } catch (err) {
        console.error("Failed to send reply:", err);
        finalizeOptimisticMessages(chatId, tempIds);
        setSendError({
          title: "Network error",
          message: "Could not reach the server to send your reply.",
          actionHint: "Please check your internet connection and try again.",
        });
        return false;
      }
    },
    [
      isReadOnly,
      activeConv,
      canSendMessages,
      isAdmission,
      isChairman,
      isAssigned,
      user?.name,
      patchConversation,
      token,
      refresh,
      addOptimisticMessages,
      finalizeOptimisticMessages,
    ]
  );

  const handleSaveEditMessage = useCallback(
    async (messageId: string, newText: string): Promise<boolean> => {
      if (!activeConv || isReadOnly) return false;
      setEditingMessage(null);
      setSendError(null);
      const res = await editMessage(activeConv.id, messageId, newText);
      if (!res.ok) {
        setSendError({
          title: "Could not edit message",
          message: res.error || "WhatsApp only allows editing messages within 15 minutes of sending.",
        });
        return false;
      }
      return true;
    },
    [activeConv, isReadOnly, editMessage]
  );

  const handleConfirmUnsendMessage = useCallback(async () => {
    if (!activeConv || !unsendingMessage || isReadOnly || isUnsending) return;
    const targetId = unsendingMessage.id;
    setIsUnsending(true);
    setSendError(null);
    if (editingMessage?.id === targetId) setEditingMessage(null);
    if (replyingTo?.id === targetId) setReplyingTo(null);
    setUnsendingMessage(null);

    try {
      const res = await unsendMessage(activeConv.id, targetId);
      if (!res.ok) {
        setSendError({
          title: "Could not delete message",
          message: res.error || "WhatsApp only allows deleting messages within 48 hours of sending.",
        });
      }
    } finally {
      setIsUnsending(false);
    }
  }, [activeConv, unsendingMessage, isReadOnly, isUnsending, editingMessage?.id, replyingTo?.id, unsendMessage]);

  const handleReactToMessage = useCallback(
    async (messageId: string, emoji: string) => {
      if (!activeConv || isReadOnly) return;
      setActiveReactionMenu(null);
      setFullEmojiMenu(null);
      if (emoji) recordRecentEmoji(emoji);
      await reactToMessage(activeConv.id, messageId, emoji);
    },
    [activeConv, isReadOnly, reactToMessage]
  );

  const handleCopyMessage = useCallback((messageId: string, text: string) => {
    if (!text || typeof navigator === "undefined") return;
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedMsgId(messageId);
    setTimeout(() => {
      setCopiedMsgId((prev) => (prev === messageId ? null : prev));
    }, 1500);
  }, []);

  const handleStartReply = useCallback(
    (msg: Message) => {
      if (!activeConv || !canSendMessages || isReadOnly) return;
      setActiveReactionMenu(null);
      setFullEmojiMenu(null);
      setEditingMessage(null);
      const isIncoming = Boolean(msg.isIncoming);
      const quoteAuthor = isIncoming
        ? activeConv.leadName || activeConv.profileName || activeConv.name || "Customer"
        : "You";

      setReplyingTo({
        id: msg.id,
        text: msg.text || (msg.attachments?.length ? "Attachment" : ""),
        senderName: quoteAuthor,
        isIncoming,
        attachments: msg.attachments,
      });

      if (typeof window !== "undefined") {
        window.getSelection()?.removeAllRanges();
      }

      const el = document.getElementById(`msg-${msg.id}`);
      if (el) {
        const bubble = (el.querySelector("[data-msg-bubble]") || el) as HTMLElement;
        bubble.classList.add("scale-[0.985]", "ring-2", "ring-[#0066FF]/60", "transition-all", "duration-100");
        setTimeout(() => {
          bubble.classList.remove("scale-[0.985]", "ring-2", "ring-[#0066FF]/60");
        }, 180);
      }
    },
    [activeConv, canSendMessages, isReadOnly]
  );

  if (!activeConv) {
    return (
      <div className={`flex-1 flex flex-col items-center justify-center p-6 text-center ${className}`}>
        <div className="w-8 h-8 rounded-full border-2 border-[#0066FF] border-t-transparent animate-spin mb-3" />
        <p className="text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>
          Loading conversation...
        </p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="mt-3 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-[#0066FF] text-white hover:bg-[#0055d4] transition-colors cursor-pointer"
          >
            Close
          </button>
        )}
      </div>
    );
  }

  const convPhone = extractPhoneFromConversation(activeConv);

  return (
    <div
      onDragEnter={(e) => {
        if (!activeConv || isReadOnly || !canSendMessages) return;
        if (e.dataTransfer?.types?.includes("Files")) {
          e.preventDefault();
          dragDepthRef.current += 1;
          setIsDraggingOverChat(true);
        }
      }}
      onDragOver={(e) => {
        if (!activeConv || isReadOnly || !canSendMessages) return;
        if (e.dataTransfer?.types?.includes("Files")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDragLeave={(e) => {
        if (!activeConv || isReadOnly || !canSendMessages) return;
        if (e.dataTransfer?.types?.includes("Files")) {
          e.preventDefault();
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
          if (dragDepthRef.current === 0) {
            setIsDraggingOverChat(false);
          }
        }
      }}
      onDrop={(e) => {
        if (!activeConv || isReadOnly || !canSendMessages) return;
        e.preventDefault();
        dragDepthRef.current = 0;
        setIsDraggingOverChat(false);
        const dropped = Array.from(e.dataTransfer?.files || []);
        if (dropped.length > 0) {
          setDroppedFilesForInput({ files: dropped, timestamp: Date.now() });
        }
      }}
      className={`relative flex-1 flex flex-col min-w-0 h-full overflow-hidden ${className}`}
      style={{ background: "var(--bg-page)" }}
    >
      {/* Drag & Drop File Overlay */}
      {isDraggingOverChat && (
        <div className="absolute inset-3 z-[70] rounded-2xl border-2 border-dashed border-[#0066FF] bg-[#0066FF]/10 backdrop-blur-xs flex flex-col items-center justify-center gap-2 pointer-events-none animate-in fade-in duration-100">
          <div className="w-14 h-14 rounded-full bg-[#0066FF] text-white flex items-center justify-center shadow-lg">
            <UploadCloud className="w-7 h-7" />
          </div>
          <p className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>
            Drop photos or files here to attach
          </p>
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            Images, PDFs, Documents, Audio & Videos
          </p>
        </div>
      )}

      {/* Header Bar */}
      <div
        className="flex items-center justify-between px-4 sm:px-5 py-3 gap-2 shrink-0 select-none"
        style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border-main)" }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {showBackToDetails && onBackToDetails && (
            <button
              type="button"
              onClick={onBackToDetails}
              className="p-1 -ml-1 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer shrink-0"
              title="Back to lead details"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-[14px] sm:text-[15px] font-bold truncate" style={{ color: "var(--text-primary)" }}>
                {activeConv.name}
                {activeConv.leadName && activeConv.leadName !== activeConv.name ? ` · ${activeConv.leadName}` : ""}
              </h2>
            </div>
            <div className="flex items-center text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
              <span className="truncate">
                {activeConv.channel === "WA"
                  ? activeConv.metaChannel === "FB"
                    ? "WhatsApp · Facebook Form"
                    : activeConv.metaChannel === "IG"
                    ? "WhatsApp · Instagram Form"
                    : "WhatsApp"
                  : activeConv.channel === "IG"
                  ? "Instagram"
                  : "Messenger"}
              </span>
              {convPhone && (
                <>
                  <span className="mx-1 shrink-0">•</span>
                  <span className="truncate font-medium">{convPhone}</span>
                </>
              )}
              {activeConv.channel === "WA" && activeConv.windowLeft && (
                <>
                  <span className="mx-1 shrink-0">•</span>
                  <span
                    className={`shrink-0 ${
                      activeConv.windowLeft === "Closed" ? "text-[#FF9500]" : "text-[#34C759]"
                    }`}
                  >
                    {activeConv.windowLeft === "Closed" ? "Window closed" : `${activeConv.windowLeft}`}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right side header actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {extraHeaderActions}

          {/* Optional Open in full inbox link */}
          <button
            type="button"
            onClick={() => {
              isNavigatingToFullChatRef.current = true;
              openChat(activeConv.id);
            }}
            title="Open full conversation in Inbox"
            className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[#0066FF] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            <ExternalLink className="w-4 h-4" />
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
              title="Close panel"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Message History Container */}
      <div
        ref={chatScrollContainerRef}
        onScroll={handleChatScroll}
        className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-5 flex flex-col gap-3.5"
      >
        {isLoadingMessages && (!activeConv.messages || activeConv.messages.length === 0) ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-12">
            <div className="w-8 h-8 rounded-full border-2 border-[#0066FF] border-t-transparent animate-spin mb-3" />
            <p className="text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>
              Loading message history...
            </p>
          </div>
        ) : activeConv.messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-12">
            <div
              className="max-w-sm w-full rounded-xl p-5"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)" }}
            >
              <p className="text-[13px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                {activeConv.leadName && activeConv.leadName !== activeConv.name
                  ? `${activeConv.leadName} (${activeConv.name})`
                  : activeConv.name}
              </p>
              <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                No messages in this conversation yet. Send a message below to start chatting with this lead.
              </p>
              {activeConv.notes && (
                <div
                  className="mt-3 pt-3 text-left text-[11px] whitespace-pre-wrap"
                  style={{ borderTop: "1px solid var(--border-main)", color: "var(--text-secondary)" }}
                >
                  {activeConv.notes}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {activeConv.messages.map((msg) => {
          const msgAttachments = (msg.attachments || []) as AttachmentItem[];
          const hasTemplateAttachment = msgAttachments.some(isTemplateAttachment);
          const hasSharedPostAttachment = msgAttachments.some(
            (a) => a.type === "ig_post" || a.type === "ig_reel" || a.type === "share"
          );
          const hasMediaAttachment = msgAttachments.some((a) =>
            ["image", "audio", "video", "file", "document", "ig_post", "ig_reel", "share"].includes(a.type || "")
          );
          const shouldRenderFallbackCard = !hasTemplateAttachment && !hasMediaAttachment && isPlaceholderText(msg.text);

          let showPlainText = Boolean(msg.text && !isPlaceholderText(msg.text));
          if (showPlainText && hasMediaAttachment && msgAttachments.length > 0) {
            const trimmedMsgText = msg.text.trim();
            const matchesAttachmentFileName = msgAttachments.some(
              (a) => a.fileName && a.fileName.trim() === trimmedMsgText
            );
            if (matchesAttachmentFileName) {
              showPlainText = false;
            }
          }
          if (hasSharedPostAttachment && msg.text) {
            const lowerText = msg.text.trim().toLowerCase();
            if (
              lowerText === "shared post/reel" ||
              lowerText === "[shared post/reel]" ||
              lowerText === "🔗 [shared post/reel]" ||
              lowerText.includes("shared post/reel")
            ) {
              showPlainText = false;
            }
          }
          if (showPlainText && hasTemplateAttachment) {
            const firstTemplateAtt = msg.attachments?.find(isTemplateAttachment);
            const parsed = parseTemplateAttachment(firstTemplateAtt, msg.isIncoming, convPhone);
            if (parsed.length > 0 && parsed[0].title.trim() === msg.text.trim()) {
              showPlainText = false;
            }
          }

          const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
          const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
          const isDeletedMsg = Boolean(msg.isDeleted);
          const canEditThisMessage =
            !isReadOnly &&
            !isDeletedMsg &&
            !msg.isIncoming &&
            showPlainText &&
            activeConv.channel === "WA" &&
            (!msg.timestamp || Date.now() - msg.timestamp <= FIFTEEN_MINUTES_MS);
          const canUnsendThisMessage =
            !isReadOnly &&
            !isDeletedMsg &&
            !msg.isIncoming &&
            !msg.id.startsWith("temp_") &&
            activeConv.channel === "WA" &&
            (!msg.timestamp || Date.now() - msg.timestamp <= FORTY_EIGHT_HOURS_MS);
          const canReplyToThisMessage = !isReadOnly && !isDeletedMsg;
          const canReactToThisMessage = !isReadOnly && !isDeletedMsg && activeConv.channel === "WA";
          const isEditingThis = editingMessage?.id === msg.id;
          const isReplyingToThis = replyingTo?.id === msg.id;
          const isReactionOpen = activeReactionMenu?.msgId === msg.id;
          const isFullPickerOpen = fullEmojiMenu?.msgId === msg.id;
          const reactions = msg.reactions || [];
          const myReactionEmoji = reactions.find((r) => r.fromMe)?.emoji || null;

          const groupedReactions = reactions.reduce<
            { emoji: string; count: number; hasMe: boolean; senders: string[] }[]
          >((acc, r) => {
            if (!r.emoji) return acc;
            const existing = acc.find((item) => item.emoji === r.emoji);
            const senderLabel = r.fromMe ? "You" : r.sender || activeConv.name || "Contact";
            if (existing) {
              existing.count += 1;
              if (r.fromMe) existing.hasMe = true;
              existing.senders.push(senderLabel);
            } else {
              acc.push({
                emoji: r.emoji,
                count: 1,
                hasMe: Boolean(r.fromMe),
                senders: [senderLabel],
              });
            }
            return acc;
          }, []);

          return (
            <div
              key={msg.id}
              id={`msg-${msg.id}`}
              onDoubleClick={(e) => {
                if (!canReplyToThisMessage) return;
                const targetEl = e.target as HTMLElement | null;
                if (
                  targetEl?.closest(
                    "[data-msg-bubble], button, a, audio, video, img, input, textarea, select, [data-no-row-reply]"
                  )
                ) {
                  return;
                }
                handleStartReply(msg);
              }}
              className={`group relative flex flex-col w-full py-0.5 select-none ${
                msg.isIncoming ? "items-start" : "items-end"
              } ${groupedReactions.length > 0 ? "mb-2" : ""}`}
              title={canReplyToThisMessage ? "Double-click row to reply" : undefined}
            >
              {!msg.isIncoming && msg.senderName && (
                <span
                  className="text-[11px] font-medium mb-1 px-1.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {msg.senderName}
                </span>
              )}

              <div
                data-msg-bubble-row
                className={`relative flex items-center gap-1.5 max-w-full ${
                  msg.isIncoming ? "flex-row" : "flex-row-reverse"
                }`}
              >
                {/* Floating WhatsApp Quick Reaction Bar */}
                {isReactionOpen && activeReactionMenu && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="fixed z-[65] flex items-center gap-1 px-2.5 py-1.5 rounded-full shadow-2xl border select-none animate-in fade-in zoom-in-95 duration-100"
                    style={{
                      background: "var(--bg-card)",
                      borderColor: "var(--border-main)",
                      boxShadow: "0 10px 28px rgba(0,0,0,0.28)",
                      ...activeReactionMenu.style,
                    }}
                  >
                    {WHATSAPP_QUICK_REACTIONS.map((emoji) => {
                      const isSelected = myReactionEmoji === emoji;
                      return (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => handleReactToMessage(msg.id, emoji)}
                          className={`w-8 h-8 flex items-center justify-center text-[20px] rounded-full border transition-colors cursor-pointer ${
                            isSelected
                              ? "border-[#0066FF] bg-[var(--bg-selected)]"
                              : "border-transparent hover:border-[#0066FF]"
                          }`}
                          title={isSelected ? `Remove ${emoji} reaction` : `React with ${emoji}`}
                        >
                          {emoji}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => {
                        const pickerStyle = computeFullPickerStyle(
                          activeReactionMenu.anchorRect,
                          activeReactionMenu.isIncoming
                        );
                        setActiveReactionMenu(null);
                        setFullEmojiMenu({ msgId: msg.id, style: pickerStyle });
                      }}
                      title="More emojis"
                      className="w-7 h-7 flex items-center justify-center rounded-full border transition-colors cursor-pointer ml-0.5"
                      style={{
                        background: "var(--bg-pill)",
                        color: "var(--text-primary)",
                        borderColor: "var(--border-input)",
                      }}
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Full Emoji Picker */}
                {isFullPickerOpen && fullEmojiMenu && (
                  <EmojiPicker
                    onSelect={(emoji) => handleReactToMessage(msg.id, emoji)}
                    onClose={() => setFullEmojiMenu(null)}
                    fixedStyle={fullEmojiMenu.style}
                  />
                )}

                {/* Message Bubble */}
                <div
                  data-msg-bubble
                  className={`relative select-text ${
                    hasTemplateAttachment || shouldRenderFallbackCard || hasSharedPostAttachment
                      ? "max-w-[88%] sm:max-w-[300px] p-2 sm:p-2.5"
                      : "max-w-[85%] md:max-w-[460px] lg:max-w-[540px] px-3.5 py-2.5 sm:px-4 sm:py-3"
                  } rounded-2xl transition-all ${
                    msg.isIncoming ? "rounded-tl-sm" : "rounded-tr-sm"
                  } ${isEditingThis ? "ring-2 ring-[#0066FF]" : ""}`}
                  style={{
                    background: msg.isIncoming ? "var(--bg-chat-incoming)" : "var(--bg-chat-outgoing)",
                    border: msg.isIncoming ? "1px solid var(--border-main)" : "none",
                    boxShadow: "var(--shadow-card)",
                  }}
                >
                  {/* Quoted Message Card */}
                  {msg.replyTo && (() => {
                    const referencedMsg = msg.replyTo.id
                      ? activeConv.messages.find((m) => m.id === msg.replyTo!.id)
                      : null;
                    const isQuotingIncoming = referencedMsg
                      ? referencedMsg.isIncoming
                      : msg.replyTo.isIncoming !== false &&
                        msg.replyTo.senderName !== "You" &&
                        msg.replyTo.senderName !== "Staff";

                    const authorName = isQuotingIncoming
                      ? referencedMsg
                        ? referencedMsg.senderName || activeConv.leadName || activeConv.profileName || activeConv.name || "Customer"
                        : msg.replyTo.senderName || activeConv.leadName || activeConv.profileName || activeConv.name || "Customer"
                      : "You";
                    const quoteText =
                      msg.replyTo.text && msg.replyTo.text !== "Attachment"
                        ? msg.replyTo.text
                        : referencedMsg?.text || (referencedMsg?.attachments?.length ? "Attachment" : msg.replyTo.text || "Message");

                    return (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          scrollToMessage(msg.replyTo!.id);
                        }}
                        className="mb-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all hover:opacity-90 select-none flex flex-col gap-0.5 border-s-[3px] text-left"
                        style={{
                          background: msg.isIncoming ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.18)",
                          borderInlineStartColor:
                            activeConv.channel === "WA"
                              ? "#25D366"
                              : activeConv.channel === "IG"
                              ? "#E1306C"
                              : "#0066FF",
                        }}
                        title="Click to view quoted message"
                      >
                        <p
                          className="text-[11px] font-semibold leading-tight truncate"
                          style={{
                            color:
                              activeConv.channel === "WA"
                                ? msg.isIncoming ? "#128C7E" : "var(--text-chat-outgoing)"
                                : activeConv.channel === "IG"
                                ? "#E1306C"
                                : "#0066FF",
                          }}
                        >
                          {authorName}
                        </p>
                        <p
                          className="text-[12px] line-clamp-2 break-words leading-snug"
                          style={{
                            color: msg.isIncoming ? "var(--text-chat-incoming)" : "var(--text-chat-outgoing)",
                            opacity: 0.92,
                          }}
                          dir="auto"
                        >
                          {quoteText}
                        </p>
                      </div>
                    );
                  })()}

                  {/* Deleted Message Placeholder */}
                  {isDeletedMsg ? (
                    <p
                      className="text-[13px] md:text-[14px] italic flex items-center gap-1.5 select-none opacity-80"
                      style={{
                        color: msg.isIncoming ? "var(--text-secondary)" : "var(--text-chat-outgoing)",
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5 shrink-0 opacity-75" />
                      <span>This message was deleted</span>
                    </p>
                  ) : (
                    <>
                      {/* Media Attachments */}
                      {msgAttachments && msgAttachments.length > 0 && (
                        <div className="flex flex-col gap-2 mb-1.5">
                          {msgAttachments.map((att, idx) => {
                            if (isTemplateAttachment(att)) return null;
                            const url = att.previewUrl || att.payload?.url || att.url;
                            const fileName =
                              att.fileName ||
                              att.payload?.title ||
                              att.title ||
                              (att.type === "file" && msg.text && !isPlaceholderText(msg.text)
                                ? msg.text
                                : undefined);
                            const fileSizeStr = formatFileSize(att.fileSize);
                            const downloadUrl =
                              url && !url.startsWith("blob:")
                                ? `${url}${url.includes("?") ? "&" : "?"}download=1&name=${encodeURIComponent(
                                    fileName || "attachment"
                                  )}`
                                : url;

                            if (att.type === "image") {
                              if (url) {
                                return (
                                  <div
                                    key={idx}
                                    className="relative group/img overflow-hidden rounded-xl max-w-[300px]"
                                  >
                                    <img
                                      src={url}
                                      alt={fileName || "Photo"}
                                      onClick={() => setLightboxImage({ url, fileName })}
                                      className="max-h-[260px] w-auto object-cover rounded-xl cursor-pointer hover:opacity-95 transition-opacity"
                                      loading="lazy"
                                    />
                                    {downloadUrl && (
                                      <a
                                        href={downloadUrl}
                                        download={fileName || "photo.jpg"}
                                        onClick={(e) => e.stopPropagation()}
                                        title="Download photo"
                                        className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white opacity-0 group-hover/img:opacity-100 transition-opacity cursor-pointer shadow-md"
                                      >
                                        <Download className="w-3.5 h-3.5" />
                                      </a>
                                    )}
                                  </div>
                                );
                              }
                            }

                            if (att.type === "audio" && url) {
                              return (
                                <VoiceNotePlayer
                                  key={idx}
                                  url={url}
                                  fileName={fileName}
                                  isIncoming={msg.isIncoming}
                                  channel={activeConv.channel}
                                />
                              );
                            }

                            if (att.type === "video") {
                              return (
                                <div key={idx} className="rounded-xl overflow-hidden max-w-[300px] border border-black/10">
                                  <video
                                    src={url}
                                    controls
                                    playsInline
                                    preload="metadata"
                                    className="w-full max-h-[260px] bg-black rounded-xl"
                                  />
                                </div>
                              );
                            }

                            if (att.type === "ig_post" || att.type === "ig_reel" || att.type === "share") {
                              return (
                                <InstagramMedia
                                  key={idx}
                                  url={att.payload?.url || att.url}
                                  title={att.payload?.title || att.title}
                                  type={att.type}
                                  mediaId={att.payload?.ig_post_media_id}
                                />
                              );
                            }

                            if (att.type === "file" || att.type === "document" || (!att.type && url)) {
                              return (
                                <div
                                  key={idx}
                                  className="flex items-center gap-3 p-2.5 rounded-xl border max-w-[320px] transition-colors"
                                  style={{
                                    background: msg.isIncoming ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.16)",
                                    borderColor: msg.isIncoming ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.25)",
                                  }}
                                >
                                  <div
                                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                                    style={{
                                      background: msg.isIncoming ? "#0066FF" : "#ffffff",
                                      color: msg.isIncoming ? "#ffffff" : "#0066FF",
                                    }}
                                  >
                                    <FileText className="w-5 h-5" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p
                                      className="text-[13px] font-semibold truncate leading-tight"
                                      style={{
                                        color: msg.isIncoming ? "var(--text-primary)" : "var(--text-chat-outgoing)",
                                      }}
                                    >
                                      {fileName || "Document"}
                                    </p>
                                    {fileSizeStr && (
                                      <p
                                        className="text-[11px] mt-0.5"
                                        style={{
                                          color: msg.isIncoming ? "var(--text-secondary)" : "var(--text-chat-outgoing)",
                                          opacity: 0.8,
                                        }}
                                      >
                                        {fileSizeStr}
                                      </p>
                                    )}
                                  </div>
                                  {downloadUrl && (
                                    <a
                                      href={downloadUrl}
                                      download={fileName || "document"}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
                                      style={{
                                        color: msg.isIncoming ? "var(--text-primary)" : "var(--text-chat-outgoing)",
                                      }}
                                      title="Download document"
                                    >
                                      <Download className="w-4 h-4" />
                                    </a>
                                  )}
                                </div>
                              );
                            }

                            return null;
                          })}
                        </div>
                      )}

                      {/* Interactive Templates */}
                      {hasTemplateAttachment && (
                        <div className="flex flex-col gap-2">
                          {msgAttachments
                            .filter(isTemplateAttachment)
                            .map((att, idx) => (
                              <MessageTemplate
                                key={idx}
                                attachment={att}
                                isIncoming={msg.isIncoming}
                                senderPhone={convPhone}
                              />
                            ))}
                        </div>
                      )}

                      {/* Plain Text Message */}
                      {showPlainText && (
                        <p
                          className="text-[13px] sm:text-[14px] leading-relaxed break-words whitespace-pre-wrap select-text"
                          style={{
                            color: msg.isIncoming ? "var(--text-chat-incoming)" : "var(--text-chat-outgoing)",
                          }}
                          dir="auto"
                        >
                          {activeConv.channel === "WA"
                            ? renderWhatsAppText(msg.text)
                            : msg.text}
                        </p>
                      )}
                    </>
                  )}

                  {/* Message Footer */}
                  <div
                    className={`text-[10px] mt-1.5 flex items-center gap-1 ${
                      msg.dir === "rtl" ? "justify-start" : "justify-end"
                    }`}
                    style={{
                      color: msg.isIncoming ? "var(--text-muted)" : "var(--text-chat-outgoing)",
                      opacity: msg.isIncoming ? 1 : 0.78,
                    }}
                  >
                    {!msg.isIncoming && msg.senderName && !isDeletedMsg && (
                      <span className="font-semibold">{msg.senderName} ·</span>
                    )}
                    {isDeletedMsg && (
                      <span className="italic font-medium opacity-90">
                        Deleted by {msg.deletedBy || (!msg.isIncoming ? user?.name || "Staff" : activeConv.name || "Customer")} ·
                      </span>
                    )}
                    {!isDeletedMsg && msg.isEdited && <span className="italic opacity-90">Edited ·</span>}
                    <span>{msg.time}</span>
                    {!msg.isIncoming && !isDeletedMsg && (
                      <span className="inline-flex items-center ml-0.5" title={msg.status || "sent"}>
                        {msg.status === "pending" ? (
                          <Clock className="w-3 h-3 opacity-80 animate-pulse" />
                        ) : activeConv.channel === "WA" ? (
                          msg.status === "read" || msg.isRead ? (
                            <CheckCheck className="w-3.5 h-3.5 text-[#0088FF] dark:text-[#34B7F1] stroke-[2.4]" />
                          ) : msg.status === "delivered" ? (
                            <CheckCheck className="w-3.5 h-3.5 opacity-75 stroke-[2.2]" />
                          ) : (
                            <Check className="w-3.5 h-3.5 opacity-70 stroke-[2.2]" />
                          )
                        ) : null}
                      </span>
                    )}
                  </div>

                  {/* WhatsApp Reaction Pill Badges */}
                  {groupedReactions.length > 0 && (
                    <div
                      className={`absolute -bottom-3 flex items-center gap-1 z-10 ${
                        msg.isIncoming ? "left-2.5" : "right-2.5"
                      }`}
                    >
                      {groupedReactions.map((g) => (
                        <button
                          key={g.emoji}
                          type="button"
                          disabled={!canReactToThisMessage}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (canReactToThisMessage) {
                              handleReactToMessage(msg.id, g.emoji);
                            }
                          }}
                          title={`${g.senders.join(", ")} reacted with ${g.emoji}${
                            g.hasMe && canReactToThisMessage ? " (Click to remove)" : ""
                          }`}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[12px] leading-none shadow-sm border transition-colors hover:border-[#0066FF] cursor-pointer ${
                            g.hasMe ? "ring-1 ring-[#0066FF]/40" : ""
                          }`}
                          style={{
                            background: "var(--bg-card)",
                            borderColor: g.hasMe ? "#0066FF" : "var(--border-main)",
                            color: "var(--text-primary)",
                          }}
                        >
                          <span>{g.emoji}</span>
                          {g.count > 1 && (
                            <span className="text-[10px] font-bold" style={{ color: "var(--text-secondary)" }}>
                              {g.count}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Hover Action Bar */}
                <div
                  className={`flex items-center gap-0.5 px-1 py-0.5 rounded-full border shadow-xs transition-opacity shrink-0 ${
                    isReactionOpen || isFullPickerOpen || isEditingThis || isReplyingToThis
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
                  }`}
                  style={{
                    background: "var(--bg-card)",
                    borderColor: "var(--border-main)",
                  }}
                >
                  {/* Threaded Reply */}
                  {canReplyToThisMessage && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartReply(msg);
                      }}
                      title="Reply to message"
                      className="p-1.5 rounded-full border border-transparent hover:border-[#0066FF] transition-colors cursor-pointer"
                      style={{ color: isReplyingToThis ? "#0066FF" : "var(--text-secondary)" }}
                    >
                      <Reply className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Reactions Button */}
                  {canReactToThisMessage && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFullEmojiMenu(null);
                        if (activeReactionMenu?.msgId === msg.id) {
                          setActiveReactionMenu(null);
                          return;
                        }
                        const rowEl = e.currentTarget.closest("[data-msg-bubble-row]") as HTMLElement | null;
                        const rect = (rowEl || e.currentTarget).getBoundingClientRect();
                        const style = computeReactionBarStyle(rect, msg.isIncoming);
                        setActiveReactionMenu({
                          msgId: msg.id,
                          style,
                          anchorRect: rect,
                          isIncoming: msg.isIncoming,
                        });
                      }}
                      title="React with emoji"
                      className="p-1.5 rounded-full border border-transparent hover:border-[#0066FF] transition-colors cursor-pointer"
                      style={{ color: isReactionOpen ? "#0066FF" : "var(--text-secondary)" }}
                    >
                      <SmilePlus className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Edit Message Button */}
                  {canEditThisMessage && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setReplyingTo(null);
                        setEditingMessage({ id: msg.id, text: msg.text });
                      }}
                      title="Edit message (within 15m)"
                      className="p-1.5 rounded-full border border-transparent hover:border-[#0066FF] transition-colors cursor-pointer"
                      style={{ color: isEditingThis ? "#0066FF" : "var(--text-secondary)" }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Unsend / Delete Message */}
                  {canUnsendThisMessage && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setUnsendingMessage({ id: msg.id, text: msg.text, time: msg.time });
                      }}
                      title="Delete message for everyone (within 48h)"
                      className="p-1.5 rounded-full border border-transparent hover:border-red-500 hover:text-red-500 transition-colors cursor-pointer"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Copy Text Button */}
                  {showPlainText && !isDeletedMsg && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyMessage(msg.id, msg.text);
                      }}
                      title="Copy text"
                      className="p-1.5 rounded-full border border-transparent hover:border-[#0066FF] transition-colors cursor-pointer"
                      style={{
                        color: copiedMsgId === msg.id ? "#34C759" : "var(--text-secondary)",
                      }}
                    >
                      {copiedMsgId === msg.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} className="h-3 shrink-0" />
      </div>

      {/* Delivery error banner */}
      {sendError && (
        <div
          role="alert"
          className="mx-3 sm:mx-4 mb-2 p-3 rounded-lg flex items-start justify-between gap-3 text-xs shrink-0"
          style={{
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            color: "var(--text-primary)",
          }}
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-semibold text-red-600 dark:text-red-400">{sendError.title}</p>
              <p className="mt-0.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {sendError.message}
              </p>
              {sendError.actionHint && (
                <p className="mt-1 font-medium text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  {sendError.actionHint}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSendError(null)}
            className="p-1 -mr-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-muted transition-colors shrink-0"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Chat Input Bar */}
      <ChatInputBar
        chatId={activeConv.id}
        channel={activeConv.channel}
        token={token}
        isReadOnly={isReadOnly}
        canSendMessages={canSendMessages}
        isAssignedToOther={isAssignedToOther}
        assignedAgent={activeConv.agent}
        userName={user?.name}
        windowLeft={activeConv.windowLeft}
        isUnassigned={!isAssigned}
        isAdmission={isAdmission || isChairman}
        onAssignToMe={user?.name ? () => patchConversation(activeConv.id, { agent: user.name }) : undefined}
        onSendMessage={handleSendReply}
        editingMessage={editingMessage}
        onCancelEdit={() => setEditingMessage(null)}
        onSaveEdit={handleSaveEditMessage}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        onJumpToMessage={scrollToMessage}
        externalDroppedFiles={droppedFilesForInput}
      />

      {/* Photo Lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[110] bg-black/85 backdrop-blur-xs flex flex-col items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="flex items-center justify-between w-full max-w-4xl mb-3 px-2"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-white text-[13px] font-medium truncate">
              {lightboxImage.fileName || "Photo"}
            </span>
            <div className="flex items-center gap-2">
              <a
                href={
                  lightboxImage.url.startsWith("blob:")
                    ? lightboxImage.url
                    : `${lightboxImage.url}${lightboxImage.url.includes("?") ? "&" : "?"}download=1&name=${encodeURIComponent(
                        lightboxImage.fileName || "Photo.jpg"
                      )}`
                }
                download={lightboxImage.fileName || "Photo.jpg"}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-[12px] font-semibold transition-colors"
              >
                <Download className="w-4 h-4" />
                Download
              </a>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white transition-colors cursor-pointer"
                title="Close preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <img
            src={lightboxImage.url}
            alt={lightboxImage.fileName || "Photo preview"}
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[82vh] object-contain rounded-xl shadow-2xl"
          />
        </div>
      )}

      {/* Delete Message Confirmation Modal */}
      {unsendingMessage && activeConv && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setUnsendingMessage(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl p-5 shadow-2xl flex flex-col gap-4"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[16px] font-bold" style={{ color: "var(--text-primary)" }}>
                  Delete message for everyone?
                </h3>
                <p className="text-[12px] mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  This will delete the message from the WhatsApp chat for all recipients.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUnsendingMessage(null)}
                className="p-1 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div
              className="p-3 rounded-xl border text-[13px] italic line-clamp-3"
              style={{ background: "var(--bg-pill)", borderColor: "var(--border-input)", color: "var(--text-primary)" }}
            >
              &ldquo;{unsendingMessage.text || "Attachment"}&rdquo;
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setUnsendingMessage(null)}
                className="px-4 py-2 rounded-xl text-[13px] font-medium transition-colors cursor-pointer"
                style={{ background: "var(--bg-pill)", color: "var(--text-secondary)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isUnsending}
                onClick={handleConfirmUnsendMessage}
                className="px-4 py-2 rounded-xl text-[13px] font-semibold text-white bg-[#FF3B30] hover:bg-[#E0352B] transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {isUnsending ? "Deleting..." : "Delete for everyone"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
