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

export function useSosController({ apiEnabled, currentUser, selectedGuild, guildOpsData, currentMemberId, moduleEnabled = true }) {
  const [sosAlerts, setSosAlerts] = useState(() => (moduleEnabled ? guildOpsData.sosAlerts : []));
  const [sosForm, setSosForm] = useState(() => guildOpsData.sosForm);
  const [sosRealtimeStatus, setSosRealtimeStatus] = useState(apiEnabled ? "Connexion..." : "Mode aperçu");
  const [sosError, setSosError] = useState("");

  useEffect(() => {
    setSosAlerts(moduleEnabled ? guildOpsData.sosAlerts : []);
    setSosForm(guildOpsData.sosForm);
  }, [guildOpsData, moduleEnabled]);

  useEffect(() => {
    const guildId = getApiGuildId(selectedGuild);

    if (!moduleEnabled || !apiEnabled || !guildId) {
      setSosRealtimeStatus(moduleEnabled ? "Mode aperçu" : "Désactivé");
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
  }, [apiEnabled, moduleEnabled, selectedGuild]);

  async function sendSos() {
    if (!moduleEnabled) return;
    if (!can(currentUser, "send_sos")) return;

    const attackType = String(sosForm.type || "Rallye").trim() || "Rallye";
    const callKind = normalizeSosCallKind(sosForm.callKind);
    const targetLabel = String(sosForm.target || "Cible non precisee").trim();
    const fallbackMessage =
      callKind === "attack"
        ? `${attackType} lancé sur ${targetLabel}. Rejoignez l'attaque maintenant.`
        : `${attackType} en cours sur ${targetLabel}. Besoin de renforts immédiats.`;
    const message = String(sosForm.details || "").trim() || fallbackMessage;

    const guildId = getApiGuildId(selectedGuild);
    const draftAlert = normalizeSosAlert({
      id: `local-sos-${Date.now()}`,
      targetLabel,
      targetX: parseCoordinate(sosForm.x),
      targetY: parseCoordinate(sosForm.y),
      attackType,
      callKind,
      message,
      details: message,
      createdByName: currentUser.displayName,
      by: currentUser.displayName,
      status: "active",
      createdAt: new Date().toISOString(),
    });

    setSosError("");
    setSosAlerts((current) => upsertSosAlert(current, draftAlert));

    if (!apiEnabled || !guildId) return;

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
      setSosAlerts((current) => [savedAlert, ...current.filter((alert) => alert.id !== draftAlert.id && alert.id !== savedAlert.id)]);
    } catch (error) {
      setSosError(error?.message || "SOS cree ici, mais pas encore envoye a la guilde.");
    }
  }

  async function acknowledgeSos(alertId, response) {
    if (!moduleEnabled) return;
    const guildId = getApiGuildId(selectedGuild);
    const acknowledgement = {
      memberId: currentMemberId,
      memberName: currentUser.displayName,
      response,
      responseLabel: getSosAckLabel(response),
      acknowledgedAt: new Date().toISOString(),
    };

    setSosAlerts((current) =>
      mergeSosAcknowledgement(current, {
        alertId,
        acknowledgement,
      }),
    );

    if (!apiEnabled || !guildId || !isUuid(alertId)) return;

    try {
      const payload = await guildOpsApi.acknowledgeAttackAlert(guildId, alertId, { response });
      if (payload?.alert) {
        setSosAlerts((current) => upsertSosAlert(current, normalizeSosAlert(payload.alert)));
      }
    } catch (error) {
      setSosError(error?.message || "Reponse SOS enregistree ici, mais pas encore envoyee.");
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
