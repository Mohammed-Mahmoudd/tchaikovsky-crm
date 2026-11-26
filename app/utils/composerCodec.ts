import type { ComposerMentionItem, MentionSpan, MessageMention } from "./groupMentions";
import type { InlineMarker, LinePrefix } from "./messageFormatting";

export interface ComposerFormatFlags {
  bold: boolean;
  italic: boolean;
  strikethrough: boolean;
  code: boolean;
}

export const EMPTY_COMPOSER_FORMAT: ComposerFormatFlags = {
  bold: false,
  italic: false,
  strikethrough: false,
  code: false,
};

export type ComposerSegment =
  | {
      kind: "text";
      text: string;
      format: ComposerFormatFlags;
    }
  | {
      kind: "mention";
      text: string;
      mention: ComposerMentionItem;
    };

export interface ComposerParagraph {
  segments: ComposerSegment[];
}

export interface SerializedComposerPayload {
  text: string;
  mentions: MessageMention[];
  mentionAll: boolean;
}

export interface InlineShortcutMatch {
  matchStart: number;
  matchEnd: number;
  innerText: string;
  format: keyof ComposerFormatFlags;
}

export type ListContinuationResult =
  | { action: "none" }
  | { action: "exit-list"; prefixLength: number }
  | { action: "continue"; nextPrefix: string };

export interface ParagraphPrefixEdit {
  removeLength: number;
  insertPrefix: string;
}

export interface SlashTriggerMatch {
  query: string;
  startIndex: number;
  endIndex: number;
}

export interface WordBoundaryRange {
  start: number;
  end: number;
  hasContent: boolean;
}

export interface MultiParagraphBoundaryEndpoints {
  startParaOffset: number;
  endParaOffset: number;
}

const WHATSAPP_BOUNDARY_CHAR_RE = /[\s\p{P}\p{S}]/u;

