"use client";

import React, { useEffect, useRef, useState } from "react";
import { User, Users } from "lucide-react";
import { getChatAvatarInitials } from "../utils/conversationAvatar";

export interface ConversationAvatarProps {
  conversationId: string;
  src?: string | null;
  name?: string | null;
  leadName?: string | null;
  isGroup?: boolean;
  isActive?: boolean;
  eager?: boolean;
  isFailed?: boolean;
  onImageError?: (conversationId: string, failedUrl: string) => void;
  className?: string;
}

/**
 * Circular contact/group avatar using CRM theme tokens with zero layout shift:
 * displays crisp initials or an icon immediately, cross-fades the photo once decoded,
 * and falls back seamlessly if a remote CDN URL has expired.
 */
export const ConversationAvatar = React.memo(function ConversationAvatar({
  conversationId,
  src,
  name,
  leadName,
  isGroup = false,
  isActive = false,
  eager = false,
  isFailed = false,
  onImageError,
  className = "",
}: ConversationAvatarProps) {
  const cleanSrc = typeof src === "string" && src.trim() && !isFailed ? src.trim() : null;
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!cleanSrc) return;
    let cancelled = false;
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) {
      Promise.resolve().then(() => {
        if (!cancelled) setLoadedSrc(cleanSrc);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [cleanSrc]);

  const isLoaded = Boolean(cleanSrc && loadedSrc === cleanSrc);
  const initials = isGroup
    ? ""
    : getChatAvatarInitials(name) || getChatAvatarInitials(leadName);

  return (
    <div
      aria-hidden="true"
      className={`relative w-9 h-9 rounded-full shrink-0 overflow-hidden border flex items-center justify-center text-[12px] font-semibold select-none ${className}`}
      style={{
        background: isActive ? "var(--bg-card)" : "var(--bg-pill)",
        borderColor: "var(--border-main)",
        color: isGroup
          ? "var(--bg-banner)"
          : isActive
          ? "var(--bg-banner)"
          : "var(--text-secondary)",
      }}
    >
      {isGroup ? (
        <Users className="w-4 h-4" />
      ) : initials ? (
        <span>{initials}</span>
      ) : (
        <User className="w-4 h-4" />
      )}

      {cleanSrc && (
        <img
          ref={imgRef}
          src={cleanSrc}
          alt=""
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setLoadedSrc(cleanSrc)}
          onError={() => {
            setLoadedSrc(null);
            onImageError?.(conversationId, cleanSrc);
          }}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-150 ${
            isLoaded ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </div>
  );
});
