"use client";

import React, { useMemo, useState, useCallback } from 'react';
import { useCRM } from '../context/CRMContext';
import { useAuth } from '../components/AuthProvider';
import {
  MessageSquare,
  Calendar,
  CheckSquare,
  Trash2,
  MapPin,
  Search,
  X,
  Phone,
  Clock,
  Check,
  Tag,
} from 'lucide-react';

type Item = {
  id: string;
  name: string;
  phone?: string;
  text: string;
  date: string;
  rawDate: string;
  people: string;
  branch?: string;
  auditionOutcome?: string;
  followUpTags?: string[];
  pipeline?: string;
  completed: boolean;
  completedAt?: string;
  dateValue: string;
};

type FilterMode =
  | 'all'
  | 'pending'
  | 'overdue'
  | 'today'
  | 'payment-pending'
  | 'trial-session'
  | 'joining-later'
  | 'completed';

function getLocalIsoToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(isoDate: string | undefined, days: number): string {
  const base = isoDate && /^\d{4}-\d{2}-\d{2}$/.test(isoDate)
    ? new Date(isoDate + 'T00:00:00')
    : new Date();
  base.setDate(base.getDate() + days);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(base.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDisplayDate(isoDate: string) {
  if (!isoDate) return "—";
  const d = new Date(isoDate + 'T00:00:00');
  return isNaN(d.getTime())
    ? isoDate
    : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function getSection(isoDate: string, today: string): 'overdue' | 'today' | 'upcoming' {
  if (!isoDate) return 'upcoming';
  if (isoDate < today) return 'overdue';
  if (isoDate === today) return 'today';
  return 'upcoming';
}

function getWhatsAppUrl(phone?: string) {
  if (!phone) return null;
  let clean = phone.replace(/\D/g, '');
  if (!clean) return null;
  if (clean.startsWith('01') && clean.length === 11) {
    clean = '2' + clean;
  }
  return `https://wa.me/${clean}`;
}

export default function FollowUpsPage() {
  const { conversations, loading, patchConversation, openChat } = useCRM();
  const { isReadOnly } = useAuth();
  const [filter, setFilter] = useState<FilterMode>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const today = useMemo(() => getLocalIsoToday(), []);

  const items: Item[] = useMemo(() => {
    return conversations
      .filter((c) => {
        const tags = c.followUpTags || [];
        const hasTag = tags.includes('payment-pending') || tags.includes('trial-session');
        return (
          (c.pipeline !== 'Audition Booked' || c.auditionOutcome === 'joining-later' || hasTag) &&
          Boolean(c.followUpDate || c.followUpNote || c.auditionOutcome === 'joining-later' || hasTag)
        );
      })
      .map((c) => ({
        id: c.id,
        name: c.name || 'Student',
        phone: c.phone || '',
        text:
          c.followUpNote ||
          (c.auditionOutcome === 'joining-later'
            ? 'Joining Later - Follow up'
            : (c.followUpTags || []).includes('payment-pending')
            ? 'Payment Pending - Follow up'
            : (c.followUpTags || []).includes('trial-session')
            ? 'Trial Session - Follow up'
            : 'Follow up with customer'),
        date: formatDisplayDate(c.followUpDate || ''),
        rawDate: c.followUpDate || '',
        people: `${c.name || 'Student'} · ${c.agent || 'Unassigned'}`,
        branch: c.branch || '',
        auditionOutcome: c.auditionOutcome || '',
        followUpTags: c.followUpTags || [],
        pipeline: c.pipeline || '',
        completed: Boolean(c.followUpCompleted),
        completedAt: c.followUpCompletedAt || '',
        dateValue: c.followUpDate || '9999-12-31',
      }));
  }, [conversations]);

  // Instant optimistic toggle between active and ended (persisted to backend)
  const toggleFollowUp = useCallback(
    (id: string, currentCompleted: boolean) => {
      if (isReadOnly) return;
      const nextCompleted = !currentCompleted;
      patchConversation(id, {
        followUpCompleted: nextCompleted,
        followUpCompletedAt: nextCompleted ? new Date().toISOString() : null,
      });
    },
    [isReadOnly, patchConversation]
  );

  // Instant reschedule (+days or specific ISO date)
  const rescheduleFollowUp = useCallback(
    (id: string, targetDate: string) => {
      if (isReadOnly) return;
      patchConversation(id, {
        followUpDate: targetDate,
        followUpCompleted: false,
      });
    },
    [isReadOnly, patchConversation]
  );

  // Toggle a specific tag on an item (e.g. mark paid by toggling payment-pending off)
  const toggleTag = useCallback(
    (id: string, tag: string) => {
      if (isReadOnly) return;
      const conv = conversations.find((c) => c.id === id);
      if (!conv) return;
      const currentTags = conv.followUpTags || [];
      const hasTag = currentTags.includes(tag);
      const newTags = hasTag
        ? currentTags.filter((t) => t !== tag)
        : [...currentTags, tag];
      const updates: Record<string, any> = { followUpTags: newTags };
      if (!hasTag) {
        // Turning ON tag: schedule in audition options as Schedule follow up
        updates.auditionOutcome = 'schedule-followup';
        if (!conv.auditionDate) {
          updates.auditionDate = conv.followUpDate || today;
        }
      } else {
        // Turning OFF tag
        if (!newTags.includes('payment-pending') && !newTags.includes('trial-session')) {
          if (conv.auditionOutcome === 'schedule-followup') {
            updates.auditionOutcome = '';
          }
        }
      }
      patchConversation(id, updates);
    },
    [conversations, isReadOnly, patchConversation, today]
  );

  // Permanently clear follow-up note, date, tags, and outcome
  const deleteFollowUp = useCallback(
    (id: string) => {
      if (isReadOnly) return;
      patchConversation(id, {
        followUpDate: '',
        followUpNote: '',
        followUpCompleted: false,
        followUpCompletedAt: null,
        auditionOutcome: '',
        followUpTags: [],
      });
    },
    [isReadOnly, patchConversation]
  );

  const pendingCount = useMemo(() => items.filter((i) => !i.completed).length, [items]);
  const completedCount = useMemo(() => items.filter((i) => i.completed).length, [items]);
  const overdueCount = useMemo(
    () => items.filter((i) => !i.completed && getSection(i.dateValue, today) === 'overdue').length,
    [items, today]
  );
  const todayCount = useMemo(
    () => items.filter((i) => !i.completed && getSection(i.dateValue, today) === 'today').length,
    [items, today]
  );
  const paymentPendingCount = useMemo(
    () => items.filter((i) => !i.completed && (i.followUpTags || []).includes('payment-pending')).length,
    [items]
  );
  const trialSessionCount = useMemo(
    () => items.filter((i) => !i.completed && (i.followUpTags || []).includes('trial-session')).length,
    [items]
  );
  const joiningLaterCount = useMemo(
    () => items.filter((i) => !i.completed && i.auditionOutcome === 'joining-later').length,
    [items]
  );

  // Fast filter + client-side live search
  const filterItem = useCallback(
    (i: Item) => {
      // 1. Status / Tag filters
      if (filter === 'pending' && i.completed) return false;
      if (filter === 'completed' && !i.completed) return false;
      if (filter === 'overdue' && (i.completed || getSection(i.dateValue, today) !== 'overdue'))
        return false;
      if (filter === 'today' && (i.completed || getSection(i.dateValue, today) !== 'today'))
        return false;
      if (filter === 'joining-later' && i.auditionOutcome !== 'joining-later') return false;
      if (filter === 'payment-pending' && !(i.followUpTags || []).includes('payment-pending'))
        return false;
      if (filter === 'trial-session' && !(i.followUpTags || []).includes('trial-session'))
        return false;

      // 2. Client-side search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = i.name.toLowerCase().includes(q);
        const matchPhone = (i.phone || '').toLowerCase().includes(q);
        const matchText = i.text.toLowerCase().includes(q);
        const matchBranch = (i.branch || '').toLowerCase().includes(q);
        const matchTags = (i.followUpTags || []).some((t) => t.toLowerCase().includes(q));
        if (!matchName && !matchPhone && !matchText && !matchBranch && !matchTags) {
          return false;
        }
      }

      return true;
    },
    [filter, searchQuery, today]
  );

  // Sort: active pending items first, ended items after; sorted by date within each group
  const sortSectionItems = useCallback((arr: Item[]) => {
    return [...arr].sort((a, b) => {
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1;
      }
      return a.dateValue.localeCompare(b.dateValue);
    });
  }, []);

  const overdueItems = useMemo(() => {
    return sortSectionItems(
      items.filter((i) => getSection(i.dateValue, today) === 'overdue').filter(filterItem)
    );
  }, [items, today, filterItem, sortSectionItems]);

  const todayItems = useMemo(() => {
    return sortSectionItems(
      items.filter((i) => getSection(i.dateValue, today) === 'today').filter(filterItem)
    );
  }, [items, today, filterItem, sortSectionItems]);

  const upcomingItems = useMemo(() => {
    return sortSectionItems(
      items.filter((i) => getSection(i.dateValue, today) === 'upcoming').filter(filterItem)
    );
  }, [items, today, filterItem, sortSectionItems]);

  const visibleTotal = overdueItems.length + todayItems.length + upcomingItems.length;

  return (
    <div className="flex flex-col h-full min-h-0" style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <div
        className="px-4 md:px-6 py-3.5 flex flex-col gap-3 shrink-0"
        style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-main)' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[16px] font-bold" style={{ color: 'var(--text-primary)' }}>
                Follow-ups
              </h1>
              {pendingCount > 0 && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20">
                  {pendingCount} active
                </span>
              )}
            </div>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {loading
                ? 'Loading follow-ups...'
                : `${pendingCount} active follow-up${pendingCount !== 1 ? 's' : ''}${
                    completedCount > 0 ? ` · ${completedCount} ended` : ''
                  }. Instant response actions & sync with Inbox.`}
            </p>
          </div>

          {/* Search bar for fast filtering */}
          <div className="relative min-w-[220px] sm:w-[280px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, phone, notes..."
              className="w-full pl-8 pr-7 py-1.5 text-[11px] rounded-lg outline-none transition-colors border"
              style={{
                background: 'var(--bg-page)',
                borderColor: 'var(--border-main)',
                color: 'var(--text-primary)',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setFilter('all')}
            className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors shrink-0 ${
              filter === 'all' ? 'font-semibold shadow-xs' : ''
            }`}
            style={{
              background: filter === 'all' ? 'var(--bg-pill)' : 'transparent',
              color: filter === 'all' ? 'var(--text-primary)' : 'var(--text-secondary)',
              border: filter === 'all' ? '1px solid var(--border-main)' : '1px solid transparent',
            }}
          >
            All ({items.length})
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors shrink-0 ${
              filter === 'pending' ? 'font-semibold shadow-xs' : ''
            }`}
            style={{
              background: filter === 'pending' ? 'var(--bg-pill)' : 'transparent',
              color: filter === 'pending' ? '#0066FF' : 'var(--text-secondary)',
              border: filter === 'pending' ? '1px solid var(--border-main)' : '1px solid transparent',
            }}
          >
            Active ({pendingCount})
          </button>
          {overdueCount > 0 && (
            <button
              onClick={() => setFilter('overdue')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors shrink-0 inline-flex items-center gap-1 ${
                filter === 'overdue' ? 'font-bold' : ''
              }`}
              style={{
                background: filter === 'overdue' ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.06)',
                color: '#EF4444',
                border: '1px solid rgba(239,68,68,0.25)',
              }}
            >
              Overdue ({overdueCount})
            </button>
          )}
          {todayCount > 0 && (
            <button
              onClick={() => setFilter('today')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors shrink-0 inline-flex items-center gap-1 ${
                filter === 'today' ? 'font-bold' : ''
              }`}
              style={{
                background: filter === 'today' ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.06)',
                color: '#F59E0B',
                border: '1px solid rgba(245,158,11,0.25)',
              }}
            >
              Due Today ({todayCount})
            </button>
          )}
          {paymentPendingCount > 0 && (
            <button
              onClick={() => setFilter('payment-pending')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors shrink-0 inline-flex items-center gap-1 ${
                filter === 'payment-pending' ? 'font-bold' : ''
              }`}
              style={{
                background:
                  filter === 'payment-pending' ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.06)',
                color: '#EF4444',
                border: '1px solid rgba(239,68,68,0.25)',
              }}
            >
              Payment Pending ({paymentPendingCount})
            </button>
          )}
          {trialSessionCount > 0 && (
            <button
              onClick={() => setFilter('trial-session')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors shrink-0 inline-flex items-center gap-1 ${
                filter === 'trial-session' ? 'font-bold' : ''
              }`}
              style={{
                background:
                  filter === 'trial-session' ? 'rgba(139,92,246,0.15)' : 'rgba(139,92,246,0.06)',
                color: '#8B5CF6',
                border: '1px solid rgba(139,92,246,0.25)',
              }}
            >
              Trial Session ({trialSessionCount})
            </button>
          )}
          {joiningLaterCount > 0 && (
            <button
              onClick={() => setFilter('joining-later')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors shrink-0 inline-flex items-center gap-1 ${
                filter === 'joining-later' ? 'font-bold' : ''
              }`}
              style={{
                background:
                  filter === 'joining-later' ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.06)',
                color: '#F59E0B',
                border: '1px solid rgba(245,158,11,0.25)',
              }}
            >
              Joining Later ({joiningLaterCount})
            </button>
          )}
          <button
            onClick={() => setFilter('completed')}
            className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors shrink-0 ${
              filter === 'completed' ? 'font-semibold shadow-xs' : ''
            }`}
            style={{
              background: filter === 'completed' ? 'var(--bg-pill)' : 'transparent',
              color: filter === 'completed' ? 'var(--text-primary)' : 'var(--text-secondary)',
              border: filter === 'completed' ? '1px solid var(--border-main)' : '1px solid transparent',
            }}
          >
            Ended ({completedCount})
          </button>
        </div>
      </div>

      {/* Main List */}
      <div
        className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 py-4 space-y-6"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {items.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-12 h-12 rounded-full flex items-center justify-center bg-blue-500/10 text-blue-500">
              <CheckSquare className="w-6 h-6" />
            </div>
            <p className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              All caught up!
            </p>
            <p className="text-[12px] text-center max-w-sm" style={{ color: 'var(--text-secondary)' }}>
              No follow-ups. Set follow-up dates, notes, and tags (Payment Pending, Trial Session) directly
              from any chat in the Inbox to track them here.
            </p>
          </div>
        )}

        {items.length > 0 && visibleTotal === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <p className="text-[13px] font-medium" style={{ color: 'var(--text-secondary)' }}>
              No {filter === 'completed'
                ? 'ended'
                : filter === 'overdue'
                ? 'overdue'
                : filter === 'today'
                ? 'due today'
                : filter === 'joining-later'
                ? 'joining later'
                : filter === 'payment-pending'
                ? 'payment pending'
                : filter === 'trial-session'
                ? 'trial session'
                : 'active'}{' '}
              follow-ups found
              {searchQuery ? ` matching "${searchQuery}"` : ''}.
            </p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-[11px] font-semibold text-[#0066FF] hover:underline cursor-pointer"
              >
                Clear search
              </button>
            )}
          </div>
        )}

        {overdueItems.length > 0 && (
          <Section
            label="Overdue"
            count={overdueItems.length}
            pendingCount={overdueItems.filter((i) => !i.completed).length}
            labelColor="text-[#FF3B30]"
            items={overdueItems}
            today={today}
            onToggle={toggleFollowUp}
            onReschedule={rescheduleFollowUp}
            onToggleTag={toggleTag}
            onDelete={deleteFollowUp}
            onChat={openChat}
            isReadOnly={isReadOnly}
          />
        )}

        {todayItems.length > 0 && (
          <Section
            label="Due today"
            count={todayItems.length}
            pendingCount={todayItems.filter((i) => !i.completed).length}
            labelColor="text-[#FF9500]"
            items={todayItems}
            today={today}
            onToggle={toggleFollowUp}
            onReschedule={rescheduleFollowUp}
            onToggleTag={toggleTag}
            onDelete={deleteFollowUp}
            onChat={openChat}
            isReadOnly={isReadOnly}
          />
        )}

        {upcomingItems.length > 0 && (
          <Section
            label="Upcoming"
            count={upcomingItems.length}
            pendingCount={upcomingItems.filter((i) => !i.completed).length}
            labelColor="text-[#0066FF]"
            items={upcomingItems}
            today={today}
            onToggle={toggleFollowUp}
            onReschedule={rescheduleFollowUp}
            onToggleTag={toggleTag}
            onDelete={deleteFollowUp}
            onChat={openChat}
            isReadOnly={isReadOnly}
          />
        )}
      </div>
    </div>
  );
}

