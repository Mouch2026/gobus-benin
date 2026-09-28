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
// L'autorisation pilotage couvre les DEUX vues compagnie entière ("/" ET
// /pilotage, pas seulement /pilotage) — décision explicite. Un chef
// d'agence SANS l'autorisation n'a donc AUCUN sélecteur : son tableau de
// bord est fixé sur "Tableau employé", exactement comme un agent. Le
// sélecteur (3 options) n'apparaît qu'une fois la case cochée.
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
  const [homeScreen, setHomeScreen] = useState<HomeScreen>(
    role === "agent" ? "employee_dashboard" : defaultHomeScreen
  );

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
        Autoriser l&apos;accès aux vues compagnie entière (vue globale et
        tableau propriétaire)
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
            <option value="global">Vue globale</option>
            <option value="owner_dashboard">Tableau propriétaire</option>
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