const ALL_TOKEN_RE =
  /(?:^|[\s(\[{"'«*_~])@(?:all|everyone|الكل|الجميع)(?=$|[\s.,!?:;،؛؟)\]}"'»*_~])/gi;
const INLINE_RE =
  /(^|[\s\p{P}\p{S}])(?:`([^`\n]+)`|([*_~])(?!\s)((?:(?!\3).)*?[^\s])\3)(?=$|[\s\p{P}\p{S}])/u;
const MENTION_TOKEN_RE = /\uE000M(\d+)\uE001/g;

const LINE_PREFIX_RE: Record<LinePrefix, RegExp> = {
  "- ": /^[-•*] /,
  "1. ": /^\d+\. /,
  "> ": /^> /,
};
const ANY_LINE_PREFIX_RE = /^([-•*] |\d+\. |> )/;

function formatsEqual(a: ComposerFormatFlags, b: ComposerFormatFlags): boolean {
  return (
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.strikethrough === b.strikethrough &&
    a.code === b.code
  );
}

function hasAnyFormat(f: ComposerFormatFlags): boolean {
  return f.bold || f.italic || f.strikethrough || f.code;
}

function isGroupAllMentionItem(mention: ComposerMentionItem, text: string): boolean {
  if (mention.isGroupMention || mention.jid === "all") return true;
  const trimmed = text.trim().toLowerCase();
  return (
    trimmed === "@all" ||
    trimmed === "@everyone" ||
    trimmed === "@الكل" ||
    trimmed === "@الجميع"
  );
}

function wrapFormattedText(raw: string, format: ComposerFormatFlags): string {
  if (!raw || !hasAnyFormat(format)) return raw;
  const leading = raw.match(/^\s*/)?.[0] ?? "";
  const trailing = raw.match(/\s*$/)?.[0] ?? "";
  const core = raw.slice(leading.length, raw.length - trailing.length);
  if (!core) return raw;

  let wrapped = core;
  if (format.code) {
    wrapped = wrapped.includes("`") ? `\`\`\`${wrapped}\`\`\`` : `\`${wrapped}\``;
  }
  if (format.bold) wrapped = `*${wrapped}*`;
  if (format.italic) wrapped = `_${wrapped}_`;
  if (format.strikethrough) wrapped = `~${wrapped}~`;

  return `${leading}${wrapped}${trailing}`;
}

function mergeAdjacentTextSegments(segments: ComposerSegment[]): ComposerSegment[] {
  const merged: ComposerSegment[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg.text) continue;
    if (seg.kind === "text") {
      const prev = merged[merged.length - 1];
      if (prev && prev.kind === "text" && formatsEqual(prev.format, seg.format)) {
        prev.text += seg.text;
        continue;
      }
      merged.push({
        kind: "text",
        text: seg.text,
        format: { ...seg.format },
      });
    } else {
      merged.push(seg);
    }
  }
  return merged;
}

/**
 * Serializes editor paragraphs into WhatsApp-formatted text (or plain text when
 * `supportsFormatting` is false) along with deduplicated mention metadata.
 */
export function serializeParagraphsToWhatsApp(
  paragraphs: ComposerParagraph[],
  supportsFormatting: boolean
): SerializedComposerPayload {
  if (
    paragraphs.length === 0 ||
    (paragraphs.length === 1 && paragraphs[0].segments.every((s) => !s.text))
  ) {
    return { text: "", mentions: [], mentionAll: false };
  }

  const mentions: MessageMention[] = [];
  const seenJids = new Set<string>();
  let mentionAll = false;

  const lines = paragraphs.map((para) => {
    const merged = mergeAdjacentTextSegments(para.segments);
    let line = "";
    for (let i = 0; i < merged.length; i++) {
      const seg = merged[i];
      if (seg.kind === "mention") {
        line += seg.text;
        if (isGroupAllMentionItem(seg.mention, seg.text)) {
          mentionAll = true;
        } else if (seg.mention.jid && !seenJids.has(seg.mention.jid)) {
          seenJids.add(seg.mention.jid);
          mentions.push({
            jid: seg.mention.jid,
            userId: seg.mention.userId,
            phone: seg.mention.phone,
            displayName: seg.mention.displayName,
            token: seg.mention.token || seg.text,
            isSelf: seg.mention.isSelf,
            isGroupMention: seg.mention.isGroupMention,
          });
        }
      } else {
        line += supportsFormatting ? wrapFormattedText(seg.text, seg.format) : seg.text;
      }
    }
    return line;
  });

  const text = lines.join("\n");
  ALL_TOKEN_RE.lastIndex = 0;
  if (ALL_TOKEN_RE.test(text)) {
    mentionAll = true;
  }

  return { text, mentions, mentionAll };
}

function getFencedCodeRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const fenceRe = /```[\s\S]+?```/g;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

function maskMentionSpans(
  text: string,
  spans: MentionSpan[]
): { masked: string; activeSpans: MentionSpan[] } {
  const fenced = getFencedCodeRanges(text);
  const activeSpans = spans.filter(
    (sp) => !fenced.some(([fs, fe]) => sp.start < fe && sp.end > fs)
  );
  if (activeSpans.length === 0) return { masked: text, activeSpans: [] };

  let out = "";
  let cursor = 0;
  for (let i = 0; i < activeSpans.length; i++) {
    const sp = activeSpans[i];
    if (sp.start < cursor) continue;
    out += text.slice(cursor, sp.start);
    out += `\uE000M${i}\uE001`;
    cursor = sp.end;
  }
  out += text.slice(cursor);
  return { masked: out, activeSpans };
}

function spanToComposerMention(span: MentionSpan): ComposerMentionItem {
  const m = span.mention;
  const fallbackName = span.text.replace(/^@/, "");
  return {
    jid: m?.jid || (m?.userId ? `${m.userId}@s.whatsapp.net` : span.text),
    userId: m?.userId,
    phone: m?.phone,
    displayName: m?.displayName || fallbackName,
    token: m?.token || span.text,
    isSelf: m?.isSelf ?? span.kind === "self",
    isGroupMention: m?.isGroupMention ?? span.kind === "all",
  };
}

function expandMaskedPlainSegments(
  value: string,
  activeSpans: MentionSpan[],
  format: ComposerFormatFlags
): ComposerSegment[] {
  if (!value) return [];
  if (!activeSpans.length || !value.includes("\uE000M")) {
    return [{ kind: "text", text: value, format: { ...format } }];
  }
  const out: ComposerSegment[] = [];
  let cursor = 0;
  MENTION_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MENTION_TOKEN_RE.exec(value)) !== null) {
    if (m.index > cursor) {
      out.push({
        kind: "text",
        text: value.slice(cursor, m.index),
        format: { ...format },
      });
    }
    const span = activeSpans[Number(m[1])];
    if (span) {
      out.push({
        kind: "mention",
        text: span.text,
        mention: spanToComposerMention(span),
      });
    }
    cursor = m.index + m[0].length;
  }
  if (cursor < value.length) {
    out.push({
      kind: "text",
      text: value.slice(cursor),
      format: { ...format },
    });
  }
  return out;
}

