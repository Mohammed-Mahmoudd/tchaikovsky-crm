"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, Monitor, Search, Users, X } from "lucide-react";
import {
  buildScreenTimeRows,
  formatOnlineDuration,
  formatPresenceWithScreen,
  getPresenceStatusMeta,
  type AgentPerformanceStats,
  type TeamPerformanceSummary,
} from "../utils/agentMetrics";

interface ScreenTimeAuditModalProps {
  agents: ReadonlyArray<AgentPerformanceStats>;
  teamSummary: TeamPerformanceSummary | null;
  initialAgentName?: string | null;
  periodDescription: string;
  onClose: () => void;
}

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function formatTimestamp(ts?: number | null): string {
  if (!ts || !Number.isFinite(ts) || ts <= 0) return "—";
  return DATE_TIME_FORMATTER.format(ts);
}

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : '""';
  }
  const normalized = value.replace(/\r?\n/g, " ").trim();
  const guarded = /^[=+\-@\t\r]/.test(normalized) ? `'${normalized}` : normalized;
  return `"${guarded.replace(/"/g, '""')}"`;
}

function downloadPresenceCsv(
  filename: string,
  agents: ReadonlyArray<AgentPerformanceStats>
): void {
  const headers = [
    "Staff Member",
    "Status",
    "Current Screen",
    "Active Time",
    "Open Time",
    "Active Days",
    "Screen Breakdown",
    "Last Active",
  ];
  const lines = [headers.map((h) => escapeCsvCell(h)).join(",")];
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    const rows = buildScreenTimeRows(a.screens, a.activeMs);
    const breakdownText =
      rows.length > 0
        ? rows
            .map(
              (r) =>
                `${r.label}: ${r.activeMs > 0 ? formatOnlineDuration(r.activeMs) : "Visited"}${r.activeMs > 0 ? ` (${r.sharePct}%)` : ""}`
            )
            .join(" | ")
        : "—";
    lines.push(
      [
        a.name,
        getPresenceStatusMeta(a.status).label,
        a.status !== "offline" && a.currentScreenLabel ? a.currentScreenLabel : "—",
        formatOnlineDuration(a.activeMs),
        formatOnlineDuration(a.connectedMs),
        a.daysActiveCount,
        breakdownText,
        formatTimestamp(a.lastActiveAt || a.lastSeenAt),
      ]
        .map((c) => escapeCsvCell(c))
        .join(",")
    );
  }
  const blob = new Blob([`\uFEFF${lines.join("\n")}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function ScreenTimeAuditModal({
  agents,
  teamSummary,
  initialAgentName = null,
  periodDescription,
  onClose,
}: ScreenTimeAuditModalProps) {
  const cleanInitial =
    initialAgentName && initialAgentName !== "__all__" ? initialAgentName : null;
  const [selectedAgentName, setSelectedAgentName] = useState<string | null>(cleanInitial);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const activeAccountAgents = useMemo(
    () =>
      agents.filter(
        (a) => a.isActiveAccount || a.activeMs > 0 || a.connectedMs > 0 || (a.screens?.length || 0) > 0
      ),
    [agents]
  );

  const selectedAgent = useMemo(() => {
    if (!selectedAgentName) return null;
    const lower = selectedAgentName.trim().toLowerCase();
    return (
      activeAccountAgents.find((a) => a.name.trim().toLowerCase() === lower) ||
      agents.find((a) => a.name.trim().toLowerCase() === lower) ||
      null
    );
  }, [selectedAgentName, activeAccountAgents, agents]);

  const scopedActiveMs = selectedAgent
    ? selectedAgent.activeMs
    : teamSummary?.activeMs ?? 0;
  const scopedConnectedMs = selectedAgent
    ? selectedAgent.connectedMs
    : teamSummary?.connectedMs ?? 0;
  const scopedScreens = useMemo(() => {
    if (selectedAgent) {
      return buildScreenTimeRows(selectedAgent.screens, selectedAgent.activeMs);
    }
    return buildScreenTimeRows(teamSummary?.screens, teamSummary?.activeMs);
  }, [selectedAgent, teamSummary]);

  const filteredAgents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = q
      ? activeAccountAgents.filter((a) => {
          const screenHit =
            (a.currentScreenLabel || "").toLowerCase().includes(q) ||
            (a.screens || []).some((s) => s.label.toLowerCase().includes(q));
          return a.name.toLowerCase().includes(q) || screenHit;
        })
      : activeAccountAgents.slice();

    list.sort((a, b) => {
      const rank = (s: AgentPerformanceStats["status"]) =>
        s === "online" ? 2 : s === "away" ? 1 : 0;
      const rDiff = rank(b.status) - rank(a.status);
      if (rDiff !== 0) return rDiff;
      if (b.activeMs !== a.activeMs) return b.activeMs - a.activeMs;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [activeAccountAgents, searchQuery]);

  const scopeTitle = selectedAgent ? selectedAgent.name : "All Staff";
  const topScreen = scopedScreens[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="screen-audit-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full sm:max-w-5xl h-[92dvh] sm:h-[85dvh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-xl"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-main)",
          color: "var(--text-primary)",
        }}
      >
        {/* Header */}
        <div
          className="px-4 sm:px-6 py-4 flex items-start justify-between gap-3 shrink-0"
          style={{ borderBottom: "1px solid var(--border-main)" }}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {selectedAgent && activeAccountAgents.length > 1 && (
                <button
                  type="button"
                  onClick={() => setSelectedAgentName(null)}
                  className="min-h-[36px] sm:min-h-0 sm:h-7 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 hover:bg-[var(--bg-hover)] cursor-pointer"
                  style={{
                    background: "var(--bg-pill)",
                    border: "1px solid var(--border-input)",
                    color: "var(--text-primary)",
                  }}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Team</span>
                </button>
              )}
              <Monitor className="w-4 h-4 shrink-0" style={{ color: "var(--text-secondary)" }} />
              <h2
                id="screen-audit-title"
                className="text-base font-bold tracking-tight truncate"
                style={{ color: "var(--text-primary)" }}
              >
                CRM Screen Time & Live Location — {scopeTitle}
              </h2>
            </div>
            <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
              Period: {periodDescription} · Active time counts visible CRM tabs interacted with within 5 minutes
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close screen time breakdown"
            className="min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bg-banner)] shrink-0 cursor-pointer"
            style={{ color: "var(--text-secondary)" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Summary Strip & Controls */}
        <div
          className="px-4 sm:px-6 py-3 space-y-3 shrink-0"
          style={{ background: "var(--bg-panel)", borderBottom: "1px solid var(--border-main)" }}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div
              className="px-3 py-2 rounded-lg"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)" }}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                {selectedAgent ? "Currently In" : "Live Status"}
              </div>
              <div className="text-sm font-bold mt-0.5 truncate" style={{ color: "var(--text-primary)" }}>
                {selectedAgent
                  ? formatPresenceWithScreen(selectedAgent.status, selectedAgent.currentScreenLabel)
                  : `${teamSummary?.onlineCount || 0} online · ${teamSummary?.awayCount || 0} away`}
              </div>
            </div>

            <div
              className="px-3 py-2 rounded-lg"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)" }}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Active Time
              </div>
              <div className="text-sm font-bold mt-0.5 tabular-nums truncate" style={{ color: "var(--text-primary)" }}>
                {formatOnlineDuration(scopedActiveMs)}
              </div>
            </div>

            <div
              className="px-3 py-2 rounded-lg"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)" }}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Open Time
              </div>
              <div className="text-sm font-bold mt-0.5 tabular-nums truncate" style={{ color: "var(--text-primary)" }}>
                {formatOnlineDuration(scopedConnectedMs)}
              </div>
            </div>

            <div
              className="px-3 py-2 rounded-lg"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)" }}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Top Screen
              </div>
              <div className="text-sm font-bold mt-0.5 truncate tabular-nums" style={{ color: "var(--text-primary)" }}>
                {topScreen
                  ? `${topScreen.label} (${topScreen.activeMs > 0 ? formatOnlineDuration(topScreen.activeMs) : "Visited"})`
                  : "—"}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            {!selectedAgent ? (
              <div className="relative flex-1 sm:max-w-xs min-w-0">
                <Search
                  className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: "var(--text-muted)" }}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter staff or screen name..."
                  aria-label="Filter staff or screen"
                  className="w-full h-11 sm:h-8 pl-8 pr-3 text-base sm:text-xs rounded-lg outline-none"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-input)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>
            ) : (
              <div className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                {selectedAgent.activeScreens && selectedAgent.activeScreens.length > 1
                  ? `Active screens open now: ${selectedAgent.activeScreens.map((s) => s.label).join(", ")}`
                  : `Last active: ${formatTimestamp(selectedAgent.lastActiveAt || selectedAgent.lastSeenAt)}`}
              </div>
            )}

            <button
              type="button"
              disabled={(selectedAgent ? [selectedAgent] : filteredAgents).length === 0}
              onClick={() =>
                downloadPresenceCsv(
                  `screen-time-${scopeTitle.toLowerCase().replace(/\s+/g, "-")}.csv`,
                  selectedAgent ? [selectedAgent] : filteredAgents
                )
              }
              className="min-h-[44px] sm:min-h-0 sm:h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-45 cursor-pointer self-start sm:self-auto"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-input)",
                color: "var(--text-primary)",
              }}
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* 1. Time Spent by Screen */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                Time Spent by Screen ({scopeTitle})
              </h3>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {scopedScreens.length} screens
              </span>
            </div>

            {scopedScreens.length === 0 ? (
              <div
                className="p-6 text-center rounded-xl text-xs"
                style={{
                  background: "var(--bg-panel)",
                  border: "1px solid var(--border-main)",
                  color: "var(--text-secondary)",
                }}
              >
                No screen durations recorded in {periodDescription}.
              </div>
            ) : (
              <div
                className="rounded-xl overflow-hidden"
                style={{ border: "1px solid var(--border-main)" }}
              >
                <table className="w-full text-left border-collapse">
                  <thead
                    className="text-[10px] uppercase tracking-wider font-bold"
                    style={{
                      background: "var(--bg-table-header)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <tr>
                      <th className="py-2.5 px-4">Screen</th>
                      <th className="py-2.5 px-3 hidden sm:table-cell">Distribution</th>
                      <th className="py-2.5 px-3 text-right">Share</th>
                      <th className="py-2.5 px-3 text-right">Active Time</th>
                      <th className="py-2.5 px-4 text-right hidden md:table-cell">Last Visited</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs divide-y" style={{ borderColor: "var(--border-main)" }}>
                    {scopedScreens.map((row, idx) => (
                      <tr
                        key={row.screen}
                        style={{ background: idx % 2 === 0 ? "transparent" : "var(--bg-table-alt)" }}
                      >
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                              {row.label}
                            </span>
                            {row.path && (
                              <span className="text-[11px] hidden sm:inline" style={{ color: "var(--text-muted)" }}>
                                {row.path}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 hidden sm:table-cell w-56">
                          <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-pill)" }}>
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${row.sharePct > 0 ? Math.max(4, row.sharePct) : row.activeMs > 0 ? 4 : 0}%`,
                                background: "var(--bg-banner)",
                              }}
                            />
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>
                          {row.activeMs > 0 ? `${row.sharePct}%` : "—"}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
                          {row.activeMs > 0 ? formatOnlineDuration(row.activeMs) : "Visited"}
                        </td>
                        <td className="py-2.5 px-4 text-right whitespace-nowrap hidden md:table-cell" style={{ color: "var(--text-secondary)" }}>
                          {formatTimestamp(row.lastSeenAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* 2. Per-Agent Live Location & Top Screens (Team View) */}
          {!selectedAgent && (
            <section className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" style={{ color: "var(--text-secondary)" }} />
                  <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                    Staff Live Screen & Breakdown ({filteredAgents.length})
                  </h3>
                </div>
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Select a staff member to inspect full breakdown
                </span>
              </div>

              {filteredAgents.length === 0 ? (
                <div
                  className="p-6 text-center rounded-xl text-xs"
                  style={{
                    background: "var(--bg-panel)",
                    border: "1px solid var(--border-main)",
                    color: "var(--text-secondary)",
                  }}
                >
                  No staff match this filter.
                </div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div
                    className="hidden md:block rounded-xl overflow-hidden"
                    style={{ border: "1px solid var(--border-main)" }}
                  >
                    <table className="w-full text-left border-collapse">
                      <thead
                        className="text-[10px] uppercase tracking-wider font-bold"
                        style={{
                          background: "var(--bg-table-header)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        <tr>
                          <th className="py-2.5 px-4">Staff Member</th>
                          <th className="py-2.5 px-3">Live Screen Now</th>
                          <th className="py-2.5 px-3 text-right">Active Time</th>
                          <th className="py-2.5 px-3 text-right">Open Time</th>
                          <th className="py-2.5 px-4">Time per Screen</th>
                        </tr>
                      </thead>
                      <tbody className="text-xs divide-y" style={{ borderColor: "var(--border-main)" }}>
                        {filteredAgents.map((ag, idx) => {
                          const statusMeta = getPresenceStatusMeta(ag.status);
                          const agRows = buildScreenTimeRows(ag.screens, ag.activeMs);
                          return (
                            <tr
                              key={ag.userId || ag.name}
                              onClick={() => setSelectedAgentName(ag.name)}
                              className="hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                              style={{ background: idx % 2 === 0 ? "transparent" : "var(--bg-table-alt)" }}
                            >
                              <td className="py-2.5 px-4 font-semibold" style={{ color: "var(--text-primary)" }}>
                                {ag.name}
                              </td>
                              <td className="py-2.5 px-3">
                                <span
                                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                                  style={{
                                    background: statusMeta.bgVar,
                                    color: statusMeta.textVar,
                                    border: `1px solid ${statusMeta.borderVar}`,
                                  }}
                                >
                                  {ag.status !== "offline" && (
                                    <span
                                      className="w-1.5 h-1.5 rounded-full shrink-0"
                                      style={{ background: statusMeta.dotVar }}
                                    />
                                  )}
                                  {formatPresenceWithScreen(ag.status, ag.currentScreenLabel)}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
                                {formatOnlineDuration(ag.activeMs)}
                              </td>
                              <td className="py-2.5 px-3 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>
                                {formatOnlineDuration(ag.connectedMs)}
                              </td>
                              <td className="py-2.5 px-4">
                                {agRows.length === 0 ? (
                                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>
                                ) : (
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {agRows.slice(0, 3).map((sr) => (
                                      <span
                                        key={sr.screen}
                                        className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-md tabular-nums"
                                        style={{
                                          background: "var(--bg-pill)",
                                          border: "1px solid var(--border-input)",
                                          color: "var(--text-primary)",
                                        }}
                                      >
                                        {sr.label}: {sr.activeMs > 0 ? formatOnlineDuration(sr.activeMs) : "Visited"}
                                      </span>
                                    ))}
                                    {agRows.length > 3 && (
                                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                                        +{agRows.length - 3} more
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Stacked Cards */}
                  <div className="md:hidden space-y-2.5">
                    {filteredAgents.map((ag) => {
                      const statusMeta = getPresenceStatusMeta(ag.status);
                      const agRows = buildScreenTimeRows(ag.screens, ag.activeMs);
                      return (
                        <button
                          key={`${ag.userId || ag.name}_m`}
                          type="button"
                          onClick={() => setSelectedAgentName(ag.name)}
                          className="w-full text-left p-3.5 rounded-xl space-y-2 cursor-pointer"
                          style={{
                            background: "var(--bg-panel)",
                            border: "1px solid var(--border-main)",
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>
                              {ag.name}
                            </span>
                            <span
                              className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                              style={{
                                background: statusMeta.bgVar,
                                color: statusMeta.textVar,
                                border: `1px solid ${statusMeta.borderVar}`,
                              }}
                            >
                              {ag.status !== "offline" && (
                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusMeta.dotVar }} />
                              )}
                              {formatPresenceWithScreen(ag.status, ag.currentScreenLabel)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>
                            <span>Active: <strong style={{ color: "var(--text-primary)" }}>{formatOnlineDuration(ag.activeMs)}</strong></span>
                            <span>Open: {formatOnlineDuration(ag.connectedMs)}</span>
                          </div>
                          {agRows.length > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                              {agRows.slice(0, 3).map((sr) => (
                                <span
                                  key={sr.screen}
                                  className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-md tabular-nums"
                                  style={{
                                    background: "var(--bg-card)",
                                    border: "1px solid var(--border-input)",
                                    color: "var(--text-primary)",
                                  }}
                                >
                                  {sr.label}: {sr.activeMs > 0 ? formatOnlineDuration(sr.activeMs) : "Visited"}
                                </span>
                              ))}
                              {agRows.length > 3 && (
                                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                                  +{agRows.length - 3} more
                                </span>
                              )}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

