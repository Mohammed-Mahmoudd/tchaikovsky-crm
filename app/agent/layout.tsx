"use client";

import React, { Suspense, useCallback, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Bot, SlidersHorizontal, Sparkles, UserPlus } from "lucide-react";
import { useAuth, normalizeRole } from "../components/AuthProvider";
import { ClaudeStatusPill } from "../components/ClaudeUiPrimitives";
import { SlideOverChatDrawer, useSlideOverChatDrawer } from "../components/SlideOverChatDrawer";
import { AgentSandboxDrawer, useAgentSandboxDrawer } from "../components/agent/AgentSandboxDrawer";
import { AgentWorkspaceProvider, useAgentCore } from "../context/AgentWorkspaceContext";

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  "/agent": {
    title: "Overview",
    subtitle: "Adham AI admissions control and live activity.",
  },
  "/agent/leads": {
    title: "Agent Leads",
    subtitle: "Control assigned leads or search your CRM to assign new conversations to Adham.",
  },
  "/agent/studio": {
    title: "Agent Studio",
    subtitle: "Configure Adham's playbook, trained skills, guardrails, and branch discovery slots.",
  },
};

function SandboxQuerySync({ onOpenSandbox }: { onOpenSandbox: () => void }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const sandboxParam = searchParams.get("sandbox");

  useEffect(() => {
    if (sandboxParam !== "1" && sandboxParam !== "true") return;
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("sandbox");
    const nextQuery = nextParams.toString();
    const target = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    queueMicrotask(() => {
      onOpenSandbox();
      router.replace(target, { scroll: false });
    });
  }, [onOpenSandbox, pathname, router, sandboxParam, searchParams]);

  return null;
}

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  const chatDrawer = useSlideOverChatDrawer();
  const sandboxDrawer = useAgentSandboxDrawer();
  const resetSandboxImmediate = sandboxDrawer.resetImmediate;
  const openChatDrawer = chatDrawer.open;
  const resetChatImmediate = chatDrawer.resetImmediate;
  const openSandboxDrawer = sandboxDrawer.open;

  const handleOpenLeadChat = useCallback(
    (senderId: string) => {
      resetSandboxImmediate();
      openChatDrawer(senderId);
    },
    [openChatDrawer, resetSandboxImmediate]
  );

  const handleOpenSandbox = useCallback(() => {
    resetChatImmediate();
    openSandboxDrawer();
  }, [openSandboxDrawer, resetChatImmediate]);

  return (
    <AgentWorkspaceProvider
      onOpenLeadChat={handleOpenLeadChat}
      isSandboxOpen={sandboxDrawer.isOpen}
      onOpenSandbox={handleOpenSandbox}
      onCloseSandbox={sandboxDrawer.close}
    >
      <AgentLayoutInner
        chatDrawer={{
          chatId: chatDrawer.chatId,
          showDetails: chatDrawer.showDetails,
          setShowDetails: chatDrawer.setShowDetails,
          isClosing: chatDrawer.isClosing,
          panelRef: chatDrawer.panelRef,
          close: chatDrawer.close,
          handleAnimationEnd: chatDrawer.handleAnimationEnd,
        }}
        sandboxDrawer={{
          isOpen: sandboxDrawer.isOpen,
          isClosing: sandboxDrawer.isClosing,
          panelRef: sandboxDrawer.panelRef,
          close: sandboxDrawer.close,
          handleAnimationEnd: sandboxDrawer.handleAnimationEnd,
        }}
        onOpenSandbox={handleOpenSandbox}
      >
        {children}
      </AgentLayoutInner>
    </AgentWorkspaceProvider>
  );
}

