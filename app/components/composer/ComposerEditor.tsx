"use client";

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import {
  CLEAR_HISTORY_COMMAND,
  COMMAND_PRIORITY_HIGH,
  FORMAT_TEXT_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_DOWN_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
  PASTE_COMMAND,
  TextNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  $setTextFormat,
  type EditorThemeClasses,
  type LexicalEditor,
  type LexicalNode,
  type ParagraphNode,
  type PointType,
  type RangeSelection,
  type TextFormatType,
} from "lexical";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type { FormatAction } from "../ComposerAssistBar";
import {
  extractMentionSpans,
  type ComposerMentionItem,
  type GroupParticipant,
  type MessageMention,
} from "../../utils/groupMentions";
import {
  EMPTY_COMPOSER_FORMAT,
  computeListContinuation,
  expandCrossParagraphEndpointsToWordBoundaries,
  expandRangeToWhatsAppWordBoundaries,
  matchInlineWhatsAppShortcut,
  parseWhatsAppToParagraphs,
  serializeParagraphsToWhatsApp,
  toggleParagraphPrefixEdit,
  type ComposerFormatFlags,
  type ComposerParagraph,
  type ComposerSegment,
  type SerializedComposerPayload,
} from "../../utils/composerCodec";
import { $createMentionNode, $isMentionNode, MentionNode } from "./MentionNode";

export interface ComposerSnapshot {
  text: string;
  paragraphTextBeforeCaret: string;
  textBeforeCaret: string;
  paragraphCount: number;
  mentions: MessageMention[];
  mentionAll: boolean;
  activeFormats: ComposerFormatFlags;
  isEmpty: boolean;
}

export interface ComposerEditorHandle {
  focus: () => void;
  clear: () => void;
  setContent: (
    text: string,
    opts?: {
      mentions?: MessageMention[];
      mentionAll?: boolean;
      participants?: GroupParticipant[];
      clearHistory?: boolean;
    }
  ) => void;
  insertText: (value: string) => void;
  replaceBeforeCaret: (
    charCount: number,
    replacementText: string,
    opts?: { parseFormatting?: boolean }
  ) => void;
  insertMention: (charCount: number, mention: ComposerMentionItem) => void;
  applyFormat: (action: FormatAction) => void;
  getPayload: () => SerializedComposerPayload;
}

export type ComposerPopoverKey =
  | "ArrowUp"
  | "ArrowDown"
  | "Enter"
  | "Tab"
  | "Escape";

interface ComposerEditorProps {
  placeholder: string;
  disabled: boolean;
  supportsFormatting: boolean;
  isMultiline?: boolean;
  onWrapMultiline?: () => void;
  onSnapshotChange: (snapshot: ComposerSnapshot) => void;
  onSend: () => void;
  onPasteFiles?: (files: File[]) => void;
  onPopoverKey?: (key: ComposerPopoverKey) => boolean;
  ariaLabel?: string;
}

const COMPOSER_THEME: EditorThemeClasses = {
  paragraph: "composer-p",
  text: {
    bold: "composer-b",
    italic: "composer-i",
    strikethrough: "composer-s",
    code: "composer-code",
  },
};

function isTouchOnlyDevice(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(pointer: coarse) and (hover: none)").matches;
}

function getFormatBitmask(format: ComposerFormatFlags): number {
  let mask = 0;
  if (format.bold) mask |= 1;
  if (format.italic) mask |= 2;
  if (format.strikethrough) mask |= 4;
  if (format.code) mask |= 16;
  return mask;
}

function createNodesFromSegments(segments: ComposerSegment[]): LexicalNode[] {
  const nodes: LexicalNode[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg.text) continue;
    if (seg.kind === "mention") {
      nodes.push($createMentionNode(seg.mention, seg.text));
    } else {
      const textNode = $createTextNode(seg.text);
      const mask = getFormatBitmask(seg.format);
      if (mask !== 0) {
        textNode.setFormat(mask);
      }
      nodes.push(textNode);
    }
  }
  return nodes;
}

function extractParagraphsFromRoot(): ComposerParagraph[] {
  const root = $getRoot();
  const children = root.getChildren();
  const paragraphs: ComposerParagraph[] = [];

  for (let i = 0; i < children.length; i++) {
    const block = children[i];
    if ($isElementNode(block)) {
      let currentSegments: ComposerSegment[] = [];
      const blockChildren = block.getChildren();
      for (let j = 0; j < blockChildren.length; j++) {
        const leaf = blockChildren[j];
        if ($isLineBreakNode(leaf)) {
          paragraphs.push({ segments: currentSegments });
          currentSegments = [];
          continue;
        }
        if ($isMentionNode(leaf)) {
          currentSegments.push({
            kind: "mention",
            text: leaf.getTextContent(),
            mention: leaf.getMention(),
          });
        } else if ($isTextNode(leaf)) {
          currentSegments.push({
            kind: "text",
            text: leaf.getTextContent(),
            format: {
              bold: leaf.hasFormat("bold"),
              italic: leaf.hasFormat("italic"),
              strikethrough: leaf.hasFormat("strikethrough"),
              code: leaf.hasFormat("code"),
            },
          });
        }
      }
      paragraphs.push({ segments: currentSegments });
    } else if ($isTextNode(block)) {
      paragraphs.push({
        segments: [
          {
            kind: "text",
            text: block.getTextContent(),
            format: {
              bold: block.hasFormat("bold"),
              italic: block.hasFormat("italic"),
              strikethrough: block.hasFormat("strikethrough"),
              code: block.hasFormat("code"),
            },
          },
        ],
      });
    }
  }

  return paragraphs.length > 0 ? paragraphs : [{ segments: [] }];
}

