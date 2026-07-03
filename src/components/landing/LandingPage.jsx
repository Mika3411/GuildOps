import React from "react";
import {
  ArrowRight,
  BellRing,
  CalendarDays,
  Check,
  ChevronRight,
  Crown,
  Gem,
  Handshake,
  LockKeyhole,
  LogIn,
  Map,
  MessageSquare,
  Play,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  Swords,
  UserPlus,
  Users,
  Vault,
} from "lucide-react";

const moduleRows = [
  {
    icon: Swords,
    label: "Guerres & Events",
    text: "Planifiez, suivez et rappelez chaque war et event.",
    tone: "blue",
  },
  {
    icon: Users,
    label: "Membres",
    text: "Suivez les rôles, présences et priorités de progression.",
    tone: "teal",
  },
  {
    icon: Vault,
    label: "Banque",
    text: "Suivez les stocks, les depots et les retraits en temps reel.",
    tone: "green",
  },
  {
    icon: ShieldAlert,
    label: "SOS",
    text: "Alertez, coordonnez et suivez les demandes d'aide.",
    tone: "red",
  },
  {
    icon: Handshake,
    label: "Diplomatie",
    text: "Contacts, traites et communications inter-alliances.",
    tone: "violet",
  },
];

const privateRows = [
  ["Commandement", "Vue d'ensemble et decisions cles.", Users],
  ["Calendrier", "Tous les events et rappels.", CalendarDays],
  ["Membres", "Roles, activites et performance.", Crown],
  ["Rapports", "Historique des wars et metriques.", MessageSquare],
  ["Parametres", "Roles, permissions et integrations.", Settings],
];

const eventRows = [
  ["Guerre d'alliance", "Aujourd'hui 20:00", Swords, "red"],
  ["Siege", "Demain 19:00", Shield, "blue"],
  ["Recolte de ressources", "Samedi 18:00", Gem, "green"],
];

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function LandingButton({ children, className = "", icon: Icon, onClick }) {
  return (
    <button className={`landing-button ${className}`.trim()} type="button" onClick={onClick}>
      {Icon ? <Icon size={18} /> : null}
      <span>{children}</span>
    </button>
  );
}

function BrandMark() {
  return (
    <span className="landing-brand-mark" aria-hidden="true">
      <Shield size={24} />
    </span>
  );
}

function CommandMap() {
  return (
    <div className="landing-command-map" aria-label="Carte de commandement">
      <div className="map-node primary">
        <Shield size={25} />
      </div>
      <div className="map-node north">
        <Vault size={18} />
      </div>
      <div className="map-node east">
        <Swords size={18} />
      </div>
      <div className="map-node south">
        <ShieldAlert size={18} />
      </div>
      <div className="map-legend">
        <span>
          <i className="ally" />
          Allies
        </span>
        <span>
          <i className="neutral" />
          Neutres
        </span>
        <span>
          <i className="enemy" />
          Ennemis
        </span>
      </div>
    </div>
  );
}

