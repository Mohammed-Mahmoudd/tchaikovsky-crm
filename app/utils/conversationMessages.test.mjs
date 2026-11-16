import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildConfirmedReplyMessages,
  computeUnreadFromMessages,
  getLastRealMessageDirection,
  isAutomatedTemplateMsg,
  isLastMessageFromLead,
  isRealSenderName,
  mergeExistingMessageFromSse,
  resolvePreferredSenderName,
} from "./conversationMessages.ts";

describe("conversationMessages", () => {
  it("detects automated Meta template messages", () => {
    assert.equal(isAutomatedTemplateMsg({ text: "Template", isIncoming: false }), true);
    assert.equal(
      isAutomatedTemplateMsg({ text: "Thanks, you're all set!", isIncoming: false, senderName: "Staff" }),
      true
    );
    assert.equal(
      isAutomatedTemplateMsg({ text: "Thanks, you're all set!", isIncoming: false, senderName: "Sara" }),
      false
    );
    assert.equal(
      isAutomatedTemplateMsg({
        text: "",
        isIncoming: false,
        attachments: [{ type: "template", payload: { elements: [] } }],
      }),
      true
    );
  });

  it("returns direction of last non-automated message", () => {
    assert.equal(getLastRealMessageDirection([]), undefined);
    assert.equal(
      getLastRealMessageDirection([{ text: "Thanks, you're all set", isIncoming: false }]),
      undefined
    );
    assert.equal(
      getLastRealMessageDirection([
        { text: "Hi, pricing?", isIncoming: true },
        { text: "Thanks, you're all set", isIncoming: false },
      ]),
      "incoming"
    );
    assert.equal(
      getLastRealMessageDirection([
        { text: "Hi, pricing?", isIncoming: true },
        { text: "Our piano fee is...", isIncoming: false, senderName: "Sara" },
      ]),
      "outgoing"
    );
  });

  it("computes unread incoming messages skipping automated templates", () => {
    assert.equal(
      computeUnreadFromMessages([
        { text: "Hello", isIncoming: false, senderName: "Sara" },
        { text: "Hi", isIncoming: true },
        { text: "How much?", isIncoming: true },
        { text: "Template", isIncoming: false },
      ]),
      2
    );
  });

  it("identifies whether last message was from the lead across loaded and slim conversations", () => {
    assert.equal(isLastMessageFromLead(null), false);
    assert.equal(isLastMessageFromLead({ messages: [], lastMessageDirection: "incoming" }), true);
    assert.equal(isLastMessageFromLead({ messages: [], lastMessageDirection: "outgoing" }), false);
    assert.equal(isLastMessageFromLead({ messages: [], unreadCount: 2 }), true);
    assert.equal(isLastMessageFromLead({ messages: [], unreadCount: 0 }), false);

    // Loaded messages override stale slim metadata
    assert.equal(
      isLastMessageFromLead({
        lastMessageDirection: "outgoing",
        messages: [
          { text: "Hello", isIncoming: false, senderName: "Sara" },
          { text: "Are you open Friday?", isIncoming: true },
        ],
      }),
      true
    );

    assert.equal(
      isLastMessageFromLead({
        lastMessageDirection: "incoming",
        messages: [
          { text: "Are you open Friday?", isIncoming: true },
          { text: "Yes, from 2pm to 10pm", isIncoming: false, senderName: "Sara" },
        ],
      }),
      false
    );

    // Thread with only automated template is not treated as last message from lead
    assert.equal(
      isLastMessageFromLead({
        lastMessageDirection: "incoming",
        messages: [{ text: "Template", isIncoming: false }],
      }),
      false
    );
  });

  it("preserves real agent senderName across confirmed attachments and SSE merges", () => {
    assert.equal(isRealSenderName("Mariam"), true);
    assert.equal(isRealSenderName("Staff"), false);
    assert.equal(isRealSenderName(undefined), false);

    assert.equal(resolvePreferredSenderName("Staff", "Mariam"), "Mariam");
    assert.equal(resolvePreferredSenderName("Mariam", "Staff"), "Mariam");
    assert.equal(resolvePreferredSenderName(undefined, "Staff"), "Staff");

    // Attachment response without per-item senderName inherits top-level json.senderName / fallback user name
    const attachmentConfirmed = buildConfirmedReplyMessages(
      {
        senderName: "Sara",
        messages: [
          { message_id: "m_1", text: "Photo", attachments: [{ type: "image" }], timestamp: 100 },
          { message_id: "m_2", text: "Here is the schedule", attachments: [], timestamp: 101 },
        ],
      },
      "Here is the schedule",
      "FallbackUser"
    );
    assert.deepEqual(
      attachmentConfirmed?.map((m) => m.senderName),
      ["Sara", "Sara"]
    );

    // Single text reply response inherits fallback user name if senderName omitted
    const textConfirmed = buildConfirmedReplyMessages(
      { data: { message_id: "m_3", timestamp: 200 } },
      " Hello ",
      "Omar"
    );
    assert.equal(textConfirmed?.[0]?.senderName, "Omar");
    assert.equal(textConfirmed?.[0]?.text, "Hello");

    // SSE merge never downgrades real senderName, status, or reactions
    const merged = mergeExistingMessageFromSse(
      {
        id: "wamid.1",
        text: "Hello",
        attachments: [{ type: "image", url: "/api/messages/media/a.jpg" }],
        time: "10:00 AM",
        timestamp: 1000,
        isIncoming: false,
        status: "read",
        seenAt: 1100,
        isRead: true,
        senderName: "Sara",
        reactions: [{ emoji: "👍", fromMe: false }],
      },
      {
        id: "wamid.1",
        text: "Hello",
        attachments: [],
        time: "10:00 AM",
        timestamp: 1000,
        isIncoming: false,
        status: "sent",
        senderName: "Staff",
        reactions: [],
      }
    );
    assert.equal(merged.senderName, "Sara");
    assert.equal(merged.status, "read");
    assert.equal(merged.isRead, true);
    assert.equal(merged.seenAt, 1100);
    assert.equal(merged.attachments?.length, 1);
    assert.equal(merged.reactions?.length, 1);
  });
});

