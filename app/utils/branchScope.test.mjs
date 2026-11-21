import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canUserViewConversationInStore,
  matchesAssignedBranch,
} from "./branchScope.ts";
import {
  canAccessInbox,
  canDownloadChatRole,
  canSendChatMessagesRole,
  shouldShowAuditionCardAgentAndBranch,
  canAssignAuditionAgentRole,
  canOpenAuditionChatRole,
  canFilterAuditionsByAgentRole,
  canEditAuditionBranchRole,
  isInboxViewOnlyRole,
  canAccessRoute,
  reconcileMemberPatchResponse,
} from "./roles.ts";

describe("Frontend branchScope & Enrollment Director permissions", () => {
  it("matchesAssignedBranch handles Khobar aliases while isolating Riyadh branches", () => {
    assert.equal(matchesAssignedBranch("Ajdan Walk (Khobar)", "Ajdan Walk (Khobar)"), true);
    assert.equal(matchesAssignedBranch("Ajdan Walk", "Ajdan Walk (Khobar)"), true);
    assert.equal(matchesAssignedBranch("Khobar", "Ajdan Walk (Khobar)"), true);
    assert.equal(matchesAssignedBranch("Alkhobar", "Ajdan Walk (Khobar)"), true);

    assert.equal(matchesAssignedBranch("Riyadh Park Mall (Riyadh)", "Ajdan Walk (Khobar)"), false);
    assert.equal(matchesAssignedBranch("Alreem Compound (Riyadh)", "Riyadh Park Mall (Riyadh)"), false);
    assert.equal(matchesAssignedBranch("Riyadh", "Riyadh Park Mall (Riyadh)"), false);
    assert.equal(matchesAssignedBranch("Riyadh Park Mall (Riyadh)", "Riyadh Park Mall (Riyadh)"), true);
    assert.equal(matchesAssignedBranch("Ajdan Walk (Khobar)", ""), false);
  });

  it("canUserViewConversationInStore strictly restricts Enrollment Director to branch auditions", () => {
    const khobarDirector = { role: "enrollment_director", branch: "Ajdan Walk (Khobar)" };
    const noBranchDirector = { role: "enrollment_director", branch: "" };

    assert.equal(
      canUserViewConversationInStore(
        {
          id: "c1",
          inbox: "admissions",
          pipeline: "Audition Booked",
          auditionDate: "2026-11-28",
          branch: "Ajdan Walk (Khobar)",
        },
        khobarDirector
      ),
      true
    );

    assert.equal(
      canUserViewConversationInStore(
        {
          id: "c2",
          inbox: "admissions",
          pipeline: "New",
          branch: "Ajdan Walk (Khobar)",
        },
        khobarDirector
      ),
      false
    );

    assert.equal(
      canUserViewConversationInStore(
        {
          id: "c3",
          inbox: "admissions",
          pipeline: "Audition Booked",
          auditionDate: "2026-11-28",
          branch: "Riyadh Park Mall (Riyadh)",
        },
        khobarDirector
      ),
      false
    );

    assert.equal(
      canUserViewConversationInStore(
        {
          id: "c4",
          inbox: "admissions",
          pipeline: "Audition Booked",
          auditionDate: "2026-11-28",
          branch: "Ajdan Walk (Khobar)",
        },
        noBranchDirector
      ),
      false
    );
  });

  it("blocks Inbox route & navigation while keeping messaging and chat transcript download disabled for enrollment_director", () => {
    assert.equal(canAccessInbox("enrollment_director", "admissions"), false);
    assert.equal(canAccessInbox("enrollment_director", "operation"), false);
    assert.equal(canAccessRoute("enrollment_director", "/"), false);
    assert.equal(canAccessRoute("enrollment_director", "/auditions"), true);
    assert.equal(canAccessRoute("enrollment_director", "/settings"), true);
    assert.equal(canAccessRoute("enrollment_director", "/profile"), true);
    assert.equal(canAccessRoute("enrollment_director", "/pipeline"), false);
    assert.equal(canAccessRoute("enrollment_director", "/operation-inbox"), false);
    assert.equal(isInboxViewOnlyRole("enrollment_director"), true);
    assert.equal(isInboxViewOnlyRole("admission_officer"), false);
    assert.equal(canSendChatMessagesRole("enrollment_director"), false);
    assert.equal(canSendChatMessagesRole("marketing"), false);
    assert.equal(canSendChatMessagesRole("admission_officer"), true);
    assert.equal(canDownloadChatRole("enrollment_director"), false);
    assert.equal(canDownloadChatRole("operation"), false);
    assert.equal(canDownloadChatRole("admission_officer"), false);
    assert.equal(canDownloadChatRole("admission_advanced"), false);
    assert.equal(canDownloadChatRole("marketing"), false);
    assert.equal(canDownloadChatRole("finance"), false);
    assert.equal(canDownloadChatRole(undefined), false);
    assert.equal(canDownloadChatRole("chairman"), true);
    assert.equal(canDownloadChatRole("owner"), true);
    assert.equal(canDownloadChatRole("manager"), true);
    assert.equal(shouldShowAuditionCardAgentAndBranch("enrollment_director"), false);
    assert.equal(shouldShowAuditionCardAgentAndBranch("Enrollment_Director"), false);
    assert.equal(shouldShowAuditionCardAgentAndBranch("chairman"), true);
    assert.equal(shouldShowAuditionCardAgentAndBranch("admission_officer"), true);
    assert.equal(shouldShowAuditionCardAgentAndBranch("admission_advanced"), true);
    assert.equal(shouldShowAuditionCardAgentAndBranch("marketing"), true);
    assert.equal(shouldShowAuditionCardAgentAndBranch("finance"), true);
    assert.equal(shouldShowAuditionCardAgentAndBranch("operation"), true);
    assert.equal(shouldShowAuditionCardAgentAndBranch(undefined), true);
    assert.equal(canAssignAuditionAgentRole("enrollment_director"), false);
    assert.equal(canAssignAuditionAgentRole("Enrollment_Director"), false);
    assert.equal(canAssignAuditionAgentRole("chairman"), true);
    assert.equal(canAssignAuditionAgentRole("admission_officer"), true);
    assert.equal(canAssignAuditionAgentRole("admission_advanced"), true);
    assert.equal(canAssignAuditionAgentRole("marketing"), true);
    assert.equal(canAssignAuditionAgentRole("finance"), true);
    assert.equal(canAssignAuditionAgentRole("operation"), true);
    assert.equal(canAssignAuditionAgentRole(undefined), true);
    assert.equal(canOpenAuditionChatRole("enrollment_director"), false);
    assert.equal(canOpenAuditionChatRole("Enrollment_Director"), false);
    assert.equal(canOpenAuditionChatRole("chairman"), true);
    assert.equal(canOpenAuditionChatRole("admission_officer"), true);
    assert.equal(canOpenAuditionChatRole("admission_advanced"), true);
    assert.equal(canOpenAuditionChatRole("marketing"), true);
    assert.equal(canOpenAuditionChatRole("finance"), true);
    assert.equal(canOpenAuditionChatRole("operation"), true);
    assert.equal(canOpenAuditionChatRole(undefined), true);
    assert.equal(canFilterAuditionsByAgentRole("enrollment_director"), false);
    assert.equal(canFilterAuditionsByAgentRole("Enrollment_Director"), false);
    assert.equal(canFilterAuditionsByAgentRole("chairman"), true);
    assert.equal(canFilterAuditionsByAgentRole("admission_officer"), true);
    assert.equal(canFilterAuditionsByAgentRole("admission_advanced"), true);
    assert.equal(canFilterAuditionsByAgentRole("marketing"), true);
    assert.equal(canFilterAuditionsByAgentRole("finance"), true);
    assert.equal(canFilterAuditionsByAgentRole("operation"), true);
    assert.equal(canFilterAuditionsByAgentRole(undefined), true);
    assert.equal(canEditAuditionBranchRole("enrollment_director"), false);
    assert.equal(canEditAuditionBranchRole("Enrollment_Director"), false);
    assert.equal(canEditAuditionBranchRole("chairman"), true);
    assert.equal(canEditAuditionBranchRole("admission_officer"), true);
    assert.equal(canEditAuditionBranchRole("admission_advanced"), true);
    assert.equal(canEditAuditionBranchRole("marketing"), true);
    assert.equal(canEditAuditionBranchRole("finance"), true);
    assert.equal(canEditAuditionBranchRole("operation"), true);
    assert.equal(canEditAuditionBranchRole(undefined), true);
  });

  it("reconcileMemberPatchResponse validates and persists Enrollment Director branch", () => {
    const previousMember = {
      id: "u_ed",
      name: "Ahmed",
      email: "ahmed@tchaikovskyschool.com",
      role: "admission_officer",
      branch: "",
      active: true,
    };

    const okResult = reconcileMemberPatchResponse({
      previousMember,
      requestedRole: "enrollment_director",
      requestedBranch: "Ajdan Walk (Khobar)",
      resOk: true,
      payload: {
        success: true,
        user: {
          id: "u_ed",
          name: "Ahmed",
          email: "ahmed@tchaikovskyschool.com",
          role: "enrollment_director",
          branch: "Ajdan Walk (Khobar)",
          active: true,
        },
      },
    });
    assert.equal(okResult.ok, true);
    assert.equal(okResult.member.branch, "Ajdan Walk (Khobar)");

    const mismatchResult = reconcileMemberPatchResponse({
      previousMember,
      requestedRole: "enrollment_director",
      requestedBranch: "Ajdan Walk (Khobar)",
      resOk: true,
      payload: {
        success: true,
        user: {
          id: "u_ed",
          name: "Ahmed",
          email: "ahmed@tchaikovskyschool.com",
          role: "enrollment_director",
          branch: "",
          active: true,
        },
      },
    });
    assert.equal(mismatchResult.ok, false);
    assert.match(mismatchResult.error, /Branch did not change/i);
  });
});
