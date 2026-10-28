"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Info, X, Calendar, CheckCircle2, Trash2 } from "lucide-react";
import { useBranches } from "./lib/branches";
import { BranchSelect } from "./components/BranchSelect";

type Channel = "WA" | "IG" | "FB";

type Message = {
  id: string;
  text: string;
  attachments?: any[];
  time: string;
  isIncoming: boolean;
  isRead?: boolean;
  dir?: "rtl" | "ltr";
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

import { useCRM } from "./context/CRMContext";
import { useAuth } from "./components/AuthProvider";
import { formatLastMessageTime } from "./utils/time";
import MessageTemplate, { parseTemplateAttachment } from "./components/MessageTemplate";
import InstagramMedia from "./components/InstagramMedia";

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
  if (conv.formAnswers && isRealPhone((conv.formAnswers as any).phone)) {
    return (conv.formAnswers as any).phone;
  }
  for (const m of conv.messages || []) {
    if (!m.text) continue;
    const match = m.text.match(/(?:phone|mobile|tel|رقم|هاتف|جوال|واتس)?[:\s]*(\+?966[\d\s-]{8,}|05[\d\s-]{8,})/i);
    if (match && match[1]) {
      return match[1].trim();
    }
    const digitMatch = m.text.match(/\b(05\d[\d\s-]{6,}\d|\+?966[\d\s-]{7,}\d)\b/);
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
  "Audition Booked",
  "Attended",
  "Enrolled",
  "Unqualified",
  "Lost",
] as const;

const PIPELINE_STAGE_COLORS: Record<string, string> = {
  "New": "#007AFF",
  "Contacted": "#5856D6",
  "Audition Booked": "#FF9500",
  "Attended": "#34C759",
  "Enrolled": "#30D158",
  "Unqualified": "#8E8E93",
  "Lost": "#FF3B30",
};

type MobileView = "list" | "chat" | "details";

export default function InboxPage() {
  const [activeFilter, setActiveFilter] = useState("All");
  const [mobileView, setMobileView] = useState<MobileView>("list");
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const { isReadOnly, user, token } = useAuth();

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const filters = ["All", "Mine", "Unassigned", "Open", "Resolved"];

  const {
    conversations,
    activeChatId,
    setActiveChatId,
    assignableAgents,
    patchConversation,
    markConversationAsRead,
    refresh,
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
      markConversationAsRead(activeChatId);
    }
  }, [activeChatId, markConversationAsRead]);

  // ── Filter logic ──────────────────────────────────────────────────
  const filteredConversations = conversations.filter((conv) => {
    if (activeFilter === "All") return true;
    if (activeFilter === "Mine") return conv.agent === user?.name;
    if (activeFilter === "Unassigned") return conv.agent === "Unassigned";
    if (activeFilter === "Open") return conv.status === "Open";
    if (activeFilter === "Resolved") return conv.status === "Resolved";
    return true;
  });

  // Use activeChatId directly — no duplicate local state
  const activeConv = conversations.find((c) => c.id === activeChatId);

  // ── Assignment & Permission Logic ─────────────────────────────────
  const userClean = (user?.name || "").trim().toLowerCase();
  const agentClean = (activeConv?.agent || "").trim().toLowerCase();
  const isAssigned = !!agentClean && agentClean !== "unassigned";
  const isAssignedToMe = isAssigned && !!userClean && userClean === agentClean;
  const isChairman = user?.role === "chairman" || user?.role === "owner" || user?.role === "manager";
  const isAssignedToOther = isAssigned && !isAssignedToMe;
  const canSendMessages = !isReadOnly && (!isAssignedToOther || isChairman);

  // Audition booking modal state
  const [showAuditionModal, setShowAuditionModal] = useState(false);
  const [auditionDate, setAuditionDate] = useState("");
  const [auditionTime, setAuditionTime] = useState("05:00 PM");
  const [auditionNotes, setAuditionNotes] = useState("");
  const [auditionBranch, setAuditionBranch] = useState("");
  const { branchGroups } = useBranches();
  const [isBookingAudition, setIsBookingAudition] = useState(false);

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

  const scrollToBottom = (behavior: ScrollBehavior = "auto") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

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
  }, [activeChatId, activeConv?.messages?.length]);

  const handleSendReply = async () => {
    if (isReadOnly || !replyText.trim() || !activeConv || !canSendMessages) return;
    setIsSending(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`/api/messages/${activeConv.id}/reply`, {
        method: "POST",
        headers,
        body: JSON.stringify({ text: replyText, channel: activeConv.channel }),
      });
      if (res.ok) {
        setReplyText("");
        refresh();
      } else {
        const data = await res.json().catch(() => null);
        if (data?.error) {
          alert(data.error);
        }
      }
    } catch (err) {
      console.error("Failed to send reply:", err);
    } finally {
      setIsSending(false);
    }
  };

  const handleSelectConv = (id: string) => {
    setActiveChatId(id);
    setMobileView("chat");
    setShowDetailsPanel(false);
    markConversationAsRead(id);
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
          flex flex-col h-full 
          w-full md:w-[300px] lg:w-[320px] shrink-0
          ${mobileView === "list" ? "flex" : "hidden md:flex"}
        `}
        style={{ background: "var(--bg-card)", borderRight: "1px solid var(--border-main)" }}
      >
        <div className="p-4" style={{ borderBottom: "1px solid var(--border-main)" }}>
          <h1 className="text-[18px] font-bold mb-3 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            Inbox
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--bg-pill)", color: "var(--text-secondary)" }}>
              {filteredConversations.length}
            </span>
          </h1>
          <div className="flex flex-wrap gap-2">
            {filters.map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors ${activeFilter === filter ? "bg-[#0066FF] text-white" : ""
                  }`}
                style={activeFilter !== filter ? { background: "var(--bg-pill)", color: "var(--text-secondary)" } : undefined}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredConversations.map((conv) => {
            const isActive = conv.id === activeChatId;
            const timeStr = formatLastMessageTime(conv.lastMessageAt);
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
                    {conv.agent}
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
                    {conv.channel}
                  </span>
                  <div className="flex items-center gap-1.5 mt-auto">
                    {timeStr && (
                      <span
                        className="text-[10px] font-medium"
                        style={{
                          color: isActive ? "#0066FF" : "var(--text-muted)",
                          opacity: isActive ? 0.9 : 0.85,
                        }}
                      >
                        {timeStr}
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
          })}
        </div>
      </div>

      {/* ── MIDDLE: Conversation Detail ── */}
      <div
        className={`
          flex-1 flex flex-col min-w-0
          ${mobileView === "chat" || mobileView === "list" ? "" : ""}
          ${mobileView === "list" ? "hidden md:flex" : "flex"}
        `}
        style={{ background: "var(--bg-page)" }}
      >
        {activeConv ? (
          <>
            {/* Chat Header */}
            <div
              className="flex items-center justify-between px-4 md:px-6 py-3 gap-2"
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
                  </h2>
                  <div className="flex items-center text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                    <span className="truncate">
                      {activeConv.channel === "WA" ? "WhatsApp" : activeConv.channel === "IG" ? "Instagram" : "Messenger"}
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
                {/* Dropdowns — hidden on small mobile, shown on sm+ */}
                <div className="hidden sm:flex items-center gap-2">
                  <select
                    disabled={isReadOnly || !isChairman}
                    title={!isChairman ? "Only Chairman can assign agents" : undefined}
                    value={activeConv.agent}
                    onChange={(e) => patchConversation(activeConv.id, { agent: e.target.value })}
                    className="rounded-[6px] text-[12px] py-1 px-2 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ border: "1px solid var(--border-input)", color: "var(--text-primary)", background: "var(--bg-input)" }}
                  >
                    <option value="Unassigned">Unassigned</option>
                    {activeConv.agent && activeConv.agent !== "Unassigned" && !assignableAgents.some(a => a.name === activeConv.agent) && (
                      <option value={activeConv.agent}>{activeConv.agent}</option>
                    )}
                    {assignableAgents.map(a => (
                      <option key={a.name} value={a.name}>{a.name}</option>
                    ))}
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
            <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-4">
              {(() => {
                const convPhone = extractPhoneFromConversation(activeConv);
                return activeConv.messages.map((msg) => {
                  const hasTemplateAttachment = (msg.attachments || []).some(isTemplateAttachment);
                  const hasSharedPostAttachment = (msg.attachments || []).some(
                    (a: any) => a.type === "ig_post" || a.type === "ig_reel" || a.type === "share"
                  );
                  const hasMediaAttachment = (msg.attachments || []).some(
                    (a: any) => ["image", "audio", "video", "ig_post", "ig_reel", "share"].includes(a.type)
                  );
                  const shouldRenderFallbackCard = !hasTemplateAttachment && !hasMediaAttachment && isPlaceholderText(msg.text);

                  let showPlainText = Boolean(msg.text && !isPlaceholderText(msg.text));
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

                  return (
                    <div key={msg.id} className={`flex ${msg.isIncoming ? "justify-start" : "justify-end"}`}>
                      <div
                        className={`${
                          hasTemplateAttachment || shouldRenderFallbackCard || hasSharedPostAttachment
                            ? "max-w-[88%] sm:max-w-[300px] p-2 sm:p-2.5"
                            : "max-w-[85%] md:max-w-[70%] px-4 py-3"
                        } rounded-2xl ${
                          msg.isIncoming ? "rounded-tl-sm" : "rounded-tr-sm"
                        }`}
                        style={{
                          background: msg.isIncoming ? "var(--bg-chat-incoming)" : "var(--bg-chat-outgoing)",
                          border: msg.isIncoming ? "1px solid var(--border-main)" : "none",
                          boxShadow: "var(--shadow-card)",
                        }}
                      >
                        {/* Media attachments (photos, voice notes, video) */}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="flex flex-col gap-2 mb-1.5">
                            {msg.attachments.map((att: any, idx: number) => {
                              if (isTemplateAttachment(att)) return null;
                              const url = att.payload?.url || att.url;
                              if (att.type === "image" && url) {
                                return (
                                  <img
                                    key={idx}
                                    src={url}
                                    alt="Attachment"
                                    className="max-w-full rounded-lg max-h-60 object-cover"
                                  />
                                );
                              }
                              if (att.type === "audio" && url) {
                                return (
                                  <audio key={idx} controls className="max-w-full my-1">
                                    <source src={url} />
                                  </audio>
                                );
                              }
                              if (att.type === "video" && url) {
                                return (
                                  <video key={idx} controls className="max-w-full rounded-lg max-h-60 my-1">
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
                            className={`text-[14px] md:text-[15px] leading-relaxed ${
                              hasTemplateAttachment || shouldRenderFallbackCard ? "mb-3" : ""
                            } ${msg.dir === "rtl" ? "text-right" : "text-left"}`}
                            style={{ color: msg.isIncoming ? "var(--text-chat-incoming)" : "var(--text-chat-outgoing)" }}
                            dir={msg.dir}
                          >
                            {msg.text}
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

                        <div
                          className={`text-[10px] mt-1.5 ${msg.dir === "rtl" ? "text-right" : "text-left"}`}
                          style={{ color: msg.isIncoming ? "var(--text-muted)" : "var(--text-chat-outgoing)", opacity: msg.isIncoming ? 1 : 0.6 }}
                        >
                          {!msg.isIncoming && msg.isRead && "✓✓ "}
                          {msg.time}
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input */}
            <div className="px-4 md:px-6 py-4 shrink-0" style={{ background: "var(--bg-card)", borderTop: "1px solid var(--border-main)" }}>
              {isAssignedToOther && (
                <div
                  className="rounded-[8px] px-3 py-2 text-[11px] mb-2.5 flex items-center gap-2"
                  style={{
                    background: isChairman ? "rgba(255, 149, 0, 0.08)" : "rgba(255, 59, 48, 0.08)",
                    border: `1px solid ${isChairman ? "rgba(255, 149, 0, 0.25)" : "rgba(255, 59, 48, 0.25)"}`,
                    color: isChairman ? "#FF9500" : "#FF3B30",
                  }}
                >
                  <span className="text-[13px]">{isChairman ? "⚠️" : "🔒"}</span>
                  <span className="font-medium">
                    {isChairman
                      ? `Assigned to ${activeConv.agent}. Sending here will jump into their conversation.`
                      : `Assigned to ${activeConv.agent}`}
                  </span>
                </div>
              )}
              {activeConv.windowLeft === "Closed" ? (
                <div
                  className="rounded-[8px] p-4 text-[12px] text-center"
                  style={{ background: "var(--bg-input)", border: "1px solid var(--border-main)", color: "var(--text-secondary)" }}
                >
                  The 24-hour reply window is closed. It reopens the next time this customer messages — outside it WhatsApp only allows approved template messages.
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && canSendMessages && handleSendReply()}
                    placeholder={
                      isReadOnly
                        ? "View-only mode (Marketing role)"
                        : !canSendMessages
                          ? `Assigned to ${activeConv.agent}`
                          : "Type a reply..."
                    }
                    className="flex-1 rounded-[8px] px-3 py-2 text-[13px] outline-none placeholder-gray-400 transition-colors focus:border-[#0066FF] disabled:opacity-60"
                    style={{ border: "1px solid var(--border-main)", background: "var(--bg-input)", color: "var(--text-primary)" }}
                    disabled={isSending || isReadOnly || !canSendMessages}
                  />
                  <button
                    onClick={handleSendReply}
                    disabled={isSending || isReadOnly || !canSendMessages || !replyText.trim()}
                    className="bg-[#0066FF] disabled:bg-[#78B4F9] text-white font-semibold text-[13px] px-4 rounded-[8px] shrink-0 transition-colors"
                  >
                    {isSending ? "Sending..." : "Send"}
                  </button>
                </div>
              )}
            </div>
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
                  defaultValue={activeConv.name}
                  placeholder="Enter customer name..."
                  disabled={isReadOnly}
                  className="w-full text-[16px] font-bold bg-transparent outline-none border-b border-transparent focus:border-[#0066FF] transition-colors pb-0.5 truncate disabled:opacity-80"
                  style={{ color: "var(--text-primary)" }}
                  onBlur={(e) => {
                    if (isReadOnly) return;
                    const newName = e.target.value.trim();
                    if (newName && newName !== activeConv.name) {
                      patchConversation(activeConv.id, { name: newName });
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
              {(activeConv.pipeline === "Audition Booked" || activeConv.auditionOutcome || activeConv.auditionDate) ? (
                <div
                  className="p-3 rounded-lg border mb-2"
                  style={{
                    background: 'var(--bg-pill)',
                    borderColor: 'var(--border-input)',
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold flex items-center gap-1" style={{ color: 'var(--text-primary)' }}>
                      <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#0066FF' }} />
                      {activeConv.auditionOutcome === 'registered' && 'Registered'}
                      {activeConv.auditionOutcome === 'schedule-followup' && 'Schedule Follow up'}
                      {activeConv.auditionOutcome === 'paid-trial' && 'Paid Trial'}
                      {activeConv.auditionOutcome === 'joining-later' && 'Joining Later'}
                      {activeConv.auditionOutcome === 'no-show' && 'No Show'}
                      {!activeConv.auditionOutcome && 'Audition Booked'}
                    </span>
                    <Link
                      href={`/auditions?date=${activeConv.auditionDate || activeConv.followUpDate || ''}&id=${activeConv.id}`}
                      className="text-[10px] font-semibold text-[#0066FF] hover:underline flex items-center gap-0.5"
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
                <p className="text-[11px] font-medium" style={{ color: "var(--text-primary)" }}>{activeConv.name}</p>
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
              const isJoiningLater = activeConv.auditionOutcome === 'joining-later';
              const hasFollowUp = Boolean(activeConv.followUpDate || activeConv.followUpNote || isJoiningLater);

              const handleToggleJoiningLater = () => {
                if (isReadOnly) return;
                if (isJoiningLater) {
                  // Revert Joining Later outcome back to regular follow-up
                  patchConversation(activeConv.id, { auditionOutcome: '' });
                } else {
                  // Turn ON Joining Later with smart defaults (+14 days)
                  const d = new Date();
                  d.setDate(d.getDate() + 14);
                  const y = d.getFullYear();
                  const m = String(d.getMonth() + 1).padStart(2, '0');
                  const day = String(d.getDate()).padStart(2, '0');
                  const defaultDate = `${y}-${m}-${day}`;

                  const updates: Record<string, any> = {
                    auditionOutcome: 'joining-later',
                    followUpCompleted: false,
                  };
                  if (!activeConv.followUpDate) {
                    updates.followUpDate = defaultDate;
                  }
                  if (!activeConv.followUpNote || !activeConv.followUpNote.trim()) {
                    updates.followUpNote = 'Joining Later - Follow up';
                  }
                  if (activeConv.pipeline === 'Audition Booked') {
                    updates.pipeline = 'Contacted';
                  }
                  patchConversation(activeConv.id, updates);
                }
              };

              const handleClearFollowUp = () => {
                if (isReadOnly) return;
                patchConversation(activeConv.id, {
                  followUpDate: '',
                  followUpNote: '',
                  followUpCompleted: false,
                  followUpCompletedAt: null,
                  auditionOutcome: isJoiningLater ? '' : activeConv.auditionOutcome,
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
                      key={`fn-${activeConv.id}-${activeConv.followUpNote || ''}-${activeConv.auditionOutcome || ''}`}
                      type="text"
                      defaultValue={activeConv.followUpNote || ""}
                      placeholder={isJoiningLater ? "e.g. Joining in summer" : "e.g. Call back about Sunday"}
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
                    <label
                      className="flex items-center gap-1.5 shrink-0 cursor-pointer select-none py-1.5 px-2 rounded-[6px] border transition-colors h-[29px]"
                      style={{
                        background: isJoiningLater ? 'var(--bg-pill)' : 'var(--bg-input)',
                        borderColor: 'var(--border-input)',
                      }}
                      title="Mark as joining later"
                    >
                      <input
                        type="checkbox"
                        checked={isJoiningLater}
                        disabled={isReadOnly}
                        onChange={handleToggleJoiningLater}
                        className="w-3.5 h-3.5 rounded cursor-pointer accent-[#0066FF]"
                      />
                      <span
                        className="text-[11px] font-medium whitespace-nowrap"
                        style={{
                          color: isJoiningLater ? 'var(--text-primary)' : 'var(--text-secondary)',
                        }}
                      >
                        Joining later
                      </span>
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <input
                      key={`fd-${activeConv.id}-${activeConv.followUpDate || ''}-${activeConv.auditionOutcome || ''}`}
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
    </div>
  );
}
