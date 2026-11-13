"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../components/AuthProvider";
import { formatMetaErrorMessage } from "../utils/errorParser";
import {
  computeUnreadFromMessages,
  getLastRealMessageDirection,
  isLastMessageFromLead,
} from "../utils/conversationMessages";

export { computeUnreadFromMessages, getLastRealMessageDirection, isLastMessageFromLead };

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
  status: "Open" | "Pending" | "Resolved";
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
  activityLog?: ActivityLogEntry[];
  messages: Message[];
  createdAt?: string;
  updatedAt?: string;
  lastMessageAt?: number;
  lastMessageText?: string;
  lastMessageDirection?: "incoming" | "outgoing";
  lastOutgoingAt?: number;
  lastSeenAt?: number;
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
  loading: boolean;
  badgeCounts: BadgeCounts;
  assignableAgents: AssignableAgent[];
  teamMembers: AssignableAgent[];
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
  openChat: (id: string) => void;
  patchConversation: (id: string, updates: Partial<Record<string, any>>) => Promise<void>;
  createManualLead: (input: CreateManualLeadInput) => Promise<CreateManualLeadResult>;
  markConversationAsRead: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  // Fix B: lets Pipeline pause the 3s poll during drag so it never races the PATCH
  setPollPaused: (paused: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  deleteConversation: (id: string) => Promise<void>;
  clearWhatsAppConversations: () => Promise<void>;
  editMessage: (chatId: string, messageId: string, newText: string) => Promise<{ ok: boolean; error?: string }>;
  unsendMessage: (chatId: string, messageId: string) => Promise<{ ok: boolean; error?: string }>;
  reactToMessage: (chatId: string, messageId: string, emoji: string) => Promise<boolean>;
  addOptimisticMessages: (chatId: string, msgs: Message[]) => void;
  finalizeOptimisticMessages: (chatId: string, tempIds: string[], confirmedRawMessages?: any[]) => void;
  fetchChatMessages: (chatId: string) => Promise<void>;
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
    if (c.profileName) item.profileName = c.profileName;
    if (c.leadName) item.leadName = c.leadName;
    if (c.metaChannel) item.metaChannel = c.metaChannel;
    if (c.metaSenderId) item.metaSenderId = c.metaSenderId;
    if (c.formPhone) item.formPhone = c.formPhone;
    if (c.unreadCount) item.unreadCount = c.unreadCount;
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
    if (c.lastSeenAt) item.lastSeenAt = c.lastSeenAt;
    return item as Conversation;
  });
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
        return parsed;
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
        return migrated;
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

