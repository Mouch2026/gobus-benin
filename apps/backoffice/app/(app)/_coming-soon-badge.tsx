// Même recette visuelle que le badge "Bientôt disponible" déjà utilisé
// dans le menu latéral pour Chauffeurs/Bus/Itinéraires (ComingSoonItem,
// _sidebar-nav.tsx) — pas un second modèle : mêmes classes de forme
// (rounded-full, border, px-2 py-0.5, text-[10px] font-semibold), juste
// les tokens `sidebar-*` (pensés pour le fond turquoise de la barre
// latérale) remplacés par leurs équivalents zinc pour un fond blanc de
// zone de contenu.
export function ComingSoonBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-500">
      Bientôt disponible
    </span>
  );
}
