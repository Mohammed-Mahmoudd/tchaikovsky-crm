"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  History,
  X,
} from "lucide-react";
import type { Conversation, LeadLabel } from "../context/CRMContext";
import {
  type DirectorBadgeTone,
  type DirectorLeadInsights,
  formatIsoDateDisplay,
  getFollowUpDateRelativeLabel,
} from "../utils/directorLeadInfo";
import { getLostReasonLabel } from "../utils/lostReasons";
import { formatChatMessageTooltip } from "../utils/time";
import { LeadLabelBadges } from "./LeadLabelBadges";

function getToneCssVars(tone: DirectorBadgeTone): {
  background: string;
  borderColor: string;
  color: string;
  dotColor: string;
} {
  return {
    background: `var(--label-${tone}-bg)`,
    borderColor: `var(--label-${tone}-border)`,
    color: `var(--label-${tone}-text)`,
    dotColor: `var(--label-${tone}-dot)`,
  };
}

function TonePill({
  tone,
  label,
  icon,
}: {
  tone: DirectorBadgeTone;
  label: string;
  icon?: React.ReactNode;
}) {
  const vars = getToneCssVars(tone);
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border max-w-full"
      style={{
        background: vars.background,
        borderColor: vars.borderColor,
        color: vars.color,
      }}
    >
      {icon ?? (
        <span
          aria-hidden="true"
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: vars.dotColor }}
        />
      )}
      <span className="truncate">{label}</span>
    </span>
  );
}

export function useDirectorLeadInfoSidebar() {
  const [leadId, setLeadId] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const openRafRef = useRef<number | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearOpenRaf = useCallback(() => {
    if (openRafRef.current !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(openRafRef.current);
      openRafRef.current = null;
    }
  }, []);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const open = useCallback(
    (conversationId: string) => {
      if (!conversationId) return;
      clearCloseTimer();
      clearOpenRaf();

      if (leadId !== null) {
        setLeadId(conversationId);
        setIsVisible(true);
        return;
      }

      setLeadId(conversationId);
      setIsVisible(false);

      if (typeof window !== "undefined") {
        openRafRef.current = window.requestAnimationFrame(() => {
          openRafRef.current = window.requestAnimationFrame(() => {
            openRafRef.current = null;
            setIsVisible(true);
          });
        });
      } else {
        setIsVisible(true);
      }
    },
    [leadId, clearCloseTimer, clearOpenRaf]
  );

  const close = useCallback(() => {
    clearOpenRaf();
    if (!leadId) return;

    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      clearCloseTimer();
      setIsVisible(false);
      setLeadId(null);
      return;
    }

    setIsVisible(false);
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setLeadId(null);
    }, 340);
  }, [leadId, clearOpenRaf, clearCloseTimer]);

  const resetImmediate = useCallback(() => {
    clearOpenRaf();
    clearCloseTimer();
    setIsVisible(false);
    setLeadId(null);
  }, [clearOpenRaf, clearCloseTimer]);

  const handleTransitionEnd = useCallback(
    (e: React.TransitionEvent<HTMLElement>) => {
      if (
        e.target === panelRef.current &&
        e.propertyName === "transform" &&
        !isVisible
      ) {
        clearCloseTimer();
        setLeadId(null);
      }
    },
    [isVisible, clearCloseTimer]
  );

  useEffect(() => {
    return () => {
      clearOpenRaf();
      clearCloseTimer();
    };
  }, [clearOpenRaf, clearCloseTimer]);

  return {
    leadId,
    isVisible,
    panelRef,
    open,
    close,
    resetImmediate,
    handleTransitionEnd,
  };
}

export interface DirectorLeadInfoSidebarProps {
  leadId: string | null;
  conversation: Conversation | null;
  insights: DirectorLeadInsights | null;
  leadLabels: ReadonlyArray<LeadLabel>;
  auditionTime?: string;
  isVisible: boolean;
  panelRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  onTransitionEnd: (e: React.TransitionEvent<HTMLElement>) => void;
  enableEscapeClose?: boolean;
}

/**
 * View-only slide-over sidebar for Enrollment Directors on the Auditions calendar.
 * Displays current stage, follow-up requests, lead notes, and an anonymized change timeline
 * without exposing chat messages or staff attribution.
 */
