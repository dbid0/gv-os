"use client";

import {
  useMemo,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link2, Sparkles } from "lucide-react";

import { generateUtmLink } from "@/app/(app)/marketing/utm/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { buildUtmUrl, describeBuildFailure } from "@/lib/marketing/utm";

const SOURCE_SUGGESTIONS = ["youtube", "instagram", "tiktok", "email", "discord"];
const MEDIUM_SUGGESTIONS = [
  "bio",
  "description",
  "profile",
  "story",
  "pinned-comment",
  "dm",
];

const selectClass =
  "border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      {children}
      {hint && <span className="text-faint block text-[11px]">{hint}</span>}
    </label>
  );
}

/**
 * The builder. Every generated link is born standard-compliant (see
 * lib/marketing/utm.ts) and saved to the registry the instant "Generate &
 * copy" is clicked — there's no separate "save" step.
 *
 * Source/medium/campaign carry over between generates on purpose: the real
 * workflow (per the GV UTM SOP) is one funnel link + fixed source/medium/
 * campaign, batching a fresh `content` value per asset — so only content
 * clears after a successful generate.
 */
export function UtmLinkForm({ clients }: { clients: { id: string; name: string }[] }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [source, setSource] = useState("");
  const [medium, setMedium] = useState("");
  const [campaign, setCampaign] = useState("");
  const [content, setContent] = useState("");

  const preview = useMemo(
    () => buildUtmUrl({ destinationUrl, source, medium, campaign, content }),
    [destinationUrl, source, medium, campaign, content],
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!clientId) {
      toast({ tone: "error", title: "Pick a client first." });
      return;
    }
    start(async () => {
      const res = await generateUtmLink({
        clientId,
        destinationUrl,
        source,
        medium,
        campaign,
        content,
      });
      if (!res.ok) {
        toast({ tone: "error", title: res.error });
        return;
      }
      try {
        // The short link is what goes out: it redirects to the full UTM link
        // and counts every click.
        await navigator.clipboard.writeText(res.shortUrl ?? res.row.assembledUrl);
        toast({
          tone: "success",
          title: res.shortUrl
            ? "Short link copied and added to the registry"
            : "Link generated — copied and added to the registry",
          detail: res.shortUrl ?? undefined,
        });
      } catch {
        toast({
          tone: "success",
          title: "Link generated and added to the registry",
          detail: "Clipboard copy was blocked — copy it from the table below.",
        });
      }
      setContent("");
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Client">
          <select
            className={selectClass}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          >
            {clients.length === 0 && <option value="">— no active clients —</option>}
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Destination link" hint="The funnel link this UTM link points to.">
          <Input
            value={destinationUrl}
            onChange={(e) => setDestinationUrl(e.target.value)}
            placeholder="https://theirfunnel.com/apply"
            required
          />
        </Field>
        <Field label="Source" hint="The platform.">
          <Input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="youtube"
            list="utm-source-options"
            required
          />
          <datalist id="utm-source-options">
            {SOURCE_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label="Medium" hint="The placement on that platform.">
          <Input
            value={medium}
            onChange={(e) => setMedium(e.target.value)}
            placeholder="description"
            list="utm-medium-options"
            required
          />
          <datalist id="utm-medium-options">
            {MEDIUM_SUGGESTIONS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Field>
        <Field label="Campaign" hint="The creator or account it lives on.">
          <Input
            value={campaign}
            onChange={(e) => setCampaign(e.target.value)}
            placeholder="sharif"
            required
          />
        </Field>
        <Field label="Content" hint="The specific asset, 1–3 words.">
          <Input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="beginners-guide"
            required
          />
        </Field>
      </div>

      <div className="bg-secondary/40 flex items-start gap-2 rounded-lg border px-3 py-2.5">
        <Link2 className="text-faint mt-0.5 size-3.5 shrink-0" />
        {preview.ok ? (
          <code className="text-foreground min-w-0 flex-1 font-mono text-xs break-all">
            {preview.url}
          </code>
        ) : (
          <span className="text-faint text-xs">
            {destinationUrl || source || medium || campaign || content
              ? describeBuildFailure(preview)
              : "Fill in the fields to preview the generated link."}
          </span>
        )}
      </div>

      <Button type="submit" disabled={pending || !preview.ok} className="gap-1.5">
        <Sparkles className="size-3.5" />
        {pending ? "Generating…" : "Generate & copy"}
      </Button>
    </form>
  );
}
