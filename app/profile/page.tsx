"use client";

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, getRoleDisplayName, normalizeRole } from "../components/AuthProvider";
import { useCRM, Conversation } from "../context/CRMContext";
import {
  Camera,
  CheckCircle2,
  Users,
  Calendar,
  Banknote,
  Award,
  TrendingUp,
  Edit3,
  BarChart2,
  ExternalLink,
  Star,
  Target,
  User as UserIcon,
  Crown,
  Activity,
  ChevronRight,
} from "lucide-react";

/* ── Image resize utility for avatar optimization ── */
function resizeImageToAvatar(file: File, maxWidth = 256, maxHeight = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Failed to decode image"));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = maxWidth;
        canvas.height = maxHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }

        const size = Math.min(img.width, img.height);
        const startX = (img.width - size) / 2;
        const startY = (img.height - size) / 2;

        ctx.drawImage(img, startX, startY, size, size, 0, 0, maxWidth, maxHeight);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/* ── Date range helpers ── */
function getPeriodBounds(mode: "all" | "today" | "week" | "month") {
  const now = new Date();
  if (mode === "all") return { start: 0, end: Infinity };

  if (mode === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const end = start + 86400000;
    return { start, end };
  }

  if (mode === "week") {
    // Saudi / Cairo week starts on Saturday (day 6 in JS Date: Sun=0, Sat=6)
    const day = now.getDay();
    const diff = day === 6 ? 0 : day + 1; // days past since Saturday
    const sat = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
    const start = sat.getTime();
    const end = start + 7 * 86400000;
    return { start, end };
  }

  // Month
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  return { start, end: nextMonth };
}

