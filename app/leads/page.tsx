"use client";

import React, { useState, useMemo, useRef, useEffect, useCallback, memo } from "react";
import {
  useCRM,
  normalizeWhatsAppPhone,
  Conversation,
  AssignableAgent,
  CreateManualLeadInput,
  CreateManualLeadResult,
} from "../context/CRMContext";
import { useAuth, isDirectorOrChairmanRole, isAdmissionRole } from "../components/AuthProvider";
import { useBranches } from "../lib/branches";
import { BranchSelect } from "../components/BranchSelect";
import { matchLeadSearch } from "../utils/search";
import {
  MessageSquare,
  Plus,
  X,
  Search,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const STAGE_COLORS: Record<string, string> = {
  "New":             "#0066FF",
  "Contacted":       "#5856D6",
  "Qualified":       "#30B0C7",
  "Audition Booked": "#FF9500",
  "Attended":        "#34C759",
  "Enrolled":        "#30D158",
  "Joining Later":   "#F59E0B",
  "Unqualified":     "#8E8E93",
  "Lost":            "#FF3B30",
  "direct":          "#8E8E93",
};

const REFERRAL_SOURCES = [
  "Student Referral",
  "Instructor Referral",
  "Walk-in / Direct",
  "Phone Call",
  "Other Referral",
] as const;

const INSTRUMENTS = ["", "Piano", "Violin", "Guitar", "Vocal"] as const;

// Shared singleton formatter — avoids instantiating Intl.DateTimeFormat hundreds of times per render
const RECEIVED_DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function formatReceivedDate(iso?: string): string {
  if (!iso) return "Just now";
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "—";
  return RECEIVED_DATE_FORMATTER.format(new Date(ts));
}

type Lead = {
  id: string;
  received: string;
  name: string;
  leadName?: string;
  phone: string;
  campaign: string;
  ad: string;
  stage: string;
  agent: string;
  channel: string;
};

const PAGE_SIZE = 50;

// ── Memoized Desktop Table Row (only re-renders when this specific lead changes) ──
type LeadRowProps = {
  lead: Lead;
  idx: number;
  isChairman: boolean;
  isAdmission: boolean;
  isReadOnly: boolean;
  userClean: string;
  userName?: string;
  assignableAgents: AssignableAgent[];
  onPatchAgent: (id: string, agent: string) => void;
  onOpenChat: (id: string) => void;
};

const LeadTableRow = memo(function LeadTableRow({
  lead,
  idx,
  isChairman,
  isAdmission,
  isReadOnly,
  userClean,
  userName,
  assignableAgents,
  onPatchAgent,
  onOpenChat,
}: LeadRowProps) {
  const agentClean = (lead.agent || "").trim().toLowerCase();
  const isLeadUnassigned = !agentClean || agentClean === "unassigned";
  const isAssignedToMe = !isLeadUnassigned && Boolean(userClean) && userClean === agentClean;
  const isAssignedToOther = !isLeadUnassigned && !isAssignedToMe;
  const canAssignToSelf = !isReadOnly && isAdmission && (isLeadUnassigned || isAssignedToMe);
  const canEditAgent = !isReadOnly && (isChairman || canAssignToSelf);

  return (
    <tr
      style={{
        background: idx % 2 === 0 ? "transparent" : "var(--bg-card)",
        borderBottom: "1px solid var(--border-main)",
      }}
    >
      <td className="py-3 px-4 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
        {lead.received}
      </td>
      <td className="py-3 px-4 font-semibold max-w-[220px] truncate">{lead.name}</td>
      <td className="py-3 px-4 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
        {lead.phone}
      </td>
      <td className="py-3 px-4 whitespace-nowrap">
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: "var(--bg-pill)", color: "var(--text-secondary)" }}
        >
          {lead.channel}
        </span>
      </td>
      <td className="py-3 px-4 max-w-[200px] truncate" style={{ color: "var(--text-secondary)" }}>
        {lead.campaign}
      </td>
      <td className="py-3 px-4 whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <select
            disabled={!canEditAgent}
            aria-label={`Assign agent for ${lead.name}`}
            title={
              !canEditAgent
                ? isAssignedToOther
                  ? `Assigned to ${lead.agent}. Only Chairman can reassign.`
                  : "Only Chairman or Admission can assign leads"
                : undefined
            }
            value={lead.agent}
            onChange={(e) => onPatchAgent(lead.id, e.target.value)}
            className="text-[11px] font-medium rounded-[6px] px-1.5 py-1 outline-none cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: "var(--bg-pill)",
              border: "1px solid var(--border-input)",
              color: "var(--text-primary)",
            }}
          >
            {isChairman ? (
              <>
                <option value="Unassigned">Unassigned</option>
                {lead.agent &&
                  lead.agent !== "Unassigned" &&
                  !assignableAgents.some((a) => a.name === lead.agent) && (
                    <option value={lead.agent}>{lead.agent}</option>
                  )}
                {assignableAgents.map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.name}
                  </option>
                ))}
              </>
            ) : isAdmission ? (
              <>
                {isLeadUnassigned ? (
                  <>
                    <option value="Unassigned">Unassigned</option>
                    {userName && <option value={userName}>{userName} (Assign to me)</option>}
                  </>
                ) : isAssignedToMe ? (
                  <>
                    <option value={userName || lead.agent}>{userName || lead.agent}</option>
                    <option value="Unassigned">Unassigned</option>
                  </>
                ) : (
                  <option value={lead.agent}>{lead.agent}</option>
                )}
              </>
            ) : (
              <option value={lead.agent || "Unassigned"}>{lead.agent || "Unassigned"}</option>
            )}
          </select>
          {isLeadUnassigned && isAdmission && userName && !isReadOnly && (
            <button
              type="button"
              onClick={() => onPatchAgent(lead.id, userName)}
              className="text-[11px] font-semibold text-[#0066FF] hover:underline cursor-pointer shrink-0 px-1 py-0.5"
              title="Quick claim lead"
            >
              Claim
            </button>
          )}
        </div>
      </td>
      <td className="py-3 px-4 whitespace-nowrap">
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{
            background: `${STAGE_COLORS[lead.stage] || "#0066FF"}18`,
            color: STAGE_COLORS[lead.stage] || "#0066FF",
          }}
        >
          {lead.stage}
        </span>
      </td>
      <td className="py-3 px-4 text-right whitespace-nowrap">
        <button
          type="button"
          onClick={() => onOpenChat(lead.id)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-lg text-white bg-[#0066FF] hover:bg-[#0055D6] transition cursor-pointer"
          title="Open in Inbox"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Chat
        </button>
      </td>
    </tr>
  );
});

