import { requireCompany } from "@/lib/supabase/dal";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatFcfa } from "shared";
import { AccessBlockedMessage } from "../_components";
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_STYLES, formatDepartureDateTime } from "../_shared";

type CompanyPaymentRow = {
  payment_id: string;
  booking_id: string;
  booking_reference: string;
  base_amount_fcfa: number;
  platform_fee_fcfa: number;
  transaction_fee_fcfa: number;
  voucher_amount_fcfa: number;
  points_redeemed_fcfa: number;
  amount_charged_fcfa: number;
  status: string;
  provider: string;
  method: string | null;
  paid_at: string | null;
  created_at: string;
  origin_city: string;
  destination_city: string;
  departure_at: string;
};

// service_role, même convention que get_company_passenger_bookings :
// get_company_payments n'est granted qu'à service_role, la portée par
// compagnie est déjà garantie par requireCompany() avant cet appel.
async function getCompanyPayments(companyId: string): Promise<CompanyPaymentRow[]> {
  const { data, error } = await supabaseAdmin.rpc("get_company_payments", {
    p_company_id: companyId,
  });

  if (error) {
    console.error("Impossible de charger les paiements :", error.message);
    return [];
  }

  return data ?? [];
}

export default async function PaiementsPage() {
  const result = await requireCompany();
  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  const payments = await getCompanyPayments(result.company.id);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h2 className="mb-4 text-xl font-semibold text-zinc-950 dark:text-zinc-50">Paiements</h2>

      {payments.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Aucun paiement pour le moment.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="px-4 py-3 font-medium">Réservation</th>
                <th className="px-4 py-3 font-medium">Trajet</th>
                <th className="px-4 py-3 font-medium">Base</th>
                <th className="px-4 py-3 font-medium">Frais</th>
                <th className="px-4 py-3 font-medium">Avoir</th>
                <th className="px-4 py-3 font-medium">Points</th>
                <th className="px-4 py-3 font-medium">Payé</th>
                <th className="px-4 py-3 font-medium">Fournisseur</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr
                  key={payment.payment_id}
                  className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                >
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {payment.booking_reference}
                  </td>
                  <td className="px-4 py-3 font-medium text-zinc-950 dark:text-zinc-50">
                    {payment.origin_city} → {payment.destination_city}
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {formatFcfa(payment.base_amount_fcfa)}
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {formatFcfa(payment.platform_fee_fcfa + payment.transaction_fee_fcfa)}
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {payment.voucher_amount_fcfa > 0
                      ? `− ${formatFcfa(payment.voucher_amount_fcfa)}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {payment.points_redeemed_fcfa > 0
                      ? `− ${formatFcfa(payment.points_redeemed_fcfa)}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 font-medium text-zinc-950 dark:text-zinc-50">
                    {formatFcfa(payment.amount_charged_fcfa)}
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {payment.provider}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                        PAYMENT_STATUS_STYLES[payment.status] ??
                        "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      }`}
                    >
                      {PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {formatDepartureDateTime(payment.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
