import { test } from "node:test";
import assert from "node:assert/strict";
import { safeRedirectTarget } from "./safeRedirectTarget";

// Liste unique, réutilisée par les 4 anciens sites dupliqués
// (apps/backoffice/app/connexion/actions.ts, apps/web/app/compte/connexion/
// actions.ts, apps/web/app/compte/inscription/{page,actions}.ts) et par
// isSafeRelativeHref (apps/backoffice/app/(app)/_notification-actions.ts)
// — plus aucune copie locale de ces cas.
const CASES: readonly [input: string, expected: string][] = [
  // Valeurs légitimes, inchangées.
  ["/", "/"],
  ["/reservations?x=1", "/reservations?x=1"],
  ["/reservations?x=1#top", "/reservations?x=1#top"],
  ["/%5Cevil.com", "/%5Cevil.com"], // antislash ENCODÉ dans un segment de chemin — inoffensif, jamais interprété comme séparateur.

  // Attaques directes (schéma/hôte explicite ou antislash brut/caractère
  // de contrôle déguisant un séparateur) — repoussées avant même la
  // résolution d'URL, ou par la vérification d'origine.
  ["", "/"],
  ["//evil.com", "/"],
  ["/\\evil.com", "/"],
  ["/\t/evil.com", "/"],
  ["https://evil.com", "/"],

  // Attaques par normalisation : la valeur d'ENTRÉE ne contient ni
  // antislash ni schéma/hôte explicite (passerait un simple
  // startsWith("/") && !startsWith("//")), mais le parseur URL supprime
  // les segments "." / ".." tout en gardant les segments vides, donc le
  // RÉSULTAT devient "//evil.com" — un chemin protocol-relative que le
  // navigateur suivrait vers un autre hôte. Seule la revalidation du
  // résultat (pas de l'entrée) les attrape.
  ["/.//evil.com", "/"],
  ["/..//evil.com", "/"],
  ["/a/..//evil.com", "/"],
];

test("safeRedirectTarget — liste de cas complète", () => {
  for (const [input, expected] of CASES) {
    assert.equal(
      safeRedirectTarget(input),
      expected,
      `safeRedirectTarget(${JSON.stringify(input)}) devrait valoir ${JSON.stringify(expected)}`
    );
  }
});
