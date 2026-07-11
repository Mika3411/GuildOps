import React, { useState } from "react";
import {
  Banknote,
  BellRing,
  GalleryHorizontalEnd,
  Globe2,
  Layers3,
  LogIn,
  Menu,
  Shield,
  ShieldAlert,
  Sparkles,
  Swords,
  UserPlus,
  X,
} from "lucide-react";

const promiseCards = [
  {
    icon: Globe2,
    label: "Présenter ta guilde",
    text: "Explique le jeu, le serveur, la langue, les règles et le type de joueurs recherchés.",
    detail: "Une page claire à partager",
  },
  {
    icon: UserPlus,
    label: "Accueillir les joueurs",
    text: "Les nouveaux comprennent où ils arrivent avant de demander à rejoindre.",
    detail: "Moins de questions répétées",
  },
  {
    icon: Layers3,
    label: "Piloter les moments importants",
    text: "Alertes, SOS, événements, rappels, banque et absences restent visibles au bon endroit.",
    detail: "La partie utile pendant le jeu",
  },
];

const journeySteps = [
  ["1", "Tu crées la page", "Nom, jeu, serveur, langue, description et règles de base."],
  ["2", "Un joueur découvre", "Il comprend vite si la guilde correspond à son style de jeu."],
  ["3", "Il rejoint", "Il crée son compte et accède aux espaces privés de la guilde."],
  ["4", "Le staff gère", "Les admins suivent les membres, les absences, les messages et les modules."],
];

const moduleBadges = ["Alertes", "SOS", "Événements", "Banque", "Absences", "Messages"];

const demoGuild = {
  initials: "AN",
  name: "Aegis Nord",
  game: "Whiteout Survival",
  realm: "Royaume 847",
  modules: "6/10 modules activés",
};

const sosResponses = [
  ["Nora", "défense prête"],
  ["Kaito", "renfort en route"],
  ["Mila", "bouclier posé"],
];

const eventReminders = [
  ["20:00", "Forteresse niveau 4"],
  ["19:30", "Rappel préparation"],
  ["19:50", "Check-in final"],
];

const bankResources = [
  ["Acier", "1,2 M", "+240 K"],
  ["Charbon", "860 K", "-80 K"],
  ["Viande", "3,4 M", "+510 K"],
];

