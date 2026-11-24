"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  Check,
  Edit3,
  Plus,
  RefreshCw,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useAuth } from "./AuthProvider";
import type { ClaudeSkillItem, PlatformAgentInfo } from "../utils/claudeAgent";
import {
  AGENT_CACHE_KEYS,
  dedupeAgentRequest,
  isAgentCacheFresh,
  readAgentMemorySnapshot,
  readAgentSkillsCache,
  writeAgentSkillsCache,
} from "../utils/agentWorkspaceCache";
import { formatLastMessageTime } from "../utils/time";
import { ClaudeSettingSwitch, ClaudeStatusPill } from "./ClaudeUiPrimitives";

const SKILL_TEMPLATES: ReadonlyArray<{
  title: string;
  whenToUse: string;
  instructions: string;
  examples: string;
}> = [
  {
    title: "Price-First Objection Handling",
    whenToUse: "When a lead asks for prices before sharing their age group, child's age, or preferred branch.",
    instructions:
      "1. Acknowledge warmly without quoting prices yet.\n2. Ask whether the inquiry is for their child (and age) or an adult, plus which city/branch is closest.\n3. Only quote the single matching program price once both age group and branch are known.",
    examples:
      "Lead: كم أسعار البيانو؟\nAdham: أهلاً بك 🌷 يسعدنا نساعدك. التسجيل لحضرتك ولا لطفلك؟ وأي مدينة تناسبكم: الرياض، جدة، أو الخبر؟",
  },
  {
    title: "Far Distance / Commute Concern",
    whenToUse: "When a lead says the branch is far away or mentions a 30+ minute commute.",
    instructions:
      "1. Acknowledge the commute honestly without dismissing it.\n2. Highlight that families travel for our structured 3-lesson/week progress and 8-10 week student concerts.\n3. Ask which timing makes the trip easiest (after work or weekend morning).",
    examples:
      "Lead: الفرع بعيد عن بيتي شوي\nAdham: أفهمك تماماً، وكثير من طلابنا يفضلون أوقات معينة لتفادي الزحمة. هل تناسبكم زيارة نهاية الأسبوع أو بعد الدوام؟",
  },
  {
    title: "Child Under 6 Inquiry",
    whenToUse: "When a parent asks to enroll a child younger than 6 years old.",
    instructions:
      "1. Politely share that our structured program starts from age 6.\n2. Offer to keep their details on file for when their child turns 6.\n3. Call escalate_to_human with type 'Under 6' so the team notes the lead.",
    examples:
      "Lead: بنتي عمرها 4 سنوات، عندكم تسجيل؟\nAdham: أهلاً بك 🌷 برامجنا تبدأ من عمر 6 سنوات حتى يستفيد الطفل بأفضل شكل. تحب نسجل بياناتكم ونتواصل معكم أول ما تكمل 6 سنوات؟",
  },
];

interface SkillDraft {
  id?: string;
  title: string;
  whenToUse: string;
  instructions: string;
  examples: string;
  enabled: boolean;
}

const EMPTY_DRAFT: SkillDraft = {
  title: "",
  whenToUse: "",
  instructions: "",
  examples: "",
  enabled: true,
};

interface ClaudeSkillsPanelProps {
  platformAgent: PlatformAgentInfo | null;
  hasAgentId: boolean;
  onSyncTools: () => Promise<boolean>;
  onCountChange?: (activeCount: number, totalCount: number) => void;
}

/**
 * Manages modular CRM Skills that Adham loads on demand during live chats
 * via the `get_skill_guidance` tool, keeping the main prompt clean and conflict-free.
 */
