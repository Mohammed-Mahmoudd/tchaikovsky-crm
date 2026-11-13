"use client";

import React from "react";
import Link from "next/link";
import { ExternalLink, CheckCircle2, Calendar, Trash2, X, MessageSquare } from "lucide-react";
import { useCRM, Conversation } from "../context/CRMContext";
import { useAuth, canAccessRoute, isDirectorOrChairmanRole, isAdmissionRole } from "./AuthProvider";

const PIPELINE_STAGES = [
  "New",
  "Contacted",
  "Qualified",
  "Audition Booked",
  "Attended",
  "Registered",
  "Joining Later",
  "Unqualified",
  "Lost",
] as const;

const PIPELINE_STAGE_COLORS: Record<string, string> = {
  New: "#007AFF",
  Contacted: "#5856D6",
  Qualified: "#30B0C7",
  "Audition Booked": "#FF9500",
  Attended: "#34C759",
  Registered: "#0066FF",
  "Joining Later": "#AF52DE",
  Unqualified: "#FF3B30",
  Lost: "#8E8E93",
};

interface ConversationDetailsSidebarProps {
  conversation: Conversation;
  onClose?: () => void;
  onDelete?: () => void;
  onOpenBookingModal?: () => void;
  onOpenConversation?: () => void;
  showOpenConversationButton?: boolean;
  className?: string;
}

