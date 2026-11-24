"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Loader2,
  MapPin,
  MessageCircle,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  UserCheck,
  X,
} from "lucide-react";
import {
  type ClaudeBranchConfig,
  type ClaudeToolTrace,
  splitDisplayReplyChunks,
} from "../utils/claudeAgent";
import { ClaudeStatusPill } from "./ClaudeUiPrimitives";

export interface SandboxMessage {
  id: string;
  role: "lead" | "adham";
  text: string;
  silentNoReply?: boolean;
  toolTraces?: ClaudeToolTrace[];
}

interface ClaudeSandboxPanelProps {
  hasAgentId: boolean;
  agentName: string;
  agentModelLabel?: string;
  branches: ReadonlyArray<ClaudeBranchConfig>;
  messages: ReadonlyArray<SandboxMessage>;
  input: string;
  onInputChange: (next: string) => void;
  sending: boolean;
  error: string | null;
  mockLeadName: string;
  onMockLeadNameChange: (next: string) => void;
  mockChannel: "WA" | "FB" | "IG";
  onMockChannelChange: (next: "WA" | "FB" | "IG") => void;
  mockBranch: string;
  onMockBranchChange: (next: string) => void;
  mockCampaign: string;
  onMockCampaignChange: (next: string) => void;
  mockExistingStudent: boolean;
  onMockExistingStudentChange: (next: boolean) => void;
  onSend: (presetText?: string) => void;
  onReset: () => void;
  onEditStudio?: () => void;
  variant?: "card" | "drawer";
  onClose?: () => void;
}

const STARTER_PROMPTS: ReadonlyArray<{
  title: string;
  subtitle: string;
  text: string;
}> = [
  {
    title: "Arabic Price-First Lead",
    subtitle: "Tests price-first objection handling and Playbook discovery positioning",
    text: "السلام عليكم، كم سعر دروس البيانو؟",
  },
  {
    title: "Expat Parent · Jeddah",
    subtitle: "Tests English reply, child age check (6 yrs), and Jeddah branch slot lookup",
    text: "Hi, can you send me details about violin classes for my 6 year old in Jeddah?",
  },
  {
    title: "Discount Request (Escalation)",
    subtitle: "Tests discount guardrail and simulated escalate_to_human alert",
    text: "Too expensive, can you give me a 20% discount?",
  },
  {
    title: "Ready to Book Slot",
    subtitle: "Tests get_audition_availability and simulated Discovery Session booking",
    text: "We'd love to book a piano discovery session in Riyadh Park Mall this Friday afternoon.",
  },
];

const CHANNEL_LABELS: Record<"WA" | "FB" | "IG", string> = {
  WA: "WhatsApp",
  FB: "Messenger",
  IG: "Instagram",
};

/**
 * Claude/ChatGPT-inspired interactive test playground for Adham AI.
 * Executes live Managed Agent sessions with strictly mocked CRM tools (never writes DB or sends messages).
 */
