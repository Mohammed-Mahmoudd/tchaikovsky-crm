"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, CalendarClock, FileText, Inbox, Sparkles } from "lucide-react";
import { useAuth } from "../AuthProvider";
import { useAgentCore, type FeedbackNotice } from "../../context/AgentWorkspaceContext";
import {
  FOLLOWUP_SKILL_TEMPLATES,
  type FollowUpAgentSettingsData,
  type FollowUpSection,
  type FollowUpStatusPayload,
  resolveFollowUpSection,
} from "../../utils/followupAgent";
import {
  AGENT_CACHE_KEYS,
  dedupeAgentRequest,
  readAgentMemorySnapshot,
  readFollowUpStatusCache,
  writeFollowUpStatusCache,
} from "../../utils/agentWorkspaceCache";
import { ClaudeSkillsPanel } from "../ClaudeSkillsPanel";
import { AgentWorkspaceError, AgentWorkspaceLoading } from "./AgentShellHelpers";
import { FollowUpPlaybookSection } from "./FollowUpPlaybookSection";
import { FollowUpQueueSection } from "./FollowUpQueueSection";
import { FollowUpRulesSection } from "./FollowUpRulesSection";
import { FollowUpSandboxModal } from "./FollowUpSandboxModal";

const SECTIONS: ReadonlyArray<{
  id: FollowUpSection;
  label: string;
  caption: string;
}> = [
  { id: "followups", label: "Follow-ups", caption: "Review drafts, assign leads & history" },
  { id: "instructions", label: "Instructions", caption: "Adham's role, tone & AI model" },
  { id: "skills", label: "Skills", caption: "Special situations & examples" },
  { id: "schedule", label: "Schedule", caption: "Timing, daily limit & channels" },
];

function renderSectionIcon(id: FollowUpSection) {
  const cls = "w-4 h-4 shrink-0";
  switch (id) {
    case "followups":
      return <Inbox className={cls} />;
    case "instructions":
      return <FileText className={cls} />;
    case "skills":
      return <BookOpen className={cls} />;
    case "schedule":
      return <CalendarClock className={cls} />;
  }
}

function resolveInitialStudioFields(data: FollowUpStatusPayload) {
  const live = data.platformAgent;
  const defaults = data.playbookDefaults;
  const resolvedModel = live?.model || defaults.model;
  const isListed = data.availableModels.some((m) => m.id === resolvedModel);
  return {
    name: live?.name || defaults.name,
    model: isListed ? resolvedModel : "__custom__",
    customModel: isListed ? "" : resolvedModel,
    system: live?.system || defaults.system,
  };
}

/**
 * Calm, non-technical Follow-up Agent workspace for the Chairman:
 * Follow-ups (Review, Contacted leads, History), Instructions, Skills, and Schedule.
 */
