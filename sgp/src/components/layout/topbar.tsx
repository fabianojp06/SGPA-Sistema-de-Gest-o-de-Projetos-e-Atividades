import { UserButton } from "@clerk/nextjs";
import { getMyNotifications } from "@/actions/notifications";
import { CommandPalette } from "@/components/layout/command-palette";
import { NotificationBell } from "@/components/layout/notification-bell";

export async function Topbar() {
  const { notifications, unreadCount } = await getMyNotifications().catch(() => ({
    notifications: [],
    unreadCount: 0,
  }));

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-background px-6">
      <CommandPalette />

      <div className="flex items-center gap-4">
        <NotificationBell initialNotifications={notifications} initialUnreadCount={unreadCount} />
        <UserButton />
      </div>
    </header>
  );
}
