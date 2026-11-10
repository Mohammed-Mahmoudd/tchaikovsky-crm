"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Play, Pause, Loader2, Mic, AlertCircle } from "lucide-react";

interface VoiceNotePlayerProps {
  url: string;
  fileName?: string;
  isIncoming: boolean;
  channel?: "WA" | "IG" | "FB";
}

function formatAudioTime(seconds: number): string {
  if (!seconds || !isFinite(seconds) || isNaN(seconds) || seconds < 0) {
    return "0:00";
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

// Deterministically generate realistic, speech-like waveform bars from the audio URL
function generateWaveformBars(seedStr: string, count = 30): number[] {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = ((hash << 5) - hash + seedStr.charCodeAt(i)) | 0;
  }
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    const pseudo = Math.abs(Math.sin((hash + i * 17) * 0.42));
    const height = Math.round(22 + pseudo * 73);
    bars.push(height);
  }
  return bars;
}

export const VoiceNotePlayer: React.FC<VoiceNotePlayerProps> = ({
  url,
  fileName,
  isIncoming,
  channel = "WA",
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const instanceId = useRef(Math.random().toString(36).substring(2, 9));

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<1 | 1.5 | 2>(1);
  const [hasError, setHasError] = useState(false);

  // Generate waveform bars once per audio URL
  const bars = useMemo(() => generateWaveformBars(url || fileName || "audio", 32), [url, fileName]);

  // Coordinate so only 1 voice note plays at any time
  useEffect(() => {
    const handleOtherPlay = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string }>;
      if (customEvent.detail?.id !== instanceId.current && isPlaying) {
        audioRef.current?.pause();
        setIsPlaying(false);
      }
    };

    window.addEventListener("crm:voice-note-play", handleOtherPlay);
    return () => {
      window.removeEventListener("crm:voice-note-play", handleOtherPlay);
    };
  }, [isPlaying]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const togglePlay = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!audioRef.current || hasError) return;

      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        window.dispatchEvent(
          new CustomEvent("crm:voice-note-play", { detail: { id: instanceId.current } })
        );
        setIsLoading(true);
        audioRef.current
          .play()
          .then(() => {
            setIsPlaying(true);
            setIsLoading(false);
          })
          .catch((err) => {
            console.warn("Audio playback failed:", err);
            setIsPlaying(false);
            setIsLoading(false);
          });
      }
    },
    [isPlaying, hasError]
  );

  const cycleSpeed = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const nextSpeed = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
      setPlaybackRate(nextSpeed);
      if (audioRef.current) {
        audioRef.current.playbackRate = nextSpeed;
      }
    },
    [playbackRate]
  );

  const handleSeekFromEvent = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!waveformRef.current || !audioRef.current) return;
    const rect = waveformRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    const d = audioRef.current.duration;
    if (isFinite(d) && d > 0) {
      const targetTime = pct * d;
      audioRef.current.currentTime = targetTime;
      setCurrentTime(targetTime);
    }
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      isDraggingRef.current = true;
      handleSeekFromEvent(e);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (isDraggingRef.current) {
          handleSeekFromEvent(moveEvent);
        }
      };

      const handleMouseUp = () => {
        isDraggingRef.current = false;
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [handleSeekFromEvent]
  );

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      const d = audioRef.current.duration;
      if (isFinite(d) && d > 0) {
        setDuration(d);
      }
    }
  };

  const handleDurationChange = () => {
    if (audioRef.current) {
      const d = audioRef.current.duration;
      if (isFinite(d) && d > 0) {
        setDuration(d);
      }
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      if ((!isFinite(duration) || duration === 0) && isFinite(audioRef.current.duration) && audioRef.current.duration > 0) {
        setDuration(audioRef.current.duration);
      }
      if (isLoading) {
        setIsLoading(false);
      }
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  };

  const handleError = () => {
    setHasError(true);
    setIsLoading(false);
    setIsPlaying(false);
  };

  const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

  // Visual styling tuned for WhatsApp / chat bubbles
  const accentColor =
    channel === "WA" ? "#25D366" : channel === "IG" ? "#E1306C" : "#0066FF";

  const playBtnBg = isIncoming ? accentColor : "#FFFFFF";
  const playBtnColor = isIncoming ? "#FFFFFF" : "#1F2937";
  const activeWaveColor = isIncoming ? accentColor : "#FFFFFF";
  const inactiveWaveColor = isIncoming
    ? "rgba(100, 116, 139, 0.28)"
    : "rgba(255, 255, 255, 0.35)";

  const textColor = isIncoming ? "var(--text-primary)" : "var(--text-chat-outgoing)";
  const mutedTextColor = isIncoming ? "var(--text-secondary)" : "rgba(255, 255, 255, 0.75)";
  const speedBtnBg = isIncoming ? "rgba(0, 0, 0, 0.06)" : "rgba(255, 255, 255, 0.2)";
  const speedBtnColor = isIncoming ? "var(--text-secondary)" : "#FFFFFF";

  if (hasError) {
    return (
      <div
        className="flex items-center gap-2 p-2.5 rounded-xl text-[12px] opacity-80"
        style={{
          background: isIncoming ? "var(--bg-pill)" : "rgba(255,255,255,0.15)",
          color: textColor,
        }}
      >
        <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
        <span className="truncate">Voice note unavailable</span>
      </div>
    );
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="flex items-center gap-3 py-1 px-0.5 w-full min-w-[230px] max-w-[320px] select-none"
    >
      {/* Play / Pause Circular Button */}
      <button
        type="button"
        onClick={togglePlay}
        disabled={isLoading}
        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 shadow-xs cursor-pointer hover:opacity-95"
        style={{
          background: playBtnBg,
          color: playBtnColor,
        }}
        title={isPlaying ? "Pause voice note" : "Play voice note"}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isPlaying ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 fill-current ml-0.5" />
        )}
      </button>

      {/* Center Waveform & Times */}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
        {/* Waveform Scrubber */}
        <div
          ref={waveformRef}
          onMouseDown={handleMouseDown}
          className="h-6 flex items-center gap-[2px] sm:gap-[2.5px] cursor-pointer relative py-1"
          title="Click or drag to seek"
        >
          {bars.map((height, i) => {
            const barPct = (i + 1) / bars.length;
            const isFilled = progress >= barPct;
            return (
              <div
                key={i}
                className="flex-1 rounded-full transition-colors duration-75"
                style={{
                  height: `${height}%`,
                  minHeight: "4px",
                  maxHeight: "22px",
                  background: isFilled ? activeWaveColor : inactiveWaveColor,
                }}
              />
            );
          })}
        </div>

        {/* Bottom Details Row: Time / Duration + Speed Toggle + Mic Icon */}
        <div className="flex items-center justify-between text-[11px] font-medium leading-none">
          <div className="flex items-center gap-1 font-mono tracking-tight text-[11px]">
            <span style={{ color: textColor }}>
              {formatAudioTime(isPlaying || currentTime > 0 ? currentTime : duration)}
            </span>
            {isPlaying && duration > 0 && (
              <span className="opacity-70 text-[10px]" style={{ color: mutedTextColor }}>
                / {formatAudioTime(duration)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Speed Pill Toggle */}
            <button
              type="button"
              onClick={cycleSpeed}
              title="Change playback speed"
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full transition-opacity hover:opacity-80 cursor-pointer"
              style={{
                background: speedBtnBg,
                color: speedBtnColor,
              }}
            >
              {playbackRate}×
            </button>

            {/* Subtle Mic Indicator */}
            <Mic className="w-3 h-3 opacity-60" style={{ color: textColor }} />
          </div>
        </div>
      </div>

      {/* Hidden Native Audio Element */}
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onDurationChange={handleDurationChange}
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onError={handleError}
      />
    </div>
  );
};

