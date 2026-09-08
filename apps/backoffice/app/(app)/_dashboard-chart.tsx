"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Seul composant client de ce chantier dédié au rendu du graphique — le
// Server Component (page.tsx) fait toute la récupération/agrégation des
// données et ne passe ici que le résultat déjà prêt à afficher.
export function BookingsChart({ data }: { data: { day: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data}>
        <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={28} />
        <Tooltip
          contentStyle={{
            borderRadius: 8,
            border: "1px solid var(--chart-bar)",
            fontSize: 12,
          }}
        />
        <Bar dataKey="count" name="Réservations" fill="var(--chart-bar)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
