"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Lock,
  MapPin,
  MessageSquare,
  Phone,
  RotateCcw,
  Search,
  Shield,
  SlidersHorizontal,
  Tag,
  User,
  Users,
  X,
} from "lucide-react";
import type { Conversation } from "../context/CRMContext";
import {
  filterAndSortGroupParticipants,
  findExistingDmForParticipant,
  formatParticipantPhone,
  getParticipantLabel,
  getParticipantPhoneDigits,
  getParticipantRole,
  type GroupMemberProfileInfo,
  type GroupParticipant,
} from "../utils/groupMentions";

export interface GroupInfoPanelProps {
  groupConv: Conversation;
  allInboxConversations: Conversation[];
  initialMember?: GroupParticipant | null;
  isLoadingParticipants?: boolean;
  isExporting?: boolean;
  isReadOnly: boolean;
  onClose: () => void;
  onSwitchToCrmDetails?: () => void;
  onExportChat?: () => void;
  onRefreshParticipants: () => void;
  onFetchMemberProfile: (
    groupId: string,
    participant: GroupParticipant
  ) => Promise<GroupMemberProfileInfo | null>;
  onFetchMemberAvatars?: (
    groupId: string,
    participants: GroupParticipant[]
  ) => Promise<Record<string, { avatarUrl: string | null; about: string | null; aboutSetAt: number | null }>>;
  onOpenMemberChat: (
    participant: GroupParticipant
  ) => Promise<{ ok: boolean; conversationId?: string; existed?: boolean; error?: string }>;
  onSelectConversation: (conversationId: string) => void;
}

