import { requireCompany } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { AccessBlockedMessage } from "../_components";
import { Navigation } from "../_navigation";
import { BusLayoutForm } from "./BusLayoutForm";

type BusLayout = {
  id: string;
  name: string;
  seat_labels: string[];
};

async function getCompanyBusLayouts(companyId: string): Promise<BusLayout[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bus_layouts")
    .select("id, name, seat_labels")
    .eq("company_id", companyId)
    .order("name", { ascending: true });

  if (error) {
    console.error("Impossible de charger les plans de bus :", error.message);
    return [];
  }

  return (data ?? []) as unknown as BusLayout[];
}

export default async function PlansDeBusPage() {
  const result = await requireCompany();

  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  const busLayouts = await getCompanyBusLayouts(result.company.id);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <Navigation company={result.company} />

      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-8">
        <section>
          <h1 className="mb-4 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            Nouveau plan de bus
          </h1>
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <BusLayoutForm />
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            Vos plans de bus
          </h2>

          {busLayouts.length === 0 ? (
            <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              Aucun plan de bus pour le moment — créez-en un ci-dessus, ou continuez à créer des
              trajets sans plan (numérotation simple).
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {busLayouts.map((layout) => (
                <div
                  key={layout.id}
                  className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-medium text-zinc-950 dark:text-zinc-50">
                      {layout.name}
                    </span>
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">
                      {layout.seat_labels.length} places
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                    {layout.seat_labels.join(", ")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
