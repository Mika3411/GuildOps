import { permissionRoles } from "../lib/rbac.js";
import { defaultSiteSections, getDefaultEnabledModuleIds } from "../config/moduleRegistry.js";

export { permissionRoles };

export const guilds = [
  {
    name: "Aegis Nord",
    game: "Whiteout Survival",
    realm: "S1287",
    language: "FR",
    style: "Guerre organisee",
    status: "online",
  },
  {
    name: "Aegis Sud",
    game: "Rise of Kingdoms",
    realm: "K321",
    language: "FR/EN",
    style: "Diplomatie",
    status: "quiet",
  },
  {
    name: "Aegis Est",
    game: "Lords Mobile",
    realm: "K88",
    language: "EN",
    style: "Farm + war",
    status: "online",
  },
];

export const events = [
  { id: "alliance-war", label: "Guerre d'alliance", time: "19:00 UTC", color: "red" },
  { id: "fortress", label: "Forteresse", time: "12:00 UTC", color: "blue" },
  { id: "hero-stage", label: "Hero Stage", time: "20:00 UTC", color: "violet" },
  { id: "bear-hunt", label: "Bear Hunt", time: "08:00 UTC", color: "green" },
  { id: "polar", label: "Exploration polaire", time: "18:00 UTC", color: "cyan" },
];

export const initialMembers = [
  {
    id: "nordicleader",
    name: "NordicLeader",
    role: "Admin",
    power: "512.3M",
    status: "online",
    allianceWar: "Confirme",
    fortress: "Confirme",
    heroStage: "Peut-etre",
    bearHunt: "Confirme",
  },
  {
    id: "frostwarden",
    name: "FrostWarden",
    role: "Officier",
    power: "476.8M",
    status: "online",
    allianceWar: "Confirme",
    fortress: "Confirme",
    heroStage: "Confirme",
    bearHunt: "Peut-etre",
  },
  {
    id: "shieldmaiden",
    name: "ShieldMaiden",
    role: "Diplomate",
    power: "438.6M",
    status: "5 min",
    allianceWar: "Peut-etre",
    fortress: "Confirme",
    heroStage: "Confirme",
    bearHunt: "Confirme",
  },
  {
    id: "icehammer",
    name: "IceHammer",
    role: "Banquier",
    power: "401.1M",
    status: "15 min",
    allianceWar: "Absent",
    fortress: "Peut-etre",
    heroStage: "Peut-etre",
    bearHunt: "Confirme",
  },
  {
    id: "polarbear",
    name: "PolarBear",
    role: "Officier",
    power: "365.2M",
    status: "1 h",
    allianceWar: "Confirme",
    fortress: "Absent",
    heroStage: "Peut-etre",
    bearHunt: "Confirme",
  },
];

export const diplomacyRows = [
  {
    id: "dip-nfd",
    tag: "NFD",
    name: "Northern Fury",
    type: "Alliance",
    relationType: "ally",
    mood: "Amical",
    stance: "Renforts mutuels",
    notes: "Canal R4 partage, prevenir avant toute prise de forteresse.",
    createdByName: "ShieldMaiden",
    updatedByName: "NordicLeader",
    createdAt: "2026-06-20T09:30:00.000Z",
    updatedAt: "2026-06-30T18:40:00.000Z",
  },
  {
    id: "dip-vgr",
    tag: "VGR",
    name: "Vanguard",
    type: "Alliance",
    relationType: "ally",
    mood: "Amical",
    stance: "Aide Bear Hunt",
    notes: "Bon contact, demander confirmation avant rallye commun.",
    createdByName: "ShieldMaiden",
    updatedByName: "FrostWarden",
    createdAt: "2026-06-18T10:15:00.000Z",
    updatedAt: "2026-06-28T12:10:00.000Z",
  },
  {
    id: "dip-wld",
    tag: "WLD",
    name: "Wild Legacy",
    type: "NAP",
    relationType: "nap",
    mood: "NAP",
    stance: "Zone frontiere calme",
    notes: "Accord fragile cote nord, surveiller les tiles autour de X602 Y585.",
    createdByName: "NordicLeader",
    updatedByName: "ShieldMaiden",
    createdAt: "2026-06-12T08:00:00.000Z",
    updatedAt: "2026-06-29T14:25:00.000Z",
  },
  {
    id: "dip-sov",
    tag: "SOV",
    name: "Sovereign",
    type: "Ennemi",
    relationType: "enemy",
    mood: "Hostile",
    stance: "Rallyes repetes",
    notes: "Priorite defense ruche Est, contacter diplomate avant riposte hors event.",
    createdByName: "FrostWarden",
    updatedByName: "FrostWarden",
    createdAt: "2026-06-10T21:05:00.000Z",
    updatedAt: "2026-07-01T07:20:00.000Z",
  },
  {
    id: "dip-brs",
    tag: "BRS",
    name: "Berserkers",
    type: "Ennemi",
    relationType: "enemy",
    mood: "Hostile",
    stance: "Kill event uniquement",
    notes: "Ne pas ouvrir de negociation sans admin.",
    createdByName: "NordicLeader",
    updatedByName: "NordicLeader",
    createdAt: "2026-06-09T15:35:00.000Z",
    updatedAt: "2026-06-26T19:00:00.000Z",
  },
];

