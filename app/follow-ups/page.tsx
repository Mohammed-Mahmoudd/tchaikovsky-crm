"use client";

import React, { useMemo } from 'react';
import { useCRM } from '../context/CRMContext';
import { MessageSquare, Calendar, CheckSquare } from 'lucide-react';

type Item = {
  id: string;
  text: string;
  date: string;
  people: string;
  completed: boolean;
  dateValue: string;
};

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

  const today = useMemo(() => new Date().toISOString().split('T')[0], []);

  const items: Item[] = useMemo(() => {
    return conversations
      .filter((c) => Boolean(c.followUpDate || c.followUpNote))
      .map((c) => ({
        id: c.id,
        text: c.followUpNote || 'Follow up with customer',
        date: formatDisplayDate(c.followUpDate || ''),
        people: `${c.name || 'Student'} · ${c.agent || 'Unassigned'}`,
        completed: false,
        dateValue: c.followUpDate || '9999-12-31',
      }));
  }, [conversations]);

  const completeFollowUp = (id: string) => {
    patchConversation(id, { followUpDate: "", followUpNote: "" });
  };

  const overdueItems = useMemo(() => items.filter(i => getSection(i.dateValue, today) === 'overdue').sort((a, b) => a.dateValue.localeCompare(b.dateValue)), [items, today]);
  const todayItems = useMemo(() => items.filter(i => getSection(i.dateValue, today) === 'today'), [items, today]);
  const upcomingItems = useMemo(() => items.filter(i => getSection(i.dateValue, today) === 'upcoming').sort((a, b) => a.dateValue.localeCompare(b.dateValue)), [items, today]);

  const openCount = items.length;

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-main)' }}>
        <div>
          <h1 className="text-[15px] font-bold mb-0.5" style={{ color: 'var(--text-primary)' }}>Follow-ups</h1>
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {loading ? "Loading follow-ups..." : `${openCount} active follow-up${openCount !== 1 ? 's' : ''}. Synchronized with Inbox.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {overdueItems.length > 0 && (
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-red-500/10 text-red-500 border border-red-500/20">
              {overdueItems.length} Overdue
            </span>
          )}
          {todayItems.length > 0 && (
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
              {todayItems.length} Due Today
            </span>
          )}
        </div>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {items.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-12 h-12 rounded-full flex items-center justify-center bg-blue-500/10 text-blue-500">
              <CheckSquare className="w-6 h-6" />
            </div>
            <p className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>All caught up!</p>
            <p className="text-[12px] text-center max-w-sm" style={{ color: 'var(--text-secondary)' }}>
              No pending follow-ups. Set follow-up dates and notes directly from any chat in the Inbox to track them here.
            </p>
          </div>
        )}

        {overdueItems.length > 0 && (
          <Section
            label="Overdue"
            count={overdueItems.length}
            labelColor="text-[#FF3B30]"
            items={overdueItems}
            onToggle={completeFollowUp}
            onChat={openChat}
          />
        )}

        {todayItems.length > 0 && (
          <Section
            label="Due today"
            count={todayItems.length}
            labelColor="text-[#FF9500]"
            items={todayItems}
            onToggle={completeFollowUp}
            onChat={openChat}
          />
        )}

        {upcomingItems.length > 0 && (
          <Section
            label="Upcoming"
            count={upcomingItems.length}
            labelColor="text-[#0066FF]"
            items={upcomingItems}
            onToggle={completeFollowUp}
            onChat={openChat}
          />
        )}
      </div>
    </div>
  );
}

function Section({
  label, count, labelColor, items, onToggle, onChat
}: {
  label: string; count: number; labelColor: string; items: Item[];
  onToggle: (id: string) => void;
  onChat: (id: string) => void;
}) {
  return (
    <div>
      <div className={`text-[10px] font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5 ${labelColor}`}>
        <Calendar className="w-3 h-3" />
        {label} · {count}
      </div>
      <div className="rounded-xl divide-y overflow-hidden shadow-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}>
        {items.map(item => (
          <div key={item.id} className="flex items-center justify-between px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5 transition" style={{ borderBottom: '1px solid var(--border-main)' }}>
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={item.completed}
                onChange={() => onToggle(item.id)}
                className="mt-0.5 w-[15px] h-[15px] accent-[#0071e3] rounded cursor-pointer shrink-0"
                title="Mark as completed"
              />
              <div>
                <p className="text-[13px] leading-tight font-medium" style={{ color: 'var(--text-primary)' }}>
                  {item.text}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  {item.date} · {item.people}
                </p>
              </div>
            </div>
            <button
              onClick={() => onChat(item.id)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 transition"
              title="Open Conversation"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Chat
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