// ── Memoized Mobile Card ──
const LeadMobileCard = memo(function LeadMobileCard({
  lead,
  isChairman,
  isAdmission,
  isReadOnly,
  userClean,
  userName,
  assignableAgents,
  onPatchAgent,
  onOpenChat,
}: Omit<LeadRowProps, "idx">) {
  const agentClean = (lead.agent || "").trim().toLowerCase();
  const isLeadUnassigned = !agentClean || agentClean === "unassigned";
  const isAssignedToMe = !isLeadUnassigned && Boolean(userClean) && userClean === agentClean;
  const canAssignToSelf = !isReadOnly && isAdmission && (isLeadUnassigned || isAssignedToMe);
  const canEditAgent = !isReadOnly && (isChairman || canAssignToSelf);

  return (
    <div
      className="rounded-xl p-3.5 flex flex-col gap-2.5"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-main)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
            {lead.name}
          </p>
          <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {lead.phone} · {lead.received}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: "var(--bg-pill)", color: "var(--text-secondary)" }}
          >
            {lead.channel}
          </span>
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{
              background: `${STAGE_COLORS[lead.stage] || "#0066FF"}18`,
              color: STAGE_COLORS[lead.stage] || "#0066FF",
            }}
          >
            {lead.stage}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="truncate" style={{ color: "var(--text-secondary)" }}>
          Source: <strong style={{ color: "var(--text-primary)" }}>{lead.campaign}</strong>
        </span>
      </div>

      <div
        className="pt-2 flex items-center justify-between gap-2"
        style={{ borderTop: "1px solid var(--border-main)" }}
      >
        <div className="flex items-center gap-1.5">
          <select
            disabled={!canEditAgent}
            aria-label={`Assign agent for ${lead.name}`}
            value={lead.agent}
            onChange={(e) => onPatchAgent(lead.id, e.target.value)}
            className="text-[11px] font-medium rounded-[6px] px-1.5 py-1 outline-none cursor-pointer transition-colors disabled:opacity-60"
            style={{
              background: "var(--bg-pill)",
              border: "1px solid var(--border-input)",
              color: "var(--text-primary)",
            }}
          >
            {isChairman ? (
              <>
                <option value="Unassigned">Unassigned</option>
                {lead.agent &&
                  lead.agent !== "Unassigned" &&
                  !assignableAgents.some((a) => a.name === lead.agent) && (
                    <option value={lead.agent}>{lead.agent}</option>
                  )}
                {assignableAgents.map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.name}
                  </option>
                ))}
              </>
            ) : isAdmission ? (
              <>
                {isLeadUnassigned ? (
                  <>
                    <option value="Unassigned">Unassigned</option>
                    {userName && <option value={userName}>{userName} (Assign to me)</option>}
                  </>
                ) : isAssignedToMe ? (
                  <>
                    <option value={userName || lead.agent}>{userName || lead.agent}</option>
                    <option value="Unassigned">Unassigned</option>
                  </>
                ) : (
                  <option value={lead.agent}>{lead.agent}</option>
                )}
              </>
            ) : (
              <option value={lead.agent || "Unassigned"}>{lead.agent || "Unassigned"}</option>
            )}
          </select>
          {isLeadUnassigned && isAdmission && userName && !isReadOnly && (
            <button
              type="button"
              onClick={() => onPatchAgent(lead.id, userName)}
              className="text-[11px] font-semibold text-[#0066FF] hover:underline cursor-pointer shrink-0 px-1 py-0.5"
            >
              Claim
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => onOpenChat(lead.id)}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 min-h-[36px] text-[12px] font-semibold rounded-lg text-white bg-[#0066FF] hover:bg-[#0055D6] transition cursor-pointer shrink-0"
          title="Open in Inbox"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Chat
        </button>
      </div>
    </div>
  );
});

