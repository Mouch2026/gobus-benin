"use client";

import { useEffect, useState, type ReactElement, type SVGProps } from "react";
import Link from "next/link";
import { can, type CompanyAction, type CompanyRole } from "@/lib/permissions";
import * as Icons from "@/lib/icons";

// Structure de données unique pour toute la navigation — icône, couleur,
// libellé, destination, gate de permission et type de notification
// vivent tous au même endroit, pour que la recherche (qui filtre sur ces
// mêmes libellés) ne puisse jamais diverger de ce qui est réellement
// affiché.

type IconComponent = (props: SVGProps<SVGSVGElement>) => ReactElement;

type NavLeaf = {
  kind: "link" | "soon";
  label: string;
  Icon: IconComponent;
  href?: string;
  gate?: CompanyAction;
  note?: string;
  subtitle?: string;
  notificationType?: string;
};

type NavGroup = {
  kind: "group";
  label: string;
  Icon: IconComponent;
  items: NavLeaf[];
};

type NavEntry = NavLeaf | NavGroup;

type NavSection = {
  key: string;
  label: string;
  Icon: IconComponent;
  colorClass: string;
  items: NavEntry[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    key: "dashboard",
    label: "Tableau de bord",
    Icon: Icons.GridIcon,
    colorClass: "text-indigo-600 dark:text-indigo-400",
    items: [
      { kind: "link", label: "Vue globale", href: "/", Icon: Icons.GaugeIcon },
      { kind: "soon", label: "Widgets personnalisables", Icon: Icons.PuzzleIcon },
    ],
  },
  {
    key: "operations",
    label: "Opérations",
    Icon: Icons.ClipboardListIcon,
    colorClass: "text-blue-600 dark:text-blue-400",
    items: [
      {
        kind: "link",
        label: "Réservations",
        href: "/reservations",
        Icon: Icons.TicketIcon,
        notificationType: "booking_cancelled_by_traveller",
      },
      { kind: "link", label: "Voyages", href: "/voyages", Icon: Icons.RouteIcon, notificationType: "trip_full" },
      {
        kind: "link",
        label: "Embarquement",
        href: "/embarquement",
        Icon: Icons.QrCodeIcon,
        gate: "boarding.validate",
        notificationType: "boarding_double_validation",
      },
      {
        kind: "link",
        label: "Validations",
        href: "/validations",
        Icon: Icons.CheckIcon,
        gate: "supervisorApprovals.manage",
        notificationType: "supervisor_approval_requested",
      },
      {
        kind: "group",
        label: "Chauffeurs",
        Icon: Icons.SteeringWheelIcon,
        items: [
          { kind: "soon", label: "Disponibilités", Icon: Icons.CalendarCheckIcon },
          { kind: "soon", label: "Évaluations", Icon: Icons.StarIcon },
        ],
      },
      {
        kind: "group",
        label: "Bus",
        Icon: Icons.BusIcon,
        items: [
          // Même page que "Plans de bus" sous Administration — deux
          // contextes de navigation vers la même gestion de plans de
          // sièges, jamais une gestion de véhicules qui n'existe pas.
          { kind: "link", label: "Flotte", href: "/plans-de-bus", Icon: Icons.BusIcon },
          { kind: "soon", label: "Maintenance", Icon: Icons.WrenchIcon },
          { kind: "soon", label: "Localisation GPS", Icon: Icons.MapPinIcon },
        ],
      },
      {
        kind: "group",
        label: "Itinéraires",
        Icon: Icons.MapIcon,
        items: [
          {
            kind: "link",
            label: "Création/modification",
            href: "/trajets/nouveau",
            Icon: Icons.PencilIcon,
            note: "La route se crée avec le trajet, jamais séparément.",
          },
          { kind: "soon", label: "Optimisation", Icon: Icons.SlidersIcon },
        ],
      },
    ],
  },
  {
    key: "finances",
    label: "Finances",
    Icon: Icons.WalletIcon,
    colorClass: "text-emerald-600 dark:text-emerald-400",
    items: [
      { kind: "link", label: "Paiements", href: "/paiements", Icon: Icons.CardIcon },
      { kind: "link", label: "Remboursements", href: "/remboursements", Icon: Icons.UndoIcon },
      {
        kind: "link",
        label: "Caisse",
        href: "/caisse",
        Icon: Icons.BanknoteIcon,
        notificationType: "cash_ceiling_reached",
      },
    ],
  },
  {
    key: "clients",
    label: "Clients & agences",
    Icon: Icons.UsersIcon,
    colorClass: "text-violet-600 dark:text-violet-400",
    items: [
      { kind: "link", label: "Clients", href: "/clients", Icon: Icons.UserIcon },
      { kind: "link", label: "Agences", href: "/agences", Icon: Icons.BuildingIcon },
      { kind: "link", label: "Codes promo", href: "/codes-promo", Icon: Icons.TagIcon, gate: "promoCodes.manage" },
      { kind: "soon", label: "Programme de fidélité", Icon: Icons.GiftIcon },
    ],
  },
  {
    key: "reports",
    label: "Rapports & audit",
    Icon: Icons.ReportIcon,
    colorClass: "text-amber-600 dark:text-amber-400",
    items: [
      { kind: "link", label: "Rapports", href: "/rapports", Icon: Icons.ChartBarIcon },
      { kind: "link", label: "Journal d'audit", href: "/audit", Icon: Icons.ShieldCheckIcon, gate: "auditLog.view" },
      {
        kind: "group",
        label: "Export",
        Icon: Icons.DownloadIcon,
        items: [
          { kind: "link", label: "CSV", href: "/reservations/export", Icon: Icons.FileTextIcon },
          { kind: "soon", label: "Excel", Icon: Icons.FileSpreadsheetIcon },
          { kind: "soon", label: "PDF", Icon: Icons.FileIcon },
        ],
      },
    ],
  },
  {
    key: "communication",
    label: "Communication",
    Icon: Icons.MegaphoneIcon,
    colorClass: "text-sky-600 dark:text-sky-400",
    items: [
      // Même mécanisme que la cloche du header — un seul lien, jamais
      // deux entrées vers la même page.
      { kind: "link", label: "Notifications / Alertes", href: "/notifications", Icon: Icons.BellIcon },
      { kind: "soon", label: "Messagerie interne", Icon: Icons.MessageIcon },
    ],
  },
  {
    key: "admin",
    label: "Administration",
    Icon: Icons.SettingsIcon,
    colorClass: "text-zinc-500 dark:text-zinc-400",
    items: [
      { kind: "link", label: "Profil", href: "/profil", Icon: Icons.UserIcon },
      { kind: "link", label: "Abonnement", href: "/abonnement", Icon: Icons.ReceiptIcon },
      { kind: "link", label: "Plans de bus", href: "/plans-de-bus", Icon: Icons.LayoutGridIcon },
      { kind: "link", label: "Employés", href: "/employes", Icon: Icons.UsersIcon, gate: "employees.manage" },
      { kind: "soon", label: "Gestion des accès", Icon: Icons.LockIcon },
      { kind: "soon", label: "Sauvegardes", Icon: Icons.DatabaseIcon },
      { kind: "soon", label: "API & Intégrations", Icon: Icons.PlugIcon },
      { kind: "soon", label: "Paramètres", Icon: Icons.SlidersIcon, subtitle: "Langues, devise (XOF)…" },
    ],
  },
];

