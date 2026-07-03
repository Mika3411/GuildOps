import React, {
  useEffect,
  useRef,
  useState
} from "react";
import {
  AlertTriangle,
  Ban,
  Bell,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  Command,
  Copy,
  Globe2,
  Lock,
  MailCheck,
  Menu,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  Settings,
  Shield,
  UserCheck,
  UserPlus,
  Users,
  X,
  Zap
} from "lucide-react";
import {
  can,
  getGuardProps,
  getPermissionLabel,
  getRoleLabel,
  permissionRoles
} from "../../lib/rbac.js";
import {
  GAME_OPTIONS,
  PLAY_STYLE_OPTIONS,
  REALM_CODE_MAX_LENGTH,
  getRealmPlaceholderForGame,
  normalizeRealmCodeForGame
} from "../../config/guildOpsConfig.js";
import {
  getAdministrationModules,
  getComplexityLabel,
  getGuildOpsMobileNavItems,
  getGuildOpsModuleByView,
  getGuildOpsNavItems,
  guildOpsModuleById,
  isGuildOpsModuleEnabled
} from "../../config/moduleRegistry.js";
import {
  getGuildKey
} from "../../lib/guildOpsTransforms.js";
import {
  guildOpsApi
} from "../../lib/guildOpsApi.js";
import {
  createGuildSiteDraft,
  getMemberInviteToken,
  loadPublishedSite,
  savePublishedSite,
  slugify
} from "../../lib/guildSiteStore.js";
import {
  BankView
} from "../bank/BankViews.jsx";
import {
  CommandCenter
} from "../command/CommandViews.jsx";
import {
  DiplomacyView
} from "../diplomacy/DiplomacyViews.jsx";
import {
  ForumView
} from "../forum/ForumViews.jsx";
import {
  MessagesView
} from "../messages/MessagesViews.jsx";
import {
  MemberSpaceView
} from "../member/MemberSpaceView.jsx";
import {
  ShopView
} from "../shop/ShopViews.jsx";
import {
  Avatar,
  MergePanel,
  PanelHeader,
  PermissionsMatrix,
  RolePill
} from "../shared/Shared.jsx";
import {
  WarsView
} from "../wars/WarsViews.jsx";

const MODULE_CATALOG_IDS = Object.freeze([
  "wars_events",
  "sos_attack",
  "membership_requests",
  "bank",
  "diplomacy",
  "forum",
  "messages",
  "translation",
  "multi_guilds",
]);

const emailVerificationRequests = new Map();

export function AuthLoading() {
  return (
    <main className="auth-shell">
      <section className="auth-panel compact">
        <div className="brand-lockup auth-brand">
          <div className="brand-mark">
            <Shield size={28} />
          </div>
          <span>GuildOps</span>
        </div>
        <p>Verification de session...</p>
      </section>
    </main>
  );
}

