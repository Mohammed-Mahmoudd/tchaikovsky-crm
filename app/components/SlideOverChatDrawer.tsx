"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCRM } from "../context/CRMContext";
import { ConversationChatView } from "./ConversationChatView";
import { ConversationDetailsSidebar } from "./ConversationDetailsSidebar";

export interface UseSlideOverChatDrawerOptions {
  initialChatId?: string | null;
  initialShowDetails?: boolean;
}

export function useSlideOverChatDrawer(options?: UseSlideOverChatDrawerOptions) {
  const [chatId, setChatId] = useState<string | null>(() => options?.initialChatId ?? null);
  const [showDetails, setShowDetails] = useState<boolean>(
    () => Boolean(options?.initialChatId && options?.initialShowDetails)
  );
  const [isClosing, setIsClosing] = useState<boolean>(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const open = useCallback(
    (conversationId: string) => {
      clearCloseTimer();
      setChatId(conversationId);
      setShowDetails(false);
      setIsClosing(false);
    },
    [clearCloseTimer]
  );

  const close = useCallback(() => {
    if (!chatId || isClosing) return;
    setIsClosing(true);
    setShowDetails(false);
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setChatId(null);
      setIsClosing(false);
      setShowDetails(false);
    }, 240);
  }, [chatId, isClosing, clearCloseTimer]);

  const resetImmediate = useCallback(() => {
    clearCloseTimer();
    setChatId(null);
    setIsClosing(false);
    setShowDetails(false);
  }, [clearCloseTimer]);

  const restore = useCallback(
    (conversationId: string | null, details = false) => {
      clearCloseTimer();
      setChatId(conversationId);
      setShowDetails(Boolean(conversationId && details));
      setIsClosing(false);
    },
    [clearCloseTimer]
  );

  const handleAnimationEnd = useCallback(
    (e: React.AnimationEvent<HTMLDivElement>) => {
      if (e.target === panelRef.current && isClosing) {
        clearCloseTimer();
        setChatId(null);
        setIsClosing(false);
        setShowDetails(false);
      }
    },
    [isClosing, clearCloseTimer]
  );

  useEffect(() => {
    return () => {
      clearCloseTimer();
    };
  }, [clearCloseTimer]);

  return {
    chatId,
    showDetails,
    setShowDetails,
    isClosing,
    panelRef,
    open,
    close,
    resetImmediate,
    restore,
    handleAnimationEnd,
  };
}

export interface SlideOverChatDrawerProps {
  chatId: string | null;
  showDetails: boolean;
  isClosing: boolean;
  panelRef: React.RefObject<HTMLDivElement | null>;
  onToggleDetails: () => void;
  onCloseDetails: () => void;
  onClose: () => void;
  onAnimationEnd: (e: React.AnimationEvent<HTMLDivElement>) => void;
  enableEscapeClose?: boolean;
  onInteraction?: () => void;
  extraHeaderActions?: React.ReactNode;
  onOpenBookingModal?: () => void;
}

/**
 * In-screen slide-over conversation drawer matching the Pipeline chat panel design
 * (live chat view + collapsible lead details sidebar).
 */
export function SlideOverChatDrawer({
  chatId,
  showDetails,
  isClosing,
  panelRef,
  onToggleDetails,
  onCloseDetails,
  onClose,
  onAnimationEnd,
  enableEscapeClose = true,
  onInteraction,
  extraHeaderActions,
  onOpenBookingModal,
}: SlideOverChatDrawerProps) {
  const { conversations } = useCRM();

  const activeConv = useMemo(
    () => (chatId ? conversations.find((c) => c.id === chatId) ?? null : null),
    [conversations, chatId]
  );

  useEffect(() => {
    if (!enableEscapeClose || !chatId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showDetails) {
        onCloseDetails();
      } else {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enableEscapeClose, chatId, showDetails, onCloseDetails, onClose]);

  if (!chatId) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className={`absolute inset-0 z-40 bg-black/30 backdrop-blur-[1px] ${
          isClosing ? "animate-backdrop-out pointer-events-none" : "animate-backdrop-in"
        }`}
        onClick={onClose}
      />

      {/* Slide-Over Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={activeConv ? `Conversation with ${activeConv.name}` : "Conversation"}
        onAnimationEnd={onAnimationEnd}
        onClickCapture={onInteraction}
        className={`absolute right-0 top-0 h-full z-50 flex flex-col transition-[width] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[width,transform] shadow-2xl max-w-full ${
          isClosing ? "animate-drawer-out pointer-events-none" : "animate-drawer-in"
        } ${
          showDetails
            ? "w-full sm:w-[500px] md:w-[540px] lg:w-[860px] xl:w-[900px]"
            : "w-full sm:w-[500px] md:w-[540px] xl:w-[580px]"
        }`}
        style={{
          background: "var(--bg-panel)",
          borderLeft: "1px solid var(--border-main)",
          boxShadow: "-10px 0 25px rgba(0,0,0,0.12)",
        }}
      >
        <div className="flex h-full w-full overflow-hidden relative animate-panel-fade">
          <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
            <ConversationChatView
              conversationId={chatId}
              onClose={onClose}
              extraHeaderActions={
                <div className="flex items-center gap-1.5">
                  {extraHeaderActions}
                  <button
                    type="button"
                    aria-pressed={showDetails}
                    onClick={onToggleDetails}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-[6px] active:scale-95 transition-all duration-150 cursor-pointer select-none ${
                      showDetails
                        ? "bg-[#0066FF] text-white shadow-xs"
                        : "hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
                    }`}
                    style={{
                      border: showDetails
                        ? "1px solid #0066FF"
                        : "1px solid var(--border-input)",
                      background: showDetails ? "#0066FF" : "var(--bg-pill)",
                    }}
                    title={showDetails ? "Hide lead details" : "View lead details"}
                  >
                    Details
                  </button>
                </div>
              }
            />
          </div>

          {/* Collapsible Right Lead Details Sidebar */}
          <div
            className={`shrink-0 h-full flex flex-col overflow-hidden transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[transform,width,opacity] absolute inset-y-0 right-0 lg:relative lg:inset-auto z-20 lg:z-auto border-l ${
              showDetails
                ? "w-full sm:w-[320px] opacity-100 translate-x-0 shadow-xl lg:shadow-none"
                : "w-full sm:w-[320px] lg:w-0 opacity-0 translate-x-full lg:translate-x-0 pointer-events-none border-l-0"
            }`}
            style={{
              borderColor: "var(--border-main)",
              background: "var(--bg-panel)",
            }}
          >
            <div className="w-full sm:w-[320px] h-full flex flex-col min-w-[300px] sm:min-w-[320px]">
              {activeConv && (
                <ConversationDetailsSidebar
                  conversation={activeConv}
                  showOpenConversationButton={false}
                  onOpenBookingModal={onOpenBookingModal}
                  onClose={onCloseDetails}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

