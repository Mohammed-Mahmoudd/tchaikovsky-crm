"use client";

import React from "react";
import { Archive, ArchiveRestore, CheckCircle2, RotateCcw } from "lucide-react";

export type InboxBucketAction = "done" | "reopen" | "archive" | "unarchive";

interface InboxBucketActionsProps {
  isDone: boolean;
  isArchived: boolean;
  onAction: (action: InboxBucketAction) => void;
  variant: "header" | "mobile-bar" | "panel";
}

const VARIANT_CLASSES: Record<InboxBucketActionsProps["variant"], string> = {
  header: "px-2.5 py-1 text-[12px] rounded-[6px]",
  "mobile-bar": "flex-1 min-h-[44px] px-3 text-[12px] rounded-lg",
  panel: "flex-1 min-h-[44px] lg:min-h-[32px] px-2.5 py-1.5 text-[11px] rounded-[6px]",
};

export function InboxBucketActions({
  isDone,
  isArchived,
  onAction,
  variant,
}: InboxBucketActionsProps) {
  const sizeClasses = VARIANT_CLASSES[variant];
  const secondaryBg = variant === "panel" ? "var(--bg-input)" : "var(--bg-pill)";
  const iconSize = variant === "mobile-bar" ? "w-4 h-4 shrink-0" : "w-3.5 h-3.5 shrink-0";

  return (
    <>
      {isDone ? (
        <button
          type="button"
          onClick={() => onAction("reopen")}
          className={`inline-flex items-center justify-center gap-1.5 font-semibold transition-colors cursor-pointer hover:opacity-90 ${sizeClasses}`}
          style={{
            background: secondaryBg,
            border: "1px solid var(--border-input)",
            color: "var(--text-primary)",
          }}
          title="Move conversation back to main Inbox"
        >
          <RotateCcw className={iconSize} />
          <span>Reopen</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onAction("done")}
          className={`inline-flex items-center justify-center gap-1.5 font-semibold text-white bg-[#0066FF] hover:bg-[#0055D6] transition-colors cursor-pointer ${sizeClasses}`}
          title="Mark conversation as Done"
        >
          <CheckCircle2 className={iconSize} />
          <span>Mark as done</span>
        </button>
      )}

      {isArchived ? (
        <button
          type="button"
          onClick={() => onAction("unarchive")}
          className={`inline-flex items-center justify-center gap-1.5 font-semibold transition-colors cursor-pointer hover:opacity-90 ${sizeClasses}`}
          style={{
            background: secondaryBg,
            border: "1px solid var(--border-input)",
            color: "var(--text-primary)",
          }}
          title="Restore conversation to main Inbox"
        >
          <ArchiveRestore className={iconSize} />
          <span>Unarchive</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onAction("archive")}
          className={`inline-flex items-center justify-center gap-1.5 font-medium transition-colors cursor-pointer hover:opacity-90 ${sizeClasses}`}
          style={{
            background: secondaryBg,
            border: "1px solid var(--border-input)",
            color: "var(--text-secondary)",
          }}
          title="Archive conversation"
        >
          <Archive className={iconSize} />
          <span>Archive</span>
        </button>
      )}
    </>
  );
}

