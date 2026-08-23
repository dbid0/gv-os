"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { Camera } from "lucide-react";

import { saveAvatar } from "@/app/(app)/profile/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";

/**
 * Profile picture: picked locally, downscaled in the browser to a small
 * square, stored as a data URL in user_prefs — no blob storage needed at
 * this size, and it renders instantly everywhere the avatar shows.
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
}: {
  avatarUrl: string | null;
  initial: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="group relative rounded-full transition-transform hover:scale-[1.04] active:scale-95"
        aria-label="Change profile picture"
      >
        <Avatar className="size-16">
          {avatarUrl && <AvatarImage src={avatarUrl} alt="Profile picture" />}
          <AvatarFallback className="text-lg">{initial}</AvatarFallback>
        </Avatar>
        <span className="bg-background/80 absolute inset-0 grid place-items-center rounded-full opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
          <Camera className="size-5" />
        </span>
      </button>
      <div className="text-faint text-xs">
        {pending ? "Uploading…" : "Click the picture to change it."}
      </div>
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
              router.refresh();
            } catch (err) {
              toast({
                tone: "error",
                title: err instanceof Error ? err.message : "Upload failed.",
              });
            }
          });
        }}
      />
    </div>
  );
}