export const DirectorLeadInfoSidebar = React.memo(function DirectorLeadInfoSidebar({
  leadId,
  conversation,
  insights,
  leadLabels,
  auditionTime,
  isVisible,
  panelRef,
  onClose,
  onTransitionEnd,
  enableEscapeClose = true,
}: DirectorLeadInfoSidebarProps) {
  useEffect(() => {
    if (!enableEscapeClose || !leadId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enableEscapeClose, leadId, onClose]);

  useEffect(() => {
    if (!leadId || !isVisible) return;
    panelRef.current?.focus({ preventScroll: true });
  }, [leadId, isVisible, panelRef]);

  if (!leadId) return null;

  const displayName = conversation
    ? conversation.leadName || conversation.profileName || conversation.name || "Lead"
    : "Lead details";

  const metaParts: string[] = [];
  if (conversation?.formAnswers?.instrument) {
    metaParts.push(conversation.formAnswers.instrument);
  }
  if (conversation?.formAnswers?.studentAge) {
    metaParts.push(`Age ${conversation.formAnswers.studentAge}`);
  }

  const lostReasonText = insights?.lostReason ? getLostReasonLabel(insights.lostReason) : "";
  const hasLostDetails = Boolean(
    insights && insights.pipeline === "Lost" && (lostReasonText || insights.lostReasonNote)
  );
  const showFollowUpNote = Boolean(
    insights?.followUp.note &&
      insights.followUp.note.toLowerCase() !== (insights.leadNote || "").toLowerCase()
  );
  const followUpDateStatus =
    insights?.followUp.date && !insights.followUp.completed
      ? getFollowUpDateRelativeLabel(insights.followUp.date)
      : null;

  const hasSpecificFollowUpTag = Boolean(
    insights?.followUp.isJoiningLater ||
      insights?.followUp.isScheduleFollowUp ||
      insights?.followUp.isPaymentPending ||
      insights?.followUp.isTrialSession ||
      insights?.followUp.completed
  );

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className={`absolute inset-0 z-40 bg-black/20 motion-reduce:transition-none ${
          isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        style={{
          transition: isVisible ? "opacity 320ms ease-out" : "opacity 260ms ease-in-out",
        }}
        onClick={onClose}
      />

      {/* View-only Right Sidebar */}
      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="director-lead-info-title"
        onTransitionEnd={onTransitionEnd}
        className={`absolute inset-y-0 end-0 z-50 w-full sm:max-w-md flex flex-col max-w-full shadow-lg transform-gpu will-change-[transform,opacity] motion-reduce:transition-none focus:outline-none ${
          isVisible
            ? "translate-x-0 opacity-100"
            : "translate-x-full rtl:-translate-x-full opacity-0 pointer-events-none"
        }`}
        style={{
          background: "var(--bg-panel)",
          borderInlineStart: "1px solid var(--border-main)",
          color: "var(--text-primary)",
          transitionProperty: "transform, opacity",
          transitionDuration: isVisible ? "340ms, 240ms" : "280ms, 220ms",
          transitionTimingFunction: isVisible
            ? "cubic-bezier(0.25, 1, 0.5, 1), ease-out"
            : "cubic-bezier(0.4, 0, 0.2, 1), ease-in-out",
        }}
      >
        {/* Header */}
        <div
          className="shrink-0 p-4 sm:p-5 border-b flex items-start justify-between gap-3"
          style={{
            background: "var(--bg-card)",
            borderColor: "var(--border-main)",
          }}
        >
          <div className="min-w-0 flex-1">
            <p
              className="text-xs font-medium mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Lead details
            </p>

            <h2
              id="director-lead-info-title"
              className="text-base font-bold leading-snug break-words"
              style={{ color: "var(--text-primary)" }}
            >
              {displayName}
            </h2>

            {(metaParts.length > 0 || conversation?.phone) && (
              <div
                className="mt-1 flex items-center gap-2 flex-wrap text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                {metaParts.length > 0 && (
                  <span className="truncate">{metaParts.join(" · ")}</span>
                )}
                {metaParts.length > 0 && conversation?.phone && (
                  <span aria-hidden="true">·</span>
                )}
                {conversation?.phone && (
                  <span className="font-mono">{conversation.phone}</span>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close lead details"
            title="Close"
            className="min-w-11 min-h-11 sm:min-w-9 sm:min-h-9 rounded-lg flex items-center justify-center transition-colors shrink-0 cursor-pointer hover:opacity-80 focus-visible:outline-none focus-visible:ring-2"
            style={{
              background: "var(--bg-pill)",
              border: "1px solid var(--border-input)",
              color: "var(--text-secondary)",
              ["--tw-ring-color" as string]: "var(--label-blue-dot)",
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
          {!conversation || !insights ? (
            <div
              className="rounded-xl p-4 border text-sm"
              style={{
                background: "var(--bg-card)",
                borderColor: "var(--border-main)",
                color: "var(--text-secondary)",
              }}
            >
              This lead is no longer available in your branch auditions.
            </div>
          ) : !insights.hasUpdates ? (
            <div
              className="rounded-xl p-4 border text-sm"
              style={{
                background: "var(--bg-card)",
                borderColor: "var(--border-main)",
                color: "var(--text-secondary)",
              }}
            >
              No notes or lead changes recorded yet.
            </div>
          ) : (
            <>
              {/* Current Stage */}
              <section
                className="rounded-xl p-3.5 border space-y-2.5"
                style={{
                  background: "var(--bg-card)",
                  borderColor: "var(--border-main)",
                }}
                aria-labelledby="director-stage-heading"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3
                    id="director-stage-heading"
                    className="text-xs font-semibold"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Current stage
                  </h3>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <TonePill tone={insights.pipelineTone} label={insights.pipeline} />
                    {insights.auditionOutcomeLabel &&
                      insights.auditionOutcomeLabel.toLowerCase() !==
                        insights.pipeline.toLowerCase() && (
                        <TonePill
                          tone={insights.auditionOutcomeTone}
                          label={insights.auditionOutcomeLabel}
                        />
                      )}
                  </div>
                </div>

                {(conversation.auditionDate || auditionTime) && (
                  <div
                    className="flex items-center gap-1.5 text-xs flex-wrap"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Audition:{" "}
                      {conversation.auditionDate
                        ? formatIsoDateDisplay(conversation.auditionDate)
                        : ""}
                      {conversation.auditionDate && auditionTime ? " · " : ""}
                      {auditionTime || ""}
                    </span>
                  </div>
                )}

                {hasLostDetails && (
                  <div
                    className="rounded-lg p-2.5 border text-xs space-y-1"
                    style={{
                      background: "var(--label-red-bg)",
                      borderColor: "var(--label-red-border)",
                      color: "var(--label-red-text)",
                    }}
                  >
                    {lostReasonText && (
                      <p className="font-semibold break-words">
                        Lost reason: {lostReasonText}
                      </p>
                    )}
                    {insights.lostReasonNote && (
                      <p
                        dir="auto"
                        className="whitespace-pre-wrap break-words opacity-95"
                      >
                        {insights.lostReasonNote}
                      </p>
                    )}
                  </div>
                )}

                {conversation.labels && conversation.labels.length > 0 && (
                  <div className="pt-0.5">
                    <LeadLabelBadges
                      labelIds={conversation.labels}
                      catalog={leadLabels}
                      maxVisible={6}
                    />
                  </div>
                )}
              </section>

              {/* Follow-up Request */}
              {insights.followUp.hasRequest && (
                <section
                  className="rounded-xl p-3.5 border space-y-2.5"
                  style={{
                    background: "var(--bg-card)",
                    borderColor: "var(--border-main)",
                  }}
                  aria-labelledby="director-followup-heading"
                >
                  <h3
                    id="director-followup-heading"
                    className="text-xs font-semibold"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Follow-up
                  </h3>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {insights.followUp.isJoiningLater && (
                      <TonePill tone="amber" label="Joining later" />
                    )}
                    {insights.followUp.isScheduleFollowUp && (
                      <TonePill tone="blue" label="Schedule follow-up" />
                    )}
                    {insights.followUp.isPaymentPending && (
                      <TonePill tone="red" label="Payment pending" />
                    )}
                    {insights.followUp.isTrialSession && (
                      <TonePill tone="purple" label="Trial session" />
                    )}
                    {insights.followUp.completed && (
                      <TonePill
                        tone="green"
                        label={
                          insights.followUp.completedAt
                            ? `Follow-up completed (${formatIsoDateDisplay(
                                insights.followUp.completedAt
                              )})`
                            : "Follow-up completed"
                        }
                        icon={<CheckCircle2 className="w-3 h-3 shrink-0" />}
                      />
                    )}
                    {!hasSpecificFollowUpTag && (
                      <TonePill tone="blue" label="Follow-up requested" />
                    )}
                  </div>

                  {insights.followUp.date && (
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div
                        className="flex items-center gap-1.5 text-sm font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        <Calendar
                          className="w-4 h-4 shrink-0"
                          style={{ color: "var(--text-secondary)" }}
                        />
                        <span>{formatIsoDateDisplay(insights.followUp.date)}</span>
                      </div>
                      {followUpDateStatus === "overdue" && (
                        <TonePill tone="red" label="Overdue" />
                      )}
                      {followUpDateStatus === "today" && (
                        <TonePill tone="amber" label="Today" />
                      )}
                      {followUpDateStatus === "upcoming" && (
                        <TonePill tone="blue" label="Upcoming" />
                      )}
                    </div>
                  )}

                  {showFollowUpNote && (
                    <div
                      className="rounded-lg p-2.5 border text-sm leading-relaxed whitespace-pre-wrap break-words"
                      dir="auto"
                      style={{
                        background: "var(--bg-input)",
                        borderColor: "var(--border-input)",
                        color: "var(--text-primary)",
                      }}
                    >
                      {insights.followUp.note}
                    </div>
                  )}
                </section>
              )}

              {/* Lead Notes */}
              {insights.leadNote && (
                <section
                  className="rounded-xl p-3.5 border space-y-2"
                  style={{
                    background: "var(--bg-card)",
                    borderColor: "var(--border-main)",
                  }}
                  aria-labelledby="director-notes-heading"
                >
                  <div className="flex items-center gap-1.5">
                    <FileText
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: "var(--text-secondary)" }}
                    />
                    <h3
                      id="director-notes-heading"
                      className="text-xs font-semibold"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Notes
                    </h3>
                  </div>
                  <p
                    dir="auto"
                    className="text-sm leading-relaxed whitespace-pre-wrap break-words"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {insights.leadNote}
                  </p>
                </section>
              )}

              {/* Anonymized Change Timeline */}
              {insights.timeline.length > 0 && (
                <section
                  className="rounded-xl p-3.5 border space-y-3"
                  style={{
                    background: "var(--bg-card)",
                    borderColor: "var(--border-main)",
                  }}
                  aria-labelledby="director-timeline-heading"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <History
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: "var(--text-secondary)" }}
                      />
                      <h3
                        id="director-timeline-heading"
                        className="text-xs font-semibold"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Lead changes
                      </h3>
                    </div>
                    <span
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-full border"
                      style={{
                        background: "var(--bg-pill)",
                        borderColor: "var(--border-main)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {insights.timeline.length}
                    </span>
                  </div>

                  <ol className="space-y-3">
                    {insights.timeline.map((item, idx) => {
                      const vars = getToneCssVars(item.tone);
                      const isLast = idx === insights.timeline.length - 1;
                      const transitionText =
                        item.fromValue && item.toValue
                          ? `${item.fromValue} → ${item.toValue}`
                          : "";
                      const showDetail =
                        Boolean(item.detail) &&
                        item.detail !== transitionText &&
                        item.detail !== item.summary;

                      return (
                        <li key={item.id} className="relative flex gap-3 min-w-0">
                          <div className="flex flex-col items-center shrink-0 pt-1">
                            <span
                              aria-hidden="true"
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: vars.dotColor }}
                            />
                            {!isLast && (
                              <span
                                aria-hidden="true"
                                className="w-px flex-1 mt-1.5"
                                style={{ backgroundColor: "var(--border-main)" }}
                              />
                            )}
                          </div>

                          <div className="min-w-0 flex-1 pb-1">
                            <p
                              className="text-sm font-medium leading-snug break-words"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {item.summary}
                            </p>

                            {item.fromValue && item.toValue && (
                              <div className="mt-1 inline-flex items-center gap-1.5 flex-wrap text-xs px-2 py-0.5 rounded-md border max-w-full"
                                style={{
                                  background: "var(--bg-pill)",
                                  borderColor: "var(--border-main)",
                                  color: "var(--text-secondary)",
                                }}
                              >
                                <span className="truncate max-w-[140px]">
                                  {item.fromValue}
                                </span>
                                <ArrowRight className="w-3 h-3 shrink-0" />
                                <span
                                  className="font-semibold truncate max-w-[140px]"
                                  style={{ color: "var(--text-primary)" }}
                                >
                                  {item.toValue}
                                </span>
                              </div>
                            )}

                            {showDetail && (
                              <p
                                dir="auto"
                                className="mt-1 text-xs leading-relaxed whitespace-pre-wrap break-words"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                {item.detail}
                              </p>
                            )}

                            <p
                              className="mt-1 text-[11px]"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {formatChatMessageTooltip(item.timestamp)}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
});

