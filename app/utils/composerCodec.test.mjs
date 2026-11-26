import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_COMPOSER_FORMAT,
  computeListContinuation,
  detectSlashTrigger,
  expandCrossParagraphEndpointsToWordBoundaries,
  expandRangeToWhatsAppWordBoundaries,
  matchInlineWhatsAppShortcut,
  parseWhatsAppToParagraphs,
  serializeParagraphsToWhatsApp,
  toggleParagraphPrefixEdit,
} from "./composerCodec.ts";
import { extractMentionSpans } from "./groupMentions.ts";

describe("composerCodec", () => {
  it("serializes empty editor to empty string with no mentions", () => {
    assert.deepEqual(serializeParagraphsToWhatsApp([], true), {
      text: "",
      mentions: [],
      mentionAll: false,
    });
    assert.deepEqual(
      serializeParagraphsToWhatsApp([{ segments: [] }], true),
      { text: "", mentions: [], mentionAll: false }
    );
  });

  it("merges adjacent segments with identical formatting and trims outer spaces", () => {
    const out = serializeParagraphsToWhatsApp(
      [
        {
          segments: [
            { kind: "text", text: "Hello ", format: EMPTY_COMPOSER_FORMAT },
            {
              kind: "text",
              text: "piano ",
              format: { ...EMPTY_COMPOSER_FORMAT, bold: true },
            },
            {
              kind: "text",
              text: "class",
              format: { ...EMPTY_COMPOSER_FORMAT, bold: true },
            },
            {
              kind: "text",
              text: "   ",
              format: { ...EMPTY_COMPOSER_FORMAT, bold: true },
            },
            { kind: "text", text: "today", format: EMPTY_COMPOSER_FORMAT },
          ],
        },
      ],
      true
    );

    assert.equal(out.text, "Hello *piano class*   today");
    assert.deepEqual(out.mentions, []);
    assert.equal(out.mentionAll, false);
  });

  it("preserves intentional blank lines and mixed Arabic/English round-trips", () => {
    const sample =
      "أهلاً وسهلاً ✨\nوصلنا استفسارك بخصوص دروس الموسيقى في *Tchaikovsky Music School*\n\n_متاح غداً_\n~خصم قديم~\n`ABC-123`";
    const parsed = parseWhatsAppToParagraphs(sample, { formatting: true });
    assert.equal(parsed.length, 6);
    assert.deepEqual(parsed[2].segments, []);

    const serialized = serializeParagraphsToWhatsApp(parsed, true);
    assert.equal(serialized.text, sample);
  });

  it("handles nested formatting and four-flag formatting round-trips", () => {
    const nested = "~_*`note`*_~";
    const parsed = parseWhatsAppToParagraphs(nested, { formatting: true });
    assert.deepEqual(parsed, [
      {
        segments: [
          {
            kind: "text",
            text: "note",
            format: { bold: true, italic: true, strikethrough: true, code: true },
          },
        ],
      },
    ]);
    assert.equal(serializeParagraphsToWhatsApp(parsed, true).text, nested);
  });

  it("parses fenced code blocks across multiple lines and inline monospace", () => {
    const sample = "Check:\n```\nline 1\nline 2\n```\nDone ```ok```";
    const parsed = parseWhatsAppToParagraphs(sample, { formatting: true });
    assert.equal(parsed.length, 4);
    assert.equal(parsed[1].segments[0].kind, "text");
    if (parsed[1].segments[0].kind === "text") {
      assert.equal(parsed[1].segments[0].format.code, true);
      assert.equal(parsed[1].segments[0].text, "line 1");
    }
    if (parsed[3].segments[1].kind === "text") {
      assert.equal(parsed[3].segments[1].format.code, true);
      assert.equal(parsed[3].segments[1].text, "ok");
    }
  });

  it("preserves literal URLs, math expressions, and snake_case words", () => {
    const sample =
      "Visit https://maps.app.goo.gl/foo_bar_baz?g_st=iw and pay 5 * 2 = 10 for piano_lesson_v2";
    const parsed = parseWhatsAppToParagraphs(sample, { formatting: true });
    assert.equal(parsed.length, 1);
    assert.deepEqual(parsed[0].segments, [
      { kind: "text", text: sample, format: EMPTY_COMPOSER_FORMAT },
    ]);
    assert.equal(serializeParagraphsToWhatsApp(parsed, true).text, sample);
  });

  it("keeps IG/FB mode strictly plain text without emitting WhatsApp markers", () => {
    const paragraphs = [
      {
        segments: [
          {
            kind: "text",
            text: "Hello *world*",
            format: { ...EMPTY_COMPOSER_FORMAT, bold: true },
          },
        ],
      },
    ];
    const igOut = serializeParagraphsToWhatsApp(paragraphs, false);
    assert.equal(igOut.text, "Hello *world*");

    const parsedPlain = parseWhatsAppToParagraphs("*bold* _italic_", {
      formatting: false,
    });
    assert.deepEqual(parsedPlain, [
      {
        segments: [
          { kind: "text", text: "*bold* _italic_", format: EMPTY_COMPOSER_FORMAT },
        ],
      },
    ]);
  });

  it("round-trips structured mentions and @all cleanly without formatting markers", () => {
    const text = "Hi @Ahmed Mohamed and @all please check *schedule*";
    const spans = extractMentionSpans(text, {
      mentions: [
        {
          jid: "201001112233@s.whatsapp.net",
          userId: "201001112233",
          phone: "+201001112233",
          displayName: "Ahmed Mohamed",
          token: "@Ahmed Mohamed",
        },
      ],
      mentionAll: true,
      preserveTextLength: true,
    });

    const parsed = parseWhatsAppToParagraphs(text, {
      formatting: true,
      mentionSpans: spans,
    });

    assert.equal(parsed[0].segments[1].kind, "mention");
    assert.equal(parsed[0].segments[3].kind, "mention");

    const serialized = serializeParagraphsToWhatsApp(parsed, true);
    assert.equal(serialized.text, text);
    assert.equal(serialized.mentionAll, true);
    assert.equal(serialized.mentions.length, 1);
    assert.equal(serialized.mentions[0].jid, "201001112233@s.whatsapp.net");

    // Arabic @الكل token sets mentionAll even as plain text
    const arabicAll = serializeParagraphsToWhatsApp(
      parseWhatsAppToParagraphs("تنبيه @الكل", { formatting: true }),
      true
    );
    assert.equal(arabicAll.mentionAll, true);
    assert.deepEqual(arabicAll.mentions, []);
  });

  it("matches inline WhatsApp shortcuts and rejects URLs or snake_case", () => {
    assert.deepEqual(matchInlineWhatsAppShortcut("*piano*"), {
      matchStart: 0,
      matchEnd: 7,
      innerText: "piano",
      format: "bold",
    });
    assert.deepEqual(matchInlineWhatsAppShortcut("أهلاً *مرحبا*"), {
      matchStart: 6,
      matchEnd: 13,
      innerText: "مرحبا",
      format: "bold",
    });
    assert.deepEqual(matchInlineWhatsAppShortcut("(_note_"), {
      matchStart: 1,
      matchEnd: 7,
      innerText: "note",
      format: "italic",
    });
    assert.deepEqual(matchInlineWhatsAppShortcut("~old~"), {
      matchStart: 0,
      matchEnd: 5,
      innerText: "old",
      format: "strikethrough",
    });
    assert.deepEqual(matchInlineWhatsAppShortcut("`id`"), {
      matchStart: 0,
      matchEnd: 4,
      innerText: "id",
      format: "code",
    });

    assert.equal(matchInlineWhatsAppShortcut("foo_bar_"), null);
    assert.equal(matchInlineWhatsAppShortcut("https://example.com/_bar_"), null);
    assert.equal(matchInlineWhatsAppShortcut("* hello*"), null);
    assert.equal(matchInlineWhatsAppShortcut("*hello *"), null);
    assert.equal(matchInlineWhatsAppShortcut("**"), null);
  });

  it("computes list continuations and minimal paragraph prefix edits", () => {
    assert.deepEqual(computeListContinuation("- Piano lesson"), {
      action: "continue",
      nextPrefix: "- ",
    });
    assert.deepEqual(computeListContinuation("2. Violin slot"), {
      action: "continue",
      nextPrefix: "3. ",
    });
    assert.deepEqual(computeListContinuation("> Quoted note"), {
      action: "continue",
      nextPrefix: "> ",
    });
    assert.deepEqual(computeListContinuation("- "), {
      action: "exit-list",
      prefixLength: 2,
    });
    assert.deepEqual(computeListContinuation("Normal line"), {
      action: "none",
    });

    assert.deepEqual(toggleParagraphPrefixEdit(["First", "", "Second"], "1. "), [
      { removeLength: 0, insertPrefix: "1. " },
      { removeLength: 0, insertPrefix: "" },
      { removeLength: 0, insertPrefix: "2. " },
    ]);
    assert.deepEqual(toggleParagraphPrefixEdit(["- First", "- Second"], "- "), [
      { removeLength: 2, insertPrefix: "" },
      { removeLength: 2, insertPrefix: "" },
    ]);
    assert.deepEqual(toggleParagraphPrefixEdit(["- First", "Second"], "> "), [
      { removeLength: 2, insertPrefix: "> " },
      { removeLength: 0, insertPrefix: "> " },
    ]);
  });

  it("detects slash triggers cleanly per paragraph", () => {
    assert.deepEqual(detectSlashTrigger("/"), {
      query: "",
      startIndex: 0,
      endIndex: 1,
    });
    assert.deepEqual(detectSlashTrigger("Hello /اهلا"), {
      query: "اهلا",
      startIndex: 6,
      endIndex: 11,
    });
    assert.equal(detectSlashTrigger("https://maps.app.goo.gl/abc"), null);
    assert.equal(detectSlashTrigger("/jeddah "), null);
  });

  it("expands partial-word selections to enclosing WhatsApp word boundaries", () => {
    // dfjk[alfjkal] -> *dfjkalfjkal*
    assert.deepEqual(expandRangeToWhatsAppWordBoundaries("dfjkalfjkal", 4, 11), {
      start: 0,
      end: 11,
      hasContent: true,
    });

    // dfjk[fjk] -> *dfjkalfjkal* (middle substring expands both directions)
    assert.deepEqual(expandRangeToWhatsAppWordBoundaries("dfjkalfjkal", 1, 4), {
      start: 0,
      end: 11,
      hasContent: true,
    });

    // How a[re you] -> How *are you*
    assert.deepEqual(expandRangeToWhatsAppWordBoundaries("How are you", 5, 11), {
      start: 4,
      end: 11,
      hasContent: true,
    });

    // Trims outer spaces cleanly without spilling into adjacent words
    assert.deepEqual(expandRangeToWhatsAppWordBoundaries("Hello world today", 2, 12), {
      start: 0,
      end: 11,
      hasContent: true,
    });

    // Stops at punctuation delimiters (e.g. "Hello, world!")
    assert.deepEqual(expandRangeToWhatsAppWordBoundaries("Hello, world!", 8, 11), {
      start: 7,
      end: 12,
      hasContent: true,
    });

    // Handles Arabic text and emoji boundaries cleanly
    assert.deepEqual(expandRangeToWhatsAppWordBoundaries("مرحبا بكم 👋", 2, 5), {
      start: 0,
      end: 5,
      hasContent: true,
    });

    // Pure whitespace selection reports hasContent: false
    assert.deepEqual(expandRangeToWhatsAppWordBoundaries("Hello   world", 5, 8), {
      start: 5,
      end: 8,
      hasContent: false,
    });

    // Cross-paragraph partial selection expands start of line 1 and end of line 2
    assert.deepEqual(
      expandCrossParagraphEndpointsToWordBoundaries("First line", 7, "Second paragraph", 10),
      { startParaOffset: 6, endParaOffset: 16 }
    );
  });

  it("does not trigger mentionAll for email addresses and preserves inline code with @all on edit", () => {
    const emailPayload = serializeParagraphsToWhatsApp(
      [
        {
          segments: [
            {
              kind: "text",
              text: "Contact info@all.com or team@everyone.org",
              format: { ...EMPTY_COMPOSER_FORMAT },
            },
          ],
        },
      ],
      true
    );
    assert.equal(emailPayload.mentionAll, false);

    // Inline code containing @all must stay plain code text when parsed for edit mode
    const rawCodeText = "Run `say @all now` please";
    const parsedCode = parseWhatsAppToParagraphs(rawCodeText, {
      formatting: true,
      mentionSpans: [{ start: 9, end: 13, text: "@all", kind: "all" }],
    });
    const segments = parsedCode[0].segments;
    const codeSeg = segments.find((s) => s.kind === "text" && s.format.code);
    assert.ok(codeSeg && codeSeg.kind === "text");
    assert.equal(codeSeg.text, "say @all now");
    assert.equal(segments.some((s) => s.kind === "mention"), false);
  });
});

