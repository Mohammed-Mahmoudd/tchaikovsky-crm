import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePromptSections,
  serializePromptSections,
  parseSectionLines,
  countSectionItems,
} from "./claudePromptSections.ts";

const SAMPLE_PROMPT = `You are Adham, from Tchaikovsky School of Music (since 2016).
Your one job: book a Free Discovery Session.

## Identity
- Name: Adham, from Tchaikovsky School.
- Arabic: أهلاً بك 🌷

## Hard Rules (Never Break)
1. Never quote a price before knowing age group + branch.
2. Call at 05:30 PM or check https://tchaikovskyschool.com for info.

## Knowledge Base
- Programs & Prices:
  * Young Learners (ages 6-7): 1,800 SAR/month.
  * Juniors (ages 8-14): 2,200 SAR/month.`;

test("parsePromptSections and serializePromptSections round-trip sections cleanly", () => {
  const sections = parsePromptSections(SAMPLE_PROMPT);
  assert.equal(sections.length, 4);
  assert.equal(sections[0].isIntro, true);
  assert.equal(sections[0].title, "Role & Objective");
  assert.equal(sections[1].title, "Identity");
  assert.equal(sections[2].title, "Hard Rules (Never Break)");
  assert.equal(sections[3].title, "Knowledge Base");

  const rebuilt = serializePromptSections(sections);
  assert.equal(rebuilt, SAMPLE_PROMPT);
});

test("parseSectionLines separates numbered rules, bullets, nested sub-items, and protects times/URLs", () => {
  const sections = parsePromptSections(SAMPLE_PROMPT);

  const rules = parseSectionLines(sections[2].body);
  assert.equal(rules.length, 2);
  assert.equal(rules[0].kind, "numbered");
  if (rules[0].kind === "numbered") {
    assert.equal(rules[0].index, "1");
    assert.equal(rules[0].text, "Never quote a price before knowing age group + branch.");
  }
  // Must NOT falsely split "05:30 PM" or "https://..." as label
  if (rules[1].kind === "numbered") {
    assert.equal(rules[1].label, undefined);
    assert.match(rules[1].text, /05:30 PM/);
  }

  const kb = parseSectionLines(sections[3].body);
  assert.equal(kb.length, 1);
  assert.equal(kb[0].kind, "bullet");
  if (kb[0].kind === "bullet") {
    assert.equal(kb[0].children.length, 2);
    assert.match(kb[0].children[0], /Young Learners/);
  }

  const idItems = parseSectionLines(sections[1].body);
  assert.equal(idItems[0].kind, "bullet");
  if (idItems[0].kind === "bullet") {
    assert.equal(idItems[0].label, "Name");
    assert.equal(idItems[0].text, "Adham, from Tchaikovsky School.");
  }

  assert.equal(countSectionItems(sections[2].body), 2);
});

