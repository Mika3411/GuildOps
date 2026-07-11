import {
  Building2,
  CalendarX2,
  Globe2,
  Handshake,
  Languages,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Shield,
  ShieldAlert,
  ShoppingBag,
  Swords,
  UserCog,
  UserCheck,
  UserRound,
} from "lucide-react";

export const MODULE_COMPLEXITY = Object.freeze({
  core: "core",
  simple: "simple",
  advanced: "advanced",
});

export const guildOpsModules = Object.freeze([
  {
    id: "site",
    label: "Site",
    navLabel: "Site",
    mobileLabel: "Site",
    description: "Page de guilde, identité et mise en ligne.",
    benefit: "Publier un lien clair pour présenter la guilde et centraliser les infos clés.",
    route: "/app/site",
    view: "command",
    permissionKeys: ["manage_site"],
    defaultEnabled: true,
    complexity: MODULE_COMPLEXITY.core,
    dependencies: [],
    icon: Globe2,
  },
  {
    id: "administration",
    label: "Administration",
    navLabel: "Administration",
    mobileLabel: "Admin",
    description: "Accès d'administration et restrictions par modules.",
    benefit: "Choisir les membres qui peuvent administrer le site et limiter chaque accès aux modules utiles.",
    route: "/app/admin",
    view: "administration",
    permissionKeys: ["admin_all"],
    defaultEnabled: true,
    complexity: MODULE_COMPLEXITY.core,
    dependencies: [],
    icon: UserCog,
  },
  {
    id: "shop",
    label: "Boutique",
    navLabel: "Boutique",
    mobileLabel: "Boutique",
    description: "Templates, packs d'images, emojis et produits digitaux.",
    benefit: "Déverrouiller des ressources prêtes pour améliorer le site, les annonces et le Discord de la guilde.",
    route: "/app/shop",
    view: "shop",
    permissionKeys: ["manage_site"],
    defaultEnabled: true,
    complexity: MODULE_COMPLEXITY.core,
    dependencies: ["site"],
    icon: ShoppingBag,
  },
  {
    id: "membership_requests",
    label: "Adhésions",
    navLabel: "Adhésions",
    mobileLabel: "Accès",
    description: "Demandes d'accès arrivées hors lien d'invitation.",
    benefit: "Valider les nouveaux joueurs avant de les activer comme membres de la guilde.",
    route: "/app/adhesions",
    view: "membershipRequests",
    permissionKeys: ["approve_members"],
    defaultEnabled: true,
    complexity: MODULE_COMPLEXITY.core,
    dependencies: ["site"],
    icon: UserCheck,
  },
  {
    id: "member_space",
    label: "Espace membre",
    navLabel: "Espace membre",
    mobileLabel: "Compte",
    description: "Compte, informations personnelles et suivi des commandes.",
    benefit: "Donner à chaque membre un accès clair à son profil, ses ressources et sa sécurité.",
    route: "/app/member",
    view: "member",
    permissionKeys: [],
    defaultEnabled: true,
    complexity: MODULE_COMPLEXITY.core,
    dependencies: [],
    icon: UserRound,
  },
  {
    id: "absences",
    label: "Absences",
    navLabel: "Absences",
    mobileLabel: "Abs.",
    description: "Dates d'absence, durée et motif déclarés par les membres.",
    benefit: "Savoir qui sera indisponible plusieurs jours et anticiper les évènements, rallyes ou relais internes.",
    route: "/app/absences",
    view: "absences",
    permissionKeys: [],
    defaultEnabled: true,
    complexity: MODULE_COMPLEXITY.simple,
    dependencies: ["member_space"],
    icon: CalendarX2,
  },
  {
    id: "wars_events",
    label: "Évènements",
    navLabel: "Évènements",
    mobileLabel: "Évèn.",
    description: "Planning, check-in et objectifs d'évènements.",
    benefit: "Préparer les évènements, collecter les présences et donner un plan commun avant les gros rendez-vous.",
    route: "/app/wars",
    view: "wars",
    permissionKeys: ["manage_events"],
    defaultEnabled: false,
    complexity: MODULE_COMPLEXITY.advanced,
    dependencies: [],
    icon: Swords,
  },
  {
    id: "sos_attack",
    label: "SOS attaque",
    navLabel: "SOS",
    mobileLabel: "SOS",
    description: "Alerte attaque, suivi des réponses et temps réel.",
    benefit: "Déclencher une alerte rapide, suivre les renforts et réduire les pertes pendant les attaques.",
    route: "/app/modules/sos",
    view: "command",
    permissionKeys: [],
    defaultEnabled: false,
    complexity: MODULE_COMPLEXITY.simple,
    dependencies: [],
    icon: ShieldAlert,
  },
  {
    id: "bank",
    label: "Banque",
    navLabel: "Banque",
    mobileLabel: "Banque",
    description: "Stocks, demandes, historique et commande partagee.",
    benefit: "Structurer les demandes de ressources, garder l'historique et éviter les arbitrages dans le chat.",
    route: "/app/bank",
    view: "bank",
    permissionKeys: ["manage_bank"],
    defaultEnabled: false,
    complexity: MODULE_COMPLEXITY.advanced,
    dependencies: [],
    icon: Building2,
  },
  {
    id: "diplomacy",
    label: "Diplomatie",
    navLabel: "Diplomatie",
    mobileLabel: "Diplo",
    description: "Relations, NAP et coordonnées importantes.",
    benefit: "Clarifier alliés, ennemis, NAP et contacts clés pour éviter les erreurs de royaume.",
    route: "/app/diplomacy",
    view: "diplomacy",
    permissionKeys: ["manage_diplomacy"],
    defaultEnabled: false,
    complexity: MODULE_COMPLEXITY.advanced,
    dependencies: [],
    icon: Handshake,
  },
  {
    id: "forum",
    label: "Forum",
    navLabel: "Forum",
    mobileLabel: "Forum",
    description: "Discussions privées, catégories et modération.",
    benefit: "Conserver les plans, décisions et briefings dans des espaces privés mieux rangés que le chat.",
    route: "/app/forum",
    view: "forum",
    permissionKeys: ["moderate_forum"],
    defaultEnabled: false,
    complexity: MODULE_COMPLEXITY.advanced,
    dependencies: ["multi_guilds"],
    icon: MessageSquare,
  },
  {
    id: "messages",
    label: "Messagerie",
    navLabel: "Messagerie",
    mobileLabel: "Messages",
    description: "Messagerie interne et chat invités.",
    benefit: "Créer des conversations internes et garder un canal d'accueil autour du site de guilde.",
    route: "/app/messages",
    view: "messages",
    permissionKeys: [],
    defaultEnabled: true,
    complexity: MODULE_COMPLEXITY.core,
    dependencies: ["site"],
    icon: Mail,
  },
  {
    id: "translation",
    label: "Traduction",
    navLabel: "Traduction",
    mobileLabel: "Trad.",
    description: "Traductions automatiques des messages et contenus.",
    benefit: "Aider les guildes multilingues à lire les messages importants sans casser le rythme des échanges.",
    route: "/app/modules/translation",
    view: "messages",
    permissionKeys: [],
    defaultEnabled: false,
    complexity: MODULE_COMPLEXITY.advanced,
    dependencies: ["messages"],
    icon: Languages,
  },
  {
    id: "multi_guilds",
    label: "Membres / paramètres",
    hubLabel: "Multi-guildes",
    navLabel: "Membres / paramètres",
    mobileLabel: "Param.",
    description: "Membres, rôles, guildes liées et réglages de base.",
    benefit: "Gérer les membres, rôles et guildes liées quand la communauté s'étend sur plusieurs mondes.",
    route: "/app/settings",
    view: "settings",
    views: ["settings", "members"],
    permissionKeys: ["manage_members", "manage_roles"],
    defaultEnabled: true,
    complexity: MODULE_COMPLEXITY.core,
    dependencies: [],
    icon: Shield,
  },
]);

