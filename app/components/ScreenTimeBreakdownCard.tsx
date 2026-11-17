"use client";

import React, { useMemo } from "react";
import { Activity, ChevronRight, Monitor } from "lucide-react";
import {
  buildScreenTimeRows,
  formatOnlineDuration,
  type ScreenTimeEntry,
} from "../utils/agentMetrics";

interface ScreenTimeBreakdownCardProps {
  title?: string;
  subtitle?: string;
  activeMs: number;
  connectedMs: number;
  screens?: ReadonlyArray<ScreenTimeEntry> | null;
  unsupported?: boolean;
  onOpenAudit?: () => void;
}

/**
 * Displays a focused, scannable breakdown of active CRM time across screens.
 */
export function ScreenTimeBreakdownCard({
  title = "Screen Activity",
  subtitle,
  activeMs,
  connectedMs,
  screens,
  unsupported = false,
  onOpenAudit,
}: ScreenTimeBreakdownCardProps) {
  const rows = useMemo(
    () => buildScreenTimeRows(screens, activeMs),
    [screens, activeMs]
  );

  return (
    <div
      className="p-4 sm:p-5 rounded-xl shadow-xs space-y-4"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-main)",
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4 shrink-0" style={{ color: "var(--text-secondary)" }} />
            <h3 className="text-[13px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
              {title}
            </h3>
          </div>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {subtitle ||
              (unsupported
                ? "Screen presence tracking starts once the server update is deployed"
                : `${formatOnlineDuration(activeMs)} active · ${formatOnlineDuration(connectedMs)} open`)}
          </p>
        </div>

        {onOpenAudit && !unsupported && (
          <button
            type="button"
            onClick={onOpenAudit}
            className="min-h-[44px] sm:min-h-0 sm:h-7 px-3 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bg-banner)] cursor-pointer shrink-0"
            style={{
              background: "var(--bg-pill)",
              border: "1px solid var(--border-input)",
              color: "var(--text-primary)",
            }}
          >
            <span>Full breakdown</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Per-Screen Time Breakdown */}
      {rows.length === 0 ? (
        <div
          className="py-4 px-3 rounded-lg flex items-center gap-2 text-[11px]"
          style={{ color: "var(--text-muted)", background: "var(--bg-panel)" }}
        >
          <Activity className="w-3.5 h-3.5 shrink-0" />
          <span>
            {unsupported
              ? "Per-screen durations will populate once the server is updated."
              : "No per-screen duration recorded in this period yet."}
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
          {rows.map((row) => {
            const barWidth =
              row.sharePct > 0
                ? Math.max(4, row.sharePct)
                : row.activeMs > 0
                  ? 4
                  : 0;
            const durationText =
              row.activeMs > 0 ? formatOnlineDuration(row.activeMs) : "Visited";
            return (
              <div key={row.screen} className="space-y-1.5 min-w-0">
                <div className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="font-medium truncate" style={{ color: "var(--text-primary)" }}>
                    {row.label}
                  </span>
                  <div className="flex items-center gap-2 shrink-0 tabular-nums">
                    <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                      {durationText}
                    </span>
                    <span className="text-[11px] w-9 text-right" style={{ color: "var(--text-secondary)" }}>
                      {row.activeMs > 0 ? `${row.sharePct}%` : "—"}
                    </span>
                  </div>
                </div>
                <div
                  className="w-full h-1.5 rounded-full overflow-hidden"
                  style={{ background: "var(--bg-pill)" }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${barWidth}%`,
                      background: "var(--bg-banner)",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
