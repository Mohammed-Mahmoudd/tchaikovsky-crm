"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";

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
        campaign: string;
        adset: string;
        ad: string;
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
};

const CRMContext = createContext<CRMContextType | undefined>(undefined);

const API = "/api";

export function CRMProvider({ children }: { children: React.ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const router = useRouter();

  // Normalize raw API data to CRM Conversation model
  const normalizeConversation = useCallback((c: any): Conversation => {
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
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      lastMessageAt: c.lastMessageAt,
      messages: (c.messages || []).map((m: any) => ({
        id: m.messageId,
        text: m.text || "",
        attachments: m.attachments || [],
        time: m.timestamp
          ? new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "",
        isIncoming: m.direction === "incoming",
      })),
    };
  }, []);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`${API}/messages`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const parsed = json.data.map(normalizeConversation);
        setConversations(
          activeChatId
            ? parsed.map((c: Conversation) => (c.id === activeChatId ? { ...c, unreadCount: 0 } : c))
            : parsed
        );
      }
    } catch (err) {
      console.error("CRMContext: failed to fetch conversations", err);
    } finally {
      setLoading(false);
    }
  }, [normalizeConversation, activeChatId]);

  // Unified single polling loop
  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 3000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

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
      // 1. Optimistic update
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
      );

      // 2. Persist to API
      try {
        await fetch(`${API}/messages/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
      } catch (err) {
        console.error("Failed to patch conversation:", err);
      }
    },
    []
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