export const moduleHubNavItem = Object.freeze({
  id: "modules",
  label: "Modules",
  mobileLabel: "Modules",
  route: "/app/modules",
  view: "modules",
  moduleId: null,
  icon: LayoutDashboard,
});

export const defaultSiteSections = Object.freeze({
  roster: true,
  membership: false,
  wars: true,
  bank: true,
  diplomacy: true,
  forum: true,
  publicChat: false,
});

export const siteSectionMeta = Object.freeze([
  { key: "roster", navLabel: "Equipe" },
  { key: "membership", navLabel: "Adhésions" },
  { key: "wars", navLabel: "Évènements" },
  { key: "bank", navLabel: "Banque" },
  { key: "diplomacy", navLabel: "Diplomatie" },
  { key: "forum", navLabel: "Forum" },
  { key: "publicChat", navLabel: "Chat" },
]);

export const guildOpsModuleById = Object.freeze(
  Object.fromEntries(guildOpsModules.map((module) => [module.id, module])),
);

export const administrationModuleIds = Object.freeze([
  "site",
  "membership_requests",
  "absences",
  "wars_events",
  "bank",
  "diplomacy",
  "forum",
]);

export const defaultEnabledModuleIds = Object.freeze(
  guildOpsModules.filter((module) => module.defaultEnabled).map((module) => module.id),
);