function getTextBeforePointInParagraph(
  paragraph: ParagraphNode,
  pointKey: string,
  pointOffset: number,
  pointType: "text" | "element"
): string {
  const children = paragraph.getChildren();
  if (pointType === "element" && pointKey === paragraph.getKey()) {
    let out = "";
    const limit = Math.min(pointOffset, children.length);
    for (let i = 0; i < limit; i++) {
      out += children[i].getTextContent();
    }
    return out;
  }

  let out = "";
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.getKey() === pointKey) {
      if (pointType === "text") {
        out += child.getTextContent().slice(0, pointOffset);
      }
      break;
    }
    out += child.getTextContent();
  }
  return out;
}

function readEditorSnapshot(supportsFormatting: boolean): ComposerSnapshot {
  const paragraphs = extractParagraphsFromRoot();
  const payload = serializeParagraphsToWhatsApp(paragraphs, supportsFormatting);
  const isEmpty =
    paragraphs.length === 0 ||
    (paragraphs.length === 1 && paragraphs[0].segments.every((s) => !s.text));

  let paragraphTextBeforeCaret = "";
  let textBeforeCaret = "";
  let activeFormats: ComposerFormatFlags = EMPTY_COMPOSER_FORMAT;

  const selection = $getSelection();
  if ($isRangeSelection(selection)) {
    activeFormats = {
      bold: selection.hasFormat("bold"),
      italic: selection.hasFormat("italic"),
      strikethrough: selection.hasFormat("strikethrough"),
      code: selection.hasFormat("code"),
    };

    const caretPoint = selection.isBackward() ? selection.anchor : selection.focus;
    const topElement = caretPoint.getNode().getTopLevelElement();
    if ($isParagraphNode(topElement)) {
      paragraphTextBeforeCaret = getTextBeforePointInParagraph(
        topElement,
        caretPoint.key,
        caretPoint.offset,
        caretPoint.type
      );
      const rootChildren = $getRoot().getChildren();
      const topIdx = rootChildren.indexOf(topElement);
      if (topIdx <= 0) {
        textBeforeCaret = paragraphTextBeforeCaret;
      } else {
        const priorLines: string[] = [];
        for (let i = 0; i < topIdx; i++) {
          priorLines.push(rootChildren[i].getTextContent());
        }
        priorLines.push(paragraphTextBeforeCaret);
        textBeforeCaret = priorLines.join("\n");
      }
    }
  }

  return {
    text: payload.text,
    paragraphTextBeforeCaret,
    textBeforeCaret,
    paragraphCount: Math.max(1, paragraphs.length),
    mentions: payload.mentions,
    mentionAll: payload.mentionAll,
    activeFormats,
    isEmpty,
  };
}

function selectBackwardInParagraph(
  selection: RangeSelection,
  charCount: number
): boolean {
  if (charCount <= 0) return true;
  if (!selection.isCollapsed()) {
    selection.removeText();
  }

  const anchor = selection.anchor;
  const topEl = anchor.getNode().getTopLevelElement();
  if (!$isParagraphNode(topEl)) return false;

  if (anchor.type === "text") {
    const anchorNode = anchor.getNode();
    if ($isTextNode(anchorNode) && anchor.offset >= charCount) {
      selection.anchor.set(anchorNode.getKey(), anchor.offset - charCount, "text");
      return true;
    }
  }

  const children = topEl.getChildren();
  let caretOffset = 0;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (anchor.type === "element" && anchor.key === topEl.getKey() && i === anchor.offset) {
      break;
    }
    if (child.getKey() === anchor.key) {
      caretOffset += anchor.type === "text" ? anchor.offset : child.getTextContentSize();
      break;
    }
    caretOffset += child.getTextContentSize();
  }

  const targetStart = Math.max(0, caretOffset - charCount);
  let acc = 0;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const len = child.getTextContentSize();
    if (targetStart < acc + len || i === children.length - 1) {
      const localOffset = Math.max(0, Math.min(len, targetStart - acc));
      if ($isTextNode(child)) {
        selection.anchor.set(child.getKey(), localOffset, "text");
      } else {
        selection.anchor.set(topEl.getKey(), i, "element");
      }
      return true;
    }
    acc += len;
  }

  return false;
}

function getMaskedParagraphTextForWordBounds(para: ParagraphNode): string {
  const children = para.getChildren();
  let out = "";
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if ($isMentionNode(child) || $isLineBreakNode(child)) {
      out += " ".repeat(child.getTextContentSize());
    } else {
      out += child.getTextContent();
    }
  }
  return out;
}

