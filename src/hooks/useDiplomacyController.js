import {
  useEffect,
  useState
} from "react";
import {
  coordinates,
  diplomacyAuditLog,
  diplomacyRows,
  napAgreements
} from "../data/guildOpsMockData.js";
import {
  guildOpsApi
} from "../lib/guildOpsApi.js";
import {
  can
} from "../lib/rbac.js";
import {
  createLocalDiplomacyAudit,
  getApiGuildId,
  normalizeDiplomacyAuditEntry,
  normalizeDiplomacyCoordinate,
  normalizeDiplomacyRelation,
  normalizeNapAgreement,
  toApiDiplomacyCoordinate,
  toApiDiplomacyRelation,
  toApiNapAgreement,
  upsertById
} from "../lib/guildOpsTransforms.js";

export function useDiplomacyController({ apiEnabled, currentUser, selectedGuild, guildOpsData, moduleEnabled = true }) {
  const [diplomacyRelations, setDiplomacyRelations] = useState(() => (moduleEnabled ? guildOpsData.diplomacyRows || diplomacyRows : []));
  const [diplomacyNapAgreements, setDiplomacyNapAgreements] = useState(() => (moduleEnabled ? guildOpsData.napAgreements || napAgreements : []));
  const [diplomacyCoordinates, setDiplomacyCoordinates] = useState(() => (moduleEnabled ? guildOpsData.coordinates || coordinates : []));
  const [diplomacyAudit, setDiplomacyAudit] = useState(() => (moduleEnabled ? guildOpsData.diplomacyAuditLog || diplomacyAuditLog : []));
  const [diplomacyError, setDiplomacyError] = useState("");

  useEffect(() => {
    setDiplomacyRelations(moduleEnabled ? guildOpsData.diplomacyRows || diplomacyRows : []);
    setDiplomacyNapAgreements(moduleEnabled ? guildOpsData.napAgreements || napAgreements : []);
    setDiplomacyCoordinates(moduleEnabled ? guildOpsData.coordinates || coordinates : []);
    setDiplomacyAudit(moduleEnabled ? guildOpsData.diplomacyAuditLog || diplomacyAuditLog : []);
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

    const normalized = normalizeDiplomacyRelation({
      ...relation,
      id: relation.id || `local-dip-${Date.now()}`,
      updatedByName: currentUser.displayName,
      updatedAt: new Date().toISOString(),
      createdByName: relation.createdByName || currentUser.displayName,
      createdAt: relation.createdAt || new Date().toISOString(),
    });

    setDiplomacyError("");
    setDiplomacyRelations((current) => upsertById(current, normalized));
    setDiplomacyAudit((current) => [
      createLocalDiplomacyAudit("diplomacy.relation.updated", "diplomacy_entries", normalized.id, normalized, currentUser),
      ...current,
    ]);

    const guildId = getApiGuildId(selectedGuild);
    if (!apiEnabled || !guildId) return;

    try {
      const payload = await guildOpsApi.saveDiplomacyRelation(guildId, toApiDiplomacyRelation(normalized));
      applyDiplomacySnapshot(payload);
    } catch (error) {
      setDiplomacyError(error?.message || "Relation enregistree ici, mais pas encore partagee.");
    }
  }

  async function saveNapAgreement(agreement) {
    if (!moduleEnabled) return;
    if (!can(currentUser, "manage_diplomacy")) return;

    const normalized = normalizeNapAgreement({
      ...agreement,
      id: agreement.id || `local-nap-${Date.now()}`,
      createdByName: agreement.createdByName || currentUser.displayName,
      createdAt: agreement.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    setDiplomacyError("");
    setDiplomacyNapAgreements((current) => upsertById(current, normalized));
    setDiplomacyAudit((current) => [
      createLocalDiplomacyAudit("diplomacy.nap.updated", "nap_agreements", normalized.id, normalized, currentUser),
      ...current,
    ]);

    const guildId = getApiGuildId(selectedGuild);
    if (!apiEnabled || !guildId) return;

    try {
      const payload = await guildOpsApi.saveNapAgreement(guildId, toApiNapAgreement(normalized));
      applyDiplomacySnapshot(payload);
    } catch (error) {
      setDiplomacyError(error?.message || "Accord NAP enregistre ici, mais pas encore partage.");
    }
  }

  async function saveDiplomacyCoordinate(coordinate) {
    if (!moduleEnabled) return;
    if (!can(currentUser, "manage_diplomacy")) return;

    const normalized = normalizeDiplomacyCoordinate({
      ...coordinate,
      id: coordinate.id || `local-coord-${Date.now()}`,
      createdByName: coordinate.createdByName || currentUser.displayName,
      createdAt: coordinate.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    setDiplomacyError("");
    setDiplomacyCoordinates((current) => upsertById(current, normalized));
    setDiplomacyAudit((current) => [
      createLocalDiplomacyAudit("diplomacy.coordinate.updated", "coordinates", normalized.id, normalized, currentUser),
      ...current,
    ]);

    const guildId = getApiGuildId(selectedGuild);
    if (!apiEnabled || !guildId) return;

    try {
      const payload = await guildOpsApi.saveCoordinate(guildId, toApiDiplomacyCoordinate(normalized));
      applyDiplomacySnapshot(payload);
    } catch (error) {
      setDiplomacyError(error?.message || "Coordonnee enregistree ici, mais pas encore partagee.");
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
