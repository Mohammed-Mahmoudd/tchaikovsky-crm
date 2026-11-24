"use client";

import React, { memo, useMemo } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { formatLostReasonDisplay, getLostReasonLabel } from "../utils/lostReasons";
import {
  PIPELINE_STAGE_THEME_TOKENS,
  type PipelineStage,
  type PipelineTableSort,
  type PipelineTableSortField,
} from "../utils/pipelineFilters";

export interface PipelineTableLead {
  id: string;
  name: string;
  phone?: string;
  campaignLabel: string;
  campaignFull: string;
  sourceDisplay: string;
  stage: PipelineStage;
  lostReason?: string;
  lostReasonNote?: string;
  agent: string;
  date: string;
}

export interface PipelineTableViewProps {
  leads: ReadonlyArray<PipelineTableLead>;
  hasActiveFilters: boolean;
  highlightedLeadId: string | null;
  sort: PipelineTableSort;
  page: number;
  pageSize: number;
  onToggleSort: (field: Exclude<PipelineTableSortField, "default">) => void;
  onPageChange: (page: number) => void;
  onSelectLead: (id: string) => void;
  onClearFilters: () => void;
}

function StageBadge({ stage }: { stage: PipelineStage }) {
  const tokens = PIPELINE_STAGE_THEME_TOKENS[stage];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap"
      style={{
        background: tokens.bg,
        color: tokens.text,
        border: `1px solid ${tokens.border}`,
      }}
    >
      <span
        aria-hidden="true"
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: tokens.dot }}
      />
      <span>{stage}</span>
    </span>
  );
}

const PipelineTableRow = memo(function PipelineTableRow({
  lead,
  idx,
  isHighlighted,
  onSelect,
}: {
  lead: PipelineTableLead;
  idx: number;
  isHighlighted: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <tr
      data-lead-id={lead.id}
      tabIndex={0}
      onClick={() => onSelect(lead.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(lead.id);
        }
      }}
      className="cursor-pointer transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--bg-banner)]"
      style={{
        borderBottom: "1px solid var(--border-main)",
        background: isHighlighted
          ? "var(--bg-selected)"
          : idx % 2 === 0
            ? "var(--bg-table-alt)"
            : "var(--bg-card)",
      }}
    >
      <td className="px-4 lg:px-6 py-3 font-medium max-w-[220px] truncate" title={lead.name}>
        {lead.name}
      </td>
      <td
        className="px-4 lg:px-6 py-3 whitespace-nowrap tabular-nums"
        style={{ color: "var(--text-secondary)" }}
      >
        {lead.phone || "—"}
      </td>
      <td
        className="px-4 lg:px-6 py-3 max-w-[260px]"
        style={{ color: "var(--text-secondary)" }}
        title={lead.sourceDisplay || lead.campaignFull}
      >
        <span className="block truncate">{lead.campaignLabel}</span>
      </td>
      <td className="px-4 lg:px-6 py-3 whitespace-nowrap">
        <div className="flex flex-col items-start gap-0.5">
          <StageBadge stage={lead.stage} />
          {lead.stage === "Lost" && lead.lostReason && (
            <span
              className="text-[10px] max-w-[180px] truncate"
              style={{ color: "var(--text-muted)" }}
              title={formatLostReasonDisplay(lead.lostReason, lead.lostReasonNote)}
            >
              {getLostReasonLabel(lead.lostReason)}
            </span>
          )}
        </div>
      </td>
      <td
        className="px-4 lg:px-6 py-3 whitespace-nowrap"
        style={{ color: "var(--text-secondary)" }}
      >
        {lead.agent || "Unassigned"}
      </td>
      <td
        className="px-4 lg:px-6 py-3 whitespace-nowrap tabular-nums"
        style={{ color: "var(--text-secondary)" }}
      >
        {lead.date}
      </td>
    </tr>
  );
});

