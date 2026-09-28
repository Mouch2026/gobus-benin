// Valide une destination de redirection post-connexion/inscription (ou un
// lien d'action de notification) venant d'un paramètre de requête ou d'un
// champ de formulaire — donc toujours falsifiable par un visiteur, jamais
// fait confiance tel quel. Fonction pure, sans "server-only" : utilisée
// aussi bien par les Server Actions (apps/backoffice, apps/web) que par
// son propre fichier de test, en dehors de tout contexte Next.js.
//
// Un test naïf startsWith("/") && !startsWith("//") ne suffit pas : les
// navigateurs lisent "\" comme "/" et suppriment les caractères de
// contrôle (dont les tabulations) avant de naviguer, donc "/\evil.com" et
// "/\t/evil.com" passeraient ce test tout en résolvant vers un autre
// hôte. On rejette donc d'abord tout caractère de contrôle et tout
// antislash, puis on laisse le parseur URL trancher : résolution contre
// une base fixe http://localhost, acceptée seulement si l'origine reste
// inchangée — ce qui rejette un chemin protocol-relative ("//evil.com"),
// une URL absolue ("https://evil.com"), ou une variante obfusquée par
// antislash.
//
// Ça ne suffit PAS non plus à soi seul : le parseur URL supprime les
// segments "." et ".." mais garde les segments VIDES, donc une entrée
// déjà acceptée à l'étape précédente ("/.//evil.com", qui ne contient ni
// antislash ni schéma/hôte explicite) peut ressortir avec un pathname
// "//evil.com" — de nouveau un chemin protocol-relative, mais cette fois
// produit PAR la normalisation elle-même plutôt que présent dans
// l'entrée. D'où la revalidation du RÉSULTAT, pas seulement de l'entrée :
// doit commencer par un seul "/" (jamais "//"), et rester exempt
// d'antislash/caractères de contrôle.
export function safeRedirectTarget(value: string): string {
  // eslint-disable-next-line no-control-regex -- deliberately matching C0/DEL controls
  if (/[\x00-\x1f\x7f\\]/.test(value)) return "/";

  let url: URL;
  try {
    url = new URL(value, "http://localhost");
  } catch {
    return "/";
  }

  if (url.origin !== "http://localhost") return "/";

  const result = `${url.pathname}${url.search}${url.hash}`;

  if (!result.startsWith("/") || result.startsWith("//")) return "/";
  // eslint-disable-next-line no-control-regex -- deliberately matching C0/DEL controls
  if (/[\x00-\x1f\x7f\\]/.test(result)) return "/";

  return result;
}