function getInitials(name: string): string {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function formatUnixOrMsDate(val?: number | string | null): string {
  if (!val) return "";
  const raw = typeof val === "string" ? Date.parse(val) : Number(val);
  if (!Number.isFinite(raw) || raw <= 0) return "";
  const ms = raw < 10_000_000_000 ? raw * 1000 : raw;
  return new Date(ms).toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function GroupInfoPanelInner({
  groupConv,
  allInboxConversations,
  initialMember = null,
  isLoadingParticipants = false,
  isExporting = false,
  isReadOnly,
  onClose,
  onSwitchToCrmDetails,
  onExportChat,
  onRefreshParticipants,
  onFetchMemberProfile,
  onFetchMemberAvatars,
  onOpenMemberChat,
  onSelectConversation,
}: GroupInfoPanelProps) {
  const [selectedMember, setSelectedMember] = useState<GroupParticipant | null>(initialMember);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadedProfiles, setLoadedProfiles] = useState<Record<string, GroupMemberProfileInfo>>({});
  const [batchedSnapshots, setBatchedSnapshots] = useState<
    Record<string, { avatarUrl: string | null; about: string | null; aboutSetAt: number | null }>
  >({});
  const [loadingProfileKey, setLoadingProfileKey] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);
  const [openingChatKey, setOpeningChatKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const participants = useMemo(
    () => (Array.isArray(groupConv.groupParticipants) ? groupConv.groupParticipants : []),
    [groupConv.groupParticipants]
  );

  const sortedParticipants = useMemo(
    () => filterAndSortGroupParticipants(participants, searchQuery),
    [participants, searchQuery]
  );

  const memberCount = participants.length || groupConv.groupMeta?.size || 0;

  // Escape navigates back from Contact info -> Group info, or closes side panel
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selectedMember) {
        e.preventDefault();
        setSelectedMember(null);
        setActionError(null);
      } else if (searchOpen) {
        e.preventDefault();
        setSearchQuery("");
        setSearchOpen(false);
      } else {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedMember, searchOpen, onClose]);

  // Fast batched WhatsApp avatars + statuses for visible group members (non-blocking)
  useEffect(() => {
    if (!onFetchMemberAvatars || participants.length === 0) return;
    let cancelled = false;
    onFetchMemberAvatars(groupConv.id, participants).then((snaps) => {
      if (!cancelled && snaps && Object.keys(snaps).length > 0) {
        setBatchedSnapshots((prev) => ({ ...prev, ...snaps }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [groupConv.id, participants, onFetchMemberAvatars]);

  // Deep profile lookup when inspecting a specific member
  const selectedKey = selectedMember ? `${groupConv.id}:${selectedMember.jid}` : null;
  useEffect(() => {
    if (!selectedMember || !selectedKey) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setLoadingProfileKey(selectedKey);
    });
    onFetchMemberProfile(groupConv.id, selectedMember)
      .then((profile) => {
        if (!cancelled && profile) {
          setLoadedProfiles((prev) => ({ ...prev, [selectedKey]: profile }));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingProfileKey((prev) => (prev === selectedKey ? null : prev));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [groupConv.id, selectedMember, selectedKey, onFetchMemberProfile]);

  const handleCopyPhone = (phoneVal: string) => {
    if (!phoneVal) return;
    navigator.clipboard?.writeText(phoneVal).catch(() => {});
    setCopiedPhone(phoneVal);
    setTimeout(() => {
      setCopiedPhone((prev) => (prev === phoneVal ? null : prev));
    }, 1800);
  };

  const handleStartMemberChat = async (member: GroupParticipant) => {
    if (member.isSelf) return;
    setActionError(null);
    const localMatch = findExistingDmForParticipant(allInboxConversations, member, "operation");
    if (localMatch) {
      onSelectConversation(localMatch.id);
      return;
    }

    if (isReadOnly) {
      setActionError("View-only accounts cannot create new private chats.");
      return;
    }

    setOpeningChatKey(member.jid);
    try {
      const res = await onOpenMemberChat(member);
      if (res.ok && res.conversationId) {
        onSelectConversation(res.conversationId);
      } else {
        setActionError(res.error || "Could not open chat with this group member.");
      }
    } finally {
      setOpeningChatKey(null);
    }
  };

  const groupAvatarUrl =
    groupConv.groupMeta?.avatarUrl && !failedImages[groupConv.groupMeta.avatarUrl]
      ? groupConv.groupMeta.avatarUrl
      : null;

  const activeMemberProfile = selectedKey ? loadedProfiles[selectedKey] || null : null;
  const activeMemberBatched = selectedMember ? batchedSnapshots[selectedMember.jid] || null : null;
  const activeMemberExistingLocal = selectedMember
    ? findExistingDmForParticipant(allInboxConversations, selectedMember, "operation")
    : null;

  const activeMemberExistingSummary =
    activeMemberProfile?.existingConversation ||
    (activeMemberExistingLocal
      ? {
          senderId: activeMemberExistingLocal.id,
          name:
            activeMemberExistingLocal.leadName ||
            activeMemberExistingLocal.profileName ||
            activeMemberExistingLocal.name,
          phone: activeMemberExistingLocal.phone || null,
          agent: activeMemberExistingLocal.agent,
          status: activeMemberExistingLocal.status,
          pipeline: activeMemberExistingLocal.pipeline,
          branch: activeMemberExistingLocal.branch,
          labels: activeMemberExistingLocal.labels,
          notes: activeMemberExistingLocal.notes,
          followUpDate: activeMemberExistingLocal.followUpDate || null,
          followUpNote: activeMemberExistingLocal.followUpNote,
          unreadCount: activeMemberExistingLocal.unreadCount,
          isDone: activeMemberExistingLocal.isDone,
          isArchived: activeMemberExistingLocal.isArchived,
          lastMessageAt: activeMemberExistingLocal.lastMessageAt || null,
          lastMessageText: activeMemberExistingLocal.lastMessageText,
          lastMessageDirection: activeMemberExistingLocal.lastMessageDirection,
        }
      : null);

  return (
    <div className="flex flex-col h-full min-h-0" style={{ background: "var(--bg-panel)" }}>
      {/* ── Top WhatsApp-Style Header ── */}
      <div
        className="h-[56px] px-4 flex items-center justify-between gap-2 border-b shrink-0"
        style={{
          background: "var(--bg-card)",
          borderColor: "var(--border-main)",
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {selectedMember ? (
            <button
              type="button"
              onClick={() => {
                setSelectedMember(null);
                setActionError(null);
              }}
              aria-label="Back to Group info"
              className="p-1.5 -ml-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
              style={{ color: "var(--text-primary)" }}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Group info"
              className="p-1.5 -ml-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
              style={{ color: "var(--text-primary)" }}
            >
              <X className="w-5 h-5" />
            </button>
          )}

          <h3 className="text-[15px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
            {selectedMember ? "Contact info" : "Group info"}
          </h3>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!selectedMember && (
            <button
              type="button"
              onClick={onRefreshParticipants}
              disabled={isLoadingParticipants}
              title="Refresh group info & members from WhatsApp"
              className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
              style={{ color: "var(--text-secondary)" }}
            >
              <RotateCcw className={`w-4 h-4 ${isLoadingParticipants ? "animate-spin" : ""}`} />
            </button>
          )}
          {selectedMember && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close panel"
              className="p-1.5 -mr-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
              style={{ color: "var(--text-secondary)" }}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      {!selectedMember ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Group Hero Header Card (WhatsApp Desktop style) */}
          <div
            className="px-5 py-6 flex flex-col items-center text-center border-b"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-main)",
            }}
          >
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center shrink-0 overflow-hidden border mb-3.5 shadow-xs"
              style={{
                background: "var(--bg-card)",
                borderColor: "var(--border-main)",
                color: "var(--text-secondary)",
              }}
            >
              {groupAvatarUrl ? (
                <img
                  src={groupAvatarUrl}
                  alt={groupConv.name}
                  className="w-full h-full object-cover"
                  onError={() =>
                    setFailedImages((prev) => ({ ...prev, [groupAvatarUrl]: true }))
                  }
                />
              ) : (
                <Users className="w-10 h-10" />
              )}
            </div>

            <h2
              dir="auto"
              className="text-[17px] font-bold leading-snug break-words max-w-full"
              style={{ color: "var(--text-primary)" }}
            >
              {groupConv.name}
            </h2>
            <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
              Group · {memberCount} {memberCount === 1 ? "member" : "members"}
            </p>

            {groupConv.groupMeta?.announce && (
              <span
                className="inline-flex items-center gap-1 mt-2 text-[11px] font-medium px-2.5 py-0.5 rounded-full border"
                style={{
                  background: "var(--label-amber-bg)",
                  borderColor: "var(--label-amber-border)",
                  color: "var(--label-amber-text)",
                }}
              >
                <Lock className="w-3 h-3" />
                <span>Only admins can send</span>
              </span>
            )}
          </div>

          {/* Group Description / Creation Metadata (if present) */}
          {(groupConv.groupMeta?.desc || groupConv.groupMeta?.creation) && (
            <div
              className="px-5 py-3.5 border-b space-y-1.5"
              style={{
                background: "var(--bg-card)",
                borderColor: "var(--border-main)",
              }}
            >
              {groupConv.groupMeta?.desc && (
                <p
                  dir="auto"
                  className="text-[13px] leading-relaxed whitespace-pre-wrap"
                  style={{ color: "var(--text-primary)" }}
                >
                  {groupConv.groupMeta.desc}
                </p>
              )}
              {groupConv.groupMeta?.creation && (
                <p className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                  Created {formatUnixOrMsDate(groupConv.groupMeta.creation)}
                </p>
              )}
            </div>
          )}

          {/* Subtle Spacer matching WhatsApp Panel Sections */}
          <div className="h-2" style={{ background: "var(--bg-page)" }} />

          {/* Members Section (`N members` + inline Search toggle) */}
          <div
            className="border-t border-b"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-main)",
            }}
          >
            <div className="px-4 pt-3.5 pb-2 flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>
                {memberCount} {memberCount === 1 ? "member" : "members"}
              </span>

              <button
                type="button"
                onClick={() => {
                  setSearchOpen((prev) => {
                    const next = !prev;
                    if (!next) setSearchQuery("");
                    else {
                      requestAnimationFrame(() => searchInputRef.current?.focus());
                    }
                    return next;
                  });
                }}
                aria-label="Search group members"
                className="p-1.5 -mr-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                style={{ color: searchOpen ? "#0066FF" : "var(--text-secondary)" }}
              >
                <Search className="w-4 h-4" />
              </button>
            </div>

            {(searchOpen || searchQuery.length > 0) && (
              <div className="px-4 pb-2.5">
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border"
                  style={{
                    background: "var(--bg-input)",
                    borderColor: "var(--border-input)",
                  }}
                >
                  <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-muted)" }} />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search members..."
                    className="flex-1 min-w-0 bg-transparent text-[13px] outline-none placeholder:text-[var(--text-muted)]"
                    style={{ color: "var(--text-primary)" }}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      aria-label="Clear search"
                      className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Members List */}
            {isLoadingParticipants && participants.length === 0 ? (
              <div className="px-4 py-8 text-center flex flex-col items-center justify-center gap-2">
                <RotateCcw className="w-4 h-4 animate-spin text-[#0066FF]" />
                <p className="text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
                  Loading group members...
                </p>
              </div>
            ) : sortedParticipants.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                  {searchQuery ? `No members matching "${searchQuery}"` : "No members synced yet"}
                </p>
              </div>
            ) : (
              <div className="pb-1.5">
                {sortedParticipants.map((member) => {
                  const label = getParticipantLabel(member);
                  const role = getParticipantRole(member);
                  const phoneDisplay = formatParticipantPhone(
                    member.phone || member.phoneNumber || getParticipantPhoneDigits(member)
                  );
                  const existingDm = findExistingDmForParticipant(
                    allInboxConversations,
                    member,
                    "operation"
                  );
                  const batched = batchedSnapshots[member.jid];
                  const loadedProf = loadedProfiles[`${groupConv.id}:${member.jid}`];
                  const rawAvatar = loadedProf?.avatarUrl || batched?.avatarUrl || null;
                  const rowAvatar = rawAvatar && !failedImages[rawAvatar] ? rawAvatar : null;
                  const rowAbout = loadedProf?.about || batched?.about || null;

                  return (
                    <button
                      key={member.jid}
                      type="button"
                      onClick={() => {
                        setActionError(null);
                        setSelectedMember(member);
                      }}
                      className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition-colors text-left cursor-pointer group"
                    >
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-[12px] font-bold border overflow-hidden"
                        style={
                          member.isSelf
                            ? {
                                background: "var(--label-green-bg)",
                                borderColor: "var(--label-green-border)",
                                color: "var(--label-green-text)",
                              }
                            : role
                            ? {
                                background: "var(--label-teal-bg)",
                                borderColor: "var(--label-teal-border)",
                                color: "var(--label-teal-text)",
                              }
                            : {
                                background: "var(--label-blue-bg)",
                                borderColor: "var(--label-blue-border)",
                                color: "var(--label-blue-text)",
                              }
                        }
                      >
                        {rowAvatar ? (
                          <img
                            src={rowAvatar}
                            alt={label}
                            className="w-full h-full object-cover"
                            onError={() =>
                              setFailedImages((prev) => ({ ...prev, [rowAvatar]: true }))
                            }
                          />
                        ) : (
                          getInitials(label)
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            dir="auto"
                            className="text-[14px] font-medium truncate"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {member.isSelf ? "You" : label}
                          </span>

                          {role && (
                            <span
                              className="text-[10.5px] font-medium px-2 py-0.5 rounded-[5px] border shrink-0"
                              style={{
                                background: "var(--label-green-bg)",
                                borderColor: "var(--label-green-border)",
                                color: "var(--label-green-text)",
                              }}
                            >
                              {role === "superadmin" ? "Group owner" : "Group admin"}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-2 mt-0.5 min-w-0">
                          <span
                            dir="auto"
                            className="text-[12px] truncate"
                            style={{
                              color: member.isSelf
                                ? "var(--label-green-text)"
                                : "var(--text-secondary)",
                            }}
                          >
                            {member.isSelf
                              ? "Operation WhatsApp account"
                              : rowAbout
                              ? rowAbout
                              : phoneDisplay && phoneDisplay !== label
                              ? phoneDisplay
                              : existingDm
                              ? `In Inbox · ${existingDm.pipeline || "Open"}`
                              : "Tap for contact info"}
                          </span>

                          {member.isSelf ? (
                            label && !/^\+?\d{7,}$/.test(label) && (
                              <span
                                className="text-[11.5px] truncate shrink-0 max-w-[130px]"
                                style={{ color: "var(--text-muted)" }}
                              >
                                ~{label}
                              </span>
                            )
                          ) : existingDm ? (
                            <span
                              className="text-[10px] font-semibold px-1.5 py-px rounded border shrink-0"
                              style={{
                                background: "var(--label-blue-bg)",
                                borderColor: "var(--label-blue-border)",
                                color: "var(--label-blue-text)",
                              }}
                            >
                              Inbox
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="h-2" style={{ background: "var(--bg-page)" }} />

          {/* Bottom Clean Actions Section (WhatsApp row list style, real actions only) */}
          <div
            className="border-t border-b divide-y"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-main)",
            }}
          >
            {onExportChat && (
              <button
                type="button"
                onClick={onExportChat}
                disabled={isExporting}
                className="w-full px-5 py-3 flex items-center gap-3.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition-colors text-left cursor-pointer disabled:opacity-50"
              >
                <Download className="w-4 h-4 shrink-0" style={{ color: "var(--text-secondary)" }} />
                <span className="text-[13.5px] font-medium" style={{ color: "var(--text-primary)" }}>
                  {isExporting ? "Exporting chat..." : "Export chat"}
                </span>
              </button>
            )}

            {onSwitchToCrmDetails && (
              <button
                type="button"
                onClick={onSwitchToCrmDetails}
                className="w-full px-5 py-3 flex items-center justify-between gap-3.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition-colors text-left cursor-pointer"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <SlidersHorizontal className="w-4 h-4 shrink-0" style={{ color: "var(--text-secondary)" }} />
                  <span className="text-[13.5px] font-medium truncate" style={{ color: "var(--text-primary)" }}>
                    CRM Details &amp; History Sync
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} />
              </button>
            )}
          </div>
        </div>
      ) : (
        /* ── View 2: Contact Info & Direct Chat Navigation (inside side view) ── */
        (() => {
          const member = selectedMember;
          const displayName = activeMemberProfile?.displayName || getParticipantLabel(member);
          const role =
            getParticipantRole(member) ||
            (activeMemberProfile?.role === "superadmin"
              ? "superadmin"
              : activeMemberProfile?.role === "admin"
              ? "admin"
              : null);
          const effectivePhone =
            activeMemberProfile?.phone ||
            formatParticipantPhone(
              member.phone || member.phoneNumber || getParticipantPhoneDigits(member)
            ) ||
            null;
          const rawAvatarUrl =
            activeMemberProfile?.avatarUrl || activeMemberBatched?.avatarUrl || null;
          const avatarUrl = rawAvatarUrl && !failedImages[rawAvatarUrl] ? rawAvatarUrl : null;
          const effectiveAbout = activeMemberProfile?.about || activeMemberBatched?.about || null;
          const effectiveAboutSetAt =
            activeMemberProfile?.aboutSetAt || activeMemberBatched?.aboutSetAt || null;
          const isLoadingThisProfile = Boolean(selectedKey && loadingProfileKey === selectedKey);
          const effectiveParticipant: GroupParticipant = {
            ...member,
            phone: effectivePhone || member.phone,
            phoneDigits: activeMemberProfile?.phoneDigits || member.phoneDigits,
            displayName,
          };

          return (
            <div className="flex-1 min-h-0 overflow-y-auto">
              {/* Contact Identity Hero */}
              <div
                className="px-5 py-6 flex flex-col items-center text-center border-b"
                style={{
                  background: "var(--bg-card)",
                  borderColor: "var(--border-main)",
                }}
              >
                <div
                  className="w-24 h-24 rounded-full flex items-center justify-center text-[24px] font-bold border overflow-hidden mb-3.5"
                  style={
                    member.isSelf
                      ? {
                          background: "var(--label-green-bg)",
                          borderColor: "var(--label-green-border)",
                          color: "var(--label-green-text)",
                        }
                      : role
                      ? {
                          background: "var(--label-teal-bg)",
                          borderColor: "var(--label-teal-border)",
                          color: "var(--label-teal-text)",
                        }
                      : {
                          background: "var(--label-blue-bg)",
                          borderColor: "var(--label-blue-border)",
                          color: "var(--label-blue-text)",
                        }
                  }
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={displayName}
                      className="w-full h-full object-cover"
                      onError={() =>
                        setFailedImages((prev) => ({ ...prev, [avatarUrl]: true }))
                      }
                    />
                  ) : (
                    getInitials(displayName)
                  )}
                </div>

                <h2
                  dir="auto"
                  className="text-[17px] font-bold leading-snug break-words max-w-full"
                  style={{ color: "var(--text-primary)" }}
                >
                  {displayName}
                </h2>

                {effectivePhone && (
                  <p className="text-[13px] mt-1 font-medium" style={{ color: "var(--text-secondary)" }}>
                    {effectivePhone}
                  </p>
                )}

                <div className="flex items-center flex-wrap justify-center gap-1.5 mt-2.5">
                  {role && (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-[5px] border"
                      style={{
                        background: "var(--label-green-bg)",
                        borderColor: "var(--label-green-border)",
                        color: "var(--label-green-text)",
                      }}
                    >
                      <Shield className="w-3 h-3" />
                      <span>{role === "superadmin" ? "Group owner" : "Group admin"}</span>
                    </span>
                  )}
                  {member.isSelf && (
                    <span
                      className="text-[11px] font-medium px-2.5 py-0.5 rounded-[5px] border"
                      style={{
                        background: "var(--label-blue-bg)",
                        borderColor: "var(--label-blue-border)",
                        color: "var(--label-blue-text)",
                      }}
                    >
                      You · Linked Account
                    </span>
                  )}
                </div>

                {/* WhatsApp Action Buttons Row */}
                {(!member.isSelf || effectivePhone) && (
                  <div className="w-full mt-4 flex items-center gap-2">
                    {!member.isSelf && (
                      <button
                        type="button"
                        onClick={() => handleStartMemberChat(effectiveParticipant)}
                        disabled={
                          openingChatKey === member.jid ||
                          (isReadOnly && !activeMemberExistingSummary)
                        }
                        className="flex-1 min-h-[40px] px-3.5 py-2 rounded-xl bg-[#0066FF] hover:bg-[#0055D6] disabled:opacity-50 text-white font-semibold text-[13px] transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {openingChatKey === member.jid ? (
                          <RotateCcw className="w-4 h-4 animate-spin" />
                        ) : (
                          <MessageSquare className="w-4 h-4" />
                        )}
                        <span>
                          {openingChatKey === member.jid
                            ? "Opening..."
                            : activeMemberExistingSummary
                            ? "Open Inbox Chat"
                            : "Message"}
                        </span>
                      </button>
                    )}

                    {effectivePhone && (
                      <button
                        type="button"
                        onClick={() => handleCopyPhone(effectivePhone)}
                        className="min-h-[40px] px-3 py-2 rounded-xl border text-[12.5px] font-medium hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                        style={{
                          background: "var(--bg-pill)",
                          borderColor: "var(--border-input)",
                          color: copiedPhone === effectivePhone ? "#34C759" : "var(--text-primary)",
                        }}
                      >
                        {copiedPhone === effectivePhone ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedPhone === effectivePhone ? "Copied" : "Copy"}</span>
                      </button>
                    )}
                  </div>
                )}

                {actionError && (
                  <p className="mt-2.5 text-[11.5px] font-medium text-red-500">{actionError}</p>
                )}
              </div>

              <div className="h-2" style={{ background: "var(--bg-page)" }} />

              {/* WhatsApp About & Phone Section */}
              <div
                className="border-t border-b divide-y"
                style={{
                  background: "var(--bg-card)",
                  borderColor: "var(--border-main)",
                }}
              >
                <div className="px-5 py-3.5">
                  <p className="text-[11px] font-semibold mb-1" style={{ color: "var(--text-muted)" }}>
                    About
                  </p>
                  {isLoadingThisProfile && !effectiveAbout && !activeMemberProfile ? (
                    <p className="text-[12.5px] animate-pulse" style={{ color: "var(--text-muted)" }}>
                      Loading WhatsApp profile...
                    </p>
                  ) : effectiveAbout ? (
                    <div>
                      <p
                        dir="auto"
                        className="text-[13.5px] leading-relaxed whitespace-pre-wrap"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {effectiveAbout}
                      </p>
                      {effectiveAboutSetAt && (
                        <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                          Updated {formatUnixOrMsDate(effectiveAboutSetAt)}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                      No About visible
                    </p>
                  )}
                </div>

                <div className="px-5 py-3 space-y-2 text-[12.5px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
                      <Phone className="w-3.5 h-3.5" />
                      <span>Phone</span>
                    </span>
                    <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                      {effectivePhone || "Hidden (WhatsApp Privacy LID)"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
                      <User className="w-3.5 h-3.5" />
                      <span>WhatsApp ID</span>
                    </span>
                    <span
                      className="font-mono text-[11px] truncate max-w-[175px]"
                      style={{ color: "var(--text-secondary)" }}
                      title={member.jid}
                    >
                      {member.userId || member.jid}
                    </span>
                  </div>
                </div>
              </div>

              <div className="h-2" style={{ background: "var(--bg-page)" }} />

              {/* Operation CRM Information Section */}
              <div
                className="px-5 py-4 border-t border-b space-y-3"
                style={{
                  background: "var(--bg-card)",
                  borderColor: "var(--border-main)",
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#0066FF" }}>
                    CRM Information
                  </p>
                  {activeMemberExistingSummary && (
                    <span
                      className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full border"
                      style={{
                        background: "var(--label-blue-bg)",
                        borderColor: "var(--label-blue-border)",
                        color: "var(--label-blue-text)",
                      }}
                    >
                      {activeMemberExistingSummary.isArchived
                        ? "Archived"
                        : activeMemberExistingSummary.isDone
                        ? "Done"
                        : activeMemberExistingSummary.status || "Open"}
                    </span>
                  )}
                </div>

                {!activeMemberExistingSummary ? (
                  <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    {member.isSelf
                      ? "This is the Operation inbox's own WhatsApp account."
                      : "No 1-on-1 conversation in Operation Inbox yet. Click Message above to open their direct chat and manage branch, stage, labels, and notes."}
                  </p>
                ) : (
                  <div className="space-y-2.5 text-[12.5px]">
                    <div className="grid grid-cols-2 gap-2">
                      <div
                        className="p-2.5 rounded-lg border"
                        style={{
                          background: "var(--bg-input)",
                          borderColor: "var(--border-main)",
                        }}
                      >
                        <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                          Stage
                        </p>
                        <p className="font-semibold truncate mt-0.5" style={{ color: "var(--text-primary)" }}>
                          {activeMemberExistingSummary.pipeline || "New"}
                        </p>
                      </div>

                      <div
                        className="p-2.5 rounded-lg border"
                        style={{
                          background: "var(--bg-input)",
                          borderColor: "var(--border-main)",
                        }}
                      >
                        <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                          Assigned
                        </p>
                        <p className="font-semibold truncate mt-0.5" style={{ color: "var(--text-primary)" }}>
                          {activeMemberExistingSummary.agent || "Unassigned"}
                        </p>
                      </div>
                    </div>

                    {activeMemberExistingSummary.branch && (
                      <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        <span>Branch:</span>
                        <span className="font-medium truncate" style={{ color: "var(--text-primary)" }}>
                          {activeMemberExistingSummary.branch}
                        </span>
                      </div>
                    )}

                    {activeMemberExistingSummary.followUpDate && (
                      <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                        <Calendar className="w-3.5 h-3.5 shrink-0" />
                        <span>Follow-up:</span>
                        <span className="font-medium truncate" style={{ color: "var(--text-primary)" }}>
                          {formatUnixOrMsDate(activeMemberExistingSummary.followUpDate)}
                          {activeMemberExistingSummary.followUpNote
                            ? ` · ${activeMemberExistingSummary.followUpNote}`
                            : ""}
                        </span>
                      </div>
                    )}

                    {activeMemberExistingSummary.labels &&
                      activeMemberExistingSummary.labels.length > 0 && (
                        <div className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                          <Tag className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-muted)" }} />
                          <span>
                            {activeMemberExistingSummary.labels.length}{" "}
                            {activeMemberExistingSummary.labels.length === 1 ? "label" : "labels"} assigned
                          </span>
                        </div>
                      )}

                    {activeMemberExistingSummary.notes && (
                      <div
                        className="p-2.5 rounded-lg border"
                        style={{
                          background: "var(--bg-input)",
                          borderColor: "var(--border-main)",
                        }}
                      >
                        <p
                          className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide mb-1"
                          style={{ color: "var(--text-muted)" }}
                        >
                          <FileText className="w-3 h-3" />
                          <span>Notes</span>
                        </p>
                        <p
                          dir="auto"
                          className="text-[12px] whitespace-pre-wrap leading-relaxed line-clamp-4"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {activeMemberExistingSummary.notes}
                        </p>
                      </div>
                    )}

                    {activeMemberExistingSummary.lastMessageText && (
                      <div
                        className="p-2.5 rounded-lg border"
                        style={{
                          background: "var(--bg-input)",
                          borderColor: "var(--border-main)",
                        }}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                            Latest Message
                          </span>
                          {activeMemberExistingSummary.lastMessageAt && (
                            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                              {formatUnixOrMsDate(activeMemberExistingSummary.lastMessageAt)}
                            </span>
                          )}
                        </div>
                        <p
                          dir="auto"
                          className="text-[12px] line-clamp-2"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {activeMemberExistingSummary.lastMessageText}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
}

export const GroupInfoPanel = React.memo(function GroupInfoPanel(props: GroupInfoPanelProps) {
  const resetKey = `${props.groupConv.id}:${props.initialMember?.jid || "list"}`;
  return <GroupInfoPanelInner key={resetKey} {...props} />;
});

