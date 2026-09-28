"use client";

import { useEffect, useRef } from "react";

// Îlot client minimal, même exception déjà acceptée que NotificationBadge/
// _live-clock.tsx : un <details> natif ne sait pas se refermer tout seul
// quand on clique un lien/bouton à l'intérieur, parce que ce panneau vit
// dans le layout PARTAGÉ (app)/layout.tsx — jamais démonté lors d'une
// navigation entre pages du même groupe de routes, donc son attribut
// `open` (état DOM non contrôlé par React) survit tel quel à travers la
// navigation. Ce composant ne fait QUE contrôler l'ouverture/fermeture du
// <details> via une ref — le contenu du panneau (children) reste
// entièrement rendu côté serveur, inchangé.
export function NotificationBellShell({ children }: { children: React.ReactNode }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const details = detailsRef.current;
      if (!details) return;
      const target = event.target as Node;

      // Clic en dehors du panneau : referme toujours.
      if (!details.contains(target)) {
        details.open = false;
        return;
      }

      // Clic à l'intérieur sur un lien ou un bouton de soumission (une
      // notification individuelle, "Voir tout l'historique") : la
      // navigation elle-même va suivre son cours, on referme juste le
      // panneau avant. Le <summary> n'est ni l'un ni l'autre, donc son
      // bascule natif open/fermé n'est jamais court-circuité ici.
      if ((target as Element).closest?.("a, button[type='submit']")) {
        details.open = false;
      }
    }

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return (
    <details ref={detailsRef} className="group relative">
      {children}
    </details>
  );
}
