"use client";

import React, { useState, useMemo, useCallback, useRef, useEffect, useSyncExternalStore, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useCRM } from '../context/CRMContext';
import { useAuth } from '../components/AuthProvider';
import { MessageSquare, Calendar, ChevronLeft, ChevronRight, X, MapPin, ChevronDown, Search, Lock, Unlock, User, Clock, Check, ArrowLeft } from 'lucide-react';
import { useBranches, LegacyBranchGroup } from '../lib/branches';
import { BranchSelect } from '../components/BranchSelect';
import { getTeamReturnBannerInfo, navigateBackToTeamActivities } from '../utils/teamAuditNav';

type AuditionOutcome = 'registered' | 'schedule-followup' | 'paid-trial' | 'joining-later' | 'no-show';
type SlotStatus = AuditionOutcome | 'booked' | 'closed';
type AuditionStatus = SlotStatus | 'free' | 'closed';

type Slot = {
  id: string | number;
  conversationId?: string;
  time: string;
  name?: string;
  type?: string;
  status: AuditionStatus;
  agent?: string;
  comment?: string;
  phone?: string;
  branch?: string;
  auditionDate?: string;
  followUpDate?: string;
  dateKey?: string;
};

type DaySlots = { [dateKey: string]: Slot[] };
type CalendarViewMode = 'month' | 'week';

const WEEKDAY_HEADERS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;

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
  const diff = day === 6 ? 0 : day + 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function getMonthGridWeeks(anchor: Date): Date[][] {
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const lastOfMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  lastOfMonth.setHours(23, 59, 59, 999);
  const weeks: Date[][] = [];
  let curWeekStart = getWeekStart(firstOfMonth);
  while (curWeekStart <= lastOfMonth) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(curWeekStart, i)));
    curWeekStart = addDays(curWeekStart, 7);
  }
  return weeks;
}
function getMonthDays(anchor: Date): Date[] {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const totalDays = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: totalDays }, (_, i) => new Date(year, month, i + 1));
}
function orderDaySlots(daySlots: Slot[]): Slot[] {
  const bookedSlots = daySlots.filter(s => s.status === 'booked');
  const followUpSlots = daySlots.filter(s => s.status === 'schedule-followup');
  const joiningSlots = daySlots.filter(s => s.status === 'joining-later');
  const paidTrialSlots = daySlots.filter(s => s.status === 'paid-trial');
  const noShowSlots = daySlots.filter(s => s.status === 'no-show');
  const registeredSlots = daySlots.filter(s => s.status === 'registered');
  const closedSlotsList = daySlots.filter(s => s.status === 'closed');
  const freeSlots = daySlots.filter(s => s.status === 'free');
  return [
    ...bookedSlots,
    ...followUpSlots,
    ...joiningSlots,
    ...paidTrialSlots,
    ...noShowSlots,
    ...registeredSlots,
    ...closedSlotsList,
    ...freeSlots,
  ];
}
function formatDayLabel(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime12(time: string): string {
  if (!time) return '05:00 PM';
  if (/\b(?:AM|PM)\b/i.test(time)) return time;
  const parts = time.split(':');
  if (parts.length < 2) return time;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return time;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12 < 10 ? '0' : ''}${hour12}:${m < 10 ? '0' : ''}${m} ${period}`;
}

function parseOverride(val: any): SlotStatus | null {
  if (!val) return null;
  if (typeof val === 'string') {
    // New 5 outcomes + closed
    if (val === 'registered' || val === 'schedule-followup' || val === 'paid-trial' || val === 'joining-later' || val === 'no-show' || val === 'booked' || val === 'closed') return val as SlotStatus;
    // Legacy mappings
    if (val === 'attended' || val === 'confirmed') return 'schedule-followup';
    if (val === 'declined') return 'no-show';
    if (val === 'no-response') return 'booked';
    if (val === 'enrolled') return 'registered';
  }
  if (typeof val === 'object' && val.status) {
    return parseOverride(val.status);
  }
  return null;
}

function stripNoResponseTag(text?: string | null): string {
  if (!text) return '';
  return text
    .replace(/\[no[- ]?response\]/gi, '')
    .replace(/\[no[- ]?show\]/gi, '')
    .trim();
}

export const BRANCH_GROUPS = [
  {
    region: 'Riyadh',
    branches: [
      'Alreem Compound (Riyadh)',
      'Azure Hittin Compound (Riyadh)',
      'Ishbiliyah Compound (Riyadh)',
      'Lapalma Compound (Riyadh)',
      'Lamara Compound (Riyadh)',
      'Marvella Compound (Riyadh)',
      'Mohaya Compound (Riyadh)',
      'Riyadh Park Mall (Riyadh)',
    ],
  },
  {
    region: 'Jeddah',
    branches: [
      'Initiative Hub (Jeddah)',
    ],
  },
  {
    region: 'Khobar',
    branches: [
      'Ajdan Walk (Khobar)',
    ],
  },
  {
    region: 'Other',
    branches: [
      'Dumai Mall',
      'Online',
    ],
  },
];

function matchesBranch(slotBranch: string | undefined, filter: string): boolean {
  if (!filter || filter === 'ALL') return true;
  const b = (slotBranch || '').toLowerCase().trim();
  if (!b) return false;

  if (filter.startsWith('REGION:')) {
    const region = filter.replace('REGION:', '').toLowerCase();
    if (region === 'other') {
      return (
        b.includes('dumai') ||
        b.includes('online') ||
        (!b.includes('riyadh') && !b.includes('jeddah') && !b.includes('khobar'))
      );
    }
    return b.includes(region);
  }

  const target = filter.toLowerCase().trim();
  if (b === target) return true;
  const cleanTarget = target.replace(/\s*\([^)]*\)/g, '').trim();
  const cleanB = b.replace(/\s*\([^)]*\)/g, '').trim();
  if (cleanTarget && cleanB && (cleanB.includes(cleanTarget) || cleanTarget.includes(cleanB))) {
    return true;
  }
  return false;
}

function getBranchDisplayLabel(b: string): string {
  if (!b || b === 'ALL') return 'All Branches';
  if (b.startsWith('REGION:')) {
    return `${b.replace('REGION:', '')} (All)`;
  }
  return b.replace(/\s*\([^)]*\)/g, '').trim() || b;
}

function matchesAgent(slotAgent: string | undefined, filter: string, currentUserName?: string): boolean {
  if (!filter || filter === 'ALL') return true;
  const clean = (slotAgent || '').trim();
  const isUnassigned = !clean || clean.toLowerCase() === 'unassigned';
  if (filter === 'UNASSIGNED') return isUnassigned;
  if (filter === 'MINE') {
    if (!currentUserName) return false;
    return !isUnassigned && clean.toLowerCase() === currentUserName.trim().toLowerCase();
  }
  return !isUnassigned && clean.toLowerCase() === filter.trim().toLowerCase();
}

function getAgentDisplayLabel(filter: string): string {
  if (!filter || filter === 'ALL') return 'All Users';
  if (filter === 'MINE') return 'My Auditions';
  if (filter === 'UNASSIGNED') return 'Unassigned';
  return filter;
}

function getConvDate(c: any, todayIso: string): string {
  // 1. Explicit dedicated audition date (set when audition is booked)
  if (c.auditionDate && /^\d{4}-\d{2}-\d{2}$/.test(c.auditionDate)) {
    return c.auditionDate;
  }
  // 2. Follow-up date set during audition booking
  if (c.followUpDate && /^\d{4}-\d{2}-\d{2}$/.test(c.followUpDate)) {
    return c.followUpDate;
  }
  // 3. Fallback to creation date (when the lead entered) - NEVER updatedAt,
  // because updatedAt changes whenever status (e.g. no-show, attended) or notes are edited!
  if (c.createdAt) {
    try {
      const d = isoDate(new Date(c.createdAt));
      if (d && d !== 'NaN-NaN-NaN') return d;
    } catch { }
  }
  return todayIso;
}

function getConvTime(c: any): string {
  const text = `${c.followUpNote || ''} ${c.notes || ''}`;
  const match = text.match(/\b(0?[1-9]|1[0-2]):[0-5][0-9]\s*(?:AM|PM|am|pm)\b/i);
  if (match) return match[0].toUpperCase();
  const match24 = text.match(/\b([01]?[0-9]|2[0-3]):[0-5][0-9]\b/);
  if (match24) {
    const [h, m] = match24[0].split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12 < 10 ? '0' : ''}${hour12}:${m < 10 ? '0' : ''}${m} ${period}`;
  }
  if (c.lastMessageAt) {
    try {
      return new Date(c.lastMessageAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } catch { }
  }
  return '05:00 PM';
}

type BookingModal = { slotId: string | number; dateKey: string; time: string; dayLabel: string } | null;
type SlotPanelState = { slotId: string | number; dateKey: string } | null;

const OUTCOME_CONFIG: Record<AuditionOutcome, {
  label: string;
  subtitle: string;
  badge: string;
  icon: string;
  color: string;
  bg: string;
  border: string;
}> = {
  'registered': {
    label: 'Registered',
    subtitle: 'Enrolled student',
    badge: 'Registered',
    icon: '✓',
    color: '#10B981',
    bg: 'rgba(16,185,129,0.12)',
    border: 'rgba(16,185,129,0.3)',
  },
  'schedule-followup': {
    label: 'Schedule Follow up',
    subtitle: 'Attended · needs schedule to complete enrollment',
    badge: 'Follow-up',
    icon: '📅',
    color: '#0066FF',
    bg: 'rgba(0,102,255,0.1)',
    border: 'rgba(0,102,255,0.3)',
  },
  'paid-trial': {
    label: 'Paid Trial',
    subtitle: 'Paid trial session completed',
    badge: 'Paid Trial',
    icon: '💳',
    color: '#8B5CF6',
    bg: 'rgba(139,92,246,0.12)',
    border: 'rgba(139,92,246,0.3)',
  },
  'joining-later': {
    label: 'Joining Later',
    subtitle: 'Add to follow up',
    badge: 'Joining Later',
    icon: '⏳',
    color: '#F59E0B',
    bg: 'rgba(245,158,11,0.12)',
    border: 'rgba(245,158,11,0.3)',
  },
  'no-show': {
    label: 'No show',
    subtitle: 'Did not attend audition',
    badge: 'No-Show',
    icon: '✕',
    color: '#EF4444',
    bg: 'rgba(239,68,68,0.12)',
    border: 'rgba(239,68,68,0.3)',
  },
};

const AUDITION_OUTCOMES: AuditionOutcome[] = ['registered', 'schedule-followup', 'paid-trial', 'joining-later', 'no-show'];

function getOutcomePipeline(outcome: SlotStatus): string {
  switch (outcome) {
    case 'registered': return 'Enrolled';
    case 'schedule-followup': return 'Attended';
    case 'paid-trial': return 'Attended';
    case 'joining-later': return 'Joining Later';
    case 'no-show': return 'Lost';
    default: return 'Audition Booked';
  }
}

function needsFollowUp(outcome: SlotStatus): boolean {
  return outcome === 'schedule-followup' || outcome === 'joining-later';
}

function getDefaultFollowUpDate(outcome: SlotStatus): string {
  const d = new Date();
  if (outcome === 'schedule-followup') {
    d.setDate(d.getDate() + 1);
  } else {
    d.setDate(d.getDate() + 14);
  }
  return isoDate(d);
}

