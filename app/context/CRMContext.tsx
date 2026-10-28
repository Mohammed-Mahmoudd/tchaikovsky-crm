"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../components/AuthProvider";

export type Channel = "WA" | "IG" | "FB";

export type Message = {
  id: string;
  text: string;
  attachments?: any[];
  time: string;
  isIncoming: boolean;
  isRead?: boolean;
  dir?: "rtl" | "ltr";
};

export type Conversation = {
  id: string; // senderId
  name: string;
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
    [key: string]: any;
  }
  | string;
  notes?: string;
  followUpNote?: string;
  followUpDate?: string;
  followUpCompleted?: boolean;
  followUpCompletedAt?: string;
  auditionDate?: string;
  formAnswers?: {
    instrument?: string;
    studentAge?: string;
    followUpNote?: string;
    notes?: string;
  };
  cashIn?: number;
  branch?: string;
  auditionOutcome?: string;
  messages: Message[];
  createdAt?: string;
  updatedAt?: string;
  lastMessageAt?: number;
};

export type BadgeCounts = {
  inbox: number;
  leads: number;
  auditions: number;
  followUps: number;
};

export type AssignableAgent = { name: string; role: string };

type CRMContextType = {
  conversations: Conversation[];
  loading: boolean;
  badgeCounts: BadgeCounts;
  assignableAgents: AssignableAgent[];
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
  openChat: (id: string) => void;
  patchConversation: (id: string, updates: Partial<Record<string, any>>) => Promise<void>;
  markConversationAsRead: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  // Fix B: lets Pipeline pause the 3s poll during drag so it never races the PATCH
  setPollPaused: (paused: boolean) => void;
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

export function CRMProvider({ children }: { children: React.ReactNode }) {
  const { isReadOnly, token } = useAuth();
  // Hydrate instantly from cache so dashboard/reports/pipeline appear in 0ms (no loading spinner)
  const [conversations, setConversations] = useState<Conversation[]>(getCachedConversations);
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

  // ── Fetch assignable agents once on mount (cached 60s on backend, ~0ms on hit) ──
  useEffect(() => {
    let ignore = false;
    const fetchAgents = async () => {
      try {
        let res = await fetch(`${API}/messages/agents`);
        if (!res.ok) {
          res = await fetch(`${API}/agents`);
        }
        const data = await res.json();
        if (!ignore && data.success && Array.isArray(data.data)) {
          const allowedRoles = ["chairman", "owner", "manager", "admission_officer", "agent"];
          const filtered = data.data.filter((a: AssignableAgent) =>
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
  }, []);

  // ── Messages cache: lives outside React state so slim polls never touch it ──
  const messagesCacheRef = useRef<Map<string, Message[]>>(new Map());

  // Normalize raw API data to CRM Conversation model (without messages)
  const normalizeConversationMeta = useCallback((c: any): Omit<Conversation, "messages"> => {
    return {
      id: c.senderId,
      name:
        c.name ||
        (c.channel === "FB"
          ? "Messenger User"
          : c.channel === "IG"
            ? "Instagram User"
            : "WhatsApp User"),
      phone: c.phone || `Live ${c.channel}`,
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
      auditionOutcome: c.auditionOutcome || "",
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
      isIncoming: m.direction === "incoming",
    }));
  }, []);

  // Track pending optimistic updates so periodic background polling does not overwrite recently moved/updated leads
  const pendingPatchesRef = useRef<Map<string, { updates: Partial<Record<string, any>>; expiresAt: number }>>(new Map());

  // ── Slim bulk fetch — metadata only, never touches messages ──
  const fetchConversations = useCallback(async () => {
    // Fix B: skip this poll cycle if a drag is in progress or we're in the post-drop quiet window
    if (pollPausedRef.current) return;
    try {
      const res = await fetch(`${API}/messages?slim=1`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const now = Date.now();
        const currentActiveId = activeChatIdRef.current;

        const parsed: Conversation[] = json.data.map((c: any) => {
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
        persistConversationsCache(parsed);
      }
    } catch (err) {
      console.error("CRMContext: failed to fetch conversations", err);
    } finally {
      if (!initialLoadDone.current) {
        initialLoadDone.current = true;
        setLoading(false);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizeConversationMeta]);
  // NOTE: activeChatId intentionally excluded — we use the ref instead
  // so this callback is stable and the polling interval never restarts on chat selection.

  // ── Fetch full messages for the active chat only ──
  const fetchActiveChat = useCallback(async (chatId: string) => {
    try {
      const res = await fetch(`${API}/messages/${chatId}`);
      const json = await res.json();
      if (json.success && json.data) {
        const newMessages = normalizeMessages(json.data.messages);

        // Update the messages cache
        messagesCacheRef.current.set(chatId, newMessages);

        // Merge into conversations state (only touch the active conversation's messages)
        setConversations((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: newMessages,
                  unreadCount: 0,
                  lastMessageAt: json.data?.lastMessageAt || c.lastMessageAt,
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

  // Compute live badges across all pages
  const badgeCounts = useMemo<BadgeCounts>(() => {
    const today = getLocalTodayIso();

    let inbox = 0;
    let leads = 0;
    let auditions = 0;
    let followUps = 0;

    conversations.forEach((c) => {
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
      if ((c.pipeline !== "Audition Booked" || c.auditionOutcome === "joining-later") && !c.followUpCompleted) {
        if (c.followUpDate) {
          if (c.followUpDate <= today) {
            followUps += 1;
          }
        } else if (c.followUpNote && c.followUpNote.trim()) {
          followUps += 1;
        } else if (c.auditionOutcome === "joining-later") {
          followUps += 1;
        }
      }
    });

    return { inbox, leads, auditions, followUps };
  }, [conversations]);

  // Instant optimistic update across all pages + background PATCH
  const patchConversation = useCallback(
    async (id: string, updates: Partial<Record<string, any>>) => {
      if (isReadOnly) {
        console.warn("View-only account: modifications are disabled.");
        return;
      }

      const patchPayload = { ...updates };

      if (updates.cashIn !== undefined) {
        const numCash = Number(updates.cashIn) || 0;
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem(`crm_cash_${id}`, String(numCash));
          } catch {}
        }
        // Also attach cashIn inside source object so current remote MongoDB persists it immediately
        setConversations((prev) => {
          const current = prev.find((conv) => conv.id === id);
          const currentSource = current?.source;
          const sourceObj = typeof currentSource === "object" && currentSource !== null
            ? { ...currentSource, cashIn: numCash }
            : { campaign: currentSource && currentSource !== "direct" ? currentSource : "Direct", cashIn: numCash };
          patchPayload.source = sourceObj;
          const next = prev.map((c) => (c.id === id ? { ...c, ...updates, source: sourceObj } : c));
          persistConversationsCache(next);
          return next;
        });
      } else {
        // 2. Instant optimistic update
        setConversations((prev) => {
          const next = prev.map((c) => (c.id === id ? { ...c, ...updates } : c));
          persistConversationsCache(next);
          return next;
        });
      }

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
        }
      } catch (err) {
        console.error("Failed to patch conversation:", err);
        // On network error keep the optimistic update; it will reconcile on next poll
      }
    },
    [isReadOnly, token, normalizeConversationMeta]
  );

  // Mark as read in UI and backend
  const markConversationAsRead = useCallback(async (id: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c))
    );
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

  return (
    <CRMContext.Provider
      value={{
        conversations,
        loading,
        badgeCounts,
        assignableAgents,
        activeChatId,
        setActiveChatId,
        openChat,
        patchConversation,
        markConversationAsRead,
        refresh: fetchConversations,
        setPollPaused,
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
