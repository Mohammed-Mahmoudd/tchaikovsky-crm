"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowUpRight, Check, MessageSquare } from "lucide-react";
import {
  useAgentAssignedLeads,
  useAgentCore,
} from "../../context/AgentWorkspaceContext";
import {
  type ClaudeActivityFilter,
  type ClaudeActivitySummary,
  type ClaudeActivityWindow,
  formatClaudePausedReason,
  selectAttentionLeads,
} from "../../utils/claudeAgent";
import {
  AGENT_CACHE_KEYS,
  type CachedActivityPayload,
  readAgentActivityCache,
  readAgentMemorySnapshot,
} from "../../utils/agentWorkspaceCache";
import { ClaudeActivityPanel } from "../ClaudeActivityPanel";
import { ClaudeSettingSwitch, ClaudeStatusPill } from "../ClaudeUiPrimitives";
import { AgentWorkspaceError, AgentWorkspaceLoading } from "./AgentShellHelpers";

const EMPTY_SUMMARY: ClaudeActivitySummary = {
  total: 0,
  replied: 0,
  booked: 0,
  updated: 0,
  escalated: 0,
  silent: 0,
  error: 0,
};

/**
 * Chairman Command Center combining a single unified Adham AI control bar,
 * 24h KPI filter cards, conditional attention queue, and scannable live activity.
 */
