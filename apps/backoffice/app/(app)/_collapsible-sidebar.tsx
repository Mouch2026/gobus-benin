"use client";

import { useState, type ReactNode } from "react";
import { ChevronDownIcon } from "@/lib/icons";

// Repli en icônes seules — INDÉPENDANT du mécanisme <details>/<summary>
// de SidebarLinks (_sidebar-nav.tsx). Ce composant ne reçoit
// SidebarLinks qu'en `children`, tel quel : il ne le modifie jamais, ne
// le re-rend jamais différemment, ne lui passe aucune prop liée au
// repli. Son seul état pose un attribut `data-collapsed` sur lui-même
// (`group/sidebar`) ; chaque libellé de SidebarLinks porte déjà la
// classe Tailwind `group-data-[collapsed=true]/sidebar:hidden` — c'est
// donc du pur CSS qui réagit, jamais un re-rendu ou une prop qui
// transite vers les <details>. Le natif (`open`) et le CSS
// (`data-collapsed`) sont deux axes qui ne se lisent jamais l'un
// l'autre : une section ouverte le reste, réduite ou non, et réduire
// n'ouvre ni ne ferme jamais rien.
export function CollapsibleSidebar({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      data-collapsed={collapsed ? "true" : "false"}
      className="group/sidebar hidden shrink-0 border-r border-zinc-200 p-4 dark:border-zinc-800 md:block print:hidden data-[collapsed=true]:w-16 data-[collapsed=false]:w-[220px]"
    >
      <nav className="flex flex-col gap-1">{children}</nav>
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        title={collapsed ? "Déplier la barre latérale" : "Réduire la barre latérale"}
        aria-label={collapsed ? "Déplier la barre latérale" : "Réduire la barre latérale"}
        className="mt-2 flex w-full items-center justify-center rounded-md px-3 py-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
      >
        <ChevronDownIcon
          className={`h-4 w-4 transition-transform ${collapsed ? "-rotate-90" : "rotate-90"}`}
          aria-hidden
        />
      </button>
    </aside>
  );
}
