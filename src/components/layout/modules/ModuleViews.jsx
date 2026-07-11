import React from "react";
import {
  AlertTriangle,
  Lock,
  Settings
} from "lucide-react";
import {
  getComplexityLabel,
  getGuildOpsModuleByView,
  guildOpsModuleById,
  isGuildOpsModuleEnabled,
  moduleHubNavItem
} from "../../../config/moduleRegistry.js";
import {
  getPermissionLabel
} from "../../../lib/rbac.js";
import {
  BankView
} from "../../bank/BankViews.jsx";
import {
  AbsencesView
} from "../../absence/AbsenceViews.jsx";
import {
  CommandCenter
} from "../../command/CommandViews.jsx";
import {
  DiplomacyView
} from "../../diplomacy/DiplomacyViews.jsx";
import {
  ForumView
} from "../../forum/ForumViews.jsx";
import {
  MessagesView
} from "../../messages/MessagesViews.jsx";
import {
  MemberSpaceView
} from "../../member/MemberSpaceView.jsx";
import {
  ShopView
} from "../../shop/ShopViews.jsx";
import {
  ModuleHero,
  PanelHeader
} from "../../shared/Shared.jsx";
import {
  WarsView
} from "../../wars/WarsViews.jsx";
import {
  AdministrationView,
  MembershipRequestsView,
  MembersView,
  SettingsView
} from "../admin/AdminViews.jsx";

const MODULE_CATALOG_IDS = Object.freeze([
  "wars_events",
  "sos_attack",
  "membership_requests",
  "absences",
  "bank",
  "diplomacy",
  "forum",
  "messages",
  "translation",
  "multi_guilds",
]);
const UTILITY_COMPACT_HERO_VIEWS = new Set(["administration", "absences", "settings"]);

function getRouteModeValue(props) {
  if (props.authSession?.isApiEnabled) return "Synchronisé";
  return "API requise";
}

function getDefaultHeroEyebrow(module, title) {
  if (module?.view === "command" || module?.id === "site") return "Site";
  if (String(title || "").toLowerCase().includes("module")) return "Centre";
  return "Module";
}

function getDefaultHeroConfig(props, moduleOverride) {
  const module = moduleOverride || (props.activeView === "modules" ? moduleHubNavItem : getGuildOpsModuleByView(props.activeView));
  const title = module?.hubLabel || module?.navLabel || module?.label || "GuildOps";

  return {
    eyebrow: getDefaultHeroEyebrow(module, title),
    icon: module?.icon || Settings,
    metric: module?.complexity ? getComplexityLabel(module.complexity) : "Centre",
    modeDetail: module?.description || "Pilotage de guilde",
    modeValue: getRouteModeValue(props),
    title,
  };
}

