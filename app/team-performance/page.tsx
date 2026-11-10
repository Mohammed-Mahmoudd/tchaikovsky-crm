"use client";

import React, { useState, useMemo, useCallback, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useCRM, Conversation, ActivityLogEntry } from '../context/CRMContext';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  MessageSquare,
  Search,
  CheckCircle2,
  Clock,
  ArrowRight,
  UserCheck,
  FileText,
  Banknote,
  Award,
  Users,
  X,
  List,
  GitCommit,
  ExternalLink,
  Mail,
  Activity,
  TrendingUp,
} from 'lucide-react';

/* ── Date Helpers (Saudi / Cairo week: Sat–Fri) ── */

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatRangeLabel(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const yr = start.getFullYear() !== end.getFullYear() ? `, ${start.getFullYear()}` : '';
  const endYr = `, ${end.getFullYear()}`;
  return `${start.toLocaleDateString('en-US', opts)}${yr} – ${end.toLocaleDateString('en-US', opts)}${endYr}`;
}

function formatDayLabel(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime24Or12(timestamp: number): string {
  if (!timestamp) return '—';
  const d = new Date(timestamp);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatCompactRelativeTime(timestamp?: number): string {
  if (!timestamp) return '—';
  const now = new Date();
  const d = new Date(timestamp);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;

  if (timestamp >= todayStart) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  if (timestamp >= yesterdayStart) {
    return 'Yesterday';
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDayGroupHeader(dateKey: string, todayKey: string, yesterdayKey: string): string {
  if (dateKey === todayKey) return 'Today';
  if (dateKey === yesterdayKey) return 'Yesterday';
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return dateKey;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getDayStart(from: Date): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getDayEnd(from: Date): Date {
  const d = new Date(from);
  d.setHours(23, 59, 59, 999);
  return d;
}

function getWeekStart(from: Date): Date {
  const d = new Date(from);
  const day = d.getDay();
  const diff = day === 6 ? 0 : day + 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekEnd(start: Date): Date {
  const d = new Date(start);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

/* ── Conversation Timestamp & Attribution Helpers ── */

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
  if (!isBookedLead(c) && !c.auditionDate) return null;
  const explicit =
    c.auditionBookedAt ||
    (typeof c.source === 'object' && c.source?.auditionBookedAt ? c.source.auditionBookedAt : undefined);
  if (explicit) {
    const t = new Date(explicit).getTime();
    if (!isNaN(t)) return t;
  }
  if (c.pipeline === 'Audition Booked') {
    const upd = getUpdatedTime(c);
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
  if (!isAttendedLead(c) && (!c.auditionOutcome || c.auditionOutcome === 'booked')) return null;
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
      return new Date(y, m - 1, d, 14, 0, 0, 0).getTime();
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

function getDisplayName(c: Conversation): string {
  return c.leadName || c.profileName || c.name || c.phone || c.id;
}

function getCampaignName(c: Conversation): string {
  if (typeof c.source === 'object' && c.source?.campaign) {
    return c.source.campaign;
  }
  if (typeof c.source === 'string' && c.source.trim() && c.source.trim() !== 'direct') {
    return c.source.trim();
  }
  return 'Direct';
}

function formatRoleLabel(role?: string): string {
  if (!role) return 'Admission Officer';
  const r = role.toLowerCase().trim();
  if (r === 'chairman' || r === 'owner' || r === 'manager') return 'Chairman';
  if (r === 'enrollment_director') return 'Enrollment Director';
  if (r === 'admission_officer' || r === 'agent') return 'Admission Officer';
  if (r === 'finance' || r === 'analyst') return 'Finance';
  if (r === 'marketing') return 'Marketing';
  return role.replace(/_/g, ' ');
}

function formatOutcomeLabel(outcome?: string): string {
  if (!outcome) return '';
  const map: Record<string, string> = {
    registered: 'Registered (Enrolled)',
    'paid-trial': 'Paid Trial',
    'schedule-followup': 'Attended · Follow-up',
    'joining-later': 'Joining Later',
    'no-show': 'No-Show',
    booked: 'Booked',
  };
  return map[outcome] || outcome;
}

// ── Stage Colors (Matching /pipeline, /leads, and / inbox) ──
const STAGE_COLORS: Record<string, string> = {
  New: '#007AFF',
  Contacted: '#5856D6',
  Qualified: '#30B0C7',
  'Audition Booked': '#FF9500',
  Attended: '#34C759',
  Enrolled: '#30D158',
  'Joining Later': '#F59E0B',
  Unqualified: '#8E8E93',
  Lost: '#FF3B30',
};

function getStageColor(stage?: string): string {
  if (!stage) return '#8E8E93';
  const clean = stage.trim();
  if (STAGE_COLORS[clean]) return STAGE_COLORS[clean];
  const lower = clean.toLowerCase();
  for (const [key, color] of Object.entries(STAGE_COLORS)) {
    if (key.toLowerCase() === lower) return color;
  }
  return '#8E8E93';
}

function getStageBadgeStyle(stage?: string): React.CSSProperties {
  const color = getStageColor(stage);
  return {
    backgroundColor: `${color}18`,
    color: color,
    border: `1px solid ${color}35`,
  };
}

function getChannelColor(channel?: string): string {
  if (!channel) return '#0084FF';
  const norm = channel.trim().toLowerCase();
  if (norm.includes('wa') || norm.includes('whats')) {
    return '#25D366';
  }
  if (norm.includes('ig') || norm.includes('insta')) {
    return '#E1306C';
  }
  if (norm.includes('fb') || norm.includes('mess') || norm.includes('face')) {
    return '#0084FF';
  }
  return '#0084FF';
}

function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ── Unified Activity Model ── */

export type ActivityCategory =
  | 'all'
  | 'messages'
  | 'pipeline'
  | 'auditions'
  | 'followups'
  | 'payments'
  | 'assignments';

export type EnrichedActivity = {
  id: string;
  conversationId: string;
  leadName: string;
  leadPhone: string;
  channel: string;
  branch: string;
  pipeline: string;
  type: ActivityLogEntry['type'];
  category: Exclude<ActivityCategory, 'all'>;
  actor: string;
  actorRole: string;
  summary: string;
  detail: string;
  fromValue?: string;
  toValue?: string;
  timestamp: number;
  dateKey: string;
};

export type StaffSummary = {
  name: string;
  role: string;
  email?: string;
  avatar?: string;
  periodActivitiesCount: number;
  totalLeadsAssigned: number;
  periodLeadsAssigned: number;
  waitingReplyCount: number;
  bookedInPeriod: number;
  attendedInPeriod: number;
  enrolledInPeriod: number;
  cashInPeriod: number;
  messagesInPeriod: number;
  lastActiveAt: number;
  allTimeLeads: number;
  allTimeBooked: number;
  allTimeAttended: number;
  allTimeEnrolled: number;
  allTimeCash: number;
};

export type TeamFunnelMetrics = {
  totalLeads: number;
  totalBooked: number;
  totalAttended: number;
  totalEnrolled: number;
  totalCash: number;
  activeStaffCount: number;
  bookingRate: number;
  showRate: number;
  closingRate: number;
};

function mapTypeToCategory(type: ActivityLogEntry['type']): Exclude<ActivityCategory, 'all'> {
  switch (type) {
    case 'message_sent':
      return 'messages';
    case 'stage_changed':
    case 'note_updated':
    case 'branch_changed':
      return 'pipeline';
    case 'audition_booked':
    case 'audition_outcome':
      return 'auditions';
    case 'followup_scheduled':
    case 'followup_completed':
      return 'followups';
    case 'cash_recorded':
      return 'payments';
    case 'lead_assigned':
      return 'assignments';
    default:
      return 'pipeline';
  }
}

function getNaturalActionPhrase(act: EnrichedActivity): string {
  switch (act.type) {
    case 'message_sent':
      return act.channel.includes('WA')
        ? 'sent a WhatsApp reply to'
        : act.channel.includes('IG')
        ? 'replied on Instagram to'
        : 'replied on Messenger to';
    case 'audition_booked':
      return 'booked an audition for';
    case 'audition_outcome':
      return 'marked audition outcome for';
    case 'cash_recorded':
      return 'recorded payment for';
    case 'stage_changed':
      return 'moved pipeline stage for';
    case 'followup_completed':
      return 'completed follow-up with';
    case 'followup_scheduled':
      return 'scheduled a follow-up for';
    case 'lead_assigned':
      return act.toValue && act.toValue !== act.actor
        ? `assigned lead to ${act.toValue}:`
        : 'claimed new lead:';
    case 'note_updated':
      return 'added note for';
    case 'branch_changed':
      return 'updated branch for';
    default:
      return 'updated';
  }
}

function TeamActivitiesPageInner() {
  const { conversations, assignableAgents, teamMembers, loading, openChat } = useCRM();
  const searchParams = useSearchParams();
  const urlAgent = searchParams.get('agent') || searchParams.get('officer');

  // Date filter state
  const [filterMode, setFilterMode] = useState<'all' | 'day' | 'week'>('all');
  const [currentDate, setCurrentDate] = useState<Date>(() => getDayStart(new Date()));

  // Selected agent in the right sidebar (empty initially; resolves to urlAgent or most active agent staffList[0])
  const [selectedAgent, setSelectedAgent] = useState<string>(() => (urlAgent || '').trim());

  // Update selected agent if query param changes
  useEffect(() => {
    if (urlAgent && urlAgent.trim()) {
      setSelectedAgent(urlAgent.trim());
    }
  }, [urlAgent]);

  // Main view mode: 'timeline' | 'funnel' | 'leads'
  const [mainTab, setMainTab] = useState<'timeline' | 'funnel' | 'leads'>('timeline');

  // Activity presentation mode: 'timeline' (rich storytelling cards) vs 'compact' (borderless dense scanner)
  const [feedViewStyle, setFeedViewStyle] = useState<'timeline' | 'compact'>('timeline');

  // Activity category filter
  const [categoryFilter, setCategoryFilter] = useState<ActivityCategory>('all');

  // Search queries
  const [activitySearch, setActivitySearch] = useState<string>('');
  const [agentSearch, setAgentSearch] = useState<string>('');
  const [agentRoleFilter, setAgentRoleFilter] = useState<string>('all');

  // Mobile drawer state for right sidebar
  const [mobileAgentsOpen, setMobileAgentsOpen] = useState<boolean>(false);

  // Date boundaries
  const todayStart = useMemo(() => getDayStart(new Date()), []);
  const yesterdayStart = useMemo(() => addDays(todayStart, -1), [todayStart]);
  const thisWeekStart = useMemo(() => getWeekStart(new Date()), []);
  const lastWeekStart = useMemo(() => addDays(thisWeekStart, -7), [thisWeekStart]);

  const todayKey = useMemo(() => isoDate(todayStart), [todayStart]);
  const yesterdayKey = useMemo(() => isoDate(yesterdayStart), [yesterdayStart]);

  const dayStart = useMemo(() => getDayStart(currentDate), [currentDate]);
  const dayEnd = useMemo(() => getDayEnd(currentDate), [currentDate]);
  const weekStart = useMemo(() => getWeekStart(currentDate), [currentDate]);
  const weekEnd = useMemo(() => getWeekEnd(weekStart), [weekStart]);

  const isToday = filterMode === 'day' && dayStart.getTime() === todayStart.getTime();
  const isYesterday = filterMode === 'day' && dayStart.getTime() === yesterdayStart.getTime();
  const isThisWeek = filterMode === 'week' && weekStart.getTime() === thisWeekStart.getTime();
  const isLastWeek = filterMode === 'week' && weekStart.getTime() === lastWeekStart.getTime();

  const goAllTime = () => setFilterMode('all');
  const goToday = () => { setCurrentDate(todayStart); setFilterMode('day'); };
  const goYesterday = () => { setCurrentDate(yesterdayStart); setFilterMode('day'); };
  const goThisWeek = () => { setCurrentDate(thisWeekStart); setFilterMode('week'); };
  const goLastWeek = () => { setCurrentDate(lastWeekStart); setFilterMode('week'); };

  const stepPrev = () => {
    if (filterMode === 'day') {
      setCurrentDate((d) => addDays(d, -1));
    } else {
      setCurrentDate((d) => addDays(d, -7));
      setFilterMode('week');
    }
  };

  const stepNext = () => {
    if (filterMode === 'day') {
      setCurrentDate((d) => addDays(d, 1));
    } else {
      setCurrentDate((d) => addDays(d, 7));
      setFilterMode('week');
    }
  };

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

  // Role lookup map from both teamMembers and assignableAgents
  const roleMap = useMemo(() => {
    const map = new Map<string, string>();
    const sourceList = teamMembers && teamMembers.length > 0 ? teamMembers : assignableAgents;
    sourceList.forEach((m) => {
      if (m.name) {
        map.set(m.name.trim().toLowerCase(), m.role || 'admission_officer');
      }
    });
    return map;
  }, [teamMembers, assignableAgents]);

  /* ── Core High-Performance Aggregation ── */
  const {
    allActivitiesInPeriod,
    staffList,
    teamMetrics,
  } = useMemo(() => {
    const startMs = filterMode === 'day' ? dayStart.getTime() : weekStart.getTime();
    const endMs = filterMode === 'day' ? dayEnd.getTime() : weekEnd.getTime();

    const inPeriod = (ts: number | null | undefined): boolean => {
      if (!ts || ts <= 0) return false;
      if (filterMode === 'all') return true;
      return ts >= startMs && ts <= endMs;
    };

    const staffMap = new Map<string, StaffSummary>();
    const canonicalNameMap = new Map<string, string>();

    const ensureStaff = (rawName?: string, fallbackRole?: string): StaffSummary | null => {
      const clean = (rawName || '').trim();
      if (!clean || clean === 'Unassigned' || clean === 'Staff' || clean === 'System') {
        return null;
      }
      const lower = clean.toLowerCase();
      const canonical = canonicalNameMap.get(lower) || clean;
      if (!canonicalNameMap.has(lower)) {
        canonicalNameMap.set(lower, canonical);
      }
      if (!staffMap.has(canonical)) {
        const knownRole = roleMap.get(lower) || fallbackRole || 'admission_officer';
        const memberMeta = (teamMembers && teamMembers.length > 0 ? teamMembers : assignableAgents)
          ?.find((m) => m.name.toLowerCase() === lower);
        staffMap.set(canonical, {
          name: canonical,
          role: knownRole,
          email: memberMeta?.email,
          avatar: memberMeta?.avatar,
          periodActivitiesCount: 0,
          totalLeadsAssigned: 0,
          periodLeadsAssigned: 0,
          waitingReplyCount: 0,
          bookedInPeriod: 0,
          attendedInPeriod: 0,
          enrolledInPeriod: 0,
          cashInPeriod: 0,
          messagesInPeriod: 0,
          lastActiveAt: 0,
          allTimeLeads: 0,
          allTimeBooked: 0,
          allTimeAttended: 0,
          allTimeEnrolled: 0,
          allTimeCash: 0,
        });
      }
      return staffMap.get(canonical)!;
    };

    // Seed known team members
    const seedMembers = teamMembers && teamMembers.length > 0 ? teamMembers : assignableAgents;
    seedMembers.forEach((m) => {
      if (m.name) {
        const st = ensureStaff(m.name, m.role);
        if (st) {
          if (m.email) st.email = m.email;
          if (m.avatar) st.avatar = m.avatar;
        }
      }
    });

    const activities: EnrichedActivity[] = [];

    for (const c of conversations) {
      const leadName = getDisplayName(c);
      const leadPhone = c.phone || '';
      const channel = c.metaChannel ? `${c.channel} · ${c.metaChannel}` : (c.channel || 'WA');
      const branch = c.branch || '';
      const pipeline = c.pipeline || 'New';
      const assignedAgent = (c.agent || 'Unassigned').trim();

      if (assignedAgent && assignedAgent !== 'Unassigned') {
        const st = ensureStaff(assignedAgent);
        if (st) {
          st.totalLeadsAssigned += 1;
          st.allTimeLeads += 1;
          if (inPeriod(getCreatedTime(c))) {
            st.periodLeadsAssigned += 1;
          }
          if ((c.unreadCount && c.unreadCount > 0) || c.pipeline === 'New') {
            st.waitingReplyCount += 1;
          }
        }
      }

      // Track all-time funnel metrics from conversations
      if (isBookedLead(c) || Boolean(c.auditionDate)) {
        const bookActor = (c.bookedBy || assignedAgent).trim();
        const bSt = ensureStaff(bookActor);
        if (bSt) bSt.allTimeBooked += 1;
      }
      if (isAttendedLead(c) || (c.auditionOutcome && c.auditionOutcome !== 'booked')) {
        const attActor = (c.attendedBy || assignedAgent).trim();
        const aSt = ensureStaff(attActor);
        if (aSt) aSt.allTimeAttended += 1;
      }
      if (isConvertedLead(c)) {
        const convActor = (c.enrolledBy || assignedAgent).trim();
        const cSt = ensureStaff(convActor);
        if (cSt) {
          cSt.allTimeEnrolled += 1;
          cSt.allTimeCash += (Number(c.cashIn) || 0);
        }
      }

      const convEvents: EnrichedActivity[] = [];
      const seenTypes = new Set<string>();

      const pushActivity = (
        id: string,
        type: ActivityLogEntry['type'],
        rawActor: string,
        rawRole: string | undefined,
        summary: string,
        detail: string,
        timestamp: number,
        fromValue?: string,
        toValue?: string
      ) => {
        if (!timestamp || isNaN(timestamp)) return;
        const cleanActor = (rawActor || assignedAgent || 'Unassigned').trim();
        if (!cleanActor || cleanActor === 'Unassigned' || cleanActor === 'Staff') return;

        const st = ensureStaff(cleanActor, rawRole);
        const actorCanonical = st ? st.name : cleanActor;
        const actorRole = st ? st.role : (rawRole || 'admission_officer');

        if (st && timestamp > st.lastActiveAt) {
          st.lastActiveAt = timestamp;
        }

        if (!inPeriod(timestamp)) return;

        if (st) {
          st.periodActivitiesCount += 1;
          if (type === 'message_sent') st.messagesInPeriod += 1;
          if (type === 'audition_booked') st.bookedInPeriod += 1;
          if (type === 'audition_outcome' && toValue !== 'no-show') st.attendedInPeriod += 1;
          if (type === 'cash_recorded' || (type === 'audition_outcome' && toValue === 'registered')) {
            st.enrolledInPeriod += 1;
          }
          if (type === 'cash_recorded') {
            const parsedCash = toValue ? Number(String(toValue).replace(/[^\d.]/g, '')) : 0;
            const cashVal = parsedCash > 0 ? parsedCash : (Number(c.cashIn) || 0);
            st.cashInPeriod += cashVal;
          }
        }

        const dtKey = isoDate(new Date(timestamp));
        convEvents.push({
          id,
          conversationId: c.id,
          leadName,
          leadPhone,
          channel,
          branch,
          pipeline,
          type,
          category: mapTypeToCategory(type),
          actor: actorCanonical,
          actorRole,
          summary,
          detail,
          fromValue,
          toValue,
          timestamp,
          dateKey: dtKey,
        });
      };

      // 1. Explicit persisted activities
      if (Array.isArray(c.activityLog) && c.activityLog.length > 0) {
        for (const entry of c.activityLog) {
          seenTypes.add(entry.type);
          pushActivity(
            `${c.id}_${entry.id}`,
            entry.type,
            entry.actor || assignedAgent,
            entry.actorRole,
            entry.summary,
            entry.detail || '',
            entry.timestamp,
            entry.fromValue,
            entry.toValue
          );
        }
      }

      // 2. Synthesize milestones when not already in activityLog
      if (!seenTypes.has('message_sent')) {
        if (Array.isArray(c.messages) && c.messages.length > 0) {
          c.messages.forEach((m) => {
            if (!m.isIncoming && m.timestamp) {
              const sender = (m.senderName && m.senderName !== 'Staff') ? m.senderName : assignedAgent;
              pushActivity(
                `${c.id}_msg_${m.id}`,
                'message_sent',
                sender,
                undefined,
                `Sent ${c.channel === 'WA' ? 'WhatsApp' : c.channel === 'IG' ? 'Instagram' : 'Messenger'} reply`,
                (m.text || '').slice(0, 160),
                m.timestamp
              );
            }
          });
        } else if (c.lastOutgoingAt && assignedAgent !== 'Unassigned') {
          pushActivity(
            `${c.id}_lastout_${c.lastOutgoingAt}`,
            'message_sent',
            assignedAgent,
            undefined,
            `Sent ${c.channel === 'WA' ? 'WhatsApp' : c.channel === 'IG' ? 'Instagram' : 'Messenger'} reply`,
            c.lastMessageDirection === 'outgoing' ? (c.lastMessageText || '').slice(0, 160) : '',
            c.lastOutgoingAt
          );
        } else if (c.lastMessageDirection === 'outgoing' && c.lastMessageAt && assignedAgent !== 'Unassigned') {
          pushActivity(
            `${c.id}_lastdir_${c.lastMessageAt}`,
            'message_sent',
            assignedAgent,
            undefined,
            `Sent ${c.channel === 'WA' ? 'WhatsApp' : c.channel === 'IG' ? 'Instagram' : 'Messenger'} reply`,
            (c.lastMessageText || '').slice(0, 160),
            c.lastMessageAt
          );
        }
      }

      if (!seenTypes.has('lead_assigned') && assignedAgent !== 'Unassigned') {
        const createdTs = getCreatedTime(c);
        pushActivity(
          `${c.id}_assigned`,
          'lead_assigned',
          assignedAgent,
          undefined,
          `Claimed lead`,
          `Campaign: ${getCampaignName(c)}`,
          createdTs,
          'Unassigned',
          assignedAgent
        );
      }

      if (
        !seenTypes.has('stage_changed') &&
        assignedAgent !== 'Unassigned' &&
        ['Contacted', 'Qualified', 'Joining Later', 'Unqualified', 'Lost'].includes(c.pipeline)
      ) {
        pushActivity(
          `${c.id}_stage_${c.pipeline}`,
          'stage_changed',
          assignedAgent,
          undefined,
          `Moved stage to ${c.pipeline}`,
          `New → ${c.pipeline}`,
          getUpdatedTime(c),
          'New',
          c.pipeline
        );
      }

      if (!seenTypes.has('audition_booked') && (isBookedLead(c) || Boolean(c.auditionDate))) {
        const bookedTs = getBookedTime(c);
        const bookActor = (c.bookedBy || assignedAgent).trim();
        if (bookedTs) {
          pushActivity(
            `${c.id}_booked`,
            'audition_booked',
            bookActor,
            undefined,
            c.auditionDate ? `Booked audition for ${c.auditionDate}` : 'Booked Audition',
            c.branch ? `Branch: ${c.branch}` : 'Audition Booked',
            bookedTs,
            'Contacted',
            'Audition Booked'
          );
        }
      }

      if (
        !seenTypes.has('audition_outcome') &&
        (isAttendedLead(c) || (c.auditionOutcome && c.auditionOutcome !== 'booked'))
      ) {
        const attTs = getAttendedTime(c);
        const attActor = (c.attendedBy || assignedAgent).trim();
        if (attTs) {
          const outLabel = c.auditionOutcome
            ? `Marked outcome: ${formatOutcomeLabel(c.auditionOutcome)}`
            : 'Marked audition attended';
          pushActivity(
            `${c.id}_attended`,
            'audition_outcome',
            attActor,
            undefined,
            outLabel,
            c.branch ? `Branch: ${c.branch}` : '',
            attTs,
            'Audition Booked',
            c.auditionOutcome ? formatOutcomeLabel(c.auditionOutcome) : 'Attended'
          );
        }
      }

      if (c.followUpCompleted && !seenTypes.has('followup_completed')) {
        const compTs = c.followUpCompletedAt
          ? new Date(c.followUpCompletedAt).getTime()
          : getUpdatedTime(c);
        pushActivity(
          `${c.id}_fu_done`,
          'followup_completed',
          assignedAgent,
          undefined,
          'Completed follow-up task',
          c.followUpNote || '',
          compTs,
          'Pending',
          'Completed'
        );
      } else if (
        !c.followUpCompleted &&
        !seenTypes.has('followup_scheduled') &&
        (c.followUpDate || c.followUpNote) &&
        c.pipeline !== 'Audition Booked'
      ) {
        pushActivity(
          `${c.id}_fu_sched`,
          'followup_scheduled',
          assignedAgent,
          undefined,
          c.followUpDate ? `Scheduled follow-up for ${c.followUpDate}` : 'Added follow-up task',
          c.followUpNote || '',
          getUpdatedTime(c),
          '',
          c.followUpDate || ''
        );
      }

      if (!seenTypes.has('cash_recorded') && isConvertedLead(c)) {
        const convTs = getConvertedTime(c);
        const convActor = (c.enrolledBy || assignedAgent).trim();
        const cashVal = Number(c.cashIn) || 0;
        if (convTs) {
          pushActivity(
            `${c.id}_enrolled`,
            'cash_recorded',
            convActor,
            undefined,
            cashVal > 0 ? `Recorded payment: ${cashVal.toLocaleString()} EGP` : 'Enrolled student',
            c.branch ? `Branch: ${c.branch}` : 'Enrolled',
            convTs,
            'Attended',
            cashVal > 0 ? `${cashVal.toLocaleString()} EGP` : 'Enrolled'
          );
        }
      }

      if (!seenTypes.has('note_updated') && c.notes && c.notes.trim() && assignedAgent !== 'Unassigned') {
        pushActivity(
          `${c.id}_note`,
          'note_updated',
          assignedAgent,
          undefined,
          'Updated lead notes',
          c.notes.trim().slice(0, 160),
          getUpdatedTime(c)
        );
      }

      for (const ev of convEvents) {
        activities.push(ev);
      }
    }

    activities.sort((a, b) => b.timestamp - a.timestamp);

    const sortedStaff = Array.from(staffMap.values()).sort((a, b) => {
      if (b.periodActivitiesCount !== a.periodActivitiesCount) {
        return b.periodActivitiesCount - a.periodActivitiesCount;
      }
      if (b.lastActiveAt !== a.lastActiveAt) {
        return b.lastActiveAt - a.lastActiveAt;
      }
      return b.totalLeadsAssigned - a.totalLeadsAssigned;
    });

    let teamTotalLeadsInPeriod = 0;
    let teamTotalBookedInPeriod = 0;
    let teamTotalAttendedInPeriod = 0;
    let teamTotalEnrolledInPeriod = 0;
    let teamTotalCashInPeriod = 0;
    let activeStaffCount = 0;

    for (const st of staffMap.values()) {
      teamTotalLeadsInPeriod += st.periodLeadsAssigned;
      teamTotalBookedInPeriod += st.bookedInPeriod;
      teamTotalAttendedInPeriod += st.attendedInPeriod;
      teamTotalEnrolledInPeriod += st.enrolledInPeriod;
      teamTotalCashInPeriod += st.cashInPeriod;
      if (st.periodActivitiesCount > 0) activeStaffCount += 1;
    }

    const teamBookingRate = teamTotalLeadsInPeriod > 0
      ? Math.min(100, Math.round((teamTotalBookedInPeriod / teamTotalLeadsInPeriod) * 100))
      : (teamTotalBookedInPeriod > 0 ? 100 : 0);

    const teamShowRate = teamTotalBookedInPeriod > 0
      ? Math.min(100, Math.round((teamTotalAttendedInPeriod / teamTotalBookedInPeriod) * 100))
      : (teamTotalAttendedInPeriod > 0 ? 100 : 0);

    const teamClosingRate = teamTotalBookedInPeriod > 0
      ? Math.min(100, Math.round((teamTotalEnrolledInPeriod / teamTotalBookedInPeriod) * 100))
      : (teamTotalEnrolledInPeriod > 0 ? 100 : 0);

    const teamMetrics: TeamFunnelMetrics = {
      totalLeads: filterMode === 'all' ? conversations.length : teamTotalLeadsInPeriod,
      totalBooked: teamTotalBookedInPeriod,
      totalAttended: teamTotalAttendedInPeriod,
      totalEnrolled: teamTotalEnrolledInPeriod,
      totalCash: teamTotalCashInPeriod,
      activeStaffCount,
      bookingRate: teamBookingRate,
      showRate: teamShowRate,
      closingRate: teamClosingRate,
    };

    return {
      allActivitiesInPeriod: activities,
      staffList: sortedStaff,
      teamMetrics,
    };
  }, [conversations, assignableAgents, teamMembers, roleMap, filterMode, dayStart, dayEnd, weekStart, weekEnd]);

  // Filter agents in the Right Sidebar
  const filteredStaff = useMemo(() => {
    return staffList.filter((st) => {
      if (agentRoleFilter !== 'all') {
        const r = st.role.toLowerCase();
        if (agentRoleFilter === 'admission' && !['admission_officer', 'agent'].includes(r)) return false;
        if (agentRoleFilter === 'director' && r !== 'enrollment_director') return false;
        if (agentRoleFilter === 'finance' && r !== 'finance') return false;
        if (agentRoleFilter === 'chairman' && !['chairman', 'owner', 'manager'].includes(r)) return false;
      }
      if (agentSearch.trim()) {
        const q = agentSearch.toLowerCase().trim();
        return st.name.toLowerCase().includes(q) || formatRoleLabel(st.role).toLowerCase().includes(q);
      }
      return true;
    });
  }, [staffList, agentRoleFilter, agentSearch]);

  // Active agent fallback: either selectedAgent (exact or partial match in staffList) or most active agent (staffList[0])
  const effectiveAgent = useMemo(() => {
    if (selectedAgent) {
      const clean = selectedAgent.trim().toLowerCase();
      const exact = staffList.find((s) => s.name.toLowerCase() === clean);
      if (exact) return exact.name;
      const partial = staffList.find((s) => {
        const sName = s.name.toLowerCase();
        return sName.includes(clean) || clean.includes(sName);
      });
      if (partial) return partial.name;
      return selectedAgent;
    }
    return staffList[0]?.name || '';
  }, [selectedAgent, staffList]);

  // Synchronize state with effective agent on first load or when list updates
  useEffect(() => {
    if (staffList.length > 0 && !selectedAgent) {
      setSelectedAgent(staffList[0].name);
    }
  }, [staffList, selectedAgent]);

  const selectedStaffObj = useMemo(() => {
    if (!effectiveAgent) return null;
    const clean = effectiveAgent.trim().toLowerCase();
    return (
      staffList.find((s) => s.name.toLowerCase() === clean) ||
      staffList.find((s) => {
        const sName = s.name.toLowerCase();
        return sName.includes(clean) || clean.includes(sName);
      }) ||
      staffList[0] ||
      null
    );
  }, [staffList, effectiveAgent]);

  const selectedMetrics = useMemo(() => {
    if (!selectedStaffObj) {
      return {
        totalLeads: 0,
        totalBooked: 0,
        totalAttended: 0,
        totalEnrolled: 0,
        totalCash: 0,
        activeStaffCount: 0,
        bookingRate: 0,
        showRate: 0,
        closingRate: 0,
      };
    }
    const leads = filterMode === 'all' ? selectedStaffObj.totalLeadsAssigned : selectedStaffObj.periodLeadsAssigned;
    const booked = filterMode === 'all' ? selectedStaffObj.allTimeBooked : selectedStaffObj.bookedInPeriod;
    const attended = filterMode === 'all' ? selectedStaffObj.allTimeAttended : selectedStaffObj.attendedInPeriod;
    const enrolled = filterMode === 'all' ? selectedStaffObj.allTimeEnrolled : selectedStaffObj.enrolledInPeriod;
    const cash = filterMode === 'all' ? selectedStaffObj.allTimeCash : selectedStaffObj.cashInPeriod;

    const bookingRate = leads > 0 ? Math.min(100, Math.round((booked / leads) * 100)) : (booked > 0 ? 100 : 0);
    const showRate = booked > 0 ? Math.min(100, Math.round((attended / booked) * 100)) : (attended > 0 ? 100 : 0);
    const closingRate = booked > 0 ? Math.min(100, Math.round((enrolled / booked) * 100)) : (enrolled > 0 ? 100 : 0);

    return {
      totalLeads: leads,
      totalBooked: booked,
      totalAttended: attended,
      totalEnrolled: enrolled,
      totalCash: cash,
      activeStaffCount: 1,
      bookingRate,
      showRate,
      closingRate,
    };
  }, [selectedStaffObj, filterMode]);

  // Funnel calculations derived from selectedMetrics
  const funnelCalcs = useMemo(() => {
    const leads = selectedMetrics.totalLeads;
    const booked = selectedMetrics.totalBooked;
    const attended = selectedMetrics.totalAttended;
    const enrolled = selectedMetrics.totalEnrolled;
    const cash = selectedMetrics.totalCash;

    // Step 1 -> 2: Booking conversion & drop-off
    const bookingRate = leads > 0 ? (booked / leads) * 100 : 0;
    const bookingRateStr = bookingRate > 0 && bookingRate < 10 ? bookingRate.toFixed(1) : Math.round(bookingRate).toString();
    const bookingDrop = leads > 0 ? (100 - bookingRate).toFixed(1) : '0';

    // Step 2 -> 3: Show-up rate & no-show drop-off
    const showRate = booked > 0 ? (attended / booked) * 100 : 0;
    const showRateStr = Math.round(showRate).toString();
    const showDrop = booked > 0 ? Math.round(100 - showRate).toString() : '0';

    // Step 3 -> 4: Closing rate (Enrolled from Attended) & drop-off
    const closeRate = attended > 0 ? (enrolled / attended) * 100 : (booked > 0 ? (enrolled / booked) * 100 : 0);
    const closeRateStr = Math.round(closeRate).toString();
    const closeDrop = attended > 0 ? Math.round(100 - closeRate).toString() : '0';

    // Overall End-to-End Win Rate
    const overallWinRate = leads > 0 ? ((enrolled / leads) * 100).toFixed(1) : '0';

    // Average ticket per enrolled student & per lead
    const avgPerStudent = enrolled > 0 ? Math.round(cash / enrolled) : 0;
    const avgPerLead = leads > 0 ? Math.round(cash / leads) : 0;

    return {
      leads,
      booked,
      attended,
      enrolled,
      cash,
      bookingRateStr,
      bookingDrop,
      showRateStr,
      showDrop,
      closeRateStr,
      closeDrop,
      overallWinRate,
      avgPerStudent,
      avgPerLead,
    };
  }, [selectedMetrics]);

  const agentActivities = useMemo(() => {
    if (!effectiveAgent) return [];
    const target = effectiveAgent.toLowerCase();
    return allActivitiesInPeriod.filter((a) => a.actor.toLowerCase() === target);
  }, [allActivitiesInPeriod, effectiveAgent]);

  const categoryCounts = useMemo(() => {
    const counts: Record<ActivityCategory, number> = {
      all: agentActivities.length,
      messages: 0,
      pipeline: 0,
      auditions: 0,
      followups: 0,
      payments: 0,
      assignments: 0,
    };
    for (const act of agentActivities) {
      counts[act.category] = (counts[act.category] || 0) + 1;
    }
    return counts;
  }, [agentActivities]);

  const visibleActivities = useMemo(() => {
    return agentActivities.filter((act) => {
      if (categoryFilter !== 'all' && act.category !== categoryFilter) return false;
      if (activitySearch.trim()) {
        const q = activitySearch.toLowerCase().trim();
        const matchLead = act.leadName.toLowerCase().includes(q);
        const matchPhone = act.leadPhone.toLowerCase().includes(q);
        const matchSummary = act.summary.toLowerCase().includes(q);
        const matchDetail = act.detail.toLowerCase().includes(q);
        const matchActor = act.actor.toLowerCase().includes(q);
        const matchBranch = act.branch.toLowerCase().includes(q);
        if (!matchLead && !matchPhone && !matchSummary && !matchDetail && !matchActor && !matchBranch) {
          return false;
        }
      }
      return true;
    });
  }, [agentActivities, categoryFilter, activitySearch]);

  const groupedActivities = useMemo(() => {
    const groups: { dateKey: string; label: string; items: EnrichedActivity[] }[] = [];
    const map = new Map<string, EnrichedActivity[]>();
    for (const item of visibleActivities) {
      if (!map.has(item.dateKey)) {
        map.set(item.dateKey, []);
      }
      map.get(item.dateKey)!.push(item);
    }
    map.forEach((items, dateKey) => {
      groups.push({
        dateKey,
        label: formatDayGroupHeader(dateKey, todayKey, yesterdayKey),
        items,
      });
    });
    return groups;
  }, [visibleActivities, todayKey, yesterdayKey]);

  const agentAssignedLeads = useMemo(() => {
    if (!effectiveAgent) return [];
    const base = conversations.filter(
      (c) => (c.agent || '').trim().toLowerCase() === effectiveAgent.toLowerCase()
    );

    if (!activitySearch.trim()) return base;
    const q = activitySearch.toLowerCase().trim();
    return base.filter((c) => {
      const name = getDisplayName(c).toLowerCase();
      const phone = (c.phone || '').toLowerCase();
      const stage = (c.pipeline || '').toLowerCase();
      const branch = (c.branch || '').toLowerCase();
      return name.includes(q) || phone.includes(q) || stage.includes(q) || branch.includes(q);
    });
  }, [conversations, effectiveAgent, activitySearch]);

  // Operational breakdown: Current stage distribution & acquisition channels
  const agentPipelineBreakdown = useMemo(() => {
    if (!effectiveAgent) return { stages: [], channels: [], total: 0 };
    const allLeads = conversations.filter(
      (c) => (c.agent || '').trim().toLowerCase() === effectiveAgent.toLowerCase()
    );
    const total = allLeads.length;

    const stageMap: Record<string, number> = {};
    const channelMap: Record<string, number> = {};

    const channelCounts: Record<"WhatsApp" | "Instagram" | "Messenger", number> = {
      WhatsApp: 0,
      Instagram: 0,
      Messenger: 0,
    };

    allLeads.forEach((c) => {
      const s = (c.pipeline || 'New').trim();
      stageMap[s] = (stageMap[s] || 0) + 1;

      const ch = (c.channel || '').toLowerCase();
      if (ch.includes('wa') || ch.includes('whatsapp')) channelCounts.WhatsApp += 1;
      else if (ch.includes('ig') || ch.includes('instagram')) channelCounts.Instagram += 1;
      else if (ch.includes('fb') || ch.includes('messenger') || ch.includes('facebook')) channelCounts.Messenger += 1;
    });

    const orderedStages = ['New', 'Contacted', 'Qualified', 'Audition Booked', 'Attended', 'Enrolled', 'Joining Later', 'Unqualified', 'Lost'];
    Object.keys(stageMap).forEach((s) => {
      if (!orderedStages.includes(s)) orderedStages.push(s);
    });

    const stages = orderedStages
      .filter((s) => (stageMap[s] || 0) > 0)
      .map((s) => ({
        stage: s,
        count: stageMap[s] || 0,
        percentage: total > 0 ? Math.round(((stageMap[s] || 0) / total) * 100) : 0,
      }));

    const channelTotal =
      channelCounts.WhatsApp + channelCounts.Instagram + channelCounts.Messenger || total || 1;

    const channels = (['WhatsApp', 'Instagram', 'Messenger'] as const).map((channel) => ({
      channel,
      count: channelCounts[channel],
      percentage: channelTotal > 0 ? Math.round((channelCounts[channel] / channelTotal) * 100) : 0,
    }));

    return { stages, channels, total };
  }, [conversations, effectiveAgent]);

  const handleSelectAgent = useCallback((name: string) => {
    setSelectedAgent(name);
    setMobileAgentsOpen(false);
  }, []);

  return (
    <div
      className="flex h-full min-h-0 overflow-hidden"
      style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}
    >
      {/* ── MAIN PAGE (LEFT / CENTER): Selected Agent's Activities & Leads ── */}
      <div
        className="flex-1 flex flex-col min-w-0 min-h-0 overflow-y-auto"
        style={{ background: 'var(--bg-page)', color: 'var(--text-primary)', WebkitOverflowScrolling: 'touch' }}
      >
        {/* ── Space on Left, Right & Top Container ── */}
        <div className="px-5 sm:px-7 lg:px-8 pt-5 sm:pt-6 shrink-0">
          {/* ── AGENT DETAILS & PROFILE CARD (Clean White Container with Space on Top, Left & Right) ── */}
          <div
            className="w-full rounded-2xl p-6 sm:p-7 transition-all shadow-xs"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-main)',
            }}
          >
            {/* Top Profile Header: Perfectly Aligned Profile Picture + Agent Identity */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
              <div className="flex items-center gap-5 sm:gap-6 min-w-0 flex-1">
                {/* Profile Picture: Sized at 108px, rounded-2xl, object-cover with subtle border */}
                <div className="shrink-0">
                  <img
                    src={selectedStaffObj?.avatar || '/logo.png'}
                    alt={selectedStaffObj?.name || effectiveAgent}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = '/logo.png';
                    }}
                    className="w-24 h-24 sm:w-[104px] sm:h-[104px] md:w-[108px] md:h-[108px] rounded-2xl object-cover shrink-0 shadow-xs"
                    style={{ border: '1px solid var(--border-main)' }}
                  />
                </div>

                {/* Agent Details: Perfectly Aligned */}
                <div className="min-w-0 flex-1 flex flex-col justify-center gap-1 sm:gap-1.5">
                  {/* Name */}
                  <h1 className="text-[22px] sm:text-[24px] font-bold tracking-tight text-[var(--text-primary)] leading-tight">
                    {selectedStaffObj?.name || effectiveAgent}
                  </h1>

                  {/* Role Under the Name (Clean text without background) */}
                  {selectedStaffObj && (
                    <p
                      className="text-[13px] font-medium leading-none"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {formatRoleLabel(selectedStaffObj.role)}
                    </p>
                  )}

                  {/* Contact & Activity */}
                  <div className="flex items-center gap-3 text-[12px] flex-wrap mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {selectedStaffObj?.email && (
                      <a
                        href={`mailto:${selectedStaffObj.email}`}
                        className="inline-flex items-center gap-1.5 hover:underline truncate"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        <Mail className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                        <span className="truncate">{selectedStaffObj.email}</span>
                      </a>
                    )}

                    {selectedStaffObj?.email && (
                      <span style={{ color: 'var(--border-input)' }}>•</span>
                    )}

                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                      <span>
                        {selectedStaffObj?.lastActiveAt && selectedStaffObj.lastActiveAt > 0
                          ? `Last active ${formatCompactRelativeTime(selectedStaffObj.lastActiveAt)}`
                          : 'No recent activity'}
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Mobile button to open right-side Agents drawer on small screens */}
              <button
                type="button"
                onClick={() => setMobileAgentsOpen(true)}
                className="md:hidden self-start h-[28px] px-3 text-[11px] font-semibold rounded-[6px] flex items-center gap-1.5 cursor-pointer shrink-0"
                style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}
              >
                <Users className="w-3.5 h-3.5" />
                Agents ({staffList.length})
              </button>
            </div>
          </div>
        </div>

        {/* ── TABS & STREAM CONTROLS (Moved down below the card, sticky) ── */}
        <div
          className="sticky top-0 z-20 px-5 sm:px-7 lg:px-8 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0"
          style={{
            background: 'var(--bg-page)',
            borderBottom: '1px solid var(--border-main)',
            backdropFilter: 'blur(8px)',
          }}
        >
          {/* Left: Navigation Tabs */}
          <div
            className="flex items-center gap-1 p-1 rounded-xl shrink-0 overflow-x-auto max-w-full"
            style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)', WebkitOverflowScrolling: 'touch' }}
          >
            <button
              type="button"
              onClick={() => setMainTab('timeline')}
              className="h-[30px] px-3.5 text-[12px] font-semibold rounded-lg flex items-center gap-2 cursor-pointer transition-all"
              style={
                mainTab === 'timeline'
                  ? { background: 'var(--bg-card)', color: 'var(--text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }
                  : { background: 'transparent', color: 'var(--text-secondary)' }
              }
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Timeline</span>
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{
                  background: mainTab === 'timeline' ? 'var(--bg-pill)' : 'transparent',
                  color: mainTab === 'timeline' ? 'var(--text-primary)' : 'var(--text-secondary)',
                  border: mainTab === 'timeline' ? '1px solid var(--border-input)' : 'none',
                }}
              >
                {agentActivities.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setMainTab('funnel')}
              className="h-[30px] px-3.5 text-[12px] font-semibold rounded-lg flex items-center gap-2 cursor-pointer transition-all"
              style={
                mainTab === 'funnel'
                  ? { background: 'var(--bg-card)', color: 'var(--text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }
                  : { background: 'transparent', color: 'var(--text-secondary)' }
              }
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Conversion Funnel</span>
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{
                  background: mainTab === 'funnel' ? 'var(--bg-pill)' : 'transparent',
                  color: mainTab === 'funnel' ? 'var(--text-primary)' : 'var(--text-secondary)',
                  border: mainTab === 'funnel' ? '1px solid var(--border-input)' : 'none',
                }}
              >
                {funnelCalcs.overallWinRate}% Win Rate
              </span>
            </button>

            <button
              type="button"
              onClick={() => setMainTab('leads')}
              className="h-[30px] px-3.5 text-[12px] font-semibold rounded-lg flex items-center gap-2 cursor-pointer transition-all"
              style={
                mainTab === 'leads'
                  ? { background: 'var(--bg-card)', color: 'var(--text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }
                  : { background: 'transparent', color: 'var(--text-secondary)' }
              }
            >
              <Users className="w-3.5 h-3.5" />
              <span>Assigned Leads</span>
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{
                  background: mainTab === 'leads' ? 'var(--bg-pill)' : 'transparent',
                  color: mainTab === 'leads' ? 'var(--text-primary)' : 'var(--text-secondary)',
                  border: mainTab === 'leads' ? '1px solid var(--border-input)' : 'none',
                }}
              >
                {agentAssignedLeads.length}
              </span>
            </button>
          </div>

          {/* Right: Presentation Toggle + Search */}
          <div className="flex items-center gap-2 shrink-0">
            {mainTab === 'timeline' && (
              <div
                className="flex items-center gap-0.5 p-0.5 rounded-[7px] shrink-0"
                style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)' }}
              >
                <button
                  type="button"
                  onClick={() => setFeedViewStyle('timeline')}
                  className="h-[26px] px-2.5 text-[11px] font-semibold rounded-[5px] flex items-center gap-1 cursor-pointer transition-colors"
                  style={
                    feedViewStyle === 'timeline'
                      ? { background: 'var(--bg-card)', color: 'var(--text-primary)', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }
                      : { background: 'transparent', color: 'var(--text-secondary)' }
                  }
                  title="Timeline storytelling view"
                >
                  <GitCommit className="w-3 h-3 text-[var(--text-secondary)]" />
                  Timeline
                </button>
                <button
                  type="button"
                  onClick={() => setFeedViewStyle('compact')}
                  className="h-[26px] px-2.5 text-[11px] font-semibold rounded-[5px] flex items-center gap-1 cursor-pointer transition-colors"
                  style={
                    feedViewStyle === 'compact'
                      ? { background: 'var(--bg-card)', color: 'var(--text-primary)', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }
                      : { background: 'transparent', color: 'var(--text-secondary)' }
                  }
                  title="Compact scanning view"
                >
                  <List className="w-3 h-3" />
                  Compact
                </button>
              </div>
            )}

            {(mainTab === 'timeline' || mainTab === 'leads') && (
              <div className="relative w-full sm:w-56 shrink-0">
                <Search
                  className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'var(--text-muted)' }}
                />
                <input
                  type="text"
                  value={activitySearch}
                  onChange={(e) => setActivitySearch(e.target.value)}
                  placeholder={mainTab === 'timeline' ? 'Search event, lead...' : 'Search lead, phone...'}
                  className="w-full h-[28px] pl-8 pr-6 text-[11px] rounded-[7px] outline-none transition-colors"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-input)',
                    color: 'var(--text-primary)',
                  }}
                />
                {activitySearch && (
                  <button
                    type="button"
                    onClick={() => setActivitySearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Content Body (Full Width: Timeline Stream OR Conversion Funnel OR Assigned Leads) ── */}
        <div className="flex-1 px-5 sm:px-7 lg:px-8 py-6">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                Loading operations stream...
              </p>
            </div>
          ) : mainTab === 'timeline' ? (
                groupedActivities.length === 0 ? (
                  <div
                    className="w-full rounded-2xl p-12 text-center"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3"
                      style={{ background: 'var(--bg-pill)', color: 'var(--text-muted)' }}
                    >
                      <Clock className="w-5 h-5" />
                    </div>
                    <p className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>
                      No activities recorded
                    </p>
                    <p className="text-[12px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                      No actions recorded for {selectedStaffObj?.name || effectiveAgent || 'this staff member'} in {periodDescription}.
                    </p>
                    {filterMode !== 'all' && (
                      <button
                        type="button"
                        onClick={goAllTime}
                        className="mt-4 text-[11px] font-semibold px-3 py-1.5 rounded-[6px] cursor-pointer inline-flex items-center gap-1"
                        style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}
                      >
                        View All Time Operations
                      </button>
                    )}
                  </div>
                ) : feedViewStyle === 'timeline' ? (
                  /* ── 1. TIMELINE FEED: Elegant Full-Width Formal Stream ── */
                  <div className="w-full space-y-8">
                {groupedActivities.map((group) => (
                  <div key={group.dateKey}>
                    {/* Day Group Header */}
                    <div className="flex items-center gap-3 mb-5">
                      <span
                        className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md"
                        style={{ background: 'var(--bg-pill)', color: 'var(--text-primary)', border: '1px solid var(--border-input)' }}
                      >
                        {group.label}
                      </span>
                      <div className="h-[1px] flex-1" style={{ background: 'var(--border-main)' }} />
                      <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
                        {group.items.length} {group.items.length === 1 ? 'event' : 'events'}
                      </span>
                    </div>

                    {/* Timeline Node Thread */}
                    <div className="space-y-4 pl-1 sm:pl-2">
                      {group.items.map((act) => {
                        const actionPhrase = getNaturalActionPhrase(act);
                        const isMessage = act.type === 'message_sent';
                        const isAudition = act.type === 'audition_booked' || act.type === 'audition_outcome';
                        const isPayment = act.type === 'cash_recorded';
                        const isStage = act.type === 'stage_changed';
                        const isFollowup = act.type === 'followup_scheduled' || act.type === 'followup_completed';
                        const isAssignment = act.type === 'lead_assigned';

                        // Minimal formal node styling
                        let NodeIcon = Clock;
                        if (isPayment) NodeIcon = Banknote;
                        else if (isAudition) NodeIcon = act.type === 'audition_outcome' ? Award : Calendar;
                        else if (isMessage) NodeIcon = MessageSquare;
                        else if (isStage) NodeIcon = ArrowRight;
                        else if (isAssignment) NodeIcon = UserCheck;
                        else if (isFollowup) NodeIcon = act.type === 'followup_completed' ? CheckCircle2 : Clock;

                        const nodeBg = 'var(--bg-card)';
                        const nodeColor = 'var(--text-secondary)';
                        const nodeBorder = 'var(--border-main)';

                        return (
                          <div
                            key={act.id}
                            className="relative pl-8 sm:pl-10 group"
                          >
                            {/* Vertical connecting spine */}
                            <div
                              className="absolute left-[13px] sm:left-[15px] top-7 bottom-[-16px] w-[1.5px] group-last:hidden"
                              style={{ background: 'var(--border-main)' }}
                            />

                            {/* Node icon pill on the spine */}
                            <div
                              className="absolute left-0 top-0.5 w-[26px] sm:w-[28px] h-[26px] sm:h-[28px] rounded-full flex items-center justify-center shrink-0 z-10 transition-colors"
                              style={{
                                background: nodeBg,
                                color: nodeColor,
                                border: `1px solid ${nodeBorder}`,
                              }}
                            >
                              <NodeIcon className="w-3.5 h-3.5" />
                            </div>

                            {/* Event Main Block */}
                            <div
                              className="p-3.5 rounded-xl transition-all"
                              style={{
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-main)',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                              }}
                            >
                              {/* Top Bar: Natural Action + Lead + Timestamp + Chat Hover Button */}
                              <div className="flex items-start sm:items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                  <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                                    {actionPhrase.charAt(0).toUpperCase() + actionPhrase.slice(1)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => openChat(act.conversationId)}
                                    className="font-bold text-[12px] hover:underline cursor-pointer truncate max-w-[220px]"
                                    style={{ color: 'var(--text-primary)' }}
                                    title="Open conversation"
                                  >
                                    {act.leadName}
                                  </button>
                                  <span
                                    className="text-[9px] font-bold px-1.5 py-0.2 rounded"
                                    style={{ background: 'var(--bg-pill)', color: 'var(--text-secondary)' }}
                                  >
                                    {act.channel}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
                                    {formatTime24Or12(act.timestamp)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => openChat(act.conversationId)}
                                    className="h-6 px-2.5 rounded-[5px] text-[10px] font-semibold flex items-center gap-1 transition-opacity opacity-75 group-hover:opacity-100 cursor-pointer"
                                    style={{
                                      background: 'var(--bg-pill)',
                                      border: '1px solid var(--border-input)',
                                      color: 'var(--text-primary)',
                                    }}
                                  >
                                    <MessageSquare className="w-3 h-3" />
                                    Chat
                                  </button>
                                </div>
                              </div>

                              {/* Substance / Detail Box (Indented & Elegant) */}
                              {isMessage && act.detail && (
                                <div
                                  className="mt-2.5 p-2.5 rounded-lg text-[11px] leading-relaxed max-w-3xl"
                                  style={{
                                    background: 'var(--bg-pill)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--border-input)',
                                  }}
                                >
                                  <span className="italic select-none opacity-60 mr-1">“</span>
                                  <span>{act.detail}</span>
                                  <span className="italic select-none opacity-60 ml-1">”</span>
                                </div>
                              )}

                              {isAudition && (
                                <div className="mt-2.5 flex items-center gap-2 flex-wrap text-[11px]">
                                  <div
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold"
                                    style={{ background: 'var(--bg-pill)', color: 'var(--text-primary)', border: '1px solid var(--border-input)' }}
                                  >
                                    <Calendar className="w-3 h-3 text-[var(--text-muted)]" />
                                    <span>{act.summary}</span>
                                  </div>
                                  {act.branch && (
                                    <div
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md"
                                      style={{ background: 'var(--bg-pill)', color: 'var(--text-secondary)' }}
                                    >
                                      <span>📍 {act.branch}</span>
                                    </div>
                                  )}
                                  <span
                                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                                    style={getStageBadgeStyle(act.pipeline)}
                                  >
                                    <span
                                      className="w-1.5 h-1.5 rounded-full"
                                      style={{ background: getStageColor(act.pipeline) }}
                                    />
                                    {act.pipeline}
                                  </span>
                                </div>
                              )}

                              {isPayment && (
                                <div className="mt-2.5 flex items-center gap-2.5 flex-wrap text-[11px]">
                                  <div
                                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md font-bold"
                                    style={{
                                      background: 'var(--bg-pill)',
                                      border: '1px solid var(--border-input)',
                                      color: 'var(--text-primary)',
                                    }}
                                  >
                                    <Banknote className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                                    <span>{act.summary}</span>
                                  </div>
                                  {act.branch && (
                                    <span style={{ color: 'var(--text-secondary)' }}>· {act.branch}</span>
                                  )}
                                  {act.detail && act.detail !== act.summary && (
                                    <span style={{ color: 'var(--text-muted)' }}>({act.detail})</span>
                                  )}
                                </div>
                              )}

                              {isStage && (
                                <div className="mt-2 flex items-center gap-1.5 text-[11px]">
                                  <span
                                    className="px-2 py-0.5 rounded-md font-semibold"
                                    style={getStageBadgeStyle(act.fromValue || 'New')}
                                  >
                                    {act.fromValue || 'New'}
                                  </span>
                                  <ArrowRight className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                                  <span
                                    className="px-2.5 py-0.5 rounded-md font-semibold"
                                    style={getStageBadgeStyle(act.toValue || act.pipeline)}
                                  >
                                    {act.toValue || act.pipeline}
                                  </span>
                                </div>
                              )}

                              {isFollowup && (
                                <div className="mt-2 flex items-center gap-2 text-[11px]">
                                  <div
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium"
                                    style={{ background: 'var(--bg-pill)', color: 'var(--text-primary)' }}
                                  >
                                    {act.type === 'followup_completed' ? (
                                      <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                                    ) : (
                                      <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                                    )}
                                    <span>{act.summary}</span>
                                  </div>
                                  {act.detail && (
                                    <span className="truncate" style={{ color: 'var(--text-secondary)' }}>
                                      {act.detail}
                                    </span>
                                  )}
                                </div>
                              )}

                              {!isMessage && !isAudition && !isPayment && !isStage && !isFollowup && act.detail && (
                                <div className="mt-2 text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
                                  {act.detail}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* ── 2. COMPACT STREAM: Borderless, High-Density Scanning View (Full Width) ── */
              <div
                className="w-full rounded-xl overflow-hidden shadow-xs"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}
              >
                {groupedActivities.map((group, groupIdx) => (
                  <div key={group.dateKey}>
                    {/* Compact Section Divider */}
                    <div
                      className="px-4 py-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider"
                      style={{
                        background: 'var(--bg-table-header)',
                        color: 'var(--text-secondary)',
                        borderTop: groupIdx > 0 ? '1px solid var(--border-main)' : undefined,
                      }}
                    >
                      <span>{group.label}</span>
                      <span className="font-normal" style={{ color: 'var(--text-muted)' }}>
                        {group.items.length} events
                      </span>
                    </div>

                    <div className="divide-y" style={{ borderColor: 'var(--border-main)' }}>
                      {group.items.map((act) => (
                        <div
                          key={act.id}
                          className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors group"
                        >
                          {/* Time + Action Phrase + Lead Name */}
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span
                              className="text-[11px] font-mono shrink-0 w-[58px]"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {formatTime24Or12(act.timestamp)}
                            </span>

                            <div className="min-w-0 flex items-center gap-1.5 flex-wrap flex-1 text-[12px]">
                              <span style={{ color: 'var(--text-secondary)' }}>
                                {getNaturalActionPhrase(act).charAt(0).toUpperCase() + getNaturalActionPhrase(act).slice(1)}
                              </span>
                              <button
                                type="button"
                                onClick={() => openChat(act.conversationId)}
                                className="font-bold hover:underline cursor-pointer truncate max-w-[180px]"
                                style={{ color: 'var(--text-primary)' }}
                              >
                                {act.leadName}
                              </button>
                              <span
                                className="text-[9px] font-bold px-1.5 py-0.2 rounded shrink-0"
                                style={{ background: 'var(--bg-pill)', color: 'var(--text-secondary)' }}
                              >
                                {act.channel}
                              </span>

                              {/* Short substance tag */}
                              {act.type === 'cash_recorded' && (
                                <span className="font-bold shrink-0" style={{ color: 'var(--text-primary)' }}>
                                  · {act.summary}
                                </span>
                              )}
                              {act.type === 'message_sent' && act.detail && (
                                <span className="text-[11px] truncate max-w-xs" style={{ color: 'var(--text-muted)' }}>
                                  — “{act.detail}”
                                </span>
                              )}
                              {act.type === 'audition_booked' && (
                                <span className="text-[11px] font-medium shrink-0" style={{ color: 'var(--text-secondary)' }}>
                                  · {act.summary}
                                </span>
                              )}
                              {act.type === 'stage_changed' && (
                                <span className="inline-flex items-center gap-1 text-[10px] shrink-0">
                                  <span
                                    className="px-1.5 py-0.2 rounded font-semibold"
                                    style={getStageBadgeStyle(act.fromValue || 'New')}
                                  >
                                    {act.fromValue || 'New'}
                                  </span>
                                  <ArrowRight className="w-2.5 h-2.5" style={{ color: 'var(--text-muted)' }} />
                                  <span
                                    className="px-1.5 py-0.2 rounded font-semibold"
                                    style={getStageBadgeStyle(act.toValue || act.pipeline)}
                                  >
                                    {act.toValue || act.pipeline}
                                  </span>
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Quick chat button */}
                          <button
                            type="button"
                            onClick={() => openChat(act.conversationId)}
                            className="h-6 px-2 rounded text-[10px] font-semibold flex items-center gap-1 transition-opacity opacity-0 group-hover:opacity-100 cursor-pointer shrink-0"
                            style={{
                              background: 'var(--bg-pill)',
                              border: '1px solid var(--border-input)',
                              color: 'var(--text-primary)',
                            }}
                          >
                            <MessageSquare className="w-2.5 h-2.5" />
                            Chat
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : mainTab === 'funnel' ? (
            /* ── CONVERSION FUNNEL & REVENUE VIEW (Minimal, Normal & Highly Useful) ── */
            <div className="w-full space-y-5">
              {(() => {
                const {
                  leads,
                  booked,
                  attended,
                  enrolled,
                  cash,
                  bookingRateStr,
                  showRateStr,
                  closeRateStr,
                  overallWinRate,
                  avgPerStudent,
                } = funnelCalcs;

                const { stages, channels, total: breakdownTotal } = agentPipelineBreakdown;

                return (
                  <>
                    {/* 1. Core Performance Metrics Grid (5 Clean Minimal Cards) */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-3.5">
                      {/* Metric 1: Total Leads */}
                      <div
                        onClick={() => setMainTab('leads')}
                        className="p-4 rounded-xl cursor-pointer transition-all hover:border-[var(--border-input)] group shadow-xs"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}
                        title="View all assigned leads"
                      >
                        <div className="flex items-center justify-between text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                          <span className="uppercase tracking-wider">Assigned Leads</span>
                          <Users className="w-3.5 h-3.5" />
                        </div>
                        <div className="text-[26px] font-bold mt-1.5 tracking-tight" style={{ color: 'var(--text-primary)' }}>
                          {leads}
                        </div>
                        <p className="text-[11px] mt-1 truncate" style={{ color: 'var(--text-secondary)' }}>
                          Active in pipeline
                        </p>
                      </div>

                      {/* Metric 2: Auditions Booked */}
                      <div
                        className="p-4 rounded-xl shadow-xs"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}
                      >
                        <div className="flex items-center justify-between text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                          <span className="uppercase tracking-wider">Booked</span>
                          <Calendar className="w-3.5 h-3.5" />
                        </div>
                        <div className="text-[26px] font-bold mt-1.5 tracking-tight" style={{ color: 'var(--text-primary)' }}>
                          {booked}
                        </div>
                        <p className="text-[11px] mt-1 truncate" style={{ color: 'var(--text-secondary)' }}>
                          <strong style={{ color: 'var(--text-primary)' }}>{bookingRateStr}%</strong> booking rate
                        </p>
                      </div>

                      {/* Metric 3: Auditions Attended */}
                      <div
                        className="p-4 rounded-xl shadow-xs"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}
                      >
                        <div className="flex items-center justify-between text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                          <span className="uppercase tracking-wider">Attended</span>
                          <UserCheck className="w-3.5 h-3.5" />
                        </div>
                        <div className="text-[26px] font-bold mt-1.5 tracking-tight" style={{ color: 'var(--text-primary)' }}>
                          {attended}
                        </div>
                        <p className="text-[11px] mt-1 truncate" style={{ color: 'var(--text-secondary)' }}>
                          <strong style={{ color: 'var(--text-primary)' }}>{showRateStr}%</strong> show-up rate
                        </p>
                      </div>

                      {/* Metric 4: Enrolled Students */}
                      <div
                        className="p-4 rounded-xl shadow-xs"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}
                      >
                        <div className="flex items-center justify-between text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                          <span className="uppercase tracking-wider">Enrolled</span>
                          <Award className="w-3.5 h-3.5" />
                        </div>
                        <div className="text-[26px] font-bold mt-1.5 tracking-tight" style={{ color: 'var(--text-primary)' }}>
                          {enrolled}
                        </div>
                        <p className="text-[11px] mt-1 truncate" style={{ color: 'var(--text-secondary)' }}>
                          <strong style={{ color: 'var(--text-primary)' }}>{closeRateStr}%</strong> close ({overallWinRate}% win)
                        </p>
                      </div>

                      {/* Metric 5: Cash Collected */}
                      <div
                        className="p-4 rounded-xl shadow-xs col-span-2 sm:col-span-1"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}
                      >
                        <div className="flex items-center justify-between text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                          <span className="uppercase tracking-wider">Revenue</span>
                          <Banknote className="w-3.5 h-3.5" />
                        </div>
                        <div className="text-[26px] font-bold mt-1.5 tracking-tight flex items-baseline gap-1" style={{ color: 'var(--text-primary)' }}>
                          <span>{cash.toLocaleString()}</span>
                          <span className="text-[12px] font-semibold" style={{ color: 'var(--text-secondary)' }}>EGP</span>
                        </div>
                        <p className="text-[11px] mt-1 truncate" style={{ color: 'var(--text-secondary)' }}>
                          {enrolled > 0 ? `${avgPerStudent.toLocaleString()} EGP / student` : 'Direct collections'}
                        </p>
                      </div>
                    </div>

                    {/* 2. Clean Conversion Funnel Journey (Stepped Progress) */}
                    <div
                      className="p-5 sm:p-6 rounded-xl shadow-xs"
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}
                    >
                      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                        <div>
                          <h3 className="text-[14px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                            Conversion Funnel Journey
                          </h3>
                          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                            Step-by-step conversion from assigned lead to enrolled student
                          </p>
                        </div>
                        <span
                          className="px-2.5 py-1 rounded-md text-[11px] font-semibold inline-flex items-center gap-1.5"
                          style={{
                            background: 'var(--bg-pill)',
                            border: '1px solid var(--border-input)',
                            color: 'var(--text-primary)',
                          }}
                        >
                          Overall Win Rate: <strong className="text-emerald-500">{overallWinRate}%</strong>
                        </span>
                      </div>

                      {/* 4 Stepped Funnel Boxes */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {/* Step 1: Leads Pool */}
                        <div
                          className="p-4 rounded-xl flex flex-col justify-between"
                          style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)' }}
                        >
                          <div>
                            <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                              <span className="font-semibold uppercase tracking-wider text-[10px]">1. Leads Pool</span>
                              <span className="text-[10px] font-bold">100%</span>
                            </div>
                            <div className="text-[24px] font-bold mt-1 tracking-tight" style={{ color: 'var(--text-primary)' }}>
                              {leads}
                            </div>
                          </div>
                          <div className="mt-3">
                            <div className="h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                              <div className="h-full rounded-full bg-[var(--text-primary)]" style={{ width: '100%' }} />
                            </div>
                            <span className="text-[10px] mt-1.5 block" style={{ color: 'var(--text-muted)' }}>
                              Total assigned pool
                            </span>
                          </div>
                        </div>

                        {/* Step 2: Booked Auditions */}
                        <div
                          className="p-4 rounded-xl flex flex-col justify-between"
                          style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)' }}
                        >
                          <div>
                            <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                              <span className="font-semibold uppercase tracking-wider text-[10px]">2. Booked Auditions</span>
                              <span className="text-[10px] font-bold text-blue-500">{bookingRateStr}%</span>
                            </div>
                            <div className="text-[24px] font-bold mt-1 tracking-tight" style={{ color: 'var(--text-primary)' }}>
                              {booked}
                            </div>
                          </div>
                          <div className="mt-3">
                            <div className="h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-blue-500 transition-all"
                                style={{ width: `${Math.min(100, Math.max(booked > 0 ? 6 : 0, (booked / (leads || 1)) * 100))}%` }}
                              />
                            </div>
                            <span className="text-[10px] mt-1.5 block" style={{ color: 'var(--text-muted)' }}>
                              {leads > 0 ? `${bookingRateStr}% of assigned leads` : '0 booked'}
                            </span>
                          </div>
                        </div>

                        {/* Step 3: Attended Auditions */}
                        <div
                          className="p-4 rounded-xl flex flex-col justify-between"
                          style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)' }}
                        >
                          <div>
                            <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                              <span className="font-semibold uppercase tracking-wider text-[10px]">3. Attended</span>
                              <span className="text-[10px] font-bold text-teal-500">{showRateStr}%</span>
                            </div>
                            <div className="text-[24px] font-bold mt-1 tracking-tight" style={{ color: 'var(--text-primary)' }}>
                              {attended}
                            </div>
                          </div>
                          <div className="mt-3">
                            <div className="h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-teal-500 transition-all"
                                style={{ width: `${Math.min(100, Math.max(attended > 0 ? 6 : 0, (attended / (booked || 1)) * 100))}%` }}
                              />
                            </div>
                            <span className="text-[10px] mt-1.5 block" style={{ color: 'var(--text-muted)' }}>
                              {booked > 0 ? `${showRateStr}% show-up rate` : '0 attended'}
                            </span>
                          </div>
                        </div>

                        {/* Step 4: Enrolled Students */}
                        <div
                          className="p-4 rounded-xl flex flex-col justify-between"
                          style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)' }}
                        >
                          <div>
                            <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                              <span className="font-semibold uppercase tracking-wider text-[10px]">4. Enrolled Students</span>
                              <span className="text-[10px] font-bold text-emerald-500">{closeRateStr}%</span>
                            </div>
                            <div className="text-[24px] font-bold mt-1 tracking-tight" style={{ color: 'var(--text-primary)' }}>
                              {enrolled}
                            </div>
                          </div>
                          <div className="mt-3">
                            <div className="h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-emerald-500 transition-all"
                                style={{ width: `${Math.min(100, Math.max(enrolled > 0 ? 6 : 0, (enrolled / (attended || booked || 1)) * 100))}%` }}
                              />
                            </div>
                            <span className="text-[10px] mt-1.5 block" style={{ color: 'var(--text-muted)' }}>
                              {attended > 0 ? `${closeRateStr}% closing conversion` : '0 enrolled'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 3. Highly Useful Actionable Breakdowns: Current Stages & Acquisition Channels */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Left: Pipeline Stage Distribution */}
                      <div
                        className="p-5 sm:p-6 rounded-xl shadow-xs flex flex-col justify-between"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-3">
                            <div>
                              <h3 className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
                                Current Pipeline Distribution
                              </h3>
                              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                                Where {breakdownTotal} leads stand right now
                              </p>
                            </div>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-pill)', color: 'var(--text-secondary)' }}>
                              {stages.length} active stages
                            </span>
                          </div>

                          {/* Multi-color Proportional Progress Bar */}
                          {stages.length > 0 && (
                            <div className="h-2 w-full rounded-full overflow-hidden flex bg-black/5 dark:bg-white/5 my-3.5">
                              {stages.map((st) => (
                                <div
                                  key={st.stage}
                                  className="h-full first:rounded-l-full last:rounded-r-full"
                                  style={{
                                    width: `${st.percentage}%`,
                                    background: getStageColor(st.stage),
                                  }}
                                  title={`${st.stage}: ${st.count} leads (${st.percentage}%)`}
                                />
                              ))}
                            </div>
                          )}

                          {/* Stage List Grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                            {stages.map((st) => (
                              <div
                                key={st.stage}
                                onClick={() => {
                                  setActivitySearch(st.stage);
                                  setMainTab('leads');
                                }}
                                className="p-2.5 rounded-lg flex items-center justify-between gap-1.5 cursor-pointer hover:opacity-85 transition-opacity"
                                style={getStageBadgeStyle(st.stage)}
                                title={`Filter ${st.stage} leads`}
                              >
                                <span className="text-[11px] font-semibold truncate">{st.stage}</span>
                                <span className="text-[11px] font-bold shrink-0">{st.count}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {selectedStaffObj && selectedStaffObj.waitingReplyCount > 0 && (
                          <div
                            className="mt-4 pt-3 flex items-center justify-between text-[11px]"
                            style={{ borderTop: '1px solid var(--border-main)', color: 'var(--text-secondary)' }}
                          >
                            <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                              {selectedStaffObj.waitingReplyCount} leads awaiting reply
                            </span>
                            <button
                              type="button"
                              onClick={() => setMainTab('leads')}
                              className="text-[11px] font-semibold text-[var(--text-primary)] hover:underline cursor-pointer"
                            >
                              Review in leads →
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Right: Lead Channels & Operational Activity */}
                      <div
                        className="p-5 sm:p-6 rounded-xl shadow-xs flex flex-col justify-between"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-3">
                            <div>
                              <h3 className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
                                Lead Channels & Source Mix
                              </h3>
                              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                                Volume breakdown across inbound messaging channels
                              </p>
                            </div>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-pill)', color: 'var(--text-secondary)' }}>
                              {channels.length} channels
                            </span>
                          </div>

                          {/* Channels Stack */}
                          <div className="space-y-4 my-3.5">
                            {channels.length === 0 ? (
                              <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>No channel data available.</p>
                            ) : (
                              channels.map((ch) => {
                                const channelColor = getChannelColor(ch.channel);
                                return (
                                  <div key={ch.channel} className="space-y-1.5">
                                    <div className="flex items-center justify-between text-[12px] font-medium">
                                      <span style={{ color: 'var(--text-primary)' }}>{ch.channel}</span>
                                      <span style={{ color: 'var(--text-secondary)' }}>
                                        {ch.count} leads ({ch.percentage}%)
                                      </span>
                                    </div>
                                    <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-pill)' }}>
                                      <div
                                        className="h-full rounded-full transition-all"
                                        style={{
                                          width: `${ch.percentage}%`,
                                          background: channelColor,
                                        }}
                                      />
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>

                        {/* Agent Quick Activity Footnote */}
                        <div
                          className="mt-4 pt-3 flex items-center justify-between text-[11px]"
                          style={{ borderTop: '1px solid var(--border-main)', color: 'var(--text-secondary)' }}
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <Activity className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                            Total actions logged: <strong style={{ color: 'var(--text-primary)' }}>{agentActivities.length}</strong>
                          </span>
                          <button
                            type="button"
                            onClick={() => setMainTab('timeline')}
                            className="text-[11px] font-semibold text-[var(--text-primary)] hover:underline cursor-pointer"
                          >
                            View timeline stream →
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          ) : (
            /* ── ASSIGNED LEADS VIEW (Full Width) ── */
            <div
              className="w-full rounded-xl overflow-hidden shadow-xs"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}
            >
              {agentAssignedLeads.length === 0 ? (
                <div className="p-12 text-center">
                  <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                    No assigned leads
                  </p>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                    {selectedStaffObj?.name || effectiveAgent || 'This staff member'} has no leads matching this filter.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto w-full" style={{ WebkitOverflowScrolling: 'touch' }}>
                  <table className="w-full text-left border-collapse min-w-[680px]">
                    <thead
                      className="text-[10px] uppercase tracking-widest font-bold"
                      style={{ background: 'var(--bg-table-header)', color: 'var(--text-secondary)' }}
                    >
                      <tr>
                        <th className="py-2.5 px-4">Lead</th>
                        <th className="py-2.5 px-3">Channel</th>
                        <th className="py-2.5 px-3">Stage</th>
                        <th className="py-2.5 px-3">Audition / Follow-up</th>
                        <th className="py-2.5 px-3 text-right">Last Active</th>
                        <th className="py-2.5 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="text-[12px] divide-y" style={{ color: 'var(--text-primary)', borderColor: 'var(--border-main)' }}>
                      {agentAssignedLeads.map((conv, idx) => {
                        const needsAttention = (conv.unreadCount && conv.unreadCount > 0) || conv.pipeline === 'New';
                        return (
                          <tr
                            key={conv.id}
                            className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                            style={{ background: idx % 2 === 0 ? 'transparent' : 'var(--bg-table-alt)' }}
                          >
                            <td className="py-2.5 px-4">
                              <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                                {getDisplayName(conv)}
                              </div>
                              <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                {conv.phone || conv.id}
                                {conv.branch ? ` · ${conv.branch}` : ''}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                style={{ background: 'var(--bg-pill)', color: 'var(--text-secondary)' }}
                              >
                                {conv.metaChannel ? `${conv.channel} · ${conv.metaChannel}` : conv.channel}
                              </span>
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5"
                                style={getStageBadgeStyle(conv.pipeline)}
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ background: getStageColor(conv.pipeline) }}
                                />
                                {conv.pipeline}
                                {conv.unreadCount && conv.unreadCount > 0 ? ` (${conv.unreadCount} unread)` : ''}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                              {conv.auditionDate ? (
                                <span>Audition: {conv.auditionDate}</span>
                              ) : conv.followUpDate ? (
                                <span>Follow-up: {conv.followUpDate}</span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>—</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                              {formatCompactRelativeTime(conv.lastMessageAt)}
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => openChat(conv.id)}
                                className="h-[26px] px-2.5 rounded-[6px] text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                                style={{
                                  background: 'var(--bg-pill)',
                                  border: '1px solid var(--border-input)',
                                  color: 'var(--text-primary)',
                                }}
                              >
                                <MessageSquare className="w-3 h-3" />
                                Chat
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT SIDEBAR: All Staff Members (Compact small font matching /page.tsx) ── */}
      {mobileAgentsOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileAgentsOpen(false)}
        />
      )}

      <aside
        className={`
          flex flex-col h-full shrink-0 overflow-hidden
          fixed md:relative right-0 top-0 z-50
          w-[270px] lg:w-[285px]
          transform transition-transform duration-200 ease-in-out
          ${mobileAgentsOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
        `}
        style={{
          background: 'var(--bg-panel)',
          borderLeft: '1px solid var(--border-main)',
        }}
      >
        {/* Right Sidebar Header */}
        <div
          className="p-3 shrink-0"
          style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-main)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
              Team & Staff ({staffList.length})
            </span>
            <button
              type="button"
              onClick={() => setMobileAgentsOpen(false)}
              className="md:hidden p-1 rounded cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Compact Agent Search */}
          <div className="relative mb-2">
            <Search
              className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              type="text"
              value={agentSearch}
              onChange={(e) => setAgentSearch(e.target.value)}
              placeholder="Filter staff..."
              className="w-full h-[26px] pl-7 pr-6 text-[11px] rounded-[6px] outline-none"
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-input)',
                color: 'var(--text-primary)',
              }}
            />
            {agentSearch && (
              <button
                type="button"
                onClick={() => setAgentSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Compact Role Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto flex-nowrap pb-0.5" style={{ WebkitOverflowScrolling: 'touch' }}>
            {[
              { id: 'all', label: 'All' },
              { id: 'admission', label: 'Admission' },
              { id: 'director', label: 'Director' },
              { id: 'finance', label: 'Finance' },
              { id: 'chairman', label: 'Chairman' },
            ].map((tab) => {
              const active = agentRoleFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setAgentRoleFilter(tab.id)}
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 transition-colors cursor-pointer"
                  style={
                    active
                      ? { background: 'var(--text-primary)', color: 'var(--bg-card)' }
                      : { background: 'var(--bg-pill)', color: 'var(--text-secondary)' }
                  }
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Staff List */}
        <div
          className="flex-1 min-h-0 overflow-y-auto"
          style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
        >
          {/* Individual Staff Rows */}
          {filteredStaff.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                No staff match filter
              </p>
            </div>
          ) : (
            filteredStaff.map((st) => {
              const isSelected = effectiveAgent.toLowerCase() === st.name.toLowerCase();
              const lastTimeStr = formatCompactRelativeTime(st.lastActiveAt);

              return (
                <div
                  key={st.name}
                  onClick={() => handleSelectAgent(st.name)}
                  className="flex items-start justify-between px-3 py-2.5 cursor-pointer transition-colors"
                  style={{
                    borderBottom: '1px solid var(--border-main)',
                    background: isSelected ? 'var(--bg-selected)' : undefined,
                  }}
                >
                  <div className="flex items-start gap-2.5 min-w-0 pr-2 flex-1">
                    <img
                      src={st.avatar || '/logo.png'}
                      alt={st.name}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = '/logo.png';
                      }}
                      className="w-9 h-9 rounded-xl object-cover shrink-0 mt-0.5 shadow-xs"
                      style={{ border: '1px solid var(--border-input)' }}
                    />
                    <div className="min-w-0 flex-1">
                      <h3
                        className="text-[12px] font-semibold leading-tight truncate"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {st.name}
                      </h3>
                      <p
                        className="text-[10px] truncate mt-0.5"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {formatRoleLabel(st.role)}
                      </p>
                      <div className="flex items-center gap-1.5 text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        <span>{st.totalLeadsAssigned} leads</span>
                        {st.bookedInPeriod > 0 && <span>· {st.bookedInPeriod} booked</span>}
                        {st.enrolledInPeriod > 0 && <span>· {st.enrolledInPeriod} enrolled</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end justify-between shrink-0 self-stretch gap-1">
                    <span
                      className="text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded"
                      style={{
                        background: isSelected ? 'var(--bg-card)' : 'var(--bg-pill)',
                        color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                      }}
                      title={`${st.periodActivitiesCount} events in ${periodDescription}`}
                    >
                      {st.periodActivitiesCount} act
                    </span>
                    {st.lastActiveAt > 0 && (
                      <span
                        className="text-[9px] font-medium mt-auto"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {lastTimeStr}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
}

export default function TeamActivitiesPage() {
  return (
    <Suspense fallback={null}>
      <TeamActivitiesPageInner />
    </Suspense>
  );
}
