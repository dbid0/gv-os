"use client";

import { useRef, useTransition } from "react";

import { saveWorkspaceLogo } from "@/app/w/[slug]/logo-actions";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/**
 * The workspace mark: the client's logo when uploaded, their accent initial
 * until then. Admins click it to change; client previews just see it.
 */

const SIZE = 256;

async function toLogoDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not read that image."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable.");
    const side = Math.min(img.width, img.height);
    ctx.drawImage(
      img,
      (img.width - side) / 2,
      (img.height - side) / 2,
      side,
      side,
      0,
      0,
      SIZE,
      SIZE,
    );
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function WorkspaceLogo({
  slug,
  logo,
  initial,
  accent,
  editable,
}: {
  slug: string;
  logo: string | null;
  initial: string;
  accent: string;
  editable: boolean;
}) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const mark = logo ? (
    // eslint-disable-next-line @next/next/no-img-element -- data URL, no optimizer
    <img src={logo} alt="" className="size-8 shrink-0 rounded-md border object-cover" />
  ) : (
    <span
      className="grid size-8 shrink-0 place-items-center rounded-md border text-xs font-bold"
      style={{
        color: accent,
        borderColor: `${accent}55`,
        background: `${accent}14`,
      }}
    >
      {initial}
    </span>
  );

  if (!editable) return mark;

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        className={cn(
          "rounded-md transition-transform hover:scale-[1.06] active:scale-95",
          pending && "opacity-60",
        )}
        title="Change workspace logo"
        aria-label="Change workspace logo"
      >
        {mark}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        data-logo-input={slug}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          start(async () => {
            try {
              const dataUrl = await toLogoDataUrl(file);
              await saveWorkspaceLogo(slug, dataUrl);
              toast({ tone: "success", title: "Workspace logo updated" });
            } catch (err) {
              toast({
                tone: "error",
                title: err instanceof Error ? err.message : "Upload failed.",
              });
            }
          });
        }}
      />
    </>
  );
}
