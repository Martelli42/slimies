"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { useToast } from "@/components/ui/toast";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";
import type { AppNotification } from "@/lib/types/database";

/**
 * Live notification toasts.
 *
 * Subscribes to inserts on the player's own notification rows — Row Level
 * Security means the realtime stream only ever carries their own.
 */
export function RealtimeAlerts({ userId }: { userId: string }) {
  const toast = useToast();
  const router = useRouter();

  React.useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const notification = payload.new as AppNotification;
          toast.push({
            title: notification.title,
            message: notification.message,
            tone: notification.kind === "level_up" ? "success" : "info",
          });
          router.refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, toast, router]);

  return null;
}
