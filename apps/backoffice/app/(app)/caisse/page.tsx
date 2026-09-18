import { requireCompany } from "@/lib/supabase/dal";
import { can } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOpenSession, getTheoreticalBalance } from "@/lib/caisse";
import { formatFcfa } from "shared";
import { AccessBlockedMessage } from "../_components";
import { formatDepartureDateTime } from "../_shared";
import { OpenSessionForm } from "./OpenSessionForm";
import { CashDropForm } from "./CashDropForm";
import { CashCeilingForm } from "./CashCeilingForm";
import Link from "next/link";

type OpenSessionRow = {
  id: string;
  employe_id: string;
  agence_id: string;
  opened_at: string;
  agencies: { name: string } | null;
};

// Vue superviseur — owner (toute la compagnie) ou agency_manager (leur
// agence seule) : même logique de portée que /validations (chantier 3c),
// réutilisant can(role, "supervisorApprovals.manage") plutôt qu'une
// nouvelle permission — c'est exactement le même public ("je supervise").
async function getOpenSessionsForSupervisor(
  companyId: string,
  scopeAgencyId: string | null
): Promise<(OpenSessionRow & { agentName: string; balanceFcfa: number })[]> {
  let query = supabaseAdmin
    .from("session_caisse")
    .select("id, employe_id, agence_id, opened_at, agencies(name)")
    .eq("company_id", companyId)
    .is("closed_at", null);

  if (scopeAgencyId) {
    query = query.eq("agence_id", scopeAgencyId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Impossible de charger les sessions de caisse ouvertes :", error.message);
    return [];
  }

  const rows = (data ?? []) as unknown as OpenSessionRow[];
  const results = [];
  for (const row of rows) {
    const { data: member } = await supabaseAdmin
      .from("company_members")
      .select("full_name")
      .eq("user_id", row.employe_id)
      .maybeSingle<{ full_name: string | null }>();
    const balanceFcfa = await getTheoreticalBalance(row.id);
    results.push({ ...row, agentName: member?.full_name ?? "Agent", balanceFcfa });
  }
  return results;
}

// Non porté par CompanyAccessResult (get_company_access n'expose pas ce
// champ, et cette RPC partagée par toutes les pages n'a pas à en savoir
// plus pour un seul réglage propre à cette page) — relu directement ici.
async function getCashCeiling(companyId: string): Promise<number | null> {
  const { data } = await supabaseAdmin
    .from("companies")
    .select("cash_ceiling_fcfa")
    .eq("id", companyId)
    .maybeSingle<{ cash_ceiling_fcfa: number | null }>();
  return data?.cash_ceiling_fcfa ?? null;
}

export default async function CaissePage() {
  const result = await requireCompany();
  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  const isSupervisor = can(result.role, "supervisorApprovals.manage");
  const canManageCeiling = can(result.role, "cashCeiling.manage");
  const cashCeilingFcfa = canManageCeiling ? await getCashCeiling(result.company.id) : null;

  const ownSession = result.agency ? await getOpenSession(result.user.sub) : null;
  const ownBalance = ownSession ? await getTheoreticalBalance(ownSession.id) : null;

  const scopeAgencyId = result.role === "agency_manager" ? (result.agency?.id ?? null) : null;
  const supervisedSessions = isSupervisor
    ? await getOpenSessionsForSupervisor(result.company.id, scopeAgencyId)
    : [];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-8">
      <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Caisse</h1>

      {canManageCeiling ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            Plafond d&apos;espèces
          </h2>
          <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
            Au-delà de ce montant, un paiement en espèces est refusé pendant une session — laissez
            vide pour n&apos;imposer aucun plafond.
          </p>
          <CashCeilingForm currentCeilingFcfa={cashCeilingFcfa} />
        </section>
      ) : null}

      {result.agency ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-zinc-950 dark:text-zinc-50">Ma session</h2>
          {ownSession ? (
            <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Ouverte le {formatDepartureDateTime(ownSession.openedAt)}
              </p>
              <p className="text-2xl font-bold text-zinc-950 dark:text-zinc-50">
                {formatFcfa(ownBalance ?? 0)}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Solde théorique en espèces</p>
              <div className="flex flex-wrap gap-3">
                <CashDropForm />
                <Link
                  href="/caisse/cloture"
                  className="self-start rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Clôturer ma session
                </Link>
              </div>
            </div>
          ) : (
            <OpenSessionForm />
          )}
        </section>
      ) : null}

      {isSupervisor ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            Sessions ouvertes {result.role === "owner" ? "— toute la compagnie" : "— votre agence"}
          </h2>
          {supervisedSessions.length === 0 ? (
            <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              Aucune session ouverte pour le moment.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {supervisedSessions.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div>
                    <p className="font-medium text-zinc-950 dark:text-zinc-50">{s.agentName}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {s.agencies?.name ?? "—"} · ouverte le {formatDepartureDateTime(s.opened_at)}
                    </p>
                  </div>
                  <span className="font-semibold text-zinc-950 dark:text-zinc-50">
                    {formatFcfa(s.balanceFcfa)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
