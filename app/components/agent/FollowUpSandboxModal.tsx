"use client";

import React, { useEffect, useState } from "react";
import { AlertCircle, ArrowUp, Bot, Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import { useAuth } from "../AuthProvider";
import { type ClaudeBranchConfig, splitDisplayReplyChunks } from "../../utils/claudeAgent";

interface SandboxTurnItem {
  id: string;
  role: "lead" | "adham";
  text: string;
  silentNoReply?: boolean;
}

interface FollowUpSandboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  hasAgentId: boolean;
  agentName: string;
  branches: ReadonlyArray<ClaudeBranchConfig>;
}

const PRESET_SCENARIOS: ReadonlyArray<{
  label: string;
  mode: "proactive" | "reply";
  attempt: number;
  prompt: string;
}> = [
  {
    label: "1st follow-up · Quiet after asking",
    mode: "proactive",
    attempt: 1,
    prompt: "Write the 1st polite follow-up for this Contacted lead who went quiet.",
  },
  {
    label: "2nd follow-up · Offer session times",
    mode: "proactive",
    attempt: 2,
    prompt: "Write the 2nd follow-up offering available Discovery Session times if branch is known.",
  },
  {
    label: "3rd follow-up · Gentle final check-in",
    mode: "proactive",
    attempt: 3,
    prompt: "Write a soft, zero-pressure final check-in.",
  },
  {
    label: "Lead replies · Ask for next week",
    mode: "reply",
    attempt: 1,
    prompt: "والله مشغول هالأسبوع، ممكن تذكرني الأسبوع الجاي؟",
  },
];

/**
 * Clean, distraction-free reply preview modal for testing Follow-up Adham
 * without touching any real lead or conversation.
 */