function setPointAtParagraphCharOffset(
  point: PointType,
  para: ParagraphNode,
  targetOffset: number,
  edge: "start" | "end"
): void {
  const children = para.getChildren();
  if (children.length === 0) {
    point.set(para.getKey(), 0, "element");
    return;
  }

  let acc = 0;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const len = child.getTextContentSize();
    const isLast = i === children.length - 1;
    const within =
      edge === "start" ? targetOffset < acc + len || (isLast && targetOffset <= acc + len) : targetOffset <= acc + len;

    if (within) {
      if ($isTextNode(child) && !$isMentionNode(child)) {
        point.set(child.getKey(), Math.max(0, Math.min(len, targetOffset - acc)), "text");
      } else {
        const elemIdx = targetOffset <= acc ? i : i + 1;
        point.set(para.getKey(), elemIdx, "element");
      }
      return;
    }
    acc += len;
  }
  point.set(para.getKey(), children.length, "element");
}

function doesExpandedRangeAllHaveFormat(
  rootChildren: LexicalNode[],
  startParaIdx: number,
  startOffset: number,
  endParaIdx: number,
  endOffset: number,
  formatType: TextFormatType
): boolean {
  let sawNonSpaceText = false;
  for (let pIdx = startParaIdx; pIdx <= endParaIdx; pIdx++) {
    const para = rootChildren[pIdx];
    if (!$isParagraphNode(para)) continue;
    const paraLen = para.getTextContentSize();
    const lo = pIdx === startParaIdx ? startOffset : 0;
    const hi = pIdx === endParaIdx ? endOffset : paraLen;
    if (lo >= hi) continue;

    const children = para.getChildren();
    let acc = 0;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const len = child.getTextContentSize();
      const nodeStart = acc;
      const nodeEnd = acc + len;
      acc = nodeEnd;

      const overlapStart = Math.max(lo, nodeStart);
      const overlapEnd = Math.min(hi, nodeEnd);
      if (overlapStart >= overlapEnd) continue;
      if (!$isTextNode(child) || $isMentionNode(child)) continue;

      const slice = child.getTextContent().slice(overlapStart - nodeStart, overlapEnd - nodeStart);
      if (!slice.trim()) continue;
      sawNonSpaceText = true;
      if (!child.hasFormat(formatType)) {
        return false;
      }
    }
  }
  return sawNonSpaceText;
}

function scrollCaretIntoView(editor: LexicalEditor): void {
  const rootEl = editor.getRootElement();
  if (!rootEl || rootEl.scrollHeight <= rootEl.clientHeight) return;
  const domSel = typeof window !== "undefined" ? window.getSelection() : null;
  if (!domSel || domSel.rangeCount === 0 || !rootEl.contains(domSel.anchorNode)) {
    return;
  }

  const range = domSel.getRangeAt(0);
  let rect = range.getBoundingClientRect();
  if (rect.height === 0 && rect.top === 0 && rect.bottom === 0) {
    const container = range.startContainer;
    const fallbackEl =
      container instanceof HTMLElement ? container : container.parentElement;
    if (!fallbackEl) return;
    rect = fallbackEl.getBoundingClientRect();
  }
  if (rect.height === 0 && rect.top === 0 && rect.bottom === 0) return;

  const rootRect = rootEl.getBoundingClientRect();
  const buffer = 8;
  if (rect.bottom > rootRect.bottom - buffer) {
    rootEl.scrollTop += rect.bottom - (rootRect.bottom - buffer);
  } else if (rect.top < rootRect.top + buffer) {
    rootEl.scrollTop -= rootRect.top + buffer - rect.top;
  }
}

function insertParsedParagraphsAtSelection(
  selection: RangeSelection,
  paragraphs: ComposerParagraph[]
): void {
  if (paragraphs.length === 0) return;
  let activeSel: RangeSelection = selection;

  const firstNodes = createNodesFromSegments(paragraphs[0].segments);
  if (firstNodes.length > 0) {
    activeSel.insertNodes(firstNodes);
  } else if (!activeSel.isCollapsed()) {
    activeSel.removeText();
  }

  const afterFirst = $getSelection();
  if (!$isRangeSelection(afterFirst)) return;
  activeSel = afterFirst;

  if (paragraphs.length === 1) {
    activeSel.setFormat(0);
    return;
  }

  for (let i = 1; i < paragraphs.length; i++) {
    activeSel.insertParagraph();
    const afterPara = $getSelection();
    if (!$isRangeSelection(afterPara)) return;
    activeSel = afterPara;
    activeSel.setFormat(0);

    const lineNodes = createNodesFromSegments(paragraphs[i].segments);
    if (lineNodes.length > 0) {
      activeSel.insertNodes(lineNodes);
      const afterInsert = $getSelection();
      if (!$isRangeSelection(afterInsert)) return;
      activeSel = afterInsert;
    }
  }
  activeSel.setFormat(0);
}

function trimLeadingCharsFromParagraph(para: ParagraphNode, removeCount: number): void {
  let remaining = removeCount;
  const children = para.getChildren();
  for (let i = 0; i < children.length && remaining > 0; i++) {
    const child = children[i];
    if (!$isTextNode(child)) continue;
    const len = child.getTextContentSize();
    if (len <= remaining) {
      remaining -= len;
      child.remove();
    } else {
      child.spliceText(0, remaining, "", false);
      remaining = 0;
    }
  }
}

