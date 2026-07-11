import React from "react";
import {
  Bell,
  BellOff
} from "lucide-react";

export function PushNotificationPreference({ notificationProps = {} }) {
  const {
    pushState = {},
    onDisablePush,
    onEnablePush,
  } = notificationProps;
  const enabled = Boolean(pushState.enabled);
  const busy = Boolean(pushState.enabling);
  const unavailable = Boolean(
    !pushState.supported ||
      (!enabled && !pushState.configured) ||
      pushState.permission === "denied",
  );
  const Icon = enabled ? Bell : BellOff;
  const title = enabled ? "Notifications push actives" : "Notifications push inactives";
  const detail = getPushDetail(pushState);

  async function togglePush() {
    if (busy || unavailable) return;

    if (enabled) {
      await onDisablePush?.();
      return;
    }

    await onEnablePush?.();
  }

  return (
    <div className={`notification-preference-card ${enabled ? "is-enabled" : ""}`}>
      <span className="notification-preference-icon">
        <Icon size={18} />
      </span>
      <span className="notification-preference-main">
        <strong>{title}</strong>
        <small>{detail}</small>
        {pushState.message ? <em>{pushState.message}</em> : null}
      </span>
      <button
        className="notification-preference-action"
        type="button"
        onClick={togglePush}
        disabled={busy || unavailable}
      >
        {busy ? "..." : enabled ? "Désactiver" : "Activer"}
      </button>
    </div>
  );
}

function getPushDetail(pushState = {}) {
  if (!pushState.supported) return "Non supporté par ce navigateur.";
  if (pushState.permission === "denied") return "Autorisation navigateur refusée.";
  if (!pushState.configured) return "Configuration serveur requise.";
  if (pushState.enabled) return "Alertes importantes sur cet appareil.";
  return "Alertes importantes sur cet appareil.";
}
