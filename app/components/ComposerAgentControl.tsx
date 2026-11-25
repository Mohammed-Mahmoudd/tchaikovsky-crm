"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, GraduationCap, Loader2, Repeat2 } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { useCRM } from "../context/CRMContext";
import {
  type ComposerAgentId,
  type ComposerAgentSettingsSummary,
  invalidateComposerAgentSettingsCache,
  isFollowUpEnrollmentActive,
  readComposerAgentSettingsCache,
  resolveComposerAgentVisualState,
  stripSplitMarkerForComposer,
  writeComposerAgentSettingsCache,
} from "../utils/composerAgent";
import { resolveClaudeSendMode } from "../utils/claudeAgent";
import type { LeadAgentScope, SingleLeadFollowUpState } from "../utils/followupAgent";

export interface ComposerAgentNotice {
  tone: "info" | "warning" | "error";
  message: string;
}

export interface ComposerAgentControlProps {
  chatId: string;
  agentScope?: LeadAgentScope;
  claudeEnabled?: boolean;
  claudePaused?: boolean;
  pipeline?: string;
  disabled?: boolean;
  isExpanded: boolean;
  onToggleExpanded: (next?: boolean) => void;
  onInsertDraft: (agent: ComposerAgentId, text: string) => void;
  onStatusNotice: (notice: ComposerAgentNotice | null) => void;
  onGeneratingChange: (agent: ComposerAgentId | null) => void;
  rewriteRequest?: { id: number; agent: ComposerAgentId } | null;
}

const DEFAULT_SUMMARY: ComposerAgentSettingsSummary = {
  admissionSendMode: "draft",
  admissionGlobalEnabled: false,
  admissionActivated: false,
  followUpSendMode: "approval",
  followUpGlobalEnabled: false,
  followUpActivated: false,
  loadedAt: 0,
};

/**
 * Far-left expandable composer AI agent launcher supporting Admission Adham and Follow-up Adham.
 * Supports Draft one-shot generation (clears active state immediately) and Auto continuous mode
 * (remains active even after messages are sent).
 */
