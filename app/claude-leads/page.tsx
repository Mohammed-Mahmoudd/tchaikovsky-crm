"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AgentWorkspaceLoading } from "../components/agent/AgentShellHelpers";

export default function ClaudeLeadsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/agent/leads?mode=assign");
  }, [router]);

  return (
    <div
      className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 w-full"
      style={{ background: "var(--bg-page)", color: "var(--text-primary)" }}
    >
      <div className="max-w-6xl mx-auto">
        <AgentWorkspaceLoading label="Redirecting to Agent Leads" />
      </div>
    </div>
  );
}
