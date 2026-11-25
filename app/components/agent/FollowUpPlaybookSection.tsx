"use client";

import React from "react";
import { AlertCircle, Check } from "lucide-react";
import type { FeedbackNotice } from "../../context/AgentWorkspaceContext";
import type { FollowUpStatusPayload } from "../../utils/followupAgent";
import { ClaudePromptEditor } from "../ClaudePromptEditor";

interface FollowUpPlaybookSectionProps {
  statusData: FollowUpStatusPayload;
  agentName: string;
  onAgentNameChange: (next: string) => void;
  agentModel: string;
  onAgentModelChange: (next: string) => void;
  customModel: string;
  onCustomModelChange: (next: string) => void;
  agentSystem: string;
  onAgentSystemChange: (next: string) => void;
  onResetDefaults: (name: string, system: string) => void;
  savingAgent: boolean;
  creatingAgent: boolean;
  agentFeedback: FeedbackNotice | null;
  onSaveAgent: (e: React.FormEvent) => void;
  onCreateAgent: () => void;
  onOpenSandbox: () => void;
}

/**
 * Clean Instructions & AI Model editor for Follow-up Adham (no developer jargon).
 */
export function FollowUpPlaybookSection({
  statusData,
  agentName,
  onAgentNameChange,
  agentModel,
  onAgentModelChange,
  customModel,
  onCustomModelChange,
  agentSystem,
  onAgentSystemChange,
  onResetDefaults,
  savingAgent,
  creatingAgent,
  agentFeedback,
  onSaveAgent,
  onCreateAgent,
  onOpenSandbox,
}: FollowUpPlaybookSectionProps) {
  const { connection, availableModels, playbookDefaults } = statusData;

  return (
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
          Instructions &amp; AI Model
        </h2>
        <p className="text-[11.5px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
          Choose Adham&apos;s AI model and edit how he follows up with leads.
        </p>
      </div>

      {!connection.hasAgentId && connection.hasApiKey && (
        <div
          className="rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          style={{
            background: "var(--bg-panel)",
            border: "1px solid var(--border-main)",
          }}
        >
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            Activate Follow-up Adham first before saving custom instructions.
          </p>
          <button
            type="button"
            disabled={creatingAgent}
            onClick={onCreateAgent}
            className="min-h-[44px] sm:min-h-[38px] px-4 rounded-lg text-[12px] font-semibold text-white shrink-0 cursor-pointer disabled:opacity-50"
            style={{ background: "var(--bg-banner)" }}
          >
            {creatingAgent ? "Activating..." : "Activate Follow-up Adham"}
          </button>
        </div>
      )}

      <form onSubmit={onSaveAgent} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="followup-agent-name"
              className="block text-[11px] font-medium mb-1"
              style={{ color: "var(--text-secondary)" }}
            >
              Assistant name
            </label>
            <input
              id="followup-agent-name"
              type="text"
              value={agentName}
              onChange={(e) => onAgentNameChange(e.target.value)}
              required
              className="w-full min-h-[44px] sm:min-h-[40px] px-3 text-[16px] sm:text-[13px] rounded-lg outline-none"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-input)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          <div>
            <label
              htmlFor="followup-agent-model"
              className="block text-[11px] font-medium mb-1"
              style={{ color: "var(--text-secondary)" }}
            >
              AI Model
            </label>
            <select
              id="followup-agent-model"
              value={agentModel}
              onChange={(e) => onAgentModelChange(e.target.value)}
              className="w-full min-h-[44px] sm:min-h-[40px] px-3 text-[16px] sm:text-[13px] rounded-lg outline-none"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-input)",
                color: "var(--text-primary)",
              }}
            >
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
              {agentModel === "__custom__" && (
                <option value="__custom__">{customModel || "Custom model"}</option>
              )}
            </select>
          </div>
        </div>

        {agentModel === "__custom__" && (
          <div>
            <label
              htmlFor="followup-custom-model"
              className="block text-[11px] font-medium mb-1"
              style={{ color: "var(--text-secondary)" }}
            >
              Custom model
            </label>
            <input
              id="followup-custom-model"
              type="text"
              value={customModel}
              onChange={(e) => onCustomModelChange(e.target.value)}
              required
              className="w-full max-w-md min-h-[44px] sm:min-h-[40px] px-3 text-[16px] sm:text-[13px] rounded-lg outline-none"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-input)",
                color: "var(--text-primary)",
              }}
            />
          </div>
        )}

        <ClaudePromptEditor
          value={agentSystem}
          onChange={onAgentSystemChange}
          defaultPrompt={playbookDefaults.system}
          defaultName={playbookDefaults.name}
          onResetToDefaults={onResetDefaults}
        />

        {agentFeedback && (
          <div
            className="rounded-lg p-3 flex items-start gap-2 text-[12px]"
            style={{
              background: agentFeedback.ok ? "var(--label-green-bg)" : "var(--label-red-bg)",
              border: `1px solid ${agentFeedback.ok ? "var(--label-green-border)" : "var(--label-red-border)"}`,
              color: agentFeedback.ok ? "var(--label-green-text)" : "var(--label-red-text)",
            }}
          >
            {agentFeedback.ok ? (
              <Check className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span className="break-words min-w-0">{agentFeedback.msg}</span>
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={onOpenSandbox}
            className="min-h-[44px] sm:min-h-[38px] px-4 rounded-lg text-[12px] font-medium cursor-pointer hover:bg-[var(--bg-hover)]"
            style={{
              background: "var(--bg-input)",
              border: "1px solid var(--border-input)",
              color: "var(--text-primary)",
            }}
          >
            Preview a reply
          </button>

          <button
            type="submit"
            disabled={savingAgent || !connection.hasAgentId}
            className="min-h-[44px] sm:min-h-[38px] px-4 rounded-lg text-[12px] font-semibold text-white cursor-pointer disabled:opacity-50"
            style={{ background: "var(--bg-banner)" }}
          >
            {savingAgent ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>
    </section>
  );
}
