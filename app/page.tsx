"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Info,
  X,
  Calendar,
  CheckCircle2,
  Trash2,
  Search,
  AlertCircle,
  SmilePlus,
  Pencil,
  Reply,
  Copy,
  Check,
  CheckCheck,
  Plus,
  FileText,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Clock,
  UploadCloud,
  ChevronDown,
} from "lucide-react";
import { useBranches } from "./lib/branches";
import { BranchSelect } from "./components/BranchSelect";
import { ChatInputBar, OutgoingAttachmentPayload, formatFileSize } from "./components/ChatInputBar";
import { renderWhatsAppText } from "./utils/messageFormatting";
import { EmojiPicker, WHATSAPP_QUICK_REACTIONS, recordRecentEmoji } from "./components/EmojiPicker";
import { formatMetaErrorMessage, ParsedMetaError } from "./utils/errorParser";

type Channel = "WA" | "IG" | "FB";

type Message = {
  id: string;
  text: string;
  attachments?: any[];
  time: string;
  timestamp?: number;
  isIncoming: boolean;
  isRead?: boolean;
  dir?: "rtl" | "ltr";
  senderName?: string;
  isEdited?: boolean;
  editedAt?: number;
  isDeleted?: boolean;
  deletedAt?: number;
  deletedBy?: string;
};

type Conversation = {
  id: string;
  name: string;
  phone: string;
  agent: string;
  channel: Channel;
  status: string;
  unreadCount?: number;
  windowLeft: string;
  pipeline: string | "direct";
  source:
  | {
    campaign: string;
    adset: string;
    ad: string;
  }
  | "direct";
  formAnswers?: {
    instrument?: string;
    studentAge?: string;
    followUpNote?: string;
    notes?: string;
  };
  lastMessageAt?: number;
  messages: Message[];
};

// Removed dummy data

import { useCRM, isLastMessageFromLead } from "./context/CRMContext";
import { useAuth, canAccessRoute } from "./components/AuthProvider";
import { formatLastMessageTime } from "./utils/time";
import MessageTemplate, { parseTemplateAttachment } from "./components/MessageTemplate";
import InstagramMedia from "./components/InstagramMedia";
import { VoiceNotePlayer } from "./components/VoiceNotePlayer";
import { matchLeadSearch } from "./utils/search";

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