function snapshotsEqual(a: ComposerSnapshot | null, b: ComposerSnapshot): boolean {
  if (!a) return false;
  if (
    a.text !== b.text ||
    a.paragraphTextBeforeCaret !== b.paragraphTextBeforeCaret ||
    a.textBeforeCaret !== b.textBeforeCaret ||
    a.paragraphCount !== b.paragraphCount ||
    a.mentionAll !== b.mentionAll ||
    a.isEmpty !== b.isEmpty ||
    a.activeFormats.bold !== b.activeFormats.bold ||
    a.activeFormats.italic !== b.activeFormats.italic ||
    a.activeFormats.strikethrough !== b.activeFormats.strikethrough ||
    a.activeFormats.code !== b.activeFormats.code ||
    a.mentions.length !== b.mentions.length
  ) {
    return false;
  }
  for (let i = 0; i < a.mentions.length; i++) {
    if (a.mentions[i].jid !== b.mentions[i].jid) return false;
  }
  return true;
}

interface InternalBridgeProps {
  editorRef: React.MutableRefObject<LexicalEditor | null>;
  disabled: boolean;
  supportsFormatting: boolean;
  isMultiline: boolean;
  onWrapMultiline?: () => void;
  onSend: () => void;
  onPasteFiles?: (files: File[]) => void;
  onPopoverKey?: (key: ComposerPopoverKey) => boolean;
}

