"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useAgentCore } from "../../context/AgentWorkspaceContext";
import {
  type ClaudeBranchConfig,
  formatClosedDatesInput,
  formatSlotListInput,
  parseClosedDatesInput,
  parseSlotListInput,
} from "../../utils/claudeAgent";
import { ClaudeStatusPill } from "../ClaudeUiPrimitives";
import { AgentWorkspaceError, AgentWorkspaceLoading } from "./AgentShellHelpers";

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

  const label = branch.displayName || branch.branchName || `Branch ${index + 1}`;

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
                {label}
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
              aria-label={`Remove ${label}`}
              className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] inline-flex items-center justify-center rounded-md text-[11px] font-medium cursor-pointer"
              style={{ color: "var(--label-red-text)" }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onRemove}
                className="min-h-[40px] sm:min-h-[34px] px-2.5 rounded-md text-[11px] font-semibold cursor-pointer"
                style={{
                  background: "var(--label-red-bg)",
                  border: "1px solid var(--label-red-border)",
                  color: "var(--label-red-text)",
                }}
              >
                Remove {label}
              </button>
              <button
                type="button"
                onClick={() => setConfirmRemove(false)}
                className="min-h-[40px] sm:min-h-[34px] px-2 rounded-md text-[11px] cursor-pointer"
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
                className="w-full min-h-[40px] sm:min-h-[38px] px-2.5 text-[16px] sm:text-[12px] rounded-md outline-none"
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
                className="w-full min-h-[40px] sm:min-h-[38px] px-2.5 text-[16px] sm:text-[12px] rounded-md outline-none"
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
                className="w-full min-h-[40px] sm:min-h-[38px] px-2.5 text-[16px] sm:text-[12px] rounded-md outline-none"
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
                className="w-full min-h-[40px] sm:min-h-[38px] px-2.5 text-[16px] sm:text-[12px] rounded-md outline-none"
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
                className="w-full min-h-[40px] sm:min-h-[38px] px-2.5 text-[16px] sm:text-[12px] rounded-md outline-none"
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
                className="w-full min-h-[40px] sm:min-h-[38px] px-2.5 text-[16px] sm:text-[12px] rounded-md outline-none"
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
                className="w-full min-h-[40px] sm:min-h-[38px] px-2.5 text-[16px] sm:text-[12px] rounded-md outline-none"
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
                className="w-full min-h-[40px] sm:min-h-[38px] px-2.5 text-[16px] sm:text-[12px] rounded-md outline-none"
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
                className="w-full min-h-[40px] sm:min-h-[38px] px-2.5 text-[16px] sm:text-[12px] rounded-md outline-none"
                style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)", color: "var(--text-primary)" }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Studio section for configuring branch map pins, school managers, and Discovery Session slots.
 */
export function AgentBranchesSection() {
  const {
    loadingStatus,
    loadError,
    statusData,
    settingsDraft,
    updateSettingsDraft,
    savingBranches,
    branchesFeedback,
    fetchStatus,
    handleSaveBranches,
  } = useAgentCore();

  const [expandedBranchKeys, setExpandedBranchKeys] = useState<Set<string>>(() => new Set());

  if (loadingStatus && !statusData) {
    return <AgentWorkspaceLoading label="Loading Branches and Slots" />;
  }

  if (loadError && (!statusData || !settingsDraft)) {
    return (
      <AgentWorkspaceError
        message={loadError || "Could not load branch rules."}
        onRetry={() => void fetchStatus({ force: true })}
      />
    );
  }

  if (!statusData || !settingsDraft) {
    return <AgentWorkspaceLoading label="Loading Branches and Slots" />;
  }

  return (
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
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
            Branches, School Managers, and Discovery Slots
          </h2>
          <p className="text-[11.5px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Click a branch row to edit map pins, landmarks, managers, and available audition slots.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            const nextIndex = settingsDraft.branches.length;
            const newKey = `branch-${nextIndex}`;
            updateSettingsDraft((prev) => ({
              ...prev,
              branches: [
                ...prev.branches,
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
            }));
            setExpandedBranchKeys((prev) => new Set(prev).add(newKey));
          }}
          className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-[38px] px-3 rounded-lg text-[12px] font-medium cursor-pointer hover:bg-[var(--bg-hover)]"
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

      <form onSubmit={(e) => void handleSaveBranches(e)} className="space-y-2.5">
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
                onChange={(next) =>
                  updateSettingsDraft((prev) => {
                    const updated = [...prev.branches];
                    updated[idx] = next;
                    return { ...prev, branches: updated };
                  })
                }
                onRemove={() =>
                  updateSettingsDraft((prev) => ({
                    ...prev,
                    branches: prev.branches.filter((_, i) => i !== idx),
                  }))
                }
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
            className="min-h-[44px] sm:min-h-[40px] px-4 rounded-lg text-[12px] font-semibold text-white cursor-pointer disabled:opacity-50"
            style={{ background: "var(--bg-banner)" }}
          >
            {savingBranches ? "Saving..." : "Save branch rules"}
          </button>
        </div>
      </form>
    </section>
  );
}

