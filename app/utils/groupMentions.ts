export interface MessageMention {
  jid?: string;
  userId?: string;
  phone?: string;
  displayName: string;
  token?: string;
  isSelf?: boolean;
  isGroupMention?: boolean;
}

export interface GroupParticipant {
  jid: string;
  lid?: string | null;
  phoneNumber?: string;
  phone?: string | null;
  phoneDigits?: string | null;
  userId?: string;
  displayName?: string;
  name?: string;
  role?: 'superadmin' | 'admin' | 'member' | string | null;
  admin?: string | null;
  isSelf?: boolean;
}

export interface GroupMetaInfo {
  subject?: string;
  size?: number;
  desc?: string | null;
  creation?: number | null;
  fetchedAt?: number;
  participantsSyncedAt?: number | null;
  addressingMode?: string | null;
  announce?: boolean;
  restrict?: boolean;
  isMeAdmin?: boolean;
  isCommunityAnnounce?: boolean;
  memberAddMode?: string;
  avatarUrl?: string | null;
}

export interface GroupMemberProfileInfo {
  jid: string;
  userId: string;
  lid?: string | null;
  phone?: string | null;
  phoneDigits?: string | null;
  displayName: string;
  role?: 'superadmin' | 'admin' | 'member' | string;
  isSelf?: boolean;
  avatarUrl?: string | null;
  about?: string | null;
  aboutSetAt?: number | null;
  existingConversation?: {
    senderId: string;
    name: string;
    phone?: string | null;
    agent?: string;
    status?: string;
    pipeline?: string;
    branch?: string;
    labels?: string[];
    notes?: string;
    followUpDate?: string | null;
    followUpNote?: string;
    unreadCount?: number;
    isDone?: boolean;
    isArchived?: boolean;
    lastMessageAt?: number | null;
    lastMessageText?: string;
    lastMessageDirection?: 'incoming' | 'outgoing';
  } | null;
  source?: string;
}

export interface ComposerMentionItem {
  jid: string;
  userId?: string;
  phone?: string;
  displayName: string;
  token: string;
  isSelf?: boolean;
  isGroupMention?: boolean;
}

export interface MentionCandidate {
  kind: 'all' | 'member';
  key: string;
  jid: string;
  userId?: string;
  phone?: string;
  displayName: string;
  subtitle?: string;
  admin?: string | null;
  isSelf?: boolean;
}

export interface MentionTriggerMatch {
  query: string;
  startIndex: number;
  endIndex: number;
}

export interface MentionSpan {
  start: number;
  end: number;
  text: string;
  displayText?: string;
  kind: 'member' | 'all' | 'self';
  mention?: MessageMention;
}

const ALL_TOKEN_RE = /@(?:all|everyone|الكل|الجميع)(?=$|[\s.,!?:;،؛)\]}"'»])/gi;
const ALL_KEYWORDS = ['all', 'everyone', 'الكل', 'الجميع', 'group', 'every'];

function extractJidUser(jidOrId?: string | null): string {
  const s = String(jidOrId || '').trim();
  if (!s) return '';
  const atIdx = s.indexOf('@');
  const local = atIdx === -1 ? s : s.slice(0, atIdx);
  const colonIdx = local.indexOf(':');
  return colonIdx === -1 ? local : local.slice(0, colonIdx);
}

function normalizeDigits(val?: string | null): string {
  return String(val || '').replace(/\D/g, '');
}