function ComposerPluginsBridge({
  editorRef,
  disabled,
  supportsFormatting,
  isMultiline,
  onWrapMultiline,
  onSend,
  onPasteFiles,
  onPopoverKey,
}: InternalBridgeProps) {
  const [editor] = useLexicalComposerContext();

  const callbacksRef = useRef({
    supportsFormatting,
    isMultiline,
    onWrapMultiline,
    onSend,
    onPasteFiles,
    onPopoverKey,
  });

  useEffect(() => {
    callbacksRef.current = {
      supportsFormatting,
      isMultiline,
      onWrapMultiline,
      onSend,
      onPasteFiles,
      onPopoverKey,
    };
  }, [supportsFormatting, isMultiline, onWrapMultiline, onSend, onPasteFiles, onPopoverKey]);

  useEffect(() => {
    editorRef.current = editor;
    return () => {
      if (editorRef.current === editor) {
        editorRef.current = null;
      }
    };
  }, [editor, editorRef]);

  useEffect(() => {
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    const unsubs: Array<() => void> = [];

    // 1. Intercept Enter: desktop Enter sends, modifier+Enter & touch Enter create ParagraphNode with list continuation
    unsubs.push(
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          if (event?.isComposing || event?.keyCode === 229 || editor.isComposing()) {
            return false;
          }

          const hasNewlineModifier = Boolean(
            event?.shiftKey || event?.ctrlKey || event?.metaKey || event?.altKey
          );

          if (!hasNewlineModifier && callbacksRef.current.onPopoverKey?.("Enter")) {
            event?.preventDefault();
            return true;
          }

          const shouldSend = !hasNewlineModifier && !isTouchOnlyDevice();
          if (shouldSend) {
            event?.preventDefault();
            callbacksRef.current.onSend();
            return true;
          }

          event?.preventDefault();
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return true;

          if (callbacksRef.current.supportsFormatting && selection.isCollapsed()) {
            const topEl = selection.anchor.getNode().getTopLevelElement();
            if ($isParagraphNode(topEl)) {
              const lineBefore = getTextBeforePointInParagraph(
                topEl,
                selection.anchor.key,
                selection.anchor.offset,
                selection.anchor.type
              );
              const cont = computeListContinuation(lineBefore);
              if (cont.action === "exit-list") {
                trimLeadingCharsFromParagraph(topEl, cont.prefixLength);
                selection.setFormat(0);
                return true;
              }
              if (cont.action === "continue") {
                selection.insertParagraph();
                const nextSel = $getSelection();
                if ($isRangeSelection(nextSel)) {
                  nextSel.setFormat(0);
                  nextSel.insertNodes([$createTextNode(cont.nextPrefix)]);
                }
                return true;
              }
            }
          }

          selection.insertParagraph();
          const afterSel = $getSelection();
          if ($isRangeSelection(afterSel)) {
            afterSel.setFormat(0);
          }
          return true;
        },
        COMMAND_PRIORITY_HIGH
      )
    );

    // 2. Popover keyboard navigation & Escape handling
    unsubs.push(
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        (event) => {
          if (editor.isComposing()) return false;
          if (callbacksRef.current.onPopoverKey?.("ArrowUp")) {
            event.preventDefault();
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_HIGH
      )
    );

    unsubs.push(
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        (event) => {
          if (editor.isComposing()) return false;
          if (callbacksRef.current.onPopoverKey?.("ArrowDown")) {
            event.preventDefault();
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_HIGH
      )
    );

    unsubs.push(
      editor.registerCommand(
        KEY_TAB_COMMAND,
        (event) => {
          if (editor.isComposing() || event.shiftKey) return false;
          if (callbacksRef.current.onPopoverKey?.("Tab")) {
            event.preventDefault();
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_HIGH
      )
    );

    unsubs.push(
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        (event) => {
          if (editor.isComposing()) return false;
          if (callbacksRef.current.onPopoverKey?.("Escape")) {
            event.preventDefault();
            event.stopPropagation();
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_HIGH
      )
    );

    // 3. Inline formatting gate & WhatsApp word-boundary expansion (partial-word selections snap to whole words)
    unsubs.push(
      editor.registerCommand(
        FORMAT_TEXT_COMMAND,
        (formatType) => {
          if (!callbacksRef.current.supportsFormatting) {
            return true;
          }
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || selection.isCollapsed()) {
            return false;
          }

          const wasBackward = selection.isBackward();
          const startPoint = wasBackward ? selection.focus : selection.anchor;
          const endPoint = wasBackward ? selection.anchor : selection.focus;
          const startTop = startPoint.getNode().getTopLevelElement();
          const endTop = endPoint.getNode().getTopLevelElement();
          if (!$isParagraphNode(startTop) || !$isParagraphNode(endTop)) {
            return false;
          }

          const rootChildren = $getRoot().getChildren();
          const startParaIdx = rootChildren.indexOf(startTop);
          const endParaIdx = rootChildren.indexOf(endTop);
          if (startParaIdx === -1 || endParaIdx === -1) {
            return false;
          }

          const rawStartOffset = getTextBeforePointInParagraph(
            startTop,
            startPoint.key,
            startPoint.offset,
            startPoint.type
          ).length;
          const rawEndOffset = getTextBeforePointInParagraph(
            endTop,
            endPoint.key,
            endPoint.offset,
            endPoint.type
          ).length;

          let nextStartOffset = rawStartOffset;
          let nextEndOffset = rawEndOffset;

          if (startParaIdx === endParaIdx) {
            const masked = getMaskedParagraphTextForWordBounds(startTop);
            const expanded = expandRangeToWhatsAppWordBoundaries(masked, rawStartOffset, rawEndOffset);
            if (!expanded.hasContent) {
              return true;
            }
            nextStartOffset = expanded.start;
            nextEndOffset = expanded.end;
          } else {
            const firstMasked = getMaskedParagraphTextForWordBounds(startTop);
            const lastMasked = getMaskedParagraphTextForWordBounds(endTop);
            const expanded = expandCrossParagraphEndpointsToWordBoundaries(
              firstMasked,
              rawStartOffset,
              lastMasked,
              rawEndOffset
            );
            nextStartOffset = expanded.startParaOffset;
            nextEndOffset = expanded.endParaOffset;
          }

          const targetAnchor = wasBackward ? selection.focus : selection.anchor;
          const targetFocus = wasBackward ? selection.anchor : selection.focus;
          setPointAtParagraphCharOffset(targetAnchor, startTop, nextStartOffset, "start");
          setPointAtParagraphCharOffset(targetFocus, endTop, nextEndOffset, "end");
          selection.setCachedNodes(null);
          selection.dirty = true;

          const allFormatted = doesExpandedRangeAllHaveFormat(
            rootChildren,
            startParaIdx,
            nextStartOffset,
            endParaIdx,
            nextEndOffset,
            formatType
          );
          $setTextFormat(selection, { [formatType]: !allFormatted });
          return true;
        },
        COMMAND_PRIORITY_HIGH
      )
    );

    // 4. WhatsApp formatting shortcuts (Ctrl/Cmd + B / I / Shift+X / E)
    unsubs.push(
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          if (
            !callbacksRef.current.supportsFormatting ||
            editor.isComposing() ||
            !(event.ctrlKey || event.metaKey) ||
            event.altKey
          ) {
            return false;
          }
          const key = event.key.toLowerCase();
          let formatType: TextFormatType | null = null;
          if (key === "b" && !event.shiftKey) formatType = "bold";
          else if (key === "i" && !event.shiftKey) formatType = "italic";
          else if (key === "x" && event.shiftKey) formatType = "strikethrough";
          else if (key === "e" && !event.shiftKey) formatType = "code";

          if (!formatType) return false;
          event.preventDefault();
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, formatType);
          return true;
        },
        COMMAND_PRIORITY_HIGH
      )
    );

    // 5. Clean Paste: attach pasted images/files or parse plain text into true paragraphs
    unsubs.push(
      editor.registerCommand(
        PASTE_COMMAND,
        (event) => {
          if (!event || !("clipboardData" in event) || !event.clipboardData) {
            return false;
          }
          const clipboardData = event.clipboardData;
          const items = clipboardData.items;
          if (items && items.length > 0) {
            const filesToAttach: File[] = [];
            for (let i = 0; i < items.length; i++) {
              const item = items[i];
              if (item.kind === "file") {
                const f = item.getAsFile();
                if (f) {
                  if (!f.name || f.name === "image.png") {
                    const ext = (f.type.split("/")[1] || "png").split(";")[0];
                    filesToAttach.push(
                      new File([f], `Screenshot_${Date.now()}.${ext}`, {
                        type: f.type,
                      })
                    );
                  } else {
                    filesToAttach.push(f);
                  }
                }
              }
            }
            if (filesToAttach.length > 0 && callbacksRef.current.onPasteFiles) {
              event.preventDefault();
              callbacksRef.current.onPasteFiles(filesToAttach);
              return true;
            }
          }

          const plain = clipboardData.getData("text/plain");
          if (typeof plain === "string") {
            event.preventDefault();
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
              const parsed = parseWhatsAppToParagraphs(plain, {
                formatting: callbacksRef.current.supportsFormatting,
              });
              insertParsedParagraphsAtSelection(selection, parsed);
            }
            return true;
          }

          return false;
        },
        COMMAND_PRIORITY_HIGH
      )
    );

    // 6. Live WhatsApp inline markdown shortcut (*bold*, _italic_, ~strike~, `code`)
    unsubs.push(
      editor.registerNodeTransform(TextNode, (node) => {
        if (!callbacksRef.current.supportsFormatting) return;
        if ($isMentionNode(node) || !node.isSimpleText()) return;
        if (editor.isComposing()) return;
        if (node.hasFormat("code")) return;

        const selection = $getSelection();
        if (
          !$isRangeSelection(selection) ||
          !selection.isCollapsed() ||
          selection.anchor.type !== "text" ||
          selection.anchor.key !== node.getKey()
        ) {
          return;
        }

        const fullText = node.getTextContent();
        const offset = selection.anchor.offset;
        if (offset < 3) return;
        const lastChar = fullText[offset - 1];
        if (lastChar !== "*" && lastChar !== "_" && lastChar !== "~" && lastChar !== "`") {
          return;
        }

        const match = matchInlineWhatsAppShortcut(fullText.slice(0, offset));
        if (!match) return;

        const baseFormat = node.getFormat();
        const prefix = fullText.slice(0, match.matchStart);
        const suffix = fullText.slice(match.matchEnd);

        const formattedNode = $createTextNode(match.innerText);
        formattedNode.setFormat(baseFormat);
        formattedNode.toggleFormat(match.format);

        const replacementNodes: LexicalNode[] = [];
        if (prefix) {
          const prefixNode = $createTextNode(prefix);
          prefixNode.setFormat(baseFormat);
          replacementNodes.push(prefixNode);
        }
        replacementNodes.push(formattedNode);
        let suffixNode: TextNode | null = null;
        if (suffix) {
          suffixNode = $createTextNode(suffix);
          suffixNode.setFormat(baseFormat);
          replacementNodes.push(suffixNode);
        }

        node.replace(replacementNodes[0]);
        let cursor = replacementNodes[0];
        for (let i = 1; i < replacementNodes.length; i++) {
          cursor.insertAfter(replacementNodes[i]);
          cursor = replacementNodes[i];
        }

        if (suffixNode) {
          suffixNode.select(0, 0);
        } else {
          formattedNode.selectEnd();
        }
        const nextSel = $getSelection();
        if ($isRangeSelection(nextSel)) {
          nextSel.setFormat(baseFormat);
        }
      })
    );

    // 7. Keep caret smoothly scrolled into view inside the bounded composer box & detect single-line wrap
    unsubs.push(
      editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
        if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
        const rootEl = editor.getRootElement();
        if (!rootEl) return;
        if (
          !callbacksRef.current.isMultiline &&
          callbacksRef.current.onWrapMultiline &&
          rootEl.scrollHeight >= 52 &&
          rootEl.textContent?.trim()
        ) {
          callbacksRef.current.onWrapMultiline();
        }
        if (document.activeElement === rootEl) {
          requestAnimationFrame(() => scrollCaretIntoView(editor));
        }
      })
    );

    return () => {
      for (let i = 0; i < unsubs.length; i++) {
        unsubs[i]();
      }
    };
  }, [editor]);

  return null;
}

