import { defaultSiteSections, getDefaultEnabledModuleIds, getGuildOpsModule } from "../config/moduleRegistry.js";
import { normalizeRealmCodeForGame } from "../config/guildOpsConfig.js";

export const DEFAULT_SECTIONS = defaultSiteSections;
export const INVITE_ROUTE_PREFIX = "/join";
export const ACTIVE_INVITE_QUERY = "invite";

export const THEME_OPTIONS = [
  {
    id: "camp-nord",
    label: "Camp Nord",
    description: "Hero givré, lecture nette",
    overlay: "nord",
  },
  {
    id: "war-room",
    label: "War Room",
    description: "Contraste fort, esprit raid",
    overlay: "war",
  },
  {
    id: "royal-banner",
    label: "Bannière royale",
    description: "Prestige et diplomatie",
    overlay: "royal",
  },
];

export const COLOR_OPTIONS = [
  {
    id: "cyan",
    label: "Cyan",
    swatchClass: "cyan",
    accent: "#45d8f0",
    highlight: "#c8ff08",
    contrast: "#061015",
  },
  {
    id: "lime",
    label: "Lime",
    swatchClass: "lime",
    accent: "#c8ff08",
    highlight: "#54dfcc",
    contrast: "#071004",
  },
  {
    id: "rose",
    label: "Rose",
    swatchClass: "rose",
    accent: "#ff2e75",
    highlight: "#f5b638",
    contrast: "#12050b",
  },
  {
    id: "slate",
    label: "Ardoise",
    swatchClass: "slate",
    accent: "#78a9ff",
    highlight: "#eef3f7",
    contrast: "#071019",
  },
  {
    id: "white",
    label: "Clair",
    swatchClass: "white",
    accent: "#eef3f7",
    highlight: "#54dfcc",
    contrast: "#061015",
  },
];

export const TYPOGRAPHY_OPTIONS = [
  {
    id: "inter",
    label: "Inter",
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  {
    id: "orbitron",
    label: "Orbitron",
    fontFamily: 'Orbitron, Inter, ui-sans-serif, system-ui, "Segoe UI", sans-serif',
  },
];

export const DESIGN_OPTIONS = [
  {
    id: "immersive",
    label: "Immersif",
    description: "Plein ecran, cinematique",
    tone: "hero",
    tier: "free",
  },
  {
    id: "command",
    label: "Command Center",
    description: "Grille ops compacte",
    tone: "console",
    tier: "free",
  },
  {
    id: "editorial",
    label: "Codex",
    description: "Lore premium, sombre",
    tone: "editorial",
    tier: "free",
  },
  {
    id: "raid-board",
    label: "Raid Board",
    description: "Planning war vertical",
    tone: "raid-board",
    tier: "premium",
    productId: "template-raid-board",
    price: 39,
    sales: 27,
    files: 12,
    delivery: "Template builder instantané",
    license: "Usage guilde",
    shopDescription: "Un cockpit war-first avec calendrier, modules en timeline et appels d'action très visibles.",
    accent: "red",
  },
  {
    id: "alliance-atlas",
    label: "Alliance Atlas",
    description: "Carte diplomatique immersive",
    tone: "atlas",
    tier: "premium",
    productId: "template-alliance-atlas",
    price: 45,
    sales: 19,
    files: 14,
    delivery: "Template builder instantané",
    license: "Usage guilde",
    shopDescription: "Une page carte stratégique pour guildes orientées diplomatie, NAP, ennemis et coordonnées.",
    accent: "blue",
  },
  {
    id: "forge-terminal",
    label: "Forge Terminal",
    description: "Console ressources et ordres",
    tone: "forge-terminal",
    tier: "premium",
    productId: "template-forge-terminal",
    price: 35,
    sales: 34,
    files: 10,
    delivery: "Template builder instantané",
    license: "Usage guilde",
    shopDescription: "Un terminal gamer dense pour guildes qui gèrent banque, demandes, logs et consignes rapides.",
    accent: "amber",
  },
  {
    id: "citadel-luxe",
    label: "Citadel Luxe",
    description: "Vitrine prestige R5",
    tone: "citadel",
    tier: "premium",
    productId: "template-citadel-luxe",
    price: 49,
    sales: 16,
    files: 16,
    delivery: "Template builder instantané",
    license: "Usage guilde",
    shopDescription: "Une vitrine sombre et premium pour guildes sélectives qui veulent inspirer confiance.",
    accent: "violet",
  },
];

const STORAGE_KEY = "guildops:guild-sites:v1";
const PURCHASED_DESIGNS_STORAGE_KEY = "guildops:purchased-designs:v1";
export const FREE_DESIGN_IDS = Object.freeze(DESIGN_OPTIONS.filter((option) => option.tier !== "premium").map((option) => option.id));
const DEFAULT_OBJECTIVE = "Coordonner les membres actifs, les wars et les consignes sans chaos.";
const DEFAULT_OBJECTIVE_TAG = "Operations";
const OPERATIONAL_SECTION_KEYS = Object.freeze(["wars", "bank", "diplomacy", "forum"]);

function normalizeEnabledModules(value) {
  const defaults = getDefaultEnabledModuleIds();
  const moduleIds = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\s,|]+/)
      : [];
  const next = new Set(defaults);

  moduleIds.forEach((moduleId) => {
    if (getGuildOpsModule(moduleId)) {
      next.add(moduleId);
    }
  });

  return [...next];
}