const PRIMARY_NAV_MODULE_IDS = Object.freeze(["site", "shop", "member_space", "absences", "messages", "administration"]);

export function getDefaultEnabledModuleIds() {
  return [...defaultEnabledModuleIds];
}

export function getGuildOpsModule(moduleId) {
  return guildOpsModuleById[moduleId] || null;
}

export function getGuildOpsModuleByView(view) {
  return (
    guildOpsModules.find((module) => module.view === view || module.views?.includes(view)) ||
    null
  );
}

export function getGuildOpsModuleByRoute(route) {
  return guildOpsModules.find((module) => module.route === route) || null;
}

export function isGuildOpsModuleEnabled(moduleOrId, enabledModuleIds = defaultEnabledModuleIds) {
  const module = typeof moduleOrId === "string" ? getGuildOpsModule(moduleOrId) : moduleOrId;
  if (!module) return false;
  return new Set(enabledModuleIds).has(module.id);
}

export function getEnabledGuildOpsModules(enabledModuleIds = defaultEnabledModuleIds) {
  return guildOpsModules.filter((module) => isGuildOpsModuleEnabled(module, enabledModuleIds));
}

export function getDisabledGuildOpsModules(enabledModuleIds = defaultEnabledModuleIds) {
  return guildOpsModules.filter((module) => !isGuildOpsModuleEnabled(module, enabledModuleIds));
}

export function getAdministrationModules() {
  return administrationModuleIds.map((moduleId) => guildOpsModuleById[moduleId]).filter(Boolean);
}

export function getGuildOpsNavItems(enabledModuleIds = defaultEnabledModuleIds) {
  const primaryItems = PRIMARY_NAV_MODULE_IDS.map((moduleId) => getGuildOpsModule(moduleId))
    .filter(Boolean)
    .filter((module) => isGuildOpsModuleEnabled(module, enabledModuleIds))
    .map((module) => toGuildOpsNavItem(module, enabledModuleIds));

  return [
    ...primaryItems,
    moduleHubNavItem,
  ].filter(Boolean);
}

export function getGuildOpsMobileNavItems(enabledModuleIds = defaultEnabledModuleIds) {
  const primaryItems = PRIMARY_NAV_MODULE_IDS.map((moduleId) => getGuildOpsModule(moduleId))
    .filter(Boolean)
    .filter((module) => isGuildOpsModuleEnabled(module, enabledModuleIds))
    .map((module) => toGuildOpsNavItem(module, enabledModuleIds));

  return [
    ...primaryItems,
    moduleHubNavItem,
  ].filter(Boolean);
}

export function getComplexityLabel(complexity) {
  return {
    [MODULE_COMPLEXITY.core]: "Essentiel",
    [MODULE_COMPLEXITY.simple]: "Simple",
    [MODULE_COMPLEXITY.advanced]: "Avancé",
  }[complexity] || complexity;
}

function toGuildOpsNavItem(module, enabledModuleIds) {
  const enabled = isGuildOpsModuleEnabled(module, enabledModuleIds);

  return {
    id: module.view,
    label: module.navLabel || module.label,
    mobileLabel: module.mobileLabel || module.navLabel || module.label,
    route: module.route,
    moduleId: module.id,
    icon: module.icon,
    disabled: !enabled,
  };
}
