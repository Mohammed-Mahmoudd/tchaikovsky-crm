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
  formAnswers?: {
    instrument?: string;
    studentAge?: string;
    followUpNote?: string;
    notes?: string;
  };
  cashIn?: number;
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

type CRMContextType = {
  conversations: Conversation[];
  loading: boolean;
  badgeCounts: BadgeCounts;
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

export function CRMProvider({ children }: { children: React.ReactNode }) {
  const { isReadOnly, token } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  // ── Refs for stable closures (never cause re-creation of callbacks) ──
  const activeChatIdRef = useRef<string | null>(null);
  const initialLoadDone = useRef(false);

  // Keep the ref in sync with state
  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  // Fix B: when true the 3s poll is silently skipped (set during drag + 3s after drop)
  const pollPausedRef = useRef(false);
  const setPollPaused = useCallback((paused: boolean) => {
    pollPausedRef.current = paused;
  }, []);
  const router = useRouter();

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
      followUpDate: c.followUpDate ? new Date(c.followUpDate).toISOString().split("T")[0] : "",
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
      lastMessageAt: c.lastMessageAt,
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
              ? { ...c, messages: newMessages, unreadCount: 0 }
              : c
          )
        );
      }
    } catch (err) {
      console.error("CRMContext: failed to fetch active chat", err);
    }
  }, [normalizeMessages]);

  // ── Stable polling: slim bulk every 3s (interval never restarts) ──
  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 3000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  // ── Active chat polling: fetch full messages for the open conversation ──
  useEffect(() => {
    if (!activeChatId) return;

    // Immediate fetch when chat is selected
    fetchActiveChat(activeChatId);

    const interval = setInterval(() => {
      // Re-read from ref in case activeChatId changed (shouldn't, but defensive)
      const currentId = activeChatIdRef.current;
      if (currentId) fetchActiveChat(currentId);
    }, 3000);

    return () => clearInterval(interval);
  }, [activeChatId, fetchActiveChat]);

  // Compute live badges across all pages
  const badgeCounts = useMemo<BadgeCounts>(() => {
    const today = new Date().toISOString().split("T")[0];

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

      // 4. Follow-ups badge: due today or overdue
      if (c.followUpDate) {
        if (c.followUpDate <= today) {
          followUps += 1;
        }
      } else if (c.followUpNote && c.followUpNote.trim()) {
        followUps += 1;
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
          return prev.map((c) => (c.id === id ? { ...c, ...updates, source: sourceObj } : c));
        });
      } else {
        // 2. Instant optimistic update
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
        );
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
            setConversations((prev) =>
              prev.map((c) =>
                c.id === id
                  ? { ...confirmed, messages: c.messages } as Conversation // keep loaded messages
                  : c
              )
            );
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