export function createGuildSiteDraft(guild = {}, rawSite = {}) {
  const site = unwrapSite(rawSite);
  const guildName = stringValue(site.guildName || site.guild_name || site.name || site.title || guild.name, "Aegis Nord");
  const slug = slugify(site.publicSlug || site.public_slug || site.slug || guildName);
  const inviteToken =
    normalizeInviteToken(site.inviteToken || site.invite_token || site.pages?.inviteToken || site.pagesJson?.inviteToken || site.pages_json?.inviteToken) ||
    getMemberInviteToken(site.memberInviteUrl || site.member_invite_url || site.pages?.memberInviteUrl || site.pagesJson?.memberInviteUrl || site.pages_json?.memberInviteUrl) ||
    createMemberInviteToken();
  const memberInviteUrl = buildMemberInvitePath(slug, inviteToken);
  const game = stringValue(site.game || guild.game || guild.primaryGame || guild.primary_game, "Whiteout Survival");
  const realm = normalizeRealmCodeForGame(
    site.realm || site.server || guild.realm || guild.server || guild.serverCode || guild.server_code,
    game,
  );
  const objective = normalizeObjective(
    site.objective || site.pages?.objective || site.pagesJson?.objective || site.pages_json?.objective || site.goal || site.heroText || site.hero_text,
  );
  const sections = normalizeSections(
    site.sections || site.sectionsJson || site.sections_json || site.pages?.sections || site.pagesJson?.sections || site.pages_json?.sections,
  );

  return {
    guildId: stringValue(site.guildId || site.guild_id || guild.id || resolveGuildId(guild), resolveGuildId(guild)),
    guildName,
    game,
    realm,
    tagline: stringValue(
      site.tagline || site.pages?.tagline || site.pagesJson?.tagline || site.pages_json?.tagline || site.heroSubtitle || site.hero_subtitle,
      "Unis. Focus. Victoire.",
    ),
    objective,
    objectiveTag: normalizeObjectiveTag(site.objectiveTag || site.objective_tag || site.playStyle || site.play_style),
    inviteToken,
    inviteRotatedAt: site.inviteRotatedAt || site.invite_rotated_at || site.pages?.inviteRotatedAt || site.pagesJson?.inviteRotatedAt || site.pages_json?.inviteRotatedAt || null,
    memberInviteUrl,
    theme: getThemeOption(site.theme?.theme || site.theme || site.themeJson?.theme || site.theme_json?.theme).id,
    design: getDesignOption(
      site.design ||
        site.layout ||
        site.pages?.design ||
        site.pagesJson?.design ||
        site.pages_json?.design ||
        site.theme?.design ||
        site.themeJson?.design ||
        site.theme_json?.design,
    ).id,
    heroImage: normalizeHeroImage(
      site.heroImage || site.hero_image || site.theme?.heroImage || site.themeJson?.heroImage || site.theme_json?.heroImage,
    ),
    colors: normalizeColors(
      site.colors || site.colorsJson || site.colors_json || site.theme?.colors || site.themeJson?.colors || site.theme_json?.colors,
    ),
    typography: normalizeTypography(
      site.typography ||
        site.typographyJson ||
        site.typography_json ||
        site.theme?.typography ||
        site.themeJson?.typography ||
        site.theme_json?.typography,
    ),
    sections,
    publicEvents: normalizePublicEventsSnapshot(
      site.publicEvents || site.public_events || site.wars || site.publicWars || site.eventsPublic,
    ),
    publicDiplomacy: normalizePublicDiplomacySnapshot(
      site.publicDiplomacy || site.public_diplomacy || site.diplomacyPublic || site.diplomacy_public,
    ),
    publicForum: normalizePublicForumSnapshot(
      site.publicForum || site.public_forum || site.forumPublic || site.forum_public,
    ),
    enabledModules: normalizeEnabledModules(site.enabledModules || site.enabled_modules || site.modules || site.modulesJson || site.modules_json),
    slug,
    published: Boolean(site.published || site.status === "published"),
    status: site.status || (site.published ? "published" : "draft"),
    publishedAt: site.publishedAt || site.published_at || null,
  };
}