// group-data-[collapsed=true]/sidebar:hidden : n'a d'effet QUE sous un
// ancêtre portant la classe "group/sidebar" (le <aside> desktop réduit,
// voir _collapsible-sidebar.tsx) — dans le tiroir mobile, sans cet
// ancêtre, la variante ne s'active jamais et le libellé reste visible.
const LABEL_CLASSES = "truncate group-data-[collapsed=true]/sidebar:hidden";
const SECTION_SUMMARY_CLASSES =
  "flex w-full items-center gap-2.5 cursor-pointer list-none rounded-md px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800";
const SUB_LINK_CLASSES =
  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800";
const SUB_GROUP_CLASSES =
  "ml-3 mt-1 flex flex-col gap-1 border-l border-zinc-200 pl-3 dark:border-zinc-800 group-data-[collapsed=true]/sidebar:ml-0 group-data-[collapsed=true]/sidebar:border-l-0 group-data-[collapsed=true]/sidebar:pl-0";

function matchesQuery(label: string, query: string): boolean {
  return query === "" || label.toLowerCase().includes(query);
}

function groupHasMatch(group: NavGroup, query: string): boolean {
  if (query === "") return true;
  if (matchesQuery(group.label, query)) return true;
  return group.items.some((item) => matchesQuery(item.label, query));
}

function sectionHasMatch(section: NavSection, query: string): boolean {
  if (query === "") return true;
  if (matchesQuery(section.label, query)) return true;
  return section.items.some((item) =>
    item.kind === "group" ? groupHasMatch(item, query) : matchesQuery(item.label, query)
  );
}

// Même patron visuel que le badge "Bientôt disponible" de la page
// d'accueil voyageur (apps/web/app/page.tsx) — traduit en tokens zinc.
// Jamais un <Link> mort : ces entrées n'ont pas de destination.
function ComingSoonItem({ leaf }: { leaf: NavLeaf }) {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-2" title={leaf.label}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2.5 text-sm text-zinc-400 dark:text-zinc-500">
          <leaf.Icon className="h-4 w-4 shrink-0" aria-hidden />
          <span className={LABEL_CLASSES}>{leaf.label}</span>
        </span>
        <span
          className={`inline-flex shrink-0 items-center rounded-full border border-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-400 dark:border-zinc-700 dark:text-zinc-500 ${LABEL_CLASSES}`}
        >
          Bientôt disponible
        </span>
      </div>
      {leaf.subtitle ? (
        <span className={`pl-6 text-xs text-zinc-400 dark:text-zinc-500 ${LABEL_CLASSES}`}>{leaf.subtitle}</span>
      ) : null}
    </div>
  );
}

