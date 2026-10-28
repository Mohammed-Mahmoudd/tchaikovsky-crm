"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useAuth, Role, getRoleDisplayName, normalizeRole, canManageTeamRole } from "../components/AuthProvider";
import { useCRM } from "../context/CRMContext";
import { useBranches } from "../lib/branches";
import { ChevronDown, Check, Trash2, Search, X, AlertTriangle } from "lucide-react";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
}

export default function SettingsPage() {
  const { user, updateCurrentUser, authFetch, canManageTeam: authCanManageTeam, roleDisplayName } = useAuth();

  // Profile state
  const [nameSaving, setNameSaving] = useState(false);
  const [nameStatus, setNameStatus] = useState<string | null>(null);

  // Password state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwStatus, setPwStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  // Team state
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [maxSeats, setMaxSeats] = useState(15);
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [addMode, setAddMode] = useState<"invite" | "password">("invite");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newMemberPw, setNewMemberPw] = useState("");
  const [newRole, setNewRole] = useState<Role>("admission_officer");
  const [addingUser, setAddingUser] = useState(false);
  const [addStatus, setAddStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  // Edit user state
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<Role>("admission_officer");
  const [editActive, setEditActive] = useState(true);
  const [editPassword, setEditPassword] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

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
  const { conversations } = useCRM();
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
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.success && data.usage) {
          setBranchUsageStats(data.usage);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingUsage(false);
      });
    return () => { cancelled = true; };
  }, [branchToDelete, authFetch]);

  // Settings tab: "general" vs "branches"
  const [activeTab, setActiveTab] = useState<"general" | "branches">("general");

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
      if (window.location.hash.toLowerCase() === "#branches") {
        setActiveTab("branches");
      }
      const onHashChange = () => {
        setActiveTab(window.location.hash.toLowerCase() === "#branches" ? "branches" : "general");
      };
      window.addEventListener("hashchange", onHashChange);
      return () => window.removeEventListener("hashchange", onHashChange);
    }
  }, []);

  const handleTabChange = (tab: "general" | "branches") => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      if (tab === "branches") {
        window.location.hash = "branches";
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
  }, [editingMember, editSaving, deletingMember, deleteSaving]);

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
        const data = await res.json();
        if (!ignore) {
          if (data.success && Array.isArray(data.users)) {
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

  // Update team member role or active state
  const handleUpdateMember = async (id: string, updates: Partial<TeamMember>) => {
    // If activating a member, check if seats are already full
    if (updates.active === true) {
      const target = team.find((m) => m.id === id);
      if (target && !target.active && isSeatLimitReached) {
        setAddStatus({
          ok: false,
          msg: `Cannot activate ${target.name}. All ${maxSeats} seats are currently in use. Deactivate another member first.`,
        });
        return;
      }
    }

    // Optimistic update
    setTeam((prev) => prev.map((m) => (m.id === id ? { ...m, ...updates } : m)));

    try {
      const res = await authFetch(`/crm-api/auth/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!data.success) {
        // Rollback
        setTeam((prev) => prev.map((m) => (m.id === id ? { ...m, active: !updates.active } : m)));
        setAddStatus({ ok: false, msg: data.error || "Failed to update member." });
      }
    } catch (err) {
      console.error("Failed to update user:", err);
      // Rollback
      setTeam((prev) => prev.map((m) => (m.id === id ? { ...m, active: !updates.active } : m)));
      setAddStatus({ ok: false, msg: "Network error. Unable to reach server." });
    }
  };

  // Open edit modal
  const handleOpenEdit = (member: TeamMember) => {
    setEditingMember(member);
    setEditName(member.name);
    setEditEmail(member.email);
    setEditRole(normalizeRole(member.role));
    setEditActive(member.active);
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
      } = {
        name: trimmedName,
        email: trimmedEmail,
        role: editRole,
        active: editActive,
      };

      if (editPassword.trim()) {
        payload.password = editPassword.trim();
      }

      const res = await authFetch(`/crm-api/auth/users/${editingMember.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success && data.user) {
        setTeam((prev) =>
          prev.map((m) =>
            m.id === editingMember.id
              ? {
                  ...m,
                  name: data.user.name,
                  email: data.user.email,
                  role: data.user.role,
                  active: data.user.active,
                }
              : m
          )
        );

        // If user edited their own account info, sync auth context
        if (editingMember.id === user?.id || editingMember.email === user?.email) {
          updateCurrentUser({
            name: data.user.name,
            email: data.user.email,
            role: data.user.role,
          });
        }

        setAddStatus({ ok: true, msg: `User ${data.user.name} updated successfully.` });
        setTimeout(() => setAddStatus(null), 3500);
        setEditingMember(null);
      } else {
        setEditError(data.error || "Failed to update member.");
      }
    } catch {
      setEditError("Network error. Unable to reach server.");
    } finally {
      setEditSaving(false);
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
        setTeam((prev) => prev.filter((m) => m.id !== deletingMember.id));
        setAddStatus({ ok: true, msg: `User ${deletedName} deleted successfully.` });
        setTimeout(() => setAddStatus(null), 3500);
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
    <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 pb-12 w-full" style={{ background: "var(--bg-page)", color: "var(--text-primary)", WebkitOverflowScrolling: "touch" }}>
      <div className="max-w-4xl mx-auto">
        {/* Header & Simple Formal Tabs */}
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>
            Settings
          </h1>

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
          </div>
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

      {/* Team Card */}
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

        <div className="mb-1" style={{ borderBottom: "1px solid var(--border-main)" }} />

        {loadingTeam ? (
          <div className="py-6 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
            Loading team members…
          </div>
        ) : (
          team.map((member) => {
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

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">

                  {/* Quick role select */}
                  <select
                    disabled={!canEditThisMember}
                    value={normMemberRole}
                    onChange={(e) => handleUpdateMember(member.id, { role: e.target.value as Role })}
                    className="h-[26px] text-[11px] rounded-[6px] px-2 outline-none shrink-0 w-[130px] transition-colors"
                    style={{
                      background: "var(--bg-input)",
                      border: "1px solid var(--border-input)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <option value="admission_officer">Admission Officer</option>
                    <option value="enrollment_director">Enrollment Director</option>
                    <option value="finance">Finance</option>
                    <option value="marketing">Marketing</option>
                    {userIsChairman && (
                      <option value="chairman">Chairman</option>
                    )}
                  </select>

                  {/* Primary: Activate / Deactivate */}
                  <button
                    type="button"
                    disabled={!canManageTeam || (isChairmanMember && !userIsChairman) || isSelf || (!member.active && isSeatLimitReached)}
                    onClick={() => handleUpdateMember(member.id, { active: !member.active })}
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
          })
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
              <div className="flex items-center gap-2 shrink-0">
                <select
                  disabled={isSeatLimitReached}
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as Role)}
                  className={`h-[28px] text-[11px] rounded-[6px] px-2 outline-none w-[140px] ${
                    isSeatLimitReached ? "opacity-60 cursor-not-allowed" : ""
                  }`}
                  style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)", color: "var(--text-primary)" }}
                >
                  <option value="admission_officer">Admission Officer</option>
                  <option value="enrollment_director">Enrollment Director</option>
                  <option value="finance">Finance</option>
                  <option value="marketing">Marketing</option>
                  {normalizeRole(user?.role) === "chairman" && (
                    <option value="chairman">Chairman</option>
                  )}
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

      {/* ── BRANCHES TAB CONTENT ────────────────────────────────────────── */}
      {activeTab === "branches" && (
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
                  <option value="admission_officer">Admission Officer</option>
                  <option value="enrollment_director">Enrollment Director</option>
                  <option value="finance">Finance</option>
                  <option value="marketing">Marketing</option>
                  {normalizeRole(user?.role) === "chairman" && (
                    <option value="chairman">Chairman</option>
                  )}
                </select>
              </div>

              {/* Active status toggle */}
              <div
                className="flex items-center justify-between rounded-[8px] px-3 py-2.5"
                style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)" }}
              >
                <div>
                  <p className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>
                    Active
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                    Inactive users cannot log in
                  </p>
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

      {/* ── Delete User Confirmation Modal ────────────────────────────────── */}
      {deletingMember && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => { if (!deleteSaving) setDeletingMember(null); }}
        >
          <div
            className="w-full max-w-[360px] rounded-xl shadow-xl"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-main)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-5">
              <p className="text-[13px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                Delete user
              </p>
              <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                This will permanently remove{" "}
                <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                  {deletingMember.name}
                </span>{" "}
                ({deletingMember.email}) from the system. This action cannot be undone.
              </p>

              {deleteError && (
                <p className="mt-3 text-[11px] font-medium text-[#FF3B30]">{deleteError}</p>
              )}

              <div className="flex items-center justify-end gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => { if (!deleteSaving) setDeletingMember(null); }}
                  disabled={deleteSaving}
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
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={deleteSaving}
                  className="h-[30px] px-4 text-[12px] font-medium rounded-[6px] transition-colors cursor-pointer disabled:opacity-50"
                  style={{
                    background: "rgba(179, 38, 30, 0.08)",
                    border: "1px solid rgba(179, 38, 30, 0.25)",
                    color: "#b3261e",
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
  );
}
