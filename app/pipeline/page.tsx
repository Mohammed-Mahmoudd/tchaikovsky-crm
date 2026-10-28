"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { MessageSquare, Trash2, AlertTriangle, Calendar, CheckCircle2, Clock, X } from "lucide-react";
import { useCRM } from "../context/CRMContext";
import { useAuth } from "../components/AuthProvider";
import { formatLastMessageTime } from "../utils/time";
import { useBranches } from "../lib/branches";
import { BranchSelect } from "../components/BranchSelect";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
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
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ─── Types ──────────────────────────────────────────────────────────────────

type Stage =
  | "New"
  | "Contacted"
  | "Audition Booked"
  | "Attended"
  | "Enrolled"
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
  "New", "Contacted", "Audition Booked", "Attended", "Enrolled", "Unqualified", "Lost",
];




// Stage color map for the move-to menu
const STAGE_COLORS: Record<Stage, string> = {
  "New": "#007AFF",
  "Contacted": "#5856D6",
  "Audition Booked": "#FF9500",
  "Attended": "#34C759",
  "Enrolled": "#30D158",
  "Unqualified": "#8E8E93",
  "Lost": "#FF3B30",
};

// How many cards to render initially per column
const INITIAL_VISIBLE_COUNT = 30;

// ─── useIsMobile hook ─────────────────────────────────────────────────────────

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    // Check for coarse pointer (touch devices) or narrow viewport
    const checkMobile = () => {
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      const narrow = window.innerWidth < 768;
      setIsMobile(coarse || narrow);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  return isMobile;
}

// ─── "Move to" Popover ────────────────────────────────────────────────────────

const MoveToPopover = React.memo(function MoveToPopover({
  currentStage,
  onMove,
  onClose,
}: {
  currentStage: Stage;
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
    document.addEventListener("mousedown", handler, true);
    document.addEventListener("touchstart", handler, true);
    return () => {
      document.removeEventListener("mousedown", handler, true);
      document.removeEventListener("touchstart", handler, true);
    };
  }, [onClose]);

  return (
    <div
      ref={popoverRef}
      style={{
        position: "absolute",
        top: "36px",
        right: "0",
        zIndex: 100,
        minWidth: "180px",
        background: "var(--bg-card)",
        border: "1px solid var(--border-main)",
        borderRadius: "12px",
        boxShadow: "0 8px 30px rgba(0,0,0,0.15)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "8px 12px",
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
          Move to
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
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              width: "100%",
              padding: "10px 12px",
              border: "none",
              background: isCurrent ? "var(--bg-selected)" : "transparent",
              cursor: isCurrent ? "default" : "pointer",
              opacity: isCurrent ? 0.5 : 1,
              fontSize: "13px",
              fontWeight: isCurrent ? 600 : 400,
              color: "var(--text-primary)",
              textAlign: "left",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: STAGE_COLORS[stage],
                flexShrink: 0,
              }}
            />
            {stage}
            {isCurrent && (
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: "10px",
                  fontWeight: 600,
                  color: "var(--text-muted)",
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

// ─── Mobile Lead Card (no drag, with "Move to" button) ───────────────────────

const MobileLeadCard = React.memo(function MobileLeadCard({
  lead,
  onMove,
  onClick,
  isReadOnly,
}: {
  lead: Lead;
  onMove: (stage: Stage) => void;
  onClick?: () => void;
  isReadOnly?: boolean;
}) {
  const [showPopover, setShowPopover] = useState(false);

  const handleMoveClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowPopover((prev) => !prev);
  }, []);

  const handleClosePopover = useCallback(() => setShowPopover(false), []);

  return (
    <div
      onClick={onClick}
      className="rounded-xl px-4 py-3 transition-shadow hover:shadow-md cursor-pointer"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-main)",
        boxShadow: "var(--shadow-card)",
        position: "relative",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className="text-[15px] font-bold leading-tight flex-1"
          style={{ color: "var(--text-primary)" }}
        >
          {lead.name}
        </p>
        {/* Move-to button — top right (hidden in view-only mode) */}
        {!isReadOnly && (
          <button
            type="button"
            onClick={handleMoveClick}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "4px 8px",
              borderRadius: "6px",
              border: "1px solid var(--border-input)",
              background: "var(--bg-pill)",
              color: "#0066FF",
              fontSize: "11px",
              fontWeight: 600,
              cursor: "pointer",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
              flexShrink: 0,
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ pointerEvents: "none" }}
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
            Move
          </button>
        )}
      </div>
      <p
        className="text-[13px] mt-0.5 leading-snug"
        style={{ color: "var(--text-secondary)" }}
      >
        {lead.campaign}
      </p>
      <div className="flex items-center justify-between mt-2.5">
        <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          {lead.date.split(",")[0]}
        </span>
        <div className="flex items-center gap-2">
          {lead.lastMessageAt && (
            <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }} title="Last message sent">
              {formatLastMessageTime(lead.lastMessageAt)}
            </span>
          )}
          <span
            className="text-[11px] font-medium px-2 py-0.5 rounded-full"
            style={{
              background: STAGE_COLORS[lead.stage] + "18",
              color: STAGE_COLORS[lead.stage],
            }}
          >
            {lead.stage}
          </span>
        </div>
      </div>

      {/* Popover */}
      {showPopover && (
        <MoveToPopover
          currentStage={lead.stage}
          onMove={onMove}
          onClose={handleClosePopover}
        />
      )}
    </div>
  );
});