function restoreMaskedPlainText(value: string, activeSpans: MentionSpan[]): string {
  if (!value || !activeSpans.length || !value.includes("\uE000M")) return value;
  MENTION_TOKEN_RE.lastIndex = 0;
  return value.replace(MENTION_TOKEN_RE, (full, idx) => activeSpans[Number(idx)]?.text ?? full);
}

function parseInlineSegments(
  input: string,
  format: ComposerFormatFlags,
  activeSpans: MentionSpan[],
  depth = 0
): ComposerSegment[] {
  if (!input) return [];
  const out: ComposerSegment[] = [];
  let rest = input;

  while (rest) {
    const m = INLINE_RE.exec(rest);
    if (!m) {
      out.push(...expandMaskedPlainSegments(rest, activeSpans, format));
      break;
    }
    const lead = m[1];
    const before = rest.slice(0, m.index) + lead;
    if (before) {
      out.push(...expandMaskedPlainSegments(before, activeSpans, format));
    }

    if (m[2] !== undefined) {
      const codeFormat: ComposerFormatFlags = { ...format, code: true };
      const restoredCode = restoreMaskedPlainText(m[2], activeSpans);
      if (restoredCode) {
        out.push({ kind: "text", text: restoredCode, format: codeFormat });
      }
    } else {
      const marker = m[3] as InlineMarker;
      const nextFormat: ComposerFormatFlags = {
        ...format,
        bold: format.bold || marker === "*",
        italic: format.italic || marker === "_",
        strikethrough: format.strikethrough || marker === "~",
      };
      if (depth < 4) {
        out.push(...parseInlineSegments(m[4], nextFormat, activeSpans, depth + 1));
      } else {
        out.push(...expandMaskedPlainSegments(m[4], activeSpans, nextFormat));
      }
    }

    rest = rest.slice(m.index + m[0].length);
  }

  return out;
}

/**
 * Parses WhatsApp-formatted (or plain) text plus optional mention spans into
 * paragraph/segment structures ready to populate the Lexical composer.
 */
export function parseWhatsAppToParagraphs(
  rawText: string,
  opts: { formatting: boolean; mentionSpans?: MentionSpan[] }
): ComposerParagraph[] {
  const normalized = String(rawText ?? "").replace(/\r\n?/g, "\n");
  if (!normalized) {
    return [{ segments: [] }];
  }

  const mentionSpans = opts.mentionSpans ?? [];
  const { masked, activeSpans } =
    mentionSpans.length > 0
      ? maskMentionSpans(normalized, mentionSpans)
      : { masked: normalized, activeSpans: [] };

  if (!opts.formatting) {
    return masked.split("\n").map((line) => ({
      segments: mergeAdjacentTextSegments(
        expandMaskedPlainSegments(line, activeSpans, EMPTY_COMPOSER_FORMAT)
      ),
    }));
  }

  const paragraphs: ComposerParagraph[] = [{ segments: [] }];
  const pushNewParagraph = () => {
    paragraphs.push({ segments: [] });
  };
  const appendSegments = (segs: ComposerSegment[]) => {
    const current = paragraphs[paragraphs.length - 1];
    current.segments.push(...segs);
  };

  const parts = masked.split(/(```[\s\S]+?```)/g);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i % 2 === 1) {
      let inner = part.slice(3, -3);
      if (inner.includes("\n")) {
        inner = inner.replace(/^\n|\n$/g, "");
      }
      const codeLines = inner.split("\n");
      const codeFormat: ComposerFormatFlags = {
        ...EMPTY_COMPOSER_FORMAT,
        code: true,
      };
      for (let li = 0; li < codeLines.length; li++) {
        if (li > 0) pushNewParagraph();
        const restoredLine = restoreMaskedPlainText(codeLines[li], activeSpans);
        if (restoredLine) {
          appendSegments([{ kind: "text", text: restoredLine, format: codeFormat }]);
        }
      }
    } else {
      const lines = part.split("\n");
      for (let li = 0; li < lines.length; li++) {
        if (li > 0) pushNewParagraph();
        if (lines[li]) {
          appendSegments(
            parseInlineSegments(lines[li], EMPTY_COMPOSER_FORMAT, activeSpans, 0)
          );
        }
      }
    }
  }

  return paragraphs.map((p) => ({
    segments: mergeAdjacentTextSegments(p.segments),
  }));
}

