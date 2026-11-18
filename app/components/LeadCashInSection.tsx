"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { AlertCircle, Check } from "lucide-react";
import {
  formatLeadCashInputValue,
  formatLeadCashLabel,
  parseLeadCashInput,
} from "../utils/leadCash";

export type LeadCashSaveResult = { ok: boolean; error?: string } | void;

export interface LeadCashInSectionProps {
  conversationId: string;
  cashIn?: number | null;
  isReadOnly?: boolean;
  onSaveCash: (amount: number) => Promise<LeadCashSaveResult>;
  variant?: "sidebar" | "panel";
}

/**
 * Editable Cash In section for lead details sidebars and drawers.
 * Keyed by `conversationId` so switching leads resets draft/feedback state cleanly.
 */
export default function LeadCashInSection(props: LeadCashInSectionProps) {
  return <LeadCashInSectionInner key={props.conversationId} {...props} />;
}

function LeadCashInSectionInner({
  cashIn,
  isReadOnly = false,
  onSaveCash,
  variant = "sidebar",
}: LeadCashInSectionProps) {
  const inputId = useId();
  const errorId = useId();

  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedVisible, setSavedVisible] = useState(false);

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

  const displayValue = draft !== null ? draft : formatLeadCashInputValue(cashIn);
  const formattedBadge = formatLeadCashLabel(cashIn);
  const isPanel = variant === "panel";

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

    const validation = parseLeadCashInput(displayValue);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      const res = await onSaveCash(validation.value);
      if (res && res.ok === false) {
        if (isMountedRef.current) {
          setError(res.error || "Could not save cash amount. Please try again.");
        }
        return;
      }
      if (isMountedRef.current) {
        setDraft(null);
        showSavedFeedback();
      }
    } catch {
      if (isMountedRef.current) {
        setError("Could not save cash amount. Please try again.");
      }
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false);
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
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex items-stretch gap-2" noValidate>
        <div className="relative flex-1 min-w-0">
          <input
            id={inputId}
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            disabled={isReadOnly || isSaving}
            placeholder="0"
            value={displayValue}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => {
              setDraft(e.target.value);
              if (error) setError(null);
              if (savedVisible) setSavedVisible(false);
            }}
            onBlur={() => {
              if (draft === null || !draft.trim()) return;
              const validation = parseLeadCashInput(draft);
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

        {!isReadOnly && (
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
              "Saving..."
            ) : savedVisible ? (
              <>
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>Saved</span>
              </>
            ) : (
              "Save"
            )}
          </button>
        )}
      </form>

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

