import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  CircleHelp,
  Globe2,
  Mail,
  Menu,
  Plus,
  Rocket,
  Search,
  X
} from "lucide-react";
import {
  getGuardProps,
  getRoleLabel
} from "../../../lib/rbac.js";
import {
  getGuildOpsMobileNavItems,
  getGuildOpsModuleByView,
  getGuildOpsNavItems
} from "../../../config/moduleRegistry.js";
import {
  getGuildKey
} from "../../../lib/guildOpsTransforms.js";

const REALM_CLOCK_STORAGE_KEY = "guildops.realmClock.timeZone";
const DEFAULT_TIME_ZONE = "UTC";
const REALM_CLOCK_TIME_ZONES = [
  { value: "UTC", label: "UTC" },
  { value: "Europe/Paris", label: "Paris" },
  { value: "Europe/London", label: "Londres" },
  { value: "Europe/Berlin", label: "Berlin" },
  { value: "Europe/Moscow", label: "Moscou" },
  { value: "America/New_York", label: "New York" },
  { value: "America/Chicago", label: "Chicago" },
  { value: "America/Los_Angeles", label: "Los Angeles" },
  { value: "America/Sao_Paulo", label: "Sao Paulo" },
  { value: "Africa/Casablanca", label: "Casablanca" },
  { value: "Africa/Cairo", label: "Le Caire" },
  { value: "Asia/Dubai", label: "Dubai" },
  { value: "Asia/Kolkata", label: "Inde" },
  { value: "Asia/Bangkok", label: "Bangkok" },
  { value: "Asia/Singapore", label: "Singapour" },
  { value: "Asia/Shanghai", label: "Shanghai" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Australia/Sydney", label: "Sydney" }
];

function isNavItemActive(item, activeView) {
  if (activeView === item.id) return true;

  const activeModule = getGuildOpsModuleByView(activeView);
  return Boolean(item.moduleId && activeModule?.id === item.moduleId);
}

function getSupportedTimeZone(timeZone) {
  if (!timeZone || typeof timeZone !== "string") return "";

  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return "";
  }
}

function getBrowserTimeZone() {
  if (typeof Intl === "undefined") return DEFAULT_TIME_ZONE;

  return getSupportedTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone) || DEFAULT_TIME_ZONE;
}

function getStoredRealmClockTimeZone() {
  if (typeof window === "undefined") return "";

  try {
    return getSupportedTimeZone(window.localStorage.getItem(REALM_CLOCK_STORAGE_KEY));
  } catch {
    return "";
  }
}

function saveRealmClockTimeZone(timeZone) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(REALM_CLOCK_STORAGE_KEY, timeZone);
  } catch {
    // The clock still works if localStorage is unavailable.
  }
}

function getTimeZoneDisplayName(timeZone) {
  return timeZone.replace(/_/g, " ").replace(/\//g, " / ");
}

function getRealmClockTimeZoneOptions(currentTimeZone, guildTimeZone, browserTimeZone) {
  const options = [...REALM_CLOCK_TIME_ZONES];

  [guildTimeZone, browserTimeZone, currentTimeZone].forEach((timeZone) => {
    if (!timeZone || options.some((option) => option.value === timeZone)) return;
    options.push({ value: timeZone, label: getTimeZoneDisplayName(timeZone) });
  });

  return options;
}

function formatRealmClockTime(date, timeZone) {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: DEFAULT_TIME_ZONE
    }).format(date);
  }
}

function formatRealmClockZone(date, timeZone) {
  for (const timeZoneName of ["shortOffset", "short"]) {
    try {
      const zonePart = new Intl.DateTimeFormat("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone,
        timeZoneName
      }).formatToParts(date).find((part) => part.type === "timeZoneName");

      if (zonePart?.value) return zonePart.value;
    } catch {
      // Try the next supported format.
    }
  }

  return timeZone === DEFAULT_TIME_ZONE ? DEFAULT_TIME_ZONE : timeZone.split("/").pop().replace(/_/g, " ");
}

