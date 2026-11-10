"use client";

import React, { useEffect, useRef } from "react";
import { Plus, Pencil, Trash2, CornerDownLeft } from "lucide-react";
import type { QuickReply } from "../utils/quickReplies";

interface FastRepliesPopoverProps {
  isOpen: boolean;
  query: string;
  replies: QuickReply[];
  activeIndex: number;
  onSelect: (reply: QuickReply) => void;
  onClose: () => void;
  onOpenCreate: (initialShortcut?: string) => void;
  onEditReply: (reply: QuickReply) => void;
  onDeleteReply: (id: string, shortcut: string) => void;
  onSetActiveIndex: (index: number) => void;
}

export const FastRepliesPopover = React.memo(function FastRepliesPopover({
  isOpen,
  query,
  replies,
  activeIndex,
  onSelect,
  onClose,
  onOpenCreate,
  onEditReply,
  onDeleteReply,
  onSetActiveIndex,
}: FastRepliesPopoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the active item into view when navigating with arrow keys
  useEffect(() => {
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [activeIndex]);

  if (!isOpen) return null;

  const cleanQuery = query.replace(/^\/+/, "").trim();

  return (
    <div
      ref={containerRef}
      onMouseDown={(e) => {
        // Prevent clicking inside the popover from taking focus away from textarea
        e.preventDefault();
      }}
      className="absolute bottom-full left-0 right-0 mb-2.5 mx-auto max-w-2xl rounded-2xl border shadow-2xl overflow-hidden z-40 animate-in fade-in slide-in-from-bottom-2 duration-150 select-none flex flex-col"
      style={{
        background: "var(--bg-card)",
        borderColor: "var(--border-main)",
        boxShadow: "0 -10px 32px -4px rgba(0, 0, 0, 0.22), 0 4px 12px rgba(0, 0, 0, 0.08)",
      }}
    >
      {/* ── Popover Header ────────────────────────────────────────── */}
      <div
        className="px-4 py-2.5 flex items-center justify-between border-b gap-3"
        style={{
          background: "var(--bg-panel)",
          borderColor: "var(--border-main)",
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[12.5px] font-semibold" style={{ color: "var(--text-primary)" }}>
            Fast Replies
          </span>
          {cleanQuery ? (
              <span
                className="text-[11px] font-mono px-2 py-0.5 rounded-full border truncate"
                style={{
                  background: "var(--bg-pill)",
                  borderColor: "var(--border-input)",
                  color: "#0066FF",
                }}
              >
                /{cleanQuery}
              </span>
            ) : (
              <span
                className="text-[11px] px-1.5 py-0.5 rounded-full"
                style={{
                  background: "var(--bg-pill)",
                  color: "var(--text-muted)",
                }}
              >
                {replies.length}
              </span>
            )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenCreate(cleanQuery || undefined);
            }}
            className="flex items-center gap-1 text-[11.5px] font-semibold px-2.5 py-1 rounded-lg transition-colors cursor-pointer text-white bg-[#0066FF] hover:bg-[#0055D6] shadow-xs active:scale-95"
            title="Add a new quick reply"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>New Reply</span>
          </button>
        </div>
      </div>

      {/* ── Replies List ─────────────────────────────────────────── */}
      <div
        className="max-h-[300px] sm:max-h-[340px] overflow-y-auto divide-y divide-[var(--border-main)]"
        style={{
          borderColor: "var(--border-main)",
        }}
      >
        {replies.length === 0 ? (
          <div className="p-6 text-center flex flex-col items-center justify-center gap-2">
            <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
              No quick replies matching &ldquo;/{cleanQuery}&rdquo;
            </p>
            <p className="text-[11.5px] max-w-xs" style={{ color: "var(--text-secondary)" }}>
              Create a quick reply for this shortcut to answer customers in one click.
            </p>
            <button
              type="button"
              onClick={() => onOpenCreate(cleanQuery)}
              className="mt-1 flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-[#0066FF] text-white hover:bg-[#0055D6] transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Create &ldquo;/{cleanQuery}&rdquo; Fast Reply</span>
            </button>
          </div>
        ) : (
          replies.map((reply, idx) => {
            const isSelected = idx === activeIndex;
            return (
              <div
                key={reply.id}
                ref={isSelected ? activeItemRef : null}
                onMouseEnter={() => onSetActiveIndex(idx)}
                onClick={() => onSelect(reply)}
                className={`group px-4 py-3 cursor-pointer transition-colors relative border-s-[3.5px] ${
                  isSelected
                    ? "border-s-[#0066FF] bg-[var(--bg-selected)]"
                    : "border-s-transparent hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {/* Header: Shortcut + Title + Category */}
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span
                        className="text-[13px] font-bold tracking-tight"
                        style={{ color: "var(--text-primary)" }}
                      >
                        /{reply.shortcut}
                      </span>

                      {reply.title && reply.title.toLowerCase() !== reply.shortcut.toLowerCase() && (
                        <span
                          className="text-[11.5px] font-medium truncate max-w-[200px]"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          · {reply.title}
                        </span>
                      )}

                      {reply.category && (
                        <span
                          className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded-md border"
                          style={{
                            background: "var(--bg-pill)",
                            borderColor: "var(--border-input)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {reply.category}
                        </span>
                      )}
                    </div>

                    {/* Preview Text */}
                    <p
                      dir="auto"
                      className="text-[12px] leading-relaxed line-clamp-3 whitespace-pre-wrap select-text font-normal"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {reply.text}
                    </p>
                  </div>

                  {/* Actions & Enter indicator */}
                  <div className="flex items-center gap-1 shrink-0 mt-0.5">
                    {/* Edit button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditReply(reply);
                      }}
                      title="Edit quick reply"
                      className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-opacity text-[var(--text-secondary)] hover:text-[#0066FF] cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteReply(reply.id, reply.shortcut);
                      }}
                      title="Delete quick reply"
                      className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-opacity text-[var(--text-secondary)] hover:text-red-500 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    {isSelected && (
                      <span
                        className="hidden sm:inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-md bg-[#0066FF] text-white shadow-xs select-none ms-1"
                        title="Press Enter to insert"
                      >
                        <span>Enter</span>
                        <CornerDownLeft className="w-2.5 h-2.5 stroke-[2.5]" />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Popover Footer (Keyboard hints) ───────────────────────── */}
      <div
        className="px-4 py-1.5 border-t flex items-center justify-between text-[11px]"
        style={{
          background: "var(--bg-panel)",
          borderColor: "var(--border-main)",
          color: "var(--text-muted)",
        }}
      >
        <div className="flex items-center gap-3">
          <span>
            <strong className="font-semibold text-[var(--text-secondary)]">↑↓</strong> Navigate
          </span>
          <span>·</span>
          <span>
            <strong className="font-semibold text-[var(--text-secondary)]">↵</strong> Insert
          </span>
          <span>·</span>
          <span>
            <strong className="font-semibold text-[var(--text-secondary)]">Esc</strong> Dismiss
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="hover:underline cursor-pointer"
        >
          Close
        </button>
      </div>
    </div>
  );
});