export function ConversationDetailsSidebar({
  conversation,
  onClose,
  onDelete,
  onOpenBookingModal,
  onOpenConversation,
  showOpenConversationButton = false,
  className = "",
}: ConversationDetailsSidebarProps) {
  const { patchConversation } = useCRM();
  const { user, isReadOnly } = useAuth();

  const userClean = (user?.name || "").trim().toLowerCase();
  const agentClean = (conversation?.agent || "").trim().toLowerCase();
  const isAssigned = !!agentClean && agentClean !== "unassigned";
  const isAssignedToMe = isAssigned && !!userClean && userClean === agentClean;
  const isChairman = isDirectorOrChairmanRole(user?.role);
  const isAdmission = isAdmissionRole(user?.role);
  const canViewTeamActivity = isChairman || canAccessRoute(user?.role, "/team-performance");

  const isJoiningLater =
    conversation.pipeline === "Joining Later" ||
    conversation.auditionOutcome === "joining-later";
  const tags = conversation.followUpTags || [];
  const isPaymentPending = tags.includes("payment-pending");
  const isTrialSession = tags.includes("trial-session");
  const hasFollowUp = Boolean(
    conversation.followUpDate ||
      conversation.followUpNote ||
      isJoiningLater ||
      isPaymentPending ||
      isTrialSession
  );

  const handleToggleJoiningLater = () => {
    if (isReadOnly) return;
    if (isJoiningLater) {
      const nextPipeline =
        conversation.pipeline === "Joining Later"
          ? conversation.auditionDate
            ? "Audition Booked"
            : "Contacted"
          : conversation.pipeline;
      patchConversation(conversation.id, {
        auditionOutcome: "",
        pipeline: nextPipeline,
      });
    } else {
      const d = new Date();
      d.setDate(d.getDate() + 14);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const defaultDate = `${y}-${m}-${day}`;

      const updates: Record<string, any> = {
        pipeline: "Joining Later",
        auditionOutcome: "joining-later",
        followUpCompleted: false,
      };
      if (!conversation.followUpDate) {
        updates.followUpDate = defaultDate;
      }
      if (!conversation.followUpNote || !conversation.followUpNote.trim()) {
        updates.followUpNote = "Joining Later - Follow up";
      }
      patchConversation(conversation.id, updates);
    }
  };

  const handleToggleTag = (tag: string, defaultNote: string) => {
    if (isReadOnly) return;
    const currentTags = conversation.followUpTags || [];
    const hasTag = currentTags.includes(tag);
    const newTags = hasTag
      ? currentTags.filter((t: string) => t !== tag)
      : [...currentTags, tag];

    const updates: Record<string, any> = {
      followUpTags: newTags,
      followUpCompleted: false,
    };

    if (!hasTag) {
      updates.auditionOutcome = "schedule-followup";
      if (!conversation.followUpDate) {
        const d = new Date();
        d.setDate(d.getDate() + 3);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        updates.followUpDate = `${y}-${m}-${day}`;
      }
      if (!conversation.auditionDate) {
        updates.auditionDate = updates.followUpDate || conversation.followUpDate;
      }
      if (!conversation.followUpNote || !conversation.followUpNote.trim()) {
        updates.followUpNote = defaultNote;
      }
    } else {
      const remainingTags = newTags;
      if (
        !remainingTags.includes("payment-pending") &&
        !remainingTags.includes("trial-session")
      ) {
        if (conversation.auditionOutcome === "schedule-followup") {
          updates.auditionOutcome = "";
        }
      }
    }

    patchConversation(conversation.id, updates);
  };

  const handleClearFollowUp = () => {
    if (isReadOnly) return;
    const nextPipeline =
      conversation.pipeline === "Joining Later"
        ? conversation.auditionDate
          ? "Audition Booked"
          : "Contacted"
        : conversation.pipeline;
    patchConversation(conversation.id, {
      followUpDate: "",
      followUpNote: "",
      followUpCompleted: false,
      followUpCompletedAt: null,
      followUpTags: [],
      pipeline: nextPipeline,
      auditionOutcome:
        isJoiningLater || conversation.auditionOutcome === "schedule-followup"
          ? ""
          : conversation.auditionOutcome,
    });
  };

  return (
    <div
      className={`flex flex-col h-full overflow-y-auto p-5 shrink-0 ${className}`}
      style={{ background: "var(--bg-panel)", color: "var(--text-primary)" }}
    >
      {/* Header: editable name + phone + close button */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex-1 min-w-0 pr-2">
          <input
            key={conversation.id + "-name"}
            type="text"
            defaultValue={
              conversation.leadName || conversation.profileName || conversation.name
            }
            placeholder="Enter customer name..."
            disabled={isReadOnly}
            className="w-full text-[16px] font-bold bg-transparent outline-none border-b border-transparent focus:border-[#0066FF] transition-colors pb-0.5 truncate disabled:opacity-80"
            style={{ color: "var(--text-primary)" }}
            onBlur={(e) => {
              if (isReadOnly) return;
              const newName = e.target.value.trim();
              const currentDisplayName =
                conversation.leadName ||
                conversation.profileName ||
                conversation.name;
              if (newName && newName !== currentDisplayName) {
                patchConversation(conversation.id, {
                  name: newName,
                  leadName: newName,
                });
              }
            }}
          />
          <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-secondary)" }}>
            {conversation.phone || conversation.id}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              title="Delete from Pipeline"
              className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[#FF3B30] hover:bg-[rgba(255,59,48,0.1)] transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Optional Open Conversation button (e.g. In standalone details view) */}
      {showOpenConversationButton && onOpenConversation && (
        <button
          type="button"
          onClick={onOpenConversation}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 mb-5 rounded-lg bg-[#0066FF] text-white text-[13px] font-semibold hover:bg-[#0055d4] transition-colors shadow-sm cursor-pointer"
        >
          <MessageSquare className="w-4 h-4" />
          Open Conversation
        </button>
      )}

      {/* ASSIGNED TO */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[9px] font-bold tracking-widest text-[#0066FF] uppercase">
            Assigned to
          </h3>
          {isAssignedToMe && (
            <span className="text-[10px] font-semibold text-[#34C759]">
              Assigned to you
            </span>
          )}
        </div>
        <div
          className="rounded-[6px] p-2.5 flex items-center justify-between gap-2"
          style={{
            background: "var(--bg-input)",
            border: "1px solid var(--border-input)",
          }}
        >
          <span className="text-[12px] font-medium truncate" style={{ color: "var(--text-primary)" }}>
            {conversation.agent || "Unassigned"}
          </span>
          {!isReadOnly && !isAssigned && (isAdmission || isChairman) && user?.name && (
            <button
              type="button"
              onClick={() => patchConversation(conversation.id, { agent: user.name })}
              className="text-[11px] font-semibold text-[#0066FF] hover:underline cursor-pointer shrink-0"
            >
              Assign to me →
            </button>
          )}
          {!isReadOnly && isAssignedToMe && isAdmission && (
            <button
              type="button"
              onClick={() => patchConversation(conversation.id, { agent: "Unassigned" })}
              className="text-[11px] font-medium hover:underline cursor-pointer shrink-0"
              style={{ color: "var(--text-secondary)" }}
            >
              Unassign
            </button>
          )}
          {isAssigned && canViewTeamActivity && (
            <Link
              href={`/team-performance?agent=${encodeURIComponent(conversation.agent)}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded text-[#0066FF] bg-[#0066FF]/10 hover:bg-[#0066FF]/20 transition-colors shrink-0 cursor-pointer"
              title={`View ${conversation.agent} in Team Activities`}
            >
              <span>View</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          )}
        </div>
      </div>

      {/* SOURCE */}
      <div className="mb-5">
        <h3 className="text-[9px] font-bold tracking-widest text-[#0066FF] uppercase mb-2">
          Source
        </h3>
        {typeof conversation.source !== "object" || !conversation.source ? (
          <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            {String(conversation.source || "Organic / Direct")}
          </p>
        ) : (
          <div className="rounded-[6px] p-2.5" style={{ background: "var(--bg-input)" }}>
            <p className="text-[11px] font-bold mb-0.5" style={{ color: "var(--text-primary)" }}>
              {conversation.source.campaign || "Organic / Direct"}
            </p>
            <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
              {conversation.source.adset || "—"}
            </p>
            <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
              {conversation.source.ad || "—"}
            </p>
          </div>
        )}
      </div>

      {/* PIPELINE */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[9px] font-bold tracking-widest text-[#0066FF] uppercase">
            Pipeline
          </h3>
          {conversation.pipeline !== "direct" && (
            <span
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all"
              style={{
                backgroundColor: `${PIPELINE_STAGE_COLORS[conversation.pipeline] || "#8E8E93"}18`,
                color: PIPELINE_STAGE_COLORS[conversation.pipeline] || "#8E8E93",
                border: `1px solid ${PIPELINE_STAGE_COLORS[conversation.pipeline] || "#8E8E93"}35`,
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  backgroundColor: PIPELINE_STAGE_COLORS[conversation.pipeline] || "#8E8E93",
                }}
              />
              {conversation.pipeline}
            </span>
          )}
        </div>
        {conversation.pipeline === "direct" ? (
          <div
            className="rounded-[6px] p-2.5 space-y-1.5"
            style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)" }}
          >
            <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
              No lead record — this contact messaged directly.
            </p>
            {!isReadOnly && (
              <button
                type="button"
                onClick={() => patchConversation(conversation.id, { pipeline: "New" })}
                className="text-[11px] font-semibold text-[#0066FF] hover:underline cursor-pointer flex items-center gap-1"
              >
                + Add to pipeline
              </button>
            )}
          </div>
        ) : (
          <select
            disabled={isReadOnly}
            value={conversation.pipeline}
            onChange={(e) => patchConversation(conversation.id, { pipeline: e.target.value })}
            className="w-full rounded-[6px] text-[12px] py-1.5 px-2 outline-none disabled:opacity-60 cursor-pointer font-medium transition-colors"
            style={{
              border: "1px solid var(--border-input)",
              background: "var(--bg-input)",
              color: "var(--text-primary)",
            }}
          >
            {PIPELINE_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {stage}
              </option>
            ))}
            {!PIPELINE_STAGES.includes(conversation.pipeline as any) && (
              <option value={conversation.pipeline}>{conversation.pipeline}</option>
            )}
          </select>
        )}
      </div>

      {/* AUDITION */}
      <div className="mb-5">
        <h3 className="text-[9px] font-bold tracking-widest text-[#0066FF] uppercase mb-2">
          Audition
        </h3>
        {conversation.pipeline === "Audition Booked" ||
        conversation.auditionDate ||
        (conversation.auditionOutcome &&
          conversation.auditionOutcome !== "joining-later") ? (
          <div
            className="p-3 rounded-lg border mb-2"
            style={{
              background: "var(--bg-pill)",
              borderColor: "var(--border-input)",
            }}
          >
            <div className="flex items-center justify-between mb-1.5 gap-2">
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: "#0066FF" }} />
                <select
                  disabled={isReadOnly}
                  value={conversation.auditionOutcome || ""}
                  onChange={(e) =>
                    patchConversation(conversation.id, { auditionOutcome: e.target.value })
                  }
                  className="text-[11px] font-bold rounded px-1.5 py-0.5 outline-none cursor-pointer border transition-colors flex-1 min-w-0"
                  style={{
                    borderColor: "var(--border-input)",
                    background: "var(--bg-input)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="">Audition Booked</option>
                  <option value="schedule-followup">Schedule Follow up</option>
                  <option value="registered">Registered</option>
                  <option value="paid-trial">Paid Trial</option>
                  <option value="joining-later">Joining Later</option>
                  <option value="no-show">No Show</option>
                </select>
              </div>
              <Link
                href={`/auditions?date=${
                  conversation.auditionDate || conversation.followUpDate || ""
                }&id=${conversation.id}`}
                className="text-[10px] font-semibold text-[#0066FF] hover:underline flex items-center gap-0.5 shrink-0"
              >
                <Calendar className="w-3 h-3" /> Calendar →
              </Link>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {(conversation.auditionDate || conversation.followUpDate) && (
                <span className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
                  {conversation.auditionDate || conversation.followUpDate}
                </span>
              )}
              {conversation.branch && (
                <span className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>
                  · {conversation.branch}
                </span>
              )}
            </div>
            {!isReadOnly && onOpenBookingModal && (
              <button
                type="button"
                onClick={onOpenBookingModal}
                className="mt-1.5 text-[10px] font-semibold text-[#0066FF] hover:underline cursor-pointer block text-left"
              >
                {conversation.auditionDate ? "Reschedule" : "Book audition"}
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="text-[11px] mb-2" style={{ color: "var(--text-secondary)" }}>
              No booking yet.
            </p>
            {onOpenBookingModal && (
              <button
                type="button"
                disabled={isReadOnly}
                onClick={onOpenBookingModal}
                className="w-full bg-[#0066FF] text-white font-semibold text-[12px] py-2 rounded-[6px] hover:bg-[#0055d4] transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <Calendar className="w-3.5 h-3.5" />
                Book audition
              </button>
            )}
          </>
        )}
      </div>

      {/* FORM ANSWERS */}
      <div className="mb-5">
        <h3 className="text-[9px] font-bold tracking-widest text-[#0066FF] uppercase mb-2">
          Form Answers
        </h3>
        <div className="mb-2">
          <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>full name</p>
          <p className="text-[11px] font-medium" style={{ color: "var(--text-primary)" }}>
            {conversation.profileName || conversation.name}
          </p>
        </div>
        {conversation.formAnswers?.instrument && (
          <div className="mb-2">
            <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>instrument</p>
            <p className="text-[11px] font-medium" style={{ color: "var(--text-primary)" }}>
              {conversation.formAnswers.instrument}
            </p>
          </div>
        )}
        {conversation.formAnswers?.studentAge && (
          <div>
            <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>student age</p>
            <p className="text-[11px] font-medium" style={{ color: "var(--text-primary)" }}>
              {conversation.formAnswers.studentAge}
            </p>
          </div>
        )}
      </div>

      {/* FOLLOW-UP */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="text-[9px] font-bold tracking-widest text-[#0066FF] uppercase">
              Follow-up
            </h3>
            {isJoiningLater && (
              <span
                className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                style={{
                  background: "var(--bg-pill)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border-main)",
                }}
              >
                Joining Later
              </span>
            )}
            {isPaymentPending && (
              <span
                className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                style={{
                  background: "rgba(239,68,68,0.08)",
                  color: "#EF4444",
                  border: "1px solid rgba(239,68,68,0.2)",
                }}
              >
                Payment Pending
              </span>
            )}
            {isTrialSession && (
              <span
                className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                style={{
                  background: "rgba(139,92,246,0.08)",
                  color: "#8B5CF6",
                  border: "1px solid rgba(139,92,246,0.2)",
                }}
              >
                Trial Session
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {conversation.followUpCompleted && (
              <span
                className="text-[9px] font-medium px-2 py-0.5 rounded-full"
                style={{
                  background: "var(--bg-pill)",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border-main)",
                }}
              >
                Ended
              </span>
            )}
            <Link
              href="/follow-ups"
              className="text-[10px] font-semibold text-[#0066FF] hover:underline flex items-center gap-0.5"
            >
              Follow-ups →
            </Link>
            {hasFollowUp && !isReadOnly && (
              <button
                type="button"
                title="Clear follow-up"
                onClick={handleClearFollowUp}
                className="text-gray-400 hover:text-red-500 transition-colors p-0.5 cursor-pointer ml-0.5"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 mb-2">
          <input
            key={`fn-${conversation.id}-${conversation.followUpNote || ""}-${
              conversation.auditionOutcome || ""
            }-${(conversation.followUpTags || []).join(",")}`}
            type="text"
            defaultValue={conversation.followUpNote || ""}
            placeholder={
              isJoiningLater
                ? "e.g. Joining in summer"
                : isPaymentPending
                ? "e.g. Waiting for transfer"
                : isTrialSession
                ? "e.g. Trial on Saturday"
                : "e.g. Call back about Sunday"
            }
            className={`flex-1 min-w-0 rounded-[6px] text-[11px] py-1.5 px-2 outline-none placeholder-gray-400 transition-colors ${
              conversation.followUpCompleted ? "line-through" : ""
            }`}
            style={{
              border: "1px solid var(--border-input)",
              background: "var(--bg-input)",
              color: conversation.followUpCompleted
                ? "var(--text-muted)"
                : "var(--text-primary)",
            }}
            onBlur={(e) => {
              const val = e.target.value.trim();
              if (val !== (conversation.followUpNote || "")) {
                patchConversation(conversation.id, {
                  followUpNote: val,
                  followUpCompleted: false,
                });
              }
            }}
          />
        </div>

        {/* Tag checkboxes row */}
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <label
            className="flex items-center gap-1.5 shrink-0 cursor-pointer select-none py-1.5 px-2 rounded-[6px] border transition-colors h-[29px]"
            style={{
              background: isJoiningLater ? "rgba(245,158,11,0.06)" : "var(--bg-input)",
              borderColor: isJoiningLater
                ? "rgba(245,158,11,0.25)"
                : "var(--border-input)",
            }}
            title="Mark as joining later"
          >
            <input
              type="checkbox"
              checked={isJoiningLater}
              disabled={isReadOnly}
              onChange={handleToggleJoiningLater}
              className="w-3.5 h-3.5 rounded cursor-pointer accent-[#F59E0B]"
            />
            <span
              className="text-[10px] font-medium whitespace-nowrap"
              style={{
                color: isJoiningLater ? "#F59E0B" : "var(--text-secondary)",
              }}
            >
              Joining later
            </span>
          </label>
          <label
            className="flex items-center gap-1.5 shrink-0 cursor-pointer select-none py-1.5 px-2 rounded-[6px] border transition-colors h-[29px]"
            style={{
              background: isPaymentPending ? "rgba(239,68,68,0.06)" : "var(--bg-input)",
              borderColor: isPaymentPending
                ? "rgba(239,68,68,0.25)"
                : "var(--border-input)",
            }}
            title="Mark as payment pending"
          >
            <input
              type="checkbox"
              checked={isPaymentPending}
              disabled={isReadOnly}
              onChange={() =>
                handleToggleTag("payment-pending", "Payment Pending - Follow up")
              }
              className="w-3.5 h-3.5 rounded cursor-pointer accent-[#EF4444]"
            />
            <span
              className="text-[10px] font-medium whitespace-nowrap"
              style={{
                color: isPaymentPending ? "#EF4444" : "var(--text-secondary)",
              }}
            >
              Payment pending
            </span>
          </label>
          <label
            className="flex items-center gap-1.5 shrink-0 cursor-pointer select-none py-1.5 px-2 rounded-[6px] border transition-colors h-[29px]"
            style={{
              background: isTrialSession ? "rgba(139,92,246,0.06)" : "var(--bg-input)",
              borderColor: isTrialSession
                ? "rgba(139,92,246,0.25)"
                : "var(--border-input)",
            }}
            title="Mark as trial session"
          >
            <input
              type="checkbox"
              checked={isTrialSession}
              disabled={isReadOnly}
              onChange={() =>
                handleToggleTag("trial-session", "Trial Session - Follow up")
              }
              className="w-3.5 h-3.5 rounded cursor-pointer accent-[#8B5CF6]"
            />
            <span
              className="text-[10px] font-medium whitespace-nowrap"
              style={{
                color: isTrialSession ? "#8B5CF6" : "var(--text-secondary)",
              }}
            >
              Trial session
            </span>
          </label>
        </div>

        <div className="flex gap-2">
          <input
            key={`fd-${conversation.id}-${conversation.followUpDate || ""}-${
              conversation.auditionOutcome || ""
            }-${(conversation.followUpTags || []).join(",")}`}
            type="date"
            defaultValue={conversation.followUpDate || ""}
            className={`flex-1 rounded-[6px] px-2 py-1.5 text-[11px] outline-none cursor-pointer transition-colors ${
              conversation.followUpCompleted ? "line-through" : ""
            }`}
            style={{
              border: "1px solid var(--border-input)",
              background: "var(--bg-input)",
              color: conversation.followUpCompleted
                ? "var(--text-muted)"
                : "var(--text-primary)",
            }}
            onChange={(e) => {
              const val = e.target.value;
              if (val !== (conversation.followUpDate || "")) {
                patchConversation(conversation.id, {
                  followUpDate: val,
                  followUpCompleted: false,
                });
              }
            }}
          />
        </div>
      </div>

      {/* NOTES */}
      <div>
        <h3 className="text-[9px] font-bold tracking-widest text-[#0066FF] uppercase mb-2">
          Notes
        </h3>
        <textarea
          rows={3}
          key={`notes-${conversation.id}-${conversation.notes || ""}`}
          defaultValue={conversation.notes || ""}
          placeholder="Instrument, age, follow-up promises..."
          className="w-full rounded-[6px] text-[11px] p-2 outline-none placeholder-gray-400 resize-y"
          style={{
            border: "1px solid var(--border-input)",
            background: "var(--bg-input)",
            color: "var(--text-primary)",
          }}
          onBlur={(e) => patchConversation(conversation.id, { notes: e.target.value })}
        />
      </div>

      <div className="mt-8 text-[9px]" style={{ color: "var(--text-muted)" }}>
        Conversation cv-{conversation.phone || conversation.id || conversation.name.toLowerCase()}
      </div>
    </div>
  );
}
