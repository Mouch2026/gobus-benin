import "server-only";
import { supabaseAdmin } from "./supabaseAdmin";

export type NotificationType =
  | "booking_confirmation"
  | "trip_cancellation"
  | "voucher_refund_pending"
  | "booking_payment_link";

// Utilisée par les 3 send*Notification — un seul point d'écriture plutôt
// que de tripler le try/catch. Ne doit jamais faire échouer l'appelant :
// le journal est secondaire par rapport à l'envoi réel qu'il enregistre.
export async function logNotification(entry: {
  userId: string;
  type: NotificationType;
  bookingId?: string | null;
  voucherId?: string | null;
  status: "sent" | "failed";
  errorMessage?: string | null;
}): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from("notification_log").insert({
      user_id: entry.userId,
      type: entry.type,
      booking_id: entry.bookingId ?? null,
      voucher_id: entry.voucherId ?? null,
      channel: "email",
      status: entry.status,
      error_message: entry.errorMessage ?? null,
    });
    if (error) throw error;
  } catch (error) {
    console.error("Impossible d'écrire dans notification_log :", error);
  }
}
