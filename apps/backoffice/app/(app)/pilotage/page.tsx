import { redirect } from "next/navigation";

// Chantier "un seul tableau de bord compagnie entière" — /pilotage et "/"
// montraient le même contenu, protégés par la même garde
// (requirePageAccess(access, "companyWide")). Fusionnés : "/" porte
// désormais tout (composants, requêtes), /pilotage n'est plus qu'un
// alias qui y renvoie. Aucune garde propre ici — "/" applique la sienne
// juste après (même pour un rôle qui n'y aurait pas accès : la
// redirection suivante vers /mon-tableau-de-bord se fait depuis "/",
// pas ici, jamais de double redirection ni de boucle).
export default function PilotagePage() {
  redirect("/");
}
