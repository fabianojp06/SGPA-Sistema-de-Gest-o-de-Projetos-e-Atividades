"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell } from "lucide-react";
import { markNotificationRead, markAllNotificationsRead } from "@/actions/notifications";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  createdAt: Date;
}

interface NotificationBellProps {
  initialNotifications: NotificationItem[];
  initialUnreadCount: number;
}

export function NotificationBell({ initialNotifications, initialUnreadCount }: NotificationBellProps) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const router = useRouter();

  async function handleOpenNotification(notification: NotificationItem) {
    if (!notification.read) {
      setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
      await markNotificationRead({ id: notification.id });
    }
    router.push(notification.link);
  }

  async function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    await markAllNotificationsRead();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="relative rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Notificações"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <Badge className="absolute -right-1 -top-1 h-4 min-w-4 justify-center rounded-full bg-[var(--accent-danger)] px-1 text-[10px]">
                {unreadCount}
              </Badge>
            )}
          </button>
        }
      />
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-medium text-foreground">Notificações</span>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-xs font-medium text-accent hover:underline"
            >
              Marcar todas como lidas
            </button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhuma notificação.</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleOpenNotification(n)}
                className={`flex w-full flex-col gap-0.5 border-b border-border/50 px-3 py-2.5 text-left transition-colors hover:bg-muted ${
                  n.read ? "opacity-60" : ""
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />}
                  {n.title}
                </span>
                <span className="text-xs text-muted-foreground">{n.body}</span>
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
