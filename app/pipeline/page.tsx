"use client";

import React, { useState, useMemo, useEffect } from "react";
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
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ─── Types ──────────────────────────────────────────────────────────────────

type Stage =
  | "New"
  | "Contacted"
  | "Audition booked"
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

// ─── Demo data ───────────────────────────────────────────────────────────────

const INITIAL_LEADS: Lead[] = [
  { id: "1", name: "Khalid", campaign: "KSA – Adult Music Classes", date: "Sep 01, 09:49 AM", stage: "Contacted", agent: "Jwana" },
  { id: "2", name: "Reem", campaign: "KSA – Adult Music Classes", date: "Aug 31, 07:49 AM", stage: "New", agent: "Rokaia", phone: "+966 50 0000 103" },
  { id: "3", name: "Walk-in – Mona", campaign: "Organic", date: "Sep 01, 02:49 AM", stage: "New", agent: "Unassigned" },
  { id: "4", name: "Noura", campaign: "Jeddah – Piano & Violin Leads (Aug)", date: "Sep 01, 12:49 PM", stage: "Audition booked", phone: "+966 50 0000 101", agent: "Sara" },
  { id: "5", name: "Faisal", campaign: "IG Click-to-WhatsApp – Auditions", date: "Sep 01, 01:19 PM", stage: "Audition booked", phone: "+966 50 0000 102", agent: "Unassigned" },
  { id: "6", name: "Huda", campaign: "Jeddah – Piano & Violin Leads (Aug)", date: "Aug 31, 12:49 PM", stage: "Audition booked", phone: "+966 50 0000 106", agent: "Rokaia" },
  { id: "7", name: "Tariq", campaign: "KSA – Adult Music Classes", date: "Aug 31, 06:49 PM", stage: "Contacted", agent: "Jwana" },
  { id: "8", name: "Salma", campaign: "Jeddah – Piano & Violin Leads (Aug)", date: "Aug 28, 02:49 PM", stage: "Attended", agent: "Sara" },
  { id: "9", name: "Yara", campaign: "Jeddah – Piano & Violin Leads (Aug)", date: "Aug 25, 02:49 PM", stage: "Enrolled", agent: "Rokaia" },
  { id: "10", name: "Abdulrahman", campaign: "IG Click-to-WhatsApp – Auditions", date: "Aug 24, 06:49 AM", stage: "Enrolled", agent: "Sara" },
  { id: "11", name: "Majed", campaign: "KSA – Adult Music Classes", date: "Aug 30, 01:49 PM", stage: "Unqualified", agent: "Sara" },
  { id: "12", name: "Dana", campaign: "Jeddah – Piano & Violin Leads (Aug)", date: "Aug 22, 02:49 PM", stage: "Lost", agent: "Sara" },
];

const STAGES: Stage[] = [
  "New", "Contacted", "Audition booked", "Attended", "Enrolled", "Unqualified", "Lost",
];

// Next-stage label map
const NEXT_STAGE: Partial<Record<Stage, string>> = {
  "New": "→ Contacted",
  "Contacted": "→ Audition booked",
  "Audition booked": "→ Attended",
  "Attended": "→ Enrolled",
};

// ─── Sortable Lead Card ───────────────────────────────────────────────────────

