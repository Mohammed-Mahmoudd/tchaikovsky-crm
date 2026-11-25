"use client";

import React, { useState } from "react";
import type { FeedbackNotice } from "../../context/AgentWorkspaceContext";
import {
  FOLLOWUP_CADENCE_PRESETS,
  FOLLOWUP_DAILY_LIMIT_OPTIONS,
  type FollowUpAgentSettingsData,
  type FollowUpCadencePreset,
  type FollowUpLeadReplyAction,
  WORKING_HOUR_END_OPTIONS,
  WORKING_HOUR_START_OPTIONS,
  formatRiyadhHourLabel,
  resolveCadencePresetId,
} from "../../utils/followupAgent";
import { ClaudeSettingSwitch, ClaudeStatusPill } from "../ClaudeUiPrimitives";

interface FollowUpRulesSectionProps {
  settingsDraft: FollowUpAgentSettingsData;
  onUpdateDraft: (updater: (prev: FollowUpAgentSettingsData) => FollowUpAgentSettingsData) => void;
  savingSettings: boolean;
  settingsFeedback: FeedbackNotice | null;
  onSaveSettings: () => Promise<void>;
}

/**
 * Simple 5-choice Schedule & Rules configuration for non-technical operators.
 * Safety pacing, Meta compliance, and collision guards stay locked ON in the backend.
 */
