"use client";

import React from "react";
import { AlertCircle, RotateCcw } from "lucide-react";

interface MetricsErrorBannerProps {
  message: string;
  onRetry: () => void;
  className?: string;
}

/**
 * Displays a concise theme-tokenized error banner with an accessible retry button.
 */
export function MetricsErrorBanner({
  message,
  onRetry,
  className = "rounded-xl",
}: MetricsErrorBannerProps) {
  return (
    <div
      className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${className}`}
      style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)" }}
      role="alert"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <AlertCircle className="w-4 h-4 shrink-0" style={{ color: "var(--label-red-text)" }} />
        <p className="text-xs sm:text-[13px] truncate" style={{ color: "var(--text-primary)" }}>
          {message}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-[44px] sm:min-h-0 sm:h-8 px-3.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer transition-colors"
        style={{
          background: "var(--bg-pill)",
          border: "1px solid var(--border-input)",
          color: "var(--text-primary)",
        }}
      >
        <RotateCcw className="w-3.5 h-3.5" />
        <span>Retry</span>
      </button>
    </div>
  );
}

