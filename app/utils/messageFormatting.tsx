import React from "react";
import {
  extractMentionSpans,
  type GroupParticipant,
  type MentionSpan,
  type MessageMention,
} from "./groupMentions";

export interface RenderWhatsAppMentionOptions {
  mentions?: MessageMention[];
  mentionAll?: boolean;
  participants?: GroupParticipant[];
}

/**
 * WhatsApp-style text formatting helpers.
 *
 * WhatsApp natively supports:   *bold*  _italic_  ~strike~  ```mono```  `code`
 *                               "- " / "* " bullets, "1. " numbered lists, "> " quotes
 * Instagram DM & Messenger send plain text only → markup is stripped before sending.
 */

export type MessageChannel = "WA" | "IG" | "FB";

export const CHANNEL_CAPABILITIES: Record<MessageChannel, { formatting: boolean }> = {
  WA: { formatting: true },
  IG: { formatting: false },
  FB: { formatting: false },
};

export type InlineMarker = "*" | "_" | "~" | "```";
export type LinePrefix = "- " | "1. " | "> ";

// ─────────────────────────────────────────────────────────────────────────────
// Parsing (for rendering & stripping)
// ─────────────────────────────────────────────────────────────────────────────

type Node =
  | { t: "text"; v: string }
  | { t: "b" | "i" | "s"; c: Node[] }
  | { t: "code"; v: string };

// Boundary rules mirror WhatsApp: opening marker preceded by start/space/punctuation,
// followed by non-space; closing marker preceded by non-space, followed by end/space/punctuation.
const INLINE_RE = /(^|[\s\p{P}\p{S}])(?:`([^`\n]+)`|([*_~])(?!\s)((?:(?!\3).)*?[^\s])\3)(?=$|[\s\p{P}\p{S}])/u;

function parseInline(input: string, depth = 0): Node[] {
  const out: Node[] = [];
  let rest = input;
  while (rest) {
    const m = INLINE_RE.exec(rest);
    if (!m) {
      out.push({ t: "text", v: rest });
      break;
    }
    const lead = m[1];
    const before = rest.slice(0, m.index) + lead;
    if (before) out.push({ t: "text", v: before });
    if (m[2] !== undefined) {
      out.push({ t: "code", v: m[2] });
    } else {
      const kind = m[3] === "*" ? "b" : m[3] === "_" ? "i" : "s";
      out.push({ t: kind, c: depth < 3 ? parseInline(m[4], depth + 1) : [{ t: "text", v: m[4] }] });
    }
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

function nodesToPlain(nodes: Node[]): string {
  return nodes.map((n) => (n.t === "text" || n.t === "code" ? n.v : nodesToPlain(n.c))).join("");
}

/** Remove WhatsApp markup so IG / FB recipients never see raw `*` `_` `~` symbols. */
export function stripWhatsAppMarkup(text: string): string {
  if (!/[*_~`>]/.test(text)) return text;
  return text
    .replace(/```([\s\S]*?)```/g, "$1")
    .split("\n")
    .map((line) => {
      const unquoted = line.replace(/^> /, "");
      return nodesToPlain(parseInline(unquoted));
    })
    .join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendering (CRM chat bubbles) — safe React nodes, no dangerouslySetInnerHTML
// ─────────────────────────────────────────────────────────────────────────────

const MENTION_TOKEN_RE = /\uE000M(\d+)\uE001/g;

function getFencedCodeRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const fenceRe = /```[\s\S]*?```/g;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

