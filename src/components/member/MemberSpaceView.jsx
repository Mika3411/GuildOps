import React, {
  useEffect,
  useMemo,
  useState
} from "react";
import {
  Bell,
  CheckCircle2,
  Clock3,
  CreditCard,
  KeyRound,
  Lock,
  Mail,
  PackageCheck,
  ShieldCheck,
  UserRound
} from "lucide-react";
import {
  LiveStatus,
  PanelHeader
} from "../shared/Shared.jsx";
import {
  PushNotificationPreference
} from "../shared/PushNotificationPreference.jsx";
import { PasswordInput } from "../shared/PasswordInput.jsx";

const LANGUAGE_OPTIONS = Object.freeze([
  { value: "fr", label: "FR - Francais" },
  { value: "en", label: "EN - Anglais" },
  { value: "es", label: "ES - Espagnol" },
]);

const MEMBER_ORDERS = Object.freeze([
  {
    id: "CMD-1042",
    product: "Emojis Officiers",
    amount: 9,
    orderedAt: "2026-06-29T10:20:00.000Z",
    delivery: "Pack PNG + Discord ready",
    status: "Livré",
    statusKey: "fulfilled",
    nextStep: "Disponible dans les fichiers du compte",
    steps: ["Paiement confirme", "Preparation", "Livraison", "Disponible"],
    currentStep: 3,
  },
  {
    id: "CMD-1041",
    product: "Template War Room",
    amount: 29,
    orderedAt: "2026-06-24T16:45:00.000Z",
    delivery: "ZIP + guide Notion",
    status: "Livré",
    statusKey: "fulfilled",
    nextStep: "Version 1.2 synchronisee",
    steps: ["Paiement confirme", "Preparation", "Livraison", "Disponible"],
    currentStep: 3,
  },
  {
    id: "CMD-1040",
    product: "Pack images Camp Nord",
    amount: 19,
    orderedAt: "2026-06-21T08:10:00.000Z",
    delivery: "PNG haute resolution",
    status: "En cours",
    statusKey: "pending",
    nextStep: "Preparation des variantes bannieres",
    steps: ["Paiement confirme", "Preparation", "Livraison", "Disponible"],
    currentStep: 1,
  },
]);

function formatPrice(value) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function normalizeLanguage(value) {
  const safeValue = String(value || "fr").toLowerCase();
  return LANGUAGE_OPTIONS.some((option) => option.value === safeValue) ? safeValue : "fr";
}