function DashboardPreview() {
  return (
    <section className="landing-dashboard" aria-label="Apercu du cockpit GuildOps">
      <header className="dashboard-topbar">
        <div className="dashboard-guild">
          <span>
            <Crown size={17} />
          </span>
          <strong>Aetherium</strong>
          <ChevronRight size={14} />
        </div>
        <label className="dashboard-search">
          <Search size={15} />
          <input aria-label="Rechercher dans le cockpit" placeholder="Rechercher..." />
        </label>
        <BellRing size={18} />
        <Settings size={18} />
        <span className="dashboard-avatar">NL</span>
      </header>

      <div className="dashboard-body">
        <nav className="dashboard-sidebar" aria-label="Modules GuildOps">
          {["Commandement", "Calendrier", "Membres", "Banque", "SOS", "Diplomatie"].map((item, index) => (
            <span className={index === 0 ? "is-active" : ""} key={item}>
              {item}
            </span>
          ))}
        </nav>

        <div className="dashboard-main">
          <div className="dashboard-panel command">
            <h3>Carte de commandement</h3>
            <CommandMap />
          </div>
          <div className="dashboard-panel events">
            <h3>Prochains events</h3>
            {eventRows.map(([label, time, Icon, tone]) => (
              <p className={`event-row tone-${tone}`} key={label}>
                <span>
                  <Icon size={18} />
                </span>
                <strong>{label}</strong>
                <small>{time}</small>
              </p>
            ))}
            <button type="button">
              Voir le calendrier
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="dashboard-panel members">
            <h3>Suivi membres</h3>
            {["ShieldMaiden", "FrostWarden", "NightLead"].map((name, index) => (
              <p key={name}>
                <span className="member-avatar">{name.slice(0, 1)}</span>
                <strong>{name}</strong>
                <small>{index === 0 ? "War confirmee" : index === 1 ? "Objectif banque" : "Brief à lire"}</small>
              </p>
            ))}
          </div>
          <div className="dashboard-panel bank">
            <h3>Banque</h3>
            {[
              ["Or", "12,4 M"],
              ["Elixir", "9,8 M"],
              ["Gemmes", "5 120"],
            ].map(([name, amount]) => (
              <p key={name}>
                <span />
                <strong>{name}</strong>
                <small>{amount}</small>
              </p>
            ))}
          </div>
          <div className="dashboard-panel sos">
            <h3>SOS actifs</h3>
            <strong>Aide requise !</strong>
            <p>T1H2 en difficulte</p>
            <small>Coordonnees X: 1256 Y: 878</small>
            <button type="button">
              Voir tous les SOS (3)
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ModuleRows() {
  return (
    <section className="landing-section landing-modules" id="modules">
      <h2>Tout ce que l’état-major doit voir</h2>
      <div className="module-row-list">
        {moduleRows.map(({ icon: Icon, label, text, tone }) => (
          <article className="module-row" key={label}>
            <span className={`module-icon tone-${tone}`}>
              <Icon size={23} />
            </span>
            <strong>{label}</strong>
            <p>{text}</p>
            <ArrowRight size={18} />
          </article>
        ))}
      </div>
    </section>
  );
}

function FlowSection() {
  return (
    <section className="landing-section landing-flow" id="product">
      <h2>Du site de guilde aux opérations privées</h2>
      <div className="flow-grid">
        <article className="public-site-card">
          <h3>Site de guilde</h3>
          <div className="public-site-panel">
            <div className="site-banner">
              <span className="site-crest">
                <Crown size={24} />
              </span>
              <div>
                <strong>Aetherium</strong>
                <small>Unis pour dominer.</small>
              </div>
            </div>
            <dl>
              <div>
                <dt>Niveau</dt>
                <dd>24</dd>
              </div>
              <div>
                <dt>Membres</dt>
                <dd>48/50</dd>
              </div>
              <div>
                <dt>Trophees</dt>
                <dd>51234</dd>
              </div>
              <div>
                <dt>Langue</dt>
                <dd>FR</dd>
              </div>
            </dl>
            <div className="site-public-copy">
              <p>
                <strong>A propos de nous</strong>
                Guilde competitive et organisee. Wars constantes, entraide active et progression collective.
              </p>
              <p>
                <strong>Exigences</strong>
                <span>
                  <Check size={14} />
                  HDV 14+
                </span>
                <span>
                  <Check size={14} />
                  Heros optimises
                </span>
                <span>
                  <Check size={14} />
                  Actif & loyal
                </span>
              </p>
            </div>
            <button type="button">Voir les consignes</button>
          </div>
        </article>

        <div className="flow-bridge" aria-hidden="true">
          <span />
          <LockKeyhole size={27} />
          <ArrowRight size={24} />
        </div>

        <article className="private-ops-card">
          <h3>Opérations privées</h3>
          <div className="private-ops-panel">
            {privateRows.map(([label, text, Icon]) => (
              <p key={label}>
                <span>
                  <Icon size={18} />
                </span>
                <strong>{label}</strong>
                <small>{text}</small>
                <ArrowRight size={16} />
              </p>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

function CockpitPreview() {
  return (
    <section className="landing-section cockpit-preview" id="preview">
      <h2>Aperçu du cockpit</h2>
      <div className="cockpit-shell">
        <div className="cockpit-map-pane">
          <Map size={24} />
          <strong>Ruche Aegis</strong>
          <span>X:417 Y:388</span>
          <i className="route route-one" />
          <i className="route route-two" />
        </div>
        <div className="cockpit-activity">
          {[
            ["SOS", "Rallye detecte sur Forteresse Est", "Maintenant"],
            ["War", "Guerre d'alliance confirmee", "20:00"],
            ["Banque", "Livraison FrostWarden", "12:31"],
          ].map(([type, title, time]) => (
            <p key={title}>
              <span>{type}</span>
              <strong>{title}</strong>
              <small>{time}</small>
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}

export function LandingPage({ onOpenApp, onOpenGallery, onOpenLogin, onOpenRegister }) {
  const openApp = () => {
    if (typeof onOpenApp === "function") {
      onOpenApp();
      return;
    }

    window.history.pushState({}, "", "/app");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
  const openLogin = () => {
    if (typeof onOpenLogin === "function") {
      onOpenLogin();
      return;
    }

    window.history.pushState({}, "", "/auth/login");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
  const openRegister = () => {
    if (typeof onOpenRegister === "function") {
      onOpenRegister();
      return;
    }

    window.history.pushState({}, "", "/auth/register");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
  const openGallery = () => {
    if (typeof onOpenGallery === "function") {
      onOpenGallery();
      return;
    }

    window.history.pushState({}, "", "/guildes");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <main className="landing-page">
      <header className="landing-nav">
        <button className="landing-brand" type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          <BrandMark />
          <span>GuildOps</span>
        </button>
        <nav aria-label="Navigation landing">
          <button type="button" onClick={() => scrollToSection("product")}>
            Produit
          </button>
          <button type="button" onClick={() => scrollToSection("modules")}>
            Modules
          </button>
          <button type="button" onClick={() => scrollToSection("preview")}>
            Aperçu
          </button>
          <button type="button" onClick={openGallery}>
            Galerie
          </button>
        </nav>
        <div className="landing-auth-actions" aria-label="Acces au compte">
          <LandingButton className="nav-auth nav-builder" icon={Settings} onClick={openApp}>
            Builder
          </LandingButton>
          <LandingButton className="nav-auth" icon={LogIn} onClick={openLogin}>
            Connexion
          </LandingButton>
          <LandingButton className="primary nav-cta" icon={UserPlus} onClick={openRegister}>
            Inscription
          </LandingButton>
        </div>
      </header>

      <section className="landing-hero">
        <div className="hero-copy-block">
          <h1>Le QG de guilde qui remplace les messages épinglés</h1>
          <p>
            Publiez un site de guilde, suivez les membres, les wars, les SOS, la banque et la diplomatie depuis un seul
            cockpit.
          </p>
          <div className="hero-actions">
            <LandingButton className="primary" icon={UserPlus} onClick={openRegister}>
              Créer mon QG
            </LandingButton>
            <LandingButton className="builder-test" icon={Settings} onClick={openApp}>
              Tester le builder
            </LandingButton>
            <LandingButton icon={Play} onClick={() => scrollToSection("preview")}>
              Voir l’aperçu
            </LandingButton>
            <LandingButton icon={Search} onClick={openGallery}>
              Explorer les guildes
            </LandingButton>
          </div>
        </div>
        <DashboardPreview />
      </section>

      <ModuleRows />
      <FlowSection />

      <section className="landing-final-cta">
        <h2>Prêt avant le prochain event</h2>
        <p>Gagnez du temps, restez alignés, remportez plus de victoires.</p>
        <LandingButton className="primary" icon={UserPlus} onClick={openRegister}>
          Créer mon QG
        </LandingButton>
      </section>

      <CockpitPreview />
    </main>
  );
}
