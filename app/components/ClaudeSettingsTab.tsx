"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Layers,
  MessageSquare,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { useAuth } from "./AuthProvider";
import { useCRM } from "../context/CRMContext";
import {
  type ClaudeBranchConfig,
  type ClaudeLeadRow,
  type ClaudeSandboxTurnResult,
  type ClaudeSettingsData,
  type ClaudeStatusPayload,
  type ClaudeSubTab,
  formatClosedDatesInput,
  formatSlotListInput,
  getHashForClaudeSubTab,
  getLeadClaudeStatusMeta,
  mergeAssignedClaudeLeads,
  parseClosedDatesInput,
  parseSlotListInput,
  resolveClaudeSubTabFromHash,
  summarizeClaudeLeadCounts,
} from "../utils/claudeAgent";
import { buildLabelNameMap, matchLeadSearch } from "../utils/search";
import { formatLastMessageTime } from "../utils/time";
import { ClaudeSettingSwitch, ClaudeStatusPill } from "./ClaudeUiPrimitives";
import { ClaudeSandboxPanel, type SandboxMessage } from "./ClaudeSandboxPanel";
import { ClaudeActivityPanel } from "./ClaudeActivityPanel";
import { ClaudeSkillsPanel } from "./ClaudeSkillsPanel";
import { ClaudePromptEditor } from "./ClaudePromptEditor";