function Section({
  label,
  count,
  pendingCount,
  labelColor,
  items,
  today,
  onToggle,
  onReschedule,
  onToggleTag,
  onDelete,
  onChat,
  isReadOnly,
}: {
  label: string;
  count: number;
  pendingCount: number;
  labelColor: string;
  items: Item[];
  today: string;
  onToggle: (id: string, currentCompleted: boolean) => void;
  onReschedule: (id: string, targetDate: string) => void;
  onToggleTag: (id: string, tag: string) => void;
  onDelete: (id: string) => void;
  onChat: (id: string) => void;
  isReadOnly?: boolean;
}) {
  return (
    <div>
      <div className={`text-[10px] font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5 ${labelColor}`}>
        <Calendar className="w-3 h-3" />
        {label} · {pendingCount > 0 ? pendingCount : count}{' '}
        {count !== pendingCount && pendingCount > 0 ? `(${count - pendingCount} ended)` : ''}
      </div>
      <div
        className="rounded-xl divide-y overflow-hidden shadow-xs"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}
      >
        {items.map((item) => {
          const isEnded = item.completed;
          const waUrl = getWhatsAppUrl(item.phone);
          const isOverdue = item.dateValue < today;
          const isToday = item.dateValue === today;

          return (
            <div
              key={item.id}
              className={`group flex flex-col sm:flex-row sm:items-center justify-between px-4 py-3 gap-3 transition-all duration-150 ${
                isEnded
                  ? 'opacity-60 hover:opacity-85'
                  : 'hover:bg-black/5 dark:hover:bg-white/5'
              }`}
              style={{
                borderBottom: '1px solid var(--border-main)',
                background: isEnded ? 'var(--bg-page)' : 'transparent',
              }}
            >
              <div className="flex items-start gap-3 min-w-0 pr-2">
                <input
                  type="checkbox"
                  checked={isEnded}
                  disabled={isReadOnly}
                  onChange={() => onToggle(item.id, isEnded)}
                  className="mt-0.5 w-[16px] h-[16px] accent-[#0071e3] rounded cursor-pointer shrink-0 disabled:opacity-50"
                  title={isEnded ? 'Reopen follow-up' : 'Mark as ended'}
                  aria-label={isEnded ? 'Reopen follow-up' : 'Mark as ended'}
                />

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p
                      className={`text-[13px] leading-tight font-medium transition-colors ${
                        isEnded ? 'line-through decoration-zinc-400 dark:decoration-zinc-500' : ''
                      }`}
                      style={{
                        color: isEnded ? 'var(--text-muted)' : 'var(--text-primary)',
                      }}
                    >
                      {item.text}
                    </p>

                    {isEnded && (
                      <span
                        className="text-[9px] font-medium px-2 py-0.5 rounded-full"
                        style={{
                          background: 'var(--bg-pill)',
                          color: 'var(--text-muted)',
                          border: '1px solid var(--border-main)',
                        }}
                      >
                        Ended
                      </span>
                    )}

                    {/* Tag: Payment Pending */}
                    {(item.followUpTags || []).includes('payment-pending') && (
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 transition-opacity ${
                          isEnded ? 'opacity-50 grayscale' : ''
                        }`}
                        style={{
                          background: 'rgba(239,68,68,0.12)',
                          color: '#EF4444',
                          border: '1px solid rgba(239,68,68,0.25)',
                        }}
                        title="Payment pending"
                      >
                        Payment Pending
                        {!isReadOnly && !isEnded && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleTag(item.id, 'payment-pending');
                            }}
                            className="hover:opacity-70 p-0.5"
                            title="Remove payment pending tag"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </span>
                    )}

                    {/* Tag: Trial Session */}
                    {(item.followUpTags || []).includes('trial-session') && (
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 transition-opacity ${
                          isEnded ? 'opacity-50 grayscale' : ''
                        }`}
                        style={{
                          background: 'rgba(139,92,246,0.12)',
                          color: '#8B5CF6',
                          border: '1px solid rgba(139,92,246,0.25)',
                        }}
                        title="Trial session"
                      >
                        Trial Session
                        {!isReadOnly && !isEnded && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleTag(item.id, 'trial-session');
                            }}
                            className="hover:opacity-70 p-0.5"
                            title="Remove trial session tag"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </span>
                    )}

                    {/* Joining Later */}
                    {item.auditionOutcome === 'joining-later' && (
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full transition-opacity ${
                          isEnded ? 'opacity-50 grayscale' : ''
                        }`}
                        style={{
                          background: 'rgba(245,158,11,0.12)',
                          color: '#F59E0B',
                          border: '1px solid rgba(245,158,11,0.25)',
                        }}
                      >
                        Joining Later
                      </span>
                    )}

                    {/* Schedule Follow up */}
                    {item.auditionOutcome === 'schedule-followup' && (
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full transition-opacity ${
                          isEnded ? 'opacity-50 grayscale' : ''
                        }`}
                        style={{ background: 'rgba(0,102,255,0.12)', color: '#0066FF' }}
                      >
                        Schedule Follow up
                      </span>
                    )}

                    {/* Branch */}
                    {item.branch && (
                      <span
                        className={`text-[9px] font-medium px-1.5 py-0.5 rounded inline-flex items-center gap-1 transition-opacity ${
                          isEnded ? 'opacity-50' : ''
                        }`}
                        style={{ background: 'var(--bg-pill)', color: 'var(--text-muted)' }}
                      >
                        <MapPin className="w-2.5 h-2.5" />
                        {item.branch}
                      </span>
                    )}
                  </div>

                  {/* Subtitle details */}
                  <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px]">
                    <span
                      className={`font-semibold ${
                        isOverdue
                          ? 'text-red-500'
                          : isToday
                          ? 'text-amber-500'
                          : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      {item.date}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>·</span>
                    <span style={{ color: 'var(--text-primary)' }}>{item.people}</span>
                    {item.phone && (
                      <>
                        <span style={{ color: 'var(--text-muted)' }}>·</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{item.phone}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Fast Response Actions */}
              <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center flex-wrap">
                {/* Date Reschedule Picker */}
                {!isReadOnly && !isEnded && (
                  <label
                    className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-lg border hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    style={{ borderColor: 'var(--border-main)', background: 'var(--bg-card)', color: 'var(--text-secondary)' }}
                    title="Change follow-up date"
                  >
                    <Calendar className="w-3 h-3 text-gray-400" />
                    <span className="text-[10px] hidden md:inline">Reschedule</span>
                    <input
                      type="date"
                      defaultValue={item.rawDate}
                      onChange={(e) => e.target.value && onReschedule(item.id, e.target.value)}
                      className="sr-only"
                    />
                  </label>
                )}

                {/* Direct WhatsApp Action */}
                {waUrl && (
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-lg text-emerald-600 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors border border-emerald-500/20"
                    title="Open WhatsApp chat directly"
                  >
                    <Phone className="w-3 h-3" />
                    <span className="hidden sm:inline">WhatsApp</span>
                  </a>
                )}

                {/* Delete / Clear button */}
                {!isReadOnly && (
                  <button
                    onClick={() => onDelete(item.id)}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition cursor-pointer"
                    title="Remove follow-up permanently"
                    aria-label="Remove follow-up permanently"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Open Chat in CRM Inbox */}
                <button
                  onClick={() => onChat(item.id)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg transition cursor-pointer ${
                    isEnded
                      ? 'border border-[var(--border-main)] hover:bg-black/5 dark:hover:bg-white/5'
                      : 'text-white bg-blue-600 hover:bg-blue-700 shadow-xs'
                  }`}
                  style={{
                    color: isEnded ? 'var(--text-secondary)' : undefined,
                    background: isEnded ? 'var(--bg-card)' : undefined,
                  }}
                  title="Open Conversation in Inbox"
                  aria-label="Open Conversation in Inbox"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Chat
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
