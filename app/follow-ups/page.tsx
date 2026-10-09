"use client";

import React, { useState, useEffect } from 'react';

const API = "https://api.tchaikovskyschool.com/crm-api";

type Item = {
  id: string;
  text: string;
  date: string;
  people: string;
  completed: boolean;
  dateValue: string; // ISO date string for comparison
};

const TODAY = new Date().toISOString().split('T')[0]; // e.g. "2026-09-20"

function formatDisplayDate(isoDate: string) {
  if (!isoDate) return "—";
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function getSection(isoDate: string): 'overdue' | 'today' | 'upcoming' {
  if (!isoDate) return 'upcoming';
  if (isoDate < TODAY) return 'overdue';
  if (isoDate === TODAY) return 'today';
  return 'upcoming';
}

export default function FollowUpsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  // New follow up input state is removed since follow-ups are added from the CRM inbox.

  const fetchFollowUps = async () => {
    try {
      const res = await fetch(`${API}/messages`);
      const json = await res.json();
      if (json.success && json.data) {
        const followUps: Item[] = json.data
          .filter((c: any) => c.followUpDate || c.followUpNote)
          .map((c: any) => ({
            id: c.senderId,
            text: c.followUpNote || 'Follow up',
            date: formatDisplayDate(c.followUpDate),
            people: `${c.name || 'Student'} · ${c.agent || 'Unassigned'}`,
            completed: false, // We clear them when completed, so they disappear
            dateValue: c.followUpDate || '9999-12-31',
          }));
        setItems(followUps);
      }
    } catch (err) {
      console.error("Failed to fetch follow ups:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFollowUps();
    const interval = setInterval(fetchFollowUps, 5000);
    return () => clearInterval(interval);
  }, []);

  const completeFollowUp = async (id: string) => {
    // Optimistically remove it
    setItems(prev => prev.filter(i => i.id !== id));
    // Persist: clear follow up
    try {
      await fetch(`${API}/messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followUpDate: "", followUpNote: "" }),
      });
    } catch (err) {
      console.error(err);
    }
  };

  const activeItems = items.filter(i => !i.completed);
  const overdueItems = activeItems.filter(i => getSection(i.dateValue) === 'overdue').sort((a, b) => a.dateValue.localeCompare(b.dateValue));
  const todayItems = activeItems.filter(i => getSection(i.dateValue) === 'today');
  const upcomingItems = activeItems.filter(i => getSection(i.dateValue) === 'upcoming').sort((a, b) => a.dateValue.localeCompare(b.dateValue));

  const openCount = activeItems.length;

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <div className="px-6 py-4 flex items-start justify-between" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-main)' }}>
        <div>
          <h1 className="text-[15px] font-bold mb-0.5" style={{ color: 'var(--text-primary)' }}>Follow-ups</h1>
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {loading ? "Loading..." : `${openCount} open follow-up${openCount !== 1 ? 's' : ''}.`}
          </p>
        </div>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
        {items.length === 0 && !loading && (
           <div className="flex flex-col items-center justify-center py-20 gap-2">
             <p className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>No follow-ups</p>
             <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
               Set follow-up dates in the CRM inbox and they will appear here.
             </p>
           </div>
        )}
        {overdueItems.length > 0 && (
          <Section label="Overdue" count={overdueItems.length} labelColor="text-[#FF3B30]" items={overdueItems} onToggle={completeFollowUp} />
        )}
        {todayItems.length > 0 && (
          <Section label="Due today" count={todayItems.length} labelColor="text-[#FF9500]" items={todayItems} onToggle={completeFollowUp} />
        )}
        {upcomingItems.length > 0 && (
          <Section label="Upcoming" count={upcomingItems.length} labelColor="text-[#0066FF]" items={upcomingItems} onToggle={completeFollowUp} />
        )}
      </div>
    </div>
  );
}

function Section({
  label, count, labelColor, items, onToggle, completed = false,
}: {
  label: string; count: number; labelColor: string; items: Item[];
  onToggle: (id: string) => void; completed?: boolean;
}) {
  return (
    <div>
      <div className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${labelColor}`}>
        {label} · {count}
      </div>
      <div className="rounded-xl divide-y overflow-hidden shadow-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}>
        {items.map(item => (
          <div key={item.id} className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border-main)', background: 'var(--bg-card)' }}>
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={completed || item.completed}
                onChange={() => onToggle(item.id)}
                className="mt-0.5 w-[14px] h-[14px] accent-[#0071e3] rounded cursor-pointer shrink-0"
              />
              <div>
                <p className={`text-[13px] leading-tight font-medium ${completed || item.completed ? 'line-through opacity-50' : ''}`} style={{ color: 'var(--text-primary)' }}>
                  {item.text}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  {item.date} · {item.people}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
