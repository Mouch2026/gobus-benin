"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/dal";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { safeRedirectTarget } from "shared";

// href vient d'un champ de formulaire — normalement posé depuis
// notification.actionHref (donnée serveur légitime), mais un POST forgé
// peut y mettre n'importe quoi, donc jamais fait confiance sans
// validation. Délègue à la même fonction centrale que les 4 sites
// safeRedirectTarget (packages/shared/src/lib/safeRedirectTarget.ts) —
// "sûr" ici signifie strictement "ressort inchangé" : une valeur que
// safeRedirectTarget devrait CORRIGER (ex. "/.//evil.com" -> "/") n'est
// pas un lien d'action légitime, donc on ne redirige pas du tout plutôt
// que de rediriger vers la correction — comportement d'origine préservé
// (chaîne vide comprise : jamais un lien légitime, le bouton n'est même
// pas rendu sans actionHref, voir _notification-bell.tsx).
function isSafeRelativeHref(value: string): boolean {
  return value !== "" && safeRedirectTarget(value) === value;
}

// revalidatePath("/", "layout") : la cloche vit dans le layout partagé —
// même leçon que le sélecteur de gare (_station-actions.ts), une
// revalidation de page ne suffirait pas à rafraîchir le compteur affiché
// dans la topbar.

export async function markAllNotificationsRead() {
  const user = await requireUser();
  const { error } = await supabaseAdmin.rpc("mark_all_company_notifications_read", {
    p_user_id: user.sub,
  });
  if (error) {
    console.error("Impossible de marquer les notifications comme lues :", error.message);
    return;
  }
  revalidatePath("/", "layout");
}

// Marque une notification lue PUIS navigue vers son lien d'action — c'est
// ce qui permet le marquage-au-clic sans JavaScript (un <form> classique).
// href n'est jamais passé tel quel à redirect() : voir isSafeRelativeHref
// ci-dessus.
export async function openNotification(formData: FormData) {
  const user = await requireUser();
  const notificationId = String(formData.get("notificationId") ?? "");
  const href = String(formData.get("href") ?? "");

  const { error } = await supabaseAdmin.rpc("mark_company_notification_read", {
    p_user_id: user.sub,
    p_notification_id: notificationId,
  });
  if (error) {
    console.error("Impossible de marquer la notification comme lue :", error.message);
  }

  revalidatePath("/", "layout");

  if (isSafeRelativeHref(href)) {
    redirect(href);
  }
}
