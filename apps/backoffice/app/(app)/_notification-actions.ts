"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/dal";
import { supabaseAdmin } from "@/lib/supabase-admin";

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
// href est toujours un chemin relatif interne, jamais une valeur passée
// telle quelle à redirect() sans validation : on refuse tout ce qui ne
// commence pas par un unique "/" (jamais "//..." — une redirection ouverte
// déguisée en chemin relatif).
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

  if (href.startsWith("/") && !href.startsWith("//")) {
    redirect(href);
  }
}
