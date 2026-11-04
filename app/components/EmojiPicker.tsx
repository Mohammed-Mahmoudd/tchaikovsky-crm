"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Search, X, Clock, Smile, Hand, Heart, Music, Coffee, Sparkles } from "lucide-react";

export const SCHOOL_PRIORITY_EMOJIS = ["👍🏻", "❤️", "🌹", "🙏", "🎹", "✨"];

export const WHATSAPP_QUICK_REACTIONS = ["👍🏻", "❤️", "🌹", "😂", "😮", "🙏"];

const RECENT_EMOJIS_KEY = "crm_whatsapp_recent_emojis";
const DEFAULT_RECENT = ["👍🏻", "❤️", "🌹", "🙏", "🎹", "🎵", "😊", "🎉", "🔥", "✅", "👏", "💯", "✨", "🤝", "😍", "🙌"];

type EmojiItem = {
  e: string;
  k: string; // keywords for instant search
};

type EmojiCategory = {
  id: string;
  label: string;
  icon: React.ReactNode;
  items: EmojiItem[];
};

const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: "smileys",
    label: "Smileys & People",
    icon: <Smile className="w-4 h-4" />,
    items: [
      { e: "😀", k: "grinning smile happy" },
      { e: "😃", k: "smiley happy joy" },
      { e: "😄", k: "smile happy laugh" },
      { e: "😁", k: "grin happy" },
      { e: "😆", k: "laughing satisfied" },
      { e: "😅", k: "sweat smile relief" },
      { e: "🤣", k: "rofl rolling laughing" },
      { e: "😂", k: "joy tears laugh" },
      { e: "🙂", k: "slight smile" },
      { e: "🙃", k: "upside down" },
      { e: "😉", k: "wink" },
      { e: "😊", k: "blush warm smile" },
      { e: "😇", k: "innocent angel halo" },
      { e: "🥰", k: "smiling hearts love adore" },
      { e: "😍", k: "heart eyes love" },
      { e: "🤩", k: "star struck excited" },
      { e: "😘", k: "kissing heart" },
      { e: "😗", k: "kissing" },
      { e: "😚", k: "kissing closed eyes" },
      { e: "😋", k: "yum delicious" },
      { e: "😛", k: "stuck out tongue" },
      { e: "😜", k: "wink tongue playful" },
      { e: "🤪", k: "zany crazy" },
      { e: "🤗", k: "hugging hug warm" },
      { e: "🤭", k: "hand over mouth giggle" },
      { e: "🤫", k: "shushing quiet secret" },
      { e: "🤔", k: "thinking hmm" },
      { e: "🫡", k: "salute respect" },
      { e: "🤨", k: "raised eyebrow skeptical" },
      { e: "😐", k: "neutral" },
      { e: "😑", k: "expressionless" },
      { e: "😌", k: "relieved calm" },
      { e: "😔", k: "pensive sad" },
      { e: "😪", k: "sleepy" },
      { e: "😴", k: "sleeping zzz" },
      { e: "🥳", k: "partying celebrate birthday" },
      { e: "😎", k: "sunglasses cool" },
      { e: "🤓", k: "nerd glasses smart" },
      { e: "🧐", k: "monocle inspect" },
      { e: "😕", k: "confused" },
      { e: "😟", k: "worried" },
      { e: "🙁", k: "slightly frowning" },
      { e: "😮", k: "open mouth wow surprised" },
      { e: "😯", k: "hushed surprised" },
      { e: "😲", k: "astonished shocked" },
      { e: "😳", k: "flushed embarrassed" },
      { e: "🥺", k: "pleading puppy eyes" },
      { e: "🥹", k: "holding back tears proud grateful" },
      { e: "😢", k: "cry sad tear" },
      { e: "😭", k: "sob crying loud" },
      { e: "😱", k: "scream shock" },
      { e: "😓", k: "sweat downcast" },
      { e: "😤", k: "triumph steam frustrated" },
      { e: "😠", k: "angry" },
      { e: "😷", k: "mask sick" },
      { e: "🤒", k: "thermometer sick" },
      { e: "🤕", k: "bandage hurt" },
    ],
  },
  {
    id: "gestures",
    label: "Hands & Gestures",
    icon: <Hand className="w-4 h-4" />,
    items: [
      { e: "👍🏻", k: "thumbs up light skin tone yes ok good approve" },
      { e: "👍", k: "thumbs up yes ok good approve" },
      { e: "👎", k: "thumbs down no" },
      { e: "👏", k: "clap applause bravo" },
      { e: "🙌", k: "raised hands hooray" },
      { e: "🤝", k: "handshake deal welcome" },
      { e: "🙏", k: "pray thank you please namaste" },
      { e: "🫶", k: "heart hands love thank" },
      { e: "👐", k: "open hands" },
      { e: "🤲", k: "palms up together dua" },
      { e: "✌️", k: "peace victory" },
      { e: "🤞", k: "crossed fingers luck" },
      { e: "🤟", k: "love you gesture" },
      { e: "👌", k: "ok hand perfect" },
      { e: "🤌", k: "pinched fingers" },
      { e: "👈", k: "point left" },
      { e: "👉", k: "point right" },
      { e: "👆", k: "point up" },
      { e: "👇", k: "point down" },
      { e: "☝️", k: "index up" },
      { e: "✋", k: "raised hand stop high five" },
      { e: "👋", k: "wave hello hi bye" },
      { e: "💪", k: "muscle strong flex" },
      { e: "✍️", k: "writing hand note" },
      { e: "👀", k: "eyes look see" },
    ],
  },
  {
    id: "hearts",
    label: "Hearts & Symbols",
    icon: <Heart className="w-4 h-4" />,
    items: [
      { e: "❤️", k: "red heart love" },
      { e: "🧡", k: "orange heart" },
      { e: "💛", k: "yellow heart" },
      { e: "💚", k: "green heart" },
      { e: "💙", k: "blue heart" },
      { e: "💜", k: "purple heart" },
      { e: "🖤", k: "black heart" },
      { e: "🤍", k: "white heart" },
      { e: "🤎", k: "brown heart" },
      { e: "💔", k: "broken heart" },
      { e: "❣️", k: "heart exclamation" },
      { e: "💕", k: "two hearts" },
      { e: "💞", k: "revolving hearts" },
      { e: "💓", k: "beating heart" },
      { e: "💗", k: "growing heart" },
      { e: "💖", k: "sparkling heart" },
      { e: "💘", k: "cupid heart arrow" },
      { e: "💝", k: "gift heart" },
      { e: "💯", k: "100 percent perfect score" },
      { e: "✅", k: "check mark yes done confirmed" },
      { e: "☑️", k: "check box" },
      { e: "✔️", k: "check tick" },
      { e: "❌", k: "cross mark no cancel" },
      { e: "❗", k: "exclamation important" },
      { e: "❓", k: "question" },
      { e: "⭐", k: "star" },
      { e: "🌟", k: "glowing star shine" },
      { e: "✨", k: "sparkles magic shine" },
      { e: "🔥", k: "fire hot lit" },
      { e: "⚡", k: "zap lightning fast" },
      { e: "💫", k: "dizzy star" },
      { e: "💬", k: "speech bubble chat" },
    ],
  },
  {
    id: "music",
    label: "Music & Celebration",
    icon: <Music className="w-4 h-4" />,
    items: [
      { e: "🎹", k: "piano keyboard music tchaikovsky" },
      { e: "🎻", k: "violin cello strings music" },
      { e: "🎸", k: "guitar music" },
      { e: "🎵", k: "musical note song" },
      { e: "🎶", k: "musical notes melody" },
      { e: "🎼", k: "musical score clef" },
      { e: "🎤", k: "microphone vocal sing audition" },
      { e: "🎧", k: "headphones listen" },
      { e: "🥁", k: "drum percussion" },
      { e: "🎷", k: "saxophone jazz" },
      { e: "🎺", k: "trumpet brass" },
      { e: "🪗", k: "accordion" },
      { e: "🪈", k: "flute wind" },
      { e: "🎭", k: "performing arts theater" },
      { e: "🎨", k: "art palette" },
      { e: "🎬", k: "clapper board" },
      { e: "🎉", k: "party popper congrats celebrate" },
      { e: "🎊", k: "confetti ball celebrate" },
      { e: "🎈", k: "balloon party" },
      { e: "🎂", k: "birthday cake" },
      { e: "🎁", k: "gift present" },
      { e: "🏆", k: "trophy winner award" },
      { e: "🥇", k: "first place gold medal" },
      { e: "🎖️", k: "medal honor" },
      { e: "🎓", k: "graduation cap student academy" },
      { e: "👑", k: "crown king queen" },
    ],
  },
  {
    id: "nature",
    label: "Nature & Food",
    icon: <Coffee className="w-4 h-4" />,
    items: [
      { e: "🌹", k: "rose flower" },
      { e: "🌸", k: "cherry blossom flower" },
      { e: "💐", k: "bouquet flowers" },
      { e: "🌷", k: "tulip flower" },
      { e: "🌻", k: "sunflower" },
      { e: "🌺", k: "hibiscus" },
      { e: "🍀", k: "four leaf clover luck" },
      { e: "🌿", k: "herb plant" },
      { e: "🌴", k: "palm tree" },
      { e: "☀️", k: "sun sunny morning" },
      { e: "🌙", k: "crescent moon night" },
      { e: "🌈", k: "rainbow" },
      { e: "☕", k: "coffee tea cup" },
      { e: "🍵", k: "tea" },
      { e: "🍰", k: "cake slice" },
      { e: "🍫", k: "chocolate" },
      { e: "🍬", k: "candy sweet" },
      { e: "🍎", k: "apple" },
      { e: "🍓", k: "strawberry" },
      { e: "🍕", k: "pizza" },
    ],
  },
  {
    id: "objects",
    label: "Objects & Schedule",
    icon: <Sparkles className="w-4 h-4" />,
    items: [
      { e: "📅", k: "calendar date schedule" },
      { e: "📆", k: "tear off calendar audition" },
      { e: "⏰", k: "alarm clock time" },
      { e: "⏳", k: "hourglass waiting" },
      { e: "📍", k: "round pushpin location branch" },
      { e: "📞", k: "telephone receiver call" },
      { e: "📱", k: "mobile phone whatsapp" },
      { e: "💻", k: "laptop computer" },
      { e: "📝", k: "memo note form" },
      { e: "📋", k: "clipboard list" },
      { e: "📚", k: "books study class" },
      { e: "📖", k: "open book lesson" },
      { e: "✏️", k: "pencil edit" },
      { e: "📌", k: "pushpin pin" },
      { e: "📎", k: "paperclip attachment" },
      { e: "🔑", k: "key" },
      { e: "💡", k: "light bulb idea" },
      { e: "🔔", k: "bell reminder notification" },
      { e: "📣", k: "megaphone announcement" },
      { e: "💰", k: "money bag payment cash" },
      { e: "💳", k: "credit card payment" },
      { e: "🧾", k: "receipt invoice" },
      { e: "🚗", k: "car" },
      { e: "🏠", k: "house home" },
    ],
  },
];