export function MemberSpaceView({ authSession, currentUser, notificationProps }) {
  const [selectedOrderId, setSelectedOrderId] = useState(MEMBER_ORDERS[0].id);
  const [profileForm, setProfileForm] = useState(() => createProfileForm(currentUser));
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [profileStatus, setProfileStatus] = useState({ kind: "", message: "" });
  const [passwordStatus, setPasswordStatus] = useState({ kind: "", message: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const selectedOrder = MEMBER_ORDERS.find((order) => order.id === selectedOrderId) || MEMBER_ORDERS[0];
  const deliveredOrders = MEMBER_ORDERS.filter((order) => order.statusKey === "fulfilled").length;
  const pendingOrders = MEMBER_ORDERS.length - deliveredOrders;
  const activeGuild = authSession?.context?.activeGuild;
  const activeOrganization = authSession?.context?.activeOrganization;
  const emailVerified = Boolean(currentUser?.emailVerifiedAt);
  const memberMeta = [activeGuild?.name, activeOrganization?.name].filter(Boolean).join(" · ");

  useEffect(() => {
    setProfileForm(createProfileForm(currentUser));
  }, [currentUser?.displayName, currentUser?.email, currentUser?.preferredLanguage]);

  function updateProfileField(key, value) {
    setProfileForm((current) => ({ ...current, [key]: value }));
  }

  function updatePasswordField(key, value) {
    setPasswordForm((current) => ({ ...current, [key]: value }));
  }

  async function saveProfile(event) {
    event.preventDefault();
    setSavingProfile(true);
    setProfileStatus({ kind: "", message: "" });

    try {
      if (authSession?.isApiEnabled && authSession?.updateMe) {
        await authSession.updateMe({
          displayName: profileForm.displayName,
          preferredLanguage: profileForm.preferredLanguage,
        });
      }

      setProfileStatus({ kind: "success", message: "Informations personnelles mises a jour." });
    } catch (error) {
      setProfileStatus({ kind: "error", message: error?.message || "Mise a jour impossible." });
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setSavingPassword(true);
    setPasswordStatus({ kind: "", message: "" });

    try {
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        throw new Error("Les deux nouveaux mots de passe ne correspondent pas.");
      }

      if (passwordForm.newPassword.length < 10) {
        throw new Error("Le nouveau mot de passe doit contenir au moins 10 caracteres.");
      }

      if (authSession?.isApiEnabled && authSession?.changePassword) {
        await authSession.changePassword({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        });
      }

      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setPasswordStatus({ kind: "success", message: "Mot de passe modifie." });
    } catch (error) {
      setPasswordStatus({ kind: "error", message: error?.message || "Modification impossible." });
    } finally {
      setSavingPassword(false);
    }
  }

  const accountSummary = useMemo(
    () => [
      { label: "Commandes", value: String(MEMBER_ORDERS.length), icon: PackageCheck },
      { label: "Livrees", value: String(deliveredOrders), icon: CheckCircle2 },
      { label: "En cours", value: String(pendingOrders), icon: Clock3 },
    ],
    [deliveredOrders, pendingOrders],
  );

  return (
    <div className="page-grid member-page">
      <section className="panel wide-panel member-hero-panel">
        <PanelHeader icon={UserRound} title="Profil membre" meta={memberMeta || "Compte GuildOps"} />
        <div className="member-hero-grid">
          <div className="member-profile-card">
            <span className="member-avatar">{currentUser?.initials || "GO"}</span>
            <span>
              <strong>{profileForm.displayName || "Membre GuildOps"}</strong>
              <small>{profileForm.email || "Email non renseigne"}</small>
            </span>
            <LiveStatus as="em" className={emailVerified ? "is-verified" : ""}>
              {emailVerified ? <ShieldCheck aria-hidden="true" focusable="false" size={15} /> : <Mail aria-hidden="true" focusable="false" size={15} />}
              {emailVerified ? "Email valide" : "Email a valider"}
            </LiveStatus>
          </div>
          <div className="member-summary-grid" aria-label="Synthese membre">
            {accountSummary.map((item) => (
              <article key={item.label}>
                <item.icon size={18} />
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="panel member-orders-panel">
        <PanelHeader icon={PackageCheck} title="Suivi de commandes" meta={`${MEMBER_ORDERS.length} commandes`} />
        <div className="member-order-list">
          {MEMBER_ORDERS.map((order) => (
            <button
              aria-pressed={selectedOrder.id === order.id}
              className={`member-order-row ${selectedOrder.id === order.id ? "is-selected" : ""}`}
              key={order.id}
              onClick={() => setSelectedOrderId(order.id)}
              type="button"
            >
              <span>
                <strong>{order.product}</strong>
                <small>{order.id} · {formatDate(order.orderedAt)}</small>
              </span>
              <em>{formatPrice(order.amount)}</em>
              <i className={`status-chip ${order.statusKey}`}>{order.status}</i>
            </button>
          ))}
        </div>
      </section>

      <section className="panel member-order-detail-panel">
        <PanelHeader icon={CreditCard} title="Détail commande" meta={selectedOrder.id} />
        <div className="member-order-detail">
          <strong>{selectedOrder.product}</strong>
          <span>{selectedOrder.delivery}</span>
          <small>{selectedOrder.nextStep}</small>
        </div>
        <div className="member-order-timeline">
          {selectedOrder.steps.map((step, index) => (
            <span
              className={index <= selectedOrder.currentStep ? "is-done" : ""}
              key={step}
            >
              <i />
              {step}
            </span>
          ))}
        </div>
      </section>

      <section className="panel member-profile-panel">
        <PanelHeader icon={UserRound} title="Informations personnelles" meta="Profil" />
        <form className="member-form-grid" onSubmit={saveProfile}>
          <label className="form-row">
            <span>Nom affiche</span>
            <input
              autoComplete="name"
              maxLength={80}
              minLength={2}
              onChange={(event) => updateProfileField("displayName", event.target.value)}
              required
              value={profileForm.displayName}
            />
          </label>
          <label className="form-row">
            <span>Email</span>
            <input autoComplete="email" readOnly type="email" value={profileForm.email} />
          </label>
          <label className="form-row">
            <span>Langue</span>
            <select value={profileForm.preferredLanguage} onChange={(event) => updateProfileField("preferredLanguage", event.target.value)}>
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {profileStatus.message ? <StatusMessage status={profileStatus} /> : null}
          <button className="primary-action" type="submit" disabled={savingProfile}>
            <ShieldCheck size={17} />
            {savingProfile ? "Enregistrement..." : "Enregistrer"}
          </button>
        </form>
      </section>

      <section className="panel member-notifications-panel">
        <PanelHeader icon={Bell} title="Notifications" meta={notificationProps?.pushState?.enabled ? "Actives" : "Inactives"} />
        <PushNotificationPreference notificationProps={notificationProps} />
      </section>

      <section className="panel member-password-panel">
        <PanelHeader icon={KeyRound} title="Mot de passe" meta="Securite" />
        <form className="member-form-grid" onSubmit={changePassword}>
          <label className="form-row wide">
            <span>Mot de passe actuel</span>
            <PasswordInput
              autoComplete="current-password"
              onChange={(event) => updatePasswordField("currentPassword", event.target.value)}
              required
              value={passwordForm.currentPassword}
            />
          </label>
          <label className="form-row">
            <span>Nouveau mot de passe</span>
            <PasswordInput
              autoComplete="new-password"
              minLength={10}
              onChange={(event) => updatePasswordField("newPassword", event.target.value)}
              required
              value={passwordForm.newPassword}
            />
          </label>
          <label className="form-row">
            <span>Confirmation</span>
            <PasswordInput
              autoComplete="new-password"
              minLength={10}
              onChange={(event) => updatePasswordField("confirmPassword", event.target.value)}
              required
              value={passwordForm.confirmPassword}
            />
          </label>
          {passwordStatus.message ? <StatusMessage status={passwordStatus} /> : null}
          <button className="primary-action" type="submit" disabled={savingPassword}>
            <Lock size={17} />
            {savingPassword ? "Modification..." : "Modifier le mot de passe"}
          </button>
        </form>
      </section>
    </div>
  );
}

function StatusMessage({ status }) {
  const isError = status.kind === "error";

  return (
    <LiveStatus as="p" className={isError ? "auth-error" : "auth-notice"} politeness={isError ? "assertive" : "polite"}>
      {isError ? <Lock aria-hidden="true" focusable="false" size={17} /> : <CheckCircle2 aria-hidden="true" focusable="false" size={17} />}
      <span>{status.message}</span>
    </LiveStatus>
  );
}

function createProfileForm(currentUser) {
  return {
    displayName: currentUser?.displayName || "",
    email: currentUser?.email || "",
    preferredLanguage: normalizeLanguage(currentUser?.preferredLanguage),
  };
}
