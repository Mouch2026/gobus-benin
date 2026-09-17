import "server-only";
import { supabaseAdmin } from "./notifications/supabaseAdmin";

const ATTEMPT_LIMIT = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

type PromoCodeRow = {
  id: string;
  discount_type: "fixed" | "percent";
  discount_fixed_fcfa: number | null;
  discount_percent: number | null;
  min_purchase_fcfa: number | null;
  max_uses: number | null;
};

export type RedeemPromoCodeParams = {
  userId: string;
  bookingId: string;
  companyId: string;
  code: string;
  baseAmountFcfa: number;
};

export type RedeemPromoCodeResult =
  | {
      ok: true;
      promoCodeId: string;
      discountPercent: number;
      discountAmountFcfa: number;
    }
  | { ok: false; error: string };

// Même style que applyVoucherAndPoints.ts : appels supabaseAdmin
// conditionnels enchaînés en TypeScript (le seul appel SQL dédié est
// claim_promo_code_use, pour l'unique primitif que PostgREST ne peut pas
// exprimer — voir son commentaire dans la migration). Voir le commentaire
// de tête de supabase/migrations/20260915090000_add_promo_codes.sql pour
// la justification de l'ordre des vérifications ci-dessous (limite de
// tentatives, puis validité du code, puis montant minimum, puis unicité
// client, puis quota).
export async function redeemPromoCode(
  params: RedeemPromoCodeParams
): Promise<RedeemPromoCodeResult> {
  const { userId, bookingId, companyId, baseAmountFcfa } = params;
  const code = params.code.trim().toUpperCase();

  // 1. Limite de tentatives — vérifiée avant toute autre chose, avant même
  // de chercher si le code existe. C'est la vraie protection
  // anti-énumération (voir plan) : aucune requête sur promo_codes tant
  // que ce client a déjà trop essayé récemment.
  const sinceIso = new Date(Date.now() - ATTEMPT_WINDOW_MS).toISOString();
  const { count: recentAttempts } = await supabaseAdmin
    .from("promo_code_attempts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gt("created_at", sinceIso);

  if ((recentAttempts ?? 0) >= ATTEMPT_LIMIT) {
    return { ok: false, error: "Trop d'essais, réessayez plus tard." };
  }

  // Chaque tentative (valide ou non) compte pour la limite — enregistrée
  // avant de poursuivre, pas seulement en cas d'échec.
  await supabaseAdmin.from("promo_code_attempts").insert({ user_id: userId });

  // 2. Le code doit exister, être actif, être scopé à CETTE compagnie, et
  // être dans sa fenêtre de dates — un seul message pour toutes ces
  // raisons (voir plan : distinguer "pas encore actif" d'"inexistant"
  // révélerait une campagne en préparation).
  const now = new Date().toISOString();
  const { data: promoCode } = await supabaseAdmin
    .from("promo_codes")
    .select("id, discount_type, discount_fixed_fcfa, discount_percent, min_purchase_fcfa, max_uses")
    .eq("company_id", companyId)
    .eq("code", code)
    .eq("is_active", true)
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .maybeSingle<PromoCodeRow>();

  if (!promoCode) {
    return { ok: false, error: "Ce code n'est pas valide." };
  }

  // 3. Montant minimum.
  if (promoCode.min_purchase_fcfa && baseAmountFcfa < promoCode.min_purchase_fcfa) {
    return {
      ok: false,
      error: `Ce code nécessite un montant d'achat minimum de ${promoCode.min_purchase_fcfa} FCFA.`,
    };
  }

  // 4. Un seul usage par client — l'insertion EST la réclamation atomique,
  // jamais une lecture préalable séparée (même patron que
  // vouchers_origin_booking_unique / points_ledger_booking_id_reason_key).
  const { data: redemption, error: redemptionError } = await supabaseAdmin
    .from("promo_code_redemptions")
    .insert({ promo_code_id: promoCode.id, user_id: userId, booking_id: bookingId })
    .select("id")
    .maybeSingle();

  if (!redemption) {
    if (redemptionError && redemptionError.code !== "23505") {
      console.error("Impossible de réclamer le code promo :", redemptionError.message);
      return { ok: false, error: "Ce code n'est pas valide." };
    }
    return { ok: false, error: "Vous avez déjà utilisé ce code." };
  }

  // 5. Quota total — décrément conditionnel atomique via
  // claim_promo_code_use (PostgREST ne peut pas exprimer
  // "uses_count = uses_count + 1" dans un update() JSON classique, d'où
  // cette fonction dédiée pour ce seul primitif — voir la migration).
  // Si le quota est atteint, on annule la réclamation d'unicité qu'on
  // vient de poser : ce client n'a jamais réellement bénéficié du code,
  // il doit pouvoir réessayer un autre code.
  const { data: claimedId } = await supabaseAdmin.rpc("claim_promo_code_use", {
    p_promo_code_id: promoCode.id,
  });

  if (!claimedId) {
    await supabaseAdmin.from("promo_code_redemptions").delete().eq("id", redemption.id);
    return { ok: false, error: "Ce code n'est plus disponible." };
  }

  const discountAmountFcfa =
    promoCode.discount_type === "fixed"
      ? Math.min(promoCode.discount_fixed_fcfa ?? 0, baseAmountFcfa)
      : Math.round((baseAmountFcfa * (promoCode.discount_percent ?? 0)) / 100);

  return {
    ok: true,
    promoCodeId: promoCode.id,
    discountPercent: promoCode.discount_type === "percent" ? promoCode.discount_percent ?? 0 : 0,
    discountAmountFcfa,
  };
}