export function AuthGate({ authSession, initialMode = "login" }) {
  const [mode, setMode] = useState(initialMode === "register" ? "register" : "login");
  const [form, setForm] = useState({
    displayName: "",
    email: "",
    organizationName: "",
    password: "",
  });
  const [error, setError] = useState(authSession.error || "");
  const [notice, setNotice] = useState("");
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [verificationUrl, setVerificationUrl] = useState("");
  const isRegister = mode === "register";

  useEffect(() => {
    setMode(initialMode === "register" ? "register" : "login");
  }, [initialMode]);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submitAuth(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice("");
    setVerificationUrl("");

    try {
      if (isRegister) {
        const payload = await authSession.register({
          displayName: form.displayName,
          email: form.email,
          organizationName: form.organizationName || undefined,
          password: form.password,
          preferredLanguage: "fr",
        });

        if (payload?.status === "verification_required") {
          setPendingVerificationEmail(payload.email || form.email);
          setNotice(payload.message || "Compte cree. Consultez votre email pour valider la connexion.");
          setVerificationUrl(payload.verificationUrl || "");
          setMode("login");
        }
      } else {
        await authSession.login({
          email: form.email,
          password: form.password,
        });
      }
    } catch (submitError) {
      const details = submitError?.payload?.error?.details || {};

      if (details.reason === "EMAIL_NOT_VERIFIED") {
        setPendingVerificationEmail(details.email || form.email);
        setNotice(submitError?.message || "Email non verifie. Un nouveau lien vient d'etre envoye.");
        setVerificationUrl(details.verificationUrl || "");
        setMode("login");
      } else {
        setError(submitError?.message || "Authentification impossible.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function resendVerification() {
    const email = pendingVerificationEmail || form.email;

    if (!email) {
      setError("Indiquez l'email du compte a valider.");
      return;
    }

    setSubmitting(true);
    setError("");
    setNotice("");
    setVerificationUrl("");

    try {
      const payload = await authSession.resendVerification({ email });
      setPendingVerificationEmail(payload?.email || email);
      setNotice(payload?.message || "Si ce compte attend une validation, un nouveau lien vient d'etre envoye.");
      setVerificationUrl(payload?.verificationUrl || "");
    } catch (resendError) {
      setError(resendError?.message || "Impossible de renvoyer le lien pour le moment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-lockup auth-brand">
          <div className="brand-mark">
            <Shield size={28} />
          </div>
          <span>GuildOps</span>
        </div>
        <div className="auth-tabs" role="tablist" aria-label="Authentification">
          <button className={!isRegister ? "is-active" : ""} type="button" onClick={() => setMode("login")}>
            Connexion
          </button>
          <button className={isRegister ? "is-active" : ""} type="button" onClick={() => setMode("register")}>
            Inscription
          </button>
        </div>
        <form className="auth-form" onSubmit={submitAuth}>
          {isRegister ? (
            <>
              <label className="form-row">
                <span>Nom affiche</span>
                <input
                  autoComplete="name"
                  value={form.displayName}
                  onChange={(event) => updateField("displayName", event.target.value)}
                  required
                />
              </label>
              <label className="form-row">
                <span>Organisation</span>
                <input
                  autoComplete="organization"
                  value={form.organizationName}
                  onChange={(event) => updateField("organizationName", event.target.value)}
                  placeholder="Aegis Command"
                />
              </label>
            </>
          ) : null}
          <label className="form-row">
            <span>Email</span>
            <input
              autoComplete="email"
              type="email"
              value={form.email}
              onChange={(event) => updateField("email", event.target.value)}
              required
            />
          </label>
          <label className="form-row">
            <span>Mot de passe</span>
            <input
              autoComplete={isRegister ? "new-password" : "current-password"}
              minLength={isRegister ? 10 : 1}
              type="password"
              value={form.password}
              onChange={(event) => updateField("password", event.target.value)}
              required
            />
          </label>
          {notice ? (
            <div className="auth-notice">
              <MailCheck size={18} />
              <span>{notice}</span>
            </div>
          ) : null}
          {verificationUrl ? (
            <a className="auth-dev-link" href={verificationUrl}>
              Ouvrir le lien de validation
            </a>
          ) : null}
          {error ? <p className="auth-error">{error}</p> : null}
          <button className="primary-action" type="submit" disabled={submitting}>
            <Shield size={17} />
            {submitting ? "Patiente..." : isRegister ? "Creer le compte" : "Entrer"}
          </button>
          {pendingVerificationEmail ? (
            <button className="ghost-action auth-inline-action" type="button" disabled={submitting} onClick={resendVerification}>
              <RefreshCw size={16} />
              Renvoyer le lien
            </button>
          ) : null}
        </form>
      </section>
    </main>
  );
}

export function JoinGuildRoute({
  authSession,
  inviteSlug,
  inviteToken = "",
  isInviteLink = false,
  memberBlocks = [],
  onJoined,
  onOpenApp,
  onOpenPublicSite,
  onRequestJoin,
}) {
  const normalizedSlug = slugify(inviteSlug || "");
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({
    displayName: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState(authSession.error || "");
  const [joined, setJoined] = useState(false);
  const [nickname, setNickname] = useState(authSession.user?.displayName || "");
  const [notice, setNotice] = useState("");
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState("");
  const [siteState, setSiteState] = useState({ error: "", site: null, status: "loading" });
  const [submitting, setSubmitting] = useState(false);
  const [verificationUrl, setVerificationUrl] = useState("");
  const isRegister = authMode === "register";

  useEffect(() => {
    if (!normalizedSlug) {
      setSiteState({ error: "Lien d'invitation incomplet.", site: null, status: "error" });
      return undefined;
    }

    const controller = new AbortController();
    let cancelled = false;

    setSiteState({ error: "", site: null, status: "loading" });

    if (!authSession.isApiEnabled) {
      const localSite =
        loadPublishedSite(normalizedSlug) ||
        createGuildSiteDraft(
          {},
          {
            guildName: getInviteFallbackName(normalizedSlug),
            publicSlug: normalizedSlug,
            slug: normalizedSlug,
            published: true,
            status: "published",
          },
        );

      setSiteState({ error: "", site: localSite, status: "ready" });
      return undefined;
    }

    guildOpsApi
      .getPublicGuild(normalizedSlug, { signal: controller.signal })
      .then((payload) => {
        if (cancelled) return;
        setSiteState({ error: "", site: payload?.site || payload?.guild || payload, status: "ready" });
      })
      .catch((loadError) => {
        if (cancelled || controller.signal.aborted) return;
        setSiteState({
          error: loadError?.message || "Invitation introuvable.",
          site: null,
          status: "error",
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [authSession.isApiEnabled, normalizedSlug]);

  useEffect(() => {
    if (!nickname && authSession.user?.displayName) {
      setNickname(authSession.user.displayName);
    }
  }, [authSession.user?.displayName, nickname]);

  const siteDraft = siteState.site ? createGuildSiteDraft({}, siteState.site) : null;
  const requiresAuth = authSession.isApiEnabled && !authSession.isAuthenticated;
  const activeInviteToken = siteDraft ? siteDraft.inviteToken || getMemberInviteToken(siteDraft.memberInviteUrl) : "";
  const inviteExpired = Boolean(isInviteLink && !authSession.isApiEnabled && siteDraft && activeInviteToken !== inviteToken);
  const inviteStatusClass = inviteExpired ? "expired" : isInviteLink ? "live" : "pending";
  const inviteStatusLabel = inviteExpired ? "Lien renouvelé" : isInviteLink ? "Invitation active" : "Demande à valider";

  function updateAuthField(key, value) {
    setAuthForm((current) => ({ ...current, [key]: value }));
  }

  async function submitAuth(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice("");
    setVerificationUrl("");

    try {
      if (isRegister) {
        const payload = await authSession.register({
          displayName: authForm.displayName || nickname,
          email: authForm.email,
          password: authForm.password,
          preferredLanguage: "fr",
        });

        if (payload?.status === "verification_required") {
          setPendingVerificationEmail(payload.email || authForm.email);
          setNotice(payload.message || "Compte cree. Valide ton email puis reviens sur ce lien.");
          setVerificationUrl(payload.verificationUrl || "");
          setAuthMode("login");
        } else if (payload?.user) {
          setNotice("Compte connecte. Confirme l'entree dans la guilde.");
        }
      } else {
        await authSession.login({
          email: authForm.email,
          password: authForm.password,
        });
        setNotice("Compte connecte. Confirme l'entree dans la guilde.");
      }
    } catch (submitError) {
      const details = submitError?.payload?.error?.details || {};

      if (details.reason === "EMAIL_NOT_VERIFIED") {
        setPendingVerificationEmail(details.email || authForm.email);
        setNotice(submitError?.message || "Email non verifie. Un nouveau lien vient d'etre envoye.");
        setVerificationUrl(details.verificationUrl || "");
        setAuthMode("login");
      } else {
        setError(submitError?.message || "Authentification impossible.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function resendVerification() {
    const email = pendingVerificationEmail || authForm.email;

    if (!email) {
      setError("Indique l'email du compte a valider.");
      return;
    }

    setSubmitting(true);
    setError("");
    setNotice("");
    setVerificationUrl("");

    try {
      const payload = await authSession.resendVerification({ email });
      setPendingVerificationEmail(payload?.email || email);
      setNotice(payload?.message || "Si ce compte attend une validation, un nouveau lien vient d'etre envoye.");
      setVerificationUrl(payload?.verificationUrl || "");
    } catch (resendError) {
      setError(resendError?.message || "Impossible de renvoyer le lien pour le moment.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitJoin(event) {
    event.preventDefault();
    if (!siteDraft || !normalizedSlug) return;
    if (inviteExpired) {
      setError("Ce lien d'invitation a été renouvelé. Demande un nouveau lien à la guilde.");
      return;
    }
    if (requiresAuth) {
      setError(isInviteLink ? "Connecte-toi pour devenir membre de cette guilde." : "Connecte-toi pour envoyer une demande d'accès.");
      return;
    }

    const memberName = (nickname || authSession.user?.displayName || "Membre").trim();
    if (
      !authSession.isApiEnabled &&
      isLocalJoinBlocked(memberBlocks, {
        guildSlug: normalizedSlug,
        nickname: memberName,
        userId: authSession.user?.id || "",
      })
    ) {
      setError("Ce joueur est bloqué pour cette guilde.");
      return;
    }

    setSubmitting(true);
    setError("");
    setNotice("");

    try {
      if (authSession.isApiEnabled && isInviteLink) {
        await guildOpsApi.joinPublicGuild(normalizedSlug, { nickname: memberName, inviteToken });
      } else if (!isInviteLink) {
        await onRequestJoin?.(normalizedSlug, siteState.site, {
          nickname: memberName,
          user: authSession.user,
        });
      } else {
        const result = saveMockGuildJoin(normalizedSlug, siteState.site, {
          nickname: memberName,
          user: authSession.user,
        });
        setSiteState({ error: "", site: result.site, status: "ready" });
      }

      if (isInviteLink) {
        await onJoined?.();
      }
      setJoined(true);
    } catch (joinError) {
      setError(joinError?.message || "Impossible de rejoindre cette guilde pour le moment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell join-shell">
      <section className="auth-panel join-panel">
        <div className="brand-lockup auth-brand">
          <div className="brand-mark">
            <UserPlus size={28} />
          </div>
          <span>GuildOps</span>
        </div>
        <aside className="join-guild-summary">
          <span className={`status-pill ${inviteStatusClass}`}>{inviteStatusLabel}</span>
          <h1>{siteDraft?.guildName || (isInviteLink ? "Invitation de guilde" : "Demande d'accès")}</h1>
          <p>{siteDraft ? `${siteDraft.game} · ${siteDraft.realm}` : "Chargement de la guilde..."}</p>
          {siteDraft?.tagline ? <strong>{siteDraft.tagline}</strong> : null}
          {siteDraft?.objective ? <small>{siteDraft.objective}</small> : null}
          {siteDraft ? (
            <button className="ghost-action" type="button" onClick={() => onOpenPublicSite?.(normalizedSlug)}>
              <Globe2 size={16} />
              Voir le site
            </button>
          ) : null}
        </aside>
        <section className="join-action-card">
          {siteState.status === "loading" || authSession.isLoading ? (
            <div className="join-state">
              <RefreshCw size={24} />
              <strong>Vérification du lien...</strong>
            </div>
          ) : siteState.status === "error" ? (
            <div className="join-state is-error">
              <AlertTriangle size={28} />
              <strong>Invitation introuvable</strong>
              <p>{siteState.error}</p>
            </div>
          ) : inviteExpired ? (
            <div className="join-state is-error">
              <AlertTriangle size={28} />
              <strong>Lien renouvelé</strong>
              <p>Ce lien d'invitation n'est plus actif. Demande à un officier de générer un nouveau lien.</p>
              <button className="ghost-action" type="button" onClick={() => onOpenPublicSite?.(normalizedSlug)}>
                <Globe2 size={16} />
                Voir le site
              </button>
            </div>
          ) : joined ? (
            <div className="join-state is-success">
              <CheckCircle2 size={34} />
              <strong>{isInviteLink ? `Tu es membre de ${siteDraft?.guildName}` : "Demande envoyée"}</strong>
              <p>
                {isInviteLink
                  ? "Ton espace est prêt avec cette guilde active."
                  : "Un membre autorisé doit accepter la demande avant activation."}
              </p>
              {isInviteLink ? (
                <button className="primary-action" type="button" onClick={onOpenApp}>
                  <Command size={17} />
                  Ouvrir l'espace membre
                </button>
              ) : (
                <button className="primary-action" type="button" onClick={() => onOpenPublicSite?.(normalizedSlug)}>
                  <Globe2 size={17} />
                  Retour au site
                </button>
              )}
            </div>
          ) : requiresAuth ? (
            <>
              <div className="auth-tabs" role="tablist" aria-label="Authentification">
                <button className={!isRegister ? "is-active" : ""} type="button" onClick={() => setAuthMode("login")}>
                  Connexion
                </button>
                <button className={isRegister ? "is-active" : ""} type="button" onClick={() => setAuthMode("register")}>
                  Inscription
                </button>
              </div>
              <form className="auth-form" onSubmit={submitAuth}>
                {isRegister ? (
                  <label className="form-row">
                    <span>Nom affiché</span>
                    <input
                      autoComplete="name"
                      value={authForm.displayName}
                      onChange={(event) => updateAuthField("displayName", event.target.value)}
                      required
                    />
                  </label>
                ) : null}
                <label className="form-row">
                  <span>Email</span>
                  <input
                    autoComplete="email"
                    type="email"
                    value={authForm.email}
                    onChange={(event) => updateAuthField("email", event.target.value)}
                    required
                  />
                </label>
                <label className="form-row">
                  <span>Mot de passe</span>
                  <input
                    autoComplete={isRegister ? "new-password" : "current-password"}
                    minLength={isRegister ? 10 : 1}
                    type="password"
                    value={authForm.password}
                    onChange={(event) => updateAuthField("password", event.target.value)}
                    required
                  />
                </label>
                {notice ? (
                  <div className="auth-notice">
                    <MailCheck size={18} />
                    <span>{notice}</span>
                  </div>
                ) : null}
                {verificationUrl ? (
                  <a className="auth-dev-link" href={verificationUrl}>
                    Ouvrir le lien de validation
                  </a>
                ) : null}
                {error ? <p className="auth-error">{error}</p> : null}
                <button className="primary-action" type="submit" disabled={submitting}>
                  <Shield size={17} />
                  {submitting ? "Patiente..." : isRegister ? "Créer mon compte" : "Me connecter"}
                </button>
                {pendingVerificationEmail ? (
                  <button className="ghost-action auth-inline-action" type="button" disabled={submitting} onClick={resendVerification}>
                    <RefreshCw size={16} />
                    Renvoyer le lien
                  </button>
                ) : null}
              </form>
            </>
          ) : (
            <form className="auth-form join-form" onSubmit={submitJoin}>
              <label className="form-row">
                <span>Pseudo membre</span>
                <input
                  autoComplete="nickname"
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  required
                />
              </label>
              {notice ? (
                <div className="auth-notice">
                  <MailCheck size={18} />
                  <span>{notice}</span>
                </div>
              ) : null}
              {error ? <p className="auth-error">{error}</p> : null}
              <button className="primary-action" type="submit" disabled={submitting}>
                <UserPlus size={17} />
                {submitting ? (isInviteLink ? "Ajout..." : "Envoi...") : isInviteLink ? "Devenir membre" : "Envoyer la demande"}
              </button>
            </form>
          )}
        </section>
      </section>
    </main>
  );
}

function isLocalJoinBlocked(blocks = [], { guildSlug = "", nickname = "", userId = "" } = {}) {
  const normalizedSlug = slugify(guildSlug);
  const normalizedNickname = String(nickname || "").trim().toLowerCase();

  if (!normalizedNickname && !userId) return false;

  return blocks.some((block) => {
    if (block.active === false) return false;
    const blockGuildMatches =
      !block.guildSlug ||
      !normalizedSlug ||
      block.guildSlug === normalizedSlug;
    const userMatches = userId && block.userId === userId;
    const nicknameMatches = String(block.nickname || "").trim().toLowerCase() === normalizedNickname;

    return blockGuildMatches && (userMatches || nicknameMatches);
  });
}

export function VerifyEmailRoute({ authSession, onBackToLogin, onVerified }) {
  const [error, setError] = useState("");
  const [status, setStatus] = useState("verifying");
  const submittedRef = useRef(false);

  useEffect(() => {
    if (submittedRef.current) return;
    submittedRef.current = true;

    const token = new URLSearchParams(window.location.search).get("token") || "";

    if (!token) {
      setError("Lien de validation incomplet.");
      setStatus("error");
      return;
    }

    verifyEmailOnce(authSession, token)
      .then(() => {
        setStatus("success");
        window.setTimeout(() => onVerified?.(), 650);
      })
      .catch((verifyError) => {
        setError(verifyError?.message || "Lien de validation invalide ou expire.");
        setStatus("error");
      });
  }, [authSession, onVerified]);

  return (
    <main className="auth-shell command-state-shell">
      <section className="auth-panel command-state-card">
        <div className="brand-lockup auth-brand">
          <div className={`brand-mark ${status === "error" ? "danger" : ""}`}>
            {status === "error" ? <AlertTriangle size={28} /> : <MailCheck size={28} />}
          </div>
          <span>GuildOps</span>
        </div>
        <h1>{status === "success" ? "Email valide" : status === "error" ? "Validation impossible" : "Validation en cours"}</h1>
        <p>
          {status === "success"
            ? "Votre compte est active. Ouverture de l'espace GuildOps..."
            : status === "error"
              ? error
              : "Nous confirmons le lien recu par email."}
        </p>
        {status === "error" ? (
          <div className="state-actions">
            <button className="primary-action" type="button" onClick={onBackToLogin}>
              <Shield size={17} />
              Retour connexion
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}

export function DataLoading() {
  return (
    <main className="auth-shell command-state-shell">
      <section className="auth-panel compact command-state-card">
        <div className="brand-lockup auth-brand">
          <div className="brand-mark">
            <Command size={28} />
          </div>
          <span>GuildOps</span>
        </div>
        <p>Chargement de votre espace de guilde...</p>
      </section>
    </main>
  );
}

export function DataError({ error, onLogout, onRetry }) {
  return (
    <main className="auth-shell command-state-shell">
      <section className="auth-panel command-state-card">
        <div className="brand-lockup auth-brand">
          <div className="brand-mark danger">
            <AlertTriangle size={28} />
          </div>
          <span>GuildOps</span>
        </div>
        <h1>Chargement impossible</h1>
        <p>{error?.message || "Les donnees de guilde n'ont pas pu etre chargees."}</p>
        <div className="state-actions">
          <button className="primary-action" type="button" onClick={onRetry}>
            <Zap size={17} />
            Reessayer
          </button>
          <button className="ghost-action" type="button" onClick={onLogout}>
            Deconnexion
          </button>
        </div>
      </section>
    </main>
  );
}

export function GuildOnboarding({ creating, currentUser, error, onCreateGuild, organizations }) {
  const [form, setForm] = useState({
    name: "",
    tag: "",
    gameName: "Whiteout Survival",
    serverCode: normalizeRealmCodeForGame("", "Whiteout Survival"),
    playStyle: "Guerre organisee",
    description: "",
    isPublic: true,
  });

  function updateField(key, value) {
    setForm((current) => {
      if (key === "gameName") {
        return {
          ...current,
          gameName: value,
          serverCode: normalizeRealmCodeForGame(current.serverCode, value),
        };
      }

      if (key === "serverCode") {
        return {
          ...current,
          serverCode: normalizeRealmCodeForGame(value, current.gameName),
        };
      }

      return { ...current, [key]: value };
    });
  }

  async function submit(event) {
    event.preventDefault();
    const created = await onCreateGuild?.({
      ...form,
      organizationId: organizations[0]?.id,
    });

    if (!created) return;

    setForm((current) => ({
      ...current,
      name: "",
      tag: "",
      serverCode: normalizeRealmCodeForGame("", current.gameName),
      description: "",
    }));
  }

  return (
    <main className="auth-shell guild-onboarding-shell">
      <section className="auth-panel guild-onboarding-panel">
        <div className="brand-lockup auth-brand">
          <div className="brand-mark">
            <Shield size={28} />
          </div>
          <span>GuildOps</span>
        </div>
        <div className="onboarding-copy">
          <span className="status-pill live">Prêt à démarrer</span>
          <h1>Créer le profil de guilde</h1>
          <p>
            {currentUser.displayName || "Commandant"}, commence par un profil propre, publie un site partageable, envoie le lien,
            puis active les modules opérationnels quand ta guilde en a besoin.
          </p>
          <div className="onboarding-steps" aria-label="Étapes de démarrage">
            <span>Profil</span>
            <span>Site publié</span>
            <span>Lien partagé</span>
            <span>Opérations</span>
          </div>
        </div>
        <form className="auth-form guild-create-form" onSubmit={submit}>
          <label className="form-row">
            <span>Nom de guilde</span>
            <input value={form.name} onChange={(event) => updateField("name", event.target.value)} placeholder="Aegis Nord" required />
          </label>
          <label className="form-row">
            <span>Tag</span>
            <input value={form.tag} maxLength={12} onChange={(event) => updateField("tag", event.target.value.toUpperCase())} placeholder="AEG" />
          </label>
          <label className="form-row">
            <span>Jeu</span>
            <select value={form.gameName} onChange={(event) => updateField("gameName", event.target.value)}>
              {GAME_OPTIONS.map((game) => (
                <option key={game}>{game}</option>
              ))}
            </select>
          </label>
          <label className="form-row">
            <span>Royaume</span>
            <input
              value={form.serverCode}
              maxLength={REALM_CODE_MAX_LENGTH}
              onChange={(event) => updateField("serverCode", event.target.value)}
              placeholder={getRealmPlaceholderForGame(form.gameName)}
            />
          </label>
          <label className="form-row">
            <span>Style</span>
            <select value={form.playStyle} onChange={(event) => updateField("playStyle", event.target.value)}>
              {PLAY_STYLE_OPTIONS.map((style) => (
                <option key={style}>{style}</option>
              ))}
            </select>
          </label>
          <label className="form-row wide">
            <span>Brief</span>
            <textarea value={form.description} onChange={(event) => updateField("description", event.target.value)} placeholder="Objectif KvK, NAP, consignes..." />
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={form.isPublic} onChange={(event) => updateField("isPublic", event.target.checked)} />
            <span>Préparer un site de guilde brouillon publiable</span>
          </label>
          {error ? <p className="auth-error">{error}</p> : null}
          <button className="primary-action" type="submit" disabled={creating}>
            <Rocket size={17} />
            {creating ? "Création..." : "Créer la guilde"}
          </button>
        </form>
      </section>
    </main>
  );
}

function verifyEmailOnce(authSession, token) {
  const existing = emailVerificationRequests.get(token);
  if (existing) return existing;

  const request = authSession.verifyEmail({ token }).catch((error) => {
    emailVerificationRequests.delete(token);
    throw error;
  });

  emailVerificationRequests.set(token, request);
  return request;
}

function getInviteFallbackName(slug) {
  return String(slug || "guilde")
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function saveMockGuildJoin(slug, site, { nickname, user } = {}) {
  const member = {
    id: user?.id ? `local-${user.id}` : `local-${Date.now()}`,
    nickname: nickname || user?.displayName || "Membre",
    language: user?.preferredLanguage || "FR",
    roleCodes: ["membre"],
    role_codes: ["membre"],
    status: "active",
    joinedAt: new Date().toISOString(),
  };
  const currentSite =
    site ||
    createGuildSiteDraft(
      {},
      {
        guildName: getInviteFallbackName(slug),
        publicSlug: slug,
        slug,
        published: true,
        status: "published",
      },
    );
  const existingMembers = Array.isArray(currentSite.members) ? currentSite.members : [];
  const members = [
    ...existingMembers.filter((currentMember) => currentMember.id !== member.id && currentMember.nickname !== member.nickname),
    member,
  ];
  const savedSite = savePublishedSite({
    ...currentSite,
    members,
    publicSlug: slug,
    slug,
  });

  return { member, site: savedSite };
}

function isNavItemActive(item, activeView) {
  if (activeView === item.id) return true;

  const activeModule = getGuildOpsModuleByView(activeView);
  return Boolean(item.moduleId && activeModule?.id === item.moduleId);
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
          <Shield size={28} />
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
      <div className="guild-switcher">
        <p className="section-label">Multi-guildes / mondes</p>
        {availableGuilds.map((guild) => (
          <button
            key={getGuildKey(guild)}
            type="button"
            className={`guild-row ${selectedGuildKey === getGuildKey(guild) ? "is-selected" : ""}`}
            onClick={() => onGuildChange(guild)}
          >
            <Shield size={16} />
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
      <div className="realm-clock">
        <span>Heure du royaume</span>
        <strong>12:34:56 UTC</strong>
      </div>
    </aside>
  );
}

export function MobileHeader({ selectedGuild, activeView, navItems = getGuildOpsNavItems(), onNavigate, unreadMessages = 0 }) {
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
          <Bell size={22} />
        </div>
      </div>
      <button className="mobile-guild-card" type="button">
        <div className="avatar crest">
          <Shield size={28} />
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
  selectedGuild,
  onGuildChange,
  onCreateSite,
  onOpenMemberSpace,
  onOpenPublicSite,
  onLogout,
  publicSiteUrl,
  publishingSite,
  sitePublished,
  sitePublishError,
}) {
  const displayGuild = selectedGuild || {};

  return (
    <header className="topbar site-builder-topbar">
      <button className="top-guild-card" type="button">
        <div className="avatar crest">
          <Shield size={24} />
        </div>
        <span>
          <strong>{displayGuild.name || "Guilde"}</strong>
          <small>
            {[displayGuild.game, displayGuild.realm].filter(Boolean).join(" · ") || "Contexte en cours"}
          </small>
        </span>
        <ChevronDown size={18} />
      </button>
      <label className="site-url-field">
        <Globe2 size={17} />
        <input value={publicSiteUrl} aria-label="URL du site" readOnly />
      </label>
      <div className="top-actions">
        <button className="icon-button" type="button" aria-label="Notifications">
          <Bell size={19} />
          <span className="notice-dot">3</span>
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

export function ViewRouter(props) {
  const activeModule = getGuildOpsModuleByView(props.activeView);
  const enabledModuleIds = props.enabledModuleIds;

  if (activeModule && !isGuildOpsModuleEnabled(activeModule, enabledModuleIds)) {
    return <ModuleDisabledView module={activeModule} onNavigate={props.onNavigate} />;
  }

  switch (props.activeView) {
    case "modules":
      return <ModulesView {...props} />;
    case "administration":
      return <AdministrationView {...props} />;
    case "membershipRequests":
      return <MembershipRequestsView {...props} />;
    case "shop":
      return <ShopView {...props} />;
    case "member":
      return <MemberSpaceView {...props} />;
    case "wars":
      return <WarsView {...props} />;
    case "bank":
      return <BankView {...props} />;
    case "diplomacy":
      return <DiplomacyView {...props} />;
    case "messages":
      return <MessagesView {...props} />;
    case "forum":
      return <ForumView {...props} />;
    case "members":
      return <MembersView {...props} />;
    case "settings":
      return <SettingsView {...props} />;
    case "command":
    default:
      return <CommandCenter {...props} />;
  }
}

function getModulePermissionSummary(module) {
  return module.permissionKeys.length
    ? module.permissionKeys.map((permission) => getPermissionLabel(permission)).join(", ")
    : "Accès membre";
}

function getAdministrationModuleSummary(module) {
  if (!module.permissionKeys.length) return "Accès privé";
  return module.permissionKeys.map((permission) => getPermissionLabel(permission)).join(", ");
}

function getModuleDependencySummary(module) {
  const dependencyLabels = module.dependencies.map((moduleId) => guildOpsModuleById[moduleId]?.hubLabel || guildOpsModuleById[moduleId]?.label || moduleId);
  return dependencyLabels.length ? dependencyLabels.join(", ") : "Aucun prérequis";
}

export function ModulesView({ enabledModuleIds = [], onDisableModule, onEnableModule, onNavigate }) {
  const enabledSet = new Set(enabledModuleIds);
  const catalogModules = MODULE_CATALOG_IDS.map((moduleId) => guildOpsModuleById[moduleId]).filter(Boolean);
  const enabledCount = catalogModules.filter((module) => enabledSet.has(module.id)).length;

  return (
    <div className="page-grid module-registry-page">
      <section className="panel wide-panel">
        <PanelHeader icon={Settings} title="Modules GuildOps" meta={`${enabledCount}/${catalogModules.length} activés`} />
        <div className="module-registry-intro">
          <strong>Ajoute les outils quand ta guilde grandit.</strong>
          <p>Le site de guilde reste le point de départ. Active ensuite les modules qui répondent à un vrai besoin d'organisation.</p>
        </div>
        <div className="module-registry-grid">
          {catalogModules.map((module) => (
            <ModuleRegistryCard
              enabled={enabledSet.has(module.id)}
              key={module.id}
              module={module}
              onConfigure={() => onNavigate?.(module.view)}
              onDisable={() => onDisableModule?.(module.id)}
              onEnable={() => onEnableModule?.(module.id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

export function ModuleRegistryCard({ enabled = false, module, onConfigure, onDisable, onEnable }) {
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
      <div className="module-registry-actions">
        {enabled ? (
          <>
            <button type="button" onClick={onConfigure}>
              Configurer
            </button>
            <button className="ghost-mini" type="button" onClick={onDisable}>
              Désactiver
            </button>
          </>
        ) : (
          <button type="button" onClick={onEnable}>
            Activer
          </button>
        )}
      </div>
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
          <h1>{module.label}</h1>
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

export function AdministrationView({
  administrationAccess = {},
  currentUser,
  enabledModuleIds = [],
  members = [],
  onToggleAdministrationMember,
  onToggleAdministrationModule,
  onToggleAllAdministrationModules,
}) {
  const administrationModules = getAdministrationModules();
  const enabledSet = new Set(enabledModuleIds);
  const accessGuard = getGuardProps(currentUser, "admin_all");
  const canEditAdministration = can(currentUser, "admin_all");
  const activeMemberCount = members.filter((member) => (administrationAccess[member.id] || []).length > 0).length;
  const enabledAdminModuleCount = administrationModules.filter((module) => enabledSet.has(module.id)).length;
  const grantCount = members.reduce((total, member) => total + (administrationAccess[member.id] || []).length, 0);

  return (
    <div className="page-grid administration-page">
      <section className="panel wide-panel administration-panel">
        <PanelHeader icon={Shield} title="Administration" meta={`${activeMemberCount}/${members.length} membres`} />
        <div className="administration-summary">
          <article>
            <span>Membres avec accès</span>
            <strong>{activeMemberCount}</strong>
          </article>
          <article>
            <span>Modules administrables</span>
            <strong>{enabledAdminModuleCount}/{administrationModules.length}</strong>
          </article>
          <article>
            <span>Restrictions actives</span>
            <strong>{grantCount}</strong>
          </article>
        </div>
        <div className="administration-list">
          {members.map((member) => {
            const moduleIds = administrationAccess[member.id] || [];
            const hasAdministrationAccess = moduleIds.length > 0;
            const hasAllModules = administrationModules.every((module) => moduleIds.includes(module.id));

            return (
              <article className={`administration-row ${hasAdministrationAccess ? "is-admin" : ""}`} key={member.id}>
                <header className="administration-member">
                  <Avatar name={member.name} />
                  <span>
                    <strong>{member.name}</strong>
                    <small>{[member.power, member.status].filter(Boolean).join(" · ")}</small>
                  </span>
                  <RolePill role={getRoleLabel(member.role)} />
                  <button
                    className={`admin-access-toggle ${hasAdministrationAccess ? "is-on" : ""}`}
                    type="button"
                    aria-pressed={hasAdministrationAccess}
                    disabled={!canEditAdministration}
                    title={accessGuard.title}
                    onClick={() => onToggleAdministrationMember?.(member.id)}
                  >
                    <span />
                    {hasAdministrationAccess ? "Accès admin" : "Sans accès"}
                  </button>
                  <button
                    className="admin-all-toggle"
                    type="button"
                    aria-pressed={hasAllModules}
                    disabled={!canEditAdministration}
                    title={accessGuard.title}
                    onClick={() => onToggleAllAdministrationModules?.(member.id)}
                  >
                    {hasAllModules ? "Retirer tout" : "Tout"}
                  </button>
                </header>
                <div className="administration-modules" aria-label={`Restrictions modules pour ${member.name}`}>
                  {administrationModules.map((module) => {
                    const Icon = module.icon;
                    const isGranted = moduleIds.includes(module.id);
                    const isModuleEnabled = enabledSet.has(module.id);
                    const title = isModuleEnabled
                      ? getAdministrationModuleSummary(module)
                      : `${module.label} inactif pour cette guilde`;

                    return (
                      <button
                        className={`admin-module-chip ${isGranted ? "is-granted" : ""} ${isModuleEnabled ? "" : "is-inactive"}`}
                        type="button"
                        aria-pressed={isGranted}
                        disabled={!canEditAdministration}
                        key={module.id}
                        title={accessGuard.title || title}
                        onClick={() => onToggleAdministrationModule?.(member.id, module.id)}
                      >
                        <Icon size={15} />
                        <span>{module.hubLabel || module.navLabel || module.label}</span>
                        <small>{isModuleEnabled ? title : "Inactif"}</small>
                      </button>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function MembershipRequestsView({
  currentUser,
  memberModerationError = "",
  membershipRequests = [],
  moderatingMemberId = "",
  onRotateInviteLink,
  onApproveMembershipRequest,
  onBlockMembershipRequest,
  onRefuseMembershipRequest,
  rotatingInviteLink = false,
  selectedGuild,
  siteDraft,
}) {
  const guildSlug = slugify(selectedGuild?.name || "");
  const requests = membershipRequests.filter((request) => !guildSlug || request.guildSlug === guildSlug);
  const pendingRequests = requests.filter((request) => request.status === "pending");
  const approvedRequests = requests.filter((request) => request.status === "approved");
  const refusedRequests = requests.filter((request) => request.status === "refused");
  const approvalGuard = getGuardProps(currentUser, "approve_members");
  const canApprove = can(currentUser, "approve_members");
  const memberGuard = getGuardProps(currentUser, "manage_members");
  const canBlock = can(currentUser, "manage_members");
  const [inviteCopied, setInviteCopied] = useState(false);
  const inviteUrl = siteDraft?.memberInviteUrl
    ? new URL(siteDraft.memberInviteUrl, window.location.origin).href
    : "";

  async function copyInviteLink() {
    if (!inviteUrl || !navigator.clipboard) return;

    await navigator.clipboard.writeText(inviteUrl);
    setInviteCopied(true);
    window.setTimeout(() => setInviteCopied(false), 1400);
  }

  return (
    <div className="page-grid membership-requests-page">
      <section className="panel wide-panel membership-requests-panel">
        <PanelHeader icon={UserCheck} title="Adhésions" meta={`${pendingRequests.length} en attente`} />
        <div className="membership-request-summary">
          <article>
            <span>À valider</span>
            <strong>{pendingRequests.length}</strong>
          </article>
          <article>
            <span>Acceptées</span>
            <strong>{approvedRequests.length}</strong>
          </article>
          <article>
            <span>Refusées</span>
            <strong>{refusedRequests.length}</strong>
          </article>
        </div>
        <div className="membership-request-intro">
          <UserCheck size={22} />
          <span>
            <strong>Les joueurs sans lien d'invitation ne sont pas activés automatiquement.</strong>
            <small>Ils arrivent ici en demande, puis un rôle autorisé peut accepter ou refuser l'accès.</small>
          </span>
        </div>
        {memberModerationError ? (
          <p className="membership-moderation-error">
            <AlertTriangle size={16} />
            {memberModerationError}
          </p>
        ) : null}
        <div className="membership-invite-tools">
          <span>
            <strong>Lien d'invitation actif</strong>
            <small>Renouveler ce lien désactive immédiatement l'ancien.</small>
          </span>
          <input readOnly value={inviteUrl} onFocus={(event) => event.target.select()} aria-label="Lien d'invitation actif" />
          <button type="button" onClick={copyInviteLink} disabled={!inviteUrl}>
            {inviteCopied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
            {inviteCopied ? "Copié" : "Copier"}
          </button>
          <button type="button" onClick={onRotateInviteLink} disabled={!canApprove || rotatingInviteLink}>
            <RefreshCw size={16} />
            {rotatingInviteLink ? "Renouvellement..." : "Renouveler"}
          </button>
        </div>
        <div className="membership-request-list">
          {requests.length ? (
            requests.map((request) => {
              const isPending = request.status === "pending";
              const canBlockRequest = request.status !== "approved";
              const statusLabel = {
                approved: "Acceptée",
                pending: "En attente",
                refused: "Refusée",
              }[request.status] || request.status;

              return (
                <article className={`membership-request-card is-${request.status}`} key={request.id}>
                  <header>
                    <span className="membership-request-avatar">{request.nickname.slice(0, 1).toUpperCase()}</span>
                    <span>
                      <strong>{request.nickname}</strong>
                      <small>{[request.guildName, request.game, request.realm].filter(Boolean).join(" · ")}</small>
                    </span>
                    <em className={`status-chip ${request.status}`}>{statusLabel}</em>
                  </header>
                  <p>{request.message}</p>
                  <footer>
                    <span>
                      <Clock3 size={15} />
                      {formatMembershipRequestDate(request.requestedAt)}
                    </span>
                    {request.decidedAt ? (
                      <span>
                        <CheckCircle2 size={15} />
                        {statusLabel} par {request.decidedBy || "Admin"}
                      </span>
                    ) : null}
                    <span className="membership-request-actions">
                      <button
                        type="button"
                        onClick={() => onApproveMembershipRequest?.(request.id)}
                        disabled={!isPending || !canApprove}
                        title={!isPending ? "Demande déjà traitée" : approvalGuard.title}
                      >
                        <CheckCircle2 size={16} />
                        Accepter
                      </button>
                      <button
                        type="button"
                        onClick={() => onRefuseMembershipRequest?.(request.id)}
                        disabled={!isPending || !canApprove}
                        title={!isPending ? "Demande déjà traitée" : approvalGuard.title}
                      >
                        <X size={16} />
                        Refuser
                      </button>
                      <button
                        type="button"
                        onClick={() => onBlockMembershipRequest?.(request.id)}
                        disabled={!canBlockRequest || !canBlock || moderatingMemberId === request.id}
                        title={!canBlockRequest ? "Demande déjà acceptée" : memberGuard.title}
                      >
                        <Ban size={16} />
                        {moderatingMemberId === request.id ? "Blocage..." : "Bloquer"}
                      </button>
                    </span>
                  </footer>
                </article>
              );
            })
          ) : (
            <p className="empty-state">Aucune demande pour cette guilde. Les demandes hors invitation apparaîtront ici.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function formatMembershipRequestDate(value) {
  if (!value) return "Date inconnue";

  try {
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function MembersView({
  currentUser,
  guilds: availableGuilds,
  memberBlocks = [],
  memberModerationError = "",
  members,
  moderatingMemberId = "",
  onBanGuildMember,
  onUnblockGuildMember,
  roleEdits,
  selectedGuild,
  setRoleEdits,
}) {
  const memberGuard = getGuardProps(currentUser, "manage_members");
  const roleGuard = getGuardProps(currentUser, "manage_roles");
  const canManageMembers = can(currentUser, "manage_members");
  const selectedGuildSlug = slugify(selectedGuild?.name || "");
  const selectedGuildId = selectedGuild?.id || "";
  const activeBlocks = memberBlocks.filter(
    (block) =>
      block.active !== false &&
      (!selectedGuildId || !block.guildId || block.guildId === selectedGuildId) &&
      (!selectedGuildSlug || !block.guildSlug || block.guildSlug === selectedGuildSlug),
  );

  return (
    <div className="page-grid two-columns">
      <section className="panel wide-panel">
        <PanelHeader icon={Users} title="Membres, roles et objectifs" meta={`${members.length} actifs`} />
        {memberModerationError ? (
          <p className="membership-moderation-error">
            <AlertTriangle size={16} />
            {memberModerationError}
          </p>
        ) : null}
        <div className="member-role-list">
          {members.map((member) => {
            const isCurrentMember = member.userId === currentUser.id || member.id === currentUser.id;
            const isBusy = moderatingMemberId === member.id;

            return (
              <div className="member-role-row" key={member.id}>
                <Avatar name={member.name} />
                <span>
                  <strong>{member.name}</strong>
                  <small>{[member.power, member.status].filter(Boolean).join(" · ")}</small>
                </span>
                <select
                  value={roleEdits[member.id]}
                  onChange={(event) => {
                    if (can(currentUser, "manage_roles")) {
                      setRoleEdits((current) => ({ ...current, [member.id]: event.target.value }));
                    }
                  }}
                  {...roleGuard}
                >
                  {permissionRoles.map((role) => (
                    <option key={role.code}>{role.role}</option>
                  ))}
                </select>
                <input defaultValue={member.objective || "Presence events"} {...memberGuard} />
                <span className="member-role-actions">
                  <button
                    className="member-ban-action"
                    type="button"
                    onClick={() => onBanGuildMember?.(member.id)}
                    disabled={!canManageMembers || isCurrentMember || isBusy}
                    title={isCurrentMember ? "Impossible de te bannir toi-même" : memberGuard.title}
                  >
                    <Ban size={16} />
                    {isBusy ? "Ban..." : "Bannir + bloquer"}
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </section>
      <section className="panel member-block-panel">
        <PanelHeader icon={Ban} title="Joueurs bloqués" meta={`${activeBlocks.length} actifs`} />
        <div className="member-block-list">
          {activeBlocks.length ? (
            activeBlocks.map((block) => (
              <article className="member-block-card" key={block.id}>
                <header>
                  <span className="membership-request-avatar">{block.nickname.slice(0, 1).toUpperCase()}</span>
                  <span>
                    <strong>{block.nickname}</strong>
                    <small>{formatMembershipRequestDate(block.blockedAt)}</small>
                  </span>
                  <em className="status-chip banned">Bloqué</em>
                </header>
                <p>{block.reason}</p>
                <footer>
                  <small>Par {block.blockedByName || "Admin"}</small>
                  <button
                    type="button"
                    onClick={() => onUnblockGuildMember?.(block.id)}
                    disabled={!canManageMembers || moderatingMemberId === block.id}
                    title={memberGuard.title}
                  >
                    <Lock size={15} />
                    {moderatingMemberId === block.id ? "Déblocage..." : "Débloquer"}
                  </button>
                </footer>
              </article>
            ))
          ) : (
            <p className="empty-state">Aucun joueur bloqué pour cette guilde.</p>
          )}
        </div>
      </section>
      <PermissionsMatrix currentUser={currentUser} />
      <MergePanel currentUser={currentUser} guilds={availableGuilds} selectedGuild={selectedGuild} />
    </div>
  );
}

export function SettingsView({ currentUser, selectedGuild, guilds: availableGuilds, onGuildChange }) {
  return (
    <div className="page-grid two-columns">
      <section className="panel">
        <PanelHeader icon={Globe2} title="Gestion multi-guildes / multi-mondes" meta={selectedGuild?.realm || selectedGuild?.server || "Contexte actif"} />
        <div className="settings-list">
          {availableGuilds.map((guild) => (
            <div className={`settings-row ${getGuildKey(guild) === getGuildKey(selectedGuild) ? "is-active" : ""}`} key={getGuildKey(guild)}>
              <Shield size={18} />
              <span>
                <strong>{guild.name}</strong>
                <small>
                  {[guild.game, guild.realm || guild.server, guild.language].filter(Boolean).join(" · ")}
                </small>
              </span>
              <button
                type="button"
                onClick={() => onGuildChange?.(guild)}
                disabled={getGuildKey(guild) === getGuildKey(selectedGuild)}
              >
                {getGuildKey(guild) === getGuildKey(selectedGuild) ? "Active" : "Activer"}
              </button>
            </div>
          ))}
        </div>
      </section>
      <MergePanel currentUser={currentUser} guilds={availableGuilds} selectedGuild={selectedGuild} />
      <PermissionsMatrix currentUser={currentUser} />
    </div>
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
