"use client";

import React, { useState, useMemo, useCallback, useEffect, useRef, useDeferredValue, memo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useCRM, Conversation, ActivityLogEntry } from '../context/CRMContext';
import { isAutomatedTemplateMsg } from '../utils/conversationMessages';
import {
  clampRatePct,
  collectLoggedMessageKeys,
  getAttendedTime,
  getBookedTime,
  getConvertedTime,
  getCreatedTime,
  getUpdatedTime,
  isAttendedLead,
  isBookedLead,
  isConvertedLead,
  isMessageAlreadyInActivityLog,
  parseValidTs,
} from '../utils/teamMetrics';
import {
  Calendar,
  MessageSquare,
  Search,
  CheckCircle2,
  Clock,
  ArrowRight,
  UserCheck,
  Banknote,
  Award,
  Users,
  X,
  List,
  GitCommit,
  Mail,
  Activity,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

/* ── Date Helpers (Saudi / Cairo week: Sat–Fri) ── */

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const FULL_DAY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const TIME_12_FORMATTER = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});
const COMPACT_TIME_12_FORMATTER = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

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

function isoDateFromMs(timestamp: number): string {
  return isoDate(new Date(timestamp));
}

function parseIsoInputDate(val: string, fallback: Date): Date {
  if (!val) return getDayStart(fallback);
  const parts = val.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => isNaN(n))) return getDayStart(fallback);
  const [y, m, d] = parts;
  const parsed = new Date(y, m - 1, d);
  if (isNaN(parsed.getTime())) return getDayStart(fallback);
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function formatRangeLabel(start: Date, end: Date): string {
  const yr = start.getFullYear() !== end.getFullYear() ? `, ${start.getFullYear()}` : '';
  const endYr = `, ${end.getFullYear()}`;
  return `${SHORT_DATE_FORMATTER.format(start)}${yr} – ${SHORT_DATE_FORMATTER.format(end)}${endYr}`;
}

function formatDayLabel(d: Date): string {
  return FULL_DAY_FORMATTER.format(d);
}

function formatTime24Or12(timestamp: number): string {
  if (!timestamp || isNaN(timestamp)) return '—';
  return TIME_12_FORMATTER.format(timestamp);
}

function formatCompactRelativeTime(timestamp?: number, todayStartOverride?: number): string {
  if (!timestamp || isNaN(timestamp)) return '—';
  let todayStart = todayStartOverride;
  if (todayStart === undefined) {
    const now = new Date();
    todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }
  const yesterdayStart = todayStart - 86400000;

  if (timestamp >= todayStart) {
    return COMPACT_TIME_12_FORMATTER.format(timestamp);
  }
  if (timestamp >= yesterdayStart) {
    return 'Yesterday';
  }
  return SHORT_DATE_FORMATTER.format(timestamp);
}

