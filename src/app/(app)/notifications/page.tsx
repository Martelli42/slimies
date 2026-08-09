import type { Metadata } from "next";

import { Icon } from "@/components/icon";
import { NotificationList } from "@/components/game/notification-list";
import { EmptyState, Panel } from "@/components/ui/primitives";
import { getNotifications, requireProfile } from "@/lib/data";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const profile = await requireProfile();
  const notifications = await getNotifications(profile.id);

  return (
    <div className="space-y-4">
      <header>
        <p className="label-eyebrow">Inbox</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold">Notifications</h1>
      </header>

      {notifications.length === 0 ? (
        <Panel>
          <EmptyState
            title="Nothing yet"
            message="Level ups, quest reminders and friend requests land here."
            icon={<Icon name="bell" size={26} />}
          />
        </Panel>
      ) : (
        <NotificationList notifications={notifications} />
      )}
    </div>
  );
}
