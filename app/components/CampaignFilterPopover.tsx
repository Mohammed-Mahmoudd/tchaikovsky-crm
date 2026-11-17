"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { ChevronDown, Search, Check, X } from "lucide-react";
import {
  type CampaignFilterList,
  getSelectedCampaignLabel,
} from "../utils/leadSource";

interface CampaignFilterPopoverProps {
  value: string;
  onChange: (value: string) => void;
  filterList: CampaignFilterList;
}

interface PopoverCoords {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

function computePopoverCoords(el: HTMLElement | null): PopoverCoords {
  if (!el || typeof window === "undefined") {
    return { top: 100, left: 16, width: 540, maxHeight: 460 };
  }
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 12;
  const width = Math.min(540, Math.max(260, vw - margin * 2));
  const left = Math.max(margin, Math.min(rect.right - width, vw - width - margin));

  const spaceBelow = vh - rect.bottom - margin;
  const spaceAbove = rect.top - margin;
  const openUpward = spaceBelow < 240 && spaceAbove > spaceBelow;
  const availableHeight = openUpward ? spaceAbove : spaceBelow;
  const maxHeight = Math.max(220, Math.min(480, availableHeight - 8));
  const top = openUpward
    ? Math.max(margin, rect.top - maxHeight - 4)
    : rect.bottom + 4;

  return { top, left, width, maxHeight };
}

export function CampaignFilterPopover({
  value,
  onChange,
  filterList,
}: CampaignFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [coords, setCoords] = useState<PopoverCoords>({
    top: 100,
    left: 16,
    width: 540,
    maxHeight: 460,
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isFiltered = value !== "All campaigns";
  const selectedInfo = useMemo(
    () => getSelectedCampaignLabel(value, filterList),
    [value, filterList]
  );

  const closePopover = useCallback(() => {
    setOpen(false);
    setSearch("");
  }, []);

  const togglePopover = useCallback(() => {
    if (open) {
      closePopover();
    } else {
      setCoords(computePopoverCoords(triggerRef.current));
      setOpen(true);
    }
  }, [open, closePopover]);

  useEffect(() => {
    if (!open) return;
    const focusTimer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 30);

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        closePopover();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closePopover();
        triggerRef.current?.focus();
      }
    };

    const handleReposition = () => {
      setCoords(computePopoverCoords(triggerRef.current));
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleReposition);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleReposition);
    };
  }, [open, closePopover]);

  const query = search.trim().toLowerCase();

  const filteredOptions = useMemo(() => {
    if (!query) return filterList.options;
    return filterList.options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(query) ||
        opt.value.toLowerCase().includes(query)
    );
  }, [filterList.options, query]);

  const selectOption = useCallback(
    (nextVal: string) => {
      onChange(nextVal);
      closePopover();
    },
    [onChange, closePopover]
  );

  return (
    <div className="inline-flex items-center shrink-0">
      <div
        className="inline-flex items-center rounded-[6px] overflow-hidden"
        style={{
          background: isFiltered ? "var(--bg-selected)" : "var(--bg-pill)",
          border:
            isFiltered || open
              ? "1px solid #0066FF"
              : "1px solid var(--border-input)",
          color: isFiltered ? "#0066FF" : "var(--text-primary)",
        }}
      >
        <button
          ref={triggerRef}
          type="button"
          onClick={togglePopover}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label="Filter by campaign or source"
          title={selectedInfo.title}
          className="h-[28px] max-w-[175px] sm:max-w-[215px] px-2.5 text-[11px] font-medium flex items-center gap-1.5 cursor-pointer transition-opacity hover:opacity-90"
        >
          <span className="truncate">{selectedInfo.label}</span>
          <ChevronDown
            className={`w-3.5 h-3.5 shrink-0 opacity-70 transition-transform duration-150 ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>

        {isFiltered && (
          <button
            type="button"
            onClick={() => selectOption("All campaigns")}
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
          aria-label="Filter leads by campaign"
          className="fixed z-[200] rounded-xl flex flex-col overflow-hidden"
          style={{
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            maxHeight: `${coords.maxHeight}px`,
            background: "var(--bg-card)",
            border: "1px solid var(--border-main)",
            boxShadow: "0 12px 32px rgba(0, 0, 0, 0.16)",
          }}
        >
          {/* Search */}
          <div className="p-2 shrink-0" style={{ borderBottom: "1px solid var(--border-main)" }}>
            <div
              className="flex items-center gap-2 rounded-lg px-2.5 h-[36px] sm:h-[30px] transition-colors focus-within:border-[#0066FF]"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-input)",
              }}
            >
              <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-muted)" }} />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search campaign, ad set, or ad…"
                aria-label="Search campaign, ad set, or ad"
                className="w-full min-w-0 bg-transparent text-[16px] sm:text-[12px] outline-none"
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

          {/* Flat Clean Options List (block flow prevents flex-shrink overlap on wrapped items) */}
          <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-[var(--border-main)]">
            {!query && (
              <button
                type="button"
                onClick={() => selectOption("All campaigns")}
                className="w-full min-h-[40px] sm:min-h-[36px] px-3.5 py-2.5 text-start text-[12px] flex items-center justify-between gap-3 cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
                style={{
                  background: value === "All campaigns" ? "var(--bg-selected)" : undefined,
                  color: value === "All campaigns" ? "#0066FF" : "var(--text-primary)",
                  fontWeight: 600,
                }}
              >
                <span>All campaigns</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <span
                    className="text-[11px] font-semibold tabular-nums"
                    style={{ color: value === "All campaigns" ? "#0066FF" : "var(--text-secondary)" }}
                  >
                    ({filterList.totalCount})
                  </span>
                  {value === "All campaigns" && <Check className="w-3.5 h-3.5 text-[#0066FF]" />}
                </span>
              </button>
            )}

            {filteredOptions.length === 0 ? (
              <p className="text-[12px] text-center py-6 px-3" style={{ color: "var(--text-muted)" }}>
                No campaigns match &ldquo;{search.trim()}&rdquo;.
              </p>
            ) : (
              filteredOptions.map((opt) => {
                const active = value === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    title={opt.value}
                    onClick={() => selectOption(opt.value)}
                    className="w-full min-h-[40px] sm:min-h-[36px] px-3.5 py-2.5 text-start text-[12px] flex items-start justify-between gap-3 cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
                    style={{
                      background: active ? "var(--bg-selected)" : undefined,
                      color: active ? "#0066FF" : "var(--text-primary)",
                      fontWeight: active ? 600 : 500,
                    }}
                  >
                    <span className="min-w-0 flex-1 break-words leading-snug">
                      {opt.label}
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0 mt-0.5">
                      <span
                        className="text-[11px] font-semibold tabular-nums"
                        style={{ color: active ? "#0066FF" : "var(--text-secondary)" }}
                      >
                        ({opt.count})
                      </span>
                      {active && <Check className="w-3.5 h-3.5 text-[#0066FF]" />}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
