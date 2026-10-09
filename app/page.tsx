"use client";

import React, { useState, useEffect } from "react";
import { ArrowLeft, Info, X } from "lucide-react";

type Channel = "WA" | "IG" | "FB";

type Message = {
  id: string;
  text: string;
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
  };
  messages: Message[];
};

// Removed dummy data

type MobileView = "list" | "chat" | "details";

export default function InboxPage() {
  const [activeFilter, setActiveFilter] = useState("All");
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<MobileView>("list");
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [isSending, setIsSending] = useState(false);
  
  const filters = ["All", "Mine", "Unassigned", "Open", "Resolved"];

  const [conversations, setConversations] = useState<Conversation[]>([]);
  
  useEffect(() => {
    // Poll the live webhook server every 3 seconds
    const fetchMessages = async () => {
      try {
        const res = await fetch("https://api.tchaikovskyschool.com/crm-api/messages");
        const json = await res.json();
        
        if (json.success && json.data) {
          const liveConvs: Conversation[] = json.data.map((c: any) => ({
            id: c.senderId,
            name: c.name || `${c.channel} User ...${c.senderId.slice(-6)}`,
            phone: c.phone || `Live ${c.channel}`,
            agent: c.agent || "Unassigned",
            channel: c.channel,
            status: c.status || "Open",
            unreadCount: c.unreadCount,
            windowLeft: "Active",
            pipeline: c.pipeline || "New",
            source: c.source || "direct",
            formAnswers: c.formAnswers,
            messages: c.messages.map((m: any) => ({
              id: m.messageId,
              text: m.text,
              time: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              isIncoming: m.direction === 'incoming',
            }))
          }));
          
          // Set live conversations
          setConversations(liveConvs);
        }
      } catch (err) {
        console.error("Failed to fetch live messages:", err);
      }
    };

    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, []);

  const activeConv = conversations.find((c) => c.id === activeConvId);

  // ── Generic PATCH helper ───────────────────────────────────────────
  const patchConversation = async (senderId: string, updates: Record<string, any>) => {
    // Optimistically update local state immediately
    setConversations(prev =>
      prev.map(c => c.id === senderId ? { ...c, ...updates } : c)
    );
    try {
      await fetch(`https://api.tchaikovskyschool.com/crm-api/messages/${senderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
    } catch (err) {
      console.error("Failed to patch conversation:", err);
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !activeConv) return;
    setIsSending(true);
    try {
      const res = await fetch(`https://api.tchaikovskyschool.com/crm-api/messages/${activeConv.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: replyText, channel: activeConv.channel }),
      });
      if (res.ok) {
        setReplyText("");
      }
    } catch (err) {
      console.error("Failed to send reply:", err);
    } finally {
      setIsSending(false);
    }
  };

  const handleSelectConv = (id: string) => {
    setActiveConvId(id);
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
          flex flex-col h-full 
          w-full md:w-[300px] lg:w-[320px] shrink-0
          ${mobileView === "list" ? "flex" : "hidden md:flex"}
        `}
        style={{ background: "var(--bg-card)", borderRight: "1px solid var(--border-main)" }}
      >
        <div className="p-4" style={{ borderBottom: "1px solid var(--border-main)" }}>
          <h1 className="text-[18px] font-bold mb-3" style={{ color: "var(--text-primary)" }}>
            Inbox
          </h1>
          <div className="flex flex-wrap gap-2">
            {filters.map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors ${
                  activeFilter === filter ? "bg-[#0066FF] text-white" : ""
                }`}
                style={activeFilter !== filter ? { background: "var(--bg-pill)", color: "var(--text-secondary)" } : undefined}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.map((conv) => {
            const isActive = conv.id === activeConvId;
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
                <div>
                  <h3 className="text-[13px] font-semibold leading-tight mb-0.5" style={{ color: "var(--text-primary)" }}>
                    {conv.name}
                  </h3>
                  <p className="text-[11px]" style={{ color: isActive ? "#0066FF" : "var(--text-secondary)" }}>
                    {conv.agent}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span
                    className="text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded"
                    style={{
                      background: isActive ? "var(--bg-card)" : "var(--bg-pill)",
                      color: isActive ? "#0066FF" : "var(--text-secondary)",
                    }}
                  >
                    {conv.channel}
                  </span>
                  {conv.unreadCount && (
                    <span className="flex items-center justify-center w-[16px] h-[16px] bg-[#0066FF] text-white text-[9px] font-bold rounded-full">
                      {conv.unreadCount}
                    </span>
                  )}
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
                    value={activeConv.agent}
                    onChange={(e) => patchConversation(activeConv.id, { agent: e.target.value })}
                    className="rounded-[6px] text-[12px] py-1 px-2 outline-none"
                    style={{ border: "1px solid var(--border-input)", color: "var(--text-primary)", background: "var(--bg-input)" }}
                  >
                    <option value="Unassigned">Unassigned</option>
                    <option value="Sara">Sara</option>
                    <option value="Rokaia">Rokaia</option>
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
              {activeConv.messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.isIncoming ? "justify-start" : "justify-end"}`}>
                  <div
                    className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-3 ${
                      msg.isIncoming ? "rounded-tl-sm" : "rounded-tr-sm"
                    }`}
                    style={{
                      background: msg.isIncoming ? "var(--bg-chat-incoming)" : "var(--bg-chat-outgoing)",
                      border: msg.isIncoming ? "1px solid var(--border-main)" : "none",
                      boxShadow: "var(--shadow-card)",
                    }}
                  >
                    <p
                      className={`text-[14px] md:text-[15px] leading-relaxed ${msg.dir === "rtl" ? "text-right" : "text-left"}`}
                      style={{ color: msg.isIncoming ? "var(--text-chat-incoming)" : "var(--text-chat-outgoing)" }}
                      dir={msg.dir}
                    >
                      {msg.text}
                    </p>
                    <div
                      className={`text-[10px] mt-1.5 ${msg.dir === "rtl" ? "text-right" : "text-left"}`}
                      style={{ color: msg.isIncoming ? "var(--text-muted)" : "var(--text-chat-outgoing)", opacity: msg.isIncoming ? 1 : 0.6 }}
                    >
                      {!msg.isIncoming && msg.isRead && "✓✓ "}
                      {msg.time}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Chat Input */}
            <div className="px-4 md:px-6 py-4 shrink-0" style={{ background: "var(--bg-card)", borderTop: "1px solid var(--border-main)" }}>
              {activeConv.agent !== "Unassigned" && (
                <p className="text-[10px] text-[#FF9500] font-medium mb-2">
                  Assigned to {activeConv.agent}. Sending here will jump into their conversation.
                </p>
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
                    onKeyDown={(e) => e.key === "Enter" && handleSendReply()}
                    placeholder="Type a reply..."
                    className="flex-1 rounded-[8px] px-3 py-2 text-[13px] outline-none placeholder-gray-400 transition-colors focus:border-[#0066FF]"
                    style={{ border: "1px solid var(--border-main)", background: "var(--bg-input)", color: "var(--text-primary)" }}
                    disabled={isSending}
                  />
                  <button 
                    onClick={handleSendReply}
                    disabled={isSending || !replyText.trim()}
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
                  className="w-full text-[16px] font-bold bg-transparent outline-none border-b border-transparent focus:border-[#0066FF] transition-colors pb-0.5 truncate"
                  style={{ color: "var(--text-primary)" }}
                  onBlur={(e) => {
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
              {activeConv.source === "direct" ? (
                <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>Direct / unknown</p>
              ) : (
                <div className="rounded-[6px] p-2.5" style={{ background: "var(--bg-input)" }}>
                  <p className="text-[11px] font-bold mb-0.5" style={{ color: "var(--text-primary)" }}>
                    {activeConv.source.campaign}
                  </p>
                  <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
                    {activeConv.source.adset}
                  </p>
                  <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
                    {activeConv.source.ad}
                  </p>
                </div>
              )}
            </div>

            <div className="mb-5">
              <h3 className="text-[9px] font-bold tracking-widest text-[#0066FF] uppercase mb-2">Pipeline</h3>
              {activeConv.pipeline === "direct" ? (
                <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  No lead record — this contact messaged directly.
                </p>
              ) : (
              <select
                  value={activeConv.pipeline}
                  onChange={(e) => patchConversation(activeConv.id, { pipeline: e.target.value })}
                  className="w-full rounded-[6px] text-[12px] py-1.5 px-2 outline-none"
                  style={{ border: "1px solid var(--border-input)", background: "var(--bg-input)", color: "var(--text-primary)" }}
                >
                  <option value="New">New</option>
                  <option value="Contacted">Contacted</option>
                  <option value="Audition Booked">Audition Booked</option>
                  <option value="Enrolled">Enrolled</option>
                  <option value="Lost">Lost</option>
                </select>
              )}
            </div>

            <div className="mb-5">
              <h3 className="text-[9px] font-bold tracking-widest text-[#0066FF] uppercase mb-2">Audition</h3>
              <p className="text-[11px] mb-2" style={{ color: "var(--text-secondary)" }}>No booking yet.</p>
              <button className="w-full bg-[#0066FF] text-white font-semibold text-[12px] py-2 rounded-[6px] hover:bg-[#0055d4] transition-colors">
                Book audition
              </button>
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

            <div className="mb-5">
              <h3 className="text-[9px] font-bold tracking-widest text-[#0066FF] uppercase mb-2">Follow-up</h3>
              <input
                type="text"
                defaultValue={activeConv.formAnswers?.followUpNote || ""}
                placeholder="e.g. Call back about Sunday"
                className="w-full rounded-[6px] text-[11px] py-1.5 px-2 mb-2 outline-none placeholder-gray-400"
                style={{ border: "1px solid var(--border-input)", background: "var(--bg-input)", color: "var(--text-primary)" }}
                onBlur={(e) => patchConversation(activeConv.id, { followUpNote: e.target.value })}
              />
              <div className="flex gap-2">
                <input
                  type="date"
                  className="flex-1 rounded-[6px] px-2 py-1.5 text-[11px] outline-none"
                  style={{ border: "1px solid var(--border-input)", background: "var(--bg-input)", color: "var(--text-primary)" }}
                  onChange={(e) => patchConversation(activeConv.id, { followUpDate: e.target.value })}
                />
              </div>
            </div>

            <div>
              <h3 className="text-[9px] font-bold tracking-widest text-[#0066FF] uppercase mb-2">Notes</h3>
              <textarea
                rows={3}
                key={activeConv.id}
                defaultValue={activeConv.formAnswers?.notes || ""}
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
    </div>
  );
}
