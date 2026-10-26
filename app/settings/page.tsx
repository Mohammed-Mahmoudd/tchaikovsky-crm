"use client";

import React, { useState, useEffect } from "react";
import { useAuth, Role, getRoleDisplayName, normalizeRole, canManageTeamRole } from "../components/AuthProvider";

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
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [addMode, setAddMode] = useState<"invite" | "password">("invite");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newMemberPw, setNewMemberPw] = useState("");
  const [newRole, setNewRole] = useState<Role>("admission_officer");
  const [addingUser, setAddingUser] = useState(false);
  const [addStatus, setAddStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const [nameInput, setNameInput] = useState<string | null>(null);
  const displayName = nameInput ?? (user?.name || "");

  const canManageTeam = authCanManageTeam || canManageTeamRole(user?.role);

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

  // Update team member role or active state
  const handleUpdateMember = async (id: string, updates: Partial<TeamMember>) => {
    // Optimistic update
    setTeam((prev) => prev.map((m) => (m.id === id ? { ...m, ...updates } : m)));

    try {
      await authFetch(`/crm-api/auth/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
    } catch (err) {
      console.error("Failed to update user:", err);
    }
  };

  // Add new team member
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddStatus(null);
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

  const roleLabel = roleDisplayName || getRoleDisplayName(user?.role);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 pb-12 w-full" style={{ background: "var(--bg-page)", color: "var(--text-primary)", WebkitOverflowScrolling: "touch" }}>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-[15px] font-bold mb-5" style={{ color: "var(--text-primary)" }}>
          Settings
        </h1>

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
          <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            {team.length} / 10 seats used
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
                className="flex items-center gap-2 py-3"
                style={{ borderBottom: "1px solid var(--border-main)" }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium leading-tight truncate" style={{ color: "var(--text-primary)" }}>
                    {member.name} {isSelf && <span className="text-[10px] text-[#0066FF] font-semibold">(You)</span>}
                  </p>
                  <p className="text-[11px] truncate" style={{ color: "var(--text-secondary)" }}>
                    {member.email} {!member.active && <span className="text-[#FF3B30]">(Deactivated)</span>}
                  </p>
                </div>

                {/* Role select */}
                <select
                  disabled={!canEditThisMember}
                  value={normMemberRole}
                  onChange={(e) => handleUpdateMember(member.id, { role: e.target.value as Role })}
                  className="h-[26px] text-[11px] rounded-[6px] px-1.5 outline-none shrink-0 w-[140px]"
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-input)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="chairman">Chairman</option>
                  <option value="admission_officer">Admission Officer</option>
                  <option value="enrollment_director">Enrollment Director</option>
                  <option value="finance">Finance</option>
                  <option value="marketing">Marketing</option>
                </select>

                {/* Actions */}
                <div className="flex gap-1.5 shrink-0">
                  <button
                    disabled={!canManageTeam || (isChairmanMember && !userIsChairman) || isSelf}
                    onClick={() => handleUpdateMember(member.id, { active: !member.active })}
                    className={`h-[26px] px-2 text-[10px] font-medium rounded-[6px] transition-colors whitespace-nowrap ${
                      (isChairmanMember && !userIsChairman) || isSelf || !canManageTeam ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                    }`}
                    style={{
                      background: member.active ? "var(--bg-pill)" : "rgba(255,59,48,0.1)",
                      color: member.active ? "var(--text-primary)" : "#FF3B30",
                    }}
                  >
                    {member.active ? "Deactivate" : "Activate"}
                  </button>
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

            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              <input
                type="text"
                placeholder="Full name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="flex-1 min-w-0 h-[28px] px-2.5 text-[12px] rounded-[6px] outline-none transition-colors focus:border-[#0066FF] placeholder-gray-400"
                style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)", color: "var(--text-primary)" }}
              />
              <input
                type="email"
                placeholder="Email address"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="flex-1 min-w-0 h-[28px] px-2.5 text-[12px] rounded-[6px] outline-none transition-colors focus:border-[#0066FF] placeholder-gray-400"
                style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)", color: "var(--text-primary)" }}
              />
              {addMode === "password" && (
                <input
                  type="password"
                  placeholder="Password"
                  value={newMemberPw}
                  onChange={(e) => setNewMemberPw(e.target.value)}
                  className="flex-1 min-w-0 h-[28px] px-2.5 text-[12px] rounded-[6px] outline-none transition-colors focus:border-[#0066FF] placeholder-gray-400"
                  style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)", color: "var(--text-primary)" }}
                />
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                {addMode === "invite"
                  ? "They will receive an invitation email to set up their account."
                  : "Account will be created immediately with this password."}
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as Role)}
                  className="h-[28px] text-[11px] rounded-[6px] px-2 outline-none w-[140px]"
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
                  disabled={addingUser}
                  className="h-[28px] px-4 text-[12px] font-medium text-white bg-[#0066FF] rounded-[6px] hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap cursor-pointer"
                >
                  {addingUser ? "Adding…" : addMode === "invite" ? "Send invite" : "Create account"}
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
      </div>
    </div>
  );
}
