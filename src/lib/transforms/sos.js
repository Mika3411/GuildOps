export function normalizeSosAlert(alert = {}) {
  const attackType = alert.attackType || alert.type || "Rallye";
  const targetLabel = alert.targetLabel || alert.target || (alert.title || "").replace(`${attackType}:`, "").trim() || "Cible inconnue";
  const acknowledgements = Array.isArray(alert.acknowledgements)
    ? alert.acknowledgements.map(normalizeSosAcknowledgement).filter(Boolean)
    : [];
  const myAcknowledgement = normalizeSosAcknowledgement(alert.myAcknowledgement);

  return {
    id: alert.id || `local-sos-${Date.now()}`,
    guildId: alert.guildId || alert.guild_id || "",
    target: targetLabel,
    targetLabel,
    targetX: alert.targetX ?? alert.target_x ?? null,
    targetY: alert.targetY ?? alert.target_y ?? null,
    type: attackType,
    attackType,
    details: alert.details || alert.message || "",
    message: alert.message || alert.details || "",
    by: alert.by || alert.createdByName || "Membre",
    createdByName: alert.createdByName || alert.by || "Membre",
    createdAt: alert.createdAt || alert.created_at || new Date().toISOString(),
    status: alert.status || "active",
    acknowledgements,
    acknowledgementSummary: normalizeSosSummary(alert.acknowledgementSummary || buildSosSummary(acknowledgements)),
    myAcknowledgement,
  };
}

export function upsertSosAlert(alerts = [], alert) {
  if (!alert?.id) return alerts;
  return [alert, ...alerts.filter((item) => item.id !== alert.id)].sort(
    (first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
  );
}

export function mergeSosAcknowledgement(alerts = [], payload = {}) {
  const acknowledgement = normalizeSosAcknowledgement(payload.acknowledgement);
  if (!payload.alertId || !acknowledgement) return alerts;

  return alerts.map((alert) => {
    if (alert.id !== payload.alertId) return alert;

    const acknowledgements = [
      acknowledgement,
      ...(alert.acknowledgements || []).filter((item) => item.memberId !== acknowledgement.memberId),
    ];

    return normalizeSosAlert({
      ...alert,
      acknowledgements,
      acknowledgementSummary: payload.acknowledgementSummary || buildSosSummary(acknowledgements),
      myAcknowledgement: acknowledgement,
    });
  });
}

export function normalizeSosAcknowledgement(value) {
  if (!value) return null;
  const response = normalizeSosResponse(value.response);
  if (!response) return null;

  return {
    memberId: String(value.memberId || value.member_id || ""),
    memberName: String(value.memberName || value.member_name || "Membre"),
    response,
    responseLabel: value.responseLabel || getSosAckLabel(response),
    note: value.note ?? null,
    acknowledgedAt: value.acknowledgedAt || value.acknowledged_at || new Date().toISOString(),
  };
}

export function normalizeSosSummary(summary = {}) {
  return {
    seen: Number(summary.seen || 0),
    joining: Number(summary.joining || 0),
    cannotJoin: Number(summary.cannotJoin || summary.cannot_join || 0),
    resolved: Number(summary.resolved || 0),
    total: Number(summary.total || 0),
  };
}

export function buildSosSummary(acknowledgements = []) {
  return acknowledgements.reduce(
    (summary, acknowledgement) => {
      if (acknowledgement.response === "seen") summary.seen += 1;
      if (acknowledgement.response === "joining") summary.joining += 1;
      if (acknowledgement.response === "cannot_join") summary.cannotJoin += 1;
      if (acknowledgement.response === "resolved") summary.resolved += 1;
      summary.total += 1;
      return summary;
    },
    { seen: 0, joining: 0, cannotJoin: 0, resolved: 0, total: 0 },
  );
}

export function normalizeSosResponse(response) {
  const normalized = String(response || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (["seen", "vu"].includes(normalized)) return "seen";
  if (["joining", "en_route", "route", "jarrive"].includes(normalized)) return "joining";
  if (["cannot_join", "cannotjoin", "impossible", "absent"].includes(normalized)) return "cannot_join";
  if (["resolved", "resolu"].includes(normalized)) return "resolved";
  return "";
}

export function getSosAckLabel(response) {
  return (
    {
      seen: "Vu",
      joining: "En route",
      cannot_join: "Impossible",
      resolved: "Resolu",
    }[response] || response
  );
}

export function formatSosTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Maintenant";

  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