function RealmClock({ selectedGuild }) {
  const guildTimeZone = getSupportedTimeZone(selectedGuild?.timezone || selectedGuild?.timeZone);
  const browserTimeZone = useMemo(() => getBrowserTimeZone(), []);
  const [now, setNow] = useState(() => new Date());
  const [timeZoneState, setTimeZoneState] = useState(() => {
    const storedTimeZone = getStoredRealmClockTimeZone();

    if (storedTimeZone) return { source: "user", timeZone: storedTimeZone };
    if (guildTimeZone) return { source: "guild", timeZone: guildTimeZone };
    return { source: "browser", timeZone: browserTimeZone };
  });
  const { source: timeZoneSource, timeZone } = timeZoneState;
  const timeZoneOptions = useMemo(
    () => getRealmClockTimeZoneOptions(timeZone, guildTimeZone, browserTimeZone),
    [browserTimeZone, guildTimeZone, timeZone]
  );
  const formattedTime = formatRealmClockTime(now, timeZone);
  const formattedZone = formatRealmClockZone(now, timeZone);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (timeZoneSource === "user" || !guildTimeZone) return;

    setTimeZoneState((currentState) => (
      currentState.source === "user" || currentState.timeZone === guildTimeZone
        ? currentState
        : { source: "guild", timeZone: guildTimeZone }
    ));
  }, [guildTimeZone, timeZoneSource]);

  function handleTimeZoneChange(event) {
    const nextTimeZone = getSupportedTimeZone(event.target.value) || DEFAULT_TIME_ZONE;

    setTimeZoneState({ source: "user", timeZone: nextTimeZone });
    saveRealmClockTimeZone(nextTimeZone);
    setNow(new Date());
  }

  return (
    <div className="realm-clock">
      <span>Heure du royaume</span>
      <strong aria-label={`${formattedTime} ${formattedZone}`}>
        <span>{formattedTime}</span>
        <small>{formattedZone}</small>
      </strong>
      <label className="realm-clock-zone-picker">
        <span>Fuseau horaire</span>
        <select
          aria-label="Choisir le fuseau horaire du royaume"
          value={timeZone}
          onChange={handleTimeZoneChange}
        >
          {timeZoneOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label} ({option.value})
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function GuildShieldMark({ small = false }) {
  return (
    <svg className={`guild-shield-art${small ? " is-small" : ""}`} viewBox="0 0 72 82" aria-hidden="true" focusable="false">
      <path className="guild-shield-shadow" d="M36 3l27 10v37L36 79 9 50V13L36 3Z" />
      <path className="guild-shield-frame" d="M36 8l22 8v31L36 72 14 47V16l22-8Z" />
      <path className="guild-shield-face" d="M36 16l15 6v21L36 62 21 43V22l15-6Z" />
      <path className="guild-shield-sigil" d="M25 29l11-6 11 6v13l-11 10-11-10V29Z" />
      <path className="guild-shield-line" d="M36 24v27M28 34h16M31 43h10" />
    </svg>
  );
}

export function Sidebar({
  activeView,
  guilds: availableGuilds,
  navItems = getGuildOpsNavItems(),
  onGuildChange,
  onNavigate,
  selectedGuild,
  unreadMessages = 0
}) {
  const selectedGuildKey = getGuildKey(selectedGuild);

  return (
    <aside className="sidebar">
      <div className="brand-lockup">
        <div className="brand-mark">
          <GuildShieldMark />
        </div>
        <span>GuildOps</span>
      </div>
      <nav className="side-nav" aria-label="Navigation principale">
        {navItems.map((item) => {
          const badge = item.id === "messages" ? unreadMessages : item.badge;
          const isActive = isNavItemActive(item, activeView);

          return (
            <button
              key={item.id}
              className={`nav-item ${isActive ? "is-active" : ""} ${item.disabled ? "is-disabled" : ""}`}
              type="button"
              disabled={item.disabled}
              onClick={() => onNavigate(item.id)}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
              {badge ? <span className="badge-dot">{badge}</span> : null}
            </button>
          );
        })}
      </nav>
      <RealmClock selectedGuild={selectedGuild} />
      <div className="guild-switcher">
        <p className="section-label">Multi-guildes / mondes</p>
        {availableGuilds.map((guild) => (
          <button
            key={getGuildKey(guild)}
            type="button"
            className={`guild-row ${selectedGuildKey === getGuildKey(guild) ? "is-selected" : ""}`}
            onClick={() => onGuildChange(guild)}
          >
            <GuildShieldMark small />
            <span>{guild.name}</span>
            <small>{guild.realm}</small>
            <i aria-label={guild.status === "online" ? "En ligne" : "Calme"} />
          </button>
        ))}
        <button className="secondary-full" type="button">
          <Plus size={16} />
          Ajouter une guilde
        </button>
      </div>
    </aside>
  );
}

export function MobileHeader({ selectedGuild, activeView, navItems = getGuildOpsNavItems(), onNavigate, onOpenMessages, unreadMessages = 0 }) {
  const displayGuild = selectedGuild || {};

  return (
    <header className="mobile-header">
      <div className="mobile-topline">
        <button className="icon-button" type="button" aria-label="Menu">
          <Menu size={24} />
        </button>
        <strong>GuildOps</strong>
        <div className="mobile-actions">
          <Search size={22} />
          <button
            className="mobile-icon-action"
            type="button"
            aria-label={`Messagerie, ${unreadMessages} message${unreadMessages > 1 ? "s" : ""} non lu${unreadMessages > 1 ? "s" : ""}`}
            onClick={onOpenMessages}
          >
            <Mail size={22} />
            {unreadMessages ? <span className="notice-dot message-count">{unreadMessages}</span> : null}
          </button>
        </div>
      </div>
      <button className="mobile-guild-card" type="button">
        <div className="avatar crest">
          <GuildShieldMark />
        </div>
        <span>
          <strong>{displayGuild.name || "Guilde"}</strong>
          <small>
            {[displayGuild.game, displayGuild.realm, displayGuild.language].filter(Boolean).join(" · ") || "Contexte en cours"}
          </small>
        </span>
        <ChevronDown size={22} />
      </button>
      <div className="mobile-tab-rail" aria-label="Modules rapides">
        {navItems.slice(0, 3).map((item) => {
          const badge = item.id === "messages" ? unreadMessages : item.badge;
          const isActive = isNavItemActive(item, activeView);

          return (
            <button
              key={item.id}
              type="button"
              className={`${isActive ? "is-active" : ""} ${item.disabled ? "is-disabled" : ""}`}
              disabled={item.disabled}
              onClick={() => onNavigate(item.id)}
            >
              <item.icon size={18} />
              {item.mobileLabel || item.label}
              {badge ? <span className="badge-dot">{badge}</span> : null}
            </button>
          );
        })}
      </div>
    </header>
  );
}

export function TopBar({
  currentUser,
  guilds: availableGuilds = [],
  selectedGuild,
  onGuildChange,
  onCreateSite,
  onOpenMessages,
  onOpenMemberSpace,
  onOpenPublicSite,
  onLogout,
  publicSiteUrl,
  publishingSite,
  sitePublished,
  sitePublishError,
  unreadMessages = 0,
}) {
  const displayGuild = selectedGuild || availableGuilds[0] || {};
  const selectedGuildKey = getGuildKey(displayGuild);
  const siteOptions = availableGuilds.length ? availableGuilds : displayGuild.name ? [displayGuild] : [];
  const [siteMenuOpen, setSiteMenuOpen] = useState(false);
  const siteMenuRef = useRef(null);

  useEffect(() => {
    if (!siteMenuOpen) return undefined;

    function handlePointerDown(event) {
      if (!siteMenuRef.current?.contains(event.target)) {
        setSiteMenuOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setSiteMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [siteMenuOpen]);

  function handleSiteSelect(guild) {
    onGuildChange?.(guild);
    setSiteMenuOpen(false);
  }

  return (
    <header className="topbar site-builder-topbar">
      <div className="top-site-switcher" ref={siteMenuRef}>
        <button
          className={`top-guild-card ${siteMenuOpen ? "is-open" : ""}`}
          type="button"
          aria-haspopup="menu"
          aria-expanded={siteMenuOpen}
          aria-controls="top-site-switcher-menu"
          onClick={() => setSiteMenuOpen((isOpen) => !isOpen)}
        >
          <div className="avatar crest">
            <GuildShieldMark />
          </div>
          <span>
            <strong>{displayGuild.name || "Guilde"}</strong>
            <small>
              {[displayGuild.game, displayGuild.realm].filter(Boolean).join(" · ") || "Contexte en cours"}
            </small>
          </span>
          <ChevronDown size={18} />
        </button>
        {siteMenuOpen ? (
          <div className="top-site-menu" id="top-site-switcher-menu" role="menu" aria-label="Choix du site">
            {siteOptions.map((guild) => {
              const guildKey = getGuildKey(guild);
              const isSelected = guildKey === selectedGuildKey;

              return (
                <button
                  key={guildKey}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isSelected}
                  className={`top-site-option ${isSelected ? "is-selected" : ""}`}
                  onClick={() => handleSiteSelect(guild)}
                >
                  <span className="top-site-option-mark">
                    <GuildShieldMark small />
                  </span>
                  <span>
                    <strong>{guild.name || "Site de guilde"}</strong>
                    <small>
                      {[guild.game, guild.realm || guild.server, guild.language].filter(Boolean).join(" · ") || "Contexte en cours"}
                    </small>
                  </span>
                  {isSelected ? <em>Actif</em> : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      <label className="site-url-field">
        <Globe2 size={17} />
        <input value={publicSiteUrl} aria-label="URL du site" readOnly />
      </label>
      <div className="top-actions">
        <button
          className="icon-button message-icon-button"
          type="button"
          aria-label={`Messagerie, ${unreadMessages} message${unreadMessages > 1 ? "s" : ""} non lu${unreadMessages > 1 ? "s" : ""}`}
          onClick={onOpenMessages}
        >
          <Mail size={19} />
          {unreadMessages ? <span className="notice-dot message-count">{unreadMessages}</span> : null}
        </button>
        <button className="icon-button" type="button" aria-label="Aide">
          <CircleHelp size={19} />
        </button>
        <button
          className="icon-button"
          type="button"
          aria-label="Ouvrir le site de guilde"
          onClick={onOpenPublicSite}
          disabled={!sitePublished}
        >
          <Globe2 size={19} />
        </button>
        <button className="user-chip" type="button" onClick={onOpenMemberSpace} aria-label="Ouvrir l'espace membre">
          <div className="avatar">{currentUser.initials}</div>
          <span>
            {currentUser.displayName}
            <small>{getRoleLabel(currentUser)}</small>
          </span>
          <ChevronDown size={16} />
        </button>
        {onLogout ? (
          <button className="icon-button" type="button" aria-label="Déconnexion" onClick={onLogout}>
            <X size={18} />
          </button>
        ) : null}
        <button
          className="publish-action"
          type="button"
          onClick={onCreateSite}
          disabled={publishingSite}
          {...getGuardProps(currentUser, "manage_site")}
        >
          <Rocket size={18} />
          {publishingSite ? "Mise en ligne" : sitePublished ? "Mettre a jour" : "Publier"}
        </button>
      </div>
      {sitePublishError ? <p className="publish-error">{sitePublishError}</p> : null}
    </header>
  );
}

export function MobileBottomNav({ activeView, mobileNav = getGuildOpsMobileNavItems(), onNavigate, unreadMessages = 0 }) {
  return (
    <nav className="mobile-bottom-nav" aria-label="Navigation mobile">
      {mobileNav.map((item) => {
        const badge = item.id === "messages" ? unreadMessages : 0;
        const isActive = isNavItemActive(item, activeView);

        return (
          <button
            type="button"
            key={item.id}
            className={`${isActive ? "is-active" : ""} ${item.disabled ? "is-disabled" : ""}`}
            disabled={item.disabled}
            onClick={() => onNavigate(item.id)}
          >
            <item.icon size={22} />
            <span>{item.mobileLabel || item.label}</span>
            {badge ? <span className="badge-dot">{badge}</span> : null}
          </button>
        );
      })}
    </nav>
  );
}
