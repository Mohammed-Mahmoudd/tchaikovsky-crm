"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../components/AuthProvider";
import { formatMetaErrorMessage } from "../utils/errorParser";

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
  pipeline: "New" | "Contacted" | "Audition Booked" | "Attended" | "Enrolled" | "Unqualified" | "Lost" | "direct";
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
  markConversationAsRead: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  // Fix B: lets Pipeline pause the 3s poll during drag so it never races the PATCH
  setPollPaused: (paused: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  deleteConversation: (id: string) => Promise<void>;
  clearWhatsAppConversations: () => Promise<void>;
  editMessage: (chatId: string, messageId: string, newText: string) => Promise<{ ok: boolean; error?: string }>;
  reactToMessage: (chatId: string, messageId: string, emoji: string) => Promise<boolean>;
  addOptimisticMessages: (chatId: string, msgs: Message[]) => void;
  finalizeOptimisticMessages: (chatId: string, tempIds: string[], confirmedRawMessages?: any[]) => void;
};

const CRMContext = createContext<CRMContextType | undefined>(undefined);

const API = "/api";
const CACHE_KEY = "crm_conversations_cache";

function getCachedConversations(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Failed to read CRM conversations cache:", e);
  }
  return [];
}

function persistConversationsCache(convs: Conversation[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(convs));
  } catch {}
}