export function buildGuildSitePayload(draft, guild = {}) {
  const normalized = createGuildSiteDraft(guild, draft);
  const now = new Date().toISOString();
  const title = normalized.guildName.trim() || "Guilde sans nom";
  const slug = slugify(title);
  const seoDescription = [normalized.tagline, normalized.objective].filter(Boolean).join(" ");
  const inviteToken = normalizeInviteToken(normalized.inviteToken) || createMemberInviteToken();
  const memberInviteUrl = buildMemberInvitePath(slug, inviteToken);

  return {
    guildId: normalized.guildId,
    guild_id: normalized.guildId,
    publicSlug: slug,
    public_slug: slug,
    title,
    guildName: title,
    guild_name: title,
    game: normalized.game.trim(),
    realm: normalized.realm.trim(),
    tagline: normalized.tagline.trim(),
    objective: normalized.objective.trim(),
    heroText: normalized.objective.trim(),
    hero_text: normalized.objective.trim(),
    inviteToken,
    invite_token: inviteToken,
    inviteRotatedAt: normalized.inviteRotatedAt,
    invite_rotated_at: normalized.inviteRotatedAt,
    memberInviteUrl,
    member_invite_url: memberInviteUrl,
    theme: normalized.theme,
    design: normalized.design,
    heroImage: normalized.heroImage,
    hero_image: normalized.heroImage,
    colors: normalized.colors,
    colors_json: normalized.colors,
    typography: normalized.typography,
    typography_json: normalized.typography,
    sections: normalized.sections,
    sections_json: normalized.sections,
    publicEvents: normalized.publicEvents,
    public_events: normalized.publicEvents,
    publicDiplomacy: normalized.publicDiplomacy,
    public_diplomacy: normalized.publicDiplomacy,
    publicForum: normalized.publicForum,
    public_forum: normalized.publicForum,
    enabledModules: normalized.enabledModules,
    enabled_modules: normalized.enabledModules,
    status: "published",
    published: true,
    publishedAt: now,
    published_at: now,
    themeJson: {
      theme: normalized.theme,
      design: normalized.design,
      heroImage: normalized.heroImage,
      colors: normalized.colors,
      typography: normalized.typography,
    },
    theme_json: {
      theme: normalized.theme,
      design: normalized.design,
      heroImage: normalized.heroImage,
      colors: normalized.colors,
      typography: normalized.typography,
    },
    pagesJson: {
      tagline: normalized.tagline.trim(),
      objective: normalized.objective.trim(),
      inviteToken,
      inviteRotatedAt: normalized.inviteRotatedAt,
      memberInviteUrl,
      member_invite_url: memberInviteUrl,
      design: normalized.design,
      sections: normalized.sections,
    },
    pages_json: {
      tagline: normalized.tagline.trim(),
      objective: normalized.objective.trim(),
      inviteToken,
      inviteRotatedAt: normalized.inviteRotatedAt,
      memberInviteUrl,
      member_invite_url: memberInviteUrl,
      design: normalized.design,
      sections: normalized.sections,
    },
    seoJson: {
      title: `${title} - ${normalized.game} ${normalized.realm}`.trim(),
      description: seoDescription,
    },
    seo_json: {
      title: `${title} - ${normalized.game} ${normalized.realm}`.trim(),
      description: seoDescription,
    },
  };
}

