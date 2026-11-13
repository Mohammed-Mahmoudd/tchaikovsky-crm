"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { MessageSquare, Trash2, AlertTriangle, Calendar, CheckCircle2, Clock, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useCRM } from "../context/CRMContext";
import { useAuth, isDirectorOrChairmanRole, isAdmissionRole } from "../components/AuthProvider";
import { formatLastMessageTime } from "../utils/time";
import { useBranches } from "../lib/branches";
import { BranchSelect } from "../components/BranchSelect";
import { ConversationChatView } from "../components/ConversationChatView";
import { ConversationDetailsSidebar } from "../components/ConversationDetailsSidebar";
import { Conversation } from "../context/CRMContext";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCorners,
  pointerWithin,
  rectIntersection,
  CollisionDetection,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

// ─── Types ──────────────────────────────────────────────────────────────────

type Stage =
  | "New"
  | "Contacted"
  | "Qualified"
  | "Audition Booked"
  | "Attended"
  | "Enrolled"
  | "Joining Later"
  | "Unqualified"
  | "Lost";

type Lead = {
  id: string;
  name: string;
  campaign: string;
  date: string;
  stage: Stage;
  phone?: string;
  agent?: string;
  channel?: string;
  rawCreatedAt?: number;
  lastMessageAt?: number;
};

const STAGES: Stage[] = [
  "New", "Contacted", "Qualified", "Audition Booked", "Attended", "Enrolled", "Joining Later", "Unqualified", "Lost",
];

// How many cards to render initially per column
const INITIAL_VISIBLE_COUNT = 30;

// ─── "Move to" Popover (Fixed viewport-clamped positioning so it never clips) ─