function getViewHeroConfig(props, moduleOverride) {
  const config = getDefaultHeroConfig(props, moduleOverride);
  const pendingMembershipRequests = props.membershipRequests?.filter((request) => request.status === "pending").length || 0;
  const administrationMemberCount = props.members?.filter((member) => (props.administrationAccess?.[member.id] || []).length > 0).length || 0;
  const enabledSet = new Set(props.enabledModuleIds || []);
  const activeCatalogCount = MODULE_CATALOG_IDS.filter((moduleId) => enabledSet.has(moduleId)).length;
  const pendingBankRequests = props.bankRequests?.filter((request) => ["pending", "en attente"].includes(String(request.status || "").toLowerCase())).length || 0;
  const confirmedMembers = props.warSummary?.attendanceRate?.confirmed || props.members?.filter((member) => member.allianceWar === "Confirme").length || 0;
  const expectedMembers = props.warSummary?.attendanceRate?.activeMembers || props.members?.length || 0;
  const absenceTotal = props.absenceSummary?.total || props.absences?.length || 0;

  const overrides = {
    administration: {
      badge: administrationMemberCount,
      eyebrow: "Admin",
      metric: `${administrationMemberCount}/${props.members?.length || 0} accès`,
      modeDetail: "Permissions et restrictions",
      title: "Administration",
    },
    absences: {
      badge: props.absenceSummary?.active || 0,
      eyebrow: "Planning",
      metric: `${absenceTotal} absence${absenceTotal > 1 ? "s" : ""}`,
      modeDetail: "Dates et motifs",
      modeValue: "Disponibilités",
    },
    bank: {
      badge: pendingBankRequests,
      metric: `${pendingBankRequests} demande${pendingBankRequests > 1 ? "s" : ""}`,
      modeDetail: "Stocks et demandes",
    },
    command: {
      metric: props.sitePublished ? "Site publié" : "Brouillon",
      modeDetail: props.publicSiteUrl || "Builder privé",
      modeValue: props.publishingSite ? "Publication" : props.sitePublished ? "En ligne" : "Builder",
    },
    diplomacy: {
      metric: `${props.diplomacyRelations?.length || 0} relation${props.diplomacyRelations?.length > 1 ? "s" : ""}`,
      modeDetail: "Alliés, NAP, ennemis",
    },
    forum: {
      metric: `${props.forumThreads?.length || 0} fil${props.forumThreads?.length > 1 ? "s" : ""}`,
      modeDetail: "Catégories et discussions",
      modeValue: props.forumLoading ? "Chargement" : getRouteModeValue(props),
    },
    member: {
      eyebrow: "Membre",
      metric: props.authSession?.isAuthenticated ? "Session active" : "Invité",
      modeDetail: "Profil et sécurité",
      modeValue: "Compte",
      title: "Compte",
    },
    membershipRequests: {
      badge: pendingMembershipRequests,
      metric: `${pendingMembershipRequests} en attente`,
      modeDetail: "Validation des accès",
    },
    members: {
      metric: `${props.members?.length || 0} membre${props.members?.length > 1 ? "s" : ""}`,
      modeDetail: "Rôles et blocages",
    },
    modules: {
      badge: activeCatalogCount,
      eyebrow: "Centre",
      metric: `${activeCatalogCount}/${MODULE_CATALOG_IDS.length} activés`,
      modeDetail: "Activation des outils",
      modeValue: props.moduleUpdateError ? "À vérifier" : "Activation",
      title: "Modules",
    },
    settings: {
      eyebrow: "Réglages",
      metric: `${props.guilds?.length || 0} guilde${props.guilds?.length > 1 ? "s" : ""}`,
      modeDetail: "Mondes et paramètres",
      title: "Paramètres",
    },
    shop: {
      badge: props.purchasedDesignIds?.length || 0,
      eyebrow: "Catalogue",
      metric: `${props.purchasedDesignIds?.length || 0} acquis`,
      modeDetail: "Templates et packs",
      modeValue: "Catalogue",
      title: "Boutique",
    },
    wars: {
      metric: `${confirmedMembers}/${expectedMembers} confirmés`,
      modeDetail: "Planning et présences",
    },
  };

  const heroConfig = {
    ...config,
    ...(overrides[props.activeView] || {}),
  };

  if (!UTILITY_COMPACT_HERO_VIEWS.has(props.activeView)) return heroConfig;

  return {
    ...heroConfig,
    className: `${heroConfig.className || ""} is-utility-compact`.trim(),
  };
}

function ViewRouteFrame({ children, module, props }) {
  const heroConfig = getViewHeroConfig(props, module);
  const isCompactFrame = heroConfig.className?.split(/\s+/).includes("is-utility-compact");

  return (
    <div className={`view-with-module-hero view-${props.activeView || "module"}-hero-frame${isCompactFrame ? " is-utility-compact-frame" : ""}`}>
      <ModuleHero {...heroConfig} />
      {children}
    </div>
  );
}

export function ViewRouter(props) {
  const activeModule = getGuildOpsModuleByView(props.activeView);
  const enabledModuleIds = props.enabledModuleIds;

  if (activeModule && !isGuildOpsModuleEnabled(activeModule, enabledModuleIds)) {
    return (
      <ViewRouteFrame module={activeModule} props={props}>
        <ModuleDisabledView module={activeModule} onNavigate={props.onNavigate} />
      </ViewRouteFrame>
    );
  }

  let view;

  switch (props.activeView) {
    case "modules":
      view = <ModulesView {...props} />;
      break;
    case "administration":
      view = <AdministrationView {...props} />;
      break;
    case "membershipRequests":
      view = <MembershipRequestsView {...props} />;
      break;
    case "shop":
      view = <ShopView {...props} />;
      break;
    case "member":
      view = <MemberSpaceView {...props} />;
      break;
    case "absences":
      view = <AbsencesView {...props} />;
      break;
    case "wars":
      view = <WarsView {...props} />;
      break;
    case "bank":
      view = <BankView {...props} />;
      break;
    case "diplomacy":
      view = <DiplomacyView {...props} />;
      break;
    case "messages":
      return <MessagesView {...props} />;
    case "forum":
      view = <ForumView {...props} />;
      break;
    case "members":
      view = <MembersView {...props} />;
      break;
    case "settings":
      view = <SettingsView {...props} />;
      break;
    case "command":
    default:
      view = <CommandCenter {...props} />;
      break;
  }

  return <ViewRouteFrame props={props}>{view}</ViewRouteFrame>;
}

