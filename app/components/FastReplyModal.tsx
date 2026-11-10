"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, Check, AlertCircle } from "lucide-react";
import type { QuickReply } from "../utils/quickReplies";

interface FastReplyModalProps {
  isOpen: boolean;
  editingReply: QuickReply | null;
  initialShortcut?: string;
  onClose: () => void;
  onSave: (reply: {
    id?: string;
    shortcut: string;
    title?: string;
    text: string;
    category?: string;
  }) => Promise<{ success: boolean; error?: string }>;
}

const CATEGORY_SUGGESTIONS = [
  "General",
  "Locations",
  "Welcome",
  "Auditions",
  "Questions",
  "Pricing",
];

export const FastReplyModal = React.memo(function FastReplyModal({
  isOpen,
  editingReply,
  initialShortcut = "",
  onClose,
  onSave,
}: FastReplyModalProps) {
  const [shortcut, setShortcut] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [category, setCategory] = useState("General");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const shortcutInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (editingReply) {
        setShortcut(editingReply.shortcut || "");
        setTitle(editingReply.title || "");
        setText(editingReply.text || "");
        setCategory(editingReply.category || "General");
      } else {
        setShortcut(initialShortcut ? initialShortcut.replace(/^\/+/, "") : "");
        setTitle("");
        setText("");
        setCategory("General");
      }
      setError(null);
      setIsSubmitting(false);

      setTimeout(() => {
        if (!shortcut || !editingReply) {
          shortcutInputRef.current?.focus();
        } else {
          textInputRef.current?.focus();
        }
      }, 50);
    }
  }, [isOpen, editingReply, initialShortcut]);

  if (!isOpen) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanShortcut = shortcut.replace(/^\/+/, "").trim().toLowerCase();
    const cleanText = text.trim();
    const cleanTitle = title.trim();
    const cleanCategory = category.trim() || "General";

    if (!cleanShortcut) {
      setError("Please provide a shortcut (e.g. jeddah or اهلا)");
      shortcutInputRef.current?.focus();
      return;
    }

    if (!cleanText) {
      setError("Please enter the message text");
      textInputRef.current?.focus();
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const res = await onSave({
      id: editingReply?.id,
      shortcut: cleanShortcut,
      title: cleanTitle || cleanShortcut,
      text: cleanText,
      category: cleanCategory,
    });

    setIsSubmitting(false);

    if (res.success) {
      onClose();
    } else {
      setError(res.error || "Failed to save quick reply. Please try again.");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        style={{
          background: "var(--bg-card)",
          borderColor: "var(--border-main)",
          boxShadow: "0 20px 45px rgba(0, 0, 0, 0.35)",
        }}
      >
        {/* Modal Header */}
        <div
          className="px-5 py-4 border-b flex items-center justify-between"
          style={{
            background: "var(--bg-panel)",
            borderColor: "var(--border-main)",
          }}
        >
          <div>
            <h2 className="text-[14px] font-bold" style={{ color: "var(--text-primary)" }}>
              {editingReply ? "Edit Fast Reply" : "New Fast Reply"}
            </h2>
            <p className="text-[11.5px]" style={{ color: "var(--text-secondary)" }}>
              Type &ldquo;/&rdquo; followed by the shortcut in chat to insert this reply instantly.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          {error && (
            <div
              className="p-3 rounded-xl border flex items-center gap-2 text-[12px] bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400 animate-in fade-in duration-150"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Shortcut Input */}
          <div>
            <label
              className="block text-[12px] font-semibold mb-1.5"
              style={{ color: "var(--text-primary)" }}
            >
              Shortcut <span className="text-red-500">*</span>
            </label>
            <div
              className="flex items-center rounded-xl border px-3 transition-colors focus-within:border-[#0066FF] focus-within:ring-2 focus-within:ring-[#0066FF]/20"
              style={{
                background: "var(--bg-input)",
                borderColor: "var(--border-input)",
              }}
            >
              <span className="text-[14px] font-bold font-mono text-[#0066FF] select-none pr-1">
                /
              </span>
              <input
                ref={shortcutInputRef}
                type="text"
                dir="auto"
                value={shortcut}
                onChange={(e) => {
                  setShortcut(e.target.value.replace(/^\/+/, ""));
                  setError(null);
                }}
                placeholder="e.g. jeddah or اهلا"
                className="w-full py-2 text-[13px] bg-transparent outline-none font-medium"
                style={{ color: "var(--text-primary)" }}
                required
              />
            </div>
            <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
              The keyword you type after &ldquo;/&rdquo; to trigger this reply (English or Arabic).
            </p>
          </div>

          {/* Title / Description (Optional) */}
          <div>
            <label
              className="block text-[12px] font-semibold mb-1.5"
              style={{ color: "var(--text-primary)" }}
            >
              Label / Title <span className="text-[11px] font-normal text-[var(--text-muted)]">(optional)</span>
            </label>
            <input
              type="text"
              dir="auto"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Jeddah Branch Location"
              className="w-full px-3 py-2 text-[13px] rounded-xl border bg-transparent outline-none transition-colors focus:border-[#0066FF] focus:ring-2 focus:ring-[#0066FF]/20 font-medium"
              style={{
                background: "var(--bg-input)",
                borderColor: "var(--border-input)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          {/* Message Text */}
          <div>
            <label
              className="block text-[12px] font-semibold mb-1.5"
              style={{ color: "var(--text-primary)" }}
            >
              Message Text <span className="text-red-500">*</span>
            </label>
            <textarea
              ref={textInputRef}
              rows={5}
              dir="auto"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setError(null);
              }}
              placeholder="Type the response message here. You can include links, emojis, and multiple lines..."
              className="w-full px-3 py-2.5 text-[13px] rounded-xl border bg-transparent outline-none resize-y transition-colors focus:border-[#0066FF] focus:ring-2 focus:ring-[#0066FF]/20 leading-relaxed"
              style={{
                background: "var(--bg-input)",
                borderColor: "var(--border-input)",
                color: "var(--text-primary)",
              }}
              required
            />
          </div>

          {/* Category Selector */}
          <div>
            <label
              className="block text-[12px] font-semibold mb-1.5"
              style={{ color: "var(--text-primary)" }}
            >
              Category
            </label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {CATEGORY_SUGGESTIONS.map((cat) => {
                const isActive = category.toLowerCase() === cat.toLowerCase();
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                      isActive
                        ? "bg-[#0066FF] text-white border-[#0066FF]"
                        : "border-[var(--border-input)] hover:border-[#0066FF] text-[var(--text-secondary)]"
                    }`}
                    style={{
                      background: isActive ? undefined : "var(--bg-pill)",
                    }}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Modal Footer */}
          <div
            className="pt-3 border-t flex items-center justify-between gap-3 mt-2"
            style={{ borderColor: "var(--border-main)" }}
          >
            <span className="text-[11px] text-[var(--text-muted)] hidden sm:inline">
              Press <strong className="font-semibold text-[var(--text-secondary)]">⌘+Enter</strong> to save
            </span>

            <div className="flex items-center gap-2 ms-auto">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-3.5 py-2 text-[12.5px] font-semibold rounded-xl border hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                style={{
                  borderColor: "var(--border-input)",
                  color: "var(--text-secondary)",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 text-[12.5px] font-semibold rounded-xl text-white bg-[#0066FF] hover:bg-[#0055D6] transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span>Saving...</span>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>{editingReply ? "Update Reply" : "Save Reply"}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
});