export function savePublishedSite(site) {
  if (!canUseStorage()) return normalizePublishedSite(site);

  const normalized = normalizePublishedSite(site);
  const sites = readSites();
  sites[normalized.slug] = normalized;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sites));
  return normalized;
}

export function loadPublishedSite(slug) {
  if (!canUseStorage()) return null;
  return readSites()[slugify(slug)] || null;
}

export function listPublishedSites() {
  if (!canUseStorage()) return [];
  return Object.values(readSites()).map(normalizePublishedSite);
}

export function normalizePublishedSite(site) {
  const raw = unwrapSite(site);
  const draft = createGuildSiteDraft({}, raw);
  const publicSlug = slugify(raw.publicSlug || raw.public_slug || raw.slug || draft.guildName);

  return {
    ...draft,
    id: raw.id || draft.slug,
    slug: publicSlug,
    publicSlug,
    title: raw.title || draft.guildName,
    heroImage: normalizeHeroImage(raw.heroImage || raw.hero_image || draft.heroImage),
    inviteToken: draft.inviteToken,
    inviteRotatedAt: draft.inviteRotatedAt,
    memberInviteUrl: buildMemberInvitePath(publicSlug, draft.inviteToken),
    members: Array.isArray(raw.members) ? raw.members : [],
    publicDiplomacy: normalizePublicDiplomacySnapshot(raw.publicDiplomacy || raw.public_diplomacy || draft.publicDiplomacy),
    publicForum: normalizePublicForumSnapshot(raw.publicForum || raw.public_forum || draft.publicForum),
    enabledModules: normalizeEnabledModules(raw.enabledModules || raw.enabled_modules || draft.enabledModules),
    status: raw.status || "published",
    published: raw.published ?? true,
    publishedAt: raw.publishedAt || raw.published_at || draft.publishedAt || new Date().toISOString(),
  };
}

export function getColorOption(value) {
  const id = typeof value === "string" ? value : value?.id;
  return COLOR_OPTIONS.find((option) => option.id === id) || COLOR_OPTIONS[0];
}

export function getThemeOption(value) {
  const id = typeof value === "string" ? value : value?.id;
  return THEME_OPTIONS.find((option) => option.id === id) || THEME_OPTIONS[0];
}

export function getTypographyOption(value) {
  const id = typeof value === "string" ? value : value?.id;
  return TYPOGRAPHY_OPTIONS.find((option) => option.id === id) || TYPOGRAPHY_OPTIONS[0];
}

export function getDesignOption(value) {
  const id = typeof value === "string" ? value : value?.id;
  return DESIGN_OPTIONS.find((option) => option.id === id) || DESIGN_OPTIONS[0];
}

export function getPremiumDesignOptions() {
  return DESIGN_OPTIONS.filter((option) => option.tier === "premium");
}

