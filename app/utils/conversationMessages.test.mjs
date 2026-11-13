import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeUnreadFromMessages,
  getLastRealMessageDirection,
  isAutomatedTemplateMsg,
  isLastMessageFromLead,
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
});

