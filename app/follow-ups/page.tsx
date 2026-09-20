"use client";

import React, { useState } from 'react';

type Item = {
  id: number;
  text: string;
  date: string;
  people: string;
  completed: boolean;
  dateValue: string; // ISO date string for comparison
};

const TODAY = new Date().toISOString().split('T')[0]; // e.g. "2026-09-20"

function formatDisplayDate(isoDate: string) {
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function getSection(isoDate: string): 'overdue' | 'today' | 'upcoming' {
  if (isoDate < TODAY) return 'overdue';
  if (isoDate === TODAY) return 'today';
  return 'upcoming';
}

const initialItems: Item[] = [
  { id: 1, text: 'Call Reem back about guitar classes', date: 'Fri, Sep 18', people: 'Reem · Rokaia', completed: false, dateValue: '2026-09-18' },
  { id: 2, text: 'Send Faisal the adult beginner oud pricing', date: 'Sat, Sep 19', people: 'Faisal · Sara', completed: false, dateValue: '2026-09-19' },
  { id: 3, text: "Confirm Noura's Sunday audition slot", date: 'Sun, Sep 20', people: 'Noura · Sara', completed: false, dateValue: '2026-09-20' },
  { id: 4, text: 'Chase Khalid — no reply since the form', date: 'Sun, Sep 20', people: 'Jwana', completed: false, dateValue: '2026-09-20' },
  { id: 5, text: 'Follow up with Lina about teen violin', date: 'Tue, Sep 22', people: 'Lina · Sara', completed: false, dateValue: '2026-09-22' },
  { id: 6, text: "Ask Huda's parent to bring her violin", date: 'Wed, Sep 23', people: 'Huda · Rokaia', completed: false, dateValue: '2026-09-23' },
  { id: 7, text: 'Send Omar the online trial link', date: 'Thu, Sep 17', people: 'Omar · Sara', completed: true, dateValue: '2026-09-17' },
];

export default function FollowUpsPage() {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [newText, setNewText] = useState('');
  const [newDate, setNewDate] = useState(TODAY);
  const [nextId, setNextId] = useState(100);

  const handleAdd = () => {
    const trimmed = newText.trim();
    if (!trimmed) return;
    const newItem: Item = {
      id: nextId,
      text: trimmed,
      date: formatDisplayDate(newDate),
      people: 'Jwana',
      completed: false,
      dateValue: newDate,
    };
    setItems(prev => [...prev, newItem]);
    setNextId(prev => prev + 1);
    setNewText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleAdd();
  };

  const toggle = (id: number) => {
    setItems(prev =>
      prev.map(item => item.id === id ? { ...item, completed: !item.completed } : item)
    );
  };

  const activeItems = items.filter(i => !i.completed);
  const completedItems = items.filter(i => i.completed);
  const overdueItems = activeItems.filter(i => getSection(i.dateValue) === 'overdue');
  const todayItems = activeItems.filter(i => getSection(i.dateValue) === 'today');
  const upcomingItems = activeItems.filter(i => getSection(i.dateValue) === 'upcoming');

  const openCount = activeItems.length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 flex items-start justify-between" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-main)' }}>
        <div>
          <h1 className="text-[15px] font-bold mb-0.5" style={{ color: 'var(--text-primary)' }}>Follow-ups</h1>
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{openCount} open follow-up{openCount !== 1 ? 's' : ''}.</p>
        </div>
        <button className="h-[26px] px-3 text-[11px] font-medium rounded-[6px] transition-colors mt-1" style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)', color: 'var(--text-secondary)' }}>
          Only mine
        </button>
      </div>

      {/* Add follow-up bar */}
      <div className="px-6 pb-3 flex items-center gap-2" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-main)' }}>
        <input
          type="text"
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='Add a follow-up — e.g. "Call Noura about Sunday slot"'
          className="flex-1 h-[30px] px-3 text-[12px] rounded-[6px] outline-none placeholder-gray-400 transition-colors focus:border-[#0066FF]"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}
        />
        <input
          type="date"
          value={newDate}
          onChange={e => setNewDate(e.target.value)}
          className="h-[30px] px-2 text-[12px] rounded-[6px] outline-none transition-colors focus:border-[#0066FF]"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}
        />
        <button
          onClick={handleAdd}
          className="h-[30px] px-4 text-[12px] font-semibold text-white bg-[#0066FF] rounded-[6px] hover:bg-blue-700"
        >
          Add
        </button>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
        {overdueItems.length > 0 && (
          <Section label="Overdue" count={overdueItems.length} labelColor="text-[#FF3B30]" items={overdueItems} onToggle={toggle} />
        )}
        {todayItems.length > 0 && (
          <Section label="Due today" count={todayItems.length} labelColor="text-[#FF9500]" items={todayItems} onToggle={toggle} />
        )}
        {upcomingItems.length > 0 && (
          <Section label="Upcoming" count={upcomingItems.length} labelColor="text-gray-500" items={upcomingItems} onToggle={toggle} />
        )}
        {completedItems.length > 0 && (
          <Section label="Completed" count={completedItems.length} labelColor="text-gray-400" items={completedItems} onToggle={toggle} completed />
        )}
      </div>
    </div>
  );
}

function Section({
  label, count, labelColor, items, onToggle, completed = false,
}: {
  label: string; count: number; labelColor: string; items: Item[];
  onToggle: (id: number) => void; completed?: boolean;
}) {
  return (
    <div>
      <div className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${labelColor}`}>
        {label} · {count}
      </div>
      <div className="rounded-xl divide-y" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)', borderColor: 'var(--border-main)', boxShadow: 'var(--shadow-card)' }}>
        {items.map(item => (
          <div key={item.id} className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border-main)' }}>
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={completed || item.completed}
                onChange={() => onToggle(item.id)}
                className="mt-0.5 w-[14px] h-[14px] accent-[#0071e3] rounded cursor-pointer shrink-0"
              />
              <div>
                <p className={`text-[13px] leading-tight ${completed || item.completed ? 'line-through' : ''}`} style={{ color: (completed || item.completed) ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                  {item.text}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  {item.date} · {item.people}
                </p>
              </div>
            </div>
            <button className="text-[11px] text-[#0066FF] hover:underline shrink-0 ml-4">
              Open chat
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
