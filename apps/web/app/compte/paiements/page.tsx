import { requireUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { sweepExpiredVouchers } from "@/lib/vouchers";
import { formatFcfa } from "shared";
import { AccountShell } from "../_shared";
import { EmptyState } from "../../recherche/_shared";

type PaymentRow = {
  id: string;
  base_amount_fcfa: number;
  amount_fcfa: number;
  voucher_amount_fcfa: number;
  amount_charged_fcfa: number;
  status: string;
  refunded_amount_fcfa: number | null;
  refunded_at: string | null;
  paid_at: string | null;
  bookings: {
    booking_reference: string;
    trips: { departure_at: string; routes: { origin_city: string; destination_city: string } } | null;
  } | null;
};

type VoucherRow = {
  id: string;
  amount_fcfa: number;
  status: string;
  expires_at: string;
  refund_pending_amount_fcfa: number | null;
  refund_pending_at: string | null;
  bookings: { booking_reference: string } | null;
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  approved: "Payé",
  failed: "Échoué",
  refunded: "Remboursé",
  voucher_issued: "Avoir émis",
};

const VOUCHER_STATUS_LABELS: Record<string, string> = {
  active: "Actif",
  refund_pending: "En attente de remboursement",
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-BJ", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Africa/Porto-Novo",
  }).format(new Date(iso));
}

async function getUserPayments(userId: string): Promise<PaymentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .select(
      "id, base_amount_fcfa, amount_fcfa, voucher_amount_fcfa, amount_charged_fcfa, status, refunded_amount_fcfa, refunded_at, paid_at, bookings!inner(booking_reference, user_id, trips(departure_at, routes(origin_city, destination_city)))"
    )
    .eq("bookings.user_id", userId)
    .order("paid_at", { ascending: false, nullsFirst: false })
    .returns<PaymentRow[]>();

  if (error) {
    console.error("Impossible de charger les paiements :", error.message);
    return [];
  }

  return data ?? [];
}

async function getUserVouchers(userId: string): Promise<VoucherRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vouchers")
    .select(
      "id, amount_fcfa, status, expires_at, refund_pending_amount_fcfa, refund_pending_at, bookings!origin_booking_id(booking_reference)"
    )
    .eq("user_id", userId)
    .in("status", ["active", "refund_pending"])
    .order("created_at", { ascending: false })
    .returns<VoucherRow[]>();

  if (error) {
    console.error("Impossible de charger les avoirs :", error.message);
    return [];
  }

  return data ?? [];
}

export default async function PaiementsPage() {
  const user = await requireUser("/compte/paiements");

  await sweepExpiredVouchers();
  const [payments, vouchers] = await Promise.all([
    getUserPayments(user.sub),
    getUserVouchers(user.sub),
  ]);

  return (
    <AccountShell active="/compte/paiements" title="Paiements & remboursements">
      <div className="flex flex-col gap-8">
        <section>
          <h2 className="mb-3 font-display text-lg font-bold text-foreground">Paiements</h2>
          {payments.length === 0 ? (
            <EmptyState>Aucun paiement pour le moment.</EmptyState>
          ) : (
            <ul className="flex flex-col gap-3">
              {payments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-semibold text-foreground">
                      {payment.bookings?.booking_reference ?? "—"}
                    </span>
                    <span className="font-display text-lg font-extrabold text-foreground">
                      {formatFcfa(payment.amount_charged_fcfa)}
                    </span>
                  </div>
                  {payment.bookings?.trips ? (
                    <span className="text-sm text-muted">
                      {payment.bookings.trips.routes.origin_city} →{" "}
                      {payment.bookings.trips.routes.destination_city}
                    </span>
                  ) : null}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-muted">
                      {PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}
                      {payment.paid_at ? ` · ${formatDate(payment.paid_at)}` : ""}
                    </span>
                    {payment.refunded_amount_fcfa ? (
                      <span className="font-medium text-primary">
                        {formatFcfa(payment.refunded_amount_fcfa)} remboursés
                        {payment.refunded_at ? ` le ${formatDate(payment.refunded_at)}` : ""}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-bold text-foreground">
            Avoirs actifs et en attente de remboursement
          </h2>
          {vouchers.length === 0 ? (
            <EmptyState>Aucun avoir actif pour le moment.</EmptyState>
          ) : (
            <ul className="flex flex-col gap-3">
              {vouchers.map((voucher) => (
                <li
                  key={voucher.id}
                  className="flex flex-col gap-2 rounded-2xl border border-primary/30 bg-primary/10 p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-semibold text-foreground">
                      {voucher.bookings?.booking_reference ?? "—"}
                    </span>
                    <span className="font-display text-lg font-extrabold text-foreground">
                      {formatFcfa(voucher.amount_fcfa)}
                    </span>
                  </div>
                  <span className="text-sm text-muted">
                    {VOUCHER_STATUS_LABELS[voucher.status] ?? voucher.status}
                    {voucher.status === "active" ? ` · valable jusqu'au ${formatDate(voucher.expires_at)}` : ""}
                    {voucher.status === "refund_pending" && voucher.refund_pending_amount_fcfa
                      ? ` · ${formatFcfa(voucher.refund_pending_amount_fcfa)} en attente`
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AccountShell>
  );
}
