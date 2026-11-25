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
  ChevronRight,
  Archive,
  Loader2,
  RotateCcw,
  Users,
  Tag,
} from "lucide-react";
import { useBranches } from "../lib/branches";
import { BranchSelect } from "./BranchSelect";
import { ChatInputBar, OutgoingAttachmentPayload, formatFileSize } from "./ChatInputBar";
import { DraftMessageBubble } from "./DraftMessageBubble";
import { GroupInfoPanel } from "./GroupInfoPanel";
import {
  type ChatTimelineDraft,
  type ComposerAgentId,
  resolveChatDraftState,
} from "../utils/composerAgent";
import { renderWhatsAppText } from "../utils/messageFormatting";
import type { GroupParticipant, MessageMention } from "../utils/groupMentions";
import { EmojiPicker, WHATSAPP_QUICK_REACTIONS, recordRecentEmoji } from "./EmojiPicker";
import { formatMetaErrorMessage, ParsedMetaError } from "../utils/errorParser";
import EditableLeadName from "./EditableLeadName";
import { InboxBucketActions, type InboxBucketAction } from "./InboxBucketActions";
import { ConversationAvatar } from "./ConversationAvatar";
import { InboxConversationCard } from "./InboxConversationCard";
import { getConversationAvatarUrl } from "../utils/conversationAvatar";
import {
  buildBatchConversationExportFilename,
  buildConversationExportFilename,
  formatCombinedConversationsTranscript,
  formatConversationTranscript,
  triggerConversationsZipDownload,
  triggerTextFileDownload,
  type BatchExportFormat,
  type ExportConversationInput,
} from "../utils/conversationExport";
import LeadLabelsSection from "./LeadLabelsSection";
import LeadCashInSection from "./LeadCashInSection";
import PipelineStageSection from "./PipelineStageSection";
import {
  buildLeadNamePatchUpdates,
  getEditableLeadDisplayName,
  hasAgentEditedLeadName,
} from "../utils/leadName";
import {
  buildAuditionBookingPatch,
  buildBookingModalDefaults,
  extractExplicitAuditionTime,
  getAuditionTimeSelectOptions,
  syncAuditionSlotCacheOnUpdate,
} from "../utils/auditionSchedule";
import {
  buildConfirmedReplyMessages,
  getWhatsAppGhostDisplayMode,
  isMediaAttachmentLike,
  isPlaceholderMessageText,
  isTemplateAttachmentLike,
  shouldRenderLegacyTemplateFallback,
} from "../utils/conversationMessages";
import {
  getInboxFilters,
  getSavedConversationCount,
  type InboxFilter,
  type InboxMode,
  isConvUnassigned,
  isConversationArchived,
  isConversationDone,
  matchesInboxFilter,
  getInboxBucketCounts,
  getFilterBucketTotal,
  getGroupConversationCount,
  getUnreadConversationCount,
  isGroupConversation,
  buildMarkAsDonePatch,
  buildReopenDonePatch,
  buildArchivePatch,
  buildUnarchivePatch,
} from "../utils/inboxFilters";

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

import { useCRM, isLastMessageFromLead, type Conversation as CRMConversation } from "../context/CRMContext";
import {
  useAuth,
  normalizeRole,
  canAccessRoute,
  isDirectorOrChairmanRole,
  isAdmissionRole,
  isOperationRole,
  isInboxViewOnlyRole,
  canDownloadChatRole,
} from "./AuthProvider";
import {
  buildChatDateDividerLabels,
  formatChatMessageTooltip,
  formatLastMessageTime,
} from "../utils/time";
import { ChatDateDivider } from "./ChatDateDivider";
import MessageTemplate, { parseTemplateAttachment } from "./MessageTemplate";
import InstagramMedia from "./InstagramMedia";
import { VoiceNotePlayer } from "./VoiceNotePlayer";
import { buildLabelNameMap, matchLeadSearch } from "../utils/search";
import {
  filterLeadLabels,
  getLabelConversationCounts,
  getLabelFilterDisplayText,
  getLeadLabelCssVars,
  matchesLabelFilter,
  toggleLeadLabelId,
} from "../utils/leadLabels";

const isRealPhone = (p?: string): boolean => {
  if (!p) return false;
  const s = p.trim().toLowerCase();
  if (s.startsWith("live ") || s === "live") return false;
  const digits = p.replace(/[^\d]/g, "");
  return digits.length >= 7;
};

