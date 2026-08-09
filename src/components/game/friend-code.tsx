"use client";

import * as React from "react";

import { Icon } from "@/components/icon";
import { Panel } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

/** The player's shareable code, with a one-tap copy (and a share sheet on mobile). */
export function FriendCode({ code }: { code: string }) {
  const toast = useToast();
  const [copied, setCopied] = React.useState(false);

  async function share() {
    const text = `Add me on ASCENDANT — my code is ${code}`;

    if (navigator.share) {
      try {
        await navigator.share({ text, title: "ASCENDANT" });
        return;
      } catch {
        // Share sheet dismissed — fall through to copying.
      }
    }

    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.push({ title: "Code copied", message: code, tone: "success" });
    } catch {
      toast.push({ title: "Copy failed", message: `Your code is ${code}`, tone: "danger" });
    }
  }

  return (
    <Panel className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="label-eyebrow">Your friend code</p>
        <p className="numeral mt-1 truncate text-xl tracking-[0.12em] text-accent-soft">
          {code}
        </p>
      </div>
      <button
        onClick={share}
        className="flex size-10 items-center justify-center rounded-lg border border-hairline text-ink-muted transition-colors hover:border-accent/50 hover:text-ink"
        aria-label="Copy friend code"
      >
        <Icon name={copied ? "check" : "copy"} size={17} />
      </button>
    </Panel>
  );
}