export function getAvailableDesignOptions(purchasedDesignIds = []) {
  const purchasedSet = new Set(Array.isArray(purchasedDesignIds) ? purchasedDesignIds : []);

  return DESIGN_OPTIONS.filter((option) => option.tier !== "premium" || purchasedSet.has(option.id));
}

export function isDesignOptionUnlocked(value, purchasedDesignIds = []) {
  const option = getDesignOption(value);
  return option.tier !== "premium" || purchasedDesignIds.includes(option.id);
}

export function loadPurchasedDesignIds() {
  if (!canUseStorage()) return [];

  try {
    const ids = JSON.parse(window.localStorage.getItem(PURCHASED_DESIGNS_STORAGE_KEY) || "[]");
    return normalizePurchasedDesignIds(ids);
  } catch {
    return [];
  }
}

export function savePurchasedDesignIds(designIds = []) {
  const normalized = normalizePurchasedDesignIds(designIds);

  if (canUseStorage()) {
    window.localStorage.setItem(PURCHASED_DESIGNS_STORAGE_KEY, JSON.stringify(normalized));
  }

  return normalized;
}

export function unlockDesignOption(value, purchasedDesignIds = loadPurchasedDesignIds()) {
  const option = getDesignOption(value);
  if (option.tier !== "premium") return normalizePurchasedDesignIds(purchasedDesignIds);

  return savePurchasedDesignIds([...purchasedDesignIds, option.id]);
}

export function normalizeSections(value = {}) {
  const rawSections = typeof value === "object" && value ? value : {};
  const normalized = {};

  Object.keys(DEFAULT_SECTIONS).forEach((key) => {
    normalized[key] = Boolean(rawSections[key] ?? DEFAULT_SECTIONS[key]);
  });

  return normalized;
}

export function slugify(value) {
  const slug = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "guilde";
}

export function resolveGuildId(guild = {}) {
  return stringValue(guild.id || guild.slug || `${guild.name || "aegis-nord"}-${guild.realm || "s1287"}`, "aegis-nord-s1287");
}

export function buildMemberInvitePath(slug, token = createMemberInviteToken()) {
  return `${INVITE_ROUTE_PREFIX}/${slugify(slug)}?${ACTIVE_INVITE_QUERY}=${encodeURIComponent(normalizeInviteToken(token) || createMemberInviteToken())}`;
}

export function buildMemberRequestPath(slug) {
  return `${INVITE_ROUTE_PREFIX}/${slugify(slug)}`;
}

export function createMemberInviteToken() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
}

export function getMemberInviteToken(value) {
  const raw = stringValue(value, "");
  if (!raw) return "";

  try {
    const url = new URL(raw, "https://guildops.local");
    return normalizeInviteToken(url.searchParams.get(ACTIVE_INVITE_QUERY));
  } catch {
    return "";
  }
}

function normalizeColors(value) {
  const option = getColorOption(value);
  return {
    id: option.id,
    accent: value?.accent || option.accent,
    highlight: value?.highlight || option.highlight,
    contrast: value?.contrast || option.contrast,
  };
}

function normalizeTypography(value) {
  const option = getTypographyOption(value);
  return {
    id: option.id,
    label: option.label,
    fontFamily: value?.fontFamily || value?.font_family || option.fontFamily,
  };
}

function normalizeHeroImage(value) {
  const raw = typeof value === "object" && value ? value : { src: value };
  const src = stringValue(raw.src || raw.url || raw.dataUrl || raw.data_url, "");

  if (!src) return null;

  return {
    src,
    name: stringValue(raw.name || raw.fileName || raw.file_name, "Image personnalisée"),
    size: numberValue(raw.size || raw.bytes, 0),
  };
}

function normalizeMemberInviteUrl(value) {
  const raw = stringValue(value, "").replace(/\s+/g, "");
  if (!raw) return "";
  if (raw.startsWith("/")) return raw.slice(0, 240);

  const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;

  try {
    const url = new URL(withProtocol);
    return ["http:", "https:"].includes(url.protocol) ? url.href.slice(0, 240) : "";
  } catch {
    return raw.slice(0, 240);
  }
}

