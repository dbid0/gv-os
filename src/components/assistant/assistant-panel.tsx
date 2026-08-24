"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { Sparkles, Send, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { ask } from "@/app/(app)/assistant/actions";
import { type AiRole } from "@/lib/ai/roles";

/**
 * The "ask anything" panel — the viewer's single assistant face.
 *
 * Starter chips fire a role-permitted read tool and render its live answer;
 * the composer routes free-text to the same deterministic layer and, when
 * nothing maps, shows the honest go-live state. It never chooses tools itself —
 * the server resolves scope and refuses anything the role does not unlock.
 */

interface Starter {
  toolId: string;
  prompt: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  headline: string;
  details: string[];
}

let localSeq = 0;
const nextId = () => `local-${localSeq++}`;

export function AssistantPanel({
  faceName,
  role,
  starters,
  initialMessages,
  previewing,
  repIsFallback,
  repName,
}: {
  faceName: string;
  role: AiRole;
  starters: Starter[];
  initialMessages: Message[];
  previewing: boolean;
  repIsFallback: boolean;
  repName: string | null;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  function send(request: { toolId?: string; text?: string }, prompt: string) {
    setErr(null);
    const userMsg: Message = {
      id: nextId(),
      role: "user",
      headline: prompt,
      details: [],
    };
    setMessages((prev) => [...prev, userMsg]);
    start(async () => {
      try {
        const answer = await ask(request);
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: "assistant",
            headline: answer.headline,
            details: answer.details,
          },
        ]);
        requestAnimationFrame(() =>
          listEndRef.current?.scrollIntoView({ behavior: "smooth" }),
        );
      } catch (error) {
        setErr(error instanceof Error ? error.message : "Something went wrong.");
      }
    });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const q = text.trim();
    if (!q || pending) return;
    setText("");
    send({ text: q }, q);
  }

  return (
    <Panel
      title={faceName}
      aside={
        <span className="text-faint inline-flex items-center gap-1.5 text-xs">
          <ShieldCheck className="size-3.5" />
          Scoped to {role.replace("_", " ")}
        </span>
      }
      padded={false}
    >
      {/* Transcript */}
      <div className="max-h-[46vh] min-h-[8rem] overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-3 py-2">
            <div className="text-faint flex items-center gap-2 text-sm">
              <Sparkles className="size-4" />
              <p>Tap a question — I pull straight from your live numbers.</p>
            </div>
            {starters.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {starters.map((s) => (
                  <button
                    key={s.toolId}
                    type="button"
                    disabled={pending}
                    onClick={() => send({ toolId: s.toolId }, s.prompt)}
                    className="hover:border-ring hover:bg-secondary focus-visible:border-ring focus-visible:ring-ring/50 flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50"
                  >
                    <span>{s.prompt}</span>
                    <Send className="text-faint size-3.5 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <div className="bg-primary text-primary-foreground max-w-[85%] rounded-2xl rounded-br-sm px-3.5 py-2 text-sm">
                    {m.headline}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex justify-start">
                  <div className="bg-secondary text-secondary-foreground max-w-[90%] space-y-1.5 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm">
                    <p className="font-medium">{m.headline}</p>
                    {m.details.length > 0 && (
                      <>
                        <p className="text-muted-foreground text-[13px]">
                          {m.details[0]}
                        </p>
                        {m.details.length > 1 && (
                          <ul className="text-muted-foreground list-disc space-y-0.5 pl-4 text-[13px]">
                            {m.details.slice(1).map((d, i) => (
                              <li key={i}>{d}</li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ),
            )}
            {pending && (
              <div className="flex justify-start">
                <div className="bg-secondary text-muted-foreground rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm">
                  <span className="inline-flex gap-1">
                    <span className="animate-pulse">Pulling your numbers…</span>
                  </span>
                </div>
              </div>
            )}
            <div ref={listEndRef} />
          </div>
        )}
      </div>

      {/* Starters — a quick re-ask row once the thread has started. */}
      {starters.length > 0 && messages.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t px-5 py-3">
          {starters.map((s) => (
            <Button
              key={s.toolId}
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => send({ toolId: s.toolId }, s.prompt)}
            >
              {s.prompt}
            </Button>
          ))}
        </div>
      )}

      {/* Composer */}
      <form onSubmit={submit} className="flex items-center gap-2 border-t px-5 py-3">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Ask ${faceName} anything…`}
          disabled={pending}
        />
        <Button type="submit" size="icon" disabled={pending || !text.trim()}>
          <Send className="size-4" />
        </Button>
      </form>

      {err && <p className="text-destructive px-5 pb-3 text-xs">{err}</p>}

      <p className="text-faint border-t px-5 py-3 text-xs leading-relaxed">
        {previewing && repIsFallback && repName
          ? `Previewing as ${repName}'s numbers. `
          : ""}
        Starter questions read your live numbers with no AI needed. Full AI chat unlocks
        at go-live.
      </p>
    </Panel>
  );
}
