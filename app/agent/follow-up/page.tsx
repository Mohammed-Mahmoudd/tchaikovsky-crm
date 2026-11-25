import React, { Suspense } from "react";
import { FollowUpAgentWorkspace } from "../../components/agent/FollowUpAgentWorkspace";
import { AgentWorkspaceLoading } from "../../components/agent/AgentShellHelpers";

export default function AgentFollowUpPage() {
  return (
    <Suspense fallback={<AgentWorkspaceLoading label="Loading Follow-up Agent" />}>
      <FollowUpAgentWorkspace />
    </Suspense>
  );
}

