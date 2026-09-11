import { requireCompany } from "@/lib/supabase/dal";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { AccessBlockedMessage } from "../_components";
import { EmployeeForm, type AgencyOption } from "./EmployeeForm";
import { EmployeeRow, type EmployeeRowData } from "./EmployeeRow";

async function getCompanyMembers(companyId: string): Promise<EmployeeRowData[]> {
  const { data, error } = await supabaseAdmin.rpc("get_company_members", { p_company_id: companyId });

  if (error) {
    console.error("Impossible de charger les employés :", error.message);
    return [];
  }
  return (data ?? []) as EmployeeRowData[];
}

async function getActiveAgencies(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string
): Promise<AgencyOption[]> {
  const { data, error } = await supabase
    .from("agencies")
    .select("id, name, stations(name, city)")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    console.error("Impossible de charger les agences :", error.message);
    return [];
  }
  return (data ?? []).map((a) => {
    const station = a.stations as unknown as { name: string; city: string } | null;
    return {
      id: a.id as string,
      name: a.name as string,
      stationLabel: station
        ? station.name === station.city
          ? station.name
          : `${station.name} · ${station.city}`
        : null,
    };
  });
}

export default async function EmployesPage() {
  const result = await requireCompany();
  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  // Pas un CompanyAccessDenialReason (ce n'est pas un refus d'accès à la
  // compagnie, juste à CETTE page).
  if (!can(result.role, "employees.manage")) {
    return (
      <div className="mx-auto max-w-xl px-6 py-8">
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Cette page est réservée au propriétaire du compte.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const [members, agencies] = await Promise.all([
    getCompanyMembers(result.company.id),
    getActiveAgencies(supabase, result.company.id),
  ]);
  const employees = members.filter(
    (m): m is EmployeeRowData & { role: "agency_manager" | "agent" } =>
      m.role === "agency_manager" || m.role === "agent"
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-8">
      <section>
        <h1 className="mb-2 text-lg font-semibold text-zinc-950 dark:text-zinc-50">Nouvel employé</h1>
        <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
          Créez un compte pour un chef d&apos;agence ou un agent, rattaché à une agence.
          Communiquez-lui l&apos;email et le mot de passe choisis ici — aucun e-mail n&apos;est
          envoyé automatiquement.
        </p>
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          {agencies.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Créez d&apos;abord une agence (rubrique Agences) avant de pouvoir y rattacher un
              employé.
            </p>
          ) : (
            <EmployeeForm agencies={agencies} />
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-zinc-950 dark:text-zinc-50">Vos employés</h2>

        {employees.length === 0 ? (
          <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            Aucun employé pour le moment — créez-en un ci-dessus.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {employees.map((member) => (
              <EmployeeRow key={member.id} member={member} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
