"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";

interface ChatInputBarProps {
  chatId: string;
  isReadOnly: boolean;
  canSendMessages: boolean;
  isAssignedToOther: boolean;
  assignedAgent?: string;
  userName?: string;
  windowLeft?: string;
  isUnassigned: boolean;
  isAdmission: boolean;
  onAssignToMe?: () => void;
  onSendMessage: (text: string) => Promise<boolean>;
}

export const ChatInputBar = React.memo(function ChatInputBar({
  chatId,
  isReadOnly,
  canSendMessages,
  isAssignedToOther,
  assignedAgent,
  userName,
  windowLeft,
  isUnassigned,
  isAdmission,
  onAssignToMe,
  onSendMessage,
}: ChatInputBarProps) {
  // Local state completely isolated from parent page — typing does NOT re-render chat or sidebar
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset input and focus when switching conversations
  useEffect(() => {
    setText("");
    setIsSending(false);
    if (typeof window !== "undefined" && window.innerWidth >= 768) {
      inputRef.current?.focus();
    }
  }, [chatId]);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || isSending || isReadOnly || !canSendMessages) return;

    setIsSending(true);
    // Optimistically clear immediately so the user can keep typing without waiting
    setText("");

    const success = await onSendMessage(trimmed);
    setIsSending(false);

    if (!success) {
      // Restore input text on network/server error so nothing is lost
      setText(trimmed);
    } else {
      inputRef.current?.focus();
    }
  }, [text, isSending, isReadOnly, canSendMessages, onSendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isWindowClosed = windowLeft === "Closed";
  const isDisabled = isSending || isReadOnly || !canSendMessages;

  const placeholderText = isReadOnly
    ? "View-only mode (Marketing role)"
    : isAssignedToOther && userName
      ? `Reply as ${userName} (Assigned to ${assignedAgent || "Staff"})...`
      : "Type a reply...";

  return (
    <div
      className="px-4 md:px-6 py-4 shrink-0"
      style={{
        background: "var(--bg-card)",
        borderTop: "1px solid var(--border-main)",
      }}
    >
      {isAssignedToOther && (
        <div
          className="rounded-[8px] px-3 py-1.5 text-[11px] mb-2.5 flex items-center justify-between"
          style={{
            background: "var(--bg-pill)",
            border: "1px solid var(--border-input)",
            color: "var(--text-secondary)",
          }}
        >
          <div className="flex items-center gap-1.5">
            <span className="font-medium" style={{ color: "var(--text-primary)" }}>
              Assigned to {assignedAgent || "Staff"}
            </span>
            <span>·</span>
            <span>
              Sending as <strong style={{ color: "var(--text-primary)" }}>{userName || "Staff"}</strong>
            </span>
          </div>
        </div>
      )}

      {!isReadOnly && isUnassigned && isAdmission && userName && onAssignToMe && (
        <div
          className="rounded-[8px] px-3 py-1.5 text-[11px] mb-2.5 flex items-center justify-between"
          style={{
            background: "var(--bg-pill)",
            border: "1px solid var(--border-input)",
            color: "var(--text-secondary)",
          }}
        >
          <span>Unassigned lead · Replying will assign to you automatically</span>
          <button
            type="button"
            onClick={onAssignToMe}
            className="font-semibold text-[#0066FF] hover:underline cursor-pointer"
          >
            Assign to me now
          </button>
        </div>
      )}

      {isWindowClosed ? (
        <div
          className="rounded-[8px] p-4 text-[12px] text-center"
          style={{
            background: "var(--bg-input)",
            border: "1px solid var(--border-main)",
            color: "var(--text-secondary)",
          }}
        >
          The 24-hour reply window is closed. It reopens the next time this customer messages — outside it WhatsApp only allows approved template messages.
        </div>
      ) : (
        <div className="flex gap-2 items-center">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            autoCorrect="on"
            spellCheck={true}
            placeholder={placeholderText}
            disabled={isDisabled}
            className="flex-1 rounded-[8px] px-3.5 py-2 min-h-[42px] sm:min-h-[38px] text-[16px] sm:text-[13px] outline-none placeholder:text-[var(--text-muted)] transition-colors focus:border-[#0066FF] disabled:opacity-60"
            style={{
              border: "1px solid var(--border-main)",
              background: "var(--bg-input)",
              color: "var(--text-primary)",
              WebkitFontSmoothing: "antialiased",
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={isDisabled || !text.trim()}
            className="bg-[#0066FF] hover:bg-[#0055D6] disabled:bg-[#78B4F9] text-white font-semibold text-[13px] px-4 min-h-[42px] sm:min-h-[38px] rounded-[8px] shrink-0 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {isSending ? "Sending..." : "Send"}
          </button>
        </div>
      )}
    </div>
  );
});
