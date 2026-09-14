import Link from "next/link";
import { requireCompany } from "@/lib/supabase/dal";
import { getCompanyNotifications } from "@/lib/notifications";
import { AccessBlockedMessage } from "../_components";
import { NOTIFICATION_LEVEL_LABELS, NOTIFICATION_LEVEL_STYLES } from "../_shared";

// Gabarit direct de apps/web/app/compte/notifications/page.tsx (maps de
// libellés, pastille de statut, formatDate local) — mais en zinc-*, le
// back-office n'utilisant pas les tokens sémantiques de apps/web.
function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-BJ", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Porto-Novo",
  }).format(new Date(iso));
}

export default async function NotificationsPage() {
  const result = await requireCompany();
  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  const notifications = await getCompanyNotifications(100);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-8">
      <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Notifications</h1>

      {notifications.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Aucune notification pour le moment.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {notifications.map((notification) => (
            <li
              key={notification.id}
              className="flex flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-center justify-between gap-4">
                <span className="font-medium text-zinc-950 dark:text-zinc-50">
                  {notification.title}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {notification.kind === "state_alert" ? (
                    <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                      En cours
                    </span>
                  ) : null}
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${NOTIFICATION_LEVEL_STYLES[notification.level]}`}
                  >
                    {NOTIFICATION_LEVEL_LABELS[notification.level]}
                  </span>
                </span>
              </div>
              {notification.body ? (
                <span className="text-sm text-zinc-500 dark:text-zinc-400">{notification.body}</span>
              ) : null}
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                {formatDate(notification.createdAt)}
              </span>
              {notification.actionHref ? (
                <Link
                  href={notification.actionHref}
                  className="mt-1 text-sm font-medium text-zinc-950 hover:underline dark:text-zinc-50"
                >
                  Voir →
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