function AgentLayoutInner({
  children,
  chatDrawer,
  sandboxDrawer,
  onOpenSandbox,
}: {
  children: React.ReactNode;
  chatDrawer: {
    chatId: string | null;
    showDetails: boolean;
    setShowDetails: React.Dispatch<React.SetStateAction<boolean>>;
    isClosing: boolean;
    panelRef: React.RefObject<HTMLDivElement | null>;
    close: () => void;
    handleAnimationEnd: (e: React.AnimationEvent<HTMLDivElement>) => void;
  };
  sandboxDrawer: {
    isOpen: boolean;
    isClosing: boolean;
    panelRef: React.RefObject<HTMLDivElement | null>;
    close: () => void;
    handleAnimationEnd: (e: React.AnimationEvent<HTMLDivElement>) => void;
  };
  onOpenSandbox: () => void;
}) {
  const pathname = usePathname();
  const { user } = useAuth();
  const isChairman = normalizeRole(user?.role) === "chairman";
  const {
    statusData,
    settingsDraft,
    savingSettings,
    refreshingStatus,
    handleToggleMaster,
  } = useAgentCore();

  if (!isChairman) {
    return (
      <div
        className="flex-1 flex items-center justify-center p-6"
        style={{ background: "var(--bg-page)", color: "var(--text-primary)" }}
      >
        <div
          className="max-w-md w-full rounded-xl p-6 text-center space-y-3"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)" }}
        >
          <AlertCircle className="w-8 h-8 mx-auto" style={{ color: "var(--label-red-text)" }} />
          <h1 className="text-[15px] font-bold">Chairman Access Only</h1>
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            Only the Chairman can view and manage Adham AI Agent settings and leads.
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center min-h-[44px] sm:min-h-[40px] px-4 rounded-lg text-[12px] font-semibold text-white"
            style={{ background: "var(--bg-banner)" }}
          >
            Back to Inbox
          </Link>
        </div>
      </div>
    );
  }

  const meta = PAGE_META[pathname] ?? PAGE_META["/agent"];
  const isOverview = pathname === "/agent";
  const isSetupComplete = Boolean(
    statusData?.connection.hasApiKey && statusData?.connection.hasAgentId
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
      <Suspense fallback={null}>
        <SandboxQuerySync onOpenSandbox={onOpenSandbox} />
      </Suspense>

      <div
        className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 pb-12 w-full"
        style={{ background: "var(--bg-page)", color: "var(--text-primary)", WebkitOverflowScrolling: "touch" }}
      >
        <div className="max-w-6xl mx-auto space-y-5">
          <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Bot className="w-4 h-4 shrink-0" style={{ color: "var(--bg-banner)" }} />
                <h1 className="text-[16px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
                  {meta.title}
                </h1>
                {refreshingStatus && (
                  <span className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>
                    Syncing…
                  </span>
                )}
              </div>
              <p className="text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                {meta.subtitle}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {!isOverview && settingsDraft && (
                <>
                  <ClaudeStatusPill
                    label={
                      statusData && !isSetupComplete
                        ? "Needs setup"
                        : settingsDraft.enabled
                        ? "Auto-Reply ON"
                        : "Auto-Reply OFF"
                    }
                    tone={
                      statusData && !isSetupComplete
                        ? "red"
                        : settingsDraft.enabled
                        ? "green"
                        : "amber"
                    }
                  />
                  <button
                    type="button"
                    disabled={savingSettings}
                    onClick={() => void handleToggleMaster()}
                    className={`min-h-[44px] sm:min-h-[36px] px-3 rounded-lg text-[11.5px] font-semibold cursor-pointer disabled:opacity-50 ${
                      settingsDraft.enabled ? "" : "text-white"
                    }`}
                    style={
                      settingsDraft.enabled
                        ? {
                            background: "var(--bg-card)",
                            border: "1px solid var(--border-input)",
                            color: "var(--text-primary)",
                          }
                        : { background: "var(--bg-banner)" }
                    }
                  >
                    {settingsDraft.enabled ? "Turn OFF" : "Turn ON"}
                  </button>
                </>
              )}

              {isOverview && (
                <Link
                  href="/agent/studio"
                  className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-[36px] px-3 rounded-lg text-[11.5px] font-medium hover:bg-[var(--bg-hover)]"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-input)",
                    color: "var(--text-primary)",
                    boxShadow: "var(--shadow-card)",
                  }}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" style={{ color: "var(--text-secondary)" }} />
                  <span>Studio</span>
                </Link>
              )}

              <button
                type="button"
                onClick={onOpenSandbox}
                className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-[36px] px-3 rounded-lg text-[11.5px] font-semibold cursor-pointer hover:bg-[var(--bg-hover)]"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-input)",
                  color: "var(--text-primary)",
                  boxShadow: "var(--shadow-card)",
                }}
              >
                <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--bg-banner)" }} />
                <span>Test Adham</span>
              </button>

              {isOverview && (
                <Link
                  href="/agent/leads?mode=assign"
                  className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-[36px] px-3.5 rounded-lg text-[11.5px] font-semibold text-white"
                  style={{ background: "var(--bg-banner)" }}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Assign leads</span>
                </Link>
              )}
            </div>
          </header>

          {children}
        </div>
      </div>

      <SlideOverChatDrawer
        chatId={chatDrawer.chatId}
        showDetails={chatDrawer.showDetails}
        isClosing={chatDrawer.isClosing}
        panelRef={chatDrawer.panelRef}
        onToggleDetails={() => chatDrawer.setShowDetails((prev) => !prev)}
        onCloseDetails={() => chatDrawer.setShowDetails(false)}
        onClose={chatDrawer.close}
        onAnimationEnd={chatDrawer.handleAnimationEnd}
      />

      <AgentSandboxDrawer
        isOpen={sandboxDrawer.isOpen}
        isClosing={sandboxDrawer.isClosing}
        panelRef={sandboxDrawer.panelRef}
        onClose={sandboxDrawer.close}
        onAnimationEnd={sandboxDrawer.handleAnimationEnd}
      />
    </div>
  );
}
