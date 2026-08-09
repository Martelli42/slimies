"use client";

import * as React from "react";

import { Icon } from "@/components/icon";
import { Button, cx } from "@/components/ui/primitives";
import { APP_NAME } from "@/lib/constants";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "ascendant:install-dismissed";

/**
 * Home-screen install nudge. Only rendered once the browser tells us the app is
 * actually installable, and never again after it is dismissed.
 */
export function InstallPrompt() {
  const [event, setEvent] = React.useState<InstallPromptEvent | null>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  if (!visible || !event) return null;

  return (
    <div
      className={cx(
        "fixed inset-x-3 bottom-24 z-60 mx-auto max-w-md animate-rise",
        "panel flex items-center gap-3 p-3.5",
      )}
      role="dialog"
      aria-label="Install app"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-accent/35 bg-accent/12 text-accent-soft">
        <Icon name="bolt" size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-xs font-bold">Install {APP_NAME}</p>
        <p className="text-[0.7rem] text-ink-muted">
          Full screen, home screen, and push alerts.
        </p>
      </div>
      <Button
        size="sm"
        onClick={async () => {
          await event.prompt();
          await event.userChoice;
          dismiss();
        }}
      >
        Install
      </Button>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="text-ink-faint hover:text-ink"
      >
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
