"use client";

import {
  $applyNodeReplacement,
  TextNode,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedTextNode,
  type Spread,
} from "lexical";
import type { ComposerMentionItem } from "../../utils/groupMentions";

export type SerializedMentionNode = Spread<
  {
    mention: ComposerMentionItem;
  },
  SerializedTextNode
>;

function resolveMentionClassName(mention: ComposerMentionItem, text: string): string {
  const lower = text.trim().toLowerCase();
  const isAll =
    Boolean(mention.isGroupMention) ||
    mention.jid === "all" ||
    lower === "@all" ||
    lower === "@everyone" ||
    lower === "@الكل" ||
    lower === "@الجميع";
  if (isAll) return "composer-mention-all";
  if (mention.isSelf) return "composer-mention-self";
  return "composer-mention";
}

export class MentionNode extends TextNode {
  __mention: ComposerMentionItem;

  static getType(): string {
    return "mention";
  }

  static clone(node: MentionNode): MentionNode {
    return new MentionNode(node.__mention, node.__text, node.__key);
  }

  static importJSON(serializedNode: SerializedMentionNode): MentionNode {
    const node = $createMentionNode(serializedNode.mention, serializedNode.text);
    node.setFormat(serializedNode.format);
    node.setDetail(serializedNode.detail);
    node.setStyle(serializedNode.style);
    return node;
  }

  constructor(mention: ComposerMentionItem, text?: string, key?: NodeKey) {
    super(text ?? mention.token ?? `@${mention.displayName}`, key);
    this.__mention = mention;
  }

  exportJSON(): SerializedMentionNode {
    return {
      ...super.exportJSON(),
      mention: this.__mention,
      type: "mention",
      version: 1,
    };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    dom.className = resolveMentionClassName(this.__mention, this.__text);
    dom.setAttribute("dir", "auto");
    dom.spellcheck = false;
    return dom;
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    const nextClass = resolveMentionClassName(this.__mention, this.__text);
    if (dom.className !== nextClass) {
      dom.className = nextClass;
    }
    return super.updateDOM(prevNode, dom, config);
  }

  isTextEntity(): true {
    return true;
  }

  canInsertTextBefore(): false {
    return false;
  }

  canInsertTextAfter(): false {
    return false;
  }

  getMention(): ComposerMentionItem {
    return this.getLatest().__mention;
  }
}

export function $createMentionNode(
  mention: ComposerMentionItem,
  text?: string
): MentionNode {
  const node = new MentionNode(mention, text ?? mention.token ?? `@${mention.displayName}`);
  node.setMode("token");
  return $applyNodeReplacement(node);
}

export function $isMentionNode(
  node: LexicalNode | null | undefined
): node is MentionNode {
  return node instanceof MentionNode;
}