const extractPhoneFromConversation = (conv?: any | null): string => {
  if (!conv) return "";
  if (conv.isGroup || /^(?:op_)?grp_/i.test(String(conv.id || conv.senderId || ""))) return "";
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

const isUnassignedNewLead = (conv: any): boolean => {
  if (!isConvUnassigned(conv?.agent)) return false;
  if (conv?.status === "Resolved") return false;
  if (conv?.lastOutgoingAt && Number(conv.lastOutgoingAt) > 0) return false;
  if (conv?.lastMessageDirection === "outgoing") return false;
  if (Array.isArray(conv?.messages) && conv.messages.some((m: any) => !m.isIncoming)) return false;
  const pipe = (conv?.pipeline || "New").trim();
  if (pipe !== "New") return false;
  return true;
};

type InboxToastState = {
  type: "success" | "error";
  message: string;
  onUndo?: () => void;
};

export interface InboxWorkspaceProps {
  inboxMode?: InboxMode;
}

export default function InboxWorkspace({ inboxMode = "admissions" }: InboxWorkspaceProps) {
  const isOperationInbox = inboxMode === "operation";
  const [activeFilter, setActiveFilter] = useState<InboxFilter>("All");
  const [datePreset, setDatePreset] = useState<DateFilterPreset>("ALL");
  const [customDateFrom, setCustomDateFrom] = useState<string>("");
  const [customDateTo, setCustomDateTo] = useState<string>("");
  const [showDatePopover, setShowDatePopover] = useState(false);
  const datePopoverRef = useRef<HTMLDivElement | null>(null);
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [showLabelPopover, setShowLabelPopover] = useState(false);
  const [labelFilterSearch, setLabelFilterSearch] = useState("");
  const labelPopoverRef = useRef<HTMLDivElement | null>(null);
  const [mobileView, setMobileView] = useState<MobileView>("list");
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);
  const [inboxToast, setInboxToast] = useState<InboxToastState | null>(null);
  const [downloadingConvId, setDownloadingConvId] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<BatchExportFormat>("txt");
  const [isBatchDownloading, setIsBatchDownloading] = useState(false);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [confirmClearSaved, setConfirmClearSaved] = useState(false);
  const [syncingGroupHistory, setSyncingGroupHistory] = useState(false);
  const [isLoadingParticipants, setIsLoadingParticipants] = useState(false);
  const [showGroupHistorySync, setShowGroupHistorySync] = useState(false);
  const [groupInfoModalState, setGroupInfoModalState] = useState<{
    open: boolean;
    initialMember?: GroupParticipant | null;
  }>({ open: false, initialMember: null });
  const [groupHistoryNotice, setGroupHistoryNotice] = useState<{
    convId: string;
    type: "success" | "error";
    message: string;
  } | null>(null);
  const { isReadOnly: isGlobalReadOnly, user, token, authFetch } = useAuth();
  const isEnrollmentDirector = !isOperationInbox && normalizeRole(user?.role) === "enrollment_director";
  const isReadOnly = isGlobalReadOnly || isInboxViewOnlyRole(user?.role);
  const canDownloadChat = canDownloadChatRole(user?.role);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement | null>(null);

  const filters = useMemo(
    () => getInboxFilters(inboxMode, canDownloadChat),
    [inboxMode, canDownloadChat]
  );

  const {
    admissionsConversations,
    operationConversations,
    labels,
    activeChatId,
    setActiveChatId,
    assignableAgents,
    operationAssignableAgents,
    patchConversation,
    bulkUpdateSavedForAgent,
    fetchConversationsForBatchExport,
    markConversationAsRead,
    createManualLead,
    refresh,
    searchQuery,
    setSearchQuery,
    deleteConversation,
    editMessage,
    unsendMessage,
    reactToMessage,
    addOptimisticMessages,
    finalizeOptimisticMessages,
    fetchGroupParticipants,
    fetchGroupMemberProfile,
    fetchGroupMemberAvatars,
    fetchConversationAvatar,
    queueConversationAvatars,
    openGroupMemberChat,
    updateConversationClaude,
  } = useCRM();

  const conversations = isOperationInbox ? operationConversations : admissionsConversations;
  const effectiveAssignableAgents = isOperationInbox ? operationAssignableAgents : assignableAgents;
  const [failedAvatarUrls, setFailedAvatarUrls] = useState<Record<string, boolean>>({});
  const headerAvatarFetchRef = useRef<Set<string>>(new Set());
  const convListScrollRef = useRef<HTMLDivElement | null>(null);
  const avatarObserverRef = useRef<IntersectionObserver | null>(null);
  const observedAvatarNodesRef = useRef<Map<string, HTMLElement>>(new Map());

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

  // Close label filter popover when clicking outside or pressing Escape
  useEffect(() => {
    if (!showLabelPopover) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (labelPopoverRef.current && !labelPopoverRef.current.contains(e.target as Node)) {
        setShowLabelPopover(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowLabelPopover(false);
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showLabelPopover]);

  // Listen for CRMContext patch error toasts and auto-dismiss Inbox toasts
  useEffect(() => {
    const handleToastEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: string; message?: string }>).detail;
      if (!detail?.message) return;
      setInboxToast({
        type: detail.type === "error" ? "error" : "success",
        message: detail.message,
      });
    };
    window.addEventListener("crm:toast", handleToastEvent);
    return () => window.removeEventListener("crm:toast", handleToastEvent);
  }, []);

  useEffect(() => {
    if (!inboxToast) return;
    const timer = window.setTimeout(() => setInboxToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [inboxToast]);

  const bucketCounts = useMemo(() => getInboxBucketCounts(conversations), [conversations]);
  const groupCount = useMemo(
    () => (isOperationInbox ? getGroupConversationCount(conversations) : 0),
    [isOperationInbox, conversations]
  );
  const unreadConvCount = useMemo(
    () => (isOperationInbox ? getUnreadConversationCount(conversations) : 0),
    [isOperationInbox, conversations]
  );
  const savedConvCount = useMemo(
    () => (canDownloadChat ? getSavedConversationCount(conversations) : 0),
    [canDownloadChat, conversations]
  );
  const activeBucketTotal = useMemo(
    () =>
      activeFilter === "Groups"
        ? groupCount
        : getFilterBucketTotal(bucketCounts, activeFilter, savedConvCount),
    [bucketCounts, activeFilter, groupCount, savedConvCount]
  );

  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);
  const labelNameMap = useMemo(() => buildLabelNameMap(labels), [labels]);
  const effectiveSelectedLabelIds = useMemo(
    () => selectedLabelIds.filter((id) => labelMap.has(id)),
    [selectedLabelIds, labelMap]
  );
  const selectedLabelObjects = useMemo(
    () =>
      effectiveSelectedLabelIds
        .map((id) => labelMap.get(id))
        .filter((l): l is NonNullable<typeof l> => Boolean(l)),
    [effectiveSelectedLabelIds, labelMap]
  );
  const isLabelFiltered = effectiveSelectedLabelIds.length > 0;
  const labelFilterDisplayText = useMemo(
    () => getLabelFilterDisplayText(selectedLabelObjects),
    [selectedLabelObjects]
  );
  const filteredLabelOptions = useMemo(
    () => filterLeadLabels(labels, labelFilterSearch),
    [labels, labelFilterSearch]
  );
  const resetLabelFilter = useCallback(() => {
    setSelectedLabelIds([]);
    setLabelFilterSearch("");
  }, []);

  // ── Pre-date filter conversations (tab filter + search query) for live preset badge counts ──
  const tabAndSearchFilteredConvs = useMemo(() => {
    return conversations.filter((conv) => {
      if (!matchesInboxFilter(conv, activeFilter, user?.name)) {
        return false;
      }

      if (searchQuery.trim() && !matchLeadSearch(conv, searchQuery, labelNameMap)) {
        return false;
      }
      return true;
    });
  }, [conversations, activeFilter, searchQuery, user?.name, labelNameMap]);

  const labelFilterCounts = useMemo(
    () => getLabelConversationCounts(tabAndSearchFilteredConvs, labels),
    [tabAndSearchFilteredConvs, labels]
  );

  const crossBucketSearchCounts = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return { done: 0, archived: 0 };
    let done = 0;
    let archived = 0;
    for (const conv of conversations) {
      if (!matchLeadSearch(conv, q, labelNameMap)) continue;
      if (isConversationArchived(conv)) archived += 1;
      else if (isConversationDone(conv)) done += 1;
    }
    return { done, archived };
  }, [conversations, searchQuery, labelNameMap]);

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
    const base =
      effectiveSelectedLabelIds.length === 0
        ? tabAndSearchFilteredConvs
        : tabAndSearchFilteredConvs.filter((conv) =>
            matchesLabelFilter(conv.labels, effectiveSelectedLabelIds)
          );

    if (datePreset === "ALL") return base;

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
        return base;
      }
    }

    return base.filter((conv) => {
      const ts = conv.lastMessageAt || 0;
      if (!ts) return false;
      if (rangeStart !== null && ts < rangeStart) return false;
      if (rangeEnd !== null && ts > rangeEnd) return false;
      return true;
    });
  }, [tabAndSearchFilteredConvs, effectiveSelectedLabelIds, datePreset, dateBounds, customDateFrom, customDateTo]);

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

  const rawHeaderAvatarUrl = getConversationAvatarUrl(activeConv);
  const isHeaderAvatarFailed = Boolean(rawHeaderAvatarUrl && failedAvatarUrls[rawHeaderAvatarUrl]);

  const handleAvatarImageError = useCallback(
    (convId: string, failedUrl: string) => {
      if (failedUrl) {
        setFailedAvatarUrls((prev) => (prev[failedUrl] ? prev : { ...prev, [failedUrl]: true }));
      }
      queueConversationAvatars([convId], { force: true });
    },
    [queueConversationAvatars]
  );

  // Eagerly resolve the top visible cards on mount, filter changes, or search updates
  useEffect(() => {
    const topMissingIds: string[] = [];
    const limit = Math.min(filteredConversations.length, 16);
    for (let i = 0; i < limit; i += 1) {
      const conv = filteredConversations[i];
      if (!getConversationAvatarUrl(conv)) {
        topMissingIds.push(conv.id);
      }
    }
    if (topMissingIds.length > 0) {
      queueConversationAvatars(topMissingIds);
    }
  }, [filteredConversations, queueConversationAvatars]);

  // Shared IntersectionObserver for cards scrolled into view
  useEffect(() => {
    const rootEl = convListScrollRef.current;
    if (!rootEl || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleIds: string[] = [];
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const convId = (entry.target as HTMLElement).dataset.convAvatarId;
          if (convId) {
            visibleIds.push(convId);
            observer.unobserve(entry.target);
          }
        }
        if (visibleIds.length > 0) {
          queueConversationAvatars(visibleIds);
        }
      },
      { root: rootEl, rootMargin: "220px 0px", threshold: 0.01 }
    );

    avatarObserverRef.current = observer;
    for (const node of observedAvatarNodesRef.current.values()) {
      observer.observe(node);
    }

    return () => {
      observer.disconnect();
      if (avatarObserverRef.current === observer) {
        avatarObserverRef.current = null;
      }
    };
  }, [queueConversationAvatars]);

  const registerAvatarObserver = useCallback(
    (convId: string, el: HTMLElement | null, needsAvatar: boolean) => {
      const prevEl = observedAvatarNodesRef.current.get(convId);
      if (prevEl && prevEl !== el) {
        avatarObserverRef.current?.unobserve(prevEl);
        observedAvatarNodesRef.current.delete(convId);
      }
      if (el && needsAvatar) {
        observedAvatarNodesRef.current.set(convId, el);
        avatarObserverRef.current?.observe(el);
      } else if (prevEl && !needsAvatar) {
        avatarObserverRef.current?.unobserve(prevEl);
        observedAvatarNodesRef.current.delete(convId);
      }
    },
    []
  );

  useEffect(() => {
    if (!activeConv) return;
    if (getConversationAvatarUrl(activeConv)) return;
    if (headerAvatarFetchRef.current.has(activeConv.id)) return;
    headerAvatarFetchRef.current.add(activeConv.id);
    if (activeConv.isGroup && activeConv.channel === "WA") {
      fetchGroupParticipants(activeConv.id).catch(() => {});
    } else if (!activeConv.isGroup) {
      fetchConversationAvatar(activeConv.id).catch(() => {});
    }
  }, [activeConv, fetchGroupParticipants, fetchConversationAvatar]);

  // ── Assignment & Permission Logic ─────────────────────────────────
  const userClean = (user?.name || "").trim().toLowerCase();
  const agentClean = (activeConv?.agent || "").trim().toLowerCase();
  const isAssigned = !!agentClean && agentClean !== "unassigned";
  const isAssignedToMe = isAssigned && !!userClean && userClean === agentClean;
  const isChairman = isDirectorOrChairmanRole(user?.role);
  const isAdmission = isAdmissionRole(user?.role);
  const isOperation = isOperationRole(user?.role);
  const canHandleAssignment = isOperationInbox
    ? isOperation || isChairman
    : isAdmission || isChairman;
  const isAssignedToOther = isAssigned && !isAssignedToMe;
  const canSendMessages = !isReadOnly;
  const canAssignToSelf = !isReadOnly && canHandleAssignment && (!isAssigned || isAssignedToMe);
  const canEditAgent = !isReadOnly && (isChairman || canAssignToSelf);
  const canViewTeamActivity = isChairman || canAccessRoute(user?.role, "/team-performance");

  // New Operation WhatsApp chat modal state
  const [showNewOpChatModal, setShowNewOpChatModal] = useState(false);
  const [opChatPhone, setOpChatPhone] = useState("");
  const [opChatName, setOpChatName] = useState("");
  const [opChatBranch, setOpChatBranch] = useState("");
  const [opChatAgent, setOpChatAgent] = useState("Unassigned");
  const [opChatNotes, setOpChatNotes] = useState("");
  const [opChatError, setOpChatError] = useState<string | null>(null);
  const [opChatCreating, setOpChatCreating] = useState(false);

  // Audition booking modal state
  const [showAuditionModal, setShowAuditionModal] = useState(false);
  const [auditionDate, setAuditionDate] = useState("");
  const [auditionTime, setAuditionTime] = useState("05:00 PM");
  const [auditionNotes, setAuditionNotes] = useState("");
  const [auditionBranch, setAuditionBranch] = useState("");
  const { branchGroups } = useBranches();
  const [isBookingAudition, setIsBookingAudition] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // Delivery error state for active chat
  const [sendError, setSendError] = useState<ParsedMetaError | null>(null);

  // WhatsApp Message Edit, Unsend & Reaction UI state
  const [editingMessage, setEditingMessage] = useState<{
    id: string;
    text: string;
    mentions?: MessageMention[];
    mentionAll?: boolean;
  } | null>(null);
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
  const [localTimelineDraft, setLocalTimelineDraft] = useState<ChatTimelineDraft | null>(null);
  const [dismissedServerDraft, setDismissedServerDraft] = useState<{
    chatId: string;
    text: string;
  } | null>(null);
  const [agentGenerating, setAgentGenerating] = useState<ComposerAgentId | null>(null);
  const [isSendingTimelineDraft, setIsSendingTimelineDraft] = useState(false);
  const [agentRewriteRequest, setAgentRewriteRequest] = useState<{
    id: number;
    agent: ComposerAgentId;
  } | null>(null);

  const isStrictChairman = normalizeRole(user?.role) === "chairman";
  const activeTimelineDraft = useMemo(() => {
    if (!activeConv || !isStrictChairman || activeConv.isGroup || isOperationInbox) {
      return null;
    }
    return resolveChatDraftState({
      chatId: activeConv.id,
      localDraft: localTimelineDraft,
      serverDraftText: activeConv.claudeDraftText,
      dismissedServerDraft,
    });
  }, [activeConv, dismissedServerDraft, isOperationInbox, isStrictChairman, localTimelineDraft]);

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
    setShowGroupHistorySync(false);
    setGroupInfoModalState({ open: false, initialMember: null });
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

  useEffect(() => {
    if (!showAuditionModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isBookingAudition) {
        setShowAuditionModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showAuditionModal, isBookingAudition]);

  const handleOpenBookingModal = () => {
    if (!activeConv) return;
    const defaults = buildBookingModalDefaults(activeConv);
    setAuditionDate(defaults.date);
    setAuditionTime(defaults.time);
    setAuditionNotes(defaults.notes);
    setAuditionBranch(defaults.branch);
    setBookingError(null);
    setShowAuditionModal(true);
  };

  const handleConfirmBooking = async () => {
    if (!activeConv || isReadOnly || isBookingAudition) return;
    setIsBookingAudition(true);
    setBookingError(null);
    try {
      const bookingPatch = buildAuditionBookingPatch(activeConv, {
        date: auditionDate,
        time: auditionTime,
        notes: auditionNotes,
        branch: auditionBranch,
      });
      const res = await patchConversation(activeConv.id, bookingPatch);
      if (!res.ok) {
        setBookingError(res.error || "Could not save audition schedule. Please try again.");
        return;
      }
      syncAuditionSlotCacheOnUpdate(activeConv.id, {
        auditionDate: bookingPatch.auditionDate,
        clearStatusOverride: true,
        clearClosedSlot: true,
      });
      setShowAuditionModal(false);
    } catch (err) {
      console.error("Failed to book audition:", err);
      setBookingError("Could not save audition schedule. Please try again.");
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

  const prevTimelineDraftSigRef = useRef<string>("");
  useEffect(() => {
    const sig = activeTimelineDraft ? `${activeTimelineDraft.chatId}:${activeTimelineDraft.text}` : "";
    if (!sig || sig === prevTimelineDraftSigRef.current) {
      prevTimelineDraftSigRef.current = sig;
      return;
    }
    prevTimelineDraftSigRef.current = sig;
    const t = setTimeout(() => {
      scrollToBottom("smooth");
    }, 40);
    return () => clearTimeout(t);
  }, [activeTimelineDraft, scrollToBottom]);

  const handleRefreshParticipants = useCallback(async () => {
    if (!activeConv || !activeConv.isGroup || activeConv.channel !== "WA") return;
    setIsLoadingParticipants(true);
    try {
      await fetchGroupParticipants(activeConv.id, { forceRefresh: true });
    } finally {
      setIsLoadingParticipants(false);
    }
  }, [activeConv, fetchGroupParticipants]);

  const handleOpenGroupInfo = useCallback(
    (initialMember: GroupParticipant | null = null) => {
      if (!activeConv || !activeConv.isGroup || activeConv.channel !== "WA") return;
      setGroupInfoModalState({ open: true, initialMember });
      setShowDetailsPanel(true);
      if (!activeConv.groupParticipants || activeConv.groupParticipants.length === 0) {
        handleRefreshParticipants();
      }
    },
    [activeConv, handleRefreshParticipants]
  );

  const handleSelectMemberConversation = useCallback(
    (targetConvId: string) => {
      if (!targetConvId) return;
      if (activeFilter === "Groups") {
        setActiveFilter("All");
      }
      setGroupInfoModalState({ open: false, initialMember: null });
      setActiveChatId(targetConvId);
      setMobileView("chat");
      setShowDetailsPanel(false);
      if (isOperationInbox) {
        markConversationAsRead(targetConvId);
      }
    },
    [activeFilter, setActiveChatId, isOperationInbox, markConversationAsRead]
  );

  const handleSendReply = useCallback(
    async (
      textToSend: string,
      attachments?: OutgoingAttachmentPayload[],
      replyTo?: { id: string; text: string; senderName?: string; isIncoming?: boolean },
      mentionPayload?: { mentions?: MessageMention[]; mentionAll?: boolean }
    ): Promise<boolean> => {
      const hasText = Boolean(textToSend && textToSend.trim());
      const hasAttachments = Boolean(attachments && attachments.length > 0);
      if (isReadOnly || (!hasText && !hasAttachments) || !activeConv || !canSendMessages) return false;

      const chatId = activeConv.id;

      // Auto-assign to staff on first reply to unassigned conversation (optimistic 0ms update)
      if (canHandleAssignment && !isAssigned && user?.name) {
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
            mentions: idx === 0 ? mentionPayload?.mentions : undefined,
            mentionAll: idx === 0 ? Boolean(mentionPayload?.mentionAll) : undefined,
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
            mentions: mentionPayload?.mentions,
            mentionAll: Boolean(mentionPayload?.mentionAll),
            replyTo: resolvedReplyTo || undefined,
          },
        ]);
      }

      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };

        // Strip local blob previewUrl before sending JSON to server
        const serverAttachments = hasAttachments
          ? attachments!.map(({ previewUrl: _p, ...rest }) => rest)
          : undefined;

        const res = await authFetch(`/api/messages/${chatId}/reply`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            text: textToSend,
            channel: activeConv.channel,
            attachments: serverAttachments,
            replyTo: resolvedReplyTo || undefined,
            mentions: mentionPayload?.mentions,
            mentionAll: Boolean(mentionPayload?.mentionAll),
          }),
        });
        if (res.ok) {
          const json = await res.json().catch(() => null);
          const confirmedList = buildConfirmedReplyMessages(
            json,
            textToSend,
            user?.name,
            resolvedReplyTo
          );
          finalizeOptimisticMessages(chatId, tempIds, confirmedList);
          refresh();
          return true;
        } else {
          finalizeOptimisticMessages(chatId, tempIds);
          const data = await res.json().catch(() => null);
          const parsed = formatMetaErrorMessage(data || { error: `Request failed (HTTP ${res.status})` });
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
      authFetch,
      refresh,
      addOptimisticMessages,
      finalizeOptimisticMessages,
    ]
  );

  const handleSendTimelineDraft = useCallback(
    async (draftTextToSend: string) => {
      if (!activeConv || !draftTextToSend.trim() || isSendingTimelineDraft) return;
      const targetChatId = activeConv.id;
      const prevLocal = localTimelineDraft;
      const prevServerDraft = activeConv.claudeDraftText || "";
      const draftAgent = activeTimelineDraft?.agent || "admissions";

      setIsSendingTimelineDraft(true);
      if (prevServerDraft) {
        setDismissedServerDraft({ chatId: targetChatId, text: prevServerDraft });
      }
      setLocalTimelineDraft(null);

      const ok = await handleSendReply(draftTextToSend);
      setIsSendingTimelineDraft(false);

      if (ok) {
        if (prevServerDraft) {
          void updateConversationClaude(targetChatId, { clearDraft: true });
        }
      } else {
        setDismissedServerDraft(null);
        setLocalTimelineDraft(
          prevLocal && prevLocal.chatId === targetChatId
            ? prevLocal
            : { chatId: targetChatId, agent: draftAgent, text: draftTextToSend }
        );
      }
    },
    [
      activeConv,
      activeTimelineDraft?.agent,
      handleSendReply,
      isSendingTimelineDraft,
      localTimelineDraft,
      updateConversationClaude,
    ]
  );

  const handleDiscardTimelineDraft = useCallback(() => {
    if (!activeConv) return;
    const targetChatId = activeConv.id;
    setLocalTimelineDraft(null);
    if (activeConv.claudeDraftText) {
      setDismissedServerDraft({ chatId: targetChatId, text: activeConv.claudeDraftText });
      void updateConversationClaude(targetChatId, { clearDraft: true });
    }
  }, [activeConv, updateConversationClaude]);

  const handleSaveEditMessage = useCallback(
    async (
      messageId: string,
      newText: string,
      mentionPayload?: { mentions?: MessageMention[]; mentionAll?: boolean }
    ): Promise<boolean> => {
      if (!activeConv || isReadOnly) return false;
      setEditingMessage(null);
      setSendError(null);
      const res = await editMessage(activeConv.id, messageId, newText, mentionPayload);
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

  const handleSelectConv = useCallback(
    (id: string) => {
      setActiveChatId(id);
      setMobileView("chat");
      setShowDetailsPanel(false);
      if (isOperationInbox) {
        markConversationAsRead(id);
      }
    },
    [setActiveChatId, isOperationInbox, markConversationAsRead]
  );

  const handleBackToList = () => {
    setMobileView("list");
  };

  const bucketCtxRef = useRef({ conversations, activeChatId, activeFilter });
  useEffect(() => {
    bucketCtxRef.current = { conversations, activeChatId, activeFilter };
  }, [conversations, activeChatId, activeFilter]);

  const applyInboxBucketChange = useCallback(
    (
      convId: string,
      action: InboxBucketAction
    ) => {
      if (isReadOnly) return;
      const { conversations: currConvs, activeChatId: currActiveId, activeFilter: currFilter } =
        bucketCtxRef.current;
      const target = currConvs.find((c) => c.id === convId);
      if (!target) return;

      const prevState = {
        isArchived: Boolean(target.isArchived),
        archivedAt: target.archivedAt || null,
        archivedBy: target.archivedBy || "",
        isDone: Boolean(target.isDone),
        doneAt: target.doneAt || null,
        doneBy: target.doneBy || "",
      };

      const updates =
        action === "done"
          ? buildMarkAsDonePatch(user?.name)
          : action === "reopen"
          ? buildReopenDonePatch()
          : action === "archive"
          ? buildArchivePatch(user?.name)
          : buildUnarchivePatch();

      const nextSimulated = { ...target, ...updates };
      if (
        currActiveId === convId &&
        !matchesInboxFilter(nextSimulated, currFilter, user?.name)
      ) {
        setActiveChatId(null);
        setShowDetailsPanel(false);
        setMobileView("list");
      }

      patchConversation(convId, updates);

      const displayLabel = target.leadName || target.name || "Conversation";
      const toastMsg =
        action === "done"
          ? `${displayLabel} marked as done`
          : action === "reopen"
          ? `${displayLabel} moved back to Inbox`
          : action === "archive"
          ? `${displayLabel} archived`
          : `${displayLabel} unarchived`;

      setInboxToast({
        type: "success",
        message: toastMsg,
        onUndo: () => {
          patchConversation(convId, prevState);
          setInboxToast(null);
        },
      });
    },
    [isReadOnly, user?.name, setActiveChatId, patchConversation]
  );

  const handleDownloadConversation = useCallback(
    async (targetConv: CRMConversation) => {
      if (!canDownloadChat || !targetConv || downloadingConvId === targetConv.id) return;

      let exportTarget: ExportConversationInput = targetConv;
      const hasLoadedMessages =
        Array.isArray(targetConv.messages) && targetConv.messages.length > 0;

      if (!hasLoadedMessages) {
        setDownloadingConvId(targetConv.id);
        try {
          const encodedId = encodeURIComponent(targetConv.id);
          let res = await authFetch(`/api/messages/${encodedId}`, {
            cache: "no-store",
          }).catch(() => null);
          if (!res || (!res.ok && res.status !== 401 && res.status !== 403)) {
            res = await authFetch(
              `https://api.tchaikovskyschool.com/crm-api/messages/${encodedId}`,
              { cache: "no-store" }
            ).catch(() => null);
          }
          if (!res || !res.ok) {
            throw new Error("Could not load conversation messages.");
          }
          const json = await res.json().catch(() => null);
          if (!json?.success || !json?.data) {
            throw new Error("Could not load conversation messages.");
          }
          const remoteData = json.data as Record<string, unknown>;
          exportTarget = {
            ...(remoteData as ExportConversationInput),
            ...targetConv,
            messages: Array.isArray(remoteData.messages)
              ? (remoteData.messages as ExportConversationInput["messages"])
              : targetConv.messages,
          };
        } catch {
          setInboxToast({
            type: "error",
            message: "Could not download conversation. Please try again.",
          });
          setDownloadingConvId((prev) => (prev === targetConv.id ? null : prev));
          return;
        }
        setDownloadingConvId((prev) => (prev === targetConv.id ? null : prev));
      }

      const transcript = formatConversationTranscript(exportTarget, {
        labels,
        inboxMode,
        origin: typeof window !== "undefined" ? window.location.origin : "",
      });
      const filename = buildConversationExportFilename(exportTarget);
      triggerTextFileDownload(filename, transcript);

      const displayLabel = targetConv.leadName || targetConv.name || "Conversation";
      setInboxToast({
        type: "success",
        message: `Downloaded conversation for ${displayLabel}`,
      });
    },
    [authFetch, canDownloadChat, downloadingConvId, inboxMode, labels]
  );

  const handleToggleSavedSingle = useCallback(
    async (targetConv: CRMConversation) => {
      if (!canDownloadChat || isReadOnly || !targetConv) return;
      const nextSaved = !Boolean(targetConv.savedForAgent);
      const displayLabel = targetConv.leadName || targetConv.name || "Conversation";
      const res = await patchConversation(targetConv.id, { savedForAgent: nextSaved });
      if (!res.ok) {
        setInboxToast({
          type: "error",
          message: res.error || "Could not update saved state.",
        });
        return;
      }
      setInboxToast({
        type: "success",
        message: nextSaved
          ? `Saved "${displayLabel}" for Agent download`
          : `Removed "${displayLabel}" from Saved`,
        onUndo: () => {
          void patchConversation(targetConv.id, { savedForAgent: !nextSaved });
          setInboxToast(null);
        },
      });
    },
    [canDownloadChat, isReadOnly, patchConversation]
  );

  const handleClearAllSaved = useCallback(async () => {
    if (!canDownloadChat || isReadOnly || isBulkSaving) return;
    const prevSavedIds = conversations
      .filter((c) => Boolean(c.savedForAgent))
      .map((c) => c.id);
    if (prevSavedIds.length === 0) return;

    setIsBulkSaving(true);
    try {
      const res = await bulkUpdateSavedForAgent({
        clearAll: true,
        inbox: inboxMode,
      });
      if (!res.ok) {
        setInboxToast({
          type: "error",
          message: res.error || "Could not clear saved conversations.",
        });
        return;
      }
      setConfirmClearSaved(false);
      const count = prevSavedIds.length;
      setInboxToast({
        type: "success",
        message: `Cleared ${count} saved ${count === 1 ? "conversation" : "conversations"}`,
        onUndo: () => {
          void bulkUpdateSavedForAgent({
            senderIds: prevSavedIds,
            saved: true,
            inbox: inboxMode,
          });
          setInboxToast(null);
        },
      });
    } finally {
      setIsBulkSaving(false);
    }
  }, [bulkUpdateSavedForAgent, canDownloadChat, conversations, inboxMode, isBulkSaving, isReadOnly]);

  const handleDownloadBatchConversations = useCallback(
    async (options: {
      savedOnly?: boolean;
      title?: string;
      prefix?: string;
      format?: BatchExportFormat;
    }) => {
      if (!canDownloadChat || isBatchDownloading) return;
      const targetFormat = options.format ?? exportFormat;
      setIsBatchDownloading(true);
      try {
        const res = await fetchConversationsForBatchExport({
          savedOnly: options.savedOnly ?? true,
          inbox: inboxMode,
        });
        if (!res.ok) {
          setInboxToast({
            type: "error",
            message: res.error || "Could not download conversations.",
          });
          return;
        }
        if (res.conversations.length === 0) {
          setInboxToast({
            type: "error",
            message: "No conversations found for this download.",
          });
          return;
        }

        const filename = buildBatchConversationExportFilename(
          targetFormat,
          options.prefix || `${inboxMode}-saved-conversations`
        );
        const transcriptOptions = {
          labels,
          inboxMode,
          origin: typeof window !== "undefined" ? window.location.origin : "",
        };

        if (targetFormat === "zip") {
          await triggerConversationsZipDownload(filename, res.conversations, transcriptOptions);
        } else {
          const combined = formatCombinedConversationsTranscript(res.conversations, {
            ...transcriptOptions,
            title: options.title,
          });
          triggerTextFileDownload(filename, combined);
        }

        setInboxToast({
          type: "success",
          message: `Downloaded ${res.conversations.length} ${
            res.conversations.length === 1 ? "conversation" : "conversations"
          } (${targetFormat === "zip" ? ".zip archive" : "combined .txt"})`,
        });
      } catch (err: unknown) {
        setInboxToast({
          type: "error",
          message:
            err instanceof Error
              ? err.message
              : "Could not build batch download. Please try again.",
        });
      } finally {
        setIsBatchDownloading(false);
      }
    },
    [canDownloadChat, exportFormat, fetchConversationsForBatchExport, inboxMode, isBatchDownloading, labels]
  );

  return (
    <div
      className="flex h-full overflow-hidden"
      style={{ background: "var(--bg-page)", color: "var(--text-primary)" }}
    >
      {/* ── LEFT: Conversations List ── */}
      <div
        className={`
          flex flex-col h-full min-h-0 overflow-hidden
          w-full md:w-[300px] lg:w-[320px] xl:w-[340px] shrink-0
          ${mobileView === "list" ? "flex" : "hidden md:flex"}
        `}
        style={{ background: "var(--bg-card)", borderRight: "1px solid var(--border-main)" }}
      >
        <div className="p-3.5 space-y-2.5" style={{ borderBottom: "1px solid var(--border-main)" }}>
          <div className="relative flex items-center justify-between gap-2 flex-wrap">
            <h1 className="text-[17px] font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
              {isOperationInbox ? "Operation Inbox" : "Inbox"}
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--bg-pill)", color: "var(--text-secondary)" }}>
                {filteredConversations.length}
                {(searchQuery.trim() || isDateFiltered || isLabelFiltered) && ` of ${activeBucketTotal}`}
              </span>
            </h1>

            <div className="flex items-center gap-1.5 flex-wrap ms-auto">
              {isOperationInbox && !isReadOnly && (
                <button
                  type="button"
                  onClick={() => {
                    setOpChatPhone("");
                    setOpChatName("");
                    setOpChatBranch("");
                    setOpChatAgent(isOperation && user?.name ? user.name : "Unassigned");
                    setOpChatNotes("");
                    setOpChatError(null);
                    setShowNewOpChatModal(true);
                  }}
                  title="Start new Operation WhatsApp chat"
                  className="min-h-[44px] sm:min-h-[22px] sm:h-[22px] px-2.5 sm:px-2 rounded-md bg-[#0066FF] hover:bg-[#0055D6] text-white text-[11px] sm:text-[10px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Plus className="w-3 h-3 shrink-0" />
                  <span>New chat</span>
                </button>
              )}
              {/* Label Filter Popover */}
              <div className="inline-block" ref={labelPopoverRef}>
                <div
                  className="inline-flex items-center rounded-md overflow-hidden"
                  style={{
                    background: isLabelFiltered ? "var(--bg-selected)" : "var(--bg-pill)",
                    border: isLabelFiltered ? "1px solid var(--bg-banner)" : "1px solid var(--border-input)",
                    color: isLabelFiltered ? "var(--bg-banner)" : "var(--text-secondary)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowDatePopover(false);
                      setShowLabelPopover((prev) => !prev);
                    }}
                    aria-expanded={showLabelPopover}
                    aria-haspopup="dialog"
                    title="Filter conversations by label"
                    className="min-h-[44px] sm:min-h-[22px] sm:h-[22px] px-2 sm:px-1.5 text-[11px] sm:text-[10px] font-medium flex items-center gap-1 transition-opacity cursor-pointer select-none hover:opacity-90"
                  >
                    <Tag className="w-2.5 h-2.5 shrink-0" />
                    <span className="truncate max-w-[82px] font-semibold leading-none">
                      {labelFilterDisplayText}
                    </span>
                    <ChevronDown
                      className={`w-2.5 h-2.5 opacity-70 transition-transform duration-150 shrink-0 ${
                        showLabelPopover ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {isLabelFiltered && (
                    <button
                      type="button"
                      onClick={resetLabelFilter}
                      aria-label="Clear label filter"
                      title="Clear label filter"
                      className="min-h-[44px] sm:min-h-[22px] sm:h-[22px] px-1.5 sm:px-1 flex items-center justify-center transition-opacity hover:opacity-75 cursor-pointer"
                      style={{ borderInlineStart: "1px solid var(--border-input)" }}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>

                {showLabelPopover && (
                  <div
                    role="dialog"
                    aria-label="Filter inbox by labels"
                    className="absolute right-0 top-[calc(100%+4px)] z-50 w-[235px] max-w-full rounded-xl shadow-2xl p-2 flex flex-col gap-1.5"
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-main)",
                    }}
                  >
                    <div
                      className="flex items-center gap-1.5 rounded-lg px-2 h-[36px] sm:h-[28px]"
                      style={{
                        background: "var(--bg-input)",
                        border: "1px solid var(--border-input)",
                      }}
                    >
                      <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-muted)" }} />
                      <input
                        type="text"
                        value={labelFilterSearch}
                        onChange={(e) => setLabelFilterSearch(e.target.value)}
                        placeholder="Search labels…"
                        aria-label="Search labels"
                        className="w-full min-w-0 bg-transparent text-[16px] sm:text-[11px] outline-none"
                        style={{ color: "var(--text-primary)" }}
                      />
                      {labelFilterSearch && (
                        <button
                          type="button"
                          onClick={() => setLabelFilterSearch("")}
                          aria-label="Clear label search"
                          className="shrink-0 hover:opacity-80 cursor-pointer"
                          style={{ color: "var(--text-muted)" }}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    <div className="max-h-[240px] overflow-y-auto space-y-1 pe-1 py-0.5">
                      {labels.length === 0 ? (
                        <p className="text-[11px] px-2 py-3 text-center" style={{ color: "var(--text-muted)" }}>
                          No labels yet. Add labels from any lead&apos;s details panel.
                        </p>
                      ) : filteredLabelOptions.length === 0 ? (
                        <p className="text-[11px] px-2 py-3 text-center" style={{ color: "var(--text-muted)" }}>
                          No labels match &ldquo;{labelFilterSearch.trim()}&rdquo;.
                        </p>
                      ) : (
                        filteredLabelOptions.map((label) => {
                          const active = effectiveSelectedLabelIds.includes(label.id);
                          const count = labelFilterCounts.get(label.id) ?? 0;
                          const labelVars = getLeadLabelCssVars(label.color);
                          return (
                            <button
                              key={label.id}
                              type="button"
                              aria-pressed={active}
                              onClick={() =>
                                setSelectedLabelIds(toggleLeadLabelId(effectiveSelectedLabelIds, label.id))
                              }
                              className="w-full shrink-0 min-h-[44px] sm:min-h-[30px] px-2.5 py-2 sm:py-1.5 rounded-lg text-start text-[11px] font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                              style={{
                                background: active ? "var(--bg-selected)" : "transparent",
                                color: active ? "var(--text-primary)" : "var(--text-secondary)",
                              }}
                            >
                              <span
                                className="w-3.5 h-3.5 rounded flex items-center justify-center shrink-0"
                                style={{
                                  background: active ? "var(--bg-banner)" : "transparent",
                                  border: active ? "1px solid var(--bg-banner)" : "1px solid var(--border-input)",
                                }}
                              >
                                {active && <Check className="w-2.5 h-2.5 text-white" />}
                              </span>
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ background: labelVars.dotColor }}
                              />
                              <span className="truncate flex-1" style={{ color: "var(--text-primary)" }}>
                                {label.name}
                              </span>
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded-md font-bold shrink-0"
                                style={{
                                  background: active ? "var(--bg-selected)" : "var(--bg-pill)",
                                  color: count > 0 || active ? "var(--bg-banner)" : "var(--text-muted)",
                                }}
                              >
                                {count}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>

                    {isLabelFiltered && (
                      <div
                        className="pt-1.5 flex items-center justify-between gap-2 px-1"
                        style={{ borderTop: "1px solid var(--border-main)" }}
                      >
                        <span className="text-[10px] truncate" style={{ color: "var(--text-secondary)" }}>
                          Selected:{" "}
                          <strong style={{ color: "var(--text-primary)" }}>
                            {effectiveSelectedLabelIds.length}
                          </strong>
                        </span>
                        <button
                          type="button"
                          onClick={resetLabelFilter}
                          className="text-[10px] font-bold hover:underline cursor-pointer shrink-0"
                          style={{ color: "var(--bg-banner)" }}
                        >
                          Reset
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Date Filter Popover */}
              <div className="relative inline-block" ref={datePopoverRef}>
                <button
                  type="button"
                  onClick={() => {
                    setShowLabelPopover(false);
                    setShowDatePopover((prev) => !prev);
                  }}
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
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Inbox filters">
            {filters.map((filter) => {
              const isSelected = activeFilter === filter;
              const pillCount =
                filter === "Saved"
                  ? savedConvCount
                  : filter === "DONE"
                  ? bucketCounts.done
                  : filter === "Archived"
                  ? bucketCounts.archived
                  : filter === "Groups"
                  ? groupCount
                  : filter === "Unread"
                  ? unreadConvCount
                  : null;
              return (
                <button
                  key={filter}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => {
                    setConfirmClearSaved(false);
                    setActiveFilter(filter);
                  }}
                  className={`inline-flex items-center gap-1 text-[11px] sm:text-[10px] font-semibold px-2.5 sm:px-2 py-1.5 sm:py-0.5 min-h-[30px] sm:min-h-0 rounded-full transition-colors cursor-pointer ${
                    isSelected ? "bg-[#0066FF] text-white" : "hover:opacity-90"
                  }`}
                  style={!isSelected ? { background: "var(--bg-pill)", color: "var(--text-secondary)" } : undefined}
                >
                  <span>{filter}</span>
                  {pillCount !== null && pillCount > 0 && (
                    <span
                      className="text-[9px] font-bold px-1 rounded-full leading-tight"
                      style={{
                        background: isSelected ? "rgba(255,255,255,0.22)" : "var(--bg-card)",
                        color: isSelected ? "#ffffff" : "var(--text-secondary)",
                      }}
                    >
                      {pillCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Persistent Batch Export Bar on Saved Tab */}
        {canDownloadChat && activeFilter === "Saved" && savedConvCount > 0 && (
          <div
            className="px-3.5 py-2.5 space-y-2 shrink-0"
            style={{
              background: "var(--bg-panel)",
              borderBottom: "1px solid var(--border-main)",
            }}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div
                className="inline-flex rounded-lg overflow-hidden border"
                style={{
                  background: "var(--bg-card)",
                  borderColor: "var(--border-input)",
                }}
                role="group"
                aria-label="Download format"
              >
                <button
                  type="button"
                  onClick={() => setExportFormat("txt")}
                  className="min-h-[38px] sm:min-h-[28px] px-2.5 text-[10px] font-semibold cursor-pointer"
                  style={
                    exportFormat === "txt"
                      ? { background: "var(--bg-selected)", color: "var(--text-primary)" }
                      : { color: "var(--text-secondary)" }
                  }
                >
                  Combined .txt
                </button>
                <button
                  type="button"
                  onClick={() => setExportFormat("zip")}
                  className="min-h-[38px] sm:min-h-[28px] px-2.5 text-[10px] font-semibold cursor-pointer"
                  style={
                    exportFormat === "zip"
                      ? { background: "var(--bg-selected)", color: "var(--text-primary)" }
                      : { color: "var(--text-secondary)" }
                  }
                >
                  .zip archive
                </button>
              </div>

              <button
                type="button"
                disabled={isBatchDownloading}
                onClick={() =>
                  void handleDownloadBatchConversations({
                    savedOnly: true,
                    prefix: `${inboxMode}-saved-conversations`,
                  })
                }
                className="min-h-[40px] sm:min-h-[30px] px-3 rounded-lg text-[11px] font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                style={{ background: "var(--bg-banner)" }}
              >
                {isBatchDownloading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                ) : (
                  <Download className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>
                  {isBatchDownloading ? "Preparing..." : `Download all (${savedConvCount})`}
                </span>
              </button>
            </div>

            {!isReadOnly && (
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span style={{ color: "var(--text-muted)" }}>
                  Saved marks stay after download.
                </span>
                {confirmClearSaved ? (
                  <div className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={isBulkSaving}
                      onClick={() => void handleClearAllSaved()}
                      className="min-h-[32px] sm:min-h-[22px] px-2 rounded-md font-semibold cursor-pointer"
                      style={{
                        background: "var(--label-red-bg)",
                        color: "var(--label-red-text)",
                      }}
                    >
                      Confirm clear
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClearSaved(false)}
                      className="min-h-[32px] sm:min-h-[22px] px-2 rounded-md font-medium cursor-pointer"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClearSaved(true)}
                    className="min-h-[32px] sm:min-h-[22px] px-2 rounded-md font-medium cursor-pointer hover:underline"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Clear saved
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div ref={convListScrollRef} className="flex-1 min-h-0 overflow-y-auto relative">
          {filteredConversations.length === 0 ? (
            <div className="p-6 text-center">
              <div className="w-10 h-10 mx-auto mb-2 rounded-full flex items-center justify-center" style={{ background: "var(--bg-pill)" }}>
                {activeFilter === "DONE" ? (
                  <CheckCircle2 className="w-5 h-5 opacity-50" style={{ color: "var(--text-secondary)" }} />
                ) : activeFilter === "Archived" ? (
                  <Archive className="w-5 h-5 opacity-50" style={{ color: "var(--text-secondary)" }} />
                ) : activeFilter === "Groups" ? (
                  <Users className="w-5 h-5 opacity-50" style={{ color: "var(--text-secondary)" }} />
                ) : activeFilter === "Unread" ? (
                  <CheckCheck className="w-5 h-5 opacity-50" style={{ color: "var(--text-secondary)" }} />
                ) : (
                  <Search className="w-5 h-5 opacity-40" style={{ color: "var(--text-secondary)" }} />
                )}
              </div>
              <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                {searchQuery || isLabelFiltered
                  ? isOperationInbox
                    ? "No conversations found"
                    : "No leads found"
                  : activeFilter === "Saved"
                  ? "No saved conversations"
                  : activeFilter === "Groups"
                  ? "No WhatsApp groups"
                  : activeFilter === "Unread"
                  ? "No unread messages"
                  : activeFilter === "DONE"
                  ? "No done conversations"
                  : activeFilter === "Archived"
                  ? "No archived conversations"
                  : "No conversations"}
              </p>
              <p className="text-[11px] mt-1 mb-3" style={{ color: "var(--text-secondary)" }}>
                {searchQuery && isLabelFiltered
                  ? `No conversations match "${searchQuery}" with ${labelFilterDisplayText} in ${activeFilter}`
                  : searchQuery
                  ? `No conversations match "${searchQuery}" in ${activeFilter}`
                  : isLabelFiltered && isDateFiltered
                  ? `No conversations in ${activeFilter} with ${labelFilterDisplayText} for ${dateFilterDisplayLabel}`
                  : isLabelFiltered
                  ? `No conversations in ${activeFilter} with ${labelFilterDisplayText}`
                  : isDateFiltered
                  ? `No conversations in ${activeFilter} for ${dateFilterDisplayLabel}`
                  : activeFilter === "Saved"
                  ? "Open a conversation and choose Save to download from the Actions menu."
                  : activeFilter === "Groups"
                  ? "WhatsApp groups connected to Operation WhatsApp appear here."
                  : activeFilter === "Unread"
                  ? "Conversations with unread incoming messages appear here."
                  : activeFilter === "DONE"
                  ? "Conversations you mark as done appear here and leave the main list."
                  : activeFilter === "Archived"
                  ? "Archived conversations appear here and stay muted until unarchived."
                  : `No conversations in ${activeFilter}`}
              </p>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {searchQuery && activeFilter !== "DONE" && crossBucketSearchCounts.done > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveFilter("DONE")}
                    className="text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-90 cursor-pointer"
                    style={{
                      background: "var(--bg-pill)",
                      border: "1px solid var(--border-input)",
                      color: "var(--text-primary)",
                    }}
                  >
                    Show in DONE ({crossBucketSearchCounts.done})
                  </button>
                )}
                {searchQuery && activeFilter !== "Archived" && crossBucketSearchCounts.archived > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveFilter("Archived")}
                    className="text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-90 cursor-pointer"
                    style={{
                      background: "var(--bg-pill)",
                      border: "1px solid var(--border-input)",
                      color: "var(--text-primary)",
                    }}
                  >
                    Show in Archived ({crossBucketSearchCounts.archived})
                  </button>
                )}
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
                {isLabelFiltered && (
                  <button
                    type="button"
                    onClick={resetLabelFilter}
                    className="min-h-[44px] sm:min-h-0 text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-90 cursor-pointer"
                    style={{
                      background: "var(--bg-pill)",
                      border: "1px solid var(--border-input)",
                      color: "var(--text-primary)",
                    }}
                  >
                    Reset label filter
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
              const hasGroupActivity = Boolean(
                (conv.lastMessageText && conv.lastMessageText.trim()) ||
                Number(conv.unreadCount) > 0 ||
                (Array.isArray(conv.messages) && conv.messages.length > 0)
              );
              const showLeadTimer = Boolean(timeStr) && (!conv.isGroup || hasGroupActivity) && isLastMessageFromLead(conv);
              const convDone = isConversationDone(conv);
              const convArchived = isConversationArchived(conv);
              const convSaved = Boolean(conv.savedForAgent);
              const cardAvatarUrl = getConversationAvatarUrl(conv);
              const isCardAvatarFailed = Boolean(cardAvatarUrl && failedAvatarUrls[cardAvatarUrl]);
              const subtitle = conv.isGroup
                ? `Group · ${conv.agent}`
                : conv.leadName && conv.leadName !== conv.name
                ? `${conv.leadName} · ${conv.agent}`
                : conv.phone && isRealPhone(conv.phone) && conv.phone !== conv.name
                ? `${conv.phone} · ${conv.agent}`
                : conv.agent;

              return (
                <InboxConversationCard
                  key={conv.id}
                  conv={conv}
                  isActive={isActive}
                  timeStr={timeStr}
                  showLeadTimer={showLeadTimer}
                  convDone={convDone}
                  convArchived={convArchived}
                  convSaved={convSaved}
                  subtitle={subtitle}
                  avatarUrl={cardAvatarUrl}
                  isAvatarFailed={isCardAvatarFailed}
                  isReadOnly={isReadOnly}
                  canDownloadChat={canDownloadChat}
                  labels={labels}
                  onSelect={handleSelectConv}
                  onApplyBucketChange={applyInboxBucketChange}
                  onAvatarError={handleAvatarImageError}
                  registerAvatarObserver={registerAvatarObserver}
                />
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
              className="flex flex-wrap items-center justify-between px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 gap-2 shrink-0"
              style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border-main)" }}
            >
              {/* Mobile back button */}
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <button
                  type="button"
                  onClick={handleBackToList}
                  aria-label="Back to conversations"
                  className="md:hidden min-w-[44px] min-h-[44px] flex items-center justify-center -ml-2 shrink-0 rounded-md transition-colors"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="min-w-0">
                  {(() => {
                    const headerAvatarEl = (
                      <ConversationAvatar
                        conversationId={activeConv.id}
                        src={rawHeaderAvatarUrl}
                        name={activeConv.name}
                        leadName={activeConv.leadName}
                        isGroup={Boolean(activeConv.isGroup)}
                        eager
                        isFailed={isHeaderAvatarFailed}
                        onImageError={handleAvatarImageError}
                      />
                    );

                    return activeConv.isGroup && activeConv.channel === "WA" ? (
                      <button
                        type="button"
                        onClick={() => handleOpenGroupInfo(null)}
                        title="View group info and members"
                        className="text-left min-w-0 max-w-full rounded-lg px-1.5 py-0.5 -mx-1.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer group flex items-center gap-2.5"
                      >
                        {headerAvatarEl}
                        <div className="min-w-0">
                          <h2
                            className="text-[15px] font-bold truncate flex items-center gap-1.5"
                            style={{ color: "var(--text-primary)" }}
                          >
                            <span className="truncate group-hover:underline">{activeConv.name}</span>
                            <ChevronRight
                              className="w-3.5 h-3.5 shrink-0 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all"
                              style={{ color: "var(--text-secondary)" }}
                            />
                          </h2>
                          <div
                            className="flex items-center text-[11px] mt-0.5 min-w-0"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            <span className="truncate">
                              WhatsApp Group
                              {(activeConv.groupParticipants?.length || activeConv.groupMeta?.size || 0) > 0
                                ? ` · ${activeConv.groupParticipants?.length || activeConv.groupMeta?.size} members`
                                : ""}
                              {" · Tap for members"}
                            </span>
                          </div>
                        </div>
                      </button>
                    ) : (
                      <div className="flex items-center gap-2.5 min-w-0">
                        {headerAvatarEl}
                        <div className="min-w-0">
                          <h2 className="text-[15px] font-bold truncate flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
                            <span className="truncate">
                              {activeConv.name}
                              {!activeConv.isGroup && activeConv.leadName && activeConv.leadName !== activeConv.name
                                ? ` · ${activeConv.leadName}`
                                : ""}
                            </span>
                          </h2>
                          <div className="flex items-center text-[11px] mt-0.5 min-w-0" style={{ color: "var(--text-secondary)" }}>
                            <span className="truncate">
                              {activeConv.channel === "WA"
                                ? activeConv.isGroup
                                  ? "WhatsApp Group"
                                  : activeConv.metaChannel === "FB"
                                  ? "WhatsApp · Facebook Form"
                                  : activeConv.metaChannel === "IG"
                                  ? "WhatsApp · Instagram Form"
                                  : "WhatsApp"
                                : activeConv.channel === "IG"
                                ? "Instagram"
                                : "Messenger"}
                            </span>
                            {!activeConv.isGroup && isRealPhone(activeConv.phone) && activeConv.phone !== activeConv.name && (
                              <>
                                <span className="mx-1.5 shrink-0">•</span>
                                <span className="truncate">{activeConv.phone}</span>
                              </>
                            )}
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
                    );
                  })()}
                </div>
              </div>

              <div className="flex items-center flex-wrap gap-1.5 sm:gap-2 shrink-0">
                {/* 1-click Quick "Assign to me" button for unassigned conversations */}
                {!isReadOnly && !isAssigned && canHandleAssignment && user?.name && (
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
                <div className="hidden sm:flex items-center gap-1.5">
                  <select
                    disabled={!canEditAgent}
                    title={
                      !canEditAgent
                        ? isAssignedToOther
                          ? `Assigned to ${activeConv.agent}. Only Chairman can reassign.`
                          : "Only authorized staff can assign conversations"
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
                        {activeConv.agent &&
                          activeConv.agent !== "Unassigned" &&
                          !effectiveAssignableAgents.some((a) => a.name === activeConv.agent) && (
                            <option value={activeConv.agent}>{activeConv.agent}</option>
                          )}
                        {effectiveAssignableAgents.map((a) => (
                          <option key={a.name} value={a.name}>{a.name}</option>
                        ))}
                      </>
                    ) : canHandleAssignment ? (
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
                    disabled={isReadOnly}
                    value={activeConv.status}
                    onChange={(e) => patchConversation(activeConv.id, { status: e.target.value })}
                    className="rounded-[6px] text-[12px] py-1 px-2 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ border: "1px solid var(--border-input)", color: "var(--text-primary)", background: "var(--bg-input)" }}
                  >
                    <option value="Open">Open</option>
                    <option value="Pending">Pending</option>
                    <option value="Resolved">Resolved</option>
                  </select>
                </div>

                {/* Conversation Actions Dropdown (Mark as done, Archive, Save, Download) */}
                {(!isReadOnly || canDownloadChat) && (
                  <InboxBucketActions
                    conversationId={activeConv.id}
                    isDone={isConversationDone(activeConv)}
                    isArchived={isConversationArchived(activeConv)}
                    isSaved={Boolean(activeConv.savedForAgent)}
                    savedCount={savedConvCount}
                    canManageBuckets={!isReadOnly}
                    canDownload={canDownloadChat}
                    isDownloading={downloadingConvId === activeConv.id}
                    isBatchDownloading={isBatchDownloading}
                    onAction={(action) => applyInboxBucketChange(activeConv.id, action)}
                    onToggleSaved={
                      canDownloadChat && !isReadOnly
                        ? () => void handleToggleSavedSingle(activeConv)
                        : undefined
                    }
                    onDownload={() => void handleDownloadConversation(activeConv)}
                    onDownloadSaved={(fmt) =>
                      void handleDownloadBatchConversations({
                        savedOnly: true,
                        format: fmt,
                        prefix: `${inboxMode}-saved-conversations`,
                      })
                    }
                  />
                )}

                {/* Details toggle button — mobile & tablet */}
                <button
                  type="button"
                  onClick={() => setShowDetailsPanel(true)}
                  aria-label="Contact details"
                  className="lg:hidden min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 flex items-center justify-center p-1.5 rounded-md transition-colors"
                  style={{ color: "var(--text-secondary)", background: "var(--bg-pill)" }}
                  title="Contact details"
                >
                  <Info className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Done / Archived State Strip */}
            {(isConversationArchived(activeConv) || isConversationDone(activeConv)) && (
              <div
                className="px-4 md:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] shrink-0"
                style={{
                  background: "var(--bg-panel)",
                  borderBottom: "1px solid var(--border-main)",
                  color: "var(--text-secondary)",
                }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {isConversationArchived(activeConv) ? (
                    <>
                      <Archive className="w-3.5 h-3.5 shrink-0" />
                      <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                        Archived
                      </span>
                      {activeConv.archivedBy && <span>by {activeConv.archivedBy}</span>}
                      <span>· Hidden from the main list and muted for new replies</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-[#34C759]" />
                      <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                        Marked as done
                      </span>
                      {activeConv.doneBy && <span>by {activeConv.doneBy}</span>}
                      <span>· Reopens on new customer reply</span>
                    </>
                  )}
                </div>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() =>
                      applyInboxBucketChange(
                        activeConv.id,
                        isConversationArchived(activeConv) ? "unarchive" : "reopen"
                      )
                    }
                    className="text-[11px] font-semibold text-[#0066FF] hover:underline cursor-pointer shrink-0"
                  >
                    {isConversationArchived(activeConv) ? "Unarchive" : "Move back to Inbox"}
                  </button>
                )}
              </div>
            )}

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
                      {isReadOnly
                        ? "No messages in this conversation yet."
                        : activeConv.isGroup
                        ? "No messages synced in this group yet. Send a message below, or new group messages will appear here live."
                        : "No messages in this conversation yet. Send a WhatsApp message below to start chatting with this lead."}
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
                const visibleMessages = activeConv.messages.filter(
                  (m) => getWhatsAppGhostDisplayMode(m, activeConv.channel) !== "hide"
                );
                const dateDividerLabels = buildChatDateDividerLabels(visibleMessages);
                return visibleMessages.map((msg, msgIdx) => {
                  const dateDividerLabel = dateDividerLabels[msgIdx];
                  const timeTooltip = formatChatMessageTooltip(msg.timestamp, msg.time);
                  const ghostMode = getWhatsAppGhostDisplayMode(msg, activeConv.channel);
                  const hasTemplateAttachment = (msg.attachments || []).some(isTemplateAttachmentLike);
                  const hasSharedPostAttachment = (msg.attachments || []).some(
                    (a: any) => a.type === "ig_post" || a.type === "ig_reel" || a.type === "share"
                  );
                  const hasMediaAttachment = (msg.attachments || []).some(isMediaAttachmentLike);
                  const shouldRenderFallbackCard = shouldRenderLegacyTemplateFallback(msg, activeConv.channel);

                  let showPlainText = Boolean(msg.text && !isPlaceholderMessageText(msg.text));
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
                    const firstTemplateAtt = msg.attachments?.find(isTemplateAttachmentLike);
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
                    <React.Fragment key={msg.id}>
                      {dateDividerLabel && <ChatDateDivider label={dateDividerLabel} />}
                      <div
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
                      {activeConv.isGroup && msg.isIncoming && (
                        <span
                          className="text-[11px] font-semibold mb-1 px-1.5"
                          style={{ color: "#0066FF" }}
                        >
                          {msg.senderName || "Group Member"}
                        </span>
                      )}
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

                            const incomingFallbackAuthor = activeConv.isGroup
                              ? "Group Member"
                              : activeConv.leadName || activeConv.profileName || activeConv.name || "Customer";
                            const authorName = isQuotingIncoming
                              ? (referencedMsg
                                  ? referencedMsg.senderName || incomingFallbackAuthor
                                  : msg.replyTo.senderName || incomingFallbackAuthor)
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
                                  {activeConv.channel === "WA" && activeConv.isGroup
                                    ? renderWhatsAppText(quoteText, {
                                        mentions: referencedMsg?.mentions,
                                        mentionAll: referencedMsg?.mentionAll,
                                        participants: activeConv.groupParticipants,
                                      })
                                    : quoteText}
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
                                    if (isTemplateAttachmentLike(att)) return null;
                                    const url = att.previewUrl || att.payload?.url || att.url;
                                    const fileName =
                                      att.fileName ||
                                      att.payload?.title ||
                                      att.title ||
                                      (att.type === "file" && msg.text && !isPlaceholderMessageText(msg.text)
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
                                <>
                                  {msg.mentionAll && !/@(?:all|everyone|الكل|الجميع)(?=$|[\s.,!?:;،؛)\]"'»])/i.test(msg.text || "") && (
                                    <div className="mb-1">
                                      <span
                                        className="inline-block text-[10.5px] font-semibold px-1.5 py-0.5 rounded border"
                                        style={{
                                          background: "var(--label-amber-bg)",
                                          color: "var(--label-amber-text)",
                                          borderColor: "var(--label-amber-border)",
                                        }}
                                      >
                                        @all
                                      </span>
                                    </div>
                                  )}
                                  <p
                                    className={`text-[14px] md:text-[15px] leading-relaxed whitespace-pre-wrap break-words ${
                                      hasTemplateAttachment || shouldRenderFallbackCard ? "mb-3" : ""
                                    } ${msg.dir === "rtl" ? "text-right" : "text-left"}`}
                                    style={{ color: msg.isIncoming ? "var(--text-chat-incoming)" : "var(--text-chat-outgoing)" }}
                                    dir={msg.dir}
                                  >
                                    {activeConv.channel === "WA"
                                      ? renderWhatsAppText(
                                          msg.text,
                                          activeConv.isGroup
                                            ? {
                                                mentions: msg.mentions,
                                                mentionAll: msg.mentionAll,
                                                participants: activeConv.groupParticipants,
                                              }
                                            : undefined
                                        )
                                      : msg.text}
                                  </p>
                                </>
                              )}

                              {/* Template card attachments */}
                              {hasTemplateAttachment && (
                                <div className="flex flex-col gap-2.5">
                                  {msg.attachments
                                    ?.filter(isTemplateAttachmentLike)
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

                              {/* Neutral placeholder when a legacy empty WA message still has replies or reactions */}
                              {ghostMode === "unavailable" && (
                                <p
                                  className="text-[12px] italic opacity-80 select-none"
                                  style={{
                                    color: msg.isIncoming ? "var(--text-secondary)" : "var(--text-chat-outgoing)",
                                  }}
                                >
                                  Message unavailable in CRM
                                </p>
                              )}

                              {/* Graceful fallback card for legacy Meta messages that stored template placeholder text */}
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
                                  : activeConv.isGroup
                                  ? realSenderName || "Group Member"
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
                            <span title={timeTooltip || undefined}>{msg.time}</span>
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
                                setEditingMessage({
                                  id: msg.id,
                                  text: msg.text,
                                  mentions: msg.mentions,
                                  mentionAll: msg.mentionAll,
                                });
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
                    </React.Fragment>
                  );
                });
              })()}
              {activeTimelineDraft && (
                <DraftMessageBubble
                  agent={activeTimelineDraft.agent}
                  text={activeTimelineDraft.text}
                  channel={activeConv.channel}
                  isRewriting={agentGenerating === activeTimelineDraft.agent}
                  isSending={isSendingTimelineDraft}
                  canSend={canSendMessages && !isReadOnly}
                  onUpdateText={(nextText) =>
                    setLocalTimelineDraft({
                      chatId: activeConv.id,
                      agent: activeTimelineDraft.agent,
                      text: nextText,
                    })
                  }
                  onSend={handleSendTimelineDraft}
                  onRewrite={() =>
                    setAgentRewriteRequest((prev) => ({
                      id: (prev?.id || 0) + 1,
                      agent: activeTimelineDraft.agent,
                    }))
                  }
                  onDiscard={handleDiscardTimelineDraft}
                />
              )}
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
              isGroup={Boolean(activeConv.isGroup)}
              groupParticipants={activeConv.groupParticipants}
              groupMeta={activeConv.groupMeta}
              isLoadingParticipants={isLoadingParticipants}
              onRefreshParticipants={handleRefreshParticipants}
              token={token}
              isReadOnly={isReadOnly}
              canSendMessages={canSendMessages}
              readOnlyReason={
                isEnrollmentDirector
                  ? "View-only inbox · Enrollment Director cannot send messages"
                  : undefined
              }
              isAssignedToOther={isAssignedToOther}
              assignedAgent={activeConv.agent}
              userName={user?.name}
              windowLeft={activeConv.windowLeft}
              isUnassigned={!isAssigned}
              isAdmission={canHandleAssignment && !isReadOnly}
              onAssignToMe={user?.name ? () => patchConversation(activeConv.id, { agent: user.name }) : undefined}
              onSendMessage={handleSendReply}
              editingMessage={editingMessage}
              onCancelEdit={() => setEditingMessage(null)}
              onSaveEdit={handleSaveEditMessage}
              replyingTo={replyingTo}
              onCancelReply={() => setReplyingTo(null)}
              onJumpToMessage={scrollToMessage}
              externalDroppedFiles={droppedFilesForInput}
              inboxMode={inboxMode}
              agentScope="both"
              claudeEnabled={Boolean(activeConv.claudeEnabled)}
              claudePaused={Boolean(activeConv.claudePaused)}
              pipeline={activeConv.pipeline}
              onDraftGenerated={(agent, draftText) => {
                setLocalTimelineDraft({
                  chatId: activeConv.id,
                  agent,
                  text: draftText,
                });
              }}
              onAgentGeneratingChange={setAgentGenerating}
              agentRewriteRequest={agentRewriteRequest}
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

      {/* ── RIGHT: Details Panel / WhatsApp-style Group Info Side View ── */}
      {/* Desktop: always visible if a conv is active */}
      {activeConv && (() => {
        const showGroupInfoSide = Boolean(
          groupInfoModalState.open && activeConv.isGroup && activeConv.channel === "WA"
        );
        return (
          <>
            {/* Mobile overlay backdrop */}
            {showDetailsPanel && (
              <div
                className="fixed inset-0 z-40 bg-black/40 lg:hidden"
                onClick={() => {
                  setShowDetailsPanel(false);
                  if (showGroupInfoSide) {
                    setGroupInfoModalState({ open: false, initialMember: null });
                  }
                }}
              />
            )}

            <div
              className={`
                flex flex-col h-full shrink-0
                fixed lg:relative right-0 top-0 z-50
                transform transition-transform duration-200 ease-in-out
                ${showGroupInfoSide ? "overflow-hidden p-0 w-[92vw] sm:w-[360px] lg:w-[340px] xl:w-[360px]" : "overflow-y-auto p-5 w-[85vw] sm:w-[320px] lg:w-[300px]"}
                ${showDetailsPanel ? "translate-x-0" : "translate-x-full lg:translate-x-0"}
              `}
              style={{ background: "var(--bg-panel)", borderLeft: "1px solid var(--border-main)" }}
            >
              {showGroupInfoSide ? (
                <GroupInfoPanel
                  groupConv={activeConv}
                  allInboxConversations={operationConversations}
                  initialMember={groupInfoModalState.initialMember}
                  isLoadingParticipants={isLoadingParticipants}
                  isExporting={downloadingConvId === activeConv.id}
                  isReadOnly={isReadOnly}
                  onClose={() => {
                    setGroupInfoModalState({ open: false, initialMember: null });
                    setShowDetailsPanel(false);
                  }}
                  onSwitchToCrmDetails={() =>
                    setGroupInfoModalState({ open: false, initialMember: null })
                  }
                  onExportChat={canDownloadChat ? () => handleDownloadConversation(activeConv) : undefined}
                  onRefreshParticipants={handleRefreshParticipants}
                  onFetchMemberProfile={fetchGroupMemberProfile}
                  onFetchMemberAvatars={fetchGroupMemberAvatars}
                  onOpenMemberChat={(member) =>
                    openGroupMemberChat(activeConv.id, member, activeConv.name)
                  }
                  onSelectConversation={handleSelectMemberConversation}
                />
              ) : (
                <>
                  <EditableLeadName
              conversationId={activeConv.id}
              label={isGroupConversation(activeConv) ? "Group Name" : "Lead Name"}
              displayName={getEditableLeadDisplayName(activeConv)}
              secondaryText={
                isGroupConversation(activeConv) || isGroupConversation(activeConv.phone)
                  ? undefined
                  : activeConv.phone || activeConv.id
              }
              isNameCustomized={
                activeConv.channel !== "WA" || hasAgentEditedLeadName(activeConv.source)
              }
              isReadOnly={isReadOnly || isGroupConversation(activeConv)}
              onSaveName={(newName) =>
                patchConversation(activeConv.id, buildLeadNamePatchUpdates(newName))
              }
              rightSlot={
                <button
                  type="button"
                  onClick={() => setShowDetailsPanel(false)}
                  aria-label="Close contact details"
                  className="lg:hidden min-w-[44px] min-h-[44px] flex items-center justify-center -mr-2 rounded-md"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <X className="w-5 h-5" />
                </button>
              }
            />

            <LeadLabelsSection
              conversationId={activeConv.id}
              labelIds={activeConv.labels}
              isReadOnly={isReadOnly}
              onUpdateLabels={(nextIds) => patchConversation(activeConv.id, { labels: nextIds })}
            />

            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[9px] font-bold tracking-widest text-[#0066FF] uppercase">Assigned to</h3>
                {isAssignedToMe && (
                  <span className="text-[10px] font-semibold text-[#34C759]">Assigned to you</span>
                )}
              </div>
              <div className="rounded-[6px] p-2.5 flex items-center justify-between gap-2" style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)" }}>
                {isOperationInbox && isChairman && !isReadOnly ? (
                  <select
                    value={activeConv.agent || "Unassigned"}
                    onChange={(e) => patchConversation(activeConv.id, { agent: e.target.value })}
                    className="flex-1 min-w-0 bg-transparent text-[12px] font-medium outline-none cursor-pointer"
                    style={{ color: "var(--text-primary)" }}
                  >
                    <option value="Unassigned">Unassigned</option>
                    {activeConv.agent &&
                      activeConv.agent !== "Unassigned" &&
                      !effectiveAssignableAgents.some((a) => a.name === activeConv.agent) && (
                        <option value={activeConv.agent}>{activeConv.agent}</option>
                      )}
                    {effectiveAssignableAgents.map((a) => (
                      <option key={a.name} value={a.name}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-[12px] font-medium truncate" style={{ color: "var(--text-primary)" }}>
                    {activeConv.agent || "Unassigned"}
                  </span>
                )}
                {!isReadOnly && !isAssigned && canHandleAssignment && user?.name && (
                  <button
                    type="button"
                    onClick={() => patchConversation(activeConv.id, { agent: user.name })}
                    className="text-[11px] font-semibold text-[#0066FF] hover:underline cursor-pointer shrink-0"
                  >
                    Assign to me →
                  </button>
                )}
                {!isReadOnly && isAssignedToMe && canHandleAssignment && !isChairman && (
                  <button
                    type="button"
                    onClick={() => patchConversation(activeConv.id, { agent: "Unassigned" })}
                    className="text-[11px] font-medium hover:underline cursor-pointer shrink-0"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Unassign
                  </button>
                )}
                {!isOperationInbox && isAssigned && canViewTeamActivity && (
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

            {isOperationInbox && (
              <>
                {/* Phone / Chat Type display */}
                {!activeConv.isGroup && (
                  <div className="mb-5">
                    <h3 className="text-[9px] font-bold tracking-widest text-[#0066FF] uppercase mb-2">
                      Phone
                    </h3>
                    <div
                      className="rounded-[6px] p-2.5 flex items-center justify-between gap-2"
                      style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)" }}
                    >
                      <span className="text-[12px] font-mono font-medium truncate" style={{ color: "var(--text-primary)" }}>
                        {isRealPhone(activeConv.phone)
                          ? activeConv.phone
                          : extractPhoneFromConversation(activeConv) || "Not available"}
                      </span>
                    </div>
                  </div>
                )}

                {/* Group History On-Demand Sync (WhatsApp Groups in Right Sidebar Only — Collapsed by Default) */}
                {activeConv.isGroup && (
                  <div className="mb-5">
                    <button
                      type="button"
                      onClick={() => setShowGroupHistorySync((prev) => !prev)}
                      className="w-full flex items-center justify-between gap-2 text-left cursor-pointer py-1"
                    >
                      <h3 className="text-[9px] font-bold tracking-widest text-[#0066FF] uppercase">
                        Group History Sync
                      </h3>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {activeConv.messages.length === 0 && (
                          <span
                            className="text-[10px] font-semibold"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            Waiting for 1st msg
                          </span>
                        )}
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform shrink-0 ${
                            showGroupHistorySync ? "rotate-180" : ""
                          }`}
                          style={{ color: "var(--text-muted)" }}
                        />
                      </div>
                    </button>

                    {showGroupHistorySync && (
                      <div
                        className="mt-2 rounded-[6px] p-2.5 space-y-2"
                        style={{
                          background: "var(--bg-input)",
                          border: "1px solid var(--border-input)",
                        }}
                      >
                        <p
                          className="text-[11px] leading-relaxed"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {activeConv.messages.length > 0
                            ? "Load up to 50 older messages from WhatsApp."
                            : "Send or receive 1 message first to load older history."}
                        </p>
                        {!isReadOnly && (
                          <button
                            type="button"
                            disabled={syncingGroupHistory || activeConv.messages.length === 0}
                            onClick={async () => {
                              if (syncingGroupHistory || activeConv.messages.length === 0) return;
                              const targetConvId = activeConv.id;
                              setSyncingGroupHistory(true);
                              setGroupHistoryNotice(null);
                              try {
                                const res = await authFetch(
                                  `/api/messages/${encodeURIComponent(targetConvId)}/sync-history`,
                                  {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ count: 50 }),
                                  }
                                );
                                const json = await res.json().catch(() => null);
                                if (!res.ok || !json?.success) {
                                  throw new Error(
                                    json?.error || "Could not request earlier group messages."
                                  );
                                }
                                setGroupHistoryNotice({
                                  convId: targetConvId,
                                  type: "success",
                                  message:
                                    "Requested earlier messages from WhatsApp. Any available messages will appear here in a few seconds.",
                                });
                              } catch (err: any) {
                                setGroupHistoryNotice({
                                  convId: targetConvId,
                                  type: "error",
                                  message:
                                    err?.message || "Could not request earlier group messages.",
                                });
                              } finally {
                                setSyncingGroupHistory(false);
                              }
                            }}
                            className="w-full py-1.5 px-2.5 rounded-md text-[11px] font-semibold bg-[#0066FF] hover:bg-[#0055D6] text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            <RotateCcw
                              className={`w-3 h-3 shrink-0 ${syncingGroupHistory ? "animate-spin" : ""}`}
                            />
                            <span>
                              {syncingGroupHistory
                                ? "Loading from WhatsApp..."
                                : activeConv.messages.length > 0
                                ? "Load Earlier Messages"
                                : "Waiting for 1st Message"}
                            </span>
                          </button>
                        )}
                        {groupHistoryNotice && groupHistoryNotice.convId === activeConv.id && (
                          <p
                            className="text-[10px] leading-snug"
                            style={{
                              color: groupHistoryNotice.type === "error" ? "#FF3B30" : "#34C759",
                            }}
                          >
                            {groupHistoryNotice.message}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Branch selector */}
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[9px] font-bold tracking-widest text-[#0066FF] uppercase">
                      Branch
                    </h3>
                    {!isReadOnly && activeConv.branch && (
                      <button
                        type="button"
                        onClick={() => patchConversation(activeConv.id, { branch: "" })}
                        className="text-[10px] font-medium hover:underline cursor-pointer"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <BranchSelect
                    value={activeConv.branch || ""}
                    onChange={(val) => patchConversation(activeConv.id, { branch: val })}
                    branchGroups={branchGroups}
                    disabled={isReadOnly}
                  />
                </div>

                {/* Status */}
                <div className="mb-5">
                  <h3 className="text-[9px] font-bold tracking-widest text-[#0066FF] uppercase mb-2">
                    Status
                  </h3>
                  <select
                    disabled={isReadOnly}
                    value={activeConv.status}
                    onChange={(e) => patchConversation(activeConv.id, { status: e.target.value })}
                    className="w-full rounded-[6px] text-[12px] py-1.5 px-2 outline-none disabled:opacity-60 cursor-pointer font-medium transition-colors"
                    style={{
                      border: "1px solid var(--border-input)",
                      background: "var(--bg-input)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <option value="Open">Open</option>
                    <option value="Pending">Pending</option>
                    <option value="Resolved">Resolved</option>
                  </select>
                </div>
              </>
            )}

            {!isOperationInbox && (
              <>
            <LeadCashInSection
              conversationId={activeConv.id}
              cashIn={activeConv.cashIn}
              isReadOnly={isReadOnly}
              onSaveCash={(amount) => patchConversation(activeConv.id, { cashIn: amount })}
            />

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

            <PipelineStageSection
              conversationId={activeConv.id}
              pipeline={activeConv.pipeline}
              lostReason={activeConv.lostReason}
              lostReasonNote={activeConv.lostReasonNote}
              lostAt={activeConv.lostAt}
              lostBy={activeConv.lostBy}
              isReadOnly={isReadOnly}
              onSavePatch={(updates) => patchConversation(activeConv.id, updates)}
            />

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
                        value={activeConv.auditionOutcome === "booked" ? "" : (activeConv.auditionOutcome || '')}
                        onChange={(e) => {
                          const nextOutcome = e.target.value;
                          syncAuditionSlotCacheOnUpdate(activeConv.id, { clearStatusOverride: true });
                          void patchConversation(activeConv.id, { auditionOutcome: nextOutcome });
                        }}
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
                  {(() => {
                    const storedDate = activeConv.auditionDate || activeConv.followUpDate;
                    const storedTime = extractExplicitAuditionTime(activeConv);
                    return (
                      <div className="flex items-center gap-2 flex-wrap">
                        {storedDate && (
                          <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                            {storedDate}
                            {storedTime ? ` · ${storedTime}` : ""}
                          </span>
                        )}
                        {!storedDate && storedTime && (
                          <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                            {storedTime}
                          </span>
                        )}
                        {activeConv.branch && (
                          <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
                            · {activeConv.branch}
                          </span>
                        )}
                      </div>
                    );
                  })()}
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
                <p className="text-[11px] font-medium" style={{ color: "var(--text-primary)" }}>
                  {activeConv.leadName || activeConv.profileName || activeConv.name}
                </p>
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
                      {canAccessRoute(user?.role, "/follow-ups") && (
                        <Link
                          href="/follow-ups"
                          className="text-[10px] font-semibold text-[#0066FF] hover:underline flex items-center gap-0.5"
                        >
                          Follow-ups →
                        </Link>
                      )}
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
                      disabled={isReadOnly}
                      defaultValue={activeConv.followUpNote || ""}
                      placeholder={isJoiningLater ? "e.g. Joining in summer" : isPaymentPending ? "e.g. Waiting for transfer" : isTrialSession ? "e.g. Trial on Saturday" : "e.g. Call back about Sunday"}
                      className={`flex-1 min-w-0 rounded-[6px] text-[11px] py-1.5 px-2 outline-none placeholder-gray-400 transition-colors disabled:opacity-60 ${
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
                      disabled={isReadOnly}
                      defaultValue={activeConv.followUpDate || ""}
                      className={`flex-1 rounded-[6px] px-2 py-1.5 text-[11px] outline-none cursor-pointer transition-colors disabled:opacity-60 ${
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
              </>
            )}

            <div>
              <h3 className="text-[9px] font-bold tracking-widest text-[#0066FF] uppercase mb-2">Notes</h3>
              <textarea
                rows={isOperationInbox ? 4 : 3}
                disabled={isReadOnly}
                key={`notes-${activeConv.id}-${activeConv.notes || ''}`}
                defaultValue={activeConv.notes || ""}
                placeholder={
                  isOperationInbox
                    ? "Operational notes, schedule changes, follow-up context..."
                    : "Instrument, age, follow-up promises..."
                }
                className="w-full rounded-[6px] text-[11px] p-2 outline-none placeholder-gray-400 resize-y disabled:opacity-60"
                style={{ border: "1px solid var(--border-input)", background: "var(--bg-input)", color: "var(--text-primary)" }}
                onBlur={(e) => patchConversation(activeConv.id, { notes: e.target.value })}
              />
            </div>

            <div className="mt-8 text-[9px]" style={{ color: "var(--text-muted)" }}>
              Conversation cv-{activeConv.name.toLowerCase()}
            </div>
                </>
              )}
          </div>
        </>
        );
      })()}

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

      {/* Book / Reschedule Audition Modal */}
      {showAuditionModal && activeConv && (() => {
        const isReschedule = Boolean(activeConv.auditionDate);
        const timeOptions = getAuditionTimeSelectOptions(auditionTime);
        return (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inbox-audition-modal-title"
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
                  <h3 id="inbox-audition-modal-title" className="text-[16px] font-bold mt-0.5" style={{ color: 'var(--text-primary)' }}>
                    {isReschedule ? "Reschedule Audition" : "Book Audition"} for {activeConv.name}
                  </h3>
                </div>
                <button
                  type="button"
                  disabled={isBookingAudition}
                  onClick={() => setShowAuditionModal(false)}
                  aria-label="Close audition modal"
                  className="p-1.5 rounded-lg transition-colors hover:opacity-70 cursor-pointer disabled:opacity-50"
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
                    {timeOptions.map((t) => (
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

              {bookingError && (
                <div
                  role="alert"
                  className="px-3 py-2 rounded-lg text-[12px] font-medium border"
                  style={{
                    background: "var(--label-red-bg)",
                    borderColor: "var(--label-red-border)",
                    color: "var(--label-red-text)",
                  }}
                >
                  {bookingError}
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  disabled={isBookingAudition || !auditionDate || !auditionBranch}
                  onClick={handleConfirmBooking}
                  className="flex-1 h-[40px] text-[13px] font-semibold text-white rounded-xl cursor-pointer hover:bg-[#0055d4] transition-colors disabled:opacity-50"
                  style={{ background: '#0066FF' }}
                >
                  {isBookingAudition
                    ? (isReschedule ? "Saving..." : "Booking...")
                    : (isReschedule ? "Save Reschedule" : "Confirm Audition Booking")}
                </button>
                <button
                  type="button"
                  disabled={isBookingAudition}
                  onClick={() => setShowAuditionModal(false)}
                  className="h-[40px] px-5 text-[13px] font-medium rounded-xl cursor-pointer hover:opacity-80 transition-colors disabled:opacity-50"
                  style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)', color: 'var(--text-secondary)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
      {/* ── New Operation WhatsApp Chat Modal ── */}
      {isOperationInbox && showNewOpChatModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => !opChatCreating && setShowNewOpChatModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="New Operation WhatsApp Chat"
            className="w-full max-w-md rounded-2xl p-5 shadow-2xl flex flex-col gap-3.5"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-[16px] font-bold" style={{ color: "var(--text-primary)" }}>
                  New Operation Chat
                </h3>
                <p className="text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                  Start or open a WhatsApp conversation on the Operation number.
                </p>
              </div>
              <button
                type="button"
                disabled={opChatCreating}
                onClick={() => setShowNewOpChatModal(false)}
                aria-label="Close modal"
                className="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] flex items-center justify-center rounded-lg hover:opacity-75 cursor-pointer"
                style={{ color: "var(--text-secondary)" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              className="flex flex-col gap-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (opChatCreating) return;
                setOpChatError(null);
                setOpChatCreating(true);
                try {
                  const res = await createManualLead({
                    phone: opChatPhone,
                    name: opChatName || undefined,
                    branch: opChatBranch || undefined,
                    agent: opChatAgent || "Unassigned",
                    notes: opChatNotes || undefined,
                    inbox: "operation",
                  });
                  if (!res.ok) {
                    setOpChatError(res.error || "Could not create chat.");
                    return;
                  }
                  setShowNewOpChatModal(false);
                  if (res.conversationId) {
                    setActiveChatId(res.conversationId);
                    setMobileView("chat");
                  }
                } finally {
                  setOpChatCreating(false);
                }
              }}
            >
              <div>
                <label className="block text-[11px] font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>
                  Phone Number *
                </label>
                <input
                  type="tel"
                  required
                  value={opChatPhone}
                  onChange={(e) => setOpChatPhone(e.target.value)}
                  placeholder="e.g. +966501234567 or 01012345678"
                  className="w-full min-h-[44px] sm:min-h-[36px] rounded-lg px-3 text-[16px] sm:text-[13px] outline-none"
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-input)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>
                  Name (Optional)
                </label>
                <input
                  type="text"
                  value={opChatName}
                  onChange={(e) => setOpChatName(e.target.value)}
                  placeholder="Student or parent name"
                  className="w-full min-h-[44px] sm:min-h-[36px] rounded-lg px-3 text-[16px] sm:text-[13px] outline-none"
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-input)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>
                    Branch (Optional)
                  </label>
                  <BranchSelect
                    value={opChatBranch}
                    onChange={setOpChatBranch}
                    branchGroups={branchGroups}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>
                    Assigned To
                  </label>
                  <select
                    value={opChatAgent}
                    onChange={(e) => setOpChatAgent(e.target.value)}
                    disabled={!isChairman && !isOperation}
                    className="w-full min-h-[44px] sm:min-h-[36px] rounded-lg px-2.5 text-[14px] sm:text-[12px] outline-none"
                    style={{
                      background: "var(--bg-input)",
                      border: "1px solid var(--border-input)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <option value="Unassigned">Unassigned</option>
                    {isChairman ? (
                      operationAssignableAgents.map((a) => (
                        <option key={a.name} value={a.name}>
                          {a.name}
                        </option>
                      ))
                    ) : user?.name ? (
                      <option value={user.name}>{user.name}</option>
                    ) : null}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>
                  Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={opChatNotes}
                  onChange={(e) => setOpChatNotes(e.target.value)}
                  placeholder="Schedule note, request, or context..."
                  className="w-full rounded-lg p-2.5 text-[14px] sm:text-[12px] outline-none resize-y"
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-input)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>

              {opChatError && (
                <div
                  role="alert"
                  className="px-3 py-2 rounded-lg text-[12px] font-medium border"
                  style={{
                    background: "var(--label-red-bg)",
                    borderColor: "var(--label-red-border)",
                    color: "var(--label-red-text)",
                  }}
                >
                  {opChatError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={opChatCreating}
                  onClick={() => setShowNewOpChatModal(false)}
                  className="min-h-[44px] sm:min-h-[36px] px-4 text-[12px] font-medium rounded-xl cursor-pointer hover:opacity-80"
                  style={{
                    background: "var(--bg-pill)",
                    border: "1px solid var(--border-input)",
                    color: "var(--text-secondary)",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={opChatCreating || !opChatPhone.trim()}
                  className="min-h-[44px] sm:min-h-[36px] px-4 text-[12px] font-semibold text-white rounded-xl bg-[#0066FF] hover:bg-[#0055D6] transition-colors cursor-pointer disabled:opacity-50"
                >
                  {opChatCreating ? "Opening..." : "Start Chat"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inbox action & error toast */}
      {inboxToast && (
        <div
          role={inboxToast.type === "error" ? "alert" : "status"}
          className="fixed left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm z-[110] rounded-xl px-3.5 py-2.5 shadow-xl flex items-center gap-2.5 border"
          style={{
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)",
            background: "var(--bg-card)",
            borderColor: inboxToast.type === "error" ? "rgba(239, 68, 68, 0.45)" : "var(--border-main)",
            color: "var(--text-primary)",
          }}
        >
          {inboxToast.type === "error" ? (
            <AlertCircle className="w-4 h-4 shrink-0 text-[#FF3B30]" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-[#34C759]" />
          )}
          <span className="text-[12.5px] font-medium flex-1 leading-snug truncate">
            {inboxToast.message}
          </span>
          {inboxToast.onUndo && (
            <button
              type="button"
              onClick={inboxToast.onUndo}
              className="min-h-[36px] sm:min-h-0 px-2 py-1 text-[12px] font-semibold text-[#0066FF] hover:underline cursor-pointer shrink-0"
            >
              Undo
            </button>
          )}
          <button
            type="button"
            onClick={() => setInboxToast(null)}
            aria-label="Dismiss notification"
            className="min-w-[44px] min-h-[44px] sm:min-w-[28px] sm:min-h-[28px] -mr-1 rounded-lg flex items-center justify-center hover:opacity-75 cursor-pointer shrink-0"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
