  "use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { AlertCircle, Check } from "lucide-react";
import {
  LOST_REASON_OPTIONS,
  PIPELINE_STAGES,
  PIPELINE_STAGE_COLORS,
  getLostReasonLabel,
  normalizeLostReasonId,
  validateLostReasonSubmission,
} from "../utils/lostReasons";

export type PatchSaveResult = { ok: boolean; error?: string } | void;

export interface LostReasonPanelProps {
  conversationId: string;
  pipeline: string;
  lostReason?: string;
  lostReasonNote?: string;
  lostAt?: string;
  lostBy?: string;
  isTransitionDraft: boolean;
  isReadOnly?: boolean;
  variant?: "sidebar" | "panel";
  onCancelTransition?: () => void;
  onConfirmLost?: (payload: { lostReason: string; lostReasonNote: string }) => Promise<PatchSaveResult>;
  onSaveLostDetails: (payload: { lostReason: string; lostReasonNote: string }) => Promise<PatchSaveResult>;
}

function formatLostDateShort(iso?: string): string {
  if (!iso) return "";
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "";
  try {
    return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

/**
 * Inline Lost Reason selector + optional detail note rendered directly under the Pipeline dropdown.
 * Keyed by `conversationId` via parent wrapper so switching leads resets draft/error state cleanly.
 */
export function LostReasonPanel(props: LostReasonPanelProps) {
  return <LostReasonPanelInner key={props.conversationId} {...props} />;
}

function LostReasonPanelInner({
  pipeline,
  lostReason,
  lostReasonNote,
  lostAt,
  lostBy,
  isTransitionDraft,
  isReadOnly = false,
  variant = "sidebar",
  onCancelTransition,
  onConfirmLost,
  onSaveLostDetails,
}: LostReasonPanelProps) {
  const selectId = useId();
  const noteId = useId();
  const errorId = useId();

  const savedReason = normalizeLostReasonId(lostReason);
  const savedNote = typeof lostReasonNote === "string" ? lostReasonNote : "";
  const currentMode: "draft" | "active" = isTransitionDraft ? "draft" : "active";

  const [draftState, setDraftState] = useState<{
    mode: "draft" | "active";
    reason: string | null;
    note: string | null;
    error: { field: "reason" | "note"; message: string } | null;
  }>({
    mode: currentMode,
    reason: null,
    note: null,
    error: null,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [savedVisible, setSavedVisible] = useState(false);

  const selectRef = useRef<HTMLSelectElement | null>(null);
  const noteRef = useRef<HTMLInputElement | null>(null);
  const savingRef = useRef(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (isTransitionDraft && !isReadOnly) {
      const timer = setTimeout(() => selectRef.current?.focus(), 20);
      return () => clearTimeout(timer);
    }
  }, [isTransitionDraft, isReadOnly]);

  const draftReason = draftState.mode === currentMode ? draftState.reason : null;
  const draftNote = draftState.mode === currentMode ? draftState.note : null;
  const fieldError = draftState.mode === currentMode ? draftState.error : null;

  const setDraftReason = (reason: string | null) =>
    setDraftState((prev) => ({
      mode: currentMode,
      reason,
      note: prev.mode === currentMode ? prev.note : null,
      error: prev.mode === currentMode ? prev.error : null,
    }));

  const setDraftNote = (note: string | null) =>
    setDraftState((prev) => ({
      mode: currentMode,
      reason: prev.mode === currentMode ? prev.reason : null,
      note,
      error: prev.mode === currentMode ? prev.error : null,
    }));

  const setFieldError = (error: { field: "reason" | "note"; message: string } | null) =>
    setDraftState((prev) => ({
      mode: currentMode,
      reason: prev.mode === currentMode ? prev.reason : null,
      note: prev.mode === currentMode ? prev.note : null,
      error,
    }));

  const resetDraftState = () =>
    setDraftState({
      mode: currentMode,
      reason: null,
      note: null,
      error: null,
    });

  const activeReason = draftReason !== null ? draftReason : isTransitionDraft ? "" : savedReason;
  const activeNote = draftNote !== null ? draftNote : isTransitionDraft ? "" : savedNote;
  const isLostActive = pipeline === "Lost";

  if (!isTransitionDraft && !isLostActive) {
    return null;
  }

  const isPanel = variant === "panel";
  const isOtherSelected = activeReason === "other";
  const isNoteDirty = activeNote.trim() !== savedNote.trim();
  const showMissingLegacyReason = !isTransitionDraft && isLostActive && !savedReason && !activeReason;
  const lostDateLabel = formatLostDateShort(lostAt);

  const flashSaved = () => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    setSavedVisible(true);
    savedTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) setSavedVisible(false);
      savedTimerRef.current = null;
    }, 2000);
  };

  const handleConfirmTransition = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isReadOnly || savingRef.current || !onConfirmLost) return;

    const validation = validateLostReasonSubmission(activeReason, activeNote);
    if (!validation.ok) {
      setFieldError({ field: validation.field, message: validation.error });
      if (validation.field === "reason") selectRef.current?.focus();
      else noteRef.current?.focus();
      return;
    }

    setFieldError(null);
    savingRef.current = true;
    setIsSaving(true);
    try {
      const res = await onConfirmLost({
        lostReason: validation.reason,
        lostReasonNote: validation.note,
      });
      if (res && res.ok === false) {
        if (isMountedRef.current) {
          setFieldError({
            field: "reason",
            message: res.error || "Could not mark lead as Lost. Please try again.",
          });
        }
        return;
      }
      if (isMountedRef.current) {
        resetDraftState();
        flashSaved();
      }
    } catch {
      if (isMountedRef.current) {
        setFieldError({
          field: "reason",
          message: "Could not mark lead as Lost. Please try again.",
        });
      }
    } finally {
      savingRef.current = false;
      if (isMountedRef.current) setIsSaving(false);
    }
  };

  const commitExistingLostDetails = async (nextReasonRaw: string, nextNoteRaw: string) => {
    if (isReadOnly || savingRef.current) return;
    const validation = validateLostReasonSubmission(nextReasonRaw, nextNoteRaw);
    if (!validation.ok) {
      setFieldError({ field: validation.field, message: validation.error });
      if (validation.field === "reason") selectRef.current?.focus();
      else noteRef.current?.focus();
      return;
    }

    if (validation.reason === savedReason && validation.note === savedNote.trim()) {
      setFieldError(null);
      setDraftReason(null);
      setDraftNote(null);
      return;
    }

    setFieldError(null);
    savingRef.current = true;
    setIsSaving(true);
    try {
      const res = await onSaveLostDetails({
        lostReason: validation.reason,
        lostReasonNote: validation.note,
      });
      if (res && res.ok === false) {
        if (isMountedRef.current) {
          setFieldError({
            field: "reason",
            message: res.error || "Could not update lost reason. Please try again.",
          });
        }
        return;
      }
      if (isMountedRef.current) {
        resetDraftState();
        flashSaved();
      }
    } catch {
      if (isMountedRef.current) {
        setFieldError({
          field: "reason",
          message: "Could not update lost reason. Please try again.",
        });
      }
    } finally {
      savingRef.current = false;
      if (isMountedRef.current) setIsSaving(false);
    }
  };

  const handleReasonSelectChange = (nextVal: string) => {
    setDraftReason(nextVal);
    setFieldError(null);
    if (savedVisible) setSavedVisible(false);

    if (isTransitionDraft) {
      if (nextVal === "other") {
        setTimeout(() => noteRef.current?.focus(), 20);
      }
      return;
    }

    if (!nextVal) {
      setFieldError({ field: "reason", message: "Select why this lead was lost" });
      return;
    }

    if (nextVal === "other" && !activeNote.trim()) {
      setFieldError({ field: "note", message: "Enter a brief reason when selecting Other" });
      setTimeout(() => noteRef.current?.focus(), 20);
      return;
    }

    void commitExistingLostDetails(nextVal, activeNote);
  };

  const handleNoteFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isTransitionDraft) {
      void handleConfirmTransition();
      return;
    }
    void commitExistingLostDetails(activeReason, activeNote);
  };

  const handleNoteBlur = () => {
    if (isTransitionDraft || isReadOnly || savingRef.current) return;
    if (!isNoteDirty) return;
    if (!activeReason) return;
    if (activeReason === "other" && !activeNote.trim()) {
      setFieldError({ field: "note", message: "Enter a brief reason when selecting Other" });
      return;
    }
    void commitExistingLostDetails(activeReason, activeNote);
  };

  const selectHeightClass = isPanel
    ? "text-base sm:text-[13px] py-1.5 px-2.5 min-h-[44px] sm:min-h-[34px]"
    : "text-base sm:text-[12px] py-1.5 px-2 min-h-[44px] sm:min-h-[32px]";

  const inputHeightClass = isPanel
    ? "text-base sm:text-[13px] py-1.5 px-3 min-h-[44px] sm:min-h-[34px]"
    : "text-base sm:text-[11px] py-1.5 px-2.5 min-h-[44px] sm:min-h-[30px]";

  return (
    <form
      onSubmit={handleNoteFormSubmit}
      noValidate
      className="mt-2.5 rounded-lg p-2.5 space-y-2 transition-colors"
      style={{
        background: isTransitionDraft ? "var(--label-red-bg)" : "var(--bg-panel)",
        border: isTransitionDraft
          ? "1px solid var(--label-red-border)"
          : "1px solid var(--border-main)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={selectId}
          className="text-[11px] font-semibold"
          style={{
            color: isTransitionDraft || showMissingLegacyReason
              ? "var(--label-red-text)"
              : "var(--text-secondary)",
          }}
        >
          {isTransitionDraft ? "Why is this lead lost? *" : "Lost reason"}
        </label>
        {savedVisible ? (
          <span
            className="inline-flex items-center gap-1 text-[10px] font-semibold shrink-0"
            style={{ color: "var(--label-green-text)" }}
          >
            <Check className="w-3 h-3" />
            Saved
          </span>
        ) : showMissingLegacyReason ? (
          <span
            className="text-[10px] font-semibold shrink-0"
            style={{ color: "var(--label-red-text)" }}
          >
            Required
          </span>
        ) : null}
      </div>

      <select
        ref={selectRef}
        id={selectId}
        disabled={isReadOnly || isSaving}
        value={activeReason}
        aria-invalid={fieldError?.field === "reason" ? true : undefined}
        aria-describedby={fieldError ? errorId : undefined}
        onChange={(e) => handleReasonSelectChange(e.target.value)}
        className={`w-full rounded-[6px] outline-none disabled:opacity-60 cursor-pointer font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--bg-banner)] ${selectHeightClass}`}
        style={{
          border:
            fieldError?.field === "reason"
              ? "1px solid var(--label-red-border)"
              : "1px solid var(--border-input)",
          background: "var(--bg-card)",
          color: activeReason ? "var(--text-primary)" : "var(--text-secondary)",
        }}
      >
        <option value="">Select why lead was lost...</option>
        {LOST_REASON_OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
        {lostReason && !normalizeLostReasonId(lostReason) && (
          <option value={lostReason}>{getLostReasonLabel(lostReason)}</option>
        )}
      </select>

      <div className="space-y-1">
        <label
          htmlFor={noteId}
          className="text-[10px] font-medium block"
          style={{ color: "var(--text-secondary)" }}
        >
          {isOtherSelected ? "Details *" : "Details (optional)"}
        </label>
        <div className="flex items-stretch gap-1.5">
          <input
            ref={noteRef}
            id={noteId}
            type="text"
            maxLength={500}
            disabled={isReadOnly || isSaving}
            value={activeNote}
            placeholder={
              isOtherSelected
                ? "Enter brief reason..."
                : "Optional note (e.g. budget, preferred time)"
            }
            aria-invalid={fieldError?.field === "note" ? true : undefined}
            aria-describedby={fieldError ? errorId : undefined}
            onChange={(e) => {
              setDraftNote(e.target.value);
              if (fieldError?.field === "note") setFieldError(null);
              if (savedVisible) setSavedVisible(false);
            }}
            onBlur={handleNoteBlur}
            className={`flex-1 min-w-0 rounded-[6px] outline-none disabled:opacity-60 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--bg-banner)] ${inputHeightClass}`}
            style={{
              border:
                fieldError?.field === "note"
                  ? "1px solid var(--label-red-border)"
                  : "1px solid var(--border-input)",
              background: "var(--bg-card)",
              color: "var(--text-primary)",
            }}
          />
          {!isTransitionDraft && !isReadOnly && (isNoteDirty || (isOtherSelected && !savedNote)) && (
            <button
              type="submit"
              disabled={isSaving}
              onMouseDown={(e) => e.preventDefault()}
              className={`font-semibold rounded-[6px] text-white shrink-0 transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer ${
                isPanel
                  ? "text-[12px] px-3 min-h-[44px] sm:min-h-[34px]"
                  : "text-[11px] px-2.5 min-h-[44px] sm:min-h-[30px]"
              }`}
              style={{ background: "var(--bg-banner)" }}
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          )}
        </div>
      </div>

      {fieldError && (
        <p
          id={errorId}
          role="alert"
          className="flex items-center gap-1 text-[11px] font-medium"
          style={{ color: "var(--label-red-text)" }}
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{fieldError.message}</span>
        </p>
      )}

      {isTransitionDraft && !isReadOnly && (
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-1.5 pt-0.5">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => {
              resetDraftState();
              onCancelTransition?.();
            }}
            className="flex-1 sm:flex-none px-3 py-1.5 min-h-[44px] sm:min-h-[30px] rounded-[6px] text-[11px] font-semibold transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50 cursor-pointer"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-input)",
              color: "var(--text-secondary)",
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="flex-1 px-3 py-1.5 min-h-[44px] sm:min-h-[30px] rounded-[6px] text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
            style={{ background: "var(--label-red-dot)" }}
          >
            {isSaving ? "Saving..." : "Mark as Lost"}
          </button>
        </div>
      )}

      {!isTransitionDraft && (lostBy || lostDateLabel) && (
        <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          {lostBy ? `Marked lost by ${lostBy}` : "Marked lost"}
          {lostDateLabel ? ` · ${lostDateLabel}` : ""}
        </p>
      )}
    </form>
  );
}

