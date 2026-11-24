import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clearAllCrmClientCaches, CRM_IDB_NAME } from "./crmCache.ts";

function createMemoryStorage(initialEntries) {
  const map = new Map(Object.entries(initialEntries));
  return {
    get length() {
      return map.size;
    },
    key(index) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key) {
      map.delete(key);
    },
    has(key) {
      return map.has(key);
    },
  };
}

describe("clearAllCrmClientCaches", () => {
  it("clears all CRM caches and cash overrides while preserving theme preferences", () => {
    const localStorage = createMemoryStorage({
      crm_conversations_cache_v3: "[]",
      crm_conversations_cache_v2: "[]",
      crm_conversations_cache: "[]",
      crm_manual_leads_v1: "{}",
      crm_branches_cache: "[]",
      crm_labels_cache_v1: "[]",
      tchaikovsky_quick_replies_v1: "[]",
      crm_team_metrics_cache_v1: "[]",
      crm_agent_status_v1: "{}",
      crm_cash_lead_123: "500",
      "tchaikovsky-theme": "dark",
    });

    const sessionStorage = createMemoryStorage({
      tchaikovsky_dismiss_avatar_modal: "true",
      crm_team_audit_nav_snapshot: "{}",
      unrelated_key: "keep",
    });

    const deletedDatabases = [];

    clearAllCrmClientCaches({
      localStorage,
      sessionStorage,
      deleteDatabase: (name) => {
        deletedDatabases.push(name);
      },
    });

    assert.equal(localStorage.has("crm_conversations_cache_v3"), false);
    assert.equal(localStorage.has("crm_conversations_cache_v2"), false);
    assert.equal(localStorage.has("crm_conversations_cache"), false);
    assert.equal(localStorage.has("crm_manual_leads_v1"), false);
    assert.equal(localStorage.has("crm_branches_cache"), false);
    assert.equal(localStorage.has("crm_labels_cache_v1"), false);
    assert.equal(localStorage.has("tchaikovsky_quick_replies_v1"), false);
    assert.equal(localStorage.has("crm_team_metrics_cache_v1"), false);
    assert.equal(localStorage.has("crm_agent_status_v1"), false);
    assert.equal(localStorage.has("crm_cash_lead_123"), false);
    assert.equal(localStorage.has("tchaikovsky-theme"), true);

    assert.equal(sessionStorage.has("tchaikovsky_dismiss_avatar_modal"), false);
    assert.equal(sessionStorage.has("crm_team_audit_nav_snapshot"), false);
    assert.equal(sessionStorage.has("unrelated_key"), true);

    assert.deepEqual(deletedDatabases, [CRM_IDB_NAME]);
  });
});