function isUrlTokenAtIndex(text: string, idx: number): boolean {
  let tokenStart = idx;
  while (tokenStart > 0 && !/\s/.test(text[tokenStart - 1])) {
    tokenStart--;
  }
  const tokenSlice = text.slice(tokenStart, idx + 1);
  return /^https?:\/\//i.test(tokenSlice) || /^www\./i.test(tokenSlice) || tokenSlice.includes("://");
}

/**
 * Checks whether typing the final character in `textBeforeCaret` completed a valid
 * boundary-delimited WhatsApp inline shortcut (`*bold*`, `_italic_`, `~strike~`, `` `code` ``).
 */
export function matchInlineWhatsAppShortcut(
  textBeforeCaret: string
): InlineShortcutMatch | null {
  if (!textBeforeCaret || textBeforeCaret.length < 3) return null;
  const end = textBeforeCaret.length;
  const marker = textBeforeCaret[end - 1];
  if (marker !== "*" && marker !== "_" && marker !== "~" && marker !== "`") {
    return null;
  }

  let openIdx = -1;
  for (let i = end - 2; i >= 0; i--) {
    const ch = textBeforeCaret[i];
    if (ch === "\n" || ch === "\r") break;
    if (ch === marker) {
      openIdx = i;
      break;
    }
  }
  if (openIdx === -1) return null;

  const innerText = textBeforeCaret.slice(openIdx + 1, end - 1);
  if (!innerText || /^\s/.test(innerText) || /\s$/.test(innerText)) {
    return null;
  }

  if (openIdx > 0) {
    const prev = textBeforeCaret[openIdx - 1];
    if (prev === marker) return null;
    if (!/[\s\p{P}\p{S}]/u.test(prev)) return null;
    if (isUrlTokenAtIndex(textBeforeCaret, openIdx)) return null;
  }

  const format: keyof ComposerFormatFlags =
    marker === "*"
      ? "bold"
      : marker === "_"
      ? "italic"
      : marker === "~"
      ? "strikethrough"
      : "code";

  return {
    matchStart: openIdx,
    matchEnd: end,
    innerText,
    format,
  };
}

/**
 * Computes list/quote continuation when pressing newline inside a paragraph.
 */
export function computeListContinuation(lineTextBeforeCaret: string): ListContinuationResult {
  const match = lineTextBeforeCaret.match(/^([-•*] |(\d+)\. |> )/);
  if (!match) return { action: "none" };

  if (lineTextBeforeCaret.trim() === match[0].trim()) {
    return { action: "exit-list", prefixLength: lineTextBeforeCaret.length };
  }

  const nextPrefix = match[2] ? `${parseInt(match[2], 10) + 1}. ` : match[1];
  return { action: "continue", nextPrefix };
}

/**
 * Computes minimal per-paragraph leading prefix edits for `- `, `1. `, or `> ` toggles
 * so inline formatting and @mentions later in each paragraph remain intact.
 */
export function toggleParagraphPrefixEdit(
  lineTexts: string[],
  prefix: LinePrefix
): ParagraphPrefixEdit[] {
  if (lineTexts.length === 0) return [];
  const re = LINE_PREFIX_RE[prefix];
  const contentLines = lineTexts.filter((l) => l.trim().length > 0);
  const allHave = contentLines.length > 0 && contentLines.every((l) => re.test(l));

  let counter = 0;
  return lineTexts.map((line) => {
    if (allHave) {
      const m = line.match(re);
      return { removeLength: m ? m[0].length : 0, insertPrefix: "" };
    }
    if (!line.trim() && lineTexts.length > 1) {
      return { removeLength: 0, insertPrefix: "" };
    }
    const existing = line.match(ANY_LINE_PREFIX_RE);
    counter++;
    return {
      removeLength: existing ? existing[0].length : 0,
      insertPrefix: prefix === "1. " ? `${counter}. ` : prefix,
    };
  });
}

/**
 * Detects an active `/query` fast-reply trigger at the end of the current paragraph text before caret.
 */
export function detectSlashTrigger(paragraphTextBeforeCaret: string): SlashTriggerMatch | null {
  if (!paragraphTextBeforeCaret) return null;
  const match = paragraphTextBeforeCaret.match(/(?:^|\s)\/([^\s]*)$/);
  if (!match) return null;
  const fullMatch = match[0];
  const query = match[1];
  const slashOffsetInMatch = fullMatch.indexOf("/");
  const matchStart = paragraphTextBeforeCaret.length - fullMatch.length;
  const slashIndex = matchStart + slashOffsetInMatch;
  return {
    query,
    startIndex: slashIndex,
    endIndex: paragraphTextBeforeCaret.length,
  };
}