export const ComposerEditor = forwardRef<ComposerEditorHandle, ComposerEditorProps>(
  function ComposerEditor(
    {
      placeholder,
      disabled,
      supportsFormatting,
      isMultiline = false,
      onWrapMultiline,
      onSnapshotChange,
      onSend,
      onPasteFiles,
      onPopoverKey,
      ariaLabel = "Message input",
    },
    ref
  ) {
    const lexicalEditorRef = useRef<LexicalEditor | null>(null);
    const supportsFormattingRef = useRef(supportsFormatting);
    const onSnapshotChangeRef = useRef(onSnapshotChange);
    const lastSnapshotRef = useRef<ComposerSnapshot | null>(null);

    useEffect(() => {
      supportsFormattingRef.current = supportsFormatting;
    }, [supportsFormatting]);

    useEffect(() => {
      onSnapshotChangeRef.current = onSnapshotChange;
    }, [onSnapshotChange]);

    const initialConfig = useMemo(
      () => ({
        namespace: "TchaikovskyChatComposer",
        nodes: [MentionNode],
        theme: COMPOSER_THEME,
        onError: (error: Error) => {
          console.error("[ComposerEditor]", error);
        },
      }),
      []
    );

    const handleEditorChange = useCallback(() => {
      const editor = lexicalEditorRef.current;
      if (!editor) return;
      editor.getEditorState().read(() => {
        const snapshot = readEditorSnapshot(supportsFormattingRef.current);
        if (!snapshotsEqual(lastSnapshotRef.current, snapshot)) {
          lastSnapshotRef.current = snapshot;
          onSnapshotChangeRef.current(snapshot);
        }
      });
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          const editor = lexicalEditorRef.current;
          if (!editor || !editor.isEditable()) return;
          editor.focus();
        },
        clear: () => {
          const editor = lexicalEditorRef.current;
          if (!editor) return;
          editor.update(() => {
            const root = $getRoot();
            root.clear();
            const para = $createParagraphNode();
            root.append(para);
            para.select();
            const sel = $getSelection();
            if ($isRangeSelection(sel)) {
              sel.setFormat(0);
            }
          });
          editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
        },
        setContent: (text, opts) => {
          const editor = lexicalEditorRef.current;
          if (!editor) return;
          editor.update(() => {
            const root = $getRoot();
            root.clear();

            const normalized = String(text ?? "");
            if (!normalized) {
              const para = $createParagraphNode();
              root.append(para);
              para.select();
              const sel = $getSelection();
              if ($isRangeSelection(sel)) {
                sel.setFormat(0);
              }
              return;
            }

            const hasMentionsInput = Boolean(
              (opts?.mentions && opts.mentions.length > 0) ||
                opts?.mentionAll ||
                (opts?.participants && opts.participants.length > 0)
            );
            const mentionSpans =
              hasMentionsInput && normalized.includes("@")
                ? extractMentionSpans(normalized, {
                    mentions: opts?.mentions,
                    mentionAll: opts?.mentionAll,
                    participants: opts?.participants,
                    preserveTextLength: true,
                  })
                : [];

            const parsed = parseWhatsAppToParagraphs(normalized, {
              formatting: supportsFormattingRef.current,
              mentionSpans,
            });

            let lastPara: ParagraphNode | null = null;
            for (let i = 0; i < parsed.length; i++) {
              const para = $createParagraphNode();
              const nodes = createNodesFromSegments(parsed[i].segments);
              if (nodes.length > 0) {
                para.append(...nodes);
              }
              root.append(para);
              lastPara = para;
            }

            if (lastPara) {
              lastPara.selectEnd();
              const sel = $getSelection();
              if ($isRangeSelection(sel)) {
                sel.setFormat(0);
              }
            }
          });

          if (opts?.clearHistory) {
            editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
          }
          requestAnimationFrame(() => scrollCaretIntoView(editor));
        },
        insertText: (value) => {
          const editor = lexicalEditorRef.current;
          if (!editor || !value) return;
          editor.update(() => {
            let selection = $getSelection();
            if (!$isRangeSelection(selection)) {
              $getRoot().selectEnd();
              selection = $getSelection();
            }
            if (!$isRangeSelection(selection)) return;
            const parsed = parseWhatsAppToParagraphs(value, { formatting: false });
            insertParsedParagraphsAtSelection(selection, parsed);
          });
          editor.focus();
          requestAnimationFrame(() => scrollCaretIntoView(editor));
        },
        replaceBeforeCaret: (charCount, replacementText, opts) => {
          const editor = lexicalEditorRef.current;
          if (!editor) return;
          editor.update(() => {
            let selection = $getSelection();
            if (!$isRangeSelection(selection)) {
              $getRoot().selectEnd();
              selection = $getSelection();
            }
            if (!$isRangeSelection(selection)) return;
            selectBackwardInParagraph(selection, charCount);
            const parsed = parseWhatsAppToParagraphs(replacementText, {
              formatting: Boolean(opts?.parseFormatting && supportsFormattingRef.current),
            });
            insertParsedParagraphsAtSelection(selection, parsed);
          });
          editor.focus();
          requestAnimationFrame(() => scrollCaretIntoView(editor));
        },
        insertMention: (charCount, mention) => {
          const editor = lexicalEditorRef.current;
          if (!editor) return;
          editor.update(() => {
            let selection = $getSelection();
            if (!$isRangeSelection(selection)) {
              $getRoot().selectEnd();
              selection = $getSelection();
            }
            if (!$isRangeSelection(selection)) return;

            selectBackwardInParagraph(selection, charCount);

            // Check whether the character immediately after the selection is already whitespace
            let hasTrailingSpace = false;
            const endPoint = selection.isBackward() ? selection.anchor : selection.focus;
            if (endPoint.type === "text") {
              const endNode = endPoint.getNode();
              if ($isTextNode(endNode)) {
                const afterInNode = endNode.getTextContent().slice(endPoint.offset);
                if (afterInNode.length > 0) {
                  hasTrailingSpace = /^\s/.test(afterInNode);
                } else {
                  const nextSib = endNode.getNextSibling();
                  if (nextSib) {
                    hasTrailingSpace = /^\s/.test(nextSib.getTextContent());
                  }
                }
              }
            } else if (endPoint.type === "element") {
              const parent = endPoint.getNode();
              if ($isElementNode(parent)) {
                const nextChild = parent.getChildAtIndex(endPoint.offset);
                if (nextChild) {
                  hasTrailingSpace = /^\s/.test(nextChild.getTextContent());
                }
              }
            }

            const mentionNode = $createMentionNode(mention);
            if (hasTrailingSpace) {
              selection.insertNodes([mentionNode]);
            } else {
              const spaceNode = $createTextNode(" ");
              selection.insertNodes([mentionNode, spaceNode]);
              spaceNode.select(1, 1);
            }

            const nextSel = $getSelection();
            if ($isRangeSelection(nextSel)) {
              nextSel.setFormat(0);
            }
          });
          editor.focus();
          requestAnimationFrame(() => scrollCaretIntoView(editor));
        },
        applyFormat: (action) => {
          const editor = lexicalEditorRef.current;
          if (!editor || !supportsFormattingRef.current) return;

          if (action.kind === "inline") {
            const map: Record<string, TextFormatType> = {
              "*": "bold",
              _: "italic",
              "~": "strikethrough",
              "```": "code",
            };
            const formatType = map[action.marker];
            if (!formatType) return;
            editor.focus();
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, formatType);
            return;
          }

          editor.update(() => {
            let selection = $getSelection();
            if (!$isRangeSelection(selection)) {
              $getRoot().selectEnd();
              selection = $getSelection();
            }
            if (!$isRangeSelection(selection)) return;

            const rootChildren = $getRoot().getChildren();
            const startPoint = selection.isBackward() ? selection.focus : selection.anchor;
            const endPoint = selection.isBackward() ? selection.anchor : selection.focus;
            const startTop = startPoint.getNode().getTopLevelElement();
            const endTop = endPoint.getNode().getTopLevelElement();
            if (!startTop || !endTop) return;

            const startIdx = rootChildren.indexOf(startTop);
            const endIdx = rootChildren.indexOf(endTop);
            if (startIdx === -1 || endIdx === -1) return;

            const lo = Math.min(startIdx, endIdx);
            const hi = Math.max(startIdx, endIdx);
            const targets: ParagraphNode[] = [];
            for (let i = lo; i <= hi; i++) {
              const child = rootChildren[i];
              if ($isParagraphNode(child)) targets.push(child);
            }
            if (targets.length === 0) return;

            const isSingleCollapsed = selection.isCollapsed() && targets.length === 1;
            const prevCaretInPara = isSingleCollapsed
              ? getTextBeforePointInParagraph(
                  targets[0],
                  selection.anchor.key,
                  selection.anchor.offset,
                  selection.anchor.type
                ).length
              : 0;

            const edits = toggleParagraphPrefixEdit(
              targets.map((p) => p.getTextContent()),
              action.prefix
            );

            for (let i = 0; i < targets.length; i++) {
              const para = targets[i];
              const edit = edits[i];
              if (edit.removeLength > 0) {
                trimLeadingCharsFromParagraph(para, edit.removeLength);
              }
              if (edit.insertPrefix) {
                const first = para.getFirstChild();
                if ($isTextNode(first) && !$isMentionNode(first) && first.getFormat() === 0) {
                  first.spliceText(0, 0, edit.insertPrefix, false);
                } else if (first) {
                  first.insertBefore($createTextNode(edit.insertPrefix));
                } else {
                  para.append($createTextNode(edit.insertPrefix));
                }
              }
            }

            if (isSingleCollapsed) {
              const para = targets[0];
              const edit = edits[0];
              const nextTargetOffset = Math.max(
                0,
                prevCaretInPara - edit.removeLength + edit.insertPrefix.length
              );
              const children = para.getChildren();
              if (children.length === 0) {
                para.select(0, 0);
              } else {
                let acc = 0;
                let placed = false;
                for (let i = 0; i < children.length; i++) {
                  const ch = children[i];
                  const len = ch.getTextContentSize();
                  if (nextTargetOffset <= acc + len && $isTextNode(ch)) {
                    ch.select(nextTargetOffset - acc, nextTargetOffset - acc);
                    placed = true;
                    break;
                  }
                  acc += len;
                }
                if (!placed) {
                  para.selectEnd();
                }
              }
            }
          });
          editor.focus();
        },
        getPayload: () => {
          const editor = lexicalEditorRef.current;
          if (!editor) return { text: "", mentions: [], mentionAll: false };
          return editor
            .getEditorState()
            .read(() =>
              serializeParagraphsToWhatsApp(
                extractParagraphsFromRoot(),
                supportsFormattingRef.current
              )
            );
        },
      }),
      []
    );

    return (
      <LexicalComposer initialConfig={initialConfig}>
        <div className="relative w-full">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                aria-label={ariaLabel}
                aria-multiline="true"
                spellCheck={true}
                autoCorrect="on"
                autoCapitalize="sentences"
                className="composer-editable relative z-10 w-full block rounded-[8px] outline-none focus:outline-none focus-visible:outline-none px-3.5 py-[9px] sm:py-[8px] leading-[22px] sm:leading-[20px] min-h-[42px] sm:min-h-[38px] max-h-[168px] overflow-y-auto overscroll-contain text-[16px] sm:text-[13px]"
              />
            }
            placeholder={
              <div
                aria-hidden="true"
                className="pointer-events-none select-none absolute inset-x-0 top-0 px-3.5 py-[9px] sm:py-[8px] leading-[22px] sm:leading-[20px] text-[16px] sm:text-[13px] truncate"
                style={{ color: "var(--text-muted)" }}
              >
                {placeholder}
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <OnChangePlugin
            onChange={handleEditorChange}
            ignoreSelectionChange={false}
            ignoreHistoryMergeTagChange={false}
          />
          <ComposerPluginsBridge
            editorRef={lexicalEditorRef}
            disabled={disabled}
            supportsFormatting={supportsFormatting}
            isMultiline={isMultiline}
            onWrapMultiline={onWrapMultiline}
            onSend={onSend}
            onPasteFiles={onPasteFiles}
            onPopoverKey={onPopoverKey}
          />
        </div>
      </LexicalComposer>
    );
  }
);

