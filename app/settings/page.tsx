"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useAuth, Role, ROLE_OPTIONS, getRoleDisplayName, normalizeRole, canManageTeamRole, canAccessRoute, isOperationRole } from "../components/AuthProvider";
import { organizeTeamMembersByRole, reconcileMemberPatchResponse } from "../utils/roles";
import { useCRM } from "../context/CRMContext";
import { useBranches } from "../lib/branches";
import { ClaudeSettingsTab } from "../components/ClaudeSettingsTab";
import { SlideOverChatDrawer, useSlideOverChatDrawer } from "../components/SlideOverChatDrawer";
import { ChevronDown, Check, Trash2, Search, X, AlertTriangle, Bell, BellOff } from "lucide-react";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatar?: string;
  active: boolean;
}

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

function NotificationSwitch({
  checked,
  disabled = false,
  labelledBy,
  onToggle,
}: {
  checked: boolean;
  disabled?: boolean;
  labelledBy: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={onToggle}
      className={`inline-flex items-center justify-center min-w-[44px] min-h-[44px] -my-2 -mr-1.5 shrink-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bg-banner)] ${
        disabled ? "opacity-45 cursor-not-allowed" : "cursor-pointer"
      }`}
    >
      <span
        className="relative w-11 h-6 rounded-full transition-colors duration-150 block"
        style={{
          background: checked ? "var(--bg-banner)" : "var(--bg-column)",
          border: `1px solid ${checked ? "var(--bg-banner)" : "var(--border-input)"}`,
        }}
      >
        <span
          className="absolute top-[2px] left-[2px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform duration-150"
          style={{ transform: checked ? "translateX(20px)" : "translateX(0)" }}
        />
      </span>
    </button>
  );
}

