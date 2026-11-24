"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, Layers, MapPin, ShieldCheck, Sparkles } from "lucide-react";
import { useAgentCore } from "../../context/AgentWorkspaceContext";
import {
  type AgentStudioSection,
  AGENT_CACHE_KEYS,
  readAgentMemorySnapshot,
  resolveAgentStudioSection,
} from "../../utils/agentWorkspaceCache";
import type { ClaudeSkillItem } from "../../utils/claudeAgent";
import { ClaudeSkillsPanel } from "../ClaudeSkillsPanel";
import { AgentBranchesSection } from "./AgentBranchesSection";
import { AgentPlaybookSection } from "./AgentPlaybookSection";
import { AgentRulesSection } from "./AgentRulesSection";

const SECTIONS: ReadonlyArray<{
  id: AgentStudioSection;
  label: string;
  caption: string;
}> = [
  { id: "playbook", label: "Playbook & Model", caption: "Instructions and AI model" },
  { id: "skills", label: "Skills", caption: "On-demand chat guidance" },
  { id: "rules", label: "Rules & Guardrails", caption: "Handoff & escalation rules" },
  { id: "branches", label: "Branches & Slots", caption: "Map pins & discovery times" },
];

function renderSectionIcon(id: AgentStudioSection) {
  const cls = "w-4 h-4 shrink-0";
  switch (id) {
    case "playbook":
      return <Layers className={cls} />;
    case "skills":
      return <BookOpen className={cls} />;
    case "rules":
      return <ShieldCheck className={cls} />;
    case "branches":
      return <MapPin className={cls} />;
  }
}

/**
 * Structured configuration workspace for Adham AI with a sticky desktop section rail,
 * mobile horizontal pill navigation, and URL-synced sections (`?section=`).
 */
export function AgentStudioWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlSection = resolveAgentStudioSection(searchParams.get("section"));

  const { statusData, settingsDraft, handleSyncToolsOnly, openSandbox } = useAgentCore();

  const [section, setSection] = useState<AgentStudioSection>(urlSection);
  const [activeSkillsCount, setActiveSkillsCount] = useState<number | null>(() => {
    const snap = readAgentMemorySnapshot<ClaudeSkillItem[]>(AGENT_CACHE_KEYS.skills);
    return snap ? snap.filter((s) => s.enabled).length : null;
  });

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setSection(urlSection);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [urlSection]);

  const switchSection = useCallback(
    (next: AgentStudioSection) => {
      setSection(next);
      router.replace(
        next === "playbook" ? "/agent/studio" : `/agent/studio?section=${next}`,
        { scroll: false }
      );
    },
    [router]
  );

  const handleSkillsCountChange = useCallback((activeCount: number) => {
    setActiveSkillsCount(activeCount);
  }, []);

  const activeBranchesCount = settingsDraft
    ? settingsDraft.branches.filter((b) => b.active !== false).length
    : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[232px_minmax(0,1fr)] gap-5 items-start">
      {/* Mobile / Tablet Horizontal Section Switcher */}
      <nav
        aria-label="Studio sections"
        className="lg:hidden flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1"
      >
        {SECTIONS.map((item) => {
          const active = section === item.id;
          const badge =
            item.id === "skills"
              ? activeSkillsCount
              : item.id === "branches"
              ? activeBranchesCount
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
      </nav>

      {/* Desktop Sticky Section Rail */}
      <aside
        aria-label="Studio sections"
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
            item.id === "skills"
              ? activeSkillsCount
              : item.id === "branches"
              ? activeBranchesCount
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
          <p className="text-[10.5px] font-medium px-2" style={{ color: "var(--text-muted)" }}>
            Verify changes
          </p>
          <button
            type="button"
            onClick={openSandbox}
            className="w-full inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3 rounded-lg text-[12px] font-semibold cursor-pointer hover:bg-[var(--bg-hover)]"
            style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--border-input)",
              color: "var(--text-primary)",
            }}
          >
            <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--bg-banner)" }} />
            <span>Test in Sandbox</span>
          </button>
        </div>
      </aside>

      {/* Active Studio Section Pane */}
      <div className="min-w-0">
        {section === "playbook" && <AgentPlaybookSection />}
        {section === "skills" && (
          <ClaudeSkillsPanel
            platformAgent={statusData?.platformAgent ?? null}
            hasAgentId={Boolean(statusData?.connection.hasAgentId)}
            onSyncTools={handleSyncToolsOnly}
            onCountChange={handleSkillsCountChange}
          />
        )}
        {section === "rules" && <AgentRulesSection />}
        {section === "branches" && <AgentBranchesSection />}
      </div>
    </div>
  );
}