function LinkItem({ leaf, badgeCount }: { leaf: NavLeaf; badgeCount: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <Link href={leaf.href!} title={leaf.label} className={SUB_LINK_CLASSES}>
        <leaf.Icon className="h-4 w-4 shrink-0" aria-hidden />
        <span className={LABEL_CLASSES}>{leaf.label}</span>
        {badgeCount > 0 ? (
          <span
            className={`ml-auto inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white ${LABEL_CLASSES}`}
          >
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        ) : null}
      </Link>
      {leaf.note ? <span className={`px-3 text-xs text-zinc-400 dark:text-zinc-500 ${LABEL_CLASSES}`}>{leaf.note}</span> : null}
    </div>
  );
}

function GroupDetails({
  group,
  query,
  badgeCounts,
}: {
  group: NavGroup;
  query: string;
  badgeCounts: Record<string, number>;
}) {
  if (!groupHasMatch(group, query)) return null;
  const groupLabelMatches = matchesQuery(group.label, query);

  return (
    <details className="group" open={query !== "" ? true : undefined}>
      <summary className={SECTION_SUMMARY_CLASSES} title={group.label}>
        <group.Icon className="h-4 w-4 shrink-0" aria-hidden />
        <span className={LABEL_CLASSES}>{group.label}</span>
      </summary>
      <div className={SUB_GROUP_CLASSES}>
        {group.items
          .filter((leaf) => groupLabelMatches || matchesQuery(leaf.label, query))
          .map((leaf) =>
            leaf.kind === "link" ? (
              <LinkItem
                key={leaf.label}
                leaf={leaf}
                badgeCount={leaf.notificationType ? (badgeCounts[leaf.notificationType] ?? 0) : 0}
              />
            ) : (
              <ComingSoonItem key={leaf.label} leaf={leaf} />
            )
          )}
      </div>
    </details>
  );
}

function SectionDetails({
  section,
  role,
  query,
  badgeCounts,
}: {
  section: NavSection;
  role: CompanyRole;
  query: string;
  badgeCounts: Record<string, number>;
}) {
  if (!sectionHasMatch(section, query)) return null;
  const sectionLabelMatches = matchesQuery(section.label, query);

  const visibleItems = section.items.filter((item) => {
    if (item.kind === "link" && item.gate && !can(role, item.gate)) return false;
    if (item.kind === "group") return groupHasMatch(item, query) || sectionLabelMatches;
    return sectionLabelMatches || matchesQuery(item.label, query);
  });

  return (
    <details className="group" open={query !== "" ? true : undefined}>
      <summary className={SECTION_SUMMARY_CLASSES} title={section.label}>
        <section.Icon className={`h-5 w-5 shrink-0 ${section.colorClass}`} aria-hidden />
        <span className={LABEL_CLASSES}>{section.label}</span>
      </summary>
      <div className={SUB_GROUP_CLASSES}>
        {visibleItems.map((item) =>
          item.kind === "group" ? (
            <GroupDetails key={item.label} group={item} query={query} badgeCounts={badgeCounts} />
          ) : item.kind === "link" ? (
            <LinkItem
              key={item.label}
              leaf={item}
              badgeCount={item.notificationType ? (badgeCounts[item.notificationType] ?? 0) : 0}
            />
          ) : (
            <ComingSoonItem key={item.label} leaf={item} />
          )
        )}
      </div>
    </details>
  );
}

// Seule exception JS de tout le menu (recherche + badges) — le reste
// (ouverture/fermeture des sections) reste du <details> natif, jamais
// contrôlé par ce composant. permissions.ts est explicitement conçu
// pour être importable ici (voir son commentaire de tête).
export function SidebarLinks({
  role,
  initialBadgeCounts,
}: {
  role: CompanyRole;
  initialBadgeCounts: Record<string, number>;
}) {
  const [query, setQuery] = useState("");
  const [badgeCounts, setBadgeCounts] = useState(initialBadgeCounts);

  // Même patron que _notification-badge.tsx : sondage toutes les 60s,
  // échec réseau avalé en silence (les badges gardent leur dernière
  // valeur connue plutôt que de disparaître).
  useEffect(() => {
    const id = setInterval(() => {
      fetch("/notifications-non-lues-par-type")
        .then((res) => res.json())
        .then((data: { counts: Record<string, number> }) => setBadgeCounts(data.counts))
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const normalizedQuery = query.trim().toLowerCase();

  return (
    <div className="flex flex-col gap-1">
      <div className="relative mb-1 group-data-[collapsed=true]/sidebar:hidden">
        <Icons.SearchIcon
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher dans le menu…"
          className="w-full rounded-md border border-zinc-200 bg-white py-1.5 pl-8 pr-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>
      {NAV_SECTIONS.map((section) => (
        <SectionDetails
          key={section.key}
          section={section}
          role={role}
          query={normalizedQuery}
          badgeCounts={badgeCounts}
        />
      ))}
    </div>
  );
}