function normalizeInviteToken(value) {
  const token = stringValue(value, "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 96);
  return token && token !== "active" ? token : "";
}

function normalizePublicEventsSnapshot(value = {}) {
  const raw = typeof value === "object" && value ? value : {};
  const events = normalizePublicEventsList(raw.events || raw.upcomingEvents || raw.upcoming_events);
  const nextEvent = normalizePublicEvent(raw.nextEvent || raw.next_event) || events[0] || null;

  return {
    nextEvent,
    events,
    weeklyObjectives: normalizePublicWeeklyObjectives(raw.weeklyObjectives || raw.weekly_objectives),
  };
}

function normalizePublicDiplomacySnapshot(value = {}) {
  const raw = typeof value === "object" && value ? value : {};

  return {
    relations: normalizePublicDiplomacyList(raw.relations || raw.alliances),
    napAgreements: normalizePublicDiplomacyList(raw.napAgreements || raw.nap_agreements || raw.naps),
    coordinates: normalizePublicDiplomacyList(raw.coordinates || raw.coords),
    privacy: typeof raw.privacy === "object" && raw.privacy ? raw.privacy : {},
  };
}

function normalizePublicForumSnapshot(value = {}) {
  const raw = typeof value === "object" && value ? value : {};
  const categories = normalizePublicForumCategoryList(raw.categories || raw.publicCategories || raw.public_categories);
  const threads = normalizePublicForumThreadList(raw.threads || raw.latestThreads || raw.latest_threads);

  return {
    configured: Boolean(raw.configured || categories.length || threads.length),
    categories,
    threads,
    latestThreads: normalizePublicForumThreadList(raw.latestThreads || raw.latest_threads || threads),
    locked: normalizePublicForumLockedState(raw.locked || raw.lockedState || raw.locked_state),
  };
}

function normalizePublicDiplomacyList(value) {
  return Array.isArray(value)
    ? value
        .filter((entry) => typeof entry === "object" && entry)
        .map((entry) => ({ ...entry }))
    : [];
}

function normalizePublicForumCategoryList(value) {
  return Array.isArray(value)
    ? value
        .filter((category) => typeof category === "object" && category)
        .map(normalizePublicForumCategory)
        .filter(Boolean)
    : [];
}

function normalizePublicForumThreadList(value) {
  return Array.isArray(value)
    ? value
        .filter((thread) => typeof thread === "object" && thread)
        .map(normalizePublicForumThread)
        .filter(Boolean)
    : [];
}

function normalizePublicEventsList(value) {
  return Array.isArray(value) ? value.map(normalizePublicEvent).filter(Boolean) : [];
}

function normalizePublicForumCategory(category = {}) {
  const name = stringValue(category.name || category.title, "");
  if (!name) return null;

  return {
    id: stringValue(category.id || slugify(name), slugify(name)),
    name,
    description: stringValue(category.description || category.summary, ""),
    threadCount: numberValue(category.threadCount ?? category.thread_count, 0),
    postCount: numberValue(category.postCount ?? category.post_count, 0),
    lastPostAt: category.lastPostAt || category.last_post_at || null,
    visibility: "public",
  };
}

function normalizePublicForumThread(thread = {}) {
  const title = stringValue(thread.title || thread.subject, "");
  if (!title) return null;

  return {
    id: stringValue(thread.id || slugify(title), slugify(title)),
    categoryId: stringValue(thread.categoryId || thread.category_id, ""),
    categoryName: stringValue(thread.categoryName || thread.category_name || thread.category?.name, "Annonce"),
    authorName: stringValue(thread.authorName || thread.author_name || thread.author, "Membre"),
    title,
    preview: stringValue(thread.preview || thread.excerpt || thread.body, ""),
    pinned: Boolean(thread.pinned || thread.pinnedAt || thread.pinned_at),
    locked: Boolean(thread.locked || thread.lockedAt || thread.locked_at),
    replyCount: numberValue(thread.replyCount ?? thread.reply_count ?? thread.replies, 0),
    postCount: numberValue(thread.postCount ?? thread.post_count, 1),
    lastPostAt: thread.lastPostAt || thread.last_post_at || thread.createdAt || thread.created_at || null,
    createdAt: thread.createdAt || thread.created_at || null,
    visibility: "public",
  };
}

function normalizePublicForumLockedState(value = {}) {
  const raw = typeof value === "object" && value ? value : {};

  return {
    privateCategoryCount: numberValue(raw.privateCategoryCount ?? raw.private_category_count, 0),
    privateThreadCount: numberValue(raw.privateThreadCount ?? raw.private_thread_count, 0),
    note: stringValue(raw.note, "Les espaces membres, officiers et admins restent verrouilles."),
  };
}

function normalizePublicEvent(event = {}) {
  if (!event || typeof event !== "object") return null;

  const startsAt = event.startsAt || event.starts_at || "";
  const title = stringValue(event.title || event.label, "");

  if (!title && !startsAt && !event.time) return null;

  return {
    id: stringValue(event.id || `${title || "event"}-${startsAt || event.time}`, ""),
    title,
    label: title,
    eventType: stringValue(event.eventType || event.event_type || event.type, "event"),
    type: stringValue(event.eventType || event.event_type || event.type, "event"),
    startsAt,
    endsAt: event.endsAt || event.ends_at || null,
    time: stringValue(event.time, ""),
    realm: stringValue(event.realm || event.server || event.serverCode || event.server_code, ""),
    status: stringValue(event.status, ""),
  };
}

function normalizePublicWeeklyObjectives(value = {}) {
  const raw = typeof value === "object" && value ? value : {};
  const objectives = Array.isArray(raw.objectives)
    ? raw.objectives.map(normalizePublicObjective).filter(Boolean)
    : [];
  const total = numberValue(raw.total, objectives.length);
  const done = numberValue(
    raw.done,
    objectives.filter((objective) => objective.status === "done").length,
  );

  return {
    weekStart: raw.weekStart || raw.week_start || null,
    weekEnd: raw.weekEnd || raw.week_end || null,
    total,
    done,
    completionRate: numberValue(raw.completionRate || raw.completion_rate, total ? done / total : 0),
    objectives,
  };
}

function normalizePublicObjective(objective = {}) {
  if (!objective || typeof objective !== "object") return null;

  const title = stringValue(objective.title || objective.label, "");
  if (!title) return null;

  return {
    id: stringValue(objective.id || title, title),
    title,
    status: stringValue(objective.status, "open"),
    dueAt: objective.dueAt || objective.due_at || null,
    eventTitle: stringValue(objective.eventTitle || objective.event_title, ""),
  };
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function unwrapSite(value) {
  const data = value?.data;

  if (data?.site || data?.guildSite || data?.guild) {
    return data.site || data.guildSite || data.guild;
  }

  if (value?.site || value?.guildSite) {
    return value.site || value.guildSite;
  }

  if (isEnvelopeWithGuild(value)) {
    return value.guild;
  }

  return data || value || {};
}

function isEnvelopeWithGuild(value) {
  if (!value?.guild || typeof value.guild !== "object") return false;

  const keys = Object.keys(value).filter((key) => value[key] !== undefined);
  return keys.every((key) => ["guild", "meta", "links"].includes(key));
}

function readSites() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function normalizePurchasedDesignIds(designIds = []) {
  const premiumIds = new Set(getPremiumDesignOptions().map((option) => option.id));

  return [...new Set(Array.isArray(designIds) ? designIds : [])].filter((id) => premiumIds.has(id));
}

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function stringValue(value, fallback) {
  return String(value || fallback || "").trim();
}

function normalizeObjective(value) {
  return stringValue(value, DEFAULT_OBJECTIVE);
}

function normalizeObjectiveTag(value) {
  return stringValue(value, DEFAULT_OBJECTIVE_TAG);
}
