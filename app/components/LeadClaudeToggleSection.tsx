"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Bot, RotateCcw, AlertCircle } from "lucide-react";
import { useAuth, normalizeRole } from "./AuthProvider";
import { useCRM } from "../context/CRMContext";
import { getLeadClaudeStatusMeta } from "../utils/claudeAgent";

export interface LeadClaudeToggleSectionProps {
  conversationId: string;
  claudeEnabled?: boolean;
  claudePaused?: boolean;
  claudePausedReason?: string;
  claudeLastRepliedAt?: string | null;
  claudeLastError?: string;
}

/**
 * Chairman-only per-lead Adham AI auto-reply switch and pause/resume controls.
 */
export default function LeadClaudeToggleSection({
  conversationId,
  claudeEnabled = false,
  claudePaused = false,
  claudePausedReason = "",
  claudeLastRepliedAt = null,
  claudeLastError = "",
}: LeadClaudeToggleSectionProps) {
  const { user, isReadOnly } = useAuth();
  const { updateConversationClaude } = useCRM();

  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  if (normalizeRole(user?.role) !== "chairman") {
    return null;
  }

  const meta = getLeadClaudeStatusMeta({
    claudeEnabled,
    claudePaused,
    claudePausedReason,
  });

  const handleToggleEnabled = async () => {
    if (isReadOnly || busy) return;
    setBusy(true);
    setErrorMsg(null);
    setStatusNote(null);
    const res = await updateConversationClaude(conversationId, {
      claudeEnabled: !claudeEnabled,
    });
    setBusy(false);
    if (!res.ok) {
      setErrorMsg(res.error || "Could not update Claude auto-reply.");
      return;
    }
    setStatusNote(!claudeEnabled ? "Enabled for this lead." : "Turned off for this lead.");
  };

  const handleResume = async () => {
    if (isReadOnly || busy) return;
    setBusy(true);
    setErrorMsg(null);
    setStatusNote(null);
    const res = await updateConversationClaude(conversationId, {
      claudePaused: false,
    });
    setBusy(false);
    if (!res.ok) {
      setErrorMsg(res.error || "Could not resume Claude.");
      return;
    }
    setStatusNote("Resumed for this lead.");
  };

  const handleResetSession = async () => {
    if (isReadOnly || busy) return;
    setBusy(true);
    setErrorMsg(null);
    setStatusNote(null);
    const res = await updateConversationClaude(conversationId, {
      resetSession: true,
    });
    setBusy(false);
    if (!res.ok) {
      setErrorMsg(res.error || "Could not reset Claude session.");
      return;
    }
    setStatusNote("Memory reset; next reply starts a fresh session.");
  };

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Bot className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--bg-banner)" }} />
          <h3
            className="text-[10px] font-bold tracking-widest uppercase truncate"
            style={{ color: "var(--bg-banner)" }}
          >
            Adham AI Agent
          </h3>
        </div>
        <Link
          href="/settings#claude"
          className="text-[11px] font-medium hover:underline shrink-0"
          style={{ color: "var(--text-secondary)" }}
        >
          Settings
        </Link>
      </div>

      <div
        className="rounded-lg p-3 space-y-2.5"
        style={{
          background: "var(--bg-input)",
          border: "1px solid var(--border-input)",
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                style={{
                  background: meta.bgVar,
                  border: `1px solid ${meta.borderVar}`,
                  color: meta.textVar,
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: meta.dotVar }}
                />
                {meta.label}
              </span>
              {claudeLastRepliedAt && (
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Last reply {new Date(claudeLastRepliedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
            <p className="text-[11px] mt-1 leading-snug" style={{ color: "var(--text-secondary)" }}>
              {meta.description}
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={Boolean(claudeEnabled)}
            aria-label="Toggle Adham AI Agent auto-reply for this lead"
            disabled={busy || isReadOnly}
            onClick={handleToggleEnabled}
            className={`inline-flex items-center justify-center min-w-[44px] min-h-[44px] -my-2 -me-1.5 shrink-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bg-banner)] ${
              busy || isReadOnly ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
            }`}
          >
            <span
              className="relative w-11 h-6 rounded-full transition-colors duration-150 block"
              style={{
                background: claudeEnabled ? "var(--bg-banner)" : "var(--bg-column)",
                border: `1px solid ${claudeEnabled ? "var(--bg-banner)" : "var(--border-input)"}`,
              }}
            >
              <span
                className="absolute top-[2px] left-[2px] w-[18px] h-[18px] rounded-full transition-transform duration-150"
                style={{
                  background: "var(--bg-card)",
                  boxShadow: "var(--shadow-card)",
                  transform: claudeEnabled ? "translateX(20px)" : "translateX(0)",
                }}
              />
            </span>
          </button>
        </div>

        {(claudePaused || claudeEnabled) && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {claudeEnabled && claudePaused && (
              <button
                type="button"
                disabled={busy || isReadOnly}
                onClick={handleResume}
                className="min-h-[36px] px-3 py-1 rounded-md text-[12px] font-semibold text-white cursor-pointer disabled:opacity-50"
                style={{ background: "var(--bg-banner)" }}
              >
                {busy ? "Updating..." : "Resume Adham"}
              </button>
            )}
            <button
              type="button"
              disabled={busy || isReadOnly}
              onClick={handleResetSession}
              className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer disabled:opacity-50"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-input)",
                color: "var(--text-secondary)",
              }}
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset session</span>
            </button>
          </div>
        )}

        {claudeLastError && (
          <div
            className="flex items-start gap-1.5 rounded-md p-2 text-[11px]"
            style={{
              background: "var(--label-red-bg)",
              border: "1px solid var(--label-red-border)",
              color: "var(--label-red-text)",
            }}
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span className="break-words min-w-0">{claudeLastError}</span>
          </div>
        )}

        {errorMsg && (
          <p className="text-[11px] font-medium" style={{ color: "var(--label-red-text)" }}>
            {errorMsg}
          </p>
        )}

        {statusNote && !errorMsg && (
          <p className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
            {statusNote}
          </p>
        )}
      </div>
    </div>
  );
}

