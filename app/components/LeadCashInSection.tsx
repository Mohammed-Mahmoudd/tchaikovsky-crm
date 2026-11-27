"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, Plus, Trash2 } from "lucide-react";
import { useAuth, isDirectorOrChairmanRole } from "./AuthProvider";
import type { ActivityLogEntry } from "../context/CRMContext";
import {
  type CashEntry,
  type ResolvedCashPayment,
  computeActiveCashTotal,
  formatLeadCashLabel,
  parseAddCashInput,
  resolveConversationCashPayments,
} from "../utils/leadCash";

export type LeadCashSaveResult = { ok: boolean; error?: string } | void;

export interface LeadCashInSectionProps {
  conversationId: string;
  cashIn?: number | null;
  cashRecordedBy?: string | null;
  cashEntries?: ReadonlyArray<CashEntry> | null;
  enrolledBy?: string | null;
  paidAt?: string | null;
  activityLog?: ReadonlyArray<ActivityLogEntry> | null;
  isReadOnly?: boolean;
  onAddCash: (input: { amount: number; note?: string }) => Promise<LeadCashSaveResult>;
  onVoidCash: (entryId: string, reason?: string) => Promise<LeadCashSaveResult>;
  variant?: "sidebar" | "panel";
}

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

function formatShortPaymentDate(ts: number): string {
  if (!ts || !Number.isFinite(ts) || ts <= 0) return "";
  try {
    return SHORT_DATE_FORMATTER.format(new Date(ts));
  } catch {
    return "";
  }
}

/**
 * Multi-payment Cash In section for lead details sidebars and drawers.
 * Keyed by `conversationId` so switching leads resets draft/feedback state cleanly.
 */
export default function LeadCashInSection(props: LeadCashInSectionProps) {
  return <LeadCashInSectionInner key={props.conversationId} {...props} />;
}

