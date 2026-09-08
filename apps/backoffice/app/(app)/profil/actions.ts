"use server";

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { validateNewPassword, mapWeakPasswordError } from "shared";

export type ProfilFormState = { error: string | null; success: boolean };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LOGO_BUCKET = "company-logos";
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 Mo — cohérent avec file_size_limit du bucket
const LOGO_MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

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
  const logo = formData.get("logo");

  if (!name) {
    return { error: "Merci de renseigner le nom de la compagnie.", success: false };
  }
  if (email && !EMAIL_RE.test(email)) {
    return { error: "Merci de renseigner un email valide (ou de laisser le champ vide).", success: false };
  }

  // Champ facultatif : aucun fichier choisi (ou input laissé vide) ne doit
  // jamais bloquer la mise à jour des autres champs.
  const hasNewLogo = logo instanceof File && logo.size > 0;

  if (hasNewLogo) {
    const ext = LOGO_MIME_TO_EXT[logo.type];
    if (!ext) {
      return {
        error: "Format d'image non supporté (PNG, JPG ou WEBP uniquement).",
        success: false,
      };
    }
    if (logo.size > MAX_LOGO_BYTES) {
      return { error: "L'image ne doit pas dépasser 2 Mo.", success: false };
    }
  }

  const supabase = await createClient();

  let logoUrl: string | undefined;
  if (hasNewLogo) {
    const ext = LOGO_MIME_TO_EXT[(logo as File).type];
    const companyId = access.company.id;

    // Vide le dossier de cette compagnie avant d'y remettre le nouveau
    // fichier — évite les fichiers orphelins si l'extension change d'un
    // upload à l'autre (ex. .png → .jpg), sans avoir à parser l'ancienne
    // URL pour deviner son extension.
    const { data: existingFiles } = await supabase.storage.from(LOGO_BUCKET).list(companyId);
    if (existingFiles && existingFiles.length > 0) {
      await supabase.storage
        .from(LOGO_BUCKET)
        .remove(existingFiles.map((file) => `${companyId}/${file.name}`));
    }

    const path = `${companyId}/logo.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(LOGO_BUCKET)
      .upload(path, logo as File, { contentType: (logo as File).type });

    if (uploadError) {
      console.error("Impossible de téléverser le logo :", uploadError.message);
      return { error: "Impossible de téléverser le logo. Réessayez.", success: false };
    }

    logoUrl = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl;
  }

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
      // logoUrl undefined (pas de nouveau fichier) : la colonne n'est
      // simplement pas incluse dans l'objet, donc jamais touchée par cet
      // update — le logo existant reste inchangé.
      ...(logoUrl !== undefined ? { logo_url: logoUrl } : {}),
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

export type PasswordFormState = { error: string | null; success: boolean };

export async function changePassword(
  _prevState: PasswordFormState,
  formData: FormData
): Promise<PasswordFormState> {
  const access = await requireCompany();
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action.", success: false };
  }

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: "Merci de remplir les trois champs.", success: false };
  }

  const validationError = validateNewPassword(newPassword, confirmPassword);
  if (validationError) {
    return { error: validationError, success: false };
  }

  const supabase = await createClient();

  // secure_password_change est désactivé sur ce projet (config.toml) :
  // Supabase n'exige pas lui-même une ré-authentification récente avant un
  // changement de mot de passe. Sans ce contrôle explicite, la seule
  // session déjà ouverte suffirait à changer le mot de passe — ce qui
  // n'est pas acceptable pour une action aussi sensible (ex. appareil
  // laissé déverrouillé). On revérifie donc nous-mêmes le mot de passe
  // actuel via une tentative réelle de connexion, avant d'accepter quoi
  // que ce soit.
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.email) {
    return {
      error: "Impossible de vérifier votre identité. Reconnectez-vous et réessayez.",
      success: false,
    };
  }

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: userData.user.email,
    password: currentPassword,
  });

  if (reauthError) {
    return { error: "Mot de passe actuel incorrect.", success: false };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

  if (updateError) {
    if (updateError.code === "weak_password") {
      return { error: mapWeakPasswordError(), success: false };
    }
    console.error("Impossible de changer le mot de passe :", updateError.message);
    return { error: "Impossible de changer le mot de passe. Réessayez.", success: false };
  }

  return { error: null, success: true };
}