export default function SettingsPage() {
  const { user, updateCurrentUser, updateSessionToken, authFetch, canManageTeam: authCanManageTeam, roleDisplayName } = useAuth();

  // Profile state
  const [nameSaving, setNameSaving] = useState(false);
  const [nameStatus, setNameStatus] = useState<string | null>(null);

  // Avatar state (Chairman only)
  const isChairman = normalizeRole(user?.role) === "chairman";
  const {
    chatId: claudeDrawerChatId,
    showDetails: claudeShowChatDetails,
    setShowDetails: setClaudeShowChatDetails,
    isClosing: isClaudeDrawerClosing,
    panelRef: claudeDrawerPanelRef,
    open: openClaudeDrawer,
    close: closeClaudeDrawer,
    resetImmediate: resetClaudeDrawerImmediate,
    handleAnimationEnd: handleClaudeDrawerAnimationEnd,
  } = useSlideOverChatDrawer();
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarStatus, setAvatarStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Password state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwStatus, setPwStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  // Team state
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [maxSeats, setMaxSeats] = useState(25);
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [addMode, setAddMode] = useState<"invite" | "password">("invite");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newMemberPw, setNewMemberPw] = useState("");
  const [newRole, setNewRole] = useState<Role>("admission_officer");
  const [addingUser, setAddingUser] = useState(false);
  const [addStatus, setAddStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [teamStatus, setTeamStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [updatingMemberIds, setUpdatingMemberIds] = useState<Record<string, boolean>>({});

  // Edit user state
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<Role>("admission_officer");
  const [editActive, setEditActive] = useState(true);
  const [editAvatar, setEditAvatar] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // Deactivate confirmation state
  const [deactivatingMember, setDeactivatingMember] = useState<TeamMember | null>(null);
  const [deactivateSaving, setDeactivateSaving] = useState(false);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  // Delete confirmation state
  const [deletingMember, setDeletingMember] = useState<TeamMember | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Open action-menu dropdown per row
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const [nameInput, setNameInput] = useState<string | null>(null);
  const displayName = nameInput ?? (user?.name || "");

  const canManageTeam = authCanManageTeam || canManageTeamRole(user?.role);

  // Branch management state
  const { branchGroups, regions: existingRegions, refresh: refreshBranches } = useBranches();
  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchRegion, setNewBranchRegion] = useState("");
  const [addingBranch, setAddingBranch] = useState(false);
  const [branchStatus, setBranchStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const {
    conversations,
    refresh: refreshConversations,
    pushSupported,
    pushEnabled,
    pushPermission,
    pushBusy,
    toggleDevicePush,
    testDevicePush,
  } = useCRM();
  const isOperation = isOperationRole(user?.role);
  const canUseInboxNotifications =
    canAccessRoute(user?.role, "/") || canAccessRoute(user?.role, "/operation-inbox");
  const [pushStatus, setPushStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const pushStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pushStatusTimerRef.current) {
        clearTimeout(pushStatusTimerRef.current);
      }
    };
  }, []);

  const showTimedPushStatus = (status: { ok: boolean; msg: string }) => {
    if (pushStatusTimerRef.current) {
      clearTimeout(pushStatusTimerRef.current);
      pushStatusTimerRef.current = null;
    }
    setPushStatus(status);
    pushStatusTimerRef.current = setTimeout(() => {
      setPushStatus(null);
      pushStatusTimerRef.current = null;
    }, 4500);
  };

  const handleToggleDevicePush = async () => {
    const wasEnabled = pushEnabled;
    const res = await toggleDevicePush();
    if (!res.ok) {
      showTimedPushStatus({
        ok: false,
        msg: res.error || "Unable to update notification permission.",
      });
      return;
    }
    showTimedPushStatus({
      ok: true,
      msg: wasEnabled
        ? "Notifications turned off for this browser."
        : "Notifications enabled using your device's default sound.",
    });
  };

  const handleTestDevicePush = async () => {
    const res = await testDevicePush();
    if (!res.ok) {
      showTimedPushStatus({
        ok: false,
        msg: res.error || "Unable to deliver test notification.",
      });
      return;
    }
    showTimedPushStatus({
      ok: true,
      msg: "Test notification sent.",
    });
  };

  const getAssignedLeadCount = (memberName: string): number => {
    const clean = memberName.trim().toLowerCase();
    if (!clean) return 0;
    return conversations.reduce(
      (count, conv) => (conv.agent && conv.agent.trim().toLowerCase() === clean ? count + 1 : count),
      0
    );
  };
  const [branchSearch, setBranchSearch] = useState("");
  const [selectedRegionFilter, setSelectedRegionFilter] = useState("ALL");

  // Deletion modal & consequence state
  const [branchToDelete, setBranchToDelete] = useState<{ id: string; name: string; region: string; fullName: string } | null>(null);
  const [branchUsageStats, setBranchUsageStats] = useState<{ totalConversations: number; bookedAuditions: number } | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [isDeletingBranch, setIsDeletingBranch] = useState(false);

  const filteredBranchGroups = useMemo(() => {
    const q = branchSearch.toLowerCase().trim();
    return branchGroups
      .filter((g) => {
        if (selectedRegionFilter !== "ALL" && g.region.toLowerCase() !== selectedRegionFilter.toLowerCase()) {
          return false;
        }
        return true;
      })
      .map((g) => {
        if (!q) return g;
        const matchRegion = g.region.toLowerCase().includes(q);
        if (matchRegion) return g;
        const matchingBranches = g.branches.filter(
          (b) =>
            b.name.toLowerCase().includes(q) ||
            b.fullName.toLowerCase().includes(q)
        );
        if (matchingBranches.length > 0) {
          return { ...g, branches: matchingBranches };
        }
        return null;
      })
      .filter(Boolean) as typeof branchGroups;
  }, [branchGroups, branchSearch, selectedRegionFilter]);

  // Instant local calculation of affected records (0ms)
  const localBranchStats = useMemo(() => {
    if (!branchToDelete) return { total: 0, auditions: 0 };
    const nameLower = branchToDelete.name.toLowerCase();
    const fullLower = branchToDelete.fullName.toLowerCase();
    const matches = conversations.filter((c) => {
      if (!c.branch) return false;
      const bLower = c.branch.toLowerCase();
      return bLower === fullLower || bLower === nameLower || bLower.startsWith(nameLower);
    });
    const auditions = matches.filter((c) => c.pipeline === "Audition Booked" || Boolean(c.auditionDate));
    return { total: matches.length, auditions: auditions.length };
  }, [branchToDelete, conversations]);

  // Fetch full server-wide usage stats when modal opens
  useEffect(() => {
    if (!branchToDelete) {
      setBranchUsageStats(null);
      return;
    }
    let cancelled = false;
    setLoadingUsage(true);
    authFetch(`/crm-api/branches/${branchToDelete.id}/usage`)
      .then((r) => (r.ok ? r.json().catch(() => null) : null))
      .then((data) => {
        if (!cancelled && data?.success && data.usage) {
          setBranchUsageStats(data.usage);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingUsage(false);
      });
    return () => { cancelled = true; };
  }, [branchToDelete, authFetch]);

  // Settings tab: "general", "branches", or Chairman-only "claude"
  const [activeTab, setActiveTab] = useState<"general" | "branches" | "claude">("general");

  // Region dropdown state in add branch container
  const [isRegionOpen, setIsRegionOpen] = useState(false);
  const [customRegionInput, setCustomRegionInput] = useState("");
  const regionMenuRef = useRef<HTMLDivElement>(null);

  const allRegionsList = useMemo(() => {
    const defaults = ["Riyadh", "Jeddah", "Khobar", "Other"];
    const list = [...defaults];
    existingRegions.forEach((r) => {
      if (!list.some((existing) => existing.toLowerCase() === r.toLowerCase())) {
        list.push(r);
      }
    });
    return list;
  }, [existingRegions]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (regionMenuRef.current && !regionMenuRef.current.contains(e.target as Node)) {
        setIsRegionOpen(false);
      }
    };
    if (isRegionOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
      return () => document.removeEventListener("mousedown", handleOutsideClick);
    }
  }, [isRegionOpen]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      let cancelled = false;
      const resolveHashTab = (): "general" | "branches" | "claude" => {
        const h = window.location.hash.toLowerCase();
        if (h === "#branches") return "branches";
        if ((h === "#claude" || h.startsWith("#claude-")) && isChairman) return "claude";
        return "general";
      };
      queueMicrotask(() => {
        if (!cancelled) {
          setActiveTab(resolveHashTab());
        }
      });
      const onHashChange = () => {
        setActiveTab(resolveHashTab());
      };
      window.addEventListener("hashchange", onHashChange);
      return () => {
        cancelled = true;
        window.removeEventListener("hashchange", onHashChange);
      };
    }
  }, [isChairman]);

  const handleTabChange = (tab: "general" | "branches" | "claude") => {
    if (tab === "claude" && !isChairman) return;
    if (tab !== "claude") resetClaudeDrawerImmediate();
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      if (tab === "branches") {
        window.location.hash = "branches";
      } else if (tab === "claude") {
        window.location.hash = "claude";
      } else {
        history.replaceState(null, "", window.location.pathname);
      }
    }
  };

  // Close modals and dropdown on Escape / outside click
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editingMember && !editSaving) setEditingMember(null);
        if (deactivatingMember && !deactivateSaving) setDeactivatingMember(null);
        if (deletingMember && !deleteSaving) setDeletingMember(null);
        if (branchToDelete && !isDeletingBranch) setBranchToDelete(null);
        setOpenMenuId(null);
        setIsRegionOpen(false);
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-action-menu]")) setOpenMenuId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [
    editingMember,
    editSaving,
    deactivatingMember,
    deactivateSaving,
    deletingMember,
    deleteSaving,
    branchToDelete,
    isDeletingBranch,
  ]);

  // Fetch team
  useEffect(() => {
    let ignore = false;
    async function loadTeam() {
      if (!canManageTeam) {
        if (!ignore) setLoadingTeam(false);
        return;
      }
      try {
        const res = await authFetch("/crm-api/auth/users");
        const data = res.ok ? await res.json().catch(() => null) : null;
        if (!ignore) {
          if (data?.success && Array.isArray(data.users)) {
            setTeam(data.users);
            if (typeof data.maxSeats === "number") {
              setMaxSeats(data.maxSeats);
            }
          } else {
            setTeam([]);
          }
        }
      } catch {
        if (!ignore) setTeam([]);
      } finally {
        if (!ignore) setLoadingTeam(false);
      }
    }

    loadTeam();
    return () => {
      ignore = true;
    };
  }, [canManageTeam, authFetch]);

  // Save profile name
  const handleSaveName = async () => {
    if (!displayName.trim()) return;
    setNameSaving(true);
    setNameStatus(null);
    try {
      const res = await authFetch("/crm-api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: displayName.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        updateCurrentUser({ name: displayName.trim() });
        setNameStatus("Name updated successfully!");
        setTimeout(() => setNameStatus(null), 3000);
      } else {
        setNameStatus(data.error || "Failed to update name");
      }
    } catch {
      setNameStatus("Network error. Unable to reach server.");
    } finally {
      setNameSaving(false);
    }
  };

  // Upload or update profile picture (Chairman only)
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
      const res = await authFetch("/crm-api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: displayName.trim(), avatar: resizedBase64 }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        const savedAvatar = data.user.avatar || resizedBase64;
        updateCurrentUser({ avatar: savedAvatar });
        setAvatarStatus({ ok: true, msg: "Profile picture updated successfully!" });
        setTimeout(() => setAvatarStatus(null), 3500);
      } else {
        setAvatarStatus({ ok: false, msg: data.error || "Failed to update profile picture." });
      }
    } catch {
      setAvatarStatus({ ok: false, msg: "Network error. Unable to reach server." });
    } finally {
      setAvatarSaving(false);
    }
  };

  // Remove profile picture (Chairman only)
  const handleRemoveAvatar = async () => {
    setAvatarSaving(true);
    setAvatarStatus(null);
    try {
      const res = await authFetch("/crm-api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: displayName.trim(), avatar: "" }),
      });
      const data = await res.json();
      if (data.success) {
        updateCurrentUser({ avatar: "" });
        setAvatarStatus({ ok: true, msg: "Profile picture removed." });
        setTimeout(() => setAvatarStatus(null), 3000);
      } else {
        setAvatarStatus({ ok: false, msg: data.error || "Failed to remove profile picture." });
      }
    } catch {
      setAvatarStatus({ ok: false, msg: "Network error. Unable to reach server." });
    } finally {
      setAvatarSaving(false);
    }
  };

  // Change password
  const handleChangePassword = async () => {
    setPwStatus(null);
    if (!newPassword) {
      setPwStatus({ ok: false, msg: "Please enter a new password." });
      return;
    }
    if (newPassword.length < 6) {
      setPwStatus({ ok: false, msg: "Password must be at least 6 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwStatus({ ok: false, msg: "Passwords do not match." });
      return;
    }

    setPwSaving(true);
    try {
      const res = await authFetch("/crm-api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        if (typeof data.token === "string" && data.token) {
          updateSessionToken(data.token);
        }
        setPwStatus({ ok: true, msg: "Password changed successfully!" });
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => setPwStatus(null), 4000);
      } else {
        setPwStatus({ ok: false, msg: data.error || "Failed to change password." });
      }
    } catch {
      setPwStatus({ ok: false, msg: "Network error. Unable to reach server." });
    } finally {
      setPwSaving(false);
    }
  };

  const activeSeats = team.filter((m) => m.active).length;
  const isSeatLimitReached = activeSeats >= maxSeats;
  const organizedTeamGroups = useMemo(() => organizeTeamMembersByRole(team), [team]);

  // Update team member role or active state
  const handleUpdateMember = async (id: string, updates: Partial<TeamMember>) => {
    if (updatingMemberIds[id]) return;
    const previousMember = team.find((m) => m.id === id);
    if (!previousMember) return;
    setTeamStatus(null);

    // If activating a member, check if seats are already full
    if (updates.active === true && !previousMember.active && isSeatLimitReached) {
      setTeamStatus({
        ok: false,
        msg: `Cannot activate ${previousMember.name}. All ${maxSeats} seats are currently in use. Deactivate another member first.`,
      });
      return;
    }

    setUpdatingMemberIds((prev) => ({ ...prev, [id]: true }));
    // Optimistic update
    setTeam((prev) => prev.map((m) => (m.id === id ? { ...m, ...updates } : m)));

    try {
      const res = await authFetch(`/crm-api/auth/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json().catch(() => null);
      const reconciled = reconcileMemberPatchResponse({
        previousMember,
        requestedRole: updates.role,
        resOk: res.ok,
        payload: data,
      });

      setTeam((prev) => prev.map((m) => (m.id === id ? reconciled.member : m)));

      if (!reconciled.ok) {
        setTeamStatus({ ok: false, msg: reconciled.error });
        return;
      }

      if (id === user?.id || previousMember.email === user?.email) {
        updateCurrentUser({
          name: reconciled.member.name,
          email: reconciled.member.email,
          role: reconciled.member.role,
          avatar: reconciled.member.avatar,
        });
      }

      const roleLabel = getRoleDisplayName(reconciled.member.role);
      setTeamStatus({
        ok: true,
        msg:
          updates.role !== undefined
            ? `${reconciled.member.name}'s role updated to ${roleLabel}.`
            : `${reconciled.member.name} updated successfully.`,
      });
      setTimeout(() => {
        setTeamStatus((curr) => (curr?.ok ? null : curr));
      }, 3500);
    } catch (err) {
      console.error("Failed to update user:", err);
      setTeam((prev) => prev.map((m) => (m.id === id ? previousMember : m)));
      setTeamStatus({ ok: false, msg: "Network error. Unable to reach server." });
    } finally {
      setUpdatingMemberIds((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  // Open edit modal
  const handleOpenEdit = (member: TeamMember) => {
    setEditingMember(member);
    setEditName(member.name);
    setEditEmail(member.email);
    setEditRole(normalizeRole(member.role));
    setEditActive(member.active);
    setEditAvatar(member.avatar || "");
    setEditPassword("");
    setEditError(null);
  };

  // Save edit modal
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    setEditError(null);

    const trimmedName = editName.trim();
    const trimmedEmail = editEmail.trim().toLowerCase();

    if (!trimmedName) {
      setEditError("Name is required.");
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setEditError("A valid email address is required.");
      return;
    }
    if (editPassword && editPassword.length < 6) {
      setEditError("Password must be at least 6 characters.");
      return;
    }

    // Seat limit check if activating a currently inactive member
    if (editActive && !editingMember.active && isSeatLimitReached) {
      setEditError(`Cannot activate ${trimmedName}. All ${maxSeats} seats are currently in use.`);
      return;
    }

    setEditSaving(true);
    try {
      const payload: {
        name: string;
        email: string;
        role: Role;
        active: boolean;
        password?: string;
        avatar?: string;
      } = {
        name: trimmedName,
        email: trimmedEmail,
        role: editRole,
        active: editActive,
        avatar: editAvatar,
      };

      if (editPassword.trim()) {
        payload.password = editPassword.trim();
      }

      const res = await authFetch(`/crm-api/auth/users/${editingMember.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      const reconciled = reconcileMemberPatchResponse({
        previousMember: editingMember,
        requestedRole: editRole,
        resOk: res.ok,
        payload: data,
      });

      if (data?.success && data?.user) {
        const persisted = {
          ...reconciled.member,
          avatar: data.user.avatar !== undefined ? data.user.avatar : editAvatar,
        };
        setTeam((prev) => prev.map((m) => (m.id === editingMember.id ? persisted : m)));

        if (editingMember.id === user?.id || editingMember.email === user?.email) {
          updateCurrentUser({
            name: persisted.name,
            email: persisted.email,
            role: persisted.role,
            avatar: persisted.avatar,
          });
        }
      }

      if (reconciled.ok) {
        setTeamStatus({ ok: true, msg: `User ${reconciled.member.name} updated successfully.` });
        setTimeout(() => {
          setTeamStatus((curr) => (curr?.ok ? null : curr));
        }, 3500);
        setEditingMember(null);
      } else {
        setEditError(reconciled.error);
      }
    } catch {
      setEditError("Network error. Unable to reach server.");
    } finally {
      setEditSaving(false);
    }
  };

  // Open deactivate confirmation modal
  const handleOpenDeactivate = (member: TeamMember) => {
    setDeactivatingMember(member);
    setDeactivateError(null);
  };

  // Confirm deactivate member
  const handleConfirmDeactivate = async () => {
    if (!deactivatingMember) return;
    setDeactivateSaving(true);
    setDeactivateError(null);

    try {
      const res = await authFetch(`/crm-api/auth/users/${deactivatingMember.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: false }),
      });
      const data = await res.json();
      if (data.success) {
        const deactivatedName = deactivatingMember.name;
        const keptLeadsCount = getAssignedLeadCount(deactivatedName);
        setTeam((prev) =>
          prev.map((m) => (m.id === deactivatingMember.id ? { ...m, active: false } : m))
        );
        setAddStatus({
          ok: true,
          msg:
            keptLeadsCount > 0
              ? `${deactivatedName} deactivated. Active sessions were closed; ${keptLeadsCount} assigned ${keptLeadsCount === 1 ? "lead remains" : "leads remain"} assigned.`
              : `${deactivatedName} deactivated. All active sessions have been closed.`,
        });
        setTimeout(() => setAddStatus(null), 4500);
        setDeactivatingMember(null);
      } else {
        setDeactivateError(data.error || "Failed to deactivate member.");
      }
    } catch {
      setDeactivateError("Network error. Unable to reach server.");
    } finally {
      setDeactivateSaving(false);
    }
  };

  // Open delete modal
  const handleOpenDelete = (member: TeamMember) => {
    setDeletingMember(member);
    setDeleteError(null);
  };

  // Confirm delete member
  const handleConfirmDelete = async () => {
    if (!deletingMember) return;
    setDeleteSaving(true);
    setDeleteError(null);

    try {
      const res = await authFetch(`/crm-api/auth/users/${deletingMember.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        const deletedName = deletingMember.name;
        const unassignedCount = Number(data.unassignedCount || 0);
        setTeam((prev) => prev.filter((m) => m.id !== deletingMember.id));
        if (unassignedCount > 0) {
          refreshConversations();
        }
        setAddStatus({
          ok: true,
          msg:
            unassignedCount > 0
              ? `User ${deletedName} deleted successfully. ${unassignedCount} assigned ${unassignedCount === 1 ? "lead was" : "leads were"} moved to Unassigned.`
              : `User ${deletedName} deleted successfully.`,
        });
        setTimeout(() => setAddStatus(null), 4500);
        setDeletingMember(null);
      } else {
        setDeleteError(data.error || "Failed to delete member.");
      }
    } catch {
      setDeleteError("Network error. Unable to reach server.");
    } finally {
      setDeleteSaving(false);
    }
  };

  // Add new team member
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddStatus(null);

    if (isSeatLimitReached) {
      setAddStatus({
        ok: false,
        msg: `Seat limit reached (${maxSeats}/${maxSeats} seats used). Deactivate an existing member to free up a seat.`,
      });
      return;
    }

    if (!newName.trim() || !newEmail.trim()) {
      setAddStatus({ ok: false, msg: "Name and email are required." });
      return;
    }

    const passwordToSend = addMode === "password" ? newMemberPw : "tempPass123!";
    if (addMode === "password" && (!newMemberPw || newMemberPw.length < 6)) {
      setAddStatus({ ok: false, msg: "Password must be at least 6 characters." });
      return;
    }

    setAddingUser(true);
    try {
      const res = await authFetch("/crm-api/auth/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          email: newEmail.trim().toLowerCase(),
          password: passwordToSend,
          role: newRole,
        }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        setTeam((prev) => [...prev, { ...data.user, active: true }]);
        setAddStatus({ ok: true, msg: `User ${newName} added as ${newRole}!` });
        setNewName("");
        setNewEmail("");
        setNewMemberPw("");
        setTimeout(() => setAddStatus(null), 4000);
      } else {
        setAddStatus({ ok: false, msg: data.error || "Failed to add user." });
      }
    } catch {
      setAddStatus({ ok: false, msg: "Network error. Unable to reach server." });
    } finally {
      setAddingUser(false);
    }
  };

  // ── Branch handlers ──────────────────────────────────────────────────────
  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimName = newBranchName.trim();
    const trimRegion = newBranchRegion.trim();
    if (!trimName || !trimRegion) {
      setBranchStatus({ ok: false, msg: "Branch name and region are required." });
      return;
    }
    setAddingBranch(true);
    setBranchStatus(null);
    try {
      const res = await authFetch("/crm-api/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimName, region: trimRegion }),
      });
      const data = await res.json();
      if (data.success) {
        setNewBranchName("");
        setNewBranchRegion("");
        setBranchStatus({ ok: true, msg: `Branch "${data.branch.name}" added to ${data.branch.region}!` });
        refreshBranches();
        setTimeout(() => setBranchStatus(null), 3500);
      } else {
        setBranchStatus({ ok: false, msg: data.error || "Failed to add branch." });
      }
    } catch {
      setBranchStatus({ ok: false, msg: "Network error." });
    } finally {
      setAddingBranch(false);
    }
  };

  const handleConfirmDeleteBranch = async () => {
    if (!branchToDelete) return;
    setIsDeletingBranch(true);
    try {
      const res = await authFetch(`/crm-api/branches/${branchToDelete.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        refreshBranches();
        setBranchStatus({ ok: true, msg: `Branch "${branchToDelete.name}" removed.` });
        setTimeout(() => setBranchStatus(null), 3000);
        setBranchToDelete(null);
      } else {
        setBranchStatus({ ok: false, msg: data.error || "Failed to remove branch." });
      }
    } catch {
      setBranchStatus({ ok: false, msg: "Network error." });
    } finally {
      setIsDeletingBranch(false);
    }
  };

  const totalBranches = branchGroups.reduce((sum, g) => sum + g.branches.length, 0);

  const roleLabel = roleDisplayName || getRoleDisplayName(user?.role);

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 pb-12 w-full" style={{ background: "var(--bg-page)", color: "var(--text-primary)", WebkitOverflowScrolling: "touch" }}>
      <div className="max-w-4xl mx-auto">
        {/* Header & Simple Formal Tabs */}
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>
            Settings
          </h1>

          {!isOperation && (
          <div className="flex items-center gap-1 p-0.5 rounded-[8px]" style={{ background: "var(--bg-pill)", border: "1px solid var(--border-input)" }}>
            <button
              type="button"
              onClick={() => handleTabChange("general")}
              className="h-[24px] px-3 text-[11px] font-semibold rounded-[6px] transition-colors cursor-pointer"
              style={activeTab === "general"
                ? { background: "#0066FF", color: "#fff" }
                : { background: "transparent", color: "var(--text-secondary)" }
              }
            >
              General
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("branches")}
              className="h-[24px] px-3 text-[11px] font-semibold rounded-[6px] transition-colors cursor-pointer"
              style={activeTab === "branches"
                ? { background: "#0066FF", color: "#fff" }
                : { background: "transparent", color: "var(--text-secondary)" }
              }
            >
              Branches
            </button>
            {isChairman && (
              <button
                type="button"
                onClick={() => handleTabChange("claude")}
                className="h-[24px] px-3 text-[11px] font-semibold rounded-[6px] transition-colors cursor-pointer"
                style={activeTab === "claude"
                  ? { background: "var(--bg-banner)", color: "#fff" }
                  : { background: "transparent", color: "var(--text-secondary)" }
                }
              >
                Claude
              </button>
            )}
          </div>
          )}
        </div>

      {/* ── GENERAL TAB CONTENT ─────────────────────────────────────────── */}
      {activeTab === "general" && (
        <>
          {/* Your account Card */}
          <div
        className="rounded-xl p-5 mb-5"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-main)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <h2 className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
          Your account
        </h2>
        <p className="text-[11px] mb-4 mt-0.5" style={{ color: "var(--text-secondary)" }}>
          Signed in as {user?.email || "user@tchaikovsky.com"} · {roleLabel}
        </p>

        {/* Profile picture */}
        <div className="mb-4">
          <label className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>
            Profile picture
          </label>
          <div className="flex items-center gap-3.5">
            <div className="relative shrink-0">
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt={displayName || "Profile picture"}
                  className="w-14 h-14 rounded-full object-cover shadow-xs"
                  style={{ border: "1px solid var(--border-input)" }}
                />
              ) : (
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center font-semibold text-[16px] shadow-xs"
                  style={{
                    background: "var(--bg-pill)",
                    border: "1px solid var(--border-input)",
                    color: "var(--text-secondary)",
                  }}
                >
                  {(displayName || user?.name || "U").charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarFileSelect}
                />
                <button
                  type="button"
                  disabled={avatarSaving}
                  onClick={() => fileInputRef.current?.click()}
                  className="h-[28px] px-3 text-[12px] font-medium rounded-[6px] transition-colors cursor-pointer disabled:opacity-50"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-main)",
                    color: "var(--text-primary)",
                  }}
                >
                  {avatarSaving ? "Saving…" : user?.avatar ? "Change photo" : "Upload photo"}
                </button>

                {user?.avatar && (
                  <button
                    type="button"
                    disabled={avatarSaving}
                    onClick={handleRemoveAvatar}
                    className="h-[28px] px-3 text-[12px] font-medium rounded-[6px] transition-colors cursor-pointer text-[#FF3B30] hover:bg-[rgba(255,59,48,0.06)] disabled:opacity-50"
                    style={{
                      border: "1px solid var(--border-input)",
                      background: "transparent",
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                JPG, PNG, or WebP. Automatically optimized.
              </p>
              {avatarStatus && (
                <p
                  className={`text-[11px] font-medium ${
                    avatarStatus.ok ? "text-[#0066FF]" : "text-[#FF3B30]"
                  }`}
                >
                  {avatarStatus.msg}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Display name */}
        <div className="mb-4">
          <label className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>
            Display name
          </label>
          <div className="flex items-center">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setNameInput(e.target.value)}
              className="flex-1 max-w-sm h-[28px] px-2.5 text-[12px] rounded-[6px] outline-none transition-colors focus:border-[#0066FF]"
              style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)", color: "var(--text-primary)" }}
            />
            <button
              onClick={handleSaveName}
              disabled={nameSaving}
              className="h-[28px] px-3.5 ml-2 text-[12px] font-medium rounded-[6px] transition-colors cursor-pointer"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)", color: "var(--text-primary)" }}
            >
              {nameSaving ? "Saving…" : "Save name"}
            </button>
          </div>
          {nameStatus && (
            <p className="text-[11px] mt-1.5 font-medium text-[#0066FF]">{nameStatus}</p>
          )}
        </div>

        <div className="my-4" style={{ borderBottom: "1px solid var(--border-main)" }} />

        {/* Change password */}
        <div>
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1 w-full sm:max-w-[220px]">
              <label className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>
                New password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-[28px] px-2.5 text-[12px] rounded-[6px] outline-none transition-colors focus:border-[#0066FF]"
                style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)", color: "var(--text-primary)" }}
              />
            </div>
            <div className="flex-1 w-full sm:max-w-[220px]">
              <label className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>
                Confirm
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-[28px] px-2.5 text-[12px] rounded-[6px] outline-none transition-colors focus:border-[#0066FF]"
                style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)", color: "var(--text-primary)" }}
              />
            </div>
            <button
              onClick={handleChangePassword}
              disabled={pwSaving}
              className="h-[28px] px-3.5 text-[12px] font-medium text-white bg-[#0066FF] rounded-[6px] hover:bg-blue-700 transition-colors shadow-sm cursor-pointer whitespace-nowrap"
            >
              {pwSaving ? "Updating…" : "Change password"}
            </button>
          </div>
          {pwStatus && (
            <p className={`text-[11px] mt-2 font-medium ${pwStatus.ok ? "text-green-600" : "text-[#FF3B30]"}`}>
              {pwStatus.msg}
            </p>
          )}
        </div>
      </div>

      {/* Notifications Card */}
      {canUseInboxNotifications && (
        <div
          className="rounded-xl p-5 mb-5"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-main)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <div className="flex items-start justify-between gap-3 sm:gap-4">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 transition-colors"
                style={
                  pushEnabled
                    ? {
                        background: "var(--bg-banner)",
                        border: "1px solid var(--bg-banner)",
                        color: "#ffffff",
                      }
                    : {
                        background: "var(--bg-pill)",
                        border: "1px solid var(--border-main)",
                        color: "var(--text-muted)",
                      }
                }
              >
                {pushEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2
                    id="device-push-heading"
                    className="text-[13px] font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    New message notifications
                  </h2>
                  <span
                    className="px-1.5 py-0.5 text-[10px] font-semibold rounded-md"
                    style={
                      pushEnabled
                        ? {
                            background: "var(--bg-selected)",
                            border: "1px solid var(--border-main)",
                            color: "var(--text-primary)",
                          }
                        : {
                            background: "var(--bg-pill)",
                            border: "1px solid var(--border-main)",
                            color: "var(--text-secondary)",
                          }
                    }
                  >
                    {!pushSupported
                      ? "Unavailable"
                      : pushPermission === "denied"
                      ? "Blocked"
                      : pushEnabled
                      ? "Enabled"
                      : "Off"}
                  </span>
                </div>
                <p className="text-[11px] mt-1 leading-relaxed max-w-xl" style={{ color: "var(--text-secondary)" }}>
                  Shows a device notification with your system&apos;s default sound whenever any lead sends a new message, whether the CRM tab is open, minimized, or closed. Click a notification to open that conversation.
                </p>
              </div>
            </div>

            <NotificationSwitch
              checked={pushEnabled}
              disabled={!pushSupported || pushBusy || pushPermission === "denied"}
              labelledBy="device-push-heading"
              onToggle={() => {
                void handleToggleDevicePush();
              }}
            />
          </div>

          <div
            className="mt-4 pt-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
            style={{ borderTop: "1px solid var(--border-main)" }}
          >
            <p
              role="status"
              aria-live="polite"
              className="text-[11px]"
              style={{
                color: pushStatus
                  ? pushStatus.ok
                    ? "var(--text-primary)"
                    : "#FF3B30"
                  : pushPermission === "denied"
                  ? "#FF3B30"
                  : "var(--text-muted)",
              }}
            >
              {pushStatus
                ? pushStatus.msg
                : !pushSupported
                ? "Requires HTTPS and a browser that supports Web Push."
                : pushPermission === "denied"
                ? "Blocked in browser site settings. Allow notifications for this site and reload to enable."
                : "Uses your device default notification sound. Cleared automatically on sign out."}
            </p>

            <button
              type="button"
              disabled={!pushSupported || pushBusy || pushPermission === "denied"}
              onClick={() => {
                void handleTestDevicePush();
              }}
              className={`inline-flex items-center justify-center gap-1.5 w-full sm:w-auto min-h-[44px] sm:min-h-[28px] px-3 text-[12px] font-medium rounded-[6px] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bg-banner)] ${
                !pushSupported || pushBusy || pushPermission === "denied"
                  ? "opacity-45 cursor-not-allowed"
                  : "cursor-pointer hover:bg-[var(--bg-hover)]"
              }`}
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-main)",
                color: "var(--text-primary)",
              }}
            >
              <Bell className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-secondary)" }} />
              {pushBusy ? "Working…" : "Test notification"}
            </button>
          </div>
        </div>
      )}

      {/* Team Card (hidden for Operation role — personal settings & notifications only) */}
      {!isOperation && (
        <>
      <div
        className="rounded-xl p-5 shadow-sm overflow-hidden mb-5"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
            Team
          </h2>
          <span
            className="text-[11px] font-medium"
            style={{ color: isSeatLimitReached ? "#FF3B30" : "var(--text-secondary)" }}
          >
            {activeSeats} / {maxSeats} seats used{isSeatLimitReached ? " (Limit reached)" : ""}
          </span>
        </div>

        {teamStatus && (
          <div
            role="status"
            className="mb-3 px-3 py-2 rounded-lg text-[11px] font-medium flex items-center justify-between gap-2"
            style={{
              background: teamStatus.ok ? "rgba(52, 199, 89, 0.1)" : "rgba(255, 59, 48, 0.08)",
              border: `1px solid ${teamStatus.ok ? "rgba(52, 199, 89, 0.25)" : "rgba(255, 59, 48, 0.2)"}`,
              color: teamStatus.ok ? "#1e7e34" : "#FF3B30",
            }}
          >
            <span>{teamStatus.msg}</span>
            {!teamStatus.ok && (
              <button
                type="button"
                onClick={() => setTeamStatus(null)}
                className="text-[10px] underline shrink-0 cursor-pointer"
              >
                Dismiss
              </button>
            )}
          </div>
        )}

        {loadingTeam ? (
          <div className="py-6 text-center text-[12px]" style={{ color: "var(--text-muted)", borderTop: "1px solid var(--border-main)" }}>
            Loading team members…
          </div>
        ) : organizedTeamGroups.length === 0 ? (
          <div className="py-6 text-center text-[12px]" style={{ color: "var(--text-muted)", borderTop: "1px solid var(--border-main)" }}>
            No team members found.
          </div>
        ) : (
          <div className="space-y-4">
            {organizedTeamGroups.map((group) => (
              <section key={group.key} aria-label={group.label}>
                <div
                  className="flex items-center justify-between py-1.5"
                  style={{ borderBottom: "1px solid var(--border-main)" }}
                >
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {group.label}
                  </span>
                  <span
                    className="text-[10px] font-medium tabular-nums"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {group.members.length}
                  </span>
                </div>
                {group.members.map((member) => {
            const isSelf = member.id === user?.id || member.email === user?.email;
            const normMemberRole = normalizeRole(member.role);
            const isChairmanMember = normMemberRole === "chairman";
            const userIsChairman = normalizeRole(user?.role) === "chairman";
            const canEditThisMember = canManageTeam && (!isChairmanMember || userIsChairman);
            return (
              <div
                key={member.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 py-3"
                style={{ borderBottom: "1px solid var(--border-main)" }}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {member.avatar ? (
                    <img
                      src={member.avatar}
                      alt={member.name}
                      className="w-8 h-8 rounded-full object-cover shrink-0 shadow-xs"
                      style={{ border: "1px solid var(--border-input)" }}
                    />
                  ) : (
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center font-semibold text-[11px] shrink-0"
                      style={{
                        background: "var(--bg-pill)",
                        border: "1px solid var(--border-input)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-[13px] font-medium leading-tight truncate" style={{ color: "var(--text-primary)" }}>
                        {member.name}
                      </p>
                      {isSelf && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-[4px] font-medium"
                          style={{ background: "rgba(0, 102, 255, 0.08)", color: "#0066FF" }}
                        >
                          You
                        </span>
                      )}
                      {!member.active && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-[4px] font-medium"
                          style={{ background: "var(--bg-pill)", color: "var(--text-secondary)" }}
                        >
                          Deactivated
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--text-secondary)" }}>
                      {member.email} · <span>{getRoleDisplayName(member.role)}</span>
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap shrink-0">

                  {/* Quick role select */}
                  <select
                    disabled={!canEditThisMember || Boolean(updatingMemberIds[member.id])}
                    value={normMemberRole}
                    onChange={(e) => handleUpdateMember(member.id, { role: e.target.value as Role })}
                    className={`h-[26px] text-[11px] rounded-[6px] px-2 outline-none shrink-0 w-[155px] transition-colors ${
                      updatingMemberIds[member.id] ? "opacity-60 cursor-wait" : ""
                    }`}
                    style={{
                      background: "var(--bg-input)",
                      border: "1px solid var(--border-input)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {ROLE_OPTIONS.filter((opt) => !opt.chairmanOnly || userIsChairman).map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>

                  {/* Primary: Activate / Deactivate */}
                  <button
                    type="button"
                    disabled={!canManageTeam || (isChairmanMember && !userIsChairman) || isSelf || (!member.active && isSeatLimitReached)}
                    onClick={() => {
                      if (member.active) {
                        handleOpenDeactivate(member);
                      } else {
                        handleUpdateMember(member.id, { active: true });
                      }
                    }}
                    title={
                      isSelf
                        ? "You cannot deactivate your own account"
                        : !member.active && isSeatLimitReached
                        ? `Cannot activate: all ${maxSeats} seats are currently in use.`
                        : undefined
                    }
                    className={`h-[26px] px-2.5 text-[11px] font-medium rounded-[6px] transition-colors whitespace-nowrap ${
                      (isChairmanMember && !userIsChairman) || isSelf || !canManageTeam || (!member.active && isSeatLimitReached)
                        ? "cursor-not-allowed opacity-40"
                        : "cursor-pointer"
                    }`}
                    style={{
                      background: member.active ? "var(--bg-pill)" : "var(--bg-card)",
                      border: "1px solid var(--border-main)",
                      color: member.active ? "var(--text-secondary)" : "var(--text-primary)",
                    }}
                  >
                    {member.active ? "Deactivate" : "Activate"}
                  </button>

                  {/* ⋯ More actions dropdown */}
                  {canManageTeam && (
                    <div className="relative" data-action-menu>
                      <button
                        type="button"
                        onClick={() => setOpenMenuId((prev) => (prev === member.id ? null : member.id))}
                        aria-label="More actions"
                        className="h-[26px] w-[26px] flex items-center justify-center rounded-[6px] text-[15px] leading-none transition-colors cursor-pointer"
                        style={{
                          background: openMenuId === member.id ? "var(--bg-hover)" : "var(--bg-card)",
                          border: "1px solid var(--border-main)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        ···
                      </button>

                      {openMenuId === member.id && (
                        <div
                          className="absolute right-0 top-[30px] z-50 min-w-[120px] rounded-[8px] py-1 shadow-lg"
                          style={{
                            background: "var(--bg-card)",
                            border: "1px solid var(--border-main)",
                          }}
                          data-action-menu
                        >
                          {/* Edit */}
                          <button
                            type="button"
                            disabled={!canEditThisMember}
                            onClick={() => { setOpenMenuId(null); handleOpenEdit(member); }}
                            className={`w-full text-left px-3 py-1.5 text-[12px] transition-colors ${
                              !canEditThisMember
                                ? "opacity-40 cursor-not-allowed"
                                : "cursor-pointer hover:bg-[var(--bg-hover)]"
                            }`}
                            style={{ color: "var(--text-primary)" }}
                          >
                            Edit
                          </button>

                          {/* Divider */}
                          <div className="my-1" style={{ borderTop: "1px solid var(--border-main)" }} />

                          {/* Delete */}
                          <button
                            type="button"
                            disabled={isSelf || (isChairmanMember && !userIsChairman)}
                            onClick={() => { setOpenMenuId(null); handleOpenDelete(member); }}
                            className={`w-full text-left px-3 py-1.5 text-[12px] transition-colors ${
                              isSelf || (isChairmanMember && !userIsChairman)
                                ? "opacity-40 cursor-not-allowed"
                                : "cursor-pointer hover:bg-red-50"
                            }`}
                            style={{
                              color: isSelf || (isChairmanMember && !userIsChairman)
                                ? "var(--text-secondary)"
                                : "#b3261e",
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
              </section>
            ))}
          </div>
        )}


        {/* Add Someone Section */}
        {canManageTeam ? (
          <form onSubmit={handleAddMember} className="pt-5">
            <div className="flex items-center flex-wrap gap-2 mb-3">
              <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
                Add someone
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAddMode("invite")}
                  className={`px-3 py-1 text-[11px] font-medium rounded-full cursor-pointer transition-colors ${
                    addMode === "invite" ? "text-white bg-[#0066FF]" : ""
                  }`}
                  style={addMode !== "invite" ? { background: "var(--bg-pill)", color: "var(--text-secondary)" } : {}}
                >
                  Email invite
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode("password")}
                  className={`px-3 py-1 text-[11px] font-medium rounded-full cursor-pointer transition-colors ${
                    addMode === "password" ? "text-white bg-[#0066FF]" : ""
                  }`}
                  style={addMode !== "password" ? { background: "var(--bg-pill)", color: "var(--text-secondary)" } : {}}
                >
                  Set a password
                </button>
              </div>
            </div>

            {isSeatLimitReached && (
              <div
                className="p-3 mb-3 rounded-lg text-[12px] flex items-center justify-between"
                style={{
                  background: "rgba(255, 59, 48, 0.08)",
                  border: "1px solid rgba(255, 59, 48, 0.2)",
                  color: "#FF3B30",
                }}
              >
                <span>
                  All <strong>{maxSeats} seats</strong> are currently in use. To add a new team member, deactivate an existing user to free up a seat.
                </span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              <input
                type="text"
                disabled={isSeatLimitReached}
                placeholder="Full name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className={`flex-1 min-w-0 h-[28px] px-2.5 text-[12px] rounded-[6px] outline-none transition-colors focus:border-[#0066FF] placeholder-gray-400 ${
                  isSeatLimitReached ? "opacity-60 cursor-not-allowed" : ""
                }`}
                style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)", color: "var(--text-primary)" }}
              />
              <input
                type="email"
                disabled={isSeatLimitReached}
                placeholder="Email address"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className={`flex-1 min-w-0 h-[28px] px-2.5 text-[12px] rounded-[6px] outline-none transition-colors focus:border-[#0066FF] placeholder-gray-400 ${
                  isSeatLimitReached ? "opacity-60 cursor-not-allowed" : ""
                }`}
                style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)", color: "var(--text-primary)" }}
              />
              {addMode === "password" && (
                <input
                  type="password"
                  disabled={isSeatLimitReached}
                  placeholder="Password"
                  value={newMemberPw}
                  onChange={(e) => setNewMemberPw(e.target.value)}
                  className={`flex-1 min-w-0 h-[28px] px-2.5 text-[12px] rounded-[6px] outline-none transition-colors focus:border-[#0066FF] placeholder-gray-400 ${
                    isSeatLimitReached ? "opacity-60 cursor-not-allowed" : ""
                  }`}
                  style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)", color: "var(--text-primary)" }}
                />
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                {isSeatLimitReached
                  ? `Seat limit of ${maxSeats} reached.`
                  : addMode === "invite"
                  ? "They will receive an invitation email to set up their account."
                  : "Account will be created immediately with this password."}
              </p>
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <select
                  disabled={isSeatLimitReached}
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as Role)}
                  className={`h-[28px] text-[11px] rounded-[6px] px-2 outline-none flex-1 sm:flex-none sm:w-[155px] ${
                    isSeatLimitReached ? "opacity-60 cursor-not-allowed" : ""
                  }`}
                  style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)", color: "var(--text-primary)" }}
                >
                  {ROLE_OPTIONS.filter((opt) => !opt.chairmanOnly || isChairman).map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={addingUser || isSeatLimitReached}
                  className={`h-[28px] px-4 text-[12px] font-medium text-white rounded-[6px] transition-colors shadow-sm whitespace-nowrap ${
                    isSeatLimitReached
                      ? "opacity-50 cursor-not-allowed bg-gray-500"
                      : "bg-[#0066FF] hover:bg-blue-700 cursor-pointer"
                  }`}
                >
                  {addingUser ? "Adding…" : isSeatLimitReached ? "Seats full" : addMode === "invite" ? "Send invite" : "Create account"}
                </button>
              </div>
            </div>

            {addStatus && (
              <p className={`text-[11px] mt-2 font-medium ${addStatus.ok ? "text-green-600" : "text-[#FF3B30]"}`}>
                {addStatus.msg}
              </p>
            )}
          </form>
        ) : (
          <p className="pt-4 text-[11px]" style={{ color: "var(--text-muted)" }}>
            Team member management is restricted to the Chairman.
          </p>
        )}
      </div>

        {/* Inbox behaviour Card */}
        <div className="rounded-xl p-5 mb-5 shadow-sm" style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)" }}>
          <h2 className="text-[13px] font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Inbox behaviour
          </h2>
          <div className="flex items-start">
            <input
              type="checkbox"
              defaultChecked
              className="mt-0.5 mr-3 w-[14px] h-[14px] accent-[#0071e3] rounded-[3px] border-gray-300 cursor-pointer"
            />
            <div>
              <p className="text-[13px] font-medium leading-none mb-1.5" style={{ color: "var(--text-primary)" }}>
                Agents see the whole inbox
              </p>
              <p className="text-[11px] leading-tight max-w-2xl" style={{ color: "var(--text-secondary)" }}>
                Off: agents only see conversations assigned to them or unassigned. Managers and the owner always see everything.
              </p>
            </div>
          </div>
        </div>

        {/* Role permissions Card */}
        <div className="rounded-xl p-5 shadow-sm" style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)" }}>
          <h2 className="text-[13px] font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            What each role can do
          </h2>
          <ul className="space-y-2.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
            <li>
              <span className="font-semibold" style={{ color: "var(--text-primary)" }}>Chairman</span> — full access to everything, team management, permissions, and system settings.
            </li>
            <li>
              <span className="font-semibold" style={{ color: "var(--text-primary)" }}>Admission Officer</span> — agent features: live chat inbox, pipeline management, leads, bookings, and follow-ups.
            </li>
            <li>
              <span className="font-semibold" style={{ color: "var(--text-primary)" }}>Admission (Advanced)</span> — admission officer access plus Reports and Team Activities.
            </li>
            <li>
              <span className="font-semibold" style={{ color: "var(--text-primary)" }}>Operation</span> — dedicated access to Operation Inbox (Operation WhatsApp account), Profile, and personal Settings (account &amp; notifications).
            </li>
            <li>
              <span className="font-semibold" style={{ color: "var(--text-primary)" }}>Enrollment Director</span> — access to auditions only: schedule auditions, manage applicants, and track attendance.
            </li>
            <li>
              <span className="font-semibold" style={{ color: "var(--text-primary)" }}>Finance</span> — access to pipeline and reports: financial tracking, campaign analytics, and conversion metrics.
            </li>
            <li>
              <span className="font-semibold" style={{ color: "var(--text-primary)" }}>Marketing</span> — view-only access across the entire CRM (all sections visible in read-only mode).
            </li>
          </ul>
        </div>
      </>
      )}
        </>
      )}

      {/* ── BRANCHES TAB CONTENT ────────────────────────────────────────── */}
      {!isOperation && activeTab === "branches" && (
        <>
          {/* Container 1: Dedicated container for adding branches (Chairman only) */}
          {canManageTeam && (
            <div
              className="rounded-xl p-5 shadow-sm mb-5"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)" }}
            >
              <h2 className="text-[13px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                Add branch
              </h2>
              <p className="text-[11px] mb-4" style={{ color: "var(--text-secondary)" }}>
                Create a new compound location or regional branch.
              </p>

              <form onSubmit={handleAddBranch}>
                <div className="flex flex-col sm:flex-row gap-2.5 items-start sm:items-center">
                  {/* Branch name input */}
                  <div className="flex-1 min-w-0 w-full">
                    <label className="block text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--text-secondary)" }}>
                      Branch name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Alreem Compound"
                      value={newBranchName}
                      onChange={(e) => setNewBranchName(e.target.value)}
                      className="w-full h-[32px] px-2.5 text-[12px] rounded-[6px] outline-none transition-colors focus:border-[#0066FF] placeholder-gray-400"
                      style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)", color: "var(--text-primary)" }}
                    />
                  </div>

                  {/* Enhanced Region Dropdown */}
                  <div className="w-full sm:w-[180px]" ref={regionMenuRef}>
                    <label className="block text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--text-secondary)" }}>
                      Region
                    </label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsRegionOpen((prev) => !prev)}
                        className="w-full h-[32px] px-2.5 text-[12px] rounded-[6px] outline-none flex items-center justify-between transition-colors focus:border-[#0066FF] cursor-pointer"
                        style={{
                          background: "var(--bg-input)",
                          border: "1px solid var(--border-input)",
                          color: newBranchRegion ? "var(--text-primary)" : "var(--text-secondary)",
                        }}
                      >
                        <span className="truncate">{newBranchRegion || "Select region…"}</span>
                        <ChevronDown className="w-3.5 h-3.5 text-gray-400 ml-1.5 shrink-0" />
                      </button>

                      {isRegionOpen && (
                        <div
                          className="absolute left-0 top-full mt-1 w-full sm:w-[220px] rounded-[8px] p-1 shadow-lg z-50 text-[12px]"
                          style={{
                            background: "var(--bg-card)",
                            border: "1px solid var(--border-main)",
                          }}
                        >
                          <div className="max-h-48 overflow-y-auto py-0.5">
                            {allRegionsList.map((r) => {
                              const isSelected = newBranchRegion.toLowerCase() === r.toLowerCase();
                              return (
                                <button
                                  key={r}
                                  type="button"
                                  onClick={() => {
                                    setNewBranchRegion(r);
                                    setIsRegionOpen(false);
                                  }}
                                  className={`w-full text-left px-2.5 py-1.5 rounded-[5px] flex items-center justify-between cursor-pointer transition-colors ${
                                    isSelected
                                      ? "bg-[var(--bg-selected)] text-[#0066FF] font-semibold"
                                      : "text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                                  }`}
                                >
                                  <span>{r}</span>
                                  {isSelected && <Check className="w-3.5 h-3.5 text-[#0066FF]" />}
                                </button>
                              );
                            })}
                          </div>

                          {/* Custom region input */}
                          <div className="pt-2 mt-1 border-t border-[var(--border-main)] px-1 pb-1">
                            <p className="text-[10px] uppercase font-bold text-gray-400 px-1.5 mb-1">
                              Or enter new region
                            </p>
                            <div className="flex gap-1.5">
                              <input
                                type="text"
                                placeholder="Region name"
                                value={customRegionInput}
                                onChange={(e) => setCustomRegionInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    if (customRegionInput.trim()) {
                                      setNewBranchRegion(customRegionInput.trim());
                                      setCustomRegionInput("");
                                      setIsRegionOpen(false);
                                    }
                                  }
                                }}
                                className="flex-1 h-[26px] px-2 text-[11px] rounded-[5px] outline-none"
                                style={{
                                  background: "var(--bg-input)",
                                  border: "1px solid var(--border-input)",
                                  color: "var(--text-primary)",
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if (customRegionInput.trim()) {
                                    setNewBranchRegion(customRegionInput.trim());
                                    setCustomRegionInput("");
                                    setIsRegionOpen(false);
                                  }
                                }}
                                disabled={!customRegionInput.trim()}
                                className="h-[26px] px-2.5 text-[11px] font-semibold rounded-[5px] bg-[#0066FF] text-white hover:bg-blue-700 cursor-pointer disabled:opacity-50"
                              >
                                Set
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Submit Button */}
                  <div className="w-full sm:w-auto mt-2 sm:mt-0 self-end">
                    <button
                      type="submit"
                      disabled={addingBranch}
                      className="w-full sm:w-auto h-[32px] px-4 text-[12px] font-medium text-white bg-[#0066FF] rounded-[6px] hover:bg-blue-700 cursor-pointer transition-colors shadow-sm whitespace-nowrap disabled:opacity-60"
                    >
                      {addingBranch ? "Adding…" : "Add branch"}
                    </button>
                  </div>
                </div>

                {branchStatus && (
                  <p className={`text-[11px] mt-2.5 font-medium ${branchStatus.ok ? "text-green-600" : "text-[#FF3B30]"}`}>
                    {branchStatus.msg}
                  </p>
                )}
              </form>
            </div>
          )}

          {/* Container 2: Modern CRM Branches List */}
          <div
            className="rounded-xl p-5 shadow-sm overflow-hidden mb-5"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)" }}
          >
            {/* Top Bar: Title, Count, and Search */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3.5">
              <div className="flex items-center gap-2">
                <h2 className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  Branches
                </h2>
                <span
                  className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                  style={{ background: "var(--bg-pill)", color: "var(--text-secondary)" }}
                >
                  {totalBranches} total
                </span>
              </div>

              {/* Instant Search Bar (0ms client-side filter) */}
              <div className="relative w-full sm:w-[220px]">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search branch or region…"
                  value={branchSearch}
                  onChange={(e) => setBranchSearch(e.target.value)}
                  className="w-full h-[30px] pl-8 pr-7 text-[12px] rounded-lg outline-none transition-colors focus:border-[#0066FF]"
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-input)",
                    color: "var(--text-primary)",
                  }}
                />
                {branchSearch && (
                  <button
                    type="button"
                    onClick={() => setBranchSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Region Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 mb-4" style={{ scrollbarWidth: "none" }}>
              <button
                type="button"
                onClick={() => setSelectedRegionFilter("ALL")}
                className={`h-[24px] px-2.5 text-[11px] font-medium rounded-full transition-colors cursor-pointer shrink-0 ${
                  selectedRegionFilter === "ALL"
                    ? "bg-[#0066FF] text-white font-semibold shadow-xs"
                    : "hover:bg-[var(--bg-pill)] text-[var(--text-secondary)]"
                }`}
                style={selectedRegionFilter !== "ALL" ? { background: "var(--bg-pill)", border: "1px solid var(--border-input)" } : {}}
              >
                All ({totalBranches})
              </button>
              {branchGroups.map((g) => {
                const isSelected = selectedRegionFilter.toLowerCase() === g.region.toLowerCase();
                return (
                  <button
                    key={g.region}
                    type="button"
                    onClick={() => setSelectedRegionFilter(isSelected ? "ALL" : g.region)}
                    className={`h-[24px] px-2.5 text-[11px] font-medium rounded-full transition-colors cursor-pointer shrink-0 ${
                      isSelected
                        ? "bg-[#0066FF] text-white font-semibold shadow-xs"
                        : "hover:bg-[var(--bg-pill)] text-[var(--text-secondary)]"
                    }`}
                    style={!isSelected ? { background: "var(--bg-pill)", border: "1px solid var(--border-input)" } : {}}
                  >
                    {g.region} ({g.branches.length})
                  </button>
                );
              })}
            </div>

            <div className="mb-4" style={{ borderBottom: "1px solid var(--border-main)" }} />

            {/* Empty state */}
            {filteredBranchGroups.length === 0 ? (
              <div
                className="py-12 text-center rounded-xl"
                style={{ border: "1px dashed var(--border-input)", background: "var(--bg-pill)" }}
              >
                <div className="w-9 h-9 mx-auto rounded-full flex items-center justify-center mb-2" style={{ background: "rgba(0, 102, 255, 0.08)", color: "#0066FF" }}>
                  <Search className="w-4 h-4" />
                </div>
                <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  No branches found
                </p>
                <p className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>
                  {branchSearch
                    ? `No branch matching "${branchSearch}".`
                    : "There are no branches in this region."}
                </p>
                {branchSearch && (
                  <button
                    type="button"
                    onClick={() => setBranchSearch("")}
                    className="mt-2 text-[11px] font-semibold text-[#0066FF] hover:underline cursor-pointer"
                  >
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              /* Grouped Cards per Region */
              filteredBranchGroups.map((group) => (
                <div key={group.region} className="mb-5 last:mb-0">
                  {/* Region Header */}
                  <div className="flex items-center justify-between mb-2.5 px-0.5">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="text-[11px] font-bold uppercase tracking-wider"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {group.region}
                      </span>
                    </div>
                    <span
                      className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                      style={{ background: "var(--bg-pill)", color: "var(--text-secondary)" }}
                    >
                      {group.branches.length} {group.branches.length === 1 ? "branch" : "branches"}
                    </span>
                  </div>

                  {/* Modern 2-column Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {group.branches.map((branch) => (
                      <div
                        key={branch.id || branch.fullName}
                        className="flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-all duration-150 hover:border-gray-300"
                        style={{
                          background: "var(--bg-card)",
                          border: "1px solid var(--border-main)",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                        }}
                      >
                        {/* Branch name */}
                        <div className="min-w-0 pr-2">
                          <p
                            className="text-[12.5px] font-semibold truncate leading-snug"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {branch.name}
                          </p>
                        </div>

                        {/* Actions */}
                        {canManageTeam && (
                          <div className="flex items-center shrink-0">
                            <button
                              type="button"
                              disabled={!branch.id}
                              onClick={() => setBranchToDelete({
                                id: branch.id,
                                name: branch.name,
                                region: branch.region,
                                fullName: branch.fullName || `${branch.name} (${branch.region})`,
                              })}
                              title={`Remove ${branch.name}`}
                              className="p-1.5 rounded-[6px] text-gray-400 hover:text-[#b3261e] hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-40"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}

            {!canManageTeam && (
              <p className="text-[11px] mt-4" style={{ color: "var(--text-secondary)" }}>
                Branch management is restricted to the Chairman.
              </p>
            )}
          </div>
        </>
      )}

      {/* ── CLAUDE TAB CONTENT (Chairman only) ─────────────────────────── */}
      {activeTab === "claude" && isChairman && (
        <ClaudeSettingsTab onOpenLeadChat={openClaudeDrawer} />
      )}
      </div>

      {/* ── Edit User Modal ───────────────────────────────────────────────── */}
      {editingMember && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => { if (!editSaving) setEditingMember(null); }}
        >
          <div
            className="w-full max-w-[420px] rounded-xl shadow-xl"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-main)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid var(--border-main)" }}
            >
              <div>
                <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  Edit user
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                  {editingMember.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { if (!editSaving) setEditingMember(null); }}
                disabled={editSaving}
                className="w-7 h-7 flex items-center justify-center rounded-[6px] text-[16px] leading-none transition-colors hover:bg-[var(--bg-hover)] cursor-pointer disabled:opacity-40"
                style={{ color: "var(--text-secondary)" }}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Modal form */}
            <form onSubmit={handleSaveEdit} className="px-5 py-4 space-y-3.5">
              {/* Profile picture (Chairman only) */}
              {isChairman && (
                <div>
                  <label className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>
                    Profile picture
                  </label>
                  <div className="flex items-center gap-3">
                    {editAvatar ? (
                      <img
                        src={editAvatar}
                        alt={editName || "User"}
                        className="w-12 h-12 rounded-full object-cover shadow-xs shrink-0"
                        style={{ border: "1px solid var(--border-input)" }}
                      />
                    ) : (
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center font-semibold text-[14px] shrink-0"
                        style={{
                          background: "var(--bg-pill)",
                          border: "1px solid var(--border-input)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {(editName || "U").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <input
                        ref={editFileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          e.target.value = "";
                          if (!file.type.startsWith("image/")) return;
                          try {
                            const b64 = await resizeImageToAvatar(file, 256, 256);
                            setEditAvatar(b64);
                          } catch {}
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => editFileInputRef.current?.click()}
                        className="h-[26px] px-2.5 text-[11px] font-medium rounded-[6px] transition-colors cursor-pointer"
                        style={{
                          background: "var(--bg-card)",
                          border: "1px solid var(--border-main)",
                          color: "var(--text-primary)",
                        }}
                      >
                        {editAvatar ? "Change photo" : "Upload photo"}
                      </button>
                      {editAvatar && (
                        <button
                          type="button"
                          onClick={() => setEditAvatar("")}
                          className="h-[26px] px-2.5 text-[11px] font-medium rounded-[6px] transition-colors cursor-pointer text-[#FF3B30] hover:bg-[rgba(255,59,48,0.06)]"
                          style={{
                            border: "1px solid var(--border-input)",
                            background: "transparent",
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                  Full name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  disabled={editSaving}
                  placeholder="Full name"
                  className="w-full h-[30px] px-2.5 text-[12px] rounded-[6px] outline-none transition-colors focus:border-[#0066FF] disabled:opacity-60"
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-input)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                  Email address
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  disabled={editSaving}
                  placeholder="name@example.com"
                  className="w-full h-[30px] px-2.5 text-[12px] rounded-[6px] outline-none transition-colors focus:border-[#0066FF] disabled:opacity-60"
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-input)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                  Role
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as Role)}
                  disabled={editSaving}
                  className="w-full h-[30px] px-2.5 text-[12px] rounded-[6px] outline-none transition-colors focus:border-[#0066FF] disabled:opacity-60"
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-input)",
                    color: "var(--text-primary)",
                  }}
                >
                  {ROLE_OPTIONS.filter((opt) => !opt.chairmanOnly || isChairman).map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Active status toggle */}
              <div
                className="flex items-center justify-between gap-3 rounded-[8px] px-3 py-2.5"
                style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)" }}
              >
                <div>
                  <p className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>
                    Active
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                    Deactivating closes all active sessions immediately; assigned leads stay intact
                  </p>
                  {editingMember.active && !editActive && (
                    <p className="text-[11px] mt-1 font-medium" style={{ color: "#b3261e" }}>
                      Saving will sign out {editingMember.name} across all open tabs and keep their{" "}
                      {getAssignedLeadCount(editingMember.name)} assigned{" "}
                      {getAssignedLeadCount(editingMember.name) === 1 ? "lead" : "leads"}.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={editActive}
                  disabled={editSaving || (editingMember.id === user?.id || editingMember.email === user?.email)}
                  onClick={() => setEditActive((v) => !v)}
                  title={
                    editingMember.id === user?.id || editingMember.email === user?.email
                      ? "You cannot deactivate your own account"
                      : undefined
                  }
                  className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${
                    editSaving || (editingMember.id === user?.id || editingMember.email === user?.email)
                      ? "opacity-40 cursor-not-allowed"
                      : "cursor-pointer"
                  }`}
                  style={{
                    background: editActive ? "#0066FF" : "var(--border-input)",
                  }}
                >
                  <span
                    className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                    style={{ transform: editActive ? "translateX(20px)" : "translateX(0)" }}
                  />
                </button>
              </div>

              {/* Password reset (optional) */}
              <div>
                <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                  New password <span style={{ color: "var(--text-muted)" }}>(leave blank to keep current)</span>
                </label>
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  disabled={editSaving}
                  placeholder="••••••••"
                  className="w-full h-[30px] px-2.5 text-[12px] rounded-[6px] outline-none transition-colors focus:border-[#0066FF] disabled:opacity-60"
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-input)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>

              {/* Error message */}
              {editError && (
                <p className="text-[11px] font-medium text-[#FF3B30]">{editError}</p>
              )}

              {/* Actions */}
              <div
                className="flex items-center justify-end gap-2 pt-1"
                style={{ borderTop: "1px solid var(--border-main)", paddingTop: "12px" }}
              >
                <button
                  type="button"
                  onClick={() => { if (!editSaving) setEditingMember(null); }}
                  disabled={editSaving}
                  className="h-[30px] px-4 text-[12px] font-medium rounded-[6px] transition-colors cursor-pointer disabled:opacity-40"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-main)",
                    color: "var(--text-primary)",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="h-[30px] px-4 text-[12px] font-medium text-white bg-[#0066FF] rounded-[6px] hover:bg-blue-700 transition-colors cursor-pointer disabled:opacity-60"
                >
                  {editSaving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Deactivate User Confirmation Modal ────────────────────────────── */}
      {deactivatingMember && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-150"
          style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)" }}
          onClick={() => { if (!deactivateSaving) setDeactivatingMember(null); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="deactivate-user-title"
            className="w-full max-w-[420px] max-h-[90dvh] overflow-y-auto rounded-2xl shadow-2xl border animate-in fade-in zoom-in-95 duration-150"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-main)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-5 flex flex-col gap-3.5">
              <div className="flex items-start gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: "rgba(179, 38, 30, 0.1)", color: "#b3261e" }}
                >
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p
                    id="deactivate-user-title"
                    className="text-[14px] font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Deactivate user account
                  </p>
                  <p className="text-[12px] mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    You are about to deactivate{" "}
                    <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                      {deactivatingMember.name}
                    </span>{" "}
                    ({deactivatingMember.email}).
                  </p>
                </div>
              </div>

              {(() => {
                const keptLeads = getAssignedLeadCount(deactivatingMember.name);
                return (
                  <div
                    className="rounded-xl p-3 text-[12px] leading-relaxed space-y-1.5"
                    style={{
                      background: "var(--bg-input)",
                      border: "1px solid var(--border-main)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <p>
                      <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                        Session access:
                      </span>{" "}
                      All active CRM sessions and open tabs for this user will be closed immediately,
                      and login will be blocked until reactivated.
                    </p>
                    <p>
                      <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                        Lead ownership:
                      </span>{" "}
                      {keptLeads > 0 ? (
                        <>
                          Their{" "}
                          <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                            {keptLeads} assigned {keptLeads === 1 ? "lead" : "leads"}
                          </span>{" "}
                          will remain assigned to {deactivatingMember.name}.
                        </>
                      ) : (
                        <>No currently assigned leads will be removed or reassigned.</>
                      )}
                    </p>
                  </div>
                );
              })()}

              {deactivateError && (
                <p className="text-[11px] font-medium text-[#FF3B30]">{deactivateError}</p>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { if (!deactivateSaving) setDeactivatingMember(null); }}
                  disabled={deactivateSaving}
                  className="min-h-[36px] px-4 text-[12px] font-medium rounded-[8px] transition-colors cursor-pointer disabled:opacity-40"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-main)",
                    color: "var(--text-primary)",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeactivate}
                  disabled={deactivateSaving}
                  className="min-h-[36px] px-4 text-[12px] font-semibold rounded-[8px] transition-colors cursor-pointer disabled:opacity-50"
                  style={{
                    background: "rgba(179, 38, 30, 0.1)",
                    border: "1px solid rgba(179, 38, 30, 0.3)",
                    color: "#b3261e",
                  }}
                >
                  {deactivateSaving ? "Deactivating…" : "Deactivate user"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete User Confirmation Modal ────────────────────────────────── */}
      {deletingMember && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-150"
          style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)" }}
          onClick={() => { if (!deleteSaving) setDeletingMember(null); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-user-title"
            className="w-full max-w-[420px] max-h-[90dvh] overflow-y-auto rounded-2xl shadow-2xl border animate-in fade-in zoom-in-95 duration-150"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-main)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-5 flex flex-col gap-3.5">
              <div className="flex items-start gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: "rgba(179, 38, 30, 0.1)", color: "#b3261e" }}
                >
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p
                    id="delete-user-title"
                    className="text-[14px] font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Delete user permanently
                  </p>
                  <p className="text-[12px] mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    This will permanently remove{" "}
                    <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                      {deletingMember.name}
                    </span>{" "}
                    ({deletingMember.email}) from the system. This action cannot be undone.
                  </p>
                </div>
              </div>

              {(() => {
                const assignedCount = getAssignedLeadCount(deletingMember.name);
                return (
                  <div
                    className="rounded-xl p-3 text-[12px] leading-relaxed space-y-1.5"
                    style={{
                      background: "rgba(179, 38, 30, 0.06)",
                      border: "1px solid rgba(179, 38, 30, 0.2)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <p>
                      <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                        Session closure:
                      </span>{" "}
                      Any open session for {deletingMember.name} will be closed immediately.
                    </p>
                    <p>
                      <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                        Lead reassignment:
                      </span>{" "}
                      {assignedCount > 0 ? (
                        <>
                          <span className="font-semibold" style={{ color: "#b3261e" }}>
                            {assignedCount} assigned {assignedCount === 1 ? "lead" : "leads"}
                          </span>{" "}
                          currently owned by {deletingMember.name} will automatically move to{" "}
                          <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                            Unassigned
                          </span>
                          . Historical performance metrics remain preserved.
                        </>
                      ) : (
                        <>
                          Any leads assigned to {deletingMember.name} will automatically move to{" "}
                          <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                            Unassigned
                          </span>
                          . Historical performance metrics remain preserved.
                        </>
                      )}
                    </p>
                  </div>
                );
              })()}

              {deleteError && (
                <p className="text-[11px] font-medium text-[#FF3B30]">{deleteError}</p>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { if (!deleteSaving) setDeletingMember(null); }}
                  disabled={deleteSaving}
                  className="min-h-[36px] px-4 text-[12px] font-medium rounded-[8px] transition-colors cursor-pointer disabled:opacity-40"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-main)",
                    color: "var(--text-primary)",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={deleteSaving}
                  className="min-h-[36px] px-4 text-[12px] font-semibold rounded-[8px] transition-colors cursor-pointer disabled:opacity-50"
                  style={{
                    background: "#b3261e",
                    border: "1px solid #b3261e",
                    color: "#ffffff",
                  }}
                >
                  {deleteSaving ? "Deleting…" : "Delete user"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ── Delete Branch Confirmation Modal (with Impact Breakdown) ───── */}
      {branchToDelete && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-150"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
          onClick={() => { if (!isDeletingBranch) setBranchToDelete(null); }}
        >
          <div
            className="w-full max-w-[480px] rounded-2xl p-6 shadow-2xl relative border animate-in fade-in zoom-in-95 duration-150 flex flex-col gap-4"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-main)",
              color: "var(--text-primary)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start gap-3.5">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(239, 68, 68, 0.12)", color: "#EF4444" }}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[16px] font-bold leading-tight" style={{ color: "var(--text-primary)" }}>
                  Remove Branch "{branchToDelete.name}"?
                </h3>
                <p className="text-[12px] mt-1" style={{ color: "var(--text-secondary)" }}>
                  Region: <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{branchToDelete.region}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => { if (!isDeletingBranch) setBranchToDelete(null); }}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Impact Counter Box */}
            <div
              className="rounded-xl p-3.5 border"
              style={{ background: "var(--bg-pill)", borderColor: "var(--border-input)" }}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Data Linked to this Branch
                </p>
                {loadingUsage && (
                  <span className="text-[10px] text-gray-400 italic">Syncing server stats…</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div
                  className="p-2.5 rounded-lg"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)" }}
                >
                  <p className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
                    Tagged Leads
                  </p>
                  <p className="text-[18px] font-bold mt-0.5" style={{ color: "var(--text-primary)" }}>
                    {branchUsageStats?.totalConversations ?? localBranchStats.total}
                  </p>
                  <p className="text-[10px] text-gray-400">conversations in CRM</p>
                </div>

                <div
                  className="p-2.5 rounded-lg"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)" }}
                >
                  <p className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
                    Scheduled Auditions
                  </p>
                  <p
                    className="text-[18px] font-bold mt-0.5"
                    style={{
                      color: (branchUsageStats?.bookedAuditions ?? localBranchStats.auditions) > 0 ? "#EF4444" : "var(--text-primary)",
                    }}
                  >
                    {branchUsageStats?.bookedAuditions ?? localBranchStats.auditions}
                  </p>
                  <p className="text-[10px] text-gray-400">auditions on calendar</p>
                </div>
              </div>
            </div>

            {/* Consequences Breakdown */}
            <div className="rounded-xl p-3 flex flex-col gap-2.5 text-[12px]" style={{ background: "rgba(239, 68, 68, 0.04)", border: "1px solid rgba(239, 68, 68, 0.18)" }}>
              <div className="flex items-start gap-2">
                <span className="text-[#EF4444] font-bold shrink-0 mt-0.5">✕</span>
                <p style={{ color: "var(--text-primary)" }}>
                  <span className="font-semibold">Audition Bookings:</span> Staff will immediately lose the ability to select this branch when booking or rescheduling auditions in the Inbox, Pipeline, and Calendar.
                </p>
              </div>

              <div className="flex items-start gap-2">
                <span className="text-[#EF4444] font-bold shrink-0 mt-0.5">✕</span>
                <p style={{ color: "var(--text-primary)" }}>
                  <span className="font-semibold">Calendar Filters:</span> This branch will be removed from the Auditions Calendar filter menu, meaning slots cannot be filtered by this branch.
                </p>
              </div>

              <div className="flex items-start gap-2">
                <span className="text-amber-600 font-bold shrink-0 mt-0.5">⚠️</span>
                <p style={{ color: "var(--text-primary)" }}>
                  <span className="font-semibold">Existing Records:</span> Student chat histories and past notes will <strong>not be deleted</strong>, but they will show an unlinked branch name that no longer rolls up into active regional groups.
                </p>
              </div>

              <div className="flex items-start gap-2">
                <span className="text-gray-400 font-bold shrink-0 mt-0.5">•</span>
                <p style={{ color: "var(--text-secondary)" }}>
                  <span className="font-semibold">Permanent:</span> This branch definition will be permanently deleted from the database.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t" style={{ borderColor: "var(--border-main)" }}>
              <button
                type="button"
                disabled={isDeletingBranch}
                onClick={() => setBranchToDelete(null)}
                className="h-[34px] px-4 text-[12px] font-medium rounded-xl cursor-pointer transition-colors"
                style={{
                  background: "var(--bg-pill)",
                  border: "1px solid var(--border-input)",
                  color: "var(--text-secondary)",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingBranch}
                onClick={handleConfirmDeleteBranch}
                className="h-[34px] px-4 text-[12px] font-semibold rounded-xl text-white bg-[#EF4444] hover:bg-red-700 cursor-pointer transition-colors shadow-sm disabled:opacity-60 flex items-center gap-1.5"
              >
                {isDeletingBranch ? "Removing…" : "I understand, Remove branch"}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      <SlideOverChatDrawer
        chatId={claudeDrawerChatId}
        showDetails={claudeShowChatDetails}
        isClosing={isClaudeDrawerClosing}
        panelRef={claudeDrawerPanelRef}
        onToggleDetails={() => setClaudeShowChatDetails((prev) => !prev)}
        onCloseDetails={() => setClaudeShowChatDetails(false)}
        onClose={closeClaudeDrawer}
        onAnimationEnd={handleClaudeDrawerAnimationEnd}
        enableEscapeClose={!editingMember && !deactivatingMember && !deletingMember && !branchToDelete}
      />
    </div>
  );
}
