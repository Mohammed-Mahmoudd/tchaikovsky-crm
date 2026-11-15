"use client";

import React from "react";

export interface ChatDateDividerProps {
  label: string;
}

/**
 * Centered WhatsApp-style date pill separating consecutive days in a chat thread.
 */
export function ChatDateDivider({ label }: ChatDateDividerProps) {
  if (!label) return null;

  return (
    <div
      role="separator"
      aria-label={label}
      className="flex items-center justify-center my-1 select-none"
    >
      <span
        className="px-3 py-1 rounded-full text-xs font-medium tracking-wide max-w-full truncate"
        style={{
          background: "var(--bg-card)",
          color: "var(--text-secondary)",
          border: "1px solid var(--border-main)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        {label}
      </span>
    </div>
  );
}

