"use client";

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useCRM } from '../context/CRMContext';
import { useAuth } from '../components/AuthProvider';
import { MessageSquare, Calendar, ChevronLeft, ChevronRight, X, MapPin, ChevronDown, Search } from 'lucide-react';
import { useBranches, LegacyBranchGroup } from '../lib/branches';
import { BranchSelect } from '../components/BranchSelect';

type AuditionOutcome = 'registered' | 'schedule-followup' | 'paid-trial' | 'joining-later' | 'no-show';
type SlotStatus = AuditionOutcome | 'booked';
type AuditionStatus = SlotStatus | 'free';

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
    // New 5 outcomes
    if (val === 'registered' || val === 'schedule-followup' || val === 'paid-trial' || val === 'joining-later' || val === 'no-show' || val === 'booked') return val as SlotStatus;
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
    case 'joining-later': return 'Contacted';
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
      {/* Trigger Button: formal, simple white */}
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="h-[28px] px-2.5 text-[11px] font-medium rounded-[6px] flex items-center gap-1.5 transition-colors cursor-pointer select-none bg-white hover:bg-gray-50"
        style={{
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
            className="text-gray-400 hover:text-red-500 font-bold ml-0.5 text-[10px] leading-none"
            title="Reset to All"
          >
            ✕
          </span>
        )}
        <ChevronDown
          className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 shrink-0 ${
            open ? 'rotate-180' : ''
          }`}
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

export default function AuditionsPage() {
  const { conversations, patchConversation, openChat } = useCRM();
  const { isReadOnly } = useAuth();
  const { branchGroups, legacyBranchGroups } = useBranches();
  const [currentDate, setCurrentDate] = useState(() => {
    return getWeekStart(new Date());
  });
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
  const [bookForm, setBookForm] = useState({ branch: '', name: '', type: 'Adult', age: '', instrument: '' });
  const [slotPanel, setSlotPanel] = useState<SlotPanelState>(null);
  const [panelComment, setPanelComment] = useState('');
  const [panelStatus, setPanelStatus] = useState<SlotStatus>('booked');
  const [panelFollowUpDate, setPanelFollowUpDate] = useState('');

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
      Boolean(c.auditionOutcome) ||
      statusOverrides[c.id] !== undefined ||
      statusOverrides[`crm-${c.id}`] !== undefined ||
      (c.pipeline === "Contacted" && Boolean(c.auditionDate)) ||
      (c.pipeline === "Lost" && (
        Boolean(c.auditionDate) ||
        Boolean(c.followUpDate) ||
        Boolean(c.notes) ||
        Boolean(c.formAnswers?.instrument)
      ))
    );
  }, [conversations, statusOverrides]);

  // Merge live CRM pipeline cards into calendar schedule with zero mock test data
  const slots = useMemo<DaySlots>(() => {
    const result: DaySlots = {};

    liveAuditionConvs.forEach(c => {
      const localLockedDate = auditionDates[c.id] || auditionDates[`crm-${c.id}`];
      const lockedDate = localLockedDate || c.auditionDate || (c.followUpDate && /^\d{4}-\d{2}-\d{2}$/.test(c.followUpDate) ? c.followUpDate : null);
      const dateKey = lockedDate || getConvDate(c, todayIso);
      const override = statusOverrides[c.id] || statusOverrides[`crm-${c.id}`];

      let slotStatus: AuditionStatus = 'booked';

      if (override) {
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
      result[dateKey].push(...(customSlots[dateKey] || []));
    });

    return result;
  }, [liveAuditionConvs, customSlots, todayIso, statusOverrides, auditionDates]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(currentDate, i));
  }, [currentDate]);
  const weekEnd = weekDays[6];

  const prevWeek = () => setCurrentDate(d => addDays(d, -7));
  const nextWeek = () => setCurrentDate(d => addDays(d, 7));
  const goThisWeek = () => {
    setCurrentDate(getWeekStart(new Date()));
  };

  const confirmAddSlot = () => {
    if (!addingSlot) return;
    const formattedTime = formatTime12(addingSlot.time || '17:00');
    const branchToAssign =
      selectedBranch && selectedBranch !== 'ALL' && !selectedBranch.startsWith('REGION:')
        ? selectedBranch
        : undefined;
    const newSlot: Slot = {
      id: `custom-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      time: formattedTime,
      status: 'free',
      agent: addingSlot.agent.trim() || 'Jwana',
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
    setBookForm({ branch: prefillBranch, name: '', type: 'Adult', age: '', instrument: '' });
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
            }
            : s
        ),
      }));
    }
    setSlotPanel(null);
  }, [slotPanel, slots, panelComment, panelStatus, panelFollowUpDate, isReadOnly, patchConversation, updateStatusOverride, saveAuditionDate, updateCustomSlotsState]);

  const panelSlot = slotPanel ? (slots[slotPanel.dateKey] || []).find(s => s.id === slotPanel.slotId) : null;

  // Real-time weekly counts for every branch and region (0ms in-memory calculation)
  const branchCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: 0 };
    legacyBranchGroups.forEach(g => {
      counts[`REGION:${g.region}`] = 0;
      g.branches.forEach(b => {
        counts[b] = 0;
      });
    });

    weekDays.forEach(day => {
      const key = isoDate(day);
      const daySlots = slots[key] || [];
      daySlots.forEach(s => {
        if (s.status === 'free') return;
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
  }, [weekDays, slots, legacyBranchGroups]);

  // Dynamic column sizing: expand days with > 5 auditions to 420px so 2-column cards are wide and spacious
  const gridTemplate = useMemo(() => {
    return weekDays.map(day => {
      const key = isoDate(day);
      const rawDaySlots = slots[key] || [];
      const count = rawDaySlots.filter(s => {
        if (s.status === 'free' && !s.branch) return true;
        return matchesBranch(s.branch, selectedBranch);
      }).length;
      return count > 5 ? 'minmax(420px, 2.5fr)' : 'minmax(180px, 1fr)';
    }).join(' ');
  }, [weekDays, slots, selectedBranch]);

  return (
    <div className="flex flex-col h-full min-h-0 relative" style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}>

      {/* Header */}
      <div className="px-4 md:px-6 py-4 flex items-center justify-between shrink-0" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-main)' }}>
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-[15px] font-bold leading-none mb-0.5" style={{ color: 'var(--text-primary)' }}>Auditions Calendar</h1>
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              {formatRangeLabel(currentDate, weekEnd)}
            </p>
          </div>
          {liveAuditionConvs.length > 0 && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
              <Calendar className="w-3.5 h-3.5" />
              {liveAuditionConvs.length} Live Pipeline
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">

          {/* Branch Filter dropdown in the old place on the right */}
          <BranchFilterPopover
            selectedBranch={selectedBranch}
            onSelectBranch={handleSelectBranch}
            branchCounts={branchCounts}
            branchGroups={legacyBranchGroups}
          />

          {/* Flexible Date Picker */}
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
            title="Select start date"
          />

          {/* Navigation Controls: Previous Week, This Week, Next Week */}
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

            <button
              onClick={goThisWeek}
              className="h-[28px] px-2.5 text-[11px] font-medium rounded-[6px] transition-colors flex items-center justify-center cursor-pointer hover:opacity-80"
              style={{
                background: 'var(--bg-pill)',
                border: '1px solid var(--border-input)',
                color: 'var(--text-primary)',
              }}
              title="Jump to this week"
            >
              This Week
            </button>

            <button
              onClick={nextWeek}
              className="h-[28px] w-[28px] flex items-center justify-center rounded-[6px] transition-colors cursor-pointer hover:opacity-80"
              style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)', color: 'var(--text-secondary)' }}
              title="Next Week"
              aria-label="Next Week"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Calendar - Week View */}
      <div className="flex-1 min-h-0 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="overflow-x-auto w-full">
          <div className="min-w-fit w-full flex flex-col">
            {/* Day headers */}
            <div className="grid" style={{ gridTemplateColumns: gridTemplate, borderBottom: '1px solid var(--border-sidebar)' }}>
              {weekDays.map((day) => {
                const key = isoDate(day);
                const weekdayShort = day.toLocaleDateString('en-US', { weekday: 'short' });
                const rawDaySlots = slots[key] || [];
                const daySlots = rawDaySlots.filter(s => {
                  if (s.status === 'free' && !s.branch) return true;
                  return matchesBranch(s.branch, selectedBranch);
                });
                return (
                  <div
                    key={key}
                    className="py-2.5 px-2 text-center transition-colors"
                    style={{
                      borderRight: '1px solid var(--border-sidebar)',
                      background: 'var(--bg-card)',
                      borderTop: '2px solid transparent',
                    }}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span
                        className="text-[11px] font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {weekdayShort}
                      </span>
                      <span
                        className="text-[12px] font-bold min-w-[22px] h-[22px] rounded-full flex items-center justify-center px-1"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {day.getDate()}
                      </span>
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
                const rawDaySlots = slots[key] || [];
                const daySlots = rawDaySlots.filter(s => {
                  if (s.status === 'free' && !s.branch) return true;
                  return matchesBranch(s.branch, selectedBranch);
                });
                const isAddingHere = addingSlot?.dateKey === key;
                const isMultiCol = daySlots.length > 5;

                // Optimal Real-Time Arrangement:
                // 1. Booked (pending action - top priority for staff)
                // 2. Schedule Follow-up / Joining Later / Paid Trial (in progress)
                // 3. No-Show
                // 4. Registered (completed)
                // 5. Free slots
                const bookedSlots = daySlots.filter(s => s.status === 'booked');
                const followUpSlots = daySlots.filter(s => s.status === 'schedule-followup');
                const joiningSlots = daySlots.filter(s => s.status === 'joining-later');
                const paidTrialSlots = daySlots.filter(s => s.status === 'paid-trial');
                const noShowSlots = daySlots.filter(s => s.status === 'no-show');
                const registeredSlots = daySlots.filter(s => s.status === 'registered');
                const freeSlots = daySlots.filter(s => s.status === 'free');
                const orderedSlots = [...bookedSlots, ...followUpSlots, ...joiningSlots, ...paidTrialSlots, ...noShowSlots, ...registeredSlots, ...freeSlots];

                return (
                  <div key={key} className="p-2.5" style={{ borderRight: '1px solid var(--border-sidebar)', background: 'transparent' }}>
                    <div className={isMultiCol ? "grid grid-cols-2 gap-2" : "flex flex-col gap-2"}>
                      {orderedSlots.map(slot => (
                        <SlotCard
                          key={slot.id}
                          slot={slot}
                          onBook={() => openBooking(slot.id, key, slot.time, day)}
                          onStatusChange={(status) => setSlotStatus(key, slot.id, status)}
                          onOpenPanel={() => openSlotPanel(slot.id, key)}
                          onOpenChat={slot.conversationId ? () => openChat(slot.conversationId!) : undefined}
                          onDelete={slot.status === 'free' ? () => deleteCustomSlot(key, slot.id) : undefined}
                          isReadOnly={isReadOnly}
                        />
                      ))}
                      {isAddingHere ? (
                        <div className={`rounded-lg p-2 flex flex-col gap-1.5 shadow-sm ${isMultiCol ? 'col-span-2' : ''}`} style={{ border: '1px solid var(--border-input)', background: 'var(--bg-card)' }}>
                          <input type="time" value={addingSlot.time}
                            onChange={e => setAddingSlot(a => a ? { ...a, time: e.target.value } : a)}
                            onKeyDown={e => { if (e.key === 'Enter') confirmAddSlot(); }}
                            className="w-full h-[26px] px-2 text-[11px] rounded-[4px] outline-none"
                            style={{ border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)' }} />
                          <input type="text" placeholder="Staff (optional)" value={addingSlot.agent}
                            onChange={e => setAddingSlot(a => a ? { ...a, agent: e.target.value } : a)}
                            onKeyDown={e => { if (e.key === 'Enter') confirmAddSlot(); }}
                            className="w-full h-[26px] px-2 text-[11px] rounded-[4px] outline-none placeholder-gray-400"
                            style={{ border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)' }} />
                          <div className="flex gap-1">
                            <button onClick={confirmAddSlot} className="flex-1 h-[24px] text-[11px] font-semibold text-white bg-[#0066FF] rounded-[4px] cursor-pointer">Add</button>
                            <button onClick={() => setAddingSlot(null)} className="w-[24px] h-[24px] text-[11px] rounded-[4px] cursor-pointer" style={{ background: 'var(--bg-pill)', color: 'var(--text-secondary)' }}>✕</button>
                          </div>
                        </div>
                      ) : !isReadOnly ? (
                        <button onClick={() => setAddingSlot({ dateKey: key, time: '17:00', agent: '' })}
                          className={`text-[10px] py-1.5 text-center w-full rounded-lg border border-dashed cursor-pointer ${isMultiCol ? 'col-span-2' : ''}`}
                          style={{ color: 'var(--text-muted)', borderColor: 'var(--border-main)' }}>
                          + Add slot
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Attendance & Notes modal */}
      {slotPanel && panelSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl p-5 shadow-2xl flex flex-col gap-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}>
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  {formatDayLabel(new Date(slotPanel.dateKey + 'T00:00:00'))} · {panelSlot.time}
                </p>
                <h3 className="text-[17px] font-bold mt-0.5" style={{ color: 'var(--text-primary)' }}>
                  {panelSlot.name || 'Audition Slot'}
                </h3>
                {panelSlot.type && (
                  <p className="text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>{panelSlot.type}</p>
                )}
                {panelSlot.phone && (
                  <p className="text-[11px] mt-0.5 font-mono" style={{ color: 'var(--text-muted)' }}>{panelSlot.phone}</p>
                )}
                {panelSlot.branch && (
                  <div className="mt-1.5">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md" style={{ color: '#0066FF', background: 'rgba(0, 102, 255, 0.1)', border: '1px solid rgba(0, 102, 255, 0.25)' }}>
                      📍 {panelSlot.branch}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {panelSlot.conversationId && (
                  <button
                    onClick={() => {
                      const cid = panelSlot.conversationId!;
                      setSlotPanel(null);
                      openChat(cid);
                    }}
                    className="p-1.5 rounded-lg text-[#0066FF] hover:bg-[#0066FF]/10 transition-colors"
                    title="Open Chat in Inbox"
                  >
                    <MessageSquare className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => setSlotPanel(null)} className="p-1.5 rounded-lg" style={{ color: 'var(--text-secondary)', background: 'var(--bg-pill)' }}>
                  <X className="w-4 h-4" />
                </button>
              </div>
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
            </div>
            <div className="flex gap-2 pt-1">
              <button disabled={!bookForm.name || !bookForm.branch} onClick={confirmBooking} className="flex-1 h-[38px] text-[13px] font-semibold text-white rounded-xl cursor-pointer disabled:opacity-50" style={{ background: '#0066FF' }}>
                Confirm Booking
              </button>
              <button onClick={() => setBookingModal(null)} className="h-[38px] px-5 text-[13px] font-medium rounded-xl cursor-pointer" style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)', color: 'var(--text-secondary)' }}>
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
  isReadOnly,
}: {
  slot: Slot;
  onBook: () => void;
  onStatusChange: (s: SlotStatus) => void;
  onOpenPanel: () => void;
  onOpenChat?: () => void;
  onDelete?: () => void;
  isReadOnly?: boolean;
}) {
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
        {slot.agent && (
          <span className="text-[10px] block" style={{ color: 'var(--text-muted)' }}>
            {slot.agent}
          </span>
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
        className={`rounded-lg px-2.5 py-2 shadow-sm ${!isReadOnly ? "cursor-pointer hover:opacity-90 transition-opacity" : ""}`}
        style={{
          background: 'var(--bg-selected)',
          border: '1px solid var(--border-main)',
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
        className={`rounded-lg px-2.5 py-2 shadow-sm ${!isReadOnly ? "cursor-pointer hover:opacity-95 transition-opacity" : ""}`}
        style={{ background: cfg.color }}
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
      className={`rounded-lg px-2.5 py-2 shadow-sm ${!isReadOnly ? "cursor-pointer hover:opacity-90 transition-opacity" : ""}`}
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
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
