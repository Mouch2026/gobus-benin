import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Chantier 4 : résolution de la session de caisse ouverte d'un employé —
// partagée entre finalizeCounterBookingPayment.ts (encaissement),
// caisse/actions.ts (vide-caisse, clôture) et caisse/page.tsx (tableau
// de bord), jamais dupliquée.

export type OpenSession = {
  id: string;
  employeId: string;
  companyId: string;
  agenceId: string;
  openedAt: string;
};

export async function getOpenSession(employeId: string): Promise<OpenSession | null> {
  const { data } = await supabaseAdmin
    .from("session_caisse")
    .select("id, employe_id, company_id, agence_id, opened_at")
    .eq("employe_id", employeId)
    .is("closed_at", null)
    .maybeSingle<{
      id: string;
      employe_id: string;
      company_id: string;
      agence_id: string;
      opened_at: string;
    }>();

  if (!data) return null;
  return {
    id: data.id,
    employeId: data.employe_id,
    companyId: data.company_id,
    agenceId: data.agence_id,
    openedAt: data.opened_at,
  };
}

// Solde théorique = somme signée de mouvements_caisse (ENCAISSEMENT
// positif, DEPOT_COFFRE négatif) — jamais un compteur mis en cache, voir
// le plan. Utilisée pour le tableau de bord EN COURS DE SESSION
// uniquement — jamais sur l'écran de clôture (réconciliation aveugle :
// close_session_caisse calcule et révèle ce même solde côté serveur,
// après coup, sans jamais transiter par cette fonction côté page).
export async function getTheoreticalBalance(sessionId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("mouvements_caisse")
    .select("type, montant_fcfa")
    .eq("session_id", sessionId);

  return (data ?? []).reduce(
    (sum, m) => sum + (m.type === "ENCAISSEMENT" ? m.montant_fcfa : -m.montant_fcfa),
    0
  );
}

export type CaisseBreakdown = {
  encaissementsCount: number;
  encaissementsFcfa: number;
  depotsCount: number;
  depotsFcfa: number;
};

// Détail par type de mouvement pour "Ma session de caisse"
// (mon-tableau-de-bord) — mouvements_caisse ne trace QUE les espèces
// (voir le plan) : aucun découpage MTN/Moov/carte n'est possible ici, ces
// paiements ne passent jamais par une session de caisse ni ne sont
// rattachés à un agent.
export async function getSessionMovementsBreakdown(sessionId: string): Promise<CaisseBreakdown> {
  const { data } = await supabaseAdmin
    .from("mouvements_caisse")
    .select("type, montant_fcfa")
    .eq("session_id", sessionId);

  const rows = data ?? [];
  const sum = (type: string) =>
    rows.filter((r) => r.type === type).reduce((s, r) => s + r.montant_fcfa, 0);

  return {
    encaissementsCount: rows.filter((r) => r.type === "ENCAISSEMENT").length,
    encaissementsFcfa: sum("ENCAISSEMENT"),
    depotsCount: rows.filter((r) => r.type === "DEPOT_COFFRE").length,
    depotsFcfa: sum("DEPOT_COFFRE"),
  };
}
