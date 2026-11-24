"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  Calendar,
  Check,
  ChevronDown,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  DEFAULT_PIPELINE_TIME_FILTER,
  PIPELINE_STAGE_LIST,
  PIPELINE_STAGE_THEME_TOKENS,
  PIPELINE_TIME_PRESETS,
  countActivePipelineFilters,
  getCampaignsFilterSummary,
  getDefaultCustomDateRange,
  getStagesFilterSummary,
  getTimeFilterSummary,
  isTimeFilterActive,
  toggleMultiSelection,
  type PipelineCampaignOption,
  type PipelineFacetOption,
  type PipelineFilterState,
  type PipelineStage,
  type PipelineTimeFilter,
  type PipelineTimePreset,
} from "../utils/pipelineFilters";

interface PopoverCoords {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

function computePopoverCoords(
  el: HTMLElement | null,
  preferredWidth: number
): PopoverCoords {
  if (!el || typeof window === "undefined") {
    return { top: 100, left: 16, width: preferredWidth, maxHeight: 420 };
  }
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 12;
  const width = Math.min(preferredWidth, Math.max(260, vw - margin * 2));
  const preferredLeft = rect.left;
  const left = Math.max(margin, Math.min(preferredLeft, vw - width - margin));

  const spaceBelow = vh - rect.bottom - margin;
  const spaceAbove = rect.top - margin;
  const openUpward = spaceBelow < 240 && spaceAbove > spaceBelow;
  const availableHeight = openUpward ? spaceAbove : spaceBelow;
  const maxHeight = Math.max(220, Math.min(460, availableHeight - 8));
  const top = openUpward
    ? Math.max(margin, rect.top - maxHeight - 4)
    : rect.bottom + 4;

  return { top, left, width, maxHeight };
}

function useAnchoredPopover(
  open: boolean,
  preferredWidth: number,
  triggerRef: React.RefObject<HTMLButtonElement | null>,
  popoverRef: React.RefObject<HTMLDivElement | null>,
  onClose: () => void
): { coords: PopoverCoords; syncCoords: () => void } {
  const [coords, setCoords] = useState<PopoverCoords>(() => ({
    top: 100,
    left: 16,
    width: preferredWidth,
    maxHeight: 420,
  }));

  const syncCoords = useCallback(() => {
    setCoords(computePopoverCoords(triggerRef.current, preferredWidth));
  }, [triggerRef, preferredWidth]);

  useEffect(() => {
    if (!open) return;

    const reposition = () => {
      setCoords(computePopoverCoords(triggerRef.current, preferredWidth));
    };

    const handleScroll = (e: Event) => {
      const target = e.target as Node | null;
      if (target && popoverRef.current?.contains(target)) return;
      reposition();
    };

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open, preferredWidth, triggerRef, popoverRef, onClose]);

  return { coords, syncCoords };
}

// ─── Time Filter Popover ─────────────────────────────────────────────────────

interface TimeFilterPopoverProps {
  value: PipelineTimeFilter;
  onChange: (next: PipelineTimeFilter) => void;
}

function TimeFilterPopover({ value, onChange }: TimeFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const closePopover = useCallback(() => setOpen(false), []);
  const { coords, syncCoords } = useAnchoredPopover(
    open,
    300,
    triggerRef,
    popoverRef,
    closePopover
  );
  const summary = useMemo(() => getTimeFilterSummary(value), [value]);

  const togglePopover = () => {
    if (open) {
      closePopover();
    } else {
      syncCoords();
      setOpen(true);
    }
  };

  const handleSelectPreset = (preset: PipelineTimePreset) => {
    if (preset === "custom") {
      if (value.startDate || value.endDate) {
        onChange({ ...value, preset: "custom" });
      } else {
        const defaults = getDefaultCustomDateRange();
        onChange({ preset: "custom", ...defaults });
      }
      return;
    }
    onChange({ preset, startDate: "", endDate: "" });
    closePopover();
  };

  return (
    <div className="inline-flex items-center gap-1.5 shrink-0">
      <span
        className="text-[10px] font-bold uppercase tracking-widest"
        style={{ color: "var(--text-muted)" }}
      >
        Time
      </span>
      <div
        className="inline-flex items-center rounded-[6px] overflow-hidden transition-colors"
        style={{
          background: summary.active ? "var(--bg-selected)" : "var(--bg-pill)",
          border:
            summary.active || open
              ? "1px solid var(--bg-banner)"
              : "1px solid var(--border-input)",
          color: summary.active ? "var(--bg-banner)" : "var(--text-primary)",
        }}
      >
        <button
          ref={triggerRef}
          type="button"
          onClick={togglePopover}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label="Filter leads by time period"
          title={summary.title}
          className="h-[28px] max-w-[185px] px-2.5 text-[11px] font-medium flex items-center gap-1.5 cursor-pointer transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--bg-banner)]"
        >
          <Calendar className="w-3.5 h-3.5 shrink-0 opacity-75" />
          <span className="truncate">{summary.label}</span>
          <ChevronDown
            className={`w-3.5 h-3.5 shrink-0 opacity-70 transition-transform duration-150 ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>

        {summary.active && (
          <button
            type="button"
            onClick={() => {
              onChange(DEFAULT_PIPELINE_TIME_FILTER);
              closePopover();
            }}
            aria-label="Clear time filter"
            title="Clear time filter"
            className="h-[28px] px-2 flex items-center justify-center hover:opacity-75 cursor-pointer"
            style={{ borderInlineStart: "1px solid var(--border-input)" }}
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Filter leads by time period"
          className="fixed z-[200] rounded-xl flex flex-col overflow-hidden shadow-xl"
          style={{
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            maxHeight: `${coords.maxHeight}px`,
            background: "var(--bg-card)",
            border: "1px solid var(--border-main)",
          }}
        >
          <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-[var(--border-main)]">
            {PIPELINE_TIME_PRESETS.map((opt) => {
              const active = value.preset === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelectPreset(opt.id)}
                  className="w-full min-h-[36px] px-3.5 py-2 text-start text-[12px] flex items-center justify-between gap-2 cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
                  style={{
                    background: active ? "var(--bg-selected)" : undefined,
                    color: active ? "var(--bg-banner)" : "var(--text-primary)",
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  <span>{opt.label}</span>
                  {active && (
                    <Check
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: "var(--bg-banner)" }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {value.preset === "custom" && (
            <div
              className="p-3 space-y-2.5 shrink-0"
              style={{
                background: "var(--bg-panel)",
                borderTop: "1px solid var(--border-main)",
              }}
            >
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label
                    htmlFor="pipeline-time-from"
                    className="block text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    From
                  </label>
                  <input
                    id="pipeline-time-from"
                    type="date"
                    value={value.startDate}
                    onChange={(e) => {
                      const nextStart = e.target.value;
                      onChange({
                        preset: "custom",
                        startDate: nextStart,
                        endDate:
                          value.endDate && nextStart && nextStart > value.endDate
                            ? nextStart
                            : value.endDate,
                      });
                    }}
                    className="w-full h-[32px] px-2 rounded-[6px] text-[12px] outline-none cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--bg-banner)]"
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-input)",
                      color: "var(--text-primary)",
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="pipeline-time-to"
                    className="block text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    To
                  </label>
                  <input
                    id="pipeline-time-to"
                    type="date"
                    value={value.endDate}
                    onChange={(e) => {
                      const nextEnd = e.target.value;
                      onChange({
                        preset: "custom",
                        startDate:
                          value.startDate && nextEnd && nextEnd < value.startDate
                            ? nextEnd
                            : value.startDate,
                        endDate: nextEnd,
                      });
                    }}
                    className="w-full h-[32px] px-2 rounded-[6px] text-[12px] outline-none cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--bg-banner)]"
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-input)",
                      color: "var(--text-primary)",
                    }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    onChange(DEFAULT_PIPELINE_TIME_FILTER);
                    closePopover();
                  }}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-[6px] cursor-pointer hover:bg-[var(--bg-hover)]"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={closePopover}
                  className="text-[11px] font-semibold px-3 py-1 rounded-[6px] text-white cursor-pointer hover:opacity-90"
                  style={{ background: "var(--bg-banner)" }}
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Multi-Select Searchable Campaigns Filter Popover ────────────────────────

interface CampaignsFilterPopoverProps {
  selected: ReadonlyArray<string>;
  options: ReadonlyArray<PipelineCampaignOption>;
  totalCount: number;
  onChange: (next: string[]) => void;
}

function CampaignsFilterPopover({
  selected,
  options,
  totalCount,
  onChange,
}: CampaignsFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const closePopover = useCallback(() => {
    setOpen(false);
    setSearch("");
  }, []);

  const { coords, syncCoords } = useAnchoredPopover(
    open,
    440,
    triggerRef,
    popoverRef,
    closePopover
  );

  const togglePopover = () => {
    if (open) {
      closePopover();
    } else {
      syncCoords();
      setOpen(true);
    }
  };

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => searchInputRef.current?.focus(), 25);
    return () => clearTimeout(timer);
  }, [open]);

  const summary = useMemo(
    () => getCampaignsFilterSummary(selected, options, totalCount),
    [selected, options, totalCount]
  );

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const query = search.trim().toLowerCase();

  const filteredOptions = useMemo(() => {
    if (!query) return options;
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(query) ||
        opt.fullValue.toLowerCase().includes(query)
    );
  }, [options, query]);

  return (
    <div className="inline-flex items-center gap-1.5 shrink-0">
      <span
        className="text-[10px] font-bold uppercase tracking-widest"
        style={{ color: "var(--text-muted)" }}
      >
        Campaigns
      </span>
      <div
        className="inline-flex items-center rounded-[6px] overflow-hidden transition-colors"
        style={{
          background: summary.active ? "var(--bg-selected)" : "var(--bg-pill)",
          border:
            summary.active || open
              ? "1px solid var(--bg-banner)"
              : "1px solid var(--border-input)",
          color: summary.active ? "var(--bg-banner)" : "var(--text-primary)",
        }}
      >
        <button
          ref={triggerRef}
          type="button"
          onClick={togglePopover}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label="Filter leads by campaign"
          title={summary.title}
          className="h-[28px] max-w-[205px] px-2.5 text-[11px] font-medium flex items-center gap-1.5 cursor-pointer transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--bg-banner)]"
        >
          <span className="truncate">{summary.label}</span>
          <ChevronDown
            className={`w-3.5 h-3.5 shrink-0 opacity-70 transition-transform duration-150 ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>

        {summary.active && (
          <button
            type="button"
            onClick={() => {
              onChange([]);
              closePopover();
            }}
            aria-label="Clear campaign filter"
            title="Clear campaign filter"
            className="h-[28px] px-2 flex items-center justify-center hover:opacity-75 cursor-pointer"
            style={{ borderInlineStart: "1px solid var(--border-input)" }}
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Filter leads by campaigns"
          className="fixed z-[200] rounded-xl flex flex-col overflow-hidden shadow-xl"
          style={{
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            maxHeight: `${coords.maxHeight}px`,
            background: "var(--bg-card)",
            border: "1px solid var(--border-main)",
          }}
        >
          {/* Search */}
          <div
            className="p-2 shrink-0"
            style={{ borderBottom: "1px solid var(--border-main)" }}
          >
            <div
              className="flex items-center gap-2 rounded-lg px-2.5 h-[32px] transition-colors focus-within:border-[var(--bg-banner)]"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-input)",
              }}
            >
              <Search
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: "var(--text-muted)" }}
              />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search campaigns..."
                aria-label="Search campaigns"
                className="w-full min-w-0 bg-transparent text-[12px] outline-none"
                style={{ color: "var(--text-primary)" }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear campaign search"
                  className="p-0.5 shrink-0 hover:opacity-80 cursor-pointer"
                  style={{ color: "var(--text-muted)" }}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Options list */}
          <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-[var(--border-main)]">
            {!query && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full min-h-[36px] px-3.5 py-2 text-start text-[12px] flex items-center justify-between gap-3 cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
                style={{
                  background:
                    selected.length === 0 ? "var(--bg-selected)" : undefined,
                  color:
                    selected.length === 0
                      ? "var(--bg-banner)"
                      : "var(--text-primary)",
                  fontWeight: 600,
                }}
              >
                <span>All campaigns</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <span
                    className="text-[11px] font-semibold tabular-nums"
                    style={{
                      color:
                        selected.length === 0
                          ? "var(--bg-banner)"
                          : "var(--text-secondary)",
                    }}
                  >
                    ({totalCount})
                  </span>
                  {selected.length === 0 && (
                    <Check
                      className="w-3.5 h-3.5"
                      style={{ color: "var(--bg-banner)" }}
                    />
                  )}
                </span>
              </button>
            )}

            {filteredOptions.length === 0 ? (
              <p
                className="text-[12px] text-center py-6 px-3"
                style={{ color: "var(--text-muted)" }}
              >
                No campaigns match &ldquo;{search.trim()}&rdquo;.
              </p>
            ) : (
              filteredOptions.map((opt) => {
                const checked = selectedSet.has(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    title={opt.fullValue}
                    onClick={() => onChange(toggleMultiSelection(selected, opt.value))}
                    className="w-full min-h-[36px] px-3.5 py-2 text-start text-[12px] flex items-start justify-between gap-3 cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
                    style={{
                      background: checked ? "var(--bg-selected)" : undefined,
                      color: checked ? "var(--bg-banner)" : "var(--text-primary)",
                      fontWeight: checked ? 600 : 500,
                    }}
                  >
                    <span className="flex items-start gap-2.5 min-w-0 flex-1">
                      <span
                        aria-hidden="true"
                        className="mt-0.5 w-4 h-4 rounded-[4px] flex items-center justify-center shrink-0 transition-colors"
                        style={{
                          background: checked ? "var(--bg-banner)" : "var(--bg-card)",
                          border: checked
                            ? "1px solid var(--bg-banner)"
                            : "1px solid var(--border-input)",
                        }}
                      >
                        {checked && <Check className="w-3 h-3 text-white" />}
                      </span>
                      <span className="min-w-0 flex-1 break-words leading-snug">
                        {opt.label}
                      </span>
                    </span>
                    <span
                      className="text-[11px] font-semibold tabular-nums shrink-0 mt-0.5"
                      style={{
                        color: checked
                          ? "var(--bg-banner)"
                          : "var(--text-secondary)",
                      }}
                    >
                      ({opt.count})
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {selected.length > 0 && (
            <div
              className="px-3.5 py-2 flex items-center justify-between gap-2 shrink-0"
              style={{
                background: "var(--bg-panel)",
                borderTop: "1px solid var(--border-main)",
              }}
            >
              <span
                className="text-[11px] font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                {selected.length} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="text-[11px] font-semibold px-2 py-1 rounded-[6px] cursor-pointer hover:bg-[var(--bg-hover)]"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={closePopover}
                  className="text-[11px] font-semibold px-3 py-1 rounded-[6px] text-white cursor-pointer hover:opacity-90"
                  style={{ background: "var(--bg-banner)" }}
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Multi-Select Stage Filter Popover (Table View) ──────────────────────────

interface StageFilterPopoverProps {
  selected: ReadonlyArray<PipelineStage>;
  stageCounts: Record<PipelineStage, number>;
  totalCount: number;
  onChange: (next: PipelineStage[]) => void;
}

function StageFilterPopover({
  selected,
  stageCounts,
  totalCount,
  onChange,
}: StageFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const closePopover = useCallback(() => setOpen(false), []);
  const { coords, syncCoords } = useAnchoredPopover(
    open,
    270,
    triggerRef,
    popoverRef,
    closePopover
  );

  const togglePopover = () => {
    if (open) {
      closePopover();
    } else {
      syncCoords();
      setOpen(true);
    }
  };

  const summary = useMemo(
    () => getStagesFilterSummary(selected, stageCounts, totalCount),
    [selected, stageCounts, totalCount]
  );
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  return (
    <div className="inline-flex items-center gap-1.5 shrink-0">
      <span
        className="text-[10px] font-bold uppercase tracking-widest"
        style={{ color: "var(--text-muted)" }}
      >
        Stage
      </span>
      <div
        className="inline-flex items-center rounded-[6px] overflow-hidden transition-colors"
        style={{
          background: summary.active ? "var(--bg-selected)" : "var(--bg-pill)",
          border:
            summary.active || open
              ? "1px solid var(--bg-banner)"
              : "1px solid var(--border-input)",
          color: summary.active ? "var(--bg-banner)" : "var(--text-primary)",
        }}
      >
        <button
          ref={triggerRef}
          type="button"
          onClick={togglePopover}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label="Filter leads by stage"
          title={summary.title}
          className="h-[28px] max-w-[185px] px-2.5 text-[11px] font-medium flex items-center gap-1.5 cursor-pointer transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--bg-banner)]"
        >
          <span className="truncate">{summary.label}</span>
          <ChevronDown
            className={`w-3.5 h-3.5 shrink-0 opacity-70 transition-transform duration-150 ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>

        {summary.active && (
          <button
            type="button"
            onClick={() => {
              onChange([]);
              closePopover();
            }}
            aria-label="Clear stage filter"
            title="Clear stage filter"
            className="h-[28px] px-2 flex items-center justify-center hover:opacity-75 cursor-pointer"
            style={{ borderInlineStart: "1px solid var(--border-input)" }}
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Filter leads by stage"
          className="fixed z-[200] rounded-xl flex flex-col overflow-hidden shadow-xl"
          style={{
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            maxHeight: `${coords.maxHeight}px`,
            background: "var(--bg-card)",
            border: "1px solid var(--border-main)",
          }}
        >
          <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-[var(--border-main)]">
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full min-h-[36px] px-3.5 py-2 text-start text-[12px] flex items-center justify-between gap-2 cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
              style={{
                background:
                  selected.length === 0 ? "var(--bg-selected)" : undefined,
                color:
                  selected.length === 0
                    ? "var(--bg-banner)"
                    : "var(--text-primary)",
                fontWeight: 600,
              }}
            >
              <span>All stages</span>
              <span className="flex items-center gap-1.5 shrink-0">
                <span
                  className="text-[11px] font-semibold tabular-nums"
                  style={{
                    color:
                      selected.length === 0
                        ? "var(--bg-banner)"
                        : "var(--text-secondary)",
                  }}
                >
                  ({totalCount})
                </span>
                {selected.length === 0 && (
                  <Check
                    className="w-3.5 h-3.5"
                    style={{ color: "var(--bg-banner)" }}
                  />
                )}
              </span>
            </button>

            {PIPELINE_STAGE_LIST.map((stage) => {
              const checked = selectedSet.has(stage);
              const tokens = PIPELINE_STAGE_THEME_TOKENS[stage];
              const count = stageCounts[stage] ?? 0;
              return (
                <button
                  key={stage}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => onChange(toggleMultiSelection(selected, stage))}
                  className="w-full min-h-[36px] px-3.5 py-2 text-start text-[12px] flex items-center justify-between gap-2 cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
                  style={{
                    background: checked ? "var(--bg-selected)" : undefined,
                    color: checked ? "var(--bg-banner)" : "var(--text-primary)",
                    fontWeight: checked ? 600 : 500,
                  }}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      aria-hidden="true"
                      className="w-4 h-4 rounded-[4px] flex items-center justify-center shrink-0 transition-colors"
                      style={{
                        background: checked ? "var(--bg-banner)" : "var(--bg-card)",
                        border: checked
                          ? "1px solid var(--bg-banner)"
                          : "1px solid var(--border-input)",
                      }}
                    >
                      {checked && <Check className="w-3 h-3 text-white" />}
                    </span>
                    <span
                      aria-hidden="true"
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: tokens.dot }}
                    />
                    <span className="truncate">{stage}</span>
                  </span>
                  <span
                    className="text-[11px] font-semibold tabular-nums shrink-0"
                    style={{
                      color: checked
                        ? "var(--bg-banner)"
                        : "var(--text-secondary)",
                    }}
                  >
                    ({count})
                  </span>
                </button>
              );
            })}
          </div>

          {selected.length > 0 && (
            <div
              className="px-3.5 py-2 flex items-center justify-between gap-2 shrink-0"
              style={{
                background: "var(--bg-panel)",
                borderTop: "1px solid var(--border-main)",
              }}
            >
              <span
                className="text-[11px] font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                {selected.length} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="text-[11px] font-semibold px-2 py-1 rounded-[6px] cursor-pointer hover:bg-[var(--bg-hover)]"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={closePopover}
                  className="text-[11px] font-semibold px-3 py-1 rounded-[6px] text-white cursor-pointer hover:opacity-90"
                  style={{ background: "var(--bg-banner)" }}
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Compact Select Filter (Agent / Source) ──────────────────────────────────

function SelectFilterControl({
  id,
  label,
  value,
  defaultValue,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  defaultValue: string;
  options: ReadonlyArray<PipelineFacetOption>;
  onChange: (value: string) => void;
}) {
  const isFiltered = value !== defaultValue;
  return (
    <div className="inline-flex items-center gap-1.5 shrink-0">
      <label
        htmlFor={id}
        className="text-[10px] font-bold uppercase tracking-widest"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-[28px] text-[11px] font-medium rounded-[6px] px-2 outline-none cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--bg-banner)]"
        style={{
          background: isFiltered ? "var(--bg-selected)" : "var(--bg-pill)",
          border: isFiltered
            ? "1px solid var(--bg-banner)"
            : "1px solid var(--border-input)",
          color: isFiltered ? "var(--bg-banner)" : "var(--text-primary)",
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── Mobile Filters Bottom Sheet ─────────────────────────────────────────────

interface MobileFiltersSheetProps {
  open: boolean;
  showStageFilter: boolean;
  filterState: PipelineFilterState;
  campaignOptions: ReadonlyArray<PipelineCampaignOption>;
  campaignTotal: number;
  stageCounts: Record<PipelineStage, number>;
  stageTotal: number;
  agentOptions: ReadonlyArray<PipelineFacetOption>;
  sourceOptions: ReadonlyArray<PipelineFacetOption>;
  matchedCount: number;
  onClose: () => void;
  onChangeTime: (next: PipelineTimeFilter) => void;
  onChangeCampaigns: (next: string[]) => void;
  onChangeStages: (next: PipelineStage[]) => void;
  onChangeAgent: (next: string) => void;
  onChangeSource: (next: string) => void;
  onClearAll: () => void;
}

function MobileFiltersSheet({
  open,
  showStageFilter,
  filterState,
  campaignOptions,
  campaignTotal,
  stageCounts,
  stageTotal,
  agentOptions,
  sourceOptions,
  matchedCount,
  onClose,
  onChangeTime,
  onChangeCampaigns,
  onChangeStages,
  onChangeAgent,
  onChangeSource,
  onClearAll,
}: MobileFiltersSheetProps) {
  const [campaignQuery, setCampaignQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const selectedCampaignSet = useMemo(
    () => new Set(filterState.campaigns),
    [filterState.campaigns]
  );
  const selectedStageSet = useMemo(
    () => new Set(filterState.stages),
    [filterState.stages]
  );

  const filteredCampaigns = useMemo(() => {
    const q = campaignQuery.trim().toLowerCase();
    if (!q) return campaignOptions;
    return campaignOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        opt.fullValue.toLowerCase().includes(q)
    );
  }, [campaignOptions, campaignQuery]);

  if (!open) return null;

  const activeCount = countActivePipelineFilters(filterState, showStageFilter);

  return (
    <div
      className="fixed inset-0 z-[150] md:hidden flex items-end bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Pipeline filters"
      onClick={onClose}
    >
      <div
        className="w-full max-h-[88dvh] rounded-t-2xl flex flex-col overflow-hidden shadow-2xl"
        style={{
          background: "var(--bg-card)",
          borderTop: "1px solid var(--border-main)",
          color: "var(--text-primary)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-4 py-3 flex items-center justify-between shrink-0"
          style={{ borderBottom: "1px solid var(--border-main)" }}
        >
          <div className="flex items-center gap-2">
            <SlidersHorizontal
              className="w-4 h-4"
              style={{ color: "var(--bg-banner)" }}
            />
            <h2 className="text-[15px] font-bold">Filters</h2>
            {activeCount > 0 && (
              <span
                className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{
                  background: "var(--bg-selected)",
                  color: "var(--bg-banner)",
                }}
              >
                {activeCount}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="min-w-[44px] min-h-[44px] -me-2 flex items-center justify-center rounded-lg cursor-pointer"
            style={{ color: "var(--text-secondary)" }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable filter sections */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-5">
          {/* Time */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3
                className="text-[11px] font-bold uppercase tracking-wider"
                style={{ color: "var(--text-secondary)" }}
              >
                Time
              </h3>
              {isTimeFilterActive(filterState.time) && (
                <button
                  type="button"
                  onClick={() => onChangeTime(DEFAULT_PIPELINE_TIME_FILTER)}
                  className="text-[12px] font-semibold cursor-pointer"
                  style={{ color: "var(--bg-banner)" }}
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {PIPELINE_TIME_PRESETS.map((opt) => {
                const active = filterState.time.preset === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      if (opt.id === "custom") {
                        if (
                          filterState.time.startDate ||
                          filterState.time.endDate
                        ) {
                          onChangeTime({ ...filterState.time, preset: "custom" });
                        } else {
                          onChangeTime({
                            preset: "custom",
                            ...getDefaultCustomDateRange(),
                          });
                        }
                        return;
                      }
                      onChangeTime({ preset: opt.id, startDate: "", endDate: "" });
                    }}
                    className="min-h-[44px] px-3 rounded-lg text-[13px] font-medium cursor-pointer transition-colors"
                    style={{
                      background: active ? "var(--bg-selected)" : "var(--bg-pill)",
                      border: active
                        ? "1px solid var(--bg-banner)"
                        : "1px solid var(--border-input)",
                      color: active ? "var(--bg-banner)" : "var(--text-primary)",
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {filterState.time.preset === "custom" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <div className="space-y-1">
                  <label
                    htmlFor="mobile-time-from"
                    className="block text-[12px] font-medium"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    From date
                  </label>
                  <input
                    id="mobile-time-from"
                    type="date"
                    value={filterState.time.startDate}
                    onChange={(e) => {
                      const nextStart = e.target.value;
                      onChangeTime({
                        preset: "custom",
                        startDate: nextStart,
                        endDate:
                          filterState.time.endDate &&
                          nextStart &&
                          nextStart > filterState.time.endDate
                            ? nextStart
                            : filterState.time.endDate,
                      });
                    }}
                    className="w-full min-h-[44px] px-3 rounded-lg text-base outline-none"
                    style={{
                      background: "var(--bg-input)",
                      border: "1px solid var(--border-input)",
                      color: "var(--text-primary)",
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="mobile-time-to"
                    className="block text-[12px] font-medium"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    To date
                  </label>
                  <input
                    id="mobile-time-to"
                    type="date"
                    value={filterState.time.endDate}
                    onChange={(e) => {
                      const nextEnd = e.target.value;
                      onChangeTime({
                        preset: "custom",
                        startDate:
                          filterState.time.startDate &&
                          nextEnd &&
                          nextEnd < filterState.time.startDate
                            ? nextEnd
                            : filterState.time.startDate,
                        endDate: nextEnd,
                      });
                    }}
                    className="w-full min-h-[44px] px-3 rounded-lg text-base outline-none"
                    style={{
                      background: "var(--bg-input)",
                      border: "1px solid var(--border-input)",
                      color: "var(--text-primary)",
                    }}
                  />
                </div>
              </div>
            )}
          </section>

          {/* Stage (Table view) */}
          {showStageFilter && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3
                  className="text-[11px] font-bold uppercase tracking-wider"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Stage
                </h3>
                {filterState.stages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onChangeStages([])}
                    className="text-[12px] font-semibold cursor-pointer"
                    style={{ color: "var(--bg-banner)" }}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-pressed={filterState.stages.length === 0}
                  onClick={() => onChangeStages([])}
                  className="min-h-[44px] px-3 rounded-lg text-[13px] font-semibold cursor-pointer transition-colors"
                  style={{
                    background:
                      filterState.stages.length === 0
                        ? "var(--bg-selected)"
                        : "var(--bg-pill)",
                    border:
                      filterState.stages.length === 0
                        ? "1px solid var(--bg-banner)"
                        : "1px solid var(--border-input)",
                    color:
                      filterState.stages.length === 0
                        ? "var(--bg-banner)"
                        : "var(--text-primary)",
                  }}
                >
                  All ({stageTotal})
                </button>
                {PIPELINE_STAGE_LIST.map((stage) => {
                  const active = selectedStageSet.has(stage);
                  const tokens = PIPELINE_STAGE_THEME_TOKENS[stage];
                  return (
                    <button
                      key={stage}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        onChangeStages(toggleMultiSelection(filterState.stages, stage))
                      }
                      className="min-h-[44px] px-3 rounded-lg text-[13px] font-medium inline-flex items-center gap-2 cursor-pointer transition-colors"
                      style={{
                        background: active ? tokens.bg : "var(--bg-pill)",
                        border: active
                          ? `1px solid ${tokens.border}`
                          : "1px solid var(--border-input)",
                        color: active ? tokens.text : "var(--text-primary)",
                      }}
                    >
                      <span
                        aria-hidden="true"
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: tokens.dot }}
                      />
                      <span>{stage}</span>
                      <span className="text-[12px] tabular-nums opacity-80">
                        {stageCounts[stage] ?? 0}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Campaigns */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3
                className="text-[11px] font-bold uppercase tracking-wider"
                style={{ color: "var(--text-secondary)" }}
              >
                Campaigns ({campaignTotal})
              </h3>
              {filterState.campaigns.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChangeCampaigns([])}
                  className="text-[12px] font-semibold cursor-pointer"
                  style={{ color: "var(--bg-banner)" }}
                >
                  Clear ({filterState.campaigns.length})
                </button>
              )}
            </div>

            <div
              className="flex items-center gap-2 rounded-lg px-3 min-h-[44px]"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-input)",
              }}
            >
              <Search
                className="w-4 h-4 shrink-0"
                style={{ color: "var(--text-muted)" }}
              />
              <input
                type="text"
                value={campaignQuery}
                onChange={(e) => setCampaignQuery(e.target.value)}
                placeholder="Search campaigns..."
                aria-label="Search campaigns"
                className="w-full min-w-0 bg-transparent text-base outline-none"
                style={{ color: "var(--text-primary)" }}
              />
              {campaignQuery && (
                <button
                  type="button"
                  onClick={() => setCampaignQuery("")}
                  aria-label="Clear campaign search"
                  className="p-1.5 cursor-pointer"
                  style={{ color: "var(--text-muted)" }}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div
              className="rounded-xl overflow-hidden max-h-[220px] overflow-y-auto divide-y divide-[var(--border-main)]"
              style={{ border: "1px solid var(--border-main)" }}
            >
              {filteredCampaigns.length === 0 ? (
                <p
                  className="text-[13px] text-center py-5 px-3"
                  style={{ color: "var(--text-muted)" }}
                >
                  No campaigns match &ldquo;{campaignQuery.trim()}&rdquo;.
                </p>
              ) : (
                filteredCampaigns.map((opt) => {
                  const checked = selectedCampaignSet.has(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() =>
                        onChangeCampaigns(
                          toggleMultiSelection(filterState.campaigns, opt.value)
                        )
                      }
                      className="w-full min-h-[44px] px-3 py-2.5 text-start text-[13px] flex items-center justify-between gap-2.5 cursor-pointer"
                      style={{
                        background: checked ? "var(--bg-selected)" : "var(--bg-card)",
                        color: checked ? "var(--bg-banner)" : "var(--text-primary)",
                        fontWeight: checked ? 600 : 500,
                      }}
                    >
                      <span className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span
                          aria-hidden="true"
                          className="w-4 h-4 rounded-[4px] flex items-center justify-center shrink-0"
                          style={{
                            background: checked
                              ? "var(--bg-banner)"
                              : "var(--bg-card)",
                            border: checked
                              ? "1px solid var(--bg-banner)"
                              : "1px solid var(--border-input)",
                          }}
                        >
                          {checked && <Check className="w-3 h-3 text-white" />}
                        </span>
                        <span className="break-words leading-snug">{opt.label}</span>
                      </span>
                      <span
                        className="text-[12px] font-semibold tabular-nums shrink-0"
                        style={{
                          color: checked
                            ? "var(--bg-banner)"
                            : "var(--text-secondary)",
                        }}
                      >
                        ({opt.count})
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          {/* Agent & Source */}
          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1.5">
              <label
                htmlFor="mobile-filter-agent"
                className="block text-[11px] font-bold uppercase tracking-wider"
                style={{ color: "var(--text-secondary)" }}
              >
                Agent
              </label>
              <select
                id="mobile-filter-agent"
                value={filterState.agent}
                onChange={(e) => onChangeAgent(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-lg text-base outline-none cursor-pointer"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-input)",
                  color: "var(--text-primary)",
                }}
              >
                {agentOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="mobile-filter-source"
                className="block text-[11px] font-bold uppercase tracking-wider"
                style={{ color: "var(--text-secondary)" }}
              >
                Source
              </label>
              <select
                id="mobile-filter-source"
                value={filterState.source}
                onChange={(e) => onChangeSource(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-lg text-base outline-none cursor-pointer"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-input)",
                  color: "var(--text-primary)",
                }}
              >
                {sourceOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Sticky footer */}
        <div
          className="px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center gap-2.5 shrink-0"
          style={{
            background: "var(--bg-panel)",
            borderTop: "1px solid var(--border-main)",
          }}
        >
          <button
            type="button"
            disabled={activeCount === 0}
            onClick={onClearAll}
            className="min-h-[44px] px-4 rounded-xl text-[13px] font-semibold cursor-pointer disabled:opacity-40"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-input)",
              color: "var(--text-primary)",
            }}
          >
            Reset
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[44px] px-4 rounded-xl text-[13px] font-semibold text-white cursor-pointer hover:opacity-90"
            style={{ background: "var(--bg-banner)" }}
          >
            Show {matchedCount} {matchedCount === 1 ? "lead" : "leads"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Unified Pipeline Filter Toolbar + Table Stage Quick-Filter Bar ──────────

export interface PipelineFilterBarProps {
  view: "pipeline" | "table";
  filterState: PipelineFilterState;
  campaignOptions: ReadonlyArray<PipelineCampaignOption>;
  campaignTotal: number;
  stageCounts: Record<PipelineStage, number>;
  stageTotal: number;
  agentOptions: ReadonlyArray<PipelineFacetOption>;
  sourceOptions: ReadonlyArray<PipelineFacetOption>;
  matchedCount: number;
  onChangeTime: (next: PipelineTimeFilter) => void;
  onChangeCampaigns: (next: string[]) => void;
  onChangeStages: (next: PipelineStage[]) => void;
  onChangeAgent: (next: string) => void;
  onChangeSource: (next: string) => void;
  onClearAll: () => void;
}

export const PipelineFilterBar = React.memo(function PipelineFilterBar({
  view,
  filterState,
  campaignOptions,
  campaignTotal,
  stageCounts,
  stageTotal,
  agentOptions,
  sourceOptions,
  matchedCount,
  onChangeTime,
  onChangeCampaigns,
  onChangeStages,
  onChangeAgent,
  onChangeSource,
  onClearAll,
}: PipelineFilterBarProps) {
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const showStageFilter = view === "table";

  const activeCount = useMemo(
    () => countActivePipelineFilters(filterState, showStageFilter),
    [filterState, showStageFilter]
  );

  const timeSummary = useMemo(
    () => getTimeFilterSummary(filterState.time),
    [filterState.time]
  );
  const campaignSummary = useMemo(
    () =>
      getCampaignsFilterSummary(
        filterState.campaigns,
        campaignOptions,
        campaignTotal
      ),
    [filterState.campaigns, campaignOptions, campaignTotal]
  );
  const stageSummary = useMemo(
    () =>
      getStagesFilterSummary(filterState.stages, stageCounts, stageTotal),
    [filterState.stages, stageCounts, stageTotal]
  );
  const selectedStageSet = useMemo(
    () => new Set(filterState.stages),
    [filterState.stages]
  );

  return (
    <>
      {/* Desktop / Tablet Filter Bar (md+) */}
      <div
        className="hidden md:flex px-4 md:px-6 py-2 items-center gap-3 overflow-x-auto flex-nowrap shrink-0"
        style={{
          background: "var(--bg-card)",
          borderBottom: "1px solid var(--border-main)",
        }}
      >
        <TimeFilterPopover value={filterState.time} onChange={onChangeTime} />
        <CampaignsFilterPopover
          selected={filterState.campaigns}
          options={campaignOptions}
          totalCount={campaignTotal}
          onChange={onChangeCampaigns}
        />
        {showStageFilter && (
          <StageFilterPopover
            selected={filterState.stages}
            stageCounts={stageCounts}
            totalCount={stageTotal}
            onChange={onChangeStages}
          />
        )}
        <SelectFilterControl
          id="pipeline-filter-agent"
          label="Agent"
          value={filterState.agent}
          defaultValue="Everyone"
          options={agentOptions}
          onChange={onChangeAgent}
        />
        <SelectFilterControl
          id="pipeline-filter-source"
          label="Source"
          value={filterState.source}
          defaultValue="All sources"
          options={sourceOptions}
          onChange={onChangeSource}
        />
      </div>

      {/* Table View Stage Quick-Filter Bar (md+) — matches Kanban Row 3 rhythm */}
      {showStageFilter && (
        <div
          className="hidden md:flex px-4 md:px-6 py-2 items-center gap-1.5 overflow-x-auto flex-nowrap shrink-0"
          style={{
            background: "var(--bg-card)",
            borderBottom: "1px solid var(--border-main)",
          }}
        >
          <span
            className="text-[10px] font-bold tracking-widest me-1.5 uppercase shrink-0"
            style={{ color: "var(--text-muted)" }}
          >
            Stages
          </span>
          <button
            type="button"
            aria-pressed={filterState.stages.length === 0}
            onClick={() => onChangeStages([])}
            className={`text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors shrink-0 cursor-pointer ${
              filterState.stages.length === 0 ? "text-white" : ""
            }`}
            style={
              filterState.stages.length === 0
                ? { background: "var(--bg-banner)" }
                : {
                    background: "var(--bg-pill)",
                    color: "var(--text-secondary)",
                  }
            }
          >
            All <span className="tabular-nums opacity-85">{stageTotal}</span>
          </button>
          {PIPELINE_STAGE_LIST.map((stage) => {
            const active = selectedStageSet.has(stage);
            const tokens = PIPELINE_STAGE_THEME_TOKENS[stage];
            const count = stageCounts[stage] ?? 0;
            return (
              <button
                key={stage}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  onChangeStages(toggleMultiSelection(filterState.stages, stage))
                }
                className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors shrink-0 cursor-pointer"
                style={
                  active
                    ? {
                        background: tokens.bg,
                        color: tokens.text,
                        border: `1px solid ${tokens.border}`,
                        fontWeight: 600,
                      }
                    : {
                        background: "var(--bg-pill)",
                        color: "var(--text-secondary)",
                        border: "1px solid transparent",
                      }
                }
              >
                <span
                  aria-hidden="true"
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: tokens.dot }}
                />
                <span>{stage}</span>
                <span className="tabular-nums opacity-80">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Mobile Compact Filter Trigger + Active Filter Chips (< md) */}
      <div
        className="flex md:hidden px-4 py-2 items-center gap-2 overflow-x-auto flex-nowrap shrink-0"
        style={{
          background: "var(--bg-card)",
          borderBottom: "1px solid var(--border-main)",
        }}
      >
        <button
          type="button"
          onClick={() => setMobileSheetOpen(true)}
          aria-label="Open filters"
          className="min-h-[44px] px-3 rounded-lg text-[13px] font-semibold inline-flex items-center gap-2 shrink-0 cursor-pointer"
          style={{
            background: activeCount > 0 ? "var(--bg-selected)" : "var(--bg-pill)",
            border:
              activeCount > 0
                ? "1px solid var(--bg-banner)"
                : "1px solid var(--border-input)",
            color: activeCount > 0 ? "var(--bg-banner)" : "var(--text-primary)",
          }}
        >
          <SlidersHorizontal className="w-4 h-4 shrink-0" />
          <span>Filters</span>
          {activeCount > 0 && (
            <span
              className="text-[11px] font-bold px-1.5 py-0.5 rounded-full text-white tabular-nums"
              style={{ background: "var(--bg-banner)" }}
            >
              {activeCount}
            </span>
          )}
        </button>

        {timeSummary.active && (
          <button
            type="button"
            onClick={() => onChangeTime(DEFAULT_PIPELINE_TIME_FILTER)}
            aria-label={`Remove time filter: ${timeSummary.label}`}
            className="min-h-[36px] px-2.5 rounded-full text-[12px] font-medium inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
            style={{
              background: "var(--bg-selected)",
              border: "1px solid var(--bg-banner)",
              color: "var(--bg-banner)",
            }}
          >
            <span className="truncate max-w-[140px]">{timeSummary.label}</span>
            <X className="w-3.5 h-3.5 shrink-0" />
          </button>
        )}

        {campaignSummary.active && (
          <button
            type="button"
            onClick={() => onChangeCampaigns([])}
            aria-label={`Remove campaign filter: ${campaignSummary.label}`}
            className="min-h-[36px] px-2.5 rounded-full text-[12px] font-medium inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
            style={{
              background: "var(--bg-selected)",
              border: "1px solid var(--bg-banner)",
              color: "var(--bg-banner)",
            }}
          >
            <span className="truncate max-w-[140px]">{campaignSummary.label}</span>
            <X className="w-3.5 h-3.5 shrink-0" />
          </button>
        )}

        {showStageFilter && stageSummary.active && (
          <button
            type="button"
            onClick={() => onChangeStages([])}
            aria-label={`Remove stage filter: ${stageSummary.label}`}
            className="min-h-[36px] px-2.5 rounded-full text-[12px] font-medium inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
            style={{
              background: "var(--bg-selected)",
              border: "1px solid var(--bg-banner)",
              color: "var(--bg-banner)",
            }}
          >
            <span className="truncate max-w-[140px]">{stageSummary.label}</span>
            <X className="w-3.5 h-3.5 shrink-0" />
          </button>
        )}

        {filterState.agent !== "Everyone" && (
          <button
            type="button"
            onClick={() => onChangeAgent("Everyone")}
            aria-label={`Remove agent filter: ${filterState.agent}`}
            className="min-h-[36px] px-2.5 rounded-full text-[12px] font-medium inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
            style={{
              background: "var(--bg-selected)",
              border: "1px solid var(--bg-banner)",
              color: "var(--bg-banner)",
            }}
          >
            <span>{filterState.agent}</span>
            <X className="w-3.5 h-3.5 shrink-0" />
          </button>
        )}

        {filterState.source !== "All sources" && (
          <button
            type="button"
            onClick={() => onChangeSource("All sources")}
            aria-label={`Remove source filter: ${filterState.source}`}
            className="min-h-[36px] px-2.5 rounded-full text-[12px] font-medium inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
            style={{
              background: "var(--bg-selected)",
              border: "1px solid var(--bg-banner)",
              color: "var(--bg-banner)",
            }}
          >
            <span>{filterState.source}</span>
            <X className="w-3.5 h-3.5 shrink-0" />
          </button>
        )}
      </div>

      {mobileSheetOpen && (
        <MobileFiltersSheet
          open={mobileSheetOpen}
          showStageFilter={showStageFilter}
          filterState={filterState}
          campaignOptions={campaignOptions}
          campaignTotal={campaignTotal}
          stageCounts={stageCounts}
          stageTotal={stageTotal}
          agentOptions={agentOptions}
          sourceOptions={sourceOptions}
          matchedCount={matchedCount}
          onClose={() => setMobileSheetOpen(false)}
          onChangeTime={onChangeTime}
          onChangeCampaigns={onChangeCampaigns}
          onChangeStages={onChangeStages}
          onChangeAgent={onChangeAgent}
          onChangeSource={onChangeSource}
          onClearAll={onClearAll}
        />
      )}
    </>
  );
});
