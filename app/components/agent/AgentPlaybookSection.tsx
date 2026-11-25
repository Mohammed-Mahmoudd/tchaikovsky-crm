"use client";

import React from "react";
import { useAgentCore, useAgentStudioDraft } from "../../context/AgentWorkspaceContext";
import { ClaudePromptEditor } from "../ClaudePromptEditor";
import { AgentWorkspaceError, AgentWorkspaceLoading } from "./AgentShellHelpers";

/**
 * Studio section for editing Adham's assistant identity, AI model, and Playbook system prompt.
 */
export function AgentPlaybookSection() {
  const { loadingStatus, loadError, statusData, fetchStatus } = useAgentCore();
  const {
    agentName,
    setAgentNameValue,
    agentModel,
    setAgentModelValue,
    customModel,
    setCustomModelValue,
    agentSystem,
    setAgentSystemValue,
    resetStudioDefaults,
    savingAgent,
    agentFeedback,
    handleSaveAgentToPlatform,
  } = useAgentStudioDraft();

  if (loadingStatus && !statusData) {
    return <AgentWorkspaceLoading label="Loading Playbook and Model" />;
  }

  if (loadError && !statusData) {
    return (
      <AgentWorkspaceError
        message={loadError || "Could not load Agent configuration."}
        onRetry={() => void fetchStatus({ force: true })}
      />
    );
  }

  if (!statusData) {
    return <AgentWorkspaceLoading label="Loading Playbook and Model" />;
  }

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
          Playbook &amp; Model
        </h2>
        <p className="text-[11.5px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
          Customize how Adham responds to parents and leads, and choose which AI model runs his replies.
        </p>
      </div>

      <form onSubmit={(e) => void handleSaveAgentToPlatform(e)} className="space-y-3.5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="studio-assistant-name"
              className="block text-[11px] font-medium mb-1"
              style={{ color: "var(--text-secondary)" }}
            >
              Assistant name
            </label>
            <input
              id="studio-assistant-name"
              type="text"
              value={agentName}
              onChange={(e) => setAgentNameValue(e.target.value)}
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
              htmlFor="studio-ai-model"
              className="block text-[11px] font-medium mb-1"
              style={{ color: "var(--text-secondary)" }}
            >
              AI Model
            </label>
            <select
              id="studio-ai-model"
              value={agentModel}
              onChange={(e) => setAgentModelValue(e.target.value)}
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
              <option value="__custom__">Custom model ID...</option>
            </select>
          </div>
        </div>

        {agentModel === "__custom__" && (
          <div>
            <label
              htmlFor="studio-custom-model"
              className="block text-[11px] font-medium mb-1"
              style={{ color: "var(--text-secondary)" }}
            >
              Custom Claude model ID
            </label>
            <input
              id="studio-custom-model"
              type="text"
              value={customModel}
              onChange={(e) => setCustomModelValue(e.target.value)}
              placeholder="claude-sonnet-5-5"
              required
              className="w-full min-h-[44px] sm:min-h-[40px] px-3 text-[16px] sm:text-[13px] rounded-lg outline-none"
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
          onChange={setAgentSystemValue}
          defaultPrompt={playbookDefaults.system}
          defaultName={playbookDefaults.name}
          onResetToDefaults={resetStudioDefaults}
        />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
          <div className="min-w-0">
            {agentFeedback && (
              <p
                className="text-[12px] font-medium"
                style={{
                  color: agentFeedback.ok ? "var(--label-green-text)" : "var(--label-red-text)",
                }}
              >
                {agentFeedback.msg}
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={savingAgent || !connection.hasAgentId}
            className="min-h-[44px] sm:min-h-[40px] px-4 rounded-lg text-[12px] font-semibold text-white cursor-pointer disabled:opacity-50"
            style={{ background: "var(--bg-banner)" }}
          >
            {savingAgent ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>
    </section>
  );
}

