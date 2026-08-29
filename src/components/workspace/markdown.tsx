import { Fragment, type ReactNode } from "react";
import { Check } from "lucide-react";

import {
  NOTION_TEXT_COLORS,
  parseBlocks,
  type Block,
  type Inline,
  type ListItem,
} from "@/lib/workspace/markdown";
import { ToggleBlock } from "@/components/workspace/toggle-block";
import { cn } from "@/lib/utils";

/**
 * The Workspace markdown renderer.
 *
 * It walks the pure token tree from `parseBlocks` and builds React elements —
 * so every character of the page is escaped by React and no HTML is ever
 * injected. The typography is tuned to be indistinguishable from a Notion
 * document: 16px body at 1.5 line-height in a slightly-dimmed foreground,
 * colour-coded section headings, neutral callouts, quotes, and code, and
 * Notion's square checkbox. Blue appears only on links and explicitly coloured
 * text — never as chrome.
 */

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((node, i) => {
    switch (node.type) {
      case "text":
        return <Fragment key={i}>{node.value}</Fragment>;
      case "strong":
        return (
          <strong key={i} className="text-foreground font-semibold">
            {renderInline(node.children)}
          </strong>
        );
      case "em":
        return (
          <em key={i} className="text-foreground/70 italic">
            {renderInline(node.children)}
          </em>
        );
      case "strike":
        return (
          <s key={i} className="text-muted-foreground line-through">
            {renderInline(node.children)}
          </s>
        );
      case "color":
        return (
          <span key={i} style={{ color: NOTION_TEXT_COLORS[node.color] }}>
            {renderInline(node.children)}
          </span>
        );
      case "code":
        return (
          <code
            key={i}
            className="bg-secondary rounded px-1.5 py-0.5 font-mono text-[0.85em]"
          >
            {node.value}
          </code>
        );
      case "link": {
        const external = /^https?:/i.test(node.href);
        return (
          <a
            key={i}
            href={node.href}
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="text-brand decoration-brand/40 hover:decoration-brand underline underline-offset-2 transition-colors"
          >
            {renderInline(node.children)}
          </a>
        );
      }
    }
  });
}

function ListRow({ item }: { item: ListItem }) {
  const indent = { paddingLeft: `${item.depth * 1.5}rem` };

  if (item.marker === "check") {
    return (
      <li className="flex items-start gap-2.5 py-[3px]" style={indent}>
        <span
          className={cn(
            "mt-[3px] grid size-[1.15rem] shrink-0 place-items-center rounded-[4px] border transition-colors",
            item.checked
              ? "bg-foreground text-background border-transparent"
              : "border-border-strong bg-transparent",
          )}
        >
          {item.checked && <Check className="size-3" strokeWidth={3} />}
        </span>
        <span
          className={cn(
            "leading-[1.5]",
            item.checked ? "text-muted-foreground line-through" : "text-foreground/85",
          )}
        >
          {renderInline(item.inline)}
        </span>
      </li>
    );
  }

  return (
    <li className="flex items-start gap-2.5 py-[3px]" style={indent}>
      <span className="text-foreground/70 mt-[1px] min-w-[1.1rem] shrink-0 text-right text-[0.95rem] tabular-nums select-none">
        {item.marker === "ordered" ? `${item.number ?? 1}.` : "•"}
      </span>
      <span className="text-foreground/85 leading-[1.5]">
        {renderInline(item.inline)}
      </span>
    </li>
  );
}

function renderBlock(block: Block, key: number): ReactNode {
  switch (block.type) {
    case "heading": {
      // H1 is a near-white section head; H2/H3 are Notion-blue, matching the
      // colour-coded section headings in the owner's real docs.
      if (block.level === 1) {
        return (
          <h1
            key={key}
            className="text-foreground mt-8 mb-1 text-[1.875rem] leading-tight font-bold tracking-tight first:mt-0"
          >
            {renderInline(block.inline)}
          </h1>
        );
      }
      if (block.level === 2) {
        return (
          <h2
            key={key}
            className="mt-7 mb-1 text-[1.5rem] leading-snug font-bold tracking-tight text-[#529cca] first:mt-0"
          >
            {renderInline(block.inline)}
          </h2>
        );
      }
      return (
        <h3
          key={key}
          className="mt-5 mb-0.5 text-[1.25rem] leading-snug font-semibold text-[#529cca] first:mt-0"
        >
          {renderInline(block.inline)}
        </h3>
      );
    }
    case "paragraph":
      return (
        <p key={key} className="text-foreground/85 py-[3px] text-[1rem] leading-[1.5]">
          {renderInline(block.inline)}
        </p>
      );
    case "list":
      return (
        <ul key={key} className="my-1 text-[1rem]">
          {block.items.map((item, i) => (
            <ListRow key={i} item={item} />
          ))}
        </ul>
      );
    case "quote":
      return (
        <blockquote
          key={key}
          className="border-foreground/25 text-foreground/85 my-2 border-l-[3px] pl-3.5 text-[1rem] leading-[1.5]"
        >
          {block.lines.map((line, i) => (
            <p key={i} className="py-[1px]">
              {renderInline(line)}
            </p>
          ))}
        </blockquote>
      );
    case "callout":
      return (
        <div
          key={key}
          className="bg-secondary/50 text-foreground/90 my-2 flex items-start gap-2.5 rounded-md px-4 py-3 text-[1rem] leading-[1.5]"
        >
          <span className="mt-[1px] shrink-0 text-[1.1rem] leading-none select-none">
            {block.emoji}
          </span>
          <div className="min-w-0 flex-1">
            {block.lines.map((line, i) => (
              <p key={i} className="py-[1px]">
                {renderInline(line)}
              </p>
            ))}
          </div>
        </div>
      );
    case "toggle":
      return (
        <ToggleBlock key={key} summary={renderInline(block.summary)}>
          {block.blocks.map(renderBlock)}
        </ToggleBlock>
      );
    case "code":
      return (
        <pre
          key={key}
          className="bg-secondary/60 text-foreground/90 my-3 overflow-x-auto rounded-md p-4 font-mono text-[0.85rem] leading-6"
        >
          <code>{block.code}</code>
        </pre>
      );
    case "divider":
      return <hr key={key} className="bg-border my-6 h-px border-0" />;
  }
}

export function Markdown({ content }: { content: string }) {
  const blocks = parseBlocks(content);
  return (
    <div className="text-foreground text-[1rem] leading-[1.5]">
      {blocks.map(renderBlock)}
    </div>
  );
}
