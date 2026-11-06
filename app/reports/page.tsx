"use client";

import React, { useState, useMemo } from 'react';
import { useCRM, Conversation } from '../context/CRMContext';
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
  MessageSquare,
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

type BreakdownModalType = 'booked' | 'converted' | 'cash' | null;

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

function formatDayLabel(d: Date) {
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getDayStart(from: Date) {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getDayEnd(from: Date) {
  const d = new Date(from);
  d.setHours(23, 59, 59, 999);
  return d;
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

function getCreatedTime(c: Conversation): number {
  if (c.createdAt) {
    const t = new Date(c.createdAt).getTime();
    if (!isNaN(t)) return t;
  }
  return c.lastMessageAt || (c.updatedAt ? new Date(c.updatedAt).getTime() : 0);
}

function getUpdatedTime(c: Conversation): number {
  if (c.updatedAt) {
    const t = new Date(c.updatedAt).getTime();
    if (!isNaN(t)) return t;
  }
  return getCreatedTime(c);
}

function isBookedLead(c: Conversation): boolean {
  return ['Audition Booked', 'Attended', 'Enrolled'].includes(c.pipeline);
}

function isAttendedLead(c: Conversation): boolean {
  return ['Attended', 'Enrolled'].includes(c.pipeline);
}

function isConvertedLead(c: Conversation): boolean {
  return (
    c.pipeline === 'Enrolled' ||
    c.auditionOutcome === 'registered' ||
    (Number(c.cashIn) || 0) > 0
  );
}

function getBookedTime(c: Conversation): number | null {
  if (!isBookedLead(c)) return null;

  const explicit =
    c.auditionBookedAt ||
    (typeof c.source === 'object' && c.source?.auditionBookedAt ? c.source.auditionBookedAt : undefined);
  if (explicit) {
    const t = new Date(explicit).getTime();
    if (!isNaN(t)) return t;
  }

  if (c.pipeline === 'Audition Booked') {
    const upd = getUpdatedTime(c);
    // If an auditionDate is explicitly set in the past relative to updatedAt (e.g. a past audition was later viewed/read),
    // cap the booking timestamp at the end of auditionDate so past auditions do not appear booked after they occurred.
    if (c.auditionDate && /^\d{4}-\d{2}-\d{2}$/.test(c.auditionDate)) {
      const [y, m, d] = c.auditionDate.split('-').map(Number);
      if (y >= 2020) {
        const auditionDayEnd = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
        if (upd > auditionDayEnd) {
          return Math.min(getCreatedTime(c), auditionDayEnd);
        }
      }
    }
    return upd;
  }

  return getCreatedTime(c);
}

function getAttendedTime(c: Conversation): number | null {
  if (!isAttendedLead(c)) return null;

  const explicit =
    c.attendedAt ||
    (typeof c.source === 'object' && c.source?.attendedAt ? c.source.attendedAt : undefined);
  if (explicit) {
    const t = new Date(explicit).getTime();
    if (!isNaN(t)) return t;
  }

  if (c.auditionDate && /^\d{4}-\d{2}-\d{2}$/.test(c.auditionDate)) {
    const [y, m, d] = c.auditionDate.split('-').map(Number);
    if (y >= 2020) {
      return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
    }
  }

  return getUpdatedTime(c);
}

function getConvertedTime(c: Conversation): number | null {
  if (!isConvertedLead(c)) return null;

  const explicit =
    c.enrolledAt ||
    c.paidAt ||
    (typeof c.source === 'object' ? c.source?.enrolledAt || c.source?.paidAt : undefined);
  if (explicit) {
    const t = new Date(explicit).getTime();
    if (!isNaN(t)) return t;
  }

  return getUpdatedTime(c);
}

function getCampaignName(c: Conversation): string {
  if (typeof c.source === 'object' && c.source?.campaign) {
    return c.source.campaign;
  }
  if (typeof c.source === 'string' && c.source.trim() && c.source.trim() !== 'direct') {
    return c.source.trim();
  }
  return 'Organic / Direct';
}

function getDisplayName(c: Conversation): string {
  return c.leadName || c.profileName || c.name || c.phone || c.id;
}

export default function ReportsPage() {
  const { conversations, loading, openChat } = useCRM();
  const [activeModal, setActiveModal] = useState<BreakdownModalType>(null);

  // Filter state: 'all' | 'day' | 'week'
  const [filterMode, setFilterMode] = useState<'all' | 'day' | 'week'>('all');
  const [currentDate, setCurrentDate] = useState<Date>(() => getDayStart(new Date()));

  const todayStart = useMemo(() => getDayStart(new Date()), []);
  const yesterdayStart = useMemo(() => addDays(todayStart, -1), [todayStart]);
  const thisWeekStart = useMemo(() => getWeekStart(new Date()), []);
  const lastWeekStart = useMemo(() => addDays(thisWeekStart, -7), [thisWeekStart]);

  const dayStart = useMemo(() => getDayStart(currentDate), [currentDate]);
  const dayEnd = useMemo(() => getDayEnd(currentDate), [currentDate]);
  const weekStart = useMemo(() => getWeekStart(currentDate), [currentDate]);
  const weekEnd = useMemo(() => getWeekEnd(weekStart), [weekStart]);

  const isToday = filterMode === 'day' && dayStart.getTime() === todayStart.getTime();
  const isYesterday = filterMode === 'day' && dayStart.getTime() === yesterdayStart.getTime();
  const isThisWeek = filterMode === 'week' && weekStart.getTime() === thisWeekStart.getTime();
  const isLastWeek = filterMode === 'week' && weekStart.getTime() === lastWeekStart.getTime();

  const goAllTime = () => {
    setFilterMode('all');
  };

  const goToday = () => {
    setCurrentDate(todayStart);
    setFilterMode('day');
  };

  const goYesterday = () => {
    setCurrentDate(yesterdayStart);
    setFilterMode('day');
  };

  const goThisWeek = () => {
    setCurrentDate(thisWeekStart);
    setFilterMode('week');
  };

  const goLastWeek = () => {
    setCurrentDate(lastWeekStart);
    setFilterMode('week');
  };

  const stepPrev = () => {
    if (filterMode === 'day') {
      setCurrentDate(d => addDays(d, -1));
    } else {
      setCurrentDate(d => addDays(d, -7));
      setFilterMode('week');
    }
  };

  const stepNext = () => {
    if (filterMode === 'day') {
      setCurrentDate(d => addDays(d, 1));
    } else {
      setCurrentDate(d => addDays(d, 7));
      setFilterMode('week');
    }
  };

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
    bookedBreakdownList,
    convertedBreakdownList,
    cashBreakdownList,
  } = useMemo(() => {
    const startMs = filterMode === 'day' ? dayStart.getTime() : weekStart.getTime();
    const endMs = filterMode === 'day' ? dayEnd.getTime() : weekEnd.getTime();

    const inPeriod = (ts: number | null): boolean => {
      if (ts === null) return false;
      if (filterMode === 'all') return true;
      return ts >= startMs && ts <= endMs;
    };

    const leadsInPeriod = conversations.filter(c =>
      filterMode === 'all' ? true : inPeriod(getCreatedTime(c))
    );
    const bookedInPeriod = conversations.filter(c =>
      filterMode === 'all' ? isBookedLead(c) : inPeriod(getBookedTime(c))
    );
    const attendedInPeriod = conversations.filter(c =>
      filterMode === 'all' ? isAttendedLead(c) : inPeriod(getAttendedTime(c))
    );
    const convertedInPeriod = conversations.filter(c =>
      filterMode === 'all' ? isConvertedLead(c) : inPeriod(getConvertedTime(c))
    );
    const paidInPeriod = convertedInPeriod.filter(c => (Number(c.cashIn) || 0) > 0);

    const total = leadsInPeriod.length;
    const booked = bookedInPeriod.length;
    const att = attendedInPeriod.length;
    const enr = convertedInPeriod.length;
    const totalCash = paidInPeriod.reduce((acc, c) => acc + (Number(c.cashIn) || 0), 0);

    const bPct = total > 0 ? `${Math.round((booked / total) * 100)}%` : '0%';
    const aPct = booked > 0 ? `${Math.round((att / booked) * 100)}%` : '0%';
    const ePct = total > 0 ? `${Math.round((enr / total) * 100)}%` : '0%';
    const avgCash = enr > 0 ? Math.round(totalCash / enr) : 0;

    // 1. Auditions Booked breakdown list
    const bookedList = bookedInPeriod
      .map(c => ({
        id: c.id,
        name: getDisplayName(c),
        phone: c.phone || '',
        pipeline: c.pipeline,
        auditionDate: c.auditionDate || c.followUpDate || '',
        branch: c.branch || '',
        agent: c.agent || 'Unassigned',
        campaign: getCampaignName(c),
        bookedAt: getBookedTime(c) || 0,
      }))
      .sort((a, b) => b.bookedAt - a.bookedAt);

    // 2. Converted (Enrolled / Paid) breakdown list
    const convertedList = convertedInPeriod
      .map(c => ({
        id: c.id,
        name: getDisplayName(c),
        phone: c.phone || '',
        pipeline: c.pipeline,
        auditionOutcome: c.auditionOutcome || '',
        agent: c.agent || 'Unassigned',
        campaign: getCampaignName(c),
        cashIn: Number(c.cashIn) || 0,
        convertedAt: getConvertedTime(c) || 0,
      }))
      .sort((a, b) => b.cashIn - a.cashIn || b.convertedAt - a.convertedAt);

    // 3. Cash In breakdown list (who paid and how much)
    const cashList = paidInPeriod
      .map(c => ({
        id: c.id,
        name: getDisplayName(c),
        phone: c.phone || '',
        pipeline: c.pipeline,
        agent: c.agent || 'Unassigned',
        campaign: getCampaignName(c),
        cashIn: Number(c.cashIn) || 0,
      }))
      .sort((a, b) => b.cashIn - a.cashIn);

    // Aggregate by campaign across the selected period
    const campaignMap: Record<string, CampaignStats> = {};
    const ensureCampaign = (campName: string): CampaignStats => {
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
      return campaignMap[campName];
    };

    leadsInPeriod.forEach(c => {
      const entry = ensureCampaign(getCampaignName(c));
      entry.leads += 1;
      if (c.pipeline === 'Lost' || c.pipeline === 'Unqualified') {
        entry.unqualified += 1;
      }
    });

    bookedInPeriod.forEach(c => {
      const entry = ensureCampaign(getCampaignName(c));
      entry.booked += 1;
    });

    attendedInPeriod.forEach(c => {
      const entry = ensureCampaign(getCampaignName(c));
      entry.attended += 1;
    });

    convertedInPeriod.forEach(c => {
      const entry = ensureCampaign(getCampaignName(c));
      entry.enrolled += 1;
      entry.cashIn += Number(c.cashIn) || 0;
    });

    const rows = Object.values(campaignMap).sort(
      (a, b) => b.leads - a.leads || b.enrolled - a.enrolled || b.booked - a.booked
    );

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
      bookedBreakdownList: bookedList,
      convertedBreakdownList: convertedList,
      cashBreakdownList: cashList,
    };
  }, [conversations, filterMode, dayStart, dayEnd, weekStart, weekEnd]);

  const periodBadgeLabel = useMemo(() => {
    if (filterMode === 'day') {
      if (isToday) return 'Today';
      if (isYesterday) return 'Yesterday';
      return 'Daily View';
    }
    if (filterMode === 'week') {
      if (isThisWeek) return 'This Week';
      if (isLastWeek) return 'Last Week';
      return 'Weekly View';
    }
    return null;
  }, [filterMode, isToday, isYesterday, isThisWeek, isLastWeek]);

  const periodDescription = useMemo(() => {
    if (filterMode === 'day') {
      const prefix = isToday ? 'Today · ' : isYesterday ? 'Yesterday · ' : '';
      return `${prefix}${formatDayLabel(dayStart)}`;
    }
    if (filterMode === 'week') {
      return formatRangeLabel(weekStart, weekEnd);
    }
    return 'All Time';
  }, [filterMode, isToday, isYesterday, dayStart, weekStart, weekEnd]);

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
            {periodBadgeLabel && (
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ background: 'var(--bg-selected)', color: '#0066FF' }}
              >
                {periodBadgeLabel}
              </span>
            )}
          </div>
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {filterMode !== 'all' ? (
              <>
                Conversion metrics for <strong style={{ color: 'var(--text-primary)' }}>{periodDescription}</strong> ({totalLeads} new lead{totalLeads !== 1 ? 's' : ''} · {auditionsBooked} booked · {enrolled} converted)
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
          <div className="flex items-center gap-1 p-0.5 rounded-[8px] flex-wrap" style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)' }}>
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
              onClick={goToday}
              className="h-[24px] px-2.5 text-[11px] font-semibold rounded-[6px] transition-colors cursor-pointer"
              style={isToday
                ? { background: '#0066FF', color: '#fff' }
                : { background: 'transparent', color: 'var(--text-secondary)' }
              }
            >
              Today
            </button>
            <button
              onClick={goYesterday}
              className="h-[24px] px-2.5 text-[11px] font-semibold rounded-[6px] transition-colors cursor-pointer"
              style={isYesterday
                ? { background: '#0066FF', color: '#fff' }
                : { background: 'transparent', color: 'var(--text-secondary)' }
              }
            >
              Yesterday
            </button>
            <button
              onClick={goThisWeek}
              className="h-[24px] px-2.5 text-[11px] font-semibold rounded-[6px] transition-colors cursor-pointer"
              style={isThisWeek
                ? { background: '#0066FF', color: '#fff' }
                : { background: 'transparent', color: 'var(--text-secondary)' }
              }
            >
              This Week
            </button>
            <button
              onClick={goLastWeek}
              className="h-[24px] px-2.5 text-[11px] font-semibold rounded-[6px] transition-colors cursor-pointer"
              style={isLastWeek
                ? { background: '#0066FF', color: '#fff' }
                : { background: 'transparent', color: 'var(--text-secondary)' }
              }
            >
              Last Week
            </button>
          </div>

          {/* Day / Week Stepper & Date Picker */}
          {filterMode !== 'all' && (
            <div className="flex items-center gap-1">
              <button
                onClick={stepPrev}
                className="h-[28px] w-[28px] flex items-center justify-center rounded-[6px] transition-colors cursor-pointer hover:opacity-80"
                style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)', color: 'var(--text-secondary)' }}
                title={filterMode === 'day' ? 'Previous Day' : 'Previous Week'}
                aria-label={filterMode === 'day' ? 'Previous Day' : 'Previous Week'}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div
                className="h-[28px] px-2.5 flex items-center gap-1.5 text-[11px] font-medium rounded-[6px]"
                style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}
                title={periodDescription}
              >
                <Calendar className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span className="whitespace-nowrap">
                  {filterMode === 'day' ? formatDayLabel(dayStart) : formatRangeLabel(weekStart, weekEnd)}
                </span>
              </div>

              <button
                onClick={stepNext}
                className="h-[28px] w-[28px] flex items-center justify-center rounded-[6px] transition-colors cursor-pointer hover:opacity-80"
                style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)', color: 'var(--text-secondary)' }}
                title={filterMode === 'day' ? 'Next Day' : 'Next Week'}
                aria-label={filterMode === 'day' ? 'Next Day' : 'Next Week'}
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
                  }
                }}
                className="h-[28px] text-[11px] font-medium rounded-[6px] px-2 outline-none cursor-pointer transition-colors"
                style={{
                  background: 'var(--bg-pill)',
                  border: '1px solid var(--border-input)',
                  color: 'var(--text-primary)',
                }}
                title={filterMode === 'day' ? 'Select date' : 'Select date to jump to week'}
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
            onClick={() => setActiveModal('booked')}
            clickHint="View booked"
          />
          <KpiCard
            title="Attended"
            value={attended.toString()}
            subValue={attendedPct}
            subLabel="show rate"
            icon={<TrendingUp className="w-4 h-4 text-cyan-500" />}
          />
          <KpiCard
            title="Converted (Paid)"
            value={enrolled.toString()}
            subValue={enrolledPct}
            subLabel="conversion"
            icon={<Award className="w-4 h-4 text-purple-500" />}
            onClick={() => setActiveModal('converted')}
            clickHint="View converted"
          />
          <KpiCard
            title="Total Cash In"
            value={totalCashIn.toLocaleString()}
            subValue={avgCashPerEnrolled > 0 ? avgCashPerEnrolled.toLocaleString() : undefined}
            subLabel={avgCashPerEnrolled > 0 ? "avg / converted" : undefined}
            icon={<Banknote className="w-4 h-4 text-emerald-500" />}
            onClick={() => setActiveModal('cash')}
            clickHint="View breakdown"
          />
        </div>

        {/* Campaign Breakdown Table */}
        <div className="rounded-xl overflow-hidden shadow-sm mb-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}>
          <div className="overflow-x-auto w-full" style={{ WebkitOverflowScrolling: 'touch' }}>
            {campaignRows.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-[13px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                  {loading
                    ? "Calculating metrics..."
                    : filterMode !== 'all'
                      ? `No conversation campaign data recorded for ${periodDescription}.`
                      : "No conversation campaign data recorded yet."}
                </p>
                {!loading && filterMode !== 'all' && (
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
                    <th className="py-2.5 px-4 text-right">Converted</th>
                    <th className="py-2.5 px-4 text-right">Cash In</th>
                    <th className="py-2.5 px-4 text-right">Lead → Conv</th>
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

      {/* Auditions Booked Breakdown Modal */}
      {activeModal === 'booked' && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          onClick={() => setActiveModal(null)}
        >
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.35)' }} />
          <div
            className="relative w-full sm:max-w-[560px] max-h-[85vh] flex flex-col rounded-t-2xl sm:rounded-xl overflow-hidden"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)', boxShadow: 'var(--shadow-card)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 flex items-center justify-between shrink-0" style={{ borderBottom: '1px solid var(--border-main)' }}>
              <div>
                <h2 className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>Auditions Booked</h2>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  {bookedBreakdownList.length} audition{bookedBreakdownList.length !== 1 ? 's' : ''} booked · <strong style={{ color: 'var(--text-primary)' }}>{periodDescription}</strong>
                </p>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="h-7 w-7 flex items-center justify-center rounded-md transition-colors cursor-pointer"
                style={{ background: 'var(--bg-pill)', color: 'var(--text-secondary)', border: '1px solid var(--border-input)' }}
                aria-label="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
              {bookedBreakdownList.length === 0 ? (
                <div className="p-8 text-center">
                  <CalendarCheck className="w-7 h-7 mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
                  <p className="text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                    No auditions booked for {periodDescription}
                  </p>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: 'var(--border-main)' }}>
                  {bookedBreakdownList.map((entry, idx) => (
                    <div
                      key={`${entry.id}-${idx}`}
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
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {entry.phone && (
                              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{entry.phone}</span>
                            )}
                            <span
                              className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                              style={{ background: 'var(--bg-selected)', color: '#0066FF' }}
                            >
                              {entry.pipeline}
                            </span>
                            {entry.auditionDate && (
                              <span className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                                Audition: {entry.auditionDate}
                              </span>
                            )}
                            {entry.branch && (
                              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                · {entry.branch}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveModal(null);
                          openChat(entry.id);
                        }}
                        className="h-7 px-2.5 rounded-md text-[11px] font-semibold flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                        style={{ background: 'var(--bg-pill)', color: '#0066FF', border: '1px solid var(--border-input)' }}
                      >
                        <MessageSquare className="w-3 h-3" />
                        Chat
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Converted (Paid / Enrolled) Breakdown Modal */}
      {activeModal === 'converted' && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          onClick={() => setActiveModal(null)}
        >
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.35)' }} />
          <div
            className="relative w-full sm:max-w-[560px] max-h-[85vh] flex flex-col rounded-t-2xl sm:rounded-xl overflow-hidden"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)', boxShadow: 'var(--shadow-card)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 flex items-center justify-between shrink-0" style={{ borderBottom: '1px solid var(--border-main)' }}>
              <div>
                <h2 className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>Converted (Paid) Leads</h2>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  {convertedBreakdownList.length} converted student{convertedBreakdownList.length !== 1 ? 's' : ''} · Total Cash: <strong style={{ color: 'var(--text-primary)' }}>{totalCashIn.toLocaleString()} SAR</strong> ({periodDescription})
                </p>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="h-7 w-7 flex items-center justify-center rounded-md transition-colors cursor-pointer"
                style={{ background: 'var(--bg-pill)', color: 'var(--text-secondary)', border: '1px solid var(--border-input)' }}
                aria-label="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
              {convertedBreakdownList.length === 0 ? (
                <div className="p-8 text-center">
                  <Award className="w-7 h-7 mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
                  <p className="text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                    No converted leads recorded for {periodDescription}
                  </p>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: 'var(--border-main)' }}>
                  {convertedBreakdownList.map((entry, idx) => (
                    <div
                      key={`${entry.id}-${idx}`}
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
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {entry.phone && (
                              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{entry.phone}</span>
                            )}
                            <span
                              className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                              style={{ background: 'var(--bg-selected)', color: '#0066FF' }}
                            >
                              {entry.pipeline === 'Enrolled' ? 'Enrolled' : 'Paid'}
                            </span>
                            <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                              {entry.campaign}
                            </span>
                            {entry.agent && entry.agent !== 'Unassigned' && (
                              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                · {entry.agent}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5 shrink-0">
                        {entry.cashIn > 0 && (
                          <span className="text-[12px] font-bold" style={{ color: 'var(--text-primary)' }}>
                            {entry.cashIn.toLocaleString()} <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>SAR</span>
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setActiveModal(null);
                            openChat(entry.id);
                          }}
                          className="h-7 px-2.5 rounded-md text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                          style={{ background: 'var(--bg-pill)', color: '#0066FF', border: '1px solid var(--border-input)' }}
                        >
                          <MessageSquare className="w-3 h-3" />
                          Chat
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cash Breakdown Modal */}
      {activeModal === 'cash' && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          onClick={() => setActiveModal(null)}
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
                  {cashBreakdownList.length} payment{cashBreakdownList.length !== 1 ? 's' : ''} · Total: <strong style={{ color: 'var(--text-primary)' }}>{totalCashIn.toLocaleString()} SAR</strong> ({periodDescription})
                </p>
              </div>
              <button
                onClick={() => setActiveModal(null)}
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
                  <p className="text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>No payments recorded for {periodDescription}</p>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: 'var(--border-main)' }}>
                  {cashBreakdownList.map((entry, idx) => (
                    <div
                      key={`${entry.id}-${idx}`}
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
