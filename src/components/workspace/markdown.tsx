import { Fragment, type ReactNode } from "react";
import { Check } from "lucide-react";

import {
  parseBlocks,
  type Block,
  type Inline,
  type ListItem,
} from "@/lib/workspace/markdown";
import { cn } from "@/lib/utils";

/**
 * The Workspace markdown renderer.
 *
 * It walks the pure token tree from `parseBlocks` and builds React elements —
 * so every character of the page is escaped by React and no HTML is ever
 * injected. The typography is tuned to read like a Notion document: a large
 * H1, generous line-height, and comfortable vertical rhythm, on the GV tokens.
 */

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((node, i) => {
    switch (node.type) {
      case "text":
        return <Fragment key={i}>{node.value}</Fragment>;
      case "strong":
        return (
          <strong key={i} className="font-semibold">
            {renderInline(node.children)}
          </strong>
        );
      case "em":
        return (
          <em key={i} className="italic">
            {renderInline(node.children)}
          </em>
        );
      case "strike":
        return (
          <s key={i} className="text-muted-foreground line-through">
            {renderInline(node.children)}
          </s>
        );
      case "code":
        return (
          <code
            key={i}
            className="bg-muted border-border rounded-md border px-1.5 py-0.5 font-mono text-[0.85em]"
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
  const indent = { paddingLeft: `${item.depth * 1.375}rem` };

  if (item.marker === "check") {
    return (
      <li className="flex items-start gap-2.5 py-0.5" style={indent}>
        <span
          className={cn(
            "mt-0.5 grid size-[1.05rem] shrink-0 place-items-center rounded-[5px] border transition-colors",
            item.checked
              ? "border-brand bg-brand text-primary-foreground"
              : "border-border-strong bg-transparent",
          )}
        >
          {item.checked && <Check className="size-3" strokeWidth={3} />}
        </span>
        <span className={cn("leading-7", item.checked && "text-muted-foreground")}>
          {renderInline(item.inline)}
        </span>
      </li>
    );
  }

  return (
    <li className="flex items-start gap-2.5 py-0.5" style={indent}>
      <span className="text-muted-foreground mt-0.5 min-w-[1.1rem] shrink-0 text-right text-sm tabular-nums select-none">
        {item.marker === "ordered" ? `${item.number ?? 1}.` : "•"}
      </span>
      <span className="leading-7">{renderInline(item.inline)}</span>
    </li>
  );
}

function renderBlock(block: Block, key: number): ReactNode {
  switch (block.type) {
    case "heading": {
      if (block.level === 1) {
        return (
          <h1
            key={key}
            className="mt-8 mb-3 text-3xl font-bold tracking-tight first:mt-0"
          >
            {renderInline(block.inline)}
          </h1>
        );
      }
      if (block.level === 2) {
        return (
          <h2
            key={key}
            className="mt-7 mb-2.5 text-2xl font-semibold tracking-tight first:mt-0"
          >
            {renderInline(block.inline)}
          </h2>
        );
      }
      return (
        <h3 key={key} className="mt-6 mb-2 text-xl font-semibold first:mt-0">
          {renderInline(block.inline)}
        </h3>
      );
    }
    case "paragraph":
      return (
        <p key={key} className="text-foreground/90 my-2.5 text-[0.95rem] leading-7">
          {renderInline(block.inline)}
        </p>
      );
    case "list":
      return (
        <ul key={key} className="my-2.5 space-y-0.5 text-[0.95rem]">
          {block.items.map((item, i) => (
            <ListRow key={i} item={item} />
          ))}
        </ul>
      );
    case "quote":
      return (
        <blockquote
          key={key}
          className="border-brand/40 text-muted-foreground my-3 border-l-2 pl-4 text-[0.95rem] leading-7 italic"
        >
          {block.lines.map((line, i) => (
            <p key={i}>{renderInline(line)}</p>
          ))}
        </blockquote>
      );
    case "code":
      return (
        <pre
          key={key}
          className="bg-muted border-border my-3 overflow-x-auto rounded-lg border p-4 font-mono text-[0.8rem] leading-6"
        >
          <code>{block.code}</code>
        </pre>
      );
    case "divider":
      return <hr key={key} className="border-border my-6" />;
  }
}

export function Markdown({ content }: { content: string }) {
  const blocks = parseBlocks(content);
  return <div className="text-foreground">{blocks.map(renderBlock)}</div>;
}