// ─── Mobile Column (no DnD) ─────────────────────────────────────────────────

const MobileColumn = React.memo(function MobileColumn({
  stage,
  leads,
  totalCount,
  onMove,
  onSelectLead,
  onShowMore,
  hasMore,
  isReadOnly,
}: {
  stage: Stage;
  leads: Lead[];
  totalCount: number;
  onMove: (id: string, stage: Stage) => void;
  onSelectLead: (id: string) => void;
  onShowMore: () => void;
  hasMore: boolean;
  isReadOnly?: boolean;
}) {
  return (
    <div className="flex flex-col min-w-[260px] max-w-[260px] shrink-0">
      <div
        className="flex flex-col rounded-2xl overflow-hidden"
        style={{ background: "var(--bg-column)" }}
      >
        {/* Column header */}
        <div className="flex items-center justify-between px-3 pt-4 pb-2 shrink-0">
          <span
            className="text-[15px] font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            {stage}
          </span>
          <span
            className="text-[12px] font-bold px-2.5 py-0.5 rounded-full"
            style={{
              background: "var(--bg-card)",
              color: "var(--text-secondary)",
            }}
          >
            {totalCount}
          </span>
        </div>

        {/* Card list — no inner scroll, grows to content for smooth outer scroll */}
        <div
          className="flex flex-col gap-2 px-2.5 pb-3"
        >
          {leads.map((lead) => (
            <MobileLeadCard
              key={lead.id}
              lead={lead}
              onMove={(targetStage) => onMove(lead.id, targetStage)}
              onClick={() => onSelectLead(lead.id)}
              isReadOnly={isReadOnly}
            />
          ))}
          {hasMore && (
            <button
              onClick={onShowMore}
              className="text-[12px] font-semibold py-2 rounded-lg transition-colors"
              style={{
                background: "var(--bg-pill)",
                color: "#0066FF",
                border: "1px solid var(--border-input)",
              }}
            >
              Show more ({totalCount - leads.length} remaining)
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

// ─── Column Drop Zone ───────────────────────────────────────────────────────
// Shown at the bottom of the target column while a card is being dragged into it.
// Kept minimal and formal — no animation, no label, just a quiet visual cue.

const ColumnDropZone = React.memo(function ColumnDropZone() {
  return (
    <div
      style={{
        height: "40px",
        borderRadius: "8px",
        border: "1px dashed var(--border-input)",
        background: "transparent",
        opacity: 0.6,
        flexShrink: 0,
      }}
    />
  );
});

// ─── Desktop Lead Card (with drag handle dots, no move button) ───────────────

const LeadCard = React.memo(function LeadCard({
  lead,
  isDragging,
  onClick,
  isReadOnly,
}: {
  lead: Lead;
  isDragging?: boolean;
  onClick?: () => void;
  isReadOnly?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl px-2.5 xl:px-3 py-2.5 transition-shadow select-none ${isDragging
        ? "shadow-2xl opacity-95 rotate-1 scale-[1.02] cursor-grabbing"
        : isReadOnly
          ? "hover:shadow-sm cursor-pointer"
          : "hover:shadow-md cursor-pointer"
        }`}
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-main)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div className="flex items-start justify-between gap-1">
        <p
          className="text-[13px] xl:text-[14px] font-bold leading-tight truncate flex-1"
          style={{ color: "var(--text-primary)" }}
          title={lead.name}
        >
          {lead.name}
        </p>
        {!isReadOnly && (
          <div
            className="shrink-0 mt-0.5 opacity-40 hover:opacity-75 transition-opacity"
            style={{ color: "var(--text-muted)" }}
          >
            <svg width="10" height="14" viewBox="0 0 12 16" fill="currentColor">
              <circle cx="3" cy="3" r="1.5" />
              <circle cx="9" cy="3" r="1.5" />
              <circle cx="3" cy="8" r="1.5" />
              <circle cx="9" cy="8" r="1.5" />
              <circle cx="3" cy="13" r="1.5" />
              <circle cx="9" cy="13" r="1.5" />
            </svg>
          </div>
        )}
      </div>
      <p
        className="text-[11px] xl:text-[12px] mt-0.5 leading-snug truncate"
        style={{ color: "var(--text-secondary)" }}
        title={lead.campaign}
      >
        {lead.campaign}
      </p>
      <div className="flex items-center justify-between mt-2 gap-1">
        <span
          className="text-[10px] xl:text-[11px] truncate"
          style={{ color: "var(--text-muted)" }}
        >
          {lead.date.split(",")[0]}
        </span>
        {lead.lastMessageAt && (
          <span
            className="text-[10px] xl:text-[11px] shrink-0 font-medium"
            style={{ color: "var(--text-muted)" }}
            title="Last message sent"
          >
            {formatLastMessageTime(lead.lastMessageAt)}
          </span>
        )}
      </div>
    </div>
  );
});

const SortableLeadCard = React.memo(function SortableLeadCard({
  lead,
  onClick,
  isReadOnly,
}: {
  lead: Lead;
  onClick: () => void;
  isReadOnly?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: lead.id, disabled: isReadOnly });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    // Fix #1: no transition while dragging so the card follows the pointer instantly.
    // Snap siblings back in 100ms (vs default ~250ms) to feel snappier.
    transition: isDragging ? "none" : transition ? transition.replace(/\d+ms/, "100ms") : undefined,
    cursor: isReadOnly ? "default" : isDragging ? "grabbing" : "grab",
    touchAction: isDragging ? "none" : "pan-y",
    WebkitUserSelect: "none",
    userSelect: "none",
    // GPU-composite this card during drag so moving it doesn't repaint siblings.
    willChange: isDragging ? "transform" : "auto",
  };

  if (isDragging) {
    // Show a lightweight ghost in the card's original slot while it's being dragged.
    // DropPlaceholder was removed; use an inline ghost so we have no external dependency.
    return (
      <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
        <div
          style={{
            height: "68px",
            borderRadius: "10px",
            border: "2px dashed var(--border-input)",
            background: "var(--bg-pill)",
            opacity: 0.5,
          }}
        />
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <LeadCard lead={lead} onClick={onClick} isReadOnly={isReadOnly} />
    </div>
  );
});

// ─── Desktop Column (with DnD & Drop Placeholder) ───────────────────────────

const Column = React.memo(function Column({
  stage,
  leads,
  totalCount,
  isTargetColumn,
  onSelectLead,
  onShowMore,
  hasMore,
  isReadOnly,
}: {
  stage: Stage;
  leads: Lead[];
  totalCount: number;
  // Fix #2/#3: pre-computed by parent so React.memo skips non-target columns
  isTargetColumn: boolean;
  onSelectLead: (id: string) => void;
  onShowMore: () => void;
  hasMore: boolean;
  isReadOnly?: boolean;
}) {
  // Fix #3: only need setNodeRef, drop isOver (parent computes targeting now)
  const { setNodeRef } = useDroppable({ id: stage });
  const itemIds = useMemo(() => leads.map((l) => l.id), [leads]);

  return (
    <div
      ref={setNodeRef}
      className="flex flex-col flex-1 min-w-0 h-full"
    >
      <div
        className="flex flex-col flex-1 rounded-2xl overflow-hidden h-full max-h-full"
        style={{
          // Formal, subtle: only a slight background tint shift when targeted.
          // No border flash, no scale, no shadow — keeps the board calm during drag.
          background: isTargetColumn ? "var(--bg-column-hover, var(--bg-column))" : "var(--bg-column)",
          border: "1px solid transparent",
          transition: "background 150ms ease",
        }}
      >
        {/* Header without dots */}
        <div className="flex items-center justify-between px-2.5 xl:px-3 pt-3 pb-2 shrink-0 select-none">
          <span
            className="text-[12px] xl:text-[13px] font-bold leading-tight truncate mr-1"
            style={{ color: "var(--text-primary)" }}
            title={stage}
          >
            {stage}
          </span>
          <span
            className="text-[10px] xl:text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0"
            style={{
              background: "var(--bg-card)",
              color: "var(--text-secondary)",
            }}
          >
            {totalCount}
          </span>
        </div>

        {/* Card list */}
        <SortableContext id={stage} items={itemIds} strategy={verticalListSortingStrategy}>
          <div
            className="flex flex-col gap-2 flex-1 min-h-[150px] px-1.5 xl:px-2 pb-3 overflow-y-auto"
            style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}
          >
            {leads.map((lead) => (
              <SortableLeadCard
                key={lead.id}
                lead={lead}
                onClick={() => onSelectLead(lead.id)}
                isReadOnly={isReadOnly}
              />
            ))}

            {/* Honest drop target: shown at the bottom of the column so the user
                knows the card will be ADDED to this column. We no longer show a
                positional placeholder because handleDragEnd doesn't track insertion
                order — the card lands at its natural DB sort position. */}
            {isTargetColumn && <ColumnDropZone />}

            {hasMore && (
              <button
                onClick={onShowMore}
                className="text-[11px] xl:text-[12px] font-semibold py-1.5 rounded-lg transition-colors shrink-0"
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
        </SortableContext>
      </div>
    </div>
  );
});

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const { conversations, patchConversation, openChat, setPollPaused, assignableAgents } = useCRM();
  const { isReadOnly, user } = useAuth();
  const isChairman = user?.role === "chairman" || user?.role === "owner" || user?.role === "manager";
  const isMobile = useIsMobile();

  const [view, setView] = useState<"pipeline" | "table">("pipeline");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [panelLeadId, setPanelLeadId] = useState<string | null>(null);
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
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const oneWeek = 7 * oneDay;
    const oneMonth = 30 * oneDay;

    return leads.filter((lead) => {
      if (filterCampaign !== "All campaigns" && lead.campaign !== filterCampaign) return false;
      if (filterAgent !== "Everyone" && lead.agent !== filterAgent) return false;
      if (filterSource !== "All sources") {
        const src = lead.channel || (lead.campaign !== "Direct" ? "Meta" : "Direct");
        if (src !== filterSource) return false;
      }
      if (filterReceived !== "Any time") {
        if (!lead.rawCreatedAt) return false;
        const diff = now - lead.rawCreatedAt;
        if (filterReceived === "Today" && diff > oneDay) return false;
        if (filterReceived === "This week" && diff > oneWeek) return false;
        if (filterReceived === "This month" && diff > oneMonth) return false;
      }
      return true;
    });
  }, [leads, filterCampaign, filterAgent, filterSource, filterReceived]);

  // Pre-group leads by stage (instead of filtering 703 × 7 on every render)
  const groupedLeads = useMemo(() => {
    const groups: Record<Stage, Lead[]> = {
      "New": [], "Contacted": [], "Audition Booked": [], "Attended": [],
      "Enrolled": [], "Unqualified": [], "Lost": [],
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

  // Fix #5: distance 8 (was 4) — requires a deliberate 8px move to start drag,
  // eliminating accidental activation on fast clicks or tiny jitters.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const activeLead = useMemo(() => activeId ? leads.find(l => l.id === activeId) ?? null : null, [activeId, leads]);
  const panelLead = useMemo(() => panelLeadId ? leads.find(l => l.id === panelLeadId) ?? null : null, [panelLeadId, leads]);
  const panelConv = useMemo(() => panelLeadId ? conversations.find(c => c.id === panelLeadId) ?? null : null, [panelLeadId, conversations]);

  // Fix #2: pre-compute which column is the hover target and where the placeholder
  // should appear. Passing primitive booleans/numbers to Column means React.memo
  // can skip re-rendering the 6 non-targeted columns on every pointer-move event.
  const targetColumnInfo = useMemo(() => {
    if (!activeLead || !overId) return { targetStage: null as Stage | null, hoverIndex: -1 };
    // Resolve target stage from overId (could be a stage name or a card id)
    const overStage = STAGES.find((s) => s === overId) as Stage | undefined;
    const overLead = leads.find((l) => l.id === overId);
    const targetStage: Stage | null = overStage ?? overLead?.stage ?? null;
    // Only highlight if we're crossing into a *different* stage
    if (!targetStage || targetStage === activeLead.stage) return { targetStage: null, hoverIndex: -1 };
    const targetLeads = groupedLeads[targetStage] ?? [];
    const hoverIndex = targetLeads.findIndex((l) => l.id === overId);
    return { targetStage, hoverIndex };
  }, [activeLead, overId, leads, groupedLeads]);

  const visibleStages = useMemo(() => STAGES.filter(s => !hiddenStages.has(s)), [hiddenStages]);

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
        } else if (panelLeadId) {
          setPanelLeadId(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showAuditionModal, showDeleteConfirm, panelLeadId]);

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
                  onClick={() => setPanelLeadId(lead.id)}
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
          {/* Stage summary pills */}
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
          </div>

          {/* Kanban board — mobile vs desktop rendering */}
          {isMobile ? (
            /* ── MOBILE: No drag-and-drop, cards have "Move" button ── */
            <div
              className="flex-1 min-h-0 min-w-0 overflow-auto px-4 py-4"
              style={{
                WebkitOverflowScrolling: "touch",
                overscrollBehavior: "contain",
              }}
            >
              <div
                className="flex gap-3 items-start"
                style={{
                  minWidth:
                    visibleStages.length * 268 +
                    (visibleStages.length - 1) * 12 +
                    "px",
                }}
              >
                {visibleStages.map((stage) => {
                  const allStageLeads = groupedLeads[stage];
                  const limit = visibleCounts[stage];
                  const visibleLeads = allStageLeads.slice(0, limit);
                  return (
                    <MobileColumn
                      key={stage}
                      stage={stage}
                      leads={visibleLeads}
                      totalCount={allStageLeads.length}
                      onMove={moveLeadToStage}
                      onSelectLead={setPanelLeadId}
                      onShowMore={() => handleShowMore(stage)}
                      hasMore={visibleLeads.length < allStageLeads.length}
                      isReadOnly={isReadOnly}
                    />
                  );
                })}
              </div>
            </div>
          ) : (
            /* ── DESKTOP: Full drag-and-drop ── */
            <DndContext
              sensors={sensors}
              collisionDetection={collisionDetectionStrategy}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <div
                className="flex-1 min-h-0 min-w-0 overflow-hidden px-3 md:px-4 lg:px-6 py-4 md:py-5"
                style={{
                  touchAction: 'pan-y',
                }}
              >
                <div className="flex gap-2.5 lg:gap-3 xl:gap-3.5 h-full items-start w-full">
                  {visibleStages.map(stage => {
                    const allStageLeads = groupedLeads[stage];
                    const limit = visibleCounts[stage];
                    const visibleLeads = allStageLeads.slice(0, limit);
                    // Fix #2: pass pre-computed primitives so React.memo skips
                    // non-targeted columns on every overId change.
                    const isTarget = targetColumnInfo.targetStage === stage;
                    return (
                      <Column
                        key={stage}
                        stage={stage}
                        leads={visibleLeads}
                        totalCount={allStageLeads.length}
                        isTargetColumn={isTarget}
                        onSelectLead={setPanelLeadId}
                        onShowMore={() => handleShowMore(stage)}
                        hasMore={visibleLeads.length < allStageLeads.length}
                        isReadOnly={isReadOnly}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Drag overlay – the floating "ghost" card (instant 0ms drop, no animation delay) */}
              <DragOverlay dropAnimation={null}>
                {activeLead ? (
                  <div className="w-[180px] max-w-[220px] pointer-events-none">
                    <LeadCard lead={activeLead} isDragging />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </>
      )}

      {/* Side Panel Overlay */}
      {panelLead && (
        <div className="absolute right-0 top-0 h-full w-full sm:w-[360px] z-50 flex flex-col overflow-y-auto" style={{ background: 'var(--bg-panel)', borderLeft: '1px solid var(--border-main)', boxShadow: '-10px 0 20px rgba(0,0,0,0.05)' }}>
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
                onClick={() => {
                  setPanelLeadId(null);
                  setShowDeleteConfirm(false);
                }}
                className="p-1 rounded-md transition-colors cursor-pointer"
                style={{ color: 'var(--text-secondary)' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 flex-1">
            {(panelLead.stage === "Audition Booked" || panelConv?.auditionOutcome || panelConv?.auditionDate) ? (
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
              onClick={() => openChat(panelLead.id)}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 mb-5 rounded-lg bg-[#0066FF] text-white text-[13px] font-semibold hover:bg-[#0055d4] transition-colors shadow-sm cursor-pointer"
            >
              <MessageSquare className="w-4 h-4" />
              Open Conversation in Inbox
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
                    const canEditPanelAgent = !isReadOnly && isChairman;
                    return (
                      <select
                        disabled={!canEditPanelAgent}
                        title={!canEditPanelAgent ? "Only Chairman can assign agents" : undefined}
                        value={panelLead.agent || "Unassigned"}
                        onChange={(e) => patchConversation(panelLead.id, { agent: e.target.value })}
                        className="w-full rounded-[6px] text-[13px] py-1.5 px-2 outline-none disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
                        style={{ border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                      >
                        <option value="Unassigned">Unassigned</option>
                        {panelLead.agent && panelLead.agent !== "Unassigned" && !assignableAgents.some(a => a.name === panelLead.agent) && (
                          <option value={panelLead.agent}>{panelLead.agent}</option>
                        )}
                        {assignableAgents.map((a) => (
                          <option key={a.name} value={a.name}>
                            {a.name}
                          </option>
                        ))}
                      </select>
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
                  {panelConv?.auditionOutcome === 'joining-later' && (
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
                  placeholder={panelConv?.auditionOutcome === 'joining-later' ? "e.g. Joining in summer" : "e.g. Call back about Sunday"}
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
                    background: panelConv?.auditionOutcome === 'joining-later' ? 'var(--bg-pill)' : 'var(--bg-input)',
                    borderColor: 'var(--border-input)',
                  }}
                  title="Mark as joining later"
                >
                  <input
                    type="checkbox"
                    checked={panelConv?.auditionOutcome === 'joining-later'}
                    disabled={isReadOnly}
                    onChange={async () => {
                      if (isReadOnly || !panelLead) return;
                      const isJL = panelConv?.auditionOutcome === 'joining-later';
                      if (isJL) {
                        await patchConversation(panelLead.id, { auditionOutcome: '' });
                      } else {
                        const d = new Date();
                        d.setDate(d.getDate() + 14);
                        const y = d.getFullYear();
                        const m = String(d.getMonth() + 1).padStart(2, '0');
                        const day = String(d.getDate()).padStart(2, '0');
                        const defaultDate = `${y}-${m}-${day}`;

                        const updates: Record<string, any> = {
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
                        if (panelLead.stage === 'Audition Booked') {
                          moveLeadToStage(panelLead.id, 'Contacted');
                        }
                        await patchConversation(panelLead.id, updates);
                      }
                    }}
                    className="w-3.5 h-3.5 rounded cursor-pointer accent-[#0066FF]"
                  />
                  <span
                    className="text-[12px] font-medium whitespace-nowrap"
                    style={{
                      color: panelConv?.auditionOutcome === 'joining-later' ? 'var(--text-primary)' : 'var(--text-secondary)',
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
                <p className="text-[13px]" style={{ color: 'var(--text-primary)' }}>{panelLead.name}</p>
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

