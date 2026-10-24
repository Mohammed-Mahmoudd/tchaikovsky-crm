"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { MessageSquare } from "lucide-react";
import { useCRM } from "../context/CRMContext";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
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
};

const STAGES: Stage[] = [
  "New", "Contacted", "Audition Booked", "Attended", "Enrolled", "Unqualified", "Lost",
];

// Next-stage label map
const NEXT_STAGE: Partial<Record<Stage, string>> = {
  "New": "→ Contacted",
  "Contacted": "→ Audition Booked",
  "Audition Booked": "→ Attended",
  "Attended": "→ Enrolled",
};

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

function MoveToPopover({
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
}

// ─── Mobile Lead Card (no drag, with "Move to" button) ───────────────────────

function MobileLeadCard({
  lead,
  onMove,
  onClick,
}: {
  lead: Lead;
  onMove: (stage: Stage) => void;
  onClick?: () => void;
}) {
  const [showPopover, setShowPopover] = useState(false);

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
        {/* Move-to button — top right */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowPopover((prev) => !prev);
          }}
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

      {/* Popover */}
      {showPopover && (
        <MoveToPopover
          currentStage={lead.stage}
          onMove={onMove}
          onClose={() => setShowPopover(false)}
        />
      )}
    </div>
  );
}

// ─── Mobile Column (no DnD) ─────────────────────────────────────────────────

