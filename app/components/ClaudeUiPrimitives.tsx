"use client";

import React from "react";

export type ClaudePillTone = "green" | "amber" | "red" | "blue" | "slate";

/** Compact semantic status badge powered strictly by CRM theme tokens. */
export function ClaudeStatusPill({
  label,
  tone,
}: {
  label: string;
  tone: ClaudePillTone;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold shrink-0"
      style={{
        background: `var(--label-${tone}-bg)`,
        border: `1px solid var(--label-${tone}-border)`,
        color: `var(--label-${tone}-text)`,
      }}
    >
      <span
        aria-hidden="true"
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: `var(--label-${tone}-dot)` }}
      />
      <span>{label}</span>
    </span>
  );
}

/** Accessible 44x44 tap-target toggle switch using CRM banner and surface tokens. */
export function ClaudeSettingSwitch({
  checked,
  disabled = false,
  labelledBy,
  onToggle,
}: {
  checked: boolean;
  disabled?: boolean;
  labelledBy: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={onToggle}
      className={`inline-flex items-center justify-center min-w-[44px] min-h-[44px] -my-2 -me-1.5 shrink-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bg-banner)] ${
        disabled ? "opacity-45 cursor-not-allowed" : "cursor-pointer"
      }`}
    >
      <span
        className="relative w-11 h-6 rounded-full transition-colors duration-150 block"
        style={{
          background: checked ? "var(--bg-banner)" : "var(--bg-column)",
          border: `1px solid ${checked ? "var(--bg-banner)" : "var(--border-input)"}`,
        }}
      >
        <span
          className="absolute top-[2px] left-[2px] w-[18px] h-[18px] rounded-full transition-transform duration-150"
          style={{
            background: "var(--bg-card)",
            boxShadow: "var(--shadow-card)",
            transform: checked ? "translateX(20px)" : "translateX(0)",
          }}
        />
      </span>
    </button>
  );
}