function prevCodePointStart(text: string, idx: number): { start: number; ch: string } | null {
  if (idx <= 0) return null;
  let start = idx - 1;
  const cu = text.charCodeAt(start);
  if (cu >= 0xdc00 && cu <= 0xdfff && start > 0) {
    const hi = text.charCodeAt(start - 1);
    if (hi >= 0xd800 && hi <= 0xdbff) {
      start--;
    }
  }
  return { start, ch: text.slice(start, idx) };
}

function nextCodePointEnd(text: string, idx: number): { end: number; ch: string } | null {
  if (idx >= text.length) return null;
  let end = idx + 1;
  const cu = text.charCodeAt(idx);
  if (cu >= 0xd800 && cu <= 0xdbff && end < text.length) {
    const lo = text.charCodeAt(end);
    if (lo >= 0xdc00 && lo <= 0xdfff) {
      end++;
    }
  }
  return { end, ch: text.slice(idx, end) };
}

function expandStartLeftToWordBoundary(text: string, s: number): number {
  const curr = nextCodePointEnd(text, s);
  if (!curr || WHATSAPP_BOUNDARY_CHAR_RE.test(curr.ch)) return s;
  let cursor = s;
  while (cursor > 0) {
    const prev = prevCodePointStart(text, cursor);
    if (!prev || WHATSAPP_BOUNDARY_CHAR_RE.test(prev.ch)) break;
    cursor = prev.start;
  }
  return cursor;
}

function expandEndRightToWordBoundary(text: string, e: number): number {
  const prev = prevCodePointStart(text, e);
  if (!prev || WHATSAPP_BOUNDARY_CHAR_RE.test(prev.ch)) return e;
  let cursor = e;
  while (cursor < text.length) {
    const next = nextCodePointEnd(text, cursor);
    if (!next || WHATSAPP_BOUNDARY_CHAR_RE.test(next.ch)) break;
    cursor = next.end;
  }
  return cursor;
}

/**
 * Expands a single-paragraph selection `[selStart, selEnd]` to enclosing WhatsApp
 * inline-formatting word boundaries: trims leading/trailing whitespace inside the
 * selection first, then widens mid-word edges outward until start/end of line or
 * a WhatsApp delimiter (`[\s\p{P}\p{S}]`) so formatted output always renders bold/italic/etc.
 */
export function expandRangeToWhatsAppWordBoundaries(
  lineText: string,
  selStart: number,
  selEnd: number
): WordBoundaryRange {
  const rawLo = Math.max(0, Math.min(lineText.length, Math.min(selStart, selEnd)));
  const rawHi = Math.max(0, Math.min(lineText.length, Math.max(selStart, selEnd)));

  let s = rawLo;
  let e = rawHi;
  while (s < e) {
    const next = nextCodePointEnd(lineText, s);
    if (next && /\s/.test(next.ch)) s = next.end;
    else break;
  }
  while (e > s) {
    const prev = prevCodePointStart(lineText, e);
    if (prev && /\s/.test(prev.ch)) e = prev.start;
    else break;
  }

  if (s >= e) {
    return { start: rawLo, end: rawHi, hasContent: false };
  }

  return {
    start: expandStartLeftToWordBoundary(lineText, s),
    end: expandEndRightToWordBoundary(lineText, e),
    hasContent: true,
  };
}

/**
 * Expands the first-paragraph start and last-paragraph end of a multi-paragraph
 * selection outward to WhatsApp word boundaries.
 */
export function expandCrossParagraphEndpointsToWordBoundaries(
  firstLineText: string,
  firstOffset: number,
  lastLineText: string,
  lastOffset: number
): MultiParagraphBoundaryEndpoints {
  let s = Math.max(0, Math.min(firstLineText.length, firstOffset));
  while (s < firstLineText.length) {
    const next = nextCodePointEnd(firstLineText, s);
    if (next && /\s/.test(next.ch)) s = next.end;
    else break;
  }
  const expandedStart = s < firstLineText.length ? expandStartLeftToWordBoundary(firstLineText, s) : s;

  let e = Math.max(0, Math.min(lastLineText.length, lastOffset));
  while (e > 0) {
    const prev = prevCodePointStart(lastLineText, e);
    if (prev && /\s/.test(prev.ch)) e = prev.start;
    else break;
  }
  const expandedEnd = e > 0 ? expandEndRightToWordBoundary(lastLineText, e) : e;

  return {
    startParaOffset: expandedStart,
    endParaOffset: expandedEnd,
  };
}

