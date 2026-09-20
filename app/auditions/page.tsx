"use client";

import React, { useState } from 'react';

type AuditionStatus = 'attended' | 'no-show' | 'free' | 'booked';

type Slot = {
  id: number;
  time: string;
  name?: string;
  type?: string;
  status: AuditionStatus;
  agent?: string;
};

type DaySlots = { [dateKey: string]: Slot[] };

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function isoDate(d: Date) { return d.toISOString().split('T')[0]; }
function formatRangeLabel(start: Date, end: Date) {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
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

const TODAY_ISO = isoDate(new Date());
const DAYS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

const initialSlots: DaySlots = {
  '2026-09-19': [{ id: 1, time: '05:00 PM', name: 'Salma', type: 'Child 8 · Piano', status: 'attended', agent: 'Salma' }],
  '2026-09-20': [
    { id: 2, time: '05:00 PM', name: 'Huda', type: 'Child 11 · Violin', status: 'attended', agent: 'Huda' },
    { id: 3, time: '05:30 PM', status: 'free', agent: 'Jwana' },
  ],
  '2026-09-21': [
    { id: 4, time: '04:00 PM', name: 'Tariq', type: 'Adult · Oud', status: 'no-show', agent: 'Tariq' },
    { id: 5, time: '04:30 PM', status: 'free', agent: 'Rokaia' },
  ],
  '2026-09-22': [{ id: 6, time: '05:00 PM', status: 'free', agent: 'Jwana' }],
};

type BookingModal = { slotId: number; dateKey: string; time: string; dayLabel: string } | null;

export default function AuditionsPage() {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [slots, setSlots] = useState<DaySlots>(initialSlots);
  const [nextId, setNextId] = useState(100);

  // "+ slot" inline form state: key = dateKey, value = { time, agent }
  const [addingSlot, setAddingSlot] = useState<{ dateKey: string; time: string; agent: string } | null>(null);

  // "Book" modal state
  const [bookingModal, setBookingModal] = useState<BookingModal>(null);
  const [bookForm, setBookForm] = useState({ name: '', type: 'Adult', age: '', instrument: '' });

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = weekDays[6];

  const prevWeek = () => setWeekStart(d => addDays(d, -7));
  const nextWeek = () => setWeekStart(d => addDays(d, 7));
  const goToday = () => setWeekStart(getWeekStart(new Date()));

  // Confirm adding a free slot
  const confirmAddSlot = () => {
    if (!addingSlot) return;
    const newSlot: Slot = { id: nextId, time: addingSlot.time, status: 'free', agent: addingSlot.agent || 'Jwana' };
    setSlots(prev => ({ ...prev, [addingSlot.dateKey]: [...(prev[addingSlot.dateKey] || []), newSlot] }));
    setNextId(n => n + 1);
    setAddingSlot(null);
  };

  // Book a free slot
  const openBooking = (slotId: number, dateKey: string, time: string, day: Date) => {
    setBookingModal({ slotId, dateKey, time, dayLabel: formatDayLabel(day) });
    setBookForm({ name: '', type: 'Adult', age: '', instrument: '' });
  };

  const confirmBooking = () => {
    if (!bookingModal) return;
    const { slotId, dateKey } = bookingModal;
    setSlots(prev => ({
      ...prev,
      [dateKey]: (prev[dateKey] || []).map(s =>
        s.id === slotId
          ? { ...s, name: bookForm.name || 'Student', type: `${bookForm.type}${bookForm.age ? ` ${bookForm.age}` : ''} · ${bookForm.instrument || '—'}`, status: 'booked' }
          : s
      ),
    }));
    setBookingModal(null);
  };

  const setSlotStatus = (dateKey: string, slotId: number, status: AuditionStatus) => {
    setSlots(prev => ({
      ...prev,
      [dateKey]: (prev[dateKey] || []).map(s => s.id === slotId ? { ...s, status } : s),
    }));
  };

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-main)' }}>
        <div>
          <h1 className="text-[15px] font-bold leading-none mb-0.5" style={{ color: 'var(--text-primary)' }}>Auditions</h1>
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{formatRangeLabel(weekStart, weekEnd)}</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="h-[26px] text-[11px] rounded-[6px] px-2 outline-none" style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}>
            <option>Jeddah Hub</option>
            <option>Riyadh Hub</option>
          </select>
          <button onClick={prevWeek} className="h-[26px] w-[26px] flex items-center justify-center rounded-[6px] transition-colors text-[13px]" style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)', color: 'var(--text-secondary)' }}>‹</button>
          <button onClick={goToday} className="h-[26px] px-3 text-[11px] font-medium rounded-[6px] transition-colors" style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)', color: 'var(--text-secondary)' }}>Today</button>
          <button onClick={nextWeek} className="h-[26px] w-[26px] flex items-center justify-center rounded-[6px] transition-colors text-[13px]" style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)', color: 'var(--text-secondary)' }}>›</button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 overflow-x-auto" style={{ background: 'var(--bg-page)' }}>
        <div className="min-w-[700px] h-full flex flex-col">
          {/* Day headers */}
          <div className="grid grid-cols-7" style={{ borderBottom: '1px solid var(--border-sidebar)' }}>
            {weekDays.map((day, i) => {
              const key = isoDate(day);
              const isToday = key === TODAY_ISO;
              return (
                <div key={key} className="py-1.5 px-2 text-center" style={{ borderRight: '1px solid var(--border-sidebar)', background: isToday ? 'var(--bg-today)' : 'var(--bg-card)' }}>
                  <span className={`text-[12px] font-medium`} style={{ color: isToday ? '#0066FF' : 'var(--text-secondary)', fontWeight: isToday ? 'bold' : 'normal' }}>
                    {day.getDate()} {DAYS[i]}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 flex-1">
            {weekDays.map((day, i) => {
              const key = isoDate(day);
              const isToday = key === TODAY_ISO;
              const daySlots = slots[key] || [];
              const isAddingHere = addingSlot?.dateKey === key;

              return (
                <div key={key} className="p-1.5" style={{ borderRight: '1px solid var(--border-sidebar)', background: isToday ? 'var(--bg-today-cell)' : 'transparent' }}>
                  <div className="flex flex-col gap-1.5">
                    {daySlots.map(slot => (
                      <SlotCard
                        key={slot.id}
                        slot={slot}
                        onBook={() => openBooking(slot.id, key, slot.time, day)}
                        onStatusChange={(status) => setSlotStatus(key, slot.id, status)}
                      />
                    ))}

                    {/* Inline add slot form */}
                    {isAddingHere ? (
                      <div className="rounded-md p-2 flex flex-col gap-1.5" style={{ border: '1px solid var(--border-input)', background: 'var(--bg-card)' }}>
                        <input
                          type="time"
                          value={addingSlot.time}
                          onChange={e => setAddingSlot(a => a ? { ...a, time: e.target.value } : a)}
                          className="w-full h-[26px] px-2 text-[11px] rounded-[4px] outline-none transition-colors focus:border-[#0066FF]"
                          style={{ border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                        />
                        <input
                          type="text"
                          placeholder="Staff (optional)"
                          value={addingSlot.agent}
                          onChange={e => setAddingSlot(a => a ? { ...a, agent: e.target.value } : a)}
                          className="w-full h-[26px] px-2 text-[11px] rounded-[4px] outline-none placeholder-gray-400 transition-colors focus:border-[#0066FF]"
                          style={{ border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                        />
                        <div className="flex gap-1">
                          <button onClick={confirmAddSlot} className="flex-1 h-[24px] text-[11px] font-semibold text-white bg-[#0066FF] rounded-[4px] hover:bg-blue-700">Add</button>
                          <button onClick={() => setAddingSlot(null)} className="w-[24px] h-[24px] text-[11px] rounded-[4px] transition-colors" style={{ background: 'var(--bg-pill)', color: 'var(--text-secondary)' }}>✕</button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingSlot({ dateKey: key, time: '17:00', agent: '' })}
                        className="text-[10px] py-1 text-center w-full transition-colors"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        + slot
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Book slot modal */}
      {bookingModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setBookingModal(null)}>
          <div className="rounded-2xl shadow-2xl w-[420px] p-6" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }} onClick={e => e.stopPropagation()}>
            <h2 className="text-[15px] font-bold mb-5" style={{ color: 'var(--text-primary)' }}>
              Book {bookingModal.dayLabel}, {bookingModal.time}
            </h2>

            <div className="mb-4">
              <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Student name</label>
              <input
                type="text"
                value={bookForm.name}
                onChange={e => setBookForm(f => ({ ...f, name: e.target.value }))}
                className="w-full h-[34px] px-3 text-[12px] rounded-[8px] outline-none transition-colors focus:border-[#0066FF]"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}
              />
            </div>

            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Adult / child</label>
                <select
                  value={bookForm.type}
                  onChange={e => setBookForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full h-[34px] px-2 text-[12px] rounded-[8px] outline-none transition-colors focus:border-[#0066FF]"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}
                >
                  <option>Adult</option>
                  <option>Child</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Age (if child)</label>
                <input
                  type="number"
                  value={bookForm.age}
                  onChange={e => setBookForm(f => ({ ...f, age: e.target.value }))}
                  className="w-full h-[34px] px-3 text-[12px] rounded-[8px] outline-none transition-colors focus:border-[#0066FF]"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}
                />
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Instrument</label>
              <input
                type="text"
                placeholder="Piano, violin, oud…"
                value={bookForm.instrument}
                onChange={e => setBookForm(f => ({ ...f, instrument: e.target.value }))}
                className="w-full h-[34px] px-3 text-[12px] rounded-[8px] outline-none placeholder-gray-400 transition-colors focus:border-[#0066FF]"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}
              />
            </div>

            <div className="flex gap-3">
              <button onClick={confirmBooking} className="flex-1 h-[38px] text-[13px] font-semibold text-white bg-[#0066FF] rounded-[10px] hover:bg-blue-700">
                Book slot
              </button>
              <button onClick={() => setBookingModal(null)} className="h-[38px] px-5 text-[13px] font-medium rounded-[10px] transition-colors" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-secondary)' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SlotCard({ slot, onBook, onStatusChange }: { slot: Slot; onBook: () => void; onStatusChange: (s: AuditionStatus) => void }) {
  if (slot.status === 'free') {
    return (
      <div onClick={onBook} className="rounded-md border border-dashed px-2 py-1.5 cursor-pointer transition-colors" style={{ borderColor: 'var(--border-main)', background: 'var(--bg-card)' }}>
        <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>{slot.time}</span>
        {slot.agent && <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}> · {slot.agent}</span>}
        <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Free — click to book</p>
      </div>
    );
  }

  // Booked: show both attended/no-show as clickable buttons
  if (slot.status === 'booked') {
    return (
      <div className="rounded-md px-2 py-1.5" style={{ background: 'var(--bg-selected)' }}>
        <p className="text-[10px] font-bold leading-none mb-0.5" style={{ color: 'var(--text-primary)' }}>{slot.time}</p>
        {slot.name && <p className="text-[11px] font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>{slot.name}</p>}
        {slot.type && <p className="text-[10px] leading-tight" style={{ color: 'var(--text-secondary)' }}>{slot.type}</p>}
        <div className="flex flex-wrap gap-1 mt-1.5">
          <button
            onClick={() => onStatusChange('attended')}
            className="text-[8px] font-bold bg-[#34C759] text-white px-1.5 py-0.5 rounded-full hover:opacity-90"
          >
            ✓ attended
          </button>
          <button
            onClick={() => onStatusChange('no-show')}
            className="text-[8px] font-bold border px-1.5 py-0.5 rounded-full transition-colors"
            style={{ color: '#FF3B30', borderColor: 'rgba(255, 59, 48, 0.3)', background: 'transparent' }}
          >
            no-show
          </button>
        </div>
      </div>
    );
  }

  // attended = solid green, no-show = light pink
  if (slot.status === 'attended') {
    return (
      <div className="rounded-md bg-[#34C759] px-2 py-1.5">
        <p className="text-[10px] font-bold text-white leading-none mb-0.5">{slot.time}</p>
        {slot.name && <p className="text-[11px] font-semibold text-white leading-tight">{slot.name}</p>}
        {slot.type && <p className="text-[10px] text-white/80 leading-tight">{slot.type}</p>}
        <div className="flex flex-wrap gap-1 mt-1">
          <span className="text-[8px] font-bold bg-white/30 text-white px-1 py-0.5 rounded-full">✓ attended</span>
        </div>
      </div>
    );
  }

  // no-show = light pink
  return (
    <div className="rounded-md px-2 py-1.5" style={{ background: 'rgba(255, 59, 48, 0.1)' }}>
      <p className="text-[10px] font-bold leading-none mb-0.5" style={{ color: 'var(--text-primary)' }}>{slot.time}</p>
      {slot.name && <p className="text-[11px] font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>{slot.name}</p>}
      {slot.type && <p className="text-[10px] leading-tight" style={{ color: '#FF3B30' }}>{slot.type}</p>}
      <div className="flex flex-wrap gap-1 mt-1">
        <span className="text-[8px] font-bold bg-[#FF3B30]/15 text-[#FF3B30] px-1 py-0.5 rounded-full">no-show</span>
      </div>
    </div>
  );
}
