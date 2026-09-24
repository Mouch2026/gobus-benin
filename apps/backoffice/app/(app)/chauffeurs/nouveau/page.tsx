import { requireCompany } from "@/lib/supabase/dal";
import { can } from "@/lib/permissions";
import { AccessBlockedMessage } from "../../_components";
import { DriverForm } from "../DriverForm";

export default async function NewDriverPage() {
  const result = await requireCompany();

  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  if (!can(result.role, "drivers.manage")) {
    return (
      <div className="mx-auto max-w-xl px-6 py-8">
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Cette page est réservée au propriétaire du compte.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-8">
      <h1 className="mb-6 text-lg font-semibold text-zinc-950 dark:text-zinc-50">Nouveau chauffeur</h1>
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <DriverForm />
      </div>
    </div>
  );
}