const alertFeed = [
  ["SOS", "Rallye entrant sur Bastion Nord"],
  ["Rappel", "Event dans 30 minutes"],
  ["Banque", "3 demandes de ressources à valider"],
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

function PromiseSection() {
  return (
    <section className="landing-section landing-promises" id="product">
      <div className="section-heading">
        <span>GuildOps, en clair</span>
        <h2>Crée une page pour ta guilde, puis active les outils utiles pendant le jeu.</h2>
        <p>
          Si tu découvres GuildOps : c'est un outil pour les guildes de jeu. Les nouveaux joueurs voient qui vous êtes,
          et les membres connectés retrouvent les alertes, SOS, événements, rappels, absences et ressources au même
          endroit.
        </p>
      </div>
      <div className="promise-grid">
        {promiseCards.map(({ icon: Icon, label, text, detail }) => (
          <article className="promise-card" key={label}>
            <span>
              <Icon size={22} />
            </span>
            <strong>{label}</strong>
            <p>{text}</p>
            <small>{detail}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function OperationsSection() {
  return (
    <section className="landing-section landing-operations" id="modules">
      <div className="section-heading">
        <span>Ce qui compte en jeu</span>
        <h2>Alertes, SOS, rappels, événements, banque : les modules prioritaires.</h2>
      </div>
      <div className="operations-layout">
        <div className="ops-phone" aria-label="Apercu mobile espace membre">
          <header>
            <Shield size={18} />
            <strong>GuildOps</strong>
            <BellRing size={18} />
          </header>
          <div className="ops-guild-card">
            <span>{demoGuild.initials}</span>
            <div>
              <strong>{demoGuild.name}</strong>
              <small>
                {demoGuild.game} · {demoGuild.realm}
              </small>
            </div>
          </div>
          <div className="ops-tabs">
            {["Alertes", "Events", "Banque"].map((item) => (
              <span className={item === "Alertes" ? "is-active" : ""} key={item}>
                {item}
              </span>
            ))}
          </div>
          <div className="ops-member-panel">
            <small>SOS attaque</small>
            <strong>Rallye entrant</strong>
            <p>Bastion Nord · X:417 Y:388 · impact dans 03:42.</p>
            <div className="ops-alert-stats" aria-label="Etat de l'alerte SOS">
              <span>12 réponses</span>
              <span>4 renforts</span>
              <span>2 boucliers</span>
            </div>
          </div>
        </div>

        <div className="real-preview-grid">
          <article className="real-preview-card is-wide">
            <header>
              <span>
                <ShieldAlert size={20} />
              </span>
              <div>
                <small>SOS attaque</small>
                <strong>Réponses des membres</strong>
              </div>
              <em>03:42</em>
            </header>
            <div className="sos-response-list">
              {sosResponses.map(([name, status]) => (
                <p key={name}>
                  <strong>{name}</strong>
                  <span>{status}</span>
                </p>
              ))}
            </div>
          </article>

          <article className="real-preview-card">
            <header>
              <span>
                <Swords size={20} />
              </span>
              <div>
                <small>Événement</small>
                <strong>Rappels & check-in</strong>
              </div>
            </header>
            <div className="event-preview-list">
              {eventReminders.map(([time, label]) => (
                <p key={`${time}-${label}`}>
                  <span>{time}</span>
                  <strong>{label}</strong>
                </p>
              ))}
            </div>
          </article>

          <article className="real-preview-card">
            <header>
              <span>
                <Banknote size={20} />
              </span>
              <div>
                <small>Banque</small>
                <strong>Stocks & demandes</strong>
              </div>
            </header>
            <div className="bank-resource-list">
              {bankResources.map(([name, amount, delta]) => (
                <p key={name}>
                  <strong>{name}</strong>
                  <span>{amount}</span>
                  <em>{delta}</em>
                </p>
              ))}
            </div>
          </article>

          <article className="real-preview-card is-wide">
            <header>
              <span>
                <BellRing size={20} />
              </span>
              <div>
                <small>Alertes récentes</small>
                <strong>Ce que le staff doit voir</strong>
              </div>
            </header>
            <div className="alert-feed">
              {alertFeed.map(([type, label]) => (
                <p key={`${type}-${label}`}>
                  <span>{type}</span>
                  <strong>{label}</strong>
                </p>
              ))}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function JourneySection() {
  return (
    <section className="landing-section landing-journey" id="workflow">
      <div className="section-heading">
        <span>Parcours représentatif</span>
        <h2>De la découverte à la coordination quotidienne</h2>
      </div>
      <div className="journey-grid">
        {journeySteps.map(([number, label, text]) => (
          <article className="journey-step" key={label}>
            <span>{number}</span>
            <strong>{label}</strong>
            <p>{text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function RepresentativePreview() {
  return (
    <section className="landing-section landing-preview" id="preview">
      <div className="section-heading">
        <span>Aperçu produit</span>
        <h2>Une interface pensée pour réagir vite pendant les moments critiques</h2>
      </div>
      <div className="preview-workspace">
        <div className="preview-sidebar">
          <strong>{demoGuild.name}</strong>
          <small>{demoGuild.modules}</small>
          <div>
            {moduleBadges.map((module) => (
              <span className={module === "SOS" ? "is-active" : ""} key={module}>
                {module}
              </span>
            ))}
          </div>
        </div>
        <div className="preview-main">
          <header>
            <div>
              <span>Module SOS</span>
              <strong>Alerte attaque</strong>
            </div>
            <button type="button">Envoyer l'alerte</button>
          </header>
          <div className="preview-thread">
            <p>
              <strong>Rallye entrant</strong>
              Coordonnées, cible, délai et besoin de renforts visibles pour tous les membres autorisés.
            </p>
            <p>
              <strong>Prochaine action</strong>
              Les membres confirment leur réponse, le staff suit qui peut aider et qui a déjà réagi.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function LandingPage({ onOpenGallery, onOpenLogin, onOpenRegister }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
  const useMobileNav = (callback) => {
    setMobileMenuOpen(false);
    callback();
  };

  return (
    <main className="landing-page landing-home">
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
          <button type="button" onClick={() => scrollToSection("workflow")}>
            Parcours
          </button>
          <button type="button" onClick={openGallery}>
            Galerie
          </button>
        </nav>
        <div className="landing-auth-actions" aria-label="Acces au compte">
          <LandingButton className="nav-auth" icon={LogIn} onClick={openLogin}>
            Connexion
          </LandingButton>
          <LandingButton className="primary nav-cta" icon={UserPlus} onClick={openRegister}>
            Créer ma page
          </LandingButton>
        </div>
        <button
          className="landing-mobile-menu-toggle"
          type="button"
          aria-controls="landing-mobile-menu"
          aria-expanded={mobileMenuOpen}
          aria-label={mobileMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
          title={mobileMenuOpen ? "Fermer le menu" : "Menu"}
          onClick={() => setMobileMenuOpen((isOpen) => !isOpen)}
        >
          {mobileMenuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
        {mobileMenuOpen ? (
          <div className="landing-mobile-menu" id="landing-mobile-menu">
            <button type="button" onClick={() => useMobileNav(() => scrollToSection("product"))}>
              Produit
            </button>
            <button type="button" onClick={() => useMobileNav(() => scrollToSection("modules"))}>
              Modules
            </button>
            <button type="button" onClick={() => useMobileNav(() => scrollToSection("workflow"))}>
              Parcours
            </button>
            <button type="button" onClick={() => useMobileNav(openGallery)}>
              Galerie
            </button>
            <button type="button" onClick={() => useMobileNav(openLogin)}>
              Connexion
            </button>
            <button className="is-primary" type="button" onClick={() => useMobileNav(openRegister)}>
              Créer ma page
            </button>
          </div>
        ) : null}
      </header>

      <section className="landing-hero-v2">
        <div className="hero-v2-content">
          <span className="hero-eyebrow">
            <Sparkles size={17} />
            Pour les guildes de jeu
          </span>
          <h1>GuildOps</h1>
          <p>
            Crée une page publique pour présenter ta guilde, puis ouvre une zone réservée aux membres pour organiser
            alertes, SOS, événements, banque, messages et absences.
          </p>
          <div className="hero-actions">
            <LandingButton className="primary" icon={UserPlus} onClick={openRegister}>
              Créer ma page
            </LandingButton>
            <LandingButton icon={GalleryHorizontalEnd} onClick={openGallery}>
              Voir des exemples
            </LandingButton>
            <LandingButton className="ghost" icon={LogIn} onClick={openLogin}>
              Se connecter
            </LandingButton>
          </div>
        </div>
      </section>

      <PromiseSection />
      <OperationsSection />
      <JourneySection />
      <RepresentativePreview />

      <section className="landing-final-cta">
        <h2>Présente ta guilde clairement, puis organise-la sans perdre les infos.</h2>
        <p>Commence par une page simple. Ajoute ensuite les modules utiles à tes membres.</p>
        <LandingButton className="primary" icon={UserPlus} onClick={openRegister}>
          Créer ma page
        </LandingButton>
      </section>
    </main>
  );
}
