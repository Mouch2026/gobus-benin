"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Garde-fou minimal contre un problème connu de l'App Router : dans un
// layout PARTAGÉ (comme (app)/layout.tsx, jamais démonté entre deux
// pages), la restauration automatique du scroll en haut de page n'est
// pas toujours fiable à chaque navigation interne — contrairement à un
// rechargement complet, qui repart toujours de 0. Observé précisément
// sur /notifications (contenu décalé vers le bas après une navigation
// interne, disparaît après un rechargement complet) — même famille de
// bug que le panneau de la cloche (état qui survit à la navigation dans
// ce même layout), mais un mécanisme distinct (scroll, pas un <details>).
// Monté une seule fois dans AppShell, comme ActivityTracker.
export function ScrollToTopOnNavigate() {
  const pathname = usePathname();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
