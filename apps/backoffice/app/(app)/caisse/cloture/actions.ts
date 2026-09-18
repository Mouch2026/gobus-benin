"use server";

import { requireCompany } from "@/lib/supabase/dal";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOpenSession } from "@/lib/caisse";

// Volontairement UN SEUL type plat (pas de solde théorique en entrée,
// jamais lu ni transmis nulle part avant l'appel RPC) — l'écart n'existe
// dans cet état qu'APRÈS une clôture réussie, jamais avant : c'est ce qui
// rend la réconciliation aveugle réelle plutôt qu'une simple convention
// d'affichage.
export type CloseSessionState = {
  error: string | null;
  ecartFcfa: number | null;
  soldeTheoriqueFcfa: number | null;
};

export async function closeSession(
  _prevState: CloseSessionState,
  formData: FormData
): Promise<CloseSessionState> {
  const access = await requireCompany();
  if (!access.ok) {
    return {
      error: "Votre session ou votre abonnement ne permet plus cette action.",
      ecartFcfa: null,
      soldeTheoriqueFcfa: null,
    };
  }

  const raw = String(formData.get("montantCompteFcfa") ?? "").trim();
  const montantCompteFcfa = Number(raw);
  if (!Number.isInteger(montantCompteFcfa) || montantCompteFcfa < 0) {
    return {
      error: "Merci de renseigner le montant réellement compté dans le tiroir (entier positif ou nul).",
      ecartFcfa: null,
      soldeTheoriqueFcfa: null,
    };
  }

  const session = await getOpenSession(access.user.sub);
  if (!session) {
    return { error: "Aucune session de caisse ouverte.", ecartFcfa: null, soldeTheoriqueFcfa: null };
  }

  const { data, error } = await supabaseAdmin
    .rpc("close_session_caisse", {
      p_session_id: session.id,
      p_employe_id: access.user.sub,
      p_montant_compte_fcfa: montantCompteFcfa,
    })
    .single<{ ecart_fcfa: number; solde_theorique_fcfa: number }>();

  if (error || !data) {
    console.error("Impossible de clôturer la session de caisse :", error?.message);
    if (error?.code === "23514") {
      return { error: error.message, ecartFcfa: null, soldeTheoriqueFcfa: null };
    }
    return { error: "Impossible de clôturer cette session. Réessayez.", ecartFcfa: null, soldeTheoriqueFcfa: null };
  }

  return { error: null, ecartFcfa: data.ecart_fcfa, soldeTheoriqueFcfa: data.solde_theorique_fcfa };
}
