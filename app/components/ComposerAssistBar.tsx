"use client";

import React from "react";
import { Bold, Italic, Strikethrough, Code, List, ListOrdered, Quote } from "lucide-react";
import type { InlineMarker, LinePrefix } from "../utils/messageFormatting";
import type { ComposerFormatFlags } from "../utils/composerCodec";

export type FormatAction = { kind: "inline"; marker: InlineMarker } | { kind: "line"; prefix: LinePrefix };

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD = IS_MAC ? "⌘" : "Ctrl";

const FORMAT_BUTTONS: {
  action: FormatAction;
  formatKey?: keyof ComposerFormatFlags;
  icon: React.ReactNode;
  label: string;
}[] = [
  { action: { kind: "inline", marker: "*" }, formatKey: "bold", icon: <Bold className="w-3.5 h-3.5" />, label: `Bold (${MOD}+B)` },
  { action: { kind: "inline", marker: "_" }, formatKey: "italic", icon: <Italic className="w-3.5 h-3.5" />, label: `Italic (${MOD}+I)` },
  { action: { kind: "inline", marker: "~" }, formatKey: "strikethrough", icon: <Strikethrough className="w-3.5 h-3.5" />, label: `Strikethrough (${MOD}+Shift+X)` },
  { action: { kind: "inline", marker: "```" }, formatKey: "code", icon: <Code className="w-3.5 h-3.5" />, label: `Monospace (${MOD}+E)` },
  { action: { kind: "line", prefix: "- " }, icon: <List className="w-3.5 h-3.5" />, label: "Bulleted list" },
  { action: { kind: "line", prefix: "1. " }, icon: <ListOrdered className="w-3.5 h-3.5" />, label: "Numbered list" },
  { action: { kind: "line", prefix: "> " }, icon: <Quote className="w-3.5 h-3.5" />, label: "Quote" },
];

interface ComposerFormatButtonsProps {
  onFormat: (action: FormatAction) => void;
  activeFormats?: ComposerFormatFlags;
  disabled?: boolean;
  className?: string;
}

/**
 * Reusable WhatsApp formatting button strip shared by the top ComposerAssistBar
 * across single-line and multiline modes.
 */
export const ComposerFormatButtons = React.memo(function ComposerFormatButtons({
  onFormat,
  activeFormats,
  disabled = false,
  className = "",
}: ComposerFormatButtonsProps) {
  const keep = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div
      className={`flex items-center gap-0.5 shrink-0 ${className}`}
      onMouseDown={keep}
      role="toolbar"
      aria-label="Formatting"
    >
      {FORMAT_BUTTONS.map((btn, i) => {
        const isActive = Boolean(btn.formatKey && activeFormats?.[btn.formatKey]);
        return (
          <button
            key={btn.label}
            type="button"
            disabled={disabled}
            aria-pressed={btn.formatKey ? isActive : undefined}
            onMouseDown={keep}
            onClick={() => onFormat(btn.action)}
            title={btn.label}
            aria-label={btn.label}
            className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              isActive
                ? "bg-[var(--bg-selected)] text-[var(--bg-banner)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10"
            } ${i >= 4 ? "hidden sm:flex" : ""}`}
          >
            {btn.icon}
          </button>
        );
      })}
    </div>
  );
});

interface ComposerAssistBarProps {
  suggestions: string[];
  onPickSuggestion: (emoji: string) => void;
  showToolbar: boolean;
  onFormat: (action: FormatAction) => void;
  activeFormats?: ComposerFormatFlags;
  leftSlot?: React.ReactNode;
  popoverSlot?: React.ReactNode;
  disabled?: boolean;
}

/**
 * Floating row above the composer: docked controls (left on multiline), smart emoji suggestions (middle),
 * and WhatsApp formatting toolbar (right). Absolutely positioned so it never shifts chat scroll.
 */
export const ComposerAssistBar = React.memo(function ComposerAssistBar({
  suggestions,
  onPickSuggestion,
  showToolbar,
  onFormat,
  activeFormats,
  leftSlot,
  popoverSlot,
  disabled = false,
}: ComposerAssistBarProps) {
  const hasSuggestions = suggestions.length > 0;
  const hasLeftSlot = Boolean(leftSlot);
  if (!hasLeftSlot && !hasSuggestions && !showToolbar) return null;

  const keep = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div
      className="absolute bottom-full left-0 right-0 px-4 md:px-6 py-1.5 z-30 composer-assist-in"
      style={{
        background: "var(--bg-card)",
        borderTop: "1px solid var(--border-main)",
        boxShadow: "0 -4px 12px -8px rgba(0,0,0,0.18)",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) e.preventDefault();
      }}
    >
      <div className="relative flex items-center gap-2 w-full">
        {popoverSlot}

        {hasLeftSlot && (
          <div className="flex items-center gap-0.5 shrink-0">{leftSlot}</div>
        )}

        {/* Emoji suggestions */}
        <div
          className={`flex items-center gap-1 min-w-0 flex-1 overflow-x-auto no-scrollbar ${
            hasLeftSlot && hasSuggestions ? "ps-2 border-s border-[var(--border-main)]" : ""
          }`}
          role="listbox"
          aria-label="Emoji suggestions"
          onMouseDown={keep}
        >
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
          <ComposerFormatButtons
            onFormat={onFormat}
            activeFormats={activeFormats}
            disabled={disabled}
            className={hasSuggestions ? "ps-2 border-s border-[var(--border-main)]" : ""}
          />
        )}
      </div>
    </div>
  );
});

