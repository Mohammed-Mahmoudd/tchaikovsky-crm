"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import {
  Camera,
  X,
  CheckCircle2,
  AlertCircle,
  UploadCloud,
  ArrowRight,
  User as UserIcon,
} from "lucide-react";

/* ── Client-side 256x256 image crop & compression ── */
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

const SESSION_DISMISS_KEY = "tchaikovsky_dismiss_avatar_modal";

export function AvatarPromptAlert() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, updateCurrentUser, authFetch } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isLoginPage = pathname === "/login";
  const isProfilePage = pathname === "/profile";
  const hasAvatar = Boolean(user?.avatar && user.avatar.trim());

  // Check on mount & login whether user needs avatar prompt
  useEffect(() => {
    if (loading || !user || isLoginPage || hasAvatar) {
      setIsOpen(false);
      return;
    }

    // Suppress modal on the profile page itself (user is already on the edit screen)
    if (isProfilePage) {
      setIsOpen(false);
      return;
    }

    try {
      const dismissed = sessionStorage.getItem(SESSION_DISMISS_KEY);
      if (!dismissed) {
        // Small delay so user sees dashboard context before dialog opens
        const timer = setTimeout(() => {
          setIsOpen(true);
        }, 350);
        return () => clearTimeout(timer);
      }
    } catch {}
  }, [loading, user, isLoginPage, isProfilePage, hasAvatar]);

  // Handle dismiss for the current browser session
  const handleDismiss = useCallback(() => {
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, "true");
    } catch {}
    setIsOpen(false);
  }, []);

  // Keyboard escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !saving) {
        handleDismiss();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, saving, handleDismiss]);

  const processFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setStatus({ ok: false, msg: "Please select an image file (JPEG, PNG, or WebP)." });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setStatus({ ok: false, msg: "Image file is too large. Max size is 10MB." });
      return;
    }

    setSaving(true);
    setStatus(null);

    try {
      const resizedBase64 = await resizeImageToAvatar(file, 256, 256);
      setPreview(resizedBase64);

      // Persist to server
      const res = await authFetch("/crm-api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar: resizedBase64 }),
      });

      const data = await res.json().catch(() => ({}));
      if (data.success || res.ok) {
        updateCurrentUser({ avatar: resizedBase64 });
        setStatus({ ok: true, msg: "Profile picture saved successfully!" });
        // Close modal after brief success confirmation
        setTimeout(() => {
          setIsOpen(false);
        }, 1200);
      } else {
        setStatus({ ok: false, msg: data.error || "Failed to save profile picture." });
      }
    } catch {
      setStatus({ ok: false, msg: "Failed to upload photo. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleNavigateToProfile = () => {
    handleDismiss();
    router.push("/profile");
  };

  // If user has an avatar or is on login, render nothing
  if (loading || !user || hasAvatar || isLoginPage) {
    return null;
  }

  return (
    <>
      {/* ── Persistent Top Alert Bar (shown across app when modal is closed, except on profile) ── */}
      {!isOpen && !isProfilePage && (
        <div
          className="px-4 py-2.5 flex items-center justify-between gap-3 text-[12px] shrink-0 border-b transition-colors shadow-2xs z-30"
          style={{
            background: "rgba(0, 102, 255, 0.08)",
            borderColor: "rgba(0, 102, 255, 0.2)",
            color: "var(--text-primary)",
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0066FF] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#0066FF]" />
            </span>
            <p className="truncate">
              <span className="font-bold text-[#0066FF]">Profile Picture Required:</span>{" "}
              Please add a photo so staff and leads can identify you.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="px-3 py-1 text-[11px] font-semibold rounded-lg text-white bg-[#0066FF] hover:opacity-90 transition-opacity cursor-pointer shadow-2xs flex items-center gap-1.5"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Add Photo</span>
            </button>
            <button
              type="button"
              onClick={handleNavigateToProfile}
              className="px-2.5 py-1 text-[11px] font-medium rounded-lg hover:bg-[rgba(0,0,0,0.05)] transition-colors cursor-pointer hidden sm:inline-flex"
              style={{ color: "var(--text-secondary)" }}
            >
              Go to Profile
            </button>
          </div>
        </div>
      )}

      {/* ── Modal Dialog Prompt (Triggered on login) ── */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[250] flex items-center justify-center p-4 animate-in fade-in duration-200"
          style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
          onClick={() => {
            if (!saving) handleDismiss();
          }}
        >
          <div
            className="w-full max-w-[420px] rounded-2xl p-6 shadow-2xl relative border animate-in zoom-in-95 duration-200 flex flex-col items-center text-center"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-main)",
              color: "var(--text-primary)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              type="button"
              disabled={saving}
              onClick={handleDismiss}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer disabled:opacity-50"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileSelect}
            />

            {/* Icon Header */}
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3 shadow-2xs"
              style={{ background: "rgba(0, 102, 255, 0.12)", color: "#0066FF" }}
            >
              <Camera className="w-6 h-6" />
            </div>

            <h3 className="text-xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
              Add Your Profile Picture
            </h3>
            <p className="text-[12px] mt-1.5 leading-relaxed max-w-xs" style={{ color: "var(--text-secondary)" }}>
              Welcome back, <strong style={{ color: "var(--text-primary)" }}>{user.name}</strong>! Having an active profile photo is important for recognition across chats, admissions, and team records.
            </p>

            {/* Interactive Photo Drop Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => {
                if (!saving) fileInputRef.current?.click();
              }}
              className={`mt-5 relative w-28 h-28 rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all border-2 border-dashed ${
                isDragOver ? "border-[#0066FF] scale-105" : "hover:border-[#0066FF]"
              }`}
              style={{
                background: "var(--bg-panel)",
                borderColor: isDragOver ? "#0066FF" : "var(--border-input)",
              }}
            >
              {preview ? (
                <img
                  src={preview}
                  alt="Profile Preview"
                  className="w-full h-full object-cover rounded-2xl"
                />
              ) : (
                <>
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center mb-1"
                    style={{ background: "var(--bg-card)", color: "var(--text-muted)" }}
                  >
                    <UserIcon className="w-7 h-7" />
                  </div>
                  <span className="text-[10px] font-semibold text-[#0066FF]">Choose Photo</span>
                </>
              )}

              {/* Camera Badge in bottom right */}
              <div
                className="absolute -bottom-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center text-white shadow-md"
                style={{ background: "#0066FF" }}
              >
                <Camera className="w-3.5 h-3.5" />
              </div>
            </div>

            <p className="text-[11px] mt-3" style={{ color: "var(--text-muted)" }}>
              Click to browse or drag & drop (JPEG, PNG, WebP)
            </p>

            {/* Status Message */}
            {status && (
              <div
                className={`mt-3 px-3 py-1.5 rounded-lg text-[12px] font-medium flex items-center gap-1.5 ${
                  status.ok
                    ? "text-[#34C759] bg-[rgba(52,199,89,0.1)]"
                    : "text-[#FF3B30] bg-[rgba(255,59,48,0.1)]"
                }`}
              >
                {status.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                <span>{status.msg}</span>
              </div>
            )}

            {/* Buttons */}
            <div className="w-full space-y-2 mt-5">
              <button
                type="button"
                disabled={saving}
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2.5 px-4 text-[13px] font-bold rounded-xl text-white bg-[#0066FF] hover:opacity-90 active:scale-[0.99] transition-all cursor-pointer shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Saving Photo…</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4" />
                    <span>Upload Photo Now</span>
                  </>
                )}
              </button>

              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleNavigateToProfile}
                  className="flex-1 py-2 text-[12px] font-medium rounded-lg hover:bg-[var(--bg-hover)] transition-colors cursor-pointer flex items-center justify-center gap-1"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <span>Go to Profile</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  disabled={saving}
                  onClick={handleDismiss}
                  className="flex-1 py-2 text-[12px] font-medium rounded-lg hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                  style={{ color: "var(--text-muted)" }}
                >
                  Remind Me Later
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

