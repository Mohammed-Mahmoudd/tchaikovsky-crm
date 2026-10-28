"use client";

import React, { useState, useMemo } from 'react';
import { useCRM } from '../context/CRMContext';
import { useAuth } from '../components/AuthProvider';
import { MessageSquare } from 'lucide-react';

const STAGE_COLORS: Record<string, string> = {
  "New":            "#0066FF",
  "Contacted":      "#FF9500",
  "Audition Booked":"#34C759",
  "Attended":       "#30B0C7",
  "Enrolled":       "#5856D6",
  "Unqualified":    "#8E8E93",
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
  const { conversations, loading, openChat, assignableAgents, patchConversation } = useCRM();
  const { isReadOnly, user } = useAuth();
  const isChairman = user?.role === "chairman" || user?.role === "owner" || user?.role === "manager";
  const [filterStage, setFilterStage] = useState("All");
  const [filterCampaign, setFilterCampaign] = useState("All campaigns");

  const leads: Lead[] = useMemo(() => {
    return conversations.map((c) => ({
      id: c.id,
      received: c.createdAt
        ? new Date(c.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
        : "—",
      name: c.name,
      phone: c.phone || "—",
      campaign: typeof c.source === "object" ? c.source?.campaign || "Direct" : (c.source && c.source !== "direct" ? c.source : "Direct"),
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

  const stages = ["All", "New", "Contacted", "Audition Booked", "Attended", "Enrolled", "Unqualified", "Lost"];
  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (filterStage !== "All" && l.stage !== filterStage) return false;
      if (filterCampaign !== "All campaigns" && l.campaign !== filterCampaign) return false;
      return true;
    });
  }, [leads, filterStage, filterCampaign]);

  const hasActiveFilters = filterStage !== "All" || filterCampaign !== "All campaigns";

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
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setFilterStage("All");
                  setFilterCampaign("All campaigns");
                }}
                className="text-[11px] font-semibold px-2 py-0.5 rounded-[6px] text-[#FF3B30] hover:bg-[rgba(255,59,48,0.1)] transition cursor-pointer"
                style={{ border: '1px solid rgba(255, 59, 48, 0.3)' }}
              >
                Clear filters
              </button>
            )}
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: 'var(--bg-pill)', color: 'var(--text-secondary)' }}>
              {filtered.length} leads
            </span>
          </div>
        </div>
        {/* Filters row */}
        <div className="flex items-center gap-3 overflow-x-auto flex-nowrap shrink-0" style={{ WebkitOverflowScrolling: 'touch' }}>
          {/* Stage filter pills */}
          <div className="flex gap-1.5 shrink-0">
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

          <div className="h-4 w-[1px] shrink-0" style={{ background: 'var(--border-main)' }} />

          {/* Campaign Filter */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>CAMPAIGN</span>
            <select
              value={filterCampaign}
              onChange={e => setFilterCampaign(e.target.value)}
              className="h-[26px] text-[11px] rounded-[6px] px-2 outline-none cursor-pointer font-medium"
              style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}
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
                    <td className="py-3 px-4">
                      {(() => {
                        const canEditAgent = !isReadOnly && isChairman;
                        return (
                          <select
                            disabled={!canEditAgent}
                            title={!canEditAgent ? "Only Chairman can assign agents" : undefined}
                            value={lead.agent}
                            onChange={(e) => patchConversation(lead.id, { agent: e.target.value })}
                            className="text-[11px] font-medium rounded-[6px] px-1.5 py-0.5 outline-none cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                            style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}
                          >
                            <option value="Unassigned">Unassigned</option>
                            {lead.agent && lead.agent !== "Unassigned" && !assignableAgents.some(a => a.name === lead.agent) && (
                              <option value={lead.agent}>{lead.agent}</option>
                            )}
                            {assignableAgents.map(a => (
                              <option key={a.name} value={a.name}>{a.name}</option>
                            ))}
                          </select>
                        );
                      })()}
                    </td>
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
