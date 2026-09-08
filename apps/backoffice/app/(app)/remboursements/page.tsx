import { requireCompany } from "@/lib/supabase/dal";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { AccessBlockedMessage } from "../_components";
import { RemboursementsTable, type RefundPendingVoucherRow } from "./RemboursementsTable";

// service_role, même convention que get_company_passenger_bookings /
// get_company_payments : get_company_refund_pending_vouchers n'est
// granted qu'à service_role, la portée par compagnie est garantie par
// requireCompany() avant cet appel — un avoir n'a pas de company_id
// direct, la fonction joint jusqu'à la réservation d'origine pour scoper.
async function getRefundPendingVouchers(companyId: string): Promise<RefundPendingVoucherRow[]> {
  const { data, error } = await supabaseAdmin.rpc("get_company_refund_pending_vouchers", {
    p_company_id: companyId,
  });

  if (error) {
    console.error("Impossible de charger les avoirs en attente :", error.message);
    return [];
  }

  return data ?? [];
}

// Purement informatif : la compagnie constate ici les avoirs en attente
// de remboursement issus de ses propres trajets et peut les marquer
// traités une fois le remboursement effectué manuellement — aucun
// mouvement d'argent réel n'a lieu depuis cette page (FedaPay n'est pas
// connecté pour les remboursements).
export default async function RemboursementsPage() {
  const result = await requireCompany();
  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  const vouchers = await getRefundPendingVouchers(result.company.id);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h2 className="mb-2 text-xl font-semibold text-zinc-950 dark:text-zinc-50">Remboursements</h2>
      <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
        Avoirs en attente de remboursement pour vos voyageurs. Cette page est informative : aucun
        paiement n&apos;est déclenché automatiquement, marquez un avoir comme traité une fois le
        remboursement effectué de votre côté.
      </p>

      <RemboursementsTable vouchers={vouchers} />
    </div>
  );
}