const extractPhoneFromConversation = (conv?: any | null): string => {
  if (!conv) return "";
  if (isRealPhone(conv.phone)) return conv.phone;
  if (conv.formPhone && isRealPhone(conv.formPhone)) return `+${String(conv.formPhone).replace(/\D/g, "")}`;
  if (conv.formAnswers && isRealPhone((conv.formAnswers as any).phone)) {
    return (conv.formAnswers as any).phone;
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

const isTemplateAttachment = (att: any) =>
  Boolean(
    att && (
      att.type === "template" ||
      att.payload?.template_type ||
      Boolean(att.payload?.generic) ||
      Boolean(att.payload?.button) ||
      Boolean(att.payload?.elements) ||
      Boolean(att.elements) ||
      att.type === "fallback"
    )
  );

const PIPELINE_STAGES = [
  "New",
  "Contacted",
  "Qualified",
  "Audition Booked",
  "Attended",
  "Enrolled",
  "Joining Later",
  "Unqualified",
  "Lost",
] as const;

const PIPELINE_STAGE_COLORS: Record<string, string> = {
  "New": "#007AFF",
  "Contacted": "#5856D6",
  "Qualified": "#30B0C7",
  "Audition Booked": "#FF9500",
  "Attended": "#34C759",
  "Enrolled": "#30D158",
  "Joining Later": "#F59E0B",
  "Unqualified": "#8E8E93",
  "Lost": "#FF3B30",
};

type MobileView = "list" | "chat" | "details";
type DateFilterPreset = "ALL" | "TODAY" | "YESTERDAY" | "LAST_7D" | "CUSTOM";

function parseLocalDayBounds(isoDate: string): { start: number; end: number } | null {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [y, m, d] = isoDate.split("-").map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  const end = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return { start, end };
}

function formatShortIsoDate(isoDate: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return isoDate;
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const isConvUnassigned = (agent?: string | null): boolean => {
  if (!agent) return true;
  const a = agent.trim().toLowerCase();
  return a === "unassigned" || a === "";
};

export const isConvAssignedToUser = (agent?: string | null, userName?: string | null): boolean => {
  if (!agent || !userName) return false;
  return agent.trim().toLowerCase() === userName.trim().toLowerCase();
};

export const isUnassignedNewLead = (conv: any): boolean => {
  if (!isConvUnassigned(conv?.agent)) return false;
  if (conv?.status === "Resolved") return false;
  if (conv?.lastOutgoingAt && Number(conv.lastOutgoingAt) > 0) return false;
  if (conv?.lastMessageDirection === "outgoing") return false;
  if (Array.isArray(conv?.messages) && conv.messages.some((m: any) => !m.isIncoming)) return false;
  const pipe = (conv?.pipeline || "New").trim();
  if (pipe !== "New") return false;
  return true;
};

export default function InboxPage() {
  const [activeFilter, setActiveFilter] = useState("All");
  const [datePreset, setDatePreset] = useState<DateFilterPreset>("ALL");
  const [customDateFrom, setCustomDateFrom] = useState<string>("");
  const [customDateTo, setCustomDateTo] = useState<string>("");
  const [showDatePopover, setShowDatePopover] = useState(false);
  const datePopoverRef = useRef<HTMLDivElement | null>(null);
  const [mobileView, setMobileView] = useState<MobileView>("list");
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);
  const { isReadOnly, user, token } = useAuth();

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement | null>(null);

  const filters = ["All", "Mine", "Unassigned", "Open", "Resolved", "WA", "IG", "FB"];

  const {
    conversations,
    activeChatId,
    setActiveChatId,
    assignableAgents,
    patchConversation,
    refresh,
    searchQuery,
    setSearchQuery,
    deleteConversation,
    editMessage,
    unsendMessage,
    reactToMessage,
    addOptimisticMessages,
    finalizeOptimisticMessages,
  } = useCRM();

  // Periodic refresh every 30s to keep relative timestamps (e.g. "23m", "1 day ago") live
  const [, setTimeTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTimeTick((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  // Sync mobileView when navigated from another page (e.g. Pipeline, Leads, Follow-ups)
  const prevActiveChatId = useRef<string | null>(null);
  useEffect(() => {
    if (activeChatId && activeChatId !== prevActiveChatId.current) {
      prevActiveChatId.current = activeChatId;
      setMobileView("chat");
    }
  }, [activeChatId]);

  // Close date filter popover when clicking outside or pressing Escape
  useEffect(() => {
    if (!showDatePopover) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (datePopoverRef.current && !datePopoverRef.current.contains(e.target as Node)) {
        setShowDatePopover(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowDatePopover(false);
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showDatePopover]);

  // ── Pre-date filter conversations (tab filter + search query) for live preset badge counts ──
  const tabAndSearchFilteredConvs = useMemo(() => {
    return conversations.filter((conv) => {
      if (activeFilter === "Mine" && !isConvAssignedToUser(conv.agent, user?.name)) {
        return false;
      }
      if (activeFilter === "Unassigned" && !isConvUnassigned(conv.agent)) return false;
      if (activeFilter === "Open" && conv.status !== "Open") return false;
      if (activeFilter === "Resolved" && conv.status !== "Resolved") return false;
      if (activeFilter === "WA" && conv.channel !== "WA") return false;
      if (activeFilter === "IG" && conv.channel !== "IG" && conv.metaChannel !== "IG") return false;
      if (activeFilter === "FB" && conv.channel !== "FB" && conv.metaChannel !== "FB") return false;

      if (searchQuery.trim() && !matchLeadSearch(conv, searchQuery)) {
        return false;
      }
      return true;
    });
  }, [conversations, activeFilter, searchQuery, user?.name]);

  const dateBounds = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
    const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0).getTime();
    const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999).getTime();
    const last7dStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0).getTime();
    return { todayStart, todayEnd, yesterdayStart, yesterdayEnd, last7dStart };
  }, []);

  const datePresetCounts = useMemo(() => {
    let today = 0;
    let yesterday = 0;
    let last7d = 0;
    for (const c of tabAndSearchFilteredConvs) {
      const ts = c.lastMessageAt || 0;
      if (!ts) continue;
      if (ts >= dateBounds.todayStart && ts <= dateBounds.todayEnd) today++;
      if (ts >= dateBounds.yesterdayStart && ts <= dateBounds.yesterdayEnd) yesterday++;
      if (ts >= dateBounds.last7dStart && ts <= dateBounds.todayEnd) last7d++;
    }
    return {
      ALL: tabAndSearchFilteredConvs.length,
      TODAY: today,
      YESTERDAY: yesterday,
      LAST_7D: last7d,
    };
  }, [tabAndSearchFilteredConvs, dateBounds]);

  // ── Filter logic (memoized to avoid re-calculating on unrelated renders) ──
  const filteredConversations = useMemo(() => {
    if (datePreset === "ALL") return tabAndSearchFilteredConvs;

    let rangeStart: number | null = null;
    let rangeEnd: number | null = null;

    if (datePreset === "TODAY") {
      rangeStart = dateBounds.todayStart;
      rangeEnd = dateBounds.todayEnd;
    } else if (datePreset === "YESTERDAY") {
      rangeStart = dateBounds.yesterdayStart;
      rangeEnd = dateBounds.yesterdayEnd;
    } else if (datePreset === "LAST_7D") {
      rangeStart = dateBounds.last7dStart;
      rangeEnd = dateBounds.todayEnd;
    } else if (datePreset === "CUSTOM") {
      const fromBounds = customDateFrom ? parseLocalDayBounds(customDateFrom) : null;
      const toBounds = customDateTo ? parseLocalDayBounds(customDateTo) : null;
      if (fromBounds && toBounds) {
        rangeStart = Math.min(fromBounds.start, toBounds.start);
        rangeEnd = Math.max(fromBounds.end, toBounds.end);
      } else if (fromBounds) {
        rangeStart = fromBounds.start;
        rangeEnd = fromBounds.end;
      } else if (toBounds) {
        rangeStart = toBounds.start;
        rangeEnd = toBounds.end;
      } else {
        return tabAndSearchFilteredConvs;
      }
    }

    return tabAndSearchFilteredConvs.filter((conv) => {
      const ts = conv.lastMessageAt || 0;
      if (!ts) return false;
      if (rangeStart !== null && ts < rangeStart) return false;
      if (rangeEnd !== null && ts > rangeEnd) return false;
      return true;
    });
  }, [tabAndSearchFilteredConvs, datePreset, dateBounds, customDateFrom, customDateTo]);

  const isDateFiltered =
    datePreset !== "ALL" &&
    (datePreset !== "CUSTOM" || Boolean(customDateFrom || customDateTo));

  const dateFilterDisplayLabel = useMemo(() => {
    if (datePreset === "TODAY") return "Today";
    if (datePreset === "YESTERDAY") return "Yesterday";
    if (datePreset === "LAST_7D") return "Last 7 Days";
    if (datePreset === "CUSTOM") {
      if (customDateFrom && customDateTo && customDateFrom !== customDateTo) {
        return `${formatShortIsoDate(customDateFrom)} – ${formatShortIsoDate(customDateTo)}`;
      }
      if (customDateFrom) return formatShortIsoDate(customDateFrom);
      if (customDateTo) return formatShortIsoDate(customDateTo);
    }
    return "All Dates";
  }, [datePreset, customDateFrom, customDateTo]);

  const resetDateFilter = useCallback(() => {
    setDatePreset("ALL");
    setCustomDateFrom("");
    setCustomDateTo("");
  }, []);

  // Use activeChatId directly — memoized lookup
  const activeConv = useMemo(() => {
    return conversations.find((c) => c.id === activeChatId);
  }, [conversations, activeChatId]);

  // ── Assignment & Permission Logic ─────────────────────────────────
  const userClean = (user?.name || "").trim().toLowerCase();
  const agentClean = (activeConv?.agent || "").trim().toLowerCase();
  const isAssigned = !!agentClean && agentClean !== "unassigned";
  const isAssignedToMe = isAssigned && !!userClean && userClean === agentClean;
  const isChairman = user?.role === "chairman" || user?.role === "owner" || user?.role === "manager" || user?.role === "enrollment_director";
  const isAdmission = user?.role === "admission_officer" || user?.role === "agent";
  const isAssignedToOther = isAssigned && !isAssignedToMe;
  const canSendMessages = !isReadOnly;
  const canAssignToSelf = !isReadOnly && (isAdmission || isChairman) && (!isAssigned || isAssignedToMe);
  const canEditAgent = !isReadOnly && (isChairman || canAssignToSelf);
  const canViewTeamActivity = isChairman || canAccessRoute(user?.role, "/team-performance");

  // Audition booking modal state
  const [showAuditionModal, setShowAuditionModal] = useState(false);
  const [auditionDate, setAuditionDate] = useState("");
  const [auditionTime, setAuditionTime] = useState("05:00 PM");
  const [auditionNotes, setAuditionNotes] = useState("");
  const [auditionBranch, setAuditionBranch] = useState("");
  const { branchGroups } = useBranches();
  const [isBookingAudition, setIsBookingAudition] = useState(false);

  // Delivery error state for active chat
  const [sendError, setSendError] = useState<ParsedMetaError | null>(null);

  // WhatsApp Message Edit, Unsend & Reaction UI state
  const [editingMessage, setEditingMessage] = useState<{ id: string; text: string } | null>(null);
  const [unsendingMessage, setUnsendingMessage] = useState<{
    id: string;
    text: string;
    hasAttachments: boolean;
  } | null>(null);
  const [isUnsending, setIsUnsending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{
    id: string;
    text: string;
    senderName?: string;
    isIncoming?: boolean;
    attachments?: any[];
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

  // Scroll only the inner chat container so outer <main>/layout containers can never be scrolled
  const scrollChildIntoChatContainer = useCallback(
    (el: HTMLElement, block: "center" | "nearest", behavior: ScrollBehavior = "smooth") => {
      const container = chatScrollContainerRef.current;
      if (!container) return;
      const cRect = container.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      if (block === "nearest") {
        if (eRect.top >= cRect.top && eRect.bottom <= cRect.bottom) return;
        const delta = eRect.top < cRect.top ? eRect.top - cRect.top : eRect.bottom - cRect.bottom;
        container.scrollBy({ top: delta, behavior });
        return;
      }
      const delta = eRect.top - cRect.top - (cRect.height - eRect.height) / 2;
      container.scrollBy({ top: delta, behavior });
    },
    []
  );

  // Smooth-scroll viewport to referenced original message and flash highlight the message bubble (WhatsApp / Telegram style)
  const scrollToMessage = useCallback(
    (targetId: string) => {
      if (!targetId) return;
      const el = document.getElementById(`msg-${targetId}`);
      if (el) {
        scrollChildIntoChatContainer(el, "center", "smooth");
        const bubble = (el.querySelector("[data-msg-bubble]") || el) as HTMLElement;
        if (bubble) {
          bubble.classList.remove("msg-jump-highlight");
          void bubble.offsetWidth; // Force reflow to cleanly restart the animation if clicked repeatedly
          bubble.classList.add("msg-jump-highlight");
          setTimeout(() => {
            bubble.classList.remove("msg-jump-highlight");
          }, 1500);
        }
      }
    },
    [scrollChildIntoChatContainer]
  );

  // Compute clamped fixed coordinates so reaction bars & emoji pickers NEVER clip under the header or edges
  const computeReactionBarStyle = useCallback((anchorRect: DOMRect, isIncoming: boolean): React.CSSProperties => {
    const BAR_W = 284;
    const BAR_H = 46;
    const containerRect = chatScrollContainerRef.current?.getBoundingClientRect();
    const minTop = (containerRect ? containerRect.top : 64) + 8;
    const maxBottom = (containerRect ? containerRect.bottom : window.innerHeight - 70) - 8;
    const minLeft = (containerRect ? containerRect.left : 0) + 12;
    const maxRight = (containerRect ? containerRect.right : window.innerWidth) - 12;

    // Place above if there's enough room below the chat header; otherwise flip below the message!
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

  // Clear delivery error, reply context and active message menus when switching chats
  useEffect(() => {
    setSendError(null);
    setEditingMessage(null);
    setReplyingTo(null);
    setActiveReactionMenu(null);
    setFullEmojiMenu(null);
  }, [activeChatId]);

  // Dismiss quick reaction pill when clicking outside
  useEffect(() => {
    if (!activeReactionMenu) return;
    const handleClickOutside = () => {
      setActiveReactionMenu(null);
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [activeReactionMenu]);

  const handleOpenBookingModal = () => {
    if (!activeConv) return;
    const defaultDate = activeConv.followUpDate || new Date().toISOString().split("T")[0];
    const defaultNote = activeConv.followUpNote || "";
    const timeMatch = defaultNote.match(/\b(0?[1-9]|1[0-2]):[0-5][0-9]\s*(?:AM|PM|am|pm)\b/i);
    setAuditionDate(defaultDate);
    setAuditionTime(timeMatch ? timeMatch[0].toUpperCase() : "05:00 PM");
    setAuditionNotes(activeConv.formAnswers?.instrument || "");
    setAuditionBranch(activeConv.branch || "");
    setShowAuditionModal(true);
  };

  const handleConfirmBooking = async () => {
    if (!activeConv || isReadOnly || isBookingAudition) return;
    setIsBookingAudition(true);
    try {
      const formattedNote = `${auditionTime}${auditionNotes ? ` · ${auditionNotes}` : ""}`;
      await patchConversation(activeConv.id, {
        pipeline: "Audition Booked",
        auditionDate: auditionDate,
        followUpDate: auditionDate,
        followUpNote: formattedNote,
        branch: auditionBranch,
      });
      setShowAuditionModal(false);
    } catch (err) {
      console.error("Failed to book audition:", err);
    } finally {
      setIsBookingAudition(false);
    }
  };

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const container = chatScrollContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
  }, []);

  // Track previous message count to avoid unnecessary scroll-to-bottom on re-renders
  const prevMsgCountRef = useRef(0);
  useEffect(() => {
    if (activeChatId && activeConv?.messages) {
      const currentCount = activeConv.messages.length;
      if (currentCount !== prevMsgCountRef.current) {
        prevMsgCountRef.current = currentCount;
        scrollToBottom("auto");
      }
    }
  }, [activeChatId, activeConv?.messages?.length, scrollToBottom]);

  // Context-aware scroll anchor: preserves reading position for top messages, and keeps bottom in view
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
          // If the user was already watching the latest messages at the bottom, keep bottom in view
          scrollToBottom("smooth");
        } else {
          // If the user replied to an older message at the top/middle, anchor to THAT message so it never jumps
          const targetEl = document.getElementById(`msg-${replyingTo.id}`);
          if (targetEl) {
            scrollChildIntoChatContainer(targetEl, "nearest", "smooth");
          }
        }
      } else if (isNearBottomRef.current) {
        scrollToBottom("smooth");
      }
    }, 60);

    return () => clearTimeout(timer);
  }, [replyingTo, scrollToBottom, scrollChildIntoChatContainer]);

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

      // Auto-assign to staff on first reply to unassigned lead (optimistic 0ms update)
      if ((isAdmission || isChairman) && !isAssigned && user?.name) {
        patchConversation(chatId, { agent: user.name });
      }

      setSendError(null);
      setReplyingTo(null);

      // 0ms Synchronous Threaded Reply context resolution: ensure text, author and direction are 100% complete immediately
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

      // 1. Insert 0ms optimistic message(s) so photos/files/text appear in the thread immediately
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

        // Strip local blob previewUrl before sending JSON to server
        const serverAttachments = hasAttachments
          ? attachments!.map(({ previewUrl: _p, ...rest }) => rest)
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

      // Clear any accidental text selection caused by double clicking
      if (typeof window !== "undefined") {
        window.getSelection()?.removeAllRanges();
      }

      // Smooth micro-pulse for 0ms tactile visual feedback on the quoted bubble
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

  const handleSelectConv = (id: string) => {
    setActiveChatId(id);
    setMobileView("chat");
    setShowDetailsPanel(false);
  };

  const handleBackToList = () => {
    setMobileView("list");
  };

  return (
    <div
      className="flex h-full overflow-hidden"
      style={{ background: "var(--bg-page)", color: "var(--text-primary)" }}
    >
      {/* ── LEFT: Conversations List ── */}
      <div
        className={`
          flex flex-col h-full min-h-0 overflow-hidden
          w-full md:w-[300px] lg:w-[320px] shrink-0
          ${mobileView === "list" ? "flex" : "hidden md:flex"}
        `}
        style={{ background: "var(--bg-card)", borderRight: "1px solid var(--border-main)" }}
      >
        <div className="p-3.5 space-y-2.5" style={{ borderBottom: "1px solid var(--border-main)" }}>
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-[17px] font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
              Inbox
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--bg-pill)", color: "var(--text-secondary)" }}>
                {filteredConversations.length}
                {(searchQuery.trim() || isDateFiltered) && ` of ${conversations.length}`}
              </span>
            </h1>

            {/* Date Filter Popover */}
            <div className="relative inline-block" ref={datePopoverRef}>
              <button
                type="button"
                onClick={() => setShowDatePopover((prev) => !prev)}
                className="h-[22px] px-1.5 text-[10px] font-medium rounded-md flex items-center gap-1 transition-colors cursor-pointer select-none hover:opacity-90"
                style={{
                  background: isDateFiltered ? "rgba(0, 102, 255, 0.08)" : "var(--bg-pill)",
                  border: isDateFiltered ? "1px solid #0066FF" : "1px solid var(--border-input)",
                  color: isDateFiltered ? "#0066FF" : "var(--text-secondary)",
                }}
                title="Filter conversations by date"
              >
                <Calendar className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate max-w-[95px] font-semibold leading-none">
                  {dateFilterDisplayLabel}
                </span>
                {isDateFiltered && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      resetDateFilter();
                    }}
                    className="hover:text-red-500 font-bold text-[9px] leading-none"
                    title="Reset date filter"
                  >
                    ✕
                  </span>
                )}
                <ChevronDown
                  className={`w-2.5 h-2.5 opacity-70 transition-transform duration-150 shrink-0 ${
                    showDatePopover ? "rotate-180" : ""
                  }`}
                />
              </button>

              {showDatePopover && (
                <div
                  className="absolute right-0 top-[calc(100%+4px)] z-50 w-[235px] rounded-xl shadow-2xl p-2 flex flex-col gap-1.5 animate-in fade-in zoom-in-95 duration-150"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-main)",
                    backdropFilter: "blur(16px)",
                  }}
                >
                  {/* Quick Presets */}
                  <div className="flex flex-col gap-0.5">
                    {(
                      [
                        { id: "ALL", label: "All Dates", count: datePresetCounts.ALL },
                        { id: "TODAY", label: "Today", count: datePresetCounts.TODAY },
                        { id: "YESTERDAY", label: "Yesterday", count: datePresetCounts.YESTERDAY },
                        { id: "LAST_7D", label: "Last 7 Days", count: datePresetCounts.LAST_7D },
                      ] as const
                    ).map((preset) => {
                      const active = datePreset === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            setDatePreset(preset.id);
                            setCustomDateFrom("");
                            setCustomDateTo("");
                            setShowDatePopover(false);
                          }}
                          className={`w-full px-2.5 py-1.5 rounded-lg text-left text-[11px] font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                            active
                              ? "bg-[#0066FF] text-white"
                              : "hover:bg-[var(--bg-pill)] text-[var(--text-primary)]"
                          }`}
                        >
                          <span>{preset.label}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                              active
                                ? "bg-white/20 text-white"
                                : preset.count > 0
                                ? "text-[#0066FF] bg-[#0066FF]/10"
                                : "bg-[var(--bg-pill)] text-[var(--text-muted)]"
                            }`}
                          >
                            {preset.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom Date / Range */}
                  <div
                    className="pt-2 flex flex-col gap-2"
                    style={{ borderTop: "1px solid var(--border-main)" }}
                  >
                    <p
                      className="text-[10px] font-bold uppercase tracking-wider px-1"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Custom Date or Range
                    </p>
                    <div className="flex flex-col gap-1.5 px-1">
                      <div className="flex items-center justify-between gap-2">
                        <label
                          className="text-[11px] font-medium shrink-0 w-10"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          Date
                        </label>
                        <input
                          type="date"
                          value={customDateFrom}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCustomDateFrom(val);
                            if (val || customDateTo) {
                              setDatePreset("CUSTOM");
                            } else {
                              setDatePreset("ALL");
                            }
                          }}
                          className="flex-1 h-[28px] px-2 text-[11px] font-medium rounded-lg outline-none cursor-pointer"
                          style={{
                            background: "var(--bg-input)",
                            border: "1px solid var(--border-input)",
                            color: "var(--text-primary)",
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <label
                          className="text-[11px] font-medium shrink-0 w-10"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          To
                        </label>
                        <input
                          type="date"
                          value={customDateTo}
                          min={customDateFrom || undefined}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCustomDateTo(val);
                            if (val || customDateFrom) {
                              setDatePreset("CUSTOM");
                            } else {
                              setDatePreset("ALL");
                            }
                          }}
                          placeholder="Optional"
                          className="flex-1 h-[28px] px-2 text-[11px] font-medium rounded-lg outline-none cursor-pointer"
                          style={{
                            background: "var(--bg-input)",
                            border: "1px solid var(--border-input)",
                            color: "var(--text-primary)",
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {isDateFiltered && (
                    <div
                      className="pt-1.5 flex items-center justify-between px-1"
                      style={{ borderTop: "1px solid var(--border-main)" }}
                    >
                      <span
                        className="text-[10px] truncate max-w-[140px]"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Showing: <strong style={{ color: "var(--text-primary)" }}>{dateFilterDisplayLabel}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          resetDateFilter();
                          setShowDatePopover(false);
                        }}
                        className="text-[10px] font-bold text-[#0066FF] hover:underline cursor-pointer shrink-0 ml-2"
                      >
                        Reset
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-1.5">
            {filters.map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors ${
                  activeFilter === filter ? "bg-[#0066FF] text-white" : ""
                }`}
                style={activeFilter !== filter ? { background: "var(--bg-pill)", color: "var(--text-secondary)" } : undefined}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto relative">
          {filteredConversations.length === 0 ? (
            <div className="p-6 text-center">
              <div className="w-10 h-10 mx-auto mb-2 rounded-full flex items-center justify-center" style={{ background: "var(--bg-pill)" }}>
                <Search className="w-5 h-5 opacity-40" style={{ color: "var(--text-secondary)" }} />
              </div>
              <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                {searchQuery ? "No leads found" : "No conversations"}
              </p>
              <p className="text-[11px] mt-1 mb-3" style={{ color: "var(--text-secondary)" }}>
                {searchQuery
                  ? `No conversations match "${searchQuery}"`
                  : isDateFiltered
                  ? `No conversations in ${activeFilter} for ${dateFilterDisplayLabel}`
                  : `No conversations in ${activeFilter}`}
              </p>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-90 cursor-pointer"
                    style={{
                      background: "#0066FF",
                      color: "#ffffff",
                    }}
                  >
                    Clear search
                  </button>
                )}
                {isDateFiltered && (
                  <button
                    type="button"
                    onClick={resetDateFilter}
                    className="text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-90 cursor-pointer"
                    style={{
                      background: "var(--bg-pill)",
                      border: "1px solid var(--border-input)",
                      color: "var(--text-primary)",
                    }}
                  >
                    Reset date filter
                  </button>
                )}
              </div>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isActive = conv.id === activeChatId;
              const timeStr = formatLastMessageTime(conv.lastMessageAt);
              const showLeadTimer = Boolean(timeStr) && isLastMessageFromLead(conv);
              return (
                <div
                  key={conv.id}
                  onClick={() => handleSelectConv(conv.id)}
                  className="flex items-start justify-between p-3.5 cursor-pointer transition-colors"
                  style={{
                    borderBottom: "1px solid var(--border-main)",
                    background: isActive ? "var(--bg-selected)" : undefined,
                  }}
                >
                  <div className="min-w-0 pr-2 flex-1">
                    <h3 className="text-[13px] font-semibold leading-tight mb-0.5 truncate" style={{ color: "var(--text-primary)" }}>
                      {conv.name}
                    </h3>
                    <p className="text-[11px] truncate" style={{ color: isActive ? "#0066FF" : "var(--text-secondary)" }}>
                      {conv.leadName && conv.leadName !== conv.name
                        ? `${conv.leadName} · ${conv.agent}`
                        : conv.agent}
                    </p>
                  </div>
                  <div className="flex flex-col items-end justify-between shrink-0 self-stretch gap-1">
                    <span
                      className="text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded"
                      style={{
                        background: isActive ? "var(--bg-card)" : "var(--bg-pill)",
                        color: isActive ? "#0066FF" : "var(--text-secondary)",
                      }}
                    >
                      {conv.metaChannel ? `${conv.channel} · ${conv.metaChannel}` : conv.channel}
                    </span>
                    <div className="flex items-center gap-1.5 mt-auto">
                      {timeStr && (
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] whitespace-nowrap ${
                            showLeadTimer ? "font-bold" : "font-medium"
                          }`}
                          style={{
                            color: isActive ? "#0066FF" : "var(--text-muted)",
                            opacity: showLeadTimer ? 1 : isActive ? 0.9 : 0.85,
                          }}
                          title={showLeadTimer ? "Waiting for reply — last message from lead" : undefined}
                        >
                          {showLeadTimer && (
                            <Clock
                              className="w-3 h-3 shrink-0 stroke-[2.5]"
                              role="img"
                              aria-label="Waiting for reply — last message from lead"
                            />
                          )}
                          <span>{timeStr}</span>
                        </span>
                      )}
                      {Boolean(conv.unreadCount && conv.unreadCount > 0) && (
                        <span className="flex items-center justify-center min-w-[16px] h-[16px] px-1 bg-[#0066FF] text-white text-[9px] font-bold rounded-full">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── MIDDLE: Conversation Detail ── */}
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
        className={`
          relative flex-1 flex flex-col min-w-0 h-full min-h-0 overflow-hidden
          ${mobileView === "list" ? "hidden md:flex" : "flex"}
        `}
        style={{ background: "var(--bg-page)" }}
      >
        {/* Drag & Drop File Overlay */}
        {isDraggingOverChat && activeConv && (
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
        {activeConv ? (
          <>
            {/* Chat Header */}
            <div
              className="flex items-center justify-between px-4 md:px-6 py-3 gap-2 shrink-0"
              style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border-main)" }}
            >
              {/* Mobile back button */}
              <div className="flex items-center gap-2 min-w-0">
                <button
                  onClick={handleBackToList}
                  className="md:hidden p-1 -ml-1 shrink-0 rounded-md transition-colors"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="min-w-0">
                  <h2 className="text-[15px] font-bold truncate" style={{ color: "var(--text-primary)" }}>
                    {activeConv.name}
                    {activeConv.leadName && activeConv.leadName !== activeConv.name
                      ? ` · ${activeConv.leadName}`
                      : ""}
                  </h2>
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
                    {activeConv.channel === "WA" && (
                      <>
                        <span className="mx-1.5 shrink-0">•</span>
                        <span
                          className={`shrink-0 ${activeConv.windowLeft === "Closed" ? "text-[#FF9500]" : "text-[#34C759]"}`}
                        >
                          {activeConv.windowLeft === "Closed" ? "Window closed" : `${activeConv.windowLeft}`}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* 1-click Quick "Assign to me" button for unassigned leads */}
                {!isReadOnly && !isAssigned && (isAdmission || isChairman) && user?.name && (
                  <button
                    type="button"
                    onClick={() => patchConversation(activeConv.id, { agent: user.name })}
                    className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-semibold rounded-[6px] text-white bg-[#0066FF] hover:bg-[#0055D6] transition-colors cursor-pointer"
                    title="Assign this conversation to yourself"
                  >
                    Assign to me
                  </button>
                )}

                {/* Dropdowns — hidden on small mobile, shown on sm+ */}
                <div className="hidden sm:flex items-center gap-2">
                  <select
                    disabled={!canEditAgent}
                    title={
                      !canEditAgent
                        ? isAssignedToOther
                          ? `Assigned to ${activeConv.agent}. Only Chairman can reassign.`
                          : "Only Chairman or Admission can assign leads"
                        : undefined
                    }
                    value={activeConv.agent}
                    onChange={(e) => patchConversation(activeConv.id, { agent: e.target.value })}
                    className="rounded-[6px] text-[12px] py-1 px-2 outline-none disabled:opacity-60 disabled:cursor-not-allowed font-medium transition-colors"
                    style={{ border: "1px solid var(--border-input)", color: "var(--text-primary)", background: "var(--bg-input)" }}
                  >
                    {isChairman ? (
                      <>
                        <option value="Unassigned">Unassigned</option>
                        {activeConv.agent && activeConv.agent !== "Unassigned" && !assignableAgents.some(a => a.name === activeConv.agent) && (
                          <option value={activeConv.agent}>{activeConv.agent}</option>
                        )}
                        {assignableAgents.map(a => (
                          <option key={a.name} value={a.name}>{a.name}</option>
                        ))}
                      </>
                    ) : isAdmission ? (
                      <>
                        {!isAssigned ? (
                          <>
                            <option value="Unassigned">Unassigned</option>
                            {user?.name && <option value={user.name}>{user.name} (Assign to me)</option>}
                          </>
                        ) : isAssignedToMe ? (
                          <>
                            <option value={user?.name || activeConv.agent}>{user?.name || activeConv.agent}</option>
                            <option value="Unassigned">Unassigned</option>
                          </>
                        ) : (
                          <option value={activeConv.agent}>{activeConv.agent}</option>
                        )}
                      </>
                    ) : (
                      <option value={activeConv.agent || "Unassigned"}>{activeConv.agent || "Unassigned"}</option>
                    )}
                  </select>
                  <select
                    value={activeConv.status}
                    onChange={(e) => patchConversation(activeConv.id, { status: e.target.value })}
                    className="rounded-[6px] text-[12px] py-1 px-2 outline-none"
                    style={{ border: "1px solid var(--border-input)", color: "var(--text-primary)", background: "var(--bg-input)" }}
                  >
                    <option value="Open">Open</option>
                    <option value="Pending">Pending</option>
                    <option value="Resolved">Resolved</option>
                  </select>
                </div>
                {/* Details toggle button — mobile only */}
                <button
                  onClick={() => setShowDetailsPanel(true)}
                  className="lg:hidden p-1.5 rounded-md transition-colors"
                  style={{ color: "var(--text-secondary)", background: "var(--bg-pill)" }}
                  title="Contact details"
                >
                  <Info className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Chat Messages */}
            <div
              ref={chatScrollContainerRef}
              onScroll={handleChatScroll}
              className="flex-1 min-h-0 overflow-y-auto relative p-4 md:p-6 flex flex-col gap-4"
            >
              {activeConv.messages.length === 0 ? (
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
                      No messages in this conversation yet. Send a WhatsApp message below to start chatting with this lead.
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
              {(() => {
                const convPhone = extractPhoneFromConversation(activeConv);
                return activeConv.messages.map((msg) => {
                  const hasTemplateAttachment = (msg.attachments || []).some(isTemplateAttachment);
                  const hasSharedPostAttachment = (msg.attachments || []).some(
                    (a: any) => a.type === "ig_post" || a.type === "ig_reel" || a.type === "share"
                  );
                  const hasMediaAttachment = (msg.attachments || []).some((a: any) =>
                    ["image", "audio", "video", "file", "document", "ig_post", "ig_reel", "share"].includes(a.type)
                  );
                  const shouldRenderFallbackCard = !hasTemplateAttachment && !hasMediaAttachment && isPlaceholderText(msg.text);

                  let showPlainText = Boolean(msg.text && !isPlaceholderText(msg.text));
                  if (showPlainText && hasMediaAttachment && msg.attachments) {
                    const trimmedMsgText = msg.text.trim();
                    const matchesAttachmentFileName = msg.attachments.some(
                      (a: any) => a.fileName && a.fileName.trim() === trimmedMsgText
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

                  // Group reactions by emoji for the WhatsApp pill badge
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
                        // Ignore if user double-clicked inside the message bubble, buttons, links or menus
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
                        {/* Floating WhatsApp Quick Reaction Bar (👍 ❤️ 😂 😮 😢 🙏 +) — viewport-clamped so it NEVER clips under header */}
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
                              onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = "#0066FF";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = "var(--border-input)";
                              }}
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        )}

                        {/* Full Emoji Picker when "+" is clicked on a message reaction bar */}
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
                              : "max-w-[85%] md:max-w-[460px] lg:max-w-[540px] px-4 py-3"
                          } rounded-2xl transition-all ${
                            msg.isIncoming ? "rounded-tl-sm" : "rounded-tr-sm"
                          } ${isEditingThis ? "ring-2 ring-[#0066FF]" : ""}`}
                          style={{
                            background: msg.isIncoming ? "var(--bg-chat-incoming)" : "var(--bg-chat-outgoing)",
                            border: msg.isIncoming ? "1px solid var(--border-main)" : "none",
                            boxShadow: "var(--shadow-card)",
                          }}
                        >
                          {/* Threaded Quoted Message Card */}
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
                              ? (referencedMsg
                                  ? referencedMsg.senderName || activeConv.leadName || activeConv.profileName || activeConv.name || "Customer"
                                  : msg.replyTo.senderName || activeConv.leadName || activeConv.profileName || activeConv.name || "Customer")
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
                                  background: msg.isIncoming
                                    ? "rgba(0,0,0,0.06)"
                                    : "rgba(255,255,255,0.18)",
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
                                        ? (msg.isIncoming ? "#128C7E" : "var(--text-chat-outgoing)")
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
                                    color: msg.isIncoming
                                      ? "var(--text-chat-incoming)"
                                      : "var(--text-chat-outgoing)",
                                    opacity: 0.92,
                                  }}
                                  dir="auto"
                                >
                                  {quoteText}
                                </p>
                              </div>
                            );
                          })()}

                          {/* Deleted Message Placeholder (WhatsApp Unsend for Everyone) */}
                          {isDeletedMsg ? (
                            <p
                              className="text-[13px] md:text-[14px] italic flex items-center gap-1.5 select-none opacity-80"
                              style={{
                                color: msg.isIncoming
                                  ? "var(--text-secondary)"
                                  : "var(--text-chat-outgoing)",
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5 shrink-0 opacity-75" />
                              <span>This message was deleted</span>
                            </p>
                          ) : (
                            <>
                              {/* Media attachments (photos, files/documents, voice notes, video) */}
                              {msg.attachments && msg.attachments.length > 0 && (
                                <div className="flex flex-col gap-2 mb-1.5">
                                  {msg.attachments.map((att: any, idx: number) => {
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
                                              loading="lazy"
                                              onClick={() =>
                                                setLightboxImage({ url, fileName: fileName || "Photo.jpg" })
                                              }
                                              className="max-w-full rounded-xl max-h-72 object-cover cursor-zoom-in transition-transform duration-150 hover:scale-[1.01]"
                                            />
                                            <a
                                              href={downloadUrl}
                                              download={fileName || "Photo.jpg"}
                                              onClick={(e) => e.stopPropagation()}
                                              title="Download photo"
                                              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity shadow-sm"
                                            >
                                              <Download className="w-3.5 h-3.5" />
                                            </a>
                                          </div>
                                        );
                                      }
                                      return (
                                        <div
                                          key={idx}
                                          className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium border border-black/10 dark:border-white/10 ${
                                            msg.isIncoming
                                              ? "bg-[var(--bg-pill)] text-[var(--text-primary)]"
                                              : "bg-white/85 dark:bg-white/5 text-[var(--text-chat-outgoing)]"
                                          }`}
                                        >
                                          <ImageIcon className="w-4 h-4 shrink-0 opacity-80" />
                                          <span>Photo</span>
                                        </div>
                                      );
                                    }

                                    if (att.type === "file" || att.type === "document") {
                                      const displayFileName = fileName || "Document";
                                      const ext = displayFileName.includes(".")
                                        ? displayFileName.split(".").pop()?.toUpperCase().slice(0, 5) || "FILE"
                                        : "FILE";
                                      return (
                                        <div
                                          key={idx}
                                          className="flex items-center justify-between gap-3 p-2.5 rounded-xl border min-w-[210px] max-w-[320px] transition-colors"
                                          style={{
                                            background: msg.isIncoming ? "var(--bg-pill)" : "var(--file-card-bg)",
                                            borderColor: "var(--file-card-border)",
                                          }}
                                        >
                                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                            <div
                                              className="w-10 h-10 rounded-lg flex flex-col items-center justify-center shrink-0 border"
                                              style={{
                                                background: "var(--file-icon-bg)",
                                                borderColor: "var(--file-icon-border)",
                                                color: "var(--file-icon-color)",
                                              }}
                                            >
                                              <FileText className="w-4 h-4" />
                                              <span className="text-[8px] font-extrabold leading-none mt-0.5">
                                                {ext}
                                              </span>
                                            </div>
                                            <div className="min-w-0 flex-1">
                                              <p
                                                className="text-[12px] font-semibold truncate"
                                                style={{
                                                  color: msg.isIncoming
                                                    ? "var(--text-chat-incoming)"
                                                    : "var(--text-chat-outgoing)",
                                                }}
                                                title={displayFileName}
                                              >
                                                {displayFileName}
                                              </p>
                                              <p
                                                className="text-[10px] mt-0.5 opacity-80"
                                                style={{
                                                  color: msg.isIncoming
                                                    ? "var(--text-secondary)"
                                                    : "var(--text-chat-outgoing)",
                                                }}
                                              >
                                                {fileSizeStr ? `${ext} · ${fileSizeStr}` : `${ext} Document`}
                                              </p>
                                            </div>
                                          </div>

                                          {url && (
                                            <div className="flex items-center gap-1 shrink-0">
                                              <a
                                                href={url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title="Open file"
                                                className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/15 transition-colors"
                                                style={{
                                                  color: msg.isIncoming
                                                    ? "var(--text-primary)"
                                                    : "var(--text-chat-outgoing)",
                                                }}
                                              >
                                                <ExternalLink className="w-3.5 h-3.5" />
                                              </a>
                                              <a
                                                href={downloadUrl}
                                                download={displayFileName}
                                                title="Download file"
                                                className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/15 transition-colors"
                                                style={{
                                                  color: msg.isIncoming
                                                    ? "var(--text-primary)"
                                                    : "var(--text-chat-outgoing)",
                                                }}
                                              >
                                                <Download className="w-3.5 h-3.5" />
                                              </a>
                                            </div>
                                          )}
                                        </div>
                                      );
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
                                    if (att.type === "video" && url) {
                                      return (
                                        <video
                                          key={idx}
                                          controls
                                          playsInline
                                          preload="metadata"
                                          className="max-w-full rounded-xl max-h-64 my-1"
                                        >
                                          <source src={url} />
                                        </video>
                                      );
                                    }
                                    if (
                                      att.type === "ig_post" ||
                                      att.type === "ig_reel" ||
                                      att.type === "share"
                                    ) {
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
                                    return null;
                                  })}
                                </div>
                              )}

                              {/* Text content (e.g. form comments or lead message) */}
                              {showPlainText && (
                                <p
                                  className={`text-[14px] md:text-[15px] leading-relaxed whitespace-pre-wrap break-words ${
                                    hasTemplateAttachment || shouldRenderFallbackCard ? "mb-3" : ""
                                  } ${msg.dir === "rtl" ? "text-right" : "text-left"}`}
                                  style={{ color: msg.isIncoming ? "var(--text-chat-incoming)" : "var(--text-chat-outgoing)" }}
                                  dir={msg.dir}
                                >
                                  {activeConv.channel === "WA" ? renderWhatsAppText(msg.text) : msg.text}
                                </p>
                              )}

                              {/* Template card attachments */}
                              {hasTemplateAttachment && (
                                <div className="flex flex-col gap-2.5">
                                  {msg.attachments
                                    ?.filter(isTemplateAttachment)
                                    .map((att: any, idx: number) => (
                                      <MessageTemplate
                                        key={idx}
                                        attachment={att}
                                        isIncoming={msg.isIncoming}
                                        senderPhone={convPhone}
                                      />
                                    ))}
                                </div>
                              )}

                              {/* Graceful fallback card for legacy messages that stored placeholder text */}
                              {shouldRenderFallbackCard && (
                                <MessageTemplate
                                  attachment={{
                                    type: "template",
                                  }}
                                  isIncoming={msg.isIncoming}
                                  senderPhone={convPhone}
                                />
                              )}
                            </>
                          )}

                          {/* WhatsApp Message Footer: Sender · Edited · Time · Read Ticks */}
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
                            {isDeletedMsg && (() => {
                              const realDeletedBy =
                                msg.deletedBy && msg.deletedBy !== "Staff" ? msg.deletedBy : null;
                              const realSenderName =
                                msg.senderName && msg.senderName !== "Staff" ? msg.senderName : null;
                              const deletedByName =
                                realDeletedBy ||
                                (!msg.isIncoming
                                  ? realSenderName || user?.name || "Staff"
                                  : activeConv.leadName ||
                                    activeConv.profileName ||
                                    activeConv.name ||
                                    "Customer");
                              return (
                                <span className="italic font-medium opacity-90">
                                  Deleted by {deletedByName} ·
                                </span>
                              );
                            })()}
                            {!isDeletedMsg && msg.isEdited && (
                              <span className="italic opacity-90">Edited ·</span>
                            )}
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

                          {/* WhatsApp Reaction Pill Badges tucked at bottom edge of bubble */}
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

                        {/* Unified Hover Action Bar (Reply, Edit, Copy, React) */}
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
                          {/* Threaded Reply (WA, IG, FB) */}
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

                          {/* WhatsApp In-Place Message Edit (<15m) — Only on WhatsApp */}
                          {canEditThisMessage && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveReactionMenu(null);
                                setFullEmojiMenu(null);
                                setReplyingTo(null);
                                setEditingMessage({ id: msg.id, text: msg.text });
                              }}
                              title="Edit message"
                              className="p-1.5 rounded-full border border-transparent hover:border-[#0066FF] transition-colors cursor-pointer"
                              style={{ color: isEditingThis ? "#0066FF" : "var(--text-secondary)" }}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* WhatsApp Delete for Everyone (<48h) — Only on WhatsApp */}
                          {canUnsendThisMessage && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveReactionMenu(null);
                                setFullEmojiMenu(null);
                                setUnsendingMessage({
                                  id: msg.id,
                                  text: msg.text || "",
                                  hasAttachments: Boolean(msg.attachments && msg.attachments.length > 0),
                                });
                              }}
                              title="Delete for everyone"
                              className="p-1.5 rounded-full border border-transparent hover:border-red-500 hover:text-red-500 transition-colors cursor-pointer"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}

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
                              {copiedMsgId === msg.id ? (
                                <Check className="w-3.5 h-3.5" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
              <div ref={messagesEndRef} className="h-3 shrink-0" />
            </div>

            {/* Delivery error banner */}
            {sendError && (
              <div
                role="alert"
                className="mx-4 md:mx-6 mb-2 p-3 rounded-lg flex items-start justify-between gap-3 text-xs shrink-0"
                style={{
                  background: "rgba(239, 68, 68, 0.08)",
                  border: "1px solid rgba(239, 68, 68, 0.25)",
                  color: "var(--text-primary)",
                }}
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="font-semibold text-red-600 dark:text-red-400">
                      {sendError.title}
                    </p>
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

            {/* Chat Input Bar (isolated state for zero-latency typing & file/photo attachments) */}
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
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
              Select a conversation
            </p>
          </div>
        )}
      </div>

      {/* ── RIGHT: Details Panel ── */}
      {/* Desktop: always visible if a conv is active */}
      {activeConv && (
        <>
          {/* Mobile overlay backdrop */}
          {showDetailsPanel && (
            <div
              className="fixed inset-0 z-40 bg-black/40 lg:hidden"
              onClick={() => setShowDetailsPanel(false)}
            />
          )}

          <div
            className={`
              flex flex-col h-full overflow-y-auto p-5 shrink-0
              fixed lg:relative right-0 top-0 z-50
              w-[85vw] sm:w-[320px] lg:w-[300px]
              transform transition-transform duration-200 ease-in-out
              ${showDetailsPanel ? "translate-x-0" : "translate-x-full lg:translate-x-0"}
            `}
            style={{ background: "var(--bg-panel)", borderLeft: "1px solid var(--border-main)" }}
          >
            {/* Mobile close button */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex-1 min-w-0">
                {/* Editable name — agents can set real name when auto-fetch fails */}
                <input
                  key={activeConv.id + '-name'}
                  type="text"
                  defaultValue={activeConv.leadName || activeConv.profileName || activeConv.name}
                  placeholder="Enter customer name..."
                  disabled={isReadOnly}
                  className="w-full text-[16px] font-bold bg-transparent outline-none border-b border-transparent focus:border-[#0066FF] transition-colors pb-0.5 truncate disabled:opacity-80"
                  style={{ color: "var(--text-primary)" }}
                  onBlur={(e) => {
                    if (isReadOnly) return;
                    const newName = e.target.value.trim();
                    const currentDisplayName = activeConv.leadName || activeConv.profileName || activeConv.name;
                    if (newName && newName !== currentDisplayName) {
                      patchConversation(activeConv.id, { name: newName, leadName: newName });
                    }
                  }}
                />
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                  {activeConv.phone || activeConv.id}
                </p>
              </div>
              <button
                onClick={() => setShowDetailsPanel(false)}
                className="lg:hidden p-1.5 rounded-md"
                style={{ color: "var(--text-secondary)" }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[9px] font-bold tracking-widest text-[#0066FF] uppercase">Assigned to</h3>
                {isAssignedToMe && (
                  <span className="text-[10px] font-semibold text-[#34C759]">Assigned to you</span>
                )}
              </div>
              <div className="rounded-[6px] p-2.5 flex items-center justify-between gap-2" style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)" }}>
                <span className="text-[12px] font-medium truncate" style={{ color: "var(--text-primary)" }}>
                  {activeConv.agent || "Unassigned"}
                </span>
                {!isReadOnly && !isAssigned && (isAdmission || isChairman) && user?.name && (
                  <button
                    type="button"
                    onClick={() => patchConversation(activeConv.id, { agent: user.name })}
                    className="text-[11px] font-semibold text-[#0066FF] hover:underline cursor-pointer shrink-0"
                  >
                    Assign to me →
                  </button>
                )}
                {!isReadOnly && isAssignedToMe && isAdmission && (
                  <button
                    type="button"
                    onClick={() => patchConversation(activeConv.id, { agent: "Unassigned" })}
                    className="text-[11px] font-medium hover:underline cursor-pointer shrink-0"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Unassign
                  </button>
                )}
                {isAssigned && canViewTeamActivity && (
                  <Link
                    href={`/team-performance?agent=${encodeURIComponent(activeConv.agent)}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded text-[#0066FF] bg-[#0066FF]/10 hover:bg-[#0066FF]/20 transition-colors shrink-0 cursor-pointer"
                    title={`View ${activeConv.agent} in Team Activities`}
                  >
                    <span>View</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                )}
              </div>
            </div>

            <div className="mb-5">
              <h3 className="text-[9px] font-bold tracking-widest text-[#0066FF] uppercase mb-2">Source</h3>
              {typeof activeConv.source !== "object" || !activeConv.source ? (
                <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{String(activeConv.source || "Direct / unknown")}</p>
              ) : (
                <div className="rounded-[6px] p-2.5" style={{ background: "var(--bg-input)" }}>
                  <p className="text-[11px] font-bold mb-0.5" style={{ color: "var(--text-primary)" }}>
                    {activeConv.source.campaign || "Ad Campaign"}
                  </p>
                  <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
                    {activeConv.source.adset || "—"}
                  </p>
                  <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
                    {activeConv.source.ad || "—"}
                  </p>
                </div>
              )}
            </div>

            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[9px] font-bold tracking-widest text-[#0066FF] uppercase">Pipeline</h3>
                {activeConv.pipeline !== "direct" && (
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all"
                    style={{
                      backgroundColor: `${PIPELINE_STAGE_COLORS[activeConv.pipeline] || "#8E8E93"}18`,
                      color: PIPELINE_STAGE_COLORS[activeConv.pipeline] || "#8E8E93",
                      border: `1px solid ${PIPELINE_STAGE_COLORS[activeConv.pipeline] || "#8E8E93"}35`,
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        backgroundColor: PIPELINE_STAGE_COLORS[activeConv.pipeline] || "#8E8E93",
                      }}
                    />
                    {activeConv.pipeline}
                  </span>
                )}
              </div>
              {activeConv.pipeline === "direct" ? (
                <div className="rounded-[6px] p-2.5 space-y-1.5" style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)" }}>
                  <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    No lead record — this contact messaged directly.
                  </p>
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => patchConversation(activeConv.id, { pipeline: "New" })}
                      className="text-[11px] font-semibold text-[#0066FF] hover:underline cursor-pointer flex items-center gap-1"
                    >
                      + Add to pipeline
                    </button>
                  )}
                </div>
              ) : (
                <select
                  disabled={isReadOnly}
                  value={activeConv.pipeline}
                  onChange={(e) => patchConversation(activeConv.id, { pipeline: e.target.value })}
                  className="w-full rounded-[6px] text-[12px] py-1.5 px-2 outline-none disabled:opacity-60 cursor-pointer font-medium transition-colors"
                  style={{
                    border: "1px solid var(--border-input)",
                    background: "var(--bg-input)",
                    color: "var(--text-primary)",
                  }}
                >
                  {PIPELINE_STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                  {!PIPELINE_STAGES.includes(activeConv.pipeline as any) && (
                    <option value={activeConv.pipeline}>{activeConv.pipeline}</option>
                  )}
                </select>
              )}
            </div>

            <div className="mb-5">
              <h3 className="text-[9px] font-bold tracking-widest text-[#0066FF] uppercase mb-2">Audition</h3>
              {(activeConv.pipeline === "Audition Booked" || activeConv.auditionDate || (activeConv.auditionOutcome && activeConv.auditionOutcome !== "joining-later")) ? (
                <div
                  className="p-3 rounded-lg border mb-2"
                  style={{
                    background: 'var(--bg-pill)',
                    borderColor: 'var(--border-input)',
                  }}
                >
                  <div className="flex items-center justify-between mb-1.5 gap-2">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: '#0066FF' }} />
                      <select
                        disabled={isReadOnly}
                        value={activeConv.auditionOutcome || ''}
                        onChange={(e) => patchConversation(activeConv.id, { auditionOutcome: e.target.value })}
                        className="text-[11px] font-bold rounded px-1.5 py-0.5 outline-none cursor-pointer border transition-colors flex-1 min-w-0"
                        style={{
                          borderColor: 'var(--border-input)',
                          background: 'var(--bg-input)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <option value="">Audition Booked</option>
                        <option value="schedule-followup">Schedule Follow up</option>
                        <option value="registered">Registered</option>
                        <option value="paid-trial">Paid Trial</option>
                        <option value="joining-later">Joining Later</option>
                        <option value="no-show">No Show</option>
                      </select>
                    </div>
                    <Link
                      href={`/auditions?date=${activeConv.auditionDate || activeConv.followUpDate || ''}&id=${activeConv.id}`}
                      className="text-[10px] font-semibold text-[#0066FF] hover:underline flex items-center gap-0.5 shrink-0"
                    >
                      <Calendar className="w-3 h-3" /> Calendar →
                    </Link>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {(activeConv.auditionDate || activeConv.followUpDate) && (
                      <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                        {activeConv.auditionDate || activeConv.followUpDate}
                      </span>
                    )}
                    {activeConv.branch && (
                      <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
                        · {activeConv.branch}
                      </span>
                    )}
                  </div>
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={handleOpenBookingModal}
                      className="mt-1.5 text-[10px] font-semibold text-[#0066FF] hover:underline cursor-pointer block text-left"
                    >
                      {activeConv.auditionDate ? "Reschedule" : "Book audition"}
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-[11px] mb-2" style={{ color: "var(--text-secondary)" }}>No booking yet.</p>
                  <button
                    type="button"
                    disabled={isReadOnly}
                    onClick={handleOpenBookingModal}
                    className="w-full bg-[#0066FF] text-white font-semibold text-[12px] py-2 rounded-[6px] hover:bg-[#0055d4] transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    Book audition
                  </button>
                </>
              )}
            </div>

            <div className="mb-5">
              <h3 className="text-[9px] font-bold tracking-widest text-[#0066FF] uppercase mb-2">Form Answers</h3>
              <div className="mb-2">
                <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>full name</p>
                <p className="text-[11px] font-medium" style={{ color: "var(--text-primary)" }}>{activeConv.profileName || activeConv.name}</p>
              </div>
              {activeConv.formAnswers?.instrument && (
                <div className="mb-2">
                  <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>instrument</p>
                  <p className="text-[11px] font-medium" style={{ color: "var(--text-primary)" }}>{activeConv.formAnswers.instrument}</p>
                </div>
              )}
              {activeConv.formAnswers?.studentAge && (
                <div>
                  <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>student age</p>
                  <p className="text-[11px] font-medium" style={{ color: "var(--text-primary)" }}>{activeConv.formAnswers.studentAge}</p>
                </div>
              )}
            </div>

            {/* Follow-up */}
            {(() => {
              const isJoiningLater = activeConv.pipeline === 'Joining Later' || activeConv.auditionOutcome === 'joining-later';
              const tags = activeConv.followUpTags || [];
              const isPaymentPending = tags.includes('payment-pending');
              const isTrialSession = tags.includes('trial-session');
              const hasFollowUp = Boolean(activeConv.followUpDate || activeConv.followUpNote || isJoiningLater || isPaymentPending || isTrialSession);

              const handleToggleJoiningLater = () => {
                if (isReadOnly) return;
                if (isJoiningLater) {
                  // Revert Joining Later outcome & pipeline stage back to regular follow-up
                  const nextPipeline =
                    activeConv.pipeline === 'Joining Later'
                      ? (activeConv.auditionDate ? 'Audition Booked' : 'Contacted')
                      : activeConv.pipeline;
                  patchConversation(activeConv.id, {
                    auditionOutcome: '',
                    pipeline: nextPipeline,
                  });
                } else {
                  // Turn ON Joining Later with smart defaults (+14 days) and move to Joining Later pipeline stage
                  const d = new Date();
                  d.setDate(d.getDate() + 14);
                  const y = d.getFullYear();
                  const m = String(d.getMonth() + 1).padStart(2, '0');
                  const day = String(d.getDate()).padStart(2, '0');
                  const defaultDate = `${y}-${m}-${day}`;

                  const updates: Record<string, any> = {
                    pipeline: 'Joining Later',
                    auditionOutcome: 'joining-later',
                    followUpCompleted: false,
                  };
                  if (!activeConv.followUpDate) {
                    updates.followUpDate = defaultDate;
                  }
                  if (!activeConv.followUpNote || !activeConv.followUpNote.trim()) {
                    updates.followUpNote = 'Joining Later - Follow up';
                  }
                  patchConversation(activeConv.id, updates);
                }
              };

              const handleToggleTag = (tag: string, defaultNote: string) => {
                if (isReadOnly) return;
                const currentTags = activeConv.followUpTags || [];
                const hasTag = currentTags.includes(tag);
                const newTags = hasTag
                  ? currentTags.filter((t: string) => t !== tag)
                  : [...currentTags, tag];

                const updates: Record<string, any> = {
                  followUpTags: newTags,
                  followUpCompleted: false,
                };

                // When turning ON a tag (payment-pending or trial-session):
                // User requirement: make it schedule in audition options as Schedule follow up
                if (!hasTag) {
                  updates.auditionOutcome = 'schedule-followup';

                  if (!activeConv.followUpDate) {
                    const d = new Date();
                    d.setDate(d.getDate() + 3);
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    updates.followUpDate = `${y}-${m}-${day}`;
                  }
                  if (!activeConv.auditionDate) {
                    updates.auditionDate = updates.followUpDate || activeConv.followUpDate;
                  }
                  if (!activeConv.followUpNote || !activeConv.followUpNote.trim()) {
                    updates.followUpNote = defaultNote;
                  }
                } else {
                  // When turning OFF, if no follow-up tags remain and auditionOutcome was schedule-followup, reset it
                  const remainingTags = newTags;
                  if (!remainingTags.includes('payment-pending') && !remainingTags.includes('trial-session')) {
                    if (activeConv.auditionOutcome === 'schedule-followup') {
                      updates.auditionOutcome = '';
                    }
                  }
                }

                patchConversation(activeConv.id, updates);
              };

              const handleClearFollowUp = () => {
                if (isReadOnly) return;
                const nextPipeline =
                  activeConv.pipeline === 'Joining Later'
                    ? (activeConv.auditionDate ? 'Audition Booked' : 'Contacted')
                    : activeConv.pipeline;
                patchConversation(activeConv.id, {
                  followUpDate: '',
                  followUpNote: '',
                  followUpCompleted: false,
                  followUpCompletedAt: null,
                  followUpTags: [],
                  pipeline: nextPipeline,
                  auditionOutcome: (isJoiningLater || activeConv.auditionOutcome === 'schedule-followup') ? '' : activeConv.auditionOutcome,
                });
              };

              return (
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="text-[9px] font-bold tracking-widest text-[#0066FF] uppercase">Follow-up</h3>
                      {isJoiningLater && (
                        <span
                          className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                          style={{
                            background: 'var(--bg-pill)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--border-main)',
                          }}
                        >
                          Joining Later
                        </span>
                      )}
                      {isPaymentPending && (
                        <span
                          className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                          style={{
                            background: 'rgba(239,68,68,0.08)',
                            color: '#EF4444',
                            border: '1px solid rgba(239,68,68,0.2)',
                          }}
                        >
                          Payment Pending
                        </span>
                      )}
                      {isTrialSession && (
                        <span
                          className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                          style={{
                            background: 'rgba(139,92,246,0.08)',
                            color: '#8B5CF6',
                            border: '1px solid rgba(139,92,246,0.2)',
                          }}
                        >
                          Trial Session
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {activeConv.followUpCompleted && (
                        <span
                          className="text-[9px] font-medium px-2 py-0.5 rounded-full"
                          style={{ background: 'var(--bg-pill)', color: 'var(--text-muted)', border: '1px solid var(--border-main)' }}
                        >
                          Ended
                        </span>
                      )}
                      <Link
                        href="/follow-ups"
                        className="text-[10px] font-semibold text-[#0066FF] hover:underline flex items-center gap-0.5"
                      >
                        Follow-ups →
                      </Link>
                      {hasFollowUp && !isReadOnly && (
                        <button
                          type="button"
                          title="Clear follow-up"
                          onClick={handleClearFollowUp}
                          className="text-gray-400 hover:text-red-500 transition-colors p-0.5 cursor-pointer ml-0.5"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <input
                      key={`fn-${activeConv.id}-${activeConv.followUpNote || ''}-${activeConv.auditionOutcome || ''}-${(activeConv.followUpTags || []).join(',')}`}
                      type="text"
                      defaultValue={activeConv.followUpNote || ""}
                      placeholder={isJoiningLater ? "e.g. Joining in summer" : isPaymentPending ? "e.g. Waiting for transfer" : isTrialSession ? "e.g. Trial on Saturday" : "e.g. Call back about Sunday"}
                      className={`flex-1 min-w-0 rounded-[6px] text-[11px] py-1.5 px-2 outline-none placeholder-gray-400 transition-colors ${
                        activeConv.followUpCompleted ? 'line-through' : ''
                      }`}
                      style={{
                        border: "1px solid var(--border-input)",
                        background: "var(--bg-input)",
                        color: activeConv.followUpCompleted ? "var(--text-muted)" : "var(--text-primary)"
                      }}
                      onBlur={(e) => {
                        const val = e.target.value.trim();
                        if (val !== (activeConv.followUpNote || '')) {
                          patchConversation(activeConv.id, { followUpNote: val, followUpCompleted: false });
                        }
                      }}
                    />
                  </div>
                  {/* Tag checkboxes row */}
                  <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                    <label
                      className="flex items-center gap-1.5 shrink-0 cursor-pointer select-none py-1.5 px-2 rounded-[6px] border transition-colors h-[29px]"
                      style={{
                        background: isJoiningLater ? 'rgba(245,158,11,0.06)' : 'var(--bg-input)',
                        borderColor: isJoiningLater ? 'rgba(245,158,11,0.25)' : 'var(--border-input)',
                      }}
                      title="Mark as joining later"
                    >
                      <input
                        type="checkbox"
                        checked={isJoiningLater}
                        disabled={isReadOnly}
                        onChange={handleToggleJoiningLater}
                        className="w-3.5 h-3.5 rounded cursor-pointer accent-[#F59E0B]"
                      />
                      <span
                        className="text-[10px] font-medium whitespace-nowrap"
                        style={{
                          color: isJoiningLater ? '#F59E0B' : 'var(--text-secondary)',
                        }}
                      >
                        Joining later
                      </span>
                    </label>
                    <label
                      className="flex items-center gap-1.5 shrink-0 cursor-pointer select-none py-1.5 px-2 rounded-[6px] border transition-colors h-[29px]"
                      style={{
                        background: isPaymentPending ? 'rgba(239,68,68,0.06)' : 'var(--bg-input)',
                        borderColor: isPaymentPending ? 'rgba(239,68,68,0.25)' : 'var(--border-input)',
                      }}
                      title="Mark as payment pending"
                    >
                      <input
                        type="checkbox"
                        checked={isPaymentPending}
                        disabled={isReadOnly}
                        onChange={() => handleToggleTag('payment-pending', 'Payment Pending - Follow up')}
                        className="w-3.5 h-3.5 rounded cursor-pointer accent-[#EF4444]"
                      />
                      <span
                        className="text-[10px] font-medium whitespace-nowrap"
                        style={{
                          color: isPaymentPending ? '#EF4444' : 'var(--text-secondary)',
                        }}
                      >
                        Payment pending
                      </span>
                    </label>
                    <label
                      className="flex items-center gap-1.5 shrink-0 cursor-pointer select-none py-1.5 px-2 rounded-[6px] border transition-colors h-[29px]"
                      style={{
                        background: isTrialSession ? 'rgba(139,92,246,0.06)' : 'var(--bg-input)',
                        borderColor: isTrialSession ? 'rgba(139,92,246,0.25)' : 'var(--border-input)',
                      }}
                      title="Mark as trial session"
                    >
                      <input
                        type="checkbox"
                        checked={isTrialSession}
                        disabled={isReadOnly}
                        onChange={() => handleToggleTag('trial-session', 'Trial Session - Follow up')}
                        className="w-3.5 h-3.5 rounded cursor-pointer accent-[#8B5CF6]"
                      />
                      <span
                        className="text-[10px] font-medium whitespace-nowrap"
                        style={{
                          color: isTrialSession ? '#8B5CF6' : 'var(--text-secondary)',
                        }}
                      >
                        Trial session
                      </span>
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <input
                      key={`fd-${activeConv.id}-${activeConv.followUpDate || ''}-${activeConv.auditionOutcome || ''}-${(activeConv.followUpTags || []).join(',')}`}
                      type="date"
                      defaultValue={activeConv.followUpDate || ""}
                      className={`flex-1 rounded-[6px] px-2 py-1.5 text-[11px] outline-none cursor-pointer transition-colors ${
                        activeConv.followUpCompleted ? 'line-through' : ''
                      }`}
                      style={{
                        border: "1px solid var(--border-input)",
                        background: "var(--bg-input)",
                        color: activeConv.followUpCompleted ? "var(--text-muted)" : "var(--text-primary)"
                      }}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val !== (activeConv.followUpDate || '')) {
                          patchConversation(activeConv.id, { followUpDate: val, followUpCompleted: false });
                        }
                      }}
                    />
                  </div>
                </div>
              );
            })()}

            <div>
              <h3 className="text-[9px] font-bold tracking-widest text-[#0066FF] uppercase mb-2">Notes</h3>
              <textarea
                rows={3}
                key={`notes-${activeConv.id}-${activeConv.notes || ''}`}
                defaultValue={activeConv.notes || ""}
                placeholder="Instrument, age, follow-up promises..."
                className="w-full rounded-[6px] text-[11px] p-2 outline-none placeholder-gray-400 resize-y"
                style={{ border: "1px solid var(--border-input)", background: "var(--bg-input)", color: "var(--text-primary)" }}
                onBlur={(e) => patchConversation(activeConv.id, { notes: e.target.value })}
              />
            </div>

            <div className="mt-8 text-[9px]" style={{ color: "var(--text-muted)" }}>
              Conversation cv-{activeConv.name.toLowerCase()}
            </div>
          </div>
        </>
      )}

      {/* Full-Screen Photo Lightbox Modal */}
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

      {/* Book Audition Modal */}
      {showAuditionModal && activeConv && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
          onClick={() => !isBookingAudition && setShowAuditionModal(false)}
        >
          <div
            className="w-full max-w-[420px] rounded-2xl p-6 shadow-2xl relative border animate-in fade-in zoom-in-95 duration-150 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
            style={{
              background: 'var(--bg-card)',
              borderColor: 'var(--border-main)',
              color: 'var(--text-primary)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#0066FF]">
                  Auditions Calendar
                </p>
                <h3 className="text-[16px] font-bold mt-0.5" style={{ color: 'var(--text-primary)' }}>
                  Book Audition for {activeConv.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAuditionModal(false)}
                className="p-1.5 rounded-lg transition-colors hover:opacity-70 cursor-pointer"
                style={{ color: 'var(--text-secondary)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-3.5">
              <div>
                <label className="text-[12px] font-bold mb-1 block" style={{ color: 'var(--text-primary)' }}>
                  Branch *
                </label>
                <BranchSelect
                  value={auditionBranch}
                  onChange={setAuditionBranch}
                  branchGroups={branchGroups}
                />
              </div>

              <div>
                <label className="text-[12px] font-semibold mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                  Audition Date *
                </label>
                <input
                  type="date"
                  value={auditionDate}
                  onChange={(e) => setAuditionDate(e.target.value)}
                  className="w-full h-[38px] px-3 text-[13px] rounded-xl outline-none cursor-pointer"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label className="text-[12px] font-semibold mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                  Audition Time *
                </label>
                <select
                  value={auditionTime}
                  onChange={(e) => setAuditionTime(e.target.value)}
                  className="w-full h-[38px] px-3 text-[13px] rounded-xl outline-none cursor-pointer"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}
                >
                  {[
                    "02:00 PM", "02:30 PM", "03:00 PM", "03:30 PM",
                    "04:00 PM", "04:30 PM", "05:00 PM", "05:30 PM",
                    "06:00 PM", "06:30 PM", "07:00 PM", "07:30 PM",
                    "08:00 PM", "08:30 PM", "09:00 PM"
                  ].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[12px] font-semibold mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                  Instrument / Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Piano, Violin, Vocal"
                  value={auditionNotes}
                  onChange={(e) => setAuditionNotes(e.target.value)}
                  className="w-full h-[38px] px-3 text-[13px] rounded-xl outline-none"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                disabled={isBookingAudition || !auditionDate || !auditionBranch}
                onClick={handleConfirmBooking}
                className="flex-1 h-[40px] text-[13px] font-semibold text-white rounded-xl cursor-pointer hover:bg-[#0055d4] transition-colors disabled:opacity-50"
                style={{ background: '#0066FF' }}
              >
                {isBookingAudition ? "Booking..." : "Confirm Audition Booking"}
              </button>
              <button
                type="button"
                onClick={() => setShowAuditionModal(false)}
                className="h-[40px] px-5 text-[13px] font-medium rounded-xl cursor-pointer hover:opacity-80 transition-colors"
                style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)', color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Message Confirmation Modal (WhatsApp) ── */}
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
                  This will delete the message for everyone in the WhatsApp chat. A &ldquo;This message was deleted&rdquo; notice will remain in the conversation history.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUnsendingMessage(null)}
                className="p-1.5 rounded-lg transition-colors hover:opacity-70 cursor-pointer shrink-0"
                style={{ color: "var(--text-secondary)" }}
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {(unsendingMessage.text || unsendingMessage.hasAttachments) && (
              <div
                className="px-3.5 py-2.5 rounded-xl text-[13px] line-clamp-3 break-words"
                style={{
                  background: "var(--bg-pill)",
                  border: "1px solid var(--border-main)",
                  color: "var(--text-primary)",
                }}
                dir="auto"
              >
                {unsendingMessage.text || "Attachment"}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setUnsendingMessage(null)}
                className="h-[36px] px-4 text-[12px] font-medium rounded-xl cursor-pointer hover:opacity-80 transition-colors"
                style={{
                  background: "var(--bg-pill)",
                  border: "1px solid var(--border-input)",
                  color: "var(--text-secondary)",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isUnsending}
                onClick={handleConfirmUnsendMessage}
                className="h-[36px] px-4 text-[12px] font-semibold text-white rounded-xl cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50"
                style={{ background: "#EF4444" }}
              >
                {isUnsending ? "Deleting..." : "Delete for everyone"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
