"use client";

import React from "react";
import { AlertCircle, Check, ExternalLink } from "lucide-react";
import { useAgentCore } from "../../context/AgentWorkspaceContext";
import { ClaudeSettingSwitch, ClaudeStatusPill } from "../ClaudeUiPrimitives";
import { AgentWorkspaceError, AgentWorkspaceLoading } from "./AgentShellHelpers";

/**
 * Studio section for operational handoff guardrails, escalation alert settings,
 * and technical Claude Platform connection details.
 */
export function AgentRulesSection() {
  const {
    loadingStatus,
    loadError,
    statusData,
    settingsDraft,
    updateSettingsDraft,
    savingSettings,
    settingsFeedback,
    creatingAgent,
    createFeedback,
    fetchStatus,
    saveGlobalSettings,
    handleCreateAgentOnPlatform,
  } = useAgentCore();

  if (loadingStatus && !statusData) {
    return <AgentWorkspaceLoading label="Loading Rules and Guardrails" />;
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
    return <AgentWorkspaceLoading label="Loading Rules and Guardrails" />;
  }

  const { connection, platformAgent } = statusData;

  return (
    <div className="space-y-4">
      {/* Operational Guardrails Card */}
      <section
        className="rounded-xl p-4 sm:p-5 space-y-4"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-main)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
            Rules &amp; Guardrails
          </h2>
          <p className="text-[11.5px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Control how Adham works alongside your admission officers.
          </p>
        </div>

        <div className="space-y-3.5 pt-1">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p
                id="claude-pause-human-label"
                className="text-[13px] font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                Pause automatically when staff replies
              </p>
              <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                Stops Adham immediately as soon as a human team member messages the lead.
              </p>
            </div>
            <ClaudeSettingSwitch
              checked={settingsDraft.pauseOnHumanReply}
              disabled={savingSettings}
              labelledBy="claude-pause-human-label"
              onToggle={() =>
                updateSettingsDraft((prev) => ({
                  ...prev,
                  pauseOnHumanReply: !prev.pauseOnHumanReply,
                }))
              }
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p
                id="claude-book-label"
                className="text-[13px] font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                Allow automatic Discovery Session booking
              </p>
              <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                Lets Adham reserve open branch times and move leads to Audition Booked.
              </p>
            </div>
            <ClaudeSettingSwitch
              checked={settingsDraft.allowAutoBooking}
              disabled={savingSettings}
              labelledBy="claude-book-label"
              onToggle={() =>
                updateSettingsDraft((prev) => ({
                  ...prev,
                  allowAutoBooking: !prev.allowAutoBooking,
                }))
              }
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p
                id="claude-update-lead-label"
                className="text-[13px] font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                Allow saving lead details automatically
              </p>
              <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                Updates branch, instrument, and student age mentioned in the chat.
              </p>
            </div>
            <ClaudeSettingSwitch
              checked={settingsDraft.allowLeadUpdates}
              disabled={savingSettings}
              labelledBy="claude-update-lead-label"
              onToggle={() =>
                updateSettingsDraft((prev) => ({
                  ...prev,
                  allowLeadUpdates: !prev.allowLeadUpdates,
                }))
              }
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p
                id="claude-wa-escalation-label"
                className="text-[13px] font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                Notify team on WhatsApp for escalations
              </p>
              <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                Alerts your team for complaints, discount requests, children under 6, or requests to speak with staff.
              </p>
            </div>
            <ClaudeSettingSwitch
              checked={settingsDraft.allowWhatsAppEscalation}
              disabled={savingSettings}
              labelledBy="claude-wa-escalation-label"
              onToggle={() =>
                updateSettingsDraft((prev) => ({
                  ...prev,
                  allowWhatsAppEscalation: !prev.allowWhatsAppEscalation,
                }))
              }
            />
          </div>

          {settingsDraft.allowWhatsAppEscalation && (
            <div className="pt-1">
              <label
                htmlFor="studio-escalation-phone"
                className="block text-[11px] font-medium mb-1"
                style={{ color: "var(--text-secondary)" }}
              >
                WhatsApp number for escalation alerts
              </label>
              <input
                id="studio-escalation-phone"
                type="tel"
                value={settingsDraft.escalationPhone}
                onChange={(e) =>
                  updateSettingsDraft((prev) => ({ ...prev, escalationPhone: e.target.value }))
                }
                placeholder="+20 100 418 9200"
                className="w-full max-w-sm min-h-[44px] sm:min-h-[40px] px-3 text-[16px] sm:text-[13px] rounded-lg outline-none"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-input)",
                  color: "var(--text-primary)",
                }}
              />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <div>
              {settingsFeedback && (
                <p
                  className="text-[12px] font-medium"
                  style={{
                    color: settingsFeedback.ok ? "var(--label-green-text)" : "var(--label-red-text)",
                  }}
                >
                  {settingsFeedback.msg}
                </p>
              )}
            </div>
            <button
              type="button"
              disabled={savingSettings}
              onClick={() => void saveGlobalSettings()}
              className="min-h-[44px] sm:min-h-[40px] px-4 rounded-lg text-[12px] font-semibold text-white cursor-pointer disabled:opacity-50"
              style={{ background: "var(--bg-banner)" }}
            >
              {savingSettings ? "Saving..." : "Save rules"}
            </button>
          </div>
        </div>
      </section>

      {/* Technical & Connection Details Card */}
      <section
        className="rounded-xl p-4 sm:p-5 space-y-3.5"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-main)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div>
          <h3 className="text-[13.5px] font-semibold" style={{ color: "var(--text-primary)" }}>
            Technical &amp; connection details
          </h3>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Environment status, silent CRM label mapping, and Claude Platform console access.
          </p>
        </div>

        {!connection.hasAgentId && connection.hasApiKey && (
          <div
            className="rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--border-main)",
            }}
          >
            <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
              Adham is not created yet on platform.claude.com.
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

        <div className="flex flex-wrap items-center gap-2">
          <ClaudeStatusPill
            label={connection.hasApiKey ? "ANTHROPIC_API_KEY ready" : "API key missing"}
            tone={connection.hasApiKey ? "green" : "red"}
          />
          {connection.agentId && (
            <ClaudeStatusPill label={`Agent: ${connection.agentId}`} tone="blue" />
          )}
          {platformAgent && <ClaudeStatusPill label={`v${platformAgent.version}`} tone="slate" />}
          {connection.dryRun && <ClaudeStatusPill label="MESSAGING_DRY_RUN ON" tone="amber" />}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pt-1">
          <div className="flex-1 max-w-sm">
            <label
              htmlFor="studio-existing-student-label"
              className="block text-[11px] font-medium mb-1"
              style={{ color: "var(--text-secondary)" }}
            >
              Silent existing-student CRM label
            </label>
            <input
              id="studio-existing-student-label"
              type="text"
              value={settingsDraft.existingStudentLabelName}
              onChange={(e) =>
                updateSettingsDraft((prev) => ({
                  ...prev,
                  existingStudentLabelName: e.target.value,
                }))
              }
              placeholder="Existing student"
              className="w-full min-h-[44px] sm:min-h-[38px] px-3 text-[16px] sm:text-[12px] rounded-lg outline-none"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-input)",
                color: "var(--text-primary)",
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={savingSettings}
              onClick={() => void saveGlobalSettings()}
              className="min-h-[44px] sm:min-h-[38px] px-3.5 rounded-lg text-[11.5px] font-semibold text-white cursor-pointer disabled:opacity-50"
              style={{ background: "var(--bg-banner)" }}
            >
              Save label
            </button>
            <a
              href="https://platform.claude.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-[38px] px-3 rounded-lg text-[11.5px] font-medium hover:bg-[var(--bg-hover)]"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-input)",
                color: "var(--text-primary)",
              }}
            >
              <span>Open Claude Platform</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

