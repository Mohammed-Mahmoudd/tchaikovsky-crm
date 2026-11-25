"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth, normalizeRole } from "../components/AuthProvider";
import { useCRM } from "./CRMContext";
import {
  type ClaudeActivationNoteResult,
  type ClaudeLeadCounts,
  type ClaudeLeadRow,
  type ClaudeSandboxTurnResult,
  type ClaudeSettingsData,
  type ClaudeStatusPayload,
  formatClaudeActivationNote,
  mergeAssignedClaudeLeads,
  summarizeClaudeLeadCounts,
} from "../utils/claudeAgent";
import {
  AGENT_CACHE_KEYS,
  dedupeAgentRequest,
  isAgentCacheFresh,
  readAgentLeadsCache,
  readAgentMemorySnapshot,
  readAgentStatusCache,
  writeAgentLeadsCache,
  writeAgentStatusCache,
} from "../utils/agentWorkspaceCache";
import type { SandboxMessage } from "../components/ClaudeSandboxPanel";

export interface FeedbackNotice {
  ok: boolean;
  msg: string;
}

export interface LeadBoardActionResult {
  ok: boolean;
  error?: string;
  autoReplyTriggered?: boolean;
  autoReplySkippedReason?: string | null;
  activationNote?: ClaudeActivationNoteResult | null;
}

export interface AgentCoreContextValue {
  isChairman: boolean;
  loadingStatus: boolean;
  refreshingStatus: boolean;
  loadError: string | null;
  statusData: ClaudeStatusPayload | null;
  settingsDraft: ClaudeSettingsData | null;
  updateSettingsDraft: (updater: (prev: ClaudeSettingsData) => ClaudeSettingsData) => void;
  savingSettings: boolean;
  settingsFeedback: FeedbackNotice | null;
  savingBranches: boolean;
  branchesFeedback: FeedbackNotice | null;
  creatingAgent: boolean;
  createFeedback: FeedbackNotice | null;
  isSandboxOpen: boolean;
  openSandbox: () => void;
  closeSandbox: () => void;
  fetchStatus: (options?: { silent?: boolean; force?: boolean }) => Promise<void>;
  saveGlobalSettings: (overrideDraft?: Partial<ClaudeSettingsData>) => Promise<void>;
  handleToggleMaster: () => Promise<void>;
  handleSaveBranches: (e: React.FormEvent) => Promise<void>;
  handleSyncToolsOnly: () => Promise<boolean>;
  handleCreateAgentOnPlatform: () => Promise<void>;
  openLeadChat: (senderId: string) => void;
}

export interface AgentStudioDraftContextValue {
  agentName: string;
  setAgentNameValue: (next: string) => void;
  agentModel: string;
  setAgentModelValue: (next: string) => void;
  customModel: string;
  setCustomModelValue: (next: string) => void;
  agentSystem: string;
  setAgentSystemValue: (next: string) => void;
  resetStudioDefaults: (name: string, system: string) => void;
  effectiveModel: string;
  activeModelLabel: string;
  savingAgent: boolean;
  agentFeedback: FeedbackNotice | null;
  handleSaveAgentToPlatform: (e: React.FormEvent) => Promise<void>;
}

export interface AgentSandboxContextValue {
  sandboxMessages: SandboxMessage[];
  sandboxInput: string;
  setSandboxInput: (next: string) => void;
  sandboxSending: boolean;
  sandboxError: string | null;
  mockLeadName: string;
  setMockLeadName: (next: string) => void;
  mockChannel: "WA" | "FB" | "IG";
  setMockChannel: (next: "WA" | "FB" | "IG") => void;
  mockBranch: string;
  setMockBranch: (next: string) => void;
  mockCampaign: string;
  setMockCampaign: (next: string) => void;
  mockExistingStudent: boolean;
  setMockExistingStudent: (next: boolean) => void;
  handleSendSandbox: (presetText?: string) => Promise<void>;
  handleResetSandbox: () => void;
}

