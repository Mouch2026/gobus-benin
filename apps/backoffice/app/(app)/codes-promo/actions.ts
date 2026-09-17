"use server";

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/supabase/dal";
import { requirePermission } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export type PromoCodeFormState = { error: string | null };
export type ToggleActiveState = { error: string | null; success: boolean };

const CODE_RE = /^[A-Z0-9_-]{3,32}$/;

// Pas d'édition des règles d'un code existant (voir plan) : un code déjà
// utilisé ne doit jamais voir ses conditions changer rétroactivement pour
// ceux qui l'ont déjà utilisé. Seule action de cycle de vie après
// création : setPromoCodeActive.
export async function createPromoCode(
  _prevState: PromoCodeFormState,
  formData: FormData
): Promise<PromoCodeFormState> {
  const access = await requireCompany();
  const guardError = requirePermission(access, "promoCodes.manage");
  if (guardError) return guardError;
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action." };
  }

  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const discountType = String(formData.get("discountType") ?? "");
  const discountFixedRaw = String(formData.get("discountFixedFcfa") ?? "").trim();
  const discountPercentRaw = String(formData.get("discountPercent") ?? "").trim();
  const startsAtRaw = String(formData.get("startsAt") ?? "").trim();
  const endsAtRaw = String(formData.get("endsAt") ?? "").trim();
  const maxUsesRaw = String(formData.get("maxUses") ?? "").trim();
  const minPurchaseRaw = String(formData.get("minPurchaseFcfa") ?? "").trim();

  if (!CODE_RE.test(code)) {
    return {
      error: "Le code doit contenir 3 à 32 lettres, chiffres, tirets ou underscores.",
    };
  }

  let discountFixedFcfa: number | null = null;
  let discountPercent: number | null = null;

  if (discountType === "fixed") {
    const value = Number(discountFixedRaw);
    if (!Number.isInteger(value) || value <= 0) {
      return { error: "Merci de renseigner un montant fixe positif." };
    }
    discountFixedFcfa = value;
  } else if (discountType === "percent") {
    const value = Number(discountPercentRaw);
    if (!Number.isInteger(value) || value <= 0 || value > 100) {
      return { error: "Merci de renseigner un pourcentage entre 1 et 100." };
    }
    discountPercent = value;
  } else {
    return { error: "Merci de choisir un type de réduction." };
  }

  const startsAt = startsAtRaw ? new Date(startsAtRaw).toISOString() : null;
  const endsAt = endsAtRaw ? new Date(endsAtRaw).toISOString() : null;
  if (startsAt && endsAt && startsAt >= endsAt) {
    return { error: "La date de fin doit être après la date de début." };
  }

  let maxUses: number | null = null;
  if (maxUsesRaw) {
    const value = Number(maxUsesRaw);
    if (!Number.isInteger(value) || value <= 0) {
      return { error: "Le nombre d'utilisations maximum doit être un entier positif." };
    }
    maxUses = value;
  }

  let minPurchaseFcfa: number | null = null;
  if (minPurchaseRaw) {
    const value = Number(minPurchaseRaw);
    if (!Number.isInteger(value) || value < 0) {
      return { error: "Le montant d'achat minimum doit être un entier positif." };
    }
    minPurchaseFcfa = value;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("promo_codes").insert({
    company_id: access.company.id,
    code,
    discount_type: discountType,
    discount_fixed_fcfa: discountFixedFcfa,
    discount_percent: discountPercent,
    starts_at: startsAt,
    ends_at: endsAt,
    max_uses: maxUses,
    min_purchase_fcfa: minPurchaseFcfa,
  });

  if (error) {
    // 23505 = unique_violation sur unique(company_id, code).
    if (error.code === "23505") {
      return { error: "Un code promo porte déjà ce nom dans votre compagnie." };
    }
    console.error("Impossible de créer le code promo :", error.message);
    return { error: "Impossible de créer ce code promo. Réessayez." };
  }

  revalidatePath("/codes-promo");
  return { error: null };
}

export async function setPromoCodeActive(
  _prevState: ToggleActiveState,
  formData: FormData
): Promise<ToggleActiveState> {
  const access = await requireCompany();
  const guardError = requirePermission(access, "promoCodes.manage");
  if (guardError) return { ...guardError, success: false };
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action.", success: false };
  }

  const promoCodeId = String(formData.get("promoCodeId") ?? "").trim();
  const isActive = formData.get("isActive") === "1";

  const supabase = await createClient();

  // RLS (promo_codes_update_owner) garantit déjà que cette ligne
  // appartient bien à la compagnie de l'appelant — un update à 0 ligne
  // silencieux est suffisant ici, contrairement à assertOwnedAgency
  // (aucun autre champ à valider avant l'écriture).
  const { error } = await supabase
    .from("promo_codes")
    .update({ is_active: isActive })
    .eq("id", promoCodeId)
    .eq("company_id", access.company.id);

  if (error) {
    console.error("Impossible de changer l'état du code promo :", error.message);
    return { error: "Impossible de changer l'état de ce code. Réessayez.", success: false };
  }

  revalidatePath("/codes-promo");
  return { error: null, success: true };
}