export interface PipelineStageSectionProps {
  conversationId: string;
  pipeline: string;
  lostReason?: string;
  lostReasonNote?: string;
  lostAt?: string;
  lostBy?: string;
  isReadOnly?: boolean;
  onSavePatch: (updates: Record<string, unknown>) => Promise<PatchSaveResult>;
}

/**
 * Shared Pipeline stage selector + Lost Reason sub-panel for Inbox & Details sidebars.
 * Keyed by `conversationId` so switching conversations resets any unsaved Lost draft.
 */
export default function PipelineStageSection(props: PipelineStageSectionProps) {
  return <PipelineStageSectionInner key={props.conversationId} {...props} />;
}

function PipelineStageSectionInner({
  conversationId,
  pipeline,
  lostReason,
  lostReasonNote,
  lostAt,
  lostBy,
  isReadOnly = false,
  onSavePatch,
}: PipelineStageSectionProps) {
  const selectId = useId();
  const [isLostTransition, setIsLostTransition] = useState(false);

  const effectiveStage = isLostTransition ? "Lost" : pipeline;
  const stageColor = PIPELINE_STAGE_COLORS[effectiveStage] || "#8E8E93";
  const isLostStage = effectiveStage === "Lost";

  const handlePipelineChange = (nextStage: string) => {
    if (isReadOnly) return;
    if (nextStage === "Lost" && pipeline !== "Lost") {
      setIsLostTransition(true);
      return;
    }
    setIsLostTransition(false);
    if (nextStage !== pipeline) {
      void onSavePatch({ pipeline: nextStage });
    }
  };

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <label
          htmlFor={selectId}
          className="text-[9px] font-bold tracking-widest uppercase"
          style={{ color: "var(--bg-banner)" }}
        >
          Pipeline
        </label>
        {effectiveStage !== "direct" && (
          <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all"
            style={
              isLostStage
                ? {
                    backgroundColor: "var(--label-red-bg)",
                    color: "var(--label-red-text)",
                    border: "1px solid var(--label-red-border)",
                  }
                : {
                    backgroundColor: `${stageColor}18`,
                    color: stageColor,
                    border: `1px solid ${stageColor}35`,
                  }
            }
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor: isLostStage ? "var(--label-red-dot)" : stageColor,
              }}
            />
            {effectiveStage}
          </span>
        )}
      </div>

      {pipeline === "direct" && !isLostTransition ? (
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
              onClick={() => void onSavePatch({ pipeline: "New" })}
              className="text-[11px] font-semibold hover:underline cursor-pointer flex items-center gap-1"
              style={{ color: "var(--bg-banner)" }}
            >
              + Add to pipeline
            </button>
          )}
        </div>
      ) : (
        <>
          <select
            id={selectId}
            disabled={isReadOnly}
            value={effectiveStage}
            onChange={(e) => handlePipelineChange(e.target.value)}
            className="w-full rounded-[6px] text-base sm:text-[12px] py-1.5 px-2 min-h-[44px] sm:min-h-[32px] outline-none disabled:opacity-60 cursor-pointer font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--bg-banner)]"
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
            {!(PIPELINE_STAGES as readonly string[]).includes(pipeline) && pipeline !== "direct" && (
              <option value={pipeline}>{pipeline}</option>
            )}
          </select>

          <LostReasonPanel
            conversationId={conversationId}
            pipeline={pipeline}
            lostReason={lostReason}
            lostReasonNote={lostReasonNote}
            lostAt={lostAt}
            lostBy={lostBy}
            isTransitionDraft={isLostTransition}
            isReadOnly={isReadOnly}
            variant="sidebar"
            onCancelTransition={() => setIsLostTransition(false)}
            onConfirmLost={async ({ lostReason: reason, lostReasonNote: note }) => {
              const res = await onSavePatch({
                pipeline: "Lost",
                lostReason: reason,
                lostReasonNote: note,
              });
              if (!res || res.ok !== false) {
                setIsLostTransition(false);
              }
              return res;
            }}
            onSaveLostDetails={async ({ lostReason: reason, lostReasonNote: note }) =>
              onSavePatch({
                lostReason: reason,
                lostReasonNote: note,
              })
            }
          />
        </>
      )}
    </div>
  );
}

