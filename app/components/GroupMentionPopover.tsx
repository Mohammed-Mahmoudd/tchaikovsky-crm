"use client";

import React, { useEffect, useRef } from "react";
import { Users, RefreshCw, CornerDownLeft, Shield } from "lucide-react";
import type { GroupMetaInfo, MentionCandidate } from "../utils/groupMentions";

interface GroupMentionPopoverProps {
  isOpen: boolean;
  query: string;
  candidates: MentionCandidate[];
  activeIndex: number;
  isLoading?: boolean;
  groupMeta?: GroupMetaInfo | null;
  onSelect: (candidate: MentionCandidate) => void;
  onClose: () => void;
  onSetActiveIndex: (index: number) => void;
  onRefresh?: () => void;
}

function getInitials(name: string): string {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

export const GroupMentionPopover = React.memo(function GroupMentionPopover({
  isOpen,
  query,
  candidates,
  activeIndex,
  isLoading = false,
  groupMeta,
  onSelect,
  onClose,
  onSetActiveIndex,
  onRefresh,
}: GroupMentionPopoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [activeIndex]);

  if (!isOpen) return null;

  const cleanQuery = query.trim();

  return (
    <div
      ref={containerRef}
      role="listbox"
      aria-label="Mention group member"
      onMouseDown={(e) => {
        // Keep focus on the composer textarea so caret and keyboard navigation continue smoothly
        e.preventDefault();
      }}
      className="absolute bottom-full left-0 right-0 mb-2.5 mx-auto max-w-2xl rounded-2xl border shadow-2xl overflow-hidden z-40 animate-in fade-in slide-in-from-bottom-2 duration-150 select-none flex flex-col"
      style={{
        background: "var(--bg-card)",
        borderColor: "var(--border-main)",
        boxShadow: "0 -10px 32px -4px rgba(0, 0, 0, 0.22), 0 4px 12px rgba(0, 0, 0, 0.08)",
      }}
    >
      {/* ── Header ── */}
      <div
        className="px-3.5 sm:px-4 py-2.5 flex items-center justify-between border-b gap-2"
        style={{
          background: "var(--bg-panel)",
          borderColor: "var(--border-main)",
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[12.5px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
            Mention Member
          </span>
          {cleanQuery ? (
            <span
              className="text-[11px] font-mono px-2 py-0.5 rounded-full border truncate max-w-[140px]"
              style={{
                background: "var(--label-blue-bg)",
                borderColor: "var(--label-blue-border)",
                color: "var(--label-blue-text)",
              }}
            >
              @{cleanQuery}
            </span>
          ) : groupMeta?.size ? (
            <span
              className="text-[11px] px-1.5 py-0.5 rounded-full shrink-0"
              style={{
                background: "var(--bg-pill)",
                color: "var(--text-muted)",
              }}
            >
              {groupMeta.size}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onRefresh && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRefresh();
              }}
              disabled={isLoading}
              className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg border transition-colors cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50"
              style={{
                background: "var(--bg-pill)",
                borderColor: "var(--border-input)",
                color: "var(--text-secondary)",
              }}
              title="Refresh group member list from WhatsApp"
            >
              <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{isLoading ? "Syncing..." : "Refresh"}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] px-2 py-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
            style={{ color: "var(--text-secondary)" }}
          >
            Esc
          </button>
        </div>
      </div>

      {/* ── Candidates List ── */}
      <div
        className="max-h-[280px] sm:max-h-[320px] overflow-y-auto divide-y"
        style={{ borderColor: "var(--border-main)" }}
      >
        {isLoading && candidates.length <= 1 ? (
          <div className="p-5 text-center flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" style={{ color: "var(--text-muted)" }} />
            <p className="text-[12.5px] font-medium" style={{ color: "var(--text-secondary)" }}>
              Loading group members from WhatsApp...
            </p>
          </div>
        ) : candidates.length === 0 ? (
          <div className="p-5 text-center flex flex-col items-center justify-center gap-1.5">
            <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
              No members matching &ldquo;@{cleanQuery}&rdquo;
            </p>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="mt-1 inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"
                style={{
                  background: "var(--bg-pill)",
                  borderColor: "var(--border-input)",
                  color: "var(--text-primary)",
                }}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Sync Group Members</span>
              </button>
            )}
          </div>
        ) : (
          candidates.map((cand, idx) => {
            const isSelected = idx === activeIndex;
            const isAll = cand.kind === "all";
            return (
              <button
                key={cand.key}
                ref={isSelected ? activeItemRef : null}
                type="button"
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => onSetActiveIndex(idx)}
                onClick={() => onSelect(cand)}
                className={`w-full text-left px-3.5 sm:px-4 py-2.5 min-h-[44px] flex items-center justify-between gap-3 cursor-pointer transition-colors border-s-[3.5px] ${
                  isSelected
                    ? "border-s-[#0066FF] bg-[var(--bg-selected)]"
                    : "border-s-transparent hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold border"
                    style={
                      isAll
                        ? {
                            background: "var(--label-amber-bg)",
                            borderColor: "var(--label-amber-border)",
                            color: "var(--label-amber-text)",
                          }
                        : cand.isSelf
                        ? {
                            background: "var(--label-green-bg)",
                            borderColor: "var(--label-green-border)",
                            color: "var(--label-green-text)",
                          }
                        : {
                            background: "var(--label-blue-bg)",
                            borderColor: "var(--label-blue-border)",
                            color: "var(--label-blue-text)",
                          }
                    }
                  >
                    {isAll ? <Users className="w-4 h-4" /> : getInitials(cand.displayName)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        dir="auto"
                        className="text-[13px] font-semibold truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {isAll ? "@all" : cand.displayName}
                      </span>

                      {cand.admin && !isAll && (
                        <span
                          className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md border shrink-0"
                          style={{
                            background: "var(--label-teal-bg)",
                            borderColor: "var(--label-teal-border)",
                            color: "var(--label-teal-text)",
                          }}
                        >
                          <Shield className="w-2.5 h-2.5" />
                          <span>{cand.admin === "superadmin" ? "Owner" : "Admin"}</span>
                        </span>
                      )}

                      {cand.isSelf && !isAll && (
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md border shrink-0"
                          style={{
                            background: "var(--label-green-bg)",
                            borderColor: "var(--label-green-border)",
                            color: "var(--label-green-text)",
                          }}
                        >
                          You
                        </span>
                      )}
                    </div>

                    {cand.subtitle && (
                      <p
                        dir="auto"
                        className="text-[11.5px] truncate mt-0.5"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {cand.subtitle}
                      </p>
                    )}
                  </div>
                </div>

                {isSelected && (
                  <span
                    className="hidden sm:inline-flex items-center gap-1 text-[10.5px] font-medium px-1.5 py-0.5 rounded border shrink-0"
                    style={{
                      background: "var(--bg-pill)",
                      borderColor: "var(--border-input)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <CornerDownLeft className="w-3 h-3" />
                    <span>Enter</span>
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
});

