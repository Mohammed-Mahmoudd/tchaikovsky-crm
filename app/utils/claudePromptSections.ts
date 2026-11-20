export interface PromptSection {
  id: string;
  title: string;
  isIntro: boolean;
  body: string;
}

export type PromptBlockItem =
  | {
      kind: "numbered";
      index: string;
      label?: string;
      text: string;
      children: string[];
    }
  | {
      kind: "bullet";
      label?: string;
      text: string;
      children: string[];
    }
  | {
      kind: "paragraph";
      label?: string;
      text: string;
    };

/** Splits a label prefix like "First intro: ..." while ignoring URLs and clock times. */
function splitLabelPrefix(rawText: string): { label?: string; text: string } {
  const clean = rawText.trim();
  const match = clean.match(/^([^:\n]{2,52}):\s+(.+)$/);
  if (!match) {
    return { text: clean };
  }
  const candidate = match[1].trim();
  const rest = match[2].trim();
  if (!rest || /^(https?|mailto|tel)$/i.test(candidate)) {
    return { text: clean };
  }
  return { label: candidate, text: rest };
}

function makeSectionId(title: string, idx: number, isIntro: boolean): string {
  if (isIntro) return "sec-intro";
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return `sec-${idx}-${slug || "section"}`;
}

/**
 * Parses a markdown-headed system prompt (`## Section`) into structured sections
 * so the UI can display clean cards while preserving round-trip fidelity.
 */
export function parsePromptSections(rawPrompt: string): PromptSection[] {
  const normalized = String(rawPrompt || "").replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const sections: PromptSection[] = [];

  let currentTitle = "Role & Objective";
  let currentIsIntro = true;
  let buffer: string[] = [];
  let inFence = false;

  const flush = () => {
    const body = buffer.join("\n").trim();
    if (currentIsIntro && !body && sections.length === 0) {
      // Keep intro only when non-empty or when there are no ## sections at all
      return;
    }
    sections.push({
      id: makeSectionId(currentTitle, sections.length, currentIsIntro),
      title: currentTitle,
      isIntro: currentIsIntro,
      body,
    });
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      inFence = !inFence;
      buffer.push(line);
      continue;
    }
    const headingMatch = !inFence ? line.match(/^##\s+(.+?)\s*$/) : null;
    if (headingMatch) {
      flush();
      currentTitle = headingMatch[1].trim();
      currentIsIntro = false;
      buffer = [];
    } else {
      buffer.push(line);
    }
  }

  flush();

  if (sections.length === 0) {
    return [
      {
        id: "sec-intro",
        title: "Role & Objective",
        isIntro: true,
        body: normalized.trim(),
      },
    ];
  }

  return sections;
}

/**
 * Serializes structured prompt sections back into the exact markdown format
 * expected by `ADHAM_PLAYBOOK_SYSTEM_PROMPT` and `platform.claude.com`.
 */
export function serializePromptSections(sections: ReadonlyArray<PromptSection>): string {
  const chunks: string[] = [];
  for (const sec of sections) {
    const cleanBody = String(sec.body || "").trim();
    const cleanTitle = String(sec.title || "").trim();
    if (sec.isIntro) {
      if (cleanBody) chunks.push(cleanBody);
      continue;
    }
    if (!cleanTitle) continue;
    chunks.push(cleanBody ? `## ${cleanTitle}\n${cleanBody}` : `## ${cleanTitle}`);
  }
  return chunks.join("\n\n");
}

/**
 * Parses a section body into numbered rules, bullet points (with indented sub-items),
 * and readable paragraphs for clean visual rendering.
 */
export function parseSectionLines(body: string): PromptBlockItem[] {
  const lines = String(body || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: PromptBlockItem[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const leadingSpaces = rawLine.length - rawLine.trimStart().length;
    const numMatch = leadingSpaces <= 1 ? trimmed.match(/^(\d+)[.)]\s+(.+)$/) : null;
    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);

    if (numMatch) {
      const parsed = splitLabelPrefix(numMatch[2]);
      blocks.push({
        kind: "numbered",
        index: numMatch[1],
        label: parsed.label,
        text: parsed.text,
        children: [],
      });
      continue;
    }

    if (bulletMatch) {
      const prev = blocks[blocks.length - 1];
      if (leadingSpaces >= 2 && prev && (prev.kind === "numbered" || prev.kind === "bullet")) {
        prev.children.push(bulletMatch[1].trim());
        continue;
      }
      const parsed = splitLabelPrefix(bulletMatch[1]);
      blocks.push({
        kind: "bullet",
        label: parsed.label,
        text: parsed.text,
        children: [],
      });
      continue;
    }

    const parsed = splitLabelPrefix(trimmed);
    blocks.push({
      kind: "paragraph",
      label: parsed.label,
      text: parsed.text,
    });
  }

  return blocks;
}

/** Counts readable items inside a prompt section for compact card headers. */
export function countSectionItems(body: string): number {
  return parseSectionLines(body).length;
}