function getModulePermissionSummary(module) {
  return module.permissionKeys.length
    ? module.permissionKeys.map((permission) => getPermissionLabel(permission)).join(", ")
    : "Accès membre";
}

function getModuleDependencySummary(module) {
  const dependencyLabels = module.dependencies.map((moduleId) => guildOpsModuleById[moduleId]?.hubLabel || guildOpsModuleById[moduleId]?.label || moduleId);
  return dependencyLabels.length ? dependencyLabels.join(", ") : "Aucun prérequis";
}

export function ModulesView({ enabledModuleIds = [], moduleUpdateError = "", onEnableModule }) {
  const enabledSet = new Set(enabledModuleIds);
  const catalogModules = MODULE_CATALOG_IDS.map((moduleId) => guildOpsModuleById[moduleId]).filter(Boolean);
  const enabledCount = catalogModules.filter((module) => enabledSet.has(module.id)).length;

  return (
    <div className="page-grid module-registry-page">
      <section className="panel wide-panel">
        <PanelHeader icon={Settings} title="Catalogue d'outils" meta={`${enabledCount}/${catalogModules.length} activés`} />
        <div className="module-registry-intro">
          <strong>Ajoute les outils quand ta guilde grandit.</strong>
          <p>Le site de guilde reste le point de départ. Active ensuite les modules qui répondent à un vrai besoin d'organisation.</p>
        </div>
        {moduleUpdateError ? (
          <p className="membership-moderation-error">
            <AlertTriangle size={16} />
            {moduleUpdateError}
          </p>
        ) : null}
        <div className="module-registry-grid">
          {catalogModules.map((module) => (
            <ModuleRegistryCard
              enabled={enabledSet.has(module.id)}
              key={module.id}
              module={module}
              onEnable={() => onEnableModule?.(module.id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

export function ModuleRegistryCard({ enabled = false, module, onEnable }) {
  const Icon = module.icon;
  const title = module.hubLabel || module.label;
  const permissionLabel = getModulePermissionSummary(module);
  const dependencyLabel = getModuleDependencySummary(module);

  return (
    <article className={`module-registry-card ${enabled ? "is-enabled" : "is-disabled"}`}>
      <header className="module-registry-card-header">
        <span className="module-registry-icon">
          <Icon size={22} />
        </span>
        <span>
          <strong>{title}</strong>
          <small>{module.description}</small>
        </span>
        <em>{enabled ? "Activé" : "Désactivé"}</em>
      </header>
      <p className="module-registry-benefit">
        <span>Bénéfice</span>
        {module.benefit}
      </p>
      <dl className="module-registry-meta">
        <div>
          <dt>Complexité</dt>
          <dd>{getComplexityLabel(module.complexity)}</dd>
        </div>
        <div>
          <dt>Permissions nécessaires</dt>
          <dd>{permissionLabel}</dd>
        </div>
        <div>
          <dt>Pré-requis</dt>
          <dd>{dependencyLabel}</dd>
        </div>
      </dl>
      {!enabled ? (
        <div className="module-registry-actions">
          <button type="button" onClick={onEnable}>
            Activer
          </button>
        </div>
      ) : null}
    </article>
  );
}

export function ModuleDisabledView({ module, onNavigate }) {
  const Icon = module.icon || Lock;

  return (
    <div className="page-grid">
      <section className="panel module-disabled-panel">
        <span className="module-registry-icon">
          <Icon size={26} />
        </span>
        <div>
          <h2>{module.label}</h2>
          <p>{module.description}</p>
          <small>Ce module n'est pas encore activé pour cette guilde.</small>
        </div>
        <div className="state-actions">
          <button className="primary-action" type="button" onClick={() => onNavigate?.("modules")}>
            <Settings size={17} />
            Voir les modules
          </button>
          <button className="ghost-action" type="button" onClick={() => onNavigate?.("command")}>
            Retour au site
          </button>
        </div>
      </section>
    </div>
  );
}
