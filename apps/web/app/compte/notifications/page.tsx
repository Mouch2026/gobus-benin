import { requireUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { formatFcfa } from "shared";
import { AccountShell } from "../_shared";
import { EmptyState } from "../../recherche/_shared";

type NotificationRow = {
  id: string;
  type: string;
  status: string;
  error_message: string | null;
  created_at: string;
  bookings: { booking_reference: string } | null;
  vouchers: { amount_fcfa: number } | null;
};

const TYPE_LABELS: Record<string, string> = {
  booking_confirmation: "Confirmation de réservation",
  trip_cancellation: "Trajet annulé",
  voucher_refund_pending: "Avoir en attente de remboursement",
};

const STATUS_LABELS: Record<string, string> = {
  sent: "Envoyé",
  failed: "Échec",
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-BJ", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Africa/Porto-Novo",
  }).format(new Date(iso));
}

async function getUserNotifications(userId: string): Promise<NotificationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_log")
    .select("id, type, status, error_message, created_at, bookings(booking_reference), vouchers(amount_fcfa)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .returns<NotificationRow[]>();

  if (error) {
    console.error("Impossible de charger l'historique des notifications :", error.message);
    return [];
  }

  return data ?? [];
}

export default async function NotificationsPage() {
  const user = await requireUser("/compte/notifications");
  const notifications = await getUserNotifications(user.sub);

  return (
    <AccountShell active="/compte/notifications" title="Notifications">
      {notifications.length === 0 ? (
        <EmptyState>Aucune notification pour le moment.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {notifications.map((notification) => (
            <li
              key={notification.id}
              className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-4"
            >
              <div className="flex items-center justify-between gap-4">
                <span className="font-semibold text-foreground">
                  {TYPE_LABELS[notification.type] ?? notification.type}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    notification.status === "sent"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {STATUS_LABELS[notification.status] ?? notification.status}
                </span>
              </div>
              <span className="text-sm text-muted">
                {notification.bookings?.booking_reference
                  ? `Réservation ${notification.bookings.booking_reference}`
                  : notification.vouchers
                    ? `Avoir de ${formatFcfa(notification.vouchers.amount_fcfa)}`
                    : null}
                {" · "}
                {formatDate(notification.created_at)}
              </span>
              {notification.status === "failed" && notification.error_message ? (
                <span className="text-xs text-red-600">{notification.error_message}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </AccountShell>
  );
}
