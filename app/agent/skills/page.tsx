"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AgentWorkspaceLoading } from "../../components/agent/AgentShellHelpers";

export default function AgentSkillsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/agent/studio?section=skills");
  }, [router]);

  return <AgentWorkspaceLoading label="Redirecting to Agent Studio Skills" />;
}
