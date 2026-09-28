"use client";

import { useActionState } from "react";
import { setEmployeeActive, updateEmployeeDashboard, type EmployeeFormState } from "./actions";
import { DashboardAssignmentFields } from "./DashboardAssignmentFields";
import type { HomeScreen } from "@/lib/permissions";

const initialState: EmployeeFormState = { error: null };

const ROLE_LABELS: Record<"agency_manager" | "agent", string> = {
  agency_manager: "Chef d'agence",
  agent: "Agent",
};

const HOME_SCREEN_LABELS: Record<HomeScreen, string> = {
  global: "Vue globale",
  owner_dashboard: "Tableau propriétaire",
  employee_dashboard: "Tableau employé",
};

export type EmployeeRowData = {
  id: string;
  full_name: string | null;
  email: string;
  role: "agency_manager" | "agent";
  agency_name: string | null;
  is_active: boolean;
  home_screen: HomeScreen;
  pilotage_access_granted: boolean;
};

export function EmployeeRow({ member }: { member: EmployeeRowData }) {
  const [state, action, pending] = useActionState(setEmployeeActive, initialState);
  const [dashboardState, dashboardAction, dashboardPending] = useActionState(
    updateEmployeeDashboard,
    initialState
  );

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between gap-4">
        <span className="font-medium text-zinc-950">
          {member.full_name ?? member.email}
        </span>
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
            member.is_active
              ? "bg-emerald-50 text-emerald-700"
              : "bg-zinc-100 text-zinc-600"
          }`}
        >
          {member.is_active ? "Actif" : "Inactif"}
        </span>
      </div>
      {member.full_name ? (
        <p className="mt-1 text-sm text-zinc-500">{member.email}</p>
      ) : null}
      <p className="mt-2 text-sm text-zinc-700">
        {ROLE_LABELS[member.role]}
        {member.agency_name ? ` · ${member.agency_name}` : ""}
        {" · "}
        {HOME_SCREEN_LABELS[member.home_screen]}
        {member.pilotage_access_granted ? " · Autorisé pilotage" : ""}
      </p>

      <form action={action} className="mt-3 flex items-center gap-3">
        <input type="hidden" name="memberId" value={member.id} />
        <input type="hidden" name="isActive" value={member.is_active ? "0" : "1"} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "…" : member.is_active ? "Désactiver" : "Réactiver"}
        </button>
        {state.error ? (
          <span className="text-sm text-red-600" role="alert">
            {state.error}
          </span>
        ) : null}
      </form>

      {/* Panneau dépliable, pas un popover transitoire — même famille que
          les accordéons de sidebar (simple <details>, pas de
          DismissibleDetails). Propriétaire uniquement : cette ligne n'est
          de toute façon rendue que sur /employes, déjà réservée à
          employees.manage. */}
      <details className="mt-3 border-t border-zinc-100 pt-3">
        <summary className="cursor-pointer list-none text-sm font-medium text-zinc-700 hover:text-zinc-950">
          Tableau de bord ▾
        </summary>
        <form action={dashboardAction} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="memberId" value={member.id} />
          <DashboardAssignmentFields
            role={member.role}
            defaultHomeScreen={member.home_screen}
            defaultPilotageAccessGranted={member.pilotage_access_granted}
          />
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={dashboardPending}
              className="self-start rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {dashboardPending ? "Enregistrement..." : "Enregistrer"}
            </button>
            {dashboardState.error ? (
              <span className="text-sm text-red-600" role="alert">
                {dashboardState.error}
              </span>
            ) : null}
          </div>
        </form>
      </details>
    </div>
  );
}
