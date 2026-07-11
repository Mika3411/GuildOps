import React, {
  useEffect,
  useRef,
  useState
} from "react";
import {
  AlertTriangle,
  Bell,
  Command,
  Home,
  MailCheck,
  RefreshCw,
  Rocket,
  Search,
  Shield,
  Zap
} from "lucide-react";
import {
  GAME_OPTIONS,
  REALM_CODE_MAX_LENGTH,
  getRealmPlaceholderForGame,
  normalizeRealmCodeForGame
} from "../../../config/guildOpsConfig.js";
import {
  clearPendingPushOptIn,
  hasPendingPushOptIn,
  rememberPendingPushOptIn
} from "../../../lib/pushOptInPreference.js";
import {
  formatAuthError,
  getAuthErrorDetails
} from "../../../lib/authErrors.js";
import { PasswordInput } from "../../shared/PasswordInput.jsx";

const emailVerificationRequests = new Map();
const REGISTER_PASSWORD_MIN_LENGTH = 10;

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

export function AuthGate({ authSession, initialMode = "login", notificationProps, onNavigatePublicPath }) {
  const initialEmail = getAuthEmailFromLocation();
  const [mode, setMode] = useState(initialMode === "register" ? "register" : "login");
  const [form, setForm] = useState({
    displayName: "",
    email: initialEmail,
    organizationName: "",
    password: "",
  });
  const [error, setError] = useState(() => (authSession.status === "error" ? "" : formatAuthError(authSession.error || "")));
  const [notice, setNotice] = useState("");
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState("");
  const [pushOptIn, setPushOptIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verificationUrl, setVerificationUrl] = useState("");
  const isRegister = mode === "register";

  useEffect(() => {
    setMode(initialMode === "register" ? "register" : "login");
  }, [initialMode]);

  useEffect(() => {
    if (initialEmail && !form.email) {
      setForm((current) => ({ ...current, email: initialEmail }));
    }
  }, [form.email, initialEmail]);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setError("");
    setNotice("");
    setVerificationUrl("");
  }

  function openPublicPath(path) {
    if (typeof onNavigatePublicPath === "function") {
      onNavigatePublicPath(path);
      return;
    }

    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  function validateForm() {
    const email = form.email.trim();
    const password = form.password.trim();

    if (!email || !password) {
      return "Indiquez votre email et votre mot de passe.";
    }

    if (!isValidEmail(email)) {
      return "Utilisez une adresse email valide.";
    }

    if (isRegister) {
      if (form.displayName.trim().length < 2) {
        return "Indiquez un nom affiche de 2 caracteres minimum.";
      }

      if (password.length < REGISTER_PASSWORD_MIN_LENGTH) {
        return `Le mot de passe doit contenir au moins ${REGISTER_PASSWORD_MIN_LENGTH} caracteres.`;
      }
    }

    return "";
  }

  async function submitAuth(event) {
    event.preventDefault();
    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      setNotice("");
      setVerificationUrl("");
      return;
    }

    setSubmitting(true);
    setError("");
    setNotice("");
    setVerificationUrl("");

    try {
      if (isRegister) {
        const payload = await authSession.register({
          displayName: form.displayName,
          email: form.email.trim(),
          organizationName: form.organizationName || undefined,
          password: form.password,
          preferredLanguage: "fr",
        });

        if (payload?.status === "verification_required") {
          if (pushOptIn) {
            rememberPendingPushOptIn(payload.email || form.email);
          }
          setPendingVerificationEmail(payload.email || form.email);
          setNotice(payload.message || "Compte cree. Consultez votre email pour valider la connexion.");
          setVerificationUrl(payload.verificationUrl || "");
          setMode("login");
        } else if (payload?.user && pushOptIn) {
          await notificationProps?.onEnablePush?.();
        }
      } else {
        await authSession.login({
          email: form.email.trim(),
          password: form.password,
        });
        if (hasPendingPushOptIn(form.email.trim())) {
          const enabled = await notificationProps?.onEnablePush?.();
          if (enabled) {
            clearPendingPushOptIn(form.email.trim());
          }
        }
      }
    } catch (submitError) {
      const details = submitError?.payload?.error?.details || {};

      if (details.reason === "EMAIL_NOT_VERIFIED") {
        setPendingVerificationEmail(details.email || form.email);
        setNotice(submitError?.message || "Email non verifie. Un nouveau lien vient d'etre envoye.");
        setVerificationUrl(details.verificationUrl || "");
        setMode("login");
      } else {
        if (getAuthErrorDetails(submitError).reason === "EMAIL_ALREADY_EXISTS") {
          setPendingVerificationEmail(form.email);
        }
        setError(formatAuthError(submitError, { action: isRegister ? "register" : "login" }));
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
        <div className="auth-public-actions" aria-label="Navigation publique">
          <button type="button" onClick={() => openPublicPath("/")}>
            <Home size={16} />
            Accueil
          </button>
          <button type="button" onClick={() => openPublicPath("/guildes")}>
            <Search size={16} />
            Galerie
          </button>
        </div>
        <div className="auth-tabs" role="tablist" aria-label="Authentification">
          <button className={!isRegister ? "is-active" : ""} type="button" onClick={() => switchMode("login")}>
            Connexion
          </button>
          <button className={isRegister ? "is-active" : ""} type="button" onClick={() => switchMode("register")}>
            Inscription
          </button>
        </div>
        <form className="auth-form" onSubmit={submitAuth} noValidate>
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
            <PasswordInput
              autoComplete={isRegister ? "new-password" : "current-password"}
              minLength={isRegister ? REGISTER_PASSWORD_MIN_LENGTH : 1}
              value={form.password}
              onChange={(event) => updateField("password", event.target.value)}
              required
            />
            {isRegister ? <small className="auth-field-hint">{REGISTER_PASSWORD_MIN_LENGTH} caracteres minimum.</small> : null}
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

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getAuthEmailFromLocation() {
  if (typeof window === "undefined") return "";

  try {
    return String(new URLSearchParams(window.location.search).get("email") || "").trim().toLowerCase();
  } catch {
    return "";
  }
}

export function VerifyEmailRoute({ authSession, notificationProps, onBackToLogin, onVerified }) {
  const [error, setError] = useState("");
  const [status, setStatus] = useState("verifying");
  const [verifiedEmail, setVerifiedEmail] = useState("");
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
      .then((payload) => {
        const email = payload?.user?.email || "";
        if (email && hasPendingPushOptIn(email)) {
          setVerifiedEmail(email);
          setStatus("push-ready");
          return;
        }

        setStatus("success");
        window.setTimeout(() => onVerified?.(), 650);
      })
      .catch((verifyError) => {
        setError(verifyError?.message || "Lien de validation invalide ou expire.");
        setStatus("error");
      });
  }, [authSession, onVerified]);

  async function enablePushAndContinue() {
    setStatus("push-enabling");
    const enabled = await notificationProps?.onEnablePush?.();

    if (enabled) {
      clearPendingPushOptIn(verifiedEmail);
      onVerified?.();
      return;
    }

    setStatus("push-ready");
  }

  function continueWithoutPush() {
    clearPendingPushOptIn(verifiedEmail);
    onVerified?.();
  }

  const awaitingPush = status === "push-ready" || status === "push-enabling";

  return (
    <main className="auth-shell command-state-shell">
      <section className="auth-panel command-state-card">
        <div className="brand-lockup auth-brand">
          <div className={`brand-mark ${status === "error" ? "danger" : ""}`}>
            {status === "error" ? <AlertTriangle size={28} /> : awaitingPush ? <Bell size={28} /> : <MailCheck size={28} />}
          </div>
          <span>GuildOps</span>
        </div>
        <h1>{awaitingPush ? "Notifications" : status === "success" ? "Email valide" : status === "error" ? "Validation impossible" : "Validation en cours"}</h1>
        <p>
          {awaitingPush
            ? "Ton compte est active. Tu peux recevoir les alertes importantes sur cet appareil."
            : status === "success"
            ? "Votre compte est active. Ouverture de l'espace GuildOps..."
            : status === "error"
              ? error
              : "Nous confirmons le lien recu par email."}
        </p>
        {awaitingPush ? (
          <div className="state-actions">
            <button className="primary-action" type="button" onClick={enablePushAndContinue} disabled={status === "push-enabling"}>
              <Bell size={17} />
              {status === "push-enabling" ? "Activation..." : "Activer"}
            </button>
            <button className="ghost-action" type="button" onClick={continueWithoutPush} disabled={status === "push-enabling"}>
              Continuer sans
            </button>
            {notificationProps?.pushState?.message ? <p className="auth-notice">{notificationProps.pushState.message}</p> : null}
          </div>
        ) : null}
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
    description: "",
    isPublic: false,
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
            {currentUser.displayName || "Commandant"}, commence par une guilde privée. Le site public reste optionnel et peut
            être préparé plus tard depuis les modules.
          </p>
          <div className="onboarding-steps" aria-label="Étapes de démarrage">
            <span>Profil</span>
            <span>Modules</span>
            <span>Site optionnel</span>
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
          <label className="form-row wide">
            <span>Brief</span>
            <textarea value={form.description} onChange={(event) => updateField("description", event.target.value)} placeholder="Objectif KvK, NAP, consignes..." />
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={form.isPublic} onChange={(event) => updateField("isPublic", event.target.checked)} />
            <span>
              Préparer aussi un site public brouillon
              <small>Laisse décoché pour créer seulement la guilde privée.</small>
            </span>
          </label>
          {error ? <p className="auth-error" aria-live="polite">{error}</p> : null}
          <button className="primary-action" type="submit" disabled={creating} aria-busy={creating ? "true" : undefined}>
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
