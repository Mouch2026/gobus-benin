import Link from "next/link";
import { NOTIFICATION_LEVEL_STYLES } from "./_shared";
import { formatRelativeTime } from "@/lib/relative-time";
import type { CompanyNotification } from "@/lib/notifications";
import { markAllNotificationsRead, openNotification } from "./_notification-actions";
import { NotificationBadge } from "./_notification-badge";
import { BellIcon } from "@/lib/icons";

function NotificationRow({ notification }: { notification: CompanyNotification }) {
  const content = (
    <div
      className={`flex flex-col gap-1 rounded-md px-3 py-2 text-left ${
        notification.isRead ? "" : "bg-zinc-50 dark:bg-zinc-800/60"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${NOTIFICATION_LEVEL_STYLES[notification.level]}`}
        >
          {notification.level === "critical"
            ? "Critique"
            : notification.level === "warning"
              ? "Attention"
              : "Info"}
        </span>
        <span className="truncate text-sm font-medium text-zinc-950 dark:text-zinc-50">
          {notification.title}
        </span>
      </div>
      {notification.body ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{notification.body}</p>
      ) : null}
      {notification.kind === "event" ? (
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          {formatRelativeTime(notification.createdAt)}
        </span>
      ) : null}
    </div>
  );

  // Une alerte d'état n'a pas de notion de lu, et n'a pas systématiquement
  // de lien d'action — dans ce cas un simple bloc, pas un bouton.
  if (!notification.actionHref) {
    return content;
  }

  return (
    <form action={openNotification}>
      <input type="hidden" name="notificationId" value={notification.id} />
      <input type="hidden" name="href" value={notification.actionHref} />
      <button type="submit" className="w-full hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md">
        {content}
      </button>
    </form>
  );
}

export function NotificationBell({
  notifications,
  unreadCount,
}: {
  notifications: CompanyNotification[];
  unreadCount: number;
}) {
  const stateAlerts = notifications.filter((n) => n.kind === "state_alert");
  const events = notifications.filter((n) => n.kind === "event");

  return (
    // Même patron <details>/<summary> sans JS que le menu utilisateur et
    // le sous-menu Administration (voir _app-shell.tsx) — le panneau reste
    // un Server Component, seul le badge de compte est un îlot client.
    <details className="group relative">
      <summary className="relative flex cursor-pointer list-none items-center text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50">
        <BellIcon className="h-5 w-5" aria-hidden />
        <NotificationBadge initialCount={unreadCount} />
      </summary>
      <div className="absolute right-0 top-full z-10 mt-2 flex w-80 max-w-[90vw] flex-col rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
          <span className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            Notifications
          </span>
          {unreadCount > 0 ? (
            <form action={markAllNotificationsRead}>
              <button
                type="submit"
                className="text-xs font-medium text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
              >
                Tout marquer lu
              </button>
            </form>
          ) : null}
        </div>

        <div className="flex max-h-96 flex-col gap-1 overflow-y-auto p-2">
          {notifications.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
              Aucune notification.
            </p>
          ) : (
            <>
              {stateAlerts.map((n) => (
                <NotificationRow key={n.id} notification={n} />
              ))}
              {events.map((n) => (
                <NotificationRow key={n.id} notification={n} />
              ))}
            </>
          )}
        </div>

        <div className="border-t border-zinc-100 p-2 dark:border-zinc-800">
          <Link
            href="/notifications"
            className="block rounded-md px-3 py-2 text-center text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Voir tout l&apos;historique
          </Link>
        </div>
      </div>
    </details>
  );
}
