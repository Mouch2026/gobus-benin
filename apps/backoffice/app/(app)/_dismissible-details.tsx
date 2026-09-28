"use client";

import { useEffect, useRef } from "react";

// Îlot client minimal, même exception déjà acceptée que NotificationBadge/
// _live-clock.tsx : un <details> natif ne sait pas se refermer tout seul
// quand on clique un lien/bouton à l'intérieur, parce que tout élément du
// layout PARTAGÉ (app)/layout.tsx n'est jamais démonté entre deux pages
// du même groupe de routes — son attribut `open` (état DOM non contrôlé
// par React) survit donc tel quel à travers la navigation. Générique :
// utilisé par la cloche de notifications, le menu utilisateur (Profil/Se
// déconnecter) ET le tiroir mobile "☰ Menu" — jamais dupliqué entre eux.
// `className` reste à la charge de l'appelant (chaque usage a des besoins
// très différents : popover positionné en absolu pour les deux premiers,
// simple bandeau pour le tiroir). Ne contrôle QUE l'ouverture/fermeture
// du <details> via une ref — le contenu (children) reste entièrement
// rendu côté serveur, inchangé.
//
// PAS utilisé pour les sections/sous-groupes de la sidebar
// (_sidebar-nav.tsx, SectionDetails/GroupDetails) : ce sont des menus de
// navigation/accordéon, pas des popovers transitoires — qu'ils restent
// ouverts/fermés tels que l'utilisateur les a laissés en naviguant est le
// comportement voulu.
export function DismissibleDetails({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function close() {
      if (detailsRef.current) detailsRef.current.open = false;
    }

    function handleClick(event: MouseEvent) {
      const details = detailsRef.current;
      if (!details) return;
      const target = event.target as Node;

      // Clic en dehors du panneau : referme toujours.
      if (!details.contains(target)) {
        close();
        return;
      }

      // Clic à l'intérieur sur un lien ou un bouton de soumission (une
      // notification individuelle, "Voir tout l'historique", "Profil",
      // "Se déconnecter") : la navigation/soumission elle-même va suivre
      // son cours (aucun preventDefault/stopPropagation ici), on referme
      // juste le panneau avant. Le <summary> n'est ni l'un ni l'autre,
      // donc son bascule natif open/fermé n'est jamais court-circuité ici.
      if ((target as Element).closest?.("a, button[type='submit']")) {
        close();
      }
    }

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape" && detailsRef.current?.open) {
        close();
      }
    }

    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKeydown);
    };
  }, []);

  return (
    <details ref={detailsRef} className={className}>
      {children}
    </details>
  );
}
