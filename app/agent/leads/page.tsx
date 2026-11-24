"use client";

import React, { Suspense } from "react";
import { AgentLeadsWorkspace } from "../../components/agent/AgentLeadsWorkspace";
import { AgentWorkspaceLoading } from "../../components/agent/AgentShellHelpers";

export default function AgentLeadsPage() {
  return (
    <Suspense fallback={<AgentWorkspaceLoading label="Loading Agent leads" />}>
      <AgentLeadsWorkspace />
    </Suspense>
  );
}
