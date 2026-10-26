"use client";

import React, { useState, useMemo, useCallback } from 'react';
import { useCRM } from '../context/CRMContext';
import { useAuth } from '../components/AuthProvider';
import { MessageSquare, Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';

type AuditionStatus = 'attended' | 'no-show' | 'free' | 'booked';
type AttendanceStatus = 'confirmed' | 'no-response' | 'declined' | null;
type SlotStatus = 'attended' | 'no-show' | 'no-response' | 'booked';

type Slot = {
  id: string | number;
  conversationId?: string;
  time: string;
  name?: string;
  type?: string;
  status: AuditionStatus;
  agent?: string;
  comment?: string;
  attendanceStatus?: AttendanceStatus;
  phone?: string;
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

function parseOverride(val: any): SlotStatus | null {
  if (!val) return null;
  if (typeof val === 'string') {
    if (val === 'attended' || val === 'no-show' || val === 'no-response' || val === 'booked') return val;
    if (val === 'declined') return 'no-show';
    if (val === 'confirmed') return 'attended';
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

function getConvDate(c: any, todayIso: string): string {
  if (c.followUpDate && /^\d{4}-\d{2}-\d{2}$/.test(c.followUpDate)) {
    return c.followUpDate;
  }
  if (c.updatedAt) {
    try {
      const d = isoDate(new Date(c.updatedAt));
      if (d && d !== 'NaN-NaN-NaN') return d;
    } catch { }
  }
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

const ATTENDANCE_OPTIONS: {
  value: SlotStatus;
  label: string;
  badge: string;
  color: string;
  bg: string;
  border: string;
}[] = [
  {
    value: 'attended',
    label: 'Attended',
    badge: 'Attended',
    color: '#34C759',
    bg: 'rgba(52,199,89,0.12)',
    border: 'rgba(52,199,89,0.3)',
  },
  {
    value: 'no-response',
    label: 'No Response',
    badge: 'No Response',
    color: '#FF9500',
    bg: 'rgba(255,149,0,0.12)',
    border: 'rgba(255,149,0,0.3)',
  },
  {
    value: 'no-show',
    label: 'No-Show',
    badge: 'No-Show',
    color: '#FF3B30',
    bg: 'rgba(255,59,48,0.12)',
    border: 'rgba(255,59,48,0.3)',
  },
];

export default function AuditionsPage() {
  const { conversations, patchConversation, openChat } = useCRM();
  const { isReadOnly } = useAuth();
  const [currentDate, setCurrentDate] = useState(() => {
    return getWeekStart(new Date());
  });
  const [customSlots, setCustomSlots] = useState<DaySlots>({});
  const [nextId, setNextId] = useState(100);
  const [addingSlot, setAddingSlot] = useState<{ dateKey: string; time: string; agent: string } | null>(null);
  const [bookingModal, setBookingModal] = useState<BookingModal>(null);
  const [bookForm, setBookForm] = useState({ name: '', type: 'Adult', age: '', instrument: '' });
  const [slotPanel, setSlotPanel] = useState<SlotPanelState>(null);
  const [panelComment, setPanelComment] = useState('');
  const [panelStatus, setPanelStatus] = useState<SlotStatus>('booked');

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

  // Filter CRM conversations for live auditions (never drops overridden no-show / attended cards)
  const liveAuditionConvs = useMemo(() => {
    return conversations.filter(c =>
      c.pipeline === "Audition Booked" ||
      c.pipeline === "Attended" ||
      statusOverrides[c.id] !== undefined ||
      statusOverrides[`crm-${c.id}`] !== undefined ||
      (c.pipeline === "Lost" && (
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
      const dateKey = getConvDate(c, todayIso);
      const override = statusOverrides[c.id] || statusOverrides[`crm-${c.id}`];

      const isNoResp =
        (c.notes && c.notes.toLowerCase().includes("no response")) ||
        (c.followUpNote && c.followUpNote.toLowerCase().includes("no response"));

      let slotStatus: AuditionStatus = 'booked';
      let attendanceStatus: AttendanceStatus = null;

      if (override) {
        if (override === 'attended') {
          slotStatus = 'attended';
          attendanceStatus = 'confirmed';
        } else if (override === 'no-show') {
          slotStatus = 'no-show';
          attendanceStatus = 'declined';
        } else if (override === 'no-response') {
          slotStatus = 'booked';
          attendanceStatus = 'no-response';
        } else {
          slotStatus = 'booked';
          attendanceStatus = null;
        }
      } else {
        if (c.pipeline === 'Attended') {
          slotStatus = 'attended';
          attendanceStatus = 'confirmed';
        } else if (c.pipeline === 'Lost' || (c.notes && c.notes.toLowerCase().includes('no-show'))) {
          slotStatus = 'no-show';
          attendanceStatus = 'declined';
        } else if (isNoResp) {
          slotStatus = 'booked';
          attendanceStatus = 'no-response';
        } else {
          slotStatus = 'booked';
          attendanceStatus = null;
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
        attendanceStatus,
        phone: c.phone || "",
      };

      if (!result[dateKey]) result[dateKey] = [];
      result[dateKey].push(slot);
    });

    Object.keys(customSlots).forEach(dateKey => {
      if (!result[dateKey]) result[dateKey] = [];
      result[dateKey].push(...(customSlots[dateKey] || []));
    });

    return result;
  }, [liveAuditionConvs, customSlots, todayIso, statusOverrides]);

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
    const newSlot: Slot = {
      id: nextId,
      time: addingSlot.time,
      status: 'free',
      agent: addingSlot.agent || 'Jwana',
    };
    setCustomSlots(prev => ({
      ...prev,
      [addingSlot.dateKey]: [...(prev[addingSlot.dateKey] || []), newSlot],
    }));
    setNextId(n => n + 1);
    setAddingSlot(null);
  };

  const openBooking = (slotId: string | number, dateKey: string, time: string, day: Date) => {
    setBookingModal({ slotId, dateKey, time, dayLabel: formatDayLabel(day) });
    setBookForm({ name: '', type: 'Adult', age: '', instrument: '' });
  };

  const confirmBooking = () => {
    if (!bookingModal) return;
    const { slotId, dateKey } = bookingModal;
    setCustomSlots(prev => ({
      ...prev,
      [dateKey]: (prev[dateKey] || []).map(s =>
        s.id === slotId
          ? {
            ...s,
            name: bookForm.name || 'Student',
            type: `${bookForm.type}${bookForm.age ? ` ${bookForm.age}` : ''} · ${bookForm.instrument || '—'}`,
            status: 'booked',
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
      const targetPipeline =
        status === "attended" ? "Attended" : status === "no-show" ? "Lost" : "Audition Booked";
      const cleanComment = stripNoResponseTag(currentSlot.comment);
      patchConversation(currentSlot.conversationId, {
        pipeline: targetPipeline,
        notes: cleanComment,
      });
      return;
    }

    setCustomSlots(prev => ({
      ...prev,
      [dateKey]: (prev[dateKey] || []).map(s => {
        if (s.id !== slotId) return s;
        const targetAuditionStatus: AuditionStatus =
          status === 'attended' ? 'attended' : status === 'no-show' ? 'no-show' : 'booked';
        const targetAttendance: AttendanceStatus =
          status === 'attended' ? 'confirmed' : status === 'no-show' ? 'declined' : status === 'no-response' ? 'no-response' : null;
        return { ...s, status: targetAuditionStatus, attendanceStatus: targetAttendance };
      }),
    }));
  };

  const openSlotPanel = useCallback((slotId: string | number, dateKey: string) => {
    const slot = (slots[dateKey] || []).find(s => s.id === slotId);
    if (!slot) return;
    setSlotPanel({ slotId, dateKey });
    setPanelComment(stripNoResponseTag(slot.comment || ''));
    const currentStatus: SlotStatus =
      slot.status === 'attended'
        ? 'attended'
        : slot.status === 'no-show'
        ? 'no-show'
        : slot.attendanceStatus === 'no-response'
        ? 'no-response'
        : 'booked';
    setPanelStatus(currentStatus);
  }, [slots]);

  const saveSlotPanel = useCallback(() => {
    if (!slotPanel) return;
    const currentSlot = (slots[slotPanel.dateKey] || []).find(s => s.id === slotPanel.slotId);

    updateStatusOverride(slotPanel.slotId, panelStatus);

    if (currentSlot?.conversationId) {
      if (!isReadOnly) {
        const targetPipeline =
          panelStatus === "attended" ? "Attended" : panelStatus === "no-show" ? "Lost" : "Audition Booked";
        const cleanComment = stripNoResponseTag(panelComment);
        patchConversation(currentSlot.conversationId, {
          pipeline: targetPipeline,
          notes: cleanComment,
          followUpNote: cleanComment,
        });
      }
    } else {
      setCustomSlots(prev => ({
        ...prev,
        [slotPanel.dateKey]: (prev[slotPanel.dateKey] || []).map(s =>
          s.id === slotPanel.slotId
            ? {
              ...s,
              comment: stripNoResponseTag(panelComment),
              status: panelStatus === 'attended' ? 'attended' : panelStatus === 'no-show' ? 'no-show' : 'booked',
              attendanceStatus: panelStatus === 'attended' ? 'confirmed' : panelStatus === 'no-show' ? 'declined' : panelStatus === 'no-response' ? 'no-response' : null,
            }
            : s
        ),
      }));
    }
    setSlotPanel(null);
  }, [slotPanel, slots, panelComment, panelStatus, isReadOnly, patchConversation, updateStatusOverride]);

  const panelSlot = slotPanel ? (slots[slotPanel.dateKey] || []).find(s => s.id === slotPanel.slotId) : null;

  // Dynamic column sizing: expand days with > 5 auditions to 420px so 2-column cards are wide and spacious
  const gridTemplate = useMemo(() => {
    return weekDays.map(day => {
      const count = (slots[isoDate(day)] || []).length;
      return count > 5 ? 'minmax(420px, 2.5fr)' : 'minmax(180px, 1fr)';
    }).join(' ');
  }, [weekDays, slots]);

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

          <select className="h-[28px] text-[11px] rounded-[6px] px-2 outline-none" style={{ background: 'var(--bg-pill)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}>
            <option>Jeddah Hub</option>
            <option>Riyadh Hub</option>
          </select>

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
                const daySlots = slots[key] || [];
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
                const daySlots = slots[key] || [];
                const isAddingHere = addingSlot?.dateKey === key;
                const isMultiCol = daySlots.length > 5;

                // Optimal Real-Time Arrangement (without complex calculation or delay):
                // 1. Pending / No Action at top (highest priority for staff attention)
                // 2. No Response (awaiting client reply)
                // 3. No-Show (marked as did not attend)
                // 4. Attended at the bottom (completed)
                const noActionSlots = daySlots.filter(s => s.status === 'booked' && s.attendanceStatus !== 'no-response');
                const noResponseSlots = daySlots.filter(s => s.status === 'booked' && s.attendanceStatus === 'no-response');
                const noShowSlots = daySlots.filter(s => s.status === 'no-show');
                const attendedSlots = daySlots.filter(s => s.status === 'attended');
                const orderedSlots = [...noActionSlots, ...noResponseSlots, ...noShowSlots, ...attendedSlots];

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
                          isReadOnly={isReadOnly}
                        />
                      ))}
                      {isAddingHere ? (
                        <div className={`rounded-lg p-2 flex flex-col gap-1.5 shadow-sm ${isMultiCol ? 'col-span-2' : ''}`} style={{ border: '1px solid var(--border-input)', background: 'var(--bg-card)' }}>
                          <input type="time" value={addingSlot.time}
                            onChange={e => setAddingSlot(a => a ? { ...a, time: e.target.value } : a)}
                            className="w-full h-[26px] px-2 text-[11px] rounded-[4px] outline-none"
                            style={{ border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)' }} />
                          <input type="text" placeholder="Staff (optional)" value={addingSlot.agent}
                            onChange={e => setAddingSlot(a => a ? { ...a, agent: e.target.value } : a)}
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

            {/* Attendance & Slot status */}
            <div>
              <p className="text-[11px] font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Attendance Status</p>
              <div className="flex flex-col gap-2">
                {ATTENDANCE_OPTIONS.map(opt => {
                  const isActive = panelStatus === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        if (isActive) {
                          setPanelStatus('booked');
                        } else {
                          setPanelStatus(opt.value);
                        }
                      }}
                      className="flex items-center justify-between w-full px-3.5 py-2.5 rounded-xl text-left transition-all cursor-pointer"
                      style={{
                        background: isActive ? opt.bg : 'var(--bg-pill)',
                        border: `1.5px solid ${isActive ? opt.border : 'var(--border-input)'}`,
                        color: isActive ? opt.color : 'var(--text-secondary)',
                        fontWeight: isActive ? 700 : 500,
                      }}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: opt.color }} />
                        <span className="text-[13px]">{opt.label}</span>
                      </div>
                      <span
                        className="text-[11px] px-2 py-0.5 rounded-md font-semibold"
                        style={{
                          background: isActive ? opt.color : 'transparent',
                          color: isActive ? '#fff' : 'var(--text-muted)',
                          border: isActive ? 'none' : '1px solid var(--border-input)',
                        }}
                      >
                        {opt.badge} {isActive ? '✓' : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
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
          <div className="w-full max-w-md rounded-2xl p-5 shadow-2xl flex flex-col gap-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                {bookingModal.dayLabel} · {bookingModal.time}
              </p>
              <h3 className="text-[17px] font-bold mt-0.5" style={{ color: 'var(--text-primary)' }}>Book Audition Slot</h3>
            </div>
            <div className="flex flex-col gap-3">
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
              <button onClick={confirmBooking} className="flex-1 h-[38px] text-[13px] font-semibold text-white rounded-xl cursor-pointer" style={{ background: '#0066FF' }}>
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

function SlotCard({ slot, onBook, onStatusChange, onOpenPanel, onOpenChat, isReadOnly }: {
  slot: Slot;
  onBook: () => void;
  onStatusChange: (s: SlotStatus) => void;
  onOpenPanel: () => void;
  onOpenChat?: () => void;
  isReadOnly?: boolean;
}) {
  if (slot.status === 'free') {
    return (
      <div onClick={!isReadOnly ? onBook : undefined}
        className={`rounded-lg border border-dashed px-2.5 py-2 transition-colors ${!isReadOnly ? "cursor-pointer hover:border-[#0066FF]" : "cursor-default"}`}
        style={{ borderColor: 'var(--border-main)', background: 'var(--bg-card)' }}>
        <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>{slot.time}</span>
        {slot.agent && <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}> · {slot.agent}</span>}
        <p className="text-[10px] mt-0.5 text-blue-500 font-medium">{!isReadOnly ? "Free — click to book" : "Free slot"}</p>
      </div>
    );
  }

  const isNoResponse = slot.attendanceStatus === 'no-response';
  const displayType =
    slot.type &&
    slot.type.trim().toLowerCase() !== slot.comment?.trim().toLowerCase()
      ? slot.type
      : null;

  // Card with No Action or No Response (Pending group)
  if (slot.status === 'booked') {
    return (
      <div
        className={`rounded-lg px-2.5 py-2 shadow-sm ${!isReadOnly ? "cursor-pointer hover:opacity-90 transition-opacity" : ""}`}
        style={{
          background: isNoResponse ? 'rgba(255, 149, 0, 0.08)' : 'var(--bg-selected)',
          border: isNoResponse ? '1px solid rgba(255, 149, 0, 0.3)' : '1px solid var(--border-main)',
        }}
        onClick={!isReadOnly ? onOpenPanel : undefined}
      >
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            <p className="text-[10px] font-bold leading-none mb-0.5" style={{ color: 'var(--text-primary)' }}>{slot.time}</p>
            {slot.name && <p className="text-[11px] font-semibold leading-tight truncate" style={{ color: 'var(--text-primary)' }}>{slot.name}</p>}
            {displayType && <p className="text-[10px] leading-tight" style={{ color: isNoResponse ? '#FF9500' : 'var(--text-secondary)' }}>{displayType}</p>}
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
            {isNoResponse && (
              <span className="text-[8px] font-bold text-[#FF9500] bg-[#FF9500]/15 border border-[#FF9500]/30 px-1.5 py-0.5 rounded-full shrink-0">
                No Response
              </span>
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
        {!isReadOnly && !isNoResponse && (
          <div className="flex items-center gap-1.5 mt-2">
            <button
              onClick={(e) => { e.stopPropagation(); onStatusChange('attended'); }}
              className="text-[9px] font-bold bg-[#34C759] text-white px-2.5 py-0.5 rounded-full hover:opacity-90 whitespace-nowrap cursor-pointer"
            >
              ✓ attended
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onStatusChange('no-show'); }}
              className="text-[9px] font-bold border px-2.5 py-0.5 rounded-full whitespace-nowrap cursor-pointer hover:bg-[#FF3B30]/10"
              style={{ color: '#FF3B30', borderColor: 'rgba(255, 59, 48, 0.3)', background: 'transparent' }}
            >
              no-show
            </button>
          </div>
        )}
      </div>
    );
  }

  // Card with Attended status (bottom group)
  if (slot.status === 'attended') {
    return (
      <div
        className={`rounded-lg bg-[#34C759] px-2.5 py-2 shadow-sm ${!isReadOnly ? "cursor-pointer hover:opacity-95 transition-opacity" : ""}`}
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
          <p className="text-[9px] mt-1 text-white/80 hover:text-white underline decoration-white/40">+ Add note / status</p>
        ) : null}
        <div className="flex flex-wrap gap-1 mt-1.5">
          <span className="text-[8px] font-bold bg-white/30 text-white px-2 py-0.5 rounded-full whitespace-nowrap">✓ attended</span>
        </div>
      </div>
    );
  }

  // Card with No-Show status (middle group)
  return (
    <div
      className={`rounded-lg px-2.5 py-2 shadow-sm ${!isReadOnly ? "cursor-pointer hover:opacity-90 transition-opacity" : ""}`}
      style={{ background: 'rgba(255, 59, 48, 0.1)', border: '1px solid rgba(255, 59, 48, 0.25)' }}
      onClick={!isReadOnly ? onOpenPanel : undefined}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="text-[10px] font-bold leading-none mb-0.5" style={{ color: 'var(--text-primary)' }}>{slot.time}</p>
          {slot.name && <p className="text-[11px] font-semibold leading-tight truncate" style={{ color: 'var(--text-primary)' }}>{slot.name}</p>}
          {displayType && <p className="text-[10px] leading-tight" style={{ color: '#FF3B30' }}>{displayType}</p>}
        </div>
        {onOpenChat && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenChat(); }}
            className="w-5 h-5 flex items-center justify-center rounded text-[#FF3B30] hover:bg-[#FF3B30]/15 transition-colors shrink-0"
            title="Open Chat in Inbox"
          >
            <MessageSquare className="w-3 h-3" />
          </button>
        )}
      </div>
      {slot.comment ? (
        <p className="text-[10px] mt-1.5 leading-snug line-clamp-2 px-1.5 py-0.5 rounded" style={{ color: '#FF3B30', background: 'rgba(255, 59, 48, 0.08)' }}>
          💬 {slot.comment}
        </p>
      ) : !isReadOnly ? (
        <p className="text-[9px] mt-1 text-[#FF3B30]/80 hover:text-[#FF3B30] underline decoration-[#FF3B30]/40">+ Add note / status</p>
      ) : null}
      <div className="flex flex-wrap gap-1 mt-1.5">
        <span className="text-[8px] font-bold bg-[#FF3B30]/15 text-[#FF3B30] px-2 py-0.5 rounded-full whitespace-nowrap">no-show</span>
      </div>
    </div>
  );
}