interface AgentLeadsStoreContextValue {
  leads: ClaudeLeadRow[];
  loadingLeads: boolean;
  leadBusyId: string | null;
  setLeadBusyId: (next: string | null) => void;
  setLeadsAndCache: (next: ClaudeLeadRow[]) => void;
  fetchClaudeLeads: (options?: { force?: boolean }) => Promise<void>;
}

const AgentCoreContext = createContext<AgentCoreContextValue | null>(null);
const AgentStudioDraftContext = createContext<AgentStudioDraftContextValue | null>(null);
const AgentSandboxContext = createContext<AgentSandboxContextValue | null>(null);
const AgentLeadsStoreContext = createContext<AgentLeadsStoreContextValue | null>(null);

export function useAgentCore(): AgentCoreContextValue {
  const ctx = useContext(AgentCoreContext);
  if (!ctx) {
    throw new Error("useAgentCore must be used inside AgentWorkspaceProvider");
  }
  return ctx;
}

export function useAgentStudioDraft(): AgentStudioDraftContextValue {
  const ctx = useContext(AgentStudioDraftContext);
  if (!ctx) {
    throw new Error("useAgentStudioDraft must be used inside AgentWorkspaceProvider");
  }
  return ctx;
}

export function useAgentSandbox(): AgentSandboxContextValue {
  const ctx = useContext(AgentSandboxContext);
  if (!ctx) {
    throw new Error("useAgentSandbox must be used inside AgentWorkspaceProvider");
  }
  return ctx;
}

/**
 * Isolated CRM-coupled leads hook so unrelated inbox SSE updates only re-render
 * components that actively consume lead assignment state.
 */
export function useAgentAssignedLeads() {
  const store = useContext(AgentLeadsStoreContext);
  if (!store) {
    throw new Error("useAgentAssignedLeads must be used inside AgentWorkspaceProvider");
  }
  const { isChairman } = useAgentCore();
  const { admissionsConversations, labels, updateConversationClaude } = useCRM();
  const { leads, loadingLeads, leadBusyId, setLeadBusyId, setLeadsAndCache, fetchClaudeLeads } =
    store;

  useEffect(() => {
    if (!isChairman) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        void fetchClaudeLeads();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fetchClaudeLeads, isChairman]);

  const mergedAssignedLeads = useMemo(
    () => mergeAssignedClaudeLeads(leads, admissionsConversations),
    [leads, admissionsConversations]
  );

  const leadCounts: ClaudeLeadCounts = useMemo(
    () => summarizeClaudeLeadCounts(mergedAssignedLeads),
    [mergedAssignedLeads]
  );

  const handleLeadBoardAction = useCallback(
    async (
      senderId: string,
      payload: { claudeEnabled?: boolean; claudePaused?: boolean; resetSession?: boolean }
    ): Promise<LeadBoardActionResult> => {
      if (leadBusyId) return { ok: false, error: "Another update is in progress." };
      setLeadBusyId(senderId);

      const previousLeads = leads;
      if (payload.claudeEnabled !== undefined || payload.claudePaused !== undefined) {
        const nextLeads = leads
          .map((row) => {
            if (row.senderId !== senderId) return row;
            return {
              ...row,
              claudeEnabled:
                payload.claudeEnabled !== undefined ? payload.claudeEnabled : row.claudeEnabled,
              claudePaused:
                payload.claudePaused !== undefined ? payload.claudePaused : row.claudePaused,
            };
          })
          .filter(
            (row) =>
              Boolean(row.claudeEnabled) ||
              Boolean(row.claudePaused) ||
              Boolean(row.claudeLastError?.trim())
          );
        setLeadsAndCache(nextLeads);
      }

      const shouldTrigger = payload.claudeEnabled === true || payload.claudePaused === false;
      const res = await updateConversationClaude(senderId, {
        ...payload,
        ...(shouldTrigger ? { triggerReply: true } : {}),
      });
      setLeadBusyId(null);

      if (res.ok) {
        void fetchClaudeLeads({ force: true });
        const activationNote = shouldTrigger
          ? formatClaudeActivationNote(
              payload.claudeEnabled === true ? "Enabled" : "Resumed",
              res
            )
          : null;
        return {
          ok: true,
          autoReplyTriggered: res.autoReplyTriggered,
          autoReplySkippedReason: res.autoReplySkippedReason,
          activationNote,
        };
      }

      setLeadsAndCache(previousLeads);
      return {
        ok: false,
        error: res.error || "Could not update lead assignment.",
      };
    },
    [fetchClaudeLeads, leadBusyId, leads, setLeadBusyId, setLeadsAndCache, updateConversationClaude]
  );

  return {
    admissionsConversations,
    labels,
    leads,
    mergedAssignedLeads,
    leadCounts,
    loadingLeads,
    leadBusyId,
    fetchClaudeLeads,
    handleLeadBoardAction,
    updateConversationClaude,
  };
}

