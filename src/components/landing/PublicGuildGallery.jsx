import React, {
  useEffect,
  useMemo,
  useState
} from "react";
import {
  ArrowRight,
  Gamepad2,
  Globe2,
  Languages,
  Mail,
  Search,
  Server,
  Shield,
  Users
} from "lucide-react";
import {
  isApiConfigured
} from "../../lib/apiClient.js";
import {
  guildOpsApi
} from "../../lib/guildOpsApi.js";
import {
  listPublishedSites,
  slugify
} from "../../lib/guildSiteStore.js";

function normalizeGalleryImage(value) {
  const raw = typeof value === "object" && value ? value : { src: value };
  const src = String(raw.src || raw.url || raw.dataUrl || raw.data_url || "").trim();

  if (!src) return null;

  return {
    src,
    name: String(raw.name || raw.fileName || raw.file_name || "Image galerie").trim(),
  };
}

function getDirectoryGuildImage(guild = {}) {
  return normalizeGalleryImage(
    guild.galleryImage ||
      guild.gallery_image ||
      guild.heroImage ||
      guild.hero_image ||
      guild.themeJson?.heroImage ||
      guild.theme_json?.heroImage,
  );
}

function getGalleryImageStyle(image) {
  return image?.src ? { "--gallery-guild-image": `url(${JSON.stringify(image.src)})` } : {};
}

function normalizeDirectoryGuild(guild = {}) {
  const name = String(guild.name || guild.guildName || guild.guild_name || guild.title || "Guilde").trim();
  const publicSlug = slugify(guild.publicSlug || guild.public_slug || guild.slug || name);
  const galleryImage = getDirectoryGuildImage(guild);

  return {
    id: String(guild.id || publicSlug),
    name,
    tag: String(guild.tag || "").trim(),
    game: String(guild.game || "Jeu non renseigne").trim(),
    server: String(guild.server || guild.realm || "Serveur libre").trim(),
    language: String(guild.language || guild.defaultLanguage || guild.default_language || "FR").trim().toUpperCase(),
    playStyle: String(guild.playStyle || guild.play_style || guild.style || guild.objectiveTag || guild.objective_tag || "Operations").trim(),
    description: String(guild.description || guild.objective || guild.tagline || "").trim(),
    galleryImage,
    memberCount: Number(guild.memberCount || guild.member_count || 0),
    publicSlug,
    url: guild.url || `/g/${publicSlug}`,
    unreadCount: Number(guild.unreadCount || guild.unread_count || guild.unreadMessages || guild.unread_messages || 0),
  };
}

function getCachedDirectoryGuilds() {
  const directoryGuilds = new Map();

  listPublishedSites().map(normalizeDirectoryGuild).forEach((guild) => {
    directoryGuilds.set(guild.publicSlug, guild);
  });

  return sortDirectoryGuilds([...directoryGuilds.values()]);
}

function getUniqueValues(guilds, key) {
  return [...new Set(guilds.map((guild) => guild[key]).filter(Boolean))].sort((first, second) =>
    first.localeCompare(second, "fr"),
  );
}

function compareDirectoryGuilds(first, second) {
  return (
    first.game.localeCompare(second.game, "fr") ||
    first.server.localeCompare(second.server, "fr") ||
    first.language.localeCompare(second.language, "fr") ||
    first.name.localeCompare(second.name, "fr")
  );
}

function sortDirectoryGuilds(guilds) {
  return [...guilds].sort(compareDirectoryGuilds);
}

function formatGuildCount(count) {
  const safeCount = Number(count) || 0;
  return `${safeCount} ${safeCount > 1 ? "guildes" : "guilde"}`;
}

const WORLD_LANGUAGE_CODES = Object.freeze(
  "aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu".split(
    " ",
  ),
);
const WORLD_LANGUAGE_CODE_SET = new Set(WORLD_LANGUAGE_CODES.map((code) => code.toUpperCase()));
const languageDisplayNames =
  typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames(["fr"], { type: "language" })
    : null;

