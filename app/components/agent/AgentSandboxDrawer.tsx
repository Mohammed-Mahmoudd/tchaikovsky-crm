"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAgentCore, useAgentSandbox, useAgentStudioDraft } from "../../context/AgentWorkspaceContext";
import { ClaudeSandboxPanel } from "../ClaudeSandboxPanel";

/**
 * Manages open/closing animation state for the slide-over Test Sandbox drawer.
 */
export function useAgentSandboxDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const open = useCallback(() => {
    clearCloseTimer();
    setIsClosing(false);
    setIsOpen(true);
  }, [clearCloseTimer]);

  const close = useCallback(() => {
    if (!isOpen || isClosing) return;
    setIsClosing(true);
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setIsOpen(false);
      setIsClosing(false);
    }, 240);
  }, [clearCloseTimer, isClosing, isOpen]);

  const resetImmediate = useCallback(() => {
    clearCloseTimer();
    setIsOpen(false);
    setIsClosing(false);
  }, [clearCloseTimer]);

  const handleAnimationEnd = useCallback(
    (e: React.AnimationEvent<HTMLDivElement>) => {
      if (e.target === panelRef.current && isClosing) {
        clearCloseTimer();
        setIsOpen(false);
        setIsClosing(false);
      }
    },
    [clearCloseTimer, isClosing]
  );

  useEffect(() => {
    return () => {
      clearCloseTimer();
    };
  }, [clearCloseTimer]);

  return {
    isOpen,
    isClosing,
    panelRef,
    open,
    close,
    resetImmediate,
    handleAnimationEnd,
  };
}

interface AgentSandboxDrawerProps {
  isOpen: boolean;
  isClosing: boolean;
  panelRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onAnimationEnd: (e: React.AnimationEvent<HTMLDivElement>) => void;
}

/**
 * Full-height slide-over drawer hosting the simulated Test Sandbox so staff can
 * test playbook or skill changes directly from any Agent page.
 */
export function AgentSandboxDrawer({
  isOpen,
  isClosing,
  panelRef,
  onClose,
  onAnimationEnd,
}: AgentSandboxDrawerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { statusData, settingsDraft } = useAgentCore();
  const { agentName, activeModelLabel } = useAgentStudioDraft();
  const {
    sandboxMessages,
    sandboxInput,
    setSandboxInput,
    sandboxSending,
    sandboxError,
    mockLeadName,
    setMockLeadName,
    mockChannel,
    setMockChannel,
    mockBranch,
    setMockBranch,
    mockCampaign,
    setMockCampaign,
    mockExistingStudent,
    setMockExistingStudent,
    handleSendSandbox,
    handleResetSandbox,
  } = useAgentSandbox();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

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
        aria-label="Test Adham Sandbox"
        onAnimationEnd={onAnimationEnd}
        className={`absolute right-0 top-0 h-full z-50 flex flex-col shadow-2xl max-w-full w-full sm:w-[540px] md:w-[620px] xl:w-[680px] ${
          isClosing ? "animate-drawer-out pointer-events-none" : "animate-drawer-in"
        }`}
        style={{
          background: "var(--bg-panel)",
          borderInlineStart: "1px solid var(--border-main)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div className="flex-1 min-h-0 h-full w-full overflow-hidden animate-panel-fade">
          <ClaudeSandboxPanel
            variant="drawer"
            onClose={onClose}
            hasAgentId={Boolean(statusData?.connection.hasAgentId)}
            agentName={agentName || "Adham"}
            agentModelLabel={activeModelLabel}
            branches={settingsDraft?.branches ?? []}
            messages={sandboxMessages}
            input={sandboxInput}
            onInputChange={setSandboxInput}
            sending={sandboxSending}
            error={sandboxError}
            mockLeadName={mockLeadName}
            onMockLeadNameChange={setMockLeadName}
            mockChannel={mockChannel}
            onMockChannelChange={setMockChannel}
            mockBranch={mockBranch}
            onMockBranchChange={setMockBranch}
            mockCampaign={mockCampaign}
            onMockCampaignChange={setMockCampaign}
            mockExistingStudent={mockExistingStudent}
            onMockExistingStudentChange={setMockExistingStudent}
            onSend={handleSendSandbox}
            onReset={handleResetSandbox}
            onEditStudio={
              pathname === "/agent/studio"
                ? undefined
                : () => {
                    onClose();
                    router.push("/agent/studio?section=playbook");
                  }
            }
          />
        </div>
      </div>
    </>
  );
}

