"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AgentWorkspaceLoading } from "../../components/agent/AgentShellHelpers";

export default function AgentActivityRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/agent");
  }, [router]);

  return <AgentWorkspaceLoading label="Redirecting to Agent Overview" />;
}
