import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildLeadNamePatchUpdates,
  getEditableLeadDisplayName,
  hasAgentEditedLeadName,
  isPlaceholderLeadName,
  resolveConversationLeadNames,
  validateLeadNameInput,
} from "./leadName.ts";

describe("isPlaceholderLeadName", () => {
  it("flags empty strings, channel placeholders, and phone numbers", () => {
    assert.equal(isPlaceholderLeadName(""), true);
    assert.equal(isPlaceholderLeadName("   "), true);
    assert.equal(isPlaceholderLeadName(null), true);
    assert.equal(isPlaceholderLeadName("WhatsApp User"), true);
    assert.equal(isPlaceholderLeadName("WhatsApp Contact"), true);
    assert.equal(isPlaceholderLeadName("Messenger User"), true);
    assert.equal(isPlaceholderLeadName("Instagram User"), true);
    assert.equal(isPlaceholderLeadName("+201012345678"), true);
    assert.equal(isPlaceholderLeadName("201012345678"), true);
  });

  it("accepts real contact names including names with numbers", () => {
    assert.equal(isPlaceholderLeadName("Ahmed Ali"), false);
    assert.equal(isPlaceholderLeadName("Sara 2"), false);
    assert.equal(isPlaceholderLeadName("محمد محمود"), false);
  });
});

describe("hasAgentEditedLeadName", () => {
  it("returns false for direct string or unedited Meta form sources and true after edit", () => {
    assert.equal(hasAgentEditedLeadName("direct"), false);
    assert.equal(hasAgentEditedLeadName({ campaign: "Facebook Lead Form" }), false);
    assert.equal(hasAgentEditedLeadName({ campaign: "Organic / Direct", leadNameEdited: true }), true);
    assert.equal(
      hasAgentEditedLeadName({ campaign: "Organic / Direct", editedLeadName: "Yusuf Ahmed" }),
      true
    );
  });
});

