import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildConfirmedReplyMessages,
  computeUnreadFromMessages,
  getLastRealMessageDirection,
  getWhatsAppGhostDisplayMode,
  isAutomatedTemplateMsg,
  isLastMessageFromLead,
  isPlaceholderMessageText,
  isRealSenderName,
  isTemplateFallbackPlaceholder,
  mergeExistingMessageFromSse,
  resolvePreferredSenderName,
  shouldRenderLegacyTemplateFallback,
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

    // Operation lastReadAt cutoff stops counting opened messages while counting newer incoming ones
    assert.equal(
      computeUnreadFromMessages(
        [
          { text: "Old", isIncoming: true, timestamp: 1000 },
          { text: "Also read", isIncoming: true, timestamp: 2000 },
        ],
        2000
      ),
      0
    );
    assert.equal(
      computeUnreadFromMessages(
        [
          { text: "Old", isIncoming: true, timestamp: 1000 },
          { text: "Opened earlier", isIncoming: true, timestamp: 2000 },
          { text: "Arrived after open", isIncoming: true, timestamp: 3500 },
        ],
        2000
      ),
      1
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

  it("never renders Lead form submitted / Confirmation fallback cards for WhatsApp or blank messages", () => {
    assert.equal(isPlaceholderMessageText(""), false);
    assert.equal(isPlaceholderMessageText("Photo"), true);
    assert.equal(isTemplateFallbackPlaceholder("Template"), true);
    assert.equal(isTemplateFallbackPlaceholder("Photo"), false);

    // WhatsApp incoming/outgoing empty messages must never trigger Meta lead-form fallback cards
    assert.equal(shouldRenderLegacyTemplateFallback({ text: "", attachments: [] }, "WA"), false);
    assert.equal(shouldRenderLegacyTemplateFallback({ text: "Template", attachments: [] }, "WA"), false);

    // Non-WA (FB/IG) only triggers legacy template fallback for explicit template placeholders
    assert.equal(shouldRenderLegacyTemplateFallback({ text: "", attachments: [] }, "FB"), false);
    assert.equal(shouldRenderLegacyTemplateFallback({ text: "Template", attachments: [] }, "FB"), true);
    assert.equal(shouldRenderLegacyTemplateFallback({ text: "[Form / Template]", attachments: [] }, "IG"), true);

    // Pure empty WA ghost rows without reply/reactions are hidden; reacted/replied ones show unavailable note
    assert.equal(getWhatsAppGhostDisplayMode({ text: "", attachments: [] }, "WA"), "hide");
    assert.equal(
      getWhatsAppGhostDisplayMode({ text: "", attachments: [], reactions: [{ emoji: "🙏" }] }, "WA"),
      "unavailable"
    );
    assert.equal(
      getWhatsAppGhostDisplayMode({ text: "", attachments: [], replyTo: { id: "m1" } }, "WA"),
      "unavailable"
    );
    assert.equal(getWhatsAppGhostDisplayMode({ text: "", attachments: [], isDeleted: true }, "WA"), "normal");
    assert.equal(getWhatsAppGhostDisplayMode({ text: "Yess", attachments: [] }, "WA"), "normal");
    assert.equal(getWhatsAppGhostDisplayMode({ text: "", attachments: [] }, "FB"), "normal");
  });
});

