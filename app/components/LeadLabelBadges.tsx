"use client";

import React from "react";
import {
  type LeadLabel,
  getLeadLabelCssVars,
  partitionVisibleLabels,
  resolveConversationLabels,
} from "../utils/leadLabels";

interface LeadLabelBadgesProps {
  labelIds?: ReadonlyArray<string>;
  catalog: ReadonlyArray<LeadLabel>;
  maxVisible?: number;
  className?: string;
}

/**
 * Compact, theme-tokenized label pills displayed on Inbox conversation rows.
 */
export const LeadLabelBadges = React.memo(function LeadLabelBadges({
  labelIds,
  catalog,
  maxVisible = 3,
  className = "",
}: LeadLabelBadgesProps) {
  const resolved = resolveConversationLabels(labelIds, catalog);
  if (resolved.length === 0) return null;

  const { visible, overflow } = partitionVisibleLabels(resolved, maxVisible);
  const overflowSummary = overflow.map((item) => item.name).join(", ");

  return (
    <div className={`flex flex-wrap items-center gap-1 min-w-0 ${className}`}>
      {visible.map((label) => {
        const vars = getLeadLabelCssVars(label.color);
        return (
          <span
            key={label.id}
            title={label.name}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium leading-tight max-w-full min-w-0 border"
            style={{
              background: vars.background,
              borderColor: vars.borderColor,
              color: vars.color,
            }}
          >
            <span
              aria-hidden="true"
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: vars.dotColor }}
            />
            <span className="truncate max-w-[120px]">{label.name}</span>
          </span>
        );
      })}
      {overflow.length > 0 && (
        <span
          title={overflowSummary}
          aria-label={`${overflow.length} more labels: ${overflowSummary}`}
          className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-tight border shrink-0"
          style={{
            background: "var(--bg-pill)",
            borderColor: "var(--border-main)",
            color: "var(--text-secondary)",
          }}
        >
          +{overflow.length}
        </span>
      )}
    </div>
  );
});