function LeadCard({ lead, onAdvance, isDragging, onClick }: { lead: Lead; onAdvance?: () => void; isDragging?: boolean; onClick?: () => void }) {
  const next = NEXT_STAGE[lead.stage];
  return (
    <div
      onClick={onClick}
      className={`rounded-xl px-4 py-3 transition-shadow ${isDragging ? "shadow-xl opacity-90 rotate-1 scale-[1.02] cursor-grabbing" : "hover:shadow-md"
        }`}
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)', boxShadow: 'var(--shadow-card)' }}
    >
      <p className="text-[15px] font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>{lead.name}</p>
      <p className="text-[13px] mt-0.5 leading-snug" style={{ color: 'var(--text-secondary)' }}>{lead.campaign}</p>
      <div className="flex items-center justify-between mt-2.5">
        <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{lead.date.split(",")[0]}</span>
        {next && (
          <button
            onClick={(e) => { e.stopPropagation(); onAdvance?.(); }}
            className="text-[12px] font-semibold px-2.5 py-1 rounded-full transition-colors"
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
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    cursor: "grab",
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <LeadCard lead={lead} onAdvance={onAdvance} onClick={onClick} />
    </div>
  );
}

// ─── Column ──────────────────────────────────────────────────────────────────

function Column({ stage, leads, onAdvance, onSelectLead }: { stage: Stage; leads: Lead[]; onAdvance: (id: string) => void; onSelectLead: (id: string) => void }) {
  const { setNodeRef } = useDroppable({ id: stage });
  const itemIds = useMemo(() => leads.map(l => l.id), [leads]);

  return (
    <div className="flex flex-col min-w-[220px] max-w-[220px]">
      {/* Rounded card container */}
      <div className="flex flex-col flex-1 rounded-2xl overflow-hidden h-full" style={{ background: 'var(--bg-column)' }}>
        {/* Column header */}
        <div className="flex items-center justify-between px-3 pt-4 pb-2">
          <span className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>{stage}</span>
          <span className="text-[12px] font-bold px-2.5 py-0.5 rounded-full" style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)' }}>{leads.length}</span>
        </div>

        {/* Drop zone */}
        <SortableContext id={stage} items={itemIds} strategy={verticalListSortingStrategy}>
          <div ref={setNodeRef} className="flex flex-col gap-2 flex-1 min-h-[150px] px-2.5 pb-3 transition-colors">
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
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const [view, setView] = useState<"pipeline" | "table">("pipeline");
  const [leads, setLeads] = useState<Lead[]>(INITIAL_LEADS);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [panelLeadId, setPanelLeadId] = useState<string | null>(null);
  const [filterAgent, setFilterAgent] = useState("Everyone");
  const [filterCampaign, setFilterCampaign] = useState("All campaigns");
  const [filterReceived, setFilterReceived] = useState("Any time");
  const [filterSource, setFilterSource] = useState("All sources");
  const [hiddenStages, setHiddenStages] = useState<Set<Stage>>(new Set());

  // Apply filters
  const filteredLeads = leads.filter(lead => {
    if (filterCampaign !== "All campaigns" && lead.campaign !== filterCampaign) return false;
    return true;
  });

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

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeLeadId = active.id as string;
    const overId = over.id as string;

    // Check if we're dragging over a column (stage name) or another card
    const overStage = STAGES.find(s => s === overId) as Stage | undefined;
    const overLead = leads.find(l => l.id === overId);

    if (!overStage && !overLead) return;

    const targetStage: Stage = overStage ?? (overLead!.stage as Stage);

    setLeads(prev =>
      prev.map(l => l.id === activeLeadId ? { ...l, stage: targetStage } : l)
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const activeLeadId = active.id as string;
    const overId = over.id as string;

    const activeLead = leads.find(l => l.id === activeLeadId);
    const overLead = leads.find(l => l.id === overId);

    if (!activeLead || !overLead || activeLead.stage !== overLead.stage) return;

    // Reorder within the same column
    setLeads(prev => {
      const stageLeads = prev.filter(l => l.stage === activeLead.stage);
      const others = prev.filter(l => l.stage !== activeLead.stage);
      const oldIdx = stageLeads.findIndex(l => l.id === activeLeadId);
      const newIdx = stageLeads.findIndex(l => l.id === overId);
      const reordered = arrayMove(stageLeads, oldIdx, newIdx);
      // Rebuild preserving original order of other stages
      return prev.map(l => {
        const updated = reordered.find(r => r.id === l.id);
        return updated ?? l;
      });
    });
  };

  // Advance a lead to the next stage with the button
  const advanceLead = (id: string) => {
    setLeads(prev =>
      prev.map(l => {
        if (l.id !== id) return l;
        const stageIdx = STAGES.indexOf(l.stage);
        const next = STAGES[stageIdx + 1];
        return next ? { ...l, stage: next } : l;
      })
    );
  };

  if (!isMounted) return null;

  return (
    <div className="flex flex-col h-full relative overflow-hidden" style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}>

      {/* Top bar: view switcher + lead count */}
      <div className="px-4 md:px-6 py-2.5 flex items-center gap-2 flex-wrap" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-main)' }}>
        <button
          onClick={() => setView("pipeline")}
          className={`text-[12px] font-semibold px-3 py-1.5 rounded-[8px] transition-colors`}
          style={view === "pipeline" ? { background: 'var(--bg-selected)', color: '#0066FF' } : { color: 'var(--text-secondary)' }}
        >
          Pipeline
        </button>
        <button
          onClick={() => setView("table")}
          className={`text-[12px] font-semibold px-3 py-1.5 rounded-[8px] transition-colors`}
          style={view === "table" ? { background: 'var(--bg-selected)', color: '#0066FF' } : { color: 'var(--text-secondary)' }}
        >
          Table
        </button>
        <span className="text-[12px] ml-1" style={{ color: 'var(--text-muted)' }}>{filteredLeads.length} leads</span>

        <div className="ml-auto flex items-center gap-2">
          <button className="text-[11px] rounded-[6px] px-2.5 py-1 transition-colors" style={{ border: '1px solid var(--border-main)', color: 'var(--text-secondary)', background: 'var(--bg-card)' }}>
            Clear
          </button>
        </div>
      </div>

      {/* Filter row */}
      <div className="px-4 md:px-6 py-2.5 flex items-center gap-3 flex-wrap overflow-x-auto" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-main)' }}>
        <FilterPill label="RECEIVED" value={filterReceived} options={["Any time", "Today", "This week", "This month"]} onChange={setFilterReceived} />
        <FilterPill label="AGENT" value={filterAgent} options={["Everyone", "Jwana", "Rokaia", "Mona"]} onChange={setFilterAgent} />
        <FilterPill label="CAMPAIGN" value={filterCampaign} options={["All campaigns", "KSA – Adult Music Classes", "Jeddah – Piano & Violin Leads (Aug)", "IG Click-to-WhatsApp – Auditions"]} onChange={setFilterCampaign} />
        <FilterPill label="SOURCE" value={filterSource} options={["All sources", "Meta", "Organic", "WhatsApp"]} onChange={setFilterSource} />
      </div>

      {/* Main Content Area */}
      {view === "table" ? (
        <div className="flex-1 overflow-x-auto overflow-y-auto" style={{ background: 'var(--bg-card)' }}>
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
          <div className="px-6 py-2.5 flex items-center gap-2 flex-wrap" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-main)' }}>
            <span className="text-[10px] font-bold tracking-widest mr-2 uppercase" style={{ color: 'var(--text-muted)' }}>STAGES</span>
            {STAGES.map(stage => {
              const isHidden = hiddenStages.has(stage);
              return (
                <button
                  key={stage}
                  onClick={() => toggleStage(stage)}
                  className={`text-[12px] font-medium px-2.5 py-0.5 rounded-full transition-colors ${isHidden ? 'line-through' : ''}`}
                  style={isHidden ? { background: 'var(--bg-pill)', color: 'var(--text-muted)' } : { background: 'var(--bg-selected)', color: '#0066FF' }}
                >
                  {stage} {countPerStage(stage)}
                </button>
              );
            })}
          </div>

          {/* Kanban board */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="flex-1 overflow-x-auto overflow-y-auto px-6 py-5">
              <div className="flex gap-4 h-full" style={{ minWidth: visibleStages.length * 226 + "px" }}>
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
