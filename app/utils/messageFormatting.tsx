import React from "react";

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

export interface EditResult {
  text: string;
  selStart: number;
  selEnd: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Editing helpers (used by the composer toolbar & keyboard shortcuts)
// ─────────────────────────────────────────────────────────────────────────────

/** Toggle an inline marker around the selection (WhatsApp rules: no spaces inside markers). */
export function toggleInlineMarker(text: string, start: number, end: number, marker: InlineMarker): EditResult {
  const m = marker;
  const ml = m.length;

  // No selection → insert an empty pair and put the caret in the middle
  if (start === end) {
    // Caret already sitting between an empty pair → remove it
    if (text.slice(start - ml, start) === m && text.slice(start, start + ml) === m) {
      return { text: text.slice(0, start - ml) + text.slice(start + ml), selStart: start - ml, selEnd: start - ml };
    }
    return { text: text.slice(0, start) + m + m + text.slice(end), selStart: start + ml, selEnd: start + ml };
  }

  // Shrink selection so markers hug non-space characters
  let s = start;
  let e = end;
  while (s < e && /\s/.test(text[s])) s++;
  while (e > s && /\s/.test(text[e - 1])) e--;
  if (s === e) return { text, selStart: start, selEnd: end };

  // Markers just outside the selection → unwrap
  if (text.slice(s - ml, s) === m && text.slice(e, e + ml) === m) {
    const next = text.slice(0, s - ml) + text.slice(s, e) + text.slice(e + ml);
    return { text: next, selStart: s - ml, selEnd: e - ml };
  }
  const selected = text.slice(s, e);
  // Markers included in the selection → unwrap
  if (selected.length > ml * 2 && selected.startsWith(m) && selected.endsWith(m)) {
    const inner = selected.slice(ml, -ml);
    return { text: text.slice(0, s) + inner + text.slice(e), selStart: s, selEnd: s + inner.length };
  }

  // Multi-line selection: WhatsApp markers don't span lines (except ```), so wrap each line
  if (m !== "```" && selected.includes("\n")) {
    const wrapped = selected
      .split("\n")
      .map((line) => {
        const lead = line.match(/^\s*/)?.[0] ?? "";
        const trail = line.match(/\s*$/)?.[0] ?? "";
        const core = line.trim();
        return core ? `${lead}${m}${core}${m}${trail}` : line;
      })
      .join("\n");
    return { text: text.slice(0, s) + wrapped + text.slice(e), selStart: s, selEnd: s + wrapped.length };
  }

  const next = text.slice(0, s) + m + selected + m + text.slice(e);
  return { text: next, selStart: s + ml, selEnd: e + ml };
}

const LINE_PREFIX_RE: Record<LinePrefix, RegExp> = {
  "- ": /^[-•*] /,
  "1. ": /^\d+\. /,
  "> ": /^> /,
};

/** Toggle a list / quote prefix on every line touched by the selection. */
export function toggleLinePrefix(text: string, start: number, end: number, prefix: LinePrefix): EditResult {
  const blockStart = text.lastIndexOf("\n", start - 1) + 1;
  let blockEnd = text.indexOf("\n", end > start && text[end - 1] === "\n" ? end - 1 : end);
  if (blockEnd === -1) blockEnd = text.length;

  const lines = text.slice(blockStart, blockEnd).split("\n");
  const re = LINE_PREFIX_RE[prefix];
  const contentLines = lines.filter((l) => l.trim());
  const allHave = contentLines.length > 0 && contentLines.every((l) => re.test(l));

  let counter = 0;
  const nextLines = lines.map((line) => {
    if (allHave) return line.replace(re, "");
    if (!line.trim() && lines.length > 1) return line;
    // Replace any other list/quote prefix so toggling between list types is clean
    const stripped = line.replace(/^([-•*] |\d+\. |> )/, "");
    counter++;
    return (prefix === "1. " ? `${counter}. ` : prefix) + stripped;
  });

  const block = nextLines.join("\n");
  const next = text.slice(0, blockStart) + block + text.slice(blockEnd);
  // Single empty line: caret at end of the new prefix; otherwise select the block
  if (lines.length === 1 && !lines[0].trim()) {
    const caret = blockStart + block.length;
    return { text: next, selStart: caret, selEnd: caret };
  }
  return start === end
    ? { text: next, selStart: blockStart + block.length, selEnd: blockStart + block.length }
    : { text: next, selStart: blockStart, selEnd: blockStart + block.length };
}

/**
 * Smart Enter inside lists: continue "- " / "2. " / "> " on the next line,
 * or end the list when Enter is pressed on an empty item. Returns null when not in a list.
 */
export function continueListOnNewline(text: string, caret: number): EditResult | null {
  const lineStart = text.lastIndexOf("\n", caret - 1) + 1;
  const line = text.slice(lineStart, caret);
  const match = line.match(/^([-•*] |(\d+)\. |> )/);
  if (!match) return null;

  // Empty item → remove the prefix and stop the list
  if (line.trim() === match[0].trim()) {
    const next = text.slice(0, lineStart) + text.slice(caret);
    return { text: next, selStart: lineStart, selEnd: lineStart };
  }
  const nextPrefix = match[2] ? `${parseInt(match[2], 10) + 1}. ` : match[1];
  const insert = "\n" + nextPrefix;
  const next = text.slice(0, caret) + insert + text.slice(caret);
  return { text: next, selStart: caret + insert.length, selEnd: caret + insert.length };
}

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

function renderNodes(nodes: Node[], keyPrefix: string): React.ReactNode[] {
  return nodes.map((n, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (n.t) {
      case "text":
        return <React.Fragment key={key}>{n.v}</React.Fragment>;
      case "code":
        return (
          <code key={key} className="px-1 py-[1px] rounded bg-black/[0.07] dark:bg-white/10 font-mono text-[0.9em]">
            {n.v}
          </code>
        );
      case "b":
        return <strong key={key} className="font-semibold">{renderNodes(n.c, key)}</strong>;
      case "i":
        return <em key={key}>{renderNodes(n.c, key)}</em>;
      case "s":
        return <s key={key}>{renderNodes(n.c, key)}</s>;
    }
  });
}

function renderLines(text: string, keyPrefix: string): React.ReactNode[] {
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
          {renderNodes(parseInline(quote[1]), key)}
        </span>
      );
      return; // block element already breaks the line
    }
    out.push(<React.Fragment key={key}>{renderNodes(parseInline(line), key)}</React.Fragment>);
    // Quote lines are block elements, so no explicit newline is needed before them
    if (i < lines.length - 1 && !/^> /.test(lines[i + 1])) out.push("\n");
  });
  return out;
}

