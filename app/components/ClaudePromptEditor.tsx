"use client";

import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Code2, Edit3, Eye, Plus, Trash2 } from "lucide-react";
import {
  type PromptSection,
  countSectionItems,
  parsePromptSections,
  parseSectionLines,
  serializePromptSections,
} from "../utils/claudePromptSections";

interface ClaudePromptEditorProps {
  value: string;
  onChange: (nextPrompt: string) => void;
  defaultPrompt: string;
  defaultName: string;
  onResetToDefaults: (name: string, system: string) => void;
}

/**
 * Structured, easy-to-read editor for Adham's Playbook instructions.
 * Renders clean readable cards by default while offering a 1-click Raw Prompt mode.
 */
export function ClaudePromptEditor({
  value,
  onChange,
  defaultPrompt,
  defaultName,
  onResetToDefaults,
}: ClaudePromptEditorProps) {
  const [viewMode, setViewMode] = useState<"readable" | "raw">("readable");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const sections = useMemo(() => parsePromptSections(value), [value]);

  const toggleSectionCollapse = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpandedIds(new Set(sections.map((s) => s.id)));
  const collapseAll = () => setExpandedIds(new Set());

  const startEditingSection = (sec: PromptSection) => {
    setEditingId(sec.id);
    setDraftTitle(sec.title);
    setDraftBody(sec.body);
    setConfirmRemoveId(null);
    setExpandedIds((prev) => {
      if (prev.has(sec.id)) return prev;
      const next = new Set(prev);
      next.add(sec.id);
      return next;
    });
  };

  const applySectionEdit = (secId: string) => {
    const updated = sections.map((sec) => {
      if (sec.id !== secId) return sec;
      return {
        ...sec,
        title: sec.isIntro ? sec.title : draftTitle.trim() || sec.title,
        body: draftBody.trim(),
      };
    });
    onChange(serializePromptSections(updated));
    setEditingId(null);
  };

  const removeSection = (secId: string) => {
    const updated = sections.filter((s) => s.id !== secId);
    onChange(serializePromptSections(updated));
    setConfirmRemoveId(null);
    if (editingId === secId) setEditingId(null);
  };

  const addSection = () => {
    const nextSections: PromptSection[] = [
      ...sections,
      {
        id: `sec-new-${Date.now()}`,
        title: "New Section",
        isIntro: false,
        body: "- Add clear rule or guidance here.",
      },
    ];
    onChange(serializePromptSections(nextSections));
    const added = parsePromptSections(serializePromptSections(nextSections)).at(-1);
    if (added) {
      startEditingSection(added);
    }
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11.5px] font-semibold" style={{ color: "var(--text-primary)" }}>
            Playbook Instructions
          </span>
          <span
            className="px-2 py-0.5 rounded-full text-[10.5px] font-medium"
            style={{ background: "var(--bg-pill)", color: "var(--text-secondary)" }}
          >
            {sections.length} {sections.length === 1 ? "section" : "sections"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Mode Switcher */}
          <div
            className="inline-flex rounded-lg p-0.5"
            style={{
              background: "var(--bg-input)",
              border: "1px solid var(--border-input)",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setViewMode("readable");
              }}
              className="inline-flex items-center gap-1.5 min-h-[34px] px-2.5 rounded-md text-[11px] font-semibold cursor-pointer"
              style={
                viewMode === "readable"
                  ? { background: "var(--bg-card)", color: "var(--text-primary)", boxShadow: "var(--shadow-card)" }
                  : { color: "var(--text-secondary)" }
              }
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Readable view</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setViewMode("raw");
              }}
              className="inline-flex items-center gap-1.5 min-h-[34px] px-2.5 rounded-md text-[11px] font-semibold cursor-pointer"
              style={
                viewMode === "raw"
                  ? { background: "var(--bg-card)", color: "var(--text-primary)", boxShadow: "var(--shadow-card)" }
                  : { color: "var(--text-secondary)" }
              }
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Raw prompt</span>
            </button>
          </div>

          {!confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="text-[11px] font-medium hover:underline cursor-pointer px-1"
              style={{ color: "var(--bg-banner)" }}
            >
              Reset to default Playbook
            </button>
          ) : (
            <div className="flex items-center gap-2 text-[11px]">
              <span style={{ color: "var(--text-secondary)" }}>Replace current text?</span>
              <button
                type="button"
                onClick={() => {
                  onResetToDefaults(defaultName, defaultPrompt);
                  setEditingId(null);
                  setConfirmReset(false);
                }}
                className="font-semibold cursor-pointer hover:underline"
                style={{ color: "var(--bg-banner)" }}
              >
                Yes, reset
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="cursor-pointer"
                style={{ color: "var(--text-muted)" }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {viewMode === "raw" ? (
        <textarea
          id="claude-system-prompt"
          rows={16}
          dir="auto"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full p-3 text-[16px] sm:text-[12.5px] leading-relaxed rounded-lg outline-none font-mono"
          style={{
            background: "var(--bg-input)",
            border: "1px solid var(--border-input)",
            color: "var(--text-primary)",
          }}
        />
      ) : (
        <div className="space-y-2.5">
          {/* Expand/Collapse Quick Bar */}
          <div className="flex items-center justify-between gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
            <span>Click any section to edit individual rules without touching markdown syntax.</span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={expandAll}
                className="hover:underline cursor-pointer"
                style={{ color: "var(--text-secondary)" }}
              >
                Expand all
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={collapseAll}
                className="hover:underline cursor-pointer"
                style={{ color: "var(--text-secondary)" }}
              >
                Collapse all
              </button>
            </div>
          </div>

          {sections.map((sec) => {
            const isCollapsed = !expandedIds.has(sec.id);
            const isEditing = editingId === sec.id;
            const blocks = parseSectionLines(sec.body);
            const itemCount = countSectionItems(sec.body);

            return (
              <div
                key={sec.id}
                className="rounded-xl overflow-hidden"
                style={{
                  background: "var(--bg-panel)",
                  border: `1px solid ${isEditing ? "var(--label-blue-border)" : "var(--border-main)"}`,
                }}
              >
                {/* Section Header */}
                <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => toggleSectionCollapse(sec.id)}
                    className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer py-0.5"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "var(--text-secondary)" }} />
                    ) : (
                      <ChevronDown className="w-4 h-4 shrink-0" style={{ color: "var(--text-secondary)" }} />
                    )}
                    <span className="text-[13px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                      {sec.title}
                    </span>
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0"
                      style={{ background: "var(--bg-card)", color: "var(--text-secondary)", border: "1px solid var(--border-main)" }}
                    >
                      {itemCount} {itemCount === 1 ? "item" : "items"}
                    </span>
                  </button>

                  {!isEditing && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEditingSection(sec)}
                        className="inline-flex items-center gap-1 min-h-[36px] sm:min-h-[30px] px-2.5 rounded-md text-[11px] font-medium cursor-pointer"
                        style={{
                          background: "var(--bg-card)",
                          border: "1px solid var(--border-input)",
                          color: "var(--text-primary)",
                        }}
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Edit</span>
                      </button>

                      {!sec.isIntro && confirmRemoveId !== sec.id && (
                        <button
                          type="button"
                          onClick={() => setConfirmRemoveId(sec.id)}
                          aria-label={`Remove ${sec.title}`}
                          className="min-w-[36px] min-h-[36px] sm:min-w-[30px] sm:min-h-[30px] inline-flex items-center justify-center rounded-md cursor-pointer"
                          style={{ color: "var(--label-red-text)" }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {confirmRemoveId === sec.id && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => removeSection(sec.id)}
                            className="min-h-[32px] px-2 rounded text-[11px] font-semibold cursor-pointer"
                            style={{
                              background: "var(--label-red-bg)",
                              border: "1px solid var(--label-red-border)",
                              color: "var(--label-red-text)",
                            }}
                          >
                            Remove
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRemoveId(null)}
                            className="min-h-[32px] px-1.5 text-[11px] cursor-pointer"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Section Body */}
                {!isCollapsed && (
                  <div
                    className="px-3.5 py-3 space-y-2.5"
                    style={{
                      background: "var(--bg-card)",
                      borderTop: "1px solid var(--border-main)",
                    }}
                  >
                    {isEditing ? (
                      <div className="space-y-2.5">
                        {!sec.isIntro && (
                          <div>
                            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                              Section title
                            </label>
                            <input
                              type="text"
                              value={draftTitle}
                              onChange={(e) => setDraftTitle(e.target.value)}
                              className="w-full min-h-[40px] sm:min-h-[36px] px-2.5 text-[16px] sm:text-[12.5px] font-semibold rounded-lg outline-none"
                              style={{
                                background: "var(--bg-input)",
                                border: "1px solid var(--border-input)",
                                color: "var(--text-primary)",
                              }}
                            />
                          </div>
                        )}
                        <div>
                          <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                            Section rules & details
                          </label>
                          <textarea
                            rows={Math.min(14, Math.max(4, draftBody.split("\n").length + 1))}
                            dir="auto"
                            value={draftBody}
                            onChange={(e) => setDraftBody(e.target.value)}
                            className="w-full p-2.5 text-[16px] sm:text-[12.5px] leading-relaxed rounded-lg outline-none"
                            style={{
                              background: "var(--bg-input)",
                              border: "1px solid var(--border-input)",
                              color: "var(--text-primary)",
                            }}
                          />
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="min-h-[40px] sm:min-h-[34px] px-3 rounded-lg text-[11.5px] font-medium cursor-pointer"
                            style={{
                              background: "var(--bg-input)",
                              border: "1px solid var(--border-input)",
                              color: "var(--text-primary)",
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => applySectionEdit(sec.id)}
                            className="min-h-[40px] sm:min-h-[34px] px-3.5 rounded-lg text-[11.5px] font-semibold text-white cursor-pointer"
                            style={{ background: "var(--bg-banner)" }}
                          >
                            Done editing
                          </button>
                        </div>
                      </div>
                    ) : blocks.length === 0 ? (
                      <p className="text-[12px] italic" style={{ color: "var(--text-muted)" }}>
                        Empty section. Click Edit to add instructions.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {blocks.map((block, bIdx) => {
                          if (block.kind === "numbered") {
                            return (
                              <div
                                key={`${sec.id}-b-${bIdx}`}
                                className="flex items-start gap-2.5 rounded-lg p-2.5"
                                style={{
                                  background: "var(--bg-panel)",
                                  border: "1px solid var(--border-main)",
                                }}
                              >
                                <span
                                  className="w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5 tabular-nums"
                                  style={{
                                    background: "var(--label-blue-bg)",
                                    color: "var(--label-blue-text)",
                                  }}
                                >
                                  {block.index}
                                </span>
                                <div className="min-w-0 flex-1 space-y-1.5 text-[12.5px] leading-relaxed">
                                  <p dir="auto" style={{ color: "var(--text-primary)" }}>
                                    {block.label && (
                                      <strong className="font-semibold me-1">{block.label}:</strong>
                                    )}
                                    <span style={{ color: block.label ? "var(--text-secondary)" : "var(--text-primary)" }}>
                                      {block.text}
                                    </span>
                                  </p>
                                  {block.children.length > 0 && (
                                    <ul className="space-y-1 ps-3" style={{ borderInlineStart: "2px solid var(--border-input)" }}>
                                      {block.children.map((child, cIdx) => (
                                        <li
                                          key={`${sec.id}-b-${bIdx}-c-${cIdx}`}
                                          dir="auto"
                                          className="text-[12px]"
                                          style={{ color: "var(--text-secondary)" }}
                                        >
                                          {child}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              </div>
                            );
                          }

                          if (block.kind === "bullet") {
                            return (
                              <div
                                key={`${sec.id}-b-${bIdx}`}
                                className="flex items-start gap-2.5 px-1 py-0.5 text-[12.5px] leading-relaxed"
                              >
                                <span
                                  aria-hidden="true"
                                  className="w-1.5 h-1.5 rounded-full shrink-0 mt-2"
                                  style={{ background: "var(--bg-banner)" }}
                                />
                                <div className="min-w-0 flex-1 space-y-1.5">
                                  <p dir="auto" style={{ color: "var(--text-primary)" }}>
                                    {block.label && (
                                      <strong className="font-semibold me-1">{block.label}:</strong>
                                    )}
                                    <span style={{ color: block.label ? "var(--text-secondary)" : "var(--text-primary)" }}>
                                      {block.text}
                                    </span>
                                  </p>
                                  {block.children.length > 0 && (
                                    <div className="grid grid-cols-1 gap-1.5 pt-0.5">
                                      {block.children.map((child, cIdx) => (
                                        <div
                                          key={`${sec.id}-b-${bIdx}-c-${cIdx}`}
                                          dir="auto"
                                          className="rounded-md px-2.5 py-1.5 text-[12px]"
                                          style={{
                                            background: "var(--bg-panel)",
                                            border: "1px solid var(--border-main)",
                                            color: "var(--text-secondary)",
                                          }}
                                        >
                                          {child}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          }

                          return (
                            <p
                              key={`${sec.id}-b-${bIdx}`}
                              dir="auto"
                              className="text-[13px] leading-relaxed px-1"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {block.label && (
                                <strong className="font-semibold me-1">{block.label}:</strong>
                              )}
                              <span style={{ color: block.label ? "var(--text-secondary)" : "var(--text-primary)" }}>
                                {block.text}
                              </span>
                            </p>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={addSection}
            className="inline-flex items-center gap-1.5 min-h-[40px] sm:min-h-[34px] px-3 rounded-lg text-[11.5px] font-medium cursor-pointer"
            style={{
              background: "var(--bg-input)",
              border: "1px solid var(--border-input)",
              color: "var(--text-primary)",
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add section</span>
          </button>
        </div>
      )}
    </div>
  );
}

