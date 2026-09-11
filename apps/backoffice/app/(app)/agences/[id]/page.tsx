import Link from "next/link";
import { requireCompany } from "@/lib/supabase/dal";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { AccessBlockedMessage } from "../../_components";
import { EditAgenceForm } from "./EditAgenceForm";
import type { StationOption } from "../AgenceForm";

type AgencyForEdit = {
  id: string;
  name: string;
  station_id: string;
  is_active: boolean;
};

async function getOwnedAgency(
  supabase: Awaited<ReturnType<typeof createClient>>,
  agencyId: string,
  companyId: string
): Promise<AgencyForEdit | null> {
  const { data, error } = await supabase
    .from("agencies")
    .select("id, name, station_id, is_active")
    .eq("id", agencyId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    console.error("Impossible de charger l'agence :", error.message);
    return null;
  }
  return data as AgencyForEdit | null;
}

async function getActiveStations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  includeId: string
): Promise<StationOption[]> {
  // Inclut la gare actuellement rattachée même si elle a été désactivée
  // depuis, pour que le <select> ait toujours une option valide.
  const { data, error } = await supabase
    .from("stations")
    .select("id, name, city, is_active")
    .or(`is_active.eq.true,id.eq.${includeId}`)
    .order("city", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("Impossible de charger les gares :", error.message);
    return [];
  }
  return (data ?? []).map((s) => ({ id: s.id, name: s.name, city: s.city }));
}

export default async function EditAgencePage(props: PageProps<"/agences/[id]">) {
  const { id } = await props.params;
  const result = await requireCompany();
  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  const supabase = await createClient();
  const agency = await getOwnedAgency(supabase, id, result.company.id);

  if (!agency) {
    return (
      <div className="mx-auto max-w-xl px-6 py-8">
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Cette agence n&apos;existe pas ou ne vous appartient pas.
        </p>
        <Link
          href="/agences"
          className="mt-4 inline-block font-medium text-zinc-950 hover:underline dark:text-zinc-50"
        >
          ← Retour aux agences
        </Link>
      </div>
    );
  }

  const stations = await getActiveStations(supabase, agency.station_id);

  return (
    <div className="mx-auto max-w-xl px-6 py-8">
      <h1 className="mb-6 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
        Modifier l&apos;agence
      </h1>
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <EditAgenceForm
          agency={agency}
          stations={stations}
          canManage={can(result.role, "agencies.manage")}
        />
      </div>
      <Link
        href="/agences"
        className="mt-4 inline-block font-medium text-zinc-950 hover:underline dark:text-zinc-50"
      >
        ← Retour aux agences
      </Link>
    </div>
  );
}
