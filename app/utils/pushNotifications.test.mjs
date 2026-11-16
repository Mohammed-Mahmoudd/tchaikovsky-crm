import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PUSH_PREF_KEY,
  readPushOptInPreference,
  urlBase64ToUint8Array,
  writePushOptInPreference,
} from "./pushNotifications.ts";
import { clearAllCrmClientCaches } from "./crmCache.ts";

function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    key(index) {
      return Array.from(map.keys())[index] ?? null;
    },
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
    has(key) {
      return map.has(key);
    },
  };
}

describe("pushNotifications helpers", () => {
  it("defaults push opt-in to false until enabled and preserves preference across cache clears", () => {
    const localStorage = createMemoryStorage({ crm_conversations_cache_v3: "[]" });

    assert.equal(readPushOptInPreference(localStorage), false);

    writePushOptInPreference(true, localStorage);
    assert.equal(localStorage.getItem(PUSH_PREF_KEY), "true");
    assert.equal(readPushOptInPreference(localStorage), true);

    clearAllCrmClientCaches({
      localStorage,
      sessionStorage: createMemoryStorage(),
      deleteDatabase: () => {},
    });

    assert.equal(localStorage.has("crm_conversations_cache_v3"), false);
    assert.equal(readPushOptInPreference(localStorage), true);

    writePushOptInPreference(false, localStorage);
    assert.equal(readPushOptInPreference(localStorage), false);
  });

  it("decodes URL-safe base64 VAPID keys into Uint8Array", () => {
    // "Hello!" in URL-safe base64 without padding -> SGVsbG8h
    const bytes = urlBase64ToUint8Array("SGVsbG8h");
    assert.equal(bytes instanceof Uint8Array, true);
    assert.deepEqual(Array.from(bytes), [72, 101, 108, 108, 111, 33]);

    // URL-safe '-' and '_' handling
    const urlSafe = urlBase64ToUint8Array("-_-_");
    assert.equal(urlSafe.length, 3);
    assert.deepEqual(Array.from(urlSafe), [251, 255, 191]);
  });
});

