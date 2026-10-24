"use client";

import React, { useState, useMemo } from 'react';
import { useCRM } from '../context/CRMContext';
import { MessageSquare } from 'lucide-react';

const STAGE_COLORS: Record<string, string> = {
  "New":            "#0066FF",
  "Contacted":      "#FF9500",
  "Audition Booked":"#34C759",
  "Attended":       "#30B0C7",
  "Enrolled":       "#5856D6",
  "Lost":           "#FF3B30",
  "direct":         "#8E8E93",
};

type Lead = {
  id: string;
  received: string;
  name: string;
  phone: string;
  campaign: string;
  ad: string;
  stage: string;
  agent: string;
  channel: string;
};

export default function LeadsPage() {
  const { conversations, loading, openChat } = useCRM();
  const [filterStage, setFilterStage] = useState("All");

  const leads: Lead[] = useMemo(() => {
    return conversations.map((c) => ({
      id: c.id,
      received: c.createdAt
        ? new Date(c.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
        : "—",
      name: c.name,
      phone: c.phone || "—",
      campaign: typeof c.source === "object" ? c.source?.campaign || "Direct" : c.source || "Direct",
      ad: typeof c.source === "object" ? c.source?.ad || "—" : "—",
      stage: c.pipeline || "New",
      agent: c.agent || "Unassigned",
      channel: c.channel || "—",
    }));
  }, [conversations]);

  const stages = ["All", "New", "Contacted", "Audition Booked", "Enrolled", "Lost"];
  const filtered = filterStage === "All" ? leads : leads.filter(l => l.stage === filterStage);

  return (
    <div className="flex flex-col h-full min-h-0" style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <div className="px-4 md:px-6 py-4 shrink-0" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-main)' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-[15px] font-bold mb-0.5" style={{ color: 'var(--text-primary)' }}>Leads</h1>
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              Every live lead from Meta — newest first. Synchronized across CRM.
            </p>
          </div>
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: 'var(--bg-pill)', color: 'var(--text-secondary)' }}>
            {filtered.length} leads
          </span>
        </div>
        {/* Stage filter pills */}
        <div className="flex gap-2 overflow-x-auto flex-nowrap shrink-0" style={{ WebkitOverflowScrolling: 'touch' }}>
          {stages.map(s => (
            <button
              key={s}
              onClick={() => setFilterStage(s)}
              className="text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors shrink-0 cursor-pointer touch-manipulation"
              style={filterStage === s
                ? { background: '#0066FF', color: '#fff' }
                : { background: 'var(--bg-pill)', color: 'var(--text-secondary)' }
              }
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 min-w-0 overflow-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="min-w-[800px] p-4 md:p-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>Loading leads from database...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-2">
              <p className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>No leads found</p>
              <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                Leads will appear here automatically when someone messages you on Instagram or Facebook.
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse rounded-xl overflow-hidden shadow-sm">
              <thead className="text-[10px] uppercase tracking-widest font-bold" style={{ background: 'var(--bg-table-header)', color: 'var(--text-secondary)' }}>
                <tr>
                  <th className="py-2.5 px-4 font-bold">Received</th>
                  <th className="py-2.5 px-4 font-bold">Name</th>
                  <th className="py-2.5 px-4 font-bold">Phone</th>
                  <th className="py-2.5 px-4 font-bold">Channel</th>
                  <th className="py-2.5 px-4 font-bold">Campaign</th>
                  <th className="py-2.5 px-4 font-bold">Agent</th>
                  <th className="py-2.5 px-4 font-bold">Stage</th>
                  <th className="py-2.5 px-4 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="text-[12px]" style={{ color: 'var(--text-primary)' }}>
                {filtered.map((lead, idx) => (
                  <tr key={lead.id} style={{ background: idx % 2 === 0 ? 'transparent' : 'var(--bg-card)', borderBottom: '1px solid var(--border-main)' }}>
                    <td className="py-3 px-4" style={{ color: 'var(--text-secondary)' }}>{lead.received}</td>
                    <td className="py-3 px-4 font-semibold">{lead.name}</td>
                    <td className="py-3 px-4" style={{ color: 'var(--text-secondary)' }}>{lead.phone}</td>
                    <td className="py-3 px-4">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-pill)', color: 'var(--text-secondary)' }}>
                        {lead.channel}
                      </span>
                    </td>
                    <td className="py-3 px-4" style={{ color: 'var(--text-secondary)' }}>{lead.campaign}</td>
                    <td className="py-3 px-4" style={{ color: 'var(--text-secondary)' }}>{lead.agent}</td>
                    <td className="py-3 px-4">
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: `${STAGE_COLORS[lead.stage] || '#0066FF'}18`, color: STAGE_COLORS[lead.stage] || '#0066FF' }}
                      >
                        {lead.stage}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => openChat(lead.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 transition"
                        title="Open in Inbox"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        Chat
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
