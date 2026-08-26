"use client";

import { useState, useTransition } from "react";
import { ExternalLink, FolderOpen } from "lucide-react";

import { saveDriveFolder } from "@/app/(app)/clients/[slug]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import type { ClientDriveAssets } from "@/lib/clients/drive-assets";
import { driveKindLabel, isDriveFolder } from "@/lib/google/drive-kind";
import { cn } from "@/lib/utils";

const fmtModified = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/Chicago",
  });

function FolderForm({
  slug,
  initial,
  onDone,
}: {
  slug: string;
  initial: string;
  onDone?: () => void;
}) {
  const { toast } = useToast();
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            await saveDriveFolder(slug, value);
            toast({ tone: "success", title: "Drive folder linked" });
            onDone?.();
          } catch (err) {
            toast({
              tone: "error",
              title: err instanceof Error ? err.message : "Save failed.",
            });
          }
        });
      }}
    >
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Drive folder id (from the folder's URL)"
        className="h-8 w-72 max-w-full font-mono text-xs"
      />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

export function DriveAssetsPanel({
  slug,
  drive,
}: {
  slug: string;
  drive: ClientDriveAssets;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <Panel
      title="Client assets — Drive"
      aside={
        drive.folderId && !editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-faint hover:text-foreground text-xs transition-colors"
          >
            change folder
          </button>
        ) : undefined
      }
    >
      {!drive.folderId || editing ? (
        <div className="space-y-2 py-2">
          <p className="text-faint text-sm">
            Link this client&apos;s Drive root and their files appear here, read live
            through the vault credential.
          </p>
          <FolderForm
            slug={slug}
            initial={drive.folderId ?? ""}
            onDone={() => setEditing(false)}
          />
        </div>
      ) : drive.error ? (
        <p className="text-warning py-4 text-sm">{drive.error}</p>
      ) : drive.assets.length === 0 ? (
        <p className="text-faint py-4 text-center text-sm">
          The folder is empty — nothing to show yet.
        </p>
      ) : (
        <div className="space-y-1.5">
          {drive.assets.map((a) => (
            <a
              key={a.id}
              href={a.webViewLink ?? undefined}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "bg-card hover:border-brand/40 flex items-center gap-3 rounded-lg border p-2.5 transition-colors",
                !a.webViewLink && "pointer-events-none opacity-60",
              )}
            >
              <span
                className={cn(
                  "w-14 shrink-0 rounded-full border px-1.5 py-0.5 text-center text-[10px]",
                  isDriveFolder(a.mimeType)
                    ? "border-brand/35 text-brand"
                    : "text-muted-foreground",
                )}
              >
                {driveKindLabel(a.mimeType)}
              </span>
              {isDriveFolder(a.mimeType) && (
                <FolderOpen className="text-faint size-3.5 shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm">{a.name}</span>
              {a.modifiedTime && (
                <span className="text-faint shrink-0 text-[11px]">
                  {fmtModified(a.modifiedTime)}
                </span>
              )}
              <ExternalLink className="text-faint size-3 shrink-0" />
            </a>
          ))}
        </div>
      )}
    </Panel>
  );
}
