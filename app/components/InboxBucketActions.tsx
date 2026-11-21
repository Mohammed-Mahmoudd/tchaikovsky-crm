"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  ChevronDown,
  Download,
  Loader2,
  RotateCcw,
} from "lucide-react";

export type InboxBucketAction = "done" | "reopen" | "archive" | "unarchive";

interface InboxBucketActionsProps {
  conversationId: string;
  isDone: boolean;
  isArchived: boolean;
  canManageBuckets?: boolean;
  canDownload?: boolean;
  isDownloading?: boolean;
  onAction: (action: InboxBucketAction) => void;
  onDownload: () => void;
}

/**
 * Dropdown menu combining conversation bucket actions (Mark as done / Archive)
 * and instant conversation transcript export at the bottom.
 * Keyed by `conversationId` so switching conversations resets menu state cleanly.
 */
export function InboxBucketActions(props: InboxBucketActionsProps) {
  return <InboxBucketActionsInner key={props.conversationId} {...props} />;
}

function InboxBucketActionsInner({
  isDone,
  isArchived,
  canManageBuckets = true,
  canDownload = true,
  isDownloading = false,
  onAction,
  onDownload,
}: InboxBucketActionsProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown, { passive: true });
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const focusMenuItem = (index: number) => {
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]:not(:disabled)'
    );
    if (!items || items.length === 0) return;
    const bounded = ((index % items.length) + items.length) % items.length;
    items[bounded]?.focus();
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        requestAnimationFrame(() => {
          focusMenuItem(e.key === "ArrowUp" ? -1 : 0);
        });
      } else {
        focusMenuItem(e.key === "ArrowUp" ? -1 : 0);
      }
    }
  };

  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]:not(:disabled)'
    );
    if (!items || items.length === 0) return;
    const list = Array.from(items);
    const activeIndex = list.indexOf(document.activeElement as HTMLButtonElement);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusMenuItem(activeIndex < 0 ? 0 : activeIndex + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusMenuItem(activeIndex < 0 ? list.length - 1 : activeIndex - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusMenuItem(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusMenuItem(list.length - 1);
    }
  };

  const handleBucketSelect = (action: InboxBucketAction) => {
    setOpen(false);
    onAction(action);
  };

  const handleDownloadSelect = () => {
    if (isDownloading) return;
    setOpen(false);
    onDownload();
  };

  const menuItemClass =
    "w-full min-h-[44px] sm:min-h-[34px] px-2.5 py-2 sm:py-1.5 rounded-lg text-[12px] font-medium flex items-center gap-2.5 text-start transition-colors cursor-pointer hover:bg-[var(--bg-hover)] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--bg-banner)]";

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleTriggerKeyDown}
        title="Conversation actions"
        className="min-h-[44px] sm:min-h-[27px] px-2.5 py-1 rounded-[6px] text-[12px] font-medium inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bg-banner)]"
        style={{
          background: open ? "var(--bg-selected)" : "var(--bg-input)",
          border: open
            ? "1px solid var(--bg-banner)"
            : "1px solid var(--border-input)",
          color: "var(--text-primary)",
        }}
      >
        <span>Actions</span>
        <ChevronDown
          className={`w-3.5 h-3.5 opacity-75 shrink-0 transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Conversation actions"
          onKeyDown={handleMenuKeyDown}
          className="absolute end-0 top-[calc(100%+6px)] z-50 w-56 max-w-[calc(100vw-1.5rem)] rounded-xl p-1.5 shadow-2xl flex flex-col gap-0.5"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-main)",
          }}
        >
          {canManageBuckets && (
            <>
              {isDone ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleBucketSelect("reopen")}
                  className={menuItemClass}
                  style={{ color: "var(--text-primary)" }}
                  title="Move conversation back to main Inbox"
                >
                  <RotateCcw
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: "var(--text-secondary)" }}
                  />
                  <span className="truncate">Reopen</span>
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleBucketSelect("done")}
                  className={menuItemClass}
                  style={{ color: "var(--text-primary)" }}
                  title="Mark conversation as Done"
                >
                  <CheckCircle2
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: "var(--bg-banner)" }}
                  />
                  <span className="truncate">Mark as done</span>
                </button>
              )}

              {isArchived ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleBucketSelect("unarchive")}
                  className={menuItemClass}
                  style={{ color: "var(--text-primary)" }}
                  title="Restore conversation to main Inbox"
                >
                  <ArchiveRestore
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: "var(--text-secondary)" }}
                  />
                  <span className="truncate">Unarchive</span>
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleBucketSelect("archive")}
                  className={menuItemClass}
                  style={{ color: "var(--text-primary)" }}
                  title="Archive conversation"
                >
                  <Archive
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: "var(--text-secondary)" }}
                  />
                  <span className="truncate">Archive</span>
                </button>
              )}

              {canDownload && (
                <div
                  role="separator"
                  className="my-1 border-t"
                  style={{ borderColor: "var(--border-main)" }}
                />
              )}
            </>
          )}

          {canDownload && (
            <button
              type="button"
              role="menuitem"
              disabled={isDownloading}
              onClick={handleDownloadSelect}
              className={menuItemClass}
              style={{ color: "var(--text-primary)" }}
              title="Download full conversation transcript (.txt)"
            >
              {isDownloading ? (
                <Loader2
                  className="w-3.5 h-3.5 shrink-0 animate-spin"
                  style={{ color: "var(--bg-banner)" }}
                />
              ) : (
                <Download
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: "var(--text-secondary)" }}
                />
              )}
              <span className="truncate">
                {isDownloading ? "Downloading..." : "Download conversation"}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