function LeadCashInSectionInner({
  cashIn,
  cashRecordedBy,
  cashEntries,
  enrolledBy,
  paidAt,
  activityLog,
  isReadOnly = false,
  onAddCash,
  onVoidCash,
  variant = "sidebar",
}: LeadCashInSectionProps) {
  const { user } = useAuth();
  const isSupervisor = isDirectorOrChairmanRole(user?.role);

  const inputId = useId();
  const noteInputId = useId();
  const errorId = useId();

  const [amountDraft, setAmountDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [showNoteField, setShowNoteField] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedVisible, setSavedVisible] = useState(false);

  const [confirmVoid, setConfirmVoid] = useState<ResolvedCashPayment | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [isVoiding, setIsVoiding] = useState(false);

  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
      }
    };
  }, []);

  const cashSnapshot = useMemo(
    () => ({
      cashIn,
      cashRecordedBy,
      cashEntries,
      enrolledBy,
      paidAt,
      activityLog,
    }),
    [cashIn, cashRecordedBy, cashEntries, enrolledBy, paidAt, activityLog]
  );

  const payments = useMemo(() => {
    const list = resolveConversationCashPayments(cashSnapshot);
    return [...list].reverse();
  }, [cashSnapshot]);

  const totalCash = useMemo(() => {
    if (payments.length > 0) return computeActiveCashTotal(cashSnapshot);
    return typeof cashIn === "number" && Number.isFinite(cashIn) && cashIn > 0 ? cashIn : 0;
  }, [payments.length, cashSnapshot, cashIn]);

  const formattedBadge = formatLeadCashLabel(totalCash);
  const isPanel = variant === "panel";

  const canVoidPayment = (payment: ResolvedCashPayment): boolean => {
    if (isReadOnly) return false;
    if (isSupervisor) return true;
    const userId = user?.id ? String(user.id).trim() : "";
    if (userId && payment.recordedByUserId && userId === payment.recordedByUserId) {
      return true;
    }
    const userName = (user?.name || "").trim().toLowerCase();
    return Boolean(userName && payment.actor && userName === payment.actor.trim().toLowerCase());
  };

  const showSavedFeedback = () => {
    if (savedTimerRef.current) {
      clearTimeout(savedTimerRef.current);
    }
    setSavedVisible(true);
    savedTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setSavedVisible(false);
      }
      savedTimerRef.current = null;
    }, 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || isSaving) return;

    const validation = parseAddCashInput(amountDraft);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      const res = await onAddCash({
        amount: validation.value,
        note: noteDraft.trim() || undefined,
      });
      if (res && res.ok === false) {
        if (isMountedRef.current) {
          setError(res.error || "Could not add cash payment. Please try again.");
        }
        return;
      }
      if (isMountedRef.current) {
        setAmountDraft("");
        setNoteDraft("");
        setShowNoteField(false);
        showSavedFeedback();
      }
    } catch {
      if (isMountedRef.current) {
        setError("Could not add cash payment. Please try again.");
      }
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false);
      }
    }
  };

  const handleConfirmVoid = async () => {
    if (!confirmVoid || isReadOnly || isVoiding) return;
    setError(null);
    setIsVoiding(true);
    try {
      const res = await onVoidCash(confirmVoid.id, voidReason.trim() || undefined);
      if (res && res.ok === false) {
        if (isMountedRef.current) {
          setError(res.error || "Could not remove payment. Please try again.");
        }
        return;
      }
      if (isMountedRef.current) {
        setConfirmVoid(null);
        setVoidReason("");
      }
    } catch {
      if (isMountedRef.current) {
        setError("Could not remove payment. Please try again.");
      }
    } finally {
      if (isMountedRef.current) {
        setIsVoiding(false);
      }
    }
  };

  return (
    <div className={isPanel ? "mb-6" : "mb-5"}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <label
          htmlFor={inputId}
          className={`${
            isPanel ? "text-[10px]" : "text-[9px]"
          } font-bold tracking-widest text-[#0066FF] uppercase`}
        >
          Cash In
        </label>
        {formattedBadge && (
          <span
            className="text-[10px] font-semibold tabular-nums"
            style={{ color: "var(--label-green-text)" }}
          >
            {formattedBadge}
            {payments.length > 1 ? ` · ${payments.length}` : ""}
          </span>
        )}
      </div>

      {payments.length > 0 && (
        <ul
          className="mb-2.5 rounded-[6px] overflow-hidden divide-y divide-[var(--border-main)]"
          style={{
            border: "1px solid var(--border-main)",
            background: "var(--bg-input)",
          }}
          aria-label="Recorded cash payments"
        >
          {payments.map((payment) => {
            const dateLabel = formatShortPaymentDate(payment.timestamp);
            const actorText = payment.isLegacy
              ? payment.actor
                ? `Legacy · ${payment.actor}`
                : "Legacy"
              : payment.actor
                ? `Added by ${payment.actor}`
                : "Added by staff";
            const allowVoid = canVoidPayment(payment);
            return (
              <li
                key={payment.id}
                className="flex items-start justify-between gap-2 px-2.5 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p
                    className="text-[11px] font-medium truncate"
                    style={{ color: "var(--text-primary)" }}
                    title={actorText}
                  >
                    {actorText}
                  </p>
                  {(dateLabel || payment.note) && (
                    <p
                      className="text-[10px] truncate mt-0.5"
                      style={{ color: "var(--text-secondary)" }}
                      title={payment.note || dateLabel}
                    >
                      {dateLabel}
                      {dateLabel && payment.note ? " · " : ""}
                      {payment.note}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className="text-[11px] font-semibold tabular-nums text-right"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {payment.amount.toLocaleString("en-US")} SAR
                  </span>
                  {allowVoid && (
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmVoid(payment);
                        setVoidReason("");
                        setError(null);
                      }}
                      disabled={isVoiding}
                      aria-label={`Remove ${payment.amount.toLocaleString("en-US")} SAR payment${
                        payment.actor ? ` added by ${payment.actor}` : ""
                      }`}
                      title="Remove payment"
                      className="inline-flex items-center justify-center rounded-[5px] min-w-[44px] min-h-[44px] sm:min-w-[26px] sm:min-h-[26px] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {confirmVoid && (
        <div
          role="dialog"
          aria-label="Confirm remove cash payment"
          className="mb-2.5 rounded-[6px] p-2.5 space-y-2"
          style={{
            border: "1px solid var(--label-red-border)",
            background: "var(--label-red-bg)",
          }}
        >
          <p className="text-[11px] font-medium" style={{ color: "var(--label-red-text)" }}>
            Remove {confirmVoid.amount.toLocaleString("en-US")} SAR
            {confirmVoid.actor ? ` added by ${confirmVoid.actor}` : ""}?
          </p>
          <input
            type="text"
            maxLength={160}
            value={voidReason}
            disabled={isVoiding}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder="Reason (optional)"
            className="w-full min-w-0 rounded-[6px] px-2.5 py-1.5 text-base sm:text-[11px] min-h-[44px] sm:min-h-[30px] outline-none"
            style={{
              border: "1px solid var(--border-input)",
              background: "var(--bg-card)",
              color: "var(--text-primary)",
            }}
          />
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-1.5">
            <button
              type="button"
              disabled={isVoiding}
              onClick={() => {
                setConfirmVoid(null);
                setVoidReason("");
              }}
              className="px-2.5 rounded-[6px] text-[11px] font-medium min-h-[44px] sm:min-h-[28px] transition-colors"
              style={{
                border: "1px solid var(--border-input)",
                background: "var(--bg-card)",
                color: "var(--text-primary)",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isVoiding}
              onClick={handleConfirmVoid}
              className="px-2.5 rounded-[6px] text-[11px] font-semibold min-h-[44px] sm:min-h-[28px] transition-colors disabled:opacity-50"
              style={{
                border: "1px solid var(--label-red-border)",
                background: "var(--bg-card)",
                color: "var(--label-red-text)",
              }}
            >
              {isVoiding ? "Removing..." : "Remove"}
            </button>
          </div>
        </div>
      )}

      {!isReadOnly && (
        <form onSubmit={handleSubmit} className="space-y-1.5" noValidate>
          <div className="flex items-stretch gap-2">
            <div className="relative flex-1 min-w-0">
              <input
                id={inputId}
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                disabled={isSaving}
                placeholder="Add amount"
                value={amountDraft}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                onChange={(e) => {
                  setAmountDraft(e.target.value);
                  if (error) setError(null);
                  if (savedVisible) setSavedVisible(false);
                }}
                onBlur={() => {
                  if (!amountDraft.trim()) return;
                  const validation = parseAddCashInput(amountDraft);
                  if (!validation.ok) {
                    setError(validation.error);
                  }
                }}
                className={`w-full min-w-0 rounded-[6px] pe-10 outline-none disabled:opacity-60 tabular-nums transition-colors ${
                  isPanel
                    ? "text-base sm:text-[13px] py-1.5 px-3 min-h-[44px] sm:min-h-[34px]"
                    : "text-base sm:text-[12px] py-1.5 px-2.5 min-h-[44px] sm:min-h-[30px]"
                }`}
                style={{
                  border: error
                    ? "1px solid var(--label-red-border)"
                    : "1px solid var(--border-input)",
                  background: "var(--bg-input)",
                  color: "var(--text-primary)",
                }}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 end-2.5 flex items-center text-[10px] font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                SAR
              </span>
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className={`bg-[#0066FF] text-white font-semibold rounded-[6px] shadow-sm hover:bg-[#0055d4] transition-colors cursor-pointer disabled:opacity-50 shrink-0 inline-flex items-center justify-center gap-1 ${
                isPanel
                  ? "text-[13px] px-4 min-h-[44px] sm:min-h-[34px]"
                  : "text-[11px] px-3 min-h-[44px] sm:min-h-[30px]"
              }`}
            >
              {isSaving ? (
                "Adding..."
              ) : savedVisible ? (
                <>
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  <span>Added</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  <span>Add</span>
                </>
              )}
            </button>
          </div>

          {showNoteField ? (
            <div>
              <label htmlFor={noteInputId} className="sr-only">
                Payment note
              </label>
              <input
                id={noteInputId}
                type="text"
                maxLength={160}
                disabled={isSaving}
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Note (optional, e.g. First installment)"
                className={`w-full min-w-0 rounded-[6px] outline-none disabled:opacity-60 transition-colors ${
                  isPanel
                    ? "text-base sm:text-[12px] py-1.5 px-3 min-h-[44px] sm:min-h-[32px]"
                    : "text-base sm:text-[11px] py-1 px-2.5 min-h-[44px] sm:min-h-[28px]"
                }`}
                style={{
                  border: "1px solid var(--border-input)",
                  background: "var(--bg-input)",
                  color: "var(--text-primary)",
                }}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowNoteField(true)}
              className="text-[10px] font-medium hover:underline py-1"
              style={{ color: "var(--text-secondary)" }}
            >
              + Add payment note
            </button>
          )}
        </form>
      )}

      {error && (
        <p
          id={errorId}
          role="alert"
          className="mt-1.5 flex items-center gap-1 text-[11px] font-medium"
          style={{ color: "var(--label-red-text)" }}
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