function BranchFilterPopover({
  selectedBranch,
  onSelectBranch,
  branchCounts,
  branchGroups = BRANCH_GROUPS,
}: {
  selectedBranch: string;
  onSelectBranch: (branch: string) => void;
  branchCounts: Record<string, number>;
  branchGroups?: LegacyBranchGroup[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const isFiltered = selectedBranch && selectedBranch !== 'ALL';
  const displayLabel = getBranchDisplayLabel(selectedBranch);
  const totalAuditions = branchCounts[selectedBranch] ?? branchCounts.ALL ?? 0;

  // Filter branches based on search input
  const q = search.toLowerCase().trim();
  const filteredGroups = useMemo(() => {
    if (!q) return branchGroups;
    return branchGroups.map(g => {
      const matchRegion = g.region.toLowerCase().includes(q);
      const filteredBranches = g.branches.filter(b => b.toLowerCase().includes(q));
      if (matchRegion) return g;
      if (filteredBranches.length > 0) return { ...g, branches: filteredBranches };
      return null;
    }).filter(Boolean) as LegacyBranchGroup[];
  }, [q, branchGroups]);

  return (
    <div className="relative inline-block" ref={popoverRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="h-[28px] px-2.5 text-[11px] font-medium rounded-[6px] flex items-center gap-1.5 transition-colors cursor-pointer select-none hover:opacity-80"
        style={{
          background: 'var(--bg-pill)',
          border: '1px solid var(--border-input)',
          color: 'var(--text-primary)',
        }}
        title="Filter by branch"
      >
        <span className="truncate max-w-[150px] font-medium">
          {displayLabel}
        </span>
        {isFiltered && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onSelectBranch('ALL');
            }}
            className="hover:text-red-500 font-bold ml-0.5 text-[10px] leading-none"
            style={{ color: 'var(--text-secondary)' }}
            title="Reset to All"
          >
            ✕
          </span>
        )}
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-200 shrink-0 ${
            open ? 'rotate-180' : ''
          }`}
          style={{ color: 'var(--text-secondary)' }}
        />
      </button>

      {/* Popover Menu (opens inward from right) */}
      {open && (
        <div
          className="absolute right-0 top-[calc(100%+4px)] z-50 w-[310px] rounded-2xl shadow-2xl p-2.5 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-150"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-main)',
            backdropFilter: 'blur(16px)',
          }}
        >
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search branch or city…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full h-[32px] pl-8 pr-7 text-[12px] rounded-xl outline-none"
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-input)',
                color: 'var(--text-primary)',
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs p-0.5"
              >
                ✕
              </button>
            )}
          </div>

          {/* Branch list */}
          <div className="flex flex-col gap-1 max-h-[340px] overflow-y-auto pr-0.5" style={{ scrollbarWidth: 'thin' }}>
            {/* "All Branches" Option */}
            {(!q || 'all branches'.includes(q)) && (
              <button
                type="button"
                onClick={() => {
                  onSelectBranch('ALL');
                  setOpen(false);
                }}
                className={`w-full px-2.5 py-2 rounded-xl text-left text-[12px] flex items-center justify-between transition-colors cursor-pointer ${
                  selectedBranch === 'ALL'
                    ? 'bg-[#0066FF] text-white font-bold shadow-sm'
                    : 'hover:bg-[var(--bg-pill)] text-[var(--text-primary)] font-medium'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[13px]">🏢</span>
                  <span>All Branches</span>
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    selectedBranch === 'ALL'
                      ? 'bg-white/20 text-white'
                      : 'text-[var(--text-muted)] bg-[var(--bg-pill)]'
                  }`}
                >
                  {branchCounts.ALL || 0}
                </span>
              </button>
            )}

            <div className="h-[1px] my-1" style={{ background: 'var(--border-sidebar)' }} />

            {/* Regions & Specific Branches */}
            {filteredGroups.map(group => {
              const regionKey = `REGION:${group.region}`;
              const isRegionActive = selectedBranch === regionKey;
              const regionCount = branchCounts[regionKey] || 0;

              return (
                <div key={group.region} className="flex flex-col gap-0.5 mb-1.5">
                  {/* Region Header with Rollup Selection */}
                  <div className="flex items-center justify-between px-2 py-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                      {group.region}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectBranch(regionKey);
                        setOpen(false);
                      }}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                        isRegionActive
                          ? 'bg-[#0066FF] text-white'
                          : 'text-[#0066FF] hover:bg-[#0066FF]/10'
                      }`}
                      title={`Filter by all ${group.region} branches`}
                    >
                      All in {group.region} ({regionCount})
                    </button>
                  </div>

                  {/* Branches in Region */}
                  {group.branches.map(branch => {
                    const isBranchActive = selectedBranch === branch;
                    const count = branchCounts[branch] || 0;
                    const cleanName = branch.replace(/\s*\([^)]*\)/g, '').trim();

                    return (
                      <button
                        key={branch}
                        type="button"
                        onClick={() => {
                          onSelectBranch(branch);
                          setOpen(false);
                        }}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-left text-[11px] flex items-center justify-between transition-colors cursor-pointer pl-4 ${
                          isBranchActive
                            ? 'bg-[#0066FF] text-white font-bold'
                            : 'hover:bg-[var(--bg-pill)] text-[var(--text-primary)] font-medium'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              isBranchActive ? 'bg-white' : count > 0 ? 'bg-[#34C759]' : 'bg-gray-300'
                            }`}
                          />
                          <span className="truncate">{cleanName}</span>
                        </div>
                        <span
                          className={`text-[9.5px] px-1.5 py-0.2 rounded font-bold shrink-0 ml-2 ${
                            isBranchActive
                              ? 'bg-white/20 text-white'
                              : count > 0
                              ? 'text-[#0066FF] bg-[#0066FF]/10'
                              : 'text-gray-400'
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}

            {filteredGroups.length === 0 && (
              <div className="py-4 text-center text-[11px] text-gray-400">
                No matching branches found
              </div>
            )}
          </div>

          {/* Bottom Bar: Clear / Info */}
          {isFiltered && (
            <div className="pt-1.5 border-t flex items-center justify-between" style={{ borderColor: 'var(--border-input)' }}>
              <span className="text-[10px] text-gray-400 truncate">
                Active: <b className="text-[var(--text-primary)]">{displayLabel}</b>
              </span>
              <button
                type="button"
                onClick={() => {
                  onSelectBranch('ALL');
                  setOpen(false);
                }}
                className="text-[10px] text-[#0066FF] font-semibold hover:underline cursor-pointer"
              >
                Reset to All
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AgentFilterPopover({
  selectedAgent,
  onSelectAgent,
  agentOptions,
  agentCounts,
  currentUserName,
}: {
  selectedAgent: string;
  onSelectAgent: (agent: string) => void;
  agentOptions: string[];
  agentCounts: Record<string, number>;
  currentUserName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const isFiltered = Boolean(selectedAgent && selectedAgent !== 'ALL');
  const displayLabel = getAgentDisplayLabel(selectedAgent);
  const q = search.toLowerCase().trim();

  const filteredAgents = useMemo(() => {
    if (!q) return agentOptions;
    return agentOptions.filter(name => name.toLowerCase().includes(q));
  }, [q, agentOptions]);

  const showAllOption = !q || 'all users'.includes(q) || 'all agents'.includes(q);
  const showMineOption =
    Boolean(currentUserName) &&
    (!q || 'my auditions'.includes(q) || 'mine'.includes(q) || currentUserName!.toLowerCase().includes(q));
  const showUnassignedOption = !q || 'unassigned'.includes(q);

  return (
    <div className="relative inline-block" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="h-[28px] px-2.5 text-[11px] font-medium rounded-[6px] flex items-center gap-1.5 transition-colors cursor-pointer select-none hover:opacity-80"
        style={{
          background: 'var(--bg-pill)',
          border: '1px solid var(--border-input)',
          color: 'var(--text-primary)',
        }}
        title="Filter by user"
        aria-label="Filter by user"
      >
        <User className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-secondary)' }} />
        <span className="truncate max-w-[140px] font-medium">
          {displayLabel}
        </span>
        {isFiltered && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onSelectAgent('ALL');
            }}
            className="hover:text-red-500 font-bold ml-0.5 text-[10px] leading-none"
            style={{ color: 'var(--text-secondary)' }}
            title="Reset to All Users"
          >
            ✕
          </span>
        )}
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-200 shrink-0 ${
            open ? 'rotate-180' : ''
          }`}
          style={{ color: 'var(--text-secondary)' }}
        />
      </button>

      {open && (
        <div
          className="absolute right-0 top-[calc(100%+4px)] z-50 w-[270px] max-w-[calc(100vw-2rem)] rounded-2xl shadow-2xl p-2.5 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-150"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-main)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search user…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full h-[32px] pl-8 pr-7 text-[12px] rounded-xl outline-none"
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-input)',
                color: 'var(--text-primary)',
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs p-0.5"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex flex-col gap-1 max-h-[320px] overflow-y-auto pr-0.5" style={{ scrollbarWidth: 'thin' }}>
            {showAllOption && (
              <button
                type="button"
                onClick={() => {
                  onSelectAgent('ALL');
                  setOpen(false);
                }}
                className={`w-full px-2.5 py-2 rounded-xl text-left text-[12px] flex items-center justify-between transition-colors cursor-pointer ${
                  selectedAgent === 'ALL'
                    ? 'bg-[#0066FF] text-white font-bold shadow-sm'
                    : 'hover:bg-[var(--bg-pill)] text-[var(--text-primary)] font-medium'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <User className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">All Users</span>
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${
                    selectedAgent === 'ALL'
                      ? 'bg-white/20 text-white'
                      : 'text-[var(--text-muted)] bg-[var(--bg-pill)]'
                  }`}
                >
                  {agentCounts.ALL || 0}
                </span>
              </button>
            )}

            {showMineOption && (
              <button
                type="button"
                onClick={() => {
                  onSelectAgent('MINE');
                  setOpen(false);
                }}
                className={`w-full px-2.5 py-1.5 rounded-lg text-left text-[11px] flex items-center justify-between transition-colors cursor-pointer ${
                  selectedAgent === 'MINE'
                    ? 'bg-[#0066FF] text-white font-bold'
                    : 'hover:bg-[var(--bg-pill)] text-[var(--text-primary)] font-medium'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      selectedAgent === 'MINE'
                        ? 'bg-white'
                        : (agentCounts.MINE || 0) > 0
                        ? 'bg-[#34C759]'
                        : 'bg-gray-300'
                    }`}
                  />
                  <span className="truncate">My Auditions ({currentUserName})</span>
                </div>
                <span
                  className={`text-[9.5px] px-1.5 py-0.2 rounded font-bold shrink-0 ml-2 ${
                    selectedAgent === 'MINE'
                      ? 'bg-white/20 text-white'
                      : (agentCounts.MINE || 0) > 0
                      ? 'text-[#0066FF] bg-[#0066FF]/10'
                      : 'text-gray-400'
                  }`}
                >
                  {agentCounts.MINE || 0}
                </span>
              </button>
            )}

            {showUnassignedOption && (
              <button
                type="button"
                onClick={() => {
                  onSelectAgent('UNASSIGNED');
                  setOpen(false);
                }}
                className={`w-full px-2.5 py-1.5 rounded-lg text-left text-[11px] flex items-center justify-between transition-colors cursor-pointer ${
                  selectedAgent === 'UNASSIGNED'
                    ? 'bg-[#0066FF] text-white font-bold'
                    : 'hover:bg-[var(--bg-pill)] text-[var(--text-primary)] font-medium'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      selectedAgent === 'UNASSIGNED'
                        ? 'bg-white'
                        : (agentCounts.UNASSIGNED || 0) > 0
                        ? 'bg-[#FF9500]'
                        : 'bg-gray-300'
                    }`}
                  />
                  <span className="truncate">Unassigned</span>
                </div>
                <span
                  className={`text-[9.5px] px-1.5 py-0.2 rounded font-bold shrink-0 ml-2 ${
                    selectedAgent === 'UNASSIGNED'
                      ? 'bg-white/20 text-white'
                      : (agentCounts.UNASSIGNED || 0) > 0
                      ? 'text-[#0066FF] bg-[#0066FF]/10'
                      : 'text-gray-400'
                  }`}
                >
                  {agentCounts.UNASSIGNED || 0}
                </span>
              </button>
            )}

            {filteredAgents.length > 0 && (
              <>
                <div className="h-[1px] my-1" style={{ background: 'var(--border-sidebar)' }} />
                <div className="px-2 py-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                    Team Members
                  </span>
                </div>
                {filteredAgents.map(agentName => {
                  const isAgentActive = selectedAgent.toLowerCase() === agentName.toLowerCase();
                  const count = agentCounts[agentName.toLowerCase()] || 0;

                  return (
                    <button
                      key={agentName}
                      type="button"
                      onClick={() => {
                        onSelectAgent(agentName);
                        setOpen(false);
                      }}
                      className={`w-full px-2.5 py-1.5 rounded-lg text-left text-[11px] flex items-center justify-between transition-colors cursor-pointer pl-3.5 ${
                        isAgentActive
                          ? 'bg-[#0066FF] text-white font-bold'
                          : 'hover:bg-[var(--bg-pill)] text-[var(--text-primary)] font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            isAgentActive ? 'bg-white' : count > 0 ? 'bg-[#34C759]' : 'bg-gray-300'
                          }`}
                        />
                        <span className="truncate">{agentName}</span>
                      </div>
                      <span
                        className={`text-[9.5px] px-1.5 py-0.2 rounded font-bold shrink-0 ml-2 ${
                          isAgentActive
                            ? 'bg-white/20 text-white'
                            : count > 0
                            ? 'text-[#0066FF] bg-[#0066FF]/10'
                            : 'text-gray-400'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </>
            )}

            {!showAllOption && !showMineOption && !showUnassignedOption && filteredAgents.length === 0 && (
              <div className="py-4 text-center text-[11px] text-gray-400">
                No matching users found
              </div>
            )}
          </div>

          {isFiltered && (
            <div className="pt-1.5 border-t flex items-center justify-between" style={{ borderColor: 'var(--border-input)' }}>
              <span className="text-[10px] text-gray-400 truncate">
                Active: <b className="text-[var(--text-primary)]">{displayLabel}</b>
              </span>
              <button
                type="button"
                onClick={() => {
                  onSelectAgent('ALL');
                  setOpen(false);
                }}
                className="text-[10px] text-[#0066FF] font-semibold hover:underline cursor-pointer"
              >
                Reset to All
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const subscribeNoop = () => () => {};

function AuditionsPageInner() {
  const { conversations, patchConversation, openChat, assignableAgents } = useCRM();
  const { isReadOnly, user } = useAuth();
  const { branchGroups, legacyBranchGroups } = useBranches();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlDate = searchParams.get('date');
  const urlHighlightId = searchParams.get('id');
  const fromSource = searchParams.get('from');
  const returnLabel = useSyncExternalStore(
    subscribeNoop,
    () => (fromSource === 'team-performance' ? getTeamReturnBannerInfo().label : 'Back to Funnel Audit'),
    () => 'Back to Funnel Audit'
  );
  const [highlightConvId, setHighlightConvId] = useState<string | null>(urlHighlightId);

  // Auto-clear the glow after 4.5 seconds
  useEffect(() => {
    if (!highlightConvId) return;
    const t = setTimeout(() => setHighlightConvId(null), 4500);
    return () => clearTimeout(t);
  }, [highlightConvId]);

  const [currentDate, setCurrentDate] = useState(() => {
    if (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate)) {
      return new Date(urlDate + 'T12:00:00');
    }
    return new Date();
  });
  const [viewMode, setViewMode] = useState<CalendarViewMode>(() => {
    if (typeof window === 'undefined') return 'week';
    try {
      const saved = localStorage.getItem('audition_view_mode');
      if (saved === 'month' || saved === 'week') return saved;
    } catch {}
    return 'week';
  });

  const handleSelectViewMode = useCallback((mode: CalendarViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('audition_view_mode', mode);
    } catch {}
  }, []);
  const [selectedBranch, setSelectedBranch] = useState<string>(() => {
    if (typeof window === 'undefined') return 'ALL';
    try {
      return localStorage.getItem('audition_selected_branch') || 'ALL';
    } catch {
      return 'ALL';
    }
  });

  const handleSelectBranch = useCallback((b: string) => {
    setSelectedBranch(b);
    try {
      localStorage.setItem('audition_selected_branch', b);
    } catch {}
  }, []);

  const urlAgent = searchParams.get('agent');
  const [selectedAgent, setSelectedAgent] = useState<string>(() => {
    if (urlAgent) return urlAgent;
    if (typeof window === 'undefined') return 'ALL';
    try {
      return localStorage.getItem('audition_selected_agent') || 'ALL';
    } catch {
      return 'ALL';
    }
  });

  const handleSelectAgent = useCallback((agent: string) => {
    setSelectedAgent(agent);
    try {
      localStorage.setItem('audition_selected_agent', agent);
    } catch {}
  }, []);
  const [customSlots, setCustomSlots] = useState<DaySlots>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem('audition_custom_slots');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const updateCustomSlotsState = useCallback((updater: (prev: DaySlots) => DaySlots) => {
    setCustomSlots(prev => {
      const next = updater(prev);
      try {
        localStorage.setItem('audition_custom_slots', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);
  const [addingSlot, setAddingSlot] = useState<{ dateKey: string; time: string; agent: string } | null>(null);
  const [bookingModal, setBookingModal] = useState<BookingModal>(null);
  const [bookForm, setBookForm] = useState({ branch: '', name: '', type: 'Adult', age: '', instrument: '', agent: 'Unassigned' });
  const [slotPanel, setSlotPanel] = useState<SlotPanelState>(null);
  const [panelComment, setPanelComment] = useState('');
  const [panelAgent, setPanelAgent] = useState('Unassigned');
  const [panelStatus, setPanelStatus] = useState<SlotStatus>('booked');
  const [panelFollowUpDate, setPanelFollowUpDate] = useState('');

  // Track closed days and closed slots (saved in localStorage for instantaneous 0ms response)
  const [closedDays, setClosedDays] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem('audition_closed_days');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [closedSlots, setClosedSlots] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem('audition_closed_slots');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const setDayClosed = useCallback((dateKey: string, closed: boolean) => {
    setClosedDays(prev => {
      const next = { ...prev };
      if (closed) {
        next[dateKey] = true;
      } else {
        delete next[dateKey];
      }
      try {
        localStorage.setItem('audition_closed_days', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const setSlotClosed = useCallback((slotId: string | number, closed: boolean) => {
    const sId = String(slotId);
    setClosedSlots(prev => {
      const next = { ...prev };
      if (closed) {
        next[sId] = true;
      } else {
        delete next[sId];
      }
      try {
        localStorage.setItem('audition_closed_slots', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const toggleDayClosed = useCallback((dateKey: string) => {
    setDayClosed(dateKey, !closedDays[dateKey]);
  }, [closedDays, setDayClosed]);

  const toggleSlotClosed = useCallback((slotId: string | number) => {
    setSlotClosed(slotId, !closedSlots[String(slotId)]);
  }, [closedSlots, setSlotClosed]);

  // Track status overrides in real time so cards immediately update and never disappear
  const [statusOverrides, setStatusOverrides] = useState<Record<string, SlotStatus>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem('audition_status_overrides');
      if (!saved) return {};
      const parsed = JSON.parse(saved);
      const clean: Record<string, SlotStatus> = {};
      Object.keys(parsed).forEach(k => {
        const s = parseOverride(parsed[k]);
        if (s) clean[k] = s;
      });
      return clean;
    } catch {
      return {};
    }
  });

  // Remember locked audition dates in localStorage so cards never shift dates on update
  const [auditionDates, setAuditionDates] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem('audition_locked_dates');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const saveAuditionDate = useCallback((slotId: string | number, date: string) => {
    setAuditionDates(prev => {
      const next = { ...prev, [String(slotId)]: date };
      try {
        localStorage.setItem('audition_locked_dates', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const updateStatusOverride = useCallback((slotId: string | number, status: SlotStatus) => {
    setStatusOverrides(prev => {
      const next = { ...prev, [String(slotId)]: status };
      try {
        localStorage.setItem('audition_status_overrides', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const todayIso = isoDate(new Date());

  // Filter CRM conversations for live auditions (never drops overridden cards)
  const liveAuditionConvs = useMemo(() => {
    return conversations.filter(c =>
      c.pipeline === "Audition Booked" ||
      c.pipeline === "Attended" ||
      c.pipeline === "Enrolled" ||
      (Boolean(c.auditionOutcome) && (
        c.auditionOutcome !== "joining-later" ||
        Boolean(c.auditionDate) ||
        Boolean(auditionDates[c.id]) ||
        Boolean(auditionDates[`crm-${c.id}`])
      )) ||
      statusOverrides[c.id] !== undefined ||
      statusOverrides[`crm-${c.id}`] !== undefined ||
      (c.pipeline === "Contacted" && Boolean(c.auditionDate)) ||
      (c.pipeline === "Qualified" && Boolean(c.auditionDate)) ||
      (c.pipeline === "Joining Later" && Boolean(c.auditionDate)) ||
      (c.pipeline === "Lost" && (
        Boolean(c.auditionDate) ||
        Boolean(c.followUpDate) ||
        Boolean(c.notes) ||
        Boolean(c.formAnswers?.instrument)
      ))
    );
  }, [conversations, statusOverrides, auditionDates]);

  // Merge live CRM pipeline cards into calendar schedule with zero mock test data
  const slots = useMemo<DaySlots>(() => {
    const result: DaySlots = {};

    liveAuditionConvs.forEach(c => {
      const localLockedDate = auditionDates[c.id] || auditionDates[`crm-${c.id}`];
      const lockedDate = localLockedDate || c.auditionDate || (c.followUpDate && /^\d{4}-\d{2}-\d{2}$/.test(c.followUpDate) ? c.followUpDate : null);
      const dateKey = lockedDate || getConvDate(c, todayIso);
      const override = statusOverrides[c.id] || statusOverrides[`crm-${c.id}`];

      let slotStatus: AuditionStatus = 'booked';

      if (closedSlots[`crm-${c.id}`] || closedSlots[c.id]) {
        slotStatus = 'closed';
      } else if (override) {
        slotStatus = override;
      } else if (c.auditionOutcome) {
        // Use persisted outcome from backend
        const parsed = parseOverride(c.auditionOutcome);
        slotStatus = parsed || 'booked';
      } else {
        // Legacy pipeline-based mapping
        if (c.pipeline === 'Enrolled') {
          slotStatus = 'registered';
        } else if (c.pipeline === 'Attended') {
          slotStatus = 'schedule-followup';
        } else if (c.pipeline === 'Lost' || (c.notes && c.notes.toLowerCase().includes('no-show'))) {
          slotStatus = 'no-show';
        } else {
          slotStatus = 'booked';
        }
      }

      const inst = c.formAnswers?.instrument || "";
      const age = c.formAnswers?.studentAge ? `Child ${c.formAnswers.studentAge}` : "Adult";
      const type = inst ? `${age} · ${inst}` : (c.formAnswers?.studentAge ? `${age} · Audition` : "");

      const slot: Slot = {
        id: `crm-${c.id}`,
        conversationId: c.id,
        time: getConvTime(c),
        name: c.name || `Lead ${c.id.slice(-4)}`,
        type,
        status: slotStatus,
        agent: c.agent || "Unassigned",
        comment: stripNoResponseTag(c.notes || c.followUpNote || ""),
        phone: c.phone || "",
        branch: c.branch || "",
        auditionDate: lockedDate || dateKey,
        followUpDate: c.followUpDate || "",
        dateKey,
      };

      if (!result[dateKey]) result[dateKey] = [];
      result[dateKey].push(slot);
    });

    Object.keys(customSlots).forEach(dateKey => {
      if (!result[dateKey]) result[dateKey] = [];
      const daySlots = (customSlots[dateKey] || []).map(s => {
        if (closedSlots[String(s.id)] || closedDays[dateKey]) {
          return { ...s, status: 'closed' as AuditionStatus };
        }
        return s;
      });
      result[dateKey].push(...daySlots);
    });

    return result;
  }, [liveAuditionConvs, customSlots, todayIso, statusOverrides, auditionDates, closedSlots, closedDays]);

  const weekStart = useMemo(() => getWeekStart(currentDate), [currentDate]);
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);
  const weekEnd = weekDays[6];

  const monthWeeks = useMemo(() => getMonthGridWeeks(currentDate), [currentDate]);
  const monthDays = useMemo(() => getMonthDays(currentDate), [currentDate]);

  const activePeriodDays = useMemo(() => {
    if (viewMode === 'month') return monthDays;
    return weekDays;
  }, [viewMode, monthDays, weekDays]);

  const handledDeepLinkIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!urlHighlightId) {
      handledDeepLinkIdRef.current = null;
      return;
    }
    if (handledDeepLinkIdRef.current === urlHighlightId) return;

    let foundDateKey: string | null = null;
    let foundSlot: Slot | null = null;
    for (const [dateKey, dayList] of Object.entries(slots)) {
      const match = dayList.find(s => s.conversationId === urlHighlightId || String(s.id) === urlHighlightId);
      if (match) {
        foundDateKey = dateKey;
        foundSlot = match;
        break;
      }
    }
    if (!foundSlot || !foundDateKey) return;

    let cancelled = false;
    const matchedDateKey = foundDateKey;
    const matchedSlot = foundSlot;
    queueMicrotask(() => {
      if (cancelled || handledDeepLinkIdRef.current === urlHighlightId) return;
      handledDeepLinkIdRef.current = urlHighlightId;

      const inCurrentPeriod = activePeriodDays.some(d => isoDate(d) === matchedDateKey);
      if (!inCurrentPeriod && /^\d{4}-\d{2}-\d{2}$/.test(matchedDateKey)) {
        setCurrentDate(new Date(`${matchedDateKey}T12:00:00`));
      }
      if (!matchesBranch(matchedSlot.branch, selectedBranch)) {
        setSelectedBranch('ALL');
      }
      if (selectedAgent && selectedAgent !== 'ALL' && !matchesAgent(matchedSlot.agent, selectedAgent, user?.name)) {
        setSelectedAgent('ALL');
      }
      setHighlightConvId(urlHighlightId);
    });

    return () => {
      cancelled = true;
    };
  }, [urlHighlightId, slots, activePeriodDays, selectedBranch, selectedAgent, user?.name]);

  const handlePrev = useCallback(() => {
    setCurrentDate(d => {
      if (viewMode === 'month') {
        return new Date(d.getFullYear(), d.getMonth() - 1, 1);
      }
      return addDays(d, -7);
    });
  }, [viewMode]);

  const handleNext = useCallback(() => {
    setCurrentDate(d => {
      if (viewMode === 'month') {
        return new Date(d.getFullYear(), d.getMonth() + 1, 1);
      }
      return addDays(d, 7);
    });
  }, [viewMode]);

  const handleGoCurrent = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  const periodSubtitle = useMemo(() => {
    if (viewMode === 'month') {
      return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    return formatRangeLabel(weekStart, weekEnd);
  }, [viewMode, currentDate, weekStart, weekEnd]);

  const currentPeriodLabel = viewMode === 'month' ? 'This Month' : 'This Week';
  const prevPeriodLabel = viewMode === 'month' ? 'Previous Month' : 'Previous Week';
  const nextPeriodLabel = viewMode === 'month' ? 'Next Month' : 'Next Week';

  const confirmAddSlot = () => {
    if (!addingSlot) return;
    const formattedTime = formatTime12(addingSlot.time || '17:00');
    const branchToAssign =
      selectedBranch && selectedBranch !== 'ALL' && !selectedBranch.startsWith('REGION:')
        ? selectedBranch
        : undefined;
    const filterDefaultAgent =
      selectedAgent === 'MINE'
        ? user?.name || 'Jwana'
        : selectedAgent && selectedAgent !== 'ALL' && selectedAgent !== 'UNASSIGNED'
        ? selectedAgent
        : 'Jwana';
    const newSlot: Slot = {
      id: `custom-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      time: formattedTime,
      status: 'free',
      agent: addingSlot.agent.trim() || filterDefaultAgent,
      branch: branchToAssign,
      dateKey: addingSlot.dateKey,
    };
    updateCustomSlotsState(prev => ({
      ...prev,
      [addingSlot.dateKey]: [...(prev[addingSlot.dateKey] || []), newSlot],
    }));
    setAddingSlot(null);
  };

  const deleteCustomSlot = useCallback((dateKey: string, slotId: string | number) => {
    updateCustomSlotsState(prev => {
      const currentList = prev[dateKey] || [];
      const updatedList = currentList.filter(s => s.id !== slotId);
      const next = { ...prev };
      if (updatedList.length > 0) {
        next[dateKey] = updatedList;
      } else {
        delete next[dateKey];
      }
      return next;
    });
  }, [updateCustomSlotsState]);

  const openBooking = (slotId: string | number, dateKey: string, time: string, day: Date) => {
    setBookingModal({ slotId, dateKey, time, dayLabel: formatDayLabel(day) });
    const prefillBranch =
      selectedBranch && selectedBranch !== 'ALL' && !selectedBranch.startsWith('REGION:')
        ? selectedBranch
        : '';
    const existingSlot = (slots[dateKey] || []).find(s => s.id === slotId);
    setBookForm({
      branch: prefillBranch,
      name: '',
      type: 'Adult',
      age: '',
      instrument: '',
      agent: existingSlot?.agent && existingSlot.agent !== 'Unassigned' ? existingSlot.agent : (user?.name || 'Unassigned'),
    });
  };

  const confirmBooking = () => {
    if (!bookingModal) return;
    const { slotId, dateKey } = bookingModal;
    updateCustomSlotsState(prev => ({
      ...prev,
      [dateKey]: (prev[dateKey] || []).map(s =>
        s.id === slotId
          ? {
            ...s,
            name: bookForm.name || 'Student',
            type: `${bookForm.type}${bookForm.age ? ` ${bookForm.age}` : ''} · ${bookForm.instrument || '—'}`,
            branch: bookForm.branch || '',
            agent: bookForm.agent || s.agent || 'Unassigned',
            status: 'booked',
            auditionDate: dateKey,
            dateKey,
          }
          : s
      ),
    }));
    setBookingModal(null);
  };

  const setSlotStatus = (
    dateKey: string,
    slotId: string | number,
    status: SlotStatus
  ) => {
    updateStatusOverride(slotId, status);

    const currentSlot = (slots[dateKey] || []).find(s => s.id === slotId);
    if (currentSlot?.conversationId) {
      if (isReadOnly) return;
      const targetPipeline = getOutcomePipeline(status);
      const cleanComment = stripNoResponseTag(currentSlot.comment);
      // Lock the date so it NEVER changes when updating outcome
      const lockedDate = currentSlot.auditionDate || currentSlot.dateKey || dateKey;
      saveAuditionDate(currentSlot.id, lockedDate);
      saveAuditionDate(currentSlot.conversationId, lockedDate);
      const patch: Record<string, any> = {
        pipeline: targetPipeline,
        notes: cleanComment,
        auditionDate: lockedDate,
        auditionOutcome: status,
      };
      if (status === 'no-show') {
        patch.notes = cleanComment ? `${cleanComment} [No-Show]` : 'No-Show';
      }
      // Clear follow-up for non-followup outcomes; the modal handles setting it for followup outcomes
      if (!needsFollowUp(status)) {
        patch.followUpDate = '';
        patch.followUpNote = '';
      }
      patchConversation(currentSlot.conversationId, patch);
      return;
    }

    updateCustomSlotsState(prev => ({
      ...prev,
      [dateKey]: (prev[dateKey] || []).map(s => {
        if (s.id !== slotId) return s;
        return { ...s, status: status === 'booked' ? 'booked' : status };
      }),
    }));
  };

  const openSlotPanel = useCallback((slotId: string | number, dateKey: string) => {
    const slot = (slots[dateKey] || []).find(s => s.id === slotId);
    if (!slot) return;
    setSlotPanel({ slotId, dateKey });
    setPanelComment(stripNoResponseTag(slot.comment || ''));
    setPanelAgent(slot.agent || 'Unassigned');
    const currentStatus: SlotStatus =
      slot.status !== 'free' && slot.status !== 'booked'
        ? slot.status
        : 'booked';
    setPanelStatus(currentStatus);
    // Read existing follow-up date from conversation, or set default
    if (needsFollowUp(currentStatus)) {
      const existingDate = slot.followUpDate;
      setPanelFollowUpDate(existingDate || getDefaultFollowUpDate(currentStatus));
    } else {
      setPanelFollowUpDate('');
    }
  }, [slots]);

  const saveSlotPanel = useCallback(() => {
    if (!slotPanel) return;
    const currentSlot = (slots[slotPanel.dateKey] || []).find(s => s.id === slotPanel.slotId);

    updateStatusOverride(slotPanel.slotId, panelStatus);

    if (currentSlot?.conversationId) {
      if (!isReadOnly) {
        const targetPipeline = getOutcomePipeline(panelStatus);
        const cleanComment = stripNoResponseTag(panelComment);
        // Lock the audition date: it was set when booked and must NEVER be edited when updating status or notes
        const lockedDate = currentSlot.auditionDate || currentSlot.dateKey || slotPanel.dateKey;
        saveAuditionDate(currentSlot.id, lockedDate);
        saveAuditionDate(currentSlot.conversationId, lockedDate);

        const patch: Record<string, any> = {
          pipeline: targetPipeline,
          notes: cleanComment,
          auditionDate: lockedDate,
          auditionOutcome: panelStatus,
        };

        if (panelAgent && panelAgent !== (currentSlot.agent || 'Unassigned')) {
          patch.agent = panelAgent;
        }

        // Handle follow-up date for schedule-followup and joining-later
        if (needsFollowUp(panelStatus) && panelFollowUpDate) {
          patch.followUpDate = panelFollowUpDate;
          patch.followUpNote = panelStatus === 'schedule-followup'
            ? (cleanComment || 'Schedule to complete enrollment')
            : (cleanComment || 'Joining Later - Follow up');
        } else if (needsFollowUp(panelStatus)) {
          // If follow-up outcome selected without manual date, use smart default
          const defaultDate = getDefaultFollowUpDate(panelStatus);
          patch.followUpDate = defaultDate;
          patch.followUpNote = panelStatus === 'schedule-followup'
            ? (cleanComment || 'Schedule to complete enrollment')
            : (cleanComment || 'Joining Later - Follow up');
        } else {
          // Clear follow-up for non-followup outcomes (registered, paid-trial, no-show)
          patch.followUpDate = '';
          patch.followUpNote = '';
        }

        if (panelStatus === 'no-show') {
          patch.notes = cleanComment ? `${cleanComment} [No-Show]` : 'No-Show';
        }

        patchConversation(currentSlot.conversationId, patch);
      }
    } else {
      updateCustomSlotsState(prev => ({
        ...prev,
        [slotPanel.dateKey]: (prev[slotPanel.dateKey] || []).map(s =>
          s.id === slotPanel.slotId
            ? {
              ...s,
              comment: stripNoResponseTag(panelComment),
              status: panelStatus === 'booked' ? 'booked' : panelStatus,
              agent: panelAgent || s.agent,
            }
            : s
        ),
      }));
    }
    setSlotPanel(null);
  }, [slotPanel, slots, panelComment, panelStatus, panelFollowUpDate, panelAgent, isReadOnly, patchConversation, updateStatusOverride, saveAuditionDate, updateCustomSlotsState]);

  const panelSlot = slotPanel ? (slots[slotPanel.dateKey] || []).find(s => s.id === slotPanel.slotId) : null;
  const isCurrentSlotClosed = panelSlot ? Boolean(closedSlots[String(panelSlot.id)] || panelSlot.status === 'closed') : false;
  const isCurrentDayClosed = slotPanel ? Boolean(closedDays[slotPanel.dateKey]) : false;

  // All distinct user/agent options (from assignableAgents + any agent present on audition slots)
  const agentOptions = useMemo(() => {
    const seen = new Map<string, string>();
    assignableAgents.forEach(a => {
      const clean = (a.name || '').trim();
      if (clean && clean.toLowerCase() !== 'unassigned') {
        seen.set(clean.toLowerCase(), clean);
      }
    });
    liveAuditionConvs.forEach(c => {
      const clean = (c.agent || '').trim();
      if (clean && clean.toLowerCase() !== 'unassigned' && !seen.has(clean.toLowerCase())) {
        seen.set(clean.toLowerCase(), clean);
      }
    });
    Object.values(slots).forEach(dayList => {
      dayList.forEach(s => {
        const clean = (s.agent || '').trim();
        if (clean && clean.toLowerCase() !== 'unassigned' && !seen.has(clean.toLowerCase())) {
          seen.set(clean.toLowerCase(), clean);
        }
      });
    });
    return Array.from(seen.values());
  }, [assignableAgents, liveAuditionConvs, slots]);

  // Fast 0ms slot filter combining branch and user filter
  const matchesSlotFilters = useCallback(
    (s: Slot) => {
      const branchMatch = s.status === 'free' && !s.branch ? true : matchesBranch(s.branch, selectedBranch);
      if (!branchMatch) return false;
      if (!selectedAgent || selectedAgent === 'ALL') return true;
      return matchesAgent(s.agent, selectedAgent, user?.name);
    },
    [selectedBranch, selectedAgent, user?.name]
  );

  // Real-time period counts for every branch and region (0ms in-memory calculation, respects active view & user filter)
  const branchCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: 0 };
    legacyBranchGroups.forEach(g => {
      counts[`REGION:${g.region}`] = 0;
      g.branches.forEach(b => {
        counts[b] = 0;
      });
    });

    activePeriodDays.forEach(day => {
      const key = isoDate(day);
      const daySlots = slots[key] || [];
      daySlots.forEach(s => {
        if (s.status === 'free') return;
        if (!matchesAgent(s.agent, selectedAgent, user?.name)) return;
        counts.ALL = (counts.ALL || 0) + 1;

        legacyBranchGroups.forEach(g => {
          if (matchesBranch(s.branch, `REGION:${g.region}`)) {
            counts[`REGION:${g.region}`] = (counts[`REGION:${g.region}`] || 0) + 1;
          }
          g.branches.forEach(b => {
            if (matchesBranch(s.branch, b)) {
              counts[b] = (counts[b] || 0) + 1;
            }
          });
        });
      });
    });

    return counts;
  }, [activePeriodDays, slots, legacyBranchGroups, selectedAgent, user?.name]);

  // Real-time period counts for every user/agent (0ms in-memory calculation, respects active view & branch filter)
  const agentCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: 0,
      MINE: 0,
      UNASSIGNED: 0,
    };
    const myClean = (user?.name || '').trim().toLowerCase();

    activePeriodDays.forEach(day => {
      const key = isoDate(day);
      const daySlots = slots[key] || [];
      daySlots.forEach(s => {
        if (s.status === 'free') return;
        if (!matchesBranch(s.branch, selectedBranch)) return;

        counts.ALL += 1;
        const cleanAgent = (s.agent || '').trim();
        const lowerAgent = cleanAgent.toLowerCase();

        if (!cleanAgent || lowerAgent === 'unassigned') {
          counts.UNASSIGNED += 1;
        } else {
          counts[lowerAgent] = (counts[lowerAgent] || 0) + 1;
          if (myClean && lowerAgent === myClean) {
            counts.MINE += 1;
          }
        }
      });
    });

    return counts;
  }, [activePeriodDays, slots, selectedBranch, user?.name]);

  // Dynamic column sizing: expand days with > 5 auditions to 420px so 2-column cards are wide and spacious
  const gridTemplate = useMemo(() => {
    return weekDays.map(day => {
      const key = isoDate(day);
      const rawDaySlots = slots[key] || [];
      const count = rawDaySlots.filter(matchesSlotFilters).length;
      return count > 5 ? 'minmax(420px, 2.5fr)' : 'minmax(180px, 1fr)';
    }).join(' ');
  }, [weekDays, slots, matchesSlotFilters]);

  const renderAddSlotControl = (dateKey: string, spanTwoCols = false) => {
    const isAddingHere = addingSlot?.dateKey === dateKey;
    if (isAddingHere && addingSlot) {
      return (
        <div
          className={`rounded-lg p-2 flex flex-col gap-1.5 shadow-sm ${spanTwoCols ? 'col-span-2' : ''}`}
          style={{ border: '1px solid var(--border-input)', background: 'var(--bg-card)' }}
        >
          <input
            type="time"
            value={addingSlot.time}
            onChange={e => setAddingSlot(a => (a ? { ...a, time: e.target.value } : a))}
            onKeyDown={e => {
              if (e.key === 'Enter') confirmAddSlot();
            }}
            className="w-full h-[26px] px-2 text-[11px] rounded-[4px] outline-none"
            style={{
              border: '1px solid var(--border-input)',
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
            }}
          />
          <input
            type="text"
            placeholder="Staff (optional)"
            value={addingSlot.agent}
            onChange={e => setAddingSlot(a => (a ? { ...a, agent: e.target.value } : a))}
            onKeyDown={e => {
              if (e.key === 'Enter') confirmAddSlot();
            }}
            className="w-full h-[26px] px-2 text-[11px] rounded-[4px] outline-none placeholder-gray-400"
            style={{
              border: '1px solid var(--border-input)',
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
            }}
          />
          <div className="flex gap-1">
            <button
              onClick={confirmAddSlot}
              className="flex-1 h-[24px] text-[11px] font-semibold text-white bg-[#0066FF] rounded-[4px] cursor-pointer"
            >
              Add
            </button>
            <button
              onClick={() => setAddingSlot(null)}
              className="w-[24px] h-[24px] text-[11px] rounded-[4px] cursor-pointer"
              style={{ background: 'var(--bg-pill)', color: 'var(--text-secondary)' }}
            >
              ✕
            </button>
          </div>
        </div>
      );
    }
    if (isReadOnly) return null;
    return (
      <button
        onClick={() => setAddingSlot({ dateKey, time: '17:00', agent: '' })}
        className={`text-[10px] py-1.5 text-center w-full rounded-lg border border-dashed cursor-pointer hover:border-[#0066FF] hover:text-[#0066FF] transition-colors ${
          spanTwoCols ? 'col-span-2' : ''
        }`}
        style={{ color: 'var(--text-muted)', borderColor: 'var(--border-main)' }}
      >
        + Add slot
      </button>
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0 relative" style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}>

      {/* Header */}
      <div className="px-4 md:px-6 py-4 flex flex-wrap items-center justify-between gap-2 shrink-0 relative z-30" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-main)' }}>
        <div className="flex items-center gap-3">
          {fromSource === 'team-performance' && (
            <button
              type="button"
              onClick={() => navigateBackToTeamActivities(router)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all hover:opacity-90 active:scale-[0.98] cursor-pointer shrink-0"
              style={{
                background: 'rgba(0, 102, 255, 0.1)',
                color: '#0066FF',
                border: '1px solid rgba(0, 102, 255, 0.25)',
              }}
              title="Return cleanly without losing your previous view"
            >
              <ArrowLeft size={14} />
              <span>{returnLabel}</span>
            </button>
          )}
          <div>
            <h1 className="text-[15px] font-bold leading-none mb-0.5" style={{ color: 'var(--text-primary)' }}>Auditions Calendar</h1>
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              {periodSubtitle}
            </p>
          </div>
          {liveAuditionConvs.length > 0 && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
              <Calendar className="w-3.5 h-3.5" />
              {liveAuditionConvs.length} Live Pipeline
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">

          {/* View Mode Segmented Switcher: Month | Week */}
          <div
            className="h-[28px] p-0.5 rounded-[6px] inline-flex items-center gap-0.5"
            style={{
              background: 'var(--bg-pill)',
              border: '1px solid var(--border-input)',
            }}
            role="group"
            aria-label="Calendar view mode"
          >
            {(['month', 'week'] as const).map(mode => {
              const isActive = viewMode === mode;
              const label = mode === 'month' ? 'Month' : 'Week';
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => handleSelectViewMode(mode)}
                  className={`h-[22px] px-2.5 text-[11px] rounded-[4px] transition-colors cursor-pointer ${
                    isActive ? 'bg-[#0066FF] text-white font-semibold shadow-xs' : 'font-medium hover:opacity-80'
                  }`}
                  style={!isActive ? { color: 'var(--text-secondary)' } : undefined}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* User / Agent Filter dropdown */}
          <AgentFilterPopover
            selectedAgent={selectedAgent}
            onSelectAgent={handleSelectAgent}
            agentOptions={agentOptions}
            agentCounts={agentCounts}
            currentUserName={user?.name}
          />

          {/* Branch Filter dropdown in the old place on the right */}
          <BranchFilterPopover
            selectedBranch={selectedBranch}
            onSelectBranch={handleSelectBranch}
            branchCounts={branchCounts}
            branchGroups={legacyBranchGroups}
          />

          {/* Unified Date Picker (works across both Month and Week views) */}
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
            title="Select date"
          />

          {/* Navigation Controls: Previous, Current (This Month / This Week / Today), Next */}
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrev}
              className="h-[28px] w-[28px] flex items-center justify-center rounded-[6px] transition-colors cursor-pointer hover:opacity-80"
              style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)', color: 'var(--text-secondary)' }}
              title={prevPeriodLabel}
              aria-label={prevPeriodLabel}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              onClick={handleGoCurrent}
              className="h-[28px] px-2.5 text-[11px] font-medium rounded-[6px] transition-colors flex items-center justify-center cursor-pointer hover:opacity-80"
              style={{
                background: 'var(--bg-pill)',
                border: '1px solid var(--border-input)',
                color: 'var(--text-primary)',
              }}
              title={`Jump to ${currentPeriodLabel.toLowerCase()}`}
            >
              {currentPeriodLabel}
            </button>

            <button
              onClick={handleNext}
              className="h-[28px] w-[28px] flex items-center justify-center rounded-[6px] transition-colors cursor-pointer hover:opacity-80"
              style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)', color: 'var(--text-secondary)' }}
              title={nextPeriodLabel}
              aria-label={nextPeriodLabel}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Calendar Views: Month (Weeks × Days) | Week | Day */}
      <div className="flex-1 min-h-0 overflow-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        {viewMode === 'month' && (
          <div className="min-w-[1120px] w-full flex flex-col">
            {/* Sticky 7-Day Column Headers (Sat - Fri) */}
            <div
              className="grid grid-cols-7 sticky top-0 z-20"
              style={{
                background: 'var(--bg-card)',
                borderBottom: '1px solid var(--border-sidebar)',
              }}
            >
              {WEEKDAY_HEADERS.map(dayName => (
                <div
                  key={dayName}
                  className="py-2 px-2.5 text-center text-[11px] font-semibold uppercase tracking-wider"
                  style={{
                    color: 'var(--text-secondary)',
                    borderRight: '1px solid var(--border-sidebar)',
                  }}
                >
                  {dayName}
                </div>
              ))}
            </div>

            {/* 4–6 Week Rows × 7 Day Columns */}
            {monthWeeks.map((weekRow, weekIdx) => {
                const rowStart = weekRow[0];
                const rowEnd = weekRow[6];
                const weekTotalSlots = weekRow.reduce((sum, day) => {
                  const k = isoDate(day);
                  return sum + (slots[k] || []).filter(matchesSlotFilters).length;
                }, 0);

                return (
                  <div
                    key={isoDate(rowStart)}
                    className="flex flex-col"
                    style={{ borderBottom: '1px solid var(--border-sidebar)' }}
                  >
                    {/* Week Row Subheader: Week number, date range, total slots, and 1-click jump to Week view */}
                    <div
                      className="px-3 py-1.5 flex items-center justify-between text-[11px]"
                      style={{
                        background: 'var(--bg-panel)',
                        borderBottom: '1px solid var(--border-main)',
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold uppercase tracking-wider text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-pill)', color: 'var(--text-primary)' }}>
                          Week {weekIdx + 1}
                        </span>
                        <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>
                          {formatRangeLabel(rowStart, rowEnd)}
                        </span>
                        {weekTotalSlots > 0 && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-[#0066FF] bg-[#0066FF]/10">
                            {weekTotalSlots} {weekTotalSlots === 1 ? 'audition' : 'auditions'}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentDate(rowStart);
                          handleSelectViewMode('week');
                        }}
                        className="text-[10px] font-semibold text-[#0066FF] hover:underline cursor-pointer"
                        title="Open this week in Week view"
                      >
                        Open Week View
                      </button>
                    </div>

                    {/* 7 Day Columns inside this Week Row */}
                    <div className="grid grid-cols-7 min-h-[160px]">
                      {weekRow.map(day => {
                        const key = isoDate(day);
                        const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                        const isToday = key === todayIso;
                        const isDayClosed = Boolean(closedDays[key]);
                        const rawDaySlots = slots[key] || [];
                        const daySlots = rawDaySlots.filter(matchesSlotFilters);
                        const orderedSlots = orderDaySlots(daySlots);

                        return (
                          <div
                            key={key}
                            className="p-2 flex flex-col gap-1.5 transition-colors group/daycell"
                            style={{
                              borderRight: '1px solid var(--border-sidebar)',
                              background: isDayClosed
                                ? 'rgba(239, 68, 68, 0.03)'
                                : isToday
                                ? 'var(--bg-today-cell)'
                                : isCurrentMonth
                                ? 'transparent'
                                : 'var(--bg-panel)',
                              opacity: isCurrentMonth ? 1 : 0.65,
                            }}
                          >
                            {/* Day Cell Top Bar: Day Number, Slot count, Close Day toggle */}
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                              <div className="inline-flex items-center gap-1">
                                <span
                                  className="text-[11px] font-bold min-w-[22px] h-[22px] rounded-full flex items-center justify-center px-1"
                                  style={{
                                    background: isToday
                                      ? '#0066FF'
                                      : isDayClosed
                                      ? 'rgba(239, 68, 68, 0.12)'
                                      : 'transparent',
                                    color: isToday
                                      ? '#ffffff'
                                      : isDayClosed
                                      ? '#EF4444'
                                      : 'var(--text-primary)',
                                  }}
                                >
                                  {day.getDate()}
                                </span>
                                {day.getDate() === 1 && (
                                  <span className="text-[10px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                                    {day.toLocaleDateString('en-US', { month: 'short' })}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1">
                                {daySlots.length > 0 && (
                                  <span
                                    className="text-[9.5px] font-semibold px-1.5 py-0.2 rounded-full"
                                    style={{ background: 'var(--bg-pill)', color: 'var(--text-secondary)' }}
                                  >
                                    {daySlots.length}
                                  </span>
                                )}
                                {isDayClosed ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleDayClosed(key)}
                                    className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full text-red-500 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 cursor-pointer"
                                    title="Click to reopen day"
                                  >
                                    <Lock className="w-2.5 h-2.5" />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => toggleDayClosed(key)}
                                    className="opacity-0 group-hover/daycell:opacity-100 inline-flex items-center gap-0.5 text-[9px] font-medium p-1 rounded text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 cursor-pointer transition-all"
                                    title="Click to close this day"
                                  >
                                    <Lock className="w-2.5 h-2.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {isDayClosed && (
                              <div
                                className="px-2 py-1 rounded text-[9.5px] font-bold text-red-500 flex items-center justify-between"
                                style={{
                                  background: 'rgba(239, 68, 68, 0.08)',
                                  border: '1px solid rgba(239, 68, 68, 0.25)',
                                }}
                              >
                                <span>Closed</span>
                                <button
                                  type="button"
                                  onClick={() => toggleDayClosed(key)}
                                  className="text-[#0066FF] hover:underline cursor-pointer"
                                >
                                  Reopen
                                </button>
                              </div>
                            )}

                            {/* Slots inside Day Cell */}
                            <div className="flex flex-col gap-1.5 flex-1">
                              {orderedSlots.map(slot => (
                                <SlotCard
                                  key={slot.id}
                                  slot={slot}
                                  onBook={() => openBooking(slot.id, key, slot.time, day)}
                                  onStatusChange={status => setSlotStatus(key, slot.id, status)}
                                  onOpenPanel={() => openSlotPanel(slot.id, key)}
                                  onOpenChat={slot.conversationId ? () => openChat(slot.conversationId!) : undefined}
                                  onDelete={
                                    slot.status === 'free' || slot.status === 'closed'
                                      ? () => deleteCustomSlot(key, slot.id)
                                      : undefined
                                  }
                                  onToggleClosed={() => toggleSlotClosed(slot.id)}
                                  isReadOnly={isReadOnly}
                                  isHighlighted={Boolean(highlightConvId && slot.conversationId === highlightConvId)}
                                />
                              ))}
                              <div className="mt-auto pt-0.5">{renderAddSlotControl(key, false)}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {viewMode === 'week' && (
          <div className="min-w-fit w-full flex flex-col">
            {/* Day headers */}
            <div className="grid sticky top-0 z-20" style={{ gridTemplateColumns: gridTemplate, background: 'var(--bg-card)', borderBottom: '1px solid var(--border-sidebar)' }}>
                {weekDays.map((day) => {
                  const key = isoDate(day);
                  const isDayClosed = !!closedDays[key];
                  const isToday = key === todayIso;
                  const weekdayShort = day.toLocaleDateString('en-US', { weekday: 'short' });
                  const rawDaySlots = slots[key] || [];
                  const daySlots = rawDaySlots.filter(matchesSlotFilters);
                  return (
                    <div
                      key={key}
                      className="py-2.5 px-2 text-center transition-colors relative group/header"
                      style={{
                        borderRight: '1px solid var(--border-sidebar)',
                        background: isDayClosed ? 'rgba(239, 68, 68, 0.04)' : 'var(--bg-card)',
                        borderTop: isDayClosed ? '2px solid #EF4444' : isToday ? '2px solid #0066FF' : '2px solid transparent',
                      }}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span
                          className="text-[11px] font-semibold uppercase tracking-wider"
                          style={{ color: isDayClosed ? '#EF4444' : isToday ? '#0066FF' : 'var(--text-secondary)' }}
                        >
                          {weekdayShort}
                        </span>
                        <span
                          className="text-[12px] font-bold min-w-[22px] h-[22px] rounded-full flex items-center justify-center px-1"
                          style={{
                            color: isToday ? '#ffffff' : isDayClosed ? '#EF4444' : 'var(--text-primary)',
                            background: isToday ? '#0066FF' : isDayClosed ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                          }}
                        >
                          {day.getDate()}
                        </span>
                      </div>

                      {/* Day status badge & quick toggle */}
                      <div className="mt-1 flex items-center justify-center gap-1">
                        {isDayClosed ? (
                          <button
                            type="button"
                            onClick={() => toggleDayClosed(key)}
                            className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full text-red-500 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 cursor-pointer transition-colors"
                            title="Click to reopen day"
                          >
                            <Lock className="w-2.5 h-2.5" />
                            <span>Closed</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleDayClosed(key)}
                            className="opacity-0 group-hover/header:opacity-100 inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 cursor-pointer transition-all"
                            title="Click to close this day"
                          >
                            <Lock className="w-2.5 h-2.5" />
                            <span>Close Day</span>
                          </button>
                        )}
                      </div>

                      {daySlots.length > 0 && (
                        <p className="text-[10px] mt-0.5 font-medium" style={{ color: 'var(--text-muted)' }}>
                          {daySlots.length} {daySlots.length === 1 ? 'slot' : 'slots'}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Day cells */}
              <div className="grid flex-1 min-h-[500px]" style={{ gridTemplateColumns: gridTemplate }}>
                {weekDays.map((day) => {
                  const key = isoDate(day);
                  const isDayClosed = !!closedDays[key];
                  const rawDaySlots = slots[key] || [];
                  const daySlots = rawDaySlots.filter(matchesSlotFilters);
                  const isMultiCol = daySlots.length > 5;
                  const orderedSlots = orderDaySlots(daySlots);

                  return (
                    <div key={key} className="p-2.5" style={{ borderRight: '1px solid var(--border-sidebar)', background: isDayClosed ? 'rgba(239, 68, 68, 0.02)' : 'transparent' }}>
                      {isDayClosed && (
                        <div className={`mb-2 p-2 rounded-lg text-center flex items-center justify-between gap-1 ${isMultiCol ? 'col-span-2' : ''}`} style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                          <div className="flex items-center gap-1.5 text-[11px] font-bold text-red-500">
                            <Lock className="w-3 h-3" />
                            <span>Day Closed for Auditions</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleDayClosed(key)}
                            className="text-[10px] font-bold text-[#0066FF] hover:underline cursor-pointer"
                          >
                            Reopen
                          </button>
                        </div>
                      )}
                      <div className={isMultiCol ? "grid grid-cols-2 gap-2" : "flex flex-col gap-2"}>
                        {orderedSlots.map(slot => (
                          <SlotCard
                            key={slot.id}
                            slot={slot}
                            onBook={() => openBooking(slot.id, key, slot.time, day)}
                            onStatusChange={(status) => setSlotStatus(key, slot.id, status)}
                            onOpenPanel={() => openSlotPanel(slot.id, key)}
                            onOpenChat={slot.conversationId ? () => openChat(slot.conversationId!) : undefined}
                            onDelete={slot.status === 'free' || slot.status === 'closed' ? () => deleteCustomSlot(key, slot.id) : undefined}
                            onToggleClosed={() => toggleSlotClosed(slot.id)}
                            isReadOnly={isReadOnly}
                            isHighlighted={!!highlightConvId && slot.conversationId === highlightConvId}
                          />
                        ))}
                        {renderAddSlotControl(key, isMultiCol)}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {/* Attendance & Notes modal */}
      {slotPanel && panelSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl p-5 shadow-2xl flex flex-col gap-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}>
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 pr-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  {formatDayLabel(new Date(slotPanel.dateKey + 'T00:00:00'))} · {panelSlot.time}
                </p>
                <div className="flex items-baseline gap-1.5 mt-0.5 flex-wrap">
                  <h3 className="text-[17px] font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
                    {panelSlot.name || 'Audition Slot'}
                  </h3>
                  {panelSlot.branch && (
                    <span className="text-[11px] font-medium" style={{ color: '#0066FF' }}>
                      · {panelSlot.branch}
                    </span>
                  )}
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    · Agent: <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>{panelAgent || panelSlot.agent || 'Unassigned'}</span>
                  </span>
                </div>
                {(panelSlot.type || panelSlot.phone) && (
                  <p className="text-[11px] font-medium mt-1" style={{ color: 'var(--text-muted)' }}>
                    {panelSlot.type && <span>{panelSlot.type}</span>}
                    {panelSlot.type && panelSlot.phone && <span> · </span>}
                    {panelSlot.phone && <span className="font-mono">{panelSlot.phone}</span>}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Slot Availability toggle: directly next to Chat, not next to Close button */}
                <button
                  type="button"
                  onClick={() => toggleSlotClosed(panelSlot.id)}
                  className={`h-[28px] px-2.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1.5 select-none shrink-0 whitespace-nowrap ${
                    isCurrentSlotClosed
                      ? 'bg-red-500/15 text-red-500 border border-red-500/30 hover:bg-red-500/25'
                      : 'text-[#10B981] bg-[#10B981]/10 border border-[#10B981]/25 hover:bg-[#10B981]/20'
                  }`}
                  title={isCurrentSlotClosed ? "Click to reopen this slot" : "Click to close this slot"}
                >
                  {isCurrentSlotClosed ? (
                    <>
                      <Lock className="w-3 h-3 text-red-500 shrink-0" />
                      <span className="whitespace-nowrap">Slot Closed</span>
                    </>
                  ) : (
                    <>
                      <Unlock className="w-3 h-3 text-[#10B981] shrink-0" />
                      <span className="whitespace-nowrap">Slot Open</span>
                    </>
                  )}
                </button>

                {/* Chat button - directly next to Slot Toggle */}
                {(() => {
                  const chatConvId = panelSlot.conversationId || conversations.find(c => panelSlot.phone && c.phone === panelSlot.phone)?.id;
                  if (chatConvId) {
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          setSlotPanel(null);
                          openChat(chatConvId);
                        }}
                        className="p-1.5 rounded-lg text-[#0066FF] hover:bg-[#0066FF]/10 transition-colors cursor-pointer"
                        title="Open Chat in Inbox"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                    );
                  }
                  return (
                    <div
                      className="p-1.5 rounded-lg text-[var(--text-muted)] opacity-35"
                      title="No chat conversation linked"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </div>
                  );
                })()}

                {/* Subtle divider before close button */}
                <div className="w-[1px] h-3.5 mx-0.5 opacity-40" style={{ background: 'var(--border-input)' }} />

                {/* Close modal */}
                <button
                  type="button"
                  onClick={() => setSlotPanel(null)}
                  className="p-1.5 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ color: 'var(--text-secondary)', background: 'var(--bg-pill)' }}
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>



            {/* Assigned Agent */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>Assigned Agent</p>
                {panelAgent && panelAgent !== 'Unassigned' && (
                  <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
                    Current: <b style={{ color: 'var(--text-primary)' }}>{panelAgent}</b>
                  </span>
                )}
              </div>
              <select
                disabled={isReadOnly}
                value={panelAgent}
                onChange={e => setPanelAgent(e.target.value)}
                className="w-full h-[36px] px-2.5 text-[12px] font-medium rounded-xl outline-none cursor-pointer"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}
              >
                <option value="Unassigned">Unassigned</option>
                {assignableAgents.map(a => (
                  <option key={a.name} value={a.name}>{a.name}</option>
                ))}
                {panelAgent && panelAgent !== 'Unassigned' && !assignableAgents.some(a => a.name === panelAgent) && (
                  <option value={panelAgent}>{panelAgent}</option>
                )}
              </select>
            </div>

            {/* Audition Outcome */}
            <div>
              <p className="text-[11px] font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Outcome</p>
              <div className="grid grid-cols-2 gap-1.5">
                {AUDITION_OUTCOMES.map(outcomeKey => {
                  const opt = OUTCOME_CONFIG[outcomeKey];
                  const isActive = panelStatus === outcomeKey;
                  return (
                    <button
                      key={outcomeKey}
                      type="button"
                      onClick={() => {
                        if (isActive) {
                          setPanelStatus('booked');
                          setPanelFollowUpDate('');
                        } else {
                          setPanelStatus(outcomeKey);
                          if (needsFollowUp(outcomeKey)) {
                            setPanelFollowUpDate(panelFollowUpDate || panelSlot?.followUpDate || getDefaultFollowUpDate(outcomeKey));
                          } else {
                            setPanelFollowUpDate('');
                          }
                        }
                      }}
                      className={`flex items-center gap-2 px-2.5 py-[7px] rounded-lg text-[12px] transition-all cursor-pointer text-left ${outcomeKey === 'no-show' ? 'col-span-2' : ''}`}
                      style={{
                        background: isActive ? opt.bg : 'var(--bg-pill)',
                        border: `1px solid ${isActive ? opt.border : 'var(--border-input)'}`,
                        color: isActive ? opt.color : 'var(--text-secondary)',
                        fontWeight: isActive ? 700 : 500,
                      }}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: isActive ? opt.color : 'var(--border-input)' }} />
                      <span className="truncate">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
              {/* Inline follow-up date for schedule-followup / joining-later */}
              {needsFollowUp(panelStatus) && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[11px] shrink-0" style={{ color: 'var(--text-muted)' }}>Follow-up:</span>
                  <input
                    type="date"
                    value={panelFollowUpDate}
                    onChange={e => setPanelFollowUpDate(e.target.value)}
                    className="flex-1 h-[30px] px-2 text-[12px] rounded-lg outline-none"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}
                  />
                </div>
              )}
            </div>

            {/* Comment */}
            <div>
              <p className="text-[11px] font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Comment / Notes</p>
              <textarea
                rows={3}
                placeholder="Add a note about this audition…"
                value={panelComment}
                onChange={e => setPanelComment(e.target.value)}
                className="w-full px-3 py-2 text-[13px] rounded-xl outline-none resize-none placeholder-gray-400"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button onClick={saveSlotPanel} className="flex-1 h-[38px] text-[13px] font-semibold text-white rounded-xl cursor-pointer" style={{ background: '#0066FF' }}>
                Save
              </button>
              {panelSlot && !panelSlot.conversationId && !isReadOnly && (
                <button
                  type="button"
                  onClick={() => {
                    deleteCustomSlot(slotPanel.dateKey, slotPanel.slotId);
                    setSlotPanel(null);
                  }}
                  className="h-[38px] px-4 text-[13px] font-medium text-red-500 hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer"
                  style={{ border: '1px solid rgba(239, 68, 68, 0.3)' }}
                >
                  Delete
                </button>
              )}
              <button onClick={() => setSlotPanel(null)} className="h-[38px] px-5 text-[13px] font-medium rounded-xl cursor-pointer" style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)', color: 'var(--text-secondary)' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Book slot modal */}
      {bookingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl p-5 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                {bookingModal.dayLabel} · {bookingModal.time}
              </p>
              <h3 className="text-[17px] font-bold mt-0.5" style={{ color: 'var(--text-primary)' }}>Book Audition Slot</h3>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-[11px] font-bold mb-1 block" style={{ color: 'var(--text-primary)' }}>Branch *</label>
                <BranchSelect
                  value={bookForm.branch}
                  onChange={(b) => setBookForm((f) => ({ ...f, branch: b }))}
                  branchGroups={branchGroups}
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold mb-1 block" style={{ color: 'var(--text-secondary)' }}>Student Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Sarah Al-Ahmad"
                  value={bookForm.name}
                  onChange={e => setBookForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full h-[38px] px-3 text-[13px] rounded-xl outline-none"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold mb-1 block" style={{ color: 'var(--text-secondary)' }}>Type</label>
                  <select
                    value={bookForm.type}
                    onChange={e => setBookForm(f => ({ ...f, type: e.target.value }))}
                    className="w-full h-[38px] px-2.5 text-[13px] rounded-xl outline-none"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}
                  >
                    <option>Adult</option>
                    <option>Child</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold mb-1 block" style={{ color: 'var(--text-secondary)' }}>Age</label>
                  <input
                    type="text"
                    placeholder="e.g. 7"
                    value={bookForm.age}
                    onChange={e => setBookForm(f => ({ ...f, age: e.target.value }))}
                    className="w-full h-[38px] px-3 text-[13px] rounded-xl outline-none"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-semibold mb-1 block" style={{ color: 'var(--text-secondary)' }}>Instrument</label>
                <input
                  type="text"
                  placeholder="e.g. Piano, Violin, Vocal"
                  value={bookForm.instrument}
                  onChange={e => setBookForm(f => ({ ...f, instrument: e.target.value }))}
                  className="w-full h-[38px] px-3 text-[13px] rounded-xl outline-none"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold mb-1 block" style={{ color: 'var(--text-secondary)' }}>Assigned Agent</label>
                <select
                  value={bookForm.agent}
                  onChange={e => setBookForm(f => ({ ...f, agent: e.target.value }))}
                  className="w-full h-[38px] px-2.5 text-[13px] rounded-xl outline-none cursor-pointer"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}
                >
                  <option value="Unassigned">Unassigned</option>
                  {assignableAgents.map(a => (
                    <option key={a.name} value={a.name}>{a.name}</option>
                  ))}
                  {bookForm.agent && bookForm.agent !== 'Unassigned' && !assignableAgents.some(a => a.name === bookForm.agent) && (
                    <option value={bookForm.agent}>{bookForm.agent}</option>
                  )}
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-1 flex-wrap">
              <button disabled={!bookForm.name || !bookForm.branch} onClick={confirmBooking} className="flex-1 h-[38px] text-[13px] font-semibold text-white rounded-xl cursor-pointer disabled:opacity-50" style={{ background: '#0066FF' }}>
                Confirm Booking
              </button>
              <button onClick={() => setBookingModal(null)} className="h-[38px] px-4 text-[13px] font-medium rounded-xl cursor-pointer" style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)', color: 'var(--text-secondary)' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Slot Card ────────────────────────────────────────────────────────────────

function SlotCard({
  slot,
  onBook,
  onStatusChange,
  onOpenPanel,
  onOpenChat,
  onDelete,
  onToggleClosed,
  isReadOnly,
  isHighlighted,
}: {
  slot: Slot;
  onBook: () => void;
  onStatusChange: (s: SlotStatus) => void;
  onOpenPanel: () => void;
  onOpenChat?: () => void;
  onDelete?: () => void;
  onToggleClosed?: () => void;
  isReadOnly?: boolean;
  isHighlighted?: boolean;
}) {
  const highlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isHighlighted) return;
    const frameId = window.requestAnimationFrame(() => {
      highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [isHighlighted]);

  // ── Closed slot card ──
  if (slot.status === 'closed') {
    return (
      <div
        ref={isHighlighted ? highlightRef : undefined}
        className={`rounded-lg px-2.5 py-2 shadow-sm transition-all ${!isReadOnly ? "cursor-pointer hover:opacity-90" : ""}`}
        style={{
          background: 'rgba(239, 68, 68, 0.05)',
          border: '1px dashed rgba(239, 68, 68, 0.4)',
        }}
        onClick={!isReadOnly ? onOpenPanel : undefined}
      >
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[10px] font-bold leading-none" style={{ color: 'var(--text-secondary)' }}>{slot.time}</span>
              <span className="inline-flex items-center gap-0.5 text-[8px] font-bold px-1.5 py-0.5 rounded text-red-500 bg-red-500/10 border border-red-500/20">
                <Lock className="w-2.5 h-2.5" /> Closed
              </span>
            </div>
            {slot.name && slot.name !== 'Closed Slot' && (
              <p className="text-[11px] font-semibold leading-tight truncate" style={{ color: 'var(--text-primary)' }}>{slot.name}</p>
            )}
            <p className="text-[9px] mt-0.5 text-red-500/80 font-medium">Slot unavailable</p>
            {(slot.branch || (slot.agent && slot.agent !== 'Unassigned')) && (
              <div className="flex flex-col items-start gap-1 mt-1">
                {slot.branch && (
                  <div
                    className="inline-flex items-center gap-1 text-[8px] font-normal px-1.5 py-[0.5px] rounded max-w-full truncate leading-tight"
                    style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)' }}
                    title={slot.branch}
                  >
                    <MapPin className="w-2 h-2 shrink-0 text-red-500 opacity-70" />
                    <span className="truncate" style={{ color: 'var(--text-secondary)' }}>{slot.branch}</span>
                  </div>
                )}
                {slot.agent && slot.agent !== 'Unassigned' && (
                  <div className="inline-flex items-center gap-1 text-[8px] font-medium px-1.5 py-[0.5px] rounded max-w-full truncate leading-tight" style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)' }}>
                    <User className="w-2 h-2 shrink-0 text-red-500 opacity-70" />
                    <span className="truncate" style={{ color: 'var(--text-primary)' }}>{slot.agent}</span>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {onOpenChat && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onOpenChat(); }}
                className="w-5 h-5 flex items-center justify-center rounded text-[#0066FF] hover:bg-[#0066FF]/15 transition-colors"
                title="Open Chat in Inbox"
              >
                <MessageSquare className="w-3 h-3" />
              </button>
            )}
            {onDelete && !isReadOnly && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="w-4 h-4 rounded flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors text-xs font-bold leading-none cursor-pointer"
                title="Delete slot"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (slot.status === 'free') {
    return (
      <div
        onClick={!isReadOnly ? onBook : undefined}
        className={`group relative rounded-lg border border-dashed px-2.5 py-2 transition-all ${
          !isReadOnly ? "cursor-pointer hover:border-[#0066FF] hover:bg-blue-50/20" : "cursor-default"
        }`}
        style={{ borderColor: 'var(--border-main)', background: 'var(--bg-card)' }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>
            {slot.time}
          </span>
          {onDelete && !isReadOnly && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="w-4 h-4 rounded flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors text-xs font-bold leading-none cursor-pointer"
              title="Delete slot"
            >
              ✕
            </button>
          )}
        </div>
        {(slot.branch || slot.agent) && (
          <div className="flex flex-col items-start gap-1 mt-0.5">
            {slot.branch && (
              <div
                className="inline-flex items-center gap-1 text-[8px] font-normal px-1.5 py-[0.5px] rounded max-w-full truncate leading-tight"
                style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)' }}
                title={slot.branch}
              >
                <MapPin className="w-2 h-2 shrink-0 text-[#0066FF] opacity-70" />
                <span className="truncate" style={{ color: 'var(--text-secondary)' }}>{slot.branch}</span>
              </div>
            )}
            {slot.agent && (
              <div className="inline-flex items-center gap-1 text-[8px] font-medium px-1.5 py-[0.5px] rounded max-w-full truncate leading-tight" style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)' }}>
                <User className="w-2 h-2 shrink-0 text-[#0066FF] opacity-70" />
                <span className="truncate" style={{ color: 'var(--text-primary)' }}>{slot.agent}</span>
              </div>
            )}
          </div>
        )}
        <p className="text-[10px] mt-1 text-[#0066FF] font-medium">
          {!isReadOnly ? "Free — click to book" : "Free slot"}
        </p>
      </div>
    );
  }

  const displayType =
    slot.type &&
    slot.type.trim().toLowerCase() !== slot.comment?.trim().toLowerCase()
      ? slot.type
      : null;

  // Card with no outcome yet (Pending / Booked group)
  if (slot.status === 'booked') {
    return (
      <div
        ref={isHighlighted ? highlightRef : undefined}
        className={`rounded-lg px-2.5 py-2 shadow-sm ${!isReadOnly ? "cursor-pointer hover:opacity-90 transition-opacity" : ""}`}
        style={{
          background: 'var(--bg-selected)',
          border: '1px solid var(--border-main)',
          ...(isHighlighted ? {
            boxShadow: '0 0 0 2px rgba(0, 102, 255, 0.4), 0 0 12px rgba(0, 102, 255, 0.25)',
            animation: 'audition-glow 1.5s ease-in-out 2',
          } : {}),
        }}
        onClick={!isReadOnly ? onOpenPanel : undefined}
      >
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            <p className="text-[10px] font-bold leading-none mb-0.5" style={{ color: 'var(--text-primary)' }}>{slot.time}</p>
            {slot.name && <p className="text-[11px] font-semibold leading-tight truncate" style={{ color: 'var(--text-primary)' }}>{slot.name}</p>}
            {displayType && <p className="text-[10px] leading-tight" style={{ color: 'var(--text-secondary)' }}>{displayType}</p>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {onOpenChat && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onOpenChat(); }}
                className="w-5 h-5 flex items-center justify-center rounded text-[#0066FF] hover:bg-[#0066FF]/15 transition-colors"
                title="Open Chat in Inbox"
              >
                <MessageSquare className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Branch & Agent inside booking slot */}
        <div className="flex flex-col items-start gap-1 mt-1">
          {slot.branch && (
            <div
              className="inline-flex items-center gap-1 text-[8px] font-normal px-1.5 py-[0.5px] rounded max-w-full truncate leading-tight"
              style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)' }}
              title={slot.branch}
            >
              <MapPin className="w-2 h-2 shrink-0 text-[#0066FF] opacity-80" />
              <span className="truncate" style={{ color: 'var(--text-secondary)' }}>{slot.branch}</span>
            </div>
          )}
          <div className="inline-flex items-center gap-1 text-[8px] font-medium px-1.5 py-[0.5px] rounded max-w-full truncate leading-tight" style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)' }}>
            <User className="w-2 h-2 shrink-0 text-[#0066FF] opacity-80" />
            <span className="truncate" style={{ color: 'var(--text-primary)' }}>{slot.agent || 'Unassigned'}</span>
          </div>
        </div>

        {slot.comment ? (
          <p className="text-[10px] mt-1.5 leading-snug line-clamp-2 px-1.5 py-0.5 rounded" style={{ color: 'var(--text-secondary)', background: 'var(--bg-pill)' }}>
            💬 {slot.comment}
          </p>
        ) : !isReadOnly ? (
          <p className="text-[9px] mt-1 text-[#0066FF] opacity-75 hover:opacity-100">+ Add note / status</p>
        ) : null}
        {!isReadOnly && (
          <div className="flex items-center gap-1.5 mt-2">
            <button
              onClick={(e) => { e.stopPropagation(); onStatusChange('registered'); }}
              className="text-[9px] font-bold text-white px-2.5 py-0.5 rounded-full hover:opacity-90 whitespace-nowrap cursor-pointer"
              style={{ background: '#10B981' }}
            >
              ✓ Registered
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onStatusChange('no-show'); }}
              className="text-[9px] font-bold border px-2.5 py-0.5 rounded-full whitespace-nowrap cursor-pointer hover:bg-[#EF4444]/10"
              style={{ color: '#EF4444', borderColor: 'rgba(239, 68, 68, 0.3)', background: 'transparent' }}
            >
              No show
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Outcome cards (all 5 statuses) ──
  // Use OUTCOME_CONFIG for consistent styling
  const outcomeKey = slot.status as AuditionOutcome;
  const cfg = OUTCOME_CONFIG[outcomeKey];

  if (!cfg) {
    // Fallback for any unknown status
    return null;
  }

  // "Registered" gets a solid color card (like old attended)
  if (slot.status === 'registered') {
    return (
      <div
        ref={isHighlighted ? highlightRef : undefined}
        className={`rounded-lg px-2.5 py-2 shadow-sm ${!isReadOnly ? "cursor-pointer hover:opacity-95 transition-opacity" : ""}`}
        style={{
          background: cfg.color,
          ...(isHighlighted ? {
            boxShadow: '0 0 0 2px rgba(0, 102, 255, 0.4), 0 0 12px rgba(0, 102, 255, 0.25)',
            animation: 'audition-glow 1.5s ease-in-out 2',
          } : {}),
        }}
        onClick={!isReadOnly ? onOpenPanel : undefined}
      >
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-white leading-none mb-0.5">{slot.time}</p>
            {slot.name && <p className="text-[11px] font-semibold text-white leading-tight truncate">{slot.name}</p>}
            {displayType && <p className="text-[10px] text-white/80 leading-tight">{displayType}</p>}
          </div>
          {onOpenChat && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpenChat(); }}
              className="w-5 h-5 flex items-center justify-center rounded text-white hover:bg-white/20 transition-colors shrink-0"
              title="Open Chat in Inbox"
            >
              <MessageSquare className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Branch & Agent inside registered slot */}
        <div className="flex flex-col items-start gap-1 mt-1">
          {slot.branch && (
            <div
              className="inline-flex items-center gap-1 text-[8px] font-normal px-1.5 py-[0.5px] rounded max-w-full truncate leading-tight bg-black/20 text-white"
              title={slot.branch}
            >
              <MapPin className="w-2 h-2 shrink-0 opacity-80" />
              <span className="truncate text-white/90">{slot.branch}</span>
            </div>
          )}
          <div className="inline-flex items-center gap-1 text-[8px] font-medium px-1.5 py-[0.5px] rounded max-w-full truncate leading-tight bg-black/20 text-white">
            <User className="w-2 h-2 shrink-0 opacity-80" />
            <span className="truncate text-white">{slot.agent || 'Unassigned'}</span>
          </div>
        </div>

        {slot.comment ? (
          <p className="text-[10px] mt-1.5 leading-snug line-clamp-2 text-white/95 bg-black/15 px-1.5 py-0.5 rounded">
            💬 {slot.comment}
          </p>
        ) : !isReadOnly ? (
          <p className="text-[9px] mt-1 text-white/80 hover:text-white">+ Add note</p>
        ) : null}
        <div className="flex flex-wrap gap-1 mt-1.5">
          <span className="text-[8px] font-bold bg-white/30 text-white px-2 py-0.5 rounded-full whitespace-nowrap">{cfg.icon} {cfg.badge}</span>
        </div>
      </div>
    );
  }

  // All other outcomes: bordered card with outcome color accent
  return (
    <div
      ref={isHighlighted ? highlightRef : undefined}
      className={`rounded-lg px-2.5 py-2 shadow-sm ${!isReadOnly ? "cursor-pointer hover:opacity-90 transition-opacity" : ""}`}
      style={{
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        ...(isHighlighted ? {
          boxShadow: '0 0 0 2px rgba(0, 102, 255, 0.4), 0 0 12px rgba(0, 102, 255, 0.25)',
          animation: 'audition-glow 1.5s ease-in-out 2',
        } : {}),
      }}
      onClick={!isReadOnly ? onOpenPanel : undefined}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="text-[10px] font-bold leading-none mb-0.5" style={{ color: 'var(--text-primary)' }}>{slot.time}</p>
          {slot.name && <p className="text-[11px] font-semibold leading-tight truncate" style={{ color: 'var(--text-primary)' }}>{slot.name}</p>}
          {displayType && <p className="text-[10px] leading-tight" style={{ color: cfg.color }}>{displayType}</p>}
        </div>
        {onOpenChat && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenChat(); }}
            className="w-5 h-5 flex items-center justify-center rounded transition-colors shrink-0"
            style={{ color: cfg.color }}
            title="Open Chat in Inbox"
          >
            <MessageSquare className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Branch & Agent inside outcome slot */}
      <div className="flex flex-col items-start gap-1 mt-1">
        {slot.branch && (
          <div
            className="inline-flex items-center gap-1 text-[8px] font-normal px-1.5 py-[0.5px] rounded max-w-full truncate leading-tight"
            style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)' }}
            title={slot.branch}
          >
            <MapPin className="w-2 h-2 shrink-0 opacity-70" style={{ color: cfg.color }} />
            <span className="truncate" style={{ color: 'var(--text-secondary)' }}>{slot.branch}</span>
          </div>
        )}
        <div className="inline-flex items-center gap-1 text-[8px] font-medium px-1.5 py-[0.5px] rounded max-w-full truncate leading-tight" style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)' }}>
          <User className="w-2 h-2 shrink-0 opacity-70" style={{ color: cfg.color }} />
          <span className="truncate" style={{ color: 'var(--text-primary)' }}>{slot.agent || 'Unassigned'}</span>
        </div>
      </div>

      {slot.comment ? (
        <p className="text-[10px] mt-1.5 leading-snug line-clamp-2 px-1.5 py-0.5 rounded" style={{ color: cfg.color, background: `${cfg.color}10` }}>
          💬 {slot.comment}
        </p>
      ) : !isReadOnly ? (
        <p className="text-[9px] mt-1 opacity-75 hover:opacity-100" style={{ color: cfg.color }}>+ Add note</p>
      ) : null}
      <div className="flex flex-wrap gap-1 mt-1.5">
        <span className="text-[8px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: `${cfg.color}20`, color: cfg.color }}>{cfg.icon} {cfg.badge}</span>
        {slot.followUpDate && (
          <span className="text-[8px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: 'var(--bg-pill)', color: 'var(--text-secondary)', border: '1px solid var(--border-input)' }}>
            📅 {slot.followUpDate}
          </span>
        )}
      </div>
    </div>
  );
}

export default function AuditionsPage() {
  return (
    <Suspense fallback={null}>
      <AuditionsPageInner />
    </Suspense>
  );
}