function formatLanguageName(code) {
  try {
    const label = languageDisplayNames?.of(code.toLowerCase()) || code.toUpperCase();
    return label ? label.charAt(0).toLocaleUpperCase("fr") + label.slice(1) : code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

const WORLD_LANGUAGE_OPTIONS = Object.freeze(
  WORLD_LANGUAGE_CODES.map((code) => {
    const normalizedCode = code.toUpperCase();
    const name = formatLanguageName(normalizedCode);
    const label = `${name} (${normalizedCode})`;

    return {
      code: normalizedCode,
      label,
      search: `${name} ${normalizedCode}`.toLowerCase(),
    };
  }),
);
const WORLD_LANGUAGE_LABELS = new Map(WORLD_LANGUAGE_OPTIONS.map((option) => [option.code, option.label]));

function normalizeLanguageCode(value) {
  return String(value || "").trim().toUpperCase();
}

function getLanguageTokens(value) {
  return normalizeLanguageCode(value)
    .split(/[^A-Z]+/)
    .filter(Boolean);
}

function getLanguageLabel(code) {
  const normalizedCode = normalizeLanguageCode(code);
  return WORLD_LANGUAGE_LABELS.get(normalizedCode) || normalizedCode;
}

function languageMatchesFilter(guildLanguage, selectedLanguage) {
  const normalizedLanguage = normalizeLanguageCode(selectedLanguage);
  if (!normalizedLanguage) return true;

  return getLanguageTokens(guildLanguage).includes(normalizedLanguage);
}

function groupGuilds(guilds) {
  const games = new Map();

  guilds.forEach((guild) => {
    const gameKey = guild.game || "Jeu non renseigne";
    const serverKey = guild.server || "Serveur libre";
    const languageKey = guild.language || "Langue libre";

    if (!games.has(gameKey)) games.set(gameKey, new Map());
    const servers = games.get(gameKey);
    if (!servers.has(serverKey)) servers.set(serverKey, new Map());
    const languages = servers.get(serverKey);
    if (!languages.has(languageKey)) languages.set(languageKey, []);
    languages.get(languageKey).push(guild);
  });

  return [...games.entries()].sort(([first], [second]) => first.localeCompare(second, "fr")).map(([game, servers]) => ({
    game,
    total: [...servers.values()].reduce(
      (sum, languages) => sum + [...languages.values()].reduce((count, items) => count + items.length, 0),
      0,
    ),
    servers: [...servers.entries()].sort(([first], [second]) => first.localeCompare(second, "fr")).map(([server, languages]) => ({
      server,
      total: [...languages.values()].reduce((sum, items) => sum + items.length, 0),
      languages: [...languages.entries()].sort(([first], [second]) => first.localeCompare(second, "fr")).map(([language, items]) => ({
        language,
        guilds: items.sort((first, second) => first.name.localeCompare(second.name, "fr")),
      })),
    })),
  }));
}

function navigatePublic(event, path, onNavigate) {
  if (
    !onNavigate ||
    event.defaultPrevented ||
    event.button !== 0 ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  ) {
    return;
  }

  event.preventDefault();
  onNavigate(path);
}

export function PublicGuildGallery({ onNavigate }) {
  const [guilds, setGuilds] = useState(() => getCachedDirectoryGuilds());
  const [status, setStatus] = useState(isApiConfigured() ? "loading" : "ready");
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    game: "",
    language: "",
    query: "",
    server: "",
  });
  const [languageSearch, setLanguageSearch] = useState("");
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);

  useEffect(() => {
    if (!isApiConfigured()) return undefined;

    const controller = new AbortController();
    setStatus("loading");

    guildOpsApi
      .listPublicGuildDirectory({ limit: 100 }, { signal: controller.signal })
      .then((payload) => {
        const nextGuilds = Array.isArray(payload?.guilds) ? payload.guilds.map(normalizeDirectoryGuild) : [];
        setGuilds(nextGuilds.length ? sortDirectoryGuilds(nextGuilds) : getCachedDirectoryGuilds());
        setError("");
        setStatus("ready");
      })
      .catch((requestError) => {
        if (controller.signal.aborted) return;
        const cachedGuilds = getCachedDirectoryGuilds();
        setGuilds(cachedGuilds);
        setError(cachedGuilds.length ? "" : requestError?.message || "Galerie momentanement inaccessible.");
        setStatus("ready");
      });

    return () => controller.abort();
  }, []);

  const games = useMemo(() => getUniqueValues(guilds, "game"), [guilds]);
  const guildsForServerOptions = useMemo(
    () => guilds.filter((guild) => !filters.game || guild.game === filters.game),
    [filters.game, guilds],
  );
  const servers = useMemo(() => getUniqueValues(guildsForServerOptions, "server"), [guildsForServerOptions]);
  const guildsForLanguageOptions = useMemo(
    () =>
      guildsForServerOptions.filter((guild) => !filters.server || guild.server === filters.server),
    [filters.server, guildsForServerOptions],
  );
  const availableLanguageCodes = useMemo(
    () =>
      new Set(
        guildsForLanguageOptions
          .flatMap((guild) => getLanguageTokens(guild.language))
          .filter((code) => WORLD_LANGUAGE_CODE_SET.has(code)),
      ),
    [guildsForLanguageOptions],
  );
  const languageOptions = useMemo(() => {
    const query = languageSearch.trim().toLowerCase();

    return WORLD_LANGUAGE_OPTIONS.filter((option) => !query || option.search.includes(query)).sort((first, second) => {
      if (!query) {
        const firstAvailable = availableLanguageCodes.has(first.code);
        const secondAvailable = availableLanguageCodes.has(second.code);
        if (firstAvailable !== secondAvailable) return firstAvailable ? -1 : 1;
      }

      return first.label.localeCompare(second.label, "fr");
    });
  }, [availableLanguageCodes, languageSearch]);
  const selectedLanguageLabel = filters.language ? getLanguageLabel(filters.language) : "Toutes les langues";
  const filteredGuilds = useMemo(() => {
    const query = filters.query.trim().toLowerCase();

    return guilds.filter((guild) => {
      const matchesGame = !filters.game || guild.game === filters.game;
      const matchesServer = !filters.server || guild.server === filters.server;
      const matchesLanguage = languageMatchesFilter(guild.language, filters.language);
      const matchesQuery =
        !query ||
        [guild.name, guild.tag, guild.game, guild.server, guild.language, guild.playStyle]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(query));

      return matchesGame && matchesServer && matchesLanguage && matchesQuery;
    });
  }, [filters, guilds]);
  const groupedGuilds = useMemo(() => groupGuilds(filteredGuilds), [filteredGuilds]);

  function updateFilter(key, value) {
    if (key === "game") {
      setLanguageSearch("");
      setLanguagePickerOpen(false);
      setFilters((current) => ({
        ...current,
        game: value,
        language: "",
        server: "",
      }));
      return;
    }

    if (key === "server") {
      setLanguageSearch("");
      setLanguagePickerOpen(false);
      setFilters((current) => ({
        ...current,
        language: "",
        server: value,
      }));
      return;
    }

    setFilters((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function selectLanguage(value) {
    updateFilter("language", value);
    setLanguageSearch("");
    setLanguagePickerOpen(false);
  }

  function resetFilters() {
    setLanguageSearch("");
    setLanguagePickerOpen(false);
    setFilters({
      game: "",
      language: "",
      query: "",
      server: "",
    });
  }

  return (
    <main className="landing-page guild-gallery-page">
      <header className="landing-nav gallery-nav">
        <button className="landing-brand" type="button" onClick={() => onNavigate?.("/")}>
          <span className="landing-brand-mark" aria-hidden="true">
            <Shield size={24} />
          </span>
          <span>GuildOps</span>
        </button>
        <nav aria-label="Navigation galerie">
          <button type="button" onClick={() => onNavigate?.("/")}>
            Accueil
          </button>
          <button type="button" onClick={resetFilters}>
            Toutes les guildes
          </button>
        </nav>
        <button className="landing-button primary nav-cta" type="button" onClick={() => onNavigate?.("/app")}>
          Publier
        </button>
      </header>

      <section className="guild-gallery-hero">
        <div>
          <h1>Galerie des guildes</h1>
          <p>Explore les guildes publiées par jeu, royaume ou serveur, puis langue de coordination.</p>
        </div>
        <dl className="guild-gallery-stats" aria-label="Statistiques galerie">
          <div>
            <dt>Guildes</dt>
            <dd>{guilds.length}</dd>
          </div>
          <div>
            <dt>Jeux</dt>
            <dd>{games.length}</dd>
          </div>
          <div>
            <dt>Langues</dt>
            <dd>{WORLD_LANGUAGE_OPTIONS.length}</dd>
          </div>
        </dl>
      </section>

      <section className="guild-gallery-controls" aria-label="Filtres galerie">
        <label className="gallery-search">
          <Search size={17} />
          <input
            value={filters.query}
            placeholder="Rechercher une guilde, un serveur, une langue..."
            onChange={(event) => updateFilter("query", event.target.value)}
          />
        </label>
        <label>
          <Gamepad2 size={17} />
          <select value={filters.game} onChange={(event) => updateFilter("game", event.target.value)}>
            <option value="">Tous les jeux</option>
            {games.map((game) => (
              <option key={game} value={game}>
                {game}
              </option>
            ))}
          </select>
        </label>
        <label>
          <Server size={17} />
          <select value={filters.server} onChange={(event) => updateFilter("server", event.target.value)}>
            <option value="">Tous les serveurs</option>
            {servers.map((server) => (
              <option key={server} value={server}>
                {server}
              </option>
            ))}
          </select>
        </label>
        <div
          className="gallery-language-filter"
          onKeyDown={(event) => {
            if (event.key === "Escape") setLanguagePickerOpen(false);
          }}
        >
          <Languages size={17} />
          <button
            type="button"
            className="gallery-language-trigger"
            aria-expanded={languagePickerOpen}
            aria-haspopup="listbox"
            onClick={() => {
              setLanguageSearch("");
              setLanguagePickerOpen((isOpen) => !isOpen);
            }}
          >
            {selectedLanguageLabel}
          </button>
          {languagePickerOpen ? (
            <div className="gallery-language-popover">
              <div className="gallery-language-search">
                <Search size={15} />
                <input
                  value={languageSearch}
                  placeholder="Rechercher une langue"
                  autoFocus
                  onChange={(event) => setLanguageSearch(event.target.value)}
                />
              </div>
              <div className="gallery-language-options" role="listbox" aria-label="Langues">
                <button
                  type="button"
                  className={`gallery-language-option${filters.language ? "" : " is-selected"}`}
                  role="option"
                  aria-selected={!filters.language}
                  onClick={() => selectLanguage("")}
                >
                  Toutes les langues
                </button>
                {languageOptions.map((option) => (
                  <button
                    type="button"
                    className={`gallery-language-option${filters.language === option.code ? " is-selected" : ""}`}
                    key={option.code}
                    role="option"
                    aria-selected={filters.language === option.code}
                    onClick={() => selectLanguage(option.code)}
                  >
                    {option.label}
                  </button>
                ))}
                {languageOptions.length ? null : (
                  <p className="gallery-language-empty">Aucune langue trouvée</p>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {error ? <p className="gallery-sync-note">{error} Affichage du cache local.</p> : null}
      {status === "loading" ? <p className="gallery-sync-note">Chargement des guildes...</p> : null}

      <section className="guild-gallery-results" aria-live="polite">
        {groupedGuilds.length ? (
          groupedGuilds.map((gameGroup) => (
            <article className="gallery-game-group" key={gameGroup.game}>
              <header>
                <span>
                  <Gamepad2 size={22} />
                  <strong>{gameGroup.game}</strong>
                </span>
                <em>{formatGuildCount(gameGroup.total)}</em>
              </header>
              <div className="gallery-server-groups">
                {gameGroup.servers.map((serverGroup) => (
                  <section className="gallery-server-group" key={`${gameGroup.game}-${serverGroup.server}`}>
                    <h2>
                      <Server size={18} />
                      {serverGroup.server}
                      <small>{formatGuildCount(serverGroup.total)}</small>
                    </h2>
                    {serverGroup.languages.map((languageGroup) => (
                      <div className="gallery-language-group" key={`${serverGroup.server}-${languageGroup.language}`}>
                        <h3>
                          <Globe2 size={16} />
                          {languageGroup.language}
                        </h3>
                        <div className="gallery-card-grid">
                          {languageGroup.guilds.map((guild) => (
                            <a
                              className="gallery-guild-card"
                              href={guild.url}
                              key={guild.id}
                              onClick={(event) => navigatePublic(event, guild.url, onNavigate)}
                            >
                              <span
                                className="gallery-guild-image"
                                style={getGalleryImageStyle(guild.galleryImage)}
                                aria-hidden="true"
                              />
                              <span className="gallery-guild-copy">
                                <strong>{guild.name}</strong>
                                <small>{guild.playStyle}</small>
                              </span>
                              <em className="gallery-guild-meta">
                                <Users size={14} />
                                {guild.memberCount || "Equipe"}
                              </em>
                              <span className="gallery-guild-mail" aria-label={`${guild.unreadCount} message${guild.unreadCount > 1 ? "s" : ""} non lu${guild.unreadCount > 1 ? "s" : ""}`}>
                                <Mail size={14} />
                                {guild.unreadCount}
                              </span>
                              <ArrowRight className="gallery-card-arrow" size={17} />
                            </a>
                          ))}
                        </div>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            </article>
          ))
        ) : (
          <div className="gallery-empty">
            <Shield size={34} />
            <h2>Aucune guilde trouvée</h2>
            <p>Modifie les filtres ou reviens quand de nouvelles guildes auront publié leur page.</p>
            <button type="button" onClick={resetFilters}>
              Réinitialiser
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