export function ClaudeSandboxPanel({
  hasAgentId,
  agentName,
  agentModelLabel,
  branches,
  messages,
  input,
  onInputChange,
  sending,
  error,
  mockLeadName,
  onMockLeadNameChange,
  mockChannel,
  onMockChannelChange,
  mockBranch,
  onMockBranchChange,
  mockCampaign,
  onMockCampaignChange,
  mockExistingStudent,
  onMockExistingStudentChange,
  onSend,
  onReset,
  onEditStudio,
  variant = "card",
  onClose,
}: ClaudeSandboxPanelProps) {
  const isDrawer = variant === "drawer";
  const [personaOpen, setPersonaOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  // Auto-grow textarea like Claude / ChatGPT input bars
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [input]);

  // Smoothly keep latest reply / thinking state visible
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length, sending]);

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => {
        setCopiedId((prev) => (prev === id ? null : prev));
      }, 1500);
    } catch {
      // Clipboard unavailable in restricted context
    }
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (input.trim() && !sending && hasAgentId) {
        onSend();
      }
    }
  };

  const activeBranchOptions = branches
    .filter((b) => b.active !== false)
    .map((b) => b.branchName || b.displayName)
    .filter(Boolean);

  return (
    <section
      className={
        isDrawer
          ? "h-full flex flex-col overflow-hidden"
          : "rounded-xl overflow-hidden flex flex-col"
      }
      style={
        isDrawer
          ? { background: "var(--bg-panel)" }
          : {
              background: "var(--bg-card)",
              border: "1px solid var(--border-main)",
              boxShadow: "var(--shadow-card)",
            }
      }
    >
      {/* Top Playground Toolbar */}
      <div
        className="px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2.5"
        style={{
          background: "var(--bg-panel)",
          borderBottom: "1px solid var(--border-main)",
        }}
      >
        <div className="flex items-center gap-2.5 flex-wrap min-w-0">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: "var(--label-blue-bg)",
              border: "1px solid var(--label-blue-border)",
              color: "var(--label-blue-text)",
            }}
          >
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                Adham Sandbox Playground
              </h2>
              <ClaudeStatusPill label="Simulated CRM · No Live Sends" tone="blue" />
              {agentModelLabel && (
                <span className="text-[11px] font-medium hidden sm:inline" style={{ color: "var(--text-muted)" }}>
                  · {agentModelLabel}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setPersonaOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg text-[11px] font-medium cursor-pointer"
            style={{
              background: personaOpen ? "var(--bg-selected)" : "var(--bg-card)",
              border: `1px solid ${personaOpen ? "var(--label-blue-border)" : "var(--border-input)"}`,
              color: personaOpen ? "var(--label-blue-text)" : "var(--text-primary)",
            }}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Lead Persona</span>
            {personaOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {onEditStudio && (
            <button
              type="button"
              onClick={onEditStudio}
              className="hidden sm:inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg text-[11px] font-medium cursor-pointer"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-input)",
                color: "var(--text-secondary)",
              }}
            >
              <span>Edit Prompt</span>
            </button>
          )}

          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg text-[11px] font-semibold cursor-pointer"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-input)",
              color: "var(--text-primary)",
            }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>New chat</span>
          </button>

          {isDrawer && onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close test sandbox"
              className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] sm:min-w-[34px] sm:min-h-[34px] rounded-lg cursor-pointer hover:bg-[var(--bg-hover)]"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-input)",
                color: "var(--text-secondary)",
              }}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Simulated Lead Persona Drawer */}
      {personaOpen && (
        <div
          className="px-4 sm:px-5 py-3.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
          style={{
            background: "var(--bg-page)",
            borderBottom: "1px solid var(--border-main)",
          }}
        >
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              Simulated lead name
            </label>
            <input
              type="text"
              value={mockLeadName}
              onChange={(e) => onMockLeadNameChange(e.target.value)}
              placeholder="Noura"
              className="w-full min-h-[38px] px-2.5 text-[16px] sm:text-[12px] rounded-lg outline-none"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-input)",
                color: "var(--text-primary)",
              }}
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              Channel
            </label>
            <select
              value={mockChannel}
              onChange={(e) => onMockChannelChange(e.target.value as "WA" | "FB" | "IG")}
              className="w-full min-h-[38px] px-2.5 text-[16px] sm:text-[12px] rounded-lg outline-none"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-input)",
                color: "var(--text-primary)",
              }}
            >
              <option value="WA">WhatsApp</option>
              <option value="FB">Messenger</option>
              <option value="IG">Instagram</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              Pre-filled branch (optional)
            </label>
            <input
              type="text"
              list="sandbox-branch-suggestions"
              value={mockBranch}
              onChange={(e) => onMockBranchChange(e.target.value)}
              placeholder="Riyadh Park Mall"
              className="w-full min-h-[38px] px-2.5 text-[16px] sm:text-[12px] rounded-lg outline-none"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-input)",
                color: "var(--text-primary)",
              }}
            />
            <datalist id="sandbox-branch-suggestions">
              {activeBranchOptions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              Ad campaign (optional)
            </label>
            <input
              type="text"
              value={mockCampaign}
              onChange={(e) => onMockCampaignChange(e.target.value)}
              placeholder="Riyadh Piano Kids"
              className="w-full min-h-[38px] px-2.5 text-[16px] sm:text-[12px] rounded-lg outline-none"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-input)",
                color: "var(--text-primary)",
              }}
            />
          </div>
        </div>
      )}

      {/* Centered AI Conversation Canvas */}
      <div
        className={`flex-1 overflow-y-auto px-3 sm:px-6 py-5 ${
          isDrawer ? "min-h-0" : "min-h-[340px] max-h-[540px]"
        }`}
        style={{ background: "var(--bg-panel)" }}
      >
        {messages.length === 0 ? (
          <div className="max-w-2xl mx-auto py-4 flex flex-col items-center text-center space-y-5">
            <div className="space-y-2">
              <div
                className="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center"
                style={{
                  background: "var(--label-blue-bg)",
                  border: "1px solid var(--label-blue-border)",
                  color: "var(--bg-banner)",
                }}
              >
                <Bot className="w-6 h-6" />
              </div>
              <h3 className="text-[16px] font-bold" style={{ color: "var(--text-primary)" }}>
                Test {agentName || "Adham (AI Agent)"}
              </h3>
              <p className="text-[12px] max-w-md mx-auto" style={{ color: "var(--text-secondary)" }}>
                Chat as a prospective student or parent. Adham runs your live Playbook & tools in a safe mock session without modifying CRM leads or sending real messages.
              </p>
            </div>

            {/* 2x2 Starter Prompt Cards (Claude / ChatGPT style) */}
            <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left">
              {STARTER_PROMPTS.map((preset) => (
                <button
                  key={preset.title}
                  type="button"
                  disabled={sending || !hasAgentId}
                  onClick={() => onSend(preset.text)}
                  className="p-3.5 rounded-xl text-left transition-colors cursor-pointer disabled:opacity-45 hover:bg-[var(--bg-hover)]"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-main)",
                    boxShadow: "var(--shadow-card)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
                      {preset.title}
                    </span>
                    <ArrowUp
                      className="w-3.5 h-3.5 rotate-45 shrink-0"
                      style={{ color: "var(--text-muted)" }}
                    />
                  </div>
                  <p className="text-[11px] line-clamp-2" style={{ color: "var(--text-secondary)" }}>
                    “{preset.text}”
                  </p>
                  <p className="text-[10px] mt-1.5" style={{ color: "var(--text-muted)" }}>
                    {preset.subtitle}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-5">
            {messages.map((m) =>
              m.role === "lead" ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] sm:max-w-[75%] space-y-1 flex flex-col items-end">
                    <span className="text-[10px] font-medium px-1" style={{ color: "var(--text-muted)" }}>
                      {mockLeadName || "Test Lead"} · {CHANNEL_LABELS[mockChannel]}
                    </span>
                    <div
                      dir="auto"
                      className="rounded-2xl rounded-tr-sm px-4 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap"
                      style={{
                        background: "var(--bg-chat-outgoing)",
                        color: "var(--text-chat-outgoing)",
                        border: "1px solid var(--label-blue-border)",
                      }}
                    >
                      {m.text}
                    </div>
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex items-start gap-3">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-main)",
                      color: "var(--bg-banner)",
                    }}
                  >
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
                          {agentName || "Adham (AI)"}
                        </span>
                        {m.silentNoReply && (
                          <ClaudeStatusPill label="Silent CRM-only turn" tone="amber" />
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          void handleCopy(
                            m.id,
                            m.silentNoReply ? m.text : splitDisplayReplyChunks(m.text).join("\n\n")
                          )
                        }
                        aria-label="Copy reply"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium cursor-pointer hover:bg-[var(--bg-hover)]"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {copiedId === m.id ? (
                          <>
                            <Check className="w-3 h-3" style={{ color: "var(--label-green-text)" }} />
                            <span style={{ color: "var(--label-green-text)" }}>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Assistant Response */}
                    {m.silentNoReply ? (
                      <div
                        dir="auto"
                        className="rounded-2xl rounded-tl-sm px-4 py-3 text-[13.5px] leading-relaxed whitespace-pre-wrap"
                        style={{
                          background: "var(--label-amber-bg)",
                          color: "var(--label-amber-text)",
                          border: "1px solid var(--label-amber-border)",
                        }}
                      >
                        {m.text}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {splitDisplayReplyChunks(m.text).map((chunk, chunkIdx) => (
                          <div
                            key={`${m.id}-chunk-${chunkIdx}`}
                            dir="auto"
                            className="rounded-2xl rounded-tl-sm px-4 py-3 text-[13.5px] leading-relaxed whitespace-pre-wrap"
                            style={{
                              background: "var(--bg-chat-incoming)",
                              color: "var(--text-chat-incoming)",
                              border: "1px solid var(--border-main)",
                            }}
                          >
                            {chunk}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            )}

            {sending && (
              <div className="flex items-start gap-3">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-main)",
                    color: "var(--bg-banner)",
                  }}
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
                <div
                  className="rounded-2xl rounded-tl-sm px-4 py-2.5 text-[12px] flex items-center gap-2"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-main)",
                    color: "var(--text-secondary)",
                  }}
                >
                  <span>Adham is typing</span>
                  <span className="inline-flex gap-1" aria-hidden="true">
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--bg-banner)" }} />
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--bg-banner)" }} />
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--bg-banner)" }} />
                  </span>
                </div>
              </div>
            )}
            <div ref={threadEndRef} />
          </div>
        )}
      </div>

      {/* Floating Claude / ChatGPT Composer Box */}
      <div
        className="p-3 sm:p-4 space-y-2.5 shrink-0"
        style={{
          background: "var(--bg-panel)",
          borderTop: "1px solid var(--border-main)",
          paddingBottom: isDrawer ? "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" : undefined,
        }}
      >
        {error && (
          <div
            className="max-w-3xl mx-auto rounded-lg px-3 py-2 flex items-start gap-2 text-[12px]"
            style={{
              background: "var(--label-red-bg)",
              border: "1px solid var(--label-red-border)",
              color: "var(--label-red-text)",
            }}
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSend();
          }}
          className="max-w-3xl mx-auto rounded-2xl p-2.5 sm:p-3 transition-colors focus-within:ring-2 focus-within:ring-[var(--bg-banner)]"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-input)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <textarea
            ref={textareaRef}
            rows={1}
            dir="auto"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleTextareaKeyDown}
            disabled={sending || !hasAgentId}
            placeholder={
              hasAgentId
                ? `Message as ${mockLeadName || "Test Lead"} (Arabic or English)...`
                : "Create or connect your Claude agent first to test..."
            }
            className="w-full resize-none bg-transparent px-1.5 py-1 text-[16px] sm:text-[13.5px] leading-relaxed outline-none disabled:opacity-50"
            style={{
              color: "var(--text-primary)",
              minHeight: "36px",
              maxHeight: "168px",
            }}
          />

          {/* Integrated AI Input Tools Bar */}
          <div
            className="mt-2 pt-2 flex flex-wrap items-center justify-between gap-2"
            style={{ borderTop: "1px solid var(--border-main)" }}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Channel selector pill */}
              <div
                className="inline-flex items-center gap-1 px-2.5 min-h-[32px] rounded-full text-[11px] font-medium"
                style={{
                  background: "var(--bg-pill)",
                  border: "1px solid var(--border-input)",
                  color: "var(--text-primary)",
                }}
              >
                <MessageCircle className="w-3 h-3 shrink-0" style={{ color: "var(--bg-banner)" }} />
                <select
                  aria-label="Test channel"
                  value={mockChannel}
                  onChange={(e) => onMockChannelChange(e.target.value as "WA" | "FB" | "IG")}
                  className="bg-transparent outline-none cursor-pointer text-[11px] font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  <option value="WA">WhatsApp</option>
                  <option value="FB">Messenger</option>
                  <option value="IG">Instagram</option>
                </select>
              </div>

              {/* Branch selector pill */}
              <div
                className="inline-flex items-center gap-1 px-2.5 min-h-[32px] rounded-full text-[11px] font-medium max-w-[180px]"
                style={{
                  background: mockBranch ? "var(--label-blue-bg)" : "var(--bg-pill)",
                  border: `1px solid ${mockBranch ? "var(--label-blue-border)" : "var(--border-input)"}`,
                  color: mockBranch ? "var(--label-blue-text)" : "var(--text-secondary)",
                }}
              >
                <MapPin className="w-3 h-3 shrink-0" />
                <select
                  aria-label="Test branch context"
                  value={mockBranch}
                  onChange={(e) => onMockBranchChange(e.target.value)}
                  className="bg-transparent outline-none cursor-pointer text-[11px] font-medium truncate max-w-[140px]"
                  style={{ color: "inherit" }}
                >
                  <option value="">Branch: Auto / Ask</option>
                  {activeBranchOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                  {mockBranch && !activeBranchOptions.includes(mockBranch) && (
                    <option value={mockBranch}>{mockBranch}</option>
                  )}
                </select>
              </div>

              {/* Existing Student context pill */}
              <button
                type="button"
                onClick={() => onMockExistingStudentChange(!mockExistingStudent)}
                aria-pressed={mockExistingStudent}
                className="inline-flex items-center gap-1.5 px-2.5 min-h-[32px] rounded-full text-[11px] font-medium cursor-pointer transition-colors"
                style={{
                  background: mockExistingStudent ? "var(--label-amber-bg)" : "var(--bg-pill)",
                  border: `1px solid ${mockExistingStudent ? "var(--label-amber-border)" : "var(--border-input)"}`,
                  color: mockExistingStudent ? "var(--label-amber-text)" : "var(--text-secondary)",
                }}
              >
                <UserCheck className="w-3 h-3 shrink-0" />
                <span>{mockExistingStudent ? "Existing student: ON" : "Existing student"}</span>
              </button>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <span className="hidden md:inline text-[10px]" style={{ color: "var(--text-muted)" }}>
                Enter to send · Shift+Enter new line
              </span>
              <button
                type="submit"
                aria-label="Send test message"
                disabled={sending || !input.trim() || !hasAgentId}
                className="w-9 h-9 rounded-xl inline-flex items-center justify-center text-white cursor-pointer disabled:opacity-40 transition-opacity"
                style={{ background: "var(--bg-banner)" }}
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ArrowUp className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}