function resolveInitialStudioFields(data: ClaudeStatusPayload) {
  const live = data.platformAgent;
  const defaults = data.playbookDefaults;
  const resolvedModel = live?.model || defaults.model;
  const isListedModel = data.availableModels.some((m) => m.id === resolvedModel);
  return {
    name: live?.name || defaults.name,
    model: isListedModel ? resolvedModel : "__custom__",
    customModel: isListedModel ? "" : resolvedModel,
    system: live?.system || defaults.system,
  };
}

export function AgentWorkspaceProvider({
  children,
  onOpenLeadChat,
  isSandboxOpen = false,
  onOpenSandbox,
  onCloseSandbox,
}: {
  children: React.ReactNode;
  onOpenLeadChat?: (senderId: string) => void;
  isSandboxOpen?: boolean;
  onOpenSandbox?: () => void;
  onCloseSandbox?: () => void;
}) {
  const { user, authFetch } = useAuth();
  const isChairman = normalizeRole(user?.role) === "chairman";

  const initialMemoryStatus = readAgentMemorySnapshot<ClaudeStatusPayload>(AGENT_CACHE_KEYS.status);
  const initialMemoryLeads = readAgentMemorySnapshot<ClaudeLeadRow[]>(AGENT_CACHE_KEYS.leads);

  const [statusData, setStatusData] = useState<ClaudeStatusPayload | null>(initialMemoryStatus);
  const [settingsDraft, setSettingsDraft] = useState<ClaudeSettingsData | null>(
    initialMemoryStatus?.settings ?? null
  );
  const [loadingStatus, setLoadingStatus] = useState<boolean>(() => !initialMemoryStatus);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsFeedback, setSettingsFeedback] = useState<FeedbackNotice | null>(null);
  const [savingBranches, setSavingBranches] = useState(false);
  const [branchesFeedback, setBranchesFeedback] = useState<FeedbackNotice | null>(null);

  const initialStudio = initialMemoryStatus ? resolveInitialStudioFields(initialMemoryStatus) : null;
  const [agentName, setAgentName] = useState(initialStudio?.name ?? "");
  const [agentModel, setAgentModel] = useState(initialStudio?.model ?? "");
  const [customModel, setCustomModel] = useState(initialStudio?.customModel ?? "");
  const [agentSystem, setAgentSystem] = useState(initialStudio?.system ?? "");
  const [savingAgent, setSavingAgent] = useState(false);
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [createFeedback, setCreateFeedback] = useState<FeedbackNotice | null>(null);
  const [agentFeedback, setAgentFeedback] = useState<FeedbackNotice | null>(null);

  const [leads, setLeads] = useState<ClaudeLeadRow[]>(() => initialMemoryLeads ?? []);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [leadBusyId, setLeadBusyId] = useState<string | null>(null);

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
  const statusDataRef = useRef<ClaudeStatusPayload | null>(statusData);
  const settingsDirtyRef = useRef(false);
  const studioDirtyRef = useRef(false);
  const hydratedStorageRef = useRef(false);

  useEffect(() => {
    statusDataRef.current = statusData;
  }, [statusData]);

  const hydrateFromPayload = useCallback((data: ClaudeStatusPayload, respectDirty = true) => {
    setStatusData(data);
    statusDataRef.current = data;
    writeAgentStatusCache(data);

    if (!respectDirty || !settingsDirtyRef.current) {
      setSettingsDraft(data.settings);
    }
    if (!respectDirty || !studioDirtyRef.current) {
      const studio = resolveInitialStudioFields(data);
      setAgentName(studio.name);
      setAgentModel(studio.model);
      setCustomModel(studio.customModel);
      setAgentSystem(studio.system);
    }
  }, []);

  const fetchStatus = useCallback(
    async ({ silent = false, force = false }: { silent?: boolean; force?: boolean } = {}) => {
      if (!isChairman) return;

      if (!force && isAgentCacheFresh(AGENT_CACHE_KEYS.status)) {
        const mem = readAgentMemorySnapshot<ClaudeStatusPayload>(AGENT_CACHE_KEYS.status);
        if (mem) {
          if (!statusDataRef.current) hydrateFromPayload(mem, true);
          setLoadingStatus(false);
          return;
        }
      }

      const hasSnapshot = Boolean(statusDataRef.current);
      if (!silent && !hasSnapshot) {
        setLoadingStatus(true);
      } else {
        setRefreshingStatus(true);
      }
      setLoadError(null);

      try {
        const statusUrl = force ? "/crm-api/claude/status?refresh=1" : "/crm-api/claude/status";
        const dedupeKey = force ? "agent:status:refresh" : "agent:status";
        const result = await dedupeAgentRequest(dedupeKey, async () => {
          const res = await authFetch(statusUrl, { cache: "no-store" });
          const json = await res.json().catch(() => null);
          if (!res.ok || !json?.success || !json.data) {
            return { ok: false as const, error: json?.error || "Could not load Agent configuration." };
          }
          writeAgentStatusCache(json.data);
          return { ok: true as const, data: json.data as ClaudeStatusPayload };
        });

        if (!result.ok) {
          if (!hasSnapshot && !silent) {
            setLoadError(result.error);
          }
          return;
        }
        hydrateFromPayload(result.data, true);
      } catch {
        if (!hasSnapshot && !silent) {
          setLoadError("Network error while loading Agent configuration.");
        }
      } finally {
        setLoadingStatus(false);
        setRefreshingStatus(false);
      }
    },
    [authFetch, hydrateFromPayload, isChairman]
  );

  const setLeadsAndCache = useCallback((next: ClaudeLeadRow[]) => {
    setLeads(next);
    writeAgentLeadsCache(next);
  }, []);

  const fetchClaudeLeads = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!isChairman) return;
      if (!force && isAgentCacheFresh(AGENT_CACHE_KEYS.leads)) {
        const mem = readAgentMemorySnapshot<ClaudeLeadRow[]>(AGENT_CACHE_KEYS.leads);
        if (mem) {
          setLeads((prev) => (prev.length > 0 ? prev : mem));
          return;
        }
      }

      setLoadingLeads(true);
      try {
        const nextLeads = await dedupeAgentRequest("agent:leads", async () => {
          const res = await authFetch("/crm-api/claude/leads", { cache: "no-store" });
          const json = await res.json().catch(() => null);
          if (res.ok && json?.success && Array.isArray(json.data)) {
            writeAgentLeadsCache(json.data);
            return json.data as ClaudeLeadRow[];
          }
          return null;
        });
        if (nextLeads) {
          setLeads(nextLeads);
        }
      } catch {
        // Preserve live and cached leads on transient error
      } finally {
        setLoadingLeads(false);
      }
    },
    [authFetch, isChairman]
  );

  useEffect(() => {
    if (!isChairman) return;
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;
      if (!hydratedStorageRef.current) {
        hydratedStorageRef.current = true;
        const cachedStatus = readAgentStatusCache();
        if (cachedStatus && !statusDataRef.current) {
          hydrateFromPayload(cachedStatus, true);
          setLoadingStatus(false);
        }
        const cachedLeads = readAgentLeadsCache();
        if (cachedLeads && cachedLeads.length > 0) {
          setLeads((prev) => (prev.length > 0 ? prev : cachedLeads));
        }
      }
      void fetchStatus({ silent: Boolean(statusDataRef.current) });
    });

    return () => {
      cancelled = true;
    };
  }, [fetchStatus, hydrateFromPayload, isChairman]);

  useEffect(() => {
    if (!isChairman || typeof window === "undefined") return;
    const handleSettingsUpdated = () => {
      void fetchStatus({ silent: true, force: true });
    };
    window.addEventListener("crm:claude-settings-updated", handleSettingsUpdated);
    return () => {
      window.removeEventListener("crm:claude-settings-updated", handleSettingsUpdated);
    };
  }, [fetchStatus, isChairman]);

  const updateSettingsDraft = useCallback(
    (updater: (prev: ClaudeSettingsData) => ClaudeSettingsData) => {
      settingsDirtyRef.current = true;
      setSettingsDraft((prev) => (prev ? updater(prev) : prev));
    },
    []
  );

  const setAgentNameValue = useCallback((next: string) => {
    studioDirtyRef.current = true;
    setAgentName(next);
  }, []);

  const setAgentModelValue = useCallback((next: string) => {
    studioDirtyRef.current = true;
    setAgentModel(next);
  }, []);

  const setCustomModelValue = useCallback((next: string) => {
    studioDirtyRef.current = true;
    setCustomModel(next);
  }, []);

  const setAgentSystemValue = useCallback((next: string) => {
    studioDirtyRef.current = true;
    setAgentSystem(next);
  }, []);

  const resetStudioDefaults = useCallback((name: string, system: string) => {
    studioDirtyRef.current = true;
    setAgentName(name);
    setAgentSystem(system);
  }, []);

  const effectiveModel = agentModel === "__custom__" ? customModel.trim() : agentModel;
  const activeModelLabel = useMemo(() => {
    const match = statusData?.availableModels.find((m) => m.id === effectiveModel);
    return match?.label || effectiveModel;
  }, [effectiveModel, statusData]);

  const syncCachedSettings = useCallback((nextSettings: ClaudeSettingsData) => {
    setSettingsDraft(nextSettings);
    settingsDirtyRef.current = false;
    if (statusDataRef.current) {
      const updated = { ...statusDataRef.current, settings: nextSettings };
      setStatusData(updated);
      statusDataRef.current = updated;
      writeAgentStatusCache(updated);
    }
  }, []);

  const saveGlobalSettings = useCallback(
    async (overrideDraft?: Partial<ClaudeSettingsData>) => {
      if (!settingsDraft) return;
      const previousSettings = settingsDraft;
      setSavingSettings(true);
      setSettingsFeedback(null);
      const payload = {
        enabled: overrideDraft?.enabled ?? settingsDraft.enabled,
        sendMode: overrideDraft?.sendMode ?? settingsDraft.sendMode ?? "draft",
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
          if (overrideDraft) setSettingsDraft(previousSettings);
          setSettingsFeedback({ ok: false, msg: json?.error || "Could not save controls." });
          return;
        }
        syncCachedSettings(json.data);
        setSettingsFeedback({ ok: true, msg: "Controls saved." });
      } catch {
        if (overrideDraft) setSettingsDraft(previousSettings);
        setSettingsFeedback({ ok: false, msg: "Network error while saving controls." });
      } finally {
        setSavingSettings(false);
      }
    },
    [authFetch, settingsDraft, syncCachedSettings]
  );

  const handleToggleMaster = useCallback(async () => {
    if (!settingsDraft || savingSettings) return;
    const nextEnabled = !settingsDraft.enabled;
    setSettingsDraft({ ...settingsDraft, enabled: nextEnabled });
    await saveGlobalSettings({ enabled: nextEnabled });
  }, [saveGlobalSettings, savingSettings, settingsDraft]);

  const handleSaveBranches = useCallback(
    async (e: React.FormEvent) => {
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
        syncCachedSettings(json.data);
        setBranchesFeedback({ ok: true, msg: "Branch map pins, school managers, and slots saved." });
      } catch {
        setBranchesFeedback({ ok: false, msg: "Network error while saving branch rules." });
      } finally {
        setSavingBranches(false);
      }
    },
    [authFetch, savingBranches, settingsDraft, syncCachedSettings]
  );

  const handleSaveAgentToPlatform = useCallback(
    async (e: React.FormEvent) => {
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
        studioDirtyRef.current = false;
        if (statusDataRef.current) {
          const updated = {
            ...statusDataRef.current,
            platformAgent: json.data,
            platformError: null,
          };
          setStatusData(updated);
          statusDataRef.current = updated;
          writeAgentStatusCache(updated);
        }
        setAgentFeedback({
          ok: true,
          msg: `Synced to platform.claude.com (version ${json.data.version}) with CRM tools attached.`,
        });
      } catch {
        setAgentFeedback({ ok: false, msg: "Network error while syncing agent." });
      } finally {
        setSavingAgent(false);
      }
    },
    [agentName, agentSystem, authFetch, effectiveModel, savingAgent]
  );

  const handleSyncToolsOnly = useCallback(async (): Promise<boolean> => {
    try {
      const res = await authFetch("/crm-api/claude/agent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncTools: true }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) return false;
      if (statusDataRef.current) {
        const updated = {
          ...statusDataRef.current,
          platformAgent: json.data,
          platformError: null,
        };
        setStatusData(updated);
        statusDataRef.current = updated;
        writeAgentStatusCache(updated);
      }
      return true;
    } catch {
      return false;
    }
  }, [authFetch]);

  const handleCreateAgentOnPlatform = useCallback(async () => {
    if (creatingAgent) return;
    setCreatingAgent(true);
    setCreateFeedback(null);
    setAgentFeedback(null);
    try {
      const res = await authFetch("/crm-api/claude/agent/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: agentName.trim() || statusDataRef.current?.playbookDefaults.name,
          model: effectiveModel || statusDataRef.current?.playbookDefaults.model,
          system: agentSystem || statusDataRef.current?.playbookDefaults.system,
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
      await fetchStatus({ silent: true, force: true });
    } catch {
      const netMsg = "Network error while creating agent.";
      setCreateFeedback({ ok: false, msg: netMsg });
      setAgentFeedback({ ok: false, msg: netMsg });
    } finally {
      setCreatingAgent(false);
    }
  }, [agentName, agentSystem, authFetch, creatingAgent, effectiveModel, fetchStatus]);

  const handleSendSandbox = useCallback(
    async (presetText?: string) => {
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
    },
    [
      authFetch,
      mockBranch,
      mockCampaign,
      mockChannel,
      mockExistingStudent,
      mockLeadName,
      sandboxInput,
      sandboxSending,
      sandboxSessionId,
    ]
  );

  const handleResetSandbox = useCallback(() => {
    setSandboxSessionId(null);
    setSandboxMessages([]);
    setSandboxError(null);
  }, []);

  const openLeadChat = useCallback(
    (senderId: string) => {
      onOpenLeadChat?.(senderId);
    },
    [onOpenLeadChat]
  );

  const openSandbox = useCallback(() => {
    onOpenSandbox?.();
  }, [onOpenSandbox]);

  const closeSandbox = useCallback(() => {
    onCloseSandbox?.();
  }, [onCloseSandbox]);

  const coreValue = useMemo<AgentCoreContextValue>(
    () => ({
      isChairman,
      loadingStatus,
      refreshingStatus,
      loadError,
      statusData,
      settingsDraft,
      updateSettingsDraft,
      savingSettings,
      settingsFeedback,
      savingBranches,
      branchesFeedback,
      creatingAgent,
      createFeedback,
      isSandboxOpen,
      openSandbox,
      closeSandbox,
      fetchStatus,
      saveGlobalSettings,
      handleToggleMaster,
      handleSaveBranches,
      handleSyncToolsOnly,
      handleCreateAgentOnPlatform,
      openLeadChat,
    }),
    [
      branchesFeedback,
      closeSandbox,
      createFeedback,
      creatingAgent,
      fetchStatus,
      handleCreateAgentOnPlatform,
      handleSaveBranches,
      handleSyncToolsOnly,
      handleToggleMaster,
      isChairman,
      isSandboxOpen,
      loadError,
      loadingStatus,
      openLeadChat,
      openSandbox,
      refreshingStatus,
      saveGlobalSettings,
      savingBranches,
      savingSettings,
      settingsDraft,
      settingsFeedback,
      statusData,
      updateSettingsDraft,
    ]
  );

  const studioValue = useMemo<AgentStudioDraftContextValue>(
    () => ({
      agentName,
      setAgentNameValue,
      agentModel,
      setAgentModelValue,
      customModel,
      setCustomModelValue,
      agentSystem,
      setAgentSystemValue,
      resetStudioDefaults,
      effectiveModel,
      activeModelLabel,
      savingAgent,
      agentFeedback,
      handleSaveAgentToPlatform,
    }),
    [
      activeModelLabel,
      agentFeedback,
      agentModel,
      agentName,
      agentSystem,
      customModel,
      effectiveModel,
      handleSaveAgentToPlatform,
      resetStudioDefaults,
      savingAgent,
      setAgentModelValue,
      setAgentNameValue,
      setAgentSystemValue,
      setCustomModelValue,
    ]
  );

  const sandboxValue = useMemo<AgentSandboxContextValue>(
    () => ({
      sandboxMessages,
      sandboxInput,
      setSandboxInput,
      sandboxSending,
      sandboxError,
      mockLeadName,
      setMockLeadName,
      mockChannel,
      setMockChannel,
      mockBranch,
      setMockBranch,
      mockCampaign,
      setMockCampaign,
      mockExistingStudent,
      setMockExistingStudent,
      handleSendSandbox,
      handleResetSandbox,
    }),
    [
      handleResetSandbox,
      handleSendSandbox,
      mockBranch,
      mockCampaign,
      mockChannel,
      mockExistingStudent,
      mockLeadName,
      sandboxError,
      sandboxInput,
      sandboxMessages,
      sandboxSending,
    ]
  );

  const leadsStoreValue = useMemo<AgentLeadsStoreContextValue>(
    () => ({
      leads,
      loadingLeads,
      leadBusyId,
      setLeadBusyId,
      setLeadsAndCache,
      fetchClaudeLeads,
    }),
    [fetchClaudeLeads, leadBusyId, leads, loadingLeads, setLeadsAndCache]
  );

  return (
    <AgentCoreContext.Provider value={coreValue}>
      <AgentStudioDraftContext.Provider value={studioValue}>
        <AgentSandboxContext.Provider value={sandboxValue}>
          <AgentLeadsStoreContext.Provider value={leadsStoreValue}>
            {children}
          </AgentLeadsStoreContext.Provider>
        </AgentSandboxContext.Provider>
      </AgentStudioDraftContext.Provider>
    </AgentCoreContext.Provider>
  );
}
