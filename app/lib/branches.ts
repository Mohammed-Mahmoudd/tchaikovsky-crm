"use client";

import { useState, useEffect, useCallback } from "react";

export interface BranchItem {
  id: string;
  name: string;
  region: string;
  fullName: string;
  order: number;
}

export interface BranchGroup {
  region: string;
  branches: BranchItem[];
}

/** Legacy-compatible format matching the old hardcoded BRANCH_GROUPS */
export interface LegacyBranchGroup {
  region: string;
  branches: string[];
}

const CACHE_KEY = "crm_branches_cache";
const API_URL = "/crm-api/branches";

// Fallback defaults used before the API responds (mirrors the old hardcoded list)
export const DEFAULT_BRANCH_GROUPS: BranchGroup[] = [
  {
    region: "Riyadh",
    branches: [
      { id: "", name: "Alreem Compound", region: "Riyadh", fullName: "Alreem Compound (Riyadh)", order: 0 },
      { id: "", name: "Azure Hittin Compound", region: "Riyadh", fullName: "Azure Hittin Compound (Riyadh)", order: 1 },
      { id: "", name: "Ishbiliyah Compound", region: "Riyadh", fullName: "Ishbiliyah Compound (Riyadh)", order: 2 },
      { id: "", name: "Lapalma Compound", region: "Riyadh", fullName: "Lapalma Compound (Riyadh)", order: 3 },
      { id: "", name: "Lamara Compound", region: "Riyadh", fullName: "Lamara Compound (Riyadh)", order: 4 },
      { id: "", name: "Marvella Compound", region: "Riyadh", fullName: "Marvella Compound (Riyadh)", order: 5 },
      { id: "", name: "Mohaya Compound", region: "Riyadh", fullName: "Mohaya Compound (Riyadh)", order: 6 },
      { id: "", name: "Riyadh Park Mall", region: "Riyadh", fullName: "Riyadh Park Mall (Riyadh)", order: 7 },
    ],
  },
  {
    region: "Jeddah",
    branches: [
      { id: "", name: "Initiative Hub", region: "Jeddah", fullName: "Initiative Hub (Jeddah)", order: 0 },
    ],
  },
  {
    region: "Khobar",
    branches: [
      { id: "", name: "Ajdan Walk", region: "Khobar", fullName: "Ajdan Walk (Khobar)", order: 0 },
    ],
  },
  {
    region: "Other",
    branches: [
      { id: "", name: "Dumai Mall", region: "Other", fullName: "Dumai Mall", order: 0 },
      { id: "", name: "Online", region: "Other", fullName: "Online", order: 1 },
    ],
  },
];

function getCached(): BranchGroup[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return null;
}

function setCache(data: BranchGroup[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {}
}

/**
 * Hook to fetch & cache branches. Returns both the rich BranchGroup[] format
 * and a legacy-compatible { region, branches: string[] }[] format for drop-in
 * replacement of the old hardcoded BRANCH_GROUPS.
 */
export function useBranches() {
  const [branchGroups, setBranchGroups] = useState<BranchGroup[]>(() => {
    return getCached() || DEFAULT_BRANCH_GROUPS;
  });
  const [loading, setLoading] = useState(true);

  const fetchBranches = useCallback(async () => {
    try {
      const res = await fetch(API_URL);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setBranchGroups(data.data);
        setCache(data.data);
      }
    } catch (e) {
      console.warn("Failed to fetch branches:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  // Legacy-compatible format: { region, branches: string[] } — drop-in for BRANCH_GROUPS
  const legacyBranchGroups: LegacyBranchGroup[] = branchGroups.map((g) => ({
    region: g.region,
    branches: g.branches.map((b) => b.fullName),
  }));

  // Flat list of all branch fullNames
  const allBranchNames: string[] = branchGroups.flatMap((g) =>
    g.branches.map((b) => b.fullName)
  );

  // Unique region names (for the add form in settings)
  const regions: string[] = branchGroups.map((g) => g.region);

  return {
    branchGroups,
    legacyBranchGroups,
    allBranchNames,
    regions,
    loading,
    refresh: fetchBranches,
  };
}
