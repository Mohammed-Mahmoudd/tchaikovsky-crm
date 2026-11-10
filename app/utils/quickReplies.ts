export interface QuickReply {
  id: string;
  shortcut: string;
  title?: string;
  text: string;
  category?: string;
  order?: number;
  createdBy?: string;
}

export const STORAGE_KEY_QUICK_REPLIES = "tchaikovsky_quick_replies_v1";

export const DEFAULT_QUICK_REPLIES: QuickReply[] = [
  {
    id: "def_inquiry",
    shortcut: "inquiry",
    title: "Are you inquiring for yourself or for your children ?",
    text: "Are you inquiring for yourself or for your children ?",
    category: "Questions",
    order: 0,
  },
  {
    id: "def_jeddah",
    shortcut: "jeddah",
    title: "Jeddah",
    text: `Jeddah 📍\nhttps://maps.app.goo.gl/Qx4UyZuPDdrUjr7A6?g_st=iw`,
    category: "Locations",
    order: 1,
  },
  {
    id: "def_ahla",
    shortcut: "اهلا",
    title: "اهلا",
    text: `أهلاً وسهلاً ✨\nوصلنا استفسارك بخصوص دروس الموسيقى في Tchaikovsky Music School 🏛️\n\nمعك أدهم من فريق المدرسة\nالاستفسار ليك أو لطفلك؟`,
    category: "Welcome",
    order: 2,
  },
  {
    id: "def_riyadh",
    shortcut: "riyadh",
    title: "Riyadh",
    text: `Riyadh Park Mall 📍\nhttps://maps.app.goo.gl/CYQ7dxq82p2q9bAA6?g_st=com.google.m`,
    category: "Locations",
    order: 3,
  },
  {
    id: "def_khobar",
    shortcut: "khobar",
    title: "Khobar",
    text: `Ajdan Walk 📍\nhttps://maps.app.goo.gl/wJ13m7t6m3sV64aT7`,
    category: "Locations",
    order: 4,
  },
  {
    id: "def_audition",
    shortcut: "audition",
    title: "Audition Booking",
    text: `بخصوص موعد جلسة تجريبية (Audition) 🎵\nيسعدنا تحديد موعد يناسبكم للتعرف على المدرسة واختبار مستوى الطالب ومناقشة الخطة المناسبة.`,
    category: "Auditions",
    order: 5,
  },
];

/**
 * Normalizes Arabic text for lightning-fast, forgiving search:
 * - strips tashkeel / harakat
 * - unifies alef (أ إ آ -> ا)
 * - unifies yaa / alef maqsura (ى -> ي)
 * - unifies taa marbuta (ة -> ه)
 */
export function normalizeSearchText(input: string): string {
  if (!input) return "";
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove latin diacritics
    .replace(/[\u064B-\u065F\u0670]/g, "") // remove arabic harakat
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[؟?.,!]/g, "") // strip trailing punctuation so "/اهلا؟" matches "اهلا"
    .trim();
}

/**
 * Filter quick replies with sub-millisecond ranking:
 * 1. Exact shortcut match
 * 2. Shortcut starts with query
 * 3. Shortcut contains query
 * 4. Title contains query
 * 5. Message text contains query
 */
export function filterQuickReplies(replies: QuickReply[], rawQuery: string): QuickReply[] {
  const q = normalizeSearchText(rawQuery.replace(/^\/+/, ""));
  if (!q) return replies;

  const exactShortcut: QuickReply[] = [];
  const startsWithShortcut: QuickReply[] = [];
  const containsShortcut: QuickReply[] = [];
  const containsTitle: QuickReply[] = [];
  const containsText: QuickReply[] = [];

  for (const r of replies) {
    const sc = normalizeSearchText(r.shortcut);
    const title = normalizeSearchText(r.title || "");
    const text = normalizeSearchText(r.text);

    if (sc === q) {
      exactShortcut.push(r);
    } else if (sc.startsWith(q)) {
      startsWithShortcut.push(r);
    } else if (sc.includes(q)) {
      containsShortcut.push(r);
    } else if (title.includes(q)) {
      containsTitle.push(r);
    } else if (text.includes(q)) {
      containsText.push(r);
    }
  }

  return [
    ...exactShortcut,
    ...startsWithShortcut,
    ...containsShortcut,
    ...containsTitle,
    ...containsText,
  ];
}

/**
 * Reads quick replies from localStorage or falls back to defaults.
 * Synchronous execution for 0ms initial render latency.
 */
export function getStoredQuickReplies(): QuickReply[] {
  if (typeof window === "undefined") return DEFAULT_QUICK_REPLIES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_QUICK_REPLIES);
    if (!raw) {
      saveStoredQuickReplies(DEFAULT_QUICK_REPLIES);
      return DEFAULT_QUICK_REPLIES;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return DEFAULT_QUICK_REPLIES;
  } catch {
    return DEFAULT_QUICK_REPLIES;
  }
}

/**
 * Saves quick replies to localStorage.
 */
export function saveStoredQuickReplies(replies: QuickReply[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_QUICK_REPLIES, JSON.stringify(replies));
  } catch {}
}

/**
 * Fetches quick replies from backend API and synchronizes local cache.
 */
export async function fetchRemoteQuickReplies(token?: string | null): Promise<QuickReply[]> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await fetch("/crm-api/quick-replies", { headers, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.success && Array.isArray(json.data) && json.data.length > 0) {
      saveStoredQuickReplies(json.data);
      return json.data;
    }
  } catch {
    // Gracefully fallback to localStorage
  }
  return getStoredQuickReplies();
}

/**
 * Create a new quick reply on the backend.
 */
export async function createRemoteQuickReply(
  payload: { shortcut: string; title?: string; text: string; category?: string },
  token?: string | null
): Promise<QuickReply | null> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await fetch("/crm-api/quick-replies", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (json.success && json.data) {
      return json.data;
    }
  } catch {}
  return null;
}

/**
 * Update an existing quick reply on the backend.
 */
export async function updateRemoteQuickReply(
  id: string,
  payload: Partial<QuickReply>,
  token?: string | null
): Promise<QuickReply | null> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await fetch(`/crm-api/quick-replies/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (json.success && json.data) {
      return json.data;
    }
  } catch {}
  return null;
}

/**
 * Delete a quick reply on the backend.
 */
export async function deleteRemoteQuickReply(
  id: string,
  token?: string | null
): Promise<boolean> {
  try {
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await fetch(`/crm-api/quick-replies/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers,
    });
    const json = await res.json();
    return Boolean(json.success);
  } catch {
    return false;
  }
}

