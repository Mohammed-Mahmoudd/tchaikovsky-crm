"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  useAuth,
  normalizeRole,
  isAssignableRole,
  isAssignableForInbox,
  isOperationRole,
  canAccessInbox,
  canAccessConversationInboxData,
  canAccessRoute,
  type InboxScope,
  type LogoutReason,
} from "../components/AuthProvider";
import { canUserViewConversationInStore } from "../utils/branchScope";
import { formatMetaErrorMessage } from "../utils/errorParser";
import {
  computeUnreadFromMessages,
  getLastRealMessageDirection,
  isLastMessageFromLead,
  isRealSenderName,
  mergeExistingMessageFromSse,
  resolvePreferredSenderName,
} from "../utils/conversationMessages";
import {
  hasAgentEditedLeadName,
  isPlaceholderLeadName,
  resolveConversationLeadNames,
} from "../utils/leadName";
import {
  computeInboxUnreadBadge,
  filterConversationsByInbox,
  isGroupConversation,
  resolveConvInboxMode,
} from "../utils/inboxFilters";
import {
  findExistingDmForParticipant,
  getParticipantLabel,
  getParticipantPhoneDigits,
  type GroupMemberProfileInfo,
  type GroupMetaInfo,
  type GroupParticipant,
  type MessageMention,
} from "../utils/groupMentions";

export type { GroupMemberProfileInfo, GroupMetaInfo, GroupParticipant, MessageMention };
import {
  type LeadLabel,
  type LeadLabelColor,
  LABELS_CACHE_KEY,
  areStringArraysEqual,
  normalizeConversationLabelIds,
  normalizeLeadLabelCatalog,
} from "../utils/leadLabels";
import {
  type BrowserNotificationPermission,
  type EnablePushResult,
  type TestPushResult,
  PUSH_PREF_KEY,
  disableDevicePushNotifications,
  enableDevicePushNotifications,
  getBrowserNotificationPermission,
  isPushSupported,
  readPushOptInPreference,
  sendTestDevicePush,
  syncActivePushSubscription,
} from "../utils/pushNotifications";
import {
  postPresenceHeartbeat,
  resetPresenceClientSupportState,
} from "../utils/presenceClient";

export {
  computeUnreadFromMessages,
  getLastRealMessageDirection,
  isLastMessageFromLead,
  type LeadLabel,
  type LeadLabelColor,
};

export type Channel = "WA" | "IG" | "FB";

export type MessageReaction = {
  emoji: string;
  sender?: string;
  fromMe: boolean;
  timestamp?: number;
};

export type MessageReplyTo = {
  id: string;
  text: string;
  senderName?: string;
  isIncoming?: boolean;
};

export type Message = {
  id: string;
  text: string;
  attachments?: any[];
  time: string;
  timestamp?: number;
  isIncoming: boolean;
  status?: "pending" | "sent" | "delivered" | "read";
  seenAt?: number;
  deliveredAt?: number;
  isRead?: boolean;
  dir?: "rtl" | "ltr";
  senderName?: string;
  isEdited?: boolean;
  editedAt?: number;
  isDeleted?: boolean;
  deletedAt?: number;
  deletedBy?: string;
  reactions?: MessageReaction[];
  replyTo?: MessageReplyTo;
  mentions?: MessageMention[];
  mentionAll?: boolean;
};

export type Conversation = {
  id: string; // senderId
  _id?: string;
  name: string;
  /** WhatsApp profile/contact name (WA only) — shown as the full name in the details panel */
  profileName?: string;
  /** Customer's full name from Facebook/Instagram Lead Form when unified with WhatsApp */
  leadName?: string;
  /** Original Meta channel (FB or IG) when a Lead Form conversation was unified into WhatsApp */
  metaChannel?: Channel;
  metaSenderId?: string;
  formPhone?: string;
  phone: string;
  agent: string;
  channel: Channel;
  inbox?: InboxScope;
  whatsappAccount?: InboxScope;
  isGroup?: boolean;
  profilePic?: string | null;
  status: "Open" | "Pending" | "Resolved";
  isArchived?: boolean;
  archivedAt?: string;
  archivedBy?: string;
  isDone?: boolean;
  doneAt?: string;
  doneBy?: string;
  unreadCount?: number;
  windowLeft?: string;
  pipeline: "New" | "Contacted" | "Qualified" | "Audition Booked" | "Attended" | "Enrolled" | "Joining Later" | "Unqualified" | "Lost" | "direct";
  source:
  | {
    campaign?: string;
    adset?: string;
    ad?: string;
    cashIn?: number;
    auditionBookedAt?: string;
    attendedAt?: string;
    enrolledAt?: string;
    paidAt?: string;
    [key: string]: any;
  }
  | string;
  notes?: string;
  followUpNote?: string;
  followUpDate?: string;
  followUpCompleted?: boolean;
  followUpCompletedAt?: string;
  auditionDate?: string;
  auditionBookedAt?: string;
  attendedAt?: string;
  enrolledAt?: string;
  paidAt?: string;
  bookedBy?: string;
  attendedBy?: string;
  enrolledBy?: string;
  formAnswers?: {
    instrument?: string;
    studentAge?: string;
    followUpNote?: string;
    notes?: string;
  };
  cashIn?: number;
  branch?: string;
  auditionOutcome?: string;
  followUpTags?: string[];
  labels?: string[];
  activityLog?: ActivityLogEntry[];
  claudeEnabled?: boolean;
  claudePaused?: boolean;
  claudePausedReason?: string;
  claudePausedAt?: string | null;
  claudeLastRepliedAt?: string | null;
  claudeLastError?: string;
  messages: Message[];
  createdAt?: string;
  updatedAt?: string;
  lastMessageAt?: number;
  lastMessageText?: string;
  lastMessageDirection?: "incoming" | "outgoing";
  lastOutgoingAt?: number;
  lastReadAt?: number;
  lastSeenAt?: number;
  groupParticipants?: GroupParticipant[];
  groupMeta?: GroupMetaInfo;
};

export type ActivityLogEntry = {
  id: string;
  type:
    | "message_sent"
    | "lead_assigned"
    | "stage_changed"
    | "audition_booked"
    | "audition_outcome"
    | "followup_scheduled"
    | "followup_completed"
    | "cash_recorded"
    | "note_updated"
    | "branch_changed";
  actor: string;
  actorRole?: string;
  summary: string;
  detail?: string;
  fromValue?: string;
  toValue?: string;
  timestamp: number;
};

export type BadgeCounts = {
  inbox: number;
  operationInbox: number;
  leads: number;
  auditions: number;
  followUps: number;
};

export type AssignableAgent = { name: string; role: string; email?: string; avatar?: string; active?: boolean };

export type CreateManualLeadInput = {
  phone: string;
  name?: string;
  referralType?: string;
  referredBy?: string;
  agent?: string;
  branch?: string;
  notes?: string;
  instrument?: string;
  inbox?: InboxScope;
};

export type CreateManualLeadResult = {
  ok: boolean;
  conversationId: string;
  existed: boolean;
  error?: string;
};

const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function normalizeWhatsAppPhone(raw: string): { digits: string; e164: string } | null {
  if (!raw) return null;
  const str = String(raw)
    .replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)));
  let d = str.replace(/\D/g, "");
  if (!d) return null;

  if (d.startsWith("00")) d = d.slice(2);

  if (d.length === 11 && /^01[0125]/.test(d)) {
    d = "20" + d.slice(1);
  } else if (d.length === 10 && /^1[0125]/.test(d)) {
    d = "20" + d;
  } else if (d.length === 13 && /^2001[0125]/.test(d)) {
    d = "20" + d.slice(3);
  } else if (d.length === 10 && d.startsWith("05")) {
    d = "966" + d.slice(1);
  } else if (d.length === 9 && d.startsWith("5")) {
    d = "966" + d;
  } else if (d.length === 13 && d.startsWith("96605")) {
    d = "966" + d.slice(4);
  } else if (d.length === 13 && d.startsWith("97105")) {
    d = "971" + d.slice(4);
  }

  if (d.length < 7 || d.length > 15) return null;
  return { digits: d, e164: `+${d}` };
}

type CRMContextType = {
  conversations: Conversation[];
  admissionsConversations: Conversation[];
  operationConversations: Conversation[];
  loading: boolean;
  badgeCounts: BadgeCounts;
  assignableAgents: AssignableAgent[];
  operationAssignableAgents: AssignableAgent[];
  teamMembers: AssignableAgent[];
  labels: LeadLabel[];
  labelsLoading: boolean;
  createLabel: (input: {
    name: string;
    color: LeadLabelColor;
  }) => Promise<{ ok: boolean; label?: LeadLabel; error?: string }>;
  updateLabel: (
    id: string,
    updates: { name?: string; color?: LeadLabelColor }
  ) => Promise<{ ok: boolean; label?: LeadLabel; error?: string }>;
  deleteLabel: (id: string) => Promise<{ ok: boolean; error?: string }>;
  refreshLabels: () => Promise<void>;
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
  openChat: (id: string) => void;
  patchConversation: (
    id: string,
    updates: Partial<Record<string, any>>
  ) => Promise<{ ok: boolean; error?: string }>;
  updateConversationClaude: (
    id: string,
    payload: {
      claudeEnabled?: boolean;
      claudePaused?: boolean;
      reason?: string;
      resetSession?: boolean;
      triggerReply?: boolean;
    }
  ) => Promise<{
    ok: boolean;
    error?: string;
    autoReplyTriggered?: boolean;
    autoReplySkippedReason?: string | null;
  }>;
  createManualLead: (input: CreateManualLeadInput) => Promise<CreateManualLeadResult>;
  markConversationAsRead: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  // Fix B: lets Pipeline pause the 3s poll during drag so it never races the PATCH
  setPollPaused: (paused: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  deleteConversation: (id: string) => Promise<void>;
  clearWhatsAppConversations: (inbox?: InboxScope) => Promise<void>;
  editMessage: (
    chatId: string,
    messageId: string,
    newText: string,
    options?: { mentions?: MessageMention[]; mentionAll?: boolean }
  ) => Promise<{ ok: boolean; error?: string }>;
  unsendMessage: (chatId: string, messageId: string) => Promise<{ ok: boolean; error?: string }>;
  reactToMessage: (chatId: string, messageId: string, emoji: string) => Promise<boolean>;
  addOptimisticMessages: (chatId: string, msgs: Message[]) => void;
  finalizeOptimisticMessages: (chatId: string, tempIds: string[], confirmedRawMessages?: any[]) => void;
  fetchChatMessages: (chatId: string) => Promise<void>;
  fetchGroupParticipants: (
    chatId: string,
    options?: { forceRefresh?: boolean }
  ) => Promise<{ participants: GroupParticipant[]; groupMeta?: GroupMetaInfo | null }>;
  fetchGroupMemberProfile: (
    groupId: string,
    participant: GroupParticipant
  ) => Promise<GroupMemberProfileInfo | null>;
  fetchGroupMemberAvatars: (
    groupId: string,
    participants: GroupParticipant[]
  ) => Promise<Record<string, { avatarUrl: string | null; about: string | null; aboutSetAt: number | null }>>;
  fetchConversationAvatar: (
    chatId: string,
    options?: { forceRefresh?: boolean }
  ) => Promise<string | null>;
  openGroupMemberChat: (
    groupId: string,
    participant: GroupParticipant,
    groupName?: string
  ) => Promise<{ ok: boolean; conversationId?: string; existed?: boolean; error?: string }>;
  pushSupported: boolean;
  pushEnabled: boolean;
  pushPermission: BrowserNotificationPermission;
  pushBusy: boolean;
  enableDevicePush: () => Promise<EnablePushResult>;
  disableDevicePush: () => Promise<void>;
  toggleDevicePush: () => Promise<EnablePushResult | { ok: true }>;
  testDevicePush: () => Promise<TestPushResult>;
};

const CRMContext = createContext<CRMContextType | undefined>(undefined);

const API = "/api";
const DIRECT_API = "https://api.tchaikovskyschool.com/crm-api";
const CACHE_KEY = "crm_conversations_cache_v3";
const V2_CACHE_KEY = "crm_conversations_cache_v2";
const LEGACY_CACHE_KEY = "crm_conversations_cache";
const MANUAL_LEADS_KEY = "crm_manual_leads_v1";
const IDB_NAME = "tchaikovsky_crm_cache_db";
const IDB_STORE = "conversations_store";
const IDB_KEY = "all_conversations_v1";

function openCacheIDB(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function saveConversationsToIDB(convs: Conversation[]): Promise<void> {
  const db = await openCacheIDB();
  if (!db) return;
  try {
    const payload = convs.map((c) => ({
      ...c,
      messages: [],
      source:
        c.source && typeof c.source === "object"
          ? { ...c.source, activityLog: undefined }
          : c.source,
    }));
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(payload, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

async function loadConversationsFromIDB(): Promise<Conversation[] | null> {
  const db = await openCacheIDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => {
        const res = req.result;
        if (Array.isArray(res) && res.length > 0) {
          resolve(res as Conversation[]);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function clearConversationsIDB(): Promise<void> {
  const db = await openCacheIDB();
  if (!db) return;
  try {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(IDB_KEY);
  } catch {}
}

function getStoredManualLeads(): Record<string, Conversation> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(MANUAL_LEADS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    }
  } catch {}
  return {};
}

function persistManualLeads(map: Record<string, Conversation>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MANUAL_LEADS_KEY, JSON.stringify(map));
  } catch {}
}

function slimConversationsForStorage(convs: Conversation[], limit?: number): Conversation[] {
  const sourceList = typeof limit === "number" ? convs.slice(0, limit) : convs;
  return sourceList.map((c) => {
    const cleanSource =
      c.source && typeof c.source === "object"
        ? { ...c.source, activityLog: undefined }
        : c.source;
    const item: Record<string, any> = {
      id: c.id,
      name: c.name || "",
      phone: c.phone || "",
      agent: c.agent || "Unassigned",
      channel: c.channel || "FB",
      status: c.status || "Open",
      windowLeft: c.windowLeft || "Active",
      pipeline: c.pipeline || "New",
      source: cleanSource || "direct",
      messages: [],
    };
    if (c._id) item._id = c._id;
    if (c.inbox) item.inbox = c.inbox;
    if (c.whatsappAccount) item.whatsappAccount = c.whatsappAccount;
    if (c.profileName) item.profileName = c.profileName;
    if (c.leadName) item.leadName = c.leadName;
    if (c.metaChannel) item.metaChannel = c.metaChannel;
    if (c.metaSenderId) item.metaSenderId = c.metaSenderId;
    if (c.formPhone) item.formPhone = c.formPhone;
    if (c.unreadCount) item.unreadCount = c.unreadCount;
    if (c.isArchived) item.isArchived = true;
    if (c.archivedAt) item.archivedAt = c.archivedAt;
    if (c.archivedBy) item.archivedBy = c.archivedBy;
    if (c.isDone) item.isDone = true;
    if (c.doneAt) item.doneAt = c.doneAt;
    if (c.doneBy) item.doneBy = c.doneBy;
    if (c.notes) item.notes = c.notes;
    if (c.followUpNote) item.followUpNote = c.followUpNote;
    if (c.followUpDate) item.followUpDate = c.followUpDate;
    if (c.followUpCompleted) item.followUpCompleted = c.followUpCompleted;
    if (c.followUpCompletedAt) item.followUpCompletedAt = c.followUpCompletedAt;
    if (c.auditionDate) item.auditionDate = c.auditionDate;
    if (c.auditionBookedAt) item.auditionBookedAt = c.auditionBookedAt;
    if (c.attendedAt) item.attendedAt = c.attendedAt;
    if (c.enrolledAt) item.enrolledAt = c.enrolledAt;
    if (c.paidAt) item.paidAt = c.paidAt;
    if (c.bookedBy) item.bookedBy = c.bookedBy;
    if (c.attendedBy) item.attendedBy = c.attendedBy;
    if (c.enrolledBy) item.enrolledBy = c.enrolledBy;
    if (c.auditionOutcome) item.auditionOutcome = c.auditionOutcome;
    if (c.followUpTags && c.followUpTags.length > 0) item.followUpTags = c.followUpTags;
    if (c.labels && c.labels.length > 0) item.labels = c.labels;
    if (c.branch) item.branch = c.branch;
    if (c.formAnswers && Object.keys(c.formAnswers).length > 0) item.formAnswers = c.formAnswers;
    if (c.cashIn) item.cashIn = c.cashIn;
    if (c.createdAt) item.createdAt = c.createdAt;
    if (c.updatedAt) item.updatedAt = c.updatedAt;
    if (c.lastMessageAt) item.lastMessageAt = c.lastMessageAt;
    if (c.lastMessageText) {
      item.lastMessageText = c.lastMessageText.length > 180 ? c.lastMessageText.slice(0, 180) : c.lastMessageText;
    }
    if (c.lastMessageDirection) item.lastMessageDirection = c.lastMessageDirection;
    if (c.lastOutgoingAt) item.lastOutgoingAt = c.lastOutgoingAt;
    if (c.lastReadAt) item.lastReadAt = c.lastReadAt;
    if (c.lastSeenAt) item.lastSeenAt = c.lastSeenAt;
    if (c.profilePic) item.profilePic = c.profilePic;
    return item as Conversation;
  });
}

function hydrateCachedConversationNames(c: Conversation): Conversation {
  const resolved = resolveConversationLeadNames({
    channel: c.channel,
    name: c.profileName || c.name,
    leadName: c.leadName,
    phone: c.phone,
    senderId: c.id,
    source: c.source,
  });
  return {
    ...c,
    name: resolved.name,
    leadName: resolved.leadName ?? c.leadName,
    profileName: resolved.profileName ?? c.profileName,
  };
}

function getCachedConversations(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    try {
      localStorage.removeItem(LEGACY_CACHE_KEY);
    } catch {}
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      try {
        localStorage.removeItem(V2_CACHE_KEY);
      } catch {}
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return (parsed as Conversation[]).map(hydrateCachedConversationNames);
      }
    }
    // Migrate from v2 ONLY if it holds the full dataset (> 250 items), otherwise purge the truncated 250-item v2 cache
    const v2Raw = localStorage.getItem(V2_CACHE_KEY);
    if (v2Raw) {
      localStorage.removeItem(V2_CACHE_KEY);
      const v2Parsed = JSON.parse(v2Raw);
      if (Array.isArray(v2Parsed) && v2Parsed.length > 250) {
        const migrated = slimConversationsForStorage(v2Parsed);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(migrated));
        } catch {}
        return migrated.map(hydrateCachedConversationNames);
      }
    }
  } catch (e) {
    console.warn("Failed to read CRM conversations cache:", e);
  }
  return [];
}

let cachePersistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingCacheSnapshot: Conversation[] | null = null;

function flushCacheSnapshotSync() {
  if (typeof window === "undefined" || !pendingCacheSnapshot) return;
  const snapshot = pendingCacheSnapshot;
  pendingCacheSnapshot = null;
  if (cachePersistTimer !== null) {
    clearTimeout(cachePersistTimer);
    cachePersistTimer = null;
  }
  try {
    localStorage.removeItem(LEGACY_CACHE_KEY);
    localStorage.removeItem(V2_CACHE_KEY);
    const slimmed = slimConversationsForStorage(snapshot);
    localStorage.setItem(CACHE_KEY, JSON.stringify(slimmed));
  } catch {
    try {
      const fallbackSlim = slimConversationsForStorage(snapshot, 1500);
      localStorage.setItem(CACHE_KEY, JSON.stringify(fallbackSlim));
    } catch {}
  }
  saveConversationsToIDB(snapshot).catch(() => {});
}

function persistConversationsCache(convs: Conversation[], immediate = false) {
  if (typeof window === "undefined") return;
  pendingCacheSnapshot = convs;
  if (immediate) {
    flushCacheSnapshotSync();
    return;
  }
  if (cachePersistTimer !== null) return;
  cachePersistTimer = setTimeout(() => {
    cachePersistTimer = null;
    flushCacheSnapshotSync();
  }, 120);
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", flushCacheSnapshotSync);
  window.addEventListener("pagehide", flushCacheSnapshotSync);
}

function getCachedLabels(): LeadLabel[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LABELS_CACHE_KEY);
    if (!raw) return [];
    return normalizeLeadLabelCatalog(JSON.parse(raw));
  } catch {
    return [];
  }
}

function persistLabelsCache(nextLabels: LeadLabel[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LABELS_CACHE_KEY, JSON.stringify(nextLabels));
  } catch {}
}

const UTC_ISO_DATETIME_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|1\d|2[0-8])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,3})?Z$/;

