import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildTeamMetricsApiUrls,
  clearTeamMetricsMemoryCache,
  readCachedTeamMetrics,
  TEAM_METRICS_CACHE_KEY,
  TEAM_METRICS_CACHE_MAX_AGE_MS,
  TEAM_METRICS_CACHE_MAX_ENTRIES,
  TEAM_METRICS_DIRECT_API_BASE,
  writeCachedTeamMetrics,
} from "./teamMetricsClient.ts";

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.get(key) ?? null;
    },
    setItem(key, value) {
      map.set(key, value);
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

function makePayload(replyCount) {
  return {
    period: { startMs: 0, endMs: 0 },
    fastReplyThresholdMs: 900_000,
    trackingStartedAt: 1000,
    team: {
      firstResponseAvgMs: 60_000,
      firstResponseMedianMs: 60_000,
      firstResponseMinMs: 60_000,
      firstResponseMaxMs: 60_000,
      firstResponseCount: 1,
      avgReplyMs: 60_000,
      medianReplyMs: 60_000,
      minReplyMs: 60_000,
      maxReplyMs: 60_000,
      replyTurnsCount: replyCount,
      fastReply15mCount: replyCount,
      fastReply15mPct: 100,
      currentlyWaitingCount: 0,
      oldestWaitingSinceMs: null,
      activeMs: 120_000,
      connectedMs: 120_000,
      onlineCount: 1,
      awayCount: 0,
    },
    agents: [],
  };
}

describe("teamMetricsClient", () => {
  it("prefers direct API host in production and /api proxy on localhost", () => {
    const prodUrls = buildTeamMetricsApiUrls("/team-metrics?startMs=0", "crm.tchaikovskyschool.com");
    assert.equal(prodUrls[0], `${TEAM_METRICS_DIRECT_API_BASE}/team-metrics?startMs=0`);
    assert.equal(prodUrls[1], "/api/team-metrics?startMs=0");

    const localUrls = buildTeamMetricsApiUrls("team-metrics", "localhost");
    assert.equal(localUrls[0], "/api/team-metrics");
    assert.equal(localUrls[1], `${TEAM_METRICS_DIRECT_API_BASE}/team-metrics`);
  });

  it("caches team metrics with bounded LRU eviction and TTL expiration", () => {
    clearTeamMetricsMemoryCache();
    const storage = createMemoryStorage();
    const now = 1_763_400_000_000;

    for (let i = 0; i < TEAM_METRICS_CACHE_MAX_ENTRIES + 3; i++) {
      writeCachedTeamMetrics(`u1:chairman:${i}`, makePayload(i + 1), { storage, now: now + i });
    }

    const storedRaw = storage.getItem(TEAM_METRICS_CACHE_KEY);
    assert.ok(storedRaw);
    const parsed = JSON.parse(storedRaw);
    assert.equal(parsed.length, TEAM_METRICS_CACHE_MAX_ENTRIES);

    clearTeamMetricsMemoryCache();
    assert.equal(readCachedTeamMetrics("u1:chairman:0", { storage, now: now + 1000 }), null);
    const newest = readCachedTeamMetrics(`u1:chairman:${TEAM_METRICS_CACHE_MAX_ENTRIES + 2}`, {
      storage,
      now: now + 1000,
    });
    assert.equal(newest?.team.replyTurnsCount, TEAM_METRICS_CACHE_MAX_ENTRIES + 3);

    const expired = readCachedTeamMetrics(`u1:chairman:${TEAM_METRICS_CACHE_MAX_ENTRIES + 2}`, {
      storage,
      now: now + TEAM_METRICS_CACHE_MAX_AGE_MS + 10_000,
    });
    assert.equal(expired, null);
  });
});