function MobileColumn({
  stage,
  leads,
  onMove,
  onSelectLead,
}: {
  stage: Stage;
  leads: Lead[];
  onMove: (id: string, stage: Stage) => void;
  onSelectLead: (id: string) => void;
}) {
  return (
    <div className="flex flex-col min-w-[260px] max-w-[260px] shrink-0 h-full">
      <div
        className="flex flex-col flex-1 rounded-2xl overflow-hidden h-full max-h-full"
        style={{ background: "var(--bg-column)" }}
      >
        {/* Column header */}
        <div className="flex items-center justify-between px-3 pt-4 pb-2 shrink-0">
          <div className="flex items-center gap-2">
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: STAGE_COLORS[stage],
              }}
            />
            <span
              className="text-[15px] font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              {stage}
            </span>
          </div>
          <span
            className="text-[12px] font-bold px-2.5 py-0.5 rounded-full"
            style={{
              background: "var(--bg-card)",
              color: "var(--text-secondary)",
            }}
          >
            {leads.length}
          </span>
        </div>

        {/* Card list — plain scroll, no drag */}
        <div
          className="flex flex-col gap-2 flex-1 min-h-[150px] px-2.5 pb-3 overflow-y-auto"
          style={{
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "contain",
          }}
        >
          {leads.map((lead) => (
            <MobileLeadCard
              key={lead.id}
              lead={lead}
              onMove={(targetStage) => onMove(lead.id, targetStage)}
              onClick={() => onSelectLead(lead.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Desktop Lead Card (with drag handle dots) ──────────────────────────────

function LeadCard({ lead, onAdvance, isDragging, onClick }: { lead: Lead; onAdvance?: () => void; isDragging?: boolean; onClick?: () => void }) {
  const next = NEXT_STAGE[lead.stage];
  return (
    <div
      onClick={onClick}
      className={`rounded-xl px-4 py-3 transition-shadow ${isDragging ? "shadow-xl opacity-90 rotate-1 scale-[1.02] cursor-grabbing" : "hover:shadow-md cursor-pointer"
        }`}
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)', boxShadow: 'var(--shadow-card)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[15px] font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>{lead.name}</p>
        <div className="shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }}>
          <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor" opacity={0.4}>
            <circle cx="3" cy="3" r="1.5" />
            <circle cx="9" cy="3" r="1.5" />
            <circle cx="3" cy="8" r="1.5" />
            <circle cx="9" cy="8" r="1.5" />
            <circle cx="3" cy="13" r="1.5" />
            <circle cx="9" cy="13" r="1.5" />
          </svg>
        </div>
      </div>
      <p className="text-[13px] mt-0.5 leading-snug" style={{ color: 'var(--text-secondary)' }}>{lead.campaign}</p>
      <div className="flex items-center justify-between mt-2.5">
        <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{lead.date.split(",")[0]}</span>
        {next && (
          <button
            onClick={(e) => { e.stopPropagation(); onAdvance?.(); }}
            className="text-[12px] font-semibold px-2.5 py-1 rounded-full transition-colors cursor-pointer touch-manipulation"
            style={{ background: 'var(--bg-pill)', color: '#0066FF' }}
          >
            {next}
          </button>
        )}
      </div>
    </div>
  );
}

function SortableLeadCard({ lead, onAdvance, onClick }: { lead: Lead; onAdvance: () => void; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lead.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
    touchAction: isDragging ? 'none' : 'pan-x pan-y',
    WebkitUserSelect: 'none',
    userSelect: 'none',
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
    >
      <LeadCard lead={lead} onAdvance={onAdvance} onClick={onClick} />
    </div>
  );
}

// ─── Desktop Column (with DnD) ──────────────────────────────────────────────

function Column({ stage, leads, onAdvance, onSelectLead }: { stage: Stage; leads: Lead[]; onAdvance: (id: string) => void; onSelectLead: (id: string) => void }) {
  const { setNodeRef } = useDroppable({ id: stage });
  const itemIds = useMemo(() => leads.map(l => l.id), [leads]);

  return (
    <div className="flex flex-col min-w-[240px] max-w-[240px] shrink-0 h-full">
      <div className="flex flex-col flex-1 rounded-2xl overflow-hidden h-full max-h-full" style={{ background: 'var(--bg-column)' }}>
        <div className="flex items-center justify-between px-3 pt-4 pb-2 shrink-0">
          <span className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>{stage}</span>
          <span className="text-[12px] font-bold px-2.5 py-0.5 rounded-full" style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)' }}>{leads.length}</span>
        </div>

        <SortableContext id={stage} items={itemIds} strategy={verticalListSortingStrategy}>
          <div
            ref={setNodeRef}
            className="flex flex-col gap-2 flex-1 min-h-[150px] px-2.5 pb-3 overflow-y-auto transition-colors"
            style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
          >
            {leads.map(lead => (
              <SortableLeadCard key={lead.id} lead={lead} onAdvance={() => onAdvance(lead.id)} onClick={() => onSelectLead(lead.id)} />
            ))}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const { conversations, patchConversation, openChat } = useCRM();
  const isMobile = useIsMobile();

  const [view, setView] = useState<"pipeline" | "table">("pipeline");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [panelLeadId, setPanelLeadId] = useState<string | null>(null);
  const [filterAgent, setFilterAgent] = useState("Everyone");
  const [filterCampaign, setFilterCampaign] = useState("All campaigns");
  const [filterReceived, setFilterReceived] = useState("Any time");
  const [filterSource, setFilterSource] = useState("All sources");
  const [hiddenStages, setHiddenStages] = useState<Set<Stage>>(new Set());

  // Derive leads dynamically from shared conversations
  const leads: Lead[] = useMemo(() => {
    return conversations.map((c) => ({
      id: c.id,
      name: c.name,
      campaign: typeof c.source === "object" ? c.source?.campaign || "Direct" : c.source || "Direct",
      date: c.createdAt
        ? new Date(c.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
        : "—",
      stage: (c.pipeline as Stage) || "New",
      phone: c.phone,
      agent: c.agent || "Unassigned",
    }));
  }, [conversations]);

  // Apply filters
  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      if (filterCampaign !== "All campaigns" && lead.campaign !== filterCampaign) return false;
      return true;
    });
  }, [leads, filterCampaign]);

  // Desktop-only sensors (pointer only, no touch sensor)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const activeLead = activeId ? leads.find(l => l.id === activeId) : null;
  const panelLead = panelLeadId ? leads.find(l => l.id === panelLeadId) : null;

  const leadsPerStage = (stage: Stage) => filteredLeads.filter(l => l.stage === stage);
  const countPerStage = (stage: Stage) => filteredLeads.filter(l => l.stage === stage).length;

  const visibleStages = STAGES.filter(s => !hiddenStages.has(s));

  const toggleStage = (stage: Stage) => {
    setHiddenStages(prev => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (_event: DragOverEvent) => {
    // Handled on drop
  };

  // Advance a lead to the next stage with the quick-advance button
  const advanceLead = (id: string) => {
    const lead = leads.find(l => l.id === id);
    if (!lead) return;
    const stageIdx = STAGES.indexOf(lead.stage);
    const nextStage = STAGES[stageIdx + 1];
    if (!nextStage) return;
    patchConversation(id, { pipeline: nextStage });
  };

  // Move a lead to any stage (used by mobile "Move to" popover)
  const moveLeadToStage = (id: string, stage: Stage) => {
    patchConversation(id, { pipeline: stage });
  };

  // Drag end — persist the new stage to DB & context
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const activeLeadId = active.id as string;
    const overId = over.id as string;

    const overStage = STAGES.find(s => s === overId) as Stage | undefined;
    const overLead = leads.find(l => l.id === overId);
    const targetStage: Stage | undefined = overStage ?? (overLead?.stage as Stage);

    if (targetStage) {
      patchConversation(activeLeadId, { pipeline: targetStage });
    }
  };


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

        <div className="ml-auto flex items-center gap-2">
          <button className="text-[11px] rounded-[6px] px-2.5 py-1 transition-colors cursor-pointer" style={{ border: '1px solid var(--border-main)', color: 'var(--text-secondary)', background: 'var(--bg-card)' }}>
            Clear
          </button>
        </div>
      </div>

      {/* Filter row */}
      <div className="px-4 md:px-6 py-2 flex items-center gap-3 overflow-x-auto flex-nowrap shrink-0" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-main)', WebkitOverflowScrolling: 'touch' }}>
        <FilterPill label="RECEIVED" value={filterReceived} options={["Any time", "Today", "This week", "This month"]} onChange={setFilterReceived} />
        <FilterPill label="AGENT" value={filterAgent} options={["Everyone", "Jwana", "Rokaia", "Mona"]} onChange={setFilterAgent} />
        <FilterPill label="CAMPAIGN" value={filterCampaign} options={["All campaigns", "KSA – Adult Music Classes", "Jeddah – Piano & Violin Leads (Aug)", "IG Click-to-WhatsApp – Auditions"]} onChange={setFilterCampaign} />
        <FilterPill label="SOURCE" value={filterSource} options={["All sources", "Meta", "Organic", "WhatsApp"]} onChange={setFilterSource} />
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
              return (
                <button
                  key={stage}
                  onClick={() => toggleStage(stage)}
                  className={`text-[12px] font-medium px-2.5 py-0.5 rounded-full transition-colors shrink-0 cursor-pointer touch-manipulation ${isHidden ? 'line-through' : ''}`}
                  style={isHidden ? { background: 'var(--bg-pill)', color: 'var(--text-muted)' } : { background: 'var(--bg-selected)', color: '#0066FF' }}
                >
                  {stage} {countPerStage(stage)}
                </button>
              );
            })}
          </div>

          {/* Kanban board — mobile vs desktop rendering */}
          {isMobile ? (
            /* ── MOBILE: No drag-and-drop, cards have "Move" button ── */
            <div
              className="flex-1 min-h-0 min-w-0 overflow-x-auto overflow-y-auto px-4 py-4"
              style={{
                WebkitOverflowScrolling: "touch",
                touchAction: "pan-x pan-y",
              }}
            >
              <div
                className="flex gap-3 h-full items-start"
                style={{
                  minWidth:
                    visibleStages.length * 268 +
                    (visibleStages.length - 1) * 12 +
                    "px",
                }}
              >
                {visibleStages.map((stage) => (
                  <MobileColumn
                    key={stage}
                    stage={stage}
                    leads={leadsPerStage(stage)}
                    onMove={moveLeadToStage}
                    onSelectLead={setPanelLeadId}
                  />
                ))}
              </div>
            </div>
          ) : (
            /* ── DESKTOP: Full drag-and-drop ── */
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              <div
                className="flex-1 min-h-0 min-w-0 overflow-x-auto overflow-y-auto px-4 md:px-6 py-4 md:py-5"
                style={{
                  WebkitOverflowScrolling: 'touch',
                  touchAction: 'pan-x pan-y',
                }}
              >
                <div className="flex gap-4 h-full items-start" style={{ minWidth: visibleStages.length * 240 + ((visibleStages.length - 1) * 16) + "px" }}>
                  {visibleStages.map(stage => (
                    <Column
                      key={stage}
                      stage={stage}
                      leads={leadsPerStage(stage)}
                      onAdvance={advanceLead}
                      onSelectLead={setPanelLeadId}
                    />
                  ))}
                </div>
              </div>

              {/* Drag overlay – the floating "ghost" card */}
              <DragOverlay dropAnimation={{ duration: 180, easing: "ease" }}>
                {activeLead ? <LeadCard lead={activeLead} isDragging /> : null}
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
            <button onClick={() => setPanelLeadId(null)} className="p-1 rounded-md transition-colors" style={{ color: 'var(--text-secondary)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-6 flex-1">
            <button className="w-full bg-[#0066FF] text-white font-semibold py-2 rounded-lg mb-8 hover:bg-[#0055d4] transition-colors shadow-sm">
              Book audition
            </button>

            <button
              onClick={() => openChat(panelLead.id)}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 mb-5 rounded-lg bg-[#0066FF] text-white text-[13px] font-semibold hover:bg-[#0055d4] transition-colors shadow-sm"
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
                  <select className="w-full rounded-[6px] text-[13px] py-1.5 px-2 outline-none" style={{ border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}>
                    <option>{panelLead.agent || "Unassigned"}</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-[11px] block mb-1" style={{ color: 'var(--text-secondary)' }}>Stage</label>
                  <select className="w-full rounded-[6px] text-[13px] py-1.5 px-2 outline-none" style={{ border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}>
                    <option>{panelLead.stage}</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <h3 className="text-[10px] font-bold tracking-widest text-[#0066FF] uppercase mb-2">Source</h3>
              <p className="text-[13px]" style={{ color: 'var(--text-primary)' }}>{panelLead.campaign}</p>
            </div>

            <div className="mb-6">
              <h3 className="text-[10px] font-bold tracking-widest text-[#0066FF] uppercase mb-2">Follow-up</h3>
              <input type="text" placeholder="e.g. Call back about Sunday" className="w-full rounded-[6px] text-[13px] py-1.5 px-3 mb-2 outline-none placeholder-gray-400" style={{ border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)' }} />
              <div className="flex gap-2">
                <div className="flex-1 rounded-[6px] px-3 py-1.5 flex items-center justify-between cursor-text" style={{ border: '1px solid var(--border-input)', background: 'var(--bg-input)' }}>
                  <span className="text-[13px]" style={{ color: 'var(--text-primary)' }}>09 / 21 / 2026</span>
                  <svg className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                </div>
                <button className="bg-[#0066FF] text-white font-semibold text-[13px] px-4 rounded-[6px] shadow-sm hover:bg-[#0055d4] transition-colors">Add</button>
              </div>
            </div>

            <div>
              <h3 className="text-[10px] font-bold tracking-widest text-[#0066FF] uppercase mb-2">Form Answers</h3>
              <p className="text-[11px] mb-0.5" style={{ color: 'var(--text-secondary)' }}>full name</p>
              <p className="text-[13px]" style={{ color: 'var(--text-primary)' }}>{panelLead.name}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Filter pill ──────────────────────────────────────────────────────────────

function FilterPill({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-[24px] text-[11px] rounded-[6px] px-2 outline-none cursor-pointer"
        style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}
      >
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}
