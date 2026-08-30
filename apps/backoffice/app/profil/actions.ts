"use server";

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";

export type ProfilFormState = { error: string | null; success: boolean };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function updateCompanyProfile(
  _prevState: ProfilFormState,
  formData: FormData
): Promise<ProfilFormState> {
  const access = await requireCompany();
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action.", success: false };
  }

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const logoUrl = String(formData.get("logoUrl") ?? "").trim();

  if (!name) {
    return { error: "Merci de renseigner le nom de la compagnie.", success: false };
  }
  if (email && !EMAIL_RE.test(email)) {
    return { error: "Merci de renseigner un email valide (ou de laisser le champ vide).", success: false };
  }

  const supabase = await createClient();
  // companies_update_owner (owner_id = auth.uid()) already scopes this —
  // ordinary authenticated client, no service_role needed. slug is
  // intentionally not editable here: it's the company's stable URL
  // identity, out of scope for a profile edit.
  const { error } = await supabase
    .from("companies")
    .update({
      name,
      phone: phone || null,
      email: email || null,
      logo_url: logoUrl || null,
    })
    .eq("id", access.company.id);

  if (error) {
    console.error("Impossible de mettre à jour le profil :", error.message);
    return { error: "Impossible de mettre à jour le profil. Réessayez.", success: false };
  }

  revalidatePath("/profil");
  revalidatePath("/"); // company name shown in the shared navigation
  return { error: null, success: true };
}