function maskMentionSpans(text: string, spans: MentionSpan[]): { masked: string; activeSpans: MentionSpan[] } {
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

function restoreMaskedText(value: string, spans: MentionSpan[]): string {
  if (!spans.length || !value.includes("\uE000M")) return value;
  return value.replace(MENTION_TOKEN_RE, (full, idxStr) => spans[Number(idxStr)]?.text ?? full);
}

function renderMentionChip(span: MentionSpan, key: string): React.ReactNode {
  const label = span.displayText || span.text;
  const chipStyle: React.CSSProperties =
    span.kind === "all"
      ? {
          background: "var(--label-amber-bg)",
          color: "var(--label-amber-text)",
          borderColor: "var(--label-amber-border)",
        }
      : span.kind === "self"
      ? {
          background: "var(--label-green-bg)",
          color: "var(--label-green-text)",
          borderColor: "var(--label-green-border)",
        }
      : {
          background: "var(--label-blue-bg)",
          color: "var(--label-blue-text)",
          borderColor: "var(--label-blue-border)",
        };

  return (
    <bdi
      key={key}
      dir="auto"
      className="inline-block font-semibold px-1 py-px rounded border text-[0.94em] leading-tight align-baseline"
      style={chipStyle}
    >
      {label}
    </bdi>
  );
}

function expandMentionTokensInText(
  value: string,
  spans: MentionSpan[],
  keyPrefix: string
): React.ReactNode {
  if (!spans.length || !value.includes("\uE000M")) return value;
  const out: React.ReactNode[] = [];
  let cursor = 0;
  MENTION_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  let partIdx = 0;
  while ((m = MENTION_TOKEN_RE.exec(value)) !== null) {
    if (m.index > cursor) {
      out.push(value.slice(cursor, m.index));
    }
    const span = spans[Number(m[1])];
    if (span) {
      out.push(renderMentionChip(span, `${keyPrefix}-bm${partIdx++}`));
    }
    cursor = m.index + m[0].length;
  }
  if (cursor < value.length) {
    out.push(value.slice(cursor));
  }
  return out;
}

function renderNodes(nodes: Node[], keyPrefix: string, activeSpans: MentionSpan[] = []): React.ReactNode[] {
  return nodes.map((n, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (n.t) {
      case "text":
        return (
          <React.Fragment key={key}>
            {expandMentionTokensInText(n.v, activeSpans, key)}
          </React.Fragment>
        );
      case "code":
        return (
          <code key={key} className="px-1 py-[1px] rounded bg-black/[0.07] dark:bg-white/10 font-mono text-[0.9em]">
            {restoreMaskedText(n.v, activeSpans)}
          </code>
        );
      case "b":
        return <strong key={key} className="font-semibold">{renderNodes(n.c, key, activeSpans)}</strong>;
      case "i":
        return <em key={key}>{renderNodes(n.c, key, activeSpans)}</em>;
      case "s":
        return <s key={key}>{renderNodes(n.c, key, activeSpans)}</s>;
    }
  });
}

function renderLines(text: string, keyPrefix: string, activeSpans: MentionSpan[] = []): React.ReactNode[] {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  lines.forEach((line, i) => {
    const key = `${keyPrefix}-l${i}`;
    const quote = line.match(/^> (.*)$/);
    if (quote) {
      out.push(
        <span
          key={key}
          className="block border-s-[3px] ps-2 my-0.5 opacity-80"
          style={{ borderColor: "currentColor" }}
        >
          {renderNodes(parseInline(quote[1]), key, activeSpans)}
        </span>
      );
      return; // block element already breaks the line
    }
    out.push(<React.Fragment key={key}>{renderNodes(parseInline(line), key, activeSpans)}</React.Fragment>);
    // Quote lines are block elements, so no explicit newline is needed before them
    if (i < lines.length - 1 && !/^> /.test(lines[i + 1])) out.push("\n");
  });
  return out;
}

const renderCache = new Map<string, React.ReactNode>();
const RENDER_CACHE_MAX = 600;

/** Render a WhatsApp-formatted message with optional styled @mention chips as React nodes. */
export function renderWhatsAppText(
  text: string,
  mentionOptions?: RenderWhatsAppMentionOptions
): React.ReactNode {
  if (!text) return text;

  const rawMentionSpans =
    text.includes("@") && mentionOptions ? extractMentionSpans(text, mentionOptions) : [];
  const { masked, activeSpans } =
    rawMentionSpans.length > 0 ? maskMentionSpans(text, rawMentionSpans) : { masked: text, activeSpans: [] };

  const hasMarkup = /[*_~`>]/.test(masked);
  if (!hasMarkup && activeSpans.length === 0) return text; // fast path: nothing to format

  if (activeSpans.length === 0) {
    const cached = renderCache.get(text);
    if (cached !== undefined) return cached;
  }

  const parts = masked.split(/```([\s\S]*?)```/g);
  const nodes: React.ReactNode[] = parts.map((part, i) =>
    i % 2 === 1 ? (
      <code
        key={`cb${i}`}
        className="block my-1 px-2 py-1 rounded bg-black/[0.07] dark:bg-white/10 font-mono text-[0.88em] whitespace-pre-wrap"
      >
        {part.replace(/^\n|\n$/g, "")}
      </code>
    ) : (
      <React.Fragment key={`p${i}`}>{renderLines(part, `p${i}`, activeSpans)}</React.Fragment>
    )
  );

  if (activeSpans.length === 0) {
    if (renderCache.size >= RENDER_CACHE_MAX) {
      const firstKey = renderCache.keys().next().value;
      if (firstKey !== undefined) renderCache.delete(firstKey);
    }
    renderCache.set(text, nodes);
  }
  return nodes;
}
