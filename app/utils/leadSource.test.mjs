import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatLeadSource,
  simplifyMetaLabel,
  buildCampaignFilterList,
  getSelectedCampaignLabel,
} from "./leadSource.ts";

describe("formatLeadSource", () => {
  it("simplifies repetitive Meta boilerplate while preserving Campaign - Ad set - Ad", () => {
    const res = formatLeadSource({
      adId: "120248950450160225",
      campaign: "TCH | SAU | MSG | ADULT | NOV26 v3",
      adset: "RY ADULT | NOV26 v3",
      ad: "RY ADULT - adult reel | NOV26 v3",
    });

    assert.equal(
      res.display,
      "TCH | SAU | MSG | ADULT | NOV26 v3 - RY ADULT | NOV26 v3 - RY ADULT - adult reel | NOV26 v3"
    );
    assert.equal(res.shortDisplay, "ADULT | NOV26 v3 - RY ADULT - adult reel");
    assert.equal(res.isUnresolvedId, false);
  });

  it("handles long ABO campaign names and minor stem typos cleanly", () => {
    const res = formatLeadSource({
      adId: "120248095914770225",
      campaign: "TCH SAU - ABO - MSG IG+MSGR+WA - 3 BRANCHES - V4",
      adset: "TCH KHB DLY - ADV+ PL - ABO - ALL BROAF TOF NO T - – Copy",
      ad: "TCH KHB DLY - ADV+ PL - ABO - ALL BROAD TOF NO T - 1 AD RL",
    });

    assert.equal(
      res.shortDisplay,
      "3 BRANCHES - V4 - KHB - ALL BROAF TOF NO T – Copy - 1 AD RL"
    );

    const mix = formatLeadSource({
      adId: "120248095914850225",
      campaign: "TCH SAU - ABO - MSG IG+MSGR+WA - 3 BRANCHES - V4",
      adset: "TCH RY DLY - ADV+ PL - ABO - ALL 25 64 MI STCK SVD - MIX TOF – Copy",
      ad: "TCH RY DLY - ADV+ PL - ABO - ALL 25 64 MI STCK SVD - MIX TOF 1 AD RL",
    });

    assert.equal(
      mix.shortDisplay,
      "3 BRANCHES - V4 - RY - ALL 25 64 MI STCK SVD - MIX TOF – Copy - 1 AD RL"
    );
  });

  it("keeps standard campaign names unchanged when they do not use boilerplate prefixes", () => {
    assert.equal(simplifyMetaLabel("Summer Piano Campaign"), "Summer Piano Campaign");
    const custom = formatLeadSource({
      adId: "123456",
      campaign: "Summer Piano",
      adset: "Riyadh Parents",
      ad: "Trial Video",
    });
    assert.equal(custom.shortDisplay, "Summer Piano - Riyadh Parents - Trial Video");
  });

  it("keeps direct and generic lead form sources concise without placeholder suffixes", () => {
    assert.equal(formatLeadSource("direct").shortDisplay, "Direct");
    assert.equal(formatLeadSource(undefined).shortDisplay, "Direct");
    assert.equal(formatLeadSource({ campaign: "Organic / Direct" }).shortDisplay, "Organic / Direct");
    assert.equal(
      formatLeadSource({
        campaign: "Facebook Lead Form",
        adset: "Facebook",
        ad: "Lead Form → WhatsApp",
      }).shortDisplay,
      "Facebook Lead Form"
    );
    assert.equal(
      formatLeadSource({
        campaign: "Instagram Lead Form",
        adset: "Instagram",
        ad: "Lead Form → WhatsApp",
      }).shortDisplay,
      "Instagram Lead Form"
    );
  });

  it("includes referrer detail on manual leads when provided, otherwise keeps referral type", () => {
    assert.equal(
      formatLeadSource({
        campaign: "Student Referral",
        adset: "Manual Lead",
        ad: "WhatsApp Manual Lead",
      }).shortDisplay,
      "Student Referral"
    );
    assert.equal(
      formatLeadSource({
        campaign: "Student Referral",
        adset: "Referred by: Sara",
        ad: "WhatsApp Manual Lead",
      }).shortDisplay,
      "Student Referral - Referred by: Sara"
    );
  });

  it("formats unresolved numeric Ad IDs cleanly as Campaign #<id>", () => {
    const res = formatLeadSource({
      campaign: "120248095925100225",
      adset: "",
      ad: "OPEN_THREAD",
    });
    assert.equal(res.shortDisplay, "Campaign #120248095925100225");
    assert.equal(res.isUnresolvedId, true);
  });

  it("builds flat count-sorted filter options with concise labels and full value keys", () => {
    const ad1 = formatLeadSource({
      adId: "1",
      campaign: "TCH | SAU | MSG | KIDS40 | NOV26 v3",
      adset: "KHB KIDS40 | NOV26 v3",
      ad: "KHB KIDS40 - Piano Classes | NOV26 v3",
    });
    const direct = formatLeadSource("direct");

    const list = buildCampaignFilterList([
      { sourceDisplay: ad1.display, sourceLabel: ad1.shortDisplay },
      { sourceDisplay: ad1.display, sourceLabel: ad1.shortDisplay },
      { sourceDisplay: direct.display, sourceLabel: direct.shortDisplay },
    ]);

    assert.equal(list.totalCount, 3);
    assert.deepEqual(list.options, [
      { value: "Direct", label: "Direct", count: 1 },
      { value: ad1.display, label: "KIDS40 | NOV26 v3 - KHB KIDS40 - Piano Classes", count: 2 },
    ]);
    assert.deepEqual(getSelectedCampaignLabel("All campaigns", list), {
      label: "All campaigns (3)",
      title: "All campaigns (3)",
    });
    assert.deepEqual(getSelectedCampaignLabel(ad1.display, list), {
      label: "KIDS40 | NOV26 v3 - KHB KIDS40 - Piano Classes (2)",
      title: `${ad1.display} (2)`,
    });
  });
});
