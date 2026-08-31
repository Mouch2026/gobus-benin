"use server";

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";

export type BusLayoutFormState = { error: string | null };

export async function createBusLayout(
  _prevState: BusLayoutFormState,
  formData: FormData
): Promise<BusLayoutFormState> {
  const access = await requireCompany();
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action." };
  }

  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    return { error: "Merci de renseigner un nom pour ce plan." };
  }

  const seatLabels = formData
    .getAll("seatLabels")
    .map((label) => String(label).trim())
    .filter((label) => label.length > 0);

  if (seatLabels.length === 0) {
    return { error: "Merci de générer au moins un siège avant de créer le plan." };
  }

  const uniqueLabels = new Set(seatLabels);
  if (uniqueLabels.size !== seatLabels.length) {
    return { error: "Chaque libellé de siège doit être unique dans ce plan." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("bus_layouts").insert({
    company_id: access.company.id,
    name,
    seat_labels: seatLabels,
  });

  if (error) {
    // 23505 = unique_violation on unique(company_id, name).
    if (error.code === "23505") {
      return { error: "Un plan de bus porte déjà ce nom pour votre compagnie." };
    }
    console.error("Impossible de créer le plan de bus :", error.message);
    return { error: "Impossible de créer ce plan de bus. Réessayez." };
  }

  revalidatePath("/plans-de-bus");
  return { error: null };
}
