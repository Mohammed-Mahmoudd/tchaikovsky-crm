"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search, Check, X } from "lucide-react";
import { BranchGroup } from "../lib/branches";

interface BranchSelectProps {
  value: string;
  onChange: (value: string) => void;
  branchGroups: BranchGroup[];
  placeholder?: string;
  disabled?: boolean;
}

interface MenuCoords {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
}

function resolveSelectedBranchDisplay(
  value: string,
  branchGroups: BranchGroup[]
): { name: string; region: string } | null {
  if (!value) return null;
  for (const g of branchGroups) {
    for (const b of g.branches) {
      if (b.fullName === value || b.name === value) {
        return { name: b.name, region: g.region };
      }
    }
  }
  return { name: value, region: "" };
}

function filterBranchGroups(branchGroups: BranchGroup[], query: string): BranchGroup[] {
  const q = query.toLowerCase().trim();
  if (!q) return branchGroups;
  return branchGroups
    .map((g) => {
      if (g.region.toLowerCase().includes(q)) return g;
      const matchingBranches = g.branches.filter(
        (b) => b.name.toLowerCase().includes(q) || b.fullName.toLowerCase().includes(q)
      );
      return matchingBranches.length > 0 ? { ...g, branches: matchingBranches } : null;
    })
    .filter((g): g is BranchGroup => g !== null);
}

export function BranchSelect({
  value,
  onChange,
  branchGroups,
  placeholder = "Select branch…",
  disabled = false,
}: BranchSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [menuCoords, setMenuCoords] = useState<MenuCoords | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const computeMenuCoords = useCallback((): MenuCoords | null => {
    const el = containerRef.current;
    if (!el || typeof window === "undefined") return null;
    const rect = el.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;
    const gap = 4;
    const margin = 8;
    const spaceBelow = viewportH - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const openUpward = spaceBelow < 200 && spaceAbove > spaceBelow;
    const availableSpace = Math.max(140, (openUpward ? spaceAbove : spaceBelow) - gap);
    const maxHeight = Math.min(260, availableSpace);
    const width = Math.min(Math.max(rect.width, 220), viewportW - margin * 2);
    const left = Math.max(margin, Math.min(rect.left, viewportW - width - margin));

    if (openUpward) {
      return {
        bottom: viewportH - rect.top + gap,
        left,
        width,
        maxHeight,
      };
    }
    return {
      top: rect.bottom + gap,
      left,
      width,
      maxHeight,
    };
  }, []);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setSearch("");
  }, []);

  // Close when clicking outside both trigger and portaled menu
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        (!popoverRef.current || !popoverRef.current.contains(target))
      ) {
        closeMenu();
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open, closeMenu]);

  // Keep portaled menu anchored on scroll or resize
  useEffect(() => {
    if (!open) return;
    const handleReposition = () => {
      const next = computeMenuCoords();
      if (next) setMenuCoords(next);
    };
    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);
    return () => {
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
  }, [open, computeMenuCoords]);

  // Handle keyboard Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeMenu();
      }
    }
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, closeMenu]);

  // Focus search input when opened
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [open]);

  const handleToggleOpen = () => {
    if (disabled) return;
    if (!open) {
      setSearch("");
      setMenuCoords(computeMenuCoords());
      setOpen(true);
    } else {
      closeMenu();
    }
  };

  const selectedDisplay = resolveSelectedBranchDisplay(value, branchGroups);
  const filteredGroups = filterBranchGroups(branchGroups, search);

  const hasAnyMatches = filteredGroups.some((g) => g.branches.length > 0);

  const dropdownMenu =
    open && menuCoords && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={popoverRef}
            role="listbox"
            className="fixed z-[1000] rounded-xl shadow-2xl p-2 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-100"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-main)",
              left: `${menuCoords.left}px`,
              width: `${menuCoords.width}px`,
              maxHeight: `${menuCoords.maxHeight}px`,
              ...(menuCoords.top !== undefined ? { top: `${menuCoords.top}px` } : {}),
              ...(menuCoords.bottom !== undefined ? { bottom: `${menuCoords.bottom}px` } : {}),
            }}
          >
            {/* Quick Search */}
            <div className="relative shrink-0">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search branch or city…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-[30px] pl-8 pr-7 text-[12px] rounded-lg outline-none"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-input)",
                  color: "var(--text-primary)",
                }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Scrollable Branches List */}
            <div
              className="flex flex-col gap-1 overflow-y-auto pr-0.5"
              style={{
                maxHeight: `${Math.max(96, menuCoords.maxHeight - 54)}px`,
                scrollbarWidth: "thin",
              }}
            >
              {!hasAnyMatches && (
                <div className="py-4 text-center text-[12px] text-gray-400">
                  No branches match your search
                </div>
              )}

              {filteredGroups.map((group) => (
                <div key={group.region} className="mb-1">
                  {/* Region Heading */}
                  <div
                    className="text-[10px] font-bold uppercase tracking-wider px-2 pt-1.5 pb-0.5"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {group.region}
                  </div>

                  {/* Branches */}
                  {group.branches.map((b) => {
                    const isSelected = value === b.fullName || value === b.name;
                    return (
                      <button
                        key={b.id || b.fullName}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          onChange(b.fullName);
                          closeMenu();
                        }}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-left text-[12px] flex items-center justify-between cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-[#0066FF] text-white font-semibold"
                            : "hover:bg-[var(--bg-pill)] font-medium"
                        }`}
                        style={{
                          color: isSelected ? "#ffffff" : "var(--text-primary)",
                        }}
                      >
                        <span className="truncate">{b.name}</span>
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 text-white shrink-0 ml-1.5" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="relative w-full" ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={handleToggleOpen}
        className="w-full h-[38px] px-3 text-[13px] rounded-xl outline-none cursor-pointer flex items-center justify-between transition-colors text-left disabled:opacity-60 disabled:cursor-not-allowed"
        style={{
          background: "var(--bg-input)",
          border: open ? "1px solid #0066FF" : "1px solid var(--border-input)",
        }}
      >
        {selectedDisplay ? (
          <div className="flex items-center gap-1.5 truncate">
            <span className="font-semibold truncate" style={{ color: "var(--text-primary)" }}>
              {selectedDisplay.name}
            </span>
            {selectedDisplay.region && (
              <span className="text-[11px] font-normal shrink-0" style={{ color: "var(--text-muted)" }}>
                ({selectedDisplay.region})
              </span>
            )}
          </div>
        ) : (
          <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
            {placeholder}
          </span>
        )}
        <ChevronDown
          className={`w-4 h-4 text-gray-400 shrink-0 ml-2 transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {dropdownMenu}
    </div>
  );
}