const renderCache = new Map<string, React.ReactNode>();
const RENDER_CACHE_MAX = 600;

// ─────────────────────────────────────────────────────────────────────────────
// Live editor highlighting (mirror layer behind the composer textarea)
//
// Every character of the source text is preserved 1:1 (markers stay visible, dimmed)
// and only width-neutral styles are used, so the textarea caret stays perfectly aligned:
//   bold   → -webkit-text-stroke (faux bold, same advance widths)
//   italic → synthetic oblique (Geist ships no italic face → same widths)
//   strike → text-decoration     code → background tint (no padding)
// ─────────────────────────────────────────────────────────────────────────────

function editorInline(line: string, key: string, depth = 0): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let rest = line;
  let i = 0;
  while (rest) {
    const m = INLINE_RE.exec(rest);
    if (!m) {
      out.push(rest);
      break;
    }
    const before = rest.slice(0, m.index) + m[1];
    if (before) out.push(before);
    const k = `${key}-${i++}`;
    if (m[2] !== undefined) {
      out.push(
        <span key={k} className="wa-ed-code">
          <span className="wa-ed-mk">`</span>
          {m[2]}
          <span className="wa-ed-mk">`</span>
        </span>
      );
    } else {
      const cls = m[3] === "*" ? "wa-ed-b" : m[3] === "_" ? "wa-ed-i" : "wa-ed-s";
      out.push(
        <span key={k} className={cls}>
          <span className="wa-ed-mk">{m[3]}</span>
          {depth < 3 ? editorInline(m[4], k, depth + 1) : m[4]}
          <span className="wa-ed-mk">{m[3]}</span>
        </span>
      );
    }
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

function editorLines(text: string, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  text.split("\n").forEach((line, i) => {
    if (i > 0) out.push("\n");
    const k = `${key}-l${i}`;
    const prefix = line.match(/^(> |[-•*] |\d+\. )/);
    if (!prefix) {
      out.push(<React.Fragment key={k}>{editorInline(line, k)}</React.Fragment>);
      return;
    }
    const body = line.slice(prefix[0].length);
    const isQuote = prefix[0] === "> ";
    out.push(
      <span key={k} className={isQuote ? "wa-ed-quote" : undefined}>
        <span className="wa-ed-prefix">{prefix[0]}</span>
        {editorInline(body, k)}
      </span>
    );
  });
  return out;
}

/**
 * Render composer text with live WhatsApp formatting for the mirror layer.
 * Output text content is guaranteed identical to the input (caret alignment).
 */
export function renderEditorHighlight(text: string, formatting: boolean): React.ReactNode {
  // A trailing newline needs a glyph after it, otherwise the mirror is one line shorter
  const tail = text.endsWith("\n") ? "\u200b" : "";
  if (!formatting || !/[*_~`>\-•\d]/.test(text)) return text + tail;

  const parts = text.split(/(```[\s\S]+?```)/g);
  const nodes = parts.map((part, i) =>
    i % 2 === 1 ? (
      <span key={`cb${i}`} className="wa-ed-code">
        <span className="wa-ed-mk">```</span>
        {part.slice(3, -3)}
        <span className="wa-ed-mk">```</span>
      </span>
    ) : (
      <React.Fragment key={`p${i}`}>{editorLines(part, `p${i}`)}</React.Fragment>
    )
  );
  return tail ? [...nodes, tail] : nodes;
}

/** Render a WhatsApp-formatted message as React nodes (memoized per text). */
export function renderWhatsAppText(text: string): React.ReactNode {
  if (!text) return text;
  if (!/[*_~`>]/.test(text)) return text; // fast path: nothing to format
  const cached = renderCache.get(text);
  if (cached !== undefined) return cached;

  const parts = text.split(/```([\s\S]*?)```/g);
  const nodes: React.ReactNode[] = parts.map((part, i) =>
    i % 2 === 1 ? (
      <code
        key={`cb${i}`}
        className="block my-1 px-2 py-1 rounded bg-black/[0.07] dark:bg-white/10 font-mono text-[0.88em] whitespace-pre-wrap"
      >
        {part.replace(/^\n|\n$/g, "")}
      </code>
    ) : (
      <React.Fragment key={`p${i}`}>{renderLines(part, `p${i}`)}</React.Fragment>
    )
  );

  if (renderCache.size >= RENDER_CACHE_MAX) {
    const firstKey = renderCache.keys().next().value;
    if (firstKey !== undefined) renderCache.delete(firstKey);
  }
  renderCache.set(text, nodes);
  return nodes;
}
