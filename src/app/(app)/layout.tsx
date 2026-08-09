import { Ambient } from "@/components/game/ambient";
import { AppHeader } from "@/components/nav/app-header";
import { BottomNav } from "@/components/nav/bottom-nav";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { RealtimeAlerts } from "@/components/pwa/realtime-alerts";
import { ServiceWorker } from "@/components/pwa/service-worker";
import { requireProfile, getUnreadCount } from "@/lib/data";

/**
 * The signed-in shell. Guards the whole route group: unauthenticated visitors
 * are bounced to /login, half-registered ones back to /onboarding.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const unread = await getUnreadCount(profile.id);

  return (
    <div className="relative min-h-dvh">
      <Ambient />
      <ServiceWorker />
      <AppHeader profile={profile} unread={unread} />

      <main className="mx-auto w-full max-w-lg px-4 pt-4 pb-nav">{children}</main>

      <RealtimeAlerts userId={profile.id} />
      <InstallPrompt />
      <BottomNav />
    </div>
  );
}
