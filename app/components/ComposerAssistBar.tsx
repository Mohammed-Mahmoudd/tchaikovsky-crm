"use client";

import React from "react";
import { Bold, Italic, Strikethrough, Code, List, ListOrdered, Quote } from "lucide-react";
import type { InlineMarker, LinePrefix } from "../utils/messageFormatting";

export type FormatAction = { kind: "inline"; marker: InlineMarker } | { kind: "line"; prefix: LinePrefix };

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD = IS_MAC ? "⌘" : "Ctrl";

const FORMAT_BUTTONS: { action: FormatAction; icon: React.ReactNode; label: string }[] = [
  { action: { kind: "inline", marker: "*" }, icon: <Bold className="w-3.5 h-3.5" />, label: `Bold (${MOD}+B)` },
  { action: { kind: "inline", marker: "_" }, icon: <Italic className="w-3.5 h-3.5" />, label: `Italic (${MOD}+I)` },
  { action: { kind: "inline", marker: "~" }, icon: <Strikethrough className="w-3.5 h-3.5" />, label: `Strikethrough (${MOD}+Shift+X)` },
  { action: { kind: "inline", marker: "```" }, icon: <Code className="w-3.5 h-3.5" />, label: `Monospace (${MOD}+E)` },
  { action: { kind: "line", prefix: "- " }, icon: <List className="w-3.5 h-3.5" />, label: "Bulleted list" },
  { action: { kind: "line", prefix: "1. " }, icon: <ListOrdered className="w-3.5 h-3.5" />, label: "Numbered list" },
  { action: { kind: "line", prefix: "> " }, icon: <Quote className="w-3.5 h-3.5" />, label: "Quote" },
];

interface ComposerAssistBarProps {
  suggestions: string[];
  onPickSuggestion: (emoji: string) => void;
  showToolbar: boolean;
  onFormat: (action: FormatAction) => void;
}

/**
 * Floating row above the composer: smart emoji suggestions (left) + WhatsApp formatting toolbar (right).
 * Absolutely positioned so it never shifts the chat layout while typing.
 * Buttons use onMouseDown + preventDefault to keep the textarea focus and selection intact.
 */
export const ComposerAssistBar = React.memo(function ComposerAssistBar({
  suggestions,
  onPickSuggestion,
  showToolbar,
  onFormat,
}: ComposerAssistBarProps) {
  const hasSuggestions = suggestions.length > 0;
  if (!hasSuggestions && !showToolbar) return null;

  const keep = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div
      className="absolute bottom-full left-0 right-0 px-4 md:px-6 py-1.5 flex items-center gap-2 z-20 composer-assist-in"
      style={{
        background: "var(--bg-card)",
        borderTop: "1px solid var(--border-main)",
        boxShadow: "0 -4px 12px -8px rgba(0,0,0,0.18)",
      }}
      onMouseDown={keep}
    >
      {/* Emoji suggestions */}
      <div className="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto no-scrollbar" role="listbox" aria-label="Emoji suggestions">
        {hasSuggestions && (
          <>
            {suggestions.map((emoji, i) => (
              <button
                key={emoji}
                type="button"
                role="option"
                aria-selected={i === 0}
                onMouseDown={keep}
                onClick={() => onPickSuggestion(emoji)}
                title={i === 0 ? `Insert ${emoji} (Tab)` : `Insert ${emoji}`}
                className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-[19px] leading-none transition-transform duration-100 hover:scale-110 active:scale-95 cursor-pointer ${
                  i === 0 ? "bg-[var(--bg-selected)] ring-1 ring-[#0066FF]/40" : "hover:bg-black/5 dark:hover:bg-white/10"
                }`}
              >
                {emoji}
              </button>
            ))}
            <span className="hidden sm:inline shrink-0 text-[10.5px] ms-1 select-none" style={{ color: "var(--text-muted)" }}>
              Tab ↹
            </span>
          </>
        )}
      </div>

      {/* WhatsApp formatting toolbar */}
      {showToolbar && (
        <div
          className="flex items-center gap-0.5 shrink-0 ps-2"
          style={{ borderInlineStart: hasSuggestions ? "1px solid var(--border-main)" : undefined }}
          role="toolbar"
          aria-label="Formatting"
        >
          {FORMAT_BUTTONS.map((btn, i) => (
            <button
              key={btn.label}
              type="button"
              onMouseDown={keep}
              onClick={() => onFormat(btn.action)}
              title={btn.label}
              aria-label={btn.label}
              className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 ${
                i >= 4 ? "hidden sm:flex" : ""
              }`}
            >
              {btn.icon}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

