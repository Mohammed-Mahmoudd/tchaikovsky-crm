import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyLivePresenceToMetrics,
  buildAgentMetricsLookup,
  buildScreenTimeRows,
  filterAndSortResponseAuditRows,
  formatOnlineDuration,
  formatPresenceWithScreen,
  formatResponseDuration,
  getPresenceStatusMeta,
  getResponseSpeedTone,
  getScreenThemeMeta,
  pickHeadlineDurationMs,
} from "./agentMetrics.ts";

describe("agentMetrics", () => {
  it("formats response durations clearly across seconds, minutes, hours, and days", () => {
    assert.equal(formatResponseDuration(null), "—");
    assert.equal(formatResponseDuration(0), "0s");
    assert.equal(formatResponseDuration(400), "<1s");
    assert.equal(formatResponseDuration(42_000), "42s");
    assert.equal(formatResponseDuration(255_000), "4m 15s");
    assert.equal(formatResponseDuration(1_440_000), "24m");
    assert.equal(formatResponseDuration(8_100_000), "2h 15m");
    assert.equal(formatResponseDuration(100_800_000), "1d 4h");
  });

  it("formats cumulative online durations in hours and minutes without collapsing into days", () => {
    assert.equal(formatOnlineDuration(null), "—");
    assert.equal(formatOnlineDuration(0), "0m");
    assert.equal(formatOnlineDuration(25_000), "<1m");
    assert.equal(formatOnlineDuration(42 * 60_000), "42m");
    assert.equal(formatOnlineDuration((34 * 60 + 20) * 60_000), "34h 20m");
  });

  it("maps status and speed tones to CSS theme tokens", () => {
    assert.equal(getPresenceStatusMeta("online").label, "Online");
    assert.match(getPresenceStatusMeta("online").dotVar, /^var\(--label-green-/);
    assert.equal(getPresenceStatusMeta("away").label, "Away");
    assert.equal(getPresenceStatusMeta("offline").label, "Offline");

    assert.equal(getResponseSpeedTone(120_000).label, "Fast");
    assert.equal(getResponseSpeedTone(600_000).label, "On target");
    assert.equal(getResponseSpeedTone(1_800_000).label, "Moderate");
    assert.equal(getResponseSpeedTone(7_200_000).label, "Slow");
    assert.equal(getResponseSpeedTone(null).label, "No replies");

    assert.equal(pickHeadlineDurationMs(153_000, 8_760_000), 153_000);
    assert.equal(pickHeadlineDurationMs(null, 8_760_000), 8_760_000);
    assert.equal(pickHeadlineDurationMs(null, null), null);
  });

  it("applies live presence updates and sorts response audit rows", () => {
    const payload = {
      period: { startMs: 0, endMs: 0 },
      fastReplyThresholdMs: 900_000,
      trackingStartedAt: 1000,
      team: {
        firstResponseAvgMs: 120_000,
        firstResponseMedianMs: 120_000,
        firstResponseMinMs: 120_000,
        firstResponseMaxMs: 120_000,
        firstResponseCount: 1,
        avgReplyMs: 120_000,
        medianReplyMs: 120_000,
        minReplyMs: 120_000,
        maxReplyMs: 120_000,
        replyTurnsCount: 1,
        fastReply15mCount: 1,
        fastReply15mPct: 100,
        currentlyWaitingCount: 0,
        oldestWaitingSinceMs: null,
        activeMs: 60_000,
        connectedMs: 60_000,
        onlineCount: 0,
        awayCount: 0,
      },
      agents: [
        {
          userId: "u1",
          name: "Mariam",
          role: "admission_officer",
          email: "m@test.com",
          avatar: "",
          isActiveAccount: true,
          status: "offline",
          lastSeenAt: 1000,
          lastActiveAt: 1000,
          firstSeenAt: 1000,
          activeMs: 60_000,
          connectedMs: 60_000,
          daysActiveCount: 1,
          firstResponseAvgMs: 120_000,
          firstResponseMedianMs: 120_000,
          firstResponseMinMs: 120_000,
          firstResponseMaxMs: 120_000,
          firstResponseCount: 1,
          avgReplyMs: 120_000,
          medianReplyMs: 120_000,
          minReplyMs: 120_000,
          maxReplyMs: 120_000,
          replyTurnsCount: 1,
          fastReply15mCount: 1,
          fastReply15mPct: 100,
          currentlyWaitingCount: 0,
          oldestWaitingSinceMs: null,
        },
      ],
    };

    const liveMap = new Map([
      [
        "u1",
        {
          userId: "u1",
          status: "online",
          currentScreen: "pipeline",
          currentScreenLabel: "Pipeline",
          currentScreenPath: "/pipeline",
          activeScreens: [{ screen: "pipeline", label: "Pipeline", path: "/pipeline" }],
          lastSeenAt: 5000,
          lastActiveAt: 5000,
        },
      ],
    ]);

    const updated = applyLivePresenceToMetrics(payload, liveMap);
    assert.equal(updated?.team.onlineCount, 1);
    assert.equal(updated?.agents[0].status, "online");
    assert.equal(updated?.agents[0].currentScreenLabel, "Pipeline");
    assert.equal(formatPresenceWithScreen("online", "Pipeline"), "Online · Pipeline");
    assert.equal(formatPresenceWithScreen("offline", "Pipeline"), "Offline");

    const screenRows = buildScreenTimeRows(
      [
        { screen: "pipeline", label: "Pipeline", path: "/pipeline", activeMs: 30_000, lastSeenAt: 5000 },
        { screen: "inbox", label: "Inbox", path: "/", activeMs: 90_000, lastSeenAt: 4000 },
      ],
      120_000
    );
    assert.equal(screenRows[0].screen, "inbox");
    assert.equal(screenRows[0].sharePct, 75);
    assert.equal(screenRows[1].sharePct, 25);
    assert.match(getScreenThemeMeta("inbox").dotVar, /^var\(--label-blue-/);

    const lookup = buildAgentMetricsLookup(updated?.agents);
    assert.equal(lookup.byNameLower.get("mariam")?.userId, "u1");

    const sortedSlowest = filterAndSortResponseAuditRows(
      [
        {
          conversationId: "1",
          leadName: "Alpha",
          channel: "WA",
          assignedAgent: "Mariam",
          agentName: "Mariam",
          attributionSource: "senderName",
          incomingAt: 1000,
          repliedAt: 2000,
          responseMs: 1000,
          isFirstResponse: true,
        },
        {
          conversationId: "2",
          leadName: "Beta",
          channel: "IG",
          assignedAgent: "Mariam",
          agentName: "Mariam",
          attributionSource: "senderName",
          incomingAt: 1000,
          repliedAt: 50_000,
          responseMs: 49_000,
          isFirstResponse: false,
        },
      ],
      { sortBy: "slowest" }
    );
    assert.equal(sortedSlowest[0].leadName, "Beta");
  });
});
