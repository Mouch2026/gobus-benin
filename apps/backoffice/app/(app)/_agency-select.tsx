"use client";

import type { AgencyOption } from "@/lib/agencies";
import { setSelectedAgency } from "./_agency-actions";

// Relocalisé depuis mon-tableau-de-bord/AgencySelect.tsx (chantier
// "pilotage") pour être partagé par /pilotage ET /mon-tableau-de-bord.
// Rendu uniquement pour un owner (voir chaque page) — agency_manager/agent
// voient directement leur propre agence, sans ce sélecteur. Toujours
// exactement une agence sélectionnée, jamais d'option "toutes" (à la
// différence de StationSelect).
export function AgencySelect({
  agencies,
  selectedAgencyId,
}: {
  agencies: AgencyOption[];
  selectedAgencyId: string;
}) {
  if (agencies.length <= 1) {
    return null;
  }

  return (
    <form action={setSelectedAgency} className="flex items-center gap-2">
      <label htmlFor="agencyId" className="text-sm text-zinc-500 dark:text-zinc-400">
        Agence :
      </label>
      {/* key : voir le commentaire équivalent dans _station-select.tsx —
          un <select> non contrôlé ne re-synchronise pas son defaultValue
          lors d'un re-rendu RSC. */}
      <select
        key={selectedAgencyId}
        id="agencyId"
        name="agencyId"
        defaultValue={selectedAgencyId}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
      >
        {agencies.map((agency) => (
          <option key={agency.id} value={agency.id}>
            {agency.name}
          </option>
        ))}
      </select>
    </form>
  );
}
