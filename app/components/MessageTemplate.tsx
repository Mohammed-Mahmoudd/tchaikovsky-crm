"use client";

import React from "react";

export interface TemplateButton {
  title: string;
  type?: string;
  url?: string;
  payload?: string;
}

export interface TemplateElement {
  title: string;
  subtitle?: string;
  imageUrl?: string;
  url?: string;
  buttons: TemplateButton[];
}

interface MessageTemplateProps {
  attachment: any;
  isIncoming: boolean;
  senderPhone?: string;
}

/**
 * Format phone numbers into clean Saudi display format: +966 55 108 3674
 */
export function formatDisplayPhone(raw: string): string {
  if (!raw) return "";
  const digits = raw.replace(/[^\d]/g, "");
  // Saudi 05xxxxxxxx -> +966 5x xxx xxxx
  if (digits.startsWith("05") && digits.length === 10) {
    return `+966 ${digits.slice(1, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  // Saudi 9665xxxxxxxx -> +966 5x xxx xxxx
  if (digits.startsWith("9665") && digits.length === 12) {
    return `+966 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }
  if (raw.startsWith("+")) return raw;
  return digits.length >= 7 ? `+${digits}` : raw;
}

/**
 * Extract clean phone digits for WhatsApp / tel links
 */
export function extractCleanDigits(phoneCandidate: string): string {
  if (!phoneCandidate) return "";
  let rawDigits = phoneCandidate.replace(/[^\d]/g, "");
  if (!rawDigits) return "";
  // Saudi 05xxxxxxxx (10 digits) -> 9665xxxxxxxx
  if (rawDigits.startsWith("05") && rawDigits.length === 10) {
    return `966${rawDigits.slice(1)}`;
  }
  // Saudi 5xxxxxxxx (9 digits without leading 0) -> 9665xxxxxxxx
  if (rawDigits.startsWith("5") && rawDigits.length === 9) {
    return `966${rawDigits}`;
  }
  if (rawDigits.startsWith("966")) {
    return rawDigits;
  }
  return rawDigits;
}

function resolveButtonAction(btn: TemplateButton, contextSubtitle?: string, fallbackPhone?: string) {
  // If button already has a direct valid web URL
  if (btn.url && (btn.url.startsWith("http://") || btn.url.startsWith("https://"))) {
    return { href: btn.url, target: "_blank", isActionable: true };
  }

  // Extract phone candidate from button payload, subtitle, or fallback phone
  const phoneCandidate =
    btn.payload ||
    (contextSubtitle && /\+?[0-9\s-]{7,}/.test(contextSubtitle) ? contextSubtitle : "") ||
    fallbackPhone ||
    "";

  const cleanDigits = extractCleanDigits(phoneCandidate);
  const titleLower = (btn.title || "").toLowerCase();

  // WhatsApp message button
  if (titleLower.includes("whatsapp")) {
    if (cleanDigits && cleanDigits.length >= 7) {
      return { href: `https://wa.me/${cleanDigits}`, target: "_blank", isActionable: true };
    }
  }

  // Call button
  if (titleLower.includes("call") || btn.type === "phone_number") {
    if (cleanDigits && cleanDigits.length >= 7) {
      return { href: `tel:+${cleanDigits}`, target: "_self", isActionable: true };
    }
  }

  if (btn.url) {
    return { href: btn.url, target: "_blank", isActionable: true };
  }

  return { href: undefined, target: undefined, isActionable: false };
}

