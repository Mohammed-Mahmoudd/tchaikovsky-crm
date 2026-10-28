"use client";

import React, { useMemo, useState, useCallback } from 'react';
import { useCRM } from '../context/CRMContext';
import { useAuth } from '../components/AuthProvider';
import { MessageSquare, Calendar, CheckSquare, Trash2, MapPin } from 'lucide-react';

type Item = {
  id: string;
  text: string;
  date: string;
  people: string;
  branch?: string;
  auditionOutcome?: string;
  pipeline?: string;
  completed: boolean;
  completedAt?: string;
  dateValue: string;
};

type FilterMode = 'all' | 'pending' | 'completed' | 'joining-later';

function getLocalIsoToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDisplayDate(isoDate: string) {
  if (!isoDate) return "—";
  const d = new Date(isoDate + 'T00:00:00');
  return isNaN(d.getTime()) ? isoDate : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function getSection(isoDate: string, today: string): 'overdue' | 'today' | 'upcoming' {
  if (!isoDate) return 'upcoming';
  if (isoDate < today) return 'overdue';
  if (isoDate === today) return 'today';
  return 'upcoming';
}

export default function FollowUpsPage() {
  const { conversations, loading, patchConversation, openChat } = useCRM();
  const { isReadOnly } = useAuth();
  const [filter, setFilter] = useState<FilterMode>('all');

  const today = useMemo(() => getLocalIsoToday(), []);

  const items: Item[] = useMemo(() => {
    return conversations
      .filter((c) => (
        (c.pipeline !== 'Audition Booked' || c.auditionOutcome === 'joining-later') &&
        Boolean(c.followUpDate || c.followUpNote || c.auditionOutcome === 'joining-later')
      ))
      .map((c) => ({
        id: c.id,
        text: c.followUpNote || (c.auditionOutcome === 'joining-later' ? 'Joining Later - Follow up' : 'Follow up with customer'),
        date: formatDisplayDate(c.followUpDate || ''),
        people: `${c.name || 'Student'} · ${c.agent || 'Unassigned'}`,
        branch: c.branch || '',
        auditionOutcome: c.auditionOutcome || '',
        pipeline: c.pipeline || '',
        completed: Boolean(c.followUpCompleted),
        completedAt: c.followUpCompletedAt || '',
        dateValue: c.followUpDate || '9999-12-31',
      }));
  }, [conversations]);

  // Instant optimistic toggle between active and ended (persisted to backend)
  const toggleFollowUp = useCallback((id: string, currentCompleted: boolean) => {
    if (isReadOnly) return;
    const nextCompleted = !currentCompleted;
    patchConversation(id, {
      followUpCompleted: nextCompleted,
      followUpCompletedAt: nextCompleted ? new Date().toISOString() : null,
    });
  }, [isReadOnly, patchConversation]);

  // Permanently clear follow-up note, date and outcome
  const deleteFollowUp = useCallback((id: string) => {
    if (isReadOnly) return;
    patchConversation(id, {
      followUpDate: "",
      followUpNote: "",
      followUpCompleted: false,
      followUpCompletedAt: null,
      auditionOutcome: "",
    });
  }, [isReadOnly, patchConversation]);

  const pendingCount = useMemo(() => items.filter(i => !i.completed).length, [items]);
  const completedCount = useMemo(() => items.filter(i => i.completed).length, [items]);
  const joiningLaterCount = useMemo(() => items.filter(i => i.auditionOutcome === 'joining-later').length, [items]);

  const filterItem = useCallback((i: Item) => {
    if (filter === 'pending') return !i.completed;
    if (filter === 'completed') return i.completed;
    if (filter === 'joining-later') return i.auditionOutcome === 'joining-later';
    return true;
  }, [filter]);

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
    return sortSectionItems(items.filter(i => getSection(i.dateValue, today) === 'overdue').filter(filterItem));
  }, [items, today, filterItem, sortSectionItems]);

  const todayItems = useMemo(() => {
    return sortSectionItems(items.filter(i => getSection(i.dateValue, today) === 'today').filter(filterItem));
  }, [items, today, filterItem, sortSectionItems]);

  const upcomingItems = useMemo(() => {
    return sortSectionItems(items.filter(i => getSection(i.dateValue, today) === 'upcoming').filter(filterItem));
  }, [items, today, filterItem, sortSectionItems]);

  // Badges count only active (pending) items
  const overduePendingCount = useMemo(() => {
    return items.filter(i => !i.completed && getSection(i.dateValue, today) === 'overdue').length;
  }, [items, today]);

  const todayPendingCount = useMemo(() => {
    return items.filter(i => !i.completed && getSection(i.dateValue, today) === 'today').length;
  }, [items, today]);

  const visibleTotal = overdueItems.length + todayItems.length + upcomingItems.length;

  return (
    <div className="flex flex-col h-full min-h-0" style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <div className="px-4 md:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-main)' }}>
        <div>
          <h1 className="text-[15px] font-bold mb-0.5" style={{ color: 'var(--text-primary)' }}>Follow-ups</h1>
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {loading
              ? "Loading follow-ups..."
              : `${pendingCount} active follow-up${pendingCount !== 1 ? 's' : ''}${completedCount > 0 ? ` · ${completedCount} ended` : ''}. Synchronized with Inbox.`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Overdue / Due Today indicators */}
          {overduePendingCount > 0 && (
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-red-500/10 text-red-500 border border-red-500/20">
              {overduePendingCount} Overdue
            </span>
          )}
          {todayPendingCount > 0 && (
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
              {todayPendingCount} Due Today
            </span>
          )}

          {/* Filter segment */}
          <div className="flex items-center p-0.5 rounded-lg border border-[var(--border-main)]" style={{ background: 'var(--bg-page)' }}>
            <button
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition ${filter === 'all' ? 'shadow-xs font-semibold' : ''}`}
              style={{
                background: filter === 'all' ? 'var(--bg-card)' : 'transparent',
                color: filter === 'all' ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              All ({items.length})
            </button>
            <button
              onClick={() => setFilter('pending')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition ${filter === 'pending' ? 'shadow-xs font-semibold' : ''}`}
              style={{
                background: filter === 'pending' ? 'var(--bg-card)' : 'transparent',
                color: filter === 'pending' ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              Active ({pendingCount})
            </button>
            <button
              onClick={() => setFilter('completed')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition ${filter === 'completed' ? 'shadow-xs font-semibold' : ''}`}
              style={{
                background: filter === 'completed' ? 'var(--bg-card)' : 'transparent',
                color: filter === 'completed' ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              Ended ({completedCount})
            </button>
            {joiningLaterCount > 0 && (
              <button
                onClick={() => setFilter('joining-later')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition ${filter === 'joining-later' ? 'shadow-xs font-semibold' : ''}`}
                style={{
                  background: filter === 'joining-later' ? 'var(--bg-card)' : 'transparent',
                  color: filter === 'joining-later' ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                Joining Later ({joiningLaterCount})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 py-4 space-y-6" style={{ WebkitOverflowScrolling: 'touch' }}>
        {items.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-12 h-12 rounded-full flex items-center justify-center bg-blue-500/10 text-blue-500">
              <CheckSquare className="w-6 h-6" />
            </div>
            <p className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>All caught up!</p>
            <p className="text-[12px] text-center max-w-sm" style={{ color: 'var(--text-secondary)' }}>
              No follow-ups. Set follow-up dates and notes directly from any chat in the Inbox to track them here.
            </p>
          </div>
        )}

        {items.length > 0 && visibleTotal === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <p className="text-[13px] font-medium" style={{ color: 'var(--text-secondary)' }}>
              No {filter === 'completed' ? 'ended' : filter === 'joining-later' ? 'joining later' : 'active'} follow-ups found.
            </p>
          </div>
        )}

        {overdueItems.length > 0 && (
          <Section
            label="Overdue"
            count={overdueItems.length}
            pendingCount={overdueItems.filter(i => !i.completed).length}
            labelColor="text-[#FF3B30]"
            items={overdueItems}
            onToggle={toggleFollowUp}
            onDelete={deleteFollowUp}
            onChat={openChat}
            isReadOnly={isReadOnly}
          />
        )}

        {todayItems.length > 0 && (
          <Section
            label="Due today"
            count={todayItems.length}
            pendingCount={todayItems.filter(i => !i.completed).length}
            labelColor="text-[#FF9500]"
            items={todayItems}
            onToggle={toggleFollowUp}
            onDelete={deleteFollowUp}
            onChat={openChat}
            isReadOnly={isReadOnly}
          />
        )}

        {upcomingItems.length > 0 && (
          <Section
            label="Upcoming"
            count={upcomingItems.length}
            pendingCount={upcomingItems.filter(i => !i.completed).length}
            labelColor="text-[#0066FF]"
            items={upcomingItems}
            onToggle={toggleFollowUp}
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
  label, count, pendingCount, labelColor, items, onToggle, onDelete, onChat, isReadOnly
}: {
  label: string;
  count: number;
  pendingCount: number;
  labelColor: string;
  items: Item[];
  onToggle: (id: string, currentCompleted: boolean) => void;
  onDelete: (id: string) => void;
  onChat: (id: string) => void;
  isReadOnly?: boolean;
}) {
  return (
    <div>
      <div className={`text-[10px] font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5 ${labelColor}`}>
        <Calendar className="w-3 h-3" />
        {label} · {pendingCount > 0 ? pendingCount : count} {count !== pendingCount && pendingCount > 0 ? `(${count - pendingCount} ended)` : ''}
      </div>
      <div className="rounded-xl divide-y overflow-hidden shadow-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}>
        {items.map(item => {
          const isEnded = item.completed;
          return (
            <div
              key={item.id}
              className={`group flex items-center justify-between px-4 py-3 transition-all duration-150 ${
                isEnded
                  ? 'opacity-60 hover:opacity-85'
                  : 'hover:bg-black/5 dark:hover:bg-white/5'
              }`}
              style={{
                borderBottom: '1px solid var(--border-main)',
                background: isEnded ? 'var(--bg-page)' : 'transparent',
              }}
            >
              <div className="flex items-start gap-3 min-w-0 pr-3">
                <input
                  type="checkbox"
                  checked={isEnded}
                  disabled={isReadOnly}
                  onChange={() => onToggle(item.id, isEnded)}
                  className="mt-0.5 w-[16px] h-[16px] accent-[#0071e3] rounded cursor-pointer shrink-0 disabled:opacity-50"
                  title={isEnded ? "Reopen follow-up" : "Mark as ended"}
                  aria-label={isEnded ? "Reopen follow-up" : "Mark as ended"}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p
                      className={`text-[13px] leading-tight font-medium transition-colors ${
                        isEnded
                          ? 'line-through decoration-zinc-400 dark:decoration-zinc-500'
                          : ''
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

                    {item.auditionOutcome === 'schedule-followup' && (
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full transition-opacity ${isEnded ? 'opacity-50 grayscale' : ''}`}
                        style={{ background: 'rgba(0,102,255,0.12)', color: '#0066FF' }}
                      >
                        Schedule Follow up
                      </span>
                    )}
                    {item.auditionOutcome === 'joining-later' && (
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full transition-opacity ${isEnded ? 'opacity-50 grayscale' : ''}`}
                        style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}
                      >
                        Joining Later
                      </span>
                    )}
                    {item.branch && (
                      <span
                        className={`text-[9px] font-medium px-1.5 py-0.5 rounded inline-flex items-center gap-1 transition-opacity ${isEnded ? 'opacity-50' : ''}`}
                        style={{ background: 'var(--bg-pill)', color: 'var(--text-muted)' }}
                      >
                        <MapPin className="w-2.5 h-2.5" />
                        {item.branch}
                      </span>
                    )}
                  </div>
                  <p
                    className="text-[11px] mt-0.5"
                    style={{
                      color: isEnded ? 'var(--text-muted)' : 'var(--text-secondary)',
                    }}
                  >
                    {item.date} · {item.people}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {!isReadOnly && (
                  <button
                    onClick={() => onDelete(item.id)}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition"
                    title="Remove follow-up permanently"
                    aria-label="Remove follow-up permanently"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => onChat(item.id)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg transition ${
                    isEnded
                      ? 'border border-[var(--border-main)] hover:bg-black/5 dark:hover:bg-white/5'
                      : 'text-white bg-blue-600 hover:bg-blue-700'
                  }`}
                  style={{
                    color: isEnded ? 'var(--text-secondary)' : undefined,
                    background: isEnded ? 'var(--bg-card)' : undefined,
                  }}
                  title="Open Conversation"
                  aria-label="Open Conversation"
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