export const coordinates = [
  {
    id: "coord-fort-est",
    label: "Forteresse Est",
    x: 560,
    y: 620,
    value: "X:560 Y:620",
    type: "Objectif",
    category: "Objectif",
    visibility: "members",
    relationId: "dip-sov",
    relationName: "Sovereign",
    notes: "Point sensible, poser shield avant reset.",
    createdByName: "FrostWarden",
    createdAt: "2026-06-22T16:00:00.000Z",
  },
  {
    id: "coord-ruche",
    label: "Ruche Aegis",
    x: 417,
    y: 388,
    value: "X:417 Y:388",
    type: "Defensif",
    category: "Defensif",
    visibility: "members",
    relationId: null,
    relationName: "",
    notes: "Coordonnee interne partageable aux membres.",
    createdByName: "NordicLeader",
    createdAt: "2026-06-21T11:30:00.000Z",
  },
  {
    id: "coord-frontiere-nap",
    label: "Frontiere NAP",
    x: 602,
    y: 585,
    value: "X:602 Y:585",
    type: "Diplomatie",
    category: "Diplomatie",
    visibility: "officers",
    relationId: "dip-wld",
    relationName: "Wild Legacy",
    notes: "Ne pas farmer au-dessus de la ligne sans feu vert.",
    createdByName: "ShieldMaiden",
    createdAt: "2026-06-25T09:45:00.000Z",
  },
];

export const napAgreements = [
  {
    id: "nap-wld-01",
    relationId: "dip-wld",
    relationName: "Wild Legacy",
    relationTag: "WLD",
    title: "NAP frontiere nord",
    terms: "Pas d'attaque hors KE, tiles reservees autour de la frontiere X602 Y585.",
    startsAt: "2026-06-20T00:00:00.000Z",
    endsAt: "2026-07-08T00:00:00.000Z",
    status: "active",
    createdByName: "NordicLeader",
    createdAt: "2026-06-20T09:00:00.000Z",
    updatedAt: "2026-06-29T14:25:00.000Z",
  },
  {
    id: "nap-vgr-archive",
    relationId: "dip-vgr",
    relationName: "Vanguard",
    relationTag: "VGR",
    title: "Treve Bear Hunt",
    terms: "Treve courte pendant preparation Bear Hunt.",
    startsAt: "2026-06-10T00:00:00.000Z",
    endsAt: "2026-06-18T00:00:00.000Z",
    status: "expired",
    createdByName: "ShieldMaiden",
    createdAt: "2026-06-10T08:00:00.000Z",
    updatedAt: "2026-06-18T00:05:00.000Z",
  },
];

