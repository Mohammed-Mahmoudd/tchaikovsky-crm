"use client";

import React, { useState } from "react";
import { useAgentCore } from "../../context/AgentWorkspaceContext";
import { resolveClaudeSendMode } from "../../utils/claudeAgent";
import { ClaudeSettingSwitch, ClaudeStatusPill } from "../ClaudeUiPrimitives";
import { AgentWorkspaceError, AgentWorkspaceLoading } from "./AgentShellHelpers";

/**
 * Studio section for operational handoff guardrails and escalation alert settings.
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
    fetchStatus,
    saveGlobalSettings,
  } = useAgentCore();

  const [confirmAutoMode, setConfirmAutoMode] = useState(false);

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

  const currentSendMode = resolveClaudeSendMode(settingsDraft);

  const handleModeSelect = (nextMode: "draft" | "auto") => {
    if (nextMode === currentSendMode) return;
    if (nextMode === "auto") {
      setConfirmAutoMode(true);
      return;
    }
    setConfirmAutoMode(false);
    updateSettingsDraft((prev) => ({ ...prev, sendMode: "draft" }));
  };

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

        {/* How Adham sends messages (Draft vs Auto-send) */}
        <div className="space-y-2 pt-1">
          <span className="block text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
            How Adham sends messages
          </span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleModeSelect("draft")}
              className="text-left rounded-lg p-3.5 cursor-pointer transition-colors"
              style={{
                background:
                  currentSendMode === "draft" ? "var(--bg-selected)" : "var(--bg-panel)",
                border: `1px solid ${
                  currentSendMode === "draft"
                    ? "var(--label-blue-border)"
                    : "var(--border-main)"
                }`,
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  Draft before sending (Default)
                </span>
                {currentSendMode === "draft" && (
                  <ClaudeStatusPill label="Active" tone="blue" />
                )}
              </div>
              <p className="text-[11.5px] mt-1" style={{ color: "var(--text-secondary)" }}>
                Adham writes a draft message in the chat composer for you to review and send, then turns off automatically.
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleModeSelect("auto")}
              className="text-left rounded-lg p-3.5 cursor-pointer transition-colors"
              style={{
                background:
                  currentSendMode === "auto" ? "var(--bg-selected)" : "var(--bg-panel)",
                border: `1px solid ${
                  currentSendMode === "auto"
                    ? "var(--label-amber-border)"
                    : "var(--border-main)"
                }`,
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  Send automatically
                </span>
                {currentSendMode === "auto" && (
                  <ClaudeStatusPill label="Active" tone="amber" />
                )}
              </div>
              <p className="text-[11.5px] mt-1" style={{ color: "var(--text-secondary)" }}>
                Adham replies directly to leads and stays active on the conversation after the first message is sent.
              </p>
            </button>
          </div>

          {confirmAutoMode && (
            <div
              className="rounded-lg p-3.5 space-y-2.5"
              style={{
                background: "var(--label-amber-bg)",
                border: "1px solid var(--label-amber-border)",
              }}
            >
              <p className="text-[12px] font-semibold" style={{ color: "var(--label-amber-text)" }}>
                Turn on automatic sending?
              </p>
              <p className="text-[11.5px]" style={{ color: "var(--text-primary)" }}>
                When active on a chat, Adham will reply directly to the lead without waiting in the composer draft box.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    updateSettingsDraft((prev) => ({ ...prev, sendMode: "auto" }));
                    setConfirmAutoMode(false);
                  }}
                  className="min-h-[38px] px-3 rounded-lg text-[11.5px] font-semibold text-white cursor-pointer"
                  style={{ background: "var(--bg-banner)" }}
                >
                  Use automatic sending
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmAutoMode(false)}
                  className="min-h-[38px] px-3 rounded-lg text-[11.5px] font-medium cursor-pointer"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-input)",
                    color: "var(--text-primary)",
                  }}
                >
                  Keep draft before sending
                </button>
              </div>
            </div>
          )}
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
    </div>
  );
}

