"use client";

import React from "react";
import { AlertCircle } from "lucide-react";

/** Shared loading skeleton matching Agent workspace cards. */
export function AgentWorkspaceLoading({ label = "Loading Agent configuration" }: { label?: string }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label={label}>
      {[1, 2, 3].map((k) => (
        <div
          key={k}
          className="rounded-xl p-5 animate-pulse space-y-3"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)" }}
        >
          <div className="h-4 w-48 rounded" style={{ background: "var(--bg-column)" }} />
          <div className="h-3 w-full max-w-md rounded" style={{ background: "var(--bg-column)" }} />
          <div className="h-10 w-full rounded" style={{ background: "var(--bg-column)" }} />
        </div>
      ))}
    </div>
  );
}

/** Shared retry banner when an initial Agent API fetch fails without cached data. */
export function AgentWorkspaceError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      className="rounded-xl p-5 space-y-3"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)" }}
    >
      <div className="flex items-start gap-2" style={{ color: "var(--label-red-text)" }}>
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        <p className="text-[13px] font-medium">{message}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-[44px] sm:min-h-[40px] px-4 rounded-lg text-[12px] font-semibold text-white cursor-pointer"
        style={{ background: "var(--bg-banner)" }}
      >
        Retry
      </button>
    </div>
  );
}

