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

// Test de propriété : quel que soit l'appelant (auth/confirm, connexion,
// inscription — tous construisent la cible finale via
// new URL(safeRedirectTarget(next), origin), jamais par concaténation de
// chaînes, voir apps/*/app/auth/confirm/route.ts), l'hôte résultant doit
// TOUJOURS être celui de origin. Couvre les deux classes de contournement
// découvertes sur la concaténation `${origin}${next}` :
//   - injection d'userinfo ("@evil.com" -> "http://host@evil.com", où
//     "host" devient un nom d'utilisateur et "evil.com" l'hôte réel) ;
//   - fusion de suffixe de domaine (".evil.com" concaténé directement
//     après un hôte sans port ni chemin donne un sous-domaine d'evil.com).
// La propriété tient ICI parce que safeRedirectTarget() réduit d'abord
// `next` à un chemin relatif sûr (jamais un hôte/schéma), avant que
// new URL(..., origin) ne le résolve CONTRE origin plutôt que de le
// laisser corrompre l'autorité d'origin par concaténation.
const HOSTILE_VALUES = [
  "@evil.com",
  ".evil.com",
  "//evil.com",
  "https://evil.com",
  "/\\evil.com",
  "/.//evil.com",
  "",
  "reservations",
];

const ORIGINS = ["http://localhost:3001", "https://gobus.exemple"];

test("safeRedirectTarget — propriété : new URL(safeRedirectTarget(x), origin) ne change jamais d'hôte", () => {
  for (const origin of ORIGINS) {
    const expectedHost = new URL(origin).host;
    for (const hostile of HOSTILE_VALUES) {
      const target = safeRedirectTarget(hostile);
      const resolved = new URL(target, origin);
      assert.equal(
        resolved.host,
        expectedHost,
        `origin=${origin}, x=${JSON.stringify(hostile)} : safeRedirectTarget -> ${JSON.stringify(target)} -> host ${JSON.stringify(resolved.host)}, attendu ${JSON.stringify(expectedHost)}`
      );
    }
  }
});
