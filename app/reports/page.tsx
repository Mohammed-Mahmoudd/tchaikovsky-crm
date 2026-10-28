"use client";

import React, { useState, useMemo } from 'react';
import { useCRM } from '../context/CRMContext';
import {
  TrendingUp,
  Users,
  CalendarCheck,
  Award,
  Banknote,
  ChevronLeft,
  ChevronRight,
  Calendar,
  X,
} from 'lucide-react';

type CampaignStats = {
  campaign: string;
  leads: number;
  booked: number;
  attended: number;
  enrolled: number;
  cashIn: number;
  unqualified: number;
};

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatRangeLabel(start: Date, end: Date) {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const yr = start.getFullYear() !== end.getFullYear() ? `, ${start.getFullYear()}` : '';
  const endYr = `, ${end.getFullYear()}`;
  return `${start.toLocaleDateString('en-US', opts)}${yr} – ${end.toLocaleDateString('en-US', opts)}${endYr}`;
}

function getWeekStart(from: Date) {
  const d = new Date(from);
  const day = d.getDay();
  // Saturday start (Saudi week: Sat-Fri)
  const diff = day === 6 ? 0 : day + 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekEnd(start: Date) {
  const d = new Date(start);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

export default function ReportsPage() {
  const { conversations, loading } = useCRM();
  const [showCashBreakdown, setShowCashBreakdown] = useState(false);

  // Filter state
  const [filterMode, setFilterMode] = useState<'week' | 'all'>('all');
  const [currentDate, setCurrentDate] = useState<Date>(() => getWeekStart(new Date()));

  const weekStart = useMemo(() => getWeekStart(currentDate), [currentDate]);
  const weekEnd = useMemo(() => getWeekEnd(weekStart), [weekStart]);

  const thisWeekStart = useMemo(() => getWeekStart(new Date()), []);
  const lastWeekStart = useMemo(() => addDays(thisWeekStart, -7), [thisWeekStart]);

  const isThisWeek = weekStart.getTime() === thisWeekStart.getTime();
  const isLastWeek = weekStart.getTime() === lastWeekStart.getTime();

  const prevWeek = () => {
    setCurrentDate(d => addDays(d, -7));
    setFilterMode('week');
  };

  const nextWeek = () => {
    setCurrentDate(d => addDays(d, 7));
    setFilterMode('week');
  };

  const goThisWeek = () => {
    setCurrentDate(thisWeekStart);
    setFilterMode('week');
  };

  const goLastWeek = () => {
    setCurrentDate(lastWeekStart);
    setFilterMode('week');
  };

  const goAllTime = () => {
    setFilterMode('all');
  };

  // Filter conversations by selected period
  const filteredConversations = useMemo(() => {
    if (filterMode === 'all') return conversations;

    const startMs = weekStart.getTime();
    const endMs = weekEnd.getTime();

    return conversations.filter((c) => {
      const time = c.createdAt
        ? new Date(c.createdAt).getTime()
        : (c.lastMessageAt || (c.updatedAt ? new Date(c.updatedAt).getTime() : 0));
      return time >= startMs && time <= endMs;
    });
  }, [conversations, filterMode, weekStart, weekEnd]);

  const {
    totalLeads,
    auditionsBooked,
    attended,
    enrolled,
    totalCashIn,
    avgCashPerEnrolled,
    bookedPct,
    attendedPct,
    enrolledPct,
    campaignRows,
    cashBreakdownList,
  } = useMemo(() => {
    const total = filteredConversations.length;
    const booked = filteredConversations.filter(c => ['Audition Booked', 'Attended', 'Enrolled'].includes(c.pipeline)).length;
    const att = filteredConversations.filter(c => ['Attended', 'Enrolled'].includes(c.pipeline)).length;
    const enr = filteredConversations.filter(c => c.pipeline === 'Enrolled').length;
    const totalCash = filteredConversations.reduce((acc, c) => acc + (Number(c.cashIn) || 0), 0);

    const bPct = total > 0 ? `${Math.round((booked / total) * 100)}%` : '0%';
    const aPct = booked > 0 ? `${Math.round((att / booked) * 100)}%` : '0%';
    const ePct = total > 0 ? `${Math.round((enr / total) * 100)}%` : '0%';
    const avgCash = enr > 0 ? Math.round(totalCash / enr) : 0;

    // Build cash breakdown list (who paid and how much)
    const breakdown = filteredConversations
      .filter(c => (Number(c.cashIn) || 0) > 0)
      .map(c => ({
        name: c.name || c.phone || c.id,
        phone: c.phone || '',
        pipeline: c.pipeline,
        cashIn: Number(c.cashIn) || 0,
      }))
      .sort((a, b) => b.cashIn - a.cashIn);

    // Aggregate by campaign
    const campaignMap: Record<string, CampaignStats> = {};

    filteredConversations.forEach((c) => {
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
          cashIn: 0,
          unqualified: 0,
        };
      }

      const entry = campaignMap[campName];
      entry.leads += 1;
      if (['Audition Booked', 'Attended', 'Enrolled'].includes(c.pipeline)) entry.booked += 1;
      if (['Attended', 'Enrolled'].includes(c.pipeline)) entry.attended += 1;
      if (c.pipeline === 'Enrolled') entry.enrolled += 1;
      if (c.pipeline === 'Lost' || c.pipeline === 'Unqualified') entry.unqualified += 1;
      entry.cashIn += Number(c.cashIn) || 0;
    });

    const rows = Object.values(campaignMap).sort((a, b) => b.leads - a.leads);

    return {
      totalLeads: total,
      auditionsBooked: booked,
      attended: att,
      enrolled: enr,
      totalCashIn: totalCash,
      avgCashPerEnrolled: avgCash,
      bookedPct: bPct,
      attendedPct: aPct,
      enrolledPct: ePct,
      campaignRows: rows,
      cashBreakdownList: breakdown,
    };
  }, [filteredConversations]);

  return (
    <div className="flex flex-col h-full min-h-0" style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <div
        className="px-4 md:px-6 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0"
        style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-main)' }}
      >
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[15px] font-bold leading-none mb-0.5" style={{ color: 'var(--text-primary)' }}>
              Reports & Analytics
            </h1>
            {filterMode === 'week' && (
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ background: 'var(--bg-selected)', color: '#0066FF' }}
              >
                {isThisWeek ? 'This Week' : isLastWeek ? 'Last Week' : 'Weekly View'}
              </span>
            )}
          </div>
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {filterMode === 'week' ? (
              <>
                Conversion metrics for <strong style={{ color: 'var(--text-primary)' }}>{formatRangeLabel(weekStart, weekEnd)}</strong> ({filteredConversations.length} of {conversations.length} leads)
              </>
            ) : (
              <>
                All-time conversion metrics ({conversations.length} total leads)
              </>
            )}
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Quick Presets */}
          <div className="flex items-center gap-1 p-0.5 rounded-[8px]" style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)' }}>
            <button
              onClick={goAllTime}
              className="h-[24px] px-2.5 text-[11px] font-semibold rounded-[6px] transition-colors cursor-pointer"
              style={filterMode === 'all'
                ? { background: '#0066FF', color: '#fff' }
                : { background: 'transparent', color: 'var(--text-secondary)' }
              }
            >
              All Time
            </button>
            <button
              onClick={goThisWeek}
              className="h-[24px] px-2.5 text-[11px] font-semibold rounded-[6px] transition-colors cursor-pointer"
              style={filterMode === 'week' && isThisWeek
                ? { background: '#0066FF', color: '#fff' }
                : { background: 'transparent', color: 'var(--text-secondary)' }
              }
            >
              This Week
            </button>
            <button
              onClick={goLastWeek}
              className="h-[24px] px-2.5 text-[11px] font-semibold rounded-[6px] transition-colors cursor-pointer"
              style={filterMode === 'week' && isLastWeek
                ? { background: '#0066FF', color: '#fff' }
                : { background: 'transparent', color: 'var(--text-secondary)' }
              }
            >
              Last Week
            </button>
          </div>

          {/* Week Stepper / Date Picker */}
          {filterMode === 'week' && (
            <div className="flex items-center gap-1">
              <button
                onClick={prevWeek}
                className="h-[28px] w-[28px] flex items-center justify-center rounded-[6px] transition-colors cursor-pointer hover:opacity-80"
                style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)', color: 'var(--text-secondary)' }}
                title="Previous Week"
                aria-label="Previous Week"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div
                className="h-[28px] px-2.5 flex items-center gap-1.5 text-[11px] font-medium rounded-[6px]"
                style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}
                title={`Week: ${formatRangeLabel(weekStart, weekEnd)}`}
              >
                <Calendar className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span className="whitespace-nowrap">{formatRangeLabel(weekStart, weekEnd)}</span>
              </div>

              <button
                onClick={nextWeek}
                className="h-[28px] w-[28px] flex items-center justify-center rounded-[6px] transition-colors cursor-pointer hover:opacity-80"
                style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)', color: 'var(--text-secondary)' }}
                title="Next Week"
                aria-label="Next Week"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <input
                type="date"
                value={isoDate(currentDate)}
                onChange={(e) => {
                  if (e.target.value) {
                    const [y, m, d] = e.target.value.split('-').map(Number);
                    const picked = new Date(y, m - 1, d);
                    picked.setHours(0, 0, 0, 0);
                    setCurrentDate(picked);
                    setFilterMode('week');
                  }
                }}
                className="h-[28px] text-[11px] font-medium rounded-[6px] px-2 outline-none cursor-pointer transition-colors"
                style={{
                  background: 'var(--bg-pill)',
                  border: '1px solid var(--border-input)',
                  color: 'var(--text-primary)',
                }}
                title="Select date to jump to week"
              />
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div
        className="p-4 md:p-6 flex-1 min-h-0 overflow-y-auto"
        style={{
          color: 'var(--text-primary)',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
        }}
      >
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
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
          <KpiCard
            title="Total Cash In"
            value={totalCashIn.toLocaleString()}
            subValue={avgCashPerEnrolled > 0 ? avgCashPerEnrolled.toLocaleString() : undefined}
            subLabel={avgCashPerEnrolled > 0 ? "avg / enrolled" : undefined}
            icon={<Banknote className="w-4 h-4 text-emerald-500" />}
            onClick={() => setShowCashBreakdown(true)}
            clickHint="View breakdown"
          />
        </div>

        {/* Campaign Breakdown Table */}
        <div className="rounded-xl overflow-hidden shadow-sm mb-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}>
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-main)' }}>
            <h2 className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>Campaign Performance Breakdown</h2>
            <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{campaignRows.length} Campaign{campaignRows.length !== 1 ? 's' : ''}</span>
          </div>

          <div className="overflow-x-auto w-full" style={{ WebkitOverflowScrolling: 'touch' }}>
            {campaignRows.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-[13px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                  {loading
                    ? "Calculating metrics..."
                    : filterMode === 'week'
                      ? `No conversation campaign data recorded for ${formatRangeLabel(weekStart, weekEnd)}.`
                      : "No conversation campaign data recorded yet."}
                </p>
                {!loading && filterMode === 'week' && (
                  <button
                    onClick={goAllTime}
                    className="mt-3 text-[11px] font-semibold px-3 py-1.5 rounded-[6px] transition-colors cursor-pointer"
                    style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)', color: '#0066FF' }}
                  >
                    View All Time Data
                  </button>
                )}
              </div>
            ) : (
              <table className="w-full text-left min-w-[720px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest font-bold" style={{ background: 'var(--bg-table-header)', color: 'var(--text-secondary)' }}>
                    <th className="py-2.5 px-4">Campaign</th>
                    <th className="py-2.5 px-4 text-right">Leads</th>
                    <th className="py-2.5 px-4 text-right">Booked</th>
                    <th className="py-2.5 px-4 text-right">Attended</th>
                    <th className="py-2.5 px-4 text-right">Enrolled</th>
                    <th className="py-2.5 px-4 text-right">Cash In</th>
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
                        <td className="py-3 px-4 text-right font-semibold text-emerald-600 dark:text-emerald-400">{c.cashIn.toLocaleString()}</td>
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

      {/* Cash Breakdown Modal */}
      {showCashBreakdown && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          onClick={() => setShowCashBreakdown(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.35)' }} />

          {/* Modal */}
          <div
            className="relative w-full sm:max-w-[540px] max-h-[85vh] flex flex-col rounded-t-2xl sm:rounded-xl overflow-hidden"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)', boxShadow: 'var(--shadow-card)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-3.5 flex items-center justify-between shrink-0" style={{ borderBottom: '1px solid var(--border-main)' }}>
              <div>
                <h2 className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>Cash In Breakdown</h2>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  {cashBreakdownList.length} payment{cashBreakdownList.length !== 1 ? 's' : ''} · Total: <strong style={{ color: 'var(--text-primary)' }}>{totalCashIn.toLocaleString()} SAR</strong>
                </p>
              </div>
              <button
                onClick={() => setShowCashBreakdown(false)}
                className="h-7 w-7 flex items-center justify-center rounded-md transition-colors cursor-pointer"
                style={{ background: 'var(--bg-pill)', color: 'var(--text-secondary)', border: '1px solid var(--border-input)' }}
                aria-label="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
              {cashBreakdownList.length === 0 ? (
                <div className="p-8 text-center">
                  <Banknote className="w-7 h-7 mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
                  <p className="text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>No payments recorded yet</p>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: 'var(--border-main)' }}>
                  {cashBreakdownList.map((entry, idx) => (
                    <div
                      key={`${entry.name}-${idx}`}
                      className="px-5 py-2.5 flex items-center justify-between gap-3"
                      style={{ background: idx % 2 === 0 ? 'transparent' : 'var(--bg-table-alt)' }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold"
                          style={{ background: 'var(--bg-selected)', color: '#0066FF' }}
                        >
                          {(entry.name || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[12px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{entry.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {entry.phone && (
                              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{entry.phone}</span>
                            )}
                            <span
                              className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                              style={{
                                background: 'var(--bg-selected)',
                                color: '#0066FF',
                              }}
                            >
                              {entry.pipeline}
                            </span>
                          </div>
                        </div>
                      </div>
                      <span className="text-[13px] font-bold shrink-0" style={{ color: 'var(--text-primary)' }}>
                        {entry.cashIn.toLocaleString()} <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>SAR</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            {cashBreakdownList.length > 0 && (
              <div
                className="px-5 py-3 flex items-center justify-between shrink-0"
                style={{ borderTop: '1px solid var(--border-main)', background: 'var(--bg-table-header)' }}
              >
                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Total</span>
                <span className="text-[14px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
                  {totalCashIn.toLocaleString()} <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>SAR</span>
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ title, value, subValue, subLabel, icon, onClick, clickHint }: { title: string; value: string; subValue?: string; subLabel?: string; icon?: React.ReactNode; onClick?: () => void; clickHint?: string }) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      className={`rounded-xl p-4 flex flex-col justify-between h-[90px] shadow-sm transition hover:shadow-md text-left w-full${
        onClick ? ' cursor-pointer hover:ring-2 hover:ring-emerald-500/30 active:scale-[0.98]' : ''
      }`}
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}
      onClick={onClick}
      title={clickHint}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>{title}</h3>
        {icon}
      </div>
      <div className="flex items-baseline justify-between mt-1">
        <span className="text-[24px] font-extrabold leading-none" style={{ color: 'var(--text-primary)' }}>{value}</span>
        <div className="flex items-center gap-2">
          {subValue && (
            <span className="text-[11px] font-medium text-[#0066FF] flex items-center gap-1">
              {subValue} <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{subLabel}</span>
            </span>
          )}
          {clickHint && (
            <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>▸ Details</span>
          )}
        </div>
      </div>
    </Wrapper>
  );
}
