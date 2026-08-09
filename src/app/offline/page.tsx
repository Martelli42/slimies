import Link from "next/link";

import { Icon } from "@/components/icon";
import { Button, Panel } from "@/components/ui/primitives";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-5">
      <Panel className="w-full max-w-sm p-8 text-center">
        <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl border border-hairline text-ink-faint">
          <Icon name="bolt" size={24} />
        </span>
        <h1 className="font-display text-xl font-extrabold">No connection</h1>
        <p className="mt-2 text-sm text-ink-muted">
          The system needs the network to record progress. Your logged activities are safe —
          reconnect and everything syncs.
        </p>
        <Link href="/dashboard" className="mt-6 inline-block w-full">
          <Button fullWidth>Try again</Button>
        </Link>
      </Panel>
    </div>
  );
}
