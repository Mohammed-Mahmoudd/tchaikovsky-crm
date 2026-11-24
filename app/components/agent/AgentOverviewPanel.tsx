"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Bot, Check, SlidersHorizontal, UserPlus } from "lucide-react";
import {
  useAgentAssignedLeads,
  useAgentCore,
  useAgentStudioDraft,
} from "../../context/AgentWorkspaceContext";
import type { ClaudeActivitySummary } from "../../utils/claudeAgent";
import {
  AGENT_CACHE_KEYS,
  type CachedActivityPayload,
  readAgentActivityCache,
  readAgentMemorySnapshot,
} from "../../utils/agentWorkspaceCache";
import { ClaudeActivityPanel, type ActivityFilter } from "../ClaudeActivityPanel";
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
 * Chairman Command Center combining Adham AI status, master switch,
 * unified 24h KPIs, and the live searchable activity stream.
 */
export function AgentOverviewPanel() {
  const router = useRouter();
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
  const { agentName, activeModelLabel } = useAgentStudioDraft();
  const { leadCounts } = useAgentAssignedLeads();

  const [activityOutcome, setActivityOutcome] = useState<ActivityFilter>("all");
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

  const { connection, platformAgent, platformError } = statusData;
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

  const attentionCount = activitySummary.escalated + activitySummary.error;
  const attentionTone =
    activitySummary.error > 0
      ? "var(--label-red-text)"
      : attentionCount > 0
      ? "var(--label-amber-text)"
      : "var(--text-secondary)";

  return (
    <div className="space-y-4">
      {/* Status & Master Switch Card */}
      <section
        className="rounded-xl p-4 sm:p-5 space-y-4"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-main)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{
                  background: "var(--label-blue-bg)",
                  border: "1px solid var(--label-blue-border)",
                  color: "var(--bg-banner)",
                }}
              >
                <Bot className="w-4 h-4" />
              </div>
              <h2 className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>
                {platformAgent?.name || agentName || "Adham — Admissions Assistant"}
              </h2>
              <ClaudeStatusPill label={overviewStatusLabel} tone={overviewStatusTone} />
              {activeModelLabel && (
                <span
                  className="px-2 py-0.5 rounded-md text-[10.5px] font-medium"
                  style={{
                    background: "var(--bg-pill)",
                    color: "var(--text-secondary)",
                  }}
                >
                  {activeModelLabel}
                </span>
              )}
            </div>
            <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
              Replies to assigned leads automatically and books Free Discovery Sessions with branch school managers.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Link
              href="/agent/leads?mode=assign"
              className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-[38px] px-3.5 rounded-lg text-[12px] font-semibold text-white"
              style={{ background: "var(--bg-banner)" }}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Assign leads</span>
            </Link>
            <Link
              href="/agent/studio"
              className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-[38px] px-3 rounded-lg text-[12px] font-medium hover:bg-[var(--bg-hover)]"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-input)",
                color: "var(--text-primary)",
              }}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" style={{ color: "var(--text-secondary)" }} />
              <span>Open Studio</span>
            </Link>
          </div>
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
              className="min-h-[44px] sm:min-h-[40px] px-4 rounded-lg text-[12px] font-semibold text-white shrink-0 cursor-pointer disabled:opacity-50"
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

        {/* Primary Auto-Reply Master Switch */}
        <div
          className="rounded-xl px-4 py-3 flex items-center justify-between gap-4"
          style={{
            background: settingsDraft.enabled ? "var(--label-green-bg)" : "var(--bg-panel)",
            border: `1px solid ${settingsDraft.enabled ? "var(--label-green-border)" : "var(--border-main)"}`,
          }}
        >
          <div className="min-w-0">
            <p
              id="claude-master-label"
              className="text-[13px] font-semibold"
              style={{ color: settingsDraft.enabled ? "var(--label-green-text)" : "var(--text-primary)" }}
            >
              Automatic replies for assigned leads: {settingsDraft.enabled ? "ON" : "OFF"}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
              Turn OFF at any time to immediately stop all automatic AI messages across the school.
            </p>
          </div>
          <ClaudeSettingSwitch
            checked={settingsDraft.enabled}
            disabled={savingSettings}
            labelledBy="claude-master-label"
            onToggle={() => void handleToggleMaster()}
          />
        </div>

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
            <p className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
              Assigned Leads
            </p>
            <p className="text-[20px] font-bold mt-0.5 tabular-nums" style={{ color: "var(--label-blue-text)" }}>
              {leadCounts.totalAssigned}
            </p>
            <p className="text-[10.5px] mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
              {leadCounts.activeCount} active · {leadCounts.pausedCount} paused
            </p>
          </Link>

          <button
            type="button"
            onClick={() => setActivityOutcome("all")}
            className="rounded-lg px-3.5 py-3 text-left transition-colors hover:bg-[var(--bg-hover)] cursor-pointer"
            style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--border-main)",
            }}
          >
            <p className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
              Turns (24h)
            </p>
            <p className="text-[20px] font-bold mt-0.5 tabular-nums" style={{ color: "var(--text-primary)" }}>
              {activitySummary.total}
            </p>
            <p className="text-[10.5px] mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
              {activitySummary.replied} replied · {activitySummary.updated} CRM updates
            </p>
          </button>

          <button
            type="button"
            onClick={() => setActivityOutcome("booked")}
            className="rounded-lg px-3.5 py-3 text-left transition-colors hover:bg-[var(--bg-hover)] cursor-pointer"
            style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--border-main)",
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
            onClick={() =>
              setActivityOutcome(activitySummary.error > 0 ? "error" : "escalated")
            }
            className="rounded-lg px-3.5 py-3 text-left transition-colors hover:bg-[var(--bg-hover)] cursor-pointer"
            style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--border-main)",
            }}
          >
            <p className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
              Needs Attention
            </p>
            <p className="text-[20px] font-bold mt-0.5 tabular-nums" style={{ color: attentionTone }}>
              {attentionCount}
            </p>
            <p className="text-[10.5px] mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
              {activitySummary.escalated} escalated · {activitySummary.error} errors
            </p>
          </button>
        </div>
      </section>

      {/* Live Activity Stream */}
      <ClaudeActivityPanel
        embedded
        outcomeFilter={activityOutcome}
        onOutcomeFilterChange={setActivityOutcome}
        onSummaryChange={setActivitySummary}
        onOpenLeadChat={openLeadChat}
        onOpenSkillsTab={() => router.push("/agent/studio?section=skills")}
      />
    </div>
  );
}
