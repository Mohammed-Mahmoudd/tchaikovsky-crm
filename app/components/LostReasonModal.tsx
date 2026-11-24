"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { AlertCircle, X } from "lucide-react";
import { LOST_REASON_OPTIONS, validateLostReasonSubmission } from "../utils/lostReasons";

export interface LostReasonModalProps {
  leadName: string;
  onConfirm: (payload: { lostReason: string; lostReasonNote: string }) => Promise<{ ok: boolean; error?: string } | void>;
  onClose: () => void;
}

/**
 * Responsive dialog/bottom-sheet requiring a lost reason when a lead is dragged or moved to Lost on the Kanban board.
 */
export default function LostReasonModal({ leadName, onConfirm, onClose }: LostReasonModalProps) {
  const titleId = useId();
  const selectId = useId();
  const noteId = useId();
  const errorId = useId();

  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<{ field: "reason" | "note"; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectRef = useRef<HTMLSelectElement | null>(null);
  const noteRef = useRef<HTMLInputElement | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    const focusTimer = setTimeout(() => selectRef.current?.focus(), 20);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      isMountedRef.current = false;
      clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSubmitting, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const validation = validateLostReasonSubmission(reason, note);
    if (!validation.ok) {
      setError({ field: validation.field, message: validation.error });
      if (validation.field === "reason") selectRef.current?.focus();
      else noteRef.current?.focus();
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      const res = await onConfirm({
        lostReason: validation.reason,
        lostReasonNote: validation.note,
      });
      if (res && res.ok === false) {
        if (isMountedRef.current) {
          setError({
            field: "reason",
            message: res.error || "Could not mark lead as Lost. Please try again.",
          });
        }
        return;
      }
      if (isMountedRef.current) {
        onClose();
      }
    } catch {
      if (isMountedRef.current) {
        setError({
          field: "reason",
          message: "Could not mark lead as Lost. Please try again.",
        });
      }
    } finally {
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    }
  };

  const isOther = reason === "other";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-xs transition-opacity"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={() => !isSubmitting && onClose()}
    >
      <div
        className="w-full sm:max-w-[440px] rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl border max-h-[90dvh] overflow-y-auto"
        style={{
          background: "var(--bg-card)",
          borderColor: "var(--border-main)",
          color: "var(--text-primary)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <p
              className="text-[10px] font-bold uppercase tracking-widest"
              style={{ color: "var(--label-red-text)" }}
            >
              Mark as Lost
            </p>
            <h3
              id={titleId}
              className="text-[16px] font-bold mt-0.5 truncate"
              style={{ color: "var(--text-primary)" }}
            >
              Why was {leadName} lost?
            </h3>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            aria-label="Close lost reason dialog"
            className="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50 cursor-pointer shrink-0"
            style={{ color: "var(--text-secondary)" }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-3.5">
          <div>
            <label
              htmlFor={selectId}
              className="text-[12px] font-semibold block mb-1.5"
              style={{ color: "var(--text-primary)" }}
            >
              Reason *
            </label>
            <select
              ref={selectRef}
              id={selectId}
              disabled={isSubmitting}
              value={reason}
              aria-invalid={error?.field === "reason" ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(e) => {
                const next = e.target.value;
                setReason(next);
                setError(null);
                if (next === "other") {
                  setTimeout(() => noteRef.current?.focus(), 20);
                }
              }}
              className="w-full min-h-[44px] sm:min-h-[38px] px-3 text-base sm:text-[13px] rounded-xl outline-none cursor-pointer disabled:opacity-60"
              style={{
                background: "var(--bg-input)",
                border:
                  error?.field === "reason"
                    ? "1px solid var(--label-red-border)"
                    : "1px solid var(--border-input)",
                color: reason ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              <option value="">Select why this lead was lost...</option>
              {LOST_REASON_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor={noteId}
              className="text-[12px] font-semibold block mb-1.5"
              style={{ color: "var(--text-secondary)" }}
            >
              {isOther ? "Details *" : "Details (optional)"}
            </label>
            <input
              ref={noteRef}
              id={noteId}
              type="text"
              maxLength={500}
              disabled={isSubmitting}
              value={note}
              placeholder={
                isOther
                  ? "Enter brief explanation..."
                  : "Optional context (e.g. budget, preferred timing)"
              }
              aria-invalid={error?.field === "note" ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(e) => {
                setNote(e.target.value);
                if (error?.field === "note") setError(null);
              }}
              className="w-full min-h-[44px] sm:min-h-[38px] px-3 text-base sm:text-[13px] rounded-xl outline-none disabled:opacity-60"
              style={{
                background: "var(--bg-input)",
                border:
                  error?.field === "note"
                    ? "1px solid var(--label-red-border)"
                    : "1px solid var(--border-input)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          {error && (
            <p
              id={errorId}
              role="alert"
              className="flex items-center gap-1.5 text-[12px] font-medium"
              style={{ color: "var(--label-red-text)" }}
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error.message}</span>
            </p>
          )}

          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 pt-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="flex-1 sm:flex-none px-5 min-h-[44px] sm:min-h-[38px] text-[13px] font-medium rounded-xl cursor-pointer hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-50"
              style={{
                background: "var(--bg-pill)",
                border: "1px solid var(--border-input)",
                color: "var(--text-secondary)",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 min-h-[44px] sm:min-h-[38px] px-4 text-[13px] font-semibold text-white rounded-xl cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50"
              style={{ background: "var(--label-red-dot)" }}
            >
              {isSubmitting ? "Saving..." : "Mark as Lost"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