export function AgentOverviewPanel() {
  const {
    loadingStatus,
    loadError,
    statusData,
    settingsDraft,
    savingSettings,
    settingsFeedback,
    creatingAgent,
    createFeedback,
    fetchStatus,
    handleToggleMaster,
    handleCreateAgentOnPlatform,
    openLeadChat,
  } = useAgentCore();
  const { mergedAssignedLeads, leadCounts } = useAgentAssignedLeads();

  const [activityOutcome, setActivityOutcome] = useState<ClaudeActivityFilter>("all");
  const [activityWindow, setActivityWindow] = useState<ClaudeActivityWindow>("all");
  const [activitySummary, setActivitySummary] = useState<ClaudeActivitySummary>(() => {
    const snap = readAgentMemorySnapshot<CachedActivityPayload>(AGENT_CACHE_KEYS.activity);
    return snap?.summary ?? EMPTY_SUMMARY;
  });

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const cached = readAgentActivityCache();
      if (cached?.summary) {
        setActivitySummary(cached.summary);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const attentionLeads = useMemo(
    () => selectAttentionLeads(mergedAssignedLeads),
    [mergedAssignedLeads]
  );

  if (loadingStatus && !statusData) {
    return <AgentWorkspaceLoading label="Loading Agent overview" />;
  }

  if (loadError && (!statusData || !settingsDraft)) {
    return (
      <AgentWorkspaceError
        message={loadError || "Could not load Agent configuration."}
        onRetry={() => void fetchStatus({ force: true })}
      />
    );
  }

  if (!statusData || !settingsDraft) {
    return <AgentWorkspaceLoading label="Loading Agent overview" />;
  }

  const { connection, platformError } = statusData;
  const isSetupComplete = connection.hasApiKey && connection.hasAgentId;
  const overviewStatusTone = !isSetupComplete
    ? "red"
    : settingsDraft.enabled
    ? "green"
    : "amber";
  const overviewStatusLabel = !isSetupComplete
    ? "Needs setup"
    : settingsDraft.enabled
    ? "Active"
    : "Paused";

  const statusLine = !isSetupComplete
    ? "Create or connect the Adham AI assistant to start automatic replies."
    : settingsDraft.enabled
    ? `Active across ${leadCounts.activeCount} active lead${leadCounts.activeCount === 1 ? "" : "s"}${
        leadCounts.pausedCount > 0 ? ` · ${leadCounts.pausedCount} paused` : ""
      }`
    : "Paused globally — no automatic AI replies will be sent.";

  const attention24hCount = activitySummary.escalated + activitySummary.error;
  const attentionTone =
    activitySummary.error > 0
      ? "var(--label-red-text)"
      : attention24hCount > 0
      ? "var(--label-amber-text)"
      : "var(--text-secondary)";

  const isTurns24hActive = activityOutcome === "all" && activityWindow === "24h";
  const isBooked24hActive = activityOutcome === "booked" && activityWindow === "24h";
  const isAttention24hActive = activityOutcome === "attention" && activityWindow === "24h";

  const toggleKpiFilter = (targetOutcome: ClaudeActivityFilter) => {
    const alreadyActive = activityOutcome === targetOutcome && activityWindow === "24h";
    if (alreadyActive) {
      setActivityOutcome("all");
      setActivityWindow("all");
      return;
    }
    setActivityOutcome(targetOutcome);
    setActivityWindow("24h");
  };

  return (
    <div className="space-y-4">
      {/* Control Strip & KPI Summary Card */}
      <section
        className="rounded-xl p-4 sm:p-5 space-y-4"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-main)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        {/* Single Unified Auto-Reply Switch & Status Bar */}
        <div
          className="rounded-xl px-4 py-3 flex items-center justify-between gap-4"
          style={{
            background: "var(--bg-panel)",
            border: "1px solid var(--border-main)",
          }}
        >
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p
                id="claude-master-label"
                className="text-[13px] font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                Automatic replies
              </p>
              <ClaudeStatusPill label={overviewStatusLabel} tone={overviewStatusTone} />
              {connection.dryRun && <ClaudeStatusPill label="Dry run" tone="amber" />}
              {!settingsDraft.allowAutoBooking && (
                <Link
                  href="/agent/studio?section=rules"
                  className="inline-flex items-center hover:opacity-80"
                >
                  <ClaudeStatusPill label="Auto-booking off" tone="amber" />
                </Link>
              )}
            </div>
            <p className="text-[11.5px]" style={{ color: "var(--text-secondary)" }}>
              {statusLine}
            </p>
          </div>

          <ClaudeSettingSwitch
            checked={settingsDraft.enabled}
            disabled={savingSettings}
            labelledBy="claude-master-label"
            onToggle={() => void handleToggleMaster()}
          />
        </div>

        {/* Setup prompt shown only if Agent is not connected yet */}
        {!connection.hasAgentId && connection.hasApiKey && (
          <div
            className="rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--border-main)",
            }}
          >
            <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
              Adham is not created yet. Click to set up the AI assistant automatically.
            </p>
            <button
              type="button"
              disabled={creatingAgent}
              onClick={() => void handleCreateAgentOnPlatform()}
              className="min-h-[44px] sm:min-h-[38px] px-4 rounded-lg text-[12px] font-semibold text-white shrink-0 cursor-pointer disabled:opacity-50"
              style={{ background: "var(--bg-banner)" }}
            >
              {creatingAgent ? "Creating..." : "Create Adham Agent"}
            </button>
          </div>
        )}

        {createFeedback && (
          <div
            className="rounded-lg p-3 flex items-start gap-2 text-[12px]"
            style={{
              background: createFeedback.ok ? "var(--label-green-bg)" : "var(--label-red-bg)",
              border: `1px solid ${createFeedback.ok ? "var(--label-green-border)" : "var(--label-red-border)"}`,
              color: createFeedback.ok ? "var(--label-green-text)" : "var(--label-red-text)",
            }}
          >
            {createFeedback.ok ? (
              <Check className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span className="break-words min-w-0">{createFeedback.msg}</span>
          </div>
        )}

        {platformError && (
          <div
            className="rounded-lg p-3 flex items-start gap-2 text-[12px]"
            style={{
              background: "var(--label-red-bg)",
              border: "1px solid var(--label-red-border)",
              color: "var(--label-red-text)",
            }}
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{platformError}</span>
          </div>
        )}

        {settingsFeedback && !settingsFeedback.ok && (
          <p className="text-[12px] font-medium" style={{ color: "var(--label-red-text)" }}>
            {settingsFeedback.msg}
          </p>
        )}

        {/* Unified 4-Card Live KPI Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Link
            href="/agent/leads"
            className="rounded-lg px-3.5 py-3 text-left transition-colors hover:bg-[var(--bg-hover)] block"
            style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--border-main)",
            }}
          >
            <div className="flex items-center justify-between gap-1">
              <p className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
                Assigned Leads
              </p>
              <ArrowUpRight className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-muted)" }} />
            </div>
            <p className="text-[20px] font-bold mt-0.5 tabular-nums" style={{ color: "var(--label-blue-text)" }}>
              {leadCounts.totalAssigned}
            </p>
            <p className="text-[10.5px] mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
              {leadCounts.activeCount} active · {leadCounts.pausedCount} paused
            </p>
          </Link>

          <button
            type="button"
            aria-pressed={isTurns24hActive}
            onClick={() => toggleKpiFilter("all")}
            className="rounded-lg px-3.5 py-3 text-left transition-colors hover:bg-[var(--bg-hover)] cursor-pointer"
            style={{
              background: isTurns24hActive ? "var(--bg-selected)" : "var(--bg-panel)",
              border: `1px solid ${isTurns24hActive ? "var(--label-blue-border)" : "var(--border-main)"}`,
            }}
          >
            <p className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
              Turns (24h)
            </p>
            <p className="text-[20px] font-bold mt-0.5 tabular-nums" style={{ color: "var(--text-primary)" }}>
              {activitySummary.total}
            </p>
            <p className="text-[10.5px] mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
              {activitySummary.replied} replied · {activitySummary.updated} updated
            </p>
          </button>

          <button
            type="button"
            aria-pressed={isBooked24hActive}
            onClick={() => toggleKpiFilter("booked")}
            className="rounded-lg px-3.5 py-3 text-left transition-colors hover:bg-[var(--bg-hover)] cursor-pointer"
            style={{
              background: isBooked24hActive ? "var(--bg-selected)" : "var(--bg-panel)",
              border: `1px solid ${isBooked24hActive ? "var(--label-blue-border)" : "var(--border-main)"}`,
            }}
          >
            <p className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
              Sessions Booked
            </p>
            <p className="text-[20px] font-bold mt-0.5 tabular-nums" style={{ color: "var(--label-green-text)" }}>
              {activitySummary.booked}
            </p>
            <p className="text-[10.5px] mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
              Last 24 hours
            </p>
          </button>

          <button
            type="button"
            aria-pressed={isAttention24hActive}
            onClick={() => toggleKpiFilter("attention")}
            className="rounded-lg px-3.5 py-3 text-left transition-colors hover:bg-[var(--bg-hover)] cursor-pointer"
            style={{
              background: isAttention24hActive ? "var(--bg-selected)" : "var(--bg-panel)",
              border: `1px solid ${isAttention24hActive ? "var(--label-blue-border)" : "var(--border-main)"}`,
            }}
          >
            <p className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
              Needs Attention
            </p>
            <p className="text-[20px] font-bold mt-0.5 tabular-nums" style={{ color: attentionTone }}>
              {attention24hCount}
            </p>
            <p className="text-[10.5px] mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
              {activitySummary.escalated} escalated · {activitySummary.error} errors (24h)
            </p>
          </button>
        </div>
      </section>

      {/* Live Attention Queue — shown only when leads currently have errors or active escalations */}
      {attentionLeads.length > 0 && (
        <section
          className="rounded-xl p-4 space-y-2.5"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-main)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 shrink-0" style={{ color: "var(--label-amber-text)" }} />
              <h2 className="text-[13px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                Leads waiting on staff ({attentionLeads.length})
              </h2>
            </div>
            <Link
              href="/agent/leads"
              className="text-[11.5px] font-medium hover:underline shrink-0"
              style={{ color: "var(--label-blue-text)" }}
            >
              Manage in Leads
            </Link>
          </div>

          <div>
            {attentionLeads.slice(0, 3).map((lead, idx) => {
              const hasErr = Boolean(lead.claudeLastError && lead.claudeLastError.trim());
              const detailText = hasErr
                ? lead.claudeLastError
                : formatClaudePausedReason(lead.claudePausedReason);

              return (
                <div
                  key={lead.senderId}
                  className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                  style={idx > 0 ? { borderTop: "1px solid var(--border-main)" } : undefined}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-[12.5px] font-semibold truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {lead.leadName || lead.name || lead.senderId}
                      </span>
                      <ClaudeStatusPill
                        label={hasErr ? "Error" : "Escalated"}
                        tone={hasErr ? "red" : "amber"}
                      />
                      {lead.branch && (
                        <span className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>
                          {lead.branch}
                        </span>
                      )}
                    </div>
                    <p
                      className="text-[11.5px] truncate mt-0.5"
                      style={{ color: hasErr ? "var(--label-red-text)" : "var(--text-secondary)" }}
                    >
                      {detailText}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => openLeadChat(lead.senderId)}
                    className="inline-flex items-center gap-1 min-h-[44px] sm:min-h-[32px] px-2.5 rounded-md text-[11px] font-medium shrink-0 cursor-pointer hover:bg-[var(--bg-hover)]"
                    style={{
                      background: "var(--bg-input)",
                      border: "1px solid var(--border-input)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <MessageSquare className="w-3 h-3" />
                    <span>Open chat</span>
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Scannable Live Activity Stream */}
      <ClaudeActivityPanel
        embedded
        outcomeFilter={activityOutcome}
        windowFilter={activityWindow}
        onOutcomeFilterChange={setActivityOutcome}
        onWindowFilterChange={setActivityWindow}
        onSummaryChange={setActivitySummary}
        onOpenLeadChat={openLeadChat}
      />
    </div>
  );
}
