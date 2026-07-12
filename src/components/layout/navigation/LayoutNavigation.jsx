import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
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
import {
  LiveStatus
} from "../../shared/Shared.jsx";

const REALM_CLOCK_STORAGE_KEY = "guildops.realmClock.timeZone";
const DEFAULT_TIME_ZONE = "UTC";
const MOBILE_BOTTOM_PRIMARY_IDS = Object.freeze(["command", "shop", "member", "absences", "messages"]);
const MOBILE_BOTTOM_SECONDARY_IDS = Object.freeze(["administration", "modules", "settings"]);
const MOBILE_BOTTOM_LABEL_OVERRIDES = Object.freeze({
  administration: "Admin",
  settings: "Paramètres",
});
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

function sortMobileBottomItems(items, order) {
  const positions = new Map(order.map((id, index) => [id, index]));

  return [...items].sort((left, right) => (
    (positions.get(left.id) ?? order.length) - (positions.get(right.id) ?? order.length)
  ));
}

function getMobileBottomLabel(item, { full = false } = {}) {
  if (full && MOBILE_BOTTOM_LABEL_OVERRIDES[item.id]) return MOBILE_BOTTOM_LABEL_OVERRIDES[item.id];
  return item.mobileLabel || item.label;
}

function getUnreadMessagesText(count = 0) {
  const safeCount = Number(count) || 0;
  return `${safeCount} message${safeCount > 1 ? "s" : ""} non lu${safeCount > 1 ? "s" : ""}`;
}

function getUnreadNotificationsText(count = 0) {
  const safeCount = Number(count) || 0;
  return `${safeCount} notification${safeCount > 1 ? "s" : ""} non lue${safeCount > 1 ? "s" : ""}`;
}