export function FollowUpAgentWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlSection = resolveFollowUpSection(searchParams.get("section"));

  const { authFetch } = useAuth();
  const { settingsDraft: admissionsSettings } = useAgentCore();

  const initialStatusSnapshot = readAgentMemorySnapshot<FollowUpStatusPayload>(
    AGENT_CACHE_KEYS.followupStatus
  );
  const initialStudioFields = initialStatusSnapshot
    ? resolveInitialStudioFields(initialStatusSnapshot)
    : null;

  const [section, setSection] = useState<FollowUpSection>(urlSection);
  const [statusData, setStatusData] = useState<FollowUpStatusPayload | null>(initialStatusSnapshot);
  const [settingsDraft, setSettingsDraft] = useState<FollowUpAgentSettingsData | null>(
    initialStatusSnapshot?.settings ?? null
  );
  const [loading, setLoading] = useState(!initialStatusSnapshot);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [agentName, setAgentName] = useState(initialStudioFields?.name ?? "");
  const [agentModel, setAgentModel] = useState(initialStudioFields?.model ?? "");
  const [customModel, setCustomModel] = useState(initialStudioFields?.customModel ?? "");
  const [agentSystem, setAgentSystem] = useState(initialStudioFields?.system ?? "");

  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsFeedback, setSettingsFeedback] = useState<FeedbackNotice | null>(null);
  const [savingAgent, setSavingAgent] = useState(false);
  const [agentFeedback, setAgentFeedback] = useState<FeedbackNotice | null>(null);
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [createFeedback, setCreateFeedback] = useState<FeedbackNotice | null>(null);

  const [activeSkillsCount, setActiveSkillsCount] = useState<number | null>(null);
  const [pendingDraftsCount, setPendingDraftsCount] = useState<number>(0);
  const [sandboxOpen, setSandboxOpen] = useState(false);

  const statusRef = useRef<FollowUpStatusPayload | null>(initialStatusSnapshot);
  const settingsDirtyRef = useRef(false);
  const studioDirtyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setSection(urlSection);
    });
    return () => {
      cancelled = true;
    };
  }, [urlSection]);

  const switchSection = useCallback(
    (next: FollowUpSection) => {
      setSection(next);
      router.replace(
        next === "followups" ? "/agent/follow-up" : `/agent/follow-up?section=${next}`,
        { scroll: false }
      );
    },
    [router]
  );

  const hydratePayload = useCallback(
    (data: FollowUpStatusPayload, respectDirty = true, { includePlatform = true } = {}) => {
      const merged: FollowUpStatusPayload =
        !includePlatform && !data.platformAgent && statusRef.current?.platformAgent
          ? {
              ...data,
              platformAgent: statusRef.current.platformAgent,
              platformError: statusRef.current.platformError,
            }
          : data;

      statusRef.current = merged;
      setStatusData(merged);
      writeFollowUpStatusCache(merged);

      if (!respectDirty || !settingsDirtyRef.current) {
        setSettingsDraft(merged.settings);
      }
      if (!respectDirty || !studioDirtyRef.current) {
        if (merged.platformAgent || !statusRef.current?.platformAgent) {
          const studio = resolveInitialStudioFields(merged);
          setAgentName(studio.name);
          setAgentModel(studio.model);
          setCustomModel(studio.customModel);
          setAgentSystem(studio.system);
        }
      }
    },
    []
  );

  const fetchStatus = useCallback(
    async ({
      silent = false,
      force = false,
      includePlatform,
    }: { silent?: boolean; force?: boolean; includePlatform?: boolean } = {}) => {
      const withPlatform = includePlatform ?? urlSection === "instructions";
      if (!silent && !statusRef.current) setLoading(true);
      setLoadError(null);
      try {
        const params = new URLSearchParams();
        if (!withPlatform) params.set("includePlatform", "0");
        if (force) params.set("refresh", "1");
        const qs = params.toString();
        const url = qs ? `/crm-api/followup-agent/status?${qs}` : "/crm-api/followup-agent/status";
        const load = async () => {
          const res = await authFetch(url, { cache: "no-store" });
          const json = await res.json().catch(() => null);
          return { ok: res.ok, json };
        };
        const result = force
          ? await load()
          : await dedupeAgentRequest(
              `followup_status_${withPlatform ? "full" : "fast"}`,
              load
            );
        if (!result.ok || !result.json?.success || !result.json.data) {
          if (!statusRef.current) {
            setLoadError("Could not load Follow-up settings. Please try again.");
          }
          return;
        }
        hydratePayload(result.json.data as FollowUpStatusPayload, true, {
          includePlatform: withPlatform,
        });
      } catch {
        if (!statusRef.current) {
          setLoadError("Network error while loading Follow-up settings.");
        }
      } finally {
        setLoading(false);
      }
    },
    [authFetch, hydratePayload, urlSection]
  );

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (!statusRef.current) {
        const cached = readFollowUpStatusCache();
        if (cached) {
          hydratePayload(cached, true, { includePlatform: true });
          setLoading(false);
        }
      }
      void fetchStatus({ silent: Boolean(statusRef.current) });
    });
    return () => {
      cancelled = true;
    };
  }, [fetchStatus, hydratePayload]);

  // Fetch Anthropic platformAgent lazily when navigating into Instructions if omitted by fast status load
  useEffect(() => {
    if (section !== "instructions") return;
    const current = statusRef.current;
    if (!current?.connection.hasAgentId || current.platformAgent) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        void fetchStatus({ silent: true, includePlatform: true });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fetchStatus, section]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleSettingsUpdated = () => {
      void fetchStatus({ silent: true, force: true });
    };
    window.addEventListener("crm:followup-settings-updated", handleSettingsUpdated);
    return () => {
      window.removeEventListener("crm:followup-settings-updated", handleSettingsUpdated);
    };
  }, [fetchStatus]);

  const updateSettingsDraft = useCallback(
    (updater: (prev: FollowUpAgentSettingsData) => FollowUpAgentSettingsData) => {
      settingsDirtyRef.current = true;
      setSettingsDraft((prev) => (prev ? updater(prev) : prev));
    },
    []
  );

  const saveSettings = useCallback(
    async (override?: Partial<FollowUpAgentSettingsData>) => {
      if (!settingsDraft || savingSettings) return;
      const previous = settingsDraft;
      setSavingSettings(true);
      setSettingsFeedback(null);
      const payload = {
        ...settingsDraft,
        ...override,
      };
      try {
        const res = await authFetch("/crm-api/followup-agent/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success || !json.data) {
          if (override) setSettingsDraft(previous);
          setSettingsFeedback({ ok: false, msg: json?.error || "Could not save schedule." });
          return;
        }
        settingsDirtyRef.current = false;
        setSettingsDraft(json.data);
        if (statusRef.current) {
          const nextStatus = { ...statusRef.current, settings: json.data };
          statusRef.current = nextStatus;
          setStatusData(nextStatus);
          writeFollowUpStatusCache(nextStatus);
        }
        setSettingsFeedback({ ok: true, msg: "Schedule saved." });
      } catch {
        if (override) setSettingsDraft(previous);
        setSettingsFeedback({ ok: false, msg: "Network error while saving schedule." });
      } finally {
        setSavingSettings(false);
      }
    },
    [authFetch, savingSettings, settingsDraft]
  );

  const handleToggleMaster = useCallback(async () => {
    if (!settingsDraft || savingSettings) return;
    const nextEnabled = !settingsDraft.enabled;
    setSettingsDraft({ ...settingsDraft, enabled: nextEnabled });
    await saveSettings({ enabled: nextEnabled });
  }, [saveSettings, savingSettings, settingsDraft]);

  const effectiveModel = agentModel === "__custom__" ? customModel.trim() : agentModel;

  const handleCreateAgent = useCallback(async () => {
    if (creatingAgent) return;
    setCreatingAgent(true);
    setCreateFeedback(null);
    setAgentFeedback(null);
    try {
      const res = await authFetch("/crm-api/followup-agent/agent/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: agentName.trim() || statusRef.current?.playbookDefaults.name,
          model: effectiveModel || statusRef.current?.playbookDefaults.model,
          system: agentSystem || statusRef.current?.playbookDefaults.system,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        const msg = json?.error || "Could not activate Follow-up Adham.";
        setCreateFeedback({ ok: false, msg });
        setAgentFeedback({ ok: false, msg });
        return;
      }
      const msg = "Follow-up Adham is activated and ready.";
      setCreateFeedback({ ok: true, msg });
      setAgentFeedback({ ok: true, msg });
      await fetchStatus({ silent: true, force: true });
    } catch {
      const msg = "Network error while activating Follow-up Adham.";
      setCreateFeedback({ ok: false, msg });
      setAgentFeedback({ ok: false, msg });
    } finally {
      setCreatingAgent(false);
    }
  }, [agentName, agentSystem, authFetch, creatingAgent, effectiveModel, fetchStatus]);

  const handleSaveAgent = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (savingAgent) return;
      setSavingAgent(true);
      setAgentFeedback(null);
      try {
        const res = await authFetch("/crm-api/followup-agent/agent", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: agentName.trim(),
            model: effectiveModel,
            system: agentSystem,
            syncTools: true,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          setAgentFeedback({ ok: false, msg: json?.error || "Could not save instructions." });
          return;
        }
        studioDirtyRef.current = false;
        if (statusRef.current) {
          const next = { ...statusRef.current, platformAgent: json.data, platformError: null };
          statusRef.current = next;
          setStatusData(next);
          writeFollowUpStatusCache(next);
        }
        setAgentFeedback({
          ok: true,
          msg: "Instructions and AI model saved.",
        });
      } catch {
        setAgentFeedback({ ok: false, msg: "Network error while saving instructions." });
      } finally {
        setSavingAgent(false);
      }
    },
    [agentName, agentSystem, authFetch, effectiveModel, savingAgent]
  );

  const handleSyncTools = useCallback(async (): Promise<boolean> => {
    try {
      const res = await authFetch("/crm-api/followup-agent/agent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncTools: true }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) return false;
      if (statusRef.current) {
        const next = { ...statusRef.current, platformAgent: json.data, platformError: null };
        statusRef.current = next;
        setStatusData(next);
      }
      return true;
    } catch {
      return false;
    }
  }, [authFetch]);

  if (loading && !statusData) {
    return <AgentWorkspaceLoading label="Loading Follow-up workspace" />;
  }

  if (loadError && (!statusData || !settingsDraft)) {
    return (
      <AgentWorkspaceError
        message={loadError}
        onRetry={() => void fetchStatus({ force: true })}
      />
    );
  }

  if (!statusData || !settingsDraft) {
    return <AgentWorkspaceLoading label="Loading Follow-up workspace" />;
  }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-[232px_minmax(0,1fr)] gap-5 items-start">
        {/* Mobile / Tablet Section Switcher */}
        <nav
          aria-label="Follow-up sections"
          className="lg:hidden flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1"
        >
          {SECTIONS.map((item) => {
            const active = section === item.id;
            const badge =
              item.id === "followups" && pendingDraftsCount > 0
                ? pendingDraftsCount
                : item.id === "skills"
                ? activeSkillsCount
                : null;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => switchSection(item.id)}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-lg text-[12px] font-semibold shrink-0 cursor-pointer transition-colors ${
                  active ? "text-white" : "hover:bg-[var(--bg-hover)]"
                }`}
                style={
                  active
                    ? { background: "var(--bg-banner)" }
                    : {
                        background: "var(--bg-card)",
                        border: "1px solid var(--border-input)",
                        color: "var(--text-secondary)",
                      }
                }
              >
                {renderSectionIcon(item.id)}
                <span>{item.label}</span>
                {badge !== null && (
                  <span
                    className="px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums"
                    style={
                      active
                        ? { background: "var(--bg-card)", color: "var(--text-primary)" }
                        : { background: "var(--bg-pill)", color: "var(--text-secondary)" }
                    }
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setSandboxOpen(true)}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-lg text-[12px] font-semibold shrink-0 cursor-pointer"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-input)",
              color: "var(--text-primary)",
            }}
          >
            <Sparkles className="w-4 h-4" style={{ color: "var(--bg-banner)" }} />
            <span>Preview a reply</span>
          </button>
        </nav>

        {/* Desktop Sticky Section Rail */}
        <aside
          aria-label="Follow-up sections"
          className="hidden lg:block sticky top-4 rounded-xl p-2 space-y-1"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-main)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          {SECTIONS.map((item) => {
            const active = section === item.id;
            const badge =
              item.id === "followups" && pendingDraftsCount > 0
                ? pendingDraftsCount
                : item.id === "skills"
                ? activeSkillsCount
                : null;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => switchSection(item.id)}
                aria-current={active ? "page" : undefined}
                className={`w-full flex items-start justify-between gap-2 px-3 py-2.5 rounded-lg text-left transition-colors cursor-pointer ${
                  active ? "" : "hover:bg-[var(--bg-hover)]"
                }`}
                style={
                  active
                    ? { background: "var(--bg-selected)", color: "var(--text-primary)" }
                    : { color: "var(--text-secondary)" }
                }
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <span
                    className="mt-0.5 shrink-0"
                    style={{ color: active ? "var(--bg-banner)" : "var(--text-muted)" }}
                  >
                    {renderSectionIcon(item.id)}
                  </span>
                  <div className="min-w-0">
                    <p
                      className={`text-[12.5px] truncate ${
                        active ? "font-semibold" : "font-medium"
                      }`}
                      style={{ color: active ? "var(--text-primary)" : "var(--text-secondary)" }}
                    >
                      {item.label}
                    </p>
                    <p className="text-[10.5px] truncate mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {item.caption}
                    </p>
                  </div>
                </div>
                {badge !== null && (
                  <span
                    className="px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums shrink-0 mt-0.5"
                    style={{
                      background: active ? "var(--bg-card)" : "var(--bg-pill)",
                      color: active ? "var(--label-blue-text)" : "var(--text-secondary)",
                      border: "1px solid var(--border-main)",
                    }}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}

          <div className="pt-2 mt-2 space-y-2 px-1 pb-1" style={{ borderTop: "1px solid var(--border-main)" }}>
            <button
              type="button"
              onClick={() => setSandboxOpen(true)}
              className="w-full inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3 rounded-lg text-[12px] font-semibold cursor-pointer hover:bg-[var(--bg-hover)]"
              style={{
                background: "var(--bg-panel)",
                border: "1px solid var(--border-input)",
                color: "var(--text-primary)",
              }}
            >
              <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--bg-banner)" }} />
              <span>Preview a reply</span>
            </button>
          </div>
        </aside>

        {/* Active Section */}
        <div className="min-w-0">
          {section === "followups" && (
            <FollowUpQueueSection
              statusData={statusData}
              settingsDraft={settingsDraft}
              savingSettings={savingSettings}
              creatingAgent={creatingAgent}
              createFeedback={createFeedback}
              onToggleMaster={handleToggleMaster}
              onCreateAgent={handleCreateAgent}
              onDraftCountChange={setPendingDraftsCount}
            />
          )}

          {section === "instructions" && (
            <FollowUpPlaybookSection
              statusData={statusData}
              agentName={agentName}
              onAgentNameChange={(v) => {
                studioDirtyRef.current = true;
                setAgentName(v);
              }}
              agentModel={agentModel}
              onAgentModelChange={(v) => {
                studioDirtyRef.current = true;
                setAgentModel(v);
              }}
              customModel={customModel}
              onCustomModelChange={(v) => {
                studioDirtyRef.current = true;
                setCustomModel(v);
              }}
              agentSystem={agentSystem}
              onAgentSystemChange={(v) => {
                studioDirtyRef.current = true;
                setAgentSystem(v);
              }}
              onResetDefaults={(name, sys) => {
                studioDirtyRef.current = true;
                setAgentName(name);
                setAgentSystem(sys);
              }}
              savingAgent={savingAgent}
              creatingAgent={creatingAgent}
              agentFeedback={agentFeedback}
              onSaveAgent={(e) => void handleSaveAgent(e)}
              onCreateAgent={() => void handleCreateAgent()}
              onOpenSandbox={() => setSandboxOpen(true)}
            />
          )}

          {section === "skills" && (
            <ClaudeSkillsPanel
              platformAgent={statusData.platformAgent}
              hasAgentId={Boolean(statusData.connection.hasAgentId)}
              onSyncTools={handleSyncTools}
              onCountChange={(activeCount) => setActiveSkillsCount(activeCount)}
              apiBasePath="/crm-api/followup-agent"
              cacheKey="crm_followup_skills_v1"
              templates={FOLLOWUP_SKILL_TEMPLATES}
              headingTitle="Follow-up Skills"
              headingSubtitle="Teach Adham how to handle specific follow-up situations with clear rules and example replies."
              agentDisplayName="Adham"
              sseEventName="crm:followup-skills-updated"
              simpleMode
            />
          )}

          {section === "schedule" && (
            <FollowUpRulesSection
              settingsDraft={settingsDraft}
              onUpdateDraft={updateSettingsDraft}
              savingSettings={savingSettings}
              settingsFeedback={settingsFeedback}
              onSaveSettings={() => saveSettings()}
            />
          )}
        </div>
      </div>

      <FollowUpSandboxModal
        isOpen={sandboxOpen}
        onClose={() => setSandboxOpen(false)}
        hasAgentId={Boolean(statusData.connection.hasAgentId)}
        agentName={agentName || statusData.playbookDefaults.name}
        branches={admissionsSettings?.branches ?? []}
      />
    </>
  );
}
