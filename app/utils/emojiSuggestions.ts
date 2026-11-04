/**
 * Smart, zero-cost emoji suggestions for the chat composer.
 *
 * - 100% client-side, rule-based (no AI / no network) → sub-millisecond lookups.
 * - Bilingual: English, Arabic (MSA + Egyptian dialect) and common Franco-Arabic.
 * - Arabic normalization (tashkeel, hamza/alef forms, taa marbuta, clitics like و / ال / بال).
 * - Prefix matching for the word currently being typed ("congr" → 🎉).
 * - Learns per-keyword preferences locally: emojis the agent actually picks for a
 *   keyword are ranked higher next time (stored in localStorage).
 */

/** `w` = salience weight (default 1). Generic filler words get < 1 so specific topics win. */
type DictEntry = { words: string[]; emojis: string[]; w?: number };

// ─────────────────────────────────────────────────────────────────────────────
// Dictionary — tuned for a music school CRM (admissions, auditions, lessons)
// Multi-word phrases are supported (e.g. "good morning", "صباح الخير").
// ─────────────────────────────────────────────────────────────────────────────
const DICTIONARY: DictEntry[] = [
  // ── Greetings ──
  { words: ["hello", "hi", "hey", "welcome", "greetings", "مرحبا", "اهلا", "اهلين", "هاي", "هلا", "ahlan", "marhaba", "welcome back"], emojis: ["👋", "😊", "🌹"] },
  { words: ["السلام عليكم", "سلام عليكم", "salam", "assalamu alaikum", "وعليكم السلام"], emojis: ["🌹", "🤍", "😊"] },
  { words: ["good morning", "morning", "صباح الخير", "صباح النور", "صباحو", "sabah el kheir"], emojis: ["☀️", "🌸", "😊"] },
  { words: ["good evening", "good night", "night", "مساء الخير", "مساء النور", "تصبح على خير", "تصبحي على خير", "masa el kheir"], emojis: ["🌙", "✨", "🌹"] },
  { words: ["bye", "goodbye", "see you", "مع السلامه", "سلام", "باي", "اشوفك", "نشوفك"], emojis: ["👋", "🌹", "😊"] },
  { words: ["dear", "عزيزي", "عزيزتي", "حضرتك", "يا فندم", "فندم"], emojis: ["🌹", "😊"], w: 0.4 },

  // ── Thanks / appreciation ──
  { words: ["thank", "thanks", "thank you", "thx", "appreciate", "grateful", "شكرا", "متشكر", "متشكره", "متشكرين", "تسلم", "تسلمي", "تسلموا", "الف شكر", "مرسي", "merci", "shokran", "teslam"], emojis: ["🙏", "🌹", "❤️"] },
  { words: ["you're welcome", "welcome anytime", "العفو", "عفوا", "على الرحب", "تحت امرك", "تحت امر حضرتك", "afwan"], emojis: ["🌹", "😊", "🤍"] },

  // ── Music & instruments ──
  { words: ["piano", "keyboard", "بيانو", "كيبورد", "اورج"], emojis: ["🎹", "🎶"] },
  { words: ["violin", "viola", "كمان", "كمنجه", "فيولا"], emojis: ["🎻", "🎶"] },
  { words: ["cello", "double bass", "تشيلو", "كونترباص"], emojis: ["🎻", "🎼"] },
  { words: ["guitar", "bass guitar", "جيتار", "جيتار باص", "guitara"], emojis: ["🎸", "🎶"] },
  { words: ["drum", "drums", "percussion", "درامز", "طبله", "طبل", "ايقاع", "رق"], emojis: ["🥁", "🎶"] },
  { words: ["oud", "عود"], emojis: ["🪕", "🎶"] },
  { words: ["flute", "ناي", "فلوت"], emojis: ["🪈", "🎶"] },
  { words: ["saxophone", "sax", "ساكسفون", "ساكس"], emojis: ["🎷", "🎶"] },
  { words: ["trumpet", "ترومبيت", "بوق"], emojis: ["🎺", "🎶"] },
  { words: ["sing", "singing", "vocal", "vocals", "voice", "choir", "غناء", "غنا", "صوت", "فوكال", "كورال"], emojis: ["🎤", "🎶", "🎵"] },
  { words: ["music", "song", "songs", "melody", "موسيقى", "مزيكا", "اغنيه", "اغاني", "لحن", "مزيكه", "mazika"], emojis: ["🎵", "🎶", "🎼"] },
  { words: ["instrument", "instruments", "اله موسيقيه", "الات"], emojis: ["🎹", "🎻", "🎸"] },
  { words: ["concert", "recital", "performance", "stage", "حفله", "حفل", "عرض", "مسرح", "كونسير"], emojis: ["🎭", "🎶", "👏"] },
  { words: ["ballet", "dance", "dancing", "باليه", "رقص"], emojis: ["🩰", "💃"] },
  { words: ["art", "drawing", "painting", "رسم", "فنون", "art class"], emojis: ["🎨", "🖌️"] },
  { words: ["tchaikovsky", "تشايكوفسكي", "academy", "اكاديميه", "school", "مدرسه", "conservatory", "كونسرفتوار"], emojis: ["🎼", "🏫", "🎹"] },

  // ── Auditions / placement ──
  { words: ["audition", "auditions", "placement", "placement test", "test", "exam", "اختبار", "امتحان", "تقييم", "مستوى", "تحديد مستوى", "اوديشن", "audishn"], emojis: ["🎼", "📝", "🌟"] },
  { words: ["trial", "trial lesson", "free trial", "demo", "حصه تجريبيه", "تجريبيه", "تجربه"], emojis: ["🎶", "✨", "🎁"] },

  // ── Lessons / courses ──
  { words: ["lesson", "lessons", "class", "classes", "session", "sessions", "حصه", "حصص", "سيشن", "محاضره", "درس"], emojis: ["🎶", "📚", "⏰"] },
  { words: ["course", "courses", "program", "level", "كورس", "كورسات", "برنامج", "مستويات", "دبلومه"], emojis: ["📚", "🎓", "🎼"] },
  { words: ["teacher", "instructor", "maestro", "coach", "مدرس", "مدرسه", "مستر", "ميس", "مايسترو", "استاذ", "استاذه", "مدرب"], emojis: ["👨‍🏫", "👩‍🏫", "🎼"] },
  { words: ["student", "students", "kid", "kids", "child", "children", "son", "daughter", "طالب", "طالبه", "طلاب", "طفل", "اطفال", "ابني", "بنتي", "ابن", "بنت", "ولاد"], emojis: ["🧒", "👧", "🎵"] },
  { words: ["practice", "practise", "homework", "تمرين", "تدريب", "واجب", "مذاكره"], emojis: ["💪", "🎶", "📖"] },
  { words: ["certificate", "graduation", "diploma", "شهاده", "تخرج", "شهادات"], emojis: ["🎓", "📜", "🏆"] },
  { words: ["online", "zoom", "virtual", "اونلاين", "اون لاين", "زووم"], emojis: ["💻", "🎧"] },

  // ── Scheduling / time ──
  { words: ["date", "appointment", "schedule", "booking", "book", "reserve", "reservation", "calendar", "ميعاد", "معاد", "موعد", "مواعيد", "حجز", "احجز", "نحجز", "تحجز", "تحجزي", "يحجز", "حجزت", "نحجزلك", "احجزلك", "جدول", "maad", "me3ad"], emojis: ["📅", "🗓️", "✅"] },
  { words: ["time", "hour", "clock", "o'clock", "pm", "am", "الساعه", "ساعه", "الوقت", "وقت"], emojis: ["⏰", "🕐"], w: 0.85 },
  { words: ["today", "tonight", "النهارده", "النهاردة", "انهارده", "اليوم", "النهرده"], emojis: ["📅", "⏰"] },
  { words: ["tomorrow", "بكره", "بكرة", "غدا", "bokra"], emojis: ["📅", "⏰"] },
  { words: ["week", "weekly", "weekend", "اسبوع", "الاسبوع", "اسبوعي", "ويك اند"], emojis: ["🗓️"] },
  { words: ["friday", "saturday", "sunday", "monday", "tuesday", "wednesday", "thursday", "الجمعه", "السبت", "الحد", "الاحد", "الاتنين", "الاثنين", "التلات", "الثلاثاء", "الاربع", "الاربعاء", "الخميس"], emojis: ["📅", "🗓️"] },
  { words: ["reminder", "remind", "don't forget", "تذكير", "فكرتك", "متنساش", "متنسيش", "افكرك"], emojis: ["⏰", "🔔", "📌"] },
  { words: ["start", "starting", "begins", "new term", "هنبدا", "نبدا", "يبدا", "بدايه", "البدايه"], emojis: ["🚀", "🎶", "✨"] },
  { words: ["late", "delay", "postpone", "reschedule", "متاخر", "تاخير", "تأجيل", "تاجيل", "اتاخرت", "نأجل", "ناجل"], emojis: ["⏳", "🙏"] },
  { words: ["cancel", "cancelled", "canceled", "الغاء", "اتلغى", "اتلغت", "نلغي"], emojis: ["❌", "🙏"] },

  // ── Location / contact ──
  { words: ["location", "address", "map", "maps", "directions", "branch", "branches", "العنوان", "عنوان", "الفرع", "فرع", "فروع", "المكان", "مكان", "اللوكيشن", "لوكيشن", "الخريطه"], emojis: ["📍", "🗺️", "🏫"] },
  { words: ["call", "phone", "number", "mobile", "contact", "اتصل", "اتصال", "كلمني", "كلميني", "رقم", "تليفون", "موبايل", "نكلم", "هنكلم", "نتواصل", "تواصل"], emojis: ["📞", "📱", "☎️"] },
  { words: ["whatsapp", "واتساب", "واتس"], emojis: ["💬", "📱"] },
  { words: ["email", "mail", "ايميل", "بريد"], emojis: ["📧", "✉️"] },
  { words: ["link", "website", "form", "register", "registration", "sign up", "signup", "لينك", "رابط", "الموقع", "استماره", "فورم", "تسجيل", "سجل", "التسجيل"], emojis: ["🔗", "📝", "✅"] },
  { words: ["parking", "car", "ركن", "جراج", "باركينج"], emojis: ["🚗", "🅿️"] },

  // ── Payment / pricing ──
  { words: ["price", "prices", "cost", "fee", "fees", "tuition", "السعر", "سعر", "الاسعار", "اسعار", "التكلفه", "تكلفه", "المصاريف", "مصاريف", "بكام", "كام"], emojis: ["💰", "🧾", "💳"] },
  { words: ["payment", "pay", "paid", "invoice", "receipt", "installment", "installments", "الدفع", "دفع", "ادفع", "اتدفع", "فاتوره", "ايصال", "قسط", "تقسيط", "اقساط"], emojis: ["💳", "🧾", "✅"] },
  { words: ["instapay", "vodafone cash", "transfer", "bank", "انستاباي", "فودافون كاش", "تحويل", "البنك", "حول", "حولت"], emojis: ["💳", "🏦", "📲"] },
  { words: ["discount", "offer", "offers", "promo", "sale", "deal", "خصم", "عرض خاص", "عروض", "اوفر", "تخفيض"], emojis: ["🎁", "🔥", "💥"] },
  { words: ["free", "gift", "مجانا", "مجاني", "مجانيه", "ببلاش", "هديه"], emojis: ["🎁", "✨"] },

  // ── Confirmation / status ──
  { words: ["confirmed", "confirm", "done", "approved", "ready", "booked", "تم", "تمام", "اتأكد", "اتاكد", "تأكيد", "تاكيد", "مؤكد", "اتحجز", "جاهز", "خلاص", "tamam", "tmam"], emojis: ["✅", "👍🏻", "👌"] },
  { words: ["ok", "okay", "sure", "of course", "alright", "great", "حاضر", "اكيد", "طبعا", "ماشي", "اوك", "اوكي", "حلو", "akid", "mashy"], emojis: ["👍🏻", "👌", "😊"], w: 0.8 },
  { words: ["yes", "yeah", "ايوه", "ايوا", "نعم", "aywa"], emojis: ["👍🏻", "✅"], w: 0.8 },
  { words: ["not available", "unavailable", "fully booked", "مش متاح", "مفيش", "كامل", "مكتمل"], emojis: ["🙏", "❌"] },
  { words: ["important", "note", "attention", "please note", "notice", "مهم", "ملحوظه", "ملاحظه", "تنبيه", "برجاء", "رجاء"], emojis: ["📌", "⚠️", "❗"] },
  { words: ["question", "ask", "inquiry", "سؤال", "استفسار", "استفسارات", "اسال"], emojis: ["❓", "💬", "🤔"] },
  { words: ["help", "support", "assist", "مساعده", "اساعد", "نساعد", "دعم"], emojis: ["🤝", "💬", "😊"] },
  { words: ["available", "open", "seats", "spots", "متاح", "متاحه", "متوفر", "اماكن", "مفتوح"], emojis: ["✅", "🟢"] },
  { words: ["waiting", "wait", "please wait", "moment", "one moment", "استنى", "استني", "لحظه", "ثواني", "دقيقه", "انتظار", "ثانيه واحده"], emojis: ["⏳", "🙏"] },
  { words: ["soon", "coming soon", "قريب", "قريبا", "قريب جدا"], emojis: ["🔜", "✨"] },
  { words: ["new", "جديد", "جديده", "news", "اخبار", "update"], emojis: ["🆕", "✨", "📢"] },
  { words: ["announcement", "announce", "اعلان", "بنعلن"], emojis: ["📢", "🎉"] },
  { words: ["photo", "photos", "picture", "video", "صوره", "صور", "فيديو"], emojis: ["📸", "🎬"] },
  { words: ["document", "file", "pdf", "ملف", "ورق", "اوراق", "مستندات"], emojis: ["📄", "📎"] },

  // ── Emotions / tone ──
  { words: ["congratulations", "congrats", "congratulation", "مبروك", "الف مبروك", "مبارك", "mabrook", "mabrouk"], emojis: ["🎉", "👏", "🥳"] },
  { words: ["happy birthday", "birthday", "عيد ميلاد", "كل سنه وانت طيب", "كل سنه وانتي طيبه", "كل سنه وانتم طيبين"], emojis: ["🎂", "🎉", "🎈"] },
  { words: ["excellent", "amazing", "awesome", "perfect", "wonderful", "fantastic", "bravo", "well done", "ممتاز", "رائع", "جميل", "تحفه", "برافو", "عظيم", "جامد", "هايل", "momtaz"], emojis: ["👏", "🌟", "🔥"] },
  { words: ["proud", "talented", "talent", "فخورين", "فخور", "موهوب", "موهبه", "موهوبه"], emojis: ["🌟", "🏆", "👏"] },
  { words: ["love", "lovely", "بحب", "حب", "حبيبي", "حبيبتي"], emojis: ["❤️", "🥰"] },
  { words: ["happy", "glad", "pleasure", "pleased", "delighted", "سعداء", "سعيد", "سعيده", "مبسوط", "مبسوطين", "يسعدنا", "شرف", "نتشرف", "يشرفنا", "منور", "منوره"], emojis: ["😊", "🤩", "🌹"] },
  { words: ["sorry", "apologize", "apologies", "excuse", "اسف", "اسفين", "متأسف", "متاسف", "معلش", "عذرا", "نعتذر", "اعتذار", "asef", "maalesh"], emojis: ["🙏", "😔"] },
  { words: ["hope", "wish", "inshallah", "insha allah", "ان شاء الله", "انشاء الله", "انشالله", "باذن الله", "يارب", "نتمنى", "اتمنى"], emojis: ["🤲", "🙏", "✨"] },
  { words: ["mashallah", "masha allah", "ما شاء الله", "ماشاء الله", "تبارك الله"], emojis: ["🤍", "✨", "🌟"] },
  { words: ["alhamdulillah", "الحمد لله", "الحمدلله", "الحمد"], emojis: ["🤲", "🤍"] },
  { words: ["eid", "ramadan", "kareem", "عيد", "رمضان", "كريم", "عيد سعيد", "رمضان كريم"], emojis: ["🌙", "✨", "🎉"] },
  { words: ["christmas", "new year", "الكريسماس", "راس السنه", "سنه جديده"], emojis: ["🎄", "🎆", "✨"] },
  { words: ["holiday", "vacation", "day off", "اجازه", "اجازة", "عطله"], emojis: ["🏖️", "🌴"] },
  { words: ["success", "succeed", "win", "winner", "first place", "نجاح", "نجح", "فوز", "فاز", "المركز الاول"], emojis: ["🏆", "🥇", "🎉"] },
  { words: ["good luck", "best of luck", "بالتوفيق", "ربنا يوفقك", "حظ سعيد", "يوفقك", "bel tawfik"], emojis: ["🍀", "🤞", "✨"] },
  { words: ["fire", "trending", "نار", "ولع"], emojis: ["🔥"] },
  { words: ["idea", "tip", "advice", "فكره", "نصيحه"], emojis: ["💡"] },
  { words: ["goal", "target", "هدف"], emojis: ["🎯"] },
  { words: ["star", "stars", "نجم", "نجمه", "نجوم"], emojis: ["⭐", "🌟"] },
  { words: ["family", "parents", "mom", "dad", "mother", "father", "عيله", "عائله", "اهل", "ماما", "بابا", "ولي الامر", "اولياء الامور"], emojis: ["👨‍👩‍👧", "🤍"] },
  { words: ["team", "staff", "الفريق", "فريق", "الادمن", "الاداره"], emojis: ["🤝", "👥"] },
];