export function ComposerAgentControl({
  chatId,
  agentScope = "both",
  claudeEnabled = false,
  claudePaused = false,
  disabled = false,
  isExpanded,
  onToggleExpanded,
  onInsertDraft,
  onStatusNotice,
  onGeneratingChange,
  rewriteRequest = null,
}: ComposerAgentControlProps) {
  const { authFetch } = useAuth();
  const { updateConversationClaude } = useCRM();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastRewriteIdRef = useRef<number>(0);

  const [summary, setSummary] = useState<ComposerAgentSettingsSummary>(
    () => readComposerAgentSettingsCache() ?? DEFAULT_SUMMARY
  );
  const [followUpLead, setFollowUpLead] = useState<SingleLeadFollowUpState | null>(null);
  const [generatingAgent, setGeneratingAgent] = useState<ComposerAgentId | null>(null);
  const [togglingAgent, setTogglingAgent] = useState<ComposerAgentId | null>(null);

  const showFollowUp = agentScope !== "admissions";
  const showAdmissions = agentScope !== "followup";

  const loadSettingsSummary = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!force) {
        const cached = readComposerAgentSettingsCache();
        if (cached) {
          setSummary(cached);
          return cached;
        }
      }

      try {
        const [claudeRes, fuRes] = await Promise.all([
          authFetch("/crm-api/claude/status?includePlatform=0", { cache: "no-store" }),
          authFetch("/crm-api/followup-agent/status?includePlatform=0", { cache: "no-store" }),
        ]);
        const [claudeJson, fuJson] = await Promise.all([
          claudeRes.json().catch(() => null),
          fuRes.json().catch(() => null),
        ]);

        const nextSummary = writeComposerAgentSettingsCache({
          admissionSendMode: resolveClaudeSendMode(claudeJson?.data?.settings),
          admissionGlobalEnabled: Boolean(claudeJson?.data?.settings?.enabled),
          admissionActivated: Boolean(
            claudeJson?.data?.connection?.hasApiKey && claudeJson?.data?.connection?.hasAgentId
          ),
          followUpSendMode:
            fuJson?.data?.settings?.sendMode === "auto" ? "auto" : "approval",
          followUpGlobalEnabled: Boolean(fuJson?.data?.settings?.enabled),
          followUpActivated: Boolean(
            fuJson?.data?.connection?.hasApiKey && fuJson?.data?.connection?.hasAgentId
          ),
        });
        setSummary(nextSummary);
        return nextSummary;
      } catch {
        return null;
      }
    },
    [authFetch]
  );

  const loadLeadFollowUpState = useCallback(async () => {
    if (!showFollowUp || !chatId) return;
    try {
      const res = await authFetch(
        `/crm-api/followup-agent/leads/${encodeURIComponent(chatId)}`,
        { cache: "no-store" }
      );
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success && json.data) {
        setFollowUpLead(json.data as SingleLeadFollowUpState);
      }
    } catch {
      // Preserve last known state on transient failure
    }
  }, [authFetch, chatId, showFollowUp]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      void loadSettingsSummary();
      if (showFollowUp) {
        void loadLeadFollowUpState();
      } else {
        setFollowUpLead(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [chatId, loadLeadFollowUpState, loadSettingsSummary, showFollowUp]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleSettingsChanged = () => {
      invalidateComposerAgentSettingsCache();
      void loadSettingsSummary({ force: true });
    };
    const handleFollowUpChanged = () => {
      void loadLeadFollowUpState();
    };
    window.addEventListener("crm:claude-settings-updated", handleSettingsChanged);
    window.addEventListener("crm:followup-settings-updated", handleSettingsChanged);
    window.addEventListener("crm:followup-updated", handleFollowUpChanged);
    return () => {
      window.removeEventListener("crm:claude-settings-updated", handleSettingsChanged);
      window.removeEventListener("crm:followup-settings-updated", handleSettingsChanged);
      window.removeEventListener("crm:followup-updated", handleFollowUpChanged);
    };
  }, [loadLeadFollowUpState, loadSettingsSummary]);

  // Close expanded tray when clicking outside or pressing Escape
  useEffect(() => {
    if (!isExpanded) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onToggleExpanded(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onToggleExpanded(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [isExpanded, onToggleExpanded]);

  const setGenerating = useCallback(
    (agent: ComposerAgentId | null) => {
      setGeneratingAgent(agent);
      onGeneratingChange(agent);
    },
    [onGeneratingChange]
  );

  const runAdmissionsDraft = useCallback(async () => {
    if (disabled || generatingAgent || togglingAgent) return;
    setGenerating("admissions");
    onStatusNotice(null);
    try {
      const res = await authFetch(
        `/crm-api/claude/conversations/${encodeURIComponent(chatId)}/draft`,
        { method: "POST" }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        onStatusNotice({
          tone: "error",
          message: json?.error || "Could not write an Admission draft.",
        });
        return;
      }
      const cleanDraft = stripSplitMarkerForComposer(json.data?.draftText || "");
      if (json.data?.silentNoReply || !cleanDraft) {
        onStatusNotice({
          tone: "warning",
          message: "Admission Adham reviewed the chat and decided no reply is needed.",
        });
        return;
      }
      onInsertDraft("admissions", cleanDraft);
    } catch {
      onStatusNotice({
        tone: "error",
        message: "Network error while writing Admission draft.",
      });
    } finally {
      setGenerating(null);
    }
  }, [authFetch, chatId, disabled, generatingAgent, onInsertDraft, onStatusNotice, setGenerating, togglingAgent]);

  const runFollowUpDraft = useCallback(async () => {
    if (disabled || generatingAgent || togglingAgent) return;
    setGenerating("followup");
    onStatusNotice(null);
    try {
      const res = await authFetch(
        `/crm-api/followup-agent/leads/${encodeURIComponent(chatId)}/draft`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            forceRegenerate: true,
            composerOneShot: true,
            switchFromAdmissions: false,
          }),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        onStatusNotice({
          tone: "error",
          message: json?.error || "Could not write a Follow-up draft.",
        });
        return;
      }
      const cleanDraft = stripSplitMarkerForComposer(json.data?.draftText || "");
      await loadLeadFollowUpState();
      if (json.data?.silentNoReply || !cleanDraft) {
        onStatusNotice({
          tone: "warning",
          message: "Follow-up Adham reviewed the chat and decided no follow-up is needed.",
        });
        return;
      }
      onInsertDraft("followup", cleanDraft);
    } catch {
      onStatusNotice({
        tone: "error",
        message: "Network error while writing Follow-up draft.",
      });
    } finally {
      setGenerating(null);
    }
  }, [authFetch, chatId, disabled, generatingAgent, loadLeadFollowUpState, onInsertDraft, onStatusNotice, setGenerating, togglingAgent]);

  const handleAdmissionClick = useCallback(async () => {
    if (disabled || generatingAgent || togglingAgent) return;
    const freshSummary = (await loadSettingsSummary()) ?? summary;
    if (freshSummary.admissionSendMode === "draft") {
      await runAdmissionsDraft();
      return;
    }

    const currentlyActive = Boolean(claudeEnabled && !claudePaused);
    setTogglingAgent("admissions");
    onStatusNotice(null);
    try {
      if (currentlyActive) {
        const res = await updateConversationClaude(chatId, { claudeEnabled: false });
        if (!res.ok) {
          onStatusNotice({
            tone: "error",
            message: res.error || "Could not turn off Admission Adham.",
          });
        } else {
          onStatusNotice({ tone: "info", message: "Admission Adham turned off for this chat." });
        }
      } else {
        const payload =
          claudeEnabled && claudePaused
            ? { claudePaused: false, triggerReply: true }
            : { claudeEnabled: true, triggerReply: true };
        const res = await updateConversationClaude(chatId, payload);
        if (!res.ok) {
          onStatusNotice({
            tone: "error",
            message: res.error || "Could not turn on Admission Adham.",
          });
        } else if (res.autoReplySkippedReason === "global_disabled") {
          onStatusNotice({
            tone: "warning",
            message: "Admission Adham is ON, but automatic replies are paused globally.",
          });
        } else {
          onStatusNotice({
            tone: "info",
            message: "Admission Adham is ON — replying now and staying active.",
          });
        }
      }
    } finally {
      setTogglingAgent(null);
    }
  }, [
    chatId,
    claudeEnabled,
    claudePaused,
    disabled,
    generatingAgent,
    loadSettingsSummary,
    onStatusNotice,
    runAdmissionsDraft,
    summary,
    togglingAgent,
    updateConversationClaude,
  ]);

  const handleFollowUpClick = useCallback(async () => {
    if (disabled || generatingAgent || togglingAgent) return;
    const freshSummary = (await loadSettingsSummary()) ?? summary;

    if (freshSummary.followUpSendMode !== "auto") {
      await runFollowUpDraft();
      return;
    }

    const currentlyActive = isFollowUpEnrollmentActive(followUpLead?.enrollment?.status);
    setTogglingAgent("followup");
    onStatusNotice(null);
    try {
      if (currentlyActive) {
        const res = await authFetch(
          `/crm-api/followup-agent/leads/${encodeURIComponent(chatId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "pause" }),
          }
        );
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          onStatusNotice({
            tone: "error",
            message: json?.error || "Could not turn off Follow-up Adham.",
          });
          return;
        }
        await loadLeadFollowUpState();
        onStatusNotice({ tone: "info", message: "Follow-up Adham turned off for this chat." });
      } else {
        const res = await authFetch(
          `/crm-api/followup-agent/leads/${encodeURIComponent(chatId)}/activate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ switchFromAdmissions: true }),
          }
        );
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          onStatusNotice({
            tone: "error",
            message: json?.error || "Could not turn on Follow-up Adham.",
          });
          return;
        }
        await loadLeadFollowUpState();
        if (json.data?.autoSendSkippedReason === "global_disabled") {
          onStatusNotice({
            tone: "warning",
            message: "Follow-up Adham is ON, but automatic sending is paused in Follow-up Schedule.",
          });
        } else {
          onStatusNotice({
            tone: "info",
            message: "Follow-up Adham is ON — sending follow-up and staying active.",
          });
        }
      }
    } catch {
      onStatusNotice({
        tone: "error",
        message: "Network error while updating Follow-up Adham.",
      });
    } finally {
      setTogglingAgent(null);
    }
  }, [
    authFetch,
    chatId,
    disabled,
    followUpLead,
    generatingAgent,
    loadLeadFollowUpState,
    loadSettingsSummary,
    onStatusNotice,
    runFollowUpDraft,
    summary,
    togglingAgent,
  ]);

  // Support "Rewrite" action from the Draft banner inside ChatInputBar
  useEffect(() => {
    if (!rewriteRequest || rewriteRequest.id <= 0) return;
    if (rewriteRequest.id === lastRewriteIdRef.current) return;
    lastRewriteIdRef.current = rewriteRequest.id;
    queueMicrotask(() => {
      if (rewriteRequest.agent === "admissions") {
        void runAdmissionsDraft();
      } else {
        void runFollowUpDraft();
      }
    });
  }, [rewriteRequest, runAdmissionsDraft, runFollowUpDraft]);

  const visual = useMemo(
    () =>
      resolveComposerAgentVisualState({
        admissionSendMode: summary.admissionSendMode,
        followUpSendMode: summary.followUpSendMode,
        claudeEnabled,
        claudePaused,
        followUpEnrollmentStatus: followUpLead?.enrollment?.status,
        generatingAgent,
      }),
    [
      claudeEnabled,
      claudePaused,
      followUpLead?.enrollment?.status,
      generatingAgent,
      summary.admissionSendMode,
      summary.followUpSendMode,
    ]
  );

  const visibleActive =
    (showFollowUp && visual.followUpActive) || (showAdmissions && visual.admissionActive);
  const visibleGenerating =
    (showFollowUp && visual.followUpGenerating) ||
    (showAdmissions && visual.admissionGenerating);

  const followUpTooltipTitle = `Follow-up Adham · ${
    summary.followUpSendMode === "auto" ? "Auto" : "Draft"
  }`;
  const followUpTooltipHint = visual.followUpGenerating
    ? "Writing follow-up draft..."
    : summary.followUpSendMode === "auto"
    ? visual.followUpActive
      ? "Active — click to turn off"
      : "Click to send & keep active"
    : "Click to draft in composer";

  const admissionTooltipTitle = `Admission Adham · ${
    summary.admissionSendMode === "auto" ? "Auto" : "Draft"
  }`;
  const admissionTooltipHint = visual.admissionGenerating
    ? "Writing admission draft..."
    : summary.admissionSendMode === "auto"
    ? visual.admissionActive
      ? "Active — click to turn off"
      : "Click to turn on & reply"
    : "Click to draft in composer";

  if (!isExpanded) {
    return (
      <div ref={containerRef} className="relative shrink-0">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onToggleExpanded(true)}
          aria-expanded={false}
          aria-label="Open AI Agents"
          title="AI Agents (Follow-up & Admission)"
          className="relative flex items-center justify-center w-[36px] min-h-[36px] mb-[3px] sm:mb-[1px] rounded-lg shrink-0 transition-all duration-150 cursor-pointer disabled:opacity-40 border"
          style={
            visibleActive || visibleGenerating
              ? {
                  background: "var(--bg-selected)",
                  borderColor: "var(--label-blue-border)",
                  color: "var(--bg-banner)",
                }
              : {
                  background: "transparent",
                  borderColor: "transparent",
                  color: "var(--text-secondary)",
                }
          }
        >
          {visibleGenerating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Bot className="w-4 h-4" />
          )}
          {visibleActive && !visibleGenerating && (
            <span
              className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
              style={{ backgroundColor: "var(--label-green-dot)" }}
              aria-hidden="true"
            />
          )}
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label="AI Agents"
      className="relative flex items-center gap-0.5 p-0.5 mb-[3px] sm:mb-[1px] rounded-xl border shrink-0 transition-all duration-150"
      style={{
        background: "var(--bg-pill)",
        borderColor: "var(--border-input)",
      }}
    >
      {/* Collapse button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onToggleExpanded(false)}
        aria-expanded={true}
        aria-label="Collapse AI Agents"
        title="Collapse AI Agents"
        className="flex items-center justify-center w-8 h-8 rounded-lg cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
        style={{ color: "var(--text-secondary)" }}
      >
        <Bot className="w-4 h-4" />
      </button>

      <span
        className="w-px h-5 shrink-0 mx-0.5"
        style={{ background: "var(--border-main)" }}
        aria-hidden="true"
      />

      {/* Follow-up Agent Icon */}
      {showFollowUp && (
        <div className="relative group/agentBtn">
          <button
            type="button"
            disabled={disabled || Boolean(generatingAgent) || togglingAgent === "followup"}
            onClick={() => void handleFollowUpClick()}
            aria-pressed={visual.followUpActive}
            aria-label={`${followUpTooltipTitle}: ${followUpTooltipHint}`}
            className="relative flex items-center justify-center w-8 h-8 rounded-lg border cursor-pointer transition-all duration-150 disabled:opacity-50"
            style={
              visual.followUpGenerating || togglingAgent === "followup"
                ? {
                    background: "var(--bg-selected)",
                    borderColor: "var(--label-blue-border)",
                    color: "var(--label-blue-text)",
                  }
                : visual.followUpActive
                ? {
                    background: "var(--label-green-bg)",
                    borderColor: "var(--label-green-border)",
                    color: "var(--label-green-text)",
                  }
                : {
                    background: "transparent",
                    borderColor: "transparent",
                    color: "var(--text-secondary)",
                  }
            }
          >
            {visual.followUpGenerating || togglingAgent === "followup" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Repeat2 className="w-4 h-4" />
            )}
            {visual.followUpActive && !visual.followUpGenerating && (
              <span
                className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: "var(--label-green-dot)" }}
                aria-hidden="true"
              />
            )}
          </button>

          <div
            role="tooltip"
            className="pointer-events-none opacity-0 group-hover/agentBtn:opacity-100 group-focus-within/agentBtn:opacity-100 transition-opacity duration-100 absolute bottom-full left-0 mb-2 w-max max-w-[200px] px-2.5 py-1.5 rounded-lg border z-50"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-main)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <p className="text-[11px] font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              {followUpTooltipTitle}
            </p>
            <p className="text-[10px] leading-tight mt-0.5" style={{ color: "var(--text-secondary)" }}>
              {followUpTooltipHint}
            </p>
          </div>
        </div>
      )}

      {/* Admission Agent Icon */}
      {showAdmissions && (
        <div className="relative group/agentBtn">
          <button
            type="button"
            disabled={disabled || Boolean(generatingAgent) || togglingAgent === "admissions"}
            onClick={() => void handleAdmissionClick()}
            aria-pressed={visual.admissionActive}
            aria-label={`${admissionTooltipTitle}: ${admissionTooltipHint}`}
            className="relative flex items-center justify-center w-8 h-8 rounded-lg border cursor-pointer transition-all duration-150 disabled:opacity-50"
            style={
              visual.admissionGenerating || togglingAgent === "admissions"
                ? {
                    background: "var(--bg-selected)",
                    borderColor: "var(--label-blue-border)",
                    color: "var(--label-blue-text)",
                  }
                : visual.admissionActive
                ? {
                    background: "var(--label-green-bg)",
                    borderColor: "var(--label-green-border)",
                    color: "var(--label-green-text)",
                  }
                : {
                    background: "transparent",
                    borderColor: "transparent",
                    color: "var(--text-secondary)",
                  }
            }
          >
            {visual.admissionGenerating || togglingAgent === "admissions" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <GraduationCap className="w-4 h-4" />
            )}
            {visual.admissionActive && !visual.admissionGenerating && (
              <span
                className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: "var(--label-green-dot)" }}
                aria-hidden="true"
              />
            )}
          </button>

          <div
            role="tooltip"
            className="pointer-events-none opacity-0 group-hover/agentBtn:opacity-100 group-focus-within/agentBtn:opacity-100 transition-opacity duration-100 absolute bottom-full left-0 mb-2 w-max max-w-[200px] px-2.5 py-1.5 rounded-lg border z-50"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-main)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <p className="text-[11px] font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              {admissionTooltipTitle}
            </p>
            <p className="text-[10px] leading-tight mt-0.5" style={{ color: "var(--text-secondary)" }}>
              {admissionTooltipHint}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