export function parseTemplateAttachment(
  att: any,
  isIncoming?: boolean,
  senderPhone?: string
): TemplateElement[] {
  if (!att) return [];

  const payload = att.payload || {};

  // Extract raw elements from all possible Meta Graph API / Webhook payload paths:
  // 1. payload.generic.elements (Instagram webhook & Graph API)
  // 2. payload.button.elements
  // 3. payload.elements (Facebook Messenger webhook)
  // 4. att.elements
  const rawElements = Array.isArray(payload.generic?.elements)
    ? payload.generic.elements
    : Array.isArray(payload.button?.elements)
    ? payload.button.elements
    : Array.isArray(payload.elements)
    ? payload.elements
    : Array.isArray(att.elements)
    ? att.elements
    : [];

  // Case 1: Generic elements array found and populated
  if (rawElements.length > 0) {
    return rawElements.map((el: any) => {
      let title = (el.title || "").trim();
      let subtitle = (el.subtitle || "").trim();

      // If title has newline (e.g. "Thanks, you're all set. \nHi! Thank you for connecting with us."),
      // split into bold heading and subtitle body
      if (!subtitle && title.includes("\n")) {
        const lines = title.split("\n");
        title = lines[0].trim();
        subtitle = lines.slice(1).join("\n").trim();
      }

      const buttons = Array.isArray(el.buttons)
        ? el.buttons.map((b: any) => ({
            title: b.title || b.text || "Open",
            type: b.type || "web_url",
            url: b.url || "",
            payload: b.payload || "",
          }))
        : [];

      return {
        title,
        subtitle,
        imageUrl: el.image_url || el.imageUrl || "",
        url: el.default_action?.url || el.url || "",
        buttons,
      };
    });
  }

  // Case 2: Incoming lead ad form submission where Meta sends elements: []
  if (isIncoming && senderPhone) {
    const cleanDigits = extractCleanDigits(senderPhone);
    if (cleanDigits && cleanDigits.length >= 7) {
      const displayPhone = formatDisplayPhone(senderPhone);
      return [
        {
          title: "Phone number",
          subtitle: displayPhone,
          buttons: [
            {
              title: "WhatsApp message",
              type: "whatsapp",
              payload: displayPhone,
            },
            {
              title: "WhatsApp call",
              type: "phone_number",
              payload: displayPhone,
            },
          ],
        },
      ];
    }
  }

  // Case 3: Button template or text with action buttons
  const text = payload.text || payload.generic?.text || att.title || att.name || "";
  const rawButtons = Array.isArray(payload.buttons)
    ? payload.buttons
    : Array.isArray(payload.generic?.buttons)
    ? payload.generic.buttons
    : Array.isArray(att.buttons)
    ? att.buttons
    : [];

  if (text || rawButtons.length > 0) {
    let title = text.trim();
    let subtitle = (payload.subtitle || att.description || "").trim();
    if (!subtitle && title.includes("\n")) {
      const lines = title.split("\n");
      title = lines[0].trim();
      subtitle = lines.slice(1).join("\n").trim();
    }

    return [
      {
        title: title || "Form / Template",
        subtitle,
        imageUrl: payload.image_url || att.image_url || "",
        url: payload.url || att.url || "",
        buttons: rawButtons.map((b: any) => ({
          title: b.title || b.text || "Open",
          type: b.type || "web_url",
          url: b.url || "",
          payload: b.payload || "",
        })),
      },
    ];
  }

  // Case 4: Incoming lead without parsed phone
  if (isIncoming) {
    return [
      {
        title: "Lead form submitted",
        subtitle: "Customer submitted contact information",
        buttons: [],
      },
    ];
  }

  // Case 5: Outgoing or generic fallback
  if (att.title || att.description) {
    return [
      {
        title: att.title || "Confirmation",
        subtitle: att.description || "",
        imageUrl: att.image_data?.url || att.image_url || "",
        url: att.target?.url || att.url || "",
        buttons: [],
      },
    ];
  }

  return [
    {
      title: "Confirmation",
      subtitle: "",
      buttons: [],
    },
  ];
}

export default function MessageTemplate({
  attachment,
  isIncoming,
  senderPhone,
}: MessageTemplateProps) {
  const elements = parseTemplateAttachment(attachment, isIncoming, senderPhone);
  if (elements.length === 0) return null;

  const isCarousel = elements.length > 1;

  const renderCard = (el: TemplateElement, idx: number) => {
    return (
      <div
        key={idx}
        className={`rounded-xl p-2.5 sm:p-3 text-start transition-all ${
          isCarousel
            ? "snap-start min-w-[170px] max-w-[200px] shrink-0"
            : "w-full max-w-[260px] sm:max-w-[280px]"
        }`}
        style={{
          background: isIncoming ? "var(--bg-pill)" : "var(--bg-card)",
          border: "1px solid var(--border-main)",
        }}
      >
        {el.imageUrl && (
          <div className="mb-2 overflow-hidden rounded-lg">
            <img
              src={el.imageUrl}
              alt={el.title || "Attachment"}
              className="w-full max-h-32 object-cover rounded-lg"
            />
          </div>
        )}

        {el.title && (
          <div
            className="text-[12px] sm:text-[13px] font-semibold leading-snug"
            style={{ color: "var(--text-primary)" }}
          >
            {el.title}
          </div>
        )}

        {el.subtitle && (
          <div
            className="text-[11px] sm:text-[12px] leading-relaxed mt-0.5 whitespace-pre-line"
            style={{ color: "var(--text-secondary)" }}
          >
            {el.subtitle}
          </div>
        )}

        {el.buttons && el.buttons.length > 0 && (
          <div className="mt-2.5 flex flex-col gap-1.5">
            {el.buttons.map((btn, bIdx) => {
              const action = resolveButtonAction(btn, el.subtitle, senderPhone);
              const buttonClasses =
                "w-full py-1.5 px-2 rounded-lg text-[11px] sm:text-[12px] font-medium text-center transition-colors flex items-center justify-center select-none active:scale-[0.99]";

              if (action.isActionable && action.href) {
                return (
                  <a
                    key={bIdx}
                    href={action.href}
                    target={action.target}
                    rel={action.target === "_blank" ? "noopener noreferrer" : undefined}
                    className={buttonClasses}
                    style={{
                      background: "var(--bg-card)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border-main)",
                      boxShadow: "var(--shadow-card)",
                    }}
                  >
                    <span className="truncate">{btn.title}</span>
                  </a>
                );
              }

              return (
                <div
                  key={bIdx}
                  className={buttonClasses}
                  style={{
                    background: "var(--bg-card)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-main)",
                    boxShadow: "var(--shadow-card)",
                  }}
                >
                  <span className="truncate">{btn.title}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  if (isCarousel) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x scrollbar-thin">
        {elements.map(renderCard)}
      </div>
    );
  }

  return renderCard(elements[0], 0);
}