function getCreatedTime(c: Conversation): number {
  if (c.createdAt) {
    const t = new Date(c.createdAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  return c.lastMessageAt || (c.updatedAt ? new Date(c.updatedAt).getTime() : 0);
}

function getUpdatedTime(c: Conversation): number {
  if (c.updatedAt) {
    const t = new Date(c.updatedAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  return getCreatedTime(c);
}

function getBookedTime(c: Conversation): number {
  const explicit =
    c.auditionBookedAt ||
    (typeof c.source === "object" && c.source?.auditionBookedAt ? c.source.auditionBookedAt : undefined);
  if (explicit) {
    const t = new Date(explicit).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (c.auditionDate && /^\d{4}-\d{2}-\d{2}$/.test(c.auditionDate)) {
    const [y, m, d] = c.auditionDate.split("-").map(Number);
    if (y >= 2020) return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
  }
  if (c.updatedAt) {
    const t = new Date(c.updatedAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  return getCreatedTime(c);
}

function getAttendedTime(c: Conversation): number {
  const explicit =
    c.attendedAt ||
    (typeof c.source === "object" && c.source?.attendedAt ? c.source.attendedAt : undefined);
  if (explicit) {
    const t = new Date(explicit).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (c.auditionDate && /^\d{4}-\d{2}-\d{2}$/.test(c.auditionDate)) {
    const [y, m, d] = c.auditionDate.split("-").map(Number);
    if (y >= 2020) return new Date(y, m - 1, d, 14, 0, 0, 0).getTime();
  }
  if (c.updatedAt) {
    const t = new Date(c.updatedAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  return getCreatedTime(c);
}

function getConvertedTime(c: Conversation): number {
  const explicit =
    c.enrolledAt ||
    c.paidAt ||
    (typeof c.source === "object" ? c.source?.enrolledAt || c.source?.paidAt : undefined);
  if (explicit) {
    const t = new Date(explicit).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (c.updatedAt) {
    const t = new Date(c.updatedAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  return getCreatedTime(c);
}

function formatOutcomeLabel(outcome?: string): string {
  switch (outcome) {
    case "registered":
      return "Registered & Paid";
    case "passed":
      return "Audition Passed";
    case "attended":
      return "Attended Audition";
    case "pending-payment":
      return "Payment Pending";
    case "no-show":
      return "No Show";
    case "failed":
      return "Did Not Pass";
    default:
      return outcome || "Attended";
  }
}

function getDisplayName(c: Conversation): string {
  return c.leadName || c.profileName || c.name || c.phone || c.id;
}

function isBookedLead(c: Conversation): boolean {
  if (Boolean(c.auditionDate)) return true;
  const p = (c.pipeline || "").toLowerCase();
  return (
    p.includes("audition booked") ||
    p.includes("audition confirmed") ||
    p.includes("audition attended") ||
    p.includes("registered") ||
    p.includes("payment pending")
  );
}

function isAttendedLead(c: Conversation): boolean {
  if (c.auditionOutcome && c.auditionOutcome !== "booked") return true;
  const p = (c.pipeline || "").toLowerCase();
  return (
    p.includes("audition attended") ||
    p.includes("audition passed") ||
    p.includes("registered") ||
    p.includes("payment pending")
  );
}

function isConvertedLead(c: Conversation): boolean {
  if ((Number(c.cashIn) || 0) > 0) return true;
  const p = (c.pipeline || "").toLowerCase();
  return p.includes("registered") || c.auditionOutcome === "registered";
}

/* ── Role Styling & Badges ── */
function getRoleBadgeStyle(role?: string) {
  const norm = normalizeRole(role);
  switch (norm) {
    case "chairman":
      return {
        bg: "rgba(88,86,214,0.12)",
        text: "#5856D6",
        border: "rgba(88,86,214,0.25)",
        icon: Crown,
      };
    case "enrollment_director":
      return {
        bg: "rgba(255,149,0,0.12)",
        text: "#FF9500",
        border: "rgba(255,149,0,0.25)",
        icon: Star,
      };
    case "admission_officer":
      return {
        bg: "rgba(0,102,255,0.12)",
        text: "#0066FF",
        border: "rgba(0,102,255,0.25)",
        icon: Target,
      };
    case "finance":
      return {
        bg: "rgba(52,199,89,0.12)",
        text: "#34C759",
        border: "rgba(52,199,89,0.25)",
        icon: Banknote,
      };
    case "marketing":
      return {
        bg: "rgba(175,82,222,0.12)",
        text: "#AF52DE",
        border: "rgba(175,82,222,0.25)",
        icon: TrendingUp,
      };
    default:
      return {
        bg: "rgba(0,102,255,0.12)",
        text: "#0066FF",
        border: "rgba(0,102,255,0.25)",
        icon: UserIcon,
      };
  }
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, updateCurrentUser, authFetch } = useAuth();
  const { conversations, openChat, refresh } = useCRM();

  // Time filter for analytics
  const [timeFilter, setTimeFilter] = useState<"all" | "month" | "week" | "today">("all");

  // Profile photo state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarStatus, setAvatarStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  // Name editing state
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameStatus, setNameStatus] = useState<string | null>(null);

  // Sync name input initially with logged-in user
  useEffect(() => {
    if (user?.name && !nameInput) {
      setNameInput(user.name);
    }
  }, [user?.name, nameInput]);

  // Current active staff object is always the authenticated user
  const currentStaff = useMemo(() => {
    return {
      name: user?.name || "Staff Member",
      role: user?.role || "admission_officer",
      email: user?.email || "",
      avatar: user?.avatar || "",
    };
  }, [user]);

  const isSelf = true;

  // Avatar Upload / Change Handler
  const handleAvatarFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (!file.type.startsWith("image/")) {
      setAvatarStatus({ ok: false, msg: "Please select an image file (JPEG, PNG, WebP)." });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setAvatarStatus({ ok: false, msg: "Image file is too large. Maximum size is 10MB." });
      return;
    }

    setAvatarSaving(true);
    setAvatarStatus(null);

    try {
      const resizedBase64 = await resizeImageToAvatar(file, 256, 256);

      // Save to server
      const res = await authFetch("/crm-api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: currentStaff.name, avatar: resizedBase64 }),
      });

      const data = await res.json().catch(() => ({}));

      // Update in context & local storage immediately
      updateCurrentUser({ avatar: resizedBase64 });
      setAvatarStatus({ ok: true, msg: "Profile picture updated successfully!" });
      setTimeout(() => setAvatarStatus(null), 3500);
    } catch {
      // Even on network error, keep local avatar responsive
      setAvatarStatus({ ok: true, msg: "Profile picture updated locally." });
      setTimeout(() => setAvatarStatus(null), 3500);
    } finally {
      setAvatarSaving(false);
    }
  };

  // Remove avatar handler
  const handleRemoveAvatar = async () => {
    setAvatarSaving(true);
    setAvatarStatus(null);
    try {
      await authFetch("/crm-api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: currentStaff.name, avatar: "" }),
      });
      updateCurrentUser({ avatar: "" });
      setAvatarStatus({ ok: true, msg: "Profile picture removed." });
      setTimeout(() => setAvatarStatus(null), 3000);
    } catch {
      updateCurrentUser({ avatar: "" });
      setAvatarStatus({ ok: true, msg: "Profile picture removed." });
      setTimeout(() => setAvatarStatus(null), 3000);
    } finally {
      setAvatarSaving(false);
    }
  };

  // Save display name handler
  const handleSaveName = async () => {
    if (!nameInput.trim()) return;
    setNameSaving(true);
    setNameStatus(null);
    try {
      const res = await authFetch("/crm-api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameInput.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success || res.ok) {
        updateCurrentUser({ name: nameInput.trim() });
        setIsEditingName(false);
        setNameStatus("Name updated successfully!");
        if (typeof refresh === "function") {
          refresh();
        }
        setTimeout(() => setNameStatus(null), 3000);
      } else {
        setNameStatus(data.error || "Failed to update name");
      }
    } catch {
      updateCurrentUser({ name: nameInput.trim() });
      setIsEditingName(false);
      setNameStatus("Name updated locally.");
      setTimeout(() => setNameStatus(null), 3000);
    } finally {
      setNameSaving(false);
    }
  };

  /* ── CRM Analytics Computation for Current Staff Member ── */
  const staffMetrics = useMemo(() => {
    const target = currentStaff.name.toLowerCase().trim();
    const bounds = getPeriodBounds(timeFilter);
    const inTimeRange = (t: number) => t >= bounds.start && t < bounds.end;

    const matchesStaff = (raw?: string) => {
      if (!raw) return false;
      const clean = raw.toLowerCase().trim();
      if (!clean || clean === "unassigned" || clean === "staff" || clean === "system") return false;
      if (clean === target) return true;
      const targetFirst = target.split(" ")[0];
      const cleanFirst = clean.split(" ")[0];
      return clean === targetFirst || target === cleanFirst || (targetFirst.length > 2 && clean.includes(targetFirst));
    };

    let assignedLeads = 0;
    let bookedCount = 0;
    let attendedCount = 0;
    let enrolledCount = 0;
    let totalCash = 0;
    let messagesCount = 0;
    let followupsCompleted = 0;
    let totalActivities = 0;

    const channelCounts: Record<"WhatsApp" | "Instagram" | "Messenger", number> = {
      WhatsApp: 0,
      Instagram: 0,
      Messenger: 0,
    };
    const stageCounts: Record<string, number> = {};
    const recentMilestones: Array<{
      id: string;
      title: string;
      leadName: string;
      leadId: string;
      timestamp: number;
      type: string;
      detail?: string;
    }> = [];

    for (const c of conversations) {
      const assigned = (c.agent || "").trim();
      const bookedBy = (c.bookedBy || assigned).trim();
      const attendedBy = (c.attendedBy || assigned).trim();
      const enrolledBy = (c.enrolledBy || assigned).trim();

      const isAssigned = matchesStaff(assigned);
      const isBooker = matchesStaff(bookedBy);
      const isAttender = matchesStaff(attendedBy);
      const isEnroller = matchesStaff(enrolledBy);

      if (!isAssigned && !isBooker && !isAttender && !isEnroller) continue;

      const createdTime = getCreatedTime(c);
      const leadTitle = getDisplayName(c);

      // 1. Lead Assignment Tracking
      if (isAssigned) {
        if (inTimeRange(createdTime || Date.now())) {
          assignedLeads += 1;
          totalActivities += 1;

          // Channel count (WhatsApp, Instagram, Messenger)
          const ch = (c.channel || "").toLowerCase();
          if (ch.includes("wa") || ch.includes("whatsapp")) channelCounts.WhatsApp += 1;
          else if (ch.includes("ig") || ch.includes("instagram")) channelCounts.Instagram += 1;
          else if (ch.includes("fb") || ch.includes("messenger")) channelCounts.Messenger += 1;

          // Stage count
          const stage = c.pipeline || "New";
          stageCounts[stage] = (stageCounts[stage] || 0) + 1;
        }
      }

      // 2. Stage Progression Activity
      if (isAssigned && ["Contacted", "Unqualified", "Lost"].includes(c.pipeline)) {
        const stageTime = getUpdatedTime(c);
        if (inTimeRange(stageTime)) {
          totalActivities += 1;
        }
      }

      // 3. Auditions Booked
      if (isBooker && isBookedLead(c)) {
        const bookTime = getBookedTime(c);
        if (inTimeRange(bookTime)) {
          bookedCount += 1;
          totalActivities += 1;
          recentMilestones.push({
            id: `${c.id}_booked`,
            title: "Audition Booked",
            leadName: leadTitle,
            leadId: c.id,
            timestamp: bookTime,
            type: "audition",
            detail: c.auditionDate ? `Date: ${c.auditionDate}${c.branch ? ` · ${c.branch}` : ""}` : (c.branch || "Audition Scheduled"),
          });
        }
      }

      // 4. Auditions Attended & Outcome
      if (isAttender && isAttendedLead(c)) {
        const attTime = getAttendedTime(c);
        if (inTimeRange(attTime)) {
          attendedCount += 1;
          totalActivities += 1;
          recentMilestones.push({
            id: `${c.id}_attended`,
            title: "Audition Attended",
            leadName: leadTitle,
            leadId: c.id,
            timestamp: attTime,
            type: "audition",
            detail: c.auditionOutcome ? `Outcome: ${formatOutcomeLabel(c.auditionOutcome)}` : "Attended Audition",
          });
        }
      }

      // 5. Enrolled Students & Cash Collected
      if (isEnroller && isConvertedLead(c)) {
        const convTime = getConvertedTime(c);
        if (inTimeRange(convTime)) {
          enrolledCount += 1;
          totalActivities += 1;
          const cashVal = Number(c.cashIn) || 0;
          totalCash += cashVal;

          recentMilestones.push({
            id: `${c.id}_enrolled`,
            title: "Student Enrolled",
            leadName: leadTitle,
            leadId: c.id,
            timestamp: convTime,
            type: "enrollment",
            detail: cashVal > 0 ? `${cashVal.toLocaleString()} SAR Collected` : "Registered Student",
          });
        }
      }

      // 6. Follow-up Tasks Completed
      if (isAssigned && c.followUpCompleted) {
        const fuTime = c.followUpCompletedAt ? new Date(c.followUpCompletedAt).getTime() : getUpdatedTime(c);
        if (inTimeRange(fuTime)) {
          followupsCompleted += 1;
          totalActivities += 1;
          recentMilestones.push({
            id: `${c.id}_fu`,
            title: "Follow-up Done",
            leadName: leadTitle,
            leadId: c.id,
            timestamp: fuTime,
            type: "followup",
            detail: c.followUpNote || "Completed scheduled follow-up",
          });
        }
      }

      // 7. Messages Sent Tracking
      if (Array.isArray(c.messages) && c.messages.length > 0) {
        c.messages.forEach((m) => {
          if (!m.isIncoming && m.timestamp) {
            const isMsgSender = m.senderName ? matchesStaff(m.senderName) : isAssigned;
            if (isMsgSender && inTimeRange(m.timestamp)) {
              messagesCount += 1;
              totalActivities += 1;
            }
          }
        });
      } else if (isAssigned) {
        if (c.lastOutgoingAt) {
          if (inTimeRange(c.lastOutgoingAt)) {
            messagesCount += 1;
            totalActivities += 1;
          }
        } else if (c.lastMessageDirection === "outgoing" && c.lastMessageAt) {
          if (inTimeRange(c.lastMessageAt)) {
            messagesCount += 1;
            totalActivities += 1;
          }
        }
      }

      // 8. Explicit Activity Log Entries (if any were persisted)
      if (Array.isArray(c.activityLog) && c.activityLog.length > 0) {
        for (const act of c.activityLog) {
          const actActor = (act.actor || "").trim();
          if (matchesStaff(actActor) && inTimeRange(act.timestamp)) {
            totalActivities += 1;
            if (act.type === "message_sent") {
              messagesCount += 1;
            }
          }
        }
      }
    }

    // Sort recent milestones newest first
    recentMilestones.sort((a, b) => b.timestamp - a.timestamp);

    // Derived conversion rates
    const bookingRate = assignedLeads > 0 ? Math.min(100, Math.round((bookedCount / assignedLeads) * 100)) : 0;
    const showRate = bookedCount > 0 ? Math.min(100, Math.round((attendedCount / bookedCount) * 100)) : 0;
    const closingRate = attendedCount > 0 ? Math.min(100, Math.round((enrolledCount / attendedCount) * 100)) : 0;
    const overallWinRate = assignedLeads > 0 ? ((enrolledCount / assignedLeads) * 100).toFixed(1) : "0";
    const avgTicket = enrolledCount > 0 ? Math.round(totalCash / enrolledCount) : 0;

    return {
      assignedLeads,
      bookedCount,
      attendedCount,
      enrolledCount,
      totalCash,
      messagesCount,
      followupsCompleted,
      totalActivities,
      bookingRate,
      showRate,
      closingRate,
      overallWinRate,
      avgTicket,
      channelCounts,
      stageCounts,
      recentMilestones: recentMilestones.slice(0, 10),
    };
  }, [conversations, currentStaff.name, timeFilter]);

  const roleStyle = getRoleBadgeStyle(currentStaff.role);
  const RoleIcon = roleStyle.icon;

  return (
    <div
      className="flex-1 flex flex-col min-w-0 min-h-0 overflow-y-auto"
      style={{
        background: "var(--bg-page)",
        color: "var(--text-primary)",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {/* ── Top Page Bar ── */}
      <div className="px-4 sm:px-8 pt-5 pb-3 max-w-7xl mx-auto w-full">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Profile
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Manage personal credentials, photo, and conversion analytics.
          </p>
        </div>
      </div>

      {/* ── Main Profile Container ── */}
      <div className="px-4 sm:px-8 pb-12 max-w-7xl mx-auto w-full space-y-6">
        {/* ── 1. IDENTITY & PROFILE PICTURE HERO CARD ── */}
        <div
          className="rounded-2xl p-6 sm:p-8 transition-all shadow-xs relative overflow-hidden"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-main)",
          }}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            {/* Left: Avatar with Camera Trigger + Identity Details */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-6 min-w-0">
              {/* Avatar Container with Hover/Touch Edit Action */}
              <div className="relative group shrink-0">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleAvatarFileSelect}
                />

                <div
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden relative shadow-sm flex items-center justify-center"
                  style={{
                    background: "var(--bg-pill)",
                    border: "2px solid var(--border-main)",
                  }}
                >
                  {currentStaff.avatar ? (
                    <img
                      src={currentStaff.avatar}
                      alt={currentStaff.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center font-bold text-3xl"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {currentStaff.name.charAt(0).toUpperCase()}
                    </div>
                  )}

                  {/* Camera overlay on hover / active */}
                  {isSelf && (
                    <button
                      type="button"
                      disabled={avatarSaving}
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white cursor-pointer"
                      aria-label="Change profile photo"
                    >
                      <Camera className="w-6 h-6 mb-1" />
                      <span className="text-[10px] font-medium tracking-wide">
                        {avatarSaving ? "Saving…" : "Change"}
                      </span>
                    </button>
                  )}
                </div>

                {/* Mobile camera trigger badge (always visible on bottom right) */}
                {isSelf && (
                  <button
                    type="button"
                    disabled={avatarSaving}
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute -bottom-1.5 -right-1.5 w-8 h-8 rounded-full flex items-center justify-center shadow-md sm:hidden transition-transform active:scale-95 cursor-pointer text-white"
                    style={{ background: "#0066FF" }}
                    aria-label="Upload photo"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Name, Role & Status Information */}
              <div className="min-w-0 flex-1 space-y-2">
                {/* Name Row with Inline Edit */}
                <div className="flex items-center gap-2.5 flex-wrap">
                  {isEditingName ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        className="px-2.5 py-1 text-lg font-bold rounded-lg border outline-none"
                        style={{
                          background: "var(--bg-input)",
                          borderColor: "var(--border-input)",
                          color: "var(--text-primary)",
                        }}
                        autoFocus
                      />
                      <button
                        type="button"
                        disabled={nameSaving}
                        onClick={handleSaveName}
                        className="px-3 py-1 text-xs font-semibold rounded-md text-white bg-[#0066FF] hover:opacity-90 disabled:opacity-50"
                      >
                        {nameSaving ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNameInput(currentStaff.name);
                          setIsEditingName(false);
                        }}
                        className="px-2 py-1 text-xs font-medium rounded-md hover:opacity-80"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h2
                        className="text-2xl sm:text-3xl font-extrabold tracking-tight"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {currentStaff.name}
                      </h2>
                      {isSelf && (
                        <button
                          type="button"
                          onClick={() => setIsEditingName(true)}
                          className="p-1 rounded-md hover:bg-[var(--bg-hover)] transition-colors"
                          style={{ color: "var(--text-muted)" }}
                          title="Edit name"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Subtitle / Role (without background) & Email */}
                <div
                  className="flex items-center gap-3 text-[13px] flex-wrap"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: "var(--text-primary)" }}>
                    <RoleIcon className="w-4 h-4" style={{ color: roleStyle.text }} />
                    {getRoleDisplayName(currentStaff.role)}
                  </span>
                  {currentStaff.email && (
                    <>
                      <span className="opacity-40">•</span>
                      <span>{currentStaff.email}</span>
                    </>
                  )}
                </div>

                {/* Actions row: Upload & Remove buttons */}
                {isSelf && (
                  <div className="flex items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      disabled={avatarSaving}
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 text-[12px] font-medium rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                      style={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border-main)",
                        color: "var(--text-primary)",
                      }}
                    >
                      {avatarSaving ? "Saving…" : currentStaff.avatar ? "Change photo" : "Upload photo"}
                    </button>

                    {currentStaff.avatar && (
                      <button
                        type="button"
                        disabled={avatarSaving}
                        onClick={handleRemoveAvatar}
                        className="px-3 py-1.5 text-[12px] font-medium rounded-lg transition-colors cursor-pointer text-[#FF3B30] hover:bg-[rgba(255,59,48,0.08)] disabled:opacity-50"
                        style={{
                          border: "1px solid var(--border-input)",
                          background: "transparent",
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                )}

                {/* Feedback notifications */}
                {avatarStatus && (
                  <p
                    className={`text-[12px] font-medium ${avatarStatus.ok ? "text-[#34C759]" : "text-[#FF3B30]"
                      }`}
                  >
                    {avatarStatus.msg}
                  </p>
                )}
                {nameStatus && <p className="text-[12px] font-medium text-[#0066FF]">{nameStatus}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* ── 2. PERFORMANCE ANALYTICS & CONVERSION FUNNEL ── */}
        <div className="space-y-4 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <BarChart2 className="w-5 h-5 text-[#0066FF]" />
                <h3 className="text-lg font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
                  Performance Analytics
                </h3>
              </div>
              <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                Key conversion rates, audition booking velocity, and revenue impact.
              </p>
            </div>

            {/* Time Filter Pills */}
            <div
              className="inline-flex p-1 rounded-xl shrink-0 self-start sm:self-auto"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)" }}
            >
              {(["all", "month", "week", "today"] as const).map((period) => {
                const active = timeFilter === period;
                const labels: Record<typeof period, string> = {
                  all: "All Time",
                  month: "This Month",
                  week: "This Week",
                  today: "Today",
                };
                return (
                  <button
                    key={period}
                    type="button"
                    onClick={() => setTimeFilter(period)}
                    className={`px-3 py-1 text-[12px] font-medium rounded-lg transition-colors ${active ? "font-semibold shadow-xs" : "hover:opacity-80"
                      }`}
                    style={
                      active
                        ? { background: "var(--bg-selected)", color: "var(--text-primary)" }
                        : { color: "var(--text-secondary)" }
                    }
                  >
                    {labels[period]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
            <KpiCard
              label="Assigned Leads"
              value={staffMetrics.assignedLeads}
              subtext="Total handled"
              icon={Users}
              iconColor="#0066FF"
            />
            <KpiCard
              label="Auditions Booked"
              value={staffMetrics.bookedCount}
              subtext={`${staffMetrics.bookingRate}% Booking Rate`}
              icon={Calendar}
              iconColor="#FF9500"
            />
            <KpiCard
              label="Auditions Attended"
              value={staffMetrics.attendedCount}
              subtext={`${staffMetrics.showRate}% Show-up Rate`}
              icon={CheckCircle2}
              iconColor="#34C759"
            />
            <KpiCard
              label="Enrolled Students"
              value={staffMetrics.enrolledCount}
              subtext={`${staffMetrics.closingRate}% Closing Rate`}
              icon={Award}
              iconColor="#AF52DE"
            />
            <KpiCard
              label="Tuition Recorded"
              value={`${staffMetrics.totalCash.toLocaleString()} SAR`}
              subtext={
                staffMetrics.enrolledCount > 0
                  ? `Avg ~${staffMetrics.avgTicket.toLocaleString()} SAR`
                  : "Tuition in"
              }
              icon={Banknote}
              iconColor="#34C759"
            />
            <KpiCard
              label="Activities Logged"
              value={staffMetrics.totalActivities}
              subtext={`${staffMetrics.messagesCount} Messages sent`}
              icon={Activity}
              iconColor="#5856D6"
            />
          </div>

          {/* Visual Funnel Card */}
          <div
            className="rounded-2xl p-4 sm:p-5 transition-all shadow-xs"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-main)",
            }}
          >
            <div className="mb-3.5">
              <h4 className="text-[14px] sm:text-[15px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
                Conversion Funnel
              </h4>
              <p className="text-[11px] sm:text-[12px]" style={{ color: "var(--text-secondary)" }}>
                End-to-end progression from incoming lead to registered music student.
              </p>
            </div>

            {/* Funnel Steps */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
              <FunnelStep
                step="1"
                title="Leads In"
                count={staffMetrics.assignedLeads}
                color="#0066FF"
              />
              <FunnelStep
                step="2"
                title="Auditions Booked"
                count={staffMetrics.bookedCount}
                color="#FF9500"
              />
              <FunnelStep
                step="3"
                title="Auditions Attended"
                count={staffMetrics.attendedCount}
                color="#34C759"
              />
              <FunnelStep
                step="4"
                title="Enrolled & Paid"
                count={staffMetrics.enrolledCount}
                color="#AF52DE"
                isLast
              />
            </div>
          </div>

          {/* Bottom Split: Channel Distribution & Recent Milestones */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Communication Channel Breakdown */}
            <div
              className="rounded-2xl p-6 transition-all shadow-xs"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-main)",
              }}
            >
              <h4 className="text-[15px] font-bold tracking-tight mb-1" style={{ color: "var(--text-primary)" }}>
                Channel Lead Distribution
              </h4>
              <p className="text-[12px] mb-5" style={{ color: "var(--text-secondary)" }}>
                Distribution of assigned inquiries across messaging networks.
              </p>

              <div className="space-y-4">
                {Object.entries(staffMetrics.channelCounts).map(([channel, count]) => {
                  const total =
                    staffMetrics.channelCounts.WhatsApp +
                    staffMetrics.channelCounts.Instagram +
                    staffMetrics.channelCounts.Messenger || 1;
                  const pct = Math.round((count / total) * 100);
                  const channelColor =
                    channel === "WhatsApp"
                      ? "#25D366"
                      : channel === "Instagram"
                        ? "#E1306C"
                        : "#0084FF";

                  return (
                    <div key={channel} className="space-y-1.5">
                      <div className="flex items-center justify-between text-[12px] font-medium">
                        <span style={{ color: "var(--text-primary)" }}>{channel}</span>
                        <span style={{ color: "var(--text-secondary)" }}>
                          {count} leads ({pct}%)
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-pill)" }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: channelColor }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent Milestones & Accomplishments */}
            <div
              className="rounded-2xl p-6 transition-all shadow-xs flex flex-col"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-main)",
              }}
            >
              <h4 className="text-[15px] font-bold tracking-tight mb-1" style={{ color: "var(--text-primary)" }}>
                Recent Accomplishments
              </h4>
              <p className="text-[12px] mb-4" style={{ color: "var(--text-secondary)" }}>
                Latest enrollments, audition bookings, and tuition recorded.
              </p>

              {staffMetrics.recentMilestones.length > 0 ? (
                <div className="space-y-2.5 overflow-y-auto max-h-64 pr-1">
                  {staffMetrics.recentMilestones.map((m) => (
                    <div
                      key={m.id}
                      className="p-3 rounded-xl flex items-center justify-between transition-colors hover:bg-[var(--bg-hover)]"
                      style={{ background: "var(--bg-panel)", border: "1px solid var(--border-main)" }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-[var(--bg-selected)] text-[#0066FF] flex items-center justify-center shrink-0">
                          {m.type === "enrollment" ? (
                            <Award className="w-4 h-4 text-[#AF52DE]" />
                          ) : m.type === "audition" ? (
                            <Calendar className="w-4 h-4 text-[#FF9500]" />
                          ) : (
                            <Banknote className="w-4 h-4 text-[#34C759]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                            {m.title} — {m.leadName}
                          </p>
                          {m.detail && (
                            <p className="text-[11px] truncate" style={{ color: "var(--text-secondary)" }}>
                              {m.detail}
                            </p>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => openChat(m.leadId)}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded-md text-[#0066FF] hover:bg-[rgba(0,102,255,0.08)] shrink-0 flex items-center gap-1"
                      >
                        <span>View</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  className="flex-1 flex flex-col items-center justify-center p-6 text-center"
                  style={{ color: "var(--text-muted)" }}
                >
                  <Award className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-[13px] font-medium">No recorded milestones yet for this period.</p>
                  <p className="text-[11px]">Book auditions or record payments to build your accomplishment log.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── KPI Card Component ── */
function KpiCard({
  label,
  value,
  subtext,
  icon: Icon,
  iconColor,
}: {
  label: string;
  value: string | number;
  subtext: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
}) {
  return (
    <div
      className="rounded-2xl p-4 transition-all shadow-xs flex flex-col justify-between"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-main)",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-medium truncate" style={{ color: "var(--text-secondary)" }}>
          {label}
        </span>
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${iconColor}15`, color: iconColor }}
        >
          <Icon className="w-3.5 h-3.5" />
        </div>
      </div>

      <div>
        <p className="text-xl sm:text-2xl font-extrabold tracking-tight" style={{ color: "var(--text-primary)" }}>
          {value}
        </p>
        <p className="text-[10px] font-medium truncate mt-0.5" style={{ color: "var(--text-muted)" }}>
          {subtext}
        </p>
      </div>
    </div>
  );
}

/* ── Funnel Step Component ── */
function FunnelStep({
  step,
  title,
  count,
  color,
  isLast = false,
}: {
  step: string;
  title: string;
  count: number;
  color: string;
  isLast?: boolean;
}) {
  return (
    <div
      className="p-3 sm:p-3.5 rounded-xl flex items-center justify-between transition-all"
      style={{ background: "var(--bg-panel)", border: "1px solid var(--border-main)" }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[11px] text-white shrink-0 shadow-2xs"
          style={{ background: color }}
        >
          {step}
        </span>
        <span className="text-[12px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
          {title}
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-2">
        <span className="text-lg sm:text-xl font-extrabold tracking-tight" style={{ color: "var(--text-primary)" }}>
          {count.toLocaleString()}
        </span>
        {!isLast && (
          <ChevronRight className="w-4 h-4 text-[var(--text-muted)] opacity-40 hidden lg:block -mr-1" />
        )}
      </div>
    </div>
  );
}
