"use client";

import * as React from "react";

import { Avatar } from "@/components/game/avatar";
import { Icon } from "@/components/icon";
import { Spinner } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Uploads to the public `avatars` bucket under `<user id>/…`, which is the only
 * path the storage policy lets a player write to.
 */
export function AvatarUpload({
  userId,
  name,
  value,
  onChange,
  size = 96,
}: {
  userId: string;
  name: string;
  value: string | null;
  onChange: (url: string | null) => void;
  size?: number;
}) {
  const toast = useToast();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);

  async function upload(file: File) {
    if (file.size > MAX_BYTES) {
      toast.push({ title: "Image too large", message: "Keep it under 2 MB.", tone: "danger" });
      return;
    }

    setUploading(true);
    const supabase = createClient();
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const path = `${userId}/avatar-${Date.now()}.${extension}`;

    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, cacheControl: "3600" });

    if (error) {
      setUploading(false);
      toast.push({
        title: "Upload failed",
        message: error.message,
        tone: "danger",
      });
      return;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    onChange(data.publicUrl);
    setUploading(false);
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="group relative rounded-xl focus-visible:outline-2"
        aria-label="Upload an avatar"
      >
        <Avatar name={name} src={value} size={size} ring />
        <span className="absolute -right-1 -bottom-1 flex size-8 items-center justify-center rounded-full border border-hairline bg-surface text-ink-muted transition-colors group-hover:text-ink">
          {uploading ? <Spinner className="size-3.5" /> : <Icon name="camera" size={15} />}
        </span>
      </button>

      {value ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs text-ink-faint hover:text-danger"
        >
          Remove
        </button>
      ) : (
        <p className="text-xs text-ink-faint">PNG, JPG or WebP · max 2 MB</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}