function BranchSlotDraftRow({
  branch,
  index,
  expanded,
  onToggleExpand,
  onChange,
  onRemove,
}: {
  branch: ClaudeBranchConfig;
  index: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onChange: (next: ClaudeBranchConfig) => void;
  onRemove: () => void;
}) {
  const [weekdayRaw, setWeekdayRaw] = useState(() => formatSlotListInput(branch.weekdaySlots));
  const [weekendRaw, setWeekendRaw] = useState(() => formatSlotListInput(branch.weekendSlots));
  const [closedRaw, setClosedRaw] = useState(() => formatClosedDatesInput(branch.closedDates));
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--border-main)",
      }}
    >
      <div className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer py-1"
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 shrink-0" style={{ color: "var(--text-secondary)" }} />
          ) : (
            <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "var(--text-secondary)" }} />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[12.5px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                {branch.displayName || branch.branchName || `Branch ${index + 1}`}
              </span>
              {branch.city && (
                <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  · {branch.city}
                </span>
              )}
              <ClaudeStatusPill
                label={branch.active ? "Active" : "Inactive"}
                tone={branch.active ? "green" : "slate"}
              />
            </div>
            <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--text-secondary)" }}>
              Manager: {branch.schoolManagerName || "Not set"} · Weekday {branch.weekdaySlots.length} slots · Weekend{" "}
              {branch.weekendSlots.length} slots
            </p>
          </div>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <label className="inline-flex items-center gap-1.5 text-[11px] cursor-pointer" style={{ color: "var(--text-secondary)" }}>
            <input
              type="checkbox"
              checked={branch.active !== false}
              onChange={(e) => onChange({ ...branch, active: e.target.checked })}
              className="w-4 h-4 accent-[var(--bg-banner)] cursor-pointer"
            />
            Active
          </label>
          {!confirmRemove ? (
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              aria-label={`Remove ${branch.displayName || "branch"}`}
              className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-md text-[11px] font-medium cursor-pointer"
              style={{ color: "var(--label-red-text)" }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onRemove}
                className="min-h-[34px] px-2.5 rounded-md text-[11px] font-semibold cursor-pointer"
                style={{
                  background: "var(--label-red-bg)",
                  border: "1px solid var(--label-red-border)",
                  color: "var(--label-red-text)",
                }}
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirmRemove(false)}
                className="min-h-[34px] px-2 rounded-md text-[11px] cursor-pointer"
                style={{ color: "var(--text-secondary)" }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <div
          className="p-3.5 space-y-3"
          style={{ borderTop: "1px solid var(--border-main)", background: "var(--bg-card)" }}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                City
              </label>
              <input
                type="text"
                value={branch.city}
                onChange={(e) => onChange({ ...branch, city: e.target.value })}
                placeholder="Riyadh"
                className="w-full min-h-[38px] px-2.5 text-[16px] sm:text-[12px] rounded-md outline-none"
                style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)", color: "var(--text-primary)" }}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                CRM branch name
              </label>
              <input
                type="text"
                value={branch.branchName}
                onChange={(e) => onChange({ ...branch, branchName: e.target.value })}
                placeholder="Riyadh Park Mall (Riyadh)"
                className="w-full min-h-[38px] px-2.5 text-[16px] sm:text-[12px] rounded-md outline-none"
                style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)", color: "var(--text-primary)" }}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                Display name (sent to leads)
              </label>
              <input
                type="text"
                value={branch.displayName}
                onChange={(e) => onChange({ ...branch, displayName: e.target.value })}
                placeholder="Riyadh Park Mall"
                className="w-full min-h-[38px] px-2.5 text-[16px] sm:text-[12px] rounded-md outline-none"
                style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)", color: "var(--text-primary)" }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                School manager name
              </label>
              <input
                type="text"
                value={branch.schoolManagerName}
                onChange={(e) => onChange({ ...branch, schoolManagerName: e.target.value })}
                placeholder="Branch school manager"
                className="w-full min-h-[38px] px-2.5 text-[16px] sm:text-[12px] rounded-md outline-none"
                style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)", color: "var(--text-primary)" }}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                Floor / landmark
              </label>
              <input
                type="text"
                value={branch.landmark}
                onChange={(e) => onChange({ ...branch, landmark: e.target.value })}
                placeholder="2nd floor, inside SPACES, above Gate 1"
                className="w-full min-h-[38px] px-2.5 text-[16px] sm:text-[12px] rounded-md outline-none"
                style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)", color: "var(--text-primary)" }}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                Google Maps URL
              </label>
              <input
                type="url"
                value={branch.mapUrl}
                onChange={(e) => onChange({ ...branch, mapUrl: e.target.value })}
                placeholder="https://maps.google.com/..."
                className="w-full min-h-[38px] px-2.5 text-[16px] sm:text-[12px] rounded-md outline-none"
                style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)", color: "var(--text-primary)" }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                Weekday slots (Sun–Thu)
              </label>
              <input
                type="text"
                value={weekdayRaw}
                onChange={(e) => {
                  setWeekdayRaw(e.target.value);
                  onChange({ ...branch, weekdaySlots: parseSlotListInput(e.target.value) });
                }}
                placeholder="05:30 PM, 06:30 PM, 07:30 PM"
                className="w-full min-h-[38px] px-2.5 text-[16px] sm:text-[12px] rounded-md outline-none"
                style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)", color: "var(--text-primary)" }}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                Weekend slots (Fri–Sat)
              </label>
              <input
                type="text"
                value={weekendRaw}
                onChange={(e) => {
                  setWeekendRaw(e.target.value);
                  onChange({ ...branch, weekendSlots: parseSlotListInput(e.target.value) });
                }}
                placeholder="11:00 AM, 12:00 PM, 05:00 PM"
                className="w-full min-h-[38px] px-2.5 text-[16px] sm:text-[12px] rounded-md outline-none"
                style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)", color: "var(--text-primary)" }}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                Closed dates (YYYY-MM-DD)
              </label>
              <input
                type="text"
                value={closedRaw}
                onChange={(e) => {
                  setClosedRaw(e.target.value);
                  onChange({ ...branch, closedDates: parseClosedDatesInput(e.target.value) });
                }}
                placeholder="2026-11-21, 2026-11-28"
                className="w-full min-h-[38px] px-2.5 text-[16px] sm:text-[12px] rounded-md outline-none"
                style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)", color: "var(--text-primary)" }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ClaudeSettingsTab({
  onOpenLeadChat,
}: {
  onOpenLeadChat?: (senderId: string) => void;
} = {}) {
  const { authFetch } = useAuth();
  const { conversations, labels, openChat, updateConversationClaude } = useCRM();

  const [subTab, setSubTab] = useState<ClaudeSubTab>(() =>
    typeof window !== "undefined" ? resolveClaudeSubTabFromHash(window.location.hash) : "overview"
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusData, setStatusData] = useState<ClaudeStatusPayload | null>(null);

  // Editable Settings state
  const [settingsDraft, setSettingsDraft] = useState<ClaudeSettingsData | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsFeedback, setSettingsFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [savingBranches, setSavingBranches] = useState(false);
  const [branchesFeedback, setBranchesFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [expandedBranchKeys, setExpandedBranchKeys] = useState<Set<string>>(() => new Set());

  // Editable Agent Studio state (two-way synced with platform.claude.com)
  const [agentName, setAgentName] = useState("");
  const [agentModel, setAgentModel] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [agentSystem, setAgentSystem] = useState("");
  const [savingAgent, setSavingAgent] = useState(false);
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [createFeedback, setCreateFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [agentFeedback, setAgentFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  // Sandbox Test Chat state
  const [sandboxSessionId, setSandboxSessionId] = useState<string | null>(null);
  const [sandboxMessages, setSandboxMessages] = useState<SandboxMessage[]>([]);
  const [sandboxInput, setSandboxInput] = useState("");
  const [sandboxSending, setSandboxSending] = useState(false);
  const [sandboxError, setSandboxError] = useState<string | null>(null);
  const [mockLeadName, setMockLeadName] = useState("Noura");
  const [mockChannel, setMockChannel] = useState<"WA" | "FB" | "IG">("WA");
  const [mockBranch, setMockBranch] = useState("");
  const [mockCampaign, setMockCampaign] = useState("");
  const [mockExistingStudent, setMockExistingStudent] = useState(false);
  const nextMsgSeqRef = useRef(1);

  // Lead Control Board state
  const [leads, setLeads] = useState<ClaudeLeadRow[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [leadFilter, setLeadFilter] = useState<"all" | "active" | "paused" | "errors">("all");
  const [leadSearchQuery, setLeadSearchQuery] = useState("");
  const [leadBusyId, setLeadBusyId] = useState<string | null>(null);

  // Keep subTab synced if hash changes via Back/Forward navigation
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onHash = () => {
      const h = window.location.hash.toLowerCase();
      if (h === "#claude" || h.startsWith("#claude-")) {
        setSubTab(resolveClaudeSubTabFromHash(h));
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const handleSelectSubTab = useCallback((nextTab: ClaudeSubTab) => {
    setSubTab(nextTab);
    if (typeof window !== "undefined") {
      window.location.hash = getHashForClaudeSubTab(nextTab);
    }
  }, []);

  const hydrateFromPayload = useCallback((data: ClaudeStatusPayload) => {
    setStatusData(data);
    setSettingsDraft(data.settings);
    const live = data.platformAgent;
    const defaults = data.playbookDefaults;
    const resolvedModel = live?.model || defaults.model;
    const isListedModel = data.availableModels.some((m) => m.id === resolvedModel);
    setAgentName(live?.name || defaults.name);
    setAgentModel(isListedModel ? resolvedModel : "__custom__");
    setCustomModel(isListedModel ? "" : resolvedModel);
    setAgentSystem(live?.system || defaults.system);
  }, []);

  const fetchStatus = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setLoadError(null);
      try {
        const res = await authFetch("/crm-api/claude/status", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success || !json.data) {
          if (!silent) {
            setLoadError(json?.error || "Could not load Claude configuration.");
          }
          return;
        }
        hydrateFromPayload(json.data);
      } catch {
        if (!silent) {
          setLoadError("Network error while loading Claude configuration.");
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [authFetch, hydrateFromPayload]
  );

  const fetchClaudeLeads = useCallback(async () => {
    setLoadingLeads(true);
    try {
      const res = await authFetch("/crm-api/claude/leads", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success && Array.isArray(json.data)) {
        setLeads(json.data);
      }
    } catch {
      // Keep previous list on transient failure
    } finally {
      setLoadingLeads(false);
    }
  }, [authFetch]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      void fetchStatus();
      void fetchClaudeLeads();
    });
    return () => {
      cancelled = true;
    };
  }, [fetchStatus, fetchClaudeLeads]);

  const effectiveModel = agentModel === "__custom__" ? customModel.trim() : agentModel;

  const saveGlobalSettings = async (overrideDraft?: Partial<ClaudeSettingsData>) => {
    if (!settingsDraft) return;
    setSavingSettings(true);
    setSettingsFeedback(null);
    const payload = {
      enabled: overrideDraft?.enabled ?? settingsDraft.enabled,
      pauseOnHumanReply: overrideDraft?.pauseOnHumanReply ?? settingsDraft.pauseOnHumanReply,
      allowAutoBooking: overrideDraft?.allowAutoBooking ?? settingsDraft.allowAutoBooking,
      allowLeadUpdates: overrideDraft?.allowLeadUpdates ?? settingsDraft.allowLeadUpdates,
      allowWhatsAppEscalation:
        overrideDraft?.allowWhatsAppEscalation ?? settingsDraft.allowWhatsAppEscalation,
      escalationPhone: overrideDraft?.escalationPhone ?? settingsDraft.escalationPhone,
      existingStudentLabelName:
        overrideDraft?.existingStudentLabelName ?? settingsDraft.existingStudentLabelName,
    };
    try {
      const res = await authFetch("/crm-api/claude/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setSettingsFeedback({ ok: false, msg: json?.error || "Could not save controls." });
        return;
      }
      setSettingsDraft(json.data);
      setSettingsFeedback({ ok: true, msg: "Controls saved." });
    } catch {
      setSettingsFeedback({ ok: false, msg: "Network error while saving controls." });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleToggleMaster = async () => {
    if (!settingsDraft || savingSettings) return;
    const nextEnabled = !settingsDraft.enabled;
    setSettingsDraft({ ...settingsDraft, enabled: nextEnabled });
    await saveGlobalSettings({ enabled: nextEnabled });
  };

  const handleSaveBranches = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsDraft || savingBranches) return;
    setSavingBranches(true);
    setBranchesFeedback(null);
    try {
      const res = await authFetch("/crm-api/claude/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branches: settingsDraft.branches }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setBranchesFeedback({ ok: false, msg: json?.error || "Could not save branch rules." });
        return;
      }
      setSettingsDraft(json.data);
      setBranchesFeedback({ ok: true, msg: "Branch map pins, school managers, and slots saved." });
    } catch {
      setBranchesFeedback({ ok: false, msg: "Network error while saving branch rules." });
    } finally {
      setSavingBranches(false);
    }
  };

  const handleSaveAgentToPlatform = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingAgent) return;
    setSavingAgent(true);
    setAgentFeedback(null);
    try {
      const res = await authFetch("/crm-api/claude/agent", {
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
        setAgentFeedback({ ok: false, msg: json?.error || "Could not sync to Claude Platform." });
        return;
      }
      setStatusData((prev) => (prev ? { ...prev, platformAgent: json.data, platformError: null } : prev));
      setAgentFeedback({
        ok: true,
        msg: `Synced to platform.claude.com (version ${json.data.version}) with CRM tools attached.`,
      });
    } catch {
      setAgentFeedback({ ok: false, msg: "Network error while syncing agent." });
    } finally {
      setSavingAgent(false);
    }
  };

  const handleSyncToolsOnly = async (): Promise<boolean> => {
    try {
      const res = await authFetch("/crm-api/claude/agent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncTools: true }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) return false;
      setStatusData((prev) => (prev ? { ...prev, platformAgent: json.data, platformError: null } : prev));
      return true;
    } catch {
      return false;
    }
  };

  const handleCreateAgentOnPlatform = async () => {
    if (creatingAgent) return;
    setCreatingAgent(true);
    setCreateFeedback(null);
    setAgentFeedback(null);
    try {
      const res = await authFetch("/crm-api/claude/agent/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: agentName.trim() || statusData?.playbookDefaults.name,
          model: effectiveModel || statusData?.playbookDefaults.model,
          system: agentSystem || statusData?.playbookDefaults.system,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        const errMsg = json?.error || `Could not create agent (HTTP ${res.status}).`;
        setCreateFeedback({ ok: false, msg: errMsg });
        setAgentFeedback({ ok: false, msg: errMsg });
        return;
      }
      const okMsg = `Created agent ${json.data.id} on platform.claude.com. Add CLAUDE_AGENT_ID=${json.data.id} to meta-webhook-server/.env.`;
      setCreateFeedback({ ok: true, msg: okMsg });
      setAgentFeedback({ ok: true, msg: okMsg });
      await fetchStatus(true);
    } catch {
      const netMsg = "Network error while creating agent.";
      setCreateFeedback({ ok: false, msg: netMsg });
      setAgentFeedback({ ok: false, msg: netMsg });
    } finally {
      setCreatingAgent(false);
    }
  };

  const handleSendSandbox = async (presetText?: string) => {
    const text = (presetText ?? sandboxInput).trim();
    if (!text || sandboxSending) return;
    if (!presetText) setSandboxInput("");
    setSandboxError(null);
    setSandboxSending(true);

    const userMsg: SandboxMessage = {
      id: `sbx_u_${nextMsgSeqRef.current++}`,
      role: "lead",
      text,
    };
    setSandboxMessages((prev) => [...prev, userMsg]);

    try {
      const res = await authFetch("/crm-api/claude/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          sandboxSessionId,
          mockLead: {
            name: mockLeadName.trim() || "Sara",
            channel: mockChannel,
            branch: mockBranch,
            adCampaign: mockCampaign.trim(),
            isExistingStudent: mockExistingStudent,
          },
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success || !json.data) {
        setSandboxError(json?.error || "Sandbox turn failed.");
        return;
      }
      const data: ClaudeSandboxTurnResult = json.data;
      setSandboxSessionId(data.sessionId);
      setSandboxMessages((prev) => [
        ...prev,
        {
          id: `sbx_a_${nextMsgSeqRef.current++}`,
          role: "adham",
          text: data.silentNoReply
            ? "(No reply sent to lead — silent CRM handling triggered)"
            : data.reply || "(Empty response)",
          silentNoReply: data.silentNoReply,
          toolTraces: data.toolTraces || [],
        },
      ]);
    } catch {
      setSandboxError("Network error during sandbox test.");
    } finally {
      setSandboxSending(false);
    }
  };

  const handleResetSandbox = () => {
    setSandboxSessionId(null);
    setSandboxMessages([]);
    setSandboxError(null);
  };

  const handleLeadBoardAction = async (
    senderId: string,
    payload: { claudeEnabled?: boolean; claudePaused?: boolean; resetSession?: boolean }
  ) => {
    if (leadBusyId) return;
    setLeadBusyId(senderId);
    const shouldTrigger = payload.claudeEnabled === true || payload.claudePaused === false;
    const res = await updateConversationClaude(senderId, {
      ...payload,
      ...(shouldTrigger ? { triggerReply: true } : {}),
    });
    setLeadBusyId(null);
    if (res.ok) {
      await fetchClaudeLeads();
    }
  };

  const labelNameMap = useMemo(() => buildLabelNameMap(labels), [labels]);

  // Merge DB /leads list with live CRMContext state so assignments made on /claude-leads show immediately
  const mergedAssignedLeads = useMemo(
    () => mergeAssignedClaudeLeads(leads, conversations),
    [leads, conversations]
  );

  const leadCounts = useMemo(
    () => summarizeClaudeLeadCounts(mergedAssignedLeads),
    [mergedAssignedLeads]
  );

  const filteredLeads = useMemo(() => {
    const cleanQ = leadSearchQuery.trim();
    return mergedAssignedLeads.filter((l) => {
      if (leadFilter === "active" && !(l.claudeEnabled && !l.claudePaused)) return false;
      if (leadFilter === "paused" && !(l.claudeEnabled && l.claudePaused)) return false;
      if (leadFilter === "errors" && !(l.claudeLastError && l.claudeLastError.trim())) return false;
      if (cleanQ) {
        return matchLeadSearch(
          {
            id: l.senderId,
            name: l.name,
            leadName: l.leadName,
            phone: l.phone,
            channel: l.channel,
          },
          cleanQ,
          labelNameMap
        );
      }
      return true;
    });
  }, [mergedAssignedLeads, leadFilter, leadSearchQuery, labelNameMap]);

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading Claude settings">
        {[1, 2, 3].map((k) => (
          <div
            key={k}
            className="rounded-xl p-5 animate-pulse space-y-3"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)" }}
          >
            <div className="h-4 w-48 rounded" style={{ background: "var(--bg-column)" }} />
            <div className="h-3 w-full max-w-md rounded" style={{ background: "var(--bg-column)" }} />
            <div className="h-10 w-full rounded" style={{ background: "var(--bg-column)" }} />
          </div>
        ))}
      </div>
    );
  }

  if (loadError || !statusData || !settingsDraft) {
    return (
      <div
        className="rounded-xl p-5 space-y-3"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)" }}
      >
        <div className="flex items-start gap-2" style={{ color: "var(--label-red-text)" }}>
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="text-[13px] font-medium">{loadError || "Could not load Claude settings."}</p>
        </div>
        <button
          type="button"
          onClick={() => void fetchStatus()}
          className="min-h-[40px] px-4 rounded-lg text-[12px] font-semibold text-white cursor-pointer"
          style={{ background: "var(--bg-banner)" }}
        >
          Retry
        </button>
      </div>
    );
  }

  const { connection, platformAgent, platformError, availableModels, playbookDefaults } = statusData;
  const activeModelOption = availableModels.find((m) => m.id === effectiveModel);

  const subNavItems: ReadonlyArray<{
    id: ClaudeSubTab;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }> = [
    { id: "overview", label: "Overview & Rules", icon: <ShieldCheck className="w-3.5 h-3.5" /> },
    { id: "activity", label: "Activity", icon: <Activity className="w-3.5 h-3.5" /> },
    { id: "skills", label: "Skills", icon: <BookOpen className="w-3.5 h-3.5" /> },
    { id: "sandbox", label: "Test Sandbox", icon: <Sparkles className="w-3.5 h-3.5" /> },
    {
      id: "leads",
      label: "Assigned Leads",
      icon: <Users className="w-3.5 h-3.5" />,
      badge: leadCounts.totalAssigned,
    },
    { id: "studio", label: "Prompt & Branches", icon: <Layers className="w-3.5 h-3.5" /> },
  ];

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

  return (
    <div className="space-y-4">
      {/* ── Top Sub-Navigation Bar (Directly under Settings Main Tabs) ──────── */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <nav aria-label="Claude workspace sections" className="flex flex-wrap items-center gap-1.5">
          {subNavItems.map((item) => {
            const active = subTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectSubTab(item.id)}
                className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-[38px] px-3.5 rounded-lg text-[12px] font-semibold transition-colors cursor-pointer"
                style={
                  active
                    ? { background: "var(--bg-banner)", color: "#fff" }
                    : {
                        background: "var(--bg-card)",
                        border: "1px solid var(--border-input)",
                        color: "var(--text-secondary)",
                      }
                }
              >
                {item.icon}
                <span>{item.label}</span>
                {item.badge !== undefined && (
                  <span
                    className="px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums"
                    style={
                      active
                        ? { background: "var(--bg-card)", color: "var(--bg-banner)" }
                        : { background: "var(--bg-pill)", color: "var(--text-primary)" }
                    }
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <ClaudeStatusPill
            label={settingsDraft.enabled ? "Auto-Reply ON" : "Auto-Reply OFF"}
            tone={settingsDraft.enabled ? "green" : "amber"}
          />
          {subTab !== "overview" && (
            <button
              type="button"
              disabled={savingSettings}
              onClick={handleToggleMaster}
              className="min-h-[34px] px-3 rounded-lg text-[11px] font-semibold cursor-pointer disabled:opacity-50"
              style={{
                background: settingsDraft.enabled ? "var(--bg-card)" : "var(--bg-banner)",
                border: settingsDraft.enabled ? "1px solid var(--border-input)" : "none",
                color: settingsDraft.enabled ? "var(--text-primary)" : "#fff",
              }}
            >
              {settingsDraft.enabled ? "Turn OFF" : "Turn ON"}
            </button>
          )}
        </div>
      </div>

      {/* ── SUB-TAB 1: Chairman-Friendly Overview & Rules ──────────────────── */}
      {subTab === "overview" && (
        <div className="space-y-4">
          {/* Card 1: Adham AI Assistant Status, Master Switch & 3 Key Numbers */}
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
                </div>
                <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  Replies to assigned leads automatically and books Free Discovery Sessions with branch school managers.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Link
                  href="/claude-leads"
                  className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 rounded-lg text-[12px] font-semibold text-white"
                  style={{ background: "var(--bg-banner)" }}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Assign Leads</span>
                </Link>
                <button
                  type="button"
                  onClick={() => handleSelectSubTab("sandbox")}
                  className="inline-flex items-center gap-1.5 min-h-[38px] px-3 rounded-lg text-[12px] font-medium cursor-pointer"
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-input)",
                    color: "var(--text-primary)",
                  }}
                >
                  <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--bg-banner)" }} />
                  <span>Test Adham</span>
                </button>
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
                  onClick={handleCreateAgentOnPlatform}
                  className="min-h-[40px] px-4 rounded-lg text-[12px] font-semibold text-white shrink-0 cursor-pointer disabled:opacity-50"
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
                onToggle={handleToggleMaster}
              />
            </div>

            {/* 3 Simple Executive Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {[
                {
                  label: "Assigned Leads",
                  value: leadCounts.totalAssigned,
                  tone: "var(--label-blue-text)",
                },
                {
                  label: "Active Conversations",
                  value: leadCounts.activeCount,
                  tone: "var(--label-green-text)",
                },
                {
                  label: "Paused / Needs Attention",
                  value: leadCounts.pausedCount + leadCounts.errorCount,
                  tone: "var(--label-amber-text)",
                },
              ].map((kpi) => (
                <button
                  key={kpi.label}
                  type="button"
                  onClick={() => handleSelectSubTab("leads")}
                  className="rounded-lg px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--bg-hover)] cursor-pointer"
                  style={{
                    background: "var(--bg-panel)",
                    border: "1px solid var(--border-main)",
                  }}
                >
                  <p className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
                    {kpi.label}
                  </p>
                  <p className="text-[19px] font-bold mt-0.5 tabular-nums" style={{ color: kpi.tone }}>
                    {kpi.value}
                  </p>
                </button>
              ))}
            </div>
          </section>

          {/* Card 2: Plain-English Guardrails & Handoff Rules */}
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
                Rules & Guardrails
              </h3>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                Control how Adham works alongside your admission officers.
              </p>
            </div>

            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p id="claude-pause-human-label" className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
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
                    setSettingsDraft({
                      ...settingsDraft,
                      pauseOnHumanReply: !settingsDraft.pauseOnHumanReply,
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p id="claude-book-label" className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
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
                    setSettingsDraft({
                      ...settingsDraft,
                      allowAutoBooking: !settingsDraft.allowAutoBooking,
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p id="claude-update-lead-label" className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
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
                    setSettingsDraft({
                      ...settingsDraft,
                      allowLeadUpdates: !settingsDraft.allowLeadUpdates,
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p id="claude-wa-escalation-label" className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
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
                    setSettingsDraft({
                      ...settingsDraft,
                      allowWhatsAppEscalation: !settingsDraft.allowWhatsAppEscalation,
                    })
                  }
                />
              </div>

              {settingsDraft.allowWhatsAppEscalation && (
                <div className="pt-1">
                  <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                    WhatsApp number for escalation alerts
                  </label>
                  <input
                    type="tel"
                    value={settingsDraft.escalationPhone}
                    onChange={(e) =>
                      setSettingsDraft({ ...settingsDraft, escalationPhone: e.target.value })
                    }
                    placeholder="+20 100 418 9200"
                    className="w-full max-w-sm min-h-[40px] px-3 text-[16px] sm:text-[13px] rounded-lg outline-none"
                    style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)", color: "var(--text-primary)" }}
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
                  className="min-h-[40px] px-4 rounded-lg text-[12px] font-semibold text-white cursor-pointer disabled:opacity-50"
                  style={{ background: "var(--bg-banner)" }}
                >
                  {savingSettings ? "Saving..." : "Save rules"}
                </button>
              </div>
            </div>
          </section>

          {/* Collapsed Technical & Connection Details (hidden by default for Chairman clarity) */}
          <details
            className="rounded-xl overflow-hidden text-[12px]"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-main)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <summary
              className="px-4 sm:px-5 py-3 cursor-pointer flex items-center justify-between gap-2 font-medium select-none hover:bg-[var(--bg-hover)]"
              style={{ color: "var(--text-secondary)" }}
            >
              <span>Technical & connection details</span>
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Internal IDs, label name & Claude console link
              </span>
            </summary>
            <div
              className="px-4 sm:px-5 py-4 space-y-3"
              style={{ borderTop: "1px solid var(--border-main)", background: "var(--bg-panel)" }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <ClaudeStatusPill
                  label={connection.hasApiKey ? "ANTHROPIC_API_KEY ready" : "API key missing"}
                  tone={connection.hasApiKey ? "green" : "red"}
                />
                {connection.agentId && (
                  <ClaudeStatusPill label={`Agent: ${connection.agentId}`} tone="blue" />
                )}
                {platformAgent && <ClaudeStatusPill label={`v${platformAgent.version}`} tone="slate" />}
                {connection.dryRun && (
                  <ClaudeStatusPill label="MESSAGING_DRY_RUN ON" tone="amber" />
                )}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div className="flex-1 max-w-sm">
                  <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                    Silent existing-student CRM label
                  </label>
                  <input
                    type="text"
                    value={settingsDraft.existingStudentLabelName}
                    onChange={(e) =>
                      setSettingsDraft({
                        ...settingsDraft,
                        existingStudentLabelName: e.target.value,
                      })
                    }
                    placeholder="Existing student"
                    className="w-full min-h-[38px] px-3 text-[16px] sm:text-[12px] rounded-lg outline-none"
                    style={{ background: "var(--bg-card)", border: "1px solid var(--border-input)", color: "var(--text-primary)" }}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={savingSettings}
                    onClick={() => void saveGlobalSettings()}
                    className="min-h-[38px] px-3.5 rounded-lg text-[11.5px] font-semibold text-white cursor-pointer disabled:opacity-50"
                    style={{ background: "var(--bg-banner)" }}
                  >
                    Save label
                  </button>
                  <a
                    href="https://platform.claude.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 min-h-[38px] px-3 rounded-lg text-[11.5px] font-medium"
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-input)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <span>Open Claude Platform</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          </details>
        </div>
      )}

      {/* ── SUB-TAB 2: Live Agent Activity Monitor ───────────────────────────── */}
      {subTab === "activity" && (
        <ClaudeActivityPanel
          onOpenLeadChat={(senderId) =>
            onOpenLeadChat ? onOpenLeadChat(senderId) : openChat(senderId)
          }
          onOpenSkillsTab={() => handleSelectSubTab("skills")}
        />
      )}

      {/* ── SUB-TAB 3: Modular CRM Skills Trainer ───────────────────────────── */}
      {subTab === "skills" && (
        <ClaudeSkillsPanel
          platformAgent={platformAgent}
          hasAgentId={connection.hasAgentId}
          onSyncTools={handleSyncToolsOnly}
        />
      )}

      {/* ── SUB-TAB 4: Claude / ChatGPT-Style Sandbox Playground ─────────────── */}
      {subTab === "sandbox" && (
        <ClaudeSandboxPanel
          hasAgentId={connection.hasAgentId}
          agentName={agentName}
          agentModelLabel={activeModelOption?.label || effectiveModel}
          branches={settingsDraft.branches}
          messages={sandboxMessages}
          input={sandboxInput}
          onInputChange={setSandboxInput}
          sending={sandboxSending}
          error={sandboxError}
          mockLeadName={mockLeadName}
          onMockLeadNameChange={setMockLeadName}
          mockChannel={mockChannel}
          onMockChannelChange={setMockChannel}
          mockBranch={mockBranch}
          onMockBranchChange={setMockBranch}
          mockCampaign={mockCampaign}
          onMockCampaignChange={setMockCampaign}
          mockExistingStudent={mockExistingStudent}
          onMockExistingStudentChange={setMockExistingStudent}
          onSend={handleSendSandbox}
          onReset={handleResetSandbox}
          onEditStudio={() => handleSelectSubTab("studio")}
        />
      )}

      {/* ── SUB-TAB 3: Full Assigned Leads Board inside Settings ─────────────── */}
      {subTab === "leads" && (
        <section
          className="rounded-xl p-4 sm:p-5 space-y-4"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-main)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
                Assigned Leads Control Board
              </h3>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                View every lead assigned to Adham, pause/resume threads, reset memory sessions, or assign new leads.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void fetchClaudeLeads()}
                aria-label="Refresh assigned leads"
                className="inline-flex items-center gap-1.5 min-h-[38px] px-3 rounded-lg text-[12px] font-medium cursor-pointer"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-input)",
                  color: "var(--text-primary)",
                }}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingLeads ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </button>
              <Link
                href="/claude-leads"
                className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 rounded-lg text-[12px] font-semibold text-white"
                style={{ background: "var(--bg-banner)" }}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Search & Assign Leads</span>
              </Link>
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
            <div className="relative flex-1 min-w-0">
              <Search
                className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: "var(--text-muted)" }}
              />
              <input
                type="text"
                value={leadSearchQuery}
                onChange={(e) => setLeadSearchQuery(e.target.value)}
                placeholder="Filter assigned leads by name, phone, or ID..."
                className="w-full min-h-[38px] pl-8 pr-8 text-[16px] sm:text-[12px] rounded-lg outline-none"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-input)",
                  color: "var(--text-primary)",
                }}
              />
              {leadSearchQuery && (
                <button
                  type="button"
                  onClick={() => setLeadSearchQuery("")}
                  aria-label="Clear filter"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded cursor-pointer"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(["all", "active", "paused", "errors"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setLeadFilter(f)}
                  className="min-h-[36px] px-3 rounded-lg text-[11px] font-semibold capitalize cursor-pointer"
                  style={
                    leadFilter === f
                      ? { background: "var(--bg-banner)", color: "#fff" }
                      : {
                          background: "var(--bg-pill)",
                          border: "1px solid var(--border-input)",
                          color: "var(--text-secondary)",
                        }
                  }
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {filteredLeads.length === 0 ? (
            <div
              className="rounded-lg p-6 text-center space-y-2.5"
              style={{ background: "var(--bg-panel)", border: "1px solid var(--border-main)" }}
            >
              <p className="text-[12.5px] font-semibold" style={{ color: "var(--text-primary)" }}>
                {mergedAssignedLeads.length === 0
                  ? "No leads currently have Adham AI enabled"
                  : "No assigned leads match this filter"}
              </p>
              <p className="text-[11.5px]" style={{ color: "var(--text-secondary)" }}>
                Use the Search & Assign Leads workspace to search your entire CRM and add leads to Adham.
              </p>
              <Link
                href="/claude-leads"
                className="inline-flex items-center gap-1.5 min-h-[38px] px-4 rounded-lg text-[12px] font-semibold text-white"
                style={{ background: "var(--bg-banner)" }}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Search & Assign Leads</span>
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredLeads.map((lead) => {
                const meta = getLeadClaudeStatusMeta({
                  claudeEnabled: lead.claudeEnabled,
                  claudePaused: lead.claudePaused,
                  claudePausedReason: lead.claudePausedReason,
                  globalEnabled: settingsDraft.enabled,
                });
                const isBusy = leadBusyId === lead.senderId;
                const lastTime = formatLastMessageTime(lead.lastMessageAt);

                return (
                  <div
                    key={lead.senderId}
                    className="rounded-lg p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                    style={{
                      background: "var(--bg-panel)",
                      border: "1px solid var(--border-main)",
                    }}
                  >
                    <div className="min-w-0 space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                          {lead.leadName || lead.name || lead.phone || lead.senderId}
                        </span>
                        <ClaudeStatusPill label={lead.channel} tone="slate" />
                        {lead.pipeline && <ClaudeStatusPill label={lead.pipeline} tone="blue" />}
                        <ClaudeStatusPill
                          label={meta.label}
                          tone={
                            meta.state === "active"
                              ? "green"
                              : meta.state === "paused"
                              ? "amber"
                              : meta.state === "global_off"
                              ? "blue"
                              : "slate"
                          }
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                        {lead.phone && <span>{lead.phone}</span>}
                        <span>Branch: {lead.branch || "Not set"}</span>
                        {lastTime && <span>Last msg: {lastTime}</span>}
                      </div>

                      <p
                        className="text-[11px] truncate"
                        style={{ color: lead.claudeLastError ? "var(--label-red-text)" : "var(--text-secondary)" }}
                      >
                        {lead.claudeLastError
                          ? `Error: ${lead.claudeLastError}`
                          : lead.claudePaused
                          ? meta.description
                          : lead.lastMessageText || "Ready for incoming messages"}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {lead.claudeEnabled && lead.claudePaused && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            void handleLeadBoardAction(lead.senderId, { claudePaused: false })
                          }
                          className="inline-flex items-center gap-1 min-h-[36px] px-3 rounded-md text-[11px] font-semibold text-white cursor-pointer disabled:opacity-50"
                          style={{ background: "var(--bg-banner)" }}
                        >
                          <Check className="w-3 h-3" />
                          <span>Resume</span>
                        </button>
                      )}
                      {lead.claudeEnabled && !lead.claudePaused && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            void handleLeadBoardAction(lead.senderId, { claudePaused: true })
                          }
                          className="min-h-[36px] px-3 rounded-md text-[11px] font-medium cursor-pointer disabled:opacity-50"
                          style={{
                            background: "var(--bg-card)",
                            border: "1px solid var(--border-input)",
                            color: "var(--text-primary)",
                          }}
                        >
                          Pause
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          void handleLeadBoardAction(lead.senderId, { resetSession: true })
                        }
                        title="Start a fresh Claude conversation memory for this lead"
                        className="inline-flex items-center gap-1 min-h-[36px] px-2.5 rounded-md text-[11px] font-medium cursor-pointer disabled:opacity-50"
                        style={{
                          background: "var(--bg-card)",
                          border: "1px solid var(--border-input)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset</span>
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          void handleLeadBoardAction(lead.senderId, { claudeEnabled: false })
                        }
                        className="min-h-[36px] px-3 rounded-md text-[11px] font-medium cursor-pointer disabled:opacity-50"
                        style={{
                          background: "var(--label-red-bg)",
                          border: "1px solid var(--label-red-border)",
                          color: "var(--label-red-text)",
                        }}
                      >
                        Turn off
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onOpenLeadChat
                            ? onOpenLeadChat(lead.senderId)
                            : openChat(lead.senderId)
                        }
                        className="inline-flex items-center gap-1 min-h-[36px] px-3 rounded-md text-[11px] font-medium cursor-pointer"
                        style={{
                          background: "var(--bg-card)",
                          border: "1px solid var(--border-input)",
                          color: "var(--text-primary)",
                        }}
                      >
                        <MessageSquare className="w-3 h-3" />
                        <span>Open</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ── SUB-TAB 4: Prompt Studio & Branches ──────────────────────────────── */}
      {subTab === "studio" && (
        <div className="space-y-4">
          {/* Assistant Instructions & Model */}
          <section
            className="rounded-xl p-4 sm:p-5 space-y-4"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-main)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <div>
              <h3 className="text-[13.5px] font-semibold" style={{ color: "var(--text-primary)" }}>
                Assistant Instructions & Model
              </h3>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                Customize how Adham responds to parents and leads, and choose which AI model runs his replies.
              </p>
            </div>

            <form onSubmit={handleSaveAgentToPlatform} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                    Assistant name
                  </label>
                  <input
                    type="text"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    required
                    className="w-full min-h-[40px] px-3 text-[16px] sm:text-[13px] rounded-lg outline-none"
                    style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)", color: "var(--text-primary)" }}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                    AI Model
                  </label>
                  <select
                    value={agentModel}
                    onChange={(e) => setAgentModel(e.target.value)}
                    className="w-full min-h-[40px] px-3 text-[16px] sm:text-[13px] rounded-lg outline-none"
                    style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)", color: "var(--text-primary)" }}
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
                  <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                    Custom Claude model ID
                  </label>
                  <input
                    type="text"
                    value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    placeholder="claude-sonnet-5-5"
                    required
                    className="w-full min-h-[40px] px-3 text-[16px] sm:text-[13px] rounded-lg outline-none"
                    style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)", color: "var(--text-primary)" }}
                  />
                </div>
              )}

              <ClaudePromptEditor
                value={agentSystem}
                onChange={setAgentSystem}
                defaultPrompt={playbookDefaults.system}
                defaultName={playbookDefaults.name}
                onResetToDefaults={(name, system) => {
                  setAgentName(name);
                  setAgentSystem(system);
                }}
              />

              {/* Collapsed Developer & Sync Details */}
              <details
                className="rounded-lg overflow-hidden text-[11.5px]"
                style={{
                  background: "var(--bg-panel)",
                  border: "1px solid var(--border-main)",
                }}
              >
                <summary
                  className="px-3 py-2 cursor-pointer flex items-center justify-between gap-2 font-medium select-none hover:bg-[var(--bg-hover)]"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <span>Developer & sync details</span>
                  <span className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>
                    {platformAgent ? `v${platformAgent.version} · ` : ""}
                    {agentSystem.length.toLocaleString()} chars
                  </span>
                </summary>
                <div
                  className="px-3 py-3 space-y-2.5"
                  style={{ borderTop: "1px solid var(--border-main)", background: "var(--bg-card)" }}
                >
                  {platformAgent && platformAgent.attachedCrmTools.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-medium inline-flex items-center gap-1 mr-1" style={{ color: "var(--text-secondary)" }}>
                        <Wrench className="w-3 h-3" /> Attached CRM tools:
                      </span>
                      {platformAgent.attachedCrmTools.map((toolName) => (
                        <ClaudeStatusPill key={toolName} label={toolName} tone="slate" />
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      {platformAgent && !platformAgent.hasAllCrmTools
                        ? "Tools not yet synced to latest definition."
                        : "All CRM booking & escalation tools attached."}
                    </span>
                    <button
                      type="button"
                      onClick={() => void fetchStatus()}
                      className="inline-flex items-center gap-1.5 min-h-[34px] px-3 rounded-lg text-[11px] font-medium cursor-pointer"
                      style={{
                        background: "var(--bg-input)",
                        border: "1px solid var(--border-input)",
                        color: "var(--text-primary)",
                      }}
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Reload from Claude</span>
                    </button>
                  </div>
                </div>
              </details>

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
                  className="min-h-[42px] px-4 rounded-lg text-[12px] font-semibold text-white cursor-pointer disabled:opacity-50"
                  style={{ background: "var(--bg-banner)" }}
                >
                  {savingAgent ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
          </section>

          {/* Branch Map Pins, School Managers & Slot Rules (Collapsible rows) */}
          <section
            className="rounded-xl p-4 sm:p-5 space-y-4"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-main)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-[13.5px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  Branches, School Managers, and Discovery Slots
                </h3>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                  Click a branch row to edit map pins, landmarks, managers, and available audition slots.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const nextIndex = settingsDraft.branches.length;
                  const newKey = `branch-${nextIndex}`;
                  setSettingsDraft({
                    ...settingsDraft,
                    branches: [
                      ...settingsDraft.branches,
                      {
                        city: "",
                        branchName: "",
                        displayName: "",
                        landmark: "",
                        mapUrl: "",
                        schoolManagerName: "",
                        weekdaySlots: ["05:30 PM", "06:30 PM"],
                        weekendSlots: ["11:00 AM", "05:00 PM"],
                        closedDates: [],
                        active: true,
                      },
                    ],
                  });
                  setExpandedBranchKeys((prev) => new Set(prev).add(newKey));
                }}
                className="inline-flex items-center gap-1.5 min-h-[38px] px-3 rounded-lg text-[12px] font-medium cursor-pointer"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-input)",
                  color: "var(--text-primary)",
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add branch</span>
              </button>
            </div>

            <form onSubmit={handleSaveBranches} className="space-y-2.5">
              {settingsDraft.branches.length === 0 ? (
                <p className="text-[12px] py-3" style={{ color: "var(--text-secondary)" }}>
                  No branch rules configured. Add a branch so Adham can check slot availability.
                </p>
              ) : (
                settingsDraft.branches.map((branch, idx) => {
                  const rowKey = branch._id || `branch-${idx}`;
                  const isExpanded = expandedBranchKeys.has(rowKey);
                  return (
                    <BranchSlotDraftRow
                      key={rowKey}
                      branch={branch}
                      index={idx}
                      expanded={isExpanded}
                      onToggleExpand={() =>
                        setExpandedBranchKeys((prev) => {
                          const next = new Set(prev);
                          if (next.has(rowKey)) next.delete(rowKey);
                          else next.add(rowKey);
                          return next;
                        })
                      }
                      onChange={(next) => {
                        const updated = [...settingsDraft.branches];
                        updated[idx] = next;
                        setSettingsDraft({ ...settingsDraft, branches: updated });
                      }}
                      onRemove={() => {
                        const updated = settingsDraft.branches.filter((_, i) => i !== idx);
                        setSettingsDraft({ ...settingsDraft, branches: updated });
                      }}
                    />
                  );
                })
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                <div>
                  {branchesFeedback && (
                    <p
                      className="text-[12px] font-medium"
                      style={{
                        color: branchesFeedback.ok ? "var(--label-green-text)" : "var(--label-red-text)",
                      }}
                    >
                      {branchesFeedback.msg}
                    </p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={savingBranches}
                  className="min-h-[42px] px-4 rounded-lg text-[12px] font-semibold text-white cursor-pointer disabled:opacity-50"
                  style={{ background: "var(--bg-banner)" }}
                >
                  {savingBranches ? "Saving..." : "Save branch rules"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
