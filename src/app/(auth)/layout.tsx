import Link from "next/link";

import { Ambient } from "@/components/game/ambient";
import { Icon } from "@/components/icon";
import { APP_NAME } from "@/lib/constants";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <Ambient />
      <header className="px-5 pt-6">
        <Link href="/" className="inline-flex items-center gap-2">
          <Icon name="bolt" size={18} className="text-accent" />
          <span className="font-display text-sm font-extrabold tracking-[0.28em]">
            {APP_NAME}
          </span>
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