function safeDateIso(val: any): string {
  if (!val) return "";
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return "";
    return d.toISOString().split("T")[0];
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

  // Fix B: when true the 3s poll is silently skipped (set during drag + 3s after drop)
  const pollPausedRef = useRef(false);
  const setPollPaused = useCallback((paused: boolean) => {
    pollPausedRef.current = paused;
  }, []);
  const router = useRouter();

  // ── Fetch assignable agents and full team list once on mount (cached 60s on backend, ~0ms on hit) ──
  useEffect(() => {
    let ignore = false;
    const fetchAgents = async () => {
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
        let res = await fetch(`${API}/messages/agents?all=1`);
        if (!res.ok) {
          res = await fetch(`${API}/agents?all=1`);
        }
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.data)) {
            data.data.forEach(addMember);
          }
        }

        // 2. If authenticated (e.g. Chairman), also fetch full users list so all roles (Enrollment Director, Finance, Marketing, etc.) are included even before backend restart
        if (token) {
          try {
            const usersRes = await fetch(`${API}/auth/users`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (usersRes.ok) {
              const usersData = await usersRes.json();
              if (usersData.success && Array.isArray(usersData.users)) {
                usersData.users.forEach(addMember);
              }
            }
          } catch {}
        }

        if (!ignore && mergedMap.size > 0) {
          const allMembers = Array.from(mergedMap.values());
          setTeamMembers(allMembers);

          const allowedRoles = ["chairman", "owner", "manager", "admission_officer", "agent"];
          const filtered = allMembers.filter((a: AssignableAgent) =>
            allowedRoles.includes((a.role || "").toLowerCase().trim())
          );
          setAssignableAgents(filtered);
        }
      } catch (e) {
        console.warn("Failed to load assignable agents:", e);
      }
    };
    fetchAgents();
    return () => { ignore = true; };
  }, [token]);

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
      unreadCount: c.unreadCount || 0,
      windowLeft: "Active",
      pipeline: c.pipeline || "New",
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
        const byId = new Map<string, ActivityLogEntry>();
        [...srcLog, ...topLog].forEach((entry: any) => {
          if (entry && entry.id && entry.type) {
            byId.set(String(entry.id), {
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
          }
        });
        return Array.from(byId.values()).sort((a, b) => b.timestamp - a.timestamp);
      })(),
      branch: c.branch || "",
      formAnswers: c.formAnswers || {},
      cashIn: (() => {
        if (c.cashIn !== undefined && c.cashIn !== null) return Number(c.cashIn) || 0;
        if (typeof c.source === "object" && c.source?.cashIn !== undefined && c.source?.cashIn !== null) {
          return Number(c.source.cashIn) || 0;
        }
        if (typeof window !== "undefined") {
          const local = localStorage.getItem(`crm_cash_${c.senderId || c._id}`);
          if (local !== null) return Number(local) || 0;
        }
        return 0;
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

  // ── Slim bulk fetch — metadata only, never touches messages ──
  const fetchConversations = useCallback(async () => {
    // Fix B: skip this poll cycle if a drag is in progress or we're in the post-drop quiet window
    if (pollPausedRef.current) return;
    try {
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${API}/messages?slim=1`, { headers });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const now = Date.now();
        const currentActiveId = activeChatIdRef.current;

        const rawList = isMetaReviewer
          ? json.data.filter(isReviewerAllowedConversation)
          : json.data;

        const parsed: Conversation[] = rawList.map((c: any) => {
          const meta = normalizeConversationMeta(c);
          const pending = pendingPatchesRef.current.get(meta.id);
          if (pending) {
            if (now > pending.expiresAt) {
              pendingPatchesRef.current.delete(meta.id);
            } else {
              // Maintain optimistic updates so stale in-flight server poll data never reverts card position
              return { ...meta, ...pending.updates, messages: messagesCacheRef.current.get(meta.id) || [] };
            }
          }

          // Always preserve cached messages — slim poll NEVER wipes them
          const cachedMessages = messagesCacheRef.current.get(meta.id) || [];
          return {
            ...meta,
            // If this is the active chat, keep unreadCount at 0
            unreadCount: meta.id === currentActiveId ? 0 : meta.unreadCount,
            messages: cachedMessages,
          } as Conversation;
        });

        setConversations(parsed);
        if (!isMetaReviewer) {
          persistConversationsCache(parsed);
        }
      }
    } catch (err) {
      console.error("CRMContext: failed to fetch conversations", err);
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
      const res = await fetch(`${API}/messages/${chatId}`, { headers });
      const json = await res.json();
      if (json.success && json.data) {
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

        // Merge into conversations state (touch active conversation's messages and metadata)
        setConversations((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: newMessages,
                  unreadCount: 0,
                  lastMessageAt: json.data?.lastMessageAt || c.lastMessageAt,
                  pipeline: json.data?.pipeline || c.pipeline,
                  agent: json.data?.agent || c.agent,
                  status: json.data?.status || c.status,
                }
              : c
          )
        );
      }
    } catch (err) {
      console.error("CRMContext: failed to fetch active chat", err);
    }
  }, [normalizeMessages]);

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
        messagesCacheRef.current.clear();
        pendingPatchesRef.current.clear();
        fetchConversations();
      } else {
        // Logged out: clear data and cache
        setConversations([]);
        setActiveChatId(null);
        messagesCacheRef.current.clear();
        pendingPatchesRef.current.clear();
        initialLoadDone.current = false;
        setLoading(true);
        try {
          localStorage.removeItem(CACHE_KEY);
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

              // 1. Update conversations list instantly
              setConversations((prev) => {
                const idx = prev.findIndex((c) => c.id === conversationId);
                const targetUnread = conversationId === currentActiveId || isOutgoing ? 0 : (remoteConv?.unreadCount ?? 1);
                const targetPipeline = remoteConv?.pipeline || (isOutgoing ? "Contacted" : undefined);

                if (idx >= 0) {
                  const existing = prev[idx];
                  const updated: Conversation = {
                    ...existing,
                    // Never move backwards (history-synced/late messages must not rewind it)
                    lastMessageAt: Math.max(
                      existing.lastMessageAt || 0,
                      remoteConv?.lastMessageAt || 0,
                      message?.timestamp || Date.now()
                    ),
                    unreadCount: targetUnread,
                    pipeline: (targetPipeline && existing.pipeline === "New" ? targetPipeline : existing.pipeline) as any,
                  };
                  if (remoteConv?.name && !existing.name) updated.name = remoteConv.name;
                  if (remoteConv?.agent) updated.agent = remoteConv.agent;
                  if (remoteConv?.status) updated.status = remoteConv.status;

                  // Move to top of the conversation list
                  const remaining = prev.filter((_, i) => i !== idx);
                  return [updated, ...remaining];
                } else if (remoteConv) {
                  // Newly created conversation arriving in real-time
                  const normalized = normalizeConversationMeta(remoteConv);
                  return [{ ...normalized, messages: [] }, ...prev];
                }
                return prev;
              });

              // 2. If this is the currently active chat, append the message in real-time
              if (currentActiveId === conversationId && message) {
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
                  reactions: Array.isArray(message.reactions) ? message.reactions : [],
                };

                const cached = messagesCacheRef.current.get(conversationId) || [];
                const existingIdx = cached.findIndex((m) => m.id === formattedMsg.id);
                let updatedMessages: Message[];
                if (existingIdx >= 0) {
                  // Merge upgraded fields (e.g. attachment URL or senderName) into existing message
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
                        }
                      : m
                  );
                } else {
                  // Keep chronological order even if an older message arrives late
                  updatedMessages = [...cached, formattedMsg].sort(
                    (a, b) => (a.timestamp || 0) - (b.timestamp || 0)
                  );
                }
                messagesCacheRef.current.set(conversationId, updatedMessages);

                setConversations((prev) =>
                  prev.map((c) =>
                    c.id === conversationId
                      ? { ...c, messages: updatedMessages, unreadCount: 0 }
                      : c
                  )
                );
              }
            } else if (payload.type === "conversation_updated" && payload.data) {
              const { conversationId, conversation: remoteConv } = payload.data;
              if (!conversationId || !remoteConv) return;
              setConversations((prev) => {
                const exists = prev.some((c) => c.id === conversationId);
                if (!exists) {
                  return [{ ...normalizeConversationMeta(remoteConv), messages: [] }, ...prev];
                }
                return prev.map((c) => {
                  if (c.id !== conversationId) return c;
                  return {
                    ...c,
                    ...normalizeConversationMeta(remoteConv),
                    messages: c.messages,
                  };
                });
              });
            } else if (payload.type === "marked_read" && payload.data) {
              const { conversationId } = payload.data;
              if (conversationId) {
                setConversations((prev) =>
                  prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c))
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
            }
          } catch (e) {
            console.error("CRMContext: SSE message parse error", e);
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
        console.error("CRMContext: SSE setup error", err);
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
  }, [normalizeConversationMeta]);

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
      if ((c.pipeline !== "Audition Booked" || c.auditionOutcome === "joining-later" || hasFollowUpTag) && !c.followUpCompleted) {
        if (c.followUpDate) {
          if (c.followUpDate <= today) {
            followUps += 1;
          }
        } else if (c.followUpNote && c.followUpNote.trim()) {
          followUps += 1;
        } else if (c.auditionOutcome === "joining-later" || hasFollowUpTag) {
          followUps += 1;
        }
      }
    });

    return { inbox, leads, auditions, followUps };
  }, [visibleConversations]);

  // Instant optimistic update across all pages + background PATCH
  const patchConversation = useCallback(
    async (id: string, updates: Partial<Record<string, any>>) => {
      if (isReadOnly) {
        console.warn("View-only account: modifications are disabled.");
        return;
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
        persistConversationsCache(next);
        return next;
      });

      // Fix A: raise TTL to 30s
      pendingPatchesRef.current.set(id, {
        updates: patchPayload,
        expiresAt: Date.now() + 30000,
      });

      // 3. Persist to API
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(`${API}/messages/${id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(patchPayload),
        });
        const json = await res.json();
        if (json && json.success) {
          // Fix C: on confirmed write, immediately merge the server-confirmed data
          // into state so the next poll cannot revert it (the source of truth is now
          // the server response, not the optimistic guess).
          if (json.data) {
            const confirmed = normalizeConversationMeta(json.data);
            setConversations((prev) => {
              const next = prev.map((c) =>
                c.id === id
                  ? ({ ...confirmed, messages: c.messages } as Conversation) // keep loaded messages
                  : c
              );
              persistConversationsCache(next);
              return next;
            });
          }
          // Safe to clear the pending guard now — server confirmed the write
          pendingPatchesRef.current.delete(id);
        } else {
          // Server rejected the patch (e.g. 403 Forbidden or 409 Conflict): rollback
          pendingPatchesRef.current.delete(id);
          try {
            const rollbackRes = await fetch(`${API}/messages/${id}`, { headers });
            const rollbackJson = await rollbackRes.json();
            if (rollbackJson && rollbackJson.data) {
              const confirmed = normalizeConversationMeta(rollbackJson.data);
              setConversations((prev) => {
                const next = prev.map((c) =>
                  c.id === id
                    ? ({ ...confirmed, messages: c.messages } as Conversation)
                    : c
                );
                persistConversationsCache(next);
                return next;
              });
            }
          } catch {}
          if (json && json.error && typeof window !== "undefined") {
            const parsed = formatMetaErrorMessage(json.error);
            console.warn(`Conversation update notice: ${parsed.title} - ${parsed.message}`);
          }
        }
      } catch (err) {
        console.error("Failed to patch conversation:", err);
        // On network error keep the optimistic update; it will reconcile on next poll
      }
    },
    [isReadOnly, token, normalizeConversationMeta]
  );

  // Mark as read in UI and backend (only PATCH if unreadCount was actually > 0 so updatedAt is never clobbered)
  const markConversationAsRead = useCallback(async (id: string) => {
    let hadUnread = false;
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === id) {
          if ((c.unreadCount || 0) > 0) hadUnread = true;
          return { ...c, unreadCount: 0 };
        }
        return c;
      })
    );
    if (!hadUnread) return;
    try {
      await fetch(`${API}/messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unreadCount: 0 }),
      });
    } catch (err) {
      console.error("Failed to mark as read:", err);
    }
  }, []);

  // 1-Click navigation from any page to open that user's chat in Inbox
  const openChat = useCallback(
    (id: string) => {
      setActiveChatId(id);
      router.push("/");
    },
    [router]
  );

  const deleteConversation = useCallback(
    async (senderId: string) => {
      try {
        setConversations((prev) => prev.filter((c) => c.id !== senderId));
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
    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.id === chatId);
      if (idx < 0) return prev;
      const target = prev[idx];
      const updated: Conversation = {
        ...target,
        messages: [...(target.messages || []), ...msgs],
        lastMessageAt: Math.max(target.lastMessageAt || 0, now),
        unreadCount: 0,
        pipeline: target.pipeline === "New" ? "Contacted" : target.pipeline,
      };
      const rest = prev.filter((_, i) => i !== idx);
      return [updated, ...rest];
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
          replyTo: rm.replyTo || undefined,
        }));
        const existingIds = new Set(withoutTemp.map((m) => m.id));
        const toAdd = normalizedConfirmed.filter((m) => !existingIds.has(m.id));
        nextMessages = [...withoutTemp, ...toAdd].sort(
          (a, b) => (a.timestamp || 0) - (b.timestamp || 0)
        );
      }

      messagesCacheRef.current.set(chatId, nextMessages);
      const newestConfirmed =
        Array.isArray(confirmedRawMessages) && confirmedRawMessages.length > 0
          ? confirmedRawMessages[confirmedRawMessages.length - 1]
          : null;

      setConversations((prev) =>
        prev.map((c) => {
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
          return {
            ...c,
            messages: nextMessages,
            lastOutgoingAt: newestConfirmed?.timestamp || Date.now(),
            lastMessageDirection: "outgoing",
            lastMessageText: newestConfirmed?.text || c.lastMessageText,
            activityLog: nextLog,
          };
        })
      );
    },
    []
  );

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
        markConversationAsRead,
        refresh: fetchConversations,
        setPollPaused,
        searchQuery,
        setSearchQuery,
        deleteConversation,
        clearWhatsAppConversations,
        editMessage,
        reactToMessage,
        addOptimisticMessages,
        finalizeOptimisticMessages,
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
