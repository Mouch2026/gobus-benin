import { requireCompany } from "@/lib/supabase/dal";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatFcfa } from "shared";
import { AccessBlockedMessage } from "../../../../_components";
import { formatDepartureDateTime } from "../../../../_shared";
import { PrintButton } from "./PrintButton";

type MouvementForPrint = {
  id: string;
  montant_fcfa: number;
  created_at: string;
  effectue_par: string;
  session_caisse: {
    company_id: string;
    agencies: { name: string } | null;
  };
};

// mouvements_caisse est une table purement interne (aucun grant
// authenticated, voir la migration) : lue via supabaseAdmin, portée
// vérifiée explicitement (session_caisse.company_id), même patron que
// les autres tables internes de ce back-office (supervisor_approval_requests).
async function getOwnedCashDrop(
  mouvementId: string,
  companyId: string
): Promise<MouvementForPrint | null> {
  const { data, error } = await supabaseAdmin
    .from("mouvements_caisse")
    .select(
      "id, montant_fcfa, created_at, effectue_par, session_caisse!inner(company_id, agencies(name))"
    )
    .eq("id", mouvementId)
    .eq("type", "DEPOT_COFFRE")
    .eq("session_caisse.company_id", companyId)
    .maybeSingle();

  if (error) {
    console.error("Impossible de charger le mouvement de caisse :", error.message);
    return null;
  }
  return data as unknown as MouvementForPrint | null;
}

async function getAgentName(userId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("company_members")
    .select("full_name")
    .eq("user_id", userId)
    .maybeSingle<{ full_name: string | null }>();
  return data?.full_name ?? "Agent";
}

// Vue imprimable simple, patron identique à
// reservations/[bookingId]/imprimer/page.tsx (rendu navigateur,
// window.print(), aucune nouvelle dépendance PDF).
export default async function ImprimerVideCaissePage(
  props: PageProps<"/caisse/mouvements/[mouvementId]/imprimer">
) {
  const { mouvementId } = await props.params;
  const result = await requireCompany();
  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  const mouvement = await getOwnedCashDrop(mouvementId, result.company.id);
  if (!mouvement) {
    return (
      <div className="mx-auto max-w-xl px-6 py-8">
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Ce mouvement de caisse n&apos;existe pas ou ne vous appartient pas.
        </p>
      </div>
    );
  }

  const agentName = await getAgentName(mouvement.effectue_par);

  return (
    <div className="mx-auto max-w-xl px-6 py-8 print:max-w-none print:p-0">
      <div className="mb-6 flex justify-end print:hidden">
        <PrintButton />
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900 print:rounded-none print:border-0 print:p-0">
        <div className="mb-6 flex items-center justify-between border-b border-zinc-200 pb-4 dark:border-zinc-800 print:border-black">
          <span className="text-lg font-semibold text-zinc-950 dark:text-zinc-50 print:text-black">
            {result.company.name}
          </span>
          <span className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400 print:text-black">
            Reçu de vide-caisse
          </span>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 print:text-black">Agence</p>
            <p className="font-medium text-zinc-950 dark:text-zinc-50 print:text-black">
              {mouvement.session_caisse.agencies?.name ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 print:text-black">Agent</p>
            <p className="font-medium text-zinc-950 dark:text-zinc-50 print:text-black">{agentName}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 print:text-black">Date</p>
            <p className="font-medium text-zinc-950 dark:text-zinc-50 print:text-black">
              {formatDepartureDateTime(mouvement.created_at)}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 print:text-black">Montant déposé</p>
            <p className="text-xl font-bold text-zinc-950 dark:text-zinc-50 print:text-black">
              {formatFcfa(mouvement.montant_fcfa)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