function formatDayGroupHeader(dateKey: string, todayKey: string, yesterdayKey: string): string {
  if (dateKey === todayKey) return 'Today';
  if (dateKey === yesterdayKey) return 'Yesterday';
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return dateKey;
  return FULL_DAY_FORMATTER.format(new Date(y, m - 1, d));
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

/* ── Conversation Display & Attribution Helpers ── */

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

/* ── Per-Conversation WeakMap Cache (Zero Re-parse Across Polls & Staff Switches) ── */

type RawConvEvent = {
  id: string;
  type: ActivityLogEntry['type'];
  category: Exclude<ActivityCategory, 'all'>;
  rawActor: string;
  actorLower: string;
  rawRole?: string;
  summary: string;
  detail: string;
  fromValue?: string;
  toValue?: string;
  timestamp: number;
};

type ConvActorStats = {
  actorLower: string;
  sampleActor: string;
  sampleRole?: string;
  maxTimestamp: number;
  count: number;
  messages: number;
};

type ParsedConversationData = {
  leadName: string;
  leadNameLower: string;
  leadPhone: string;
  leadPhoneLower: string;
  channel: string;
  branch: string;
  branchLower: string;
  pipeline: string;
  pipelineLower: string;
  assignedAgent: string;
  assignedAgentLower: string;
  createdTs: number;
  waitingReply: boolean;
  bookedLead: boolean;
  bookedTs: number | null;
  bookActor: string;
  attendedLead: boolean;
  attTs: number | null;
  attActor: string;
  convertedLead: boolean;
  convTs: number | null;
  convActor: string;
  cashInNum: number;
  events: RawConvEvent[];
  actorStats: ConvActorStats[];
  involvedActors: Set<string>;
};

const conversationParseCache = new WeakMap<Conversation, ParsedConversationData>();

function getParsedConversationData(c: Conversation): ParsedConversationData {
  const cached = conversationParseCache.get(c);
  if (cached) return cached;

  const leadName = getDisplayName(c);
  const leadPhone = c.phone || '';
  const channel = c.metaChannel ? `${c.channel} · ${c.metaChannel}` : (c.channel || 'WA');
  const branch = c.branch || '';
  const pipeline = c.pipeline || 'New';
  const assignedAgent = (c.agent || 'Unassigned').trim();
  const assignedAgentLower = assignedAgent.toLowerCase();
  const createdTs = getCreatedTime(c);
  const cashInNum = Number(c.cashIn) || 0;

  const events: RawConvEvent[] = [];
  const actorStats: ConvActorStats[] = [];
  const involvedActors = new Set<string>();
  const seenTypes = new Set<string>();

  const findOrCreateStat = (actorLower: string, sampleActor: string, sampleRole?: string): ConvActorStats => {
    for (let i = 0; i < actorStats.length; i++) {
      if (actorStats[i].actorLower === actorLower) {
        if (!actorStats[i].sampleRole && sampleRole) {
          actorStats[i].sampleRole = sampleRole;
        }
        return actorStats[i];
      }
    }
    const created: ConvActorStats = {
      actorLower,
      sampleActor,
      sampleRole,
      maxTimestamp: 0,
      count: 0,
      messages: 0,
    };
    actorStats.push(created);
    return created;
  };

  const pushRawEvent = (
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
    if (!timestamp || isNaN(timestamp) || timestamp <= 0) return;
    const cleanActor = (rawActor || assignedAgent || 'Unassigned').trim();
    if (!cleanActor || cleanActor === 'Unassigned' || cleanActor === 'Staff') return;

    const actorLower = cleanActor.toLowerCase();
    involvedActors.add(actorLower);

    const stat = findOrCreateStat(actorLower, cleanActor, rawRole);
    if (timestamp > stat.maxTimestamp) stat.maxTimestamp = timestamp;
    stat.count += 1;
    if (type === 'message_sent') stat.messages += 1;

    events.push({
      id,
      type,
      category: mapTypeToCategory(type),
      rawActor: cleanActor,
      actorLower,
      rawRole,
      summary,
      detail,
      fromValue,
      toValue,
      timestamp,
    });
  };

  if (Array.isArray(c.activityLog) && c.activityLog.length > 0) {
    for (let i = 0; i < c.activityLog.length; i++) {
      const entry = c.activityLog[i];
      seenTypes.add(entry.type);
      const entryActor = entry.actor && entry.actor !== 'Staff' ? entry.actor : assignedAgent;
      pushRawEvent(
        `${c.id}_${entry.id}`,
        entry.type,
        entryActor,
        entry.actorRole,
        entry.summary,
        entry.detail || '',
        entry.timestamp,
        entry.fromValue,
        entry.toValue
      );
    }
  }

  const channelLabel = c.channel === 'WA' ? 'WhatsApp' : c.channel === 'IG' ? 'Instagram' : 'Messenger';
  if (Array.isArray(c.messages) && c.messages.length > 0) {
    const loggedMsgs = collectLoggedMessageKeys(c.activityLog);
    for (let i = 0; i < c.messages.length; i++) {
      const m = c.messages[i];
      if (m.isIncoming || !m.timestamp) continue;
      if (isAutomatedTemplateMsg(m)) continue;
      if (isMessageAlreadyInActivityLog(m, loggedMsgs)) continue;
      const sender = m.senderName && m.senderName !== 'Staff' ? m.senderName : assignedAgent;
      pushRawEvent(
        `${c.id}_msg_${m.id}`,
        'message_sent',
        sender,
        undefined,
        `Sent ${channelLabel} reply`,
        (m.text || '').slice(0, 160),
        m.timestamp
      );
    }
  } else if (!seenTypes.has('message_sent')) {
    if (c.lastOutgoingAt && assignedAgent !== 'Unassigned') {
      pushRawEvent(
        `${c.id}_lastout_${c.lastOutgoingAt}`,
        'message_sent',
        assignedAgent,
        undefined,
        `Sent ${channelLabel} reply`,
        c.lastMessageDirection === 'outgoing' ? (c.lastMessageText || '').slice(0, 160) : '',
        c.lastOutgoingAt
      );
    } else if (c.lastMessageDirection === 'outgoing' && c.lastMessageAt && assignedAgent !== 'Unassigned') {
      pushRawEvent(
        `${c.id}_lastdir_${c.lastMessageAt}`,
        'message_sent',
        assignedAgent,
        undefined,
        `Sent ${channelLabel} reply`,
        (c.lastMessageText || '').slice(0, 160),
        c.lastMessageAt
      );
    }
  }

  if (!seenTypes.has('lead_assigned') && assignedAgent !== 'Unassigned') {
    pushRawEvent(
      `${c.id}_assigned`,
      'lead_assigned',
      assignedAgent,
      undefined,
      'Claimed lead',
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
    pushRawEvent(
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

  const bookedLead = isBookedLead(c);
  const bookedTs = bookedLead ? getBookedTime(c) : null;
  const bookActor = (c.bookedBy || assignedAgent).trim();
  if (!seenTypes.has('audition_booked') && bookedLead && bookedTs) {
    pushRawEvent(
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

  const attendedLead = isAttendedLead(c);
  const attTs = attendedLead ? getAttendedTime(c) : null;
  const attActor = (c.attendedBy || assignedAgent).trim();
  if (!seenTypes.has('audition_outcome') && attendedLead && attTs) {
    const outLabel = c.auditionOutcome
      ? `Marked outcome: ${formatOutcomeLabel(c.auditionOutcome)}`
      : 'Marked audition attended';
    pushRawEvent(
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

  if (c.followUpCompleted && !seenTypes.has('followup_completed')) {
    const compTs = c.followUpCompletedAt ? parseValidTs(c.followUpCompletedAt) : getUpdatedTime(c);
    pushRawEvent(
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
    pushRawEvent(
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

  const convertedLead = isConvertedLead(c);
  const convTs = convertedLead ? getConvertedTime(c) : null;
  const convActor = (c.enrolledBy || assignedAgent).trim();
  if (!seenTypes.has('cash_recorded') && convertedLead && convTs) {
    pushRawEvent(
      `${c.id}_enrolled`,
      'cash_recorded',
      convActor,
      undefined,
      cashInNum > 0 ? `Recorded payment: ${cashInNum.toLocaleString()} EGP` : 'Enrolled student',
      c.branch ? `Branch: ${c.branch}` : 'Enrolled',
      convTs,
      'Attended',
      cashInNum > 0 ? `${cashInNum.toLocaleString()} EGP` : 'Enrolled'
    );
  }

  if (!seenTypes.has('note_updated') && c.notes && c.notes.trim() && assignedAgent !== 'Unassigned') {
    pushRawEvent(
      `${c.id}_note`,
      'note_updated',
      assignedAgent,
      undefined,
      'Updated lead notes',
      c.notes.trim().slice(0, 160),
      getUpdatedTime(c)
    );
  }

  const parsed: ParsedConversationData = {
    leadName,
    leadNameLower: leadName.toLowerCase(),
    leadPhone,
    leadPhoneLower: leadPhone.toLowerCase(),
    channel,
    branch,
    branchLower: branch.toLowerCase(),
    pipeline,
    pipelineLower: pipeline.toLowerCase(),
    assignedAgent,
    assignedAgentLower,
    createdTs,
    waitingReply: Boolean((c.unreadCount && c.unreadCount > 0) || c.pipeline === 'New'),
    bookedLead,
    bookedTs,
    bookActor,
    attendedLead,
    attTs,
    attActor,
    convertedLead,
    convTs,
    convActor,
    cashInNum,
    events,
    actorStats,
    involvedActors,
  };

  conversationParseCache.set(c, parsed);
  return parsed;
}

const ALL_AGENTS_ID = '__all__';
const TIMELINE_BATCH_SIZE = 50;
const LEADS_BATCH_SIZE = 50;

const TimelineSkeleton = memo(function TimelineSkeleton() {
  return (
    <div className="w-full space-y-6" aria-busy="true" aria-label="Loading timeline activities">
      <div className="flex items-center gap-3">
        <div className="h-5 w-20 rounded-md animate-pulse" style={{ background: 'var(--bg-pill)' }} />
        <div className="h-[1px] flex-1" style={{ background: 'var(--border-main)' }} />
      </div>
      <div className="space-y-4 pl-1 sm:pl-2">
        {[0, 1, 2, 3, 4, 5].map((idx) => (
          <div key={idx} className="relative pl-8 sm:pl-10">
            <div
              className="absolute left-0 top-0.5 w-[26px] sm:w-[28px] h-[26px] sm:h-[28px] rounded-full animate-pulse"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}
            />
            <div
              className="p-3.5 rounded-xl space-y-2.5 animate-pulse"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1">
                  <div className="h-3.5 w-36 rounded" style={{ background: 'var(--bg-pill)' }} />
                  <div className="h-3.5 w-24 rounded" style={{ background: 'var(--bg-pill)' }} />
                </div>
                <div className="h-5 w-16 rounded" style={{ background: 'var(--bg-pill)' }} />
              </div>
              <div className="h-8 w-3/4 rounded-lg" style={{ background: 'var(--bg-pill)' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

const TimelineEventCard = memo(function TimelineEventCard({
  act,
  showActor = false,
  onOpenChat,
  onSelectAgent,
}: {
  act: EnrichedActivity;
  showActor?: boolean;
  onOpenChat: (conversationId: string) => void;
  onSelectAgent?: (name: string) => void;
}) {
  const actionPhrase = getNaturalActionPhrase(act);
  const phraseText = showActor
    ? actionPhrase
    : actionPhrase.charAt(0).toUpperCase() + actionPhrase.slice(1);
  const isMessage = act.type === 'message_sent';
  const isAudition = act.type === 'audition_booked' || act.type === 'audition_outcome';
  const isPayment = act.type === 'cash_recorded';
  const isStage = act.type === 'stage_changed';
  const isFollowup = act.type === 'followup_scheduled' || act.type === 'followup_completed';
  const isAssignment = act.type === 'lead_assigned';

  let NodeIcon = Clock;
  if (isPayment) NodeIcon = Banknote;
  else if (isAudition) NodeIcon = act.type === 'audition_outcome' ? Award : Calendar;
  else if (isMessage) NodeIcon = MessageSquare;
  else if (isStage) NodeIcon = ArrowRight;
  else if (isAssignment) NodeIcon = UserCheck;
  else if (isFollowup) NodeIcon = act.type === 'followup_completed' ? CheckCircle2 : Clock;

  return (
    <div
      className="relative pl-8 sm:pl-10 group"
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 88px' }}
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
          background: 'var(--bg-card)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border-main)',
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
        {/* Top Bar: Actor (Team mode) + Natural Action + Lead + Timestamp + Chat Hover Button */}
        <div className="flex items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            {showActor && (
              <button
                type="button"
                onClick={() => onSelectAgent?.(act.actor)}
                className="text-[11px] font-bold px-2 py-0.5 rounded-md hover:underline cursor-pointer shrink-0"
                style={{
                  background: 'var(--bg-pill)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-input)',
                }}
                title={`Filter by ${act.actor}`}
              >
                {act.actor}
              </button>
            )}
            <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
              {phraseText}
            </span>
            <button
              type="button"
              onClick={() => onOpenChat(act.conversationId)}
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
              onClick={() => onOpenChat(act.conversationId)}
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
                <span>{act.branch}</span>
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
});

const CompactEventRow = memo(function CompactEventRow({
  act,
  showActor = false,
  onOpenChat,
  onSelectAgent,
}: {
  act: EnrichedActivity;
  showActor?: boolean;
  onOpenChat: (conversationId: string) => void;
  onSelectAgent?: (name: string) => void;
}) {
  const actionPhrase = getNaturalActionPhrase(act);
  const phraseText = showActor
    ? actionPhrase
    : actionPhrase.charAt(0).toUpperCase() + actionPhrase.slice(1);

  return (
    <div
      className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors group"
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 42px' }}
    >
      {/* Time + Actor (Team mode) + Action Phrase + Lead Name */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span
          className="text-[11px] font-mono shrink-0 w-[58px]"
          style={{ color: 'var(--text-muted)' }}
        >
          {formatTime24Or12(act.timestamp)}
        </span>

        <div className="min-w-0 flex items-center gap-1.5 flex-wrap flex-1 text-[12px]">
          {showActor && (
            <button
              type="button"
              onClick={() => onSelectAgent?.(act.actor)}
              className="text-[10px] font-bold px-1.5 py-0.5 rounded hover:underline cursor-pointer shrink-0"
              style={{
                background: 'var(--bg-pill)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-input)',
              }}
              title={`Filter by ${act.actor}`}
            >
              {act.actor}
            </button>
          )}
          <span style={{ color: 'var(--text-secondary)' }}>
            {phraseText}
          </span>
          <button
            type="button"
            onClick={() => onOpenChat(act.conversationId)}
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
        onClick={() => onOpenChat(act.conversationId)}
        className="h-6 px-2 rounded text-[10px] font-semibold flex items-center gap-1 transition-opacity opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 cursor-pointer shrink-0"
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
  );
});

const StaffSidebarRow = memo(function StaffSidebarRow({
  st,
  isSelected,
  isAllTime,
  periodDescription,
  todayStartMs,
  onSelect,
}: {
  st: StaffSummary;
  isSelected: boolean;
  isAllTime: boolean;
  periodDescription: string;
  todayStartMs: number;
  onSelect: (name: string) => void;
}) {
  const lastTimeStr = formatCompactRelativeTime(st.lastActiveAt, todayStartMs);

  return (
    <button
      type="button"
      onClick={() => onSelect(st.name)}
      className="w-full text-left flex items-start justify-between px-3 py-2.5 cursor-pointer transition-colors"
      style={{
        borderBottom: '1px solid var(--border-main)',
        background: isSelected ? 'var(--bg-selected)' : undefined,
      }}
    >
      <div className="flex items-start gap-2.5 min-w-0 pr-2 flex-1">
        <img
          src={st.avatar || '/logo.png'}
          alt={st.name}
          loading="lazy"
          decoding="async"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = '/logo.png';
          }}
          className="w-9 h-9 rounded-xl object-cover shrink-0 mt-0.5 shadow-xs"
          style={{ border: '1px solid var(--border-input)' }}
        />
        <div className="min-w-0 flex-1">
          <span
            className="block text-[12px] font-semibold leading-tight truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {st.name}
          </span>
          <span
            className="block text-[10px] truncate mt-0.5"
            style={{ color: 'var(--text-secondary)' }}
          >
            {formatRoleLabel(st.role)}
          </span>
          <div className="flex items-center gap-1.5 text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            <span>{isAllTime ? st.totalLeadsAssigned : st.periodLeadsAssigned} leads</span>
            {(isAllTime ? st.allTimeBooked : st.bookedInPeriod) > 0 && (
              <span>· {isAllTime ? st.allTimeBooked : st.bookedInPeriod} booked</span>
            )}
            {(isAllTime ? st.allTimeEnrolled : st.enrolledInPeriod) > 0 && (
              <span>· {isAllTime ? st.allTimeEnrolled : st.enrolledInPeriod} enrolled</span>
            )}
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
    </button>
  );
});

const AllAgentsSidebarRow = memo(function AllAgentsSidebarRow({
  staffCount,
  activeStaffCount,
  totalActivitiesCount,
  totalLeadsAssigned,
  bookedCount,
  enrolledCount,
  lastActiveAt,
  isSelected,
  periodDescription,
  todayStartMs,
  onSelect,
}: {
  staffCount: number;
  activeStaffCount: number;
  totalActivitiesCount: number;
  totalLeadsAssigned: number;
  bookedCount: number;
  enrolledCount: number;
  lastActiveAt: number;
  isSelected: boolean;
  periodDescription: string;
  todayStartMs: number;
  onSelect: (name: string) => void;
}) {
  const lastTimeStr = formatCompactRelativeTime(lastActiveAt, todayStartMs);

  return (
    <button
      type="button"
      onClick={() => onSelect(ALL_AGENTS_ID)}
      className="w-full text-left flex items-start justify-between px-3 py-2.5 cursor-pointer transition-colors"
      style={{
        borderBottom: '1px solid var(--border-main)',
        background: isSelected ? 'var(--bg-selected)' : undefined,
      }}
    >
      <div className="flex items-start gap-2.5 min-w-0 pr-2 flex-1">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 shadow-xs"
          style={{
            background: 'var(--bg-pill)',
            border: '1px solid var(--border-input)',
            color: 'var(--text-primary)',
          }}
        >
          <Users className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <span
            className="block text-[12px] font-bold leading-tight truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            All Agents
          </span>
          <span
            className="block text-[10px] truncate mt-0.5"
            style={{ color: 'var(--text-secondary)' }}
          >
            {staffCount} staff · {activeStaffCount} active
          </span>
          <div className="flex items-center gap-1.5 text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            <span>{totalLeadsAssigned} leads</span>
            {bookedCount > 0 && <span>· {bookedCount} booked</span>}
            {enrolledCount > 0 && <span>· {enrolledCount} enrolled</span>}
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
          title={`${totalActivitiesCount} team events in ${periodDescription}`}
        >
          {totalActivitiesCount} act
        </span>
        {lastActiveAt > 0 && (
          <span
            className="text-[9px] font-medium mt-auto"
            style={{ color: 'var(--text-muted)' }}
          >
            {lastTimeStr}
          </span>
        )}
      </div>
    </button>
  );
});

type TimelineEventRef = {
  conversationId: string;
  parsed: ParsedConversationData;
  ev: RawConvEvent;
  actor: string;
  actorRole: string;
};

type TeamAggregateSummary = {
  totalActivitiesCount: number;
  totalLeadsAssigned: number;
  periodLeadsAssigned: number;
  waitingReplyCount: number;
  booked: number;
  attended: number;
  enrolled: number;
  cash: number;
  lastActiveAt: number;
  activeStaffCount: number;
};

function TeamActivitiesPageInner() {
  const { conversations, assignableAgents, teamMembers, loading, openChat } = useCRM();
  const searchParams = useSearchParams();
  const urlAgent = searchParams.get('agent') || searchParams.get('officer');

  // Date filter state
  const [filterMode, setFilterMode] = useState<'all' | 'day' | 'week' | 'range'>('all');
  const [currentDate, setCurrentDate] = useState<Date>(() => getDayStart(new Date()));
  const [customStartDate, setCustomStartDate] = useState<string>(() => isoDate(getWeekStart(new Date())));
  const [customEndDate, setCustomEndDate] = useState<string>(() => isoDate(getDayStart(new Date())));

  // Selected agent in the right sidebar (derived from URL param unless user explicitly clicked another staff member)
  const cleanUrlAgent = (urlAgent || '').trim();
  const [userPickedAgent, setUserPickedAgent] = useState<{ agent: string; urlAtPick: string } | null>(null);
  const selectedAgent =
    userPickedAgent && userPickedAgent.urlAtPick === cleanUrlAgent
      ? userPickedAgent.agent
      : cleanUrlAgent;

  // Main view mode: 'timeline' | 'funnel' | 'leads'
  const [mainTab, setMainTab] = useState<'timeline' | 'funnel' | 'leads'>('timeline');

  // Activity presentation mode: 'timeline' (rich storytelling cards) vs 'compact' (borderless dense scanner)
  const [feedViewStyle, setFeedViewStyle] = useState<'timeline' | 'compact'>('timeline');

  // Activity category filter
  const [categoryFilter] = useState<ActivityCategory>('all');

  // Search queries
  const [activitySearch, setActivitySearch] = useState<string>('');
  const [agentSearch, setAgentSearch] = useState<string>('');
  const [agentRoleFilter, setAgentRoleFilter] = useState<string>('all');

  const deferredActivitySearch = useDeferredValue(activitySearch);
  const deferredAgentSearch = useDeferredValue(agentSearch);

  // Incremental windowing counts + scroll refs
  const [visibleTimelineCount, setVisibleTimelineCount] = useState<number>(TIMELINE_BATCH_SIZE);
  const [visibleLeadsCount, setVisibleLeadsCount] = useState<number>(LEADS_BATCH_SIZE);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const timelineSentinelRef = useRef<HTMLDivElement>(null);
  const leadsSentinelRef = useRef<HTMLDivElement>(null);

  // Mobile drawer state for right sidebar
  const [mobileAgentsOpen, setMobileAgentsOpen] = useState<boolean>(false);

  // Date boundaries
  const todayStart = useMemo(() => getDayStart(new Date()), []);
  const todayStartMs = useMemo(() => todayStart.getTime(), [todayStart]);
  const yesterdayStart = useMemo(() => addDays(todayStart, -1), [todayStart]);
  const thisWeekStart = useMemo(() => getWeekStart(todayStart), [todayStart]);
  const lastWeekStart = useMemo(() => addDays(thisWeekStart, -7), [thisWeekStart]);

  const todayKey = useMemo(() => isoDate(todayStart), [todayStart]);
  const yesterdayKey = useMemo(() => isoDate(yesterdayStart), [yesterdayStart]);

  const dayStart = useMemo(() => getDayStart(currentDate), [currentDate]);
  const dayEnd = useMemo(() => getDayEnd(currentDate), [currentDate]);
  const weekStart = useMemo(() => getWeekStart(currentDate), [currentDate]);
  const weekEnd = useMemo(() => getWeekEnd(weekStart), [weekStart]);

  const { rangeStart, rangeEnd } = useMemo(() => {
    const a = parseIsoInputDate(customStartDate, todayStart);
    const b = parseIsoInputDate(customEndDate, todayStart);
    const start = a.getTime() <= b.getTime() ? a : b;
    const end = a.getTime() <= b.getTime() ? b : a;
    return { rangeStart: getDayStart(start), rangeEnd: getDayEnd(end) };
  }, [customStartDate, customEndDate, todayStart]);

  const periodStartMs = useMemo(() => {
    if (filterMode === 'day') return dayStart.getTime();
    if (filterMode === 'week') return weekStart.getTime();
    if (filterMode === 'range') return rangeStart.getTime();
    return 0;
  }, [filterMode, dayStart, weekStart, rangeStart]);

  const periodEndMs = useMemo(() => {
    if (filterMode === 'day') return dayEnd.getTime();
    if (filterMode === 'week') return weekEnd.getTime();
    if (filterMode === 'range') return rangeEnd.getTime();
    return 0;
  }, [filterMode, dayEnd, weekEnd, rangeEnd]);

  const isToday = filterMode === 'day' && dayStart.getTime() === todayStart.getTime();
  const isYesterday = filterMode === 'day' && dayStart.getTime() === yesterdayStart.getTime();
  const isThisWeek = filterMode === 'week' && weekStart.getTime() === thisWeekStart.getTime();
  const isLastWeek = filterMode === 'week' && weekStart.getTime() === lastWeekStart.getTime();

  const resetPagedWindows = () => {
    setVisibleTimelineCount(TIMELINE_BATCH_SIZE);
    setVisibleLeadsCount(LEADS_BATCH_SIZE);
  };

  const goAllTime = () => {
    setFilterMode('all');
    resetPagedWindows();
  };

  const goToday = () => {
    setCurrentDate(todayStart);
    setFilterMode('day');
    resetPagedWindows();
  };

  const goYesterday = () => {
    setCurrentDate(yesterdayStart);
    setFilterMode('day');
    resetPagedWindows();
  };

  const goThisWeek = () => {
    setCurrentDate(thisWeekStart);
    setFilterMode('week');
    resetPagedWindows();
  };

  const goLastWeek = () => {
    setCurrentDate(lastWeekStart);
    setFilterMode('week');
    resetPagedWindows();
  };

  const goCustomRange = () => {
    setFilterMode('range');
    resetPagedWindows();
  };

  const stepPeriod = (dir: -1 | 1) => {
    if (filterMode === 'day') {
      setCurrentDate((prev) => addDays(prev, dir));
    } else if (filterMode === 'week') {
      setCurrentDate((prev) => addDays(prev, dir * 7));
    }
    resetPagedWindows();
  };

  const periodDescription = useMemo(() => {
    if (filterMode === 'day') {
      const prefix = isToday ? 'Today · ' : isYesterday ? 'Yesterday · ' : '';
      return `${prefix}${formatDayLabel(dayStart)}`;
    }
    if (filterMode === 'week') {
      return formatRangeLabel(weekStart, weekEnd);
    }
    if (filterMode === 'range') {
      return isoDate(rangeStart) === isoDate(rangeEnd)
        ? formatDayLabel(rangeStart)
        : formatRangeLabel(rangeStart, rangeEnd);
    }
    return 'All Time';
  }, [filterMode, isToday, isYesterday, dayStart, weekStart, weekEnd, rangeStart, rangeEnd]);

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

  /* ── Step 1: Fast Staff Summary + Team Aggregate (O(conversations), WeakMap Cached) ── */
  const { staffList, staffByLower, teamAggregate } = useMemo(() => {
    const isAllTime = filterMode === 'all';
    const inPeriod = (ts: number | null | undefined): boolean => {
      if (!ts || ts <= 0) return false;
      if (isAllTime) return true;
      return ts >= periodStartMs && ts <= periodEndMs;
    };

    const staffMap = new Map<string, StaffSummary>();
    const canonicalNameMap = new Map<string, string>();
    const seedMembers = teamMembers && teamMembers.length > 0 ? teamMembers : assignableAgents;
    const memberMetaByLower = new Map<string, (typeof seedMembers)[number]>();
    for (let i = 0; i < seedMembers.length; i++) {
      const m = seedMembers[i];
      if (m.name) {
        const lower = m.name.trim().toLowerCase();
        if (!memberMetaByLower.has(lower)) memberMetaByLower.set(lower, m);
      }
    }

    const ensureStaff = (rawName?: string, fallbackRole?: string): StaffSummary | null => {
      const clean = (rawName || '').trim();
      if (!clean || clean === 'Unassigned' || clean === 'Staff' || clean === 'System') {
        return null;
      }
      const lower = clean.toLowerCase();
      let canonical = canonicalNameMap.get(lower);
      if (!canonical) {
        canonical = clean;
        canonicalNameMap.set(lower, canonical);
      }
      let existing = staffMap.get(canonical);
      if (!existing) {
        const knownRole = roleMap.get(lower) || fallbackRole || 'admission_officer';
        const memberMeta = memberMetaByLower.get(lower);
        existing = {
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
        };
        staffMap.set(canonical, existing);
      }
      return existing;
    };

    for (let i = 0; i < seedMembers.length; i++) {
      const m = seedMembers[i];
      if (m.name) {
        const st = ensureStaff(m.name, m.role);
        if (st) {
          if (m.email) st.email = m.email;
          if (m.avatar) st.avatar = m.avatar;
        }
      }
    }

    for (let i = 0; i < conversations.length; i++) {
      const p = getParsedConversationData(conversations[i]);

      if (p.assignedAgent && p.assignedAgent !== 'Unassigned') {
        const st = ensureStaff(p.assignedAgent);
        if (st) {
          st.totalLeadsAssigned += 1;
          st.allTimeLeads += 1;
          if (inPeriod(p.createdTs)) {
            st.periodLeadsAssigned += 1;
            if (p.waitingReply) {
              st.waitingReplyCount += 1;
            }
          }
        }
      }

      if (p.bookedLead) {
        const bSt = ensureStaff(p.bookActor);
        if (bSt) {
          bSt.allTimeBooked += 1;
          if (isAllTime || inPeriod(p.bookedTs)) {
            bSt.bookedInPeriod += 1;
          }
        }
      }
      if (p.attendedLead) {
        const aSt = ensureStaff(p.attActor);
        if (aSt) {
          aSt.allTimeAttended += 1;
          if (isAllTime || inPeriod(p.attTs)) {
            aSt.attendedInPeriod += 1;
          }
        }
      }
      if (p.convertedLead) {
        const cSt = ensureStaff(p.convActor);
        if (cSt) {
          cSt.allTimeEnrolled += 1;
          cSt.allTimeCash += p.cashInNum;
          if (isAllTime || inPeriod(p.convTs)) {
            cSt.enrolledInPeriod += 1;
            cSt.cashInPeriod += p.cashInNum;
          }
        }
      }

      if (isAllTime) {
        for (let j = 0; j < p.actorStats.length; j++) {
          const stat = p.actorStats[j];
          const st = ensureStaff(stat.sampleActor, stat.sampleRole);
          if (!st) continue;
          if (stat.maxTimestamp > st.lastActiveAt) {
            st.lastActiveAt = stat.maxTimestamp;
          }
          st.periodActivitiesCount += stat.count;
          st.messagesInPeriod += stat.messages;
        }
      } else {
        for (let j = 0; j < p.events.length; j++) {
          const ev = p.events[j];
          const st = ensureStaff(ev.rawActor, ev.rawRole);
          if (!st) continue;
          if (ev.timestamp > st.lastActiveAt) {
            st.lastActiveAt = ev.timestamp;
          }
          if (ev.timestamp >= periodStartMs && ev.timestamp <= periodEndMs) {
            st.periodActivitiesCount += 1;
            if (ev.type === 'message_sent') st.messagesInPeriod += 1;
          }
        }
      }
    }

    const sortedStaff = Array.from(staffMap.values()).sort((a, b) => {
      if (b.periodActivitiesCount !== a.periodActivitiesCount) {
        return b.periodActivitiesCount - a.periodActivitiesCount;
      }
      if (b.lastActiveAt !== a.lastActiveAt) {
        return b.lastActiveAt - a.lastActiveAt;
      }
      return b.totalLeadsAssigned - a.totalLeadsAssigned;
    });

    const byLower = new Map<string, StaffSummary>();
    const aggregate: TeamAggregateSummary = {
      totalActivitiesCount: 0,
      totalLeadsAssigned: 0,
      periodLeadsAssigned: 0,
      waitingReplyCount: 0,
      booked: 0,
      attended: 0,
      enrolled: 0,
      cash: 0,
      lastActiveAt: 0,
      activeStaffCount: 0,
    };

    for (let i = 0; i < sortedStaff.length; i++) {
      const st = sortedStaff[i];
      byLower.set(st.name.toLowerCase(), st);
      aggregate.totalActivitiesCount += st.periodActivitiesCount;
      aggregate.totalLeadsAssigned += st.totalLeadsAssigned;
      aggregate.periodLeadsAssigned += st.periodLeadsAssigned;
      aggregate.waitingReplyCount += st.waitingReplyCount;
      aggregate.booked += isAllTime ? st.allTimeBooked : st.bookedInPeriod;
      aggregate.attended += isAllTime ? st.allTimeAttended : st.attendedInPeriod;
      aggregate.enrolled += isAllTime ? st.allTimeEnrolled : st.enrolledInPeriod;
      aggregate.cash += isAllTime ? st.allTimeCash : st.cashInPeriod;
      if (st.lastActiveAt > aggregate.lastActiveAt) aggregate.lastActiveAt = st.lastActiveAt;
      if (st.periodActivitiesCount > 0) aggregate.activeStaffCount += 1;
    }

    return { staffList: sortedStaff, staffByLower: byLower, teamAggregate: aggregate };
  }, [conversations, assignableAgents, teamMembers, roleMap, filterMode, periodStartMs, periodEndMs]);

  // Filter agents in the Right Sidebar
  const filteredStaff = useMemo(() => {
    const q = deferredAgentSearch.toLowerCase().trim();
    return staffList.filter((st) => {
      if (agentRoleFilter !== 'all') {
        const r = st.role.toLowerCase();
        if (agentRoleFilter === 'admission' && !['admission_officer', 'agent'].includes(r)) return false;
        if (agentRoleFilter === 'director' && r !== 'enrollment_director') return false;
        if (agentRoleFilter === 'finance' && r !== 'finance') return false;
        if (agentRoleFilter === 'chairman' && !['chairman', 'owner', 'manager'].includes(r)) return false;
      }
      if (q) {
        return st.name.toLowerCase().includes(q) || formatRoleLabel(st.role).toLowerCase().includes(q);
      }
      return true;
    });
  }, [staffList, agentRoleFilter, deferredAgentSearch]);

  // Active agent resolution: defaults to ALL_AGENTS_ID unless URL or user specifies a staff member
  const effectiveAgent = useMemo(() => {
    if (!selectedAgent) return ALL_AGENTS_ID;
    const clean = selectedAgent.trim().toLowerCase();
    if (!clean || clean === 'all' || clean === ALL_AGENTS_ID) {
      return ALL_AGENTS_ID;
    }
    const exact = staffList.find((s) => s.name.toLowerCase() === clean);
    if (exact) return exact.name;
    const partial = staffList.find((s) => {
      const sName = s.name.toLowerCase();
      return sName.includes(clean) || clean.includes(sName);
    });
    if (partial) return partial.name;
    return selectedAgent;
  }, [selectedAgent, staffList]);

  const isAllAgents = effectiveAgent === ALL_AGENTS_ID;

  const selectedStaffObj = useMemo(() => {
    if (isAllAgents || !effectiveAgent) return null;
    const clean = effectiveAgent.trim().toLowerCase();
    return (
      staffByLower.get(clean) ||
      staffList.find((s) => {
        const sName = s.name.toLowerCase();
        return sName.includes(clean) || clean.includes(sName);
      }) ||
      null
    );
  }, [isAllAgents, effectiveAgent, staffByLower, staffList]);

  const selectedMetrics = useMemo(() => {
    const leads = isAllAgents
      ? filterMode === 'all'
        ? teamAggregate.totalLeadsAssigned
        : teamAggregate.periodLeadsAssigned
      : selectedStaffObj
      ? filterMode === 'all'
        ? selectedStaffObj.totalLeadsAssigned
        : selectedStaffObj.periodLeadsAssigned
      : 0;
    const booked = isAllAgents
      ? teamAggregate.booked
      : selectedStaffObj
      ? filterMode === 'all'
        ? selectedStaffObj.allTimeBooked
        : selectedStaffObj.bookedInPeriod
      : 0;
    const attended = isAllAgents
      ? teamAggregate.attended
      : selectedStaffObj
      ? filterMode === 'all'
        ? selectedStaffObj.allTimeAttended
        : selectedStaffObj.attendedInPeriod
      : 0;
    const enrolled = isAllAgents
      ? teamAggregate.enrolled
      : selectedStaffObj
      ? filterMode === 'all'
        ? selectedStaffObj.allTimeEnrolled
        : selectedStaffObj.enrolledInPeriod
      : 0;
    const cash = isAllAgents
      ? teamAggregate.cash
      : selectedStaffObj
      ? filterMode === 'all'
        ? selectedStaffObj.allTimeCash
        : selectedStaffObj.cashInPeriod
      : 0;

    const bookingRate = Math.round(clampRatePct(booked, leads));
    const showRate = Math.round(clampRatePct(attended, booked));
    const closingRate = Math.round(clampRatePct(enrolled, booked));

    return {
      totalLeads: leads,
      totalBooked: booked,
      totalAttended: attended,
      totalEnrolled: enrolled,
      totalCash: cash,
      activeStaffCount: isAllAgents ? teamAggregate.activeStaffCount : selectedStaffObj ? 1 : 0,
      bookingRate,
      showRate,
      closingRate,
    };
  }, [isAllAgents, teamAggregate, selectedStaffObj, filterMode]);

  // Funnel calculations derived from selectedMetrics
  const funnelCalcs = useMemo(() => {
    const leads = selectedMetrics.totalLeads;
    const booked = selectedMetrics.totalBooked;
    const attended = selectedMetrics.totalAttended;
    const enrolled = selectedMetrics.totalEnrolled;
    const cash = selectedMetrics.totalCash;

    const bookingRate = clampRatePct(booked, leads);
    const bookingRateStr = bookingRate > 0 && bookingRate < 10 ? bookingRate.toFixed(1) : Math.round(bookingRate).toString();
    const bookingDrop = leads > 0 ? Math.max(0, 100 - bookingRate).toFixed(1) : '0';

    const showRate = clampRatePct(attended, booked);
    const showRateStr = Math.round(showRate).toString();
    const showDrop = booked > 0 ? Math.round(Math.max(0, 100 - showRate)).toString() : '0';

    const closeDenom = attended > 0 ? attended : booked;
    const closeRate = clampRatePct(enrolled, closeDenom);
    const closeRateStr = Math.round(closeRate).toString();
    const closeDrop = closeDenom > 0 ? Math.round(Math.max(0, 100 - closeRate)).toString() : '0';

    const overallWinRatePct = clampRatePct(enrolled, leads);
    const overallWinRate = leads > 0 ? overallWinRatePct.toFixed(1) : '0';

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

  /* ── Step 2: Lightweight Event-Ref Index (Single Staff OR All Agents; Hydrated Only for Visible Slice) ── */
  const effectiveAgentLower = isAllAgents ? '' : effectiveAgent.trim().toLowerCase();
  const matchedActorName =
    selectedStaffObj && selectedStaffObj.name.toLowerCase() === effectiveAgentLower
      ? selectedStaffObj.name
      : effectiveAgent;
  const matchedActorRole =
    selectedStaffObj && selectedStaffObj.name.toLowerCase() === effectiveAgentLower
      ? selectedStaffObj.role
      : roleMap.get(effectiveAgentLower) || 'admission_officer';

  const timelineRefs = useMemo(() => {
    const isAllTime = filterMode === 'all';
    const startMs = isAllTime ? 0 : periodStartMs;
    const endMs = isAllTime ? 0 : periodEndMs;

    const list: TimelineEventRef[] = [];
    if (isAllAgents) {
      for (let i = 0; i < conversations.length; i++) {
        const c = conversations[i];
        const p = getParsedConversationData(c);
        for (let j = 0; j < p.events.length; j++) {
          const ev = p.events[j];
          const staffInfo = staffByLower.get(ev.actorLower);
          if (!staffInfo) continue;
          if (!isAllTime && (ev.timestamp < startMs || ev.timestamp > endMs)) continue;
          list.push({
            conversationId: c.id,
            parsed: p,
            ev,
            actor: staffInfo.name,
            actorRole: staffInfo.role,
          });
        }
      }
    } else if (effectiveAgentLower) {
      for (let i = 0; i < conversations.length; i++) {
        const c = conversations[i];
        const p = getParsedConversationData(c);
        if (!p.involvedActors.has(effectiveAgentLower)) continue;

        for (let j = 0; j < p.events.length; j++) {
          const ev = p.events[j];
          if (ev.actorLower !== effectiveAgentLower) continue;
          if (!isAllTime && (ev.timestamp < startMs || ev.timestamp > endMs)) continue;
          list.push({
            conversationId: c.id,
            parsed: p,
            ev,
            actor: matchedActorName || ev.rawActor,
            actorRole: matchedActorRole,
          });
        }
      }
    }

    list.sort((a, b) => b.ev.timestamp - a.ev.timestamp);
    return list;
  }, [
    conversations,
    isAllAgents,
    effectiveAgentLower,
    matchedActorName,
    matchedActorRole,
    staffByLower,
    filterMode,
    periodStartMs,
    periodEndMs,
  ]);

  const visibleTimelineRefs = useMemo(() => {
    if (mainTab !== 'timeline') return [];
    const q = deferredActivitySearch.toLowerCase().trim();
    if (categoryFilter === 'all' && !q) {
      return timelineRefs;
    }
    return timelineRefs.filter((ref) => {
      if (categoryFilter !== 'all' && ref.ev.category !== categoryFilter) return false;
      if (q) {
        return (
          ref.parsed.leadNameLower.includes(q) ||
          ref.parsed.leadPhoneLower.includes(q) ||
          ref.ev.summary.toLowerCase().includes(q) ||
          ref.ev.detail.toLowerCase().includes(q) ||
          ref.actor.toLowerCase().includes(q) ||
          ref.parsed.branchLower.includes(q)
        );
      }
      return true;
    });
  }, [mainTab, timelineRefs, categoryFilter, deferredActivitySearch]);

  const displayedActivities = useMemo(() => {
    const slice = visibleTimelineRefs.slice(0, visibleTimelineCount);
    const out: EnrichedActivity[] = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      const ref = slice[i];
      const p = ref.parsed;
      const ev = ref.ev;
      out[i] = {
        id: ev.id,
        conversationId: ref.conversationId,
        leadName: p.leadName,
        leadPhone: p.leadPhone,
        channel: p.channel,
        branch: p.branch,
        pipeline: p.pipeline,
        type: ev.type,
        category: ev.category,
        actor: ref.actor,
        actorRole: ref.actorRole,
        summary: ev.summary,
        detail: ev.detail,
        fromValue: ev.fromValue,
        toValue: ev.toValue,
        timestamp: ev.timestamp,
        dateKey: '',
      };
    }
    return out;
  }, [visibleTimelineRefs, visibleTimelineCount]);

  const hasMoreTimeline = visibleTimelineCount < visibleTimelineRefs.length;

  const groupedActivities = useMemo(() => {
    if (mainTab !== 'timeline' || displayedActivities.length === 0) return [];
    const groups: { dateKey: string; label: string; items: EnrichedActivity[] }[] = [];
    const map = new Map<string, EnrichedActivity[]>();
    for (let i = 0; i < displayedActivities.length; i++) {
      const item = displayedActivities[i];
      const dateKey = isoDateFromMs(item.timestamp);
      let bucket = map.get(dateKey);
      if (!bucket) {
        bucket = [];
        map.set(dateKey, bucket);
      }
      bucket.push(item);
    }
    map.forEach((items, dateKey) => {
      groups.push({
        dateKey,
        label: formatDayGroupHeader(dateKey, todayKey, yesterdayKey),
        items,
      });
    });
    return groups;
  }, [mainTab, displayedActivities, todayKey, yesterdayKey]);

  const agentAssignedLeads = useMemo(() => {
    if (!isAllAgents && !effectiveAgentLower) return [];
    const q = deferredActivitySearch.toLowerCase().trim();
    const res: Conversation[] = [];
    for (let i = 0; i < conversations.length; i++) {
      const c = conversations[i];
      const p = getParsedConversationData(c);
      if (isAllAgents) {
        if (!p.assignedAgent || p.assignedAgent === 'Unassigned') continue;
      } else if (p.assignedAgentLower !== effectiveAgentLower) {
        continue;
      }
      if (filterMode !== 'all' && (!p.createdTs || p.createdTs < periodStartMs || p.createdTs > periodEndMs)) {
        continue;
      }
      if (q) {
        if (
          !p.leadNameLower.includes(q) &&
          !p.leadPhoneLower.includes(q) &&
          !p.pipelineLower.includes(q) &&
          !p.branchLower.includes(q) &&
          !(isAllAgents && p.assignedAgentLower.includes(q))
        ) {
          continue;
        }
      }
      res.push(c);
    }
    return res;
  }, [conversations, isAllAgents, effectiveAgentLower, filterMode, periodStartMs, periodEndMs, deferredActivitySearch]);

  const displayedLeads = useMemo(() => {
    if (mainTab !== 'leads') return [];
    return agentAssignedLeads.slice(0, visibleLeadsCount);
  }, [mainTab, agentAssignedLeads, visibleLeadsCount]);

  const hasMoreLeads = visibleLeadsCount < agentAssignedLeads.length;

  // Operational breakdown: Computed only when Funnel tab is active
  const agentPipelineBreakdown = useMemo(() => {
    if (mainTab !== 'funnel' || (!isAllAgents && !effectiveAgentLower)) {
      return { stages: [], channels: [], total: 0 };
    }

    let total = 0;
    const stageMap: Record<string, number> = {};
    const channelCounts: Record<'WhatsApp' | 'Instagram' | 'Messenger', number> = {
      WhatsApp: 0,
      Instagram: 0,
      Messenger: 0,
    };

    for (let i = 0; i < conversations.length; i++) {
      const c = conversations[i];
      const p = getParsedConversationData(c);
      if (isAllAgents) {
        if (!p.assignedAgent || p.assignedAgent === 'Unassigned') continue;
      } else if (p.assignedAgentLower !== effectiveAgentLower) {
        continue;
      }
      if (filterMode !== 'all' && (!p.createdTs || p.createdTs < periodStartMs || p.createdTs > periodEndMs)) {
        continue;
      }

      total += 1;
      const s = p.pipeline.trim();
      stageMap[s] = (stageMap[s] || 0) + 1;

      const ch = (c.channel || '').toLowerCase();
      if (ch.includes('wa') || ch.includes('whatsapp')) channelCounts.WhatsApp += 1;
      else if (ch.includes('ig') || ch.includes('instagram')) channelCounts.Instagram += 1;
      else if (ch.includes('fb') || ch.includes('messenger') || ch.includes('facebook')) channelCounts.Messenger += 1;
    }

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
  }, [mainTab, conversations, isAllAgents, effectiveAgentLower, filterMode, periodStartMs, periodEndMs]);

  // Incremental loading via IntersectionObserver for Timeline and Leads tabs
  useEffect(() => {
    if (mainTab !== 'timeline' || !hasMoreTimeline) return;
    const root = scrollContainerRef.current;
    const target = timelineSentinelRef.current;
    if (!root || !target || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleTimelineCount((prev) => Math.min(prev + TIMELINE_BATCH_SIZE, visibleTimelineRefs.length));
        }
      },
      { root, rootMargin: '400px 0px' }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [mainTab, hasMoreTimeline, visibleTimelineRefs.length, feedViewStyle]);

  useEffect(() => {
    if (mainTab !== 'leads' || !hasMoreLeads) return;
    const root = scrollContainerRef.current;
    const target = leadsSentinelRef.current;
    if (!root || !target || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleLeadsCount((prev) => Math.min(prev + LEADS_BATCH_SIZE, agentAssignedLeads.length));
        }
      },
      { root, rootMargin: '400px 0px' }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [mainTab, hasMoreLeads, agentAssignedLeads.length]);

  const handleSelectAgent = useCallback((name: string) => {
    setUserPickedAgent({ agent: name, urlAtPick: cleanUrlAgent });
    setMobileAgentsOpen(false);
    setVisibleTimelineCount(TIMELINE_BATCH_SIZE);
    setVisibleLeadsCount(LEADS_BATCH_SIZE);
    scrollContainerRef.current?.scrollTo({ top: 0 });
  }, [cleanUrlAgent]);

  const handleMainTabChange = useCallback((tab: 'timeline' | 'funnel' | 'leads') => {
    setMainTab(tab);
    if (tab === 'timeline') setVisibleTimelineCount(TIMELINE_BATCH_SIZE);
    if (tab === 'leads') setVisibleLeadsCount(LEADS_BATCH_SIZE);
  }, []);

  const handleFeedViewStyleChange = useCallback((style: 'timeline' | 'compact') => {
    setFeedViewStyle(style);
    setVisibleTimelineCount(TIMELINE_BATCH_SIZE);
  }, []);

  const handleActivitySearchChange = useCallback((value: string) => {
    setActivitySearch(value);
    setVisibleTimelineCount(TIMELINE_BATCH_SIZE);
    setVisibleLeadsCount(LEADS_BATCH_SIZE);
  }, []);

  return (
    <div
      className="flex h-full min-h-0 overflow-hidden"
      style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}
    >
      {/* ── MAIN PAGE (LEFT / CENTER): Selected Agent's Activities & Leads ── */}
      <div
        ref={scrollContainerRef}
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
            {/* Top Profile Header: All Agents Team Summary OR Selected Staff Profile */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
              <div className="flex items-center gap-5 sm:gap-6 min-w-0 flex-1">
                {/* Profile Picture / Team Icon Container */}
                <div className="shrink-0">
                  {isAllAgents ? (
                    <div
                      className="w-24 h-24 sm:w-[104px] sm:h-[104px] md:w-[108px] md:h-[108px] rounded-2xl flex items-center justify-center shrink-0 shadow-xs"
                      style={{
                        background: 'var(--bg-pill)',
                        border: '1px solid var(--border-main)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <Users className="w-10 h-10" />
                    </div>
                  ) : (
                    <img
                      src={selectedStaffObj?.avatar || '/logo.png'}
                      alt={selectedStaffObj?.name || effectiveAgent}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = '/logo.png';
                      }}
                      className="w-24 h-24 sm:w-[104px] sm:h-[104px] md:w-[108px] md:h-[108px] rounded-2xl object-cover shrink-0 shadow-xs"
                      style={{ border: '1px solid var(--border-main)' }}
                    />
                  )}
                </div>

                {/* Identity & Contact/Activity Summary */}
                <div className="min-w-0 flex-1 flex flex-col justify-center gap-1 sm:gap-1.5">
                  <h1 className="text-[22px] sm:text-[24px] font-bold tracking-tight text-[var(--text-primary)] leading-tight">
                    {isAllAgents ? 'All Agents' : selectedStaffObj?.name || effectiveAgent}
                  </h1>

                  {isAllAgents ? (
                    <p
                      className="text-[13px] font-medium leading-none"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Team Operations · {staffList.length} staff members
                    </p>
                  ) : (
                    selectedStaffObj && (
                      <p
                        className="text-[13px] font-medium leading-none"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {formatRoleLabel(selectedStaffObj.role)}
                      </p>
                    )
                  )}

                  <div className="flex items-center gap-3 text-[12px] flex-wrap mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {isAllAgents ? (
                      <>
                        <span className="inline-flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                          <span>{teamAggregate.activeStaffCount} active in {periodDescription}</span>
                        </span>
                        <span style={{ color: 'var(--border-input)' }}>•</span>
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                          <span>
                            {teamAggregate.lastActiveAt > 0
                              ? `Last active ${formatCompactRelativeTime(teamAggregate.lastActiveAt, todayStartMs)}`
                              : 'No recent activity'}
                          </span>
                        </span>
                      </>
                    ) : (
                      <>
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
                              ? `Last active ${formatCompactRelativeTime(selectedStaffObj.lastActiveAt, todayStartMs)}`
                              : 'No recent activity'}
                          </span>
                        </span>
                      </>
                    )}
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

            {/* Date Filter Strip */}
            <div
              className="mt-5 pt-4 flex flex-wrap items-center justify-between gap-2.5"
              style={{ borderTop: '1px solid var(--border-main)' }}
            >
              {/* Quick Date Presets */}
              <div
                className="flex items-center gap-1 p-1 rounded-xl flex-wrap"
                style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)' }}
              >
                {[
                  { id: 'all', label: 'All Time', active: filterMode === 'all', onClick: goAllTime },
                  { id: 'today', label: 'Today', active: isToday, onClick: goToday },
                  { id: 'yesterday', label: 'Yesterday', active: isYesterday, onClick: goYesterday },
                  { id: 'this_week', label: 'This Week', active: isThisWeek, onClick: goThisWeek },
                  { id: 'last_week', label: 'Last Week', active: isLastWeek, onClick: goLastWeek },
                  { id: 'range', label: 'Custom', active: filterMode === 'range', onClick: goCustomRange },
                ].map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={preset.onClick}
                    className="h-[26px] px-2.5 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer"
                    style={
                      preset.active
                        ? { background: 'var(--text-primary)', color: 'var(--bg-card)' }
                        : { background: 'transparent', color: 'var(--text-secondary)' }
                    }
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Date Stepper / Date Picker / Custom Range Inputs */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {filterMode === 'all' ? (
                  <span
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 h-[28px] rounded-[7px]"
                    style={{ background: 'var(--bg-pill)', color: 'var(--text-secondary)' }}
                  >
                    <Calendar className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    Showing all dates
                  </span>
                ) : filterMode === 'range' ? (
                  <>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                        From
                      </span>
                      <input
                        type="date"
                        value={customStartDate}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (!val) return;
                          setCustomStartDate(val);
                          if (val > customEndDate) setCustomEndDate(val);
                          resetPagedWindows();
                        }}
                        className="h-[28px] text-[11px] font-medium rounded-[7px] px-2 outline-none cursor-pointer transition-colors"
                        style={{
                          background: 'var(--bg-pill)',
                          border: '1px solid var(--border-input)',
                          color: 'var(--text-primary)',
                        }}
                        aria-label="Start date"
                        title="Range start date"
                      />
                      <ArrowRight className="w-3 h-3 shrink-0" style={{ color: 'var(--text-muted)' }} />
                      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                        To
                      </span>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (!val) return;
                          setCustomEndDate(val);
                          if (val < customStartDate) setCustomStartDate(val);
                          resetPagedWindows();
                        }}
                        className="h-[28px] text-[11px] font-medium rounded-[7px] px-2 outline-none cursor-pointer transition-colors"
                        style={{
                          background: 'var(--bg-pill)',
                          border: '1px solid var(--border-input)',
                          color: 'var(--text-primary)',
                        }}
                        aria-label="End date"
                        title="Range end date"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => stepPeriod(-1)}
                      className="h-[28px] w-[28px] flex items-center justify-center rounded-[7px] transition-colors cursor-pointer hover:opacity-80"
                      style={{
                        background: 'var(--bg-pill)',
                        border: '1px solid var(--border-input)',
                        color: 'var(--text-secondary)',
                      }}
                      title={filterMode === 'day' ? 'Previous Day' : 'Previous Week'}
                      aria-label={filterMode === 'day' ? 'Previous Day' : 'Previous Week'}
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>

                    <div
                      className="h-[28px] px-2.5 flex items-center gap-1.5 text-[11px] font-semibold rounded-[7px]"
                      style={{
                        background: 'var(--bg-pill)',
                        border: '1px solid var(--border-input)',
                        color: 'var(--text-primary)',
                      }}
                      title={periodDescription}
                    >
                      <Calendar className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-secondary)' }} />
                      <span className="whitespace-nowrap">
                        {filterMode === 'day' ? formatDayLabel(dayStart) : formatRangeLabel(weekStart, weekEnd)}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => stepPeriod(1)}
                      className="h-[28px] w-[28px] flex items-center justify-center rounded-[7px] transition-colors cursor-pointer hover:opacity-80"
                      style={{
                        background: 'var(--bg-pill)',
                        border: '1px solid var(--border-input)',
                        color: 'var(--text-secondary)',
                      }}
                      title={filterMode === 'day' ? 'Next Day' : 'Next Week'}
                      aria-label={filterMode === 'day' ? 'Next Day' : 'Next Week'}
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>

                    <input
                      type="date"
                      value={isoDate(currentDate)}
                      onChange={(e) => {
                        if (e.target.value) {
                          setCurrentDate(parseIsoInputDate(e.target.value, todayStart));
                          resetPagedWindows();
                        }
                      }}
                      className="h-[28px] text-[11px] font-medium rounded-[7px] px-2 outline-none cursor-pointer transition-colors"
                      style={{
                        background: 'var(--bg-pill)',
                        border: '1px solid var(--border-input)',
                        color: 'var(--text-primary)',
                      }}
                      title={filterMode === 'day' ? 'Jump to date' : 'Jump to week containing date'}
                      aria-label="Pick date"
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── TABS & STREAM CONTROLS (Moved down below the card, sticky) ── */}
        <div
          className="sticky top-0 z-20 px-5 sm:px-7 lg:px-8 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 flex-wrap shrink-0"
          style={{
            background: 'var(--bg-page)',
            borderBottom: '1px solid var(--border-main)',
          }}
        >
          {/* Left: Navigation Tabs */}
          <div
            className="flex items-center gap-1 p-1 rounded-xl shrink-0 overflow-x-auto max-w-full"
            style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)', WebkitOverflowScrolling: 'touch' }}
          >
            <button
              type="button"
              onClick={() => handleMainTabChange('timeline')}
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
                {timelineRefs.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleMainTabChange('funnel')}
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
              onClick={() => handleMainTabChange('leads')}
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

          {/* Right: Active Date Pill + Presentation Toggle + Search */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {filterMode !== 'all' && (
              <div
                className="h-[28px] pl-2.5 pr-1.5 rounded-[7px] flex items-center gap-1.5 text-[11px] font-semibold shrink-0"
                style={{
                  background: 'var(--bg-pill)',
                  border: '1px solid var(--border-input)',
                  color: 'var(--text-primary)',
                }}
                title={`Filtered by date: ${periodDescription}`}
              >
                <Calendar className="w-3 h-3 shrink-0" style={{ color: 'var(--text-secondary)' }} />
                <span className="max-w-[165px] truncate">{periodDescription}</span>
                <button
                  type="button"
                  onClick={goAllTime}
                  className="p-0.5 rounded hover:opacity-70 cursor-pointer"
                  title="Clear date filter (show All Time)"
                  aria-label="Clear date filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {mainTab === 'timeline' && (
              <div
                className="flex items-center gap-0.5 p-0.5 rounded-[7px] shrink-0"
                style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)' }}
              >
                <button
                  type="button"
                  onClick={() => handleFeedViewStyleChange('timeline')}
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
                  onClick={() => handleFeedViewStyleChange('compact')}
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
                  onChange={(e) => handleActivitySearchChange(e.target.value)}
                  placeholder={
                    mainTab === 'timeline'
                      ? isAllAgents
                        ? 'Search event, lead, staff...'
                        : 'Search event, lead...'
                      : isAllAgents
                      ? 'Search lead, phone, staff...'
                      : 'Search lead, phone...'
                  }
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
                    onClick={() => handleActivitySearchChange('')}
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
            <TimelineSkeleton />
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
                      No actions recorded for {isAllAgents ? 'the team' : selectedStaffObj?.name || effectiveAgent || 'this staff member'} in {periodDescription}.
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
                  /* ── 1. TIMELINE FEED: Incremental Windowed Stream ── */
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
                      {group.items.map((act) => (
                        <TimelineEventCard
                          key={act.id}
                          act={act}
                          showActor={isAllAgents}
                          onOpenChat={openChat}
                          onSelectAgent={handleSelectAgent}
                        />
                      ))}
                    </div>
                  </div>
                ))}

                <div
                  ref={timelineSentinelRef}
                  className="pt-2 pb-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <span>
                    Showing {displayedActivities.length} of {visibleTimelineRefs.length}{' '}
                    {visibleTimelineRefs.length === 1 ? 'event' : 'events'}
                  </span>
                  {hasMoreTimeline && (
                    <button
                      type="button"
                      onClick={() =>
                        setVisibleTimelineCount((prev) =>
                          Math.min(prev + TIMELINE_BATCH_SIZE, visibleTimelineRefs.length)
                        )
                      }
                      className="h-8 px-3.5 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors"
                      style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-input)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      Show {Math.min(TIMELINE_BATCH_SIZE, visibleTimelineRefs.length - visibleTimelineCount)} more (
                      {visibleTimelineRefs.length - visibleTimelineCount} remaining)
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* ── 2. COMPACT STREAM: Borderless, High-Density Scanning View (Full Width) ── */
              <div className="w-full space-y-4">
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
                          <CompactEventRow
                            key={act.id}
                            act={act}
                            showActor={isAllAgents}
                            onOpenChat={openChat}
                            onSelectAgent={handleSelectAgent}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div
                  ref={timelineSentinelRef}
                  className="pb-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <span>
                    Showing {displayedActivities.length} of {visibleTimelineRefs.length}{' '}
                    {visibleTimelineRefs.length === 1 ? 'event' : 'events'}
                  </span>
                  {hasMoreTimeline && (
                    <button
                      type="button"
                      onClick={() =>
                        setVisibleTimelineCount((prev) =>
                          Math.min(prev + TIMELINE_BATCH_SIZE, visibleTimelineRefs.length)
                        )
                      }
                      className="h-8 px-3.5 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors"
                      style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-input)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      Show {Math.min(TIMELINE_BATCH_SIZE, visibleTimelineRefs.length - visibleTimelineCount)} more (
                      {visibleTimelineRefs.length - visibleTimelineCount} remaining)
                    </button>
                  )}
                </div>
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
                        onClick={() => handleMainTabChange('leads')}
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
                                Where {breakdownTotal} {breakdownTotal === 1 ? 'lead stands' : 'leads stand'} ({periodDescription})
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
                                  handleActivitySearchChange(st.stage);
                                  handleMainTabChange('leads');
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

                        {(() => {
                          const waitingCount = isAllAgents
                            ? teamAggregate.waitingReplyCount
                            : selectedStaffObj?.waitingReplyCount || 0;
                          if (waitingCount <= 0) return null;
                          return (
                            <div
                              className="mt-4 pt-3 flex items-center justify-between text-[11px]"
                              style={{ borderTop: '1px solid var(--border-main)', color: 'var(--text-secondary)' }}
                            >
                              <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-semibold">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                {waitingCount} leads awaiting reply
                              </span>
                              <button
                                type="button"
                                onClick={() => handleMainTabChange('leads')}
                                className="text-[11px] font-semibold text-[var(--text-primary)] hover:underline cursor-pointer"
                              >
                                Review in leads →
                              </button>
                            </div>
                          );
                        })()}
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
                            Total actions logged: <strong style={{ color: 'var(--text-primary)' }}>{timelineRefs.length}</strong>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleMainTabChange('timeline')}
                            className="text-[11px] font-semibold text-[var(--text-primary)] hover:underline cursor-pointer"
                          >
                            View timeline stream →
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 4. Team-wide Per-Agent Comparison Breakdown (only in All Agents mode) */}
                    {isAllAgents && staffList.length > 0 && (
                      <div
                        className="rounded-xl overflow-hidden shadow-xs"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}
                      >
                        <div
                          className="px-5 py-4 flex flex-wrap items-center justify-between gap-2"
                          style={{ borderBottom: '1px solid var(--border-main)' }}
                        >
                          <div>
                            <h3 className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
                              Agent Performance Breakdown
                            </h3>
                            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                              Comparing {staffList.length} team members ({periodDescription})
                            </p>
                          </div>
                          <span
                            className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full"
                            style={{ background: 'var(--bg-pill)', color: 'var(--text-secondary)' }}
                          >
                            Select a staff member to inspect
                          </span>
                        </div>
                        <div className="overflow-x-auto w-full" style={{ WebkitOverflowScrolling: 'touch' }}>
                          <table className="w-full text-left border-collapse min-w-[740px]">
                            <thead
                              className="text-[10px] uppercase tracking-widest font-bold"
                              style={{ background: 'var(--bg-table-header)', color: 'var(--text-secondary)' }}
                            >
                              <tr>
                                <th className="py-2.5 px-4">Staff Member</th>
                                <th className="py-2.5 px-3">Role</th>
                                <th className="py-2.5 px-3 text-right">Actions</th>
                                <th className="py-2.5 px-3 text-right">Leads</th>
                                <th className="py-2.5 px-3 text-right">Booked</th>
                                <th className="py-2.5 px-3 text-right">Attended / Show %</th>
                                <th className="py-2.5 px-3 text-right">Enrolled / Win %</th>
                                <th className="py-2.5 px-4 text-right">Revenue (EGP)</th>
                              </tr>
                            </thead>
                            <tbody
                              className="text-[12px] divide-y"
                              style={{ color: 'var(--text-primary)', borderColor: 'var(--border-main)' }}
                            >
                              {staffList.map((st, idx) => {
                                const isAllTimeMode = filterMode === 'all';
                                const stLeads = isAllTimeMode ? st.totalLeadsAssigned : st.periodLeadsAssigned;
                                const stBooked = isAllTimeMode ? st.allTimeBooked : st.bookedInPeriod;
                                const stAttended = isAllTimeMode ? st.allTimeAttended : st.attendedInPeriod;
                                const stEnrolled = isAllTimeMode ? st.allTimeEnrolled : st.enrolledInPeriod;
                                const stCash = isAllTimeMode ? st.allTimeCash : st.cashInPeriod;
                                const stShowPct = stBooked > 0 ? Math.min(100, Math.round((stAttended / stBooked) * 100)) : 0;
                                const stWinPct = stLeads > 0 ? Math.min(100, Math.round((stEnrolled / stLeads) * 100)) : 0;

                                return (
                                  <tr
                                    key={st.name}
                                    className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                                    style={{ background: idx % 2 === 0 ? 'transparent' : 'var(--bg-table-alt)' }}
                                  >
                                    <td className="py-2.5 px-4">
                                      <button
                                        type="button"
                                        onClick={() => handleSelectAgent(st.name)}
                                        className="font-semibold text-left hover:underline cursor-pointer"
                                        style={{ color: 'var(--text-primary)' }}
                                        title={`Inspect ${st.name}`}
                                      >
                                        {st.name}
                                      </button>
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <span
                                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                        style={{ background: 'var(--bg-pill)', color: 'var(--text-secondary)' }}
                                      >
                                        {formatRoleLabel(st.role)}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-semibold tabular-nums">
                                      {st.periodActivitiesCount.toLocaleString()}
                                    </td>
                                    <td className="py-2.5 px-3 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                                      {stLeads.toLocaleString()}
                                    </td>
                                    <td className="py-2.5 px-3 text-right tabular-nums">{stBooked.toLocaleString()}</td>
                                    <td className="py-2.5 px-3 text-right tabular-nums">
                                      <span>{stAttended.toLocaleString()}</span>
                                      <span className="ml-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                        ({stShowPct}%)
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 text-right tabular-nums">
                                      <span>{stEnrolled.toLocaleString()}</span>
                                      <span className="ml-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                        ({stWinPct}%)
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-4 text-right font-semibold tabular-nums">
                                      {stCash.toLocaleString()}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot
                              className="text-[11px] font-bold"
                              style={{
                                background: 'var(--bg-table-header)',
                                borderTop: '1px solid var(--border-main)',
                                color: 'var(--text-primary)',
                              }}
                            >
                              <tr>
                                <td className="py-2.5 px-4" colSpan={2}>
                                  Team Total ({staffList.length} staff)
                                </td>
                                <td className="py-2.5 px-3 text-right tabular-nums">
                                  {teamAggregate.totalActivitiesCount.toLocaleString()}
                                </td>
                                <td className="py-2.5 px-3 text-right tabular-nums">{leads.toLocaleString()}</td>
                                <td className="py-2.5 px-3 text-right tabular-nums">{booked.toLocaleString()}</td>
                                <td className="py-2.5 px-3 text-right tabular-nums">
                                  <span>{attended.toLocaleString()}</span>
                                  <span className="ml-1 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                    ({showRateStr}%)
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-right tabular-nums">
                                  <span>{enrolled.toLocaleString()}</span>
                                  <span className="ml-1 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                    ({overallWinRate}%)
                                  </span>
                                </td>
                                <td className="py-2.5 px-4 text-right tabular-nums">{cash.toLocaleString()}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    )}
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
                    {isAllAgents
                      ? `No assigned leads match this filter across the team in ${periodDescription}.`
                      : `${selectedStaffObj?.name || effectiveAgent || 'This staff member'} has no leads matching this filter in ${periodDescription}.`}
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
              ) : (
                <div className="overflow-x-auto w-full" style={{ WebkitOverflowScrolling: 'touch' }}>
                  <table className="w-full text-left border-collapse min-w-[680px]">
                    <thead
                      className="text-[10px] uppercase tracking-widest font-bold"
                      style={{ background: 'var(--bg-table-header)', color: 'var(--text-secondary)' }}
                    >
                      <tr>
                        <th className="py-2.5 px-4">Lead</th>
                        {isAllAgents && <th className="py-2.5 px-3">Agent</th>}
                        <th className="py-2.5 px-3">Channel</th>
                        <th className="py-2.5 px-3">Stage</th>
                        <th className="py-2.5 px-3">Audition / Follow-up</th>
                        <th className="py-2.5 px-3 text-right">Last Active</th>
                        <th className="py-2.5 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="text-[12px] divide-y" style={{ color: 'var(--text-primary)', borderColor: 'var(--border-main)' }}>
                      {displayedLeads.map((conv, idx) => {
                        const leadAgent = isAllAgents ? getParsedConversationData(conv).assignedAgent : '';
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
                            {isAllAgents && (
                              <td className="py-2.5 px-3">
                                <button
                                  type="button"
                                  onClick={() => handleSelectAgent(leadAgent)}
                                  className="text-[11px] font-semibold px-2 py-0.5 rounded-full hover:underline cursor-pointer"
                                  style={{ background: 'var(--bg-pill)', color: 'var(--text-primary)' }}
                                  title={`View ${leadAgent}'s activity`}
                                >
                                  {leadAgent}
                                </button>
                              </td>
                            )}
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
                              {formatCompactRelativeTime(conv.lastMessageAt, todayStartMs)}
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
                  <div
                    ref={leadsSentinelRef}
                    className="px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px]"
                    style={{ borderTop: '1px solid var(--border-main)', color: 'var(--text-secondary)' }}
                  >
                    <span>
                      Showing {displayedLeads.length} of {agentAssignedLeads.length}{' '}
                      {agentAssignedLeads.length === 1 ? 'lead' : 'leads'}
                    </span>
                    {hasMoreLeads && (
                      <button
                        type="button"
                        onClick={() =>
                          setVisibleLeadsCount((prev) => Math.min(prev + LEADS_BATCH_SIZE, agentAssignedLeads.length))
                        }
                        className="h-8 px-3.5 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors"
                        style={{
                          background: 'var(--bg-pill)',
                          border: '1px solid var(--border-input)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        Show {Math.min(LEADS_BATCH_SIZE, agentAssignedLeads.length - visibleLeadsCount)} more (
                        {agentAssignedLeads.length - visibleLeadsCount} remaining)
                      </button>
                    )}
                  </div>
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
          {/* Pinned Team-Wide Summary Row */}
          <AllAgentsSidebarRow
            staffCount={staffList.length}
            activeStaffCount={teamAggregate.activeStaffCount}
            totalActivitiesCount={teamAggregate.totalActivitiesCount}
            totalLeadsAssigned={filterMode === 'all' ? teamAggregate.totalLeadsAssigned : teamAggregate.periodLeadsAssigned}
            bookedCount={teamAggregate.booked}
            enrolledCount={teamAggregate.enrolled}
            lastActiveAt={teamAggregate.lastActiveAt}
            isSelected={isAllAgents}
            periodDescription={periodDescription}
            todayStartMs={todayStartMs}
            onSelect={handleSelectAgent}
          />

          {/* Individual Staff Rows */}
          {filteredStaff.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                No staff match filter
              </p>
            </div>
          ) : (
            filteredStaff.map((st) => (
              <StaffSidebarRow
                key={st.name}
                st={st}
                isSelected={!isAllAgents && effectiveAgentLower === st.name.toLowerCase()}
                isAllTime={filterMode === 'all'}
                periodDescription={periodDescription}
                todayStartMs={todayStartMs}
                onSelect={handleSelectAgent}
              />
            ))
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
