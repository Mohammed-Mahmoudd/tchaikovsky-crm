"use client";

import React, { Suspense } from "react";
import { AgentStudioWorkspace } from "../../components/agent/AgentStudioWorkspace";
import { AgentWorkspaceLoading } from "../../components/agent/AgentShellHelpers";

export default function AgentStudioPage() {
  return (
    <Suspense fallback={<AgentWorkspaceLoading label="Loading Agent Studio" />}>
      <AgentStudioWorkspace />
    </Suspense>
  );
}
