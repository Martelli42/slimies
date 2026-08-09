import Link from "next/link";
import { redirect } from "next/navigation";

import { Icon } from "@/components/icon";
import { Ambient } from "@/components/game/ambient";
import { RankBadge } from "@/components/game/rank-badge";
import { Button, Panel } from "@/components/ui/primitives";
import { APP_NAME, ATTRIBUTE_LIST } from "@/lib/constants";
import { getProfile } from "@/lib/data";

const STEPS = [
  {
    icon: "bolt",
    title: "Do the real thing",
    body: "Train, study, run, build. The work happens off-screen — the app only records it.",
  },
  {
    icon: "chart",
    title: "Earn XP that means something",
    body: "The system evaluates what you actually did. Entertainment dressed up as learning earns nothing.",
  },
  {
    icon: "target",
    title: "Raise your attributes",
    body: "Five stats, one character sheet. Watch the shape of your effort take form.",
  },
  {
    icon: "users",
    title: "Bring rivals",
    body: "Friend codes, weekly leaderboards, and the quiet pressure of someone catching up.",
  },
  {
    icon: "crown",
    title: "Outgrow who you were",
    body: "Ranks from Bronze to Mythic. No cap, no ceiling, no shortcuts.",
  },
];

export default async function LandingPage() {
  const profile = await getProfile();
  if (profile) redirect(profile.onboarded ? "/dashboard" : "/onboarding");

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <Ambient />

      {/* ------------------------------------------------------------ hero */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 pt-6">
        <div className="flex items-center gap-2">
          <Icon name="bolt" size={18} className="text-accent" />
          <span className="font-display text-sm font-extrabold tracking-[0.28em]">
            {APP_NAME}
          </span>
        </div>
        <Link
          href="/login"
          className="font-display text-xs font-bold tracking-[0.16em] text-ink-muted uppercase transition-colors hover:text-ink"
        >
          Sign in
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-24">
        <section className="pt-16 pb-14 sm:pt-24">
          <p className="label-eyebrow animate-fade-in">System online</p>
          <h1 className="mt-3 max-w-3xl font-display text-[2.7rem] leading-[1.02] font-extrabold tracking-tight sm:text-6xl">
            Level up your
            <span className="block glow-text text-accent-soft">real life</span>
          </h1>

          <div className="mt-7 max-w-md space-y-1.5 text-base text-ink-muted sm:text-lg">
            <p>Your workouts.</p>
            <p>Your knowledge.</p>
            <p>Your discipline.</p>
            <p className="text-ink">Turn them into stats.</p>
          </div>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/register" className="sm:w-auto">
              <Button size="lg" fullWidth className="sm:w-64">
                Begin awakening
              </Button>
            </Link>
            <Link href="/login" className="sm:w-auto">
              <Button size="lg" variant="secondary" fullWidth className="sm:w-40">
                Sign in
              </Button>
            </Link>
          </div>
        </section>

        {/* ------------------------------------------------------ attributes */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ATTRIBUTE_LIST.map((attr, index) => (
            <Panel
              key={attr.key}
              className="animate-rise"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <div className="flex items-baseline justify-between">
                <span
                  className="font-display text-2xl font-extrabold tracking-[0.1em]"
                  style={{ color: `var(${attr.cssVar})` }}
                >
                  {attr.code}
                </span>
                <span className="label-eyebrow">{attr.label}</span>
              </div>
              <p className="mt-2 text-sm text-ink-muted">{attr.blurb}</p>
              <div
                className="mt-4 h-1 w-full rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${attr.hex}, transparent)`,
                }}
              />
            </Panel>
          ))}

          <Panel className="animate-rise flex items-center gap-4" style={{ animationDelay: "300ms" }}>
            <RankBadge level={27} size={62} />
            <div>
              <p className="label-eyebrow">Ranks</p>
              <p className="mt-1 font-display text-sm font-bold">
                Bronze → Silver → Gold → Platinum
              </p>
              <p className="text-sm text-ink-muted">Diamond → Master → Legend → Mythic</p>
            </div>
          </Panel>
        </section>

        {/* --------------------------------------------------------- how it works */}
        <section className="mt-20">
          <p className="label-eyebrow">How it works</p>
          <h2 className="mt-2 font-display text-2xl font-extrabold sm:text-3xl">
            Five steps. No fluff.
          </h2>

          <ol className="mt-7 space-y-3">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <Panel className="flex items-start gap-4">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-accent/35 bg-accent/12 text-accent-soft">
                    <Icon name={step.icon} size={17} />
                  </span>
                  <div>
                    <p className="font-display text-sm font-bold">
                      <span className="mr-2 text-ink-faint">{index + 1}</span>
                      {step.title}
                    </p>
                    <p className="mt-1 text-sm text-ink-muted">{step.body}</p>
                  </div>
                </Panel>
              </li>
            ))}
          </ol>
        </section>

        {/* -------------------------------------------------------------- close */}
        <section className="mt-20">
          <Panel className="relative overflow-hidden p-8 text-center">
            <div className="absolute inset-x-0 top-0 h-px beam-line" />
            <p className="label-eyebrow">Ready</p>
            <h2 className="mt-2 font-display text-2xl font-extrabold sm:text-3xl">
              Become a stronger version of yourself
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
              Free to start. Works on your phone. Install it to your home screen and it
              behaves like an app.
            </p>
            <Link href="/register" className="mt-6 inline-block">
              <Button size="lg" className="w-64">
                Begin awakening
              </Button>
            </Link>
          </Panel>
        </section>
      </main>

      <footer className="border-t border-hairline px-5 py-6">
        <p className="mx-auto max-w-5xl text-xs text-ink-faint">
          {APP_NAME} — an original progression system. Track real effort, not screen time.
        </p>
      </footer>
    </div>
  );
}
