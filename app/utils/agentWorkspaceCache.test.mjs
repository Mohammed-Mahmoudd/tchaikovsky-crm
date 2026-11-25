import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  AGENT_CACHE_KEYS,
  clearAgentWorkspaceMemoryCache,
  dedupeAgentRequest,
  isAgentCacheFresh,
  readAgentActivityCache,
  readAgentActivityQueryCache,
  readAgentLeadsCache,
  readAgentMemorySnapshot,
  readAgentSkillsCache,
  readAgentStatusCache,
  resolveAgentLeadsMode,
  resolveAgentRouteFromHash,
  resolveAgentStudioSection,
  writeAgentActivityCache,
  writeAgentActivityQueryCache,
  writeAgentLeadsCache,
  writeAgentSkillsCache,
  writeAgentStatusCache,
  invalidateAgentActivityQueryCache,
} from "./agentWorkspaceCache.ts";

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, value);
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

describe("agentWorkspaceCache", () => {
  beforeEach(() => {
    clearAgentWorkspaceMemoryCache(null);
  });

  it("maps legacy /settings#claude* hashes to consolidated /agent routes", () => {
    assert.equal(resolveAgentRouteFromHash("#claude"), "/agent");
    assert.equal(resolveAgentRouteFromHash("#claude-activity"), "/agent");
    assert.equal(resolveAgentRouteFromHash("#claude-skills"), "/agent/studio?section=skills");
    assert.equal(resolveAgentRouteFromHash("#claude-sandbox"), "/agent?sandbox=1");
    assert.equal(resolveAgentRouteFromHash("#claude-leads"), "/agent/leads");
    assert.equal(resolveAgentRouteFromHash("#claude-studio"), "/agent/studio");
    assert.equal(resolveAgentRouteFromHash(""), "/agent");
  });

  it("parses Studio section and Leads mode query params cleanly", () => {
    assert.equal(resolveAgentStudioSection("skills"), "skills");
    assert.equal(resolveAgentStudioSection("RULES"), "rules");
    assert.equal(resolveAgentStudioSection("branches"), "branches");
    assert.equal(resolveAgentStudioSection("unknown"), "playbook");
    assert.equal(resolveAgentStudioSection(null), "playbook");

    assert.equal(resolveAgentLeadsMode("assign"), "assign");
    assert.equal(resolveAgentLeadsMode("BROWSE"), "assign");
    assert.equal(resolveAgentLeadsMode("all"), "assign");
    assert.equal(resolveAgentLeadsMode("assigned"), "assigned");
    assert.equal(resolveAgentLeadsMode(undefined), "assigned");
  });

  it("deduplicates concurrent requests and cleans up after resolution or failure", async () => {
    let calls = 0;
    const loader = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 10));
      return { ok: true, count: calls };
    };

    const [a, b] = await Promise.all([
      dedupeAgentRequest("test:key", loader),
      dedupeAgentRequest("test:key", loader),
    ]);
    assert.equal(calls, 1);
    assert.deepEqual(a, { ok: true, count: 1 });
    assert.deepEqual(b, { ok: true, count: 1 });

    // After settlement, a subsequent call invokes loader again
    const c = await dedupeAgentRequest("test:key", loader);
    assert.equal(calls, 2);
    assert.equal(c.count, 2);

    // Errors also clear in-flight tracking so retries work
    let failCalls = 0;
    await assert.rejects(
      () =>
        dedupeAgentRequest("test:fail", async () => {
          failCalls += 1;
          throw new Error("boom");
        }),
      /boom/
    );
    const recovered = await dedupeAgentRequest("test:fail", async () => {
      failCalls += 1;
      return "ok";
    });
    assert.equal(failCalls, 2);
    assert.equal(recovered, "ok");
  });

  it("caches and restores status, leads, skills, and activity across memory and storage", () => {
    const storage = createMemoryStorage();
    const sampleStatus = {
      connection: {
        hasApiKey: true,
        hasAgentId: true,
        agentIdSource: "env",
        agentId: "ag_1",
        hasEnvironmentId: true,
        dryRun: false,
      },
      settings: {
        enabled: true,
        pauseOnHumanReply: true,
        allowAutoBooking: true,
        allowLeadUpdates: true,
        allowWhatsAppEscalation: true,
        escalationPhone: "",
        existingStudentLabelName: "Existing student",
        branches: [],
      },
      platformAgent: null,
      platformError: null,
      availableModels: [],
      playbookDefaults: { name: "Adham", model: "claude-sonnet-4-6", system: "prompt" },
    };

    assert.equal(isAgentCacheFresh(AGENT_CACHE_KEYS.status), false);
    writeAgentStatusCache(sampleStatus, storage);
    assert.equal(readAgentMemorySnapshot(AGENT_CACHE_KEYS.status)?.settings.enabled, true);
    assert.equal(isAgentCacheFresh(AGENT_CACHE_KEYS.status, 15_000), true);
    assert.equal(isAgentCacheFresh(AGENT_CACHE_KEYS.status, -1), false);

    // Simulate reload where memory cache is empty but localStorage has data
    clearAgentWorkspaceMemoryCache(null);
    assert.equal(readAgentMemorySnapshot(AGENT_CACHE_KEYS.status), null);
    assert.equal(readAgentStatusCache(60_000, storage)?.connection.agentId, "ag_1");

    writeAgentLeadsCache([{ senderId: "s1", channel: "WA", claudeEnabled: true, claudePaused: false }], storage);
    assert.equal(readAgentLeadsCache(60_000, storage)?.length, 1);

    writeAgentSkillsCache(
      [{ _id: "sk1", slug: "price", title: "Pricing", whenToUse: "price", instructions: "ask", enabled: true, usageCount: 3 }],
      storage
    );
    assert.equal(readAgentSkillsCache(60_000, storage)?.[0]?.title, "Pricing");

    writeAgentActivityCache(
      {
        items: [],
        summary: { total: 4, replied: 2, booked: 1, updated: 0, escalated: 1, silent: 0, error: 0 },
      },
      storage
    );
    assert.equal(readAgentActivityCache(60_000, storage)?.summary.total, 4);

    // Expiration check
    assert.equal(readAgentStatusCache(-1, storage), null);

    clearAgentWorkspaceMemoryCache(storage);
    assert.equal(readAgentStatusCache(60_000, storage), null);

    // Per-filter query cache stores, expires, and invalidates cleanly
    const qKey = "agent:activity:booked:24h:40:";
    const qPayload = {
      items: [],
      summary: { total: 2, replied: 1, booked: 1, updated: 0, escalated: 0, silent: 0, error: 0 },
    };
    writeAgentActivityQueryCache(qKey, qPayload, 10_000);
    assert.equal(readAgentActivityQueryCache(qKey, 15_000, 15_000)?.summary.booked, 1);
    assert.equal(readAgentActivityQueryCache(qKey, 15_000, 30_000), null);
    invalidateAgentActivityQueryCache();
    assert.equal(readAgentActivityQueryCache(qKey, 15_000, 15_000), null);
  });
});
