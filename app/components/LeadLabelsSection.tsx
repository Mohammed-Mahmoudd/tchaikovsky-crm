"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useCRM } from "../context/CRMContext";
import {
  DEFAULT_LEAD_LABEL_COLOR,
  LEAD_LABEL_COLOR_OPTIONS,
  MAX_LEAD_LABEL_NAME_LENGTH,
  type LeadLabel,
  type LeadLabelColor,
  countLeadsWithLabel,
  filterLeadLabels,
  getLeadLabelCssVars,
  removeLeadLabelId,
  resolveConversationLabels,
  toggleLeadLabelId,
  validateLeadLabelName,
} from "../utils/leadLabels";

export interface LeadLabelsSectionProps {
  conversationId: string;
  labelIds?: ReadonlyArray<string>;
  isReadOnly?: boolean;
  onUpdateLabels: (nextLabelIds: string[]) => Promise<{ ok: boolean; error?: string } | void>;
}

/**
 * Lead labels section for the details sidebar.
 * Keyed by `conversationId` so switching leads cleanly resets open picker/edit state.
 */
export default function LeadLabelsSection(props: LeadLabelsSectionProps) {
  return <LeadLabelsSectionInner key={props.conversationId} {...props} />;
}

function ColorSwatchPicker({
  selected,
  onSelect,
  groupLabel,
}: {
  selected: LeadLabelColor;
  onSelect: (color: LeadLabelColor) => void;
  groupLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={groupLabel} className="flex flex-wrap items-center gap-1">
      {LEAD_LABEL_COLOR_OPTIONS.map((opt) => {
        const isSelected = selected === opt.id;
        const vars = getLeadLabelCssVars(opt.id);
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={opt.label}
            title={opt.label}
            onClick={() => onSelect(opt.id)}
            className="min-w-[44px] min-h-[44px] sm:min-w-[26px] sm:min-h-[26px] flex items-center justify-center rounded-full transition-transform cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bg-banner)]"
            style={{
              background: isSelected ? vars.background : "transparent",
              border: isSelected ? `1px solid ${vars.dotColor}` : "1px solid transparent",
            }}
          >
            <span
              className="w-5 h-5 sm:w-4 sm:h-4 rounded-full flex items-center justify-center"
              style={{ backgroundColor: vars.dotColor }}
            >
              {isSelected && <Check className="w-2.5 h-2.5 text-white stroke-[3]" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function LeadLabelsSectionInner({
  labelIds,
  isReadOnly = false,
  onUpdateLabels,
}: LeadLabelsSectionProps) {
  const {
    labels,
    conversations,
    createLabel,
    updateLabel,
    deleteLabel,
  } = useCRM();

  const createInputId = useId();
  const editInputId = useId();
  const deleteTitleId = useId();

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [assignError, setAssignError] = useState<string | null>(null);

  // Create form state
  const [isCreating, setIsCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createColor, setCreateColor] = useState<LeadLabelColor>(DEFAULT_LEAD_LABEL_COLOR);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  // Edit form state
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<LeadLabelColor>(DEFAULT_LEAD_LABEL_COLOR);
  const [editError, setEditError] = useState<string | null>(null);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Delete confirmation modal state
  const [labelToDelete, setLabelToDelete] = useState<LeadLabel | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const createInputRef = useRef<HTMLInputElement | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);

  const assignedLabels = useMemo(
    () => resolveConversationLabels(labelIds, labels),
    [labelIds, labels]
  );
  const assignedSet = useMemo(() => new Set(assignedLabels.map((l) => l.id)), [assignedLabels]);

  const filteredCatalog = useMemo(
    () => filterLeadLabels(labels, searchQuery),
    [labels, searchQuery]
  );

  const trimmedSearch = searchQuery.trim().replace(/\s+/g, " ");
  const hasExactSearchMatch = useMemo(() => {
    if (!trimmedSearch) return true;
    const lower = trimmedSearch.toLowerCase();
    return labels.some((l) => l.name.trim().toLowerCase() === lower);
  }, [labels, trimmedSearch]);

  const deleteImpactCount = useMemo(
    () => (labelToDelete ? countLeadsWithLabel(conversations, labelToDelete.id) : 0),
    [conversations, labelToDelete]
  );

  useEffect(() => {
    if (!isPickerOpen) return;
    const timer = setTimeout(() => {
      if (!isCreating && !editingLabelId) {
        searchInputRef.current?.focus();
      }
    }, 20);
    return () => clearTimeout(timer);
  }, [isPickerOpen, isCreating, editingLabelId]);

  useEffect(() => {
    if (isCreating) {
      const timer = setTimeout(() => createInputRef.current?.focus(), 20);
      return () => clearTimeout(timer);
    }
  }, [isCreating]);

  useEffect(() => {
    if (editingLabelId) {
      const timer = setTimeout(() => {
        editInputRef.current?.focus();
        editInputRef.current?.select();
      }, 20);
      return () => clearTimeout(timer);
    }
  }, [editingLabelId]);

  useEffect(() => {
    if (!isPickerOpen && !labelToDelete) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (labelToDelete) {
        if (!isDeleting) {
          setLabelToDelete(null);
          setDeleteError(null);
        }
        return;
      }
      if (editingLabelId) {
        setEditingLabelId(null);
        setEditError(null);
        return;
      }
      if (isCreating) {
        setIsCreating(false);
        setCreateError(null);
        return;
      }
      setIsPickerOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPickerOpen, isCreating, editingLabelId, labelToDelete, isDeleting]);

  const applyLabelIds = async (nextIds: string[]) => {
    if (isReadOnly) return;
    setAssignError(null);
    const res = await onUpdateLabels(nextIds);
    if (res && res.ok === false) {
      setAssignError(res.error || "Could not update lead labels. Please try again.");
    }
  };

  const handleToggleAssign = (targetId: string) => {
    const nextIds = toggleLeadLabelId(labelIds, targetId);
    void applyLabelIds(nextIds);
  };

  const handleRemoveAssigned = (targetId: string) => {
    const nextIds = removeLeadLabelId(labelIds, targetId);
    void applyLabelIds(nextIds);
  };

  const openCreateForm = (prefillName = "") => {
    setEditingLabelId(null);
    setEditError(null);
    setCreateName(prefillName);
    setCreateColor(DEFAULT_LEAD_LABEL_COLOR);
    setCreateError(null);
    setIsCreating(true);
  };

  const handleSubmitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || isSubmittingCreate) return;
    const validation = validateLeadLabelName(createName, labels);
    if (!validation.ok) {
      setCreateError(validation.error);
      createInputRef.current?.focus();
      return;
    }

    setCreateError(null);
    setIsSubmittingCreate(true);
    try {
      const res = await createLabel({ name: validation.value, color: createColor });
      if (!res.ok || !res.label) {
        setCreateError(res.error || "Could not create label. Please try again.");
        return;
      }
      setIsCreating(false);
      setCreateName("");
      setSearchQuery("");

      const nextIds = toggleLeadLabelId(
        removeLeadLabelId(labelIds, res.label.id),
        res.label.id
      );
      void applyLabelIds(nextIds);
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const startEditingLabel = (label: LeadLabel) => {
    setIsCreating(false);
    setCreateError(null);
    setEditingLabelId(label.id);
    setEditName(label.name);
    setEditColor(label.color);
    setEditError(null);
  };

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !editingLabelId || isSubmittingEdit) return;
    const validation = validateLeadLabelName(editName, labels, editingLabelId);
    if (!validation.ok) {
      setEditError(validation.error);
      editInputRef.current?.focus();
      return;
    }

    setEditError(null);
    setIsSubmittingEdit(true);
    try {
      const res = await updateLabel(editingLabelId, {
        name: validation.value,
        color: editColor,
      });
      if (!res.ok) {
        setEditError(res.error || "Could not update label. Please try again.");
        return;
      }
      setEditingLabelId(null);
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (isReadOnly || !labelToDelete || isDeleting) return;
    setDeleteError(null);
    setIsDeleting(true);
    try {
      const res = await deleteLabel(labelToDelete.id);
      if (!res.ok) {
        setDeleteError(res.error || "Could not delete label. Please try again.");
        return;
      }
      if (editingLabelId === labelToDelete.id) {
        setEditingLabelId(null);
      }
      setLabelToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3
          className="text-[9px] font-bold tracking-widest uppercase"
          style={{ color: "var(--bg-banner)" }}
        >
          Labels
        </h3>
        {!isReadOnly && (
          <button
            type="button"
            aria-expanded={isPickerOpen}
            onClick={() => {
              setIsPickerOpen((prev) => !prev);
              setAssignError(null);
            }}
            className="inline-flex items-center gap-1 min-h-[44px] sm:min-h-[24px] px-2.5 sm:px-2 py-1 rounded-[6px] text-[11px] font-semibold transition-colors cursor-pointer hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bg-banner)]"
            style={{
              background: isPickerOpen ? "var(--bg-selected)" : "var(--bg-pill)",
              border: "1px solid var(--border-input)",
              color: isPickerOpen ? "var(--bg-banner)" : "var(--text-primary)",
            }}
          >
            {isPickerOpen ? (
              <>
                <Check className="w-3 h-3 shrink-0" />
                <span>Done</span>
              </>
            ) : (
              <>
                <Plus className="w-3 h-3 shrink-0" />
                <span>Add label</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Assigned label pills */}
      {assignedLabels.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {assignedLabels.map((label) => {
            const vars = getLeadLabelCssVars(label.color);
            return (
              <span
                key={label.id}
                className="inline-flex items-center gap-1 ps-2 pe-1 py-0.5 rounded-full text-[11px] font-medium max-w-full border"
                style={{
                  background: vars.background,
                  borderColor: vars.borderColor,
                  color: vars.color,
                }}
              >
                <span
                  aria-hidden="true"
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: vars.dotColor }}
                />
                <span className="truncate max-w-[160px]" title={label.name}>
                  {label.name}
                </span>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => handleRemoveAssigned(label.id)}
                    aria-label={`Remove label ${label.name}`}
                    title={`Remove ${label.name}`}
                    className="min-w-[44px] min-h-[44px] sm:min-w-[18px] sm:min-h-[18px] inline-flex items-center justify-center rounded-full hover:opacity-75 transition-opacity cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--bg-banner)]"
                    style={{ color: vars.color }}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      ) : (
        <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
          No labels yet.
        </p>
      )}

      {assignError && (
        <p
          role="alert"
          className="mt-1.5 flex items-start gap-1.5 text-[11px]"
          style={{ color: "var(--label-red-text)" }}
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{assignError}</span>
        </p>
      )}

      {/* Inline expandable label picker & manager */}
      {isPickerOpen && !isReadOnly && (
        <div
          className="mt-2.5 rounded-xl p-2.5 space-y-2.5"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-main)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          {/* Search input */}
          <div
            className="flex items-center gap-1.5 ps-2.5 pe-1 sm:pe-2.5 min-h-[44px] sm:min-h-[32px] rounded-lg"
            style={{
              background: "var(--bg-input)",
              border: "1px solid var(--border-input)",
            }}
          >
            <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-muted)" }} />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search labels..."
              aria-label="Search labels"
              className="flex-1 min-w-0 bg-transparent outline-none text-[16px] sm:text-[12px]"
              style={{ color: "var(--text-primary)" }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear label search"
                className="min-w-[44px] min-h-[44px] sm:min-w-[24px] sm:min-h-[24px] inline-flex items-center justify-center rounded hover:opacity-80 cursor-pointer"
                style={{ color: "var(--text-muted)" }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Label catalog list */}
          {filteredCatalog.length > 0 ? (
            <div className="max-h-[220px] overflow-y-auto space-y-1 pe-0.5">
              {filteredCatalog.map((label) => {
                const isAssigned = assignedSet.has(label.id);
                const vars = getLeadLabelCssVars(label.color);
                const isEditingThis = editingLabelId === label.id;

                if (isEditingThis) {
                  return (
                    <form
                      key={label.id}
                      onSubmit={handleSubmitEdit}
                      className="rounded-lg p-2.5 space-y-2"
                      style={{
                        background: "var(--bg-input)",
                        border: "1px solid var(--border-input)",
                      }}
                    >
                      <div>
                        <label
                          htmlFor={editInputId}
                          className="block text-[11px] font-semibold mb-1"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          Label name
                        </label>
                        <input
                          ref={editInputRef}
                          id={editInputId}
                          type="text"
                          value={editName}
                          maxLength={MAX_LEAD_LABEL_NAME_LENGTH}
                          onChange={(e) => {
                            setEditName(e.target.value);
                            if (editError) setEditError(null);
                          }}
                          onBlur={() => {
                            const check = validateLeadLabelName(editName, labels, label.id);
                            if (!check.ok) setEditError(check.error);
                          }}
                          className="w-full rounded-lg px-2.5 py-1.5 text-[16px] sm:text-[12px] outline-none"
                          style={{
                            background: "var(--bg-card)",
                            border: editError
                              ? "1px solid var(--label-red-dot)"
                              : "1px solid var(--border-input)",
                            color: "var(--text-primary)",
                          }}
                        />
                        {editError && (
                          <p
                            role="alert"
                            className="mt-1 text-[11px]"
                            style={{ color: "var(--label-red-text)" }}
                          >
                            {editError}
                          </p>
                        )}
                      </div>

                      <div>
                        <p
                          className="text-[11px] font-semibold mb-1"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          Color
                        </p>
                        <ColorSwatchPicker
                          selected={editColor}
                          onSelect={setEditColor}
                          groupLabel={`Color for ${label.name}`}
                        />
                      </div>

                      <div className="flex items-center justify-end gap-1.5 pt-1">
                        <button
                          type="button"
                          disabled={isSubmittingEdit}
                          onClick={() => {
                            setEditingLabelId(null);
                            setEditError(null);
                          }}
                          className="min-h-[44px] sm:min-h-[28px] px-2.5 rounded-lg text-[11px] font-medium cursor-pointer disabled:opacity-50"
                          style={{
                            background: "var(--bg-card)",
                            border: "1px solid var(--border-input)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isSubmittingEdit}
                          className="min-h-[44px] sm:min-h-[28px] px-3 rounded-lg text-[11px] font-semibold text-white cursor-pointer disabled:opacity-50"
                          style={{ background: "var(--bg-banner)" }}
                        >
                          {isSubmittingEdit ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </form>
                  );
                }

                return (
                  <div key={label.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleToggleAssign(label.id)}
                      aria-pressed={isAssigned}
                      className="flex-1 min-w-0 min-h-[44px] sm:min-h-[32px] flex items-center gap-2 px-2 py-1 rounded-lg text-start transition-colors cursor-pointer hover:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--bg-banner)]"
                      style={{
                        background: isAssigned ? "var(--bg-selected)" : "transparent",
                      }}
                    >
                      <span
                        aria-hidden="true"
                        className="w-4 h-4 rounded flex items-center justify-center shrink-0 border text-white"
                        style={
                          isAssigned
                            ? {
                                background: "var(--bg-banner)",
                                borderColor: "var(--bg-banner)",
                              }
                            : {
                                background: "var(--bg-input)",
                                borderColor: "var(--border-input)",
                              }
                        }
                      >
                        {isAssigned && <Check className="w-3 h-3 stroke-[3]" />}
                      </span>
                      <span
                        aria-hidden="true"
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: vars.dotColor }}
                      />
                      <span
                        className="text-[12px] font-medium truncate"
                        style={{ color: "var(--text-primary)" }}
                        title={label.name}
                      >
                        {label.name}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => startEditingLabel(label)}
                      aria-label={`Edit label ${label.name}`}
                      title={`Edit ${label.name}`}
                      className="min-w-[44px] min-h-[44px] sm:min-w-[28px] sm:min-h-[28px] inline-flex items-center justify-center rounded-lg transition-colors cursor-pointer hover:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--bg-banner)]"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setLabelToDelete(label);
                      }}
                      aria-label={`Delete label ${label.name}`}
                      title={`Delete ${label.name}`}
                      className="min-w-[44px] min-h-[44px] sm:min-w-[28px] sm:min-h-[28px] inline-flex items-center justify-center rounded-lg transition-colors cursor-pointer hover:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--bg-banner)]"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-3 px-2 text-center">
              <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                {labels.length === 0
                  ? "No labels created yet. Create your first label below."
                  : `No labels match "${trimmedSearch}".`}
              </p>
            </div>
          )}

          {/* Create form or trigger */}
          {isCreating ? (
            <form
              onSubmit={handleSubmitCreate}
              className="rounded-lg p-2.5 space-y-2.5"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-input)",
              }}
            >
              <div>
                <label
                  htmlFor={createInputId}
                  className="block text-[11px] font-semibold mb-1"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Label name
                </label>
                <input
                  ref={createInputRef}
                  id={createInputId}
                  type="text"
                  value={createName}
                  maxLength={MAX_LEAD_LABEL_NAME_LENGTH}
                  placeholder="e.g. VIP, Trial Ready"
                  onChange={(e) => {
                    setCreateName(e.target.value);
                    if (createError) setCreateError(null);
                  }}
                  onBlur={() => {
                    if (createName.trim()) {
                      const check = validateLeadLabelName(createName, labels);
                      if (!check.ok) setCreateError(check.error);
                    }
                  }}
                  className="w-full rounded-lg px-2.5 py-1.5 text-[16px] sm:text-[12px] outline-none"
                  style={{
                    background: "var(--bg-card)",
                    border: createError
                      ? "1px solid var(--label-red-dot)"
                      : "1px solid var(--border-input)",
                    color: "var(--text-primary)",
                  }}
                />
                {createError && (
                  <p
                    role="alert"
                    className="mt-1 text-[11px]"
                    style={{ color: "var(--label-red-text)" }}
                  >
                    {createError}
                  </p>
                )}
              </div>

              <div>
                <p
                  className="text-[11px] font-semibold mb-1"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Color
                </p>
                <ColorSwatchPicker
                  selected={createColor}
                  onSelect={setCreateColor}
                  groupLabel="New label color"
                />
              </div>

              {/* Live preview */}
              <div className="flex items-center gap-2">
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  Preview:
                </span>
                {(() => {
                  const previewVars = getLeadLabelCssVars(createColor);
                  return (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border max-w-[180px]"
                      style={{
                        background: previewVars.background,
                        borderColor: previewVars.borderColor,
                        color: previewVars.color,
                      }}
                    >
                      <span
                        aria-hidden="true"
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: previewVars.dotColor }}
                      />
                      <span className="truncate">
                        {createName.trim() || "New label"}
                      </span>
                    </span>
                  );
                })()}
              </div>

              <div className="flex items-center justify-end gap-1.5 pt-1">
                <button
                  type="button"
                  disabled={isSubmittingCreate}
                  onClick={() => {
                    setIsCreating(false);
                    setCreateError(null);
                  }}
                  className="min-h-[44px] sm:min-h-[28px] px-2.5 rounded-lg text-[11px] font-medium cursor-pointer disabled:opacity-50"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-input)",
                    color: "var(--text-secondary)",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCreate}
                  className="min-h-[44px] sm:min-h-[28px] px-3 rounded-lg text-[11px] font-semibold text-white cursor-pointer disabled:opacity-50"
                  style={{ background: "var(--bg-banner)" }}
                >
                  {isSubmittingCreate ? "Creating..." : "Create label"}
                </button>
              </div>
            </form>
          ) : (
            <div
              className="pt-2 flex flex-col gap-1.5"
              style={{ borderTop: "1px solid var(--border-main)" }}
            >
              {trimmedSearch && !hasExactSearchMatch && (
                <button
                  type="button"
                  onClick={() => openCreateForm(trimmedSearch)}
                  className="w-full min-h-[44px] sm:min-h-[30px] px-2.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors hover:opacity-90"
                  style={{
                    background: "var(--bg-selected)",
                    color: "var(--bg-banner)",
                  }}
                >
                  <Tag className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Create &ldquo;{trimmedSearch}&rdquo;</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => openCreateForm("")}
                className="w-full min-h-[44px] sm:min-h-[30px] px-2.5 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-input)",
                  color: "var(--text-primary)",
                }}
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>Create new label</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Delete label confirmation dialog (portaled so drawer transforms never trap fixed positioning) */}
      {labelToDelete &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[220] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/55 backdrop-blur-xs"
            onClick={() => {
              if (!isDeleting) {
                setLabelToDelete(null);
                setDeleteError(null);
              }
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={deleteTitleId}
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-[420px] max-h-[90dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl space-y-4 border"
              style={{
                background: "var(--bg-card)",
                borderColor: "var(--border-main)",
                color: "var(--text-primary)",
                paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)",
              }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 border"
                  style={{
                    background: "var(--label-red-bg)",
                    borderColor: "var(--label-red-border)",
                    color: "var(--label-red-text)",
                  }}
                >
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 id={deleteTitleId} className="text-[15px] font-bold leading-snug">
                    Delete label &ldquo;{labelToDelete.name}&rdquo;?
                  </h3>
                  <p className="text-[12px] mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    {deleteImpactCount > 0
                      ? `This permanently deletes the label and removes it from ${deleteImpactCount} ${
                          deleteImpactCount === 1 ? "lead" : "leads"
                        }.`
                      : "This permanently deletes the label. No leads currently use it."}
                  </p>
                </div>
              </div>

              {deleteError && (
                <p
                  role="alert"
                  className="text-[12px] font-medium"
                  style={{ color: "var(--label-red-text)" }}
                >
                  {deleteError}
                </p>
              )}

              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => {
                    setLabelToDelete(null);
                    setDeleteError(null);
                  }}
                  className="min-h-[44px] sm:min-h-[36px] px-4 rounded-xl text-[12px] font-medium cursor-pointer disabled:opacity-50"
                  style={{
                    background: "var(--bg-pill)",
                    border: "1px solid var(--border-input)",
                    color: "var(--text-secondary)",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmDelete}
                  className="min-h-[44px] sm:min-h-[36px] px-4 rounded-xl text-[12px] font-semibold text-white cursor-pointer disabled:opacity-50 border"
                  style={{
                    background: "var(--label-red-dot)",
                    borderColor: "var(--label-red-dot)",
                  }}
                >
                  {isDeleting ? "Deleting..." : "Delete label"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
