"use server";

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/supabase/dal";
import { requirePermission } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type MarkVoucherProcessedState = { error: string | null };

// Purement informatif : aucun mouvement d'argent réel (FedaPay non
// connecté), juste un statut terminal + une trace d'audit. Passe par
// service_role car aucune policy RLS ne permet à authenticated de modifier
// vouchers (voir la migration) — mais mark_voucher_refund_processed
// revérifie elle-même que l'avoir appartient bien à cette compagnie avant
// d'écrire quoi que ce soit (défense en profondeur, cf. le plan), donc le
// company_id passé ici n'a pas besoin d'être "fait confiance" seul.
// Même patron que cancelTrip (trajets/[id]/actions.ts) : requireCompany()
// → action ciblée → revalidatePath.
//
// Chantier "gardes d'accès serveur sur les pages" — trou trouvé par
// l'audit : cette action n'avait jusqu'ici AUCUNE garde de rôle (un agent
// pouvait marquer un avoir comme traité). "refunds.manage" aligne la
// garde de l'action sur celle de la page (owner + agency_manager,
// requirePageAccess(result, "ownerAndManager") dans page.tsx).
export async function markVoucherProcessed(
  _prevState: MarkVoucherProcessedState,
  formData: FormData
): Promise<MarkVoucherProcessedState> {
  const access = await requireCompany();
  const guardError = requirePermission(access, "refunds.manage");
  if (guardError) return guardError;
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action." };
  }

  const voucherId = String(formData.get("voucherId") ?? "");
  if (!voucherId) {
    return { error: "Avoir invalide." };
  }

  const { error } = await supabaseAdmin.rpc("mark_voucher_refund_processed", {
    p_voucher_id: voucherId,
    p_company_id: access.company.id,
    p_processed_by: access.user.sub,
  });

  if (error) {
    console.error("Impossible de marquer l'avoir comme traité :", error.message);
    return { error: "Impossible de marquer cet avoir comme traité. Réessayez." };
  }

  revalidatePath("/remboursements");
  revalidatePath("/");
  return { error: null };
}
