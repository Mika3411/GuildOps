import {
  useEffect,
  useState
} from "react";
import {
  guildOpsApi
} from "../lib/guildOpsApi.js";
import {
  can
} from "../lib/rbac.js";
import {
  getApiGuildId,
  getSosAckLabel,
  isUuid,
  mergeSosAcknowledgement,
  normalizeSosAlert,
  normalizeSosCallKind,
  parseCoordinate,
  parseRealtimeEvent,
  upsertSosAlert
} from "../lib/guildOpsTransforms.js";

export function useSosController({
  apiEnabled,
  currentUser,
  selectedGuild,
  guildOpsData,
  currentMemberId,
  moduleAuthorized = true,
  moduleEnabled = true
}) {
  const sosActive = moduleEnabled && moduleAuthorized;
  const [sosAlerts, setSosAlerts] = useState(() => (sosActive ? guildOpsData.sosAlerts : []));
  const [sosForm, setSosForm] = useState(() => guildOpsData.sosForm);
  const [sosRealtimeStatus, setSosRealtimeStatus] = useState(() => getSosInactiveStatus({ apiEnabled, moduleAuthorized, moduleEnabled }));
  const [sosError, setSosError] = useState("");

  useEffect(() => {
    setSosAlerts(sosActive ? guildOpsData.sosAlerts : []);
    setSosForm(guildOpsData.sosForm);
  }, [guildOpsData, sosActive]);

  useEffect(() => {
    const guildId = getApiGuildId(selectedGuild);

    if (!sosActive) {
      setSosRealtimeStatus(getSosInactiveStatus({ apiEnabled, moduleAuthorized, moduleEnabled }));
      return undefined;
    }

    if (!apiEnabled || !guildId) {
      setSosRealtimeStatus("API requise");
      return undefined;
    }

    const controller = new AbortController();
    let stream;
    setSosRealtimeStatus("Connexion...");
    setSosError("");

    guildOpsApi
      .listAttackAlerts(guildId, { status: "active", limit: 50 }, { signal: controller.signal })
      .then((payload) => {
        setSosAlerts((payload?.alerts || []).map(normalizeSosAlert));
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setSosError(error?.message || "Historique SOS indisponible.");
      });

    try {
      stream = guildOpsApi.openAttackAlertStream(guildId);
      stream.addEventListener("guildops.ready", () => setSosRealtimeStatus("En direct"));
      stream.addEventListener("attack-alert.created", (event) => {
        const payload = parseRealtimeEvent(event);
        if (payload?.alert) {
          setSosAlerts((current) => upsertSosAlert(current, normalizeSosAlert(payload.alert)));
        }
      });
      stream.addEventListener("attack-alert.broadcast", (event) => {
        const payload = parseRealtimeEvent(event);
        if (payload?.alert) {
          setSosAlerts((current) => upsertSosAlert(current, normalizeSosAlert(payload.alert)));
        }
      });
      stream.addEventListener("attack-alert.acknowledged", (event) => {
        const payload = parseRealtimeEvent(event);
        if (payload?.alertId) {
          setSosAlerts((current) => mergeSosAcknowledgement(current, payload));
        }
      });
      stream.addEventListener("attack-alert.resolved", (event) => {
        const payload = parseRealtimeEvent(event);
        if (payload?.alert) {
          setSosAlerts((current) => upsertSosAlert(current, normalizeSosAlert(payload.alert)));
        }
      });
      stream.onerror = () => setSosRealtimeStatus("Reconnexion");
    } catch (error) {
      setSosRealtimeStatus("Hors ligne");
      setSosError(error?.message || "Les alertes en direct sont temporairement indisponibles.");
    }

    return () => {
      controller.abort();
      stream?.close();
    };
  }, [apiEnabled, moduleAuthorized, moduleEnabled, selectedGuild, sosActive]);

  async function sendSos() {
    if (!moduleEnabled) return;
    if (!moduleAuthorized || !can(currentUser, "send_sos")) {
      setSosError("Module SOS réservé aux membres autorisés.");
      return;
    }

    const attackType = String(sosForm.type || "Rallye").trim() || "Rallye";
    const callKind = normalizeSosCallKind(sosForm.callKind);
    const targetLabel = String(sosForm.target || "Cible non precisee").trim();
    const fallbackMessage =
      callKind === "attack"
        ? `${attackType} lancé sur ${targetLabel}. Rejoignez l'attaque maintenant.`
        : `${attackType} en cours sur ${targetLabel}. Besoin de renforts immédiats.`;
    const message = String(sosForm.details || "").trim() || fallbackMessage;

    const guildId = getApiGuildId(selectedGuild);

    setSosError("");

    if (!apiEnabled || !guildId) {
      setSosError("API requise pour envoyer un SOS.");
      return;
    }

    try {
      const payload = await guildOpsApi.createAttackAlert(guildId, {
        targetLabel,
        targetX: parseCoordinate(sosForm.x),
        targetY: parseCoordinate(sosForm.y),
        attackType,
        callKind,
        message,
        severity: "critical",
      });
      const savedAlert = normalizeSosAlert(payload?.alert);
      if (savedAlert) {
        setSosAlerts((current) => upsertSosAlert(current, savedAlert));
      }
    } catch (error) {
      setSosError(error?.message || "SOS non envoyé.");
    }
  }

  async function acknowledgeSos(alertId, response) {
    if (!moduleEnabled) return;
    if (!moduleAuthorized || !can(currentUser, "send_sos")) {
      setSosError("Module SOS réservé aux membres autorisés.");
      return;
    }

    const guildId = getApiGuildId(selectedGuild);
    const acknowledgement = {
      memberId: currentMemberId,
      memberName: currentUser.displayName,
      response,
      responseLabel: getSosAckLabel(response),
      acknowledgedAt: new Date().toISOString(),
    };

    if (!apiEnabled || !guildId || !isUuid(alertId)) {
      setSosError("API requise pour répondre à un SOS.");
      return;
    }

    const previousAlerts = sosAlerts;

    setSosAlerts((current) =>
      mergeSosAcknowledgement(current, {
        alertId,
        acknowledgement,
      }),
    );

    try {
      const payload = await guildOpsApi.acknowledgeAttackAlert(guildId, alertId, { response });
      if (payload?.alert) {
        setSosAlerts((current) => upsertSosAlert(current, normalizeSosAlert(payload.alert)));
      }
    } catch (error) {
      setSosAlerts(previousAlerts);
      setSosError(error?.message || "Réponse SOS non envoyée.");
    }
  }

  return {
    acknowledgeSos,
    sendSos,
    setSosForm,
    sosAlerts,
    sosError,
    sosForm,
    sosRealtimeStatus,
  };
}

function getSosInactiveStatus({ apiEnabled, moduleAuthorized, moduleEnabled }) {
  if (!moduleEnabled) return "Désactivé";
  if (!moduleAuthorized) return "Non autorisé";
  return apiEnabled ? "Connexion..." : "API requise";
}
