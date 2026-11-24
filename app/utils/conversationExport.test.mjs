import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildBatchConversationExportFilename,
  buildConversationArchiveEntries,
  buildConversationExportFilename,
  formatCombinedConversationsTranscript,
  formatConversationTranscript,
  sanitizeExportFilenamePart,
} from "./conversationExport.ts";

describe("conversationExport", () => {
  it("sanitizes unsafe filename characters while keeping Arabic and Latin letters", () => {
    assert.equal(
      sanitizeExportFilenamePart('Sara / Test: "VIP" <Lead>'),
      "Sara-Test-VIP-Lead"
    );
    assert.equal(sanitizeExportFilenamePart("أحمد علي"), "أحمد-علي");
    assert.equal(sanitizeExportFilenamePart("///..."), "conversation");
  });

  it("builds deterministic .txt export filenames", () => {
    const filename = buildConversationExportFilename(
      { id: "201001234567", name: "+201001234567", leadName: "Nour Mohamed" },
      new Date(2026, 10, 20, 14, 30, 0)
    );
    assert.equal(filename, "conversation-Nour-Mohamed-2026-11-20.txt");
  });

  it("formats admissions conversation metadata, messages, attachments, replies, and reactions cleanly", () => {
    const tsDay1 = new Date(2026, 10, 19, 10, 15, 0).getTime();
    const tsDay1Reply = new Date(2026, 10, 19, 10, 17, 0).getTime();
    const tsDay2 = new Date(2026, 10, 20, 15, 45, 0).getTime();

    const transcript = formatConversationTranscript(
      {
        id: "201001234567",
        channel: "WA",
        metaChannel: "FB",
        name: "+201001234567",
        leadName: "Layla Hassan",
        phone: "+201001234567",
        agent: "Sara",
        status: "Open",
        pipeline: "Audition Booked",
        branch: "Riyadh - Al Olaya",
        labels: ["lbl_vip", "lbl_piano"],
        source: { campaign: "Piano Q4", adset: "Riyadh Parents", ad: "Video 1" },
        formAnswers: { instrument: "Piano", studentAge: "8" },
        auditionDate: "2026-11-22",
        followUpDate: "2026-11-21",
        followUpNote: "Confirm time",
        cashIn: 500,
        notes: "Prefers afternoon\nSister may join too",
        messages: [
          {
            id: "m1",
            isIncoming: true,
            timestamp: tsDay1,
            text: "السلام عليكم، عايزة تفاصيل حصص البيانو",
          },
          {
            id: "m2",
            isIncoming: false,
            senderName: "Sara",
            timestamp: tsDay1Reply,
            text: "أهلاً بحضرتك! يسعدنا نرحب بيكي في مدرسة تشايكوفسكي.",
            isEdited: true,
            replyTo: {
              id: "m1",
              text: "السلام عليكم، عايزة تفاصيل حصص البيانو",
              isIncoming: true,
            },
            reactions: [{ emoji: "❤️", fromMe: false, sender: "Layla Hassan" }],
          },
          {
            id: "m3",
            isIncoming: false,
            senderName: "Sara",
            timestamp: tsDay2,
            text: "Brochure.pdf",
            attachments: [
              {
                type: "file",
                fileName: "Brochure.pdf",
                fileSize: 2048,
                url: "/api/messages/media/brochure.pdf",
              },
            ],
          },
          {
            id: "m4",
            isIncoming: false,
            senderName: "Sara",
            timestamp: tsDay2 + 60_000,
            isDeleted: true,
            deletedBy: "Sara",
            text: "This message was deleted",
          },
        ],
      },
      {
        labels: [
          { id: "lbl_vip", name: "VIP" },
          { id: "lbl_piano", name: "Piano" },
        ],
        inboxMode: "admissions",
        exportedAt: new Date(2026, 10, 20, 17, 0, 0),
        origin: "https://crm.tchaikovskyschool.com",
      }
    );

    assert.match(transcript, /Contact: \+201001234567 \(Layla Hassan\)/);
    assert.match(transcript, /Channel: WhatsApp · Facebook Form/);
    assert.match(transcript, /Inbox: Admissions/);
    assert.match(transcript, /Pipeline: Audition Booked/);
    assert.match(transcript, /Labels: VIP, Piano/);
    assert.match(transcript, /Source: Piano Q4 · Riyadh Parents · Video 1/);
    assert.match(transcript, /Form Answers: Instrument: Piano · Student Age: 8/);
    assert.match(transcript, /Cash In: 500 SAR/);
    assert.match(transcript, /Notes: Prefers afternoon \| Sister may join too/);
    assert.match(transcript, /Messages: 4/);
    assert.match(transcript, /--- Thu, Nov 19, 2026 ---/);
    assert.match(transcript, /--- Fri, Nov 20, 2026 ---/);
    assert.match(transcript, /\[10:15\] Layla Hassan: السلام عليكم، عايزة تفاصيل حصص البيانو/);
    assert.match(transcript, /\[10:17\] Sara \(edited\): أهلاً بحضرتك!/);
    assert.match(transcript, /  > Replying to Layla Hassan: السلام عليكم، عايزة تفاصيل حصص البيانو/);
    assert.match(transcript, /  \[Reactions: ❤️ Layla Hassan\]/);
    assert.match(
      transcript,
      /\[15:45\] Sara: \[File: Brochure\.pdf, 2\.0 KB\] \(https:\/\/crm\.tchaikovskyschool\.com\/api\/messages\/media\/brochure\.pdf\)/
    );
    assert.match(transcript, /\[15:46\] Sara: \[Message deleted by Sara\]/);
  });

  it("handles raw backend message format (direction + messageId), group chats, templates, and empty chats", () => {
    const emptyTranscript = formatConversationTranscript(
      {
        id: "op_grp_12345",
        channel: "WA",
        isGroup: true,
        name: "Teachers Coordination",
        agent: "Omar",
        status: "Pending",
        isDone: true,
        doneBy: "Omar",
        messages: [],
      },
      { inboxMode: "operation" }
    );

    assert.match(emptyTranscript, /Channel: WhatsApp Group/);
    assert.match(emptyTranscript, /Inbox: Operation/);
    assert.match(emptyTranscript, /Status: Pending · DONE by Omar/);
    assert.match(emptyTranscript, /\(No messages in this conversation\.\)/);

    const rawTranscript = formatConversationTranscript({
      id: "fb_999",
      channel: "FB",
      name: "Mona",
      messages: [
        {
          messageId: "mid_1",
          direction: "incoming",
          timestamp: new Date(2026, 10, 20, 9, 0, 0).getTime(),
          text: "Template",
          attachments: [
            {
              type: "template",
              payload: {
                elements: [{ title: "Lead Form", subtitle: "Phone: +201112223334" }],
              },
            },
          ],
        },
      ],
    });

    assert.match(rawTranscript, /\[09:00\] Mona: \[Template: Lead Form — Phone: \+201112223334\]/);

    const waGhostTranscript = formatConversationTranscript({
      id: "op_966504667561",
      channel: "WA",
      name: "Taleen Abou Aliah",
      messages: [
        { messageId: "m1", direction: "outgoing", senderName: "Staff", timestamp: 1795451486000, text: "", attachments: [] },
        { messageId: "m2", direction: "incoming", senderName: "Taleen", timestamp: 1795451500000, text: "Yess", attachments: [] },
        {
          messageId: "m3",
          direction: "incoming",
          senderName: "Rowan",
          timestamp: 1795451600000,
          text: "",
          attachments: [],
          reactions: [{ emoji: "🙏", sender: "MaNaR", fromMe: false }],
        },
      ],
    });
    assert.match(waGhostTranscript, /Messages: 2/);
    assert.doesNotMatch(waGhostTranscript, /\(empty message\)/);
    assert.match(waGhostTranscript, /\[Message unavailable in CRM\]/);
  });

  it("formats combined transcripts and deduplicated archive entries for batch Agent export", () => {
    const exportedAt = new Date(2026, 10, 24, 14, 0, 0);
    assert.equal(
      buildBatchConversationExportFilename("txt", "saved-conversations", exportedAt),
      "saved-conversations-2026-11-24.txt"
    );
    assert.equal(
      buildBatchConversationExportFilename("zip", "saved-conversations", exportedAt),
      "saved-conversations-2026-11-24.zip"
    );

    const convs = [
      {
        id: "c1",
        channel: "WA",
        name: "Sara",
        messages: [{ id: "m1", isIncoming: true, timestamp: 1795451500000, text: "Hello piano" }],
      },
      {
        id: "c2",
        channel: "FB",
        name: "Sara",
        messages: [
          { id: "m2", isIncoming: true, timestamp: 1795451600000, text: "Pricing?" },
          { id: "m3", isIncoming: false, senderName: "Adham (AI)", timestamp: 1795451660000, text: "Welcome!" },
        ],
      },
    ];

    const combined = formatCombinedConversationsTranscript(convs, {
      inboxMode: "admissions",
      exportedAt,
    });
    assert.match(combined, /Tchaikovsky School — Saved Conversations Bundle/);
    assert.match(combined, /Conversations: 2/);
    assert.match(combined, /Total Messages: 3/);
    assert.match(combined, /1\. Sara \(WhatsApp · Admissions · 1 message\)/);
    assert.match(combined, /2\. Sara \(Messenger · Admissions · 2 messages\)/);
    assert.match(combined, /\[Conversation 1 of 2\]/);
    assert.match(combined, /\[Conversation 2 of 2\]/);
    assert.match(combined, /Hello piano/);
    assert.match(combined, /Pricing\?/);

    const entries = buildConversationArchiveEntries(convs, { exportedAt });
    assert.equal(entries.length, 2);
    assert.equal(entries[0].name, "conversation-Sara-2026-11-24.txt");
    assert.equal(entries[1].name, "conversation-Sara-2026-11-24-2.txt");
    assert.ok(entries[0].content.startsWith("\uFEFF"));
  });
});

