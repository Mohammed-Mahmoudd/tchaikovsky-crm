"use client";

import React, { useEffect, useRef } from "react";
import {
  Archive,
  ArchiveRestore,
  Bookmark,
  CheckCircle2,
  Clock,
  RotateCcw,
} from "lucide-react";
import type { Conversation, LeadLabel } from "../context/CRMContext";
import type { InboxBucketAction } from "./InboxBucketActions";
import { ConversationAvatar } from "./ConversationAvatar";
import { LeadLabelBadges } from "./LeadLabelBadges";

export interface InboxConversationCardProps {
  conv: Conversation;
  isActive: boolean;
  timeStr: string;
  showLeadTimer: boolean;
  convDone: boolean;
  convArchived: boolean;
  convSaved: boolean;
  subtitle: string;
  avatarUrl: string | null;
  isAvatarFailed: boolean;
  isReadOnly: boolean;
  canDownloadChat: boolean;
  labels: ReadonlyArray<LeadLabel>;
  onSelect: (convId: string) => void;
  onApplyBucketChange: (convId: string, action: InboxBucketAction) => void;
  onAvatarError: (convId: string, failedUrl: string) => void;
  registerAvatarObserver: (
    convId: string,
    el: HTMLElement | null,
    needsAvatar: boolean
  ) => void;
}

/**
 * Memoized Inbox conversation row with circular profile picture,
 * viewport-driven avatar registration, and quick bucket actions.
 */
export const InboxConversationCard = React.memo(function InboxConversationCard({
  conv,
  isActive,
  timeStr,
  showLeadTimer,
  convDone,
  convArchived,
  convSaved,
  subtitle,
  avatarUrl,
  isAvatarFailed,
  isReadOnly,
  canDownloadChat,
  labels,
  onSelect,
  onApplyBucketChange,
  onAvatarError,
  registerAvatarObserver,
}: InboxConversationCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const needsAvatar = !avatarUrl;

  useEffect(() => {
    registerAvatarObserver(conv.id, cardRef.current, needsAvatar);
    return () => {
      registerAvatarObserver(conv.id, null, false);
    };
  }, [conv.id, needsAvatar, registerAvatarObserver]);

  return (
    <div
      ref={cardRef}
      data-conv-avatar-id={needsAvatar ? conv.id : undefined}
      onClick={() => onSelect(conv.id)}
      className="group flex items-start gap-2.5 px-3 py-3 cursor-pointer transition-colors"
      style={{
        borderBottom: "1px solid var(--border-main)",
        background: isActive ? "var(--bg-selected)" : undefined,
      }}
    >
      <ConversationAvatar
        conversationId={conv.id}
        src={avatarUrl}
        name={conv.name}
        leadName={conv.leadName}
        isGroup={Boolean(conv.isGroup)}
        isActive={isActive}
        isFailed={isAvatarFailed}
        onImageError={onAvatarError}
      />

      <div className="min-w-0 flex-1">
        <h3
          className="text-[13px] font-semibold leading-tight mb-0.5 truncate flex items-center gap-1"
          style={{ color: "var(--text-primary)" }}
        >
          {conv.isGroup && (
            <svg
              className="w-3.5 h-3.5 shrink-0 opacity-75"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-label="WhatsApp Group"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          )}
          <span className="truncate">{conv.name}</span>
        </h3>
        <p
          className="text-[11px] truncate"
          style={{ color: isActive ? "var(--bg-banner)" : "var(--text-secondary)" }}
        >
          {subtitle}
        </p>
        <LeadLabelBadges
          labelIds={conv.labels}
          catalog={labels}
          maxVisible={3}
          className="mt-1.5"
        />
      </div>

      <div className="flex flex-col items-end justify-between shrink-0 self-stretch gap-1">
        <div className="flex items-center gap-1">
          {!isReadOnly && (
            <div className="hidden md:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onApplyBucketChange(conv.id, convDone ? "reopen" : "done");
                }}
                aria-label={convDone ? `Reopen ${conv.name}` : `Mark ${conv.name} as done`}
                title={convDone ? "Reopen to Inbox" : "Mark as done"}
                className="p-1 rounded transition-colors cursor-pointer hover:bg-[var(--bg-hover)]"
                style={{ color: convDone ? "#34C759" : "var(--text-secondary)" }}
              >
                {convDone ? (
                  <RotateCcw className="w-3.5 h-3.5" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onApplyBucketChange(conv.id, convArchived ? "unarchive" : "archive");
                }}
                aria-label={convArchived ? `Unarchive ${conv.name}` : `Archive ${conv.name}`}
                title={convArchived ? "Unarchive" : "Archive"}
                className="p-1 rounded transition-colors cursor-pointer hover:bg-[var(--bg-hover)]"
                style={{ color: "var(--text-secondary)" }}
              >
                {convArchived ? (
                  <ArchiveRestore className="w-3.5 h-3.5" />
                ) : (
                  <Archive className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          )}
          {canDownloadChat && convSaved && (
            <span
              title="Saved for download"
              aria-label="Saved for download"
              className="inline-flex items-center justify-center px-1 py-0.5 rounded shrink-0 border"
              style={{
                background: "var(--label-purple-bg)",
                borderColor: "var(--label-purple-border)",
                color: "var(--label-purple-text)",
              }}
            >
              <Bookmark className="w-3 h-3" fill="currentColor" />
            </span>
          )}
          <span
            className="text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded"
            style={{
              background: isActive ? "var(--bg-card)" : "var(--bg-pill)",
              color: isActive ? "var(--bg-banner)" : "var(--text-secondary)",
            }}
          >
            {conv.isGroup
              ? "WA Group"
              : conv.metaChannel
              ? `${conv.channel} · ${conv.metaChannel}`
              : conv.channel}
          </span>
        </div>

        <div className="flex items-center gap-1.5 mt-auto">
          {timeStr && (
            <span
              className={`inline-flex items-center gap-1 text-[10px] whitespace-nowrap ${
                showLeadTimer ? "font-bold" : "font-medium"
              }`}
              style={{
                color: isActive ? "var(--bg-banner)" : "var(--text-muted)",
                opacity: showLeadTimer ? 1 : isActive ? 0.9 : 0.85,
              }}
              title={showLeadTimer ? "Waiting for reply — last message from lead" : undefined}
            >
              {showLeadTimer && (
                <Clock
                  className="w-3 h-3 shrink-0 stroke-[2.5]"
                  role="img"
                  aria-label="Waiting for reply — last message from lead"
                />
              )}
              <span>{timeStr}</span>
            </span>
          )}
          {Boolean(conv.unreadCount && conv.unreadCount > 0) && (
            <span
              className="flex items-center justify-center min-w-[16px] h-[16px] px-1 text-white text-[9px] font-bold rounded-full"
              style={{ background: "var(--bg-banner)" }}
            >
              {conv.unreadCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

