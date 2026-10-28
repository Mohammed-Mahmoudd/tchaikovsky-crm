"use client";

import React, { useState } from "react";
import { ExternalLink } from "lucide-react";

interface InstagramMediaProps {
  url?: string;
  title?: string;
  type?: string;
  mediaId?: string;
}

export default function InstagramMedia({ url, title, type, mediaId }: InstagramMediaProps) {
  const isExplicitReel = type === "ig_reel";
  const [isVideo, setIsVideo] = useState(isExplicitReel);
  const [isExpanded, setIsExpanded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const caption = (title || "").trim();
  const isLongCaption = caption.length > 110;

  return (
    <div
      className="rounded-xl overflow-hidden my-1 text-start transition-all shadow-sm"
      style={{
        border: "1px solid var(--border-main)",
        background: "var(--bg-card)",
        maxWidth: "280px",
        width: "100%",
      }}
    >


      {/* Media: Video player or Image */}
      {url && !loadError ? (
        <div className="relative overflow-hidden bg-black flex items-center justify-center min-h-[140px] max-h-64">
          {isVideo ? (
            <video
              src={url}
              controls
              playsInline
              preload="metadata"
              className="w-full max-h-64 object-contain"
              onError={() => {
                setLoadError(true);
              }}
            />
          ) : (
            <img
              src={url}
              alt="Instagram Post"
              className="w-full max-h-56 object-cover"
              onError={() => {
                // If Meta CDN returned video/mp4 into img tag, seamlessly switch to HTML5 video player
                setIsVideo(true);
              }}
            />
          )}
        </div>
      ) : url && loadError ? (
        <div
          className="p-3 text-center flex flex-col items-center justify-center gap-1.5"
          style={{ background: "var(--bg-pill)", minHeight: "100px" }}
        >
          <span className="text-[22px]">🎬</span>
          <p className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
            Instagram Media
          </p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-[#0066FF] hover:underline flex items-center gap-1 mt-0.5 font-semibold"
          >
            Open media link <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      ) : null}

      {/* Caption text */}
      {caption && (
        <div className="p-2.5">
          <p
            className={`text-[11px] leading-relaxed whitespace-pre-line ${
              !isExpanded && isLongCaption ? "line-clamp-3" : ""
            }`}
            style={{ color: "var(--text-primary)" }}
          >
            {caption}
          </p>
          {isLongCaption && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-[10px] font-semibold text-[#0066FF] hover:underline mt-1.5 block"
            >
              {isExpanded ? "Show less" : "Read more"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