// ─────────────────────────────────────────────────────────────────────────────
// Normalization
// ─────────────────────────────────────────────────────────────────────────────
const TASHKEEL_RE = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
const PUNCT_EDGE_RE = /^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu;

export function normalizeWord(raw: string): string {
  return raw
    .toLowerCase()
    .replace(TASHKEEL_RE, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[’`]/g, "'")
    .replace(PUNCT_EDGE_RE, "")
    // Collapse stretched letters: "شكراااا" → "شكرا", "thanksss" → "thanks"
    .replace(/(.)\1{2,}/gu, "$1");
}

/** Arabic clitic & English plural variants so "والبيانو" / "بالكمان" / "lessons" still match. */
function wordVariants(w: string): string[] {
  const out = new Set<string>([w]);
  const isArabic = /[\u0600-\u06FF]/.test(w);
  if (isArabic) {
    const queue = [w];
    for (const pre of ["و", "ف"]) if (w.startsWith(pre) && w.length > 3) queue.push(w.slice(1));
    for (const v of queue) {
      out.add(v);
      for (const pre of ["بال", "لل", "كال", "فال", "ال", "ب", "ل"]) {
        if (v.startsWith(pre) && v.length - pre.length >= 2) out.add(v.slice(pre.length));
      }
    }
  } else {
    if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) out.add(w.slice(0, -1));
    if (w.length > 4 && w.endsWith("ing")) out.add(w.slice(0, -3));
  }
  return Array.from(out);
}

// ─────────────────────────────────────────────────────────────────────────────
// Index (built once, lazily)
// ─────────────────────────────────────────────────────────────────────────────
type IndexEntry = { key: string; emojis: string[]; wordCount: number; w: number };

let exactIndex: Map<string, IndexEntry[]> | null = null;
let singleKeys: string[] = []; // single-word keys for prefix search

function buildIndex() {
  if (exactIndex) return exactIndex;
  const map = new Map<string, IndexEntry[]>();
  const singles = new Set<string>();
  for (const entry of DICTIONARY) {
    for (const rawWord of entry.words) {
      const parts = rawWord.split(/\s+/).map(normalizeWord).filter(Boolean);
      if (parts.length === 0) continue;
      const key = parts.join(" ");
      const item: IndexEntry = { key, emojis: entry.emojis, wordCount: parts.length, w: entry.w ?? 1 };
      const list = map.get(key);
      if (list) list.push(item);
      else map.set(key, [item]);
      if (parts.length === 1) singles.add(key);
    }
  }
  exactIndex = map;
  singleKeys = Array.from(singles).sort();
  return map;
}

/** Binary search for all single-word keys starting with `prefix`. */
function keysWithPrefix(prefix: string, limit = 8): string[] {
  buildIndex();
  let lo = 0;
  let hi = singleKeys.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (singleKeys[mid] < prefix) lo = mid + 1;
    else hi = mid;
  }
  const out: string[] = [];
  for (let i = lo; i < singleKeys.length && out.length < limit; i++) {
    if (!singleKeys[i].startsWith(prefix)) break;
    out.push(singleKeys[i]);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Local learning (per keyword → emoji pick counts)
// ─────────────────────────────────────────────────────────────────────────────
const STATS_KEY = "crm_emoji_suggest_stats_v1";
let stats: Record<string, Record<string, number>> | null = null;

function getStats() {
  if (stats) return stats;
  stats = {};
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(STATS_KEY);
      if (raw) stats = JSON.parse(raw) || {};
    } catch {}
  }
  return stats!;
}

export function recordSuggestionPick(keywords: string[], emoji: string) {
  if (!emoji || keywords.length === 0) return;
  const s = getStats();
  for (const k of keywords) {
    const bucket = (s[k] ||= {});
    bucket[emoji] = Math.min((bucket[emoji] || 0) + 1, 50);
  }
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(s));
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────
export interface EmojiSuggestionResult {
  emojis: string[];
  /** Normalized dictionary keys that produced the suggestions (used for learning). */
  keywords: string[];
}

const EMPTY: EmojiSuggestionResult = { emojis: [], keywords: [] };
// Any pictographic emoji or a sentence/line break resets the suggestion context.
const CONTEXT_BREAK_RE = /[\p{Extended_Pictographic}\n.!?؟؛]/gu;
const MAX_LOOKBACK = 80;

/**
 * Suggest emojis for the text before the caret.
 * Only the current phrase is considered (after the last emoji / line / sentence break),
 * so right after inserting an emoji the bar disappears until new words are typed.
 */
export function getEmojiSuggestions(textBeforeCaret: string, max = 6): EmojiSuggestionResult {
  if (!textBeforeCaret) return EMPTY;
  const index = buildIndex();

  let segment = textBeforeCaret.slice(-MAX_LOOKBACK);
  let lastBreak = -1;
  CONTEXT_BREAK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CONTEXT_BREAK_RE.exec(segment))) lastBreak = m.index + m[0].length;
  if (lastBreak >= 0) segment = segment.slice(lastBreak);

  const rawTokens = segment.split(/\s+/).filter(Boolean);
  if (rawTokens.length === 0) return EMPTY;

  const endsWithSpace = /\s$/.test(segment);
  const tokens = rawTokens.slice(-3).map(normalizeWord).filter(Boolean);
  if (tokens.length === 0) return EMPTY;

  const scores = new Map<string, number>();
  const matchedKeys = new Set<string>();
  const add = (entries: IndexEntry[] | undefined, weight: number, key: string) => {
    if (!entries) return;
    matchedKeys.add(key);
    for (const entry of entries) {
      entry.emojis.forEach((e, i) => {
        const s = weight * entry.w * (1 - i * 0.12);
        scores.set(e, Math.max(scores.get(e) || 0, s) + s * 0.15);
      });
    }
  };

  const n = tokens.length;
  // 1. Multi-word phrases ending at the last token (e.g. "صباح الخير", "good morning")
  for (let len = Math.min(3, n); len >= 2; len--) {
    const phrase = tokens.slice(n - len).join(" ");
    add(index.get(phrase), 1.3 + len * 0.1, phrase);
  }

  // 2. Individual tokens — most recent word weighs most
  tokens.forEach((tok, i) => {
    const recency = (i + 1) / n; // 1 for last token
    const weight = 0.55 + 0.45 * recency;
    let hit = false;
    for (const v of wordVariants(tok)) {
      const entries = index.get(v);
      if (entries) {
        add(entries, weight, v);
        hit = true;
        break;
      }
    }
    // 3. Prefix match for the word currently being typed
    const isTyping = i === n - 1 && !endsWithSpace;
    if (!hit && isTyping && tok.length >= 3) {
      for (const k of keysWithPrefix(tok, 4)) add(index.get(k), 0.75, k);
    }
  });

  if (scores.size === 0) return EMPTY;

  // 4. Learned boost from this agent's previous picks
  const s = getStats();
  for (const k of matchedKeys) {
    const bucket = s[k];
    if (!bucket) continue;
    for (const [emoji, count] of Object.entries(bucket)) {
      if (scores.has(emoji)) scores.set(emoji, scores.get(emoji)! + Math.min(count, 10) * 0.08);
    }
  }

  const emojis = Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([e]) => e);

  return { emojis, keywords: Array.from(matchedKeys) };
}
