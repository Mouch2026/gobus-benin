"use client";

import { useState } from "react";
import { FIELD_CLASSES, LABEL_CLASSES } from "../_shared";
import type { HomeScreen } from "@/lib/permissions";

// Partagé entre EmployeeForm (création) et EmployeeRow (panneau "Tableau
// de bord" d'un employé existant) — évite de dupliquer la même logique
// réactive à deux endroits. Ne fait AUCUNE confiance de son côté : la
// vraie validation (et le repli si un agent se retrouvait ici) vit dans
// resolveDashboardAssignment(), actions.ts — ce composant ne fait
// qu'empêcher l'UI de proposer un choix invalide.
//
// L'autorisation pilotage couvre la vue compagnie entière ("/" — /pilotage
// n'est plus qu'une redirection vers "/" depuis le chantier "un seul
// tableau de bord compagnie entière") — décision explicite. Un chef
// d'agence SANS l'autorisation n'a donc AUCUN sélecteur : son tableau de
// bord est fixé sur "Tableau employé", exactement comme un agent. Le
// sélecteur (2 options) n'apparaît qu'une fois la case cochée.
// 'owner_dashboard' reste une valeur valide de home_screen en base
// (aucune contrainte SQL retirée, resolveHomeRoute la traite comme
// équivalente à 'global') mais n'est plus proposée à l'écran — un choix
// de moins à comprendre pour le propriétaire, jamais deux destinations
// distinctes pour une seule vue.
export function DashboardAssignmentFields({
  role,
  defaultHomeScreen = "employee_dashboard",
  defaultPilotageAccessGranted = false,
}: {
  role: "agency_manager" | "agent";
  defaultHomeScreen?: HomeScreen;
  defaultPilotageAccessGranted?: boolean;
}) {
  const [pilotageAccessGranted, setPilotageAccessGranted] = useState(
    role === "agent" ? false : defaultPilotageAccessGranted
  );
  // Une ligne existante peut encore porter 'owner_dashboard' en base (une
  // valeur toujours valide, jamais retirée de la contrainte SQL) — plus
  // aucune <option> ne le propose depuis que /pilotage redirige vers
  // "/", donc affiché comme 'global' (même destination désormais) plutôt
  // que de laisser le <select> sur une valeur qu'il ne peut pas montrer.
  const initialHomeScreen =
    role === "agent" ? "employee_dashboard" : defaultHomeScreen === "owner_dashboard" ? "global" : defaultHomeScreen;
  const [homeScreen, setHomeScreen] = useState<HomeScreen>(initialHomeScreen);

  if (role === "agent") {
    // Un agent n'a aucun choix — toujours son tableau employé, jamais la
    // grant pilotage. Pas de champ nommé : resolveDashboardAssignment()
    // force ces valeurs côté serveur de toute façon, inutile de les
    // soumettre.
    return (
      <div className="flex flex-col gap-1.5">
        <span className={LABEL_CLASSES}>Écran d&apos;accueil</span>
        <p className="text-sm text-zinc-500">Tableau employé (fixe pour un agent)</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-sm text-zinc-700">
        <input
          type="checkbox"
          name="pilotageAccessGranted"
          value="1"
          checked={pilotageAccessGranted}
          onChange={(event) => {
            const checked = event.target.checked;
            setPilotageAccessGranted(checked);
            // Retrait cohérent : dès que la grant disparaît, on retombe
            // sur le tableau employé — c'est la SEULE valeur permise pour
            // un chef d'agence non autorisé (voir resolveDashboardAssignment,
            // actions.ts), jamais un état incohérent envoyé au serveur.
            if (!checked) {
              setHomeScreen("employee_dashboard");
            }
          }}
        />
        Autoriser l&apos;accès au tableau de bord de l&apos;entreprise
      </label>

      {pilotageAccessGranted ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="homeScreen" className={LABEL_CLASSES}>
            Écran d&apos;accueil
          </label>
          <select
            id="homeScreen"
            name="homeScreen"
            value={homeScreen}
            onChange={(event) => setHomeScreen(event.target.value as HomeScreen)}
            className={FIELD_CLASSES}
          >
            <option value="employee_dashboard">Tableau employé</option>
            <option value="global">Tableau de bord de l&apos;entreprise</option>
          </select>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <span className={LABEL_CLASSES}>Écran d&apos;accueil</span>
          <p className="text-sm text-zinc-500">
            Tableau employé (fixe sans l&apos;autorisation ci-dessus)
          </p>
        </div>
      )}
    </div>
  );
}