function getNavButtonLabel(item, { badge = 0, label } = {}) {
  if (item.id === "messages") return `${label || item.label}, ${getUnreadMessagesText(badge)}`;
  return label || item.label;
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
              aria-current={isActive ? "page" : undefined}
              aria-label={getNavButtonLabel(item, { badge, label: item.label })}
              disabled={item.disabled}
              onClick={() => onNavigate(item.id)}
            >
              <item.icon aria-hidden="true" focusable="false" size={20} />
              <span>{item.label}</span>
              {badge ? <span className="badge-dot" aria-hidden="true">{badge}</span> : null}
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
            aria-pressed={selectedGuildKey === getGuildKey(guild)}
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

export function MobileHeader({
  selectedGuild,
  activeView,
  navItems = getGuildOpsNavItems(),
  notificationProps,
  onNavigate,
  onOpenMessages,
  unreadMessages = 0,
  workspaceRef
}) {
  const displayGuild = selectedGuild || {};
  const [isScrolled, setIsScrolled] = useState(false);
  const activeItem = navItems.find((item) => isNavItemActive(item, activeView));
  const activeLabel = activeItem?.mobileLabel || activeItem?.label || "Espace";
  const guildName = displayGuild.name || "Guilde";
  const guildContext = [displayGuild.game, displayGuild.realm, displayGuild.language].filter(Boolean).join(" · ") || "Contexte en cours";
  const isInternalRoute = activeView !== "command";
  const isCompact = isInternalRoute || isScrolled;

  useEffect(() => {
    const scrollTarget = workspaceRef?.current;

    if (!scrollTarget) {
      setIsScrolled(false);
      return undefined;
    }

    function handleScroll() {
      setIsScrolled(scrollTarget.scrollTop > 24);
    }

    handleScroll();
    scrollTarget.addEventListener("scroll", handleScroll, { passive: true });

    return () => scrollTarget.removeEventListener("scroll", handleScroll);
  }, [activeView, workspaceRef]);

  return (
    <header className={`mobile-header${isCompact ? " is-compact" : ""}`}>
      <div className="mobile-topline">
        <span className="icon-button mobile-menu-mark" aria-hidden="true">
          <Menu size={24} />
        </span>
        <span className="mobile-brand-context">
          <strong>GuildOps</strong>
          <small className="mobile-context-line">
            {activeLabel} · {guildName}
          </small>
        </span>
        <div className="mobile-actions">
          <span className="mobile-search-mark" aria-hidden="true">
            <Search size={22} />
          </span>
          <NotificationBell compact notificationProps={notificationProps} />
          <button
            className="mobile-icon-action"
            type="button"
            aria-label={`Messagerie, ${getUnreadMessagesText(unreadMessages)}`}
            onClick={onOpenMessages}
          >
            <Mail aria-hidden="true" focusable="false" size={22} />
            {unreadMessages ? <span className="notice-dot message-count" aria-hidden="true">{unreadMessages}</span> : null}
          </button>
        </div>
      </div>
      <div className="mobile-guild-card">
        <div className="avatar crest">
          <GuildShieldMark />
        </div>
        <span>
          <strong>{guildName}</strong>
          <small>{guildContext}</small>
        </span>
        <ChevronDown aria-hidden="true" focusable="false" size={22} />
      </div>
      <nav className="mobile-tab-rail" aria-hidden="true">
        {navItems.slice(0, 3).map((item) => {
          const badge = item.id === "messages" ? unreadMessages : item.badge;
          const isActive = isNavItemActive(item, activeView);
          const label = item.mobileLabel || item.label;

          return (
            <button
              key={item.id}
              type="button"
              className={`${isActive ? "is-active" : ""} ${item.disabled ? "is-disabled" : ""}`}
              aria-current={isActive ? "page" : undefined}
              aria-label={getNavButtonLabel(item, { badge, label })}
              disabled={item.disabled}
              tabIndex={-1}
              onClick={() => onNavigate(item.id)}
            >
              <item.icon aria-hidden="true" focusable="false" size={18} />
              {label}
              {badge ? <span className="badge-dot" aria-hidden="true">{badge}</span> : null}
            </button>
          );
        })}
      </nav>
    </header>
  );
}

export function TopBar({
  currentUser,
  guilds: availableGuilds = [],
  selectedGuild,
  notificationProps,
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
      <label className={`site-url-field ${sitePublished ? "" : "is-unpublished"}`}>
        <Globe2 size={17} />
        <input
          value={publicSiteUrl}
          aria-label="URL du site"
          placeholder={sitePublished ? "URL du site public" : "Site public non publie"}
          readOnly
        />
      </label>
      <div className="top-actions">
        <NotificationBell notificationProps={notificationProps} />
        <button
          className="icon-button message-icon-button"
          type="button"
          aria-label={`Messagerie, ${getUnreadMessagesText(unreadMessages)}`}
          onClick={onOpenMessages}
        >
          <Mail aria-hidden="true" focusable="false" size={19} />
          {unreadMessages ? <span className="notice-dot message-count" aria-hidden="true">{unreadMessages}</span> : null}
        </button>
        <button className="icon-button" type="button" aria-label="Aide">
          <CircleHelp size={19} />
        </button>
        <button
          className="icon-button"
          type="button"
          aria-label={sitePublished ? "Ouvrir le site de guilde" : "Site public non publie"}
          onClick={onOpenPublicSite}
          disabled={!sitePublished}
          title={sitePublished ? "Ouvrir le site de guilde" : "Publie le site avant de l'ouvrir"}
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
          {publishingSite ? "Mise en ligne" : sitePublished ? "Mettre a jour" : "Publier le site"}
        </button>
      </div>
      {sitePublishError ? <p className="publish-error">{sitePublishError}</p> : null}
    </header>
  );
}

function NotificationBell({ compact = false, notificationProps = {} }) {
  const {
    notifications = [],
    notificationError = "",
    pushState = {},
    unreadNotifications = 0,
    onDisablePush,
    onEnablePush,
    onMarkAllRead,
    onOpenNotification,
  } = notificationProps;
  const [open, setOpen] = useState(false);
  const popoverRef = useRef(null);
  const notificationList = notifications.filter(Boolean);
  const pushActionLabel = pushState.enabled ? "Désactiver" : pushState.enabling ? "..." : "Activer";
  const pushDisabled = Boolean(
    pushState.enabling ||
      !pushState.supported ||
      (!pushState.enabled && !pushState.configured)
  );

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (!popoverRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  async function handlePushToggle() {
    if (pushState.enabled) {
      await onDisablePush?.();
    } else {
      await onEnablePush?.();
    }
  }

  async function handleOpenNotification(notification) {
    await onOpenNotification?.(notification);
    setOpen(false);
  }

  return (
    <div className={`notification-shell ${compact ? "is-compact" : ""}`} ref={popoverRef}>
      <button
        className={compact ? "mobile-icon-action notification-bell" : "icon-button notification-bell"}
        type="button"
        aria-label={`Notifications, ${getUnreadNotificationsText(unreadNotifications)}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Bell aria-hidden="true" focusable="false" size={compact ? 22 : 19} />
        {unreadNotifications ? <span className="notice-dot notification-count" aria-hidden="true">{unreadNotifications}</span> : null}
      </button>
      {open ? (
        <div className="notification-popover" role="dialog" aria-label="Notifications internes">
          <header>
            <span>
              <strong>Notifications</strong>
              <LiveStatus as="small">{unreadNotifications ? getUnreadNotificationsText(unreadNotifications) : "À jour"}</LiveStatus>
            </span>
            <button type="button" onClick={onMarkAllRead} disabled={!unreadNotifications}>
              Tout lu
            </button>
          </header>
          <div className="notification-push-row">
            <span>
              <strong>Push navigateur</strong>
              <small>
                {pushState.enabled
                  ? "Activé"
                  : pushState.supported
                    ? pushState.configured
                      ? "Prêt"
                      : "Serveur à configurer"
                    : "Non supporté"}
              </small>
            </span>
            <button type="button" onClick={handlePushToggle} disabled={pushDisabled}>
              {pushActionLabel}
            </button>
          </div>
          {pushState.message ? <p className="notification-hint" aria-live="polite">{pushState.message}</p> : null}
          {notificationError ? <p className="notification-error" aria-live="polite">{notificationError}</p> : null}
          <div className="notification-list">
            {notificationList.length ? (
              notificationList.slice(0, 10).map((notification) => (
                <button
                  type="button"
                  key={notification.id}
                  className={notification.readAt ? "" : "is-unread"}
                  onClick={() => handleOpenNotification(notification)}
                >
                  <span>
                    <strong>{notification.title}</strong>
                    <small>{notification.body}</small>
                  </span>
                  <em>{formatNotificationDate(notification.createdAt)}</em>
                </button>
              ))
            ) : (
              <p className="notification-empty">Aucune notification.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatNotificationDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function MobileBottomNav({ activeView, mobileNav = getGuildOpsMobileNavItems(), onNavigate, unreadMessages = 0 }) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const primaryItems = sortMobileBottomItems(
    mobileNav.filter((item) => MOBILE_BOTTOM_PRIMARY_IDS.includes(item.id)),
    MOBILE_BOTTOM_PRIMARY_IDS
  );
  const secondaryItems = sortMobileBottomItems(
    mobileNav.filter((item) => MOBILE_BOTTOM_SECONDARY_IDS.includes(item.id)),
    MOBILE_BOTTOM_SECONDARY_IDS
  );
  const isMoreActive = secondaryItems.some((item) => isNavItemActive(item, activeView));

  useEffect(() => {
    setIsMoreOpen(false);
  }, [activeView]);

  useEffect(() => {
    if (!isMoreOpen) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsMoreOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMoreOpen]);

  function handleNavigate(item) {
    if (item.disabled) return;
    setIsMoreOpen(false);
    onNavigate(item.id);
  }

  function renderNavButton(item, { full = false } = {}) {
    const badge = item.id === "messages" ? unreadMessages : 0;
    const isActive = isNavItemActive(item, activeView);
    const label = getMobileBottomLabel(item, { full });

    return (
      <button
        type="button"
        key={item.id}
        className={`${isActive ? "is-active" : ""} ${item.disabled ? "is-disabled" : ""}`}
        aria-current={isActive ? "page" : undefined}
        aria-label={getNavButtonLabel(item, { badge, label })}
        disabled={item.disabled}
        onClick={() => handleNavigate(item)}
      >
        <item.icon aria-hidden="true" focusable="false" size={full ? 20 : 21} />
        <span>{label}</span>
        {badge ? <span className="badge-dot" aria-hidden="true">{badge}</span> : null}
      </button>
    );
  }

  return (
    <>
      {secondaryItems.length ? (
        <>
          <button
            type="button"
            className={`mobile-more-scrim${isMoreOpen ? " is-open" : ""}`}
            aria-label="Fermer le menu Plus"
            onClick={() => setIsMoreOpen(false)}
          />
          <div
            className={`mobile-more-drawer${isMoreOpen ? " is-open" : ""}`}
            id="mobile-more-drawer"
            aria-label="Navigation secondaire"
            aria-hidden={!isMoreOpen}
            role="dialog"
            hidden={!isMoreOpen}
          >
            <div className="mobile-more-handle" aria-hidden="true" />
            <div className="mobile-more-header">
              <strong>Plus</strong>
              <button type="button" aria-label="Fermer le menu Plus" onClick={() => setIsMoreOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="mobile-more-list">
              {secondaryItems.map((item) => renderNavButton(item, { full: true }))}
            </div>
          </div>
        </>
      ) : null}
      <nav className="mobile-bottom-nav" aria-label="Navigation mobile">
        {primaryItems.map((item) => renderNavButton(item))}
        {secondaryItems.length ? (
          <button
            type="button"
            className={`mobile-more-trigger${isMoreActive ? " is-active" : ""}${isMoreOpen ? " is-open" : ""}`}
            aria-current={isMoreActive ? "page" : undefined}
            aria-expanded={isMoreOpen}
            aria-controls="mobile-more-drawer"
            aria-label={`${isMoreOpen ? "Fermer" : "Ouvrir"} le menu Plus${isMoreActive ? ", section active" : ""}`}
            onClick={() => setIsMoreOpen((current) => !current)}
          >
            <Plus aria-hidden="true" focusable="false" size={21} />
            <span>Plus</span>
          </button>
        ) : null}
      </nav>
    </>
  );
}
