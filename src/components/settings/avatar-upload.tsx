"use client";

import { useRef, useTransition } from "react";
import { Camera, Upload } from "lucide-react";

import { saveAvatar } from "@/app/(app)/profile/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * Profile picture: picked locally, downscaled in the browser to a small
 * square, stored as a data URL in user_prefs — no blob storage needed at
 * this size, and it renders instantly everywhere the avatar shows.
 *
 * Two layouts share the picker: the bare clickable avatar ("icon") and the
 * account page's avatar-plus-"Change photo" row ("row").
 */

const SIZE = 128;

async function toSquareDataUrl(file: File): Promise<string> {
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
    const sx = (img.width - side) / 2;
    const sy = (img.height - side) / 2;
    ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function AvatarUpload({
  avatarUrl,
  initial,
  layout = "icon",
}: {
  avatarUrl: string | null;
  initial: string;
  layout?: "icon" | "row";
}) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = () => inputRef.current?.click();

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        start(async () => {
          try {
            const dataUrl = await toSquareDataUrl(file);
            await saveAvatar(dataUrl);
            toast({ tone: "success", title: "Profile picture updated" });
          } catch (err) {
            toast({
              tone: "error",
              title: err instanceof Error ? err.message : "Upload failed.",
            });
          }
        });
      }}
    />
  );

  if (layout === "row") {
    return (
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={pick}
          disabled={pending}
          className="group relative shrink-0 rounded-full transition-transform hover:scale-[1.04] active:scale-95"
          aria-label="Change profile picture"
          title="Change profile picture"
        >
          <Avatar className="size-16">
            {avatarUrl && <AvatarImage src={avatarUrl} alt="Profile picture" />}
            <AvatarFallback className="text-lg">{initial}</AvatarFallback>
          </Avatar>
          <span className="bg-background/70 absolute inset-0 grid place-items-center rounded-full opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
            <Camera className="size-5" />
          </span>
        </button>
        <div className="min-w-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={pick}
            disabled={pending}
            className="gap-1.5"
          >
            <Upload className="size-3.5" />
            {pending ? "Uploading…" : "Change photo"}
          </Button>
          <p className="text-faint mt-1.5 text-[11px]">
            JPG, PNG or GIF. Squared automatically.
          </p>
        </div>
        {fileInput}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={pick}
        disabled={pending}
        className="group relative shrink-0 rounded-full transition-transform hover:scale-[1.04] active:scale-95"
        aria-label="Change profile picture"
        title="Change profile picture"
      >
        <Avatar className="size-16">
          {avatarUrl && <AvatarImage src={avatarUrl} alt="Profile picture" />}
          <AvatarFallback className="text-lg">{initial}</AvatarFallback>
        </Avatar>
        <span className="bg-background/70 absolute inset-0 grid place-items-center rounded-full opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
          <Camera className="size-5" />
        </span>
      </button>
      {fileInput}
    </>
  );
}
