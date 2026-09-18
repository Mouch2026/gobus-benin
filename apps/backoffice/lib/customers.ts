import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Extrait de reservations/nouvelle/actions.ts (chantier 3c) — désormais
// utilisée aussi par supervisorApproval.ts pour résoudre l'email d'un
// superviseur. Toujours une correspondance exacte, jamais un filtre
// ?email= (voir la règle CLAUDE.md sur auth.admin.listUsers/getUserByEmail).
export async function findExistingUserByEmail(email: string): Promise<string | null> {
  const { data: list, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  if (listError) {
    throw new Error(`Impossible de vérifier l'utilisateur existant : ${listError.message}`);
  }
  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  return existing?.id ?? null;
}
