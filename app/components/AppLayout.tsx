"use client";

import React, { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Menu } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { CRMProvider } from "../context/CRMContext";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();

  const isLoginPage = pathname === "/login";

  // Redirect unauthenticated users away from protected pages
  useEffect(() => {
    if (!loading && !user && !isLoginPage) {
      router.replace("/login");
    }
  }, [loading, user, isLoginPage, router]);

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
      <div className="flex flex-col h-screen flex-1 overflow-hidden">
        <div className="flex flex-1 overflow-hidden relative flex-col md:flex-row">
          {/* Mobile Header */}
          <div
            className="md:hidden flex items-center px-4 py-3 shrink-0"
            style={{ background: "var(--bg-sidebar)", borderBottom: "1px solid var(--border-sidebar)" }}
          >
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-1 -ml-1 mr-3 rounded-md"
              style={{ color: "var(--text-primary)" }}
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
              CRM
            </h1>
          </div>

          <Sidebar
            isMobileOpen={isMobileMenuOpen}
            onCloseMobile={() => setIsMobileMenuOpen(false)}
          />

          <main className="flex-1 overflow-y-auto" style={{ background: "var(--bg-page)" }}>
            {children}
          </main>
        </div>
      </div>
    </CRMProvider>
  );
}