function getRecentEmojis(): string[] {
  if (typeof window === "undefined") return DEFAULT_RECENT;
  try {
    const raw = localStorage.getItem(RECENT_EMOJIS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Ensure school priority emojis (👍🏻, 🌹, etc.) are always present and prioritized at the top of Recently used
        const nonPriority = parsed.filter((e) => !SCHOOL_PRIORITY_EMOJIS.includes(e));
        return [...SCHOOL_PRIORITY_EMOJIS, ...nonPriority].slice(0, 24);
      }
    }
  } catch {}
  return DEFAULT_RECENT;
}

export function recordRecentEmoji(emoji: string) {
  if (typeof window === "undefined" || !emoji) return;
  try {
    const current = getRecentEmojis();
    const updated = [emoji, ...current.filter((e) => e !== emoji)].slice(0, 24);
    localStorage.setItem(RECENT_EMOJIS_KEY, JSON.stringify(updated));
  } catch {}
}

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  position?: "top" | "bottom";
  align?: "left" | "right";
  fixedStyle?: React.CSSProperties;
}

export const EmojiPicker = React.memo(function EmojiPicker({
  onSelect,
  onClose,
  position = "top",
  align = "left",
  fixedStyle,
}: EmojiPickerProps) {
  const [activeTab, setActiveTab] = useState<string>("recent");
  const [search, setSearch] = useState("");
  const [recent, setRecent] = useState<string[]>(getRecentEmojis);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecent(getRecentEmojis());
  }, []);

  // Close on click outside or Escape
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    const results: string[] = [];
    const seen = new Set<string>();
    for (const cat of EMOJI_CATEGORIES) {
      for (const item of cat.items) {
        if ((item.k.includes(q) || item.e === q) && !seen.has(item.e)) {
          seen.add(item.e);
          results.push(item.e);
        }
      }
    }
    return results;
  }, [search]);

  const handlePick = (emoji: string) => {
    recordRecentEmoji(emoji);
    setRecent(getRecentEmojis());
    onSelect(emoji);
  };

  const currentCategory = EMOJI_CATEGORIES.find((c) => c.id === activeTab);

  return (
    <div
      ref={containerRef}
      onClick={(e) => e.stopPropagation()}
      className={`${
        fixedStyle
          ? "fixed z-[70]"
          : `absolute z-50 ${position === "top" ? "bottom-full mb-2" : "top-full mt-2"} ${
              align === "right" ? "right-0" : "left-0"
            }`
      } w-[300px] sm:w-[330px] rounded-2xl shadow-2xl border flex flex-col overflow-hidden select-none animate-in fade-in zoom-in-95 duration-100`}
      style={{
        background: "var(--bg-card)",
        borderColor: "var(--border-main)",
        boxShadow: "0 12px 32px rgba(0, 0, 0, 0.28)",
        ...fixedStyle,
      }}
    >
      {/* Category Navigation Bar (WhatsApp Web style) */}
      <div
        className="flex items-center justify-between px-2 py-1.5 border-b"
        style={{ background: "var(--bg-panel)", borderColor: "var(--border-main)" }}
      >
        <button
          type="button"
          onClick={() => {
            setSearch("");
            setActiveTab("recent");
          }}
          title="Recent"
          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
            activeTab === "recent" && !search ? "text-[#0066FF]" : ""
          }`}
          style={{
            color: activeTab === "recent" && !search ? "#0066FF" : "var(--text-secondary)",
            background: activeTab === "recent" && !search ? "var(--bg-selected)" : "transparent",
          }}
        >
          <Clock className="w-4 h-4" />
        </button>
        {EMOJI_CATEGORIES.map((cat) => {
          const isActive = activeTab === cat.id && !search;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                setSearch("");
                setActiveTab(cat.id);
              }}
              title={cat.label}
              className="p-1.5 rounded-lg transition-colors cursor-pointer"
              style={{
                color: isActive ? "#0066FF" : "var(--text-secondary)",
                background: isActive ? "var(--bg-selected)" : "transparent",
              }}
            >
              {cat.icon}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onClose}
          title="Close"
          className="p-1.5 rounded-lg transition-colors cursor-pointer hover:opacity-80"
          style={{ color: "var(--text-muted)" }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Search Input */}
      <div className="p-2 border-b" style={{ borderColor: "var(--border-main)" }}>
        <div
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
          style={{ background: "var(--bg-input)", border: "1px solid var(--border-input)" }}
        >
          <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-muted)" }} />
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search emoji..."
            className="w-full text-[12px] bg-transparent outline-none"
            style={{ color: "var(--text-primary)" }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-[11px]"
              style={{ color: "var(--text-muted)" }}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Emoji Grid */}
      <div className="h-[210px] overflow-y-auto p-2.5">
        {filteredItems !== null ? (
          <>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5 px-1" style={{ color: "var(--text-muted)" }}>
              Search Results ({filteredItems.length})
            </p>
            {filteredItems.length === 0 ? (
              <div className="h-[150px] flex items-center justify-center text-[12px]" style={{ color: "var(--text-secondary)" }}>
                No matching emojis found
              </div>
            ) : (
              <div className="grid grid-cols-8 gap-1">
                {filteredItems.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handlePick(emoji)}
                    className="h-8 w-8 flex items-center justify-center text-[20px] rounded-lg border border-transparent hover:border-[#0066FF] transition-colors cursor-pointer"
                    style={{ background: "transparent" }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : activeTab === "recent" ? (
          <>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5 px-1" style={{ color: "var(--text-muted)" }}>
              Recently Used
            </p>
            <div className="grid grid-cols-8 gap-1">
              {recent.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handlePick(emoji)}
                  className="h-8 w-8 flex items-center justify-center text-[20px] rounded-lg border border-transparent hover:border-[#0066FF] transition-colors cursor-pointer"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </>
        ) : (
          currentCategory && (
            <>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5 px-1" style={{ color: "var(--text-muted)" }}>
                {currentCategory.label}
              </p>
              <div className="grid grid-cols-8 gap-1">
                {currentCategory.items.map((item) => (
                  <button
                    key={item.e}
                    type="button"
                    onClick={() => handlePick(item.e)}
                    className="h-8 w-8 flex items-center justify-center text-[20px] rounded-lg border border-transparent hover:border-[#0066FF] transition-colors cursor-pointer"
                  >
                    {item.e}
                  </button>
                ))}
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
});