describe("resolveConversationLeadNames", () => {
  it("keeps unedited WhatsApp leads displaying phone across Pipeline & Auditions even with push-name or form leadName", () => {
    const pushOnly = resolveConversationLeadNames({
      channel: "WA",
      name: "Yusuf",
      phone: "+966566672109",
      senderId: "966566672109@s.whatsapp.net",
      source: "direct",
    });

    assert.equal(pushOnly.name, "+966566672109");
    assert.equal(pushOnly.profileName, "Yusuf");
    assert.equal(pushOnly.leadName, undefined);

    const formPopulated = resolveConversationLeadNames({
      channel: "WA",
      name: "Yusuf",
      leadName: "Yusuf",
      phone: "+966566672109",
      senderId: "966566672109@s.whatsapp.net",
      source: { campaign: "Facebook Lead Form", adset: "Riyadh", ad: "Lead Form -> WhatsApp" },
    });

    assert.equal(formPopulated.name, "+966566672109");
    assert.equal(formPopulated.profileName, "Yusuf");
    assert.equal(formPopulated.leadName, "Yusuf");
  });

  it("displays agent-edited WhatsApp lead name instead of phone across all screens", () => {
    const edited = resolveConversationLeadNames({
      channel: "WA",
      name: "+966566672109",
      leadName: "Yusuf",
      phone: "+966566672109",
      senderId: "966566672109@s.whatsapp.net",
      source: {
        campaign: "Organic / Direct",
        leadNameEdited: true,
        editedLeadName: "Yusuf Al-Harbi",
      },
    });

    assert.equal(edited.name, "Yusuf Al-Harbi");
    assert.equal(edited.leadName, "Yusuf Al-Harbi");
    assert.equal(edited.profileName, "Yusuf Al-Harbi");
  });

  it("preserves agent-edited name when leadNameEdited boolean is set and name/leadName are updated", () => {
    const resolved = resolveConversationLeadNames({
      channel: "WA",
      name: "Random Handle",
      leadName: "Youssef Samir",
      senderId: "123456789012345",
      source: { leadNameEdited: true },
    });

    assert.equal(resolved.name, "Youssef Samir");
    assert.equal(resolved.leadName, "Youssef Samir");
    assert.equal(resolved.profileName, "Youssef Samir");
  });

  it("preserves FB and IG lead names and defaults missing names to channel fallbacks", () => {
    const fbNamed = resolveConversationLeadNames({
      channel: "FB",
      name: "Salma Adel",
      senderId: "99887766",
    });
    assert.deepEqual(fbNamed, {
      name: "Salma Adel",
      profileName: undefined,
      leadName: undefined,
    });

    const igUnnamed = resolveConversationLeadNames({
      channel: "IG",
      name: "",
      senderId: "11223344",
    });
    assert.deepEqual(igUnnamed, {
      name: "Instagram User",
      profileName: undefined,
      leadName: undefined,
    });

    const opUnedited = resolveConversationLeadNames({
      channel: "WA",
      name: "Yusuf Parent",
      senderId: "op_201001234567",
      source: "direct",
    });
    assert.equal(opUnedited.name, "+201001234567");
  });

  it("preserves WhatsApp group subject names instead of showing group JID digits or phone numbers", () => {
    const groupConv = resolveConversationLeadNames({
      channel: "WA",
      isGroup: true,
      name: "Piano Students & Parents - Riyadh",
      senderId: "op_grp_120363012345678901",
      phone: null,
      source: "direct",
    });

    assert.equal(groupConv.name, "Piano Students & Parents - Riyadh");
    assert.equal(groupConv.profileName, undefined);

    const shortIdGroup = resolveConversationLeadNames({
      channel: "WA",
      name: "Faculty Coordination",
      senderId: "op_grp_1234567890",
      phone: "",
    });
    assert.equal(shortIdGroup.name, "Faculty Coordination");

    const unnamedGroup = resolveConversationLeadNames({
      channel: "WA",
      isGroup: true,
      name: "",
      senderId: "op_grp_120363999888777666",
    });
    assert.equal(unnamedGroup.name, "WhatsApp Group");
  });
});

describe("getEditableLeadDisplayName", () => {
  it("prioritizes leadName, then profileName, then name, then phone", () => {
    assert.equal(
      getEditableLeadDisplayName({
        leadName: "Nour El-Din",
        profileName: "nour_handle",
        name: "+201011122233",
        phone: "+201011122233",
        id: "201011122233@s.whatsapp.net",
      }),
      "Nour El-Din"
    );

    assert.equal(
      getEditableLeadDisplayName({
        profileName: "nour_handle",
        name: "+201011122233",
        phone: "+201011122233",
        id: "201011122233@s.whatsapp.net",
      }),
      "nour_handle"
    );

    assert.equal(
      getEditableLeadDisplayName({
        name: "+201011122233",
        phone: "+201011122233",
        id: "201011122233@s.whatsapp.net",
      }),
      "+201011122233"
    );
  });
});

describe("validateLeadNameInput", () => {
  it("rejects empty, over-length, and placeholder inputs", () => {
    assert.equal(validateLeadNameInput("   ").ok, false);
    assert.equal(validateLeadNameInput("a".repeat(121)).ok, false);
    assert.equal(validateLeadNameInput("WhatsApp Contact").ok, false);
    assert.equal(validateLeadNameInput("+201012345678").ok, false);
  });

  it("trims and normalizes internal spaces for valid names", () => {
    assert.deepEqual(validateLeadNameInput("  Mariam   Hany  "), {
      ok: true,
      value: "Mariam Hany",
    });
  });
});

describe("buildLeadNamePatchUpdates", () => {
  it("returns synchronized name, leadName, and explicit leadNameEdited marker", () => {
    assert.deepEqual(buildLeadNamePatchUpdates("Karim Tarek"), {
      name: "Karim Tarek",
      leadName: "Karim Tarek",
      leadNameEdited: true,
    });
  });
});