export const diplomacyAuditLog = [
  {
    id: "audit-dip-1",
    action: "diplomacy.nap.updated",
    targetTable: "nap_agreements",
    targetId: "nap-wld-01",
    actorName: "ShieldMaiden",
    metadata: { title: "NAP frontiere nord", status: "active" },
    createdAt: "2026-06-29T14:25:00.000Z",
  },
  {
    id: "audit-dip-2",
    action: "diplomacy.coordinate.created",
    targetTable: "coordinates",
    targetId: "coord-frontiere-nap",
    actorName: "ShieldMaiden",
    metadata: { label: "Frontiere NAP", visibility: "officers" },
    createdAt: "2026-06-25T09:45:00.000Z",
  },
  {
    id: "audit-dip-3",
    action: "diplomacy.relation.updated",
    targetTable: "diplomacy_entries",
    targetId: "dip-sov",
    actorName: "FrostWarden",
    metadata: { relationType: "enemy", stance: "Rallyes repetes" },
    createdAt: "2026-07-01T07:20:00.000Z",
  },
];

export const bankResources = [
  { code: "meat", name: "Viande", amount: 12.4, unit: "M", updatedAt: "12:31" },
  { code: "wood", name: "Bois", amount: 9.8, unit: "M", updatedAt: "12:31" },
  { code: "stone", name: "Pierre", amount: 6.2, unit: "M", updatedAt: "11:48" },
  { code: "steel", name: "Acier", amount: 3.1, unit: "M", updatedAt: "10:05" },
  { code: "diamonds", name: "Diamants", amount: 32450, unit: "", updatedAt: "09:22" },
];

export const initialRequests = [
  {
    id: 1,
    member: "FrostWarden",
    resourceCode: "wood",
    resource: "Bois",
    amount: 100,
    unit: "M",
    reason: "War prep",
    status: "pending",
    state: "En attente",
    createdAt: "12:12",
  },
  {
    id: 2,
    member: "ShieldMaiden",
    resourceCode: "meat",
    resource: "Viande",
    amount: 50,
    unit: "M",
    reason: "Rally",
    status: "approved",
    state: "Approuvee",
    createdAt: "11:54",
  },
  {
    id: 3,
    member: "IceHammer",
    resourceCode: "stone",
    resource: "Pierre",
    amount: 20,
    unit: "M",
    reason: "Heal",
    status: "fulfilled",
    state: "Livree",
    createdAt: "10:40",
  },
];

export const bankMovements = [
  { id: "mov-1", time: "12:31", type: "out", resourceCode: "wood", resource: "Bois", amount: 75, unit: "M", actor: "Banquier", note: "Livraison FrostWarden" },
  { id: "mov-2", time: "11:48", type: "command", resourceCode: "summary", resource: "Commande", amount: 0, unit: "", actor: "R4 Team", note: "!banque executee" },
  { id: "mov-3", time: "10:05", type: "in", resourceCode: "steel", resource: "Acier", amount: 2.4, unit: "M", actor: "Depot alliance", note: "Depot banque" },
];

export const bankHistory = bankMovements.map((entry) => ({
  time: entry.time,
  text:
    entry.type === "command"
      ? `Commande ${entry.note.replace(" executee", "")} executee par ${entry.actor}`
      : `${entry.actor}: ${entry.type === "in" ? "+" : "-"}${entry.amount}${entry.unit} ${entry.resource}`,
}));

export const duplicateSuggestions = [
  { a: "SnowWolf", b: "SnowWolf_", powerA: "98.2M", powerB: "97.8M" },
  { a: "IceQueen", b: "IceQueen89", powerA: "87.5M", powerB: "86.9M" },
  { a: "NorthBlade", b: "North_Blade", powerA: "75.1M", powerB: "74.6M" },
];

export const forumThreads = [
  { title: "Plan Forteresse - semaine 18", author: "FrostWarden", replies: 12, locked: true },
  { title: "NAP S1287 : zones interdites", author: "ShieldMaiden", replies: 8, locked: false },
  { title: "Objectifs R3 avant dimanche", author: "NordicLeader", replies: 18, locked: false },
];