const PipelineMobileCard = memo(function PipelineMobileCard({
  lead,
  isHighlighted,
  onSelect,
}: {
  lead: PipelineTableLead;
  isHighlighted: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      data-lead-id={lead.id}
      onClick={() => onSelect(lead.id)}
      className="w-full text-start rounded-xl p-3.5 flex flex-col gap-2 cursor-pointer transition-colors"
      style={{
        background: isHighlighted ? "var(--bg-selected)" : "var(--bg-card)",
        border: isHighlighted
          ? "1px solid var(--bg-banner)"
          : "1px solid var(--border-main)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p
            className="text-[14px] font-semibold truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {lead.name}
          </p>
          <p
            className="text-[12px] truncate mt-0.5 tabular-nums"
            style={{ color: "var(--text-secondary)" }}
          >
            {lead.phone || "No phone"} · {lead.agent || "Unassigned"}
          </p>
        </div>
        <StageBadge stage={lead.stage} />
      </div>

      <div className="flex items-center justify-between gap-2 text-[12px]">
        <span
          className="truncate min-w-0 flex-1"
          style={{ color: "var(--text-secondary)" }}
          title={lead.sourceDisplay || lead.campaignFull}
        >
          {lead.campaignLabel}
        </span>
        <span
          className="text-[11px] shrink-0 tabular-nums"
          style={{ color: "var(--text-muted)" }}
        >
          {lead.date}
        </span>
      </div>

      {lead.stage === "Lost" && lead.lostReason && (
        <p
          className="text-[11px] truncate"
          style={{ color: "var(--label-red-text)" }}
          title={formatLostReasonDisplay(lead.lostReason, lead.lostReasonNote)}
        >
          {getLostReasonLabel(lead.lostReason)}
        </p>
      )}
    </button>
  );
});

function SortableHeader({
  label,
  field,
  sort,
  onToggleSort,
}: {
  label: string;
  field: Exclude<PipelineTableSortField, "default">;
  sort: PipelineTableSort;
  onToggleSort: (field: Exclude<PipelineTableSortField, "default">) => void;
}) {
  const isActive = sort.field === field;
  const ariaSort = isActive
    ? sort.dir === "asc"
      ? "ascending"
      : "descending"
    : "none";

  return (
    <th scope="col" aria-sort={ariaSort} className="px-4 lg:px-6 py-3">
      <button
        type="button"
        onClick={() => onToggleSort(field)}
        className="inline-flex items-center gap-1 uppercase font-bold tracking-widest cursor-pointer transition-colors hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bg-banner)]"
        style={{
          color: isActive ? "var(--bg-banner)" : "var(--text-secondary)",
        }}
      >
        <span>{label}</span>
        {isActive ? (
          sort.dir === "asc" ? (
            <ArrowUp className="w-3 h-3 shrink-0" />
          ) : (
            <ArrowDown className="w-3 h-3 shrink-0" />
          )
        ) : (
          <ArrowUpDown className="w-3 h-3 shrink-0 opacity-45" />
        )}
      </button>
    </th>
  );
}

export const PipelineTableView = memo(function PipelineTableView({
  leads,
  hasActiveFilters,
  highlightedLeadId,
  sort,
  page,
  pageSize,
  onToggleSort,
  onPageChange,
  onSelectLead,
  onClearFilters,
}: PipelineTableViewProps) {
  const totalPages = Math.max(1, Math.ceil(leads.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const paginatedLeads = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return leads.slice(start, start + pageSize);
  }, [leads, safePage, pageSize]);

  if (leads.length === 0) {
    return (
      <div
        className="flex-1 min-h-0 flex flex-col items-center justify-center px-4 py-16 text-center gap-3"
        style={{ background: "var(--bg-card)" }}
      >
        <p
          className="text-[14px] font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          {hasActiveFilters
            ? "No leads match the selected filters."
            : "No leads in the pipeline yet."}
        </p>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="min-h-[44px] sm:min-h-[34px] px-4 py-1.5 rounded-lg text-[12px] font-semibold text-white cursor-pointer hover:opacity-90"
            style={{ background: "var(--bg-banner)" }}
          >
            Clear filters
          </button>
        )}
      </div>
    );
  }

  const rangeStart = (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, leads.length);

  return (
    <div
      className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden"
      style={{ background: "var(--bg-card)" }}
    >
      <div className="flex-1 min-h-0 min-w-0 overflow-auto">
        {/* Mobile Stacked Cards (< md) */}
        <div
          className="md:hidden p-3 flex flex-col gap-2.5"
          style={{ background: "var(--bg-page)" }}
        >
          {paginatedLeads.map((lead) => (
            <PipelineMobileCard
              key={lead.id}
              lead={lead}
              isHighlighted={highlightedLeadId === lead.id}
              onSelect={onSelectLead}
            />
          ))}
        </div>

        {/* Desktop & Tablet Table (md+) */}
        <div className="hidden md:block min-w-[780px]">
          <table className="w-full text-start border-collapse">
            <thead
              className="text-[10px] uppercase font-bold tracking-widest sticky top-0 z-10"
              style={{
                background: "var(--bg-table-header)",
                color: "var(--text-secondary)",
              }}
            >
              <tr>
                <SortableHeader
                  label="Name"
                  field="name"
                  sort={sort}
                  onToggleSort={onToggleSort}
                />
                <th scope="col" className="px-4 lg:px-6 py-3">
                  Phone
                </th>
                <SortableHeader
                  label="Campaign"
                  field="campaign"
                  sort={sort}
                  onToggleSort={onToggleSort}
                />
                <SortableHeader
                  label="Stage"
                  field="stage"
                  sort={sort}
                  onToggleSort={onToggleSort}
                />
                <SortableHeader
                  label="Agent"
                  field="agent"
                  sort={sort}
                  onToggleSort={onToggleSort}
                />
                <SortableHeader
                  label="Received"
                  field="received"
                  sort={sort}
                  onToggleSort={onToggleSort}
                />
              </tr>
            </thead>
            <tbody
              className="text-[13px]"
              style={{ color: "var(--text-primary)" }}
            >
              {paginatedLeads.map((lead, idx) => (
                <PipelineTableRow
                  key={lead.id}
                  lead={lead}
                  idx={idx}
                  isHighlighted={highlightedLeadId === lead.id}
                  onSelect={onSelectLead}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div
          className="px-4 md:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2 text-[12px] shrink-0"
          style={{
            background: "var(--bg-card)",
            borderTop: "1px solid var(--border-main)",
            color: "var(--text-secondary)",
          }}
        >
          <span className="tabular-nums">
            Showing {rangeStart}–{rangeEnd} of {leads.length} leads
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => onPageChange(Math.max(1, safePage - 1))}
              className="inline-flex items-center gap-1 px-3 min-h-[44px] sm:min-h-[32px] rounded-lg font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--bg-hover)]"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-input)",
                color: "var(--text-primary)",
              }}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>
            <span
              className="px-2 font-semibold tabular-nums"
              style={{ color: "var(--text-primary)" }}
            >
              Page {safePage} of {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
              className="inline-flex items-center gap-1 px-3 min-h-[44px] sm:min-h-[32px] rounded-lg font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--bg-hover)]"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-input)",
                color: "var(--text-primary)",
              }}
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