function safeDateIso(val: any): string {
  if (!val) return "";
  if (typeof val === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
    if (UTC_ISO_DATETIME_RE.test(val)) return val.slice(0, 10);
  }
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function getLocalTodayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Conversations the Meta App Review account (test@meta.com) is allowed to see.
// Mohamed Mahmoud = Facebook Messenger tester, human__mohammed = Instagram tester.
const REVIEWER_ALLOWED_IDS = ["38872315812412151", "980963625060203"];
const REVIEWER_ALLOWED_NAMES = ["mohamed mahmoud", "human__mohammed"];

function isReviewerAllowedConversation(c: any): boolean {
  if (!c) return false;
  const sId = String(c.id || c.senderId || "");
  const mId = String(c.metaSenderId || "");
  if (REVIEWER_ALLOWED_IDS.includes(sId) || REVIEWER_ALLOWED_IDS.includes(mId)) return true;
  const norm = (s: any) => (typeof s === "string" ? s.toLowerCase().trim() : "");
  const fields = [norm(c.name), norm(c.leadName), norm(c.profileName)];
  return REVIEWER_ALLOWED_NAMES.some((target) => fields.some((f) => f.includes(target)));
}

type PendingPatchEntry = {
  updates: Partial<Record<string, any>>;
  expiresAt: number;
  patchedAt?: number;
  confirmedUpdatedAt?: number;
};

/** Determines whether an optimistic patch guard should still overlay incoming server metadata. */
function resolvePendingPatchState(
  pending: PendingPatchEntry | undefined,
  remoteUpdatedAt: unknown,
  now = Date.now()
): { keepOptimistic: boolean; shouldEvict: boolean } {
  if (!pending) return { keepOptimistic: false, shouldEvict: false };
  if (now > pending.expiresAt) return { keepOptimistic: false, shouldEvict: true };
  if (!pending.confirmedUpdatedAt) return { keepOptimistic: true, shouldEvict: false };

  const remoteTs = remoteUpdatedAt ? Date.parse(String(remoteUpdatedAt)) : 0;
  if (!Number.isFinite(remoteTs) || remoteTs <= 0) {
    return { keepOptimistic: true, shouldEvict: false };
  }
  if (remoteTs >= pending.confirmedUpdatedAt) {
    return { keepOptimistic: false, shouldEvict: true };
  }
  return { keepOptimistic: true, shouldEvict: false };
}

export function CRMProvider({ children }: { children: React.ReactNode }) {
  const { isReadOnly, canManageTeam, token, user, authFetch, closeSession, verifySession } = useAuth();
  const isMetaReviewer = Boolean(
    user?.email && user.email.toLowerCase().trim() === "test@meta.com"
  );

  // Hydrate instantly from cache so dashboard/reports/pipeline appear in 0ms (no loading spinner),
  // strictly filtering by the signed-in role's authorized inboxes so prior sessions never bleed through.
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const cached = getCachedConversations();
    const roleFiltered =
      typeof window !== "undefined" && user?.role
        ? cached.filter(
            (c) =>
              canAccessConversationInboxData(user.role, resolveConvInboxMode(c)) &&
              (normalizeRole(user.role) !== "enrollment_director" ||
                canUserViewConversationInStore(c, user))
          )
        : cached;
    if (typeof window !== "undefined" && user?.email?.toLowerCase().trim() === "test@meta.com") {
      return roleFiltered.filter(isReviewerAllowedConversation);
    }
    return roleFiltered;
  });

  useEffect(() => {
    setConversations((prev) => {
      let next = prev;
      if (user?.role) {
        next = next.filter((c) => canAccessConversationInboxData(user.role, resolveConvInboxMode(c)));
        if (normalizeRole(user.role) === "enrollment_director") {
          next = next.filter((c) => canUserViewConversationInStore(c, user));
        }
      }
      if (isMetaReviewer) {
        next = next.filter(isReviewerAllowedConversation);
      }
      return next.length === prev.length ? prev : next;
    });
  }, [isMetaReviewer, user]);
  const [loading, setLoading] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return false;
      }
    } catch {}
    return true;
  });
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [assignableAgents, setAssignableAgents] = useState<AssignableAgent[]>([]);
  const [operationAssignableAgents, setOperationAssignableAgents] = useState<AssignableAgent[]>([]);
  const [teamMembers, setTeamMembers] = useState<AssignableAgent[]>([]);
  const [labels, setLabels] = useState<LeadLabel[]>(() => getCachedLabels());
  const [labelsLoading, setLabelsLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [pushSupported, setPushSupported] = useState<boolean>(false);
  const [pushEnabled, setPushEnabled] = useState<boolean>(false);
  const [pushPermission, setPushPermission] = useState<BrowserNotificationPermission>("default");
  const [pushBusy, setPushBusy] = useState<boolean>(false);

  // ── Refs for stable closures (never cause re-creation of callbacks) ──
  const activeChatIdRef = useRef<string | null>(null);
  const conversationsRef = useRef<Conversation[]>(conversations);
  conversationsRef.current = conversations;
  const initialLoadDone = useRef(false);
  const pushEndpointRef = useRef<string | null>(null);

  // Sync device push notification preference across browser storage & tabs
  useEffect(() => {
    let cancelled = false;
    const supported = isPushSupported();
    const perm = getBrowserNotificationPermission();
    const optIn = readPushOptInPreference();
    queueMicrotask(() => {
      if (!cancelled) {
        setPushSupported(supported);
        setPushPermission(perm);
        setPushEnabled(supported && perm === "granted" && optIn);
      }
    });

    const handleStorage = (e: StorageEvent) => {
      if (e.key !== PUSH_PREF_KEY) return;
      const nextPerm = getBrowserNotificationPermission();
      const nextOptIn = readPushOptInPreference();
      const active = isPushSupported() && nextPerm === "granted" && nextOptIn;
      setPushPermission(nextPerm);
      setPushEnabled(active);
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const canUseInboxPush = Boolean(
    token &&
      (canAccessRoute(user?.role, "/") || canAccessRoute(user?.role, "/operation-inbox"))
  );

  // Sync existing Web Push subscription for signed-in Inbox-authorized staff
  useEffect(() => {
    if (!canUseInboxPush || typeof window === "undefined") {
      pushEndpointRef.current = null;
      return;
    }

    let cancelled = false;

    syncActivePushSubscription(authFetch).then((endpoint) => {
      if (cancelled) return;
      const perm = getBrowserNotificationPermission();
      setPushPermission(perm);
      if (endpoint) {
        pushEndpointRef.current = endpoint;
        setPushEnabled(true);
      } else {
        pushEndpointRef.current = null;
        setPushEnabled(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [canUseInboxPush, authFetch]);

  const enableDevicePush = useCallback(async (): Promise<EnablePushResult> => {
    setPushBusy(true);
    try {
      const res = await enableDevicePushNotifications(authFetch);
      setPushPermission(res.permission);
      if (res.ok && res.endpoint) {
        pushEndpointRef.current = res.endpoint;
        setPushEnabled(true);
      } else if (res.permission === "denied") {
        setPushEnabled(false);
      }
      return res;
    } finally {
      setPushBusy(false);
    }
  }, [authFetch]);

  const disableDevicePush = useCallback(async (): Promise<void> => {
    setPushBusy(true);
    try {
      await disableDevicePushNotifications(authFetch);
      pushEndpointRef.current = null;
      setPushEnabled(false);
      setPushPermission(getBrowserNotificationPermission());
    } finally {
      setPushBusy(false);
    }
  }, [authFetch]);

  const toggleDevicePush = useCallback(async (): Promise<EnablePushResult | { ok: true }> => {
    if (pushEnabled) {
      await disableDevicePush();
      return { ok: true };
    }
    return enableDevicePush();
  }, [pushEnabled, disableDevicePush, enableDevicePush]);

  const testDevicePush = useCallback(async (): Promise<TestPushResult> => {
    setPushBusy(true);
    try {
      let endpoint = pushEndpointRef.current;
      if (!endpoint) {
        const enableRes = await enableDevicePushNotifications(authFetch);
        setPushPermission(enableRes.permission);
        if (!enableRes.ok || !enableRes.endpoint) {
          return {
            ok: false,
            error: enableRes.error || "Enable device notifications before running a test.",
          };
        }
        endpoint = enableRes.endpoint;
        pushEndpointRef.current = endpoint;
        setPushEnabled(true);
      }
      return await sendTestDevicePush(authFetch, endpoint);
    } finally {
      setPushBusy(false);
    }
  }, [authFetch]);

  // Keep the ref in sync with state
  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  // If cached data was loaded, mark initial load as completed immediately
  useEffect(() => {
    if (conversations.length > 0) {
      initialLoadDone.current = true;
    }
  }, [conversations.length]);

  // Hydrate full untruncated dataset (including all activityLog entries) from IndexedDB on mount (~5ms)
  useEffect(() => {
    if (isMetaReviewer) return;
    let cancelled = false;
    loadConversationsFromIDB().then((idbConvs) => {
      if (cancelled || !idbConvs || idbConvs.length === 0) return;
      const authorizedIdb = user?.role
        ? idbConvs.filter(
            (c) =>
              canAccessConversationInboxData(user.role, resolveConvInboxMode(c)) &&
              (normalizeRole(user.role) !== "enrollment_director" ||
                canUserViewConversationInStore(c, user))
          )
        : idbConvs;
      if (authorizedIdb.length === 0) return;
      // Only apply IDB snapshot if live server fetch hasn't already populated full activityLog data
      if (lastServerRevRef.current > 0 && conversationsRef.current.length >= authorizedIdb.length) {
        return;
      }
      setConversations((prev) => {
        if (prev.length === 0) {
          return authorizedIdb.map((c) =>
            hydrateCachedConversationNames({
              ...c,
              messages: messagesCacheRef.current.get(c.id) || c.messages || [],
            })
          );
        }
        const idbMap = new Map<string, Conversation>(
          authorizedIdb.map((c) => [c.id, hydrateCachedConversationNames(c)])
        );
        const existingIds = new Set<string>();
        const mergedExisting = prev.map((current) => {
          existingIds.add(current.id);
          const idbC = idbMap.get(current.id);
          if (!idbC) return current;
          return {
            ...current, // Preserve newer in-memory/localStorage fields without resurrecting cleared fields from IDB
            activityLog:
              Array.isArray(idbC.activityLog) && idbC.activityLog.length > (current.activityLog?.length || 0)
                ? idbC.activityLog
                : current.activityLog,
            messages: messagesCacheRef.current.get(current.id) || current.messages || [],
          };
        });
        const overflowFromIdb = authorizedIdb
          .filter((c) => !existingIds.has(c.id))
          .map((c) =>
            hydrateCachedConversationNames({
              ...c,
              messages: messagesCacheRef.current.get(c.id) || c.messages || [],
            })
          );
        return overflowFromIdb.length > 0
          ? [...mergedExisting, ...overflowFromIdb]
          : mergedExisting;
      });
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isMetaReviewer, user?.role]);

  // Fix B: when true the 3s poll is silently skipped (set during drag + 3s after drop)
  const pollPausedRef = useRef(false);
  const setPollPaused = useCallback((paused: boolean) => {
    pollPausedRef.current = paused;
  }, []);
  const router = useRouter();
  const pathname = usePathname() || "/";
  const currentScreenRef = useRef<string>(pathname);
  const lastReportedScreenRef = useRef<string>("");
  const sendPresenceRef = useRef<
    ((event: "open" | "ping" | "navigate" | "focus" | "blur" | "leave", keepalive?: boolean) => void) | null
  >(null);
  const resetPresenceIdleRef = useRef<(() => void) | null>(null);

  // ── Fetch assignable agents and full team list (cached on backend, invalidated on team_updated SSE) ──
  const fetchAgents = useCallback(async () => {
    try {
      const mergedMap = new Map<string, AssignableAgent>();
      const addMember = (m: any) => {
        if (!m || !m.name) return;
        const cleanName = String(m.name).trim();
        if (!cleanName) return;
        const key = cleanName.toLowerCase();
        mergedMap.set(key, {
          name: cleanName,
          role: String(m.role || "admission_officer").toLowerCase().trim(),
          email: m.email ? String(m.email) : undefined,
          avatar: m.avatar ? String(m.avatar) : undefined,
          active: m.active !== false,
        });
      };

      // 1. Fetch active + deactivated staff list configured in Settings
      let res = await authFetch(`${API}/messages/agents?all=1&includeInactive=1`, { cache: "no-store" }).catch(() => null);
      if (!res || (!res.ok && res.status !== 401 && res.status !== 403)) {
        res = await authFetch(`${DIRECT_API}/messages/agents?all=1&includeInactive=1`, { cache: "no-store" }).catch(() => null);
      }
      if (res && res.status === 401) return;
      if (res && res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.success && Array.isArray(data.data)) {
          data.data.forEach(addMember);
        }
      }

      // 2. If authenticated with team management rights (Chairman/Director), fetch full users list so all roles and deactivated accounts are included
      if (token && canManageTeam) {
        try {
          const usersRes = await authFetch(`${API}/auth/users`, {
            cache: "no-store",
          });
          if (usersRes.ok) {
            const usersData = await usersRes.json().catch(() => null);
            if (usersData?.success && Array.isArray(usersData.users)) {
              usersData.users.forEach(addMember);
            }
          }
        } catch {}
      }

      if (mergedMap.size > 0) {
        const allMembers = Array.from(mergedMap.values()).sort((a, b) =>
          (a.active !== false) === (b.active !== false) ? 0 : a.active !== false ? -1 : 1
        );
        setTeamMembers(allMembers);

        const filtered = allMembers.filter(
          (a: AssignableAgent) => a.active !== false && isAssignableRole(a.role)
        );
        setAssignableAgents(filtered);

        const opFiltered = allMembers.filter(
          (a: AssignableAgent) => a.active !== false && isAssignableForInbox(a.role, "operation")
        );
        setOperationAssignableAgents(opFiltered);
      }
    } catch (e) {
      console.warn("Failed to load assignable agents:", e);
    }
  }, [token, canManageTeam, authFetch]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const fetchLabels = useCallback(async () => {
    if (!token) return;
    setLabelsLoading(true);
    try {
      let res = await authFetch(`${API}/labels`, { cache: "no-store" }).catch(() => null);
      if (!res || (!res.ok && res.status !== 401 && res.status !== 403 && res.status !== 404)) {
        res = await authFetch(`${DIRECT_API}/labels`, { cache: "no-store" }).catch(() => null);
      }
      if (!res || !res.ok) return;
      const json = await res.json().catch(() => null);
      if (json?.success && Array.isArray(json.data)) {
        const normalized = normalizeLeadLabelCatalog(json.data);
        setLabels(normalized);
        persistLabelsCache(normalized);
      }
    } catch (e) {
      console.warn("Failed to load lead labels:", e);
    } finally {
      setLabelsLoading(false);
    }
  }, [token, authFetch]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        void fetchLabels();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [token, fetchLabels]);

  const createLabel = useCallback(
    async (input: { name: string; color: LeadLabelColor }): Promise<{ ok: boolean; label?: LeadLabel; error?: string }> => {
      if (isReadOnly) {
        return { ok: false, error: "View-only account: modifications are disabled." };
      }
      try {
        const res = await authFetch(`${API}/labels`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success || !json?.data) {
          return { ok: false, error: json?.error || "Could not create label. Please try again." };
        }
        const normalizedList = normalizeLeadLabelCatalog([json.data]);
        const created = normalizedList[0];
        if (!created) {
          return { ok: false, error: "Invalid label response from server." };
        }
        setLabels((prev) => {
          const next = prev.some((l) => l.id === created.id)
            ? prev.map((l) => (l.id === created.id ? created : l))
            : [...prev, created];
          persistLabelsCache(next);
          return next;
        });
        return { ok: true, label: created };
      } catch {
        return { ok: false, error: "Network error while creating label. Please try again." };
      }
    },
    [isReadOnly, authFetch]
  );

  const updateLabel = useCallback(
    async (
      id: string,
      updates: { name?: string; color?: LeadLabelColor }
    ): Promise<{ ok: boolean; label?: LeadLabel; error?: string }> => {
      if (isReadOnly) {
        return { ok: false, error: "View-only account: modifications are disabled." };
      }
      try {
        const res = await authFetch(`${API}/labels/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success || !json?.data) {
          return { ok: false, error: json?.error || "Could not update label. Please try again." };
        }
        const normalizedList = normalizeLeadLabelCatalog([json.data]);
        const updated = normalizedList[0];
        if (!updated) {
          return { ok: false, error: "Invalid label response from server." };
        }
        setLabels((prev) => {
          const next = prev.map((l) => (l.id === id ? updated : l));
          persistLabelsCache(next);
          return next;
        });
        return { ok: true, label: updated };
      } catch {
        return { ok: false, error: "Network error while updating label. Please try again." };
      }
    },
    [isReadOnly, authFetch]
  );

  const deleteLabel = useCallback(
    async (id: string): Promise<{ ok: boolean; error?: string }> => {
      if (isReadOnly) {
        return { ok: false, error: "View-only account: modifications are disabled." };
      }
      try {
        const res = await authFetch(`${API}/labels/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          return { ok: false, error: json?.error || "Could not delete label. Please try again." };
        }
        setLabels((prev) => {
          const next = prev.filter((l) => l.id !== id);
          persistLabelsCache(next);
          return next;
        });
        // Immediately drop the deleted label ID from cached/in-memory conversations
        for (const [cId, pending] of pendingPatchesRef.current.entries()) {
          if (Array.isArray(pending.updates.labels) && pending.updates.labels.includes(id)) {
            pendingPatchesRef.current.set(cId, {
              ...pending,
              updates: {
                ...pending.updates,
                labels: pending.updates.labels.filter((lId: string) => lId !== id),
              },
            });
          }
        }
        setConversations((prev) => {
          let changed = false;
          const next = prev.map((c) => {
            if (!Array.isArray(c.labels) || !c.labels.includes(id)) return c;
            changed = true;
            return { ...c, labels: c.labels.filter((lId) => lId !== id) };
          });
          if (changed) {
            persistConversationsCache(next);
            return next;
          }
          return prev;
        });
        return { ok: true };
      } catch {
        return { ok: false, error: "Network error while deleting label. Please try again." };
      }
    },
    [isReadOnly, authFetch]
  );

  // ── Messages, avatars & group participant caches: live outside React state so slim polls never wipe them ──
  const messagesCacheRef = useRef<Map<string, Message[]>>(new Map());
  const profilePicCacheRef = useRef<Map<string, string>>(new Map());
  const lastReadAtRef = useRef<Map<string, number>>(new Map());
  const groupParticipantsCacheRef = useRef<
    Map<string, { participants: GroupParticipant[]; groupMeta?: GroupMetaInfo }>
  >(new Map());

  // Normalize raw API data to CRM Conversation model (without messages)
  const normalizeConversationMeta = useCallback((c: any): Omit<Conversation, "messages"> => {
    const resolvedNames = resolveConversationLeadNames(c);
    const resolvedInbox = resolveConvInboxMode(c);
    const groupConv = isGroupConversation(c);
    const rawProfilePic =
      typeof c.profilePic === "string" && /^https?:\/\//i.test(c.profilePic.trim())
        ? c.profilePic.trim()
        : undefined;
    return {
      id: c.senderId,
      _id: c._id ? String(c._id) : undefined,
      inbox: resolvedInbox,
      whatsappAccount: resolvedInbox,
      isGroup: groupConv,
      profilePic: rawProfilePic,
      name: resolvedNames.name,
      profileName: resolvedNames.profileName,
      leadName: resolvedNames.leadName,
      metaChannel: (c.metaChannel as Channel) || undefined,
      metaSenderId: c.metaSenderId || undefined,
      formPhone: c.formPhone || undefined,
      phone: (() => {
        if (groupConv) return "";
        if (c.phone && /^\+\d{7,15}$/.test(c.phone)) return c.phone;
        if (c.formPhone) {
          const fDigits = String(c.formPhone).replace(/\D/g, "");
          if (fDigits.length >= 7 && fDigits.length <= 15) return `+${fDigits}`;
        }
        if (c.channel === "WA") {
          const digits = String(c.senderId || "")
            .replace(/^op_/, "")
            .replace(/\D/g, "");
          if (digits.length >= 7 && digits.length <= 13) return `+${digits}`;
        }
        return c.phone || `Live ${c.channel}`;
      })(),
      agent: c.agent || "Unassigned",
      channel: (c.channel as Channel) || "FB",
      status: c.status || "Open",
      isArchived: Boolean(c.isArchived),
      archivedAt: c.archivedAt ? String(c.archivedAt) : undefined,
      archivedBy: c.archivedBy ? String(c.archivedBy) : undefined,
      isDone: !Boolean(c.isArchived) && Boolean(c.isDone),
      doneAt: !Boolean(c.isArchived) && c.doneAt ? String(c.doneAt) : undefined,
      doneBy: !Boolean(c.isArchived) && c.doneBy ? String(c.doneBy) : undefined,
      unreadCount: (() => {
        const rawUnread = Number(c.unreadCount) || 0;
        if (rawUnread > 0) return rawUnread;
        const hasText = Boolean(c.lastMessageText && String(c.lastMessageText).trim());
        const isIncomingLast = c.lastMessageDirection === "incoming";
        const lastMsgTs = Number(c.lastMessageAt) || 0;
        const lastOutTs = Number(c.lastOutgoingAt) || 0;
        if (hasText && isIncomingLast && (!lastOutTs || lastMsgTs > lastOutTs)) {
          return 1;
        }
        return 0;
      })(),
      windowLeft: "Active",
      pipeline:
        c.auditionOutcome === "joining-later" && (!c.pipeline || c.pipeline === "Contacted" || c.pipeline === "Qualified" || c.pipeline === "New")
          ? "Joining Later"
          : c.pipeline || "New",
      source: c.source || "direct",
      notes: c.notes || "",
      followUpNote: c.followUpNote || "",
      followUpDate: safeDateIso(c.followUpDate),
      followUpCompleted: Boolean(c.followUpCompleted),
      followUpCompletedAt: safeDateIso(c.followUpCompletedAt),
      auditionDate: safeDateIso(c.auditionDate) || (c.pipeline === "Audition Booked" ? safeDateIso(c.followUpDate) : ""),
      auditionBookedAt: c.auditionBookedAt || (typeof c.source === "object" && c.source?.auditionBookedAt ? String(c.source.auditionBookedAt) : undefined),
      attendedAt: c.attendedAt || (typeof c.source === "object" && c.source?.attendedAt ? String(c.source.attendedAt) : undefined),
      enrolledAt: c.enrolledAt || (typeof c.source === "object" && c.source?.enrolledAt ? String(c.source.enrolledAt) : undefined),
      paidAt: c.paidAt || (typeof c.source === "object" && c.source?.paidAt ? String(c.source.paidAt) : undefined),
      bookedBy: c.bookedBy || (typeof c.source === "object" && c.source?.bookedBy ? String(c.source.bookedBy) : undefined),
      attendedBy: c.attendedBy || (typeof c.source === "object" && c.source?.attendedBy ? String(c.source.attendedBy) : undefined),
      enrolledBy: c.enrolledBy || (typeof c.source === "object" && c.source?.enrolledBy ? String(c.source.enrolledBy) : undefined),
      auditionOutcome: c.auditionOutcome || "",
      followUpTags: Array.isArray(c.followUpTags) ? c.followUpTags : [],
      labels: normalizeConversationLabelIds(c.labels),
      activityLog: (() => {
        const topLog = Array.isArray(c.activityLog) ? c.activityLog : [];
        const srcLog = typeof c.source === "object" && Array.isArray(c.source?.activityLog) ? c.source.activityLog : [];
        if (topLog.length === 0 && srcLog.length === 0) return [];
        const normalizeEntry = (entry: any): ActivityLogEntry => ({
          id: String(entry.id),
          type: entry.type,
          actor: String(entry.actor || "Staff"),
          actorRole: entry.actorRole ? String(entry.actorRole) : undefined,
          summary: String(entry.summary || ""),
          detail: entry.detail ? String(entry.detail) : undefined,
          fromValue: entry.fromValue ? String(entry.fromValue) : undefined,
          toValue: entry.toValue ? String(entry.toValue) : undefined,
          timestamp: Number(entry.timestamp) || Date.now(),
        });
        if (srcLog.length === 0 && topLog.length === 1) {
          const single = topLog[0];
          return single && single.id && single.type ? [normalizeEntry(single)] : [];
        }
        const out: ActivityLogEntry[] = [];
        const indexById = new Map<string, number>();
        let isDescending = true;
        let prevTs = Infinity;
        const appendList = (list: any[]) => {
          for (let i = 0; i < list.length; i++) {
            const entry = list[i];
            if (!entry || !entry.id || !entry.type) continue;
            const norm = normalizeEntry(entry);
            const existingIdx = indexById.get(norm.id);
            if (existingIdx !== undefined) {
              out[existingIdx] = norm;
              isDescending = false;
            } else {
              if (norm.timestamp > prevTs) isDescending = false;
              prevTs = norm.timestamp;
              indexById.set(norm.id, out.length);
              out.push(norm);
            }
          }
        };
        if (srcLog.length > 0) appendList(srcLog);
        if (topLog.length > 0) appendList(topLog);
        return isDescending ? out : out.sort((a, b) => b.timestamp - a.timestamp);
      })(),
      branch: c.branch || "",
      formAnswers: c.formAnswers || {},
      cashIn: (() => {
        const topCash = Number(c.cashIn) || 0;
        if (topCash > 0) return topCash;
        if (typeof c.source === "object" && c.source?.cashIn !== undefined && c.source?.cashIn !== null) {
          return Number(c.source.cashIn) || 0;
        }
        if (typeof window !== "undefined") {
          const local = localStorage.getItem(`crm_cash_${c.senderId || c._id}`);
          if (local !== null) return Number(local) || 0;
        }
        return topCash;
      })(),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      lastMessageAt: c.lastMessageAt || (c.updatedAt ? new Date(c.updatedAt).getTime() : undefined) || (c.createdAt ? new Date(c.createdAt).getTime() : undefined),
      lastMessageText: c.lastMessageText ? String(c.lastMessageText) : undefined,
      lastMessageDirection: c.lastMessageDirection === "outgoing" ? "outgoing" : c.lastMessageDirection === "incoming" ? "incoming" : undefined,
      lastOutgoingAt: c.lastOutgoingAt ? Number(c.lastOutgoingAt) : undefined,
      lastReadAt: c.lastReadAt ? Number(c.lastReadAt) : undefined,
      lastSeenAt: c.lastSeenAt,
      claudeEnabled: Boolean(c.claudeEnabled),
      claudePaused: Boolean(c.claudePaused),
      claudePausedReason: typeof c.claudePausedReason === "string" ? c.claudePausedReason : "",
      claudePausedAt: c.claudePausedAt ? String(c.claudePausedAt) : null,
      claudeLastRepliedAt: c.claudeLastRepliedAt ? String(c.claudeLastRepliedAt) : null,
      claudeLastError: typeof c.claudeLastError === "string" ? c.claudeLastError : "",
      groupParticipants: Array.isArray(c.groupParticipants) ? c.groupParticipants : undefined,
      groupMeta: c.groupMeta || undefined,
    };
  }, []);

  // Normalize raw messages array
  const normalizeMessages = useCallback((rawMessages: any[]): Message[] => {
    return (rawMessages || []).map((m: any) => ({
      id: m.messageId,
      text: m.text || "",
      attachments: m.attachments || [],
      time: m.timestamp
        ? new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "",
      timestamp: m.timestamp,
      isIncoming: m.direction === "incoming",
      status: m.status || (m.direction === "outgoing" ? (m.seenAt ? "read" : "sent") : undefined),
      seenAt: m.seenAt || undefined,
      deliveredAt: m.deliveredAt || undefined,
      isRead: m.status === "read" || Boolean(m.seenAt),
      senderName: m.senderName || undefined,
      isEdited: Boolean(m.isEdited),
      editedAt: m.editedAt || undefined,
      isDeleted: Boolean(m.isDeleted),
      deletedAt: m.deletedAt || undefined,
      deletedBy:
        (m.deletedBy && m.deletedBy !== "Staff"
          ? m.deletedBy
          : m.direction === "outgoing" && m.senderName && m.senderName !== "Staff"
          ? m.senderName
          : m.deletedBy) || undefined,
      reactions: Array.isArray(m.reactions) ? m.reactions : [],
      mentions: Array.isArray(m.mentions) ? m.mentions : undefined,
      mentionAll: Boolean(m.mentionAll),
      replyTo: m.replyTo
        ? {
            id: String(m.replyTo.id || m.replyTo.messageId),
            text: m.replyTo.text || "",
            senderName: m.replyTo.senderName || undefined,
            isIncoming: Boolean(m.replyTo.isIncoming),
          }
        : undefined,
    }));
  }, []);

  // Track pending optimistic updates so periodic background polling does not overwrite recently moved/updated leads
  const pendingPatchesRef = useRef<Map<string, PendingPatchEntry>>(new Map());

  // Track recently created/opened manual leads so in-flight background polls can NEVER wipe them out before server sync settles
  const recentlyCreatedRef = useRef<Map<string, { conv: Conversation; expiresAt: number }>>(new Map());
  const deletedIdsRef = useRef<Set<string>>(new Set());
  const lastServerRevRef = useRef<number>(0);
  const fetchConversationsInflightRef = useRef<Promise<void> | null>(null);
  const fetchConversationsQueuedRef = useRef<boolean>(false);

  // ── Slim bulk fetch — metadata only, never touches messages ──
  const runFetchConversations = useCallback(async () => {
    // Fix B: skip this poll cycle if a drag is in progress or we're in the post-drop quiet window
    if (pollPausedRef.current) return;
    try {
      const canUseDeltaRev =
        lastServerRevRef.current > 0 &&
        conversationsRef.current.length > 250 &&
        pendingPatchesRef.current.size === 0 &&
        recentlyCreatedRef.current.size === 0;
      const revQuery = canUseDeltaRev ? `&rev=${lastServerRevRef.current}` : "";
      let res = await authFetch(`${API}/messages?slim=1${revQuery}`, {
        cache: "no-store",
      }).catch(() => null);
      if (!res || (!res.ok && res.status !== 401 && res.status !== 403)) {
        res = await authFetch(`https://api.tchaikovskyschool.com/crm-api/messages?slim=1${revQuery}`, {
          cache: "no-store",
        }).catch(() => null);
      }
      if (!res || !res.ok) return;
      const json = await res.json().catch(() => null);
      if (json?.unchanged === true) {
        return;
      }
      if (json?.success && Array.isArray(json.data)) {
        if (typeof json.rev === "number") {
          lastServerRevRef.current = json.rev;
        }
        const now = Date.now();

        const rawList = isMetaReviewer
          ? json.data.filter(isReviewerAllowedConversation)
          : json.data;

        const parsed: Conversation[] = rawList
          .filter((c: any) => !deletedIdsRef.current.has(String(c.senderId || c.id || "")))
          .map((c: any) => {
            const meta = normalizeConversationMeta(c);
            let cachedMessages = messagesCacheRef.current.get(meta.id) || [];
            if (meta.groupParticipants && meta.groupParticipants.length > 0) {
              groupParticipantsCacheRef.current.set(meta.id, {
                participants: meta.groupParticipants,
                groupMeta: meta.groupMeta,
              });
            }
            if (meta.profilePic) {
              profilePicCacheRef.current.set(meta.id, meta.profilePic);
            }
            const preservedProfilePic =
              meta.profilePic ?? profilePicCacheRef.current.get(meta.id);
            const isOpConv = resolveConvInboxMode(meta) === "operation";
            if (isOpConv && meta.lastReadAt) {
              const prevReadRef = lastReadAtRef.current.get(meta.id) || 0;
              if (meta.lastReadAt > prevReadRef) {
                lastReadAtRef.current.set(meta.id, meta.lastReadAt);
              }
            }
            const effectiveReadAt = isOpConv
              ? Math.max(meta.lastReadAt || 0, lastReadAtRef.current.get(meta.id) || 0) || undefined
              : undefined;
            const cachedGroup = groupParticipantsCacheRef.current.get(meta.id);
            const preservedParticipants = meta.groupParticipants ?? cachedGroup?.participants;
            const preservedGroupMeta =
              meta.groupMeta && !meta.groupMeta.avatarUrl && cachedGroup?.groupMeta?.avatarUrl
                ? { ...meta.groupMeta, avatarUrl: cachedGroup.groupMeta.avatarUrl }
                : meta.groupMeta ?? cachedGroup?.groupMeta;
            // Evict stale cached messages for inactive chats if the server has a newer message timestamp
            if (cachedMessages.length > 0 && meta.id !== activeChatIdRef.current) {
              const lastCachedTs = cachedMessages[cachedMessages.length - 1]?.timestamp || 0;
              if ((meta.lastMessageAt || 0) > lastCachedTs + 1000) {
                messagesCacheRef.current.delete(meta.id);
                cachedMessages = [];
              }
            }
            const pending = pendingPatchesRef.current.get(meta.id);
            const { keepOptimistic, shouldEvict } = resolvePendingPatchState(pending, meta.updatedAt, now);
            if (shouldEvict) {
              pendingPatchesRef.current.delete(meta.id);
            } else if (keepOptimistic && pending) {
              // Maintain optimistic updates so stale in-flight server poll data never reverts card position
              const mergedMeta = {
                ...meta,
                ...pending.updates,
                profilePic: preservedProfilePic,
                lastReadAt: effectiveReadAt,
                groupParticipants: preservedParticipants,
                groupMeta: preservedGroupMeta,
                lastMessageAt: Math.max(meta.lastMessageAt || 0, pending.updates.lastMessageAt || 0),
                messages: cachedMessages,
              } as Conversation;
              return mergedMeta;
            }

            // Always preserve valid cached messages — slim poll NEVER wipes them
            const resolvedUnread =
              cachedMessages.length > 0
                ? computeUnreadFromMessages(cachedMessages, effectiveReadAt)
                : effectiveReadAt && (!meta.lastMessageAt || meta.lastMessageAt <= effectiveReadAt)
                ? 0
                : meta.unreadCount;
            return {
              ...meta,
              profilePic: preservedProfilePic,
              lastReadAt: effectiveReadAt,
              groupParticipants: preservedParticipants,
              groupMeta: preservedGroupMeta,
              unreadCount: resolvedUnread,
              messages: cachedMessages,
            } as Conversation;
          });

        // Merge any locally created manual leads or recently created leads not yet in the server response
        if (!isMetaReviewer) {
          const serverIds = new Set(parsed.map((c) => c.id));
          const manualMap = getStoredManualLeads();
          const manualKeys = Object.keys(manualMap);
          if (manualKeys.length > 0) {
            let manualChanged = false;
            for (const mId of manualKeys) {
              if (deletedIdsRef.current.has(mId)) {
                delete manualMap[mId];
                manualChanged = true;
                continue;
              }
              const mConv = manualMap[mId];
              const recentGuard = recentlyCreatedRef.current.get(mId);
              const isStillProtected = Boolean(recentGuard && now <= recentGuard.expiresAt);
              if (serverIds.has(mId)) {
                // Only remove from local storage once the protection window has elapsed so overlapping stale polls never drop it
                if (!isStillProtected) {
                  delete manualMap[mId];
                  manualChanged = true;
                }
              } else if (mConv) {
                const pending = pendingPatchesRef.current.get(mId);
                const effectiveConv =
                  pending && now <= pending.expiresAt ? ({ ...mConv, ...pending.updates } as Conversation) : mConv;
                parsed.unshift({
                  ...effectiveConv,
                  messages: messagesCacheRef.current.get(mId) || effectiveConv.messages || [],
                });
                serverIds.add(mId);
              }
            }
            if (manualChanged) {
              persistManualLeads(manualMap);
            }
          }

          // Also ensure any in-memory recentlyCreatedRef leads not yet in parsed stay at the top
          for (const [rId, entry] of recentlyCreatedRef.current.entries()) {
            if (now > entry.expiresAt || deletedIdsRef.current.has(rId)) {
              recentlyCreatedRef.current.delete(rId);
              continue;
            }
            if (!serverIds.has(rId)) {
              const pending = pendingPatchesRef.current.get(rId);
              const baseConv =
                pending && now <= pending.expiresAt
                  ? ({ ...entry.conv, ...pending.updates } as Conversation)
                  : entry.conv;
              parsed.unshift({
                ...baseConv,
                messages: messagesCacheRef.current.get(rId) || baseConv.messages || [],
              });
              serverIds.add(rId);
            }
          }
        }

        // Keep conversations ordered newest-first after applying optimistic lastMessageAt updates
        parsed.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));

        const scopedParsed = user?.role
          ? parsed.filter(
              (c) =>
                canAccessConversationInboxData(user.role, resolveConvInboxMode(c)) &&
                (normalizeRole(user.role) !== "enrollment_director" ||
                  canUserViewConversationInStore(c, user))
            )
          : parsed;

        setConversations((prev) => {
          if (prev.length === 0) {
            if (!isMetaReviewer) persistConversationsCache(scopedParsed);
            return scopedParsed;
          }

          const prevById = new Map<string, Conversation>();
          for (let i = 0; i < prev.length; i++) {
            prevById.set(prev[i].id, prev[i]);
          }

          // Preserve any conversation from `prev` that is currently active or has an active optimistic guard
          // if an in-flight poll resolved with a slightly older snapshot
          const parsedIds = new Set(scopedParsed.map((c) => c.id));
          const currentActive = activeChatIdRef.current;
          for (let i = 0; i < prev.length; i++) {
            const oldC = prev[i];
            if (parsedIds.has(oldC.id) || deletedIdsRef.current.has(oldC.id)) continue;
            if (
              user?.role &&
              normalizeRole(user.role) === "enrollment_director" &&
              !canUserViewConversationInStore(oldC, user)
            ) {
              continue;
            }
            const hasRecentGuard =
              (recentlyCreatedRef.current.get(oldC.id)?.expiresAt || 0) > now ||
              (pendingPatchesRef.current.get(oldC.id)?.expiresAt || 0) > now ||
              oldC.id === currentActive;
            if (hasRecentGuard) {
              scopedParsed.unshift({
                ...oldC,
                messages: messagesCacheRef.current.get(oldC.id) || oldC.messages || [],
              });
              parsedIds.add(oldC.id);
            }
          }

          parsed.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));

          let anyChanged = prev.length !== parsed.length;
          const merged = parsed.map((nextConv, idx) => {
            const oldConv = prevById.get(nextConv.id);
            if (!oldConv) {
              anyChanged = true;
              return nextConv;
            }
            if (prev[idx]?.id !== nextConv.id) {
              anyChanged = true;
            }
            if (!nextConv.profilePic && oldConv.profilePic) {
              nextConv.profilePic = oldConv.profilePic;
              profilePicCacheRef.current.set(nextConv.id, oldConv.profilePic);
            }
            if (!nextConv.groupParticipants && oldConv.groupParticipants) {
              nextConv.groupParticipants = oldConv.groupParticipants;
              nextConv.groupMeta =
                nextConv.groupMeta && !nextConv.groupMeta.avatarUrl && oldConv.groupMeta?.avatarUrl
                  ? { ...nextConv.groupMeta, avatarUrl: oldConv.groupMeta.avatarUrl }
                  : nextConv.groupMeta || oldConv.groupMeta;
              groupParticipantsCacheRef.current.set(nextConv.id, {
                participants: oldConv.groupParticipants,
                groupMeta: nextConv.groupMeta,
              });
            }
            const isSame =
              oldConv.updatedAt === nextConv.updatedAt &&
              oldConv.lastMessageAt === nextConv.lastMessageAt &&
              oldConv.lastMessageText === nextConv.lastMessageText &&
              oldConv.lastMessageDirection === nextConv.lastMessageDirection &&
              oldConv.lastOutgoingAt === nextConv.lastOutgoingAt &&
              oldConv.lastReadAt === nextConv.lastReadAt &&
              oldConv.lastSeenAt === nextConv.lastSeenAt &&
              oldConv.unreadCount === nextConv.unreadCount &&
              oldConv.pipeline === nextConv.pipeline &&
              oldConv.agent === nextConv.agent &&
              oldConv.status === nextConv.status &&
              Boolean(oldConv.isArchived) === Boolean(nextConv.isArchived) &&
              oldConv.archivedAt === nextConv.archivedAt &&
              oldConv.archivedBy === nextConv.archivedBy &&
              Boolean(oldConv.isDone) === Boolean(nextConv.isDone) &&
              oldConv.doneAt === nextConv.doneAt &&
              oldConv.doneBy === nextConv.doneBy &&
              oldConv.name === nextConv.name &&
              oldConv.profileName === nextConv.profileName &&
              oldConv.leadName === nextConv.leadName &&
              hasAgentEditedLeadName(oldConv.source) === hasAgentEditedLeadName(nextConv.source) &&
              oldConv.phone === nextConv.phone &&
              oldConv.branch === nextConv.branch &&
              oldConv.auditionDate === nextConv.auditionDate &&
              oldConv.auditionOutcome === nextConv.auditionOutcome &&
              oldConv.auditionBookedAt === nextConv.auditionBookedAt &&
              oldConv.attendedAt === nextConv.attendedAt &&
              oldConv.enrolledAt === nextConv.enrolledAt &&
              oldConv.paidAt === nextConv.paidAt &&
              oldConv.bookedBy === nextConv.bookedBy &&
              oldConv.attendedBy === nextConv.attendedBy &&
              oldConv.enrolledBy === nextConv.enrolledBy &&
              oldConv.followUpDate === nextConv.followUpDate &&
              oldConv.followUpNote === nextConv.followUpNote &&
              oldConv.followUpCompleted === nextConv.followUpCompleted &&
              oldConv.followUpCompletedAt === nextConv.followUpCompletedAt &&
              (oldConv.followUpTags?.length || 0) === (nextConv.followUpTags?.length || 0) &&
              areStringArraysEqual(oldConv.labels, nextConv.labels) &&
              (oldConv.activityLog?.length || 0) === (nextConv.activityLog?.length || 0) &&
              oldConv.cashIn === nextConv.cashIn &&
              oldConv.notes === nextConv.notes &&
              oldConv.profilePic === nextConv.profilePic &&
              oldConv.groupParticipants === nextConv.groupParticipants &&
              oldConv.groupMeta?.avatarUrl === nextConv.groupMeta?.avatarUrl &&
              oldConv.groupMeta?.participantsSyncedAt === nextConv.groupMeta?.participantsSyncedAt &&
              oldConv.groupMeta?.size === nextConv.groupMeta?.size &&
              oldConv.groupMeta?.fetchedAt === nextConv.groupMeta?.fetchedAt &&
              oldConv.messages === nextConv.messages;

            if (isSame) {
              return oldConv;
            }
            anyChanged = true;
            return nextConv;
          });

          if (!anyChanged) {
            return prev;
          }

          if (!isMetaReviewer) {
            persistConversationsCache(merged);
          }
          return merged;
        });
      }
    } catch (err) {
      console.warn("CRMContext: failed to fetch conversations", err);
    } finally {
      if (!initialLoadDone.current) {
        initialLoadDone.current = true;
        setLoading(false);
      }
    }
  }, [normalizeConversationMeta, isMetaReviewer, authFetch]);

  // Coalesce overlapping slim fetches so concurrent triggers (e.g. SSE + Sync button) reuse one active request
  const fetchConversations = useCallback(async () => {
    if (fetchConversationsInflightRef.current) {
      fetchConversationsQueuedRef.current = true;
      return fetchConversationsInflightRef.current;
    }

    const runLoop = (async () => {
      do {
        fetchConversationsQueuedRef.current = false;
        await runFetchConversations();
      } while (fetchConversationsQueuedRef.current);
    })().finally(() => {
      fetchConversationsInflightRef.current = null;
    });

    fetchConversationsInflightRef.current = runLoop;
    return runLoop;
  }, [runFetchConversations]);
  // NOTE: activeChatId intentionally excluded — we use the ref instead
  // so this callback is stable and the polling interval never restarts on chat selection.

  // ── Fetch full messages for the active chat only ──
  const fetchActiveChat = useCallback(async (chatId: string) => {
    if (isMetaReviewer && !isReviewerAllowedConversation({ id: chatId })) {
      return;
    }
    try {
      let res = await authFetch(`${API}/messages/${chatId}`, {
        cache: "no-store",
      }).catch(() => null);
      if (!res || (!res.ok && res.status !== 401 && res.status !== 403)) {
        res = await authFetch(`${DIRECT_API}/messages/${chatId}`, {
          cache: "no-store",
        }).catch(() => null);
      }
      if (!res || !res.ok) return;
      const json = await res.json().catch(() => null);
      if (json?.success && json.data) {
        const serverMessages = normalizeMessages(json.data.messages);
        const existingCached = messagesCacheRef.current.get(chatId) || [];
        // Keep any in-flight optimistic messages (temp_*) that are still uploading/sending
        const inFlightOptimistic = existingCached.filter(
          (m) => m.id.startsWith("temp_") && m.status === "pending"
        );
        const newMessages =
          inFlightOptimistic.length > 0 ? [...serverMessages, ...inFlightOptimistic] : serverMessages;

        // Update the messages & group participants caches
        messagesCacheRef.current.set(chatId, newMessages);
        if (Array.isArray(json.data.groupParticipants)) {
          groupParticipantsCacheRef.current.set(chatId, {
            participants: json.data.groupParticipants,
            groupMeta: json.data.groupMeta || undefined,
          });
        }
        const pending = pendingPatchesRef.current.get(chatId);
        const normActive = normalizeConversationMeta(json.data);
        if (normActive.profilePic) {
          profilePicCacheRef.current.set(chatId, normActive.profilePic);
        }
        const isOpActive = resolveConvInboxMode(normActive) === "operation";
        if (isOpActive && normActive.lastReadAt) {
          const prevRef = lastReadAtRef.current.get(chatId) || 0;
          if (normActive.lastReadAt > prevRef) {
            lastReadAtRef.current.set(chatId, normActive.lastReadAt);
          }
        }
        const effectiveActiveReadAt = isOpActive
          ? Math.max(normActive.lastReadAt || 0, lastReadAtRef.current.get(chatId) || 0) || undefined
          : undefined;
        const computedUnread = computeUnreadFromMessages(newMessages, effectiveActiveReadAt);
        const computedDirection = getLastRealMessageDirection(newMessages);
        const lastMsgTs =
          newMessages.length > 0 ? newMessages[newMessages.length - 1]?.timestamp || 0 : 0;
        const { keepOptimistic: hasActivePending, shouldEvict } = resolvePendingPatchState(
          pending,
          normActive.updatedAt
        );
        if (shouldEvict) {
          pendingPatchesRef.current.delete(chatId);
        }
        const keepPendingDirection = Boolean(
          hasActivePending &&
            pending?.updates.lastMessageDirection &&
            (pending?.updates.lastMessageAt || 0) >= lastMsgTs
        );

        // Merge into conversations state (touch active conversation's messages and metadata)
        setConversations((prev) => {
          let metaChanged = false;
          const next = prev.map((c) => {
            if (c.id !== chatId) return c;
            const mergedConv: Conversation = {
              ...c,
              name: (hasActivePending && pending?.updates.name) || normActive.name || c.name,
              profileName:
                hasActivePending && pending?.updates.profileName !== undefined
                  ? pending.updates.profileName
                  : normActive.profileName ?? c.profileName,
              leadName:
                hasActivePending && pending?.updates.leadName !== undefined
                  ? pending.updates.leadName
                  : normActive.leadName ?? c.leadName,
              source:
                (hasActivePending && pending?.updates.source) ||
                normActive.source ||
                c.source,
              messages: newMessages,
              unreadCount: computedUnread,
              lastMessageAt: Math.max(c.lastMessageAt || 0, normActive.lastMessageAt || 0),
              lastMessageDirection: keepPendingDirection
                ? pending?.updates.lastMessageDirection
                : computedDirection ?? normActive.lastMessageDirection ?? c.lastMessageDirection,
              lastOutgoingAt:
                hasActivePending && pending?.updates.lastOutgoingAt
                  ? Math.max(
                      pending.updates.lastOutgoingAt,
                      normActive.lastOutgoingAt || 0,
                      c.lastOutgoingAt || 0
                    )
                  : normActive.lastOutgoingAt ?? c.lastOutgoingAt,
              pipeline: (hasActivePending && pending?.updates.pipeline) || normActive.pipeline || c.pipeline,
              auditionDate:
                hasActivePending && pending?.updates.auditionDate !== undefined
                  ? pending.updates.auditionDate
                  : normActive.auditionDate ?? c.auditionDate,
              auditionOutcome:
                hasActivePending && pending?.updates.auditionOutcome !== undefined
                  ? pending.updates.auditionOutcome
                  : normActive.auditionOutcome ?? c.auditionOutcome,
              auditionBookedAt:
                hasActivePending && pending?.updates.auditionBookedAt !== undefined
                  ? pending.updates.auditionBookedAt
                  : normActive.auditionBookedAt ?? c.auditionBookedAt,
              attendedAt:
                hasActivePending && pending?.updates.attendedAt !== undefined
                  ? pending.updates.attendedAt
                  : normActive.attendedAt ?? c.attendedAt,
              enrolledAt:
                hasActivePending && pending?.updates.enrolledAt !== undefined
                  ? pending.updates.enrolledAt
                  : normActive.enrolledAt ?? c.enrolledAt,
              paidAt:
                hasActivePending && pending?.updates.paidAt !== undefined
                  ? pending.updates.paidAt
                  : normActive.paidAt ?? c.paidAt,
              bookedBy:
                hasActivePending && pending?.updates.bookedBy !== undefined
                  ? pending.updates.bookedBy
                  : normActive.bookedBy ?? c.bookedBy,
              attendedBy:
                hasActivePending && pending?.updates.attendedBy !== undefined
                  ? pending.updates.attendedBy
                  : normActive.attendedBy ?? c.attendedBy,
              enrolledBy:
                hasActivePending && pending?.updates.enrolledBy !== undefined
                  ? pending.updates.enrolledBy
                  : normActive.enrolledBy ?? c.enrolledBy,
              branch:
                hasActivePending && pending?.updates.branch !== undefined
                  ? pending.updates.branch
                  : normActive.branch ?? c.branch,
              notes:
                hasActivePending && pending?.updates.notes !== undefined
                  ? pending.updates.notes
                  : normActive.notes ?? c.notes,
              followUpDate:
                hasActivePending && pending?.updates.followUpDate !== undefined
                  ? pending.updates.followUpDate
                  : normActive.followUpDate ?? c.followUpDate,
              followUpNote:
                hasActivePending && pending?.updates.followUpNote !== undefined
                  ? pending.updates.followUpNote
                  : normActive.followUpNote ?? c.followUpNote,
              followUpCompleted:
                hasActivePending && pending?.updates.followUpCompleted !== undefined
                  ? pending.updates.followUpCompleted
                  : normActive.followUpCompleted ?? c.followUpCompleted,
              followUpTags:
                hasActivePending && pending?.updates.followUpTags !== undefined
                  ? pending.updates.followUpTags
                  : normActive.followUpTags ?? c.followUpTags,
              formAnswers:
                hasActivePending && pending?.updates.formAnswers !== undefined
                  ? pending.updates.formAnswers
                  : normActive.formAnswers ?? c.formAnswers,
              cashIn:
                hasActivePending && pending?.updates.cashIn !== undefined
                  ? Number(pending.updates.cashIn) || 0
                  : normActive.cashIn ?? c.cashIn,
              activityLog:
                Array.isArray(normActive.activityLog) &&
                normActive.activityLog.length >= (c.activityLog?.length || 0)
                  ? normActive.activityLog
                  : c.activityLog,
              agent: (hasActivePending && pending?.updates.agent) || normActive.agent || c.agent,
              status: (hasActivePending && pending?.updates.status) || normActive.status || c.status,
              isArchived:
                hasActivePending && pending?.updates.isArchived !== undefined
                  ? Boolean(pending.updates.isArchived)
                  : normActive.isArchived,
              archivedAt:
                hasActivePending && "archivedAt" in (pending?.updates || {})
                  ? (pending?.updates.archivedAt as string | undefined)
                  : normActive.archivedAt,
              archivedBy:
                hasActivePending && pending?.updates.archivedBy !== undefined
                  ? (pending.updates.archivedBy as string | undefined)
                  : normActive.archivedBy,
              isDone:
                hasActivePending && pending?.updates.isDone !== undefined
                  ? Boolean(pending.updates.isDone)
                  : normActive.isDone,
              doneAt:
                hasActivePending && "doneAt" in (pending?.updates || {})
                  ? (pending?.updates.doneAt as string | undefined)
                  : normActive.doneAt,
              doneBy:
                hasActivePending && pending?.updates.doneBy !== undefined
                  ? (pending.updates.doneBy as string | undefined)
                  : normActive.doneBy,
              labels:
                hasActivePending && pending?.updates.labels !== undefined
                  ? normalizeConversationLabelIds(pending.updates.labels)
                  : normActive.labels ?? c.labels,
              claudeEnabled: normActive.claudeEnabled,
              claudePaused: normActive.claudePaused,
              claudePausedReason: normActive.claudePausedReason,
              claudePausedAt: normActive.claudePausedAt,
              claudeLastRepliedAt: normActive.claudeLastRepliedAt,
              claudeLastError: normActive.claudeLastError,
              lastReadAt: isOpActive
                ? Math.max(effectiveActiveReadAt || 0, c.lastReadAt || 0) || undefined
                : c.lastReadAt,
              profilePic: normActive.profilePic ?? profilePicCacheRef.current.get(chatId) ?? c.profilePic,
              groupParticipants: Array.isArray(json.data.groupParticipants)
                ? json.data.groupParticipants
                : c.groupParticipants,
              groupMeta: json.data.groupMeta || c.groupMeta,
            };
            if (
              mergedConv.pipeline !== c.pipeline ||
              mergedConv.auditionDate !== c.auditionDate ||
              mergedConv.auditionOutcome !== c.auditionOutcome ||
              mergedConv.followUpDate !== c.followUpDate ||
              mergedConv.followUpNote !== c.followUpNote ||
              mergedConv.branch !== c.branch ||
              mergedConv.notes !== c.notes ||
              mergedConv.cashIn !== c.cashIn ||
              mergedConv.lastReadAt !== c.lastReadAt ||
              mergedConv.profilePic !== c.profilePic ||
              mergedConv.groupParticipants !== c.groupParticipants ||
              mergedConv.groupMeta?.avatarUrl !== c.groupMeta?.avatarUrl
            ) {
              metaChanged = true;
            }
            return mergedConv;
          });
          if (metaChanged && !isMetaReviewer) {
            persistConversationsCache(next);
          }
          return next;
        });

        const pendingLocalReadSync =
          isOpActive &&
          (lastReadAtRef.current.get(chatId) || 0) > (Number(json.data?.lastReadAt) || 0);
        if (!isReadOnly && !pendingLocalReadSync && (json.data?.unreadCount || 0) !== computedUnread) {
          authFetch(`${API}/messages/${chatId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ unreadCount: computedUnread }),
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.warn("CRMContext: failed to fetch active chat", err);
    }
  }, [normalizeMessages, isMetaReviewer, authFetch, isReadOnly]);

  const fetchGroupParticipants = useCallback(
    async (chatId: string, options?: { forceRefresh?: boolean }) => {
      if (!chatId) return { participants: [], groupMeta: null };
      try {
        const qs = options?.forceRefresh ? "?refresh=1" : "";
        let res = await authFetch(`${API}/messages/${chatId}/participants${qs}`, {
          cache: "no-store",
        }).catch(() => null);
        if (!res || (!res.ok && res.status !== 401 && res.status !== 403)) {
          res = await authFetch(`${DIRECT_API}/messages/${chatId}/participants${qs}`, {
            cache: "no-store",
          }).catch(() => null);
        }
        if (!res || !res.ok) {
          const cached = groupParticipantsCacheRef.current.get(chatId);
          return { participants: cached?.participants || [], groupMeta: cached?.groupMeta || null };
        }
        const json = await res.json().catch(() => null);
        const participants: GroupParticipant[] = Array.isArray(json?.data?.participants)
          ? json.data.participants
          : [];
        const groupMeta: GroupMetaInfo | undefined = json?.data?.groupMeta || undefined;
        groupParticipantsCacheRef.current.set(chatId, { participants, groupMeta });
        setConversations((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? { ...c, groupParticipants: participants, groupMeta: groupMeta || c.groupMeta }
              : c
          )
        );
        return { participants, groupMeta: groupMeta || null };
      } catch {
        const cached = groupParticipantsCacheRef.current.get(chatId);
        return { participants: cached?.participants || [], groupMeta: cached?.groupMeta || null };
      }
    },
    [authFetch]
  );

  const memberProfileClientCacheRef = useRef<
    Map<string, { data: GroupMemberProfileInfo; expiresAt: number }>
  >(new Map());

  const fetchGroupMemberProfile = useCallback(
    async (groupId: string, participant: GroupParticipant): Promise<GroupMemberProfileInfo | null> => {
      if (!groupId || !participant?.jid) return null;
      const cacheKey = `${groupId}:${participant.jid}`;
      const cached = memberProfileClientCacheRef.current.get(cacheKey);
      const now = Date.now();
      // Keep WhatsApp avatar/about hot for 45s in browser while still letting existingConversation match live
      const params = new URLSearchParams();
      if (participant.jid) params.set("jid", participant.jid);
      if (participant.lid) params.set("lid", participant.lid);
      if (participant.userId) params.set("userId", participant.userId);
      const cleanDigits = getParticipantPhoneDigits(participant);
      if (cleanDigits) params.set("phone", cleanDigits);
      const label = getParticipantLabel(participant);
      if (label) params.set("name", label);

      if (cached && now < cached.expiresAt) {
        const localExisting = findExistingDmForParticipant(conversationsRef.current, participant, "operation");
        if (localExisting && !cached.data.existingConversation) {
          return {
            ...cached.data,
            existingConversation: {
              senderId: localExisting.id,
              name: localExisting.leadName || localExisting.name,
              phone: localExisting.phone || null,
              agent: localExisting.agent,
              status: localExisting.status,
              pipeline: localExisting.pipeline,
              branch: localExisting.branch,
              labels: localExisting.labels,
              notes: localExisting.notes,
              followUpDate: localExisting.followUpDate || null,
              followUpNote: localExisting.followUpNote,
              unreadCount: localExisting.unreadCount,
              isDone: localExisting.isDone,
              isArchived: localExisting.isArchived,
              lastMessageAt: localExisting.lastMessageAt || null,
              lastMessageText: localExisting.lastMessageText,
              lastMessageDirection: localExisting.lastMessageDirection,
            },
          };
        }
        return cached.data;
      }

      try {
        const qs = params.toString();
        let res = await authFetch(`${API}/messages/${encodeURIComponent(groupId)}/member-info?${qs}`, {
          cache: "no-store",
        }).catch(() => null);
        if (!res || (!res.ok && res.status !== 401 && res.status !== 403)) {
          res = await authFetch(
            `${DIRECT_API}/messages/${encodeURIComponent(groupId)}/member-info?${qs}`,
            { cache: "no-store" }
          ).catch(() => null);
        }
        if (!res || !res.ok) return null;
        const json = await res.json().catch(() => null);
        const profile: GroupMemberProfileInfo | null = json?.success && json?.data ? json.data : null;
        if (!profile) return null;

        memberProfileClientCacheRef.current.set(cacheKey, {
          data: profile,
          expiresAt: Date.now() + 45000,
        });

        // If server resolved a phone or better name for this participant, enrich our cached group snapshot immediately
        if (profile.phone || profile.phoneDigits) {
          const cachedGroup = groupParticipantsCacheRef.current.get(groupId);
          if (cachedGroup?.participants) {
            const enrichedList = cachedGroup.participants.map((p) =>
              p.jid === participant.jid
                ? {
                    ...p,
                    phone: profile.phone || p.phone,
                    phoneDigits: profile.phoneDigits || p.phoneDigits,
                    displayName: profile.displayName || p.displayName,
                  }
                : p
            );
            groupParticipantsCacheRef.current.set(groupId, {
              ...cachedGroup,
              participants: enrichedList,
            });
            setConversations((prev) =>
              prev.map((c) => (c.id === groupId ? { ...c, groupParticipants: enrichedList } : c))
            );
          }
        }
        return profile;
      } catch {
        return null;
      }
    },
    [authFetch]
  );

  const memberAvatarsCacheRef = useRef<
    Map<
      string,
      { data: Record<string, { avatarUrl: string | null; about: string | null; aboutSetAt: number | null }>; expiresAt: number }
    >
  >(new Map());

  const fetchGroupMemberAvatars = useCallback(
    async (
      groupId: string,
      participants: GroupParticipant[]
    ): Promise<Record<string, { avatarUrl: string | null; about: string | null; aboutSetAt: number | null }>> => {
      if (!groupId || !Array.isArray(participants) || participants.length === 0) return {};
      const now = Date.now();
      const cached = memberAvatarsCacheRef.current.get(groupId);
      if (cached && now < cached.expiresAt && Object.keys(cached.data).length >= Math.min(participants.length, 20)) {
        return cached.data;
      }

      const payloadMembers = participants.slice(0, 28).map((p) => ({
        jid: p.jid,
        phoneDigits: getParticipantPhoneDigits(p) || undefined,
      }));
      try {
        let res = await authFetch(`${API}/messages/${encodeURIComponent(groupId)}/member-avatars`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ members: payloadMembers }),
        }).catch(() => null);
        if (!res || (!res.ok && res.status !== 401 && res.status !== 403)) {
          res = await authFetch(
            `${DIRECT_API}/messages/${encodeURIComponent(groupId)}/member-avatars`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ members: payloadMembers }),
            }
          ).catch(() => null);
        }
        if (!res || !res.ok) return cached?.data || {};
        const json = await res.json().catch(() => null);
        const avatars =
          json?.success && json?.data?.avatars && typeof json.data.avatars === "object"
            ? (json.data.avatars as Record<
                string,
                { avatarUrl: string | null; about: string | null; aboutSetAt: number | null }
              >)
            : {};
        const merged = { ...(cached?.data || {}), ...avatars };
        memberAvatarsCacheRef.current.set(groupId, {
          data: merged,
          expiresAt: Date.now() + 2 * 60 * 1000,
        });
        return merged;
      } catch {
        return cached?.data || {};
      }
    },
    [authFetch]
  );

  const fetchConversationAvatar = useCallback(
    async (chatId: string, options?: { forceRefresh?: boolean }): Promise<string | null> => {
      if (!chatId) return null;
      const forceRefresh = Boolean(options?.forceRefresh);
      if (!forceRefresh) {
        const memUrl = profilePicCacheRef.current.get(chatId);
        if (memUrl) return memUrl;
      }
      try {
        const qs = forceRefresh ? "?refresh=1" : "";
        let res = await authFetch(`${API}/messages/${encodeURIComponent(chatId)}/avatar${qs}`, {
          cache: "no-store",
        }).catch(() => null);
        if (!res || (!res.ok && res.status !== 401 && res.status !== 403)) {
          res = await authFetch(
            `${DIRECT_API}/messages/${encodeURIComponent(chatId)}/avatar${qs}`,
            { cache: "no-store" }
          ).catch(() => null);
        }
        if (!res || !res.ok) return null;
        const json = await res.json().catch(() => null);
        const profilePic =
          typeof json?.data?.profilePic === "string" && /^https?:\/\//i.test(json.data.profilePic.trim())
            ? json.data.profilePic.trim()
            : null;
        if (profilePic) {
          profilePicCacheRef.current.set(chatId, profilePic);
          setConversations((prev) =>
            prev.map((c) => (c.id === chatId ? { ...c, profilePic } : c))
          );
        }
        return profilePic;
      } catch {
        return null;
      }
    },
    [authFetch]
  );

  // ── Reset state when auth token changes (e.g. after sign-out → sign-in) ──
  // Without this, remounting after login can leave stale empty data if the
  // initial fetch raced with navigation.
  const prevTokenRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    // Skip the very first render (initial mount)
    if (prevTokenRef.current === undefined) {
      prevTokenRef.current = token;
      return;
    }
    // Token changed (null → string means re-login)
    if (token !== prevTokenRef.current) {
      prevTokenRef.current = token;
      if (token) {
        // Re-login happened: force a fresh fetch
        initialLoadDone.current = false;
        if (conversations.length === 0) {
          setLoading(true);
        }
        lastServerRevRef.current = 0;
        messagesCacheRef.current.clear();
        profilePicCacheRef.current.clear();
        lastReadAtRef.current.clear();
        pendingPatchesRef.current.clear();
        recentlyCreatedRef.current.clear();
        deletedIdsRef.current.clear();
        fetchConversations();
        fetchLabels();
      } else {
        // Logged out: clear data and cache
        setConversations([]);
        setLabels([]);
        setActiveChatId(null);
        lastServerRevRef.current = 0;
        messagesCacheRef.current.clear();
        profilePicCacheRef.current.clear();
        lastReadAtRef.current.clear();
        pendingPatchesRef.current.clear();
        recentlyCreatedRef.current.clear();
        deletedIdsRef.current.clear();
        initialLoadDone.current = false;
        setLoading(true);
        try {
          localStorage.removeItem(CACHE_KEY);
          localStorage.removeItem(V2_CACHE_KEY);
          localStorage.removeItem(LEGACY_CACHE_KEY);
          localStorage.removeItem(LABELS_CACHE_KEY);
          clearConversationsIDB();
        } catch {}
      }
    }
  }, [token, fetchConversations, fetchLabels, conversations.length]);

  const prevUserScopeKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const scopeKey = token ? `${user?.role || ""}|${user?.branch || ""}` : null;
    if (prevUserScopeKeyRef.current !== null && scopeKey !== null && prevUserScopeKeyRef.current !== scopeKey) {
      lastServerRevRef.current = 0;
      fetchConversations();
    }
    prevUserScopeKeyRef.current = scopeKey;
  }, [token, user?.role, user?.branch, fetchConversations]);

  // ── Real-Time Server-Sent Events (SSE) Stream ──
  // Instant (< 30ms) reflection when messages arrive or someone replies in Meta Inbox
  useEffect(() => {
    if (typeof window === "undefined" || !token) return;

    let eventSource: EventSource | null = null;
    let reconnectTimer: NodeJS.Timeout | undefined;
    let isCancelled = false;
    let hasTicketAuth = false;

    async function connectSSE() {
      if (isCancelled) return;
      try {
        let streamUrl = "";
        const ticketRes = await authFetch(`${API}/auth/sse-ticket`, {
          method: "POST",
          cache: "no-store",
        }).catch(() => null);

        if (isCancelled) return;
        if (ticketRes?.status === 401) {
          return;
        }

        if (ticketRes?.ok) {
          const ticketData = await ticketRes.json().catch(() => null);
          if (ticketData?.ticket) {
            hasTicketAuth = true;
            streamUrl = `${API}/messages/stream?ticket=${encodeURIComponent(String(ticketData.ticket))}`;
          }
        } else if (ticketRes?.status === 404) {
          // Graceful compatibility fallback when pointed at an un-deployed backend without /auth/sse-ticket
          hasTicketAuth = false;
          streamUrl = `${API}/messages/stream`;
        }

        if (!streamUrl) {
          if (!isCancelled) {
            reconnectTimer = setTimeout(connectSSE, 4000);
          }
          return;
        }

        eventSource = new EventSource(streamUrl);

        eventSource.onmessage = (event) => {
          try {
            if (!event.data || typeof event.data !== "string" || !event.data.trim().startsWith("{")) return;
            const payload = JSON.parse(event.data);
            if (!payload || !payload.type) return;

            if (isMetaReviewer && payload.data) {
              const cId = payload.data.conversationId;
              const cName = payload.data.conversation?.name;
              if (!isReviewerAllowedConversation({ id: cId, name: cName })) {
                return;
              }
            }

            if (payload.type === "session_updated" && payload.data) {
              verifySession({ force: true, fallbackReason: "deactivated" }).then((stillValid) => {
                if (!isCancelled && stillValid) {
                  lastServerRevRef.current = 0;
                  fetchConversations();
                }
              });
              return;
            }

            if (payload.type === "session_revoked") {
              isCancelled = true;
              if (eventSource) {
                eventSource.close();
                eventSource = null;
              }
              if (reconnectTimer) clearTimeout(reconnectTimer);
              const rawReason = payload?.data?.reason;
              const logoutReason: LogoutReason =
                rawReason === "deleted"
                  ? "deleted"
                  : rawReason === "session_revoked"
                    ? "session_revoked"
                    : "deactivated";
              closeSession(logoutReason);
              return;
            }

            if (payload.type === "message" && payload.data) {
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("crm:metrics-dirty"));
              }
              const { conversationId, conversation: remoteConv, message } = payload.data;
              if (!conversationId) return;

              const isOutgoing = message?.direction === "outgoing";
              const currentActiveId = activeChatIdRef.current;

              // 1. Reconcile messagesCacheRef if this conversation is active OR already cached in memory
              let updatedMessagesForConv: Message[] | undefined;
              if (message && (currentActiveId === conversationId || messagesCacheRef.current.has(conversationId))) {
                const formattedReplyTo = message.replyTo
                  ? {
                      id: String(message.replyTo.id || message.replyTo.messageId),
                      text: message.replyTo.text || "",
                      senderName: message.replyTo.senderName || undefined,
                      isIncoming: Boolean(message.replyTo.isIncoming),
                    }
                  : undefined;

                const formattedMsg: Message = {
                  id: message.messageId,
                  text: message.text || "",
                  attachments: message.attachments || [],
                  time: message.timestamp
                    ? new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                    : "",
                  timestamp: message.timestamp,
                  isIncoming: !isOutgoing,
                  status: message.status || (isOutgoing ? "sent" : undefined),
                  senderName: message.senderName || undefined,
                  isEdited: Boolean(message.isEdited),
                  editedAt: message.editedAt || undefined,
                  isDeleted: Boolean(message.isDeleted),
                  deletedAt: message.deletedAt || undefined,
                  deletedBy: message.deletedBy || undefined,
                  reactions: Array.isArray(message.reactions) ? message.reactions : [],
                  mentions: Array.isArray(message.mentions) ? message.mentions : undefined,
                  mentionAll: Boolean(message.mentionAll),
                  replyTo: formattedReplyTo,
                };

                const cached = messagesCacheRef.current.get(conversationId) || [];
                const existingIdx = cached.findIndex((m) => m.id === formattedMsg.id);
                let updatedMessages: Message[];
                if (existingIdx >= 0) {
                  updatedMessages = cached.map((m, idx) =>
                    idx === existingIdx ? mergeExistingMessageFromSse(m, formattedMsg) : m
                  );
                } else if (isOutgoing) {
                  const tempIdx = cached.findIndex(
                    (m) => m.id.startsWith("temp_") && m.status === "pending"
                  );
                  if (tempIdx >= 0) {
                    const tempMsg = cached[tempIdx];
                    const mergedReplyTo = formattedMsg.replyTo || tempMsg.replyTo;
                    updatedMessages = cached.map((m, idx) =>
                      idx === tempIdx
                        ? {
                            ...m,
                            ...formattedMsg,
                            senderName: resolvePreferredSenderName(
                              formattedMsg.senderName,
                              tempMsg.senderName
                            ),
                            replyTo: mergedReplyTo,
                            status: "sent",
                          }
                        : m
                    );
                  } else {
                    updatedMessages = [...cached, formattedMsg].sort(
                      (a, b) => (a.timestamp || 0) - (b.timestamp || 0)
                    );
                  }
                } else {
                  updatedMessages = [...cached, formattedMsg].sort(
                    (a, b) => (a.timestamp || 0) - (b.timestamp || 0)
                  );
                }
                messagesCacheRef.current.set(conversationId, updatedMessages);
                updatedMessagesForConv = updatedMessages;
              }

              // 2. Update conversations list & metadata instantly
              setConversations((prev) => {
                const idx = prev.findIndex((c) => c.id === conversationId);
                const targetPipeline = remoteConv?.pipeline || (isOutgoing ? "Contacted" : undefined);
                const msgPreview =
                  remoteConv?.lastMessageText ||
                  message?.text ||
                  (Array.isArray(message?.attachments) && message.attachments.length > 0
                    ? `[${message.attachments[0].type || "attachment"}]`
                    : "");
                const normRemote = remoteConv ? normalizeConversationMeta(remoteConv) : null;

                if (idx >= 0) {
                  const existing = prev[idx];
                  const isOpSse = resolveConvInboxMode(existing) === "operation";
                  const opReadCutoff = isOpSse
                    ? Math.max(
                        existing.lastReadAt || 0,
                        normRemote?.lastReadAt || 0,
                        lastReadAtRef.current.get(conversationId) || 0
                      ) || undefined
                    : undefined;
                  const msgTs = Number(message?.timestamp) || 0;
                  const isCoveredByOpRead = Boolean(
                    isOpSse && !isOutgoing && opReadCutoff && msgTs > 0 && msgTs <= opReadCutoff
                  );
                  const fallbackUnread = isOutgoing
                    ? 0
                    : isCoveredByOpRead
                    ? existing.unreadCount || 0
                    : remoteConv?.unreadCount !== undefined && remoteConv.unreadCount >= 0
                    ? remoteConv.unreadCount
                    : (existing.unreadCount || 0) + 1;
                  const targetUnread = updatedMessagesForConv
                    ? isOutgoing
                      ? 0
                      : computeUnreadFromMessages(updatedMessagesForConv, opReadCutoff)
                    : fallbackUnread;

                  const pendingPatch = pendingPatchesRef.current.get(conversationId);
                  let hasActivePendingPatch = Boolean(
                    pendingPatch && Date.now() <= pendingPatch.expiresAt
                  );
                  if (
                    hasActivePendingPatch &&
                    pendingPatch &&
                    !isOutgoing &&
                    normRemote &&
                    !normRemote.isDone &&
                    !normRemote.isArchived &&
                    pendingPatch.updates.isDone === true &&
                    (message?.timestamp || Date.now()) >= (pendingPatch.patchedAt || 0)
                  ) {
                    const cleanedUpdates = { ...pendingPatch.updates };
                    delete cleanedUpdates.isDone;
                    delete cleanedUpdates.doneAt;
                    delete cleanedUpdates.doneBy;
                    if (Object.keys(cleanedUpdates).length === 0) {
                      pendingPatchesRef.current.delete(conversationId);
                      hasActivePendingPatch = false;
                    } else {
                      pendingPatchesRef.current.set(conversationId, {
                        ...pendingPatch,
                        updates: cleanedUpdates,
                      });
                    }
                  }
                  const activePendingUpdates = hasActivePendingPatch ? pendingPatchesRef.current.get(conversationId)?.updates : undefined;
                  const updated: Conversation = {
                    ...existing,
                    ...(normRemote
                      ? {
                          isGroup: normRemote.isGroup ?? existing.isGroup,
                          name:
                            (hasActivePendingPatch && activePendingUpdates?.name) ||
                            (normRemote.isGroup &&
                            normRemote.name === "WhatsApp Group" &&
                            existing.name &&
                            existing.name !== "WhatsApp Group"
                              ? existing.name
                              : normRemote.name) ||
                            existing.name,
                          profileName:
                            hasActivePendingPatch &&
                            activePendingUpdates?.profileName !== undefined
                              ? activePendingUpdates.profileName
                              : normRemote.profileName ?? existing.profileName,
                          leadName:
                            hasActivePendingPatch &&
                            activePendingUpdates?.leadName !== undefined
                              ? activePendingUpdates.leadName
                              : normRemote.leadName ?? existing.leadName,
                          phone: normRemote.isGroup ? "" : normRemote.phone || existing.phone,
                          formPhone: normRemote.formPhone || existing.formPhone,
                          activityLog:
                            normRemote.activityLog && normRemote.activityLog.length > 0
                              ? normRemote.activityLog
                              : existing.activityLog,
                          bookedBy: normRemote.bookedBy || existing.bookedBy,
                          attendedBy: normRemote.attendedBy || existing.attendedBy,
                          enrolledBy: normRemote.enrolledBy || existing.enrolledBy,
                          isArchived:
                            hasActivePendingPatch && activePendingUpdates?.isArchived !== undefined
                              ? Boolean(activePendingUpdates.isArchived)
                              : normRemote.isArchived,
                          archivedAt:
                            hasActivePendingPatch && activePendingUpdates && "archivedAt" in activePendingUpdates
                              ? (activePendingUpdates.archivedAt as string | undefined)
                              : normRemote.archivedAt,
                          archivedBy:
                            hasActivePendingPatch && activePendingUpdates?.archivedBy !== undefined
                              ? (activePendingUpdates.archivedBy as string | undefined)
                              : normRemote.archivedBy,
                          isDone:
                            hasActivePendingPatch && activePendingUpdates?.isDone !== undefined
                              ? Boolean(activePendingUpdates.isDone)
                              : normRemote.isDone,
                          doneAt:
                            hasActivePendingPatch && activePendingUpdates && "doneAt" in activePendingUpdates
                              ? (activePendingUpdates.doneAt as string | undefined)
                              : normRemote.doneAt,
                          doneBy:
                            hasActivePendingPatch && activePendingUpdates?.doneBy !== undefined
                              ? (activePendingUpdates.doneBy as string | undefined)
                              : normRemote.doneBy,
                          labels:
                            hasActivePendingPatch && activePendingUpdates?.labels !== undefined
                              ? normalizeConversationLabelIds(activePendingUpdates.labels)
                              : normRemote.labels ?? existing.labels,
                          source:
                            (hasActivePendingPatch && activePendingUpdates?.source) ||
                            normRemote.source ||
                            existing.source,
                          claudeEnabled: normRemote.claudeEnabled,
                          claudePaused: normRemote.claudePaused,
                          claudePausedReason: normRemote.claudePausedReason,
                          claudePausedAt: normRemote.claudePausedAt,
                          claudeLastRepliedAt: normRemote.claudeLastRepliedAt,
                          claudeLastError: normRemote.claudeLastError,
                        }
                      : {}),
                    lastMessageAt: Math.max(
                      existing.lastMessageAt || 0,
                      remoteConv?.lastMessageAt || 0,
                      message?.timestamp || Date.now()
                    ),
                    lastMessageText: msgPreview || existing.lastMessageText,
                    lastMessageDirection:
                      (updatedMessagesForConv
                        ? getLastRealMessageDirection(updatedMessagesForConv)
                        : undefined) ||
                      normRemote?.lastMessageDirection ||
                      (isOutgoing ? "outgoing" : "incoming"),
                    lastOutgoingAt: isOutgoing
                      ? Math.max(
                          existing.lastOutgoingAt || 0,
                          remoteConv?.lastOutgoingAt || 0,
                          message?.timestamp || Date.now()
                        )
                      : existing.lastOutgoingAt,
                    unreadCount: targetUnread,
                    pipeline: (targetPipeline && existing.pipeline === "New" ? targetPipeline : existing.pipeline) as any,
                    messages: updatedMessagesForConv || existing.messages,
                  };
                  if (remoteConv?.agent) updated.agent = remoteConv.agent;
                  if (remoteConv?.status) updated.status = remoteConv.status;

                  const remaining = prev.filter((_, i) => i !== idx);
                  const nextList = [updated, ...remaining];
                  persistConversationsCache(nextList);
                  return nextList;
                } else if (normRemote) {
                  const nextList = [
                    {
                      ...normRemote,
                      lastMessageText: msgPreview || normRemote.lastMessageText,
                      lastMessageDirection:
                        (updatedMessagesForConv
                          ? getLastRealMessageDirection(updatedMessagesForConv)
                          : undefined) ||
                        normRemote.lastMessageDirection ||
                        ((isOutgoing ? "outgoing" : "incoming") as "incoming" | "outgoing"),
                      messages: updatedMessagesForConv || [],
                    },
                    ...prev,
                  ];
                  persistConversationsCache(nextList);
                  return nextList;
                }
                return prev;
              });
            } else if (payload.type === "conversation_updated" && payload.data) {
              const { conversationId, conversation: remoteConv } = payload.data;
              if (!conversationId || !remoteConv) return;
              if (deletedIdsRef.current.has(conversationId)) return;
              setConversations((prev) => {
                const exists = prev.some((c) => c.id === conversationId);
                if (!exists) {
                  const nextList = [{ ...normalizeConversationMeta(remoteConv), messages: [] }, ...prev];
                  persistConversationsCache(nextList, true);
                  return nextList;
                }
                const pending = pendingPatchesRef.current.get(conversationId);
                const { keepOptimistic: hasPending, shouldEvict } = resolvePendingPatchState(
                  pending,
                  remoteConv.updatedAt
                );
                if (shouldEvict) {
                  pendingPatchesRef.current.delete(conversationId);
                }
                const nextList = prev.map((c) => {
                  if (c.id !== conversationId) return c;
                  const norm = normalizeConversationMeta(remoteConv);
                  if (norm.profilePic) {
                    profilePicCacheRef.current.set(conversationId, norm.profilePic);
                  }
                  const preservedPic =
                    norm.profilePic ?? profilePicCacheRef.current.get(conversationId) ?? c.profilePic;
                  const cachedMsgs = messagesCacheRef.current.get(conversationId) || c.messages || [];
                  if (typeof window !== "undefined" && !hasPending && remoteConv.cashIn !== undefined) {
                    try {
                      localStorage.setItem(`crm_cash_${conversationId}`, String(Number(norm.cashIn) || 0));
                    } catch {}
                  }
                  const isOpUpdate = resolveConvInboxMode({ ...c, ...norm }) === "operation";
                  if (isOpUpdate && norm.lastReadAt) {
                    const prevRef = lastReadAtRef.current.get(conversationId) || 0;
                    if (norm.lastReadAt > prevRef) {
                      lastReadAtRef.current.set(conversationId, norm.lastReadAt);
                    }
                  }
                  const opCutoff = isOpUpdate
                    ? Math.max(
                        norm.lastReadAt || 0,
                        c.lastReadAt || 0,
                        lastReadAtRef.current.get(conversationId) || 0
                      ) || undefined
                    : undefined;
                  const computedRemoteUnread =
                    cachedMsgs.length > 0
                      ? computeUnreadFromMessages(cachedMsgs, opCutoff)
                      : opCutoff && (!norm.lastMessageAt || norm.lastMessageAt <= opCutoff)
                      ? 0
                      : norm.unreadCount;
                  return {
                    ...c,
                    ...norm,
                    ...(hasPending ? pending?.updates : {}),
                    profilePic: preservedPic,
                    lastReadAt: isOpUpdate ? opCutoff : c.lastReadAt,
                    lastMessageAt: Math.max(
                      c.lastMessageAt || 0,
                      norm.lastMessageAt || 0,
                      hasPending ? pending?.updates.lastMessageAt || 0 : 0
                    ),
                    unreadCount: computedRemoteUnread,
                    messages: cachedMsgs,
                  };
                });
                persistConversationsCache(nextList, true);
                return nextList;
              });
            } else if (payload.type === "marked_read" && payload.data) {
              const { conversationId, lastReadAt: remoteReadAt } = payload.data;
              if (conversationId) {
                const numericReadAt = Number(remoteReadAt) || Date.now();
                lastReadAtRef.current.set(
                  conversationId,
                  Math.max(lastReadAtRef.current.get(conversationId) || 0, numericReadAt)
                );
                setConversations((prev) => {
                  const nextList = prev.map((c) => {
                    if (c.id !== conversationId) return c;
                    const cachedMsgs = messagesCacheRef.current.get(conversationId) || c.messages || [];
                    const isOp = resolveConvInboxMode(c) === "operation";
                    const cutoff = isOp ? lastReadAtRef.current.get(conversationId) : undefined;
                    const computed = cachedMsgs.length > 0 ? computeUnreadFromMessages(cachedMsgs, cutoff) : 0;
                    return {
                      ...c,
                      unreadCount: computed,
                      lastReadAt: isOp ? cutoff : c.lastReadAt,
                    };
                  });
                  persistConversationsCache(nextList, true);
                  return nextList;
                });
              }
            } else if (payload.type === "message_status" && payload.data) {
              const { conversationId, messageId, status, seenAt, deliveredAt, lastSeenAt } = payload.data;
              if (!conversationId) return;

              const cached = messagesCacheRef.current.get(conversationId);
              if (cached) {
                const updated = cached.map((m) =>
                  m.id === messageId
                    ? {
                        ...m,
                        status,
                        seenAt: seenAt || m.seenAt,
                        deliveredAt: deliveredAt || m.deliveredAt,
                        isRead: status === "read" || Boolean(seenAt),
                      }
                    : m
                );
                messagesCacheRef.current.set(conversationId, updated);
              }

              setConversations((prev) =>
                prev.map((c) => {
                  if (c.id !== conversationId) return c;
                  const updatedMessages = c.messages?.map((m) =>
                    m.id === messageId
                      ? {
                          ...m,
                          status,
                          seenAt: seenAt || m.seenAt,
                          deliveredAt: deliveredAt || m.deliveredAt,
                          isRead: status === "read" || Boolean(seenAt),
                        }
                      : m
                  );
                  return {
                    ...c,
                    messages: updatedMessages,
                    lastSeenAt: lastSeenAt || (status === "read" && seenAt ? Math.max(c.lastSeenAt || 0, seenAt) : c.lastSeenAt),
                  };
                })
              );
            } else if (payload.type === "messages_read_watermark" && payload.data) {
              const { conversationId, watermark, seenAt, lastSeenAt } = payload.data;
              if (!conversationId) return;

              const cached = messagesCacheRef.current.get(conversationId);
              if (cached) {
                const updated = cached.map((m) =>
                  !m.isIncoming && m.timestamp && m.timestamp <= watermark
                    ? { ...m, status: "read" as const, seenAt: seenAt || m.seenAt, isRead: true }
                    : m
                );
                messagesCacheRef.current.set(conversationId, updated);
              }

              setConversations((prev) =>
                prev.map((c) => {
                  if (c.id !== conversationId) return c;
                  const updatedMessages = c.messages?.map((m) =>
                    !m.isIncoming && m.timestamp && m.timestamp <= watermark
                      ? { ...m, status: "read" as const, seenAt: seenAt || m.seenAt, isRead: true }
                      : m
                  );
                  return {
                    ...c,
                    messages: updatedMessages,
                    lastSeenAt: lastSeenAt || Math.max(c.lastSeenAt || 0, seenAt || watermark || 0),
                  };
                })
              );
            } else if (payload.type === "messages_delivered_watermark" && payload.data) {
              const { conversationId, watermark, deliveredAt } = payload.data;
              if (!conversationId) return;

              const cached = messagesCacheRef.current.get(conversationId);
              if (cached) {
                const updated = cached.map((m) =>
                  !m.isIncoming && m.timestamp && m.timestamp <= watermark && m.status !== "read"
                    ? { ...m, status: "delivered" as const, deliveredAt: deliveredAt || m.deliveredAt }
                    : m
                );
                messagesCacheRef.current.set(conversationId, updated);
              }

              setConversations((prev) =>
                prev.map((c) => {
                  if (c.id !== conversationId) return c;
                  const updatedMessages = c.messages?.map((m) =>
                    !m.isIncoming && m.timestamp && m.timestamp <= watermark && m.status !== "read"
                      ? { ...m, status: "delivered" as const, deliveredAt: deliveredAt || m.deliveredAt }
                      : m
                  );
                  return { ...c, messages: updatedMessages };
                })
              );
            } else if (payload.type === "conversation_deleted" && payload.data) {
              const { conversationId, mergedInto } = payload.data;
              if (conversationId) {
                messagesCacheRef.current.delete(conversationId);
                setConversations((prev) => prev.filter((c) => c.id !== conversationId));
                if (activeChatIdRef.current === conversationId) {
                  setActiveChatId(mergedInto || null);
                }
              }
            } else if (payload.type === "conversation_scope_removed" && payload.data) {
              const { conversationId } = payload.data;
              if (conversationId) {
                messagesCacheRef.current.delete(conversationId);
                setConversations((prev) => prev.filter((c) => c.id !== conversationId));
                if (activeChatIdRef.current === conversationId) {
                  setActiveChatId(null);
                }
              }
            } else if (payload.type === "conversations_purged" && payload.data) {
              if (payload.data.channel === "WA") {
                const purgedInbox: InboxScope = payload.data.inbox === "operation" ? "operation" : "admissions";
                setConversations((prev) =>
                  prev.filter(
                    (c) => !(c.channel === "WA" && resolveConvInboxMode(c) === purgedInbox)
                  )
                );
                const active = conversationsRef.current.find((c) => c.id === activeChatIdRef.current);
                if (active?.channel === "WA" && resolveConvInboxMode(active) === purgedInbox) {
                  setActiveChatId(null);
                }
              }
            } else if (payload.type === "message_edited" && payload.data) {
              const { conversationId, messageId, text, editedAt, mentions, mentionAll } = payload.data;
              if (!conversationId || !messageId) return;

              const cached = messagesCacheRef.current.get(conversationId);
              if (cached) {
                const updated = cached.map((m) =>
                  m.id === messageId
                    ? {
                        ...m,
                        text,
                        mentions: Array.isArray(mentions) ? mentions : m.mentions,
                        mentionAll: mentionAll !== undefined ? Boolean(mentionAll) : m.mentionAll,
                        isEdited: true,
                        editedAt: editedAt || Date.now(),
                      }
                    : m
                );
                messagesCacheRef.current.set(conversationId, updated);
              }

              setConversations((prev) =>
                prev.map((c) => {
                  if (c.id !== conversationId) return c;
                  const updatedMessages = c.messages?.map((m) =>
                    m.id === messageId
                      ? {
                          ...m,
                          text,
                          mentions: Array.isArray(mentions) ? mentions : m.mentions,
                          mentionAll: mentionAll !== undefined ? Boolean(mentionAll) : m.mentionAll,
                          isEdited: true,
                          editedAt: editedAt || Date.now(),
                        }
                      : m
                  );
                  return { ...c, messages: updatedMessages || [] };
                })
              );
            } else if (payload.type === "conversation_avatar_updated" && payload.data) {
              const { conversationId, profilePic } = payload.data;
              if (
                !conversationId ||
                typeof profilePic !== "string" ||
                !/^https?:\/\//i.test(profilePic.trim())
              ) {
                return;
              }
              const cleanPic = profilePic.trim();
              profilePicCacheRef.current.set(conversationId, cleanPic);
              setConversations((prev) =>
                prev.map((c) => (c.id === conversationId ? { ...c, profilePic: cleanPic } : c))
              );
            } else if (payload.type === "group_participants_updated" && payload.data) {
              const { conversationId, groupParticipants, groupMeta } = payload.data;
              if (!conversationId || !Array.isArray(groupParticipants)) return;
              groupParticipantsCacheRef.current.set(conversationId, {
                participants: groupParticipants,
                groupMeta: groupMeta || undefined,
              });
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === conversationId
                    ? {
                        ...c,
                        groupParticipants,
                        groupMeta: groupMeta || c.groupMeta,
                      }
                    : c
                )
              );
            } else if (payload.type === "message_deleted" && payload.data) {
              const { conversationId, messageId, text, deletedAt, deletedBy } = payload.data;
              if (!conversationId || !messageId) return;
              const deletedText = text || "This message was deleted";
              const resolveDeletedBy = (m: Message) => {
                if (deletedBy && deletedBy !== "Staff") return deletedBy;
                if (m.deletedBy && m.deletedBy !== "Staff") return m.deletedBy;
                if (!m.isIncoming && m.senderName && m.senderName !== "Staff") return m.senderName;
                return deletedBy || m.deletedBy || undefined;
              };

              const cached = messagesCacheRef.current.get(conversationId);
              if (cached) {
                const updated = cached.map((m) =>
                  m.id === messageId
                    ? {
                        ...m,
                        text: deletedText,
                        attachments: [],
                        reactions: [],
                        isDeleted: true,
                        deletedAt: deletedAt || Date.now(),
                        deletedBy: resolveDeletedBy(m),
                      }
                    : m
                );
                messagesCacheRef.current.set(conversationId, updated);
              }

              setConversations((prev) =>
                prev.map((c) => {
                  if (c.id !== conversationId) return c;
                  const msgs = c.messages || [];
                  const isLatest = msgs.length > 0 && msgs[msgs.length - 1]?.id === messageId;
                  const updatedMessages = msgs.map((m) =>
                    m.id === messageId
                      ? {
                          ...m,
                          text: deletedText,
                          attachments: [],
                          reactions: [],
                          isDeleted: true,
                          deletedAt: deletedAt || Date.now(),
                          deletedBy: resolveDeletedBy(m),
                        }
                      : m
                  );
                  return {
                    ...c,
                    lastMessageText: isLatest ? deletedText : c.lastMessageText,
                    messages: updatedMessages,
                  };
                })
              );
            } else if (payload.type === "message_reaction" && payload.data) {
              const { conversationId, messageId, reactions } = payload.data;
              if (!conversationId || !messageId) return;

              const cached = messagesCacheRef.current.get(conversationId);
              if (cached) {
                const updated = cached.map((m) =>
                  m.id === messageId ? { ...m, reactions: Array.isArray(reactions) ? reactions : [] } : m
                );
                messagesCacheRef.current.set(conversationId, updated);
              }

              setConversations((prev) =>
                prev.map((c) => {
                  if (c.id !== conversationId) return c;
                  const updatedMessages = c.messages?.map((m) =>
                    m.id === messageId ? { ...m, reactions: Array.isArray(reactions) ? reactions : [] } : m
                  );
                  return { ...c, messages: updatedMessages || [] };
                })
              );
            } else if (payload.type === "names_updated" || payload.type === "conversations_refresh") {
              // WhatsApp backfill or bulk agent unassignment completed — refresh conversations live
              fetchConversations();
            } else if (payload.type === "team_updated") {
              // Staff user created, updated, or deleted — refresh agents & verify active session in fallback mode
              fetchAgents();
              if (!hasTicketAuth) {
                verifySession({ force: true, fallbackReason: "deactivated" });
              }
            } else if (payload.type === "branches_updated") {
              // Branch list modified — notify all useBranches() hooks to refresh immediately
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("crm:branches-updated"));
              }
            } else if (payload.type === "quick_replies_updated") {
              // Quick replies modified — notify chat composers to refresh immediately
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("crm:quick-replies-updated"));
              }
            } else if (payload.type === "labels_updated") {
              // Lead label catalog modified — refresh labels immediately
              fetchLabels();
            } else if (payload.type === "presence_updated" && payload.data) {
              if (typeof window !== "undefined") {
                window.dispatchEvent(
                  new CustomEvent("crm:presence-updated", { detail: payload.data })
                );
              }
            }
          } catch (e) {
            console.warn("CRMContext: SSE message parse error", e);
          }
        };

        eventSource.onerror = () => {
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          if (isCancelled) return;
          verifySession({ force: true }).then((stillValid) => {
            if (!isCancelled && stillValid) {
              reconnectTimer = setTimeout(connectSSE, 4000);
            }
          });
        };
      } catch (err) {
        console.warn("CRMContext: SSE setup error", err);
        if (!isCancelled) {
          reconnectTimer = setTimeout(connectSSE, 5000);
        }
      }
    }

    connectSSE();

    return () => {
      isCancelled = true;
      if (eventSource) {
        eventSource.close();
      }
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [
    token,
    authFetch,
    closeSession,
    verifySession,
    normalizeConversationMeta,
    fetchConversations,
    fetchAgents,
    fetchLabels,
    isMetaReviewer,
  ]);

  // ── Presence heartbeat: tracks CRM online, active & per-screen time across tabs ──
  useEffect(() => {
    if (typeof window === "undefined" || !token) return;
    resetPresenceClientSupportState();

    const IDLE_THRESHOLD_MS = 5 * 60 * 1000;
    const HEARTBEAT_MS = 30 * 1000;
    let lastInteractionAt = Date.now();
    let lastTouchWriteAt = 0;

    const resetIdleClock = () => {
      const now = Date.now();
      lastTouchWriteAt = now;
      lastInteractionAt = now;
    };

    const markInteraction = () => {
      const now = Date.now();
      if (now - lastTouchWriteAt < 2000) return;
      lastTouchWriteAt = now;
      lastInteractionAt = now;
    };

    const sendState = (
      event: "open" | "ping" | "navigate" | "focus" | "blur" | "leave",
      keepalive = false
    ) => {
      const now = Date.now();
      const isVisible =
        typeof document !== "undefined" ? document.visibilityState === "visible" : true;
      const idleMs = Math.max(0, now - lastInteractionAt);
      const isActive = event !== "leave" && isVisible && idleMs < IDLE_THRESHOLD_MS;
      void postPresenceHeartbeat({
        token,
        event,
        screen: currentScreenRef.current,
        isVisible,
        isActive,
        idleMs,
        keepalive,
      });
    };

    sendPresenceRef.current = sendState;
    resetPresenceIdleRef.current = resetIdleClock;

    const handleVisibilityChange = () => {
      const visible = document.visibilityState === "visible";
      if (visible) {
        resetIdleClock();
        sendState("focus");
      } else {
        sendState("blur", true);
      }
    };

    const handleWindowFocus = () => {
      resetIdleClock();
      sendState("focus");
    };

    const handlePageHide = () => {
      sendState("leave", true);
    };

    const activityEvents: ReadonlyArray<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "mousemove",
      "touchstart",
      "scroll",
    ];
    for (let i = 0; i < activityEvents.length; i++) {
      const evt = activityEvents[i];
      window.addEventListener(evt, markInteraction, { passive: true, capture: evt === "scroll" });
    }
    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    lastReportedScreenRef.current = currentScreenRef.current;
    sendState("open");
    const timer = setInterval(() => {
      sendState("ping");
    }, HEARTBEAT_MS);

    return () => {
      clearInterval(timer);
      if (sendPresenceRef.current === sendState) sendPresenceRef.current = null;
      if (resetPresenceIdleRef.current === resetIdleClock) resetPresenceIdleRef.current = null;
      for (let i = 0; i < activityEvents.length; i++) {
        const evt = activityEvents[i];
        window.removeEventListener(evt, markInteraction, evt === "scroll");
      }
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [token]);

  // Report CRM screen navigation transitions immediately
  useEffect(() => {
    const nextPath = pathname || "/";
    const prevPath = currentScreenRef.current;
    currentScreenRef.current = nextPath;

    if (!token || !sendPresenceRef.current) return;
    if (lastReportedScreenRef.current === nextPath && prevPath === nextPath) return;

    lastReportedScreenRef.current = nextPath;
    resetPresenceIdleRef.current?.();
    sendPresenceRef.current("navigate");
  }, [pathname, token]);

  // ── Non-overlapping background polling (3s delay after completion) ──
  useEffect(() => {
    let timer: NodeJS.Timeout;
    let active = true;

    async function loop() {
      if (!active) return;
      // Skip polling if document is hidden to conserve bandwidth and CPU
      if (typeof document !== "undefined" && document.hidden) {
        timer = setTimeout(loop, 3000);
        return;
      }
      try {
        await fetchConversations();
      } catch (e) {
        // Ignored, handled in fetchConversations
      } finally {
        if (active) {
          timer = setTimeout(loop, 3000);
        }
      }
    }

    loop();

    // Trigger immediate fetch when returning to the tab
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchConversations();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      active = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchConversations]);

  // ── Active chat polling: fetch full messages for open conversation ──
  useEffect(() => {
    if (!activeChatId) return;

    let timer: NodeJS.Timeout;
    let active = true;

    async function pollChat() {
      if (!active) return;
      const currentId = activeChatIdRef.current;
      if (currentId && (!document.hidden)) {
        await fetchActiveChat(currentId);
      }
      if (active) {
        timer = setTimeout(pollChat, 3000);
      }
    }

    pollChat();

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [activeChatId, fetchActiveChat]);

  // Scoped view for Meta Reviewer test account (test@meta.com) & branch-scoped Enrollment Director
  const visibleConversations = useMemo(() => {
    let list = conversations;
    if (isMetaReviewer) {
      list = list.filter(isReviewerAllowedConversation);
    }
    if (user && normalizeRole(user.role) === "enrollment_director") {
      list = list.filter((c) => canUserViewConversationInStore(c, user));
    }
    return list;
  }, [conversations, isMetaReviewer, user]);

  // Partitioned inbox views (admissions vs operation) and clean badges per inbox
  const admissionsConversations = useMemo(
    () => filterConversationsByInbox(visibleConversations, "admissions"),
    [visibleConversations]
  );

  const operationConversations = useMemo(
    () => filterConversationsByInbox(visibleConversations, "operation"),
    [visibleConversations]
  );

  // Compute live badges across all pages
  const badgeCounts = useMemo<BadgeCounts>(() => {
    const today = getLocalTodayIso();

    const inbox = computeInboxUnreadBadge(admissionsConversations);
    const operationInbox = computeInboxUnreadBadge(operationConversations);
    let leads = 0;
    let auditions = 0;
    let followUps = 0;
    const isDirectorUser = user && normalizeRole(user.role) === "enrollment_director";

    admissionsConversations.forEach((c) => {
      // 2. Leads badge: newly arrived uncontacted leads
      if (c.pipeline === "New") {
        leads += 1;
      }

      // 3. Auditions badge: booked auditions (branch-scoped for Enrollment Director)
      if (c.pipeline === "Audition Booked" && (!isDirectorUser || canUserViewConversationInStore(c, user))) {
        auditions += 1;
      }

      // 4. Follow-ups badge: due today or overdue (excluding booked auditions which are tracked under Auditions and completed follow-ups)
      const tags = c.followUpTags || [];
      const hasFollowUpTag = tags.includes('payment-pending') || tags.includes('trial-session');
      const isJoiningLater = c.pipeline === "Joining Later" || c.auditionOutcome === "joining-later";
      if ((c.pipeline !== "Audition Booked" || isJoiningLater || hasFollowUpTag) && !c.followUpCompleted) {
        if (c.followUpDate) {
          if (c.followUpDate <= today) {
            followUps += 1;
          }
        } else if (c.followUpNote && c.followUpNote.trim()) {
          followUps += 1;
        } else if (isJoiningLater || hasFollowUpTag) {
          followUps += 1;
        }
      }
    });

    return { inbox, operationInbox, leads, auditions, followUps };
  }, [admissionsConversations, operationConversations, user]);

  // Instant optimistic update across all pages + background PATCH
  const patchConversation = useCallback(
    async (
      id: string,
      rawUpdates: Partial<Record<string, any>>
    ): Promise<{ ok: boolean; error?: string }> => {
      if (isReadOnly) {
        const readOnlyMsg = "View-only account: modifications are disabled.";
        console.warn(readOnlyMsg);
        return { ok: false, error: readOnlyMsg };
      }

      const currentForSync = conversationsRef.current.find((conv) => conv.id === id);
      const prevSnapshot = currentForSync ? { ...currentForSync } : undefined;
      const updates: Record<string, any> = { ...rawUpdates };
      if (updates.labels !== undefined) {
        updates.labels = normalizeConversationLabelIds(updates.labels);
      }
      const isAgentNameEdit = updates.leadNameEdited === true;
      delete updates.leadNameEdited;

      if (
        typeof updates.leadName === "string" &&
        updates.name === undefined &&
        !isPlaceholderLeadName(updates.leadName)
      ) {
        updates.name = updates.leadName.trim();
      }
      if (
        typeof updates.name === "string" &&
        updates.leadName === undefined &&
        !isPlaceholderLeadName(updates.name)
      ) {
        updates.leadName = updates.name.trim();
      }
      const optimisticExtras: Record<string, string> = {};
      const resolvedOptName = updates.leadName ?? updates.name;
      const editedLeadName =
        isAgentNameEdit &&
        typeof resolvedOptName === "string" &&
        !isPlaceholderLeadName(resolvedOptName)
          ? resolvedOptName.trim()
          : undefined;
      if (typeof resolvedOptName === "string" && !isPlaceholderLeadName(resolvedOptName)) {
        optimisticExtras.profileName = resolvedOptName.trim();
      }

      const getDefaultJoiningLaterIso = () => {
        const d = new Date();
        d.setDate(d.getDate() + 14);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      };

      // Two-way synchronization between Pipeline "Joining Later" and Follow-up / Audition "joining-later"
      if (updates.pipeline === "Joining Later") {
        if (updates.auditionOutcome === undefined) {
          updates.auditionOutcome = "joining-later";
        }
        if (updates.followUpCompleted === undefined) {
          updates.followUpCompleted = false;
        }
        if (!currentForSync?.followUpDate && updates.followUpDate === undefined) {
          updates.followUpDate = getDefaultJoiningLaterIso();
        }
        if (!(currentForSync?.followUpNote || "").trim() && updates.followUpNote === undefined) {
          updates.followUpNote = "Joining Later - Follow up";
        }
      } else if (updates.pipeline !== undefined && updates.pipeline !== "Joining Later") {
        if (
          (currentForSync?.auditionOutcome === "joining-later" || currentForSync?.pipeline === "Joining Later") &&
          updates.auditionOutcome === undefined
        ) {
          updates.auditionOutcome = "";
        }
      } else if (updates.auditionOutcome === "joining-later") {
        if (
          updates.pipeline === undefined ||
          updates.pipeline === "Contacted" ||
          updates.pipeline === "Qualified" ||
          updates.pipeline === "Audition Booked"
        ) {
          updates.pipeline = "Joining Later";
        }
        if (updates.followUpCompleted === undefined) {
          updates.followUpCompleted = false;
        }
        if (!currentForSync?.followUpDate && updates.followUpDate === undefined) {
          updates.followUpDate = getDefaultJoiningLaterIso();
        }
        if (!(currentForSync?.followUpNote || "").trim() && updates.followUpNote === undefined) {
          updates.followUpNote = "Joining Later - Follow up";
        }
      } else if (
        updates.auditionOutcome !== undefined &&
        updates.auditionOutcome !== "joining-later" &&
        currentForSync?.pipeline === "Joining Later" &&
        updates.pipeline === undefined
      ) {
        const out = String(updates.auditionOutcome);
        if (out === "registered") updates.pipeline = "Enrolled";
        else if (out === "schedule-followup" || out === "paid-trial") updates.pipeline = "Attended";
        else if (out === "no-show") updates.pipeline = "Lost";
        else updates.pipeline = currentForSync?.auditionDate ? "Audition Booked" : "Contacted";
      }

      const nowIso = new Date().toISOString();
      const patchPayload: Record<string, any> = { ...updates };

      // Keep Conversation state timestamps typed as `string | undefined` while sending `null` to MongoDB on clear
      const normalizedInboxOptimistic: Record<string, boolean | string | undefined> = {};
      if ("isArchived" in patchPayload) {
        normalizedInboxOptimistic.isArchived = Boolean(patchPayload.isArchived);
        if (normalizedInboxOptimistic.isArchived) {
          const ts = patchPayload.archivedAt ? String(patchPayload.archivedAt) : nowIso;
          patchPayload.archivedAt = ts;
          normalizedInboxOptimistic.archivedAt = ts;
          if (!patchPayload.archivedBy && user?.name) patchPayload.archivedBy = user.name;
          normalizedInboxOptimistic.archivedBy = String(patchPayload.archivedBy || "");
          patchPayload.isDone = false;
          patchPayload.doneAt = null;
          patchPayload.doneBy = "";
          normalizedInboxOptimistic.isDone = false;
          normalizedInboxOptimistic.doneAt = undefined;
          normalizedInboxOptimistic.doneBy = "";
        } else {
          patchPayload.archivedAt = null;
          patchPayload.archivedBy = "";
          normalizedInboxOptimistic.archivedAt = undefined;
          normalizedInboxOptimistic.archivedBy = "";
        }
      }
      if ("isDone" in patchPayload && !normalizedInboxOptimistic.isArchived) {
        normalizedInboxOptimistic.isDone = Boolean(patchPayload.isDone);
        if (normalizedInboxOptimistic.isDone) {
          const ts = patchPayload.doneAt ? String(patchPayload.doneAt) : nowIso;
          patchPayload.doneAt = ts;
          normalizedInboxOptimistic.doneAt = ts;
          if (!patchPayload.doneBy && user?.name) patchPayload.doneBy = user.name;
          normalizedInboxOptimistic.doneBy = String(patchPayload.doneBy || "");
          patchPayload.isArchived = false;
          patchPayload.archivedAt = null;
          patchPayload.archivedBy = "";
          normalizedInboxOptimistic.isArchived = false;
          normalizedInboxOptimistic.archivedAt = undefined;
          normalizedInboxOptimistic.archivedBy = "";
        } else {
          patchPayload.doneAt = null;
          patchPayload.doneBy = "";
          normalizedInboxOptimistic.doneAt = undefined;
          normalizedInboxOptimistic.doneBy = "";
        }
      }

      if (updates.cashIn !== undefined) {
        const numCash = Number(updates.cashIn) || 0;
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem(`crm_cash_${id}`, String(numCash));
          } catch {}
        }
      }

      // Stamp activity timestamps (booked, attended, enrolled, paid) both top-level and inside `source`
      // so remote MongoDB persists them immediately without requiring a schema migration.
      const isBooking =
        updates.pipeline === "Audition Booked" ||
        updates.auditionOutcome === "booked" ||
        (Boolean(updates.auditionDate) && updates.pipeline === undefined);
      const isAttending =
        updates.pipeline === "Attended" ||
        updates.auditionOutcome === "schedule-followup" ||
        updates.auditionOutcome === "paid-trial";
      const isEnrolling =
        updates.pipeline === "Enrolled" ||
        updates.auditionOutcome === "registered";
      const isPaying =
        updates.cashIn !== undefined && (Number(updates.cashIn) || 0) > 0;

      const needsSourceSync =
        updates.cashIn !== undefined ||
        updates.source !== undefined ||
        updates.activityLog !== undefined ||
        isBooking ||
        isAttending ||
        isEnrolling ||
        isPaying ||
        Boolean(editedLeadName);

      setConversations((prev) => {
        const current = prev.find((conv) => conv.id === id);
        const enrichedUpdates: Record<string, any> = { ...updates, ...optimisticExtras };
        const nowTs = Date.now();
        const actorName = (user?.name || current?.agent || "Staff").trim();
        const actorRole = user?.role || "";
        const generatedActivities: ActivityLogEntry[] = [];

        if (current) {
          if (updates.agent !== undefined && updates.agent !== current.agent) {
            const prevAg = current.agent || "Unassigned";
            const nextAg = String(updates.agent || "Unassigned");
            generatedActivities.push({
              id: `act_${nowTs}_agent`,
              type: "lead_assigned",
              actor: actorName,
              actorRole,
              summary: nextAg === "Unassigned" ? "Unassigned lead" : `Assigned to ${nextAg}`,
              detail: prevAg !== "Unassigned" ? `Previously ${prevAg}` : "Claimed from unassigned",
              fromValue: prevAg,
              toValue: nextAg,
              timestamp: nowTs,
            });
          }

          if (updates.pipeline !== undefined && updates.pipeline !== current.pipeline) {
            const prevPipe = current.pipeline || "New";
            const nextPipe = String(updates.pipeline);
            const isBook = nextPipe === "Audition Booked";
            generatedActivities.push({
              id: `act_${nowTs}_pipe`,
              type: isBook ? "audition_booked" : "stage_changed",
              actor: actorName,
              actorRole,
              summary: isBook ? "Booked Audition" : `Moved stage to ${nextPipe}`,
              detail: `${prevPipe} → ${nextPipe}`,
              fromValue: prevPipe,
              toValue: nextPipe,
              timestamp: nowTs,
            });
          }

          if (
            updates.auditionDate !== undefined &&
            updates.auditionDate &&
            updates.auditionDate !== (current.auditionDate || "") &&
            updates.pipeline !== "Audition Booked"
          ) {
            generatedActivities.push({
              id: `act_${nowTs}_auddate`,
              type: "audition_booked",
              actor: actorName,
              actorRole,
              summary: `Scheduled audition for ${updates.auditionDate}`,
              detail: String(updates.branch || current.branch || ""),
              fromValue: current.auditionDate || "",
              toValue: String(updates.auditionDate),
              timestamp: nowTs,
            });
          }

          if (
            updates.auditionOutcome !== undefined &&
            updates.auditionOutcome &&
            updates.auditionOutcome !== (current.auditionOutcome || "")
          ) {
            const outcomeLabels: Record<string, string> = {
              registered: "Registered (Enrolled)",
              "paid-trial": "Paid Trial",
              "schedule-followup": "Attended · Follow-up",
              "joining-later": "Joining Later",
              "no-show": "No-Show",
              booked: "Booked",
            };
            const label = outcomeLabels[String(updates.auditionOutcome)] || String(updates.auditionOutcome);
            generatedActivities.push({
              id: `act_${nowTs}_outcome`,
              type: "audition_outcome",
              actor: actorName,
              actorRole,
              summary: `Marked audition outcome: ${label}`,
              detail: String(updates.branch || current.branch || ""),
              fromValue: current.auditionOutcome || "",
              toValue: String(updates.auditionOutcome),
              timestamp: nowTs,
            });
          }

          if (updates.followUpCompleted === true && !current.followUpCompleted) {
            generatedActivities.push({
              id: `act_${nowTs}_fudone`,
              type: "followup_completed",
              actor: actorName,
              actorRole,
              summary: "Completed follow-up task",
              detail: String(current.followUpNote || updates.followUpNote || ""),
              fromValue: "Pending",
              toValue: "Completed",
              timestamp: nowTs,
            });
          } else if (
            (updates.followUpDate !== undefined || updates.followUpNote !== undefined) &&
            updates.followUpCompleted !== true
          ) {
            const prevDateStr = current.followUpDate || "";
            const nextDateStr = updates.followUpDate !== undefined ? String(updates.followUpDate || "") : prevDateStr;
            const nextNote = updates.followUpNote !== undefined ? String(updates.followUpNote || "") : (current.followUpNote || "");
            if ((nextDateStr && nextDateStr !== prevDateStr) || (nextNote && nextNote !== (current.followUpNote || ""))) {
              generatedActivities.push({
                id: `act_${nowTs}_fusched`,
                type: "followup_scheduled",
                actor: actorName,
                actorRole,
                summary: nextDateStr ? `Scheduled follow-up for ${nextDateStr}` : "Updated follow-up note",
                detail: nextNote,
                fromValue: prevDateStr,
                toValue: nextDateStr,
                timestamp: nowTs,
              });
            }
          }

          if (updates.cashIn !== undefined) {
            const prevCash = Number(current.cashIn) || 0;
            const nextCash = Number(updates.cashIn) || 0;
            if (nextCash > 0 && nextCash !== prevCash) {
              generatedActivities.push({
                id: `act_${nowTs}_cash`,
                type: "cash_recorded",
                actor: actorName,
                actorRole,
                summary: `Recorded payment: ${nextCash.toLocaleString()} SAR`,
                detail: prevCash > 0 ? `Updated from ${prevCash.toLocaleString()} SAR` : "Payment logged",
                fromValue: String(prevCash),
                toValue: String(nextCash),
                timestamp: nowTs,
              });
            }
          }

          if (
            updates.branch !== undefined &&
            updates.branch &&
            updates.branch !== (current.branch || "")
          ) {
            generatedActivities.push({
              id: `act_${nowTs}_branch`,
              type: "branch_changed",
              actor: actorName,
              actorRole,
              summary: `Set branch to ${updates.branch}`,
              detail: current.branch ? `Previously ${current.branch}` : "",
              fromValue: current.branch || "",
              toValue: String(updates.branch),
              timestamp: nowTs,
            });
          }

          if (
            updates.notes !== undefined &&
            updates.notes &&
            String(updates.notes).trim() !== (current.notes || "").trim()
          ) {
            const cleanNote = String(updates.notes).trim().slice(0, 140);
            generatedActivities.push({
              id: `act_${nowTs}_note`,
              type: "note_updated",
              actor: actorName,
              actorRole,
              summary: "Updated lead notes",
              detail: cleanNote,
              fromValue: "",
              toValue: cleanNote,
              timestamp: nowTs,
            });
          }
        }

        if (needsSourceSync || generatedActivities.length > 0) {
          const currentSource =
            updates.source !== undefined ? updates.source : current?.source;
          const baseSource =
            typeof currentSource === "object" && currentSource !== null
              ? { ...currentSource }
              : {
                  campaign:
                    typeof currentSource === "string" && currentSource.trim() && currentSource !== "direct"
                      ? currentSource
                      : "Organic / Direct",
                };

          const existingLog = Array.isArray(updates.activityLog)
            ? updates.activityLog
            : Array.isArray(current?.activityLog)
              ? current.activityLog
              : [];

          if (generatedActivities.length > 0 || updates.activityLog !== undefined) {
            const nextLog =
              generatedActivities.length > 0
                ? [...generatedActivities, ...existingLog].slice(0, 250)
                : existingLog.slice(0, 250);
            baseSource.activityLog = nextLog;
            enrichedUpdates.activityLog = nextLog;
            if (updates.activityLog !== undefined) {
              patchPayload.activityLog = nextLog;
            }
          }

          if (updates.cashIn !== undefined) {
            const numCash = Number(updates.cashIn) || 0;
            baseSource.cashIn = numCash;
            if (numCash > 0 && numCash !== (current?.cashIn || 0)) {
              baseSource.paidAt = nowIso;
              baseSource.enrolledBy = actorName;
              enrichedUpdates.paidAt = nowIso;
              enrichedUpdates.enrolledBy = actorName;
              patchPayload.paidAt = nowIso;
              patchPayload.enrolledBy = actorName;
            }
          }
          const currentSourceObj =
            typeof current?.source === "object" && current.source !== null ? current.source : undefined;
          const hasBookedAt = Boolean(
            current?.auditionBookedAt || currentSourceObj?.auditionBookedAt
          );
          if (isBooking && (current?.pipeline !== "Audition Booked" || !hasBookedAt)) {
            baseSource.auditionBookedAt = nowIso;
            baseSource.bookedBy = actorName;
            enrichedUpdates.auditionBookedAt = nowIso;
            enrichedUpdates.bookedBy = actorName;
            patchPayload.auditionBookedAt = nowIso;
            patchPayload.bookedBy = actorName;
          }
          if (isAttending && current?.pipeline !== "Attended") {
            baseSource.attendedAt = nowIso;
            baseSource.attendedBy = actorName;
            enrichedUpdates.attendedAt = nowIso;
            enrichedUpdates.attendedBy = actorName;
            patchPayload.attendedAt = nowIso;
            patchPayload.attendedBy = actorName;
          }
          if (isEnrolling && current?.pipeline !== "Enrolled") {
            baseSource.enrolledAt = nowIso;
            baseSource.enrolledBy = actorName;
            enrichedUpdates.enrolledAt = nowIso;
            enrichedUpdates.enrolledBy = actorName;
            patchPayload.enrolledAt = nowIso;
            patchPayload.enrolledBy = actorName;
          }
          if (editedLeadName) {
            baseSource.leadNameEdited = true;
            baseSource.editedLeadName = editedLeadName;
            baseSource.leadNameEditedAt = nowIso;
          }

          patchPayload.source = baseSource;
          enrichedUpdates.source = baseSource;
        }

        const next = prev.map((c) =>
          c.id === id ? { ...c, ...enrichedUpdates, ...normalizedInboxOptimistic } : c
        );
        persistConversationsCache(next, true);
        return next;
      });

      const optimisticUpdates: Record<string, unknown> = {
        ...patchPayload,
        ...optimisticExtras,
        ...normalizedInboxOptimistic,
      };
      const patchStartedAt = Date.now();

      // Fix A: raise TTL to 30s and merge with any existing pending optimistic fields
      const existingPending = pendingPatchesRef.current.get(id);
      pendingPatchesRef.current.set(id, {
        updates: {
          ...(existingPending ? existingPending.updates : {}),
          ...optimisticUpdates,
        },
        expiresAt: patchStartedAt + 30000,
        patchedAt: patchStartedAt,
      });

      const recentEntry = recentlyCreatedRef.current.get(id);
      if (recentEntry) {
        recentlyCreatedRef.current.set(id, {
          conv: { ...recentEntry.conv, ...optimisticUpdates } as Conversation,
          expiresAt: Date.now() + 60000,
        });
      }

      const rollbackOptimisticUpdate = (restoredMeta?: Omit<Conversation, "messages">) => {
        const currentPending = pendingPatchesRef.current.get(id);
        if (currentPending) {
          const nextUpdates = { ...currentPending.updates };
          for (const key of Object.keys(optimisticUpdates)) {
            if (nextUpdates[key] === optimisticUpdates[key]) {
              delete nextUpdates[key];
            }
          }
          if (Object.keys(nextUpdates).length === 0) {
            pendingPatchesRef.current.delete(id);
          } else {
            pendingPatchesRef.current.set(id, {
              updates: nextUpdates,
              expiresAt: currentPending.expiresAt,
            });
          }
        }
        setConversations((prev) => {
          const next = prev.map((c) => {
            if (c.id !== id) return c;
            if (restoredMeta) {
              return { ...restoredMeta, messages: c.messages } as Conversation;
            }
            if (!prevSnapshot) return c;
            const reverted: Record<string, unknown> = { ...c };
            const currentRecord = c as Record<string, unknown>;
            const prevRecord = prevSnapshot as Record<string, unknown>;
            for (const key of Object.keys(optimisticUpdates)) {
              if (currentRecord[key] === optimisticUpdates[key]) {
                reverted[key] = prevRecord[key];
              }
            }
            return reverted as Conversation;
          });
          persistConversationsCache(next, true);
          return next;
        });
      };

      const emitPatchError = (message: string) => {
        if (typeof window === "undefined") return;
        try {
          window.dispatchEvent(
            new CustomEvent("crm:toast", {
              detail: {
                type: "error",
                message,
              },
            })
          );
        } catch {}
      };

      // 3. Persist to API
      try {
        const res = await authFetch(`${API}/messages/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchPayload),
        });
        const json = await res.json().catch(() => null);
        if (res.ok && json && json.success) {
          // Fix C: on confirmed write, immediately merge the server-confirmed data
          // into state so the next poll cannot revert it (the source of truth is now
          // the server response, not the optimistic guess).
          if (json.data) {
            const confirmed = normalizeConversationMeta(json.data);
            setConversations((prev) => {
              const next = prev.map((c) =>
                c.id === id
                  ? ({
                      ...confirmed,
                      lastMessageAt: Math.max(confirmed.lastMessageAt || 0, c.lastMessageAt || 0),
                      pipeline:
                        c.pipeline !== "New" && confirmed.pipeline === "New"
                          ? c.pipeline
                          : confirmed.pipeline,
                      messages: c.messages,
                    } as Conversation) // keep loaded messages & newer message timestamps
                  : c
              );
              persistConversationsCache(next, true);
              return next;
            });
          }
          // Keep a short post-write guard in case an older slim poll is already in-flight
          const currentPending = pendingPatchesRef.current.get(id);
          if (currentPending) {
            const confirmedTs = json.data?.updatedAt
              ? Date.parse(String(json.data.updatedAt))
              : Date.now();
            pendingPatchesRef.current.set(id, {
              updates: currentPending.updates,
              expiresAt: Date.now() + 8000,
              patchedAt: currentPending.patchedAt,
              confirmedUpdatedAt: Number.isFinite(confirmedTs) ? confirmedTs : Date.now(),
            });
          }
          return { ok: true };
        }

        if (res.status === 404 && recentlyCreatedRef.current.has(id)) {
          // Brand-new manual lead whose POST /api/messages/manual is still in-flight; keep optimistic state
          return { ok: true };
        }

        let restoredMeta: Omit<Conversation, "messages"> | undefined;
        if (res.status === 403 || res.status === 409) {
          try {
            const rollbackRes = await authFetch(`${API}/messages/${id}`);
            if (rollbackRes.ok) {
              const rollbackJson = await rollbackRes.json().catch(() => null);
              if (rollbackJson && rollbackJson.data) {
                restoredMeta = normalizeConversationMeta(rollbackJson.data);
              }
            }
          } catch {}
        }

        rollbackOptimisticUpdate(restoredMeta);

        const parsed = json?.error ? formatMetaErrorMessage(json.error) : null;
        const errMsg =
          (typeof json?.error === "string" && json.error) ||
          parsed?.message ||
          `Could not save changes (HTTP ${res.status}).`;
        if (parsed) {
          console.warn(`Conversation update notice: ${parsed.title} - ${parsed.message}`);
        } else {
          console.warn(`Failed to patch conversation (${res.status}): ${errMsg}`);
        }
        emitPatchError(errMsg);
        return { ok: false, error: errMsg };
      } catch (err) {
        console.warn("Failed to patch conversation:", err);
        rollbackOptimisticUpdate();
        const networkError = "Network error while saving changes. Please try again.";
        emitPatchError(networkError);
        return { ok: false, error: networkError };
      }
    },
    [isReadOnly, authFetch, normalizeConversationMeta, user?.name, user?.role]
  );

  // Admissions preserves unread count until staff replies; Operation clears unread immediately when opening the card.
  const markConversationAsRead = useCallback(
    async (id: string) => {
      if (!id || isReadOnly) return;
      const existing = conversationsRef.current.find((c) => c.id === id);
      if (resolveConvInboxMode(existing || id) !== "operation") {
        return;
      }
      const readAt = Math.max(Date.now(), existing?.lastMessageAt || 0);
      const maxKnownRead = Math.max(existing?.lastReadAt || 0, lastReadAtRef.current.get(id) || 0);
      const alreadyRead =
        (existing?.unreadCount || 0) <= 0 && maxKnownRead >= (existing?.lastMessageAt || 0);
      if (alreadyRead) return;

      const nextReadAt = Math.max(maxKnownRead, readAt);
      lastReadAtRef.current.set(id, nextReadAt);

      setConversations((prev) => {
        let changed = false;
        const next = prev.map((c) => {
          if (c.id !== id) return c;
          if ((c.unreadCount || 0) === 0 && (c.lastReadAt || 0) >= nextReadAt) return c;
          changed = true;
          return { ...c, unreadCount: 0, lastReadAt: nextReadAt };
        });
        if (!changed) return prev;
        persistConversationsCache(next);
        return next;
      });

      try {
        let res = await authFetch(`${API}/messages/${encodeURIComponent(id)}/read`, {
          method: "POST",
        }).catch(() => null);
        if (!res || (!res.ok && res.status !== 401 && res.status !== 403)) {
          await authFetch(`${DIRECT_API}/messages/${encodeURIComponent(id)}/read`, {
            method: "POST",
          }).catch(() => {});
        }
      } catch {}
    },
    [isReadOnly, authFetch]
  );

  const updateConversationClaude = useCallback(
    async (
      id: string,
      payload: {
        claudeEnabled?: boolean;
        claudePaused?: boolean;
        reason?: string;
        resetSession?: boolean;
        triggerReply?: boolean;
      }
    ): Promise<{
      ok: boolean;
      error?: string;
      autoReplyTriggered?: boolean;
      autoReplySkippedReason?: string | null;
    }> => {
      if (isReadOnly) {
        return { ok: false, error: "View-only account: modifications are disabled." };
      }
      try {
        const res = await authFetch(
          `${API}/claude/conversations/${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          return {
            ok: false,
            error:
              (typeof json?.error === "string" && json.error) ||
              `Could not update Claude status (HTTP ${res.status}).`,
          };
        }

        if (json.data) {
          const norm = normalizeConversationMeta(json.data);
          setConversations((prev) => {
            const next = prev.map((c) =>
              c.id === id || c.id === norm.id
                ? {
                    ...c,
                    claudeEnabled: norm.claudeEnabled,
                    claudePaused: norm.claudePaused,
                    claudePausedReason: norm.claudePausedReason,
                    claudePausedAt: norm.claudePausedAt,
                    claudeLastRepliedAt: norm.claudeLastRepliedAt,
                    claudeLastError: norm.claudeLastError,
                  }
                : c
            );
            persistConversationsCache(next);
            return next;
          });
        }
        return {
          ok: true,
          autoReplyTriggered: Boolean(json.autoReplyTriggered),
          autoReplySkippedReason:
            typeof json.autoReplySkippedReason === "string" ? json.autoReplySkippedReason : null,
        };
      } catch {
        return { ok: false, error: "Network error while updating Claude status." };
      }
    },
    [isReadOnly, authFetch, normalizeConversationMeta]
  );

  // 1-Click navigation from any page to open that user's chat in its assigned Inbox
  const openChat = useCallback(
    (id: string) => {
      activeChatIdRef.current = id;
      setActiveChatId(id);
      setSearchQuery("");
      const existing = conversationsRef.current.find((c) => c.id === id);
      const inboxMode = existing ? resolveConvInboxMode(existing) : resolveConvInboxMode(id);
      if (inboxMode === "operation") {
        markConversationAsRead(id);
      }
      const targetPath = inboxMode === "operation" ? "/operation-inbox" : "/";
      if (canAccessRoute(user?.role, targetPath)) {
        router.push(targetPath);
      } else if (isOperationRole(user?.role)) {
        router.push("/operation-inbox");
      } else {
        router.push("/");
      }
    },
    [router, user?.role, markConversationAsRead]
  );

  // Open deep-linked conversation from notification click (?chat=<id> or Service Worker postMessage)
  useEffect(() => {
    if (
      !token ||
      typeof window === "undefined" ||
      (!canAccessRoute(user?.role, "/") && !canAccessRoute(user?.role, "/operation-inbox"))
    ) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const chatParam = params.get("chat")?.trim();
    if (chatParam) {
      queueMicrotask(() => {
        openChat(chatParam);
      });
      params.delete("chat");
      const nextSearch = params.toString();
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
      window.history.replaceState({}, "", nextUrl);
    }

    if (!("serviceWorker" in navigator)) return;
    const handleSwMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; conversationId?: string } | null;
      if (data?.type === "crm:open-chat" && data.conversationId) {
        openChat(data.conversationId);
      }
    };
    navigator.serviceWorker.addEventListener("message", handleSwMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleSwMessage);
    };
  }, [token, user?.role, openChat]);

  // Instant 0ms manual WhatsApp lead creation (e.g. Student / Instructor referral)
  const createManualLead = useCallback(
    async (input: CreateManualLeadInput): Promise<CreateManualLeadResult> => {
      if (isReadOnly) {
        return { ok: false, conversationId: "", existed: false, error: "View-only account cannot create leads." };
      }

      const normalized = normalizeWhatsAppPhone(input.phone);
      if (!normalized) {
        return {
          ok: false,
          conversationId: "",
          existed: false,
          error: "Enter a valid WhatsApp phone number (e.g. 01012345678 or +201012345678).",
        };
      }

      const targetInbox: InboxScope =
        input.inbox || (isOperationRole(user?.role) ? "operation" : "admissions");
      const { digits: rawDigits, e164: e164Phone } = normalized;
      const senderId = targetInbox === "operation" ? `op_${rawDigits}` : rawDigits;
      deletedIdsRef.current.delete(senderId);

      const cleanName = (input.name || "").trim();
      const cleanReferralType =
        (input.referralType || "").trim() ||
        (targetInbox === "operation" ? "Direct Chat" : "Student Referral");
      const cleanReferredBy = (input.referredBy || "").trim();
      const cleanBranch = (input.branch || "").trim();
      const cleanInstrument = (input.instrument || "").trim();
      const rawNotes = (input.notes || "").trim();

      const noteParts: string[] = [];
      if (cleanReferredBy && targetInbox !== "operation") {
        noteParts.push(`Referred by: ${cleanReferredBy} (${cleanReferralType})`);
      }
      if (cleanInstrument && targetInbox !== "operation") {
        noteParts.push(`Instrument: ${cleanInstrument}`);
      }
      if (rawNotes) {
        noteParts.push(rawNotes);
      }
      const combinedNotes = noteParts.join("\n");

      const now = Date.now();
      const nowIso = new Date(now).toISOString();
      const actorName = (user?.name || input.agent || "Staff").trim();
      const actorRole = user?.role || "";
      const resolvedAgent = (input.agent || "").trim() || "Unassigned";

      // Check if conversation already exists within the SAME inbox only
      const existingConv = conversations.find(
        (c) =>
          resolveConvInboxMode(c) === targetInbox &&
          (c.id === senderId ||
            c.phone === e164Phone ||
            c.formPhone === rawDigits ||
            (c.phone && normalizeWhatsAppPhone(c.phone)?.digits === rawDigits))
      );

      if (existingConv) {
        const targetId = existingConv.id;
        deletedIdsRef.current.delete(targetId);
        const updates: Record<string, any> = {
          lastMessageAt: Math.max(existingConv.lastMessageAt || 0, now),
        };
        if (cleanName && !existingConv.leadName) {
          updates.leadName = cleanName;
          updates.name = cleanName;
        }
        if (
          resolvedAgent !== "Unassigned" &&
          (!existingConv.agent || existingConv.agent === "Unassigned")
        ) {
          updates.agent = resolvedAgent;
        }
        if (cleanBranch && !existingConv.branch) {
          updates.branch = cleanBranch;
        }
        if (combinedNotes) {
          const prevNotes = (existingConv.notes || "").trim();
          if (!prevNotes) {
            updates.notes = combinedNotes;
          } else if (!prevNotes.includes(combinedNotes)) {
            updates.notes = `${prevNotes}\n${combinedNotes}`;
          }
        }
        const mergedExisting: Conversation = {
          ...existingConv,
          ...updates,
        };
        recentlyCreatedRef.current.set(targetId, {
          conv: mergedExisting,
          expiresAt: Date.now() + 60000,
        });
        setConversations((prev) => {
          const rest = prev.filter((c) => c.id !== targetId);
          const next = [mergedExisting, ...rest];
          persistConversationsCache(next);
          return next;
        });
        if (Object.keys(updates).length > 0) {
          patchConversation(targetId, updates);
        }
        return { ok: true, conversationId: targetId, existed: true };
      }

      // Build 0ms optimistic conversation
      const initialActivities: ActivityLogEntry[] = [
        {
          id: `act_${now}_manual`,
          type: "note_updated",
          actor: actorName,
          actorRole,
          summary:
            targetInbox === "operation"
              ? "Started Operation WhatsApp conversation"
              : `Added manual lead (${cleanReferralType})`,
          detail:
            targetInbox !== "operation" && cleanReferredBy
              ? `Referred by ${cleanReferredBy}`
              : e164Phone,
          fromValue: "",
          toValue: cleanName || e164Phone,
          timestamp: now,
        },
      ];

      if (resolvedAgent !== "Unassigned") {
        initialActivities.unshift({
          id: `act_${now}_agent`,
          type: "lead_assigned",
          actor: actorName,
          actorRole,
          summary: `Assigned to ${resolvedAgent}`,
          detail: "Assigned on manual chat creation",
          fromValue: "Unassigned",
          toValue: resolvedAgent,
          timestamp: now + 1,
        });
      }

      const sourceObj =
        targetInbox === "operation"
          ? "direct"
          : {
              campaign: cleanReferralType,
              adset: cleanReferredBy ? `Referred by: ${cleanReferredBy}` : "Manual Lead",
              ad: "WhatsApp Manual Lead",
              activityLog: initialActivities,
            };

      const optimisticConv: Conversation = {
        id: senderId,
        inbox: targetInbox,
        whatsappAccount: targetInbox,
        name: e164Phone,
        profileName: cleanName || undefined,
        leadName: cleanName || undefined,
        formPhone: rawDigits,
        phone: e164Phone,
        agent: resolvedAgent,
        channel: "WA",
        status: "Open",
        unreadCount: 0,
        windowLeft: "Active",
        pipeline: "New",
        source: sourceObj,
        notes: combinedNotes,
        branch: cleanBranch,
        formAnswers: cleanInstrument && targetInbox !== "operation" ? { instrument: cleanInstrument } : {},
        activityLog: initialActivities,
        messages: [],
        createdAt: nowIso,
        updatedAt: nowIso,
        lastMessageAt: now,
      };

      // 1. Insert optimistically in 0ms and protect against in-flight background polls
      const manualMap = getStoredManualLeads();
      manualMap[senderId] = optimisticConv;
      persistManualLeads(manualMap);

      recentlyCreatedRef.current.set(senderId, {
        conv: optimisticConv,
        expiresAt: Date.now() + 60000,
      });

      pendingPatchesRef.current.set(senderId, {
        updates: optimisticConv,
        expiresAt: Date.now() + 30000,
      });

      setConversations((prev) => {
        const rest = prev.filter((c) => c.id !== senderId);
        const next = [optimisticConv, ...rest];
        persistConversationsCache(next);
        return next;
      });

      // 2. Persist to backend in background
      try {
        const res = await authFetch(`${API}/messages/manual`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: e164Phone,
            name: cleanName || undefined,
            referralType: cleanReferralType,
            referredBy: cleanReferredBy || undefined,
            agent: resolvedAgent,
            branch: cleanBranch || undefined,
            notes: rawNotes || undefined,
            instrument: cleanInstrument || undefined,
            inbox: targetInbox,
          }),
        });

        if (res.ok) {
          const json = await res.json().catch(() => null);
          if (json?.success && json?.data) {
            const confirmed = normalizeConversationMeta(json.data);
            const confirmedId = confirmed.id || senderId;
            const cachedMsgs = messagesCacheRef.current.get(confirmedId) || [];
            const existingPending = pendingPatchesRef.current.get(confirmedId);

            const confirmedConv: Conversation = {
              ...optimisticConv,
              ...confirmed,
              ...(existingPending ? existingPending.updates : {}),
              lastMessageAt: Math.max(
                confirmed.lastMessageAt || 0,
                optimisticConv.lastMessageAt || 0,
                existingPending?.updates.lastMessageAt || 0
              ),
              messages: cachedMsgs,
            };

            // Keep in manualMap and recentlyCreatedRef so any overlapping in-flight slim poll
            // that started before the DB write completed can NEVER drop the conversation card!
            const currentManual = getStoredManualLeads();
            currentManual[confirmedId] = confirmedConv;
            persistManualLeads(currentManual);

            recentlyCreatedRef.current.set(confirmedId, {
              conv: confirmedConv,
              expiresAt: Date.now() + 60000,
            });

            pendingPatchesRef.current.set(confirmedId, {
              updates: confirmedConv,
              expiresAt: Date.now() + 15000,
            });

            setConversations((prev) => {
              const existingIdx = prev.findIndex((c) => c.id === confirmedId || c.id === senderId);
              let next: Conversation[];
              if (existingIdx >= 0) {
                const prevItem = prev[existingIdx];
                const mergedItem: Conversation = {
                  ...confirmedConv,
                  lastMessageAt: Math.max(confirmedConv.lastMessageAt || 0, prevItem.lastMessageAt || 0),
                  pipeline: prevItem.pipeline !== "New" ? prevItem.pipeline : confirmedConv.pipeline,
                  messages:
                    cachedMsgs.length > 0
                      ? cachedMsgs
                      : prevItem.messages && prevItem.messages.length > 0
                      ? prevItem.messages
                      : [],
                };
                next = prev.map((c, idx) => (idx === existingIdx ? mergedItem : c));
              } else {
                next = [confirmedConv, ...prev];
              }
              next.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
              persistConversationsCache(next);
              return next;
            });
            return {
              ok: true,
              conversationId: confirmedId,
              existed: Boolean(json.existed),
            };
          }
        }
      } catch (err) {
        console.warn("Manual lead background sync notice:", err);
      }

      return { ok: true, conversationId: senderId, existed: false };
    },
    [isReadOnly, user, conversations, patchConversation, authFetch, normalizeConversationMeta]
  );

  const openGroupMemberChat = useCallback(
    async (
      groupId: string,
      participant: GroupParticipant,
      groupName?: string
    ): Promise<{ ok: boolean; conversationId?: string; existed?: boolean; error?: string }> => {
      if (!groupId || !participant) {
        return { ok: false, error: "Invalid group participant" };
      }

      // 1. Instant 0ms match if a 1-on-1 Operation inbox chat already exists in browser memory
      const existing = findExistingDmForParticipant(conversationsRef.current, participant, "operation");
      if (existing) {
        return { ok: true, conversationId: existing.id, existed: true };
      }

      if (isReadOnly) {
        return { ok: false, error: "View-only account cannot start new conversations." };
      }

      const phoneDigits = getParticipantPhoneDigits(participant);
      const label = getParticipantLabel(participant);
      const cleanDisplayName = !/^\+?\d{7,}$/.test(label) ? label : undefined;

      // 2. If phone is known, reuse instant 0ms manual lead creation inside Operation Inbox
      if (phoneDigits) {
        const res = await createManualLead({
          phone: phoneDigits,
          name: cleanDisplayName,
          inbox: "operation",
          referralType: groupName ? `Group: ${groupName}` : "Group Member",
          agent: "Unassigned",
        });
        if (!res.ok) {
          return { ok: false, error: res.error || "Could not open conversation" };
        }
        return { ok: true, conversationId: res.conversationId, existed: res.existed };
      }

      // 3. LID-only privacy member: resolve/create on backend cleanly
      try {
        const payload = {
          jid: participant.jid,
          lid: participant.lid || undefined,
          userId: participant.userId || undefined,
          phone: participant.phone || undefined,
          displayName: cleanDisplayName,
        };
        let res = await authFetch(`${API}/messages/${encodeURIComponent(groupId)}/open-member-chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).catch(() => null);
        if (!res || (!res.ok && res.status !== 401 && res.status !== 403)) {
          res = await authFetch(
            `${DIRECT_API}/messages/${encodeURIComponent(groupId)}/open-member-chat`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            }
          ).catch(() => null);
        }
        const json = res ? await res.json().catch(() => null) : null;
        if (!res || !res.ok || !json?.success || !json?.data) {
          return { ok: false, error: json?.error || "Could not open member conversation" };
        }

        const confirmed = normalizeConversationMeta(json.data);
        const cachedMsgs = messagesCacheRef.current.get(confirmed.id) || normalizeMessages(json.data.messages || []);
        const confirmedConv: Conversation = {
          ...confirmed,
          messages: cachedMsgs,
        };

        const manualMap = getStoredManualLeads();
        manualMap[confirmed.id] = confirmedConv;
        persistManualLeads(manualMap);

        recentlyCreatedRef.current.set(confirmed.id, {
          conv: confirmedConv,
          expiresAt: Date.now() + 60000,
        });

        setConversations((prev) => {
          const rest = prev.filter((c) => c.id !== confirmed.id);
          const next = [confirmedConv, ...rest];
          persistConversationsCache(next);
          return next;
        });

        return {
          ok: true,
          conversationId: confirmed.id,
          existed: Boolean(json.existed),
        };
      } catch (err: any) {
        return { ok: false, error: err?.message || "Failed to open member conversation" };
      }
    },
    [isReadOnly, createManualLead, authFetch, normalizeConversationMeta, normalizeMessages]
  );

  const deleteConversation = useCallback(
    async (senderId: string) => {
      try {
        deletedIdsRef.current.add(senderId);
        recentlyCreatedRef.current.delete(senderId);
        pendingPatchesRef.current.delete(senderId);
        const manualMap = getStoredManualLeads();
        if (manualMap[senderId]) {
          delete manualMap[senderId];
          persistManualLeads(manualMap);
        }
        setConversations((prev) => {
          const next = prev.filter((c) => c.id !== senderId);
          persistConversationsCache(next);
          return next;
        });
        messagesCacheRef.current.delete(senderId);
        if (activeChatIdRef.current === senderId) {
          setActiveChatId(null);
        }
        await authFetch(`${API}/messages/${senderId}`, {
          method: "DELETE",
        });
      } catch (err) {
        console.error("Failed to delete conversation:", err);
      }
    },
    [authFetch]
  );

  const clearWhatsAppConversations = useCallback(
    async (inbox: InboxScope = "admissions") => {
      try {
        const targetInbox: InboxScope = inbox === "operation" ? "operation" : "admissions";
        if (targetInbox === "admissions") {
          persistManualLeads({});
        }
        recentlyCreatedRef.current.clear();
        setConversations((prev) =>
          prev.filter(
            (c) => !(c.channel === "WA" && resolveConvInboxMode(c) === targetInbox)
          )
        );
        const active = conversationsRef.current.find((c) => c.id === activeChatIdRef.current);
        if (active?.channel === "WA" && resolveConvInboxMode(active) === targetInbox) {
          setActiveChatId(null);
        }
        await authFetch(
          `${API}/whatsapp/clear-conversations?account=${encodeURIComponent(targetInbox)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ account: targetInbox }),
          }
        );
      } catch (err) {
        console.error("Failed to clear WhatsApp conversations:", err);
      }
    },
    [authFetch]
  );

  // 0ms optimistic message edit + server sync
  const editMessage = useCallback(
    async (
      chatId: string,
      messageId: string,
      newText: string,
      options?: { mentions?: MessageMention[]; mentionAll?: boolean }
    ): Promise<{ ok: boolean; error?: string }> => {
      if (isReadOnly) return { ok: false, error: "View-only mode" };
      const trimmed = newText.trim();
      if (!trimmed) return { ok: false, error: "Message cannot be empty" };

      const prevCached = messagesCacheRef.current.get(chatId);
      const editedAt = Date.now();
      const nextMentions = options?.mentions;
      const nextMentionAll = options?.mentionAll;

      // 1. Instant 0ms optimistic update
      if (prevCached) {
        const nextCached = prevCached.map((m) =>
          m.id === messageId
            ? {
                ...m,
                text: trimmed,
                mentions: nextMentions !== undefined ? nextMentions : m.mentions,
                mentionAll: nextMentionAll !== undefined ? nextMentionAll : m.mentionAll,
                isEdited: true,
                editedAt,
              }
            : m
        );
        messagesCacheRef.current.set(chatId, nextCached);
      }

      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== chatId) return c;
          return {
            ...c,
            messages: (c.messages || []).map((m) =>
              m.id === messageId
                ? {
                    ...m,
                    text: trimmed,
                    mentions: nextMentions !== undefined ? nextMentions : m.mentions,
                    mentionAll: nextMentionAll !== undefined ? nextMentionAll : m.mentionAll,
                    isEdited: true,
                    editedAt,
                  }
                : m
            ),
          };
        })
      );

      // 2. Persist to backend & WhatsApp
      try {
        const res = await authFetch(`${API}/messages/${chatId}/messages/${messageId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: trimmed,
            mentions: nextMentions,
            mentionAll: nextMentionAll,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          // Rollback on failure
          if (prevCached) {
            messagesCacheRef.current.set(chatId, prevCached);
            setConversations((prev) =>
              prev.map((c) => (c.id === chatId ? { ...c, messages: prevCached } : c))
            );
          }
          return { ok: false, error: json?.error || "Failed to edit message" };
        }
        if (json.data) {
          const patchFromServer = (m: Message): Message =>
            m.id === messageId
              ? {
                  ...m,
                  text: json.data.text || trimmed,
                  mentions: Array.isArray(json.data.mentions) ? json.data.mentions : m.mentions,
                  mentionAll:
                    json.data.mentionAll !== undefined ? Boolean(json.data.mentionAll) : m.mentionAll,
                }
              : m;
          const curCached = messagesCacheRef.current.get(chatId);
          if (curCached) {
            messagesCacheRef.current.set(chatId, curCached.map(patchFromServer));
          }
          setConversations((prev) =>
            prev.map((c) =>
              c.id === chatId ? { ...c, messages: (c.messages || []).map(patchFromServer) } : c
            )
          );
        }
        return { ok: true };
      } catch (err: any) {
        if (prevCached) {
          messagesCacheRef.current.set(chatId, prevCached);
          setConversations((prev) =>
            prev.map((c) => (c.id === chatId ? { ...c, messages: prevCached } : c))
          );
        }
        return { ok: false, error: err?.message || "Network error while editing message" };
      }
    },
    [isReadOnly, authFetch]
  );

  // 0ms optimistic message unsend (delete for everyone on WhatsApp) + server sync
  const unsendMessage = useCallback(
    async (chatId: string, messageId: string): Promise<{ ok: boolean; error?: string }> => {
      if (isReadOnly) return { ok: false, error: "View-only mode" };

      const prevCached = messagesCacheRef.current.get(chatId);
      const deletedAt = Date.now();
      const actorName = user?.name && user.name !== "Staff" ? user.name : null;
      const deletedPlaceholder = "This message was deleted";

      const applyDelete = (m: Message): Message =>
        m.id === messageId
          ? {
              ...m,
              text: deletedPlaceholder,
              attachments: [],
              reactions: [],
              isDeleted: true,
              deletedAt,
              deletedBy:
                actorName ||
                (!m.isIncoming && m.senderName && m.senderName !== "Staff" ? m.senderName : null) ||
                user?.name ||
                "Staff",
            }
          : m;

      // 1. Instant 0ms optimistic update
      if (prevCached) {
        messagesCacheRef.current.set(chatId, prevCached.map(applyDelete));
      }

      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== chatId) return c;
          const msgs = c.messages || [];
          const isLatest = msgs.length > 0 && msgs[msgs.length - 1]?.id === messageId;
          return {
            ...c,
            lastMessageText: isLatest ? deletedPlaceholder : c.lastMessageText,
            messages: msgs.map(applyDelete),
          };
        })
      );

      // 2. Persist to backend & WhatsApp
      try {
        const res = await authFetch(`${API}/messages/${chatId}/messages/${messageId}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deletedBy: actorName || user?.name }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          if (prevCached) {
            messagesCacheRef.current.set(chatId, prevCached);
            setConversations((prev) =>
              prev.map((c) => (c.id === chatId ? { ...c, messages: prevCached } : c))
            );
          }
          return { ok: false, error: json?.error || "Failed to unsend message" };
        }
        return { ok: true };
      } catch (err: any) {
        if (prevCached) {
          messagesCacheRef.current.set(chatId, prevCached);
          setConversations((prev) =>
            prev.map((c) => (c.id === chatId ? { ...c, messages: prevCached } : c))
          );
        }
        return { ok: false, error: err?.message || "Network error while unsending message" };
      }
    },
    [isReadOnly, authFetch, user?.name]
  );

  // 0ms optimistic emoji reaction toggle/update + server sync
  const reactToMessage = useCallback(
    async (chatId: string, messageId: string, emoji: string): Promise<boolean> => {
      if (isReadOnly) return false;
      const prevCached = messagesCacheRef.current.get(chatId);

      // Compute next reactions: if the same emoji is already set by us (fromMe=true), toggle it off ("")
      let effectiveEmoji = emoji.trim();
      const applyReaction = (msg: Message): Message => {
        if (msg.id !== messageId) return msg;
        const current = Array.isArray(msg.reactions) ? msg.reactions : [];
        const myExisting = current.find((r) => r.fromMe);
        if (myExisting && myExisting.emoji === effectiveEmoji) {
          effectiveEmoji = ""; // Toggle off
        }
        const others = current.filter((r) => !r.fromMe);
        const nextReactions: MessageReaction[] = effectiveEmoji
          ? [...others, { emoji: effectiveEmoji, sender: "You", fromMe: true, timestamp: Date.now() }]
          : others;
        return { ...msg, reactions: nextReactions };
      };

      // 1. Instant 0ms optimistic update
      if (prevCached) {
        const nextCached = prevCached.map(applyReaction);
        messagesCacheRef.current.set(chatId, nextCached);
      }

      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== chatId) return c;
          return {
            ...c,
            messages: (c.messages || []).map(applyReaction),
          };
        })
      );

      // 2. Persist to backend & WhatsApp
      try {
        const res = await authFetch(`${API}/messages/${chatId}/messages/${messageId}/react`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emoji: effectiveEmoji }),
        });
        if (!res.ok) {
          if (prevCached) {
            messagesCacheRef.current.set(chatId, prevCached);
            setConversations((prev) =>
              prev.map((c) => (c.id === chatId ? { ...c, messages: prevCached } : c))
            );
          }
          return false;
        }
        return true;
      } catch (err) {
        console.error("Failed to react to message:", err);
        if (prevCached) {
          messagesCacheRef.current.set(chatId, prevCached);
          setConversations((prev) =>
            prev.map((c) => (c.id === chatId ? { ...c, messages: prevCached } : c))
          );
        }
        return false;
      }
    },
    [isReadOnly, authFetch]
  );

  // 0ms optimistic message insertion for instant text & attachment rendering
  const addOptimisticMessages = useCallback((chatId: string, msgs: Message[]) => {
    if (!chatId || !msgs || msgs.length === 0) return;
    const cached = messagesCacheRef.current.get(chatId) || [];
    const nextCached = [...cached, ...msgs];
    messagesCacheRef.current.set(chatId, nextCached);

    const now = Date.now();
    const lastText = msgs[msgs.length - 1]?.text || "";

    const existingPatch = pendingPatchesRef.current.get(chatId);
    pendingPatchesRef.current.set(chatId, {
      updates: {
        ...(existingPatch ? existingPatch.updates : {}),
        lastMessageAt: now,
        lastOutgoingAt: now,
        lastMessageDirection: "outgoing",
        lastMessageText: lastText,
        unreadCount: 0,
      },
      expiresAt: now + 30000,
    });

    const recentEntry = recentlyCreatedRef.current.get(chatId);
    if (recentEntry) {
      recentlyCreatedRef.current.set(chatId, {
        conv: {
          ...recentEntry.conv,
          lastMessageAt: Math.max(recentEntry.conv.lastMessageAt || 0, now),
          lastOutgoingAt: now,
          lastMessageDirection: "outgoing",
          lastMessageText: lastText || recentEntry.conv.lastMessageText,
          unreadCount: 0,
          pipeline: recentEntry.conv.pipeline === "New" ? "Contacted" : recentEntry.conv.pipeline,
          messages: nextCached,
        },
        expiresAt: now + 60000,
      });
    }

    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.id === chatId);
      const fallbackBase =
        idx >= 0 ? prev[idx] : recentEntry?.conv || getStoredManualLeads()[chatId];
      if (!fallbackBase) return prev;
      const nextPipeline = fallbackBase.pipeline === "New" ? "Contacted" : fallbackBase.pipeline;
      const updated: Conversation = {
        ...fallbackBase,
        messages: nextCached,
        lastMessageAt: Math.max(fallbackBase.lastMessageAt || 0, now),
        lastOutgoingAt: now,
        lastMessageDirection: "outgoing",
        lastMessageText: lastText || fallbackBase.lastMessageText,
        unreadCount: 0,
        pipeline: nextPipeline,
      };
      const curPatch = pendingPatchesRef.current.get(chatId);
      if (curPatch) {
        curPatch.updates.pipeline = nextPipeline;
      }
      const rest = idx >= 0 ? prev.filter((_, i) => i !== idx) : prev;
      const next = [updated, ...rest];
      persistConversationsCache(next);
      return next;
    });
  }, []);

  // Replace or remove optimistic messages once the server confirms or rejects delivery
  const finalizeOptimisticMessages = useCallback(
    (chatId: string, tempIds: string[], confirmedRawMessages?: any[]) => {
      if (!chatId) return;
      const tempSet = new Set(tempIds);
      const cached = messagesCacheRef.current.get(chatId) || [];
      const withoutTemp = cached.filter((m) => !tempSet.has(m.id));

      let nextMessages = withoutTemp;
      if (Array.isArray(confirmedRawMessages) && confirmedRawMessages.length > 0) {
        const normalizedConfirmed: Message[] = confirmedRawMessages.map((rm: any) => ({
          id: rm.message_id || rm.messageId || `msg_${Date.now()}`,
          text: rm.text || "",
          attachments: rm.attachments || [],
          time: new Date(rm.timestamp || Date.now()).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          timestamp: rm.timestamp || Date.now(),
          isIncoming: false,
          status: "sent",
          senderName: rm.senderName || undefined,
          mentions: Array.isArray(rm.mentions) ? rm.mentions : undefined,
          mentionAll: Boolean(rm.mentionAll),
          replyTo: rm.replyTo
            ? {
                id: String(rm.replyTo.id || rm.replyTo.messageId),
                text: rm.replyTo.text || "",
                senderName: rm.replyTo.senderName || undefined,
                isIncoming: Boolean(rm.replyTo.isIncoming),
              }
            : undefined,
        }));
        const existingIds = new Set(withoutTemp.map((m) => m.id));
        const toAdd = normalizedConfirmed.filter((m) => !existingIds.has(m.id));
        const mergedExisting = withoutTemp.map((m) => {
          const match = normalizedConfirmed.find((c) => c.id === m.id);
          if (!match) return m;
          return {
            ...m,
            replyTo: m.replyTo || match.replyTo,
            mentions:
              Array.isArray(match.mentions) && match.mentions.length > 0 ? match.mentions : m.mentions,
            mentionAll: Boolean(m.mentionAll || match.mentionAll),
            senderName: resolvePreferredSenderName(match.senderName, m.senderName),
          };
        });
        nextMessages = [...mergedExisting, ...toAdd].sort(
          (a, b) => (a.timestamp || 0) - (b.timestamp || 0)
        );
      }

      messagesCacheRef.current.set(chatId, nextMessages);
      const newestConfirmed =
        Array.isArray(confirmedRawMessages) && confirmedRawMessages.length > 0
          ? confirmedRawMessages[confirmedRawMessages.length - 1]
          : null;

      setConversations((prev) => {
        const next = prev.map((c) => {
          if (c.id !== chatId) return c;
          let nextLog = c.activityLog || [];
          if (Array.isArray(confirmedRawMessages) && confirmedRawMessages.length > 0) {
            const chLabel = c.channel === "WA" ? "WhatsApp" : c.channel === "IG" ? "Instagram" : "Messenger";
            for (let i = 0; i < confirmedRawMessages.length; i++) {
              const rm = confirmedRawMessages[i];
              const actorName = typeof rm?.senderName === "string" ? rm.senderName.trim() : "";
              if (!rm || !isRealSenderName(actorName)) continue;
              const msgTs = rm.timestamp || Date.now();
              const msgId = `msg_${rm.message_id || rm.messageId || msgTs}`;
              if (!nextLog.some((a) => a.id === msgId)) {
                nextLog = [
                  {
                    id: msgId,
                    type: "message_sent" as const,
                    actor: actorName,
                    summary: `Sent ${chLabel} reply`,
                    detail: String(rm.text || "").slice(0, 140),
                    timestamp: msgTs,
                  },
                  ...nextLog,
                ].slice(0, 250);
              }
            }
          }
          const confirmedTs = newestConfirmed ? (newestConfirmed.timestamp || Date.now()) : 0;
          return {
            ...c,
            messages: nextMessages,
            unreadCount: newestConfirmed ? 0 : computeUnreadFromMessages(nextMessages),
            lastMessageAt: Math.max(c.lastMessageAt || 0, confirmedTs),
            lastOutgoingAt: newestConfirmed ? confirmedTs : c.lastOutgoingAt,
            lastMessageDirection: newestConfirmed ? "outgoing" : c.lastMessageDirection,
            lastMessageText: newestConfirmed?.text || c.lastMessageText,
            activityLog: nextLog,
          };
        });
        persistConversationsCache(next);
        return next;
      });

      // If this was a locally stored manual lead and a message was just confirmed on the server,
      // ensure the manual lead metadata (leadName, source, notes, branch, agent) is synced to the server
      // while keeping the local entry protected until the protection window expires.
      if (newestConfirmed) {
        const manualMap = getStoredManualLeads();
        const pendingManual = manualMap[chatId] as (Conversation & { _syncedMeta?: boolean }) | undefined;
        if (pendingManual && !pendingManual._syncedMeta) {
          pendingManual._syncedMeta = true;
          manualMap[chatId] = pendingManual;
          persistManualLeads(manualMap);

          const syncUpdates: Record<string, any> = {};
          if (pendingManual.leadName) {
            syncUpdates.name = pendingManual.leadName;
            syncUpdates.leadName = pendingManual.leadName;
          }
          if (pendingManual.source && pendingManual.source !== "direct") {
            syncUpdates.source = pendingManual.source;
          }
          if (pendingManual.notes) {
            syncUpdates.notes = pendingManual.notes;
          }
          if (pendingManual.branch) {
            syncUpdates.branch = pendingManual.branch;
          }
          if (pendingManual.formAnswers && Object.keys(pendingManual.formAnswers).length > 0) {
            syncUpdates.formAnswers = pendingManual.formAnswers;
          }
          if (pendingManual.agent && pendingManual.agent !== "Unassigned") {
            syncUpdates.agent = pendingManual.agent;
          }
          if (Object.keys(syncUpdates).length > 0) {
            patchConversation(chatId, syncUpdates);
          }
        }
      }
    },
    [patchConversation]
  );

  const forceRefresh = useCallback(async () => {
    lastServerRevRef.current = 0;
    fetchAgents();
    fetchLabels();
    await fetchConversations();
  }, [fetchAgents, fetchLabels, fetchConversations]);

  return (
    <CRMContext.Provider
      value={{
        conversations: visibleConversations,
        admissionsConversations,
        operationConversations,
        loading,
        badgeCounts,
        assignableAgents,
        operationAssignableAgents,
        teamMembers,
        labels,
        labelsLoading,
        createLabel,
        updateLabel,
        deleteLabel,
        refreshLabels: fetchLabels,
        activeChatId,
        setActiveChatId,
        openChat,
        patchConversation,
        updateConversationClaude,
        createManualLead,
        markConversationAsRead,
        refresh: forceRefresh,
        setPollPaused,
        searchQuery,
        setSearchQuery,
        deleteConversation,
        clearWhatsAppConversations,
        editMessage,
        unsendMessage,
        reactToMessage,
        addOptimisticMessages,
        finalizeOptimisticMessages,
        fetchChatMessages: fetchActiveChat,
        fetchGroupParticipants,
        fetchGroupMemberProfile,
        fetchGroupMemberAvatars,
        fetchConversationAvatar,
        openGroupMemberChat,
        pushSupported,
        pushEnabled,
        pushPermission,
        pushBusy,
        enableDevicePush,
        disableDevicePush,
        toggleDevicePush,
        testDevicePush,
      }}
    >
      {children}
    </CRMContext.Provider>
  );
}

export function useCRM() {
  const context = useContext(CRMContext);
  if (!context) {
    throw new Error("useCRM must be used within a CRMProvider");
  }
  return context;
}