export function FollowUpRulesSection({
  settingsDraft,
  onUpdateDraft,
  savingSettings,
  settingsFeedback,
  onSaveSettings,
}: FollowUpRulesSectionProps) {
  const [confirmAutoMode, setConfirmAutoMode] = useState(false);

  const activePresetId = resolveCadencePresetId(settingsDraft);

  const applyPreset = (preset: FollowUpCadencePreset) => {
    onUpdateDraft((prev) => ({
      ...prev,
      initialDelayHours: preset.initialDelayHours,
      cadenceDays: [...preset.cadenceDays],
      maxAttempts: preset.maxAttempts,
    }));
  };

  const handleModeSelect = (nextMode: "approval" | "auto") => {
    if (nextMode === settingsDraft.sendMode) return;
    if (nextMode === "auto") {
      setConfirmAutoMode(true);
      return;
    }
    setConfirmAutoMode(false);
    onUpdateDraft((prev) => ({ ...prev, sendMode: "approval" }));
  };

  return (
    <section
      className="rounded-xl p-4 sm:p-5 space-y-6"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-main)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
          Schedule &amp; Delivery
        </h2>
        <p className="text-[11.5px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
          Choose how Adham sends follow-ups, how often he checks in, and which channels to use.
        </p>
      </div>

      {/* 1. How Adham Sends */}
      <div className="space-y-2">
        <span className="block text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
          How Adham sends messages
        </span>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => handleModeSelect("approval")}
            className="text-left rounded-lg p-3.5 cursor-pointer transition-colors"
            style={{
              background:
                settingsDraft.sendMode === "approval" ? "var(--bg-selected)" : "var(--bg-panel)",
              border: `1px solid ${
                settingsDraft.sendMode === "approval"
                  ? "var(--label-blue-border)"
                  : "var(--border-main)"
              }`,
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                Review before sending (Recommended)
              </span>
              {settingsDraft.sendMode === "approval" && (
                <ClaudeStatusPill label="Active" tone="blue" />
              )}
            </div>
            <p className="text-[11.5px] mt-1" style={{ color: "var(--text-secondary)" }}>
              Adham writes each follow-up draft for you to review and send in one click.
            </p>
          </button>

          <button
            type="button"
            onClick={() => handleModeSelect("auto")}
            className="text-left rounded-lg p-3.5 cursor-pointer transition-colors"
            style={{
              background:
                settingsDraft.sendMode === "auto" ? "var(--bg-selected)" : "var(--bg-panel)",
              border: `1px solid ${
                settingsDraft.sendMode === "auto"
                  ? "var(--label-amber-border)"
                  : "var(--border-main)"
              }`,
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                Send automatically
              </span>
              {settingsDraft.sendMode === "auto" && (
                <ClaudeStatusPill label="Active" tone="amber" />
              )}
            </div>
            <p className="text-[11.5px] mt-1" style={{ color: "var(--text-secondary)" }}>
              Adham sends assigned follow-ups automatically during working hours within the daily limit.
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
              Assigned leads will receive Adham&apos;s follow-up messages automatically during working hours without waiting for approval.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onUpdateDraft((prev) => ({ ...prev, sendMode: "auto" }));
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
                Keep review before sending
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. Follow-up Schedule Presets */}
      <div className="space-y-2">
        <span className="block text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
          Follow-up timing
        </span>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {FOLLOWUP_CADENCE_PRESETS.map((preset) => {
            const active = activePresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                className="text-left rounded-lg p-3.5 cursor-pointer transition-colors"
                style={{
                  background: active ? "var(--bg-selected)" : "var(--bg-panel)",
                  border: `1px solid ${active ? "var(--label-blue-border)" : "var(--border-main)"}`,
                }}
              >
                <p className="text-[12.5px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  {preset.label}
                </p>
                <p className="text-[11.5px] mt-1" style={{ color: "var(--text-secondary)" }}>
                  {preset.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Daily Limit & Working Hours */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <span className="block text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
            Daily message limit
          </span>
          <div className="grid grid-cols-3 gap-2">
            {FOLLOWUP_DAILY_LIMIT_OPTIONS.map((opt) => {
              const active = settingsDraft.dailyCap === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onUpdateDraft((prev) => ({ ...prev, dailyCap: opt.value }))}
                  className="rounded-lg p-2.5 text-center cursor-pointer transition-colors"
                  style={
                    active
                      ? {
                          background: "var(--bg-selected)",
                          border: "1px solid var(--label-blue-border)",
                          color: "var(--text-primary)",
                        }
                      : {
                          background: "var(--bg-panel)",
                          border: "1px solid var(--border-main)",
                          color: "var(--text-secondary)",
                        }
                  }
                >
                  <p className="text-[12.5px] font-semibold">{opt.label}</p>
                  <p className="text-[10.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {opt.note}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <span className="block text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
            Working hours (Riyadh time)
          </span>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label
                htmlFor="followup-hours-start"
                className="block text-[11px] font-medium mb-1"
                style={{ color: "var(--text-secondary)" }}
              >
                From
              </label>
              <select
                id="followup-hours-start"
                value={settingsDraft.businessHoursStart}
                onChange={(e) =>
                  onUpdateDraft((prev) => ({
                    ...prev,
                    businessHoursStart: Number(e.target.value),
                  }))
                }
                className="w-full min-h-[44px] sm:min-h-[40px] px-3 text-[16px] sm:text-[13px] rounded-lg outline-none"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-input)",
                  color: "var(--text-primary)",
                }}
              >
                {WORKING_HOUR_START_OPTIONS.map((hr) => (
                  <option key={hr} value={hr}>
                    {formatRiyadhHourLabel(hr)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="followup-hours-end"
                className="block text-[11px] font-medium mb-1"
                style={{ color: "var(--text-secondary)" }}
              >
                To
              </label>
              <select
                id="followup-hours-end"
                value={settingsDraft.businessHoursEnd}
                onChange={(e) =>
                  onUpdateDraft((prev) => ({
                    ...prev,
                    businessHoursEnd: Number(e.target.value),
                  }))
                }
                className="w-full min-h-[44px] sm:min-h-[40px] px-3 text-[16px] sm:text-[13px] rounded-lg outline-none"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-input)",
                  color: "var(--text-primary)",
                }}
              >
                {WORKING_HOUR_END_OPTIONS.map((hr) => (
                  <option key={hr} value={hr}>
                    {formatRiyadhHourLabel(hr)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Channels & When a Lead Replies */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <span className="block text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
            Channels
          </span>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { key: "wa", label: "WhatsApp" },
                { key: "fb", label: "Messenger" },
                { key: "ig", label: "Instagram" },
              ] as const
            ).map((ch) => {
              const active = settingsDraft.channels[ch.key];
              return (
                <button
                  key={ch.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    onUpdateDraft((prev) => ({
                      ...prev,
                      channels: { ...prev.channels, [ch.key]: !prev.channels[ch.key] },
                    }))
                  }
                  className={`min-h-[42px] sm:min-h-[36px] px-3.5 rounded-lg text-[12px] font-semibold cursor-pointer ${
                    active ? "text-white" : ""
                  }`}
                  style={
                    active
                      ? { background: "var(--bg-banner)" }
                      : {
                          background: "var(--bg-input)",
                          border: "1px solid var(--border-input)",
                          color: "var(--text-secondary)",
                        }
                  }
                >
                  {ch.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label
            htmlFor="followup-reply-action"
            className="block text-[12px] font-semibold mb-1.5"
            style={{ color: "var(--text-primary)" }}
          >
            When a lead replies
          </label>
          <select
            id="followup-reply-action"
            value={settingsDraft.onLeadReplyAction}
            onChange={(e) =>
              onUpdateDraft((prev) => ({
                ...prev,
                onLeadReplyAction: e.target.value as FollowUpLeadReplyAction,
              }))
            }
            className="w-full min-h-[44px] sm:min-h-[40px] px-3 text-[16px] sm:text-[13px] rounded-lg outline-none"
            style={{
              background: "var(--bg-input)",
              border: "1px solid var(--border-input)",
              color: "var(--text-primary)",
            }}
          >
            <option value="followup_continue">Adham continues and books a Discovery Session</option>
            <option value="handoff_adham">Transfer to Admissions Adham</option>
            <option value="handoff_staff">Pause so a team member can reply</option>
          </select>
        </div>
      </div>

      {/* 5. Auto-assign Silent Contacted Leads */}
      <div
        className="rounded-lg p-3.5 flex items-center justify-between gap-4"
        style={{ background: "var(--bg-panel)", border: "1px solid var(--border-main)" }}
      >
        <div className="min-w-0">
          <p
            id="followup-auto-assign-label"
            className="text-[13px] font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            Automatically assign silent Contacted leads
          </p>
          <p className="text-[11.5px]" style={{ color: "var(--text-secondary)" }}>
            Add Contacted leads who haven&apos;t replied after 24 hours automatically. Turn off to assign leads yourself.
          </p>
        </div>
        <ClaudeSettingSwitch
          checked={settingsDraft.autoEnrollContacted}
          disabled={savingSettings}
          labelledBy="followup-auto-assign-label"
          onToggle={() =>
            onUpdateDraft((prev) => ({
              ...prev,
              autoEnrollContacted: !prev.autoEnrollContacted,
            }))
          }
        />
      </div>

      {/* Built-in Protection Summary */}
      <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
        Built-in safety rules are always active: Adham stops automatically if staff reply, if a chat is archived or marked done, or for existing students, and paces WhatsApp messages safely.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
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
          onClick={() => void onSaveSettings()}
          className="min-h-[44px] sm:min-h-[40px] px-4 rounded-lg text-[12px] font-semibold text-white cursor-pointer disabled:opacity-50"
          style={{ background: "var(--bg-banner)" }}
        >
          {savingSettings ? "Saving..." : "Save schedule"}
        </button>
      </div>
    </section>
  );
}
