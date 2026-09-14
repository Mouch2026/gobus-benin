import "server-only";
import { cache } from "react";
import { requireUser } from "./supabase/dal";
import { supabaseAdmin } from "./supabase-admin";

export type CompanyNotification = {
  id: string;
  kind: "event" | "state_alert";
  type: string;
  level: "critical" | "warning" | "info";
  title: string;
  body: string | null;
  actionHref: string | null;
  createdAt: string;
  isRead: boolean;
};

type GetCompanyNotificationsRow = {
  id: string;
  kind: string;
  type: string;
  level: string;
  title: string;
  body: string | null;
  action_href: string | null;
  created_at: string;
  is_read: boolean;
};

// Mémoïsée par requête (React cache()), même convention que
// requireCompany() : la topbar (compteur + panneau) et la page historique
// peuvent toutes deux l'appeler sans doubler l'aller-retour Supabase.
export const getCompanyNotifications = cache(
  async (limit = 20): Promise<CompanyNotification[]> => {
    const user = await requireUser();
    const { data, error } = await supabaseAdmin.rpc("get_company_notifications", {
      p_user_id: user.sub,
      p_limit: limit,
    });

    if (error) {
      console.error("Impossible de charger les notifications :", error.message);
      return [];
    }

    return ((data ?? []) as GetCompanyNotificationsRow[]).map((row) => ({
      id: row.id,
      kind: row.kind as CompanyNotification["kind"],
      type: row.type,
      level: row.level as CompanyNotification["level"],
      title: row.title,
      body: row.body,
      actionHref: row.action_href,
      createdAt: row.created_at,
      isRead: row.is_read,
    }));
  }
);

export const getUnreadNotificationCount = cache(async (): Promise<number> => {
  const user = await requireUser();
  // count_unread_company_notifications renvoie un entier scalaire (pas un
  // ensemble) : PostgREST renvoie la valeur brute, jamais un tableau à
  // dégrouper — .single()/.maybeSingle() ne s'appliquent qu'à un
  // résultat en forme de lignes, pas ici.
  const { data, error } = await supabaseAdmin.rpc("count_unread_company_notifications", {
    p_user_id: user.sub,
  });

  if (error) {
    console.error("Impossible de compter les notifications non lues :", error.message);
    return 0;
  }
  return (data as number | null) ?? 0;
});
