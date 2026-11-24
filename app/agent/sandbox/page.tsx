"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AgentWorkspaceLoading } from "../../components/agent/AgentShellHelpers";

export default function AgentSandboxRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/agent?sandbox=1");
  }, [router]);

  return <AgentWorkspaceLoading label="Opening Test Sandbox" />;
}
