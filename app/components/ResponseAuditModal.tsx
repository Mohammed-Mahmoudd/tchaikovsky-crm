"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Clock,
  Download,
  MessageSquare,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { useAuth } from "./AuthProvider";
import { SlideOverChatDrawer, useSlideOverChatDrawer } from "./SlideOverChatDrawer";
import {
  filterAndSortResponseAuditRows,
  formatResponseDuration,
  getResponseSpeedTone,
  type ResponseAuditReport,
  type ResponseAuditRow,
  type ResponseAuditSort,
} from "../utils/agentMetrics";

const API_BASE = "/api";
const DIRECT_API_BASE = "https://api.tchaikovskyschool.com/crm-api";

export interface ResponseAuditTarget {
  kind: "first" | "all";
  agentName?: string;
}

interface ResponseAuditModalProps {
  target: ResponseAuditTarget;
  startMs: number;
  endMs: number;
  periodDescription: string;
  onChangeTarget: (next: ResponseAuditTarget) => void;
  onClose: () => void;
}

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function formatTurnTimestamp(ts: number): string {
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

function formatAttributionLabel(
  source: ResponseAuditRow["attributionSource"],
  excludeReason?: ResponseAuditRow["excludeReason"]
): string {
  if (excludeReason === "handled_in_crm") return "Excluded: Handled in CRM before follow-up";
  if (excludeReason === "meta_window_exceeded") return "Excluded: Incomplete >7d Meta history";
  switch (source) {
    case "senderName":
      return "Verified CRM reply";
    case "activityLog":
      return "Verified activity log";
    default:
      return "External / Phone (Unverified)";
  }
}

function downloadAuditCsv(filename: string, rows: ReadonlyArray<ResponseAuditRow>): void {
  const headers = [
    "Lead",
    "Channel",
    "Agent",
    "Lead Owner",
    "Attribution",
    "Turn Type",
    "Lead Messaged",
    "Agent Replied",
    "Wait Time",
    "Wait Seconds",
  ];
  const lines = [headers.map((h) => escapeCsvCell(h)).join(",")];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    lines.push(
      [
        r.leadName,
        r.channel,
        r.agentName || "External / Phone",
        r.assignedAgent || "Unassigned",
        formatAttributionLabel(r.attributionSource, r.excludeReason),
        r.isFirstResponse ? "First Response" : "Follow-up Reply",
        formatTurnTimestamp(r.incomingAt),
        formatTurnTimestamp(r.repliedAt),
        formatResponseDuration(r.responseMs),
        Math.round(r.responseMs / 1000),
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
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function ResponseAuditModal({
  target,
  startMs,
  endMs,
  periodDescription,
  onChangeTarget,
  onClose,
}: ResponseAuditModalProps) {
  const { authFetch } = useAuth();
  const [report, setReport] = useState<ResponseAuditReport | null>(null);
  const [resolvedKey, setResolvedKey] = useState<string>("");
  const [retryNonce, setRetryNonce] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<ResponseAuditSort>("slowest");
  const [scope, setScope] = useState<"verified" | "unattributed" | "excluded" | "all">("verified");

  const isTeamScope = !target.agentName || target.agentName === "__all__";
  const effectiveScope = isTeamScope
    ? scope
    : scope === "excluded"
      ? "excluded"
      : "verified";

  const {
    chatId: drawerChatId,
    showDetails: showChatDetails,
    setShowDetails: setShowChatDetails,
    isClosing: isDrawerClosing,
    panelRef: drawerPanelRef,
    open: openDrawer,
    close: closeDrawer,
    handleAnimationEnd: handleDrawerAnimationEnd,
  } = useSlideOverChatDrawer();

  const requestKey = `${target.kind}:${target.agentName || ""}:${effectiveScope}:${sortBy}:${Math.floor(startMs)}:${Math.floor(endMs)}:${retryNonce}`;
  const loading = resolvedKey !== requestKey;

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const params = new URLSearchParams();
    params.set("kind", target.kind);
    params.set("scope", effectiveScope);
    params.set("sort", sortBy);
    params.set("limit", "400");
    if (startMs > 0) params.set("startMs", String(Math.floor(startMs)));
    if (endMs > 0) params.set("endMs", String(Math.floor(endMs)));
    if (target.agentName && target.agentName.trim() && target.agentName !== "__all__") {
      params.set("agent", target.agentName.trim());
    }
    const qs = params.toString();

    (async () => {
      try {
        let res = await authFetch(`${API_BASE}/team-metrics/response-audit?${qs}`, {
          cache: "no-store",
          signal: controller.signal,
        }).catch(() => null);
        if (cancelled) return;

        if (!res || (!res.ok && res.status !== 401 && res.status !== 403 && res.status !== 404)) {
          res = await authFetch(`${DIRECT_API_BASE}/team-metrics/response-audit?${qs}`, {
            cache: "no-store",
            signal: controller.signal,
          }).catch(() => null);
        }
        if (cancelled) return;

        if (!res || !res.ok) {
          const errJson = res ? await res.json().catch(() => null) : null;
          if (!cancelled) {
            setError(errJson?.error || "Could not load response time breakdown.");
            setResolvedKey(requestKey);
          }
          return;
        }
        const json = await res.json().catch(() => null);
        if (cancelled) return;

        if (!json?.success || !json?.data) {
          setError("Could not load response time breakdown.");
          setResolvedKey(requestKey);
          return;
        }
        setError(null);
        setReport(json.data as ResponseAuditReport);
        setResolvedKey(requestKey);
      } catch {
        if (!cancelled) {
          setError("Network error while loading response breakdown.");
          setResolvedKey(requestKey);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [authFetch, target.kind, target.agentName, effectiveScope, sortBy, startMs, endMs, requestKey]);

  const handleRetry = useCallback(() => {
    setError(null);
    setRetryNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !drawerChatId) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [drawerChatId, onClose]);

  const displayedRows = useMemo(() => {
    if (!report) return [];
    return filterAndSortResponseAuditRows(report.rows, { searchQuery, sortBy });
  }, [report, searchQuery, sortBy]);

  const scopeLabel =
    target.agentName && target.agentName !== "__all__" ? target.agentName : "All Agents";
  const titleText =
    target.kind === "first"
      ? `First Response Time Audit — ${scopeLabel}`
      : `Reply Time Audit — ${scopeLabel}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="response-audit-title"
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
              <Clock className="w-4 h-4 shrink-0" style={{ color: "var(--text-secondary)" }} />
              <h2
                id="response-audit-title"
                className="text-base font-bold tracking-tight truncate"
                style={{ color: "var(--text-primary)" }}
              >
                {titleText}
              </h2>
            </div>
            <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
              Period: {periodDescription} ·{" "}
              {isTeamScope
                ? "Elapsed time from lead's first unanswered message to next reply"
                : `Verified CRM replies sent by ${scopeLabel} only (excludes shared-phone "Staff" sends)`}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close response audit"
            className="min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bg-banner)] shrink-0"
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
          {report && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[
                { label: "Replies", value: report.totalCount.toLocaleString("en-US") },
                { label: "Median", value: formatResponseDuration(report.medianMs) },
                { label: "Average", value: formatResponseDuration(report.avgMs) },
                { label: "Fastest / Slowest", value: `${formatResponseDuration(report.minMs)} / ${formatResponseDuration(report.maxMs)}` },
                { label: "Within 15m", value: `${report.fastReply15mPct}% (${report.fastReply15mCount})` },
              ].map((item) => (
                <div
                  key={item.label}
                  className="px-3 py-2 rounded-lg"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)" }}
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    {item.label}
                  </div>
                  <div className="text-sm font-bold mt-0.5 tabular-nums truncate" style={{ color: "var(--text-primary)" }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Kind toggle */}
              <div
                className="inline-flex p-1 rounded-lg self-start"
                style={{ background: "var(--bg-pill)", border: "1px solid var(--border-input)" }}
              >
                {[
                  { id: "first" as const, label: "First Response" },
                  { id: "all" as const, label: "All Replies" },
                ].map((opt) => {
                  const active = target.kind === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onChangeTarget({ ...target, kind: opt.id })}
                      className="min-h-[36px] sm:min-h-0 sm:h-7 px-3 text-xs font-semibold rounded-md transition-colors cursor-pointer"
                      style={
                        active
                          ? { background: "var(--bg-card)", color: "var(--text-primary)", boxShadow: "var(--shadow-card)" }
                          : { background: "transparent", color: "var(--text-secondary)" }
                      }
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {(isTeamScope || (report && (report.excludedCount || 0) > 0) || scope === "excluded") && (
                <div
                  className="inline-flex p-1 rounded-lg self-start"
                  style={{ background: "var(--bg-pill)", border: "1px solid var(--border-input)" }}
                >
                  {(isTeamScope
                    ? [
                        { id: "verified" as const, label: "Verified CRM" },
                        {
                          id: "unattributed" as const,
                          label:
                            report && (report.unattributedCount || 0) > 0
                              ? `External / Phone (${report.unattributedCount})`
                              : "External / Phone",
                        },
                        ...(typeof report?.excludedCount === "number" || scope === "excluded"
                          ? [
                              {
                                id: "excluded" as const,
                                label:
                                  report && (report.excludedCount || 0) > 0
                                    ? `Excluded (${report.excludedCount})`
                                    : "Excluded",
                              },
                            ]
                          : []),
                        { id: "all" as const, label: "All" },
                      ]
                    : [
                        { id: "verified" as const, label: "Verified CRM" },
                        {
                          id: "excluded" as const,
                          label:
                            report && (report.excludedCount || 0) > 0
                              ? `Excluded (${report.excludedCount})`
                              : "Excluded",
                        },
                      ]
                  ).map((opt) => {
                    const active = effectiveScope === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setScope(opt.id)}
                        className="min-h-[36px] sm:min-h-0 sm:h-7 px-2.5 text-xs font-semibold rounded-md transition-colors cursor-pointer"
                        style={
                          active
                            ? { background: "var(--bg-card)", color: "var(--text-primary)", boxShadow: "var(--shadow-card)" }
                            : { background: "transparent", color: "var(--text-secondary)" }
                        }
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 sm:w-52 min-w-0">
                <Search
                  className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: "var(--text-muted)" }}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search lead, channel, agent..."
                  aria-label="Search response turns"
                  className="w-full h-11 sm:h-8 pl-8 pr-3 text-base sm:text-xs rounded-lg outline-none"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-input)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as ResponseAuditSort)}
                aria-label="Sort response turns"
                className="h-11 sm:h-8 px-2.5 text-base sm:text-xs font-medium rounded-lg outline-none cursor-pointer"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-input)",
                  color: "var(--text-primary)",
                }}
              >
                <option value="slowest">Slowest first</option>
                <option value="fastest">Fastest first</option>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>

              <button
                type="button"
                disabled={displayedRows.length === 0}
                onClick={() =>
                  downloadAuditCsv(
                    `response-audit-${scopeLabel.toLowerCase().replace(/\s+/g, "-")}.csv`,
                    displayedRows
                  )
                }
                className="min-h-[44px] sm:min-h-0 sm:h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-45"
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
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="p-6 space-y-3" aria-busy="true">
              {[0, 1, 2, 3, 4].map((idx) => (
                <div
                  key={idx}
                  className="h-14 rounded-xl animate-pulse"
                  style={{ background: "var(--bg-pill)" }}
                />
              ))}
            </div>
          ) : error ? (
            <div className="p-10 text-center space-y-3">
              <AlertCircle className="w-8 h-8 mx-auto" style={{ color: "var(--label-red-text)" }} />
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {error}
              </p>
              <button
                type="button"
                onClick={handleRetry}
                className="min-h-[44px] sm:min-h-0 sm:h-8 px-3.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
                style={{
                  background: "var(--bg-pill)",
                  border: "1px solid var(--border-input)",
                  color: "var(--text-primary)",
                }}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Retry
              </button>
            </div>
          ) : displayedRows.length === 0 ? (
            <div className="p-12 text-center space-y-1.5">
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                No response turns found
              </p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                No incoming-to-outgoing lead replies match this filter in {periodDescription}.
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead
                    className="sticky top-0 text-[10px] uppercase tracking-wider font-bold z-10"
                    style={{
                      background: "var(--bg-table-header)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <tr>
                      <th className="py-2.5 px-4">Lead</th>
                      <th className="py-2.5 px-3">Agent</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Lead Messaged</th>
                      <th className="py-2.5 px-3">Agent Replied</th>
                      <th className="py-2.5 px-3 text-right">Wait Time</th>
                      <th className="py-2.5 px-4 text-right">Chat</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs divide-y" style={{ borderColor: "var(--border-main)" }}>
                    {displayedRows.map((row, idx) => {
                      const tone = getResponseSpeedTone(row.responseMs);
                      return (
                        <tr
                          key={`${row.conversationId}_${row.repliedAt}_${idx}`}
                          className="hover:bg-[var(--bg-hover)] transition-colors"
                          style={{ background: idx % 2 === 0 ? "transparent" : "var(--bg-table-alt)" }}
                        >
                          <td className="py-2.5 px-4 max-w-[200px]">
                            <div className="font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                              {row.leadName}
                            </div>
                            <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                              {row.channel}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                              {row.agentName || "External / Phone"}
                            </span>
                            {row.excludeReason === "handled_in_crm" ? (
                              <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                                Handled in CRM before follow-up
                              </div>
                            ) : row.excludeReason === "meta_window_exceeded" ? (
                              <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                                Incomplete &gt;7d Meta history
                              </div>
                            ) : row.attributionSource === "activityLog" ? (
                              <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                                Verified activity log
                              </div>
                            ) : row.attributionSource === "unattributed" ? (
                              <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                                {row.assignedAgent ? `Lead owner: ${row.assignedAgent}` : "No CRM sender"}
                              </div>
                            ) : null}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                              style={{
                                background: "var(--bg-pill)",
                                color: "var(--text-secondary)",
                                border: "1px solid var(--border-input)",
                              }}
                            >
                              {row.isFirstResponse ? "First reply" : "Follow-up"}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                            {formatTurnTimestamp(row.incomingAt)}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                            {formatTurnTimestamp(row.repliedAt)}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <span
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums"
                              style={{
                                background: tone.bgVar,
                                color: tone.textVar,
                                border: `1px solid ${tone.borderVar}`,
                              }}
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ background: tone.dotVar }}
                              />
                              {formatResponseDuration(row.responseMs)}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => openDrawer(row.conversationId)}
                              className="h-7 px-2.5 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-[var(--bg-hover)]"
                              style={{
                                background: "var(--bg-pill)",
                                border: "1px solid var(--border-input)",
                                color: "var(--text-primary)",
                              }}
                            >
                              <MessageSquare className="w-3 h-3" />
                              Chat
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Stacked Cards */}
              <div className="md:hidden divide-y" style={{ borderColor: "var(--border-main)" }}>
                {displayedRows.map((row, idx) => {
                  const tone = getResponseSpeedTone(row.responseMs);
                  return (
                    <div
                      key={`${row.conversationId}_${row.repliedAt}_m_${idx}`}
                      className="p-4 space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                            {row.leadName}
                          </p>
                          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                            {row.agentName || "External / Phone"} · {row.channel} ·{" "}
                            {row.isFirstResponse ? "First reply" : "Follow-up"}
                            {row.excludeReason === "handled_in_crm"
                              ? " · Handled in CRM"
                              : row.excludeReason === "meta_window_exceeded"
                                ? " · Incomplete >7d Meta history"
                                : ""}
                          </p>
                        </div>
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold tabular-nums shrink-0"
                          style={{
                            background: tone.bgVar,
                            color: tone.textVar,
                            border: `1px solid ${tone.borderVar}`,
                          }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: tone.dotVar }}
                          />
                          {formatResponseDuration(row.responseMs)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                        <span className="truncate">
                          {formatTurnTimestamp(row.incomingAt)} → {formatTurnTimestamp(row.repliedAt)}
                        </span>
                        <button
                          type="button"
                          onClick={() => openDrawer(row.conversationId)}
                          className="min-h-[44px] px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
                          style={{
                            background: "var(--bg-pill)",
                            border: "1px solid var(--border-input)",
                            color: "var(--text-primary)",
                          }}
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          Chat
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <SlideOverChatDrawer
        chatId={drawerChatId}
        showDetails={showChatDetails}
        isClosing={isDrawerClosing}
        panelRef={drawerPanelRef}
        onToggleDetails={() => setShowChatDetails((prev) => !prev)}
        onCloseDetails={() => setShowChatDetails(false)}
        onClose={closeDrawer}
        onAnimationEnd={handleDrawerAnimationEnd}
      />
    </div>
  );
}

