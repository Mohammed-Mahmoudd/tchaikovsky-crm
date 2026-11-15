"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { AlertCircle, Check, Pencil, X } from "lucide-react";
import {
  isPlaceholderLeadName,
  validateLeadNameInput,
} from "../utils/leadName";

export type LeadNameSaveResult = { ok: boolean; error?: string } | void;

export interface EditableLeadNameProps {
  conversationId: string;
  displayName: string;
  secondaryText?: string;
  isNameCustomized?: boolean;
  isReadOnly?: boolean;
  onSaveName: (newName: string) => Promise<LeadNameSaveResult>;
  rightSlot?: React.ReactNode;
}

/**
 * Visible, keyboard-accessible inline editor for a lead's display name.
 * Keyed by `conversationId` so switching conversations cleanly resets local state.
 */
export default function EditableLeadName(props: EditableLeadNameProps) {
  return <EditableLeadNameInner key={props.conversationId} {...props} />;
}

function EditableLeadNameInner({
  displayName,
  secondaryText,
  isNameCustomized = true,
  isReadOnly = false,
  onSaveName,
  rightSlot,
}: EditableLeadNameProps) {
  const inputId = useId();
  const errorId = useId();

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(displayName);
  const [error, setError] = useState<string | null>(null);
  const [savedVisible, setSavedVisible] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const suppressNextBlurRef = useRef(false);
  const shouldFocusOnOpenRef = useRef(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSeqRef = useRef(0);
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

  useEffect(() => {
    if (isEditing && shouldFocusOnOpenRef.current && inputRef.current) {
      shouldFocusOnOpenRef.current = false;
      const el = inputRef.current;
      el.focus();
      el.select();
    }
  }, [isEditing]);

  const enterEditMode = () => {
    if (isReadOnly) return;
    if (savedTimerRef.current) {
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = null;
    }
    shouldFocusOnOpenRef.current = true;
    setSavedVisible(false);
    setError(null);
    setDraft(displayName);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    suppressNextBlurRef.current = true;
    shouldFocusOnOpenRef.current = false;
    setError(null);
    setDraft(displayName);
    setIsEditing(false);
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
    }, 2200);
  };

  const commitEdit = (trigger: "submit" | "blur") => {
    if (!isEditing || isReadOnly) return;

    if (trigger === "blur" && !draft.trim()) {
      cancelEdit();
      return;
    }

    const validation = validateLeadNameInput(draft);
    if (!validation.ok) {
      setError(validation.error);
      if (trigger === "submit") {
        inputRef.current?.focus();
      }
      return;
    }

    const normalizedNext = validation.value;
    if (normalizedNext === displayName.trim() && isNameCustomized) {
      setError(null);
      setIsEditing(false);
      return;
    }

    const seq = ++saveSeqRef.current;

    // Close edit mode and confirm optimistically at 0ms while persistence runs in background.
    setError(null);
    setIsEditing(false);
    showSavedFeedback();

    void onSaveName(normalizedNext).then((result) => {
      if (!isMountedRef.current || saveSeqRef.current !== seq) return;
      if (result && result.ok === false) {
        if (savedTimerRef.current) {
          clearTimeout(savedTimerRef.current);
          savedTimerRef.current = null;
        }
        shouldFocusOnOpenRef.current = false;
        setSavedVisible(false);
        setDraft(normalizedNext);
        setError(result.error || "Could not save lead name. Please try again.");
        setIsEditing(true);
      }
    });
  };

  const handleInputBlur = () => {
    if (suppressNextBlurRef.current) {
      suppressNextBlurRef.current = false;
      return;
    }
    commitEdit("blur");
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      suppressNextBlurRef.current = true;
      commitEdit("submit");
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  };

  const hasPlaceholderName = isPlaceholderLeadName(displayName);
  const showSecondary =
    Boolean(secondaryText) && secondaryText?.trim() !== displayName.trim();

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <label
            htmlFor={isEditing ? inputId : undefined}
            className="text-[9px] font-bold tracking-widest text-[#0066FF] uppercase shrink-0"
          >
            Lead Name
          </label>
          {savedVisible && !isEditing && !error && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-[#34C759]"
              style={{
                background: "rgba(52, 199, 89, 0.12)",
                border: "1px solid rgba(52, 199, 89, 0.3)",
              }}
              aria-live="polite"
            >
              <Check className="w-3 h-3 shrink-0" />
              Saved
            </span>
          )}
        </div>
        {rightSlot ? <div className="flex items-center gap-1 shrink-0">{rightSlot}</div> : null}
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            value={draft}
            maxLength={120}
            aria-label="Lead name"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            placeholder="Enter lead name..."
            onChange={(e) => {
              setDraft(e.target.value);
              if (error) setError(null);
            }}
            onBlur={handleInputBlur}
            onKeyDown={handleInputKeyDown}
            className="w-full rounded-lg px-3 py-2 text-[16px] font-semibold focus:outline-none transition-colors"
            style={{
              background: "var(--bg-input)",
              color: "var(--text-primary)",
              border: error ? "1px solid #EF4444" : "1px solid #0066FF",
            }}
          />

          {error && (
            <p
              id={errorId}
              role="alert"
              className="flex items-start gap-1.5 text-[11px] leading-snug text-[#EF4444]"
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </p>
          )}

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                suppressNextBlurRef.current = true;
              }}
              onClick={() => commitEdit("submit")}
              className="inline-flex items-center justify-center gap-1 h-[28px] px-2.5 rounded-[6px] text-[11px] font-semibold text-white bg-[#0066FF] hover:bg-[#0055DD] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0066FF]"
            >
              <Check className="w-3 h-3 shrink-0" />
              Save
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                suppressNextBlurRef.current = true;
              }}
              onClick={cancelEdit}
              className="inline-flex items-center justify-center gap-1 h-[28px] px-2.5 rounded-[6px] text-[11px] font-medium transition-colors cursor-pointer hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0066FF]"
              style={{
                background: "var(--bg-pill)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border-input)",
              }}
            >
              <X className="w-3 h-3 shrink-0" />
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          {isReadOnly ? (
            <h2
              className="text-[16px] font-bold leading-snug break-words min-w-0 flex-1"
              style={{ color: "var(--text-primary)" }}
            >
              {displayName}
            </h2>
          ) : (
            <button
              type="button"
              onClick={enterEditMode}
              title="Click to edit lead name"
              className="group flex-1 min-w-0 text-left rounded-md px-1.5 py-1 -mx-1.5 -my-1 transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0066FF]"
            >
              <span
                className="block text-[16px] font-bold leading-snug break-words group-hover:text-[#0066FF] transition-colors"
                style={{ color: "var(--text-primary)" }}
              >
                {displayName}
              </span>
            </button>
          )}

          {!isReadOnly && (
            <button
              type="button"
              onClick={enterEditMode}
              aria-label={hasPlaceholderName ? "Add lead name" : "Edit lead name"}
              className="inline-flex items-center justify-center gap-1 shrink-0 h-[26px] px-2 rounded-[6px] text-[11px] font-medium transition-colors cursor-pointer hover:border-[#0066FF] hover:text-[#0066FF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0066FF]"
              style={{
                background: "var(--bg-pill)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-input)",
              }}
            >
              <Pencil className="w-3 h-3 shrink-0" />
              <span>{hasPlaceholderName ? "Add name" : "Edit"}</span>
            </button>
          )}
        </div>
      )}

      {showSecondary && (
        <p
          className="text-[11px] mt-1 truncate"
          style={{ color: "var(--text-secondary)" }}
        >
          {secondaryText}
        </p>
      )}
    </div>
  );
}
