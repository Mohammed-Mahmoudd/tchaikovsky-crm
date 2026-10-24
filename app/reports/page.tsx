"use client";

import React, { useMemo } from 'react';
import { useCRM } from '../context/CRMContext';
import { TrendingUp, Users, CalendarCheck, Award, AlertCircle } from 'lucide-react';

type CampaignStats = {
  campaign: string;
  leads: number;
  booked: number;
  attended: number;
  enrolled: number;
  unqualified: number;
};

export default function ReportsPage() {
  const { conversations, loading } = useCRM();

  const { totalLeads, auditionsBooked, attended, enrolled, bookedPct, attendedPct, enrolledPct, campaignRows } = useMemo(() => {
    const total = conversations.length;
    const booked = conversations.filter(c => ['Audition Booked', 'Attended', 'Enrolled'].includes(c.pipeline)).length;
    const att = conversations.filter(c => ['Attended', 'Enrolled'].includes(c.pipeline)).length;
    const enr = conversations.filter(c => c.pipeline === 'Enrolled').length;

    const bPct = total > 0 ? `${Math.round((booked / total) * 100)}%` : '0%';
    const aPct = booked > 0 ? `${Math.round((att / booked) * 100)}%` : '0%';
    const ePct = total > 0 ? `${Math.round((enr / total) * 100)}%` : '0%';

    // Aggregate by campaign
    const campaignMap: Record<string, CampaignStats> = {};

    conversations.forEach((c) => {
      let campName = "Organic / Direct";
      if (typeof c.source === "object" && c.source?.campaign) {
        campName = c.source.campaign;
      } else if (typeof c.source === "string" && c.source.trim()) {
        campName = c.source;
      }

      if (!campaignMap[campName]) {
        campaignMap[campName] = {
          campaign: campName,
          leads: 0,
          booked: 0,
          attended: 0,
          enrolled: 0,
          unqualified: 0,
        };
      }

      const entry = campaignMap[campName];
      entry.leads += 1;
      if (['Audition Booked', 'Attended', 'Enrolled'].includes(c.pipeline)) entry.booked += 1;
      if (['Attended', 'Enrolled'].includes(c.pipeline)) entry.attended += 1;
      if (c.pipeline === 'Enrolled') entry.enrolled += 1;
      if (c.pipeline === 'Lost') entry.unqualified += 1;
    });

    const rows = Object.values(campaignMap).sort((a, b) => b.leads - a.leads);

    return {
      totalLeads: total,
      auditionsBooked: booked,
      attended: att,
      enrolled: enr,
      bookedPct: bPct,
      attendedPct: aPct,
      enrolledPct: ePct,
      campaignRows: rows,
    };
  }, [conversations]);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <div className="px-6 py-4" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-main)' }}>
        <h1 className="text-[15px] font-bold mb-0.5" style={{ color: 'var(--text-primary)' }}>Reports & Analytics</h1>
        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          Real-time conversion metrics calculated from active Meta leads & conversations.
        </p>
      </div>

      {/* Main Content */}
      <div className="p-6 flex-1 overflow-y-auto" style={{ color: 'var(--text-primary)' }}>
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KpiCard
            title="Total Leads"
            value={totalLeads.toString()}
            icon={<Users className="w-4 h-4 text-blue-500" />}
          />
          <KpiCard
            title="Auditions Booked"
            value={auditionsBooked.toString()}
            subValue={bookedPct}
            subLabel="of leads"
            icon={<CalendarCheck className="w-4 h-4 text-emerald-500" />}
          />
          <KpiCard
            title="Attended"
            value={attended.toString()}
            subValue={attendedPct}
            subLabel="show rate"
            icon={<TrendingUp className="w-4 h-4 text-cyan-500" />}
          />
          <KpiCard
            title="Enrolled Students"
            value={enrolled.toString()}
            subValue={enrolledPct}
            subLabel="conversion"
            icon={<Award className="w-4 h-4 text-purple-500" />}
          />
        </div>

        {/* Campaign Breakdown Table */}
        <div className="rounded-xl overflow-hidden shadow-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}>
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-main)' }}>
            <h2 className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>Campaign Performance Breakdown</h2>
            <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{campaignRows.length} Campaign{campaignRows.length !== 1 ? 's' : ''}</span>
          </div>

          <div className="overflow-x-auto">
            {campaignRows.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                  {loading ? "Calculating metrics..." : "No conversation campaign data recorded yet."}
                </p>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest font-bold" style={{ background: 'var(--bg-table-header)', color: 'var(--text-secondary)' }}>
                    <th className="py-2.5 px-4">Campaign</th>
                    <th className="py-2.5 px-4 text-right">Leads</th>
                    <th className="py-2.5 px-4 text-right">Booked</th>
                    <th className="py-2.5 px-4 text-right">Attended</th>
                    <th className="py-2.5 px-4 text-right">Enrolled</th>
                    <th className="py-2.5 px-4 text-right">Lead → Enrol</th>
                    <th className="py-2.5 px-4 text-right">Lost / Unqualified</th>
                  </tr>
                </thead>
                <tbody className="text-[12px] divide-y" style={{ color: 'var(--text-primary)', borderColor: 'var(--border-main)' }}>
                  {campaignRows.map((c, idx) => {
                    const convPct = c.leads > 0 ? `${Math.round((c.enrolled / c.leads) * 100)}%` : '0%';
                    return (
                      <tr key={c.campaign} style={{ background: idx % 2 === 0 ? 'transparent' : 'var(--bg-card)' }}>
                        <td className="py-3 px-4 font-semibold" style={{ color: 'var(--text-primary)' }}>{c.campaign}</td>
                        <td className="py-3 px-4 text-right font-medium" style={{ color: 'var(--text-secondary)' }}>{c.leads}</td>
                        <td className="py-3 px-4 text-right" style={{ color: 'var(--text-secondary)' }}>{c.booked}</td>
                        <td className="py-3 px-4 text-right" style={{ color: 'var(--text-secondary)' }}>{c.attended}</td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-500">{c.enrolled}</td>
                        <td className="py-3 px-4 text-right font-medium text-blue-500">{convPct}</td>
                        <td className="py-3 px-4 text-right" style={{ color: 'var(--text-muted)' }}>{c.unqualified}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ title, value, subValue, subLabel, icon }: { title: string; value: string; subValue?: string; subLabel?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4 flex flex-col justify-between h-[90px] shadow-sm transition hover:shadow-md" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}>
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>{title}</h3>
        {icon}
      </div>
      <div className="flex items-baseline justify-between mt-1">
        <span className="text-[24px] font-extrabold leading-none" style={{ color: 'var(--text-primary)' }}>{value}</span>
        {subValue && (
          <span className="text-[11px] font-medium text-[#0066FF] flex items-center gap-1">
            {subValue} <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{subLabel}</span>
          </span>
        )}
      </div>
    </div>
  );
}