export const initialChat = [
  {
    id: 1,
    author: "[NFD] ArcticKing",
    source: "EN",
    text: "Rally in 5 min on Bear Trap.",
    translated: "Rassemblement dans 5 min sur Bear Trap.",
    public: true,
  },
  {
    id: 2,
    author: "[Aegis Nord] FrostWarden",
    source: "FR",
    text: "Go Aegis !",
    translated: "Go Aegis !",
    public: true,
  },
  {
    id: 3,
    author: "[VGR] Titan",
    source: "EN",
    text: "See you on battlefield.",
    translated: "On se retrouve sur le champ de bataille.",
    public: true,
  },
];

export const initialInternalMessages = [
  { id: 1, channel: "R4 Team", from: "NordicLeader", text: "Plan de guerre mis a jour.", unread: 3 },
  { id: 2, channel: "Officiers", from: "FrostWarden", text: "Merci a tous pour la presence.", unread: 2 },
  { id: 3, channel: "Annonces", from: "ShieldMaiden", text: "Bear Hunt demain matin 08:00 UTC.", unread: 1 },
];

export const initialSosAlerts = [
  {
    id: "sos-local-1",
    target: "Forteresse Est",
    targetLabel: "Forteresse Est",
    targetX: 560,
    targetY: 620,
    type: "Rallye",
    attackType: "Rallye",
    details: "Rallye en cours sur notre Forteresse ! Besoin de renforts immediats.",
    message: "Rallye en cours sur notre Forteresse ! Besoin de renforts immediats.",
    by: "FrostWarden",
    createdByName: "FrostWarden",
    status: "active",
    createdAt: "2026-07-01T16:31:00.000Z",
    acknowledgementSummary: {
      seen: 2,
      joining: 3,
      cannotJoin: 1,
      resolved: 0,
      total: 6,
    },
    acknowledgements: [
      { memberId: "frostwarden", memberName: "FrostWarden", response: "joining", responseLabel: "En route", acknowledgedAt: "2026-07-01T16:32:00.000Z" },
      { memberId: "shieldmaiden", memberName: "ShieldMaiden", response: "seen", responseLabel: "Vu", acknowledgedAt: "2026-07-01T16:33:00.000Z" },
    ],
    myAcknowledgement: null,
  },
];

export const initialSosForm = {
  target: "Forteresse Est",
  x: "560",
  y: "620",
  type: "Rallye",
  details: "Rallye en cours sur notre Forteresse ! Besoin de renforts immediats.",
};

export const authUser = {
  id: "nordicleader",
  displayName: "NordicLeader",
  email: "nordicleader@guildops.app",
  emailVerifiedAt: "2026-06-18T09:00:00.000Z",
  initials: "NL",
  role: "admin",
  roles: ["admin"],
  preferredLanguage: "FR",
};

export const guildOpsMockData = {
  authUser,
  enabledModules: getDefaultEnabledModuleIds(),
  guilds,
  events,
  members: initialMembers,
  diplomacyRows,
  napAgreements,
  coordinates,
  diplomacyAuditLog,
  bankRequests: initialRequests,
  bankResources,
  bankMovements,
  bankHistory,
  duplicateSuggestions,
  permissionRoles,
  forumThreads,
  publicChat: initialChat,
  internalMessages: initialInternalMessages,
  sosAlerts: initialSosAlerts,
  sosForm: initialSosForm,
  site: {
    published: false,
    url: "aegis-nord.guildops.app",
    name: "Aegis Nord",
    guildName: "Aegis Nord",
    game: "Whiteout Survival",
    realm: "S1287",
    tagline: "Unis. Focus. Victoire.",
    goal: "Coordonner les membres actifs, les wars et les consignes sans chaos.",
    objective: "Coordonner les membres actifs, les wars et les consignes sans chaos.",
    objectiveTag: "Operations",
    theme: "camp-nord",
    colors: {
      id: "cyan",
      accent: "#45d8f0",
      highlight: "#c8ff08",
      contrast: "#061015",
    },
    typography: {
      id: "inter",
      label: "Inter",
      fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
    },
    sections: defaultSiteSections,
  },
};
