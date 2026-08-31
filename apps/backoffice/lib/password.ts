// Partagé entre le changement de mot de passe depuis /profil et la
// réinitialisation depuis /reinitialiser-mot-de-passe — mêmes règles, une
// seule source.

// Matches this project's actual Supabase Auth policy
// (supabase/config.toml: minimum_password_length = 6, password_requirements
// = "" — no complexity rule beyond length) rather than inventing a stricter
// one. This is only the friendly pre-check: supabase.auth.updateUser
// remains the real, authoritative enforcement regardless — see
// mapWeakPasswordError below.
export const MIN_PASSWORD_LENGTH = 6;

export function validateNewPassword(newPassword: string, confirmPassword: string): string | null {
  if (newPassword !== confirmPassword) {
    return "Le nouveau mot de passe et sa confirmation ne correspondent pas.";
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return `Le nouveau mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`;
  }
  return null;
}

// weak_password : filet de sécurité si la politique réellement configurée
// côté Supabase (remote) diverge de MIN_PASSWORD_LENGTH (dérivée de
// supabase/config.toml, qui peut ne pas refléter le remote) — message
// générique plutôt que de relayer le message brut en anglais de Supabase.
export function mapWeakPasswordError(): string {
  return "Le nouveau mot de passe ne respecte pas la politique de sécurité (longueur minimale notamment).";
}