export function FollowUpSandboxModal({
  isOpen,
  onClose,
  hasAgentId,
  agentName,
  branches,
}: FollowUpSandboxModalProps) {
  const { authFetch } = useAuth();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SandboxTurnItem[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [leadName, setLeadName] = useState("Sara");
  const [channel, setChannel] = useState<"WA" | "FB" | "IG">("WA");
  const [branch, setBranch] = useState("");
  const [attemptNumber, setAttemptNumber] = useState(1);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sendTurn = async (
    overrideText?: string,
    overrideMode?: "proactive" | "reply",
    overrideAttempt?: number
  ) => {
    const clean = (overrideText ?? input).trim();
    if (!clean || sending) return;
    if (!overrideText) setInput("");
    setError(null);
    setSending(true);

    const activeMode = overrideMode ?? (messages.length > 0 ? "reply" : "proactive");
    const activeAttempt = overrideAttempt ?? attemptNumber;

    setMessages((prev) => [
      ...prev,
      { id: `u_${Date.now()}_${prev.length}`, role: "lead", text: clean },
    ]);

    try {
      const res = await authFetch("/crm-api/followup-agent/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: clean,
          sandboxSessionId: sessionId,
          mockLead: {
            name: leadName.trim() || "Sara",
            channel,
            branch,
            attemptNumber: activeAttempt,
            mode: activeMode,
          },
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success || !json.data) {
        setError(json?.error || "Could not preview reply.");
        return;
      }
      setSessionId(json.data.sessionId);
      setMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}_${prev.length}`,
          role: "adham",
          text: json.data.silentNoReply
            ? "(Adham chose not to send a message here)"
            : json.data.reply || "(Empty response)",
          silentNoReply: Boolean(json.data.silentNoReply),
        },
      ]);
    } catch {
      setError("Network error while previewing reply.");
    } finally {
      setSending(false);
    }
  };

  const resetPreview = () => {
    setSessionId(null);
    setMessages([]);
    setError(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-end bg-black/40 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Preview a reply"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:w-[540px] md:w-[600px] h-full flex flex-col shadow-2xl"
        style={{
          background: "var(--bg-panel)",
          borderInlineStart: "1px solid var(--border-main)",
        }}
      >
        {/* Header */}
        <div
          className="px-4 py-3 flex items-center justify-between gap-3 shrink-0"
          style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border-main)" }}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 shrink-0" style={{ color: "var(--bg-banner)" }} />
              <h2 className="text-[14px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                Preview a reply
              </h2>
            </div>
            <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--text-secondary)" }}>
              See how {agentName || "Adham"} writes to a Contacted lead before sending to anyone.
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={resetPreview}
              className="inline-flex items-center gap-1 min-h-[38px] px-2.5 rounded-lg text-[11.5px] font-medium cursor-pointer hover:bg-[var(--bg-hover)]"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-input)",
                color: "var(--text-primary)",
              }}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Start over</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg cursor-pointer hover:bg-[var(--bg-hover)]"
              style={{ color: "var(--text-secondary)" }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Simple Sample Lead Strip */}
        <div
          className="px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0"
          style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border-main)" }}
        >
          <div>
            <label className="block text-[10px] font-medium mb-0.5" style={{ color: "var(--text-muted)" }}>
              Lead name
            </label>
            <input
              type="text"
              value={leadName}
              onChange={(e) => setLeadName(e.target.value)}
              className="w-full min-h-[36px] px-2.5 text-[12px] rounded-md outline-none"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-input)",
                color: "var(--text-primary)",
              }}
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium mb-0.5" style={{ color: "var(--text-muted)" }}>
              Channel
            </label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as "WA" | "FB" | "IG")}
              className="w-full min-h-[36px] px-2.5 text-[12px] rounded-md outline-none"
              style={{
                background: "var(--bg-input)",
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
            <label className="block text-[10px] font-medium mb-0.5" style={{ color: "var(--text-muted)" }}>
              Branch
            </label>
            <select
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="w-full min-h-[36px] px-2.5 text-[12px] rounded-md outline-none"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-input)",
                color: "var(--text-primary)",
              }}
            >
              <option value="">Any branch</option>
              {branches.map((b) => (
                <option key={b.branchName} value={b.branchName}>
                  {b.displayName || b.branchName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-medium mb-0.5" style={{ color: "var(--text-muted)" }}>
              Follow-up #
            </label>
            <select
              value={attemptNumber}
              onChange={(e) => setAttemptNumber(Number(e.target.value))}
              className="w-full min-h-[36px] px-2.5 text-[12px] rounded-md outline-none"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-input)",
                color: "var(--text-primary)",
              }}
            >
              <option value={1}>1st follow-up</option>
              <option value={2}>2nd follow-up</option>
              <option value={3}>3rd follow-up</option>
            </select>
          </div>
        </div>

        {/* Conversation Preview */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          {!hasAgentId ? (
            <div
              className="rounded-lg p-4 text-[12.5px]"
              style={{
                background: "var(--label-amber-bg)",
                border: "1px solid var(--label-amber-border)",
                color: "var(--label-amber-text)",
              }}
            >
              Activate Follow-up Adham first before previewing replies.
            </div>
          ) : messages.length === 0 ? (
            <div className="space-y-3">
              <p className="text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
                Pick a scenario below to preview how Adham writes:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PRESET_SCENARIOS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    disabled={sending}
                    onClick={() => {
                      setAttemptNumber(preset.attempt);
                      void sendTurn(preset.prompt, preset.mode, preset.attempt);
                    }}
                    className="text-left rounded-lg p-3 cursor-pointer hover:bg-[var(--bg-hover)] disabled:opacity-50"
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-main)",
                    }}
                  >
                    <p className="text-[12.5px] font-semibold" style={{ color: "var(--text-primary)" }}>
                      {preset.label}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              if (msg.role === "lead") {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div
                      dir="auto"
                      className="max-w-[85%] rounded-xl px-3.5 py-2.5 text-[12.5px] whitespace-pre-wrap"
                      style={{ background: "var(--bg-chat-outgoing)", color: "var(--text-chat-outgoing)" }}
                    >
                      {msg.text}
                    </div>
                  </div>
                );
              }
              const chunks = splitDisplayReplyChunks(msg.text);
              return (
                <div key={msg.id} className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    <Bot className="w-3.5 h-3.5" style={{ color: "var(--bg-banner)" }} />
                    <span>Adham</span>
                  </div>
                  {(chunks.length > 0 ? chunks : [msg.text]).map((chunk, idx) => (
                    <div
                      key={`${msg.id}-${idx}`}
                      dir="auto"
                      className="max-w-[90%] rounded-xl px-3.5 py-2.5 text-[13px] whitespace-pre-wrap"
                      style={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border-main)",
                        color: msg.silentNoReply ? "var(--text-secondary)" : "var(--text-primary)",
                      }}
                    >
                      {chunk}
                    </div>
                  ))}
                </div>
              );
            })
          )}

          {sending && (
            <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-secondary)" }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Writing reply...</span>
            </div>
          )}

          {error && (
            <div
              className="rounded-lg p-3 flex items-start gap-2 text-[12px]"
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
        </div>

        {/* Reply Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendTurn();
          }}
          className="p-3 flex items-center gap-2 shrink-0"
          style={{ background: "var(--bg-card)", borderTop: "1px solid var(--border-main)" }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!hasAgentId || sending}
            placeholder={
              messages.length > 0
                ? "Type a sample reply from the lead..."
                : "Or type any follow-up scenario to test..."
            }
            className="flex-1 min-h-[44px] sm:min-h-[40px] px-3 text-[16px] sm:text-[13px] rounded-lg outline-none"
            style={{
              background: "var(--bg-input)",
              border: "1px solid var(--border-input)",
              color: "var(--text-primary)",
            }}
          />
          <button
            type="submit"
            disabled={!hasAgentId || sending || !input.trim()}
            aria-label="Send preview message"
            className="min-w-[44px] min-h-[44px] sm:min-w-[40px] sm:min-h-[40px] inline-flex items-center justify-center rounded-lg text-white cursor-pointer disabled:opacity-45"
            style={{ background: "var(--bg-banner)" }}
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
