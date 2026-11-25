import test from "node:test";
import assert from "node:assert/strict";
import {
  isFollowUpEnrollmentActive,
  resolveChatDraftState,
  resolveComposerAgentVisualState,
  stripSplitMarkerForComposer,
} from "./composerAgent.ts";

test("stripSplitMarkerForComposer normalizes [[SPLIT]] markers into paragraph breaks", () => {
  assert.equal(
    stripSplitMarkerForComposer("مرحباً سارة [[SPLIT]] يناسبك نحجز يوم الخميس؟"),
    "مرحباً سارة\n\nيناسبك نحجز يوم الخميس؟"
  );
  assert.equal(stripSplitMarkerForComposer("   Single reply   "), "Single reply");
});

test("isFollowUpEnrollmentActive recognizes ongoing auto follow-up statuses only", () => {
  assert.equal(isFollowUpEnrollmentActive("scheduled"), true);
  assert.equal(isFollowUpEnrollmentActive("sending"), true);
  assert.equal(isFollowUpEnrollmentActive("waiting_reply"), true);
  assert.equal(isFollowUpEnrollmentActive("replied"), true);
  assert.equal(isFollowUpEnrollmentActive("draft_ready"), false);
  assert.equal(isFollowUpEnrollmentActive("paused"), false);
  assert.equal(isFollowUpEnrollmentActive("stopped"), false);
  assert.equal(isFollowUpEnrollmentActive(null), false);
});

test("resolveComposerAgentVisualState clears active highlight after Draft and stays active in Auto", () => {
  // 1. Draft mode (idle) -> active state disappears even if legacy flags or enrollment exist
  const draftIdle = resolveComposerAgentVisualState({
    admissionSendMode: "draft",
    followUpSendMode: "approval",
    claudeEnabled: true,
    claudePaused: false,
    followUpEnrollmentStatus: "waiting_reply",
    generatingAgent: null,
  });
  assert.equal(draftIdle.admissionActive, false);
  assert.equal(draftIdle.followUpActive, false);
  assert.equal(draftIdle.anyActive, false);

  // 2. Draft mode while actively drafting -> temporary active/generating highlight
  const draftGenerating = resolveComposerAgentVisualState({
    admissionSendMode: "draft",
    followUpSendMode: "approval",
    claudeEnabled: false,
    claudePaused: false,
    followUpEnrollmentStatus: null,
    generatingAgent: "admissions",
  });
  assert.equal(draftGenerating.admissionActive, true);
  assert.equal(draftGenerating.admissionGenerating, true);
  assert.equal(draftGenerating.followUpActive, false);

  // 3. Admission Auto mode -> stays active across messages unless paused or turned off
  const admissionAuto = resolveComposerAgentVisualState({
    admissionSendMode: "auto",
    followUpSendMode: "approval",
    claudeEnabled: true,
    claudePaused: false,
    followUpEnrollmentStatus: null,
    generatingAgent: null,
  });
  assert.equal(admissionAuto.admissionActive, true);
  assert.equal(admissionAuto.anyActive, true);

  const admissionPaused = resolveComposerAgentVisualState({
    admissionSendMode: "auto",
    followUpSendMode: "approval",
    claudeEnabled: true,
    claudePaused: true,
    followUpEnrollmentStatus: null,
    generatingAgent: null,
  });
  assert.equal(admissionPaused.admissionActive, false);

  // 4. Follow-up Auto mode -> stays active after first follow-up message is sent (waiting_reply)
  const followUpAutoAfterFirstSend = resolveComposerAgentVisualState({
    admissionSendMode: "draft",
    followUpSendMode: "auto",
    claudeEnabled: false,
    claudePaused: false,
    followUpEnrollmentStatus: "waiting_reply",
    generatingAgent: null,
  });
  assert.equal(followUpAutoAfterFirstSend.followUpActive, true);
  assert.equal(followUpAutoAfterFirstSend.anyActive, true);
});

test("resolveChatDraftState isolates per-chat local drafts and server Admission drafts", () => {
  // Prefers local composer draft on active chat
  const local = resolveChatDraftState({
    chatId: "chat_1",
    localDraft: { chatId: "chat_1", agent: "followup", text: "مرحباً سارة" },
    serverDraftText: "Old server draft",
  });
  assert.deepEqual(local, {
    chatId: "chat_1",
    agent: "followup",
    text: "مرحباً سارة",
  });

  // Ignores local draft belonging to another conversation and normalizes server draft [[SPLIT]]
  const fallback = resolveChatDraftState({
    chatId: "chat_2",
    localDraft: { chatId: "chat_1", agent: "followup", text: "Other chat" },
    serverDraftText: "أهلًا [[SPLIT]] هل يناسبكم غداً؟",
  });
  assert.deepEqual(fallback, {
    chatId: "chat_2",
    agent: "admissions",
    text: "أهلًا\n\nهل يناسبكم غداً؟",
  });

  // Respects dismissed server draft matching the same chat & content, but shows newer drafts
  assert.equal(
    resolveChatDraftState({
      chatId: "chat_2",
      localDraft: null,
      serverDraftText: "Old draft",
      dismissedServerDraft: { chatId: "chat_2", text: "Old draft" },
    }),
    null
  );
  assert.deepEqual(
    resolveChatDraftState({
      chatId: "chat_2",
      localDraft: null,
      serverDraftText: "Fresh new draft",
      dismissedServerDraft: { chatId: "chat_2", text: "Old draft" },
    }),
    { chatId: "chat_2", agent: "admissions", text: "Fresh new draft" }
  );
});