// ── Isolated Add Manual Lead Modal (typing inside never re-renders the Leads table) ──
type AddManualLeadModalProps = {
  initialPhone: string;
  conversations: Conversation[];
  assignableAgents: AssignableAgent[];
  isChairman: boolean;
  isAdmission: boolean;
  isReadOnly: boolean;
  userName?: string;
  onClose: () => void;
  onCreateManualLead: (input: CreateManualLeadInput) => Promise<CreateManualLeadResult>;
  onOpenChat: (id: string) => void;
  onLeadSavedToast: (msg: string) => void;
};

const AddManualLeadModal = memo(function AddManualLeadModal({
  initialPhone,
  conversations,
  assignableAgents,
  isChairman,
  isAdmission,
  isReadOnly,
  userName,
  onClose,
  onCreateManualLead,
  onOpenChat,
  onLeadSavedToast,
}: AddManualLeadModalProps) {
  const { branchGroups } = useBranches();
  const defaultAgent = isAdmission && userName ? userName : "Unassigned";

  const [phoneInput, setPhoneInput] = useState(initialPhone);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [referralType, setReferralType] = useState<string>("Student Referral");
  const [referredByInput, setReferredByInput] = useState("");
  const [instrumentInput, setInstrumentInput] = useState("");
  const [branchInput, setBranchInput] = useState("");
  const [agentInput, setAgentInput] = useState<string>(defaultAgent);
  const [notesInput, setNotesInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitBanner, setSubmitBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const phoneInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      phoneInputRef.current?.focus();
    }, 30);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSubmitting, onClose]);

  const normalizedPhone = useMemo(() => normalizeWhatsAppPhone(phoneInput), [phoneInput]);

  const existingMatchingConv = useMemo(() => {
    if (!normalizedPhone) return null;
    const { digits, e164 } = normalizedPhone;
    return (
      conversations.find(
        (c) =>
          c.id === digits ||
          c.phone === e164 ||
          c.formPhone === digits
      ) || null
    );
  }, [normalizedPhone, conversations]);

  const validatePhoneField = useCallback((rawVal: string): string | null => {
    const trimmed = rawVal.trim();
    if (!trimmed) return "Enter a WhatsApp phone number";
    if (!normalizeWhatsAppPhone(trimmed)) {
      return "Enter a valid phone number (e.g. 01012345678 or +966501234567)";
    }
    return null;
  }, []);

  const handleSubmit = async (openChatImmediately: boolean) => {
    if (isSubmitting || isReadOnly) return;
    setPhoneTouched(true);
    const err = validatePhoneField(phoneInput);
    if (err) {
      setPhoneError(err);
      phoneInputRef.current?.focus();
      return;
    }
    setPhoneError(null);
    setSubmitBanner(null);
    setIsSubmitting(true);

    try {
      const targetPhone = normalizedPhone?.e164 || phoneInput.trim();
      const targetId = normalizedPhone?.digits || "";

      const createPromise = onCreateManualLead({
        phone: targetPhone,
        name: nameInput.trim() || undefined,
        referralType,
        referredBy: referredByInput.trim() || undefined,
        agent: agentInput || defaultAgent,
        branch: branchInput || undefined,
        notes: notesInput.trim() || undefined,
        instrument: instrumentInput || undefined,
      });

      if (openChatImmediately && targetId) {
        const finalId = existingMatchingConv?.id || targetId;
        onClose();
        onOpenChat(finalId);
        await createPromise;
        return;
      }

      const result = await createPromise;
      if (!result.ok) {
        setSubmitBanner({
          type: "error",
          text: result.error || "Could not create lead. Please check the phone number and try again.",
        });
        return;
      }

      if (openChatImmediately) {
        onClose();
        onOpenChat(result.conversationId);
        return;
      }

      const displayLabel = nameInput.trim()
        ? `${nameInput.trim()} (${targetPhone})`
        : targetPhone;
      setPhoneInput("");
      setPhoneTouched(false);
      setPhoneError(null);
      setNameInput("");
      setNotesInput("");
      setSubmitBanner({
        type: "success",
        text: result.existed
          ? `Updated existing lead ${displayLabel}.`
          : `Added ${displayLabel} to Leads.`,
      });
      onLeadSavedToast(
        result.existed ? `Lead ${displayLabel} updated` : `Lead ${displayLabel} added`
      );
      phoneInputRef.current?.focus();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0, 0, 0, 0.55)" }}
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-lead-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-[480px] max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-main)",
          color: "var(--text-primary)",
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: "1px solid var(--border-main)" }}
        >
          <div>
            <h2
              id="add-lead-modal-title"
              className="text-[15px] font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              Add manual lead
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
              Enter a WhatsApp number for a student or instructor referral to start chatting.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close modal"
            className="p-2 rounded-lg transition-colors cursor-pointer"
            style={{ color: "var(--text-secondary)" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit(true);
          }}
          className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4"
        >
          {submitBanner && (
            <div
              className="flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-[12px]"
              style={
                submitBanner.type === "success"
                  ? {
                      background: "rgba(52, 199, 89, 0.12)",
                      border: "1px solid rgba(52, 199, 89, 0.3)",
                      color: "#34C759",
                    }
                  : {
                      background: "rgba(255, 59, 48, 0.12)",
                      border: "1px solid rgba(255, 59, 48, 0.3)",
                      color: "#FF3B30",
                    }
              }
            >
              {submitBanner.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span>{submitBanner.text}</span>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="manual-lead-phone"
                className="text-[12px] font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                WhatsApp phone number <span className="text-[#FF3B30]">*</span>
              </label>
              {normalizedPhone && (
                <span
                  className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded"
                  style={{
                    background: "rgba(52, 199, 89, 0.12)",
                    color: "#34C759",
                  }}
                >
                  WhatsApp: {normalizedPhone.e164}
                </span>
              )}
            </div>
            <input
              id="manual-lead-phone"
              ref={phoneInputRef}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phoneInput}
              onChange={(e) => {
                const val = e.target.value;
                setPhoneInput(val);
                if (phoneTouched) {
                  setPhoneError(validatePhoneField(val));
                }
              }}
              onBlur={() => {
                setPhoneTouched(true);
                setPhoneError(validatePhoneField(phoneInput));
              }}
              placeholder="e.g. 01012345678 or +966501234567"
              className="w-full h-[40px] px-3 text-[16px] sm:text-[13px] rounded-xl outline-none transition-colors"
              style={{
                background: "var(--bg-input)",
                border: phoneError ? "1px solid #FF3B30" : "1px solid var(--border-input)",
                color: "var(--text-primary)",
              }}
            />
            {phoneError && (
              <p className="text-[11px] mt-1 text-[#FF3B30] font-medium">{phoneError}</p>
            )}

            {existingMatchingConv && !phoneError && (
              <div
                className="mt-2 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2 text-[11px]"
                style={{
                  background: "var(--bg-selected)",
                  border: "1px solid rgba(0, 102, 255, 0.25)",
                  color: "var(--text-primary)",
                }}
              >
                <div className="min-w-0">
                  <p className="font-semibold truncate">
                    Already in CRM:{" "}
                    {existingMatchingConv.leadName ||
                      existingMatchingConv.profileName ||
                      existingMatchingConv.name}
                  </p>
                  <p style={{ color: "var(--text-secondary)" }}>
                    Stage: {existingMatchingConv.pipeline || "New"} · Agent:{" "}
                    {existingMatchingConv.agent || "Unassigned"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenChat(existingMatchingConv.id);
                  }}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-white bg-[#0066FF] hover:bg-[#0055D6] shrink-0 cursor-pointer"
                >
                  Open chat
                </button>
              </div>
            )}
          </div>

          <div>
            <label
              htmlFor="manual-lead-name"
              className="block text-[12px] font-semibold mb-1.5"
              style={{ color: "var(--text-primary)" }}
            >
              Lead name
            </label>
            <input
              id="manual-lead-name"
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Student or parent full name"
              className="w-full h-[38px] px-3 text-[16px] sm:text-[13px] rounded-xl outline-none transition-colors"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-input)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          <div>
            <label
              className="block text-[12px] font-semibold mb-1.5"
              style={{ color: "var(--text-primary)" }}
            >
              Source
            </label>
            <div className="flex flex-wrap gap-1.5">
              {REFERRAL_SOURCES.map((src) => {
                const active = referralType === src;
                return (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setReferralType(src)}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                    style={
                      active
                        ? { background: "#0066FF", color: "#ffffff" }
                        : {
                            background: "var(--bg-input)",
                            border: "1px solid var(--border-input)",
                            color: "var(--text-secondary)",
                          }
                    }
                  >
                    {src}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="manual-lead-referred-by"
                className="block text-[12px] font-semibold mb-1.5"
                style={{ color: "var(--text-primary)" }}
              >
                {referralType === "Instructor Referral"
                  ? "Referred by instructor"
                  : referralType === "Student Referral"
                  ? "Referred by student"
                  : "Referred by / Reference"}
              </label>
              <input
                id="manual-lead-referred-by"
                type="text"
                value={referredByInput}
                onChange={(e) => setReferredByInput(e.target.value)}
                placeholder={
                  referralType === "Instructor Referral"
                    ? "Instructor name"
                    : referralType === "Student Referral"
                    ? "Student name"
                    : "Optional reference"
                }
                className="w-full h-[38px] px-3 text-[16px] sm:text-[13px] rounded-xl outline-none"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-input)",
                  color: "var(--text-primary)",
                }}
              />
            </div>

            <div>
              <label
                htmlFor="manual-lead-instrument"
                className="block text-[12px] font-semibold mb-1.5"
                style={{ color: "var(--text-primary)" }}
              >
                Instrument
              </label>
              <select
                id="manual-lead-instrument"
                value={instrumentInput}
                onChange={(e) => setInstrumentInput(e.target.value)}
                className="w-full h-[38px] px-3 text-[16px] sm:text-[13px] rounded-xl outline-none cursor-pointer"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-input)",
                  color: "var(--text-primary)",
                }}
              >
                <option value="">Not specified</option>
                {INSTRUMENTS.filter(Boolean).map((inst) => (
                  <option key={inst} value={inst}>
                    {inst}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                className="block text-[12px] font-semibold mb-1.5"
                style={{ color: "var(--text-primary)" }}
              >
                Branch
              </label>
              <BranchSelect
                value={branchInput}
                onChange={setBranchInput}
                branchGroups={branchGroups}
                placeholder="Select branch (optional)"
              />
            </div>

            <div>
              <label
                htmlFor="manual-lead-agent"
                className="block text-[12px] font-semibold mb-1.5"
                style={{ color: "var(--text-primary)" }}
              >
                Assign to
              </label>
              <select
                id="manual-lead-agent"
                value={agentInput || defaultAgent}
                onChange={(e) => setAgentInput(e.target.value)}
                disabled={!isChairman && !isAdmission}
                className="w-full h-[38px] px-3 text-[16px] sm:text-[13px] rounded-xl outline-none cursor-pointer disabled:opacity-60"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-input)",
                  color: "var(--text-primary)",
                }}
              >
                {isChairman ? (
                  <>
                    <option value="Unassigned">Unassigned</option>
                    {assignableAgents.map((a) => (
                      <option key={a.name} value={a.name}>
                        {a.name}
                      </option>
                    ))}
                  </>
                ) : isAdmission ? (
                  <>
                    {userName && <option value={userName}>{userName} (Assign to me)</option>}
                    <option value="Unassigned">Unassigned</option>
                  </>
                ) : (
                  <option value="Unassigned">Unassigned</option>
                )}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="manual-lead-notes"
              className="block text-[12px] font-semibold mb-1.5"
              style={{ color: "var(--text-primary)" }}
            >
              Notes
            </label>
            <textarea
              id="manual-lead-notes"
              rows={2}
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value)}
              placeholder="Student age, preferred schedule, or referral details…"
              className="w-full px-3 py-2 text-[16px] sm:text-[13px] rounded-xl outline-none resize-none"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-input)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          <div
            className="pt-3 mt-1 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2"
            style={{ borderTop: "1px solid var(--border-main)" }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-2 min-h-[40px] sm:min-h-[36px] text-[12px] font-semibold rounded-xl transition-colors cursor-pointer"
              style={{
                background: "transparent",
                border: "1px solid var(--border-input)",
                color: "var(--text-secondary)",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmit(false)}
              className="px-3.5 py-2 min-h-[40px] sm:min-h-[36px] text-[12px] font-semibold rounded-xl transition-colors cursor-pointer disabled:opacity-60"
              style={{
                background: "var(--bg-pill)",
                border: "1px solid var(--border-input)",
                color: "var(--text-primary)",
              }}
            >
              Save & add another
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-[40px] sm:min-h-[36px] text-[12px] font-semibold rounded-xl text-white bg-[#0066FF] hover:bg-[#0055D6] transition-colors cursor-pointer disabled:opacity-60"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              {existingMatchingConv ? "Update & open chat" : "Create & open chat"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

export default function LeadsPage() {
  const {
    conversations,
    loading,
    openChat,
    assignableAgents,
    patchConversation,
    createManualLead,
    searchQuery,
    setSearchQuery,
  } = useCRM();
  const { isReadOnly, user } = useAuth();

  const isChairman = isDirectorOrChairmanRole(user?.role);
  const isAdmission = isAdmissionRole(user?.role);
  const userClean = (user?.name || "").trim().toLowerCase();

  const [filterStage, setFilterStage] = useState("All");
  const [filterCampaign, setFilterCampaign] = useState("All campaigns");
  const [localSearch, setLocalSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [prefillPhone, setPrefillPhone] = useState("");
  const [pageToast, setPageToast] = useState<string | null>(null);

  const handleOpenAddModal = useCallback((phone = "") => {
    setPrefillPhone(phone);
    setIsAddModalOpen(true);
  }, []);

  const handleCloseAddModal = useCallback(() => {
    setIsAddModalOpen(false);
  }, []);

  const handlePatchAgent = useCallback(
    (id: string, agent: string) => {
      patchConversation(id, { agent });
    },
    [patchConversation]
  );

  useEffect(() => {
    if (!pageToast) return;
    const t = setTimeout(() => setPageToast(null), 4000);
    return () => clearTimeout(t);
  }, [pageToast]);

  const effectiveSearch = (localSearch || searchQuery).trim();

  // Reset pagination to page 1 when filters or search change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterStage, filterCampaign, effectiveSearch]);

  const leads: Lead[] = useMemo(() => {
    return conversations.map((c) => ({
      id: c.id,
      received: formatReceivedDate(c.createdAt),
      name: c.leadName || c.profileName || c.name,
      leadName: c.leadName,
      phone: c.phone || "—",
      campaign:
        typeof c.source === "object"
          ? c.source?.campaign || "Direct"
          : c.source && c.source !== "direct"
          ? c.source
          : "Direct",
      ad: typeof c.source === "object" ? c.source?.ad || "—" : "—",
      stage: c.pipeline || "New",
      agent: c.agent || "Unassigned",
      channel: c.channel || "—",
    }));
  }, [conversations]);

  const campaignOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    leads.forEach((l) => {
      const camp = l.campaign || "Direct";
      counts[camp] = (counts[camp] || 0) + 1;
    });

    const nonDirect = Object.keys(counts)
      .filter((c) => c !== "Direct")
      .sort((a, b) => (counts[b] || 0) - (counts[a] || 0));

    const options: { label: string; value: string }[] = [
      { label: `All campaigns (${leads.length})`, value: "All campaigns" },
    ];

    if (counts["Direct"]) {
      options.push({ label: `Direct (${counts["Direct"]})`, value: "Direct" });
    }

    nonDirect.forEach((c) => {
      const display = /^\d+$/.test(c) ? `Campaign #${c}` : c;
      options.push({ label: `${display} (${counts[c]})`, value: c });
    });

    return options;
  }, [leads]);

  const stages = [
    "All",
    "New",
    "Contacted",
    "Qualified",
    "Audition Booked",
    "Attended",
    "Enrolled",
    "Joining Later",
    "Unqualified",
    "Lost",
  ];

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (filterStage !== "All" && l.stage !== filterStage) return false;
      if (filterCampaign !== "All campaigns" && l.campaign !== filterCampaign) return false;
      if (effectiveSearch && !matchLeadSearch(l, effectiveSearch)) return false;
      return true;
    });
  }, [leads, filterStage, filterCampaign, effectiveSearch]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedLeads = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  const hasActiveFilters =
    filterStage !== "All" ||
    filterCampaign !== "All campaigns" ||
    Boolean(effectiveSearch);

  return (
    <div
      className="flex flex-col h-full min-h-0"
      style={{ background: "var(--bg-page)", color: "var(--text-primary)" }}
    >
      {/* Header */}
      <div
        className="px-4 md:px-6 py-4 shrink-0"
        style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border-main)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h1 className="text-[15px] font-bold mb-0.5" style={{ color: "var(--text-primary)" }}>
              Leads
            </h1>
            <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
              Every live lead from Meta and manual WhatsApp referrals — newest first.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {pageToast && (
              <span
                className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full"
                style={{
                  background: "rgba(52, 199, 89, 0.14)",
                  color: "#34C759",
                }}
              >
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                {pageToast}
              </span>
            )}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setFilterStage("All");
                  setFilterCampaign("All campaigns");
                  setLocalSearch("");
                  if (searchQuery) setSearchQuery("");
                }}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-[6px] text-[#FF3B30] hover:bg-[rgba(255,59,48,0.1)] transition cursor-pointer"
                style={{ border: "1px solid rgba(255, 59, 48, 0.3)" }}
              >
                Clear filters
              </button>
            )}
            <span
              className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
              style={{ background: "var(--bg-pill)", color: "var(--text-secondary)" }}
            >
              {filtered.length} {filtered.length === 1 ? "lead" : "leads"}
            </span>
            {!isReadOnly && (
              <button
                type="button"
                onClick={() => handleOpenAddModal()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[34px] text-[12px] font-semibold rounded-lg text-white bg-[#0066FF] hover:bg-[#0055D6] transition-colors cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Add lead
              </button>
            )}
          </div>
        </div>

        {/* Filters & Search row */}
        <div
          className="flex items-center gap-3 overflow-x-auto flex-nowrap shrink-0 pb-0.5"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div
            className="relative flex items-center h-[28px] w-[180px] sm:w-[210px] px-2 rounded-[6px] shrink-0"
            style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)" }}
          >
            <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-secondary)" }} />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Filter name or phone…"
              aria-label="Filter leads by name or phone"
              className="flex-1 w-full h-full px-1.5 text-[12px] bg-transparent outline-none"
              style={{ color: "var(--text-primary)" }}
            />
            {localSearch && (
              <button
                type="button"
                onClick={() => setLocalSearch("")}
                aria-label="Clear filter"
                className="p-0.5 rounded hover:opacity-80"
                style={{ color: "var(--text-secondary)" }}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="h-4 w-[1px] shrink-0" style={{ background: "var(--border-main)" }} />

          <div className="flex gap-1.5 shrink-0">
            {stages.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilterStage(s)}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors shrink-0 cursor-pointer touch-manipulation"
                style={
                  filterStage === s
                    ? { background: "#0066FF", color: "#fff" }
                    : { background: "var(--bg-pill)", color: "var(--text-secondary)" }
                }
              >
                {s}
              </button>
            ))}
          </div>

          <div className="h-4 w-[1px] shrink-0" style={{ background: "var(--border-main)" }} />

          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className="text-[9px] font-bold uppercase tracking-widest"
              style={{ color: "var(--text-muted)" }}
            >
              CAMPAIGN
            </span>
            <select
              value={filterCampaign}
              onChange={(e) => setFilterCampaign(e.target.value)}
              aria-label="Filter by campaign or source"
              className="h-[26px] text-[11px] rounded-[6px] px-2 outline-none cursor-pointer font-medium"
              style={{
                background: "var(--bg-pill)",
                border: "1px solid var(--border-input)",
                color: "var(--text-primary)",
              }}
            >
              {campaignOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 min-w-0 overflow-auto" style={{ WebkitOverflowScrolling: "touch" }}>
        {loading ? (
          <div className="flex items-center justify-center py-20 px-4">
            <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
              Loading leads from database...
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 gap-3 text-center">
            <p className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
              No leads found
            </p>
            <p className="text-[12px] max-w-md" style={{ color: "var(--text-secondary)" }}>
              {hasActiveFilters
                ? "No leads match the selected filters or search query."
                : "Leads appear automatically from Meta or when you add a referred WhatsApp lead manually."}
            </p>
            {!isReadOnly && (
              <button
                type="button"
                onClick={() => {
                  const candidatePhone =
                    effectiveSearch && /\d{4,}/.test(effectiveSearch) ? effectiveSearch : "";
                  handleOpenAddModal(candidatePhone);
                }}
                className="mt-1 inline-flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-semibold rounded-lg text-white bg-[#0066FF] hover:bg-[#0055D6] transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Add lead manually
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Mobile Stacked Cards (< md) */}
            <div className="md:hidden p-3 flex flex-col gap-2.5">
              {paginatedLeads.map((lead) => (
                <LeadMobileCard
                  key={lead.id}
                  lead={lead}
                  isChairman={isChairman}
                  isAdmission={isAdmission}
                  isReadOnly={isReadOnly}
                  userClean={userClean}
                  userName={user?.name}
                  assignableAgents={assignableAgents}
                  onPatchAgent={handlePatchAgent}
                  onOpenChat={openChat}
                />
              ))}
            </div>

            {/* Desktop Table (md+) */}
            <div className="hidden md:block min-w-[800px] p-4 md:p-6">
              <table className="w-full text-left border-collapse rounded-xl overflow-hidden shadow-sm">
                <thead
                  className="text-[10px] uppercase tracking-widest font-bold"
                  style={{
                    background: "var(--bg-table-header)",
                    color: "var(--text-secondary)",
                  }}
                >
                  <tr>
                    <th className="py-2.5 px-4 font-bold">Received</th>
                    <th className="py-2.5 px-4 font-bold">Name</th>
                    <th className="py-2.5 px-4 font-bold">Phone</th>
                    <th className="py-2.5 px-4 font-bold">Channel</th>
                    <th className="py-2.5 px-4 font-bold">Campaign / Source</th>
                    <th className="py-2.5 px-4 font-bold">Agent</th>
                    <th className="py-2.5 px-4 font-bold">Stage</th>
                    <th className="py-2.5 px-4 font-bold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="text-[12px]" style={{ color: "var(--text-primary)" }}>
                  {paginatedLeads.map((lead, idx) => (
                    <LeadTableRow
                      key={lead.id}
                      lead={lead}
                      idx={idx}
                      isChairman={isChairman}
                      isAdmission={isAdmission}
                      isReadOnly={isReadOnly}
                      userClean={userClean}
                      userName={user?.name}
                      assignableAgents={assignableAgents}
                      onPatchAgent={handlePatchAgent}
                      onOpenChat={openChat}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer (shown when leads > PAGE_SIZE) */}
            {totalPages > 1 && (
              <div
                className="px-4 md:px-6 pb-6 flex items-center justify-between gap-3 text-[12px]"
                style={{ color: "var(--text-secondary)" }}
              >
                <span>
                  Showing {(safePage - 1) * PAGE_SIZE + 1}–
                  {Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length} leads
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-input)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Previous
                  </button>
                  <span className="px-2 font-semibold" style={{ color: "var(--text-primary)" }}>
                    Page {safePage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-input)",
                      color: "var(--text-primary)",
                    }}
                  >
                    Next
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {isAddModalOpen && (
        <AddManualLeadModal
          initialPhone={prefillPhone}
          conversations={conversations}
          assignableAgents={assignableAgents}
          isChairman={isChairman}
          isAdmission={isAdmission}
          isReadOnly={isReadOnly}
          userName={user?.name}
          onClose={handleCloseAddModal}
          onCreateManualLead={createManualLead}
          onOpenChat={openChat}
          onLeadSavedToast={setPageToast}
        />
      )}
    </div>
  );
}
