import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectMentionTrigger,
  filterMentionCandidates,
  applyMentionSelection,
  reconcileComposerMentions,
  extractMentionSpans,
  filterAndSortGroupParticipants,
  findExistingDmForParticipant,
  getParticipantRole,
} from './groupMentions.ts';

describe('groupMentions', () => {
  const participants = [
    {
      jid: '201001112233@s.whatsapp.net',
      phone: '+201001112233',
      userId: '201001112233',
      displayName: 'Ahmed Mohamed',
      admin: 'admin',
      isSelf: false,
    },
    {
      jid: '201009998877@s.whatsapp.net',
      phone: '+201009998877',
      userId: '201009998877',
      displayName: 'Ahmed',
      admin: null,
      isSelf: false,
    },
    {
      jid: '231667028632018@lid',
      lid: '231667028632018@lid',
      phone: '+201255667788',
      userId: '231667028632018',
      displayName: 'Tchaikovsky Operation',
      admin: 'superadmin',
      isSelf: true,
    },
  ];

  it('detects @ trigger cleanly and ignores email addresses or completed mentions', () => {
    assert.deepEqual(detectMentionTrigger('Hello @ahm', 10), {
      query: 'ahm',
      startIndex: 6,
      endIndex: 10,
    });

    assert.equal(detectMentionTrigger('mail user@example.com', 21), null);

    assert.equal(
      detectMentionTrigger('Hello @Ahmed Mohamed ', 21, [
        { jid: '201001112233@s.whatsapp.net', displayName: 'Ahmed Mohamed', token: '@Ahmed Mohamed' },
      ]),
      null
    );

    assert.deepEqual(detectMentionTrigger('مرحبا @Ahm', 10), {
      query: 'Ahm',
      startIndex: 6,
      endIndex: 10,
    });
  });

  it('filters participants by name or digits and pins @All when matching', () => {
    const emptyQuery = filterMentionCandidates(participants, '', { size: 3 });
    assert.equal(emptyQuery[0].kind, 'all');
    assert.equal(emptyQuery[1].displayName, 'Ahmed Mohamed');

    const digitQuery = filterMentionCandidates(participants, '2233', { size: 3 });
    assert.equal(digitQuery.length, 1);
    assert.equal(digitQuery[0].displayName, 'Ahmed Mohamed');

    const allQuery = filterMentionCandidates(participants, 'all', { size: 3 });
    assert.equal(allQuery[0].kind, 'all');
  });

  it('applies mention selection and reconciles edited composer text', () => {
    const trigger = detectMentionTrigger('Hi @ahm', 7);
    assert.ok(trigger);
    const candidates = filterMentionCandidates(participants, trigger.query);
    const ahmed = candidates.find((c) => c.displayName === 'Ahmed Mohamed');
    assert.ok(ahmed);

    const applied = applyMentionSelection('Hi @ahm', trigger, ahmed, [], false);
    assert.equal(applied.nextText, 'Hi @Ahmed Mohamed ');
    assert.equal(applied.mentions.length, 1);
    assert.equal(applied.mentionAll, false);

    // Selecting @All sets mentionAll and inserts @all
    const allTrigger = detectMentionTrigger(`${applied.nextText}@al`, applied.nextText.length + 3, applied.mentions);
    assert.ok(allTrigger);
    const allCand = filterMentionCandidates(participants, allTrigger.query)[0];
    const withAll = applyMentionSelection(`${applied.nextText}@al`, allTrigger, allCand, applied.mentions, false);
    assert.equal(withAll.nextText, 'Hi @Ahmed Mohamed @all ');
    assert.equal(withAll.mentionAll, true);
    assert.equal(withAll.mentions.length, 1);

    // Deleting @Ahmed Mohamed drops it cleanly while preserving @all
    const pruned = reconcileComposerMentions('Hi @all', withAll.mentions, withAll.mentionAll);
    assert.equal(pruned.mentions.length, 0);
    assert.equal(pruned.mentionAll, true);
  });

  it('extracts longest-first non-overlapping spans and resolves legacy raw digit @mentions', () => {
    const spans = extractMentionSpans('Hey @Ahmed Mohamed and @Ahmed, plus @all and @231667028632018!', {
      mentions: [
        { jid: '201001112233@s.whatsapp.net', displayName: 'Ahmed Mohamed', token: '@Ahmed Mohamed' },
        { jid: '201009998877@s.whatsapp.net', displayName: 'Ahmed', token: '@Ahmed' },
      ],
      mentionAll: true,
      participants,
    });

    assert.equal(spans.length, 4);
    assert.equal(spans[0].text, '@Ahmed Mohamed');
    assert.equal(spans[0].kind, 'member');
    assert.equal(spans[1].text, '@Ahmed');
    assert.equal(spans[2].text, '@all');
    assert.equal(spans[2].kind, 'all');
    assert.equal(spans[3].text, '@231667028632018');
    assert.equal(spans[3].displayText, '@Tchaikovsky Operation');
    assert.equal(spans[3].kind, 'self');

    // Editor mirror mode must preserve exact source length (no displayText expansion)
    const mirrorSpans = extractMentionSpans('Ping @231667028632018', { participants, preserveTextLength: true });
    assert.equal(mirrorSpans.length, 1);
    assert.equal(mirrorSpans[0].displayText, undefined);
  });

  it('sorts and filters Group Info participants by role and matches existing Operation DMs in 0ms', () => {
    const mixed = [
      { jid: '201003334444@s.whatsapp.net', userId: '201003334444', phone: '+201003334444', phoneDigits: '201003334444', displayName: 'Ziad', role: 'member' },
      { jid: '184729103847123@lid', userId: '184729103847123', lid: '184729103847123', phone: '+201001112233', phoneDigits: '201001112233', displayName: 'Mona', role: 'admin' },
      { jid: '201005556666@s.whatsapp.net', userId: '201005556666', phone: '+201005556666', phoneDigits: '201005556666', displayName: 'School Owner', role: 'superadmin' },
    ];

    assert.equal(getParticipantRole(mixed[1]), 'admin');
    const sorted = filterAndSortGroupParticipants(mixed, '');
    assert.deepEqual(
      sorted.map((p) => p.displayName),
      ['School Owner', 'Mona', 'Ziad']
    );

    assert.equal(filterAndSortGroupParticipants(mixed, 'admin').length, 2);
    assert.equal(filterAndSortGroupParticipants(mixed, '2233')[0].displayName, 'Mona');

    const inboxConvs = [
      { id: 'op_grp_1203630123', channel: 'WA', inbox: 'operation', isGroup: true },
      { id: '201001112233', channel: 'WA', inbox: 'admissions', isGroup: false, phone: '+201001112233' },
      { id: 'op_201001112233', channel: 'WA', inbox: 'operation', isGroup: false, phone: '+201001112233' },
    ];
    const match = findExistingDmForParticipant(inboxConvs, mixed[1], 'operation');
    assert.equal(match?.id, 'op_201001112233');
    assert.equal(findExistingDmForParticipant(inboxConvs, mixed[0], 'operation'), null);
  });
});
