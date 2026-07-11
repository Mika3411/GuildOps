import React, {
  useEffect,
  useState
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Command,
  Globe2,
  MailCheck,
  RefreshCw,
  Shield,
  UserPlus
} from "lucide-react";
import {
  guildOpsApi
} from "../../../lib/guildOpsApi.js";
import {
  formatAuthError,
  getAuthErrorDetails
} from "../../../lib/authErrors.js";
import {
  clearPendingPushOptIn,
  hasPendingPushOptIn,
  rememberPendingPushOptIn
} from "../../../lib/pushOptInPreference.js";
import {
  createGuildSiteDraft,
  getMemberInviteToken,
  loadPublishedSite,
  savePublishedSite,
  slugify
} from "../../../lib/guildSiteStore.js";
import { PasswordInput } from "../../shared/PasswordInput.jsx";

export function JoinGuildRoute({
  authSession,
  inviteSlug,
  inviteToken = "",
  isInviteLink = false,
  memberBlocks = [],
  notificationProps,
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
  const [error, setError] = useState(() => formatAuthError(authSession.error || ""));
  const [joined, setJoined] = useState(false);
  const [nickname, setNickname] = useState(authSession.user?.displayName || "");
  const [notice, setNotice] = useState("");
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState("");
  const [pushOptIn, setPushOptIn] = useState(false);
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
          if (pushOptIn) {
            rememberPendingPushOptIn(payload.email || authForm.email);
          }
          setPendingVerificationEmail(payload.email || authForm.email);
          setNotice(payload.message || "Compte cree. Valide ton email puis reviens sur ce lien.");
          setVerificationUrl(payload.verificationUrl || "");
          setAuthMode("login");
        } else if (payload?.user) {
          if (pushOptIn) {
            await notificationProps?.onEnablePush?.();
          }
          setNotice("Compte connecte. Confirme l'entree dans la guilde.");
        }
      } else {
        await authSession.login({
          email: authForm.email,
          password: authForm.password,
        });
        if (hasPendingPushOptIn(authForm.email)) {
          const enabled = await notificationProps?.onEnablePush?.();
          if (enabled) {
            clearPendingPushOptIn(authForm.email);
          }
        }
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
        if (getAuthErrorDetails(submitError).reason === "EMAIL_ALREADY_EXISTS") {
          setPendingVerificationEmail(authForm.email);
          setAuthMode("login");
        }
        setError(formatAuthError(submitError, { action: isRegister ? "register" : "login" }));
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
                  <PasswordInput
                    autoComplete={isRegister ? "new-password" : "current-password"}
                    minLength={isRegister ? 10 : 1}
                    value={authForm.password}
                    onChange={(event) => updateAuthField("password", event.target.value)}
                    required
                  />
                </label>
                {isRegister ? (
                  <label className="checkbox-row auth-notification-optin">
                    <input
                      type="checkbox"
                      checked={pushOptIn}
                      onChange={(event) => setPushOptIn(event.target.checked)}
                      disabled={notificationProps?.pushState?.supported === false}
                    />
                    <span>
                      Activer les notifications
                      <small>Disponible après validation du compte.</small>
                    </span>
                  </label>
                ) : null}
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