const MoveToPopover = React.memo(function MoveToPopover({
  currentStage,
  anchorRect,
  onMove,
  onClose,
}: {
  currentStage: Stage;
  anchorRect: { top: number; bottom: number; right: number; left: number };
  onMove: (stage: Stage) => void;
  onClose: () => void;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleScrollOrResize = () => onClose();
    document.addEventListener("mousedown", handler, true);
    document.addEventListener("touchstart", handler, true);
    window.addEventListener("resize", handleScrollOrResize);
    window.addEventListener("scroll", handleScrollOrResize, true);
    return () => {
      document.removeEventListener("mousedown", handler, true);
      document.removeEventListener("touchstart", handler, true);
      window.removeEventListener("resize", handleScrollOrResize);
      window.removeEventListener("scroll", handleScrollOrResize, true);
    };
  }, [onClose]);

  const menuWidth = 184;
  const estimatedHeight = 360;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;

  const left = Math.max(8, Math.min(anchorRect.right - menuWidth, vw - menuWidth - 8));
  const openUpward = anchorRect.bottom + estimatedHeight > vh - 8 && anchorRect.top > estimatedHeight;
  const top = openUpward ? Math.max(8, anchorRect.top - estimatedHeight - 4) : anchorRect.bottom + 4;

  return (
    <div
      ref={popoverRef}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        top: `${top}px`,
        left: `${left}px`,
        width: `${menuWidth}px`,
        maxHeight: `${vh - 16}px`,
        overflowY: "auto",
        zIndex: 200,
        background: "var(--bg-card)",
        border: "1px solid var(--border-main)",
        borderRadius: "10px",
        boxShadow: "0 8px 28px rgba(0,0,0,0.14)",
      }}
    >
      <div
        style={{
          padding: "7px 12px",
          borderBottom: "1px solid var(--border-main)",
        }}
      >
        <span
          style={{
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
          }}
        >
          Move to stage
        </span>
      </div>
      {STAGES.map((stage) => {
        const isCurrent = stage === currentStage;
        return (
          <button
            key={stage}
            type="button"
            disabled={isCurrent}
            onClick={(e) => {
              e.stopPropagation();
              onMove(stage);
              onClose();
            }}
            className="w-full flex items-center justify-between px-3 py-2 text-left text-[12px] transition-colors hover:bg-[var(--bg-hover)]"
            style={{
              border: "none",
              background: isCurrent ? "var(--bg-selected)" : "transparent",
              cursor: isCurrent ? "default" : "pointer",
              fontWeight: isCurrent ? 600 : 500,
              color: isCurrent ? "#0066FF" : "var(--text-primary)",
            }}
          >
            <span>{stage}</span>
            {isCurrent && (
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  color: "#0066FF",
                }}
              >
                Current
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
});

// ─── Column Drop Zone ───────────────────────────────────────────────────────

const ColumnDropZone = React.memo(function ColumnDropZone() {
  return (
    <div
      style={{
        height: "44px",
        borderRadius: "10px",
        border: "1.5px dashed #0066FF",
        background: "var(--bg-selected)",
        opacity: 0.65,
        flexShrink: 0,
      }}
    />
  );
});

// ─── Lead Card (Clean neutral styling + quick Move menu on all devices) ─────

const LeadCard = React.memo(function LeadCard({
  lead,
  isDragging,
  onClick,
  onMove,
  isReadOnly,
}: {
  lead: Lead;
  isDragging?: boolean;
  onClick?: () => void;
  onMove?: (stage: Stage) => void;
  isReadOnly?: boolean;
}) {
  const [anchorRect, setAnchorRect] = useState<{
    top: number;
    bottom: number;
    right: number;
    left: number;
  } | null>(null);

  const handleMoveClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setAnchorRect((prev) =>
      prev
        ? null
        : {
            top: rect.top,
            bottom: rect.bottom,
            right: rect.right,
            left: rect.left,
          }
    );
  }, []);

  const handleClosePopover = useCallback(() => setAnchorRect(null), []);

  return (
    <div
      onClick={onClick}
      className={`group rounded-xl px-3 py-2.5 transition-shadow select-none relative ${
        isDragging
          ? "shadow-xl opacity-95 scale-[1.02] cursor-grabbing"
          : "hover:shadow-md cursor-pointer"
      }`}
      style={{
        background: "var(--bg-card)",
        border: isDragging ? "1.5px solid #0066FF" : "1px solid var(--border-main)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div className="flex items-start justify-between gap-1.5">
        <p
          className="text-[13px] font-bold leading-snug truncate flex-1 min-w-0"
          style={{ color: "var(--text-primary)" }}
          title={lead.name}
        >
          {lead.name}
        </p>
        {!isReadOnly && onMove && !isDragging && (
          <button
            type="button"
            onClick={handleMoveClick}
            onPointerDown={(e) => e.stopPropagation()}
            title="Move to stage"
            aria-label={`Move ${lead.name} to another stage`}
            className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold transition-opacity opacity-80 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 cursor-pointer"
            style={{
              background: "var(--bg-pill)",
              border: "1px solid var(--border-input)",
              color: "var(--text-secondary)",
            }}
          >
            <span>Move</span>
          </button>
        )}
      </div>
      <p
        className="text-[11px] mt-0.5 leading-snug truncate"
        style={{ color: "var(--text-secondary)" }}
        title={lead.campaign}
      >
        {lead.campaign}
      </p>
      <div className="flex items-center justify-between mt-2 gap-1.5">
        <span
          className="text-[10px] truncate"
          style={{ color: "var(--text-muted)" }}
        >
          {lead.date.split(",")[0]}
        </span>
        {lead.lastMessageAt && (
          <span
            className="text-[10px] shrink-0 font-medium"
            style={{ color: "var(--text-muted)" }}
            title="Last message sent"
          >
            {formatLastMessageTime(lead.lastMessageAt)}
          </span>
        )}
      </div>

      {anchorRect && onMove && (
        <MoveToPopover
          currentStage={lead.stage}
          anchorRect={anchorRect}
          onMove={onMove}
          onClose={handleClosePopover}
        />
      )}
    </div>
  );
});

const DraggableLeadCard = React.memo(function DraggableLeadCard({
  lead,
  onClick,
  onMove,
  isReadOnly,
}: {
  lead: Lead;
  onClick: () => void;
  onMove: (stage: Stage) => void;
  isReadOnly?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: lead.id,
      disabled: isReadOnly,
      data: { stage: lead.stage },
    });

  const style: React.CSSProperties = {
    transform: transform ? CSS.Translate.toString(transform) : undefined,
    cursor: isReadOnly ? "default" : isDragging ? "grabbing" : "grab",
    WebkitUserSelect: "none",
    userSelect: "none",
  };

  if (isDragging) {
    return (
      <div ref={setNodeRef} style={{ height: "68px" }} {...attributes} {...listeners}>
        <div
          style={{
            height: "100%",
            borderRadius: "12px",
            border: "1.5px dashed var(--border-input)",
            background: "var(--bg-pill)",
            opacity: 0.45,
          }}
        />
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <LeadCard
        lead={lead}
        onClick={onClick}
        onMove={onMove}
        isReadOnly={isReadOnly}
      />
    </div>
  );
});

// ─── Unified Responsive Column (Pinned Header + Independent Vertical Scroll) ─

const Column = React.memo(function Column({
  stage,
  leads,
  totalCount,
  isTargetColumn,
  onSelectLead,
  onMoveLead,
  onShowMore,
  hasMore,
  isReadOnly,
}: {
  stage: Stage;
  leads: Lead[];
  totalCount: number;
  isTargetColumn: boolean;
  onSelectLead: (id: string) => void;
  onMoveLead: (id: string, stage: Stage) => void;
  onShowMore: () => void;
  hasMore: boolean;
  isReadOnly?: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: stage });

  return (
    <div
      ref={setNodeRef}
      className="flex flex-col h-full shrink-0 snap-start w-[78vw] max-w-[264px] sm:w-[216px] md:w-[204px] xl:min-w-[186px] 2xl:min-w-[174px] xl:w-auto xl:flex-1"
    >
      <div
        className="flex flex-col flex-1 rounded-2xl overflow-hidden h-full max-h-full"
        style={{
          background: isTargetColumn ? "var(--bg-column-hover, var(--bg-column))" : "var(--bg-column)",
          border: isTargetColumn ? "1.5px solid #0066FF" : "1px solid transparent",
          transition: "background 120ms ease, border-color 120ms ease",
        }}
      >
        {/* Pinned neutral column header */}
        <div className="flex items-center justify-between px-3 pt-3.5 pb-2.5 shrink-0 select-none">
          <span
            className="text-[13px] font-bold leading-tight truncate mr-1.5"
            style={{ color: "var(--text-primary)" }}
            title={stage}
          >
            {stage}
          </span>
          <span
            className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0"
            style={{
              background: "var(--bg-card)",
              color: "var(--text-secondary)",
            }}
          >
            {totalCount}
          </span>
        </div>

        {/* Independent vertical card scroll inside each column */}
        <div
          className="flex flex-col gap-2 flex-1 min-h-0 px-2 pb-3 overflow-y-auto overflow-x-hidden"
          style={{ WebkitOverflowScrolling: "touch", overscrollBehaviorY: "contain" }}
        >
          {leads.map((lead) => (
            <DraggableLeadCard
              key={lead.id}
              lead={lead}
              onClick={() => onSelectLead(lead.id)}
              onMove={(targetStage) => onMoveLead(lead.id, targetStage)}
              isReadOnly={isReadOnly}
            />
          ))}

          {isTargetColumn && <ColumnDropZone />}

          {hasMore && (
            <button
              onClick={onShowMore}
              className="text-[11px] font-semibold py-1.5 rounded-lg transition-colors shrink-0"
              style={{
                background: "var(--bg-pill)",
                color: "#0066FF",
                border: "1px solid var(--border-input)",
              }}
            >
              + More ({totalCount - leads.length})
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const { conversations, patchConversation, openChat, setPollPaused, assignableAgents } = useCRM();
  const { isReadOnly, user } = useAuth();
  const isChairman = isDirectorOrChairmanRole(user?.role);
  const isAdmission = isAdmissionRole(user?.role);
  const userClean = (user?.name || "").trim().toLowerCase();

  const [view, setView] = useState<"pipeline" | "table">("pipeline");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [panelLeadId, setPanelLeadId] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<"details" | "chat">("details");
  const [showChatDetails, setShowChatDetails] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // Audition booking modal state
  const [showAuditionModal, setShowAuditionModal] = useState(false);
  const [auditionDate, setAuditionDate] = useState("");
  const [auditionTime, setAuditionTime] = useState("05:00 PM");
  const [auditionNotes, setAuditionNotes] = useState("");
  const [auditionBranch, setAuditionBranch] = useState("");
  const { branchGroups } = useBranches();
  const [isBookingAudition, setIsBookingAudition] = useState(false);

  const handleOpenPanel = useCallback((leadId: string, tab: "details" | "chat" = "details") => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setPanelLeadId(leadId);
    setPanelTab(tab);
    setShowChatDetails(false);
    setIsClosing(false);
  }, []);

  const handleClosePanel = useCallback(() => {
    if (!panelLeadId || isClosing) return;
    setIsClosing(true);
    setShowChatDetails(false);
    setShowDeleteConfirm(false);
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = setTimeout(() => {
      setPanelLeadId(null);
      setIsClosing(false);
      setPanelTab("details");
      setShowChatDetails(false);
    }, 240);
  }, [panelLeadId, isClosing]);

  const handlePanelAnimationEnd = useCallback((e: React.AnimationEvent) => {
    if (e.target === panelRef.current && isClosing) {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
      setPanelLeadId(null);
      setIsClosing(false);
      setPanelTab("details");
      setShowChatDetails(false);
      setShowDeleteConfirm(false);
    }
  }, [isClosing]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  // Periodic refresh every 30s to keep relative timestamps live
  const [, setTimeTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTimeTick((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);
  // Instant synchronous stage overrides for immediate 0ms UI drop feedback
  const [stageOverrides, setStageOverrides] = useState<Record<string, Stage | "direct">>({});
  const [filterAgent, setFilterAgent] = useState("Everyone");
  const [filterCampaign, setFilterCampaign] = useState("All campaigns");
  const [filterReceived, setFilterReceived] = useState("Any time");
  const [filterSource, setFilterSource] = useState("All sources");
  const [hiddenStages, setHiddenStages] = useState<Set<Stage>>(new Set());
  // Track how many cards are visible per stage (for "show more" pagination)
  const [visibleCounts, setVisibleCounts] = useState<Record<Stage, number>>(() => {
    const initial: Record<string, number> = {};
    STAGES.forEach(s => { initial[s] = INITIAL_VISIBLE_COUNT; });
    return initial as Record<Stage, number>;
  });

  // Reconcile and clear stage overrides once conversations reflect the updated stage
  useEffect(() => {
    setStageOverrides((prev) => {
      let hasChanges = false;
      const next = { ...prev };
      for (const [id, stage] of Object.entries(prev)) {
        const conv = conversations.find((c) => c.id === id);
        if (conv && conv.pipeline === stage) {
          delete next[id];
          hasChanges = true;
        }
      }
      return hasChanges ? next : prev;
    });
  }, [conversations]);

  // Derive leads dynamically from shared conversations + synchronous local overrides
  // Note: cards deleted from pipeline have stage "direct" and are excluded from the pipeline board/table,
  // but their chat history, contact data and messages remain completely safe in the Inbox.
  const leads: Lead[] = useMemo(() => {
    return conversations
      .filter((c) => {
        const stage = stageOverrides[c.id] || c.pipeline;
        return stage !== "direct";
      })
      .map((c) => ({
        id: c.id,
        name: c.name,
        campaign: typeof c.source === "object" ? c.source?.campaign || "Direct" : (c.source && c.source !== "direct" ? c.source : "Direct"),
        date: c.createdAt
          ? new Date(c.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
          : "—",
        rawCreatedAt: c.createdAt ? new Date(c.createdAt).getTime() : 0,
        stage: (stageOverrides[c.id] as Stage) || (c.pipeline as Stage) || "New",
        phone: c.phone,
        agent: c.agent || "Unassigned",
        channel: c.channel || (typeof c.source === "object" ? "Meta" : "Direct"),
        lastMessageAt: c.lastMessageAt || (c.updatedAt ? new Date(c.updatedAt).getTime() : undefined) || (c.createdAt ? new Date(c.createdAt).getTime() : undefined),
      }));
  }, [conversations, stageOverrides]);

  // Real dynamic campaign options from actual data
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

  // Real dynamic agent options
  const agentOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    leads.forEach((l) => {
      const ag = l.agent || "Unassigned";
      counts[ag] = (counts[ag] || 0) + 1;
    });
    // Ensure all assignable team members are visible in options
    assignableAgents.forEach((a) => {
      if (counts[a.name] === undefined) {
        counts[a.name] = 0;
      }
    });
    const sorted = Object.keys(counts).sort((a, b) => (counts[b] || 0) - (counts[a] || 0));
    return [
      { label: `Everyone (${leads.length})`, value: "Everyone" },
      ...sorted.map((ag) => ({ label: `${ag} (${counts[ag]})`, value: ag })),
    ];
  }, [leads, assignableAgents]);

  // Real dynamic source options
  const sourceOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    leads.forEach((l) => {
      const src = l.channel || (l.campaign !== "Direct" ? "Meta" : "Direct");
      counts[src] = (counts[src] || 0) + 1;
    });
    const sorted = Object.keys(counts).sort((a, b) => (counts[b] || 0) - (counts[a] || 0));
    return [
      { label: `All sources (${leads.length})`, value: "All sources" },
      ...sorted.map((src) => ({ label: `${src} (${counts[src]})`, value: src })),
    ];
  }, [leads]);

  // Check if any filter is active
  const hasActiveFilters =
    filterCampaign !== "All campaigns" ||
    filterAgent !== "Everyone" ||
    filterSource !== "All sources" ||
    filterReceived !== "Any time";

  const clearFilters = () => {
    setFilterCampaign("All campaigns");
    setFilterAgent("Everyone");
    setFilterSource("All sources");
    setFilterReceived("Any time");
  };

  // Apply filters
  const filteredLeads = useMemo(() => {
    // Calendar boundaries based on local date
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayStartMs = startOfToday.getTime();

    // Saturday start (Saudi week: Sat-Fri)
    const startOfWeek = new Date(startOfToday);
    const day = startOfWeek.getDay();
    const diffToSat = day === 6 ? 0 : day + 1;
    startOfWeek.setDate(startOfWeek.getDate() - diffToSat);
    const weekStartMs = startOfWeek.getTime();

    const startOfMonth = new Date(startOfToday);
    startOfMonth.setDate(1);
    const monthStartMs = startOfMonth.getTime();

    return leads.filter((lead) => {
      if (filterCampaign !== "All campaigns" && lead.campaign !== filterCampaign) return false;
      if (filterAgent !== "Everyone" && lead.agent !== filterAgent) return false;
      if (filterSource !== "All sources") {
        const src = lead.channel || (lead.campaign !== "Direct" ? "Meta" : "Direct");
        if (src !== filterSource) return false;
      }
      if (filterReceived !== "Any time") {
        if (!lead.rawCreatedAt) return false;
        if (filterReceived === "Today" && lead.rawCreatedAt < todayStartMs) return false;
        if (filterReceived === "This week" && lead.rawCreatedAt < weekStartMs) return false;
        if (filterReceived === "This month" && lead.rawCreatedAt < monthStartMs) return false;
      }
      return true;
    });
  }, [leads, filterCampaign, filterAgent, filterSource, filterReceived]);

  // Pre-group leads by stage (instead of filtering 703 × 9 on every render)
  const groupedLeads = useMemo(() => {
    const groups: Record<Stage, Lead[]> = {
      "New": [], "Contacted": [], "Qualified": [], "Audition Booked": [], "Attended": [],
      "Enrolled": [], "Joining Later": [], "Unqualified": [], "Lost": [],
    };
    for (const lead of filteredLeads) {
      if (groups[lead.stage]) {
        groups[lead.stage].push(lead);
      }
    }
    return groups;
  }, [filteredLeads]);

  // Dedicated collision detection strategy: pointer-first with rect intersection fallback
  const collisionDetectionStrategy: CollisionDetection = useCallback((args) => {
    // 1. Direct pointer collision with a column or card
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) {
      return pointerCollisions;
    }
    // 2. Intersecting bounding rectangles
    const rectCollisions = rectIntersection(args);
    if (rectCollisions.length > 0) {
      return rectCollisions;
    }
    // 3. Fallback to closestCorners
    return closestCorners(args);
  }, []);

  // Pointer + Touch sensors: deliberate 6px pointer move or 200ms touch press-and-hold
  // so normal scrolling on phones/tablets/trackpads is never interrupted.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } })
  );

  const activeLead = useMemo(() => activeId ? leads.find(l => l.id === activeId) ?? null : null, [activeId, leads]);
  const panelLead = useMemo(() => panelLeadId ? leads.find(l => l.id === panelLeadId) ?? null : null, [panelLeadId, leads]);
  const panelConv = useMemo(() => panelLeadId ? conversations.find(c => c.id === panelLeadId) ?? null : null, [panelLeadId, conversations]);
  const effectiveConv = useMemo(() => {
    if (panelConv) return panelConv;
    if (!panelLead) return null;
    return {
      id: panelLead.id,
      name: panelLead.name,
      leadName: panelLead.name,
      phone: panelLead.phone,
      pipeline: panelLead.stage,
      agent: panelLead.agent,
      channel: "WA" as const,
      unreadCount: 0,
      messages: [],
    } as unknown as Conversation;
  }, [panelConv, panelLead]);

  // Pre-compute which column is the hover target so React.memo skips non-targeted columns
  const targetColumnInfo = useMemo(() => {
    if (!activeLead || !overId) return { targetStage: null as Stage | null };
    const overStage = STAGES.find((s) => s === overId) as Stage | undefined;
    const overLead = leads.find((l) => l.id === overId);
    const targetStage: Stage | null = overStage ?? overLead?.stage ?? null;
    if (!targetStage || targetStage === activeLead.stage) return { targetStage: null };
    return { targetStage };
  }, [activeLead, overId, leads]);

  const visibleStages = useMemo(() => STAGES.filter(s => !hiddenStages.has(s)), [hiddenStages]);

  // Horizontal board scroll state & controls
  const boardScrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollIndicators = useCallback(() => {
    const el = boardScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    const el = boardScrollRef.current;
    if (!el) return;
    updateScrollIndicators();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateScrollIndicators) : null;
    ro?.observe(el);
    window.addEventListener("resize", updateScrollIndicators);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", updateScrollIndicators);
    };
  }, [updateScrollIndicators, visibleStages.length, view]);

  const scrollBoard = useCallback((dir: "left" | "right") => {
    const el = boardScrollRef.current;
    if (!el) return;
    const step = Math.max(380, Math.round(el.clientWidth * 0.55));
    el.scrollBy({ left: dir === "left" ? -step : step, behavior: "smooth" });
  }, []);

  const toggleStage = useCallback((stage: Stage) => {
    setHiddenStages(prev => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    setOverId(null);
    // Fix D: pause the 3s background poll for the entire drag gesture so it
    // cannot fire between dragEnd and the PATCH response arriving.
    setPollPaused(true);
  }, [setPollPaused]);

  // Guard setOverId to avoid continuous re-rendering when dragging across the same card/column
  const handleDragOver = useCallback((event: DragOverEvent) => {
    const nextOverId = event.over?.id ? String(event.over.id) : null;
    setOverId((prev) => (prev === nextOverId ? prev : nextOverId));
  }, []);

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setOverId(null);
    // Resume polling 3s after cancel (gives any in-flight PATCH time to land)
    setTimeout(() => setPollPaused(false), 3000);
  }, [setPollPaused]);

  // Move a lead to any stage (used by mobile "Move to" popover) — instant 0ms optimistic UI
  const moveLeadToStage = useCallback((id: string, stage: Stage) => {
    if (isReadOnly) return;
    setStageOverrides((prev) => ({ ...prev, [id]: stage }));
    patchConversation(id, { pipeline: stage });
  }, [patchConversation, isReadOnly]);

  // Delete a lead from the pipeline only — preserves inbox conversation, messages & contact data
  const handleDeleteLeadFromPipeline = useCallback(async () => {
    if (!panelLead || isReadOnly || isDeleting) return;
    const targetId = panelLead.id;
    setIsDeleting(true);
    try {
      // 1. Instant 0ms optimistic removal from pipeline view
      setStageOverrides((prev) => ({ ...prev, [targetId]: "direct" }));
      // 2. Close confirmation modal & side panel immediately
      setShowDeleteConfirm(false);
      setPanelLeadId(null);
      setPanelTab("details");
      // 3. Persist pipeline removal to backend: setting pipeline to "direct"
      // removes it from the pipeline, but keeps conversation, contact and all messages intact
      await patchConversation(targetId, { pipeline: "direct" });
    } catch (err) {
      console.error("Failed to delete lead from pipeline:", err);
    } finally {
      setIsDeleting(false);
    }
  }, [panelLead, isReadOnly, isDeleting, patchConversation]);

  // Handle Escape key to dismiss modal or panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showAuditionModal) {
          setShowAuditionModal(false);
        } else if (showDeleteConfirm) {
          setShowDeleteConfirm(false);
        } else if (showChatDetails) {
          setShowChatDetails(false);
        } else if (panelLeadId) {
          handleClosePanel();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showAuditionModal, showDeleteConfirm, showChatDetails, panelLeadId, handleClosePanel]);

  const handleOpenBookingModal = useCallback(() => {
    if (!panelLead) return;
    const defaultDate = panelConv?.followUpDate || new Date().toISOString().split("T")[0];
    const defaultNote = panelConv?.followUpNote || "";
    const timeMatch = defaultNote.match(/\b(0?[1-9]|1[0-2]):[0-5][0-9]\s*(?:AM|PM|am|pm)\b/i);
    setAuditionDate(defaultDate);
    setAuditionTime(timeMatch ? timeMatch[0].toUpperCase() : "05:00 PM");
    setAuditionNotes(panelConv?.formAnswers?.instrument || "");
    setAuditionBranch(panelConv?.branch || "");
    setShowAuditionModal(true);
  }, [panelLead, panelConv]);

  const handleConfirmBooking = useCallback(async () => {
    if (!panelLead || isReadOnly || isBookingAudition) return;
    setIsBookingAudition(true);
    try {
      const formattedNote = `${auditionTime}${auditionNotes ? ` · ${auditionNotes}` : ""}`;
      moveLeadToStage(panelLead.id, "Audition Booked");
      setFollowUpDate(auditionDate);
      setFollowUpNote(formattedNote);
      await patchConversation(panelLead.id, {
        pipeline: "Audition Booked",
        auditionDate: auditionDate,
        followUpDate: auditionDate,
        followUpNote: formattedNote,
        branch: auditionBranch,
      });
      setShowAuditionModal(false);
    } catch (err) {
      console.error("Failed to book audition:", err);
    } finally {
      setIsBookingAudition(false);
    }
  }, [panelLead, isReadOnly, isBookingAudition, auditionDate, auditionTime, auditionNotes, auditionBranch, moveLeadToStage, patchConversation]);

  // Cash In & Follow-up states for side panel
  const [cashVal, setCashVal] = useState<string>("");
  const [cashSaved, setCashSaved] = useState(false);
  const [followUpNote, setFollowUpNote] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpSaved, setFollowUpSaved] = useState(false);

  // Sync inputs when selected lead changes
  useEffect(() => {
    if (panelConv) {
      setCashVal(panelConv.cashIn !== undefined && panelConv.cashIn !== null ? String(panelConv.cashIn) : "");
      setFollowUpNote(panelConv.followUpNote || "");
      setFollowUpDate(panelConv.followUpDate || "");
      setCashSaved(false);
      setFollowUpSaved(false);
    }
  }, [panelConv?.id, panelConv?.followUpNote, panelConv?.followUpDate, panelConv?.cashIn]);

  const handleSaveCash = useCallback(async () => {
    if (!panelLead || isReadOnly) return;
    const num = parseFloat(cashVal) || 0;
    await patchConversation(panelLead.id, { cashIn: num });
    setCashSaved(true);
    setTimeout(() => setCashSaved(false), 2000);
  }, [panelLead, isReadOnly, cashVal, patchConversation]);

  const handleSaveFollowUp = useCallback(async () => {
    if (!panelLead || isReadOnly) return;
    await patchConversation(panelLead.id, {
      followUpNote,
      followUpDate,
    });
    setFollowUpSaved(true);
    setTimeout(() => setFollowUpSaved(false), 2000);
  }, [panelLead, isReadOnly, followUpNote, followUpDate, patchConversation]);

  // "Show more" handler for a specific stage
  const handleShowMore = useCallback((stage: Stage) => {
    setVisibleCounts(prev => ({
      ...prev,
      [stage]: prev[stage] + INITIAL_VISIBLE_COUNT,
    }));
  }, []);

  // Drag end — instant synchronous UI transfer (0ms) + background DB persistence
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    const effectiveOverId = over?.id ? String(over.id) : overId;

    setActiveId(null);
    setOverId(null);

    // Fix D: always resume polling 3s after drop so the PATCH has time to
    // land and the pendingPatch guard in fetchConversations can clear cleanly.
    setTimeout(() => setPollPaused(false), 3000);

    if (isReadOnly || !effectiveOverId) return;

    const activeLeadId = active.id as string;
    const overStage = STAGES.find(s => s === effectiveOverId) as Stage | undefined;
    const overLead = leads.find(l => l.id === effectiveOverId);
    const targetStage: Stage | undefined = overStage ?? (overLead?.stage as Stage);

    if (targetStage) {
      const currentLead = leads.find(l => l.id === activeLeadId);
      if (currentLead && currentLead.stage !== targetStage) {
        // 1. Instant 0ms synchronous local state update (eliminates any transfer lag)
        setStageOverrides((prev) => ({ ...prev, [activeLeadId]: targetStage }));
        // 2. Persist to shared context & backend in background
        patchConversation(activeLeadId, { pipeline: targetStage });
      }
    }
  }, [leads, overId, patchConversation, isReadOnly]);

  return (
    <div className="flex flex-col h-full min-h-0 min-w-0 relative overflow-hidden" style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}>

      {/* Top bar: view switcher + lead count */}
      <div className="px-4 md:px-6 py-2.5 flex items-center gap-2 flex-wrap shrink-0" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-main)' }}>
        <button
          onClick={() => setView("pipeline")}
          className={`text-[12px] font-semibold px-3 py-1.5 rounded-[8px] transition-colors cursor-pointer touch-manipulation`}
          style={view === "pipeline" ? { background: 'var(--bg-selected)', color: '#0066FF' } : { color: 'var(--text-secondary)' }}
        >
          Pipeline
        </button>
        <button
          onClick={() => setView("table")}
          className={`text-[12px] font-semibold px-3 py-1.5 rounded-[8px] transition-colors cursor-pointer touch-manipulation`}
          style={view === "table" ? { background: 'var(--bg-selected)', color: '#0066FF' } : { color: 'var(--text-secondary)' }}
        >
          Table
        </button>
        <span className="text-[12px] ml-1" style={{ color: 'var(--text-muted)' }}>{filteredLeads.length} leads</span>
        {isReadOnly && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-[#FF9500] bg-[rgba(255,149,0,0.12)] border border-[rgba(255,149,0,0.25)] ml-2">
            View Only Mode
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-[11px] font-semibold rounded-[6px] px-2.5 py-1 transition-colors cursor-pointer text-[#FF3B30] hover:bg-[rgba(255,59,48,0.1)]"
              style={{ border: '1px solid rgba(255, 59, 48, 0.3)', background: 'var(--bg-card)' }}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Filter row */}
      <div className="px-4 md:px-6 py-2 flex items-center gap-3 overflow-x-auto flex-nowrap shrink-0" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-main)', WebkitOverflowScrolling: 'touch' }}>
        <FilterPill label="RECEIVED" value={filterReceived} options={["Any time", "Today", "This week", "This month"]} onChange={setFilterReceived} />
        <FilterPill label="AGENT" value={filterAgent} options={agentOptions} onChange={setFilterAgent} />
        <FilterPill label="CAMPAIGN" value={filterCampaign} options={campaignOptions} onChange={setFilterCampaign} />
        <FilterPill label="SOURCE" value={filterSource} options={sourceOptions} onChange={setFilterSource} />
      </div>

      {/* Main Content Area */}
      {view === "table" ? (
        <div className="flex-1 min-h-0 min-w-0 overflow-x-auto overflow-y-auto" style={{ background: 'var(--bg-card)', WebkitOverflowScrolling: 'touch' }}>
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead className="text-[10px] uppercase font-bold tracking-widest sticky top-0 z-10" style={{ background: 'var(--bg-table-header)', color: 'var(--text-secondary)' }}>
              <tr>
                <th className="px-6 py-3">NAME</th>
                <th className="px-6 py-3">PHONE</th>
                <th className="px-6 py-3">CAMPAIGN</th>
                <th className="px-6 py-3">STAGE</th>
                <th className="px-6 py-3">AGENT</th>
                <th className="px-6 py-3">RECEIVED</th>
              </tr>
            </thead>
            <tbody className="text-[13px]" style={{ color: 'var(--text-primary)' }}>
              {filteredLeads.map((lead, idx) => (
                <tr
                  key={lead.id}
                  onClick={() => {
                    handleOpenPanel(lead.id, "details");
                  }}
                  className={`cursor-pointer transition-colors`}
                  style={{ borderBottom: '1px solid var(--border-main)', background: idx % 2 === 0 ? 'var(--bg-table-alt)' : 'var(--bg-card)' }}
                >
                  <td className="px-6 py-3">{lead.name}</td>
                  <td className="px-6 py-3 font-medium">{lead.phone || "—"}</td>
                  <td className="px-6 py-3" style={{ color: 'var(--text-secondary)' }}>{lead.campaign}</td>
                  <td className="px-6 py-3">
                    <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full inline-block" style={{ background: 'var(--bg-pill)', color: '#0066FF' }}>
                      {lead.stage}
                    </span>
                  </td>
                  <td className="px-6 py-3" style={{ color: 'var(--text-secondary)' }}>{lead.agent || "Unassigned"}</td>
                  <td className="px-6 py-3" style={{ color: 'var(--text-secondary)' }}>{lead.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {/* Stage summary pills (clean neutral/theme styling) + horizontal scroll controls */}
          <div className="px-4 md:px-6 py-2 flex items-center gap-2 overflow-x-auto flex-nowrap shrink-0" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-main)', WebkitOverflowScrolling: 'touch' }}>
            <span className="text-[10px] font-bold tracking-widest mr-2 uppercase shrink-0" style={{ color: 'var(--text-muted)' }}>STAGES</span>
            {STAGES.map(stage => {
              const isHidden = hiddenStages.has(stage);
              const count = groupedLeads[stage].length;
              return (
                <button
                  key={stage}
                  onClick={() => toggleStage(stage)}
                  className={`text-[12px] font-medium px-2.5 py-0.5 rounded-full transition-colors shrink-0 cursor-pointer touch-manipulation ${isHidden ? 'line-through' : ''}`}
                  style={isHidden ? { background: 'var(--bg-pill)', color: 'var(--text-muted)' } : { background: 'var(--bg-selected)', color: '#0066FF' }}
                >
                  {stage} {count}
                </button>
              );
            })}

            {(canScrollLeft || canScrollRight) && (
              <div className="ml-auto flex items-center gap-1 pl-2 shrink-0">
                <button
                  type="button"
                  onClick={() => scrollBoard("left")}
                  disabled={!canScrollLeft}
                  title="Scroll board left"
                  aria-label="Scroll board left"
                  className="w-6 h-6 rounded-md flex items-center justify-center transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default hover:bg-[var(--bg-hover)]"
                  style={{ border: '1px solid var(--border-main)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollBoard("right")}
                  disabled={!canScrollRight}
                  title="Scroll board right"
                  aria-label="Scroll board right"
                  className="w-6 h-6 rounded-md flex items-center justify-center transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default hover:bg-[var(--bg-hover)]"
                  style={{ border: '1px solid var(--border-main)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Unified Kanban board across all devices (Phone, Tablet, Laptop, Desktop) */}
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetectionStrategy}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div className="relative flex-1 min-h-0 min-w-0 flex flex-col">
              {canScrollLeft && (
                <button
                  type="button"
                  onClick={() => scrollBoard("left")}
                  title="Scroll left"
                  aria-label="Scroll left"
                  className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full items-center justify-center transition-all cursor-pointer opacity-85 hover:opacity-100"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-main)',
                    color: 'var(--text-primary)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                  }}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              {canScrollRight && (
                <button
                  type="button"
                  onClick={() => scrollBoard("right")}
                  title="Scroll right"
                  aria-label="Scroll right"
                  className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full items-center justify-center transition-all cursor-pointer opacity-85 hover:opacity-100"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-main)',
                    color: 'var(--text-primary)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                  }}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}

              <div
                ref={boardScrollRef}
                onScroll={updateScrollIndicators}
                className="pipeline-board-scroll flex-1 min-h-0 min-w-0 overflow-x-auto overflow-y-hidden py-3.5 md:py-4 snap-x snap-mandatory sm:snap-none"
                style={{
                  touchAction: 'pan-x pan-y',
                  WebkitOverflowScrolling: 'touch',
                  overscrollBehaviorX: 'contain',
                }}
              >
                <div className="flex gap-2.5 lg:gap-3 h-full items-stretch min-w-full w-max px-3 md:px-4 lg:px-6">
                  {visibleStages.map(stage => {
                    const allStageLeads = groupedLeads[stage];
                    const limit = visibleCounts[stage];
                    const visibleLeads = allStageLeads.slice(0, limit);
                    const isTarget = targetColumnInfo.targetStage === stage;
                    return (
                      <Column
                        key={stage}
                        stage={stage}
                        leads={visibleLeads}
                        totalCount={allStageLeads.length}
                        isTargetColumn={isTarget}
                        onSelectLead={(id) => {
                          handleOpenPanel(id, "details");
                        }}
                        onMoveLead={moveLeadToStage}
                        onShowMore={() => handleShowMore(stage)}
                        hasMore={visibleLeads.length < allStageLeads.length}
                        isReadOnly={isReadOnly}
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Drag overlay – the floating "ghost" card (instant 0ms drop, no animation delay) */}
            <DragOverlay dropAnimation={null}>
              {activeLead ? (
                <div className="w-[200px] max-w-[220px] pointer-events-none">
                  <LeadCard lead={activeLead} isDragging />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </>
      )}

      {/* Mobile backdrop for instant tap-outside dismissal */}
      {panelLead && (
        <div
          className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] sm:hidden ${
            isClosing ? "animate-backdrop-out pointer-events-none" : "animate-backdrop-in"
          }`}
          onClick={handleClosePanel}
        />
      )}

      {/* Side Panel Overlay */}
      {panelLead && (
        <div
          ref={panelRef}
          onAnimationEnd={handlePanelAnimationEnd}
          className={`absolute right-0 top-0 h-full z-50 flex flex-col transition-[width] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[width,transform] shadow-2xl ${
            isClosing ? "animate-drawer-out pointer-events-none" : "animate-drawer-in"
          } ${
            panelTab === "chat"
              ? showChatDetails
                ? "w-full sm:w-[820px] md:w-[860px] xl:w-[900px] max-w-[96vw]"
                : "w-full sm:w-[500px] md:w-[540px] xl:w-[580px]"
              : "w-full sm:w-[360px]"
          }`}
          style={{
            background: 'var(--bg-panel)',
            borderLeft: '1px solid var(--border-main)',
            boxShadow: '-10px 0 25px rgba(0,0,0,0.12)',
          }}
        >
          {panelTab === "chat" ? (
            <div className="flex h-full w-full overflow-hidden relative animate-panel-fade">
              <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
                <ConversationChatView
                  conversationId={panelLead.id}
                  onClose={handleClosePanel}
                  onBackToDetails={() => {
                    setPanelTab("details");
                    setShowChatDetails(false);
                  }}
                  showBackToDetails={true}
                  extraHeaderActions={
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={isReadOnly}
                        onClick={handleOpenBookingModal}
                        className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 text-[11px] sm:text-[12px] font-semibold rounded-[6px] text-white bg-[#0066FF] hover:bg-[#0055d4] active:scale-95 transition-all duration-150 cursor-pointer disabled:opacity-50 select-none"
                        title="Book audition"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Audition</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowChatDetails((prev) => !prev)}
                        className={`px-2.5 py-1 text-[11px] sm:text-[12px] font-semibold rounded-[6px] active:scale-95 transition-all duration-150 cursor-pointer select-none ${
                          showChatDetails
                            ? "bg-[#0066FF] text-white shadow-xs"
                            : "hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
                        }`}
                        style={{
                          border: showChatDetails ? "1px solid #0066FF" : "1px solid var(--border-input)",
                          background: showChatDetails ? "#0066FF" : "var(--bg-pill)",
                        }}
                        title={showChatDetails ? "Hide lead details" : "View lead details"}
                      >
                        Details
                      </button>
                    </div>
                  }
                />
              </div>

              {/* Right Sidebar Details Panel (Exact Inbox Screen Design) */}
              <div
                className={`
                  shrink-0 h-full flex flex-col overflow-hidden
                  transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[transform,width,opacity]
                  absolute sm:relative inset-0 sm:inset-auto z-20 sm:z-auto
                  border-l
                  ${
                    showChatDetails
                      ? "w-full sm:w-[320px] opacity-100 translate-x-0"
                      : "w-full sm:w-0 opacity-0 sm:opacity-0 translate-x-full sm:translate-x-0 pointer-events-none border-l-0"
                  }
                `}
                style={{
                  borderColor: "var(--border-main)",
                  background: "var(--bg-panel)",
                }}
              >
                <div className="w-full sm:w-[320px] h-full flex flex-col min-w-[300px] sm:min-w-[320px]">
                  {effectiveConv && (
                    <ConversationDetailsSidebar
                      conversation={effectiveConv}
                      showOpenConversationButton={false}
                      onOpenBookingModal={handleOpenBookingModal}
                      onClose={() => setShowChatDetails(false)}
                    />
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex flex-col overflow-hidden animate-panel-fade">
              {/* Header */}
              <div className="px-6 py-4 flex items-start justify-between" style={{ borderBottom: '1px solid var(--border-main)' }}>
                <div>
                  <h2 className="text-lg font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>{panelLead.name}</h2>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>Lead added {panelLead.date.split(",")[0]}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    title="Delete from Pipeline"
                    disabled={isReadOnly}
                    onClick={() => setShowDeleteConfirm(true)}
                    className="p-1 rounded-md transition-colors cursor-pointer text-[var(--text-secondary)] hover:text-[#FF3B30] hover:bg-[rgba(255,59,48,0.1)] disabled:opacity-40"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleClosePanel}
                    className="p-1 rounded-md transition-colors cursor-pointer"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 flex-1 overflow-y-auto">
                {(panelLead.stage === "Audition Booked" || panelConv?.auditionDate || (panelConv?.auditionOutcome && panelConv.auditionOutcome !== "joining-later")) ? (
                  <div
                    className="mb-5 p-3.5 rounded-xl border"
                    style={{
                      background: 'var(--bg-pill)',
                      borderColor: 'var(--border-input)',
                    }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[12px] font-bold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                        <CheckCircle2 className="w-4 h-4" style={{ color: '#0066FF' }} />
                        {panelConv?.auditionOutcome === 'registered' && 'Registered'}
                        {panelConv?.auditionOutcome === 'schedule-followup' && 'Schedule Follow up'}
                        {panelConv?.auditionOutcome === 'paid-trial' && 'Paid Trial'}
                        {panelConv?.auditionOutcome === 'joining-later' && 'Joining Later'}
                        {panelConv?.auditionOutcome === 'no-show' && 'No Show'}
                        {!panelConv?.auditionOutcome && 'Audition Booked'}
                      </span>
                      <Link
                        href={`/auditions?date=${panelConv?.auditionDate || panelConv?.followUpDate || ''}&id=${panelLead.id}`}
                        className="text-[11px] font-semibold text-[#0066FF] hover:underline flex items-center gap-1"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        Calendar →
                      </Link>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {(panelConv?.auditionDate || followUpDate || panelConv?.followUpDate) && (
                        <span className="text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                          {panelConv?.auditionDate || followUpDate || panelConv?.followUpDate}
                        </span>
                      )}
                      {panelConv?.branch && (
                        <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                          · {panelConv.branch}
                        </span>
                      )}
                    </div>
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={handleOpenBookingModal}
                        className="mt-2 text-[11px] font-semibold text-[#0066FF] hover:underline cursor-pointer block text-left"
                      >
                        Reschedule or edit audition details
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isReadOnly}
                    onClick={handleOpenBookingModal}
                    className="w-full bg-[#0066FF] text-white font-semibold py-2.5 rounded-lg mb-4 hover:bg-[#0055d4] transition-colors shadow-sm cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 text-[13px]"
                  >
                    <Calendar className="w-4 h-4" />
                    Book audition
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setPanelTab("chat")}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 mb-5 rounded-lg bg-[#0066FF] text-white text-[13px] font-semibold hover:bg-[#0055d4] transition-colors shadow-sm cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4" />
                  Open Conversation
                </button>

                <div className="mb-6">
                  <h3 className="text-[10px] font-bold tracking-widest text-[#0066FF] uppercase mb-2">Contact</h3>
                  <p className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{panelLead.phone || "—"}</p>
                </div>

                <div className="mb-6">
                  <h3 className="text-[10px] font-bold tracking-widest text-[#0066FF] uppercase mb-2">Lead Management</h3>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-[11px] block mb-1" style={{ color: 'var(--text-secondary)' }}>Assigned to</label>
                      {(() => {
                        const agentClean = (panelLead.agent || "").trim().toLowerCase();
                        const isLeadUnassigned = !agentClean || agentClean === "unassigned";
                        const isAssignedToMe = !isLeadUnassigned && !!userClean && userClean === agentClean;
                        const isAssignedToOther = !isLeadUnassigned && !isAssignedToMe;
                        const canAssignToSelf = !isReadOnly && isAdmission && (isLeadUnassigned || isAssignedToMe);
                        const canEditPanelAgent = !isReadOnly && (isChairman || canAssignToSelf);

                        return (
                          <div className="space-y-1.5">
                            <select
                              disabled={!canEditPanelAgent}
                              title={
                                !canEditPanelAgent
                                  ? isAssignedToOther
                                    ? `Assigned to ${panelLead.agent}. Only Chairman can reassign.`
                                    : "Only Chairman or Admission can assign leads"
                                  : undefined
                              }
                              value={panelLead.agent || "Unassigned"}
                              onChange={(e) => patchConversation(panelLead.id, { agent: e.target.value })}
                              className="w-full rounded-[6px] text-[13px] py-1.5 px-2 outline-none disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed font-medium transition-colors"
                              style={{ border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                            >
                              {isChairman ? (
                                <>
                                  <option value="Unassigned">Unassigned</option>
                                  {panelLead.agent && panelLead.agent !== "Unassigned" && !assignableAgents.some(a => a.name === panelLead.agent) && (
                                    <option value={panelLead.agent}>{panelLead.agent}</option>
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
                                      {user?.name && <option value={user.name}>{user.name} (Assign to me)</option>}
                                    </>
                                  ) : isAssignedToMe ? (
                                    <>
                                      <option value={user?.name || panelLead.agent}>{user?.name || panelLead.agent}</option>
                                      <option value="Unassigned">Unassigned</option>
                                    </>
                                  ) : (
                                    <option value={panelLead.agent}>{panelLead.agent}</option>
                                  )}
                                </>
                              ) : (
                                <option value={panelLead.agent || "Unassigned"}>{panelLead.agent || "Unassigned"}</option>
                              )}
                            </select>
                            {isLeadUnassigned && isAdmission && user?.name && !isReadOnly && (
                              <button
                                type="button"
                                onClick={() => patchConversation(panelLead.id, { agent: user.name })}
                                className="w-full text-center text-[11px] font-semibold text-[#0066FF] hover:underline cursor-pointer py-0.5"
                              >
                                + Assign to me
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="flex-1">
                      <label className="text-[11px] block mb-1" style={{ color: 'var(--text-secondary)' }}>Stage</label>
                      <select
                        disabled={isReadOnly}
                        value={panelLead.stage}
                        onChange={(e) => moveLeadToStage(panelLead.id, e.target.value as Stage)}
                        className="w-full rounded-[6px] text-[13px] py-1.5 px-2 outline-none disabled:opacity-60 cursor-pointer"
                        style={{ border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                      >
                        {STAGES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="text-[10px] font-bold tracking-widest text-[#0066FF] uppercase mb-2">Source</h3>
                  <p className="text-[13px]" style={{ color: 'var(--text-primary)' }}>{panelLead.campaign}</p>
                </div>

                <div className="mb-6">
                  <h3 className="text-[10px] font-bold tracking-widest text-[#0066FF] uppercase mb-2">Cash In</h3>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="0"
                      value={cashVal}
                      onChange={(e) => setCashVal(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSaveCash();
                        }
                      }}
                      className="flex-1 rounded-[6px] text-[13px] py-1.5 px-3 outline-none"
                      style={{ border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                    />
                    <button
                      type="button"
                      disabled={isReadOnly}
                      onClick={handleSaveCash}
                      className="bg-[#0066FF] text-white font-semibold text-[13px] px-4 rounded-[6px] shadow-sm hover:bg-[#0055d4] transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {cashSaved ? "Saved ✓" : "Save"}
                    </button>
                  </div>
                </div>

                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="text-[10px] font-bold tracking-widest text-[#0066FF] uppercase">Follow-up</h3>
                      {(panelLead.stage === 'Joining Later' || panelConv?.auditionOutcome === 'joining-later') && (
                        <span
                          className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                          style={{
                            background: 'var(--bg-pill)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--border-main)',
                          }}
                        >
                          Joining Later
                        </span>
                      )}
                    </div>
                    <Link
                      href="/follow-ups"
                      className="text-[11px] font-semibold text-[#0066FF] hover:underline flex items-center gap-0.5"
                    >
                      Follow-ups →
                    </Link>
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="text"
                      placeholder={(panelLead.stage === 'Joining Later' || panelConv?.auditionOutcome === 'joining-later') ? "e.g. Joining in summer" : "e.g. Call back about Sunday"}
                      value={followUpNote}
                      onChange={(e) => setFollowUpNote(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSaveFollowUp();
                        }
                      }}
                      className="flex-1 min-w-0 rounded-[6px] text-[13px] py-1.5 px-3 outline-none placeholder-gray-400"
                      style={{ border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                    />
                    <label
                      className="flex items-center gap-1.5 shrink-0 cursor-pointer select-none py-1.5 px-2.5 rounded-[6px] border transition-colors h-[32px]"
                      style={{
                        background: (panelLead.stage === 'Joining Later' || panelConv?.auditionOutcome === 'joining-later') ? 'var(--bg-pill)' : 'var(--bg-input)',
                        borderColor: 'var(--border-input)',
                      }}
                      title="Mark as joining later"
                    >
                      <input
                        type="checkbox"
                        checked={panelLead.stage === 'Joining Later' || panelConv?.auditionOutcome === 'joining-later'}
                        disabled={isReadOnly}
                        onChange={async () => {
                          if (isReadOnly || !panelLead) return;
                          const isJL = panelLead.stage === 'Joining Later' || panelConv?.auditionOutcome === 'joining-later';
                          if (isJL) {
                            const fallbackStage: Stage = panelConv?.auditionDate ? 'Audition Booked' : 'Contacted';
                            if (panelLead.stage === 'Joining Later') {
                              setStageOverrides((prev) => ({ ...prev, [panelLead.id]: fallbackStage }));
                            }
                            await patchConversation(panelLead.id, {
                              auditionOutcome: '',
                              pipeline: panelLead.stage === 'Joining Later' ? fallbackStage : panelLead.stage,
                            });
                          } else {
                            const d = new Date();
                            d.setDate(d.getDate() + 14);
                            const y = d.getFullYear();
                            const m = String(d.getMonth() + 1).padStart(2, '0');
                            const day = String(d.getDate()).padStart(2, '0');
                            const defaultDate = `${y}-${m}-${day}`;

                            const updates: Record<string, any> = {
                              pipeline: 'Joining Later',
                              auditionOutcome: 'joining-later',
                              followUpCompleted: false,
                            };
                            if (!followUpDate) {
                              updates.followUpDate = defaultDate;
                              setFollowUpDate(defaultDate);
                            }
                            if (!followUpNote || !followUpNote.trim()) {
                              updates.followUpNote = 'Joining Later - Follow up';
                              setFollowUpNote('Joining Later - Follow up');
                            }
                            setStageOverrides((prev) => ({ ...prev, [panelLead.id]: 'Joining Later' }));
                            await patchConversation(panelLead.id, updates);
                          }
                        }}
                        className="w-3.5 h-3.5 rounded cursor-pointer accent-[#0066FF]"
                      />
                      <span
                        className="text-[12px] font-medium whitespace-nowrap"
                        style={{
                          color: (panelLead.stage === 'Joining Later' || panelConv?.auditionOutcome === 'joining-later') ? 'var(--text-primary)' : 'var(--text-secondary)',
                        }}
                      >
                        Joining later
                      </span>
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSaveFollowUp();
                        }
                      }}
                      className="flex-1 rounded-[6px] px-3 py-1.5 text-[13px] outline-none cursor-pointer"
                      style={{ border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                    />
                    <button
                      type="button"
                      disabled={isReadOnly}
                      onClick={handleSaveFollowUp}
                      className="bg-[#0066FF] text-white font-semibold text-[13px] px-4 rounded-[6px] shadow-sm hover:bg-[#0055d4] transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {followUpSaved ? "Saved ✓" : "Add"}
                    </button>
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="text-[10px] font-bold tracking-widest text-[#0066FF] uppercase mb-2">Form Answers</h3>
                  <div className="mb-1">
                    <p className="text-[11px] mb-0.5" style={{ color: 'var(--text-secondary)' }}>full name</p>
                    <p className="text-[13px]" style={{ color: 'var(--text-primary)' }}>{panelConv?.profileName || panelLead.name}</p>
                  </div>
                  {panelConv?.formAnswers?.instrument && (
                    <div className="mb-1">
                      <p className="text-[11px] mb-0.5" style={{ color: 'var(--text-secondary)' }}>instrument</p>
                      <p className="text-[13px]" style={{ color: 'var(--text-primary)' }}>{panelConv.formAnswers.instrument}</p>
                    </div>
                  )}
                  {panelConv?.formAnswers?.studentAge && (
                    <div>
                      <p className="text-[11px] mb-0.5" style={{ color: 'var(--text-secondary)' }}>student age</p>
                      <p className="text-[13px]" style={{ color: 'var(--text-primary)' }}>{panelConv.formAnswers.studentAge}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Book Audition Modal */}
      {showAuditionModal && panelLead && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
          onClick={() => !isBookingAudition && setShowAuditionModal(false)}
        >
          <div
            className="w-full max-w-[440px] rounded-2xl p-6 shadow-2xl relative border animate-in fade-in zoom-in-95 duration-150 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
            style={{
              background: 'var(--bg-card)',
              borderColor: 'var(--border-main)',
              color: 'var(--text-primary)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#0066FF]">
                  Auditions Calendar
                </p>
                <h3 className="text-[16px] font-bold mt-0.5" style={{ color: 'var(--text-primary)' }}>
                  Book Audition for {panelLead.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAuditionModal(false)}
                className="p-1.5 rounded-lg transition-colors hover:opacity-70 cursor-pointer"
                style={{ color: 'var(--text-secondary)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-3.5">
              <div>
                <label className="text-[12px] font-bold mb-1 block" style={{ color: 'var(--text-primary)' }}>
                  Branch *
                </label>
                <BranchSelect
                  value={auditionBranch}
                  onChange={setAuditionBranch}
                  branchGroups={branchGroups}
                />
              </div>

              <div>
                <label className="text-[12px] font-semibold mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                  Audition Date *
                </label>
                <input
                  type="date"
                  value={auditionDate}
                  onChange={(e) => setAuditionDate(e.target.value)}
                  className="w-full h-[38px] px-3 text-[13px] rounded-xl outline-none cursor-pointer"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label className="text-[12px] font-semibold mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                  Audition Time *
                </label>
                <select
                  value={auditionTime}
                  onChange={(e) => setAuditionTime(e.target.value)}
                  className="w-full h-[38px] px-3 text-[13px] rounded-xl outline-none cursor-pointer"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}
                >
                  {[
                    "02:00 PM", "02:30 PM", "03:00 PM", "03:30 PM",
                    "04:00 PM", "04:30 PM", "05:00 PM", "05:30 PM",
                    "06:00 PM", "06:30 PM", "07:00 PM", "07:30 PM",
                    "08:00 PM", "08:30 PM", "09:00 PM"
                  ].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[12px] font-semibold mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                  Instrument / Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Piano, Violin, Vocal"
                  value={auditionNotes}
                  onChange={(e) => setAuditionNotes(e.target.value)}
                  className="w-full h-[38px] px-3 text-[13px] rounded-xl outline-none"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                disabled={isBookingAudition || !auditionDate || !auditionBranch}
                onClick={handleConfirmBooking}
                className="flex-1 h-[40px] text-[13px] font-semibold text-white rounded-xl cursor-pointer hover:bg-[#0055d4] transition-colors disabled:opacity-50"
                style={{ background: '#0066FF' }}
              >
                {isBookingAudition ? "Booking..." : "Confirm Audition Booking"}
              </button>
              <button
                type="button"
                onClick={() => setShowAuditionModal(false)}
                className="h-[40px] px-5 text-[13px] font-medium rounded-xl cursor-pointer hover:opacity-80 transition-colors"
                style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)', color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Alert Popup Before Deleting Lead */}
      {showDeleteConfirm && panelLead && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs transition-opacity"
          onClick={() => !isDeleting && setShowDeleteConfirm(false)}
        >
          <div
            className="w-full max-w-[420px] rounded-2xl p-6 shadow-2xl relative border animate-in fade-in zoom-in-95 duration-150"
            style={{
              background: 'var(--bg-card)',
              borderColor: 'var(--border-main)',
              color: 'var(--text-primary)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Alert Icon Badge */}
            <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4 mx-auto bg-[rgba(255,59,48,0.12)] text-[#FF3B30]">
              <AlertTriangle className="w-6 h-6" />
            </div>

            {/* Title */}
            <h3 className="text-[16px] font-bold text-center mb-2" style={{ color: 'var(--text-primary)' }}>
              Delete Lead from Pipeline?
            </h3>

            {/* Message */}
            <p className="text-[13px] text-center mb-4 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Are you sure you want to remove <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{panelLead.name}</span> from the pipeline?
            </p>

            {/* Safety callout note */}
            <div
              className="p-3 rounded-lg mb-6 text-[12px] leading-relaxed"
              style={{
                background: 'var(--bg-pill)',
                border: '1px solid var(--border-main)',
                color: 'var(--text-secondary)',
              }}
            >
              <span className="font-semibold text-[#0066FF]">Safety Note:</span> This lead will only be deleted from the pipeline board and table view. All chat history, messages, and contact details will remain completely safe in your Inbox.
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2 px-4 rounded-lg text-[13px] font-semibold border transition-colors cursor-pointer disabled:opacity-50"
                style={{
                  borderColor: 'var(--border-main)',
                  background: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isDeleting || isReadOnly}
                onClick={handleDeleteLeadFromPipeline}
                className="flex-1 py-2 px-4 rounded-lg text-[13px] font-semibold text-white bg-[#FF3B30] hover:bg-[#e0342a] transition-colors cursor-pointer shadow-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {isDeleting ? (
                  <span>Deleting...</span>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Filter pill ──────────────────────────────────────────────────────────────

function FilterPill({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: (string | { label: string; value: string })[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-[24px] text-[11px] rounded-[6px] px-2 outline-none cursor-pointer"
        style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}
      >
        {options.map((opt) => {
          const optValue = typeof opt === "string" ? opt : opt.value;
          const optLabel = typeof opt === "string" ? opt : opt.label;
          return (
            <option key={optValue} value={optValue}>
              {optLabel}
            </option>
          );
        })}
      </select>
    </div>
  );
}

