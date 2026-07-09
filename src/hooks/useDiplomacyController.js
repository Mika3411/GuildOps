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
  normalizeDiplomacyAuditEntry,
  normalizeDiplomacyCoordinate,
  normalizeDiplomacyRelation,
  normalizeNapAgreement,
  toApiDiplomacyCoordinate,
  toApiDiplomacyRelation,
  toApiNapAgreement
} from "../lib/guildOpsTransforms.js";

export function useDiplomacyController({ apiEnabled, currentUser, selectedGuild, guildOpsData, moduleEnabled = true }) {
  const [diplomacyRelations, setDiplomacyRelations] = useState(() => (moduleEnabled ? guildOpsData.diplomacyRows : []));
  const [diplomacyNapAgreements, setDiplomacyNapAgreements] = useState(() => (moduleEnabled ? guildOpsData.napAgreements : []));
  const [diplomacyCoordinates, setDiplomacyCoordinates] = useState(() => (moduleEnabled ? guildOpsData.coordinates : []));
  const [diplomacyAudit, setDiplomacyAudit] = useState(() => (moduleEnabled ? guildOpsData.diplomacyAuditLog : []));
  const [diplomacyError, setDiplomacyError] = useState("");

  useEffect(() => {
    setDiplomacyRelations(moduleEnabled ? guildOpsData.diplomacyRows : []);
    setDiplomacyNapAgreements(moduleEnabled ? guildOpsData.napAgreements : []);
    setDiplomacyCoordinates(moduleEnabled ? guildOpsData.coordinates : []);
    setDiplomacyAudit(moduleEnabled ? guildOpsData.diplomacyAuditLog : []);
  }, [guildOpsData, moduleEnabled]);

  useEffect(() => {
    const guildId = getApiGuildId(selectedGuild);

    if (!moduleEnabled || !apiEnabled || !guildId) {
      setDiplomacyError("");
      return undefined;
    }

    const controller = new AbortController();
    setDiplomacyError("");

    guildOpsApi
      .getDiplomacySnapshot(guildId, { signal: controller.signal })
      .then((payload) => applyDiplomacySnapshot(payload))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setDiplomacyError(error?.message || "Diplomatie indisponible.");
      });

    return () => controller.abort();
  }, [apiEnabled, moduleEnabled, selectedGuild]);

  function applyDiplomacySnapshot(payload = {}) {
    setDiplomacyRelations((payload.relations || []).map(normalizeDiplomacyRelation));
    setDiplomacyNapAgreements((payload.napAgreements || []).map(normalizeNapAgreement));
    setDiplomacyCoordinates((payload.coordinates || []).map(normalizeDiplomacyCoordinate));
    setDiplomacyAudit((payload.auditLog || payload.audit || []).map(normalizeDiplomacyAuditEntry));
  }

  async function saveDiplomacyRelation(relation) {
    if (!moduleEnabled) return;
    if (!can(currentUser, "manage_diplomacy")) return;
    const guildId = getApiGuildId(selectedGuild);

    if (!apiEnabled || !guildId) {
      setDiplomacyError("API requise pour enregistrer une relation.");
      return;
    }

    const normalized = normalizeDiplomacyRelation({
      ...relation,
      id: relation.id || `local-dip-${Date.now()}`,
      updatedByName: currentUser.displayName,
      updatedAt: new Date().toISOString(),
      createdByName: relation.createdByName || currentUser.displayName,
      createdAt: relation.createdAt || new Date().toISOString(),
    });

    setDiplomacyError("");

    try {
      const payload = await guildOpsApi.saveDiplomacyRelation(guildId, toApiDiplomacyRelation(normalized));
      applyDiplomacySnapshot(payload);
    } catch (error) {
      setDiplomacyError(error?.message || "Relation non enregistrée.");
    }
  }

  async function saveNapAgreement(agreement) {
    if (!moduleEnabled) return;
    if (!can(currentUser, "manage_diplomacy")) return;
    const guildId = getApiGuildId(selectedGuild);

    if (!apiEnabled || !guildId) {
      setDiplomacyError("API requise pour enregistrer un accord NAP.");
      return;
    }

    const normalized = normalizeNapAgreement({
      ...agreement,
      id: agreement.id || `local-nap-${Date.now()}`,
      createdByName: agreement.createdByName || currentUser.displayName,
      createdAt: agreement.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    setDiplomacyError("");

    try {
      const payload = await guildOpsApi.saveNapAgreement(guildId, toApiNapAgreement(normalized));
      applyDiplomacySnapshot(payload);
    } catch (error) {
      setDiplomacyError(error?.message || "Accord NAP non enregistré.");
    }
  }

  async function saveDiplomacyCoordinate(coordinate) {
    if (!moduleEnabled) return;
    if (!can(currentUser, "manage_diplomacy")) return;
    const guildId = getApiGuildId(selectedGuild);

    if (!apiEnabled || !guildId) {
      setDiplomacyError("API requise pour enregistrer une coordonnée.");
      return;
    }

    const normalized = normalizeDiplomacyCoordinate({
      ...coordinate,
      id: coordinate.id || `local-coord-${Date.now()}`,
      createdByName: coordinate.createdByName || currentUser.displayName,
      createdAt: coordinate.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    setDiplomacyError("");

    try {
      const payload = await guildOpsApi.saveCoordinate(guildId, toApiDiplomacyCoordinate(normalized));
      applyDiplomacySnapshot(payload);
    } catch (error) {
      setDiplomacyError(error?.message || "Coordonnée non enregistrée.");
    }
  }

  return {
    diplomacyAudit,
    diplomacyCoordinates,
    diplomacyError,
    diplomacyNapAgreements,
    diplomacyRelations,
    saveDiplomacyCoordinate,
    saveDiplomacyRelation,
    saveNapAgreement,
  };
}
