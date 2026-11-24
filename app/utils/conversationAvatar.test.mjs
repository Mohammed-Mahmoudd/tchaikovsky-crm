import test from 'node:test';
import assert from 'node:assert/strict';
import {
  drainAvatarBatch,
  getChatAvatarInitials,
  getConversationAvatarUrl,
  isValidAvatarUrl,
} from './conversationAvatar.ts';

test('isValidAvatarUrl accepts http/https URLs and rejects empty or data URIs', () => {
  assert.equal(isValidAvatarUrl('https://pps.whatsapp.net/abc.jpg'), true);
  assert.equal(isValidAvatarUrl('  http://example.com/a.png '), true);
  assert.equal(isValidAvatarUrl('data:image/png;base64,AAA'), false);
  assert.equal(isValidAvatarUrl(''), false);
  assert.equal(isValidAvatarUrl(null), false);
});

test('getConversationAvatarUrl resolves 1-to-1 profilePic and WA group avatarUrl cleanly', () => {
  assert.equal(
    getConversationAvatarUrl({
      id: 'c1',
      channel: 'WA',
      isGroup: false,
      profilePic: 'https://pps.whatsapp.net/user.jpg',
    }),
    'https://pps.whatsapp.net/user.jpg'
  );
  assert.equal(
    getConversationAvatarUrl({
      id: 'op_grp_1',
      channel: 'WA',
      isGroup: true,
      profilePic: 'https://ignored.example.com/x.jpg',
      groupMeta: { avatarUrl: 'https://pps.whatsapp.net/grp.jpg' },
    }),
    'https://pps.whatsapp.net/grp.jpg'
  );
  assert.equal(getConversationAvatarUrl({ id: 'c2', channel: 'IG', profilePic: null }), null);
});

test('getChatAvatarInitials extracts initials for names and returns empty for phone numbers or placeholders', () => {
  assert.equal(getChatAvatarInitials('Muhammad Ali'), 'MA');
  assert.equal(getChatAvatarInitials('meizar12'), 'ME');
  assert.equal(getChatAvatarInitials('+966532789029'), '');
  assert.equal(getChatAvatarInitials('Instagram User'), '');
  assert.equal(getChatAvatarInitials('Live FB'), '');
  assert.equal(getChatAvatarInitials('سارة أحمد'), 'سأ');
});

test('drainAvatarBatch prioritizes force-refresh IDs and caps batch size', () => {
  const normalQueue = new Set(['n1', 'n2', 'n3', 'f1']);
  const forceQueue = new Set(['f1', 'f2']);

  const first = drainAvatarBatch({ normalQueue, forceQueue, maxBatchSize: 3 });
  assert.deepEqual(first, {
    ids: ['f1', 'f2', 'n1'],
    forceIds: ['f1', 'f2'],
  });
  assert.deepEqual(Array.from(normalQueue), ['n2', 'n3']);
  assert.deepEqual(Array.from(forceQueue), []);
});