export function ClaudeSkillsPanel({
  platformAgent,
  hasAgentId,
  onSyncTools,
  onCountChange,
}: ClaudeSkillsPanelProps) {
  const { authFetch } = useAuth();

  const initialMemorySkills = readAgentMemorySnapshot<ClaudeSkillItem[]>(AGENT_CACHE_KEYS.skills);
  const [skills, setSkills] = useState<ClaudeSkillItem[]>(() => initialMemorySkills ?? []);
  const [loading, setLoading] = useState(() => !initialMemorySkills);
  const [loadError, setLoadError] = useState<string | null>(null);
  const hasSkillsRef = useRef(Boolean(initialMemorySkills));

  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<SkillDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [syncingTools, setSyncingTools] = useState(false);
  const onCountChangeRef = useRef(onCountChange);
  const skillsRef = useRef<ClaudeSkillItem[]>(skills);

  useEffect(() => {
    skillsRef.current = skills;
  }, [skills]);

  useEffect(() => {
    onCountChangeRef.current = onCountChange;
  }, [onCountChange]);

  const notifyCounts = useCallback((list: ClaudeSkillItem[]) => {
    onCountChangeRef.current?.(list.filter((s) => s.enabled).length, list.length);
  }, []);

  const fetchSkills = useCallback(
    async ({ silent = false, force = false }: { silent?: boolean; force?: boolean } = {}) => {
      if (!force && isAgentCacheFresh(AGENT_CACHE_KEYS.skills)) {
        const mem = readAgentMemorySnapshot<ClaudeSkillItem[]>(AGENT_CACHE_KEYS.skills);
        if (mem) {
          hasSkillsRef.current = true;
          setSkills(mem);
          notifyCounts(mem);
          setLoading(false);
          return;
        }
      }

      if (!silent && !hasSkillsRef.current) setLoading(true);
      setLoadError(null);
      try {
        const result = await dedupeAgentRequest("agent:skills", async () => {
          const res = await authFetch("/crm-api/claude/skills", { cache: "no-store" });
          const json = await res.json().catch(() => null);
          if (!res.ok || !json?.success || !Array.isArray(json.data)) {
            return { ok: false as const, error: json?.error || "Could not load skills." };
          }
          const list = json.data as ClaudeSkillItem[];
          writeAgentSkillsCache(list);
          return { ok: true as const, data: list };
        });

        if (!result.ok) {
          if (!silent || !hasSkillsRef.current) {
            setLoadError(result.error);
          }
          return;
        }
        hasSkillsRef.current = true;
        setSkills(result.data);
        notifyCounts(result.data);
      } catch {
        if (!silent || !hasSkillsRef.current) {
          setLoadError("Network error while loading skills.");
        }
      } finally {
        setLoading(false);
      }
    },
    [authFetch, notifyCounts]
  );

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (!hasSkillsRef.current) {
        const cached = readAgentSkillsCache();
        if (cached) {
          hasSkillsRef.current = true;
          setSkills(cached);
          notifyCounts(cached);
          setLoading(false);
          void fetchSkills({ silent: true });
          return;
        }
      } else {
        notifyCounts(skillsRef.current);
      }
      void fetchSkills({ silent: hasSkillsRef.current });
    });
    return () => {
      cancelled = true;
    };
  }, [fetchSkills, notifyCounts]);

  const openCreate = (template?: (typeof SKILL_TEMPLATES)[number]) => {
    setFormError(null);
    setFeedback(null);
    setDraft(
      template
        ? {
            title: template.title,
            whenToUse: template.whenToUse,
            instructions: template.instructions,
            examples: template.examples,
            enabled: true,
          }
        : EMPTY_DRAFT
    );
    setEditorOpen(true);
  };

  const openEdit = (skill: ClaudeSkillItem) => {
    setFormError(null);
    setFeedback(null);
    setDraft({
      id: skill._id,
      title: skill.title,
      whenToUse: skill.whenToUse,
      instructions: skill.instructions,
      examples: skill.examples || "",
      enabled: skill.enabled,
    });
    setEditorOpen(true);
  };

  const handleSaveSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const title = draft.title.trim();
    const whenToUse = draft.whenToUse.trim();
    const instructions = draft.instructions.trim();
    const examples = draft.examples.trim();

    if (!title) {
      setFormError("Enter a clear skill title.");
      return;
    }
    if (!whenToUse) {
      setFormError("Describe when Adham should use this skill.");
      return;
    }
    if (!instructions) {
      setFormError("Enter the instructions Adham should follow.");
      return;
    }

    setSaving(true);
    setFormError(null);
    setFeedback(null);

    try {
      const isEdit = Boolean(draft.id);
      const url = isEdit ? `/crm-api/claude/skills/${draft.id}` : "/crm-api/claude/skills";
      const res = await authFetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          whenToUse,
          instructions,
          examples,
          enabled: draft.enabled,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setFormError(json?.error || "Could not save skill.");
        return;
      }

      setEditorOpen(false);
      setDraft(EMPTY_DRAFT);
      setFeedback({
        ok: true,
        msg: isEdit
          ? `Updated skill "${json.data.title}". Active sessions will use the latest rules automatically.`
          : `Created skill "${json.data.title}". Adham can now load it in live chats.`,
      });
      await fetchSkills({ silent: true, force: true });
    } catch {
      setFormError("Network error while saving skill.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (skill: ClaudeSkillItem) => {
    if (busyId) return;
    const previous = skills;
    const nextSkills = skills.map((s) =>
      s._id === skill._id ? { ...s, enabled: !skill.enabled } : s
    );
    setSkills(nextSkills);
    writeAgentSkillsCache(nextSkills);
    setBusyId(skill._id);
    setFeedback(null);
    try {
      const res = await authFetch(`/crm-api/claude/skills/${skill._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !skill.enabled }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setSkills(previous);
        writeAgentSkillsCache(previous);
        setFeedback({ ok: false, msg: json?.error || "Could not update skill status." });
        return;
      }
      const synced = previous.map((s) => (s._id === skill._id ? json.data : s));
      setSkills(synced);
      writeAgentSkillsCache(synced);
      notifyCounts(synced);
    } catch {
      setSkills(previous);
      writeAgentSkillsCache(previous);
      setFeedback({ ok: false, msg: "Network error while updating skill." });
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteSkill = async (skill: ClaudeSkillItem) => {
    if (busyId) return;
    setBusyId(skill._id);
    setFeedback(null);
    try {
      const res = await authFetch(`/crm-api/claude/skills/${skill._id}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setFeedback({ ok: false, msg: json?.error || "Could not delete skill." });
        return;
      }
      setConfirmDeleteId(null);
      const next = skills.filter((s) => s._id !== skill._id);
      setSkills(next);
      writeAgentSkillsCache(next);
      notifyCounts(next);
      setFeedback({ ok: true, msg: `Removed skill "${skill.title}".` });
    } catch {
      setFeedback({ ok: false, msg: "Network error while deleting skill." });
    } finally {
      setBusyId(null);
    }
  };

  const handleSyncToolsClick = async () => {
    if (syncingTools) return;
    setSyncingTools(true);
    setFeedback(null);
    const ok = await onSyncTools();
    setSyncingTools(false);
    setFeedback(
      ok
        ? { ok: true, msg: "Synced CRM skills tool to Adham on platform.claude.com." }
        : { ok: false, msg: "Could not sync tools to platform.claude.com." }
    );
  };

  const activeCount = skills.filter((s) => s.enabled).length;
  const needsToolSync = Boolean(hasAgentId && platformAgent && !platformAgent.hasAllCrmTools);

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <section
        className="rounded-xl p-4 sm:p-5 space-y-4"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-main)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
                Trained Skills
              </h3>
              <ClaudeStatusPill
                label={`${activeCount} active`}
                tone={activeCount > 0 ? "green" : "slate"}
              />
            </div>
            <p className="text-[11.5px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
              Teach Adham focused playbooks and dialogue examples for specific situations. Adham loads only the matching skill during live chats, keeping core rules clear and conflict-free.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void fetchSkills({ force: true })}
              disabled={loading}
              className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-[38px] px-3 rounded-lg text-[12px] font-medium cursor-pointer disabled:opacity-50"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-input)",
                color: "var(--text-primary)",
              }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={() => openCreate()}
              className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-[38px] px-3.5 rounded-lg text-[12px] font-semibold text-white cursor-pointer"
              style={{ background: "var(--bg-banner)" }}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New skill</span>
            </button>
          </div>
        </div>

        {/* Tool sync notice if platform.claude.com agent doesn't have get_skill_guidance attached yet */}
        {needsToolSync && (
          <div
            className="rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-[12px]"
            style={{
              background: "var(--label-amber-bg)",
              border: "1px solid var(--label-amber-border)",
              color: "var(--label-amber-text)",
            }}
          >
            <div className="flex items-start gap-2">
              <Wrench className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Adham needs his latest CRM tools synced on platform.claude.com to read skills during live conversations.
              </span>
            </div>
            <button
              type="button"
              disabled={syncingTools}
              onClick={() => void handleSyncToolsClick()}
              className="min-h-[40px] sm:min-h-[34px] px-3 rounded-lg text-[11.5px] font-semibold text-white shrink-0 cursor-pointer disabled:opacity-50"
              style={{ background: "var(--bg-banner)" }}
            >
              {syncingTools ? "Syncing..." : "Sync CRM tools"}
            </button>
          </div>
        )}

        {feedback && (
          <div
            className="rounded-lg p-3 flex items-start gap-2 text-[12px]"
            style={{
              background: feedback.ok ? "var(--label-green-bg)" : "var(--label-red-bg)",
              border: `1px solid ${feedback.ok ? "var(--label-green-border)" : "var(--label-red-border)"}`,
              color: feedback.ok ? "var(--label-green-text)" : "var(--label-red-text)",
            }}
          >
            {feedback.ok ? (
              <Check className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span>{feedback.msg}</span>
          </div>
        )}

        {/* Quick Starter Templates */}
        {!editorOpen && (
          <div
            className="rounded-lg p-3 space-y-2"
            style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--border-main)",
            }}
          >
            <p className="text-[11px] font-semibold" style={{ color: "var(--text-secondary)" }}>
              Quick starter templates
            </p>
            <div className="flex flex-wrap gap-2">
              {SKILL_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.title}
                  type="button"
                  onClick={() => openCreate(tpl)}
                  className="inline-flex items-center gap-1.5 min-h-[38px] sm:min-h-[32px] px-3 rounded-lg text-[11.5px] font-medium cursor-pointer hover:bg-[var(--bg-hover)]"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-input)",
                    color: "var(--text-primary)",
                  }}
                >
                  <Plus className="w-3 h-3" style={{ color: "var(--bg-banner)" }} />
                  <span>{tpl.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Create / Edit Skill Form */}
      {editorOpen && (
        <section
          className="rounded-xl p-4 sm:p-5 space-y-4"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--label-blue-border)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-[13.5px] font-semibold" style={{ color: "var(--text-primary)" }}>
              {draft.id ? "Edit skill" : "Create new skill"}
            </h4>
            <button
              type="button"
              onClick={() => {
                setEditorOpen(false);
                setFormError(null);
              }}
              aria-label="Close skill form"
              className="min-w-[40px] min-h-[40px] sm:min-w-[32px] sm:min-h-[32px] inline-flex items-center justify-center rounded-lg cursor-pointer"
              style={{ color: "var(--text-secondary)" }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSaveSkill} className="space-y-3.5">
            <div>
              <label
                htmlFor="skill-title-input"
                className="block text-[11.5px] font-medium mb-1"
                style={{ color: "var(--text-secondary)" }}
              >
                Skill title
              </label>
              <input
                id="skill-title-input"
                type="text"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="e.g. Price-First Objection Handling"
                maxLength={120}
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
                htmlFor="skill-when-input"
                className="block text-[11.5px] font-medium mb-1"
                style={{ color: "var(--text-secondary)" }}
              >
                When should Adham use this skill?
              </label>
              <input
                id="skill-when-input"
                type="text"
                dir="auto"
                value={draft.whenToUse}
                onChange={(e) => setDraft({ ...draft, whenToUse: e.target.value })}
                placeholder="e.g. When a lead asks for pricing before sharing student age or branch."
                maxLength={400}
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
                htmlFor="skill-instructions-input"
                className="block text-[11.5px] font-medium mb-1"
                style={{ color: "var(--text-secondary)" }}
              >
                Instructions
              </label>
              <textarea
                id="skill-instructions-input"
                rows={5}
                dir="auto"
                value={draft.instructions}
                onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
                placeholder="Step-by-step guidance Adham should follow when this situation happens..."
                maxLength={8000}
                className="w-full p-3 text-[16px] sm:text-[13px] leading-relaxed rounded-lg outline-none"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-input)",
                  color: "var(--text-primary)",
                }}
              />
            </div>

            <div>
              <label
                htmlFor="skill-examples-input"
                className="block text-[11.5px] font-medium mb-1"
                style={{ color: "var(--text-secondary)" }}
              >
                Dialogue examples (optional)
              </label>
              <textarea
                id="skill-examples-input"
                rows={4}
                dir="auto"
                value={draft.examples}
                onChange={(e) => setDraft({ ...draft, examples: e.target.value })}
                placeholder={"Lead: ...\nAdham: ..."}
                maxLength={4000}
                className="w-full p-3 text-[16px] sm:text-[13px] leading-relaxed rounded-lg outline-none"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-input)",
                  color: "var(--text-primary)",
                }}
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <div>
                <p id="skill-active-switch-label" className="text-[12.5px] font-medium" style={{ color: "var(--text-primary)" }}>
                  Active in live conversations
                </p>
                <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  Turn off at any time without losing the skill.
                </p>
              </div>
              <ClaudeSettingSwitch
                checked={draft.enabled}
                disabled={saving}
                labelledBy="skill-active-switch-label"
                onToggle={() => setDraft({ ...draft, enabled: !draft.enabled })}
              />
            </div>

            {formError && (
              <p className="text-[12px] font-medium" style={{ color: "var(--label-red-text)" }}>
                {formError}
              </p>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setEditorOpen(false);
                  setFormError(null);
                }}
                className="min-h-[44px] sm:min-h-[38px] px-4 rounded-lg text-[12px] font-medium cursor-pointer"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-input)",
                  color: "var(--text-primary)",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="min-h-[44px] sm:min-h-[38px] px-4 rounded-lg text-[12px] font-semibold text-white cursor-pointer disabled:opacity-50"
                style={{ background: "var(--bg-banner)" }}
              >
                {saving ? "Saving..." : draft.id ? "Save skill" : "Create skill"}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Skills List */}
      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading skills">
          {[1, 2].map((k) => (
            <div
              key={k}
              className="rounded-xl p-4 animate-pulse space-y-2.5"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)" }}
            >
              <div className="h-4 w-48 rounded" style={{ background: "var(--bg-column)" }} />
              <div className="h-3 w-full max-w-md rounded" style={{ background: "var(--bg-column)" }} />
            </div>
          ))}
        </div>
      ) : loadError ? (
        <div
          className="rounded-xl p-5 space-y-3"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)" }}
        >
          <div className="flex items-start gap-2" style={{ color: "var(--label-red-text)" }}>
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="text-[13px] font-medium">{loadError}</p>
          </div>
          <button
            type="button"
            onClick={() => void fetchSkills({ force: true })}
            className="min-h-[44px] sm:min-h-[38px] px-4 rounded-lg text-[12px] font-semibold text-white cursor-pointer"
            style={{ background: "var(--bg-banner)" }}
          >
            Retry
          </button>
        </div>
      ) : skills.length === 0 ? (
        <div
          className="rounded-xl p-6 text-center space-y-2.5"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-main)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <BookOpen className="w-6 h-6 mx-auto" style={{ color: "var(--text-muted)" }} />
          <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
            No skills created yet
          </p>
          <p className="text-[12px] max-w-md mx-auto" style={{ color: "var(--text-secondary)" }}>
            Create a skill or click a quick starter template above to teach Adham how to handle recurring situations in live chats.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {skills.map((skill) => {
            const isBusy = busyId === skill._id;
            const lastUsedTs = skill.lastUsedAt ? new Date(skill.lastUsedAt).getTime() : 0;
            const lastUsedLabel = lastUsedTs ? formatLastMessageTime(lastUsedTs) : "";

            return (
              <article
                key={skill._id}
                className="rounded-xl p-4 space-y-3"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-main)",
                  boxShadow: "var(--shadow-card)",
                }}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-[13.5px] font-semibold" style={{ color: "var(--text-primary)" }}>
                        {skill.title}
                      </h4>
                      <ClaudeStatusPill
                        label={skill.enabled ? "Active" : "Off"}
                        tone={skill.enabled ? "green" : "slate"}
                      />
                      <span
                        className="text-[10.5px] font-mono px-2 py-0.5 rounded"
                        style={{ background: "var(--bg-pill)", color: "var(--text-secondary)" }}
                      >
                        {skill.slug}
                      </span>
                    </div>

                    <p dir="auto" className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      <strong style={{ color: "var(--text-primary)" }}>When used:</strong> {skill.whenToUse}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
                      <span>Used {skill.usageCount || 0} {skill.usageCount === 1 ? "time" : "times"} live</span>
                      {lastUsedLabel && <span>Last used {lastUsedLabel}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <ClaudeSettingSwitch
                      checked={skill.enabled}
                      disabled={isBusy}
                      labelledBy={`skill-title-${skill._id}`}
                      onToggle={() => void handleToggleEnabled(skill)}
                    />
                    <span id={`skill-title-${skill._id}`} className="sr-only">
                      Toggle {skill.title}
                    </span>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => openEdit(skill)}
                      className="inline-flex items-center gap-1 min-h-[40px] sm:min-h-[34px] px-3 rounded-md text-[11.5px] font-medium cursor-pointer disabled:opacity-50"
                      style={{
                        background: "var(--bg-input)",
                        border: "1px solid var(--border-input)",
                        color: "var(--text-primary)",
                      }}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>

                    {confirmDeleteId !== skill._id ? (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => setConfirmDeleteId(skill._id)}
                        aria-label={`Delete ${skill.title}`}
                        className="min-w-[40px] min-h-[40px] sm:min-w-[34px] sm:min-h-[34px] inline-flex items-center justify-center rounded-md cursor-pointer disabled:opacity-50"
                        style={{ color: "var(--label-red-text)" }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleDeleteSkill(skill)}
                          className="min-h-[40px] sm:min-h-[34px] px-2.5 rounded-md text-[11px] font-semibold cursor-pointer"
                          style={{
                            background: "var(--label-red-bg)",
                            border: "1px solid var(--label-red-border)",
                            color: "var(--label-red-text)",
                          }}
                        >
                          Delete {skill.title}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="min-h-[40px] sm:min-h-[34px] px-2 rounded-md text-[11px] cursor-pointer"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Expandable Instructions & Examples */}
                <details
                  className="rounded-lg overflow-hidden text-[12px]"
                  style={{
                    background: "var(--bg-panel)",
                    border: "1px solid var(--border-main)",
                  }}
                >
                  <summary className="px-3 py-2 cursor-pointer font-medium select-none hover:bg-[var(--bg-hover)]" style={{ color: "var(--text-secondary)" }}>
                    View instructions & examples
                  </summary>
                  <div
                    className="p-3 space-y-2.5"
                    style={{ borderTop: "1px solid var(--border-main)", background: "var(--bg-card)" }}
                  >
                    <div>
                      <p className="text-[10.5px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>
                        Instructions
                      </p>
                      <p dir="auto" className="whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text-primary)" }}>
                        {skill.instructions}
                      </p>
                    </div>
                    {skill.examples && (
                      <div className="pt-2" style={{ borderTop: "1px solid var(--border-main)" }}>
                        <p className="text-[10.5px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>
                          Examples
                        </p>
                        <p dir="auto" className="whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                          {skill.examples}
                        </p>
                      </div>
                    )}
                  </div>
                </details>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