export function CRMProvider({ children }: { children: React.ReactNode }) {
  const { isReadOnly, token, user } = useAuth();
  const isMetaReviewer = Boolean(
    user?.email && user.email.toLowerCase().trim() === "test@meta.com"
  );

  // Hydrate instantly from cache so dashboard/reports/pipeline appear in 0ms (no loading spinner)
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const cached = getCachedConversations();
    if (typeof window !== "undefined" && user?.email?.toLowerCase().trim() === "test@meta.com") {
      return cached.filter(isReviewerAllowedConversation);
    }
    return cached;
  });

  useEffect(() => {
    if (isMetaReviewer) {
      setConversations((prev) => prev.filter(isReviewerAllowedConversation));
    }
  }, [isMetaReviewer]);
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
  const [teamMembers, setTeamMembers] = useState<AssignableAgent[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // ── Refs for stable closures (never cause re-creation of callbacks) ──
  const activeChatIdRef = useRef<string | null>(null);
  const conversationsRef = useRef<Conversation[]>(conversations);
  conversationsRef.current = conversations;
  const initialLoadDone = useRef(false);

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
      // Only apply IDB snapshot if live server fetch hasn't already populated full activityLog data
      if (lastServerRevRef.current > 0 && conversationsRef.current.length >= idbConvs.length) {
        return;
      }
      setConversations((prev) => {
        if (prev.length === 0) {
          return idbConvs.map((c) => ({
            ...c,
            messages: messagesCacheRef.current.get(c.id) || c.messages || [],
          }));
        }
        const idbMap = new Map<string, Conversation>(idbConvs.map((c) => [c.id, c]));
        return prev.map((current) => {
          const idbC = idbMap.get(current.id);
          if (!idbC) return current;
          return {
            ...idbC,
            ...current, // Preserve newer in-memory/localStorage fields (agent, pipeline, notes, status, etc.)
            activityLog:
              Array.isArray(idbC.activityLog) && idbC.activityLog.length > (current.activityLog?.length || 0)
                ? idbC.activityLog
                : current.activityLog,
            messages: messagesCacheRef.current.get(current.id) || current.messages || [],
          };
        });
      });
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isMetaReviewer]);

  // Fix B: when true the 3s poll is silently skipped (set during drag + 3s after drop)
  const pollPausedRef = useRef(false);
  const setPollPaused = useCallback((paused: boolean) => {
    pollPausedRef.current = paused;
  }, []);
  const router = useRouter();

  // ── Fetch assignable agents and full team list (cached on backend, invalidated on team_updated SSE) ──
  const fetchAgents = useCallback(async () => {
    try {
      const mergedMap = new Map<string, AssignableAgent>();
      const addMember = (m: any) => {
        if (!m || !m.name) return;
        if (m.active === false) return;
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

      // 1. Fetch public/all agents endpoint
      let res = await fetch(`${API}/messages/agents?all=1`, { cache: "no-store" }).catch(() => null);
      if (!res || !res.ok) {
        res = await fetch(`${DIRECT_API}/messages/agents?all=1`, { cache: "no-store" }).catch(() => null);
      }
      if (res && res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.success && Array.isArray(data.data)) {
          data.data.forEach(addMember);
        }
      }

      // 2. If authenticated (e.g. Chairman), also fetch full users list so all roles (Enrollment Director, Finance, Marketing, etc.) are included
      if (token) {
        try {
          const usersRes = await fetch(`${API}/auth/users`, {
            headers: { Authorization: `Bearer ${token}` },
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
        const allMembers = Array.from(mergedMap.values());
        setTeamMembers(allMembers);

        const allowedRoles = ["chairman", "owner", "manager", "enrollment_director", "admission_officer", "agent"];
        const filtered = allMembers.filter((a: AssignableAgent) =>
          allowedRoles.includes((a.role || "").toLowerCase().trim())
        );
        setAssignableAgents(filtered);
      }
    } catch (e) {
      console.warn("Failed to load assignable agents:", e);
    }
  }, [token]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // ── Messages cache: lives outside React state so slim polls never touch it ──
  const messagesCacheRef = useRef<Map<string, Message[]>>(new Map());

  // Normalize raw API data to CRM Conversation model (without messages)
  const normalizeConversationMeta = useCallback((c: any): Omit<Conversation, "messages"> => {
    return {
      id: c.senderId,
      _id: c._id ? String(c._id) : undefined,
      name: (() => {
        // WA leads are always displayed by their phone number only (never the
        // WhatsApp push-name / username or the raw LID identifier).
        if (c.channel === "WA") {
          const isPhone = (v: any) => typeof v === "string" && /^\+\d{7,13}$/.test(v.trim());
          if (isPhone(c.phone)) return c.phone.trim();
          const digits = String(c.senderId || "").replace(/\D/g, "");
          // Real phone JIDs are ≤13 digits; 14-15 digit values are unresolved LIDs
          if (digits.length >= 7 && digits.length <= 13) return `+${digits}`;
          // No resolvable phone (unresolved LID) → fall back to the WhatsApp profile name
          const pushName = typeof c.name === "string" ? c.name.trim() : "";
          if (pushName && pushName !== "WhatsApp User" && pushName !== "WhatsApp Contact" && !/^\+?\d+$/.test(pushName)) {
            return pushName;
          }
          return "WhatsApp Contact";
        }

        // If a real human name is present, use it
        const isPlaceholder = !c.name ||
          c.name === "WhatsApp User" ||
          c.name === "WhatsApp Contact" ||
          /^\+\d{13,}$/.test(c.name); // Fake LID number placeholder

        if (!isPlaceholder && !/^\+\d+$/.test(c.name)) return c.name;

        if (c.channel === "FB") return c.name || "Messenger User";
        if (c.channel === "IG") return c.name || "Instagram User";

        // WA: prefer genuine E.164 phone number from DB (e.g. +201126633680)
        const validPhone = c.phone && /^\+\d{7,13}$/.test(c.phone) ? c.phone : null;
        const derivedPhone = c.senderId && c.senderId.length <= 13 ? `+${String(c.senderId).replace(/\D/g, "")}` : null;
        return validPhone || (!isPlaceholder ? c.name : null) || derivedPhone || c.phone || "WhatsApp Contact";
      })(),
      profileName: (() => {
        const ln = typeof c.leadName === "string" ? c.leadName.trim() : "";
        if (ln && ln !== "WhatsApp User" && ln !== "WhatsApp Contact" && !/^\+?\d+$/.test(ln)) {
          return ln;
        }
        if (c.channel !== "WA") return undefined;
        const n = typeof c.name === "string" ? c.name.trim() : "";
        if (!n || n === "WhatsApp User" || n === "WhatsApp Contact" || /^\+?\d+$/.test(n)) return undefined;
        return n;
      })(),
      leadName: (() => {
        const ln = typeof c.leadName === "string" ? c.leadName.trim() : "";
        if (ln && ln !== "WhatsApp User" && ln !== "WhatsApp Contact" && !/^\+?\d+$/.test(ln)) {
          return ln;
        }
        return undefined;
      })(),
      metaChannel: (c.metaChannel as Channel) || undefined,
      metaSenderId: c.metaSenderId || undefined,
      formPhone: c.formPhone || undefined,
      phone: (() => {
        if (c.phone && /^\+\d{7,15}$/.test(c.phone)) return c.phone;
        if (c.formPhone) {
          const fDigits = String(c.formPhone).replace(/\D/g, "");
          if (fDigits.length >= 7 && fDigits.length <= 15) return `+${fDigits}`;
        }
        if (c.channel === "WA") {
          const digits = String(c.senderId || "").replace(/\D/g, "");
          if (digits.length >= 7 && digits.length <= 13) return `+${digits}`;
        }
        return c.phone || `Live ${c.channel}`;
      })(),
      agent: c.agent || "Unassigned",
      channel: (c.channel as Channel) || "FB",
      status: c.status || "Open",
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
          const srcCash = Number(c.source.cashIn) || 0;
          if (srcCash > 0) return srcCash;
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
      lastSeenAt: c.lastSeenAt,
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
  const pendingPatchesRef = useRef<Map<string, { updates: Partial<Record<string, any>>; expiresAt: number }>>(new Map());

  // Track recently created/opened manual leads so in-flight background polls can NEVER wipe them out before server sync settles
  const recentlyCreatedRef = useRef<Map<string, { conv: Conversation; expiresAt: number }>>(new Map());
  const deletedIdsRef = useRef<Set<string>>(new Set());
  const lastServerRevRef = useRef<number>(0);

  // ── Slim bulk fetch — metadata only, never touches messages ──
  const fetchConversations = useCallback(async () => {
    // Fix B: skip this poll cycle if a drag is in progress or we're in the post-drop quiet window
    if (pollPausedRef.current) return;
    try {
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const canUseDeltaRev =
        lastServerRevRef.current > 0 &&
        conversationsRef.current.length > 250 &&
        pendingPatchesRef.current.size === 0 &&
        recentlyCreatedRef.current.size === 0;
      const revQuery = canUseDeltaRev ? `&rev=${lastServerRevRef.current}` : "";
      let res = await fetch(`${API}/messages?slim=1${revQuery}`, {
        headers,
        cache: "no-store",
      }).catch(() => null);
      if (!res || !res.ok) {
        res = await fetch(`https://api.tchaikovskyschool.com/crm-api/messages?slim=1${revQuery}`, {
          headers,
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
            // Evict stale cached messages for inactive chats if the server has a newer message timestamp
            if (cachedMessages.length > 0 && meta.id !== activeChatIdRef.current) {
              const lastCachedTs = cachedMessages[cachedMessages.length - 1]?.timestamp || 0;
              if ((meta.lastMessageAt || 0) > lastCachedTs + 1000) {
                messagesCacheRef.current.delete(meta.id);
                cachedMessages = [];
              }
            }
            const pending = pendingPatchesRef.current.get(meta.id);
            if (pending) {
              if (now > pending.expiresAt) {
                pendingPatchesRef.current.delete(meta.id);
              } else {
                // Maintain optimistic updates so stale in-flight server poll data never reverts card position
                const mergedMeta = {
                  ...meta,
                  ...pending.updates,
                  lastMessageAt: Math.max(meta.lastMessageAt || 0, pending.updates.lastMessageAt || 0),
                  messages: cachedMessages,
                } as Conversation;
                return mergedMeta;
              }
            }

            // Always preserve valid cached messages — slim poll NEVER wipes them
            const resolvedUnread =
              cachedMessages.length > 0
                ? computeUnreadFromMessages(cachedMessages)
                : meta.unreadCount;
            return {
              ...meta,
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

        setConversations((prev) => {
          if (prev.length === 0) {
            if (!isMetaReviewer) persistConversationsCache(parsed);
            return parsed;
          }

          const prevById = new Map<string, Conversation>();
          for (let i = 0; i < prev.length; i++) {
            prevById.set(prev[i].id, prev[i]);
          }

          // Preserve any conversation from `prev` that is currently active or has an active optimistic guard
          // if an in-flight poll resolved with a slightly older snapshot
          const parsedIds = new Set(parsed.map((c) => c.id));
          const currentActive = activeChatIdRef.current;
          for (let i = 0; i < prev.length; i++) {
            const oldC = prev[i];
            if (parsedIds.has(oldC.id) || deletedIdsRef.current.has(oldC.id)) continue;
            const hasRecentGuard =
              (recentlyCreatedRef.current.get(oldC.id)?.expiresAt || 0) > now ||
              (pendingPatchesRef.current.get(oldC.id)?.expiresAt || 0) > now ||
              oldC.id === currentActive;
            if (hasRecentGuard) {
              parsed.unshift({
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
            const isSame =
              oldConv.updatedAt === nextConv.updatedAt &&
              oldConv.lastMessageAt === nextConv.lastMessageAt &&
              oldConv.lastMessageText === nextConv.lastMessageText &&
              oldConv.lastMessageDirection === nextConv.lastMessageDirection &&
              oldConv.lastOutgoingAt === nextConv.lastOutgoingAt &&
              oldConv.lastSeenAt === nextConv.lastSeenAt &&
              oldConv.unreadCount === nextConv.unreadCount &&
              oldConv.pipeline === nextConv.pipeline &&
              oldConv.agent === nextConv.agent &&
              oldConv.status === nextConv.status &&
              oldConv.name === nextConv.name &&
              oldConv.profileName === nextConv.profileName &&
              oldConv.leadName === nextConv.leadName &&
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
              (oldConv.activityLog?.length || 0) === (nextConv.activityLog?.length || 0) &&
              oldConv.cashIn === nextConv.cashIn &&
              oldConv.notes === nextConv.notes &&
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
  }, [normalizeConversationMeta, isMetaReviewer, token]);
  // NOTE: activeChatId intentionally excluded — we use the ref instead
  // so this callback is stable and the polling interval never restarts on chat selection.

  // ── Fetch full messages for the active chat only ──
  const fetchActiveChat = useCallback(async (chatId: string) => {
    if (isMetaReviewer && !isReviewerAllowedConversation({ id: chatId })) {
      return;
    }
    try {
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      let res = await fetch(`${API}/messages/${chatId}`, {
        headers,
        cache: "no-store",
      }).catch(() => null);
      if (!res || !res.ok) {
        res = await fetch(`${DIRECT_API}/messages/${chatId}`, {
          headers,
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

        // Update the messages cache
        messagesCacheRef.current.set(chatId, newMessages);
        const computedUnread = computeUnreadFromMessages(newMessages);
        const computedDirection = getLastRealMessageDirection(newMessages);
        const lastMsgTs =
          newMessages.length > 0 ? newMessages[newMessages.length - 1]?.timestamp || 0 : 0;
        const pending = pendingPatchesRef.current.get(chatId);
        const hasActivePending = Boolean(pending && Date.now() <= pending.expiresAt);
        const keepPendingDirection = Boolean(
          hasActivePending &&
            pending?.updates.lastMessageDirection &&
            (pending?.updates.lastMessageAt || 0) >= lastMsgTs
        );
        const normActive = normalizeConversationMeta(json.data);

        // Merge into conversations state (touch active conversation's messages and metadata)
        setConversations((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? {
                  ...c,
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
                  auditionOutcome:
                    hasActivePending && pending?.updates.auditionOutcome !== undefined
                      ? pending.updates.auditionOutcome
                      : normActive.auditionOutcome ?? c.auditionOutcome,
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
                  agent: (hasActivePending && pending?.updates.agent) || normActive.agent || c.agent,
                  status: (hasActivePending && pending?.updates.status) || normActive.status || c.status,
                }
              : c
          )
        );

        if (!isReadOnly && (json.data?.unreadCount || 0) !== computedUnread) {
          const patchHeaders: Record<string, string> = { "Content-Type": "application/json" };
          if (token) patchHeaders["Authorization"] = `Bearer ${token}`;
          fetch(`${API}/messages/${chatId}`, {
            method: "PATCH",
            headers: patchHeaders,
            body: JSON.stringify({ unreadCount: computedUnread }),
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.warn("CRMContext: failed to fetch active chat", err);
    }
  }, [normalizeMessages, isMetaReviewer, token, isReadOnly]);

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
        pendingPatchesRef.current.clear();
        recentlyCreatedRef.current.clear();
        deletedIdsRef.current.clear();
        fetchConversations();
      } else {
        // Logged out: clear data and cache
        setConversations([]);
        setActiveChatId(null);
        lastServerRevRef.current = 0;
        messagesCacheRef.current.clear();
        pendingPatchesRef.current.clear();
        recentlyCreatedRef.current.clear();
        deletedIdsRef.current.clear();
        initialLoadDone.current = false;
        setLoading(true);
        try {
          localStorage.removeItem(CACHE_KEY);
          localStorage.removeItem(V2_CACHE_KEY);
          localStorage.removeItem(LEGACY_CACHE_KEY);
          clearConversationsIDB();
        } catch {}
      }
    }
  }, [token, fetchConversations, conversations.length]);

  // ── Real-Time Server-Sent Events (SSE) Stream ──
  // Instant (< 30ms) reflection when messages arrive or someone replies in Meta Inbox
  useEffect(() => {
    if (typeof window === "undefined") return;

    let eventSource: EventSource | null = null;
    let reconnectTimer: NodeJS.Timeout;
    let isCancelled = false;

    function connectSSE() {
      if (isCancelled) return;
      try {
        eventSource = new EventSource(`${API}/messages/stream`);

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

            if (payload.type === "message" && payload.data) {
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
                  replyTo: formattedReplyTo,
                };

                const cached = messagesCacheRef.current.get(conversationId) || [];
                const existingIdx = cached.findIndex((m) => m.id === formattedMsg.id);
                let updatedMessages: Message[];
                if (existingIdx >= 0) {
                  updatedMessages = cached.map((m, idx) =>
                    idx === existingIdx
                      ? {
                          ...m,
                          ...formattedMsg,
                          attachments:
                            formattedMsg.attachments && formattedMsg.attachments.length > 0
                              ? formattedMsg.attachments
                              : m.attachments,
                          senderName: formattedMsg.senderName || m.senderName,
                          replyTo: formattedMsg.replyTo || m.replyTo,
                        }
                      : m
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
                  const fallbackUnread = isOutgoing
                    ? 0
                    : remoteConv?.unreadCount && remoteConv.unreadCount > 0
                    ? remoteConv.unreadCount
                    : (existing.unreadCount || 0) + 1;
                  const targetUnread = updatedMessagesForConv
                    ? isOutgoing
                      ? 0
                      : computeUnreadFromMessages(updatedMessagesForConv)
                    : fallbackUnread;

                  const updated: Conversation = {
                    ...existing,
                    ...(normRemote
                      ? {
                          name: normRemote.name || existing.name,
                          profileName: normRemote.profileName || existing.profileName,
                          leadName: normRemote.leadName || existing.leadName,
                          phone: normRemote.phone || existing.phone,
                          formPhone: normRemote.formPhone || existing.formPhone,
                          activityLog:
                            normRemote.activityLog && normRemote.activityLog.length > 0
                              ? normRemote.activityLog
                              : existing.activityLog,
                          source: normRemote.source || existing.source,
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
                  persistConversationsCache(nextList);
                  return nextList;
                }
                const pending = pendingPatchesRef.current.get(conversationId);
                const hasPending = Boolean(pending && Date.now() <= pending.expiresAt);
                const nextList = prev.map((c) => {
                  if (c.id !== conversationId) return c;
                  const norm = normalizeConversationMeta(remoteConv);
                  const cachedMsgs = messagesCacheRef.current.get(conversationId) || c.messages || [];
                  return {
                    ...c,
                    ...norm,
                    ...(hasPending ? pending?.updates : {}),
                    lastMessageAt: Math.max(
                      c.lastMessageAt || 0,
                      norm.lastMessageAt || 0,
                      hasPending ? pending?.updates.lastMessageAt || 0 : 0
                    ),
                    unreadCount: cachedMsgs.length > 0 ? computeUnreadFromMessages(cachedMsgs) : norm.unreadCount,
                    messages: cachedMsgs,
                  };
                });
                persistConversationsCache(nextList);
                return nextList;
              });
            } else if (payload.type === "marked_read" && payload.data) {
              const { conversationId } = payload.data;
              if (conversationId) {
                setConversations((prev) =>
                  prev.map((c) => {
                    if (c.id !== conversationId) return c;
                    const cachedMsgs = messagesCacheRef.current.get(conversationId) || c.messages || [];
                    const computed = cachedMsgs.length > 0 ? computeUnreadFromMessages(cachedMsgs) : 0;
                    return { ...c, unreadCount: computed };
                  })
                );
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
            } else if (payload.type === "conversations_purged" && payload.data) {
              if (payload.data.channel === "WA") {
                setConversations((prev) => prev.filter((c) => c.channel !== "WA"));
                const active = conversations.find((c) => c.id === activeChatIdRef.current);
                if (active?.channel === "WA") {
                  setActiveChatId(null);
                }
              }
            } else if (payload.type === "message_edited" && payload.data) {
              const { conversationId, messageId, text, editedAt } = payload.data;
              if (!conversationId || !messageId) return;

              const cached = messagesCacheRef.current.get(conversationId);
              if (cached) {
                const updated = cached.map((m) =>
                  m.id === messageId
                    ? { ...m, text, isEdited: true, editedAt: editedAt || Date.now() }
                    : m
                );
                messagesCacheRef.current.set(conversationId, updated);
              }

              setConversations((prev) =>
                prev.map((c) => {
                  if (c.id !== conversationId) return c;
                  const updatedMessages = c.messages?.map((m) =>
                    m.id === messageId
                      ? { ...m, text, isEdited: true, editedAt: editedAt || Date.now() }
                      : m
                  );
                  return { ...c, messages: updatedMessages || [] };
                })
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
            } else if (payload.type === "names_updated") {
              // WhatsApp backfill completed on backend — refresh conversations so real names appear
              fetchConversations();
            } else if (payload.type === "team_updated") {
              // Staff user created, updated, or deleted — refresh agents & team members live
              fetchAgents();
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
          if (!isCancelled) {
            reconnectTimer = setTimeout(connectSSE, 4000);
          }
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
      clearTimeout(reconnectTimer);
    };
  }, [normalizeConversationMeta, fetchConversations, fetchAgents, isMetaReviewer]);

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

  // Scoped view for Meta Reviewer test account (test@meta.com)
  const visibleConversations = useMemo(() => {
    if (isMetaReviewer) {
      return conversations.filter(isReviewerAllowedConversation);
    }
    return conversations;
  }, [conversations, isMetaReviewer]);

  // Compute live badges across all pages
  const badgeCounts = useMemo<BadgeCounts>(() => {
    const today = getLocalTodayIso();

    let inbox = 0;
    let leads = 0;
    let auditions = 0;
    let followUps = 0;

    visibleConversations.forEach((c) => {
      // 1. Inbox badge: total unread messages
      if (c.unreadCount && c.unreadCount > 0) {
        inbox += c.unreadCount;
      }

      // 2. Leads badge: newly arrived uncontacted leads
      if (c.pipeline === "New") {
        leads += 1;
      }

      // 3. Auditions badge: booked auditions
      if (c.pipeline === "Audition Booked") {
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

    return { inbox, leads, auditions, followUps };
  }, [visibleConversations]);

  // Instant optimistic update across all pages + background PATCH
  const patchConversation = useCallback(
    async (id: string, rawUpdates: Partial<Record<string, any>>) => {
      if (isReadOnly) {
        console.warn("View-only account: modifications are disabled.");
        return;
      }

      const currentForSync = conversationsRef.current.find((conv) => conv.id === id);
      const updates: Record<string, any> = { ...rawUpdates };

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
        updates.cashIn !== undefined || isBooking || isAttending || isEnrolling || isPaying;

      setConversations((prev) => {
        const current = prev.find((conv) => conv.id === id);
        const enrichedUpdates: Record<string, any> = { ...updates };
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
                summary: `Recorded payment: ${nextCash.toLocaleString()} EGP`,
                detail: prevCash > 0 ? `Updated from ${prevCash.toLocaleString()} EGP` : "Payment logged",
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
          const currentSource = current?.source;
          const baseSource =
            typeof currentSource === "object" && currentSource !== null
              ? { ...currentSource }
              : {
                  campaign:
                    typeof currentSource === "string" && currentSource.trim() && currentSource !== "direct"
                      ? currentSource
                      : "Organic / Direct",
                };

          if (generatedActivities.length > 0) {
            const existingLog = Array.isArray(current?.activityLog) ? current.activityLog : [];
            const nextLog = [...generatedActivities, ...existingLog].slice(0, 120);
            baseSource.activityLog = nextLog;
            enrichedUpdates.activityLog = nextLog;
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
          if (isBooking && current?.pipeline !== "Audition Booked") {
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

          patchPayload.source = baseSource;
          enrichedUpdates.source = baseSource;
        }

        const next = prev.map((c) => (c.id === id ? { ...c, ...enrichedUpdates } : c));
        persistConversationsCache(next, true);
        return next;
      });

      // Fix A: raise TTL to 30s and merge with any existing pending optimistic fields
      const existingPending = pendingPatchesRef.current.get(id);
      pendingPatchesRef.current.set(id, {
        updates: {
          ...(existingPending ? existingPending.updates : {}),
          ...patchPayload,
        },
        expiresAt: Date.now() + 30000,
      });

      const recentEntry = recentlyCreatedRef.current.get(id);
      if (recentEntry) {
        recentlyCreatedRef.current.set(id, {
          conv: { ...recentEntry.conv, ...patchPayload } as Conversation,
          expiresAt: Date.now() + 60000,
        });
      }

      // 3. Persist to API
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(`${API}/messages/${id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(patchPayload),
        });
        const json = await res.json().catch(() => null);
        if (json && json.success) {
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
          // Keep a 15s post-write guard in case an older slim poll is already in-flight
          const currentPending = pendingPatchesRef.current.get(id);
          if (currentPending) {
            pendingPatchesRef.current.set(id, {
              updates: currentPending.updates,
              expiresAt: Date.now() + 15000,
            });
          }
        } else if (res.status === 404 && recentlyCreatedRef.current.has(id)) {
          // Brand-new manual lead whose POST /api/messages/manual is still in-flight; keep optimistic state
        } else if (res.status === 401 || res.status === 403 || res.status === 409) {
          // Server rejected the patch (e.g. 403 Forbidden or 409 Conflict): rollback
          pendingPatchesRef.current.delete(id);
          try {
            const rollbackRes = await fetch(`${API}/messages/${id}`, { headers });
            if (rollbackRes.ok) {
              const rollbackJson = await rollbackRes.json().catch(() => null);
              if (rollbackJson && rollbackJson.data) {
                const confirmed = normalizeConversationMeta(rollbackJson.data);
                setConversations((prev) => {
                  const next = prev.map((c) =>
                    c.id === id
                      ? ({ ...confirmed, messages: c.messages } as Conversation)
                      : c
                  );
                  persistConversationsCache(next, true);
                  return next;
                });
              }
            }
          } catch {}
          if (json && json.error && typeof window !== "undefined") {
            const parsed = formatMetaErrorMessage(json.error);
            console.warn(`Conversation update notice: ${parsed.title} - ${parsed.message}`);
            try {
              window.dispatchEvent(
                new CustomEvent("crm:toast", {
                  detail: {
                    type: "error",
                    message: json.error || parsed.message || "Failed to update lead",
                  },
                })
              );
            } catch {}
          }
        }
      } catch (err) {
        console.warn("Failed to patch conversation:", err);
        // On network error keep the optimistic update; it will reconcile on next poll
      }
    },
    [isReadOnly, token, normalizeConversationMeta]
  );

  // Unread count is only cleared when a staff member replies (never on chat selection)
  const markConversationAsRead = useCallback(async (_id: string) => {
    // Intentionally a no-op on chat open so entering a conversation by mistake
    // preserves the blue unread message count until a reply is sent.
  }, []);

  // 1-Click navigation from any page to open that user's chat in Inbox
  const openChat = useCallback(
    (id: string) => {
      activeChatIdRef.current = id;
      setActiveChatId(id);
      setSearchQuery("");
      router.push("/");
    },
    [router]
  );

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

      const { digits: senderId, e164: e164Phone } = normalized;
      deletedIdsRef.current.delete(senderId);

      const cleanName = (input.name || "").trim();
      const cleanReferralType = (input.referralType || "").trim() || "Student Referral";
      const cleanReferredBy = (input.referredBy || "").trim();
      const cleanBranch = (input.branch || "").trim();
      const cleanInstrument = (input.instrument || "").trim();
      const rawNotes = (input.notes || "").trim();

      const noteParts: string[] = [];
      if (cleanReferredBy) {
        noteParts.push(`Referred by: ${cleanReferredBy} (${cleanReferralType})`);
      }
      if (cleanInstrument) {
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

      // Check if lead already exists in current conversations state
      const existingConv = conversations.find(
        (c) =>
          c.id === senderId ||
          c.phone === e164Phone ||
          c.formPhone === senderId ||
          (c.phone && normalizeWhatsAppPhone(c.phone)?.digits === senderId)
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
          summary: `Added manual lead (${cleanReferralType})`,
          detail: cleanReferredBy ? `Referred by ${cleanReferredBy}` : e164Phone,
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
          detail: "Assigned on manual lead creation",
          fromValue: "Unassigned",
          toValue: resolvedAgent,
          timestamp: now + 1,
        });
      }

      const sourceObj = {
        campaign: cleanReferralType,
        adset: cleanReferredBy ? `Referred by: ${cleanReferredBy}` : "Manual Lead",
        ad: "WhatsApp Manual Lead",
        activityLog: initialActivities,
      };

      const optimisticConv: Conversation = {
        id: senderId,
        name: e164Phone,
        profileName: cleanName || undefined,
        leadName: cleanName || undefined,
        formPhone: senderId,
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
        formAnswers: cleanInstrument ? { instrument: cleanInstrument } : {},
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
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch(`${API}/messages/manual`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            phone: e164Phone,
            name: cleanName || undefined,
            referralType: cleanReferralType,
            referredBy: cleanReferredBy || undefined,
            agent: resolvedAgent,
            branch: cleanBranch || undefined,
            notes: rawNotes || undefined,
            instrument: cleanInstrument || undefined,
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
    [isReadOnly, user, conversations, patchConversation, token, normalizeConversationMeta]
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
        await fetch(`${API}/messages/${senderId}`, {
          method: "DELETE",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
      } catch (err) {
        console.error("Failed to delete conversation:", err);
      }
    },
    [token]
  );

  const clearWhatsAppConversations = useCallback(async () => {
    try {
      persistManualLeads({});
      recentlyCreatedRef.current.clear();
      setConversations((prev) => prev.filter((c) => c.channel !== "WA"));
      const active = conversations.find((c) => c.id === activeChatIdRef.current);
      if (active?.channel === "WA") {
        setActiveChatId(null);
      }
      await fetch(`${API}/whatsapp/clear-conversations`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch (err) {
      console.error("Failed to clear WhatsApp conversations:", err);
    }
  }, [conversations, token]);

  // 0ms optimistic message edit + server sync
  const editMessage = useCallback(
    async (chatId: string, messageId: string, newText: string): Promise<{ ok: boolean; error?: string }> => {
      if (isReadOnly) return { ok: false, error: "View-only mode" };
      const trimmed = newText.trim();
      if (!trimmed) return { ok: false, error: "Message cannot be empty" };

      const prevCached = messagesCacheRef.current.get(chatId);
      const editedAt = Date.now();

      // 1. Instant 0ms optimistic update
      if (prevCached) {
        const nextCached = prevCached.map((m) =>
          m.id === messageId ? { ...m, text: trimmed, isEdited: true, editedAt } : m
        );
        messagesCacheRef.current.set(chatId, nextCached);
      }

      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== chatId) return c;
          return {
            ...c,
            messages: (c.messages || []).map((m) =>
              m.id === messageId ? { ...m, text: trimmed, isEdited: true, editedAt } : m
            ),
          };
        })
      );

      // 2. Persist to backend & WhatsApp
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(`${API}/messages/${chatId}/messages/${messageId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ text: trimmed }),
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
    [isReadOnly, token]
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
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(`${API}/messages/${chatId}/messages/${messageId}`, {
          method: "DELETE",
          headers,
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
    [isReadOnly, token, user?.name]
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
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(`${API}/messages/${chatId}/messages/${messageId}/react`, {
          method: "POST",
          headers,
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
    [isReadOnly, token]
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
          if (match && !m.replyTo && match.replyTo) {
            return { ...m, replyTo: match.replyTo };
          }
          return m;
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
          if (newestConfirmed && newestConfirmed.senderName) {
            const msgTs = newestConfirmed.timestamp || Date.now();
            const msgId = `msg_${newestConfirmed.message_id || newestConfirmed.messageId || msgTs}`;
            if (!nextLog.some((a) => a.id === msgId)) {
              const chLabel = c.channel === "WA" ? "WhatsApp" : c.channel === "IG" ? "Instagram" : "Messenger";
              nextLog = [
                {
                  id: msgId,
                  type: "message_sent" as const,
                  actor: String(newestConfirmed.senderName),
                  summary: `Sent ${chLabel} reply`,
                  detail: String(newestConfirmed.text || "").slice(0, 140),
                  timestamp: msgTs,
                },
                ...nextLog,
              ].slice(0, 120);
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
    await fetchConversations();
  }, [fetchAgents, fetchConversations]);

  return (
    <CRMContext.Provider
      value={{
        conversations: visibleConversations,
        loading,
        badgeCounts,
        assignableAgents,
        teamMembers,
        activeChatId,
        setActiveChatId,
        openChat,
        patchConversation,
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
