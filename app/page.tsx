"use client";

import React, { useState } from "react";
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

const INBOX_CONVERSATIONS: Conversation[] = [
  {
    id: "1",
    name: "Noura",
    phone: "+966 50 0000 101",
    agent: "Sara",
    channel: "WA",
    status: "Open",
    unreadCount: 2,
    windowLeft: "23h 17m left",
    pipeline: "Contacted",
    source: {
      campaign: "Jeddah – Piano & Violin Leads (Aug)",
      adset: "Jeddah parents 28–45",
      ad: "Video – child at the piano",
    },
    formAnswers: {
      instrument: "Piano",
      studentAge: "9",
    },
    messages: [
      { id: "m1", text: "السلام عليكم، شفت إعلانكم عن دروس البيانو. بنتي عمرها 9 سنوات، هل عندكم أوقات بعد المدرسة؟", time: "PM 03:24", isIncoming: true, dir: "rtl" },
      { id: "m2", text: "وعليكم السلام نورة! أهلاً فيك 🌟 نعم عندنا أوقات من ٤ العصر. أول خطوة نحجز لها جلسة تقييم مجانية مع المدرّسة — تناسبكم يوم الأحد؟", time: "PM 03:36", isIncoming: false, isRead: true, dir: "rtl" },
      { id: "m3", text: "الأحد ممتاز. أي ساعة متاحة؟", time: "PM 05:05", isIncoming: true, dir: "rtl" },
      { id: "m4", text: "وهل البيانو متوفر عندكم ولا لازم نجيب معنا شي؟", time: "PM 05:12", isIncoming: true, dir: "rtl" },
    ],
  },
  {
    id: "2",
    name: "Faisal",
    phone: "+966 50 0000 102",
    agent: "Unassigned",
    channel: "WA",
    status: "Open",
    unreadCount: 1,
    windowLeft: "21h 57m left",
    pipeline: "New",
    source: {
      campaign: "IG Click-to-WhatsApp – Auditions",
      adset: "IG engagers",
      ad: "CTWA – chat with us",
    },
    messages: [
      { id: "m1", text: "Hi, I clicked your Instagram ad. Do you teach oud for complete beginners? I'm 32, never played anything.", time: "03:54 PM", isIncoming: true, dir: "ltr" },
    ],
  },
  {
    id: "3",
    name: "Reem",
    phone: "+966 50 0000 103",
    agent: "Rokaia",
    channel: "WA",
    status: "Pending",
    windowLeft: "Closed",
    pipeline: "Contacted",
    source: {
      campaign: "KSA – Adult Music Classes",
      adset: "Adults 20–40 broad",
      ad: "Carousel – it's never too late",
    },
    messages: [
      { id: "m1", text: "مرحبا، كم رسوم دروس الجيتار للكبار؟", time: "AM 10:24", isIncoming: true, dir: "rtl" },
      { id: "m2", text: "أهلاً ريم! حالياً ما نقدم جيتار، بس سجلناك بقائمة الانتظار وأول ما نفتح الصف بنتواصل معك 🙏", time: "AM 10:54", isIncoming: false, isRead: true, dir: "rtl" },
    ],
  },
  {
    id: "4",
    name: "Lina",
    phone: "+966 50 0000 104",
    agent: "Unassigned",
    channel: "IG",
    unreadCount: 1,
    status: "Open",
    windowLeft: "",
    pipeline: "direct",
    source: "direct",
    messages: [
      { id: "m1", text: "Saw your reel! 😍 Do you have violin classes for teenagers?", time: "02:24 PM", isIncoming: true, dir: "ltr" },
    ],
  },
  {
    id: "5",
    name: "Omar",
    phone: "+966 50 0000 105",
    agent: "Sara",
    channel: "FB",
    status: "Resolved",
    windowLeft: "",
    pipeline: "direct",
    source: "direct",
    messages: [
      { id: "m1", text: "هل عندكم فرع في الرياض؟", time: "PM 02:24", isIncoming: true, dir: "rtl" },
      { id: "m2", text: "حالياً جدة وأونلاين فقط — تقدر تجرب حصة أونلاين تجريبية إذا حابب!", time: "PM 03:24", isIncoming: false, isRead: true, dir: "rtl" },
    ],
  },
];

type MobileView = "list" | "chat" | "details";

export default function InboxPage() {
  const [activeFilter, setActiveFilter] = useState("All");
  const [activeConvId, setActiveConvId] = useState<string | null>("1");
  const [mobileView, setMobileView] = useState<MobileView>("list");
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);
  const filters = ["All", "Mine", "Unassigned", "Open", "Resolved"];

  const activeConv = INBOX_CONVERSATIONS.find((c) => c.id === activeConvId);

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
          {INBOX_CONVERSATIONS.map((conv) => {
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
                    onChange={() => {}}
                    className="rounded-[6px] text-[12px] py-1 px-2 outline-none"
                    style={{ border: "1px solid var(--border-input)", color: "var(--text-primary)", background: "var(--bg-input)" }}
                  >
                    <option value="Sara">Sara</option>
                    <option value="Rokaia">Rokaia</option>
                    <option value="Unassigned">Unassigned</option>
                  </select>
                  <select
                    value={activeConv.status}
                    onChange={() => {}}
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
                    placeholder="Type a reply..."
                    className="flex-1 rounded-[8px] px-3 py-2 text-[13px] outline-none placeholder-gray-400 transition-colors focus:border-[#0066FF]"
                    style={{ border: "1px solid var(--border-main)", background: "var(--bg-input)", color: "var(--text-primary)" }}
                  />
                  <button className="bg-[#78B4F9] text-white font-semibold text-[13px] px-4 rounded-[8px] shrink-0">
                    Send
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
              <div>
                <h2 className="text-[16px] font-bold" style={{ color: "var(--text-primary)" }}>
                  {activeConv.name}
                </h2>
                <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  {activeConv.phone}
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
                  onChange={() => {}}
                  className="w-full rounded-[6px] text-[12px] py-1.5 px-2 outline-none"
                  style={{ border: "1px solid var(--border-input)", background: "var(--bg-input)", color: "var(--text-primary)" }}
                >
                  <option value="New">New</option>
                  <option value="Contacted">Contacted</option>
                  <option value="Audition booked">Audition booked</option>
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
                placeholder="e.g. Call back about Sunday"
                className="w-full rounded-[6px] text-[11px] py-1.5 px-2 mb-2 outline-none placeholder-gray-400"
                style={{ border: "1px solid var(--border-input)", background: "var(--bg-input)", color: "var(--text-primary)" }}
              />
              <div className="flex gap-2">
                <div
                  className="flex-1 rounded-[6px] px-2 py-1.5 flex items-center justify-between"
                  style={{ border: "1px solid var(--border-input)", background: "var(--bg-input)" }}
                >
                  <span className="text-[11px]" style={{ color: "var(--text-primary)" }}>09 / 21 / 2026</span>
                  <svg className="w-3 h-3" style={{ color: "var(--text-secondary)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
                <button className="bg-[#0066FF] text-white font-semibold text-[11px] px-3 rounded-[6px]">Add</button>
              </div>
            </div>

            <div>
              <h3 className="text-[9px] font-bold tracking-widest text-[#0066FF] uppercase mb-2">Notes</h3>
              <textarea
                rows={3}
                placeholder="Instrument, age, follow-up promises..."
                className="w-full rounded-[6px] text-[11px] p-2 outline-none placeholder-gray-400 resize-y"
                style={{ border: "1px solid var(--border-input)", background: "var(--bg-input)", color: "var(--text-primary)" }}
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
