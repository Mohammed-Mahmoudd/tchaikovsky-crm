"use client";

import React, { useState } from "react";
import { Check, Clock, Pencil, RefreshCw, Send, Trash2, X } from "lucide-react";
import type { ComposerAgentId } from "../utils/composerAgent";
import { renderWhatsAppText } from "../utils/messageFormatting";
import type { MessageChannel } from "../utils/messageFormatting";

export interface DraftMessageBubbleProps {
  agent: ComposerAgentId;
  text: string;
  channel: MessageChannel;
  isRewriting?: boolean;
  isSending?: boolean;
  canSend?: boolean;
  onUpdateText: (nextText: string) => void;
  onSend: (textToSend: string) => Promise<void> | void;
  onRewrite: () => void;
  onDiscard: () => void;
}

/**
 * Renders an AI-generated reply draft at the bottom of the chat timeline styled like
 * an outgoing sent bubble, but grayed out so it is clearly distinguishable before sending.
 */
export function DraftMessageBubble(props: DraftMessageBubbleProps) {
  return (
    <DraftMessageBubbleInner
      key={`${props.agent}:${props.text}`}
      {...props}
    />
  );
}

function DraftMessageBubbleInner({
  agent,
  text,
  channel,
  isRewriting = false,
  isSending = false,
  canSend = true,
  onUpdateText,
  onSend,
  onRewrite,
  onDiscard,
}: DraftMessageBubbleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(text);

  const activeText = (isEditing ? editValue : text).trim();
  const agentLabel = agent === "followup" ? "Follow-up Adham" : "Admission Adham";
  const isRtl = /[\u0600-\u06FF]/.test(activeText);

  const handleSaveEdit = () => {
    const trimmed = editValue.trim();
    if (!trimmed) {
      setEditValue(text);
      setIsEditing(false);
      return;
    }
    onUpdateText(trimmed);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditValue(text);
    setIsEditing(false);
  };

  const handleSendClick = () => {
    if (!activeText || isSending || isRewriting || !canSend) return;
    if (isEditing) {
      onUpdateText(activeText);
      setIsEditing(false);
    }
    void onSend(activeText);
  };

  return (
    <div
      data-draft-bubble
      className="group relative flex flex-col w-full py-0.5 select-none items-end"
    >
      <span
        className="text-[11px] font-medium mb-1 px-1.5"
        style={{ color: "var(--text-muted)" }}
      >
        {agentLabel} · Draft
      </span>

      <div className="relative flex items-center gap-1.5 max-w-full flex-row-reverse">
        <div
          onDoubleClick={() => {
            if (!isSending && !isRewriting) {
              setEditValue(text);
              setIsEditing(true);
            }
          }}
          title={!isEditing ? "Double-click to edit draft" : undefined}
          className={`relative select-text ${
            isEditing
              ? "w-[min(85vw,460px)] md:w-[460px] lg:w-[540px]"
              : "max-w-[85%] md:max-w-[460px] lg:max-w-[540px]"
          } px-4 py-3 rounded-2xl rounded-tr-sm transition-all`}
          style={{
            background: "var(--bg-pill)",
            border: "1px dashed var(--border-input)",
            boxShadow: "none",
          }}
        >
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                rows={4}
                autoFocus
                dir="auto"
                value={editValue}
                disabled={isSending}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    handleCancelEdit();
                  } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleSaveEdit();
                  }
                }}
                className="w-full rounded-lg p-2.5 text-[16px] sm:text-[13.5px] leading-relaxed resize-y outline-none"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-input)",
                  color: "var(--text-primary)",
                }}
              />
              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  disabled={isSending}
                  onClick={handleCancelEdit}
                  className="inline-flex items-center gap-1 min-h-[34px] sm:min-h-[28px] px-2.5 rounded-md text-[11px] font-medium cursor-pointer"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-input)",
                    color: "var(--text-secondary)",
                  }}
                >
                  <X className="w-3 h-3" />
                  <span>Cancel</span>
                </button>
                <button
                  type="button"
                  disabled={isSending || !editValue.trim()}
                  onClick={handleSaveEdit}
                  className="inline-flex items-center gap-1 min-h-[34px] sm:min-h-[28px] px-2.5 rounded-md text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-input)",
                    color: "var(--text-primary)",
                  }}
                >
                  <Check className="w-3 h-3" />
                  <span>Done</span>
                </button>
              </div>
            </div>
          ) : (
            <p
              className="text-[13px] sm:text-[14px] leading-relaxed break-words whitespace-pre-wrap select-text"
              style={{ color: "var(--text-secondary)" }}
              dir="auto"
            >
              {channel === "WA" ? renderWhatsAppText(text) : text}
            </p>
          )}

          {/* Grayed Outgoing Footer matching real sent bubbles */}
          <div
            className={`text-[10px] mt-1.5 flex items-center gap-1 ${
              isRtl ? "justify-start" : "justify-end"
            }`}
            style={{ color: "var(--text-muted)" }}
          >
            <span>Draft · Not sent</span>
            <Clock className="w-3 h-3 opacity-75" aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Compact Draft Action Strip */}
      <div className="mt-1.5 flex flex-wrap items-center justify-end gap-1.5">
        <button
          type="button"
          disabled={isSending || isRewriting}
          onClick={onDiscard}
          title="Discard draft"
          className="inline-flex items-center gap-1 min-h-[36px] sm:min-h-[28px] px-2.5 rounded-lg text-[11px] font-medium cursor-pointer hover:bg-[var(--bg-hover)] disabled:opacity-50"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-input)",
            color: "var(--text-secondary)",
          }}
        >
          <Trash2 className="w-3 h-3" />
          <span>Discard</span>
        </button>

        <button
          type="button"
          disabled={isSending || isRewriting}
          onClick={onRewrite}
          title="Write a fresh version"
          className="inline-flex items-center gap-1 min-h-[36px] sm:min-h-[28px] px-2.5 rounded-lg text-[11px] font-medium cursor-pointer hover:bg-[var(--bg-hover)] disabled:opacity-50"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-input)",
            color: "var(--text-secondary)",
          }}
        >
          <RefreshCw className={`w-3 h-3 ${isRewriting ? "animate-spin" : ""}`} />
          <span>{isRewriting ? "Rewriting..." : "Rewrite"}</span>
        </button>

        {!isEditing && (
          <button
            type="button"
            disabled={isSending || isRewriting}
            onClick={() => {
              setEditValue(text);
              setIsEditing(true);
            }}
            title="Edit draft before sending"
            className="inline-flex items-center gap-1 min-h-[36px] sm:min-h-[28px] px-2.5 rounded-lg text-[11px] font-medium cursor-pointer hover:bg-[var(--bg-hover)] disabled:opacity-50"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-input)",
              color: "var(--text-primary)",
            }}
          >
            <Pencil className="w-3 h-3" />
            <span>Edit</span>
          </button>
        )}

        {canSend && (
          <button
            type="button"
            disabled={isSending || isRewriting || !activeText}
            onClick={handleSendClick}
            title="Send draft to lead"
            className="inline-flex items-center gap-1 min-h-[36px] sm:min-h-[28px] px-3 rounded-lg text-[11px] font-semibold text-white cursor-pointer disabled:opacity-50"
            style={{ background: "var(--bg-banner)" }}
          >
            <Send className="w-3 h-3" />
            <span>{isSending ? "Sending..." : "Send"}</span>
          </button>
        )}
      </div>
    </div>
  );
}
