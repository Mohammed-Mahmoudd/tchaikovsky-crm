"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { useAuth, canAccessRoute, getDefaultRouteForRole } from "./AuthProvider";
import { CRMProvider } from "../context/CRMContext";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, isReadOnly } = useAuth();
  // Track whether a touch event already fired to prevent duplicate onClick
  const touchedRef = useRef(false);

  const isLoginPage = pathname === "/login";

  // Redirect unauthenticated users away from protected pages, and enforce RBAC
  useEffect(() => {
    if (!loading && !user && !isLoginPage) {
      router.replace("/login");
      return;
    }

    if (!loading && user && !isLoginPage) {
      if (!canAccessRoute(user.role, pathname)) {
        const target = getDefaultRouteForRole(user.role);
        router.replace(target);
      }
    }
  }, [loading, user, isLoginPage, pathname, router]);

  const openMenu = useCallback(() => {
    setIsMobileMenuOpen(true);
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault(); // Prevent the delayed click / ghost click
    touchedRef.current = true;
    openMenu();
    // Reset after a tick so future click events on non-touch devices still work
    setTimeout(() => { touchedRef.current = false; }, 400);
  }, [openMenu]);

  const handleClick = useCallback(() => {
    // If a touch already opened the menu, skip the synthetic click
    if (touchedRef.current) return;
    openMenu();
  }, [openMenu]);

  // Login page: standalone clean layout
  if (isLoginPage) {
    return (
      <main className="flex-1 overflow-y-auto w-full h-full" style={{ background: "var(--bg-page)" }}>
        {children}
      </main>
    );
  }

  // Session verification in progress
  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 w-full h-screen" style={{ background: "var(--bg-page)" }}>
        <div className="w-8 h-8 border-2 border-[#0066FF] border-t-transparent rounded-full animate-spin" />
        <p className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
          Loading CRM…
        </p>
      </div>
    );
  }

  // Not authenticated: wait for router redirect
  if (!user) {
    return (
      <div className="flex-1 flex items-center justify-center w-full h-screen" style={{ background: "var(--bg-page)" }}>
        <div className="w-6 h-6 border-2 border-[#0066FF] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Authenticated CRM layout
  return (
    <CRMProvider>
      <div className="flex flex-col h-[100dvh] flex-1 overflow-hidden">
        <div className="flex flex-1 overflow-hidden relative flex-col md:flex-row min-h-0">
          {/* Mobile Header — high z-index so nothing can cover the burger button */}
          <div
            className="md:hidden flex items-center shrink-0"
            style={{
              position: "relative",
              zIndex: 30,
              background: "var(--bg-sidebar)",
              borderBottom: "1px solid var(--border-sidebar)",
              paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.5rem)",
              paddingBottom: "0.5rem",
              paddingLeft: "1rem",
              paddingRight: "1rem",
            }}
          >
            {/* Burger button — dual event handling for universal device support */}
            <button
              type="button"
              onTouchEnd={handleTouchEnd}
              onClick={handleClick}
              aria-label="Open navigation menu"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: "48px",
                minHeight: "48px",
                marginLeft: "-8px",
                marginRight: "8px",
                padding: "0",
                border: "none",
                borderRadius: "8px",
                background: "transparent",
                color: "var(--text-primary)",
                cursor: "pointer",
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
                WebkitTouchCallout: "none",
                userSelect: "none",
                WebkitUserSelect: "none",
                position: "relative",
                zIndex: 31,
                outline: "none",
              }}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ pointerEvents: "none" }}
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <h1 className="text-lg font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
              CRM
            </h1>
            {isReadOnly && (
              <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full text-[#FF9500] bg-[rgba(255,149,0,0.12)] border border-[rgba(255,149,0,0.25)]">
                View Only
              </span>
            )}
          </div>

          <Sidebar
            isMobileOpen={isMobileMenuOpen}
            onCloseMobile={() => setIsMobileMenuOpen(false)}
          />

          <main className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden relative" style={{ background: "var(--bg-page)" }}>
            {children}
          </main>
        </div>
      </div>
    </CRMProvider>
  );
}

