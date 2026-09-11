"use client";

import { useActionState } from "react";
import { setEmployeeActive, type EmployeeFormState } from "./actions";

const initialState: EmployeeFormState = { error: null };

const ROLE_LABELS: Record<"agency_manager" | "agent", string> = {
  agency_manager: "Chef d'agence",
  agent: "Agent",
};

export type EmployeeRowData = {
  id: string;
  full_name: string | null;
  email: string;
  role: "agency_manager" | "agent";
  agency_name: string | null;
  is_active: boolean;
};

export function EmployeeRow({ member }: { member: EmployeeRowData }) {
  const [state, action, pending] = useActionState(setEmployeeActive, initialState);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-4">
        <span className="font-medium text-zinc-950 dark:text-zinc-50">
          {member.full_name ?? member.email}
        </span>
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
            member.is_active
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
          }`}
        >
          {member.is_active ? "Actif" : "Inactif"}
        </span>
      </div>
      {member.full_name ? (
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{member.email}</p>
      ) : null}
      <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
        {ROLE_LABELS[member.role]}
        {member.agency_name ? ` · ${member.agency_name}` : ""}
      </p>

      <form action={action} className="mt-3 flex items-center gap-3">
        <input type="hidden" name="memberId" value={member.id} />
        <input type="hidden" name="isActive" value={member.is_active ? "0" : "1"} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {pending ? "…" : member.is_active ? "Désactiver" : "Réactiver"}
        </button>
        {state.error ? (
          <span className="text-sm text-red-600 dark:text-red-400" role="alert">
            {state.error}
          </span>
        ) : null}
      </form>
    </div>
  );
}