function isBoundaryBefore(text: string, idx: number): boolean {
  if (idx <= 0) return true;
  return /[\s(\[{"'«]/.test(text[idx - 1]);
}

function isBoundaryAfter(text: string, idx: number): boolean {
  if (idx >= text.length) return true;
  return /[\s.,!?:;،؛)\]}"'»]/.test(text[idx]);
}

function isGroupAllMention(m: MessageMention): boolean {
  if (m.isGroupMention) return true;
  const tok = (m.token || '').trim().toLowerCase();
  const disp = (m.displayName || '').trim().toLowerCase();
  return tok === '@all' || tok === '@everyone' || tok === '@الكل' || tok === '@الجميع' || disp === 'all' || disp === 'everyone';
}

export function formatParticipantPhone(phoneOrDigits?: string | null): string {
  const clean = String(phoneOrDigits || '').trim();
  if (!clean) return '';
  if (clean.startsWith('+')) return clean;
  const digits = normalizeDigits(clean);
  return digits.length >= 7 && digits.length <= 15 ? `+${digits}` : '';
}

export function getParticipantRole(p?: GroupParticipant | null): 'superadmin' | 'admin' | null {
  if (!p) return null;
  const raw = String(p.role || p.admin || '').toLowerCase();
  if (raw === 'superadmin') return 'superadmin';
  if (raw === 'admin') return 'admin';
  return null;
}

export function getParticipantPhoneDigits(p?: Partial<GroupParticipant> | null): string {
  if (!p) return '';
  if (p.phoneDigits) {
    const clean = normalizeDigits(p.phoneDigits);
    if (clean.length >= 7 && clean.length <= 15) return clean;
  }
  const fromPhone = normalizeDigits(p.phone || p.phoneNumber);
  if (fromPhone.length >= 7 && fromPhone.length <= 15) return fromPhone;
  const userIdDigits = normalizeDigits(p.userId || extractJidUser(p.jid));
  // Legacy PN JIDs look like 201001234567@s.whatsapp.net; 14+ digit LIDs are not phone numbers
  if (p.jid && !p.jid.endsWith('@lid') && userIdDigits.length >= 7 && userIdDigits.length <= 13) {
    return userIdDigits;
  }
  return '';
}

export function getParticipantLabel(p: GroupParticipant): string {
  const rawName = (p.displayName || p.name || '').trim();
  if (rawName && !/^\+?\d{7,}$/.test(rawName)) {
    return rawName;
  }
  const phone = formatParticipantPhone(p.phone || p.phoneNumber || getParticipantPhoneDigits(p));
  if (phone) return phone;
  if (rawName) return rawName;
  const userId = p.userId || extractJidUser(p.jid);
  return userId ? `+${userId}` : 'Member';
}

/**
 * Filters & sorts WhatsApp group participants for the Group Info drawer (Admins/Owner first, then alphabetically).
 */
export function filterAndSortGroupParticipants(
  participants: GroupParticipant[] = [],
  query = ''
): GroupParticipant[] {
  const q = query.trim().toLowerCase();
  const qDigits = normalizeDigits(q);

  const filtered = participants.filter((p) => {
    if (!p || !p.jid) return false;
    if (!q) return true;
    const label = getParticipantLabel(p).toLowerCase();
    const phoneDigits = getParticipantPhoneDigits(p);
    const phoneStr = formatParticipantPhone(p.phone || p.phoneNumber || phoneDigits).toLowerCase();
    const userId = (p.userId || extractJidUser(p.jid)).toLowerCase();
    const role = getParticipantRole(p);
    const roleText = role === 'superadmin' ? 'owner superadmin admin' : role === 'admin' ? 'admin' : '';

    return (
      label.includes(q) ||
      phoneStr.includes(q) ||
      userId.includes(q) ||
      (qDigits.length > 0 && (phoneDigits.includes(qDigits) || normalizeDigits(userId).includes(qDigits))) ||
      (roleText && roleText.includes(q)) ||
      (p.isSelf && 'you self'.includes(q))
    );
  });

  return [...filtered].sort((a, b) => {
    const aRole = getParticipantRole(a);
    const bRole = getParticipantRole(b);
    const rank = (r: 'superadmin' | 'admin' | null) => (r === 'superadmin' ? 0 : r === 'admin' ? 1 : 2);
    const rDiff = rank(aRole) - rank(bRole);
    if (rDiff !== 0) return rDiff;
    if (Boolean(a.isSelf) !== Boolean(b.isSelf)) return a.isSelf ? -1 : 1;
    return getParticipantLabel(a).localeCompare(getParticipantLabel(b), undefined, { sensitivity: 'base' });
  });
}

/**
 * Matches a group participant against an existing 1-on-1 CRM conversation in the target inbox (0ms lookup).
 */
export function findExistingDmForParticipant<
  T extends {
    id: string;
    channel?: string;
    inbox?: string;
    isGroup?: boolean;
    phone?: string;
    formPhone?: string;
  }
>(
  conversations: T[] = [],
  participant: Partial<GroupParticipant> | null | undefined,
  inbox: 'operation' | 'admissions' = 'operation'
): T | null {
  if (!participant || !conversations.length) return null;
  const phoneDigits = getParticipantPhoneDigits(participant);
  const cleanLid = normalizeDigits(
    participant.lid || (participant.jid && participant.jid.endsWith('@lid') ? extractJidUser(participant.jid) : '')
  );
  const rawUser = normalizeDigits(participant.userId || extractJidUser(participant.jid));
  const prefix = inbox === 'operation' ? 'op_' : '';

  const candidateIds = new Set<string>();
  if (phoneDigits) candidateIds.add(`${prefix}${phoneDigits}`);
  if (cleanLid) candidateIds.add(`${prefix}${cleanLid}`);
  if (rawUser) candidateIds.add(`${prefix}${rawUser}`);

  for (let i = 0; i < conversations.length; i++) {
    const c = conversations[i];
    if (!c || c.isGroup || c.channel !== 'WA') continue;
    if (c.inbox && c.inbox !== inbox) continue;
    if (inbox === 'operation' && !c.id.startsWith('op_') && !c.inbox) continue;

    if (candidateIds.has(c.id)) return c;
    if (phoneDigits) {
      const cPhone = normalizeDigits(c.phone);
      const cFormPhone = normalizeDigits(c.formPhone);
      if ((cPhone && cPhone === phoneDigits) || (cFormPhone && cFormPhone === phoneDigits)) {
        return c;
      }
    }
  }
  return null;
}

/**
 * Detects an active `@query` trigger immediately before the textarea caret.
 * Avoids triggering mid-email (`a@b.com`), across newlines, or inside an already-completed mention + space.
 */
export function detectMentionTrigger(
  text: string,
  caret: number,
  existingMentions: ComposerMentionItem[] = []
): MentionTriggerMatch | null {
  if (!text) return null;
  const cursor = Math.max(0, Math.min(caret, text.length));
  if (cursor === 0) return null;

  // Scan backward up to 42 chars until whitespace-preceded `@` or line break
  const minScan = Math.max(0, cursor - 42);
  let atPos = -1;
  for (let i = cursor - 1; i >= minScan; i--) {
    const ch = text[i];
    if (ch === '\n' || ch === '\r') return null;
    if (ch === '@') {
      if (isBoundaryBefore(text, i)) {
        atPos = i;
      }
      break;
    }
  }

  if (atPos === -1) return null;
  const rawAfterAt = text.slice(atPos + 1, cursor);

  // Stop autocomplete once query holds more than 2 spaces (normal typing)
  const spaceCount = (rawAfterAt.match(/ /g) || []).length;
  if (spaceCount > 2) return null;

  // Do not re-open if user just inserted an existing mention and typed space/text after it
  const rawWithAt = text.slice(atPos, cursor);
  const lowerWithAt = rawWithAt.toLowerCase();
  if (
    existingMentions.some((m) => {
      const tok = (m.token || `@${m.displayName}`).toLowerCase();
      return lowerWithAt.startsWith(`${tok} `);
    })
  ) {
    return null;
  }
  if (/^@(?:all|everyone|الكل|الجميع)\s/i.test(rawWithAt)) {
    return null;
  }

  return {
    query: rawAfterAt,
    startIndex: atPos,
    endIndex: cursor,
  };
}

/**
 * Filters WhatsApp group participants for the composer `@` autocomplete list,
 * always pinning `@All` at index 0 when the query matches or is empty.
 */
export function filterMentionCandidates(
  participants: GroupParticipant[] = [],
  query: string,
  groupMeta?: GroupMetaInfo | null
): MentionCandidate[] {
  const q = query.trim().toLowerCase();
  const qDigits = normalizeDigits(q);
  const results: MentionCandidate[] = [];

  const nonSelfCount = participants.filter((p) => !p.isSelf).length;
  const memberCount = nonSelfCount > 0 ? nonSelfCount : Number(groupMeta?.size || participants.length || 0);

  if (!q || ALL_KEYWORDS.some((kw) => kw.includes(q))) {
    results.push({
      kind: 'all',
      key: '__all__',
      jid: 'all',
      displayName: 'All',
      subtitle: memberCount > 0 ? `Notify all ${memberCount} group members` : 'Notify everyone in group',
    });
  }

  const matched: MentionCandidate[] = [];
  for (let i = 0; i < participants.length; i++) {
    const p = participants[i];
    if (!p || !p.jid) continue;

    const label = getParticipantLabel(p);
    const phoneDigits = getParticipantPhoneDigits(p);
    const phoneDisplay = formatParticipantPhone(p.phone || p.phoneNumber || phoneDigits);
    const userId = p.userId || extractJidUser(p.jid);
    const normalizedRole = getParticipantRole(p);
    const nameMatch = label.toLowerCase().includes(q);
    const jidMatch = p.jid.toLowerCase().includes(q);
    const digitMatch =
      qDigits.length > 0 &&
      (normalizeDigits(phoneDisplay).includes(qDigits) || normalizeDigits(userId).includes(qDigits));

    if (!q || nameMatch || digitMatch || jidMatch) {
      const subtitleParts: string[] = [];
      if (phoneDisplay && phoneDisplay !== label) subtitleParts.push(phoneDisplay);
      if (normalizedRole === 'superadmin') subtitleParts.push('Owner');
      else if (normalizedRole === 'admin') subtitleParts.push('Admin');
      if (p.isSelf) subtitleParts.push('You');

      matched.push({
        kind: 'member',
        key: p.jid,
        jid: p.jid,
        userId,
        phone: phoneDisplay || undefined,
        displayName: label,
        subtitle: subtitleParts.join(' · ') || undefined,
        admin: normalizedRole,
        isSelf: Boolean(p.isSelf),
      });
    }
  }

  // Sort non-self members first, prioritizing prefix matches and admins, then self at bottom
  matched.sort((a, b) => {
    if (Boolean(a.isSelf) !== Boolean(b.isSelf)) return a.isSelf ? 1 : -1;
    if (q) {
      const aStarts = a.displayName.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.displayName.toLowerCase().startsWith(q) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
    }
    const aAdmin = a.admin ? 0 : 1;
    const bAdmin = b.admin ? 0 : 1;
    if (aAdmin !== bAdmin) return aAdmin - bAdmin;
    return a.displayName.localeCompare(b.displayName);
  });

  for (let i = 0; i < matched.length && results.length < 35; i++) {
    results.push(matched[i]);
  }

  return results;
}

/**
 * Prunes composer mentions whose `@token` is no longer in `text` (e.g. if deleted/edited by user)
 * and keeps `mentionAll` synchronized with `@all`/`@everyone` tokens unless explicitly set otherwise.
 */
export function reconcileComposerMentions(
  text: string,
  prevMentions: ComposerMentionItem[] = [],
  prevMentionAll = false
): { mentions: ComposerMentionItem[]; mentionAll: boolean } {
  const lowerText = text.toLowerCase();
  const kept: ComposerMentionItem[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < prevMentions.length; i++) {
    const m = prevMentions[i];
    if (!m || !m.jid) continue;
    const tok = (m.token || `@${m.displayName}`).trim();
    if (!tok) continue;
    if (lowerText.includes(tok.toLowerCase()) && !seen.has(m.jid)) {
      seen.add(m.jid);
      kept.push(m);
    }
  }

  ALL_TOKEN_RE.lastIndex = 0;
  const hasAllToken = ALL_TOKEN_RE.test(text);
  // Keep mentionAll if an @all/@everyone token exists; turn it off only if user removed it from text
  const mentionAll = hasAllToken ? true : prevMentionAll && lowerText.includes('@all');

  return { mentions: kept, mentionAll };
}

/**
 * Inserts a selected `@mention` or `@all` candidate into composer text, returning
 * updated text, caret offset, mentions array, and `mentionAll` flag.
 */
export function applyMentionSelection(
  text: string,
  trigger: MentionTriggerMatch,
  candidate: MentionCandidate,
  prevMentions: ComposerMentionItem[] = [],
  prevMentionAll = false
): {
  nextText: string;
  nextCaret: number;
  mentions: ComposerMentionItem[];
  mentionAll: boolean;
} {
  const before = text.slice(0, trigger.startIndex);
  const after = text.slice(trigger.endIndex);
  const hasTrailingSpace = after.length > 0 && /^\s/.test(after);

  if (candidate.kind === 'all') {
    const token = '@all';
    const insertion = hasTrailingSpace ? token : `${token} `;
    const nextText = `${before}${insertion}${after}`;
    const nextCaret = before.length + insertion.length;
    const reconciled = reconcileComposerMentions(nextText, prevMentions, true);
    return {
      nextText,
      nextCaret,
      mentions: reconciled.mentions,
      mentionAll: true,
    };
  }

  const cleanLabel = candidate.displayName.replace(/\s+/g, ' ').trim();
  const token = `@${cleanLabel}`;
  const insertion = hasTrailingSpace ? token : `${token} `;
  const nextText = `${before}${insertion}${after}`;
  const nextCaret = before.length + insertion.length;

  const newItem: ComposerMentionItem = {
    jid: candidate.jid,
    userId: candidate.userId,
    phone: candidate.phone,
    displayName: cleanLabel,
    token,
    isSelf: Boolean(candidate.isSelf),
    isGroupMention: false,
  };

  const merged = [...prevMentions.filter((m) => m.jid !== newItem.jid), newItem];
  const reconciled = reconcileComposerMentions(nextText, merged, prevMentionAll);

  return {
    nextText,
    nextCaret,
    mentions: reconciled.mentions,
    mentionAll: reconciled.mentionAll,
  };
}

/**
 * Resolves non-overlapping mention spans inside a text string for both message bubbles
 * and width-neutral live composer highlights.
 * Supports:
 * - Structured `mentions` (`@DisplayName`, `@phone`, `@userId`)
 * - `@all` / `@everyone` / `@الكل` / `@الجميع` when `mentionAll` is true (or in group chats)
 * - Unresolved `@<digits>` in legacy group messages when `participants` is supplied
 */
export function extractMentionSpans(
  text: string,
  opts?: {
    mentions?: MessageMention[];
    mentionAll?: boolean;
    participants?: GroupParticipant[];
    preserveTextLength?: boolean;
  }
): MentionSpan[] {
  if (!text || !text.includes('@')) return [];

  const mentions = Array.isArray(opts?.mentions) ? opts.mentions : [];
  const participants = Array.isArray(opts?.participants) ? opts.participants : [];
  const mentionAll = Boolean(opts?.mentionAll);
  const preserveTextLength = Boolean(opts?.preserveTextLength);

  // Quick index of group participants by userId / LID user / PN digits
  const participantByDigits = new Map<string, GroupParticipant>();
  for (let i = 0; i < participants.length; i++) {
    const p = participants[i];
    if (!p) continue;
    const keys = [
      extractJidUser(p.jid),
      extractJidUser(p.lid),
      normalizeDigits(p.phone || p.phoneNumber),
      p.userId || '',
    ].filter(Boolean);
    for (let k = 0; k < keys.length; k++) {
      participantByDigits.set(keys[k], p);
    }
  }

  interface TokenRule {
    needle: string;
    needleLower: string;
    kind: 'member' | 'all' | 'self';
    displayText?: string;
    mention?: MessageMention;
  }

  const rules: TokenRule[] = [];
  const seenNeedles = new Set<string>();

  const pushRule = (needle: string, kind: 'member' | 'all' | 'self', displayText?: string, mention?: MessageMention) => {
    if (!needle || !needle.startsWith('@') || needle.length < 2) return;
    const needleLower = needle.toLowerCase();
    if (seenNeedles.has(needleLower)) return;
    seenNeedles.add(needleLower);
    rules.push({ needle, needleLower, kind, displayText, mention });
  };

  for (let i = 0; i < mentions.length; i++) {
    const m = mentions[i];
    if (!m) continue;
    const kind: 'member' | 'all' | 'self' = isGroupAllMention(m) ? 'all' : m.isSelf ? 'self' : 'member';
    const userId = m.userId || extractJidUser(m.jid);
    const phoneDigits = normalizeDigits(m.phone);
    const matchedParticipant =
      (userId && participantByDigits.get(userId)) || (phoneDigits && participantByDigits.get(phoneDigits));
    const upgradedName = matchedParticipant ? getParticipantLabel(matchedParticipant) : m.displayName;
    const effectiveDisplay =
      !preserveTextLength && upgradedName && !/^\d{7,}$/.test(upgradedName) ? `@${upgradedName}` : undefined;

    if (m.token) pushRule(m.token, kind, undefined, m);
    if (m.displayName) pushRule(`@${m.displayName}`, kind, undefined, m);
    if (userId) pushRule(`@${userId}`, kind, effectiveDisplay, m);
    if (phoneDigits) pushRule(`@${phoneDigits}`, kind, effectiveDisplay, m);
  }

  // Sort explicit token rules longest-first so `@Ahmed Mohamed` matches before `@Ahmed`
  rules.sort((a, b) => b.needle.length - a.needle.length);

  const spans: MentionSpan[] = [];
  const lowerText = text.toLowerCase();
  const isUsed = (start: number, end: number) =>
    spans.some((s) => start < s.end && end > s.start);

  // 1. Explicit mention token matching
  for (let r = 0; r < rules.length; r++) {
    const rule = rules[r];
    let from = 0;
    while (from < lowerText.length) {
      const idx = lowerText.indexOf(rule.needleLower, from);
      if (idx === -1) break;
      const end = idx + rule.needle.length;
      if (
        isBoundaryBefore(text, idx) &&
        isBoundaryAfter(text, end) &&
        !isUsed(idx, end)
      ) {
        spans.push({
          start: idx,
          end,
          text: text.slice(idx, end),
          displayText: rule.displayText && !preserveTextLength ? rule.displayText : undefined,
          kind: rule.kind,
          mention: rule.mention,
        });
      }
      from = idx + 1;
    }
  }

  // 2. Group @all / @everyone / @الكل matching when mentionAll flag is set (or explicit @all in editor)
  if (mentionAll) {
    ALL_TOKEN_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ALL_TOKEN_RE.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (isBoundaryBefore(text, start) && !isUsed(start, end)) {
        spans.push({
          start,
          end,
          text: m[0],
          kind: 'all',
          mention: { displayName: 'All', token: m[0], isGroupMention: true },
        });
      }
    }
  }

  // 3. Fallback resolution of raw `@<digits>` from cached group participants (for legacy messages)
  if (participantByDigits.size > 0) {
    const rawDigitMentionRe = /@(\d{7,16})(?=$|[\s.,!?:;،؛)\]}"'»])/g;
    let m: RegExpExecArray | null;
    while ((m = rawDigitMentionRe.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (!isBoundaryBefore(text, start) || isUsed(start, end)) continue;
      const p = participantByDigits.get(m[1]);
      if (!p) continue;
      const label = getParticipantLabel(p);
      spans.push({
        start,
        end,
        text: m[0],
        displayText: !preserveTextLength ? `@${label}` : undefined,
        kind: p.isSelf ? 'self' : 'member',
        mention: {
          jid: p.jid,
          userId: p.userId || extractJidUser(p.jid),
          phone: formatParticipantPhone(p.phone || p.phoneNumber) || undefined,
          displayName: label,
          token: m[0],
          isSelf: Boolean(p.isSelf),
        },
      });
    }
  }

  spans.sort((a, b) => a.start - b.start);
  return spans;
}

